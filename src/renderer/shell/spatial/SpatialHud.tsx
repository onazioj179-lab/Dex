// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Spatial desktop chrome, in SCREEN space:
//   - SpatialHud: zoom controls, arrange menu, minimap, and the Windows panel
//     (a searchable, keyboard-operable list of every window + groups -- the
//     non-spatial way to navigate the canvas, for keyboard and screen-reader
//     users).
//   - SpatialGroupFrames: rendered INSIDE the world layer (world space); a
//     labelled frame behind each group's windows; drag the label to move the
//     whole group.
//

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSpatialStore, GROUP_COLORS, type SpatialWindow } from '../../store/spatialStore';
import { boundsOf, viewRect, type ArrangeKind } from './spatialMath';

const btn: React.CSSProperties = {
  height: 28, minWidth: 28, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 'var(--radius-sm, 6px)', border: '1px solid transparent', background: 'transparent',
  color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};
const panel: React.CSSProperties = {
  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg, 14px)', boxShadow: '0 8px 24px rgba(0,0,0,0.28)', color: 'var(--color-text-primary)',
};

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  back: 'M15 18l-6-6 6-6',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  close: 'M6 6l12 12M18 6L6 18',
};

const KEY = (k: string) => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? `⌘⌥${k}` : `Ctrl+Alt+${k}`);

// ---------------------------------------------------------------------------

