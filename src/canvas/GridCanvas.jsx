/* ==========================================================
 * GridCanvas.jsx —— Canvas2D 绘制的无限网格背景
 * ----------------------------------------------------------
 * 为什么用 Canvas 而不是 CSS background：
 *   缩放时点阵密度、线宽都需要随 scale 平滑变化，
 *   Canvas 可以做到「缩放自适应层级」（类似 Figma），
 *   且大量点阵时性能远好于 DOM/CSS 重排。
 * ========================================================== */
import { useEffect, useRef } from 'react';

export default function GridCanvas({ viewport, size }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = size.width;
    const h = size.height;
    if (w <= 0 || h <= 0) return;

    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';

    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { x, y, scale } = viewport;

    // 基础格距 24px，随缩放切换层级，保证视觉密度稳定
    let step = 24;
    while (step * scale < 12) step *= 2;
    while (step * scale > 96) step /= 2;
    const s = step * scale;

    if (s < 4) return; // 太密就不画，避免糊成一片

    const ox = ((x % s) + s) % s;
    const oy = ((y % s) + s) % s;

    // 大格（每 5 格一条主线）
    const bigStep = s * 5;

    ctx.save();

    // 小点
    ctx.fillStyle = 'rgba(120,140,170,0.22)';
    const r = scale > 1.2 ? 1.4 : 1;
    for (let px = ox; px < w + s; px += s) {
      for (let py = oy; py < h + s; py += s) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 主线（大格网格线）
    if (bigStep > 20) {
      ctx.strokeStyle = 'rgba(120,140,170,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const bx = ((x % bigStep) + bigStep) % bigStep;
      const by = ((y % bigStep) + bigStep) % bigStep;
      for (let px = bx; px < w + bigStep; px += bigStep) {
        ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h);
      }
      for (let py = by; py < h + bigStep; py += bigStep) {
        ctx.moveTo(0, py + 0.5); ctx.lineTo(w, py + 0.5);
      }
      ctx.stroke();
    }

    // 原点十字，帮助定位
    const sx = x;
    const sy = y;
    if (sx > -50 && sx < w + 50 && sy > -50 && sy < h + 50) {
      ctx.strokeStyle = 'rgba(76,141,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy);
      ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8);
      ctx.stroke();
    }

    ctx.restore();
  }, [viewport, size.width, size.height]);

  return <canvas ref={ref} className="grid-canvas" />;
}
