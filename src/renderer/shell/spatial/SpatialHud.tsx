// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Spatial desktop chrome, in SCREEN space:
//   - SpatialHud: the on-demand Windows panel (a searchable, keyboard-operable
//     list of every window + groups, zones, views and arrange -- the non-spatial
//     way to navigate the canvas), the opt-in minimap and a transient zoom
//     readout. No persistent toolbar: actions live in the desktop context menu
//     (spatialMenuActions) and the Ctrl+Alt shortcuts.
//   - SpatialGroupFrames: rendered INSIDE the world layer (world space); a
//     labelled frame behind each group's windows; drag the label to move the
//     whole group.
//

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSpatialStore, GROUP_COLORS, type SpatialWindow } from '../../store/spatialStore';
import { boundsOf, viewRect, type ArrangeKind, type AlignKind } from './spatialMath';
import { downloadText } from '../../improvements500/downloadBlob';

const btn: React.CSSProperties = {
  height: 28, minWidth: 28, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 'var(--radius-sm, 6px)', border: '1px solid transparent', background: 'transparent',
  color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};
const panel: React.CSSProperties = {
  // Shell glass material (follows Settings > Liquid Glass; solid when off).
  background: 'var(--color-bg-glass-strong)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg, 14px)', boxShadow: '0 8px 24px rgba(0,0,0,0.28)', color: 'var(--color-text-primary)',
};

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  close: 'M6 6l12 12M18 6L6 18',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 7.5-2',
  toBack: 'M4 8h10v10H4z M10 4h10v10',
};

const KEY = (k: string) => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? `⌘⌥${k}` : `Ctrl+Alt+${k}`);

// ---------------------------------------------------------------------------

/** Spatial actions, shared by the desktop context menu (Home) and anything else
 *  that wants to offer them. The canvas has no persistent toolbar: these live in
 *  the right-click / long-press menu, the shortcuts and the Windows panel. */
export interface SpatialMenuAction { id: string; label: string; shortcut?: string; disabled?: boolean; run: () => void }

export function spatialMenuActions(): SpatialMenuAction[] {
  const s = useSpatialStore.getState();
  if (!s.enabled) {
    return [{ id: 'enter', label: 'Spatial Desktop', shortcut: KEY('S'), run: () => window.dispatchEvent(new CustomEvent('dex-spatial-toggle', { detail: { enabled: true } })) }];
  }
  return [
    { id: 'fit', label: 'Show All Windows', shortcut: KEY('F'), run: () => s.fitAll() },
    { id: 'zoom-in', label: 'Zoom In', shortcut: KEY('='), run: () => s.zoomStep(1) },
    { id: 'zoom-out', label: 'Zoom Out', shortcut: KEY('-'), run: () => s.zoomStep(-1) },
    { id: 'actual', label: `Actual Size (${Math.round(s.camera.z * 100)}%)`, shortcut: KEY('0'), run: () => s.setZoom(1) },
    { id: 'back', label: 'Previous View', shortcut: KEY('Backspace'), disabled: s.history.length === 0, run: () => s.back() },
    { id: 'windows', label: 'Windows, Zones & Layout…', shortcut: KEY('W'), run: () => window.dispatchEvent(new CustomEvent('dex-spatial-windows')) },
    { id: 'leave', label: 'Leave Spatial Desktop', shortcut: KEY('S'), run: () => window.dispatchEvent(new CustomEvent('dex-spatial-toggle', { detail: { enabled: false } })) },
  ];
}

/** Screen-space spatial overlays: the Windows panel and minimap (both opened on
 *  demand), a zoom readout that shows only while the zoom changes, and a live
 *  region announcing the zoom for screen readers. Nothing here is persistent. */