export const SpatialHud: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const zoom = useSpatialStore((s) => s.camera.z);
  const minimap = useSpatialStore((s) => s.minimap);
  const canBack = useSpatialStore((s) => s.history.length > 0);
  const canUndo = useSpatialStore((s) => !!s.undoArrange);
  const snapGrid = useSpatialStore((s) => s.snapGrid);
  const st = useSpatialStore.getState;
  const [menu, setMenu] = useState<null | 'arrange' | 'windows'>(null);
  const pct = Math.round(zoom * 100);
  useEffect(() => {
    const open = () => setMenu((m) => (m === 'windows' ? null : 'windows'));
    window.addEventListener('dex-spatial-windows', open);
    return () => window.removeEventListener('dex-spatial-windows', open);
  }, []);

  const arrangeItems: Array<[ArrangeKind, string]> = [['grid', 'Grid'], ['masonry', 'Masonry'], ['row', 'Presentation row'], ['cascade', 'Cascade']];

  return (
    <div data-spatial-hud="" style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none' }}>
      {menu === 'windows' && <WindowsPanel onClose={() => setMenu(null)} />}
      {menu === 'arrange' && (
        <div role="menu" aria-label="Arrange windows" style={{ ...panel, padding: 6, display: 'flex', flexDirection: 'column', minWidth: 180, pointerEvents: 'auto' }}>
          {arrangeItems.map(([k, label]) => (
            <button key={k} role="menuitem" style={{ ...btn, justifyContent: 'flex-start' }} className="dex-spatial-btn"
              onClick={() => { st().arrangeWindows(k); setMenu(null); }}>{label}</button>
          ))}
          <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 2px' }} />
          <button role="menuitemcheckbox" aria-checked={snapGrid} style={{ ...btn, justifyContent: 'space-between' }} className="dex-spatial-btn"
            onClick={() => st().setSnapGrid(!snapGrid)}>Snap to grid <span aria-hidden="true">{snapGrid ? '✓' : ''}</span></button>
          <button role="menuitem" disabled={!canUndo} style={{ ...btn, justifyContent: 'flex-start', opacity: canUndo ? 1 : 0.45 }} className="dex-spatial-btn"
            onClick={() => { st().undoArrangement(); setMenu(null); }}>Undo arrange</button>
        </div>
      )}
      {minimap && <Minimap />}
      <div role="toolbar" aria-label="Spatial desktop" style={{ ...panel, padding: 4, display: 'flex', alignItems: 'center', gap: 2, pointerEvents: 'auto' }}>
        <button style={btn} className="dex-spatial-btn" onClick={() => st().zoomStep(-1)} aria-label="Zoom out" title={`Zoom out (${KEY('-')})`}><Icon d={I.minus} /></button>
        <button style={{ ...btn, minWidth: 52, fontVariantNumeric: 'tabular-nums' }} className="dex-spatial-btn" onClick={() => st().setZoom(1)}
          aria-label={`Zoom ${pct} percent. Reset to 100 percent`} title={`Actual size (${KEY('0')})`}>{pct}%</button>
        <button style={btn} className="dex-spatial-btn" onClick={() => st().zoomStep(1)} aria-label="Zoom in" title={`Zoom in (${KEY('=')})`}><Icon d={I.plus} /></button>
        <span style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 4px' }} />
        <button style={btn} className="dex-spatial-btn" onClick={() => st().fitAll()} aria-label="Show all windows" title={`Show all (${KEY('F')})`}><Icon d={I.fit} /></button>
        <button style={{ ...btn, opacity: canBack ? 1 : 0.45 }} disabled={!canBack} className="dex-spatial-btn" onClick={() => st().back()} aria-label="Previous view" title={`Previous view (${KEY('Backspace')})`}><Icon d={I.back} /></button>
        <button style={btn} className="dex-spatial-btn" aria-pressed={menu === 'arrange'} aria-haspopup="menu" onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')} aria-label="Arrange windows" title="Arrange"><Icon d={I.grid} /></button>
        <button style={btn} className="dex-spatial-btn" aria-pressed={menu === 'windows'} onClick={() => setMenu(menu === 'windows' ? null : 'windows')} aria-label="Windows and groups" title={`Windows (${KEY('W')})`}><Icon d={I.list} /></button>
        <button style={btn} className="dex-spatial-btn" aria-pressed={minimap} onClick={() => st().toggleMinimap()} aria-label="Minimap" title={`Minimap (${KEY('M')})`}><Icon d={I.map} /></button>
        <span style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 4px' }} />
        <button style={btn} className="dex-spatial-btn" onClick={onExit} aria-label="Leave spatial desktop" title={`Leave spatial desktop (${KEY('S')})`}><Icon d={I.close} /></button>
      </div>
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{`Zoom ${pct}%`}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------

const MM_W = 220, MM_H = 140;

const Minimap: React.FC = () => {
  const windows = useSpatialStore((s) => s.windows);
  const groups = useSpatialStore((s) => s.groups);
  const camera = useSpatialStore((s) => s.camera);
  const viewport = useSpatialStore((s) => s.viewport);
  const ref = useRef<SVGSVGElement>(null);
  const visible = Object.values(windows).filter((w) => !w.minimized);
  const view = viewRect(camera, viewport.w, viewport.h);
  const world = boundsOf([...visible, view]) ?? view;
  const pad = 0.08 * Math.max(world.w, world.h);
  const box = { x: world.x - pad, y: world.y - pad, w: world.w + pad * 2, h: world.h + pad * 2 };
  const k = Math.min(MM_W / box.w, MM_H / box.h);
  const ox = (MM_W - box.w * k) / 2, oy = (MM_H - box.h * k) / 2;
  const toMM = (x: number, y: number) => ({ x: ox + (x - box.x) * k, y: oy + (y - box.y) * k });
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const a of g.appIds) groupOf.set(a, g.color);

  // Click / drag: centre the view on the pointed world position.
  const navigate = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const wx = box.x + (e.clientX - r.left - ox) / k;
    const wy = box.y + (e.clientY - r.top - oy) / k;
    const s = useSpatialStore.getState();
    s.setCamera({ x: wx - s.viewport.w / 2 / s.camera.z, y: wy - s.viewport.h / 2 / s.camera.z, z: s.camera.z });
  };

  const v = toMM(view.x, view.y);
  return (
    <div style={{ ...panel, padding: 6, pointerEvents: 'auto' }}>
      <svg ref={ref} width={MM_W} height={MM_H} role="img" aria-label={`Minimap: ${visible.length} windows`} style={{ display: 'block', cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); navigate(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) navigate(e); }}>
        <rect x={0} y={0} width={MM_W} height={MM_H} rx={6} fill="var(--color-bg-inset)" />
        {visible.map((w) => {
          const p = toMM(w.x, w.y);
          return <rect key={w.id} x={p.x} y={p.y} width={Math.max(2, w.w * k)} height={Math.max(2, w.h * k)} rx={1.5}
            fill={groupOf.get(w.id) ?? 'var(--color-text-tertiary)'} opacity={0.55} />;
        })}
        <rect x={v.x} y={v.y} width={view.w * k} height={view.h * k} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------

const WindowsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const windows = useSpatialStore((s) => s.windows);
  const groups = useSpatialStore((s) => s.groups);
  const st = useSpatialStore.getState;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(windows)
      .filter((w) => !term || w.title.toLowerCase().includes(term))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [windows, q]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const groupFor = (id: string) => groups.find((g) => g.appIds.includes(id));

  return (
    <div role="dialog" aria-label="Windows and groups" style={{ ...panel, width: 300, maxHeight: '60vh', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div style={{ padding: 8, borderBottom: '1px solid var(--color-border)' }}>
        <input autoFocus aria-label="Find a window" placeholder="Find a window" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { st().focusWindow(list[0].id); onClose(); } }}
          style={{ width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }} />
      </div>
      <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
        {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>{Object.keys(windows).length === 0 ? 'No open windows.' : 'No matching windows.'}</div>}
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((w: SpatialWindow) => {
            const g = groupFor(w.id);
            return (
              <li key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
                <input type="checkbox" aria-label={`Select ${w.title}`} checked={sel.has(w.id)} onChange={() => toggle(w.id)} style={{ accentColor: 'var(--color-accent)' }} />
                <button style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} className="dex-spatial-btn"
                  onClick={() => { st().focusWindow(w.id); onClose(); }} aria-label={`Go to ${w.title}${w.minimized ? ' (minimized)' : ''}${g ? `, in group ${g.name}` : ''}`}>
                  {g && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 9999, background: g.color, flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</span>
                  {w.minimized && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>minimized</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {sel.size > 0 && (
          <form style={{ display: 'flex', gap: 6, padding: '6px 4px' }} onSubmit={(e) => { e.preventDefault(); st().createGroup(groupName || `Group ${groups.length + 1}`, [...sel]); setSel(new Set()); setGroupName(''); }}>
            <input aria-label="New group name" placeholder={`Group ${groups.length + 1}`} value={groupName} onChange={(e) => setGroupName(e.target.value)}
              style={{ flex: 1, minWidth: 0, height: 28, padding: '0 8px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }} />
            <button type="submit" style={{ ...btn, background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)' }}>Group {sel.size}</button>
          </form>
        )}
        {groups.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 4, paddingTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '4px 8px' }}>Groups</div>
            {groups.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
                <button aria-label={`Change color of ${g.name}`} title="Change color" className="dex-spatial-btn" style={{ ...btn, minWidth: 22, width: 22, padding: 0 }}
                  onClick={() => st().setGroupColor(g.id, GROUP_COLORS[(GROUP_COLORS.indexOf(g.color) + 1) % GROUP_COLORS.length])}>
                  <span style={{ width: 10, height: 10, borderRadius: 9999, background: g.color }} />
                </button>
                {renaming?.id === g.id ? (
                  <input autoFocus aria-label="Group name" value={renaming.value} onChange={(e) => setRenaming({ id: g.id, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { st().renameGroup(g.id, renaming.value); setRenaming(null); } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
                    onBlur={() => { st().renameGroup(g.id, renaming.value); setRenaming(null); }}
                    style={{ flex: 1, minWidth: 0, height: 26, padding: '0 6px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }} />
                ) : (
                  <button className="dex-spatial-btn" style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} onClick={() => { st().focusGroup(g.id); onClose(); }}
                    onDoubleClick={() => setRenaming({ id: g.id, value: g.name })} aria-label={`Go to group ${g.name}, ${g.appIds.length} windows`}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{g.appIds.length}</span>
                  </button>
                )}
                <button className="dex-spatial-btn" style={btn} onClick={() => setRenaming({ id: g.id, value: g.name })} aria-label={`Rename ${g.name}`}>Rename</button>
                <button className="dex-spatial-btn" style={btn} onClick={() => st().setGroupCollapsed(g.id, !g.collapsed)} aria-pressed={g.collapsed} aria-label={g.collapsed ? `Expand ${g.name}` : `Collapse ${g.name}`}>{g.collapsed ? 'Expand' : 'Collapse'}</button>
                <button className="dex-spatial-btn" style={btn} onClick={() => st().ungroup(g.id)} aria-label={`Ungroup ${g.name}`}>Ungroup</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const FRAME_PAD = 24;

/** World-space frames behind grouped windows. Drag the label to move the group. */
export const SpatialGroupFrames: React.FC = () => {
  const groups = useSpatialStore((s) => s.groups);
  const windows = useSpatialStore((s) => s.windows);
  return (
    <>
      {groups.map((g) => {
        const members = g.appIds.map((a) => windows[a]).filter((w) => w && !w.minimized);
        const b = boundsOf(members);
        if (!b) return null;
        return (
          <div key={g.id} data-spatial-group={g.id} aria-hidden="true" style={{
            position: 'fixed', left: b.x - FRAME_PAD, top: b.y - FRAME_PAD - 28, width: b.w + FRAME_PAD * 2, height: b.h + FRAME_PAD * 2 + 28,
            border: `1.5px solid ${g.color}`, borderRadius: 'var(--radius-xl, 18px)',
            background: `color-mix(in srgb, ${g.color} 6%, transparent)`, zIndex: 100, pointerEvents: 'none',
          }}>
            <div
              title="Drag to move the group"
              style={{
                position: 'absolute', left: 12, top: 4, height: 22, padding: '0 10px', display: 'flex', alignItems: 'center',
                borderRadius: 9999, background: g.color, color: '#FFFFFF', fontSize: 12, fontWeight: 600,
                cursor: 'grab', pointerEvents: 'auto', userSelect: 'none', touchAction: 'none',
              }}
              onPointerDown={(e) => {
                e.preventDefault(); e.stopPropagation();
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                // Move from the positions captured at drag start (absolute, never
                // incremental) so a frame that runs before React syncs the new
                // window rects back can't drop or double-apply movement.
                const s0 = useSpatialStore.getState();
                const starts = g.appIds.map((a) => s0.windows[a]).filter(Boolean);
                const sx = e.clientX, sy = e.clientY, z = s0.camera.z;
                let px = sx, py = sy, raf = 0;
                const target = () => Object.fromEntries(starts.map((w) => [w.id, {
                  x: Math.round(w.x + (px - sx) / z), y: Math.round(w.y + (py - sy) / z), w: w.w, h: w.h,
                }]));
                const move = (ev: PointerEvent) => {
                  px = ev.clientX; py = ev.clientY;
                  if (raf) return;
                  raf = requestAnimationFrame(() => { raf = 0; useSpatialStore.getState().host?.setBounds(target()); });
                };
                const up = () => {
                  cancelAnimationFrame(raf);
                  const final = target();
                  useSpatialStore.getState().host?.setBounds(final);
                  useSpatialStore.getState().rememberLayout(final);
                  el.removeEventListener('pointermove', move);
                  el.removeEventListener('pointerup', up);
                  el.removeEventListener('lostpointercapture', up);
                };
                el.addEventListener('pointermove', move);
                el.addEventListener('pointerup', up);
                el.addEventListener('lostpointercapture', up);
              }}
              onDoubleClick={() => useSpatialStore.getState().focusGroup(g.id)}
            >{g.name}</div>
          </div>
        );
      })}
    </>
  );
};
