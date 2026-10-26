/* ==========================================================
 * EdgeCanvas.jsx —— Canvas2D 绘制的连线层
 * ----------------------------------------------------------
 * 为什么用 Canvas 画连线：
 *   连线数量多、需要流动动画（执行中高亮数据流向），
 *   Canvas 比每条边一个 SVG path 更省 DOM，动画也更平滑。
 * 层级：网格 < 连线 < 节点（DOM）
 * ========================================================== */
import { useEffect, useRef } from 'react';
import { outPort, inPort, toScreen, bezierPoints } from './geometry.js';

export default function EdgeCanvas({
  nodes, edges, viewport, size,
  selectedEdgeIds = [], activeEdgeIds = [], tempLink = null
}) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;

    const dpr = window.devicePixelRatio || 1;
    const w = size.width;
    const h = size.height;
    if (w <= 0 || h <= 0) return undefined;

    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';

    const ctx = cv.getContext('2d');
    const nodeMap = {};
    nodes.forEach((n) => { nodeMap[n.id] = n; });

    let dashOffset = 0;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const vp = viewport;

      edges.forEach((e) => {
        const src = nodeMap[e.source];
        const dst = nodeMap[e.target];
        if (!src || !dst) return;

        const a = toScreen(outPort(src), vp);
        const b = toScreen(inPort(dst), vp);
        const [c1, c2] = bezierPoints(a, b);

        const isSel = selectedEdgeIds.includes(e.id);
        const isActive = activeEdgeIds.includes(e.id);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);

        if (isActive) {
          // 执行中：绿色流动虚线
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -dashOffset;
          ctx.strokeStyle = '#3fb950';
          ctx.lineWidth = 2.5;
        } else if (isSel) {
          ctx.strokeStyle = '#4c8dff';
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = 'rgba(120,135,160,0.65)';
          ctx.lineWidth = 1.8;
        }
        ctx.stroke();
        ctx.restore();

        // 箭头
        drawArrow(ctx, c2, b, isActive ? '#3fb950' : (isSel ? '#4c8dff' : 'rgba(120,135,160,0.8)'));
      });

      // 拖拽中的临时连线
      if (tempLink) {
        const src = nodeMap[tempLink.sourceId];
        if (src) {
          const a = toScreen(outPort(src), vp);
          const b = tempLink.point;
          const [c1, c2] = bezierPoints(a, b);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#4c8dff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }

      dashOffset += 0.6;
      // 只有存在活动边时才持续动画，避免无谓开销
      if (activeEdgeIds.length || tempLink) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes, edges, viewport, size.width, size.height,
    selectedEdgeIds.join(','), activeEdgeIds.join(','), tempLink]);

  return <canvas ref={ref} className="edge-canvas" />;
}

/** 在终点画一个实心箭头 */
function drawArrow(ctx, from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 9;
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, len * 0.42);
  ctx.lineTo(-len, -len * 0.42);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