export const SpatialHud: React.FC = () => {
  const zoom = useSpatialStore((s) => s.camera.z);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const pct = Math.round(zoom * 100);
  const firstZoom = useRef(true);
  useEffect(() => {
    const open = () => setPanelOpen((o) => !o);
    window.addEventListener('dex-spatial-windows', open);
    return () => window.removeEventListener('dex-spatial-windows', open);
  }, []);
  useEffect(() => {
    if (firstZoom.current) { firstZoom.current = false; return; }
    setShowZoom(true);
    const t = setTimeout(() => setShowZoom(false), 900);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div data-spatial-hud="" style={{ position: 'absolute', right: 16, top: 16, zIndex: 6000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none' }}>
      <div aria-hidden="true" style={{
        ...panel, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        opacity: showZoom ? 1 : 0, transition: 'opacity 160ms var(--ease-standard, ease)',
      }}>{pct}%</div>
      {panelOpen && <WindowsPanel onClose={() => setPanelOpen(false)} />}
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{`Zoom ${pct}%`}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------

// The minimap was removed (owner, 2026-11-17): Show All Windows, the
// Windows panel and zoom-to-fit groups cover overview and navigation.

// ---------------------------------------------------------------------------

const field: React.CSSProperties = {
  height: 28, padding: '0 8px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, boxSizing: 'border-box', minWidth: 0,
};
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '6px 8px 2px' };
const nextColor = (c: string) => GROUP_COLORS[(GROUP_COLORS.indexOf(c) + 1) % GROUP_COLORS.length];

type PanelTab = 'windows' | 'zones' | 'views' | 'layout';

/** Inline rename field shared by groups, zones and views. */
const RenameField: React.FC<{ value: string; label: string; onDone: (v: string | null) => void }> = ({ value, label, onDone }) => {
  const [v, setV] = useState(value);
  return (
    <input autoFocus aria-label={label} value={v} onChange={(e) => setV(e.target.value)} style={{ ...field, flex: 1, height: 26 }}
      onKeyDown={(e) => { if (e.key === 'Enter') onDone(v); if (e.key === 'Escape') { e.stopPropagation(); onDone(null); } }}
      onBlur={() => onDone(v)} />
  );
};

const WindowsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const windows = useSpatialStore((s) => s.windows);
  const groups = useSpatialStore((s) => s.groups);
  const zones = useSpatialStore((s) => s.zones);
  const views = useSpatialStore((s) => s.views);
  const locked = useSpatialStore((s) => s.locked);
  const snapGrid = useSpatialStore((s) => s.snapGrid);
  const canUndo = useSpatialStore((s) => !!s.undoArrange);
  const st = useSpatialStore.getState;
  const [tab, setTab] = useState<PanelTab>('windows');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(windows)
      .filter((w) => !term || w.title.toLowerCase().includes(term))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [windows, q]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const groupFor = (id: string) => groups.find((g) => g.appIds.includes(id));
  const ids = [...sel];

  const exportLayout = () => {
    const data = st().exportLayout();
    downloadText(`dex-spatial-layout-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    setMsg('Layout exported to your downloads.');
  };
  const importLayout = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { setMsg('That file is too large to be a layout.'); return; }
    try {
      const err = st().importLayout(JSON.parse(await f.text()));
      setMsg(err ?? 'Layout imported.');
    } catch {
      setMsg('That file is not valid JSON.');
    }
  };

  const tabs: Array<[PanelTab, string]> = [['windows', 'Windows'], ['zones', 'Zones'], ['views', 'Views'], ['layout', 'Layout']];

  return (
    <div role="dialog" aria-label="Spatial desktop panel" style={{ ...panel, width: 340, maxHeight: '64vh', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="tablist" aria-label="Panel sections" style={{ display: 'flex', gap: 2, padding: 4, borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} className="dex-spatial-btn" style={{ ...btn, flex: 1 }} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === 'windows' && (
        <>
          <div style={{ padding: 8, borderBottom: '1px solid var(--color-border)' }}>
            <input autoFocus aria-label="Find a window" placeholder="Find a window" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { st().focusWindow(list[0].id); onClose(); } }}
              style={{ ...field, width: '100%' }} />
          </div>
          <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
            {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>{Object.keys(windows).length === 0 ? 'No open windows.' : 'No matching windows.'}</div>}
            <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {list.map((w: SpatialWindow) => {
                const g = groupFor(w.id);
                const isLocked = locked.includes(w.id);
                return (
                  <li key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
                    <input type="checkbox" aria-label={`Select ${w.title}`} checked={sel.has(w.id)} onChange={() => toggle(w.id)} style={{ accentColor: 'var(--color-accent)' }} />
                    <button style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} className="dex-spatial-btn"
                      onClick={() => { st().focusWindow(w.id); onClose(); }} aria-label={`Go to ${w.title}${w.minimized ? ' (minimized)' : ''}${g ? `, in group ${g.name}` : ''}${isLocked ? ', locked' : ''}`}>
                      {g && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 9999, background: g.color, flexShrink: 0 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</span>
                      {w.minimized && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>minimized</span>}
                    </button>
                    <button className="dex-spatial-btn" style={{ ...btn, padding: '0 6px' }} aria-pressed={isLocked} onClick={() => st().toggleLock(w.id)}
                      aria-label={isLocked ? `Unlock ${w.title}` : `Lock ${w.title} in place`} title={isLocked ? 'Unlock' : 'Lock position and size'}>
                      <Icon d={isLocked ? I.lock : I.unlock} />
                    </button>
                    <button className="dex-spatial-btn" style={{ ...btn, padding: '0 6px' }} onClick={() => st().sendToBack(w.id)} aria-label={`Send ${w.title} to back`} title="Send to back">
                      <Icon d={I.toBack} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {sel.size > 0 && (
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 4 }}>
                <div style={sectionLabel}>{sel.size} selected</div>
                <form style={{ display: 'flex', gap: 6, padding: '2px 4px' }} onSubmit={(e) => { e.preventDefault(); st().createGroup(groupName || `Group ${groups.length + 1}`, ids); setSel(new Set()); setGroupName(''); }}>
                  <input aria-label="New group name" placeholder={`Group ${groups.length + 1}`} value={groupName} onChange={(e) => setGroupName(e.target.value)} style={{ ...field, flex: 1 }} />
                  <button type="submit" style={{ ...btn, background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)' }}>Group</button>
                </form>
                <div role="group" aria-label="Align selected windows" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px' }}>
                  {([['left', 'Align left'], ['center-x', 'Align centres'], ['right', 'Align right'], ['top', 'Align top'], ['center-y', 'Align middles'], ['bottom', 'Align bottom'], ['same-width', 'Same width'], ['same-height', 'Same height'], ['same-size', 'Same size']] as Array<[AlignKind, string]>).map(([k, label]) => (
                    <button key={k} className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)' }} disabled={sel.size < 2} onClick={() => st().alignWindows(ids, k)}>{label}</button>
                  ))}
                  <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', opacity: sel.size < 3 ? 0.45 : 1 }} disabled={sel.size < 3} onClick={() => st().distributeWindows(ids, 'x')}>Distribute across</button>
                  <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', opacity: sel.size < 3 ? 0.45 : 1 }} disabled={sel.size < 3} onClick={() => st().distributeWindows(ids, 'y')}>Distribute down</button>
                </div>
              </div>
            )}
            {groups.length > 0 && (
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 4 }}>
                <div style={sectionLabel}>Groups</div>
                {groups.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
                    <button aria-label={`Change color of ${g.name}`} title="Change color" className="dex-spatial-btn" style={{ ...btn, minWidth: 22, width: 22, padding: 0 }} onClick={() => st().setGroupColor(g.id, nextColor(g.color))}>
                      <span style={{ width: 10, height: 10, borderRadius: 9999, background: g.color }} />
                    </button>
                    {renaming === g.id
                      ? <RenameField value={g.name} label="Group name" onDone={(v) => { if (v !== null) st().renameGroup(g.id, v); setRenaming(null); }} />
                      : (
                        <button className="dex-spatial-btn" style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} onClick={() => { st().focusGroup(g.id); onClose(); }}
                          onDoubleClick={() => setRenaming(g.id)} aria-label={`Go to group ${g.name}, ${g.appIds.length} windows`}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{g.appIds.length}</span>
                        </button>
                      )}
                    <button className="dex-spatial-btn" style={btn} onClick={() => setRenaming(g.id)} aria-label={`Rename ${g.name}`}>Rename</button>
                    <button className="dex-spatial-btn" style={btn} onClick={() => st().setGroupCollapsed(g.id, !g.collapsed)} aria-pressed={g.collapsed} aria-label={g.collapsed ? `Expand ${g.name}` : `Collapse ${g.name}`}>{g.collapsed ? 'Expand' : 'Collapse'}</button>
                    <button className="dex-spatial-btn" style={btn} onClick={() => st().ungroup(g.id)} aria-label={`Ungroup ${g.name}`}>Ungroup</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'zones' && (
        <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
          <div style={{ display: 'flex', gap: 4, padding: 4 }}>
            <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', flex: 1 }} onClick={() => st().createZone(`Zone ${zones.length + 1}`)}>Zone from this view</button>
            <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', flex: 1 }} onClick={() => st().createPresetZones()}>Add standard zones</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '2px 8px 6px', lineHeight: 1.4 }}>
            Standard zones: Work, Creative, Development, Research, Communication, Entertainment. Drag a zone label to move it with its windows.
          </div>
          {zones.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>No zones yet.</div>}
          {zones.map((z) => (
            <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
              <button aria-label={`Change color of zone ${z.name}`} title="Change color" className="dex-spatial-btn" style={{ ...btn, minWidth: 22, width: 22, padding: 0 }} onClick={() => st().setZoneColor(z.id, nextColor(z.color))}>
                <span style={{ width: 10, height: 10, borderRadius: 4, background: z.color }} />
              </button>
              {renaming === z.id
                ? <RenameField value={z.name} label="Zone name" onDone={(v) => { if (v !== null) st().renameZone(z.id, v); setRenaming(null); }} />
                : (
                  <button className="dex-spatial-btn" style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} onClick={() => { st().focusZone(z.id); onClose(); }}
                    aria-label={`Go to zone ${z.name}, ${st().windowsInZone(z.id).length} windows`}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{st().windowsInZone(z.id).length}</span>
                  </button>
                )}
              <button className="dex-spatial-btn" style={btn} onClick={() => setRenaming(z.id)} aria-label={`Rename zone ${z.name}`}>Rename</button>
              <button className="dex-spatial-btn" style={btn} onClick={() => st().deleteZone(z.id)} aria-label={`Remove zone ${z.name} (windows stay)`}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'views' && (
        <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
          <div style={{ padding: 4 }}>
            <button className="dex-spatial-btn" style={{ ...btn, background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', width: '100%' }} onClick={() => st().saveView()}>Save this view</button>
          </div>
          {views.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>No saved views. A view remembers where you were and how far you were zoomed in.</div>}
          {views.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
              {renaming === v.id
                ? <RenameField value={v.name} label="View name" onDone={(n) => { if (n !== null) st().renameView(v.id, n); setRenaming(null); }} />
                : (
                  <button className="dex-spatial-btn" style={{ ...btn, flex: 1, justifyContent: 'flex-start', minWidth: 0 }} onClick={() => { st().goToView(v.id); onClose(); }} aria-label={`Go to view ${v.name}`}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round(v.camera.z * 100)}%</span>
                  </button>
                )}
              <button className="dex-spatial-btn" style={btn} onClick={() => setRenaming(v.id)} aria-label={`Rename view ${v.name}`}>Rename</button>
              <button className="dex-spatial-btn" style={btn} onClick={() => st().deleteView(v.id)} aria-label={`Delete view ${v.name}`}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'layout' && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
            A layout file holds window places, groups, zones, saved views and the camera. It never contains what is inside your apps.
          </div>
          <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)' }} onClick={exportLayout}>Export layout…</button>
          <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)' }} onClick={() => fileRef.current?.click()}>Import layout…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Layout file to import" style={{ display: 'none' }}
            onChange={(e) => { void importLayout(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={sectionLabel}>Arrange</div>
          <div role="group" aria-label="Arrange windows" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {([['grid', 'Grid'], ['masonry', 'Masonry'], ['row', 'Presentation row'], ['cascade', 'Cascade']] as Array<[ArrangeKind, string]>).map(([k, label]) => (
              <button key={k} className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)' }} onClick={() => st().arrangeWindows(k)}>{label}</button>
            ))}
          </div>
          <button role="switch" aria-checked={snapGrid} className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', justifyContent: 'space-between' }}
            onClick={() => st().setSnapGrid(!snapGrid)}>Snap to grid <span aria-hidden="true">{snapGrid ? 'On' : 'Off'}</span></button>
          <button className="dex-spatial-btn" style={{ ...btn, border: '1px solid var(--color-border)', opacity: canUndo ? 1 : 0.45 }} disabled={!canUndo} onClick={() => { st().undoArrangement(); }}>Undo last arrange / align</button>
        </div>
      )}
      {msg && <div role="status" style={{ fontSize: 12, padding: '6px 10px', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>{msg}</div>}
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
                borderRadius: 9999, background: g.color, color: 'var(--color-accent-text)', fontSize: 12, fontWeight: 600,
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

// ---------------------------------------------------------------------------

/** World-space zones: labelled regions behind everything. Drag the label to
 *  move the zone together with the windows inside it; drag the corner to resize. */
export const SpatialZones: React.FC = () => {
  const zones = useSpatialStore((s) => s.zones);
  const startDrag = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const s0 = useSpatialStore.getState();
    const z0 = s0.zones.find((z) => z.id === id);
    if (!z0) return;
    const members = mode === 'move' ? s0.windowsInZone(id).filter((w) => !s0.locked.includes(w)).map((w) => s0.windows[w]) : [];
    const sx = e.clientX, sy = e.clientY, k = s0.camera.z;
    let px = sx, py = sy, raf = 0;
    const apply = (final: boolean) => {
      const dx = (px - sx) / k, dy = (py - sy) / k;
      const st = useSpatialStore.getState();
      if (mode === 'resize') {
        st.setZoneRect(id, { x: z0.x, y: z0.y, w: Math.max(200, Math.round(z0.w + dx)), h: Math.max(150, Math.round(z0.h + dy)) });
        return;
      }
      st.setZoneRect(id, { x: Math.round(z0.x + dx), y: Math.round(z0.y + dy), w: z0.w, h: z0.h });
      const moved = Object.fromEntries(members.map((w) => [w.id, { x: Math.round(w.x + dx), y: Math.round(w.y + dy), w: w.w, h: w.h }]));
      st.host?.setBounds(moved);
      if (final) st.rememberLayout(moved);
    };
    const move = (ev: PointerEvent) => { px = ev.clientX; py = ev.clientY; if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(false); }); };
    const up = () => {
      cancelAnimationFrame(raf); apply(true);
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('lostpointercapture', up);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('lostpointercapture', up);
  };
  return (
    <>
      {zones.map((z) => (
        <div key={z.id} data-spatial-zone={z.id} aria-hidden="true" style={{
          position: 'fixed', left: z.x, top: z.y, width: z.w, height: z.h, zIndex: 50, pointerEvents: 'none',
          border: `2px dashed color-mix(in srgb, ${z.color} 55%, transparent)`, borderRadius: 'var(--radius-2xl, 24px)',
          background: `color-mix(in srgb, ${z.color} 4%, transparent)`,
        }}>
          <div title="Drag to move the zone and its windows" onPointerDown={(e) => startDrag(e, z.id, 'move')}
            onDoubleClick={() => useSpatialStore.getState().focusZone(z.id)}
            style={{
              position: 'absolute', left: 20, top: -18, height: 32, padding: '0 14px', display: 'flex', alignItems: 'center',
              borderRadius: 9999, background: z.color, color: 'var(--color-accent-text)', fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
              cursor: 'grab', pointerEvents: 'auto', userSelect: 'none', touchAction: 'none',
            }}>{z.name}</div>
          <div title="Drag to resize the zone" onPointerDown={(e) => startDrag(e, z.id, 'resize')} style={{
            position: 'absolute', right: -6, bottom: -6, width: 22, height: 22, borderRadius: 6, background: z.color,
            cursor: 'nwse-resize', pointerEvents: 'auto', touchAction: 'none', opacity: 0.85,
          }} />
        </div>
      ))}
    </>
  );
};

/** Alignment guides while a window is dragged (world space, 1 screen px thick). */
export const SpatialGuides: React.FC = () => {
  const guides = useSpatialStore((s) => s.guides);
  const z = useSpatialStore((s) => s.camera.z);
  if (!guides.length) return null;
  const t = 1 / z;
  return (
    <>
      {guides.map((g, i) => (
        <div key={i} aria-hidden="true" style={g.axis === 'x'
          ? { position: 'fixed', left: g.pos - t / 2, top: g.from - 16 * t, width: t, height: g.to - g.from + 32 * t, background: 'var(--color-accent)', zIndex: 6000, pointerEvents: 'none' }
          : { position: 'fixed', top: g.pos - t / 2, left: g.from - 16 * t, height: t, width: g.to - g.from + 32 * t, background: 'var(--color-accent)', zIndex: 6000, pointerEvents: 'none' }} />
      ))}
    </>
  );
};
