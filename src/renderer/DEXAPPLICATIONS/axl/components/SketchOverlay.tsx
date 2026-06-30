// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Sketch Overlay — a real 2D sketcher that produces 3D solids.
//
// Draw line / rectangle / circle profiles on a gridded plane (with grid +
// endpoint snapping), then Extrude or Revolve the closed profile into an actual
// triangulated mesh that is committed as a new part. Self-contained: owns its
// canvas, tools, and entity list so the main app only handles the committed mesh.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type SketchEnt, type Pt2, type RawMesh,
  extrudeSketch, revolveSketch, profileFromEntities, snapSketchPoint,
} from '../AxlSketch';

type SketchTool = 'line' | 'rect' | 'circle';

interface Props {
  units: string;
  onCommitMesh: (name: string, mesh: RawMesh) => void;
  onClose: () => void;
}

const GRID = 10; // sketch units per grid line

const SketchOverlay: React.FC<Props> = ({ units, onCommitMesh, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<SketchTool>('rect');
  const [ents, setEnts] = useState<SketchEnt[]>([]);
  const [draft, setDraft] = useState<{ start: Pt2; cur: Pt2 } | null>(null);
  const [depth, setDepth] = useState(40);

  // Canvas-pixel <-> sketch-unit mapping (origin at canvas centre, Y up).
  const toSketch = useCallback((px: number, py: number): Pt2 => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    return { x: px - c.clientWidth / 2, y: -(py - c.clientHeight / 2) };
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const sx = (p: Pt2) => cx + p.x;
    const sy = (p: Pt2) => cy - p.y;

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let gx = cx % GRID; gx < w; gx += GRID) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = cy % GRID; gy < h; gy += GRID) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    // axes
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

    const drawEnt = (e: SketchEnt, color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      if (e.kind === 'line') { ctx.moveTo(sx({ x: e.x0, y: e.y0 }), sy({ x: e.x0, y: e.y0 })); ctx.lineTo(sx({ x: e.x1, y: e.y1 }), sy({ x: e.x1, y: e.y1 })); }
      else if (e.kind === 'rect') { const x = sx({ x: Math.min(e.x0, e.x1), y: 0 }); const y = sy({ x: 0, y: Math.max(e.y0, e.y1) }); ctx.rect(x, y, Math.abs(e.x1 - e.x0), Math.abs(e.y1 - e.y0)); }
      else { ctx.arc(sx({ x: e.cx, y: 0 }), sy({ x: 0, y: e.cy }), e.r, 0, Math.PI * 2); }
      ctx.stroke();
    };
    ents.forEach(e => drawEnt(e, 'var(--color-accent, #4a9eff)'));

    if (draft) {
      const { start, cur } = draft;
      if (tool === 'line') drawEnt({ kind: 'line', x0: start.x, y0: start.y, x1: cur.x, y1: cur.y }, 'rgba(255,255,255,0.6)');
      else if (tool === 'rect') drawEnt({ kind: 'rect', x0: start.x, y0: start.y, x1: cur.x, y1: cur.y }, 'rgba(255,255,255,0.6)');
      else drawEnt({ kind: 'circle', cx: start.x, cy: start.y, r: Math.hypot(cur.x - start.x, cur.y - start.y) }, 'rgba(255,255,255,0.6)');
    }
  }, [ents, draft, tool]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const onDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const p = snapSketchPoint(toSketch(e.clientX - rect.left, e.clientY - rect.top), GRID, ents);
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic/edge pointer */ }
    setDraft({ start: p, cur: p });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const p = snapSketchPoint(toSketch(e.clientX - rect.left, e.clientY - rect.top), GRID, ents);
    setDraft(d => (d ? { ...d, cur: p } : d));
  };
  const onUp = () => {
    if (!draft) return;
    const { start, cur } = draft;
    const dist = Math.hypot(cur.x - start.x, cur.y - start.y);
    if (dist >= 2) {
      if (tool === 'line') setEnts(a => [...a, { kind: 'line', x0: start.x, y0: start.y, x1: cur.x, y1: cur.y }]);
      else if (tool === 'rect') setEnts(a => [...a, { kind: 'rect', x0: start.x, y0: start.y, x1: cur.x, y1: cur.y }]);
      else setEnts(a => [...a, { kind: 'circle', cx: start.x, cy: start.y, r: dist }]);
    }
    setDraft(null);
  };

  const hasProfile = !!profileFromEntities(ents);

  const commit = (mode: 'extrude' | 'revolve') => {
    const mesh = mode === 'extrude' ? extrudeSketch(ents, depth) : revolveSketch(ents, 360);
    if (!mesh) return;
    onCommitMesh(mode === 'extrude' ? 'Extruded Sketch' : 'Revolved Sketch', mesh);
    onClose();
  };

  const toolBtn = (t: SketchTool, label: string, icon: React.ReactNode) => (
    <button key={t} onClick={() => setTool(t)} aria-label={label}
      style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tool === t ? 'var(--color-accent-light)' : 'var(--color-bg-hover)', color: tool === t ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
      {icon}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'var(--color-bg-elevated)' }}>
      <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }} />

      {/* Sketch toolbar */}
      <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 12, zIndex: 401 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>SKETCH</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {toolBtn('line', 'Line', <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="19" x2="19" y2="5" /></svg>)}
          {toolBtn('rect', 'Rectangle', <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" rx="1" /></svg>)}
          {toolBtn('circle', 'Circle', <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /></svg>)}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--color-bg-hover)' }} />
        <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Depth
          <input type="number" value={depth} min={1} onChange={e => setDepth(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 54, padding: '3px 6px', fontSize: 11, borderRadius: 7, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' }} />
          <span style={{ color: 'var(--color-text-tertiary)' }}>{units}</span>
        </label>
        <button onClick={() => commit('extrude')} disabled={!hasProfile}
          style={{ padding: '5px 11px', fontSize: 10, fontWeight: 700, borderRadius: 8, border: 'none', cursor: hasProfile ? 'pointer' : 'not-allowed', opacity: hasProfile ? 1 : 0.45, background: 'var(--color-accent)', color: '#fff' }}>Extrude</button>
        <button onClick={() => commit('revolve')} disabled={!hasProfile}
          style={{ padding: '5px 11px', fontSize: 10, fontWeight: 600, borderRadius: 8, border: 'none', cursor: hasProfile ? 'pointer' : 'not-allowed', opacity: hasProfile ? 1 : 0.45, background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' }}>Revolve</button>
        <button onClick={() => { setEnts([]); setDraft(null); }} aria-label="Clear sketch"
          style={{ padding: '5px 9px', fontSize: 10, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--color-bg-hover)', color: 'var(--color-text-tertiary)' }}>Clear</button>
        <button onClick={onClose} aria-label="Close sketch" className="axl-close">&times;</button>
      </div>

      {/* Hint */}
      {ents.length === 0 && !draft && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
          Drag to draw a {tool}. Snaps to grid + endpoints. Then Extrude or Revolve.
        </div>
      )}
    </div>
  );
};

export default SketchOverlay;
