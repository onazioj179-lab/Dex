// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// Prism -- Adjustment Layer Controls
// The pixel engine (applyAdjustmentToImageData) already supports brightness/
// contrast, hue/saturation, curves and levels, but no UI ever edited the
// params -- adjustment layers applied defaults and could not be tuned. This is
// that editor: real sliders for the scalar adjustments and a draggable Curves
// graph that rebuilds the 256-entry LUT live via curveLUTFromPoints.
// ===========================================================================
import React, { useCallback, useRef, useState } from 'react';
import { curveLUTFromPoints, type AdjustmentParams } from './PrismEngine';

interface Props {
  adjustment: AdjustmentParams;
  onChange: (patch: Partial<AdjustmentParams>) => void;
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' };
const labelStyle: React.CSSProperties = { width: 64, fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 };
const valStyle: React.CSSProperties = { width: 38, fontSize: 11, textAlign: 'right', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' };
const sliderStyle: React.CSSProperties = { flex: 1, accentColor: 'var(--color-accent, #4a9eff)', height: 4 };

function Slider({ label, value, min, max, step = 1, fmt, onInput }: {
  label: string; value: number; min: number; max: number; step?: number;
  fmt?: (v: number) => string; onInput: (v: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value} style={sliderStyle}
        onChange={(e) => onInput(Number(e.target.value))}
        aria-label={label}
      />
      <span style={valStyle}>{fmt ? fmt(value) : value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curves graph editor -- draggable control points over a 0..255 square.
// ---------------------------------------------------------------------------

interface CurvePoint { input: number; output: number; }
const SIZE = 200; // px, square

function CurvesEditor({ onChange }: { onChange: (patch: Partial<AdjustmentParams>) => void }) {
  // Points live locally (the layer only stores the resulting LUT). Identity to start.
  const [points, setPoints] = useState<CurvePoint[]>([{ input: 0, output: 0 }, { input: 255, output: 255 }]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const commit = useCallback((pts: CurvePoint[]) => {
    setPoints(pts);
    onChange({ rgb: curveLUTFromPoints(pts) } as Partial<AdjustmentParams>);
  }, [onChange]);

  const toGraph = (clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { input: Math.round(x * 255), output: Math.round((1 - y) * 255) };
  };

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragIdx(idx);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const g = toGraph(e.clientX, e.clientY);
    setPoints(prev => {
      const next = [...prev];
      // Endpoints keep their input fixed (0 / 255); interior points can move freely
      // but stay ordered between their neighbours.
      const isFirst = dragIdx === 0;
      const isLast = dragIdx === prev.length - 1;
      const lo = isFirst ? 0 : prev[dragIdx - 1].input + 1;
      const hi = isLast ? 255 : prev[dragIdx + 1].input - 1;
      const input = isFirst ? 0 : isLast ? 255 : Math.max(lo, Math.min(hi, g.input));
      next[dragIdx] = { input, output: g.output };
      onChange({ rgb: curveLUTFromPoints(next) } as Partial<AdjustmentParams>);
      return next;
    });
  };

  const onPointerUp = () => setDragIdx(null);

  const addPoint = (e: React.MouseEvent) => {
    if (dragIdx !== null) return;
    const g = toGraph(e.clientX, e.clientY);
    if (g.input <= 0 || g.input >= 255) return;
    const next = [...points, g].sort((a, b) => a.input - b.input);
    commit(next);
  };

  const removePoint = (e: React.MouseEvent, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    if (idx === 0 || idx === points.length - 1) return; // keep endpoints
    commit(points.filter((_, i) => i !== idx));
  };

  const reset = () => commit([{ input: 0, output: 0 }, { input: 255, output: 255 }]);

  // Build the displayed curve from the LUT for an accurate preview.
  const lut = curveLUTFromPoints(points);
  const linePath = lut.map((o, i) => `${(i / 255) * SIZE},${SIZE - (o / 255) * SIZE}`).join(' ');

  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ display: 'block', background: 'var(--color-bg-inset, rgba(0,0,0,0.35))', border: '1px solid var(--color-border)', borderRadius: 6, touchAction: 'none', cursor: dragIdx !== null ? 'grabbing' : 'crosshair' }}
        onClick={addPoint}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label="Tone curve editor"
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map(f => (
          <g key={f}>
            <line x1={f * SIZE} y1={0} x2={f * SIZE} y2={SIZE} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <line x1={0} y1={f * SIZE} x2={SIZE} y2={f * SIZE} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          </g>
        ))}
        <line x1={0} y1={SIZE} x2={SIZE} y2={0} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="3 3" />
        <polyline points={linePath} fill="none" stroke="var(--color-accent, #4a9eff)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={(p.input / 255) * SIZE}
            cy={SIZE - (p.output / 255) * SIZE}
            r={5}
            fill="#fff"
            stroke="var(--color-accent, #4a9eff)"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => onPointerDown(e, i)}
            onContextMenu={(e) => removePoint(e, i)}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Click to add - drag to shape - right-click to remove</span>
        <button
          type="button"
          onClick={reset}
          style={{ fontSize: 10, fontWeight: 600, padding: '3px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
        >Reset</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor -- dispatches on adjustment kind.
// ---------------------------------------------------------------------------

export const AdjustmentControls: React.FC<Props> = ({ adjustment, onChange }) => {
  switch (adjustment.kind) {
    case 'brightness-contrast':
      return (
        <div>
          <Slider label="Brightness" min={-100} max={100} value={adjustment.brightness} onInput={(v) => onChange({ brightness: v } as Partial<AdjustmentParams>)} />
          <Slider label="Contrast" min={-100} max={100} value={adjustment.contrast} onInput={(v) => onChange({ contrast: v } as Partial<AdjustmentParams>)} />
        </div>
      );
    case 'hue-saturation':
      return (
        <div>
          <Slider label="Hue" min={-180} max={180} value={adjustment.hue} onInput={(v) => onChange({ hue: v } as Partial<AdjustmentParams>)} fmt={(v) => `${v}°`} />
          <Slider label="Saturation" min={0} max={2} step={0.01} value={adjustment.saturation} fmt={(v) => `${Math.round(v * 100)}%`} onInput={(v) => onChange({ saturation: v } as Partial<AdjustmentParams>)} />
          <Slider label="Lightness" min={-1} max={1} step={0.01} value={adjustment.lightness} fmt={(v) => `${Math.round(v * 100)}`} onInput={(v) => onChange({ lightness: v } as Partial<AdjustmentParams>)} />
        </div>
      );
    case 'levels':
      return (
        <div>
          <Slider label="In Black" min={0} max={254} value={adjustment.inputBlack} onInput={(v) => onChange({ inputBlack: Math.min(v, adjustment.inputWhite - 1) } as Partial<AdjustmentParams>)} />
          <Slider label="In White" min={1} max={255} value={adjustment.inputWhite} onInput={(v) => onChange({ inputWhite: Math.max(v, adjustment.inputBlack + 1) } as Partial<AdjustmentParams>)} />
          <Slider label="Gamma" min={0.1} max={3} step={0.01} value={adjustment.gamma} fmt={(v) => v.toFixed(2)} onInput={(v) => onChange({ gamma: v } as Partial<AdjustmentParams>)} />
          <Slider label="Out Black" min={0} max={255} value={adjustment.outputBlack} onInput={(v) => onChange({ outputBlack: v } as Partial<AdjustmentParams>)} />
          <Slider label="Out White" min={0} max={255} value={adjustment.outputWhite} onInput={(v) => onChange({ outputWhite: v } as Partial<AdjustmentParams>)} />
        </div>
      );
    case 'curves':
      return <CurvesEditor onChange={onChange} />;
    default:
      return null;
  }
};

export default AdjustmentControls;
