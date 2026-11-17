// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Zone Editor (DEX_FEATURE_BACKLOG 01 · FancyZones-style visual zone editor).
 *
 * A self-contained overlay — like UkiOverlay it listens for an open event
 * (`dex-open-zone-editor`) so wiring is a single mount. The user lays out custom
 * snap zones on a scaled work-area preview (grid templates OR free-form draw /
 * move / resize), names them, and saves to the zone store. The active layout then
 * drives drag-to-zone snapping and the expand/cycle keyboard grammar in
 * AppManager. All geometry uses the pure `customZones` model.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  gridZones,
  builtinZoneLayouts,
  normalizeZone,
  type RelZone,
  type ZoneLayoutKind,
} from '../../shared/shell/customZones';
import { useZoneStore } from '../store/zoneStore';
import { generateId } from '../../shared/util/id';

type Drag =
  | { mode: 'move'; id: string; startX: number; startY: number; zx: number; zy: number }
  | { mode: 'resize'; id: string; startX: number; startY: number; zx: number; zy: number; zw: number; zh: number }
  | { mode: 'draw'; startX: number; startY: number; id: string }
  | null;

const ACCENT = 'var(--color-accent, #4a9eff)';

const ZoneEditor: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState<RelZone[]>([]);
  const [kind, setKind] = useState<ZoneLayoutKind>('grid');
  const [name, setName] = useState('Custom Layout');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [activateOnSave, setActivateOnSave] = useState(true);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(null);

  const layouts = useZoneStore(s => s.layouts);
  const activeLayoutId = useZoneStore(s => s.activeLayoutId);
  const saveLayout = useZoneStore(s => s.saveLayout);
  const removeLayout = useZoneStore(s => s.removeLayout);
  const setActiveLayout = useZoneStore(s => s.setActiveLayout);

  const reset = useCallback(() => {
    setZones(gridZones(2, 1));
    setKind('grid');
    setName('Custom Layout');
    setEditingId(undefined);
    setSelected(null);
  }, []);

  useEffect(() => {
    const onOpen = () => { reset(); setOpen(true); };
    window.addEventListener('dex-open-zone-editor', onOpen);
    return () => window.removeEventListener('dex-open-zone-editor', onOpen);
  }, [reset]);

  // Aspect ratio of the real screen so zones preview true to the work area.
  const aspect = typeof window !== 'undefined' && window.innerHeight > 0
    ? window.innerWidth / window.innerHeight
    : 16 / 9;

  const applyGrid = useCallback((cols: number, rows: number) => {
    setZones(gridZones(cols, rows));
    setKind('grid');
    setSelected(null);
  }, []);

  const loadBuiltin = useCallback((id: string) => {
    const l = builtinZoneLayouts().find(b => b.id === id);
    if (!l) return;
    setZones(l.zones.map(z => ({ ...z, id: generateId('z') })));
    setKind(l.kind);
    setName(l.name);
    setSelected(null);
  }, []);

  const loadSaved = useCallback((id: string) => {
    const l = layouts.find(x => x.id === id);
    if (!l) return;
    setZones(l.zones.map(z => ({ ...z })));
    setKind(l.kind);
    setName(l.name);
    setEditingId(l.id);
    setSelected(null);
  }, [layouts]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setZones(prev => prev.filter(z => z.id !== selected));
    setSelected(null);
  }, [selected]);

  const addZone = useCallback(() => {
    const id = generateId('z');
    setZones(prev => [...prev, { id, x: 0.3, y: 0.3, w: 0.4, h: 0.4 }]);
    setKind('canvas');
    setSelected(id);
  }, []);

  // Pointer-driven move / resize / draw on the preview surface.
  const px2rel = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return { rx: 0, ry: 0 };
    const r = el.getBoundingClientRect();
    return {
      rx: r.width > 0 ? (clientX - r.left) / r.width : 0,
      ry: r.height > 0 ? (clientY - r.top) / r.height : 0,
    };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { rx, ry } = px2rel(e.clientX, e.clientY);
    if (d.mode === 'move') {
      const dx = rx - d.startX;
      const dy = ry - d.startY;
      setZones(prev => prev.map(z => z.id === d.id
        ? normalizeZone({ ...z, x: d.zx + dx, y: d.zy + dy })
        : z));
    } else if (d.mode === 'resize') {
      const w = d.zw + (rx - d.startX);
      const h = d.zh + (ry - d.startY);
      setZones(prev => prev.map(z => z.id === d.id
        ? normalizeZone({ ...z, w, h })
        : z));
    } else if (d.mode === 'draw') {
      const x = Math.min(d.startX, rx);
      const y = Math.min(d.startY, ry);
      const w = Math.abs(rx - d.startX);
      const h = Math.abs(ry - d.startY);
      setZones(prev => prev.map(z => z.id === d.id
        ? normalizeZone({ ...z, x, y, w, h })
        : z));
    }
  }, [px2rel]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback((d: Drag) => {
    dragRef.current = d;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  }, [onPointerMove, endDrag]);

  const onSurfacePointerDown = useCallback((e: React.PointerEvent) => {
    // Empty-surface drag draws a new zone (free-form canvas authoring).
    if (e.target !== surfaceRef.current) return;
    const { rx, ry } = px2rel(e.clientX, e.clientY);
    const id = generateId('z');
    setZones(prev => [...prev, { id, x: rx, y: ry, w: 0.001, h: 0.001 }]);
    setKind('canvas');
    setSelected(id);
    startDrag({ mode: 'draw', startX: rx, startY: ry, id });
  }, [px2rel, startDrag]);

  const onZonePointerDown = useCallback((e: React.PointerEvent, z: RelZone) => {
    e.stopPropagation();
    setSelected(z.id);
    const { rx, ry } = px2rel(e.clientX, e.clientY);
    startDrag({ mode: 'move', id: z.id, startX: rx, startY: ry, zx: z.x, zy: z.y });
  }, [px2rel, startDrag]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent, z: RelZone) => {
    e.stopPropagation();
    setSelected(z.id);
    const { rx, ry } = px2rel(e.clientX, e.clientY);
    startDrag({ mode: 'resize', id: z.id, startX: rx, startY: ry, zx: z.x, zy: z.y, zw: z.w, zh: z.h });
  }, [px2rel, startDrag]);

  const onSave = useCallback(() => {
    if (zones.length === 0) return;
    const id = saveLayout({ id: editingId, name, kind, zones });
    if (activateOnSave) setActiveLayout(id);
    setOpen(false);
  }, [zones, editingId, name, kind, activateOnSave, saveLayout, setActiveLayout]);

  // Keyboard: Escape closes, Delete/Backspace removes the selected zone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selected, deleteSelected]);

  useEffect(() => () => endDrag(), [endDrag]);

  if (!open) return null;

  const panelBg = 'var(--color-bg-elevated, #1a1a1e)';
  const border = '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))';
  const textPrimary = 'var(--color-text-primary, #f5f5f7)';
  const textSecondary = 'var(--color-text-secondary, #b0b0b8)';
  const textTertiary = 'var(--color-text-tertiary, #88888f)';

  // minHeight/minWidth 24 keep every button a WCAG 2.2 SC 2.5.8 (>=24x24) target,
  // including the compact action buttons that override padding.
  const btn: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 10, border, background: 'var(--color-bg-hover, rgba(255,255,255,0.05))',
    color: textPrimary, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--dex-font-ui, inherit)',
    minHeight: 24, minWidth: 24, boxSizing: 'border-box',
  };

  return (
    <div
      data-dex-overlay
      style={{
        position: 'fixed', inset: 0, zIndex: 6000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--dex-font-ui, inherit)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        width: 'min(960px, 92vw)', maxHeight: '88vh', background: panelBg, border,
        borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: textPrimary, letterSpacing: '-0.01em' }}>Zone Editor</div>
            <div style={{ fontSize: 11, color: textTertiary, marginTop: 2 }}>
              Author custom snap zones. The active layout drives drag-to-snap, expand-across (Ctrl+Alt+Shift+Arrow) and cycle-within-zone.
            </div>
          </div>
          <button style={btn} onClick={() => setOpen(false)} aria-label="Close zone editor">Close</button>
        </div>

        <div style={{ display: 'flex', gap: 14, minHeight: 0 }}>
          {/* Preview surface */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{
              position: 'relative', width: '100%', aspectRatio: String(aspect),
              maxHeight: '52vh', background: 'var(--color-bg-base, #0a0a0c)',
              border, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair',
            }}
              ref={surfaceRef}
              onPointerDown={onSurfacePointerDown}
            >
              {zones.map(z => {
                const isSel = z.id === selected;
                return (
                  <div
                    key={z.id}
                    onPointerDown={(e) => onZonePointerDown(e, z)}
                    style={{
                      position: 'absolute',
                      left: `${z.x * 100}%`, top: `${z.y * 100}%`,
                      width: `${z.w * 100}%`, height: `${z.h * 100}%`,
                      border: `1.5px solid ${isSel ? ACCENT : 'rgba(255,255,255,0.25)'}`,
                      background: isSel ? 'rgba(74,158,255,0.16)' : 'rgba(255,255,255,0.04)',
                      borderRadius: 6, boxSizing: 'border-box', cursor: 'move',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: 10, color: textTertiary, pointerEvents: 'none' }}>
                      {Math.round(z.w * 100)}×{Math.round(z.h * 100)}
                    </span>
                    {/* Resize handle (bottom-right) */}
                    <div
                      onPointerDown={(e) => onHandlePointerDown(e, z)}
                      style={{
                        position: 'absolute', right: -1, bottom: -1, width: 14, height: 14,
                        cursor: 'nwse-resize',
                        background: isSel ? ACCENT : 'rgba(255,255,255,0.3)',
                        borderRadius: '3px 0 6px 0',
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Templates + tools */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: textTertiary, marginRight: 2 }}>Grid:</span>
              <button style={btn} onClick={() => applyGrid(2, 1)}>2 col</button>
              <button style={btn} onClick={() => applyGrid(3, 1)}>3 col</button>
              <button style={btn} onClick={() => applyGrid(2, 2)}>2×2</button>
              <button style={btn} onClick={() => applyGrid(3, 2)}>3×2</button>
              <span style={{ width: 1, height: 18, background: 'var(--color-border-subtle, rgba(255,255,255,0.1))', margin: '0 4px' }} />
              <button style={btn} onClick={addZone}>+ Zone</button>
              <button style={{ ...btn, opacity: selected ? 1 : 0.4 }} disabled={!selected} onClick={deleteSelected}>Delete</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: textTertiary, marginRight: 2 }}>Templates:</span>
              {builtinZoneLayouts().map(b => (
                <button key={b.id} style={btn} onClick={() => loadBuiltin(b.id)}>{b.name}</button>
              ))}
            </div>
          </div>

          {/* Saved layouts sidebar */}
          <div style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: border, paddingLeft: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'none', letterSpacing: '0.01em', color: textTertiary }}>Saved Layouts</div>
            <button
              style={{ ...btn, textAlign: 'left', background: activeLayoutId === null ? 'rgba(74,158,255,0.16)' : btn.background }}
              onClick={() => setActiveLayout(null)}
            >
              None (edge snapping)
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: '32vh' }}>
              {layouts.length === 0 && (
                <div style={{ fontSize: 11, color: textTertiary, padding: '4px 0' }}>No saved layouts yet.</div>
              )}
              {layouts.map(l => (
                <div key={l.id} style={{
                  border, borderRadius: 10, padding: 8,
                  background: l.id === activeLayoutId ? 'rgba(74,158,255,0.12)' : 'transparent',
                }}>
                  <div style={{ fontSize: 12, color: textPrimary, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                    {l.id === activeLayoutId && <span style={{ fontSize: 9, color: ACCENT }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: textTertiary, marginBottom: 6 }}>{l.zones.length} zones · {l.kind}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...btn, fontSize: 11, padding: '3px 7px' }} onClick={() => setActiveLayout(l.id)}>Use</button>
                    <button style={{ ...btn, fontSize: 11, padding: '3px 7px' }} onClick={() => loadSaved(l.id)}>Edit</button>
                    <button style={{ ...btn, fontSize: 11, padding: '3px 7px' }} onClick={() => removeLayout(l.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer: name + save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: border, paddingTop: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Layout name"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 10, border,
              background: 'var(--color-bg-base, #0a0a0c)', color: textPrimary, fontSize: 13,
              fontFamily: 'var(--dex-font-ui, inherit)',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={activateOnSave} onChange={(e) => setActivateOnSave(e.target.checked)} />
            Activate
          </label>
          <button
            style={{ ...btn, background: ACCENT, color: '#fff', border: 'none', fontWeight: 600, padding: '7px 16px', opacity: zones.length ? 1 : 0.5 }}
            disabled={zones.length === 0}
            onClick={onSave}
          >
            {editingId ? 'Update' : 'Save'} Layout
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZoneEditor;
