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
import React, { useEffect, useState } from 'react';
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
  /** Format a value for the hover readout. With it, hovering shows a crosshair and the exact value. */
  formatValue?: (v: number) => string;
  /** Seconds between samples, for the "12 s ago" readout (default 1). */
  sampleSeconds?: number;
}

/** min / average / peak of the visible samples (pure, for the summary row). */
export function seriesStats(series: number[], capacity = 60): { now: number; avg: number; peak: number; min: number } | null {
  const s = series.slice(-capacity).filter((v) => Number.isFinite(v));
  if (!s.length) return null;
  const sum = s.reduce((a, b) => a + b, 0);
  return { now: s[s.length - 1], avg: sum / s.length, peak: Math.max(...s), min: Math.min(...s) };
}

export const LineChart: React.FC<LineChartProps> = ({ series, series2, max, height, ariaLabel, axisLabel, capacity = 60, formatValue, sampleSeconds = 1 }) => {
  const { ref, width, height: cssH } = useElementSize<HTMLCanvasElement>();
  // Hovered sample index (from the right edge: 0 = newest), or null.
  const [hover, setHover] = useState<number | null>(null);
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
    const crosshair = canvasColor('var(--color-text-primary, #ffffff)', 0.35, canvas);

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

    // The newest sample gets a dot; a hovered sample gets a crosshair and a dot.
    const s1 = series.slice(-cap);
    const dot = (idxFromEnd: number, r: number) => {
      const i = s1.length - 1 - idxFromEnd;
      if (i < 0 || i >= s1.length) return null;
      const x = (cap - s1.length) * stepX + i * stepX;
      const y = (h - 1) - (Math.max(0, Math.min(safeMax, s1[i])) / safeMax) * (h - 2);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
      return x;
    };
    if (s1.length && h > 60) dot(0, 2.5);
    if (hover != null && formatValue) {
      const x = dot(hover, 3);
      if (x != null) {
        ctx.strokeStyle = crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke();
      }
    }

    if (axisLabel) {
      ctx.fillStyle = label;
      ctx.font = '10px var(--dex-font-ui, system-ui), system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(axisLabel(safeMax), w - 4, 3);
      ctx.textBaseline = 'middle';
      ctx.fillText(axisLabel(safeMax / 2), w - 4, h / 2);
    }
  }, [series, series2, max, width, cssH, axisLabel, ref, capacity, hover, formatValue]);

  const canvasEl = <canvas ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
  if (!formatValue) return canvasEl;
  const s = series.slice(-Math.max(2, capacity));
  const hv = hover != null ? s[s.length - 1 - hover] : undefined;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cap = Math.max(2, capacity);
    const idx = Math.round((e.clientX - r.left) / (r.width / (cap - 1)));
    const fromEnd = cap - 1 - idx;
    setHover(fromEnd >= 0 && fromEnd < s.length ? fromEnd : null);
  };
  return (
    <div style={{ position: 'relative' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {canvasEl}
      {hv != null && (
        // A data readout pinned in the chart corner (not a floating tooltip).
        <div aria-live="off" style={{
          position: 'absolute', left: 8, top: 6, padding: '2px 8px', borderRadius: 9999,
          background: 'var(--color-bg-elevated)', boxShadow: 'inset 0 0 0 1px var(--color-border-subtle)',
          fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
        }}>
          {formatValue(hv)}
          <span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{hover === 0 ? 'now' : `${hover! * sampleSeconds} s ago`}</span>
        </div>
      )}
    </div>
  );
};

export default LineChart;
