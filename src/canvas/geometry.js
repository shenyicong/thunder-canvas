/* ==========================================================
 * geometry.js —— 连线几何计算（Canvas 绘制与命中检测共用）
 * ========================================================== */

/** 输出端口：节点右侧中点（世界坐标） */
export function outPort(n) {
  return { x: n.x + n.w, y: n.y + n.h / 2 };
}

/** 输入端口：节点左侧中点（世界坐标） */
export function inPort(n) {
  return { x: n.x, y: n.y + n.h / 2 };
}

/** 世界坐标 → 屏幕坐标 */
export function toScreen(p, vp) {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y };
}

/** 屏幕坐标 → 世界坐标 */
export function toWorld(p, vp) {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale };
}

/** 生成水平控制点的三次贝塞尔曲线控制点 */
export function bezierPoints(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return [
    { x: a.x + dx, y: a.y },
    { x: b.x - dx, y: b.y }
  ];
}

/** 计算三次贝塞尔在参数 t 处的坐标 */
export function bezierAt(a, c1, c2, b, t) {
  const mt = 1 - t;
  const x = mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x;
  const y = mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y;
  return { x, y };
}

/**
 * 命中检测：判断屏幕点 pt 是否落在某条边上
 * 做法：把曲线采样成折线，逐段算点到线段距离
 */
export function hitTestEdge(pt, nodes, edges, vp, tolerance = 8) {
  const nodeMap = {};
  nodes.forEach((n) => { nodeMap[n.id] = n; });

  let best = null;
  let bestDist = Infinity;

  for (const e of edges) {
    const src = nodeMap[e.source];
    const dst = nodeMap[e.target];
    if (!src || !dst) continue;

    const a = toScreen(outPort(src), vp);
    const b = toScreen(inPort(dst), vp);
    const [c1, c2] = bezierPoints(a, b);

    // 采样 24 段
    const SEG = 24;
    let prev = a;
    for (let i = 1; i <= SEG; i++) {
      const cur = bezierAt(a, c1, c2, b, i / SEG);
      const d = distToSegment(pt, prev, cur);
      if (d < bestDist) { bestDist = d; best = e; }
      prev = cur;
    }
  }

  return bestDist <= tolerance ? best : null;
}

/** 点到线段距离 */
export function distToSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * vx;
  const py = a.y + t * vy;
  return Math.hypot(p.x - px, p.y - py);
}
