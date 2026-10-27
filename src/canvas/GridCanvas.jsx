/* ==========================================================
 * GridCanvas.jsx —— Canvas2D 绘制的无限网格背景
 * ----------------------------------------------------------
 * 为什么用 Canvas 而不是 CSS background：
 *   缩放时点阵密度、线宽都需要随 scale 平滑变化，
 *   Canvas 可以做到「缩放自适应层级」（类似 Figma），
 *   且大量点阵时性能远好于 DOM/CSS 重排。
 *
 * 性能要点（平移手感的关键）：
 *   1. canvas.width 只在「视口尺寸 / DPR」变化时才重设 ——
 *      重设会丢弃并重建整个位图，若每帧都做，平移必然卡顿。
 *   2. 点用 fillRect 而不是 arc + fill，避免每点一次路径构建。
 * ========================================================== */
import { useEffect, useRef } from 'react';

export default function GridCanvas({ viewport, size }) {
  const ref = useRef(null);
  const capRef = useRef({ w: 0, h: 0, dpr: 0 });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.width);
    const h = Math.round(size.height);
    if (w <= 0 || h <= 0) return;

    // 仅在真正需要时重建位图
    const cap = capRef.current;
    if (cap.w !== w || cap.h !== h || cap.dpr !== dpr) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      capRef.current = { w, h, dpr };
    }

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

    // 小点：批量 fillRect，比逐点 arc 快数倍
    const r = scale > 1.2 ? 3 : 2;
    ctx.fillStyle = 'rgba(120,140,170,0.22)';
    for (let px = ox; px < w + s; px += s) {
      const rx = Math.round(px - r / 2);
      for (let py = oy; py < h + s; py += s) {
        ctx.fillRect(rx, Math.round(py - r / 2), r, r);
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
    if (x > -50 && x < w + 50 && y > -50 && y < h + 50) {
      ctx.strokeStyle = 'rgba(76,141,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
      ctx.stroke();
    }
  }, [viewport, size.width, size.height]);

  return <canvas ref={ref} className="grid-canvas" />;
}
