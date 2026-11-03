// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Editable whiteboard objects over the Canvas paint layers. Rendered as DOM in
// artboard coordinates (same zoom/pan as the paint view), so text stays crisp
// and every object stays selectable, movable, resizable and retypable.
//

import React, { useEffect, useRef, useState } from 'react';
import {
  type BoardObject, STICKY_COLORS, MIN_SIZE, connectorEnds, paintOrder, removeObjects, snapValue, textOn, newObjectId,
} from './canvasObjects';
import { keyEventForApp } from '../../shell/input/appKeyScope';

interface Props {
  objects: BoardObject[];
  zoom: number;
  pan: { x: number; y: number };
  snap: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Live update while dragging (no history). */
  onLive: (objs: BoardObject[]) => void;
  /** Finished edit: record one undo step from `before` to `after`. */
  onCommit: (before: BoardObject[], after: BoardObject[]) => void;
  /** Connect mode: first click picks the start, second the end. */
  connectFrom: string | null | undefined;
  onConnectPick: (id: string) => void;
  palette: string[];
}

const handle: React.CSSProperties = { position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, borderRadius: 4, background: 'var(--color-accent)', border: '2px solid #FFFFFF', cursor: 'nwse-resize', touchAction: 'none' };

export const CanvasObjectLayer: React.FC<Props> = ({ objects, zoom, pan, snap, selectedId, onSelect, onLive, onCommit, connectFrom, onConnectPick, palette }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const objsRef = useRef(objects);
  objsRef.current = objects;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const selected = selectedId ? byId.get(selectedId) : undefined;

  // Delete / duplicate / deselect from the keyboard while an object is selected.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'canvas')) return; // key meant for another app
      if (editing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const before = objsRef.current;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation();
        onCommit(before, removeObjects(before, new Set([selectedId])));
        onSelect(null);
      } else if (e.key === 'Escape') {
        onSelect(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault(); e.stopPropagation();
        const o = before.find((x) => x.id === selectedId);
        if (o && o.kind !== 'connector') {
          const copy = { ...o, id: newObjectId(), x: o.x + 24, y: o.y + 24 };
          onCommit(before, [...before, copy]);
          onSelect(copy.id);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedId, editing, onCommit, onSelect]);

  const drag = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (connectFrom !== undefined && mode === 'move') { onConnectPick(id); return; }
    onSelect(id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const before = objsRef.current;
    const o0 = before.find((x) => x.id === id);
    if (!o0) return;
    // Moving a frame carries the objects inside it.
    const carried = mode === 'move' && o0.kind === 'frame'
      ? new Set(before.filter((x) => x.kind !== 'connector' && x.id !== id && x.x + x.w / 2 >= o0.x && x.x + x.w / 2 <= o0.x + o0.w && x.y + x.h / 2 >= o0.y && x.y + x.h / 2 <= o0.y + o0.h).map((x) => x.id))
      : new Set<string>();
    const sx = e.clientX, sy = e.clientY;
    let last = before, moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true;
      last = before.map((x) => {
        if (x.id === id) {
          return mode === 'move'
            ? { ...x, x: snapValue(o0.x + dx, snap), y: snapValue(o0.y + dy, snap) }
            : { ...x, w: Math.max(MIN_SIZE, snapValue(o0.w + dx, snap)), h: Math.max(MIN_SIZE, snapValue(o0.h + dy, snap)) };
        }
        if (carried.has(x.id)) {
          const nx = snapValue(o0.x + dx, snap) - o0.x, ny = snapValue(o0.y + dy, snap) - o0.y;
          return { ...x, x: x.x + nx, y: x.y + ny };
        }
        return x;
      });
      onLive(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('lostpointercapture', up);
      if (moved) onCommit(before, last);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('lostpointercapture', up);
  };

  const commitText = (id: string, text: string) => {
    setEditing(null);
    const before = objsRef.current;
    const o = before.find((x) => x.id === id);
    if (o && o.text !== text) onCommit(before, before.map((x) => (x.id === id ? { ...x, text } : x)));
  };

  const patchSelected = (patch: Partial<BoardObject>) => {
    if (!selectedId) return;
    const before = objsRef.current;
    onCommit(before, before.map((x) => (x.id === selectedId ? { ...x, ...patch } : x)));
  };

  const ordered = paintOrder(objects);
  return (
    <div aria-label="Board objects" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }} aria-hidden="true">
          <defs>
            {ordered.filter((o) => o.kind === 'connector').map((o) => (
              <marker key={o.id} id={`arrow-${o.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={o.color} />
              </marker>
            ))}
          </defs>
          {ordered.filter((o) => o.kind === 'connector').map((o) => {
            const ends = connectorEnds(o, byId);
            if (!ends) return null;
            return (
              <g key={o.id} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onSelect(o.id); }}>
                <line x1={ends.a.x} y1={ends.a.y} x2={ends.b.x} y2={ends.b.y} stroke="transparent" strokeWidth={14} />
                <line x1={ends.a.x} y1={ends.a.y} x2={ends.b.x} y2={ends.b.y} stroke={o.color} strokeWidth={selectedId === o.id ? 4 : 2.5} markerEnd={`url(#arrow-${o.id})`} />
              </g>
            );
          })}
        </svg>
        {ordered.filter((o) => o.kind !== 'connector').map((o) => {
          const isSel = selectedId === o.id;
          const isFrom = connectFrom === o.id;
          const base: React.CSSProperties = {
            position: 'absolute', left: o.x, top: o.y, width: o.w, height: o.h, boxSizing: 'border-box', touchAction: 'none',
            pointerEvents: o.kind === 'frame' ? 'none' : 'auto', cursor: connectFrom !== undefined ? 'crosshair' : 'move',
            outline: isSel || isFrom ? `${2 / zoom}px solid var(--color-accent)` : undefined, outlineOffset: 2 / zoom,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          };
          const look: React.CSSProperties =
            o.kind === 'sticky' ? { background: o.color, color: textOn(o.color), boxShadow: '0 2px 6px rgba(0,0,0,0.18)', padding: 10, fontSize: 18, borderRadius: 4 }
            : o.kind === 'text' ? { color: o.color, fontSize: 18, padding: 10 }
            : o.kind === 'rect' ? { border: `2.5px solid ${o.color}`, borderRadius: 6, color: '#1D1D1F', fontSize: 18, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }
            : o.kind === 'ellipse' ? { border: `2.5px solid ${o.color}`, borderRadius: '50%', color: '#1D1D1F', fontSize: 18, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }
            : o.kind === 'frame' ? { border: `2px dashed ${o.color}`, borderRadius: 10 }
            : {};
          return (
            <div key={o.id} role="group" aria-label={`${o.kind}${o.text ? `: ${o.text.slice(0, 40)}` : ''}`} style={{ ...base, ...look }}
              onPointerDown={(e) => drag(e, o.id, 'move')} onDoubleClick={() => { if (o.kind !== 'image') setEditing(o.id); }}>
              {o.kind === 'frame' && (
                <div onPointerDown={(e) => drag(e, o.id, 'move')} onDoubleClick={() => setEditing(o.id)}
                  style={{ position: 'absolute', left: 0, top: -30, height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', borderRadius: 6, background: o.color, color: textOn(o.color), fontSize: 15, fontWeight: 600, pointerEvents: 'auto', cursor: 'move', whiteSpace: 'nowrap' }}>
                  {editing === o.id ? null : (o.text || 'Frame')}
                </div>
              )}
              {o.kind === 'image' && o.src && <img src={o.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />}
              {editing === o.id ? (
                <textarea autoFocus defaultValue={o.text} aria-label="Edit text"
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => commitText(o.id, e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
                  style={{ position: o.kind === 'frame' ? 'absolute' : 'static', top: o.kind === 'frame' ? -30 : undefined, width: '100%', height: o.kind === 'frame' ? 26 : '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'inherit', font: 'inherit', padding: 0, pointerEvents: 'auto' }} />
              ) : (o.kind !== 'frame' && o.kind !== 'image' && <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: 'none' }}>{o.text}</span>)}
              {isSel && o.kind !== 'frame' && <div style={{ ...handle, transform: `scale(${1 / zoom})`, transformOrigin: 'bottom right' }} onPointerDown={(e) => drag(e, o.id, 'resize')} aria-label="Resize" />}
              {isSel && o.kind === 'frame' && <div style={{ ...handle, pointerEvents: 'auto', transform: `scale(${1 / zoom})`, transformOrigin: 'bottom right' }} onPointerDown={(e) => drag(e, o.id, 'resize')} aria-label="Resize frame" />}
            </div>
          );
        })}
      </div>

      {selected && !editing && (() => {
        // Small toolbar above the selection, in screen space.
        const sx = pan.x + (selected.kind === 'connector' ? 0 : selected.x) * zoom;
        const sy = pan.y + (selected.kind === 'connector' ? 0 : selected.y) * zoom - 44;
        const colors = selected.kind === 'sticky' ? STICKY_COLORS : palette;
        return (
          <div role="toolbar" aria-label="Object" onPointerDown={(e) => e.stopPropagation()} style={{
            position: 'absolute', left: Math.max(8, sx), top: Math.max(8, sy), display: 'flex', alignItems: 'center', gap: 4, padding: 4,
            borderRadius: 'var(--radius-md, 10px)', background: 'var(--color-bg-glass-strong)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--color-border)', boxShadow: '0 6px 18px rgba(0,0,0,0.25)', pointerEvents: 'auto',
          }}>
            {colors.slice(0, 8).map((c) => (
              <button key={c} aria-label={`Colour ${c}`} aria-pressed={selected.color === c} onClick={() => patchSelected({ color: c })}
                style={{ width: 20, height: 20, borderRadius: 9999, background: c, border: selected.color === c ? '2px solid var(--color-accent)' : '1px solid var(--color-border-control)', cursor: 'pointer', padding: 0 }} />
            ))}
            <span style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 2px' }} />
            {selected.kind !== 'connector' && <button onClick={() => {
              const before = objsRef.current;
              const copy = { ...selected, id: newObjectId(), x: selected.x + 24, y: selected.y + 24 };
              onCommit(before, [...before, copy]); onSelect(copy.id);
            }} style={tbBtn} aria-label="Duplicate (Ctrl+D)">Duplicate</button>}
            {selected.kind !== 'connector' && <button onClick={() => {
              const before = objsRef.current;
              onCommit(before, [...before.filter((x) => x.id !== selected.id), selected]);
            }} style={tbBtn} aria-label="Bring to front">Front</button>}
            <button onClick={() => { const before = objsRef.current; onCommit(before, removeObjects(before, new Set([selected.id]))); onSelect(null); }}
              style={{ ...tbBtn, color: 'var(--color-error)' }} aria-label="Delete (Del)">Delete</button>
          </div>
        );
      })()}
    </div>
  );
};

const tbBtn: React.CSSProperties = { height: 24, padding: '0 8px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' };

export default CanvasObjectLayer;
