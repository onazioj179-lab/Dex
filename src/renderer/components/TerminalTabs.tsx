// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * TerminalTabs - multi-session terminal: a compact tab strip over tabs that each
 * hold 1-4 split panes. Every pane is a real <Terminal> with its own PTY; all
 * panes stay mounted while their tab is hidden, so switching never loses a
 * session or its scrollback. Closing the last pane of the last tab closes the
 * panel (onClose).
 *
 * Persistence: tabs, names, split axis and pane sizes are saved and restored;
 * each pane spawns a fresh shell on mount (scrollback isn't persisted — the OS
 * shell has no replay channel). Layout logic lives in ./terminalLayout.ts.
 *
 * Keys (captured before the shell sees them):
 *   Ctrl+Shift+T new tab · Ctrl+Shift+D split right · Ctrl+Shift+E split down
 *   Ctrl+Shift+W close pane · Alt+←/→/↑/↓ previous/next pane
 *   Ctrl+Tab / Ctrl+Shift+Tab next/previous tab
 *   Ctrl+= / Ctrl+- / Ctrl+0 larger / smaller / default text
 *
 * Profiles: a pane's shell and starting folder are fixed when it is created
 * (./terminalProfiles.ts). The default shell applies to new tabs only; a split
 * starts the same shell in the same folder as the pane it was split from.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from './Terminal';
import {
  LAYOUT_KEY, LAYOUT_KEY_V1, MAX_PANES, addTab as addTabL, closePane as closePaneL, closeTab as closeTabL,
  cyclePane, cycleTab, focusPane, initialLayout, parseLayout, resizeDivider, splitPane, canSplit as canSplitDir, type SplitDir,
  type TermLayout, type TermTab,
} from './terminalLayout';
import {
  FONT_DEFAULT, FONT_MAX, FONT_MIN, OPEN_EVENT, PANE_PROFILES_KEY, SETTINGS_KEY, clampFontSize, folderLabel,
  parsePaneProfiles, parseSettings, prunePaneProfiles, shellForNewTab, takeTerminalRequests,
  type PaneProfile, type ShellInfo, type TermSettings,
} from './terminalProfiles';

interface TerminalTabsProps {
  onClose?: () => void;
  cwd?: string;
  height?: number | string;
  /** Open a tab for each "Open in Terminal" request (the standalone Terminal app sets this). */
  acceptOpenRequests?: boolean;
}

/** The shells installed on this machine, from the native side. Empty when there is no native bridge. */
async function fetchShells(): Promise<ShellInfo[]> {
  const dex = typeof window !== 'undefined' ? (window as unknown as { dex?: { invoke?: (c: string) => Promise<unknown> } }).dex : undefined;
  if (!dex || typeof dex.invoke !== 'function') return [];
  try {
    const r = (await dex.invoke('pty:shells')) as { shells?: unknown } | null;
    if (!r || !Array.isArray(r.shells)) return [];
    return (r.shells as Partial<ShellInfo>[]).filter((s): s is ShellInfo => !!s && typeof s.path === 'string' && typeof s.label === 'string' && typeof s.id === 'string');
  } catch {
    return [];
  }
}

function allPanes(l: TermLayout): string[] {
  return l.tabs.flatMap((t) => t.panes);
}

const menuRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 10px', background: 'transparent', border: 'none',
  color: 'var(--color-text-primary, #e0e0e0)', fontSize: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
};
const stepBtn: React.CSSProperties = {
  width: 22, height: 20, borderRadius: 4, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--color-text-primary, #e0e0e0)', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};

function loadLayout(): TermLayout {
  try {
    if (typeof localStorage === 'undefined') return initialLayout();
    return parseLayout(localStorage.getItem(LAYOUT_KEY), localStorage.getItem(LAYOUT_KEY_V1)) ?? initialLayout();
  } catch {
    return initialLayout();
  }
}

/** Derive a short tab label from a running command (argv0, capped). */
function titleFromCommand(cmd: string): string {
  const first = cmd.trim().split(/\s+/)[0] || cmd.trim();
  const base = first.split(/[\\/]/).pop() || first;
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0, borderRadius: 6,
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary, #8a8a8a)',
};

/** Put keyboard focus into the pane's terminal (xterm's helper textarea). */
function focusPaneDom(root: HTMLElement | null, paneId: string) {
  setTimeout(() => {
    const el = root?.querySelector<HTMLElement>(`[data-term-pane="${paneId}"] textarea`);
    el?.focus();
  }, 0);
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({ onClose, cwd, height, acceptOpenRequests }) => {
  const [layout, setLayout] = useState<TermLayout>(() => loadLayout());
  const [settings, setSettings] = useState<TermSettings>(() => {
    try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return parseSettings(null); }
  });
  const [paneProfiles, setPaneProfiles] = useState<Record<string, PaneProfile>>(() => {
    try { return parsePaneProfiles(localStorage.getItem(PANE_PROFILES_KEY), allPanes(layout)); } catch { return {}; }
  });
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const shellsRef = useRef(shells);
  shellsRef.current = shells;
  const profilesRef = useRef(paneProfiles);
  profilesRef.current = paneProfiles;
  const [running, setRunning] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage unavailable */ }
  }, [layout]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings]);

  // Profiles follow their panes: a closed pane's profile is dropped.
  useEffect(() => {
    setPaneProfiles((p) => prunePaneProfiles(p, allPanes(layout)));
  }, [layout]);
  useEffect(() => {
    try { localStorage.setItem(PANE_PROFILES_KEY, JSON.stringify(paneProfiles)); } catch { /* storage unavailable */ }
  }, [paneProfiles]);

  useEffect(() => {
    let alive = true;
    void fetchShells().then((s) => { if (alive) setShells(s); });
    return () => { alive = false; };
  }, []);

  const activeTab = layout.tabs.find((t) => t.id === layout.activeId) ?? layout.tabs[0];

  /** Apply a layout change; a null result means the last session closed. */
  const apply = useCallback((fn: (l: TermLayout) => TermLayout | null, focus = false) => {
    setLayout((l) => {
      const next = fn(l);
      if (!next) { setTimeout(() => onCloseRef.current?.(), 0); return l; }
      if (focus) {
        const t = next.tabs.find((x) => x.id === next.activeId);
        if (t) focusPaneDom(rootRef.current, t.activePane);
      }
      return next;
    });
  }, []);

  /** Commit a layout that gained the pane `paneId`, recording the profile it starts with. */
  const commitNewPane = useCallback((next: TermLayout, paneId: string, profile: PaneProfile) => {
    if (profile.shell || profile.cwd) {
      const withPane = { ...profilesRef.current, [paneId]: profile };
      profilesRef.current = withPane;
      setPaneProfiles(withPane);
    }
    layoutRef.current = next;
    setLayout(next);
    focusPaneDom(rootRef.current, paneId);
  }, []);

  /** New tab. With no shell given it starts the default shell; `dir` is the folder it starts in. */
  const openTab = useCallback((shell?: string, dir?: string) => {
    const next = addTabL(layoutRef.current);
    commitNewPane(next, next.activeId, { shell: shell ?? shellForNewTab(settingsRef.current, shellsRef.current), cwd: dir });
  }, [commitNewPane]);
  const newTab = useCallback(() => openTab(), [openTab]);

  /** Split the active pane; the new pane starts the same shell in the same folder. */
  const split = useCallback((dir: SplitDir) => {
    const l = layoutRef.current;
    const from = l.tabs.find((t) => t.id === l.activeId);
    const next = splitPane(l, l.activeId, dir);
    if (!from || next === l) return;
    const created = next.tabs.find((t) => t.id === l.activeId)?.activePane;
    if (created) commitNewPane(next, created, { ...(profilesRef.current[from.activePane] ?? {}) });
  }, [commitNewPane]);

  const setFontSize = useCallback((n: number) => setSettings((s) => ({ ...s, fontSize: clampFontSize(n) })), []);
  // Steps read the latest size, so two quick presses always move two steps.
  const stepFontSize = useCallback((d: number) => setSettings((s) => ({ ...s, fontSize: clampFontSize(s.fontSize + d) })), []);

  // "Open in Terminal" from Files and other apps: one tab per requested folder.
  useEffect(() => {
    if (!acceptOpenRequests) return;
    const drain = () => { for (const dir of takeTerminalRequests()) openTab(undefined, dir); };
    drain();
    window.addEventListener(OPEN_EVENT, drain);
    return () => window.removeEventListener(OPEN_EVENT, drain);
  }, [acceptOpenRequests, openTab]);

  // The shell menu closes on a click outside it or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [menuOpen]);
  const closePane = useCallback((tabId: string, paneId: string) => {
    setRunning((r) => { const n = { ...r }; delete n[paneId]; return n; });
    apply((l) => closePaneL(l, tabId, paneId), true);
  }, [apply]);
  const closeTab = useCallback((tabId: string) => apply((l) => closeTabL(l, tabId), true), [apply]);

  // Keyboard shortcuts, captured before xterm's textarea receives the key.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input')) return; // rename / find fields
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (ctrl && e.shiftKey && k === 't') newTab();
      else if (ctrl && e.shiftKey && k === 'd') split('row');
      else if (ctrl && e.shiftKey && k === 'e') split('column');
      else if (ctrl && e.shiftKey && k === 'w') { const t = activeTabRef.current; if (t) closePane(t.id, t.activePane); }
      else if (ctrl && k === 'tab') apply((l) => cycleTab(l, e.shiftKey ? -1 : 1), true);
      else if (e.altKey && !ctrl && (k === 'arrowright' || k === 'arrowdown')) apply((l) => cyclePane(l, 1), true);
      else if (e.altKey && !ctrl && (k === 'arrowleft' || k === 'arrowup')) apply((l) => cyclePane(l, -1), true);
      else if (ctrl && !e.altKey && (k === '=' || k === '+')) stepFontSize(1);
      else if (ctrl && !e.altKey && k === '-') stepFontSize(-1);
      else if (ctrl && !e.altKey && !e.shiftKey && k === '0') setFontSize(FONT_DEFAULT);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    el.addEventListener('keydown', onKey, true);
    return () => el.removeEventListener('keydown', onKey, true);
  }, [newTab, split, closePane, apply, setFontSize, stepFontSize]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const commitRename = useCallback(() => {
    const id = editingId;
    const name = editName.trim();
    setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === id ? { ...t, name: name || undefined } : t)) }));
    setEditingId(null);
    setEditName('');
  }, [editingId, editName]);

  const labelFor = useCallback((tab: TermTab, index: number): string => {
    if (tab.name) return tab.name;
    const cmd = running[tab.activePane];
    if (cmd) return titleFromCommand(cmd);
    const dir = paneProfiles[tab.activePane]?.cwd;
    if (dir) return folderLabel(dir);
    return `Terminal ${index + 1}`;
  }, [running, paneProfiles]);

  // The shell new tabs start: the saved default while it is still installed, else the system one.
  const effectiveDefault = (shellForNewTab(settings, shells) ?? shells.find((s) => s.default)?.path ?? '').toLowerCase();

  // Divider drag: fraction delta from pointer movement over the tab's size.
  const startDrag = useCallback((e: React.PointerEvent, tab: TermTab, index: number) => {
    e.preventDefault();
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const total = tab.dir === 'row' ? box.width : box.height;
    const start = tab.dir === 'row' ? e.clientX : e.clientY;
    const base = tab.sizes;
    let raf = 0;
    const move = (ev: PointerEvent) => {
      const delta = ((tab.dir === 'row' ? ev.clientX : ev.clientY) - start) / Math.max(1, total);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === tab.id ? { ...t, sizes: resizeDivider(base, index, delta) } : t)) })));
    };
    const up = () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const canSplit = (activeTab?.panes.length ?? MAX_PANES) < MAX_PANES;
  const panesHint = useMemo(() => (canSplit ? '' : ` (max ${MAX_PANES} panes)`), [canSplit]);
  // A tab's panes share one direction, set by its first split.
  const canRight = canSplitDir(activeTab, 'row');
  const canDown = canSplitDir(activeTab, 'column');
  const axisHint = (dir: SplitDir) => (canSplit && !canSplitDir(activeTab, dir)
    ? ` (this tab already splits ${activeTab?.dir === 'row' ? 'side by side' : 'top to bottom'}; open a new tab to split the other way)`
    : panesHint);

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: height ?? '100%', minHeight: 0, flex: 1, width: '100%', minWidth: 0 }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div role="tablist" aria-label="Terminal sessions" style={{ display: 'flex', alignItems: 'stretch', gap: 2, padding: '2px 4px', flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {layout.tabs.map((t, i) => {
            const active = t.id === layout.activeId;
            const label = labelFor(t, i);
            const editing = editingId === t.id;
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => apply((l) => ({ ...l, activeId: t.id }), true)}
                onDoubleClick={() => { setEditingId(t.id); setEditName(t.name ?? label); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply((l) => ({ ...l, activeId: t.id }), true); }
                  else if (e.key === 'F2') { e.preventDefault(); setEditingId(t.id); setEditName(t.name ?? label); }
                }}
                title={`${label}${t.panes.length > 1 ? ` · ${t.panes.length} panes` : ''} — double-click to rename`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                  color: active ? 'var(--color-text-primary, #e0e0e0)' : 'var(--color-text-tertiary, #8a8a8a)',
                  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                {editing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                      else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); setEditName(''); }
                    }}
                    aria-label={`Rename ${label}`}
                    style={{ width: 96, background: '#141414', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, outline: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, padding: '0 4px' }}
                  />
                ) : (
                  <span style={{ maxWidth: 140, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                )}
                {t.panes.length > 1 && <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>{t.panes.length}</span>}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  aria-label={`Close ${label}`}
                  title="Close tab"
                  className="dex-hover-bg"
                  style={{ ...iconBtn, width: 14, height: 14, padding: 0, borderRadius: 4, color: 'inherit', opacity: 0.7 }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            );
          })}
          <button type="button" onClick={newTab} aria-label="New terminal session" title="New tab (Ctrl+Shift+T)" className="dex-hover-bg" style={{ ...iconBtn, marginLeft: 2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
        <div ref={menuRef} style={{ display: 'flex', gap: 2, padding: '2px 4px', flexShrink: 0, position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Shells and text size" aria-haspopup="menu" aria-expanded={menuOpen} title="Shells and text size" className="dex-hover-bg" style={{ ...iconBtn, background: menuOpen ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {menuOpen && (
            <div role="menu" aria-label="Shells and text size" style={{ position: 'absolute', top: '100%', right: 4, marginTop: 2, zIndex: 20, minWidth: 236, padding: '4px 0', borderRadius: 6, background: '#161617', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 18px rgba(0,0,0,0.5)' }}>
              <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary, #8a8a8a)' }}>New tab with</div>
              {shells.length === 0 && (
                <div style={{ padding: '4px 10px 6px', fontSize: 12, color: 'var(--color-text-secondary, #b8b8bd)' }}>No shells found. New tabs use the system shell.</div>
              )}
              {shells.map((s) => {
                const isDefault = s.path.toLowerCase() === effectiveDefault;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <button type="button" role="menuitem" className="dex-hover-bg" title={s.path} onClick={() => { setMenuOpen(false); openTab(s.path); }} style={{ ...menuRow, flex: 1, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                    </button>
                    {isDefault ? (
                      <span style={{ padding: '0 10px', fontSize: 11, color: 'var(--color-text-tertiary, #8a8a8a)' }}>Default</span>
                    ) : (
                      <button type="button" className="dex-hover-bg" aria-label={`Make ${s.label} the default shell`} title="New tabs start this shell" onClick={() => setSettings((prev) => ({ ...prev, defaultShell: s.default ? null : s.path }))} style={{ ...menuRow, width: 'auto', padding: '5px 10px', fontSize: 11, color: 'var(--color-accent, #0A84FF)' }}>
                        Set default
                      </button>
                    )}
                  </div>
                );
              })}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-primary, #e0e0e0)' }}>
                <span style={{ flex: 1 }}>Text size</span>
                <button type="button" aria-label="Smaller text" title="Smaller (Ctrl+-)" disabled={settings.fontSize <= FONT_MIN} onClick={() => stepFontSize(-1)} style={{ ...stepBtn, opacity: settings.fontSize <= FONT_MIN ? 0.35 : 1 }}>−</button>
                <span aria-live="polite" style={{ minWidth: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{settings.fontSize}</span>
                <button type="button" aria-label="Larger text" title="Larger (Ctrl+=)" disabled={settings.fontSize >= FONT_MAX} onClick={() => stepFontSize(1)} style={{ ...stepBtn, opacity: settings.fontSize >= FONT_MAX ? 0.35 : 1 }}>+</button>
                <button type="button" title="Default size (Ctrl+0)" disabled={settings.fontSize === FONT_DEFAULT} onClick={() => setFontSize(FONT_DEFAULT)} style={{ ...stepBtn, width: 'auto', padding: '0 6px', fontSize: 11, opacity: settings.fontSize === FONT_DEFAULT ? 0.35 : 1 }}>Reset</button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => split('row')} disabled={!canRight} aria-label="Split right" title={`Split right (Ctrl+Shift+D)${axisHint('row')}`} className="dex-hover-bg" style={{ ...iconBtn, opacity: canRight ? 1 : 0.35 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
          </button>
          <button type="button" onClick={() => split('column')} disabled={!canDown} aria-label="Split down" title={`Split down (Ctrl+Shift+E)${axisHint('column')}`} className="dex-hover-bg" style={{ ...iconBtn, opacity: canDown ? 1 : 0.35 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
          </button>
        </div>
      </div>

      {/* Sessions: every pane of every tab stays mounted; only the active tab shows. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {layout.tabs.map((t) => (
          <div key={t.id} style={{ position: 'absolute', inset: 0, display: t.id === layout.activeId ? 'flex' : 'none', flexDirection: t.dir }}>
            {t.panes.map((p, i) => {
              const focused = t.panes.length > 1 && p === t.activePane;
              return (
                <React.Fragment key={p}>
                  {i > 0 && (
                    <div
                      role="separator"
                      aria-orientation={t.dir === 'row' ? 'vertical' : 'horizontal'}
                      aria-label="Resize panes"
                      onPointerDown={(e) => startDrag(e, t, i - 1)}
                      onDoubleClick={() => setLayout((l) => ({ ...l, tabs: l.tabs.map((x) => (x.id === t.id ? { ...x, sizes: x.panes.map(() => 1 / x.panes.length) } : x)) }))}
                      title="Drag to resize · double-click to even out"
                      style={{ flex: '0 0 5px', cursor: t.dir === 'row' ? 'col-resize' : 'row-resize', background: 'rgba(255,255,255,0.06)', touchAction: 'none' }}
                    />
                  )}
                  <div
                    data-term-pane={p}
                    onFocusCapture={() => setLayout((l) => focusPane(l, t.id, p))}
                    onPointerDownCapture={() => setLayout((l) => focusPane(l, t.id, p))}
                    style={{
                      flex: `${t.sizes[i]} 1 0`, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex',
                      // A 1px accent line marks the pane that receives typing.
                      boxShadow: focused ? 'inset 0 1px 0 var(--color-accent, #0A84FF)' : undefined,
                    }}
                  >
                    <Terminal
                      cwd={paneProfiles[p]?.cwd ?? cwd}
                      shell={paneProfiles[p]?.shell}
                      fontSize={settings.fontSize}
                      onClose={() => closePane(t.id, p)}
                      onRunningCommand={(cmd) => setRunning((prev) => (prev[p] === cmd ? prev : { ...prev, [p]: cmd }))}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalTabs;
