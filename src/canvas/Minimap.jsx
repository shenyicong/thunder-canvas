/* ==========================================================
 * Minimap.jsx —— Canvas2D 小地图
 * ----------------------------------------------------------
 * 功能：概览整张画布、显示当前视口位置、点击/拖拽快速跳转
 * ========================================================== */
import { useEffect, useRef, useCallback } from 'react';

const NODE_COLOR = {
  note: '#7d8590',
  prompt: '#d29922',
  image: '#3fb950',
  chat: '#4c8dff',
  imagegen: '#bc4cff',
  videogen: '#ff7b4c',
  agent: '#7c5cff'
};

const PAD = 80;

export default function Minimap({ nodes, viewport, size, onJump, visible }) {
  const ref = useRef(null);
  const boxRef = useRef(null); // { minX,minY,maxX,maxY, scale }
  const draggingRef = useRef(false);

  /** 计算世界包围盒及小地图缩放比例 */
  const computeBox = useCallback(() => {
    if (!nodes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    // 把当前视口也纳入，保证视口框始终可见
    const vw = size.width / viewport.scale;
    const vh = size.height / viewport.scale;
    const vx = -viewport.x / viewport.scale;
    const vy = -viewport.y / viewport.scale;
    minX = Math.min(minX, vx); minY = Math.min(minY, vy);
    maxX = Math.max(maxX, vx + vw); maxY = Math.max(maxY, vy + vh);

    minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
    const w = maxX - minX;
    const h = maxY - minY;
    const scale = Math.min(size.width / w, size.height / h);
    return { minX, minY, w, h, scale, offX: (size.width - w * scale) / 2, offY: (size.height - h * scale) / 2 };
  }, [nodes, viewport, size.width, size.height]);

  useEffect(() => {
    if (!visible) return;
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.width * dpr;
    cv.height = size.height * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const box = computeBox();
    boxRef.current = box;
    if (!box) return;

    const t = (x, y) => ({
      x: (x - box.minX) * box.scale + box.offX,
      y: (y - box.minY) * box.scale + box.offY
    });

    // 节点
    nodes.forEach((n) => {
      const p = t(n.x, n.y);
      const w = Math.max(2, n.w * box.scale);
      const h = Math.max(2, n.h * box.scale);
      ctx.fillStyle = NODE_COLOR[n.type] || '#7d8590';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(p.x, p.y, w, h);
    });
    ctx.globalAlpha = 1;

    // 视口框
    const vw = (size.width / viewport.scale) * box.scale;
    const vh = (size.height / viewport.scale) * box.scale;
    const vp0 = t(-viewport.x / viewport.scale, -viewport.y / viewport.scale);
    ctx.strokeStyle = '#4c8dff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vp0.x, vp0.y, vw, vh);
    ctx.fillStyle = 'rgba(76,141,255,0.12)';
    ctx.fillRect(vp0.x, vp0.y, vw, vh);
  }, [nodes, viewport, size.width, size.height, visible, computeBox]);

  /** 点击/拖拽跳转：把小地图坐标换算成世界坐标，居中到视口 */
  const jump = (ev) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const wx = (mx - box.offX) / box.scale + box.minX;
    const wy = (my - box.offY) / box.scale + box.minY;
    onJump(wx, wy);
  };

  return (
    <div className={'minimap' + (visible ? '' : ' hidden')}>
      <canvas
        ref={ref}
        style={{ width: size.width, height: size.height, display: 'block', cursor: 'pointer' }}
        onMouseDown={(e) => { draggingRef.current = true; jump(e); }}
        onMouseMove={(e) => { if (draggingRef.current) jump(e); }}
        onMouseUp={() => { draggingRef.current = false; }}
        onMouseLeave={() => { draggingRef.current = false; }}
      />
    </div>
  );
}
