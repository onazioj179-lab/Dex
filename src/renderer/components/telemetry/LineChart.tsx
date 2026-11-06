// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * The one line chart used by Task Manager's Performance and Diagnostics views:
 * hairline grid, the accent line, a faint fill. No gradients, glow or
 * smoothing -- the shape is the data. Samples are right-aligned so a new chart
 * fills in from the right like a system monitor.
 */
import React, { useEffect } from 'react';
import { useElementSize } from '../../utils/motionHooksExtended';

/**
 * A colour the canvas can use, with alpha. Accepts hex, rgb()/rgba() or a CSS
 * variable such as var(--color-accent), resolved against `el` so the charts
 * follow the theme. (Appending hex alpha to "var(...)" made an invalid colour,
 * and addColorStop threw.)
 */
export function canvasColor(color: string, alpha: number, el?: Element | null): string {
  let c = color.trim();
  const m = /^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/.exec(c);
  if (m) {
    const resolved = typeof getComputedStyle === 'function'
      ? getComputedStyle(el ?? document.documentElement).getPropertyValue(m[1]).trim()
      : '';
    c = resolved || (m[2] ?? 'var(--color-accent)').trim();
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return c; // named colour: no alpha, but still valid
}

export interface LineChartProps {
  series: number[];
  /** Second, dashed series (e.g. network send). */
  series2?: number[];
  max: number;
  height: number;
  ariaLabel: string;
  /** Draw the y-axis grid labels (top + middle). */
  axisLabel?: (v: number) => string;
  /** Samples across the full width (default 60). */
  capacity?: number;
}

export const LineChart: React.FC<LineChartProps> = ({ series, series2, max, height, ariaLabel, axisLabel, capacity = 60 }) => {
  const { ref, width, height: cssH } = useElementSize<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width || !cssH) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width), h = Math.floor(cssH);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const accent = canvasColor('var(--color-accent, #0A84FF)', 1, canvas);
    const fillTone = canvasColor('var(--color-accent, #0A84FF)', 0.12, canvas);
    const grid = canvasColor('var(--color-text-primary, #ffffff)', 0.08, canvas);
    const label = canvasColor('var(--color-text-tertiary, #8e8e93)', 1, canvas);

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Math.round((h - 1) * (i / 4)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const x = Math.round(w * (i / 6)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    const cap = Math.max(2, capacity);
    const safeMax = max > 0 ? max : 1;
    const stepX = w / (cap - 1);
    const draw = (data: number[], dashed: boolean, fill: boolean) => {
      const s = data.slice(-cap);
      if (s.length < 2) return;
      const x0 = (cap - s.length) * stepX;
      const pt = (v: number, i: number): [number, number] => [x0 + i * stepX, (h - 1) - (Math.max(0, Math.min(safeMax, v)) / safeMax) * (h - 2)];
      ctx.beginPath();
      s.forEach((v, i) => { const [x, y] = pt(v, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      if (fill) {
        ctx.save();
        ctx.lineTo(x0 + (s.length - 1) * stepX, h);
        ctx.lineTo(x0, h);
        ctx.closePath();
        ctx.fillStyle = fillTone;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        s.forEach((v, i) => { const [x, y] = pt(v, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      }
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    };
    draw(series, false, true);
    if (series2) draw(series2, true, false);

    if (axisLabel) {
      ctx.fillStyle = label;
      ctx.font = '10px var(--dex-font-ui, system-ui), system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(axisLabel(safeMax), w - 4, 3);
      ctx.textBaseline = 'middle';
      ctx.fillText(axisLabel(safeMax / 2), w - 4, h / 2);
    }
  }, [series, series2, max, width, cssH, axisLabel, ref, capacity]);
  return <canvas ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
};

export default LineChart;
