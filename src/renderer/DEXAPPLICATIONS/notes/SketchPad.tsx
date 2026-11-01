// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Notes: freehand sketch + handwritten signature pad.
//
// Pointer events (mouse, pen, touch). Produces a transparent PNG cropped to
// what was drawn, inserted into the note as an ordinary image block (which the
// document model already round-trips). A "signature" here is a picture of a
// handwritten signature. It is NOT a cryptographic digital signature, and the
// inserted image says so in its alt text.
//

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SketchMode = 'sketch' | 'signature';
type Point = { x: number; y: number };
export type Stroke = { color: string; width: number; points: Point[] };

const INKS = [
  // Mid-tone inks stay readable on both the dark and light note backgrounds.
  { id: 'blue', label: 'Blue ink', color: '#2F6FDE' },
  { id: 'gray', label: 'Graphite', color: '#8A8A8E' },
  { id: 'red', label: 'Red ink', color: '#D93A3A' },
];
const WIDTHS = [2, 4, 8];

/** Bounding box of every stroke point, padded; null when nothing is drawn. */
export function strokeBounds(strokes: Stroke[], pad = 8): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x - s.width); minY = Math.min(minY, p.y - s.width);
      maxX = Math.max(maxX, p.x + s.width); maxY = Math.max(maxY, p.y + s.width);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return { x, y, w: Math.ceil(maxX + pad) - x, h: Math.ceil(maxY + pad) - y };
}

/** Alt text that keeps the "not a digital signature" distinction explicit. */
export function sketchAltText(mode: SketchMode): string {
  return mode === 'signature'
    ? 'Handwritten signature (image, not a cryptographic digital signature)'
    : 'Sketch';
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.points.length === 1) {
    ctx.beginPath();
    ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  // Quadratic smoothing through midpoints keeps fast strokes from looking jagged.
  for (let i = 1; i < s.points.length - 1; i++) {
    const mid = { x: (s.points[i].x + s.points[i + 1].x) / 2, y: (s.points[i].y + s.points[i + 1].y) / 2 };
    ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mid.x, mid.y);
  }
  const last = s.points[s.points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

interface SketchPadProps {
  mode: SketchMode;
  onInsert: (dataUrl: string, alt: string) => void;
  onCancel: () => void;
}

export default function SketchPad({ mode, onInsert, onCancel }: SketchPadProps) {
  const W = 640;
  const H = mode === 'signature' ? 220 : 380;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const [ink, setInk] = useState(INKS[0].color);
  const [width, setWidth] = useState(mode === 'signature' ? 3 : 4);

  const redraw = useCallback((list: Stroke[]) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const s of list) drawStroke(ctx, s);
  }, [H]);

  useEffect(() => { redraw(strokes); }, [strokes, redraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); setStrokes((s) => s.slice(0, -1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { color: ink, width, points: [pos(e)] };
    setStrokes((s) => [...s, drawing.current!]);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current.points.push(pos(e));
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawStroke(ctx, { ...drawing.current, points: drawing.current.points.slice(-3) });
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = null;
    setStrokes((s) => [...s]); // full smoothed redraw
  };

  const insert = () => {
    const b = strokeBounds(strokes);
    const src = canvasRef.current;
    if (!b || !src) return;
    const out = document.createElement('canvas');
    out.width = b.w;
    out.height = b.h;
    out.getContext('2d')!.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    onInsert(out.toDataURL('image/png'), sketchAltText(mode));
  };

  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-control)',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 13,
  };
  const title = mode === 'signature' ? 'Add handwritten signature' : 'Add sketch';

  // Portal to <body>: rendered inside the app window it would be trapped in the
  // window's stacking context, under shell layers like the floating DEX Bar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elev-3)', padding: 16, width: 'min(680px, 94vw)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>{title}</strong>
          <div role="group" aria-label="Ink" style={{ display: 'flex', gap: 6 }}>
            {INKS.map((i) => (
              <button key={i.id} type="button" aria-label={i.label} aria-pressed={ink === i.color} onClick={() => setInk(i.color)}
                style={{ width: 22, height: 22, borderRadius: 9999, background: i.color, cursor: 'pointer',
                  border: ink === i.color ? '2px solid var(--color-accent)' : '2px solid transparent' }} />
            ))}
            {WIDTHS.map((w) => (
              <button key={w} type="button" aria-label={`Pen width ${w}`} aria-pressed={width === w} onClick={() => setWidth(w)}
                style={{ ...btn, padding: '2px 8px', borderColor: width === w ? 'var(--color-accent)' : 'var(--color-border-control)' }}>
                <span style={{ display: 'inline-block', width: 14, height: w, borderRadius: 9999, background: 'currentColor', verticalAlign: 'middle' }} />
              </button>
            ))}
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label={mode === 'signature' ? 'Signature drawing area' : 'Drawing area'}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ width: '100%', aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair',
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border-control)', background: 'var(--color-bg-inset)' }}
        />
        {mode === 'signature' && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            Inserts a picture of your handwritten signature. It is not a cryptographic digital signature.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn} onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length}>Undo</button>
            <button type="button" style={btn} onClick={() => setStrokes([])} disabled={!strokes.length}>Clear</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn} onClick={onCancel}>Cancel</button>
            <button type="button" onClick={insert} disabled={!strokes.length}
              style={{ ...btn, background: 'var(--color-accent)', color: 'var(--color-accent-text)', border: 'none', opacity: strokes.length ? 1 : 0.5 }}>
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
