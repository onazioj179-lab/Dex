/**
 * DEX Platform - FLUX Easing Curve Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Cubic bezier (CSS-style) easing curve editor with draggable handles
 * and named presets. The curve runs from (0,0) to (1,1); only the two
 * inner control points (P1, P2) are editable. The X axis is clamped
 * to [0,1] (monotonic in time); the Y axis is unclamped to allow
 * over/undershoot expressive curves.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';

export interface EasingValue {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

export interface EasingCurveEditorProps {
  value: EasingValue;
  onChange: (v: EasingValue) => void;
  onPickPreset?: (name: string) => void;
}

const SIZE = 200;
const HIT_RADIUS = 12;

const PRESETS: Array<{ name: string; value: EasingValue }> = [
  { name: 'Linear', value: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 } },
  { name: 'Ease In', value: { p1x: 0.42, p1y: 0, p2x: 1, p2y: 1 } },
  { name: 'Ease Out', value: { p1x: 0, p1y: 0, p2x: 0.58, p2y: 1 } },
  { name: 'Ease In-Out', value: { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 } },
];

const toCanvas = (x: number, y: number): { cx: number; cy: number } => ({
  cx: x * SIZE,
  cy: SIZE - y * SIZE,
});

const fromCanvas = (cx: number, cy: number): { x: number; y: number } => ({
  x: cx / SIZE,
  y: (SIZE - cy) / SIZE,
});

const EasingCurveEditor: React.FC<EasingCurveEditorProps> = ({ value, onChange, onPickPreset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<null | 'p1' | 'p2'>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, SIZE);
      ctx.moveTo(0, p); ctx.lineTo(SIZE, p);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, SIZE);
    ctx.moveTo(0, 0); ctx.lineTo(0, SIZE);
    ctx.stroke();

    const { p1x, p1y, p2x, p2y } = value;
    const p1 = toCanvas(p1x, p1y);
    const p2 = toCanvas(p2x, p2y);
    const p0 = toCanvas(0, 0);
    const p3 = toCanvas(1, 1);

    // Handle lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy); ctx.lineTo(p1.cx, p1.cy);
    ctx.moveTo(p3.cx, p3.cy); ctx.lineTo(p2.cx, p2.cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bezier curve
    ctx.strokeStyle = 'var(--color-accent, #4a9eff)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    for (let t = 0; t <= 1.001; t += 0.02) {
      const u = 1 - t;
      const bx = 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t;
      const by = 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
      const c = toCanvas(bx, by);
      ctx.lineTo(c.cx, c.cy);
    }
    ctx.stroke();

    // Endpoints
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    [p0, p3].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Handles
    ctx.fillStyle = '#ff9f0a';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    [p1, p2].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, [value]);

  useEffect(() => { draw(); }, [draw]);

  const hitTest = (cx: number, cy: number): null | 'p1' | 'p2' => {
    const p1 = toCanvas(value.p1x, value.p1y);
    const p2 = toCanvas(value.p2x, value.p2y);
    const d1 = Math.hypot(cx - p1.cx, cy - p1.cy);
    const d2 = Math.hypot(cx - p2.cx, cy - p2.cy);
    if (d1 <= HIT_RADIUS && d1 <= d2) return 'p1';
    if (d2 <= HIT_RADIUS) return 'p2';
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * SIZE;
    const cy = ((e.clientY - rect.top) / rect.height) * SIZE;
    const hit = hitTest(cx, cy);
    if (hit) {
      setDragging(hit);
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * SIZE;
    const cy = ((e.clientY - rect.top) / rect.height) * SIZE;
    const { x, y } = fromCanvas(cx, cy);
    const clampedX = Math.max(0, Math.min(1, x));
    if (dragging === 'p1') onChange({ ...value, p1x: clampedX, p1y: y });
    else onChange({ ...value, p2x: clampedX, p2y: y });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging) {
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {/* ignore */}
    }
    setDragging(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE,
          height: SIZE,
          background: 'var(--color-bg-elevated, #1a1a1f)',
          border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
          borderRadius: '6px',
          cursor: dragging ? 'grabbing' : 'crosshair',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Easing curve editor"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {PRESETS.map(p => (
          <button
            key={p.name}
            type="button"
            aria-label={`Easing preset: ${p.name}`}
            onClick={() => {
              onChange(p.value);
              if (onPickPreset) onPickPreset(p.name);
            }}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
              borderRadius: '4px',
              color: 'var(--color-text-primary, #fff)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted, rgba(255,255,255,0.5))', fontFamily: 'var(--font-mono)' }}>
        cubic-bezier({value.p1x.toFixed(2)}, {value.p1y.toFixed(2)}, {value.p2x.toFixed(2)}, {value.p2y.toFixed(2)})
      </div>
    </div>
  );
};

export default EasingCurveEditor;
