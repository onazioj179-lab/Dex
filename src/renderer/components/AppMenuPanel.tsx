// =============================================================================
// DEX Platform — App Menu (launcher panel)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Launchpad + Spotlight: one search pill over a single app grid (pinned
// first, then A-Z, each app once). Typing turns the grid into Spotlight results.
// - Search covers app names, categories and registered quick actions; Enter
//   runs only the highlighted result, never a guess.
// - Recent is this device's own launch history (already kept by the shell);
//   there is no recommendation engine and nothing leaves the machine.
// - Right-click any app for the shared app menu; drag an app onto the Dock
//   to pin it; drag pinned apps (or Alt+←/→) to reorder them.

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DexIcon from './DexIcon';
import { searchApps, type AppSearchHit } from '../services/appRegistry';
import { spotlightEngine, type SpotlightResult } from '../shell/SpotlightEngine';
import { appPinning, useMenuPinnedIds } from '../services/appPinning';
import { openAppContextMenu, runAppAction } from './AppContextMenu';

export const DEX_APP_DRAG_TYPE = 'application/x-dex-app';

export interface MenuApp { id: string; label: string }

export interface AppMenuPanelProps {
  apps: MenuApp[];
  categories: { label: string; apps: MenuApp[] }[];
  currentApp: string;
  runningIds: Set<string>;
  history: string[];
  renderIcon: (id: string, size: number) => React.ReactNode;
  onLaunch: (id: string) => void;
  onClose: () => void;
}


export const AppMenuPanel: React.FC<AppMenuPanelProps> = ({ apps, categories, currentApp, runningIds, history, renderIcon, onLaunch, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const pinnedIds = useMenuPinnedIds();
  const byId = useMemo(() => new Map(apps.map(a => [a.id, a])), [apps]);
  const ids = useMemo(() => apps.map(a => a.id), [apps]);
  const hits = useMemo(() => searchApps(query, ids), [query, ids]);
  const q = query.trim();
  // DEX Search beyond apps: Settings, indexed files, notes, UKI commands --
  // real results from the shared Spotlight index (no AI provider needed).
  // Apps and app actions already come from the registry above.
  const [indexTick, setIndexTick] = useState(0);
  useEffect(() => spotlightEngine.subscribe(() => setIndexTick((t) => t + 1)), []);
  const more = useMemo<SpotlightResult[]>(() => {
    if (!q) return [];
    try {
      // The engine promotes its best hit to category "top", so filter on the
      // id; scores under 30 are loose fuzzy noise ("dark" -> "Password").
      const KEEP = /^(setting-|file-|fs-|note-|cmd-|command-|dexcmd-|codeproject-)/;
      const all = spotlightEngine.search(q);
      const found = all
        .filter(r => r.score >= 30 && (KEEP.test(r.id) || ['settings', 'files', 'notes', 'commands', 'projects'].includes(r.category)))
        .slice(0, 8);
      // "Ask UKI" is always the last row: it only fills UKI's box.
      const ask = all.find(r => r.id.startsWith('uki-ask-'));
      return ask ? [...found, ask] : found;
    } catch { return []; }
    // indexTick: async sources (files, projects) arrived after the keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, indexTick]);
  const total = hits.length + more.length;
  const hasMatches = hits.length > 0 || more.some(result => !result.id.startsWith('uki-ask-'));
  const selected = Math.max(0, Math.min(active, total - 1));

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); }, []);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [q]);
  useEffect(() => {
    if (!q || !total) return;
    document.getElementById(`${resultsId}-${selected}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [q, resultsId, selected, total]);
  const changeQuery = (value: string) => { setActive(0); setQuery(value); };

  const pinned = pinnedIds.map(id => byId.get(id)).filter((a): a is MenuApp => !!a);

  const runAt = (i: number) => {
    if (i < hits.length) { runHit(hits[i]); return; }
    const m = more[i - hits.length];
    if (m) { try { m.action(); } finally { onClose(); } }
  };
  const runHit = (h: AppSearchHit | undefined) => {
    if (!h) return;
    if (h.kind === 'action' && h.actionId) { runAppAction(h.appId, h.actionId); onClose(); }
    else onLaunch(h.appId);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (query) changeQuery(''); else onClose();
    } else if (q && e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.max(0, Math.min(selected + 1, total - 1))); }
    else if (q && e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(selected - 1, 0)); }
    else if (q && e.key === 'PageDown') { e.preventDefault(); setActive(Math.max(0, Math.min(selected + 5, total - 1))); }
    else if (q && e.key === 'PageUp') { e.preventDefault(); setActive(Math.max(selected - 5, 0)); }
    else if (q && e.key === 'Enter') { e.preventDefault(); if (total) rows[selected]?.run(); }
    else if (!q && e.key === 'ArrowDown') { e.preventDefault(); gridRef.current?.querySelector<HTMLButtonElement>('button[data-launchpad-app-id]')?.focus(); }
  };

  // One grid, each app once: pinned apps first (their own order, reorderable),
  // then everything else A-Z. No section headers, no repeats (Launchpad).
  const pinnedSet = new Set(pinned.map(a => a.id));
  const rest = apps.filter(a => !pinnedSet.has(a.id)).sort((x, y) => x.label.localeCompare(y.label));
  const gridApps: Array<{ app: MenuApp; pinnedIndex?: number }> = [
    ...pinned.map((app, i) => ({ app, pinnedIndex: i })),
    ...rest.map(app => ({ app })),
  ];

  const tile = (app: MenuApp, index?: number) => {
    const isPinned = index !== undefined;
    const isActive = currentApp === app.id;
    const isRunning = runningIds.has(app.id);
    return (
      <button
        key={app.id}
        type="button"
        className="dex-lp-tile"
        data-launchpad-app-id={app.id}
        data-section={isPinned ? 'pinned' : 'all'}
        data-current={isActive || undefined}
        data-drop={dragOver === app.id || undefined}
        draggable
        aria-label={`${app.label}${isRunning ? ', running' : ''}`}
        onClick={() => onLaunch(app.id)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openAppContextMenu({ appId: app.id, x: e.clientX, y: e.clientY, source: 'menu' }); }}
        onKeyDown={(e) => {
          if ((e.key === 'ContextMenu') || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openAppContextMenu({ appId: app.id, x: r.left + 8, y: r.bottom, source: 'menu' });
          }
          if (isPinned && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault(); e.stopPropagation();
            const to = index + (e.key === 'ArrowLeft' ? -1 : 1);
            if (to >= 0 && to < pinned.length) {
              const list = appPinning.menuIds();
              const target = pinned[to].id;
              // Moving right lands after the neighbour: place before the one after it.
              appPinning.place('menu', app.id, e.key === 'ArrowLeft' ? target : (list[list.indexOf(target) + 1] ?? null));
              requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`button[data-section="pinned"][data-launchpad-app-id="${app.id}"]`)?.focus());
            }
          }
        }}
        onDragStart={(e) => { e.dataTransfer.setData(DEX_APP_DRAG_TYPE, app.id); e.dataTransfer.setData('text/plain', app.label); e.dataTransfer.effectAllowed = 'copyMove'; }}
        onDragOver={(e) => { if (isPinned && e.dataTransfer.types.includes(DEX_APP_DRAG_TYPE)) { e.preventDefault(); setDragOver(app.id); } }}
        onDragLeave={() => setDragOver(d => (d === app.id ? null : d))}
        onDrop={(e) => {
          if (!isPinned) return;
          e.preventDefault();
          setDragOver(null);
          const dragged = e.dataTransfer.getData(DEX_APP_DRAG_TYPE);
          if (!dragged || dragged === app.id) return;
          appPinning.place('menu', dragged, app.id);
        }}
      >
        <span className="dex-lp-icon">{renderIcon(app.id, 26)}</span>
        <span className="dex-lp-label">{app.label}</span>
        <span className="dex-lp-dot" aria-hidden="true" data-on={isRunning || undefined} />
      </button>
    );
  };

  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-launchpad-app-id]'));
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0 || !btns.length) return;
    const firstTop = btns[0].offsetTop;
    const cols = Math.max(1, btns.filter(b => b.offsetTop === firstTop).length);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % btns.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + btns.length) % btns.length;
    else if (e.key === 'ArrowDown') next = Math.min(idx + cols, btns.length - 1);
    else if (e.key === 'ArrowUp') {
      if (idx < cols) { e.preventDefault(); inputRef.current?.focus(); return; }
      next = Math.max(idx - cols, 0);
    }
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) { inputRef.current?.focus(); return; }
    else return;
    e.preventDefault();
    btns[next]?.focus();
  };

  // Spotlight-style results: a Top Hit, then small group labels.
  type Row = { key: string; i: number; title: string; sub: string; icon: React.ReactNode; group: string; run: () => void; context?: (e: React.MouseEvent) => void };
  const ranked: Row[] = [
    ...hits.map((h, i): Row => ({
      key: `${h.kind}:${h.appId}:${h.actionId ?? ''}`, i,
      title: h.label,
      sub: h.kind === 'action' ? h.detail || '' : (runningIds.has(h.appId) ? 'Running' : h.detail || ''),
      icon: h.kind === 'app' ? renderIcon(h.appId, 18) : <DexIcon name={h.icon} size={16} color="currentColor" />,
      group: h.kind === 'action' ? 'Actions' : 'Applications',
      run: () => runHit(h),
      context: (e) => { e.preventDefault(); openAppContextMenu({ appId: h.appId, x: e.clientX, y: e.clientY, source: 'search' }); },
    })),
    ...more.map((m, k): Row => {
      const group = m.category === 'settings' || m.id.startsWith('setting-') ? 'Settings'
        : m.id.startsWith('codeproject-') || m.category === 'projects' ? 'Projects'
        : m.id.startsWith('uki-ask-') ? 'UKI'
        : m.category === 'files' || /^(file-|fs-)/.test(m.id) ? 'Files'
        : m.category === 'notes' || m.id.startsWith('note-') ? 'Notes' : 'Commands';
      return { key: m.id, i: hits.length + k, title: m.title, sub: m.subtitle || '', icon: <DexIcon name={m.icon || 'search'} size={16} color="currentColor" />, group, run: () => runAt(hits.length + k) };
    }),
  ];
  // Best match first (Top Hit), then the rest grouped by kind in the order the
  // groups first appear; the keyboard index follows this visual order.
  const rows: Row[] = (() => {
    if (!ranked.length) return ranked;
    const [top, ...others] = ranked;
    const order: string[] = [];
    for (const r of others) if (!order.includes(r.group)) order.push(r.group);
    return [top, ...order.flatMap(g => others.filter(r => r.group === g))].map((r, n) => ({ ...r, i: n }));
  })();

  return (
    <>
      <style>{LAUNCHPAD_CSS}</style>
      <div className="dex-lp-search">
        <DexIcon name="search" size={17} color="currentColor" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={!!q}
          aria-controls={q ? resultsId : undefined}
          aria-activedescendant={q && total ? `${resultsId}-${selected}` : undefined}
          aria-autocomplete="list"
          aria-label="Search apps and actions"
          placeholder="Search apps, files, notes and settings"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={onSearchKey}
          autoComplete="off"
          spellCheck={false}
        />
        {/* Always laid out (hidden when empty) so the field never resizes as you type. */}
        <button type="button" className="dex-lp-clear" aria-label="Clear search" tabIndex={query ? 0 : -1} aria-hidden={!query || undefined}
          style={{ visibility: query ? 'visible' : 'hidden' }} onClick={() => { changeQuery(''); inputRef.current?.focus(); }}>
          <DexIcon name="close" size={11} color="currentColor" />
        </button>
      </div>
      <div ref={scrollRef} className="dex-lp-scroll">
      {q ? (
        <div id={resultsId} role="listbox" aria-label="Results" className="dex-lp-results">
          {!hasMatches && (
            <div role="status" className="dex-lp-empty">Nothing matches &ldquo;{q}&rdquo;</div>
          )}
          {rows.map((r, n) => {
            const top = n === 0 && hasMatches;
            // A label above the first row of each group (the Top Hit has its own).
            const showGroup = !top && (n === 0 || n === 1 || rows[n - 1].group !== r.group);
            return (
              <React.Fragment key={r.key}>
                {top && <div role="presentation" className="dex-lp-group">Top Hit</div>}
                {showGroup && <div role="presentation" className="dex-lp-group">{r.group}</div>}
                <div
                  id={`${resultsId}-${r.i}`}
                  role="option"
                  aria-selected={r.i === selected}
                  className={top ? 'dex-lp-row dex-lp-row-top' : 'dex-lp-row'}
                  onMouseMove={() => setActive(r.i)}
                  onClick={r.run}
                  onContextMenu={r.context}
                >
                  <span className="dex-lp-row-icon">{r.icon}</span>
                  <span className="dex-lp-row-text">
                    <span className="dex-lp-row-title">{r.title}</span>
                    {r.sub && <span className="dex-lp-row-sub">{r.sub}</span>}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div ref={gridRef} className="dex-lp-grid" aria-label="Applications" data-launchpad-grid="" onKeyDown={onGridKey}>
          {gridApps.map(({ app, pinnedIndex }) => tile(app, pinnedIndex))}
        </div>
      )}
      </div>
    </>
  );
};

// Launchpad + Spotlight, one surface. Scoped to .dex-lp-* (apps stay mounted;
// nothing here may restyle other UI). Colours are theme tokens only.
const LAUNCHPAD_CSS = `
.dex-lp-search {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
  height: 44px; padding: 0 8px 0 16px; margin-bottom: 18px; border-radius: 9999px;
  background: color-mix(in srgb, var(--color-text-primary) 6%, transparent);
  color: var(--color-text-tertiary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text-primary) 6%, transparent);
  transition: box-shadow 150ms var(--ease-out);
}
.dex-lp-search:focus-within { background: color-mix(in srgb, var(--color-text-primary) 9%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text-primary) 16%, transparent); }
.dex-lp-search input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent;
  font: inherit; font-size: 15px; letter-spacing: -0.01em; color: var(--color-text-primary);
}
.dex-lp-search input::placeholder { color: var(--color-text-tertiary); }
.dex-lp-clear {
  width: 22px; height: 22px; border-radius: 9999px; border: 0; display: grid; place-items: center; cursor: pointer;
  background: color-mix(in srgb, var(--color-text-primary) 14%, transparent); color: var(--color-text-primary);
}
.dex-lp-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin: 0 -8px; padding: 0 8px; }
.dex-lp-scroll::-webkit-scrollbar { width: 6px; }
.dex-lp-scroll::-webkit-scrollbar-button { display: none; height: 0; }
.dex-lp-scroll::-webkit-scrollbar-thumb { border-radius: 9999px; background: color-mix(in srgb, var(--color-text-primary) 18%, transparent); }
.dex-lp-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: 14px; column-gap: 4px; padding-bottom: 8px; }
.dex-lp-tile {
  display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0;
  padding: 6px 2px 2px; border: 0; border-radius: 14px; background: transparent; box-shadow: none;
  color: var(--color-text-primary); cursor: pointer;
}
.dex-lp-icon {
  width: 56px; height: 56px; border-radius: 14px; display: grid; place-items: center; overflow: hidden;
  background: color-mix(in srgb, var(--color-text-primary) 6%, transparent);
  color: var(--color-text-primary);
  transition: transform 160ms var(--ease-spring), background-color 120ms var(--ease-out);
}
.dex-lp-tile:hover .dex-lp-icon { background: color-mix(in srgb, var(--color-text-primary) 11%, transparent); }
.dex-lp-tile:active .dex-lp-icon { transform: scale(0.97); }
.dex-lp-tile[data-current] .dex-lp-icon { background: color-mix(in srgb, var(--color-text-primary) 10%, transparent); }
.dex-lp-tile[data-drop] .dex-lp-icon { box-shadow: 0 0 0 2px var(--color-accent); }
.dex-lp-label {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11.5px; line-height: 1.2; letter-spacing: -0.005em; color: var(--color-text-primary);
}
.dex-lp-dot { width: 4px; height: 4px; margin-top: -3px; border-radius: 9999px; background: transparent; }
.dex-lp-dot[data-on] { background: var(--color-text-secondary); }
.dex-lp-results { display: flex; flex-direction: column; gap: 1px; padding-bottom: 8px; }
.dex-lp-group { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; color: var(--color-text-tertiary); }
.dex-lp-group:first-child { padding-top: 0; }
.dex-lp-row { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 10px; border-radius: 10px; cursor: default; color: var(--color-text-primary); }
.dex-lp-row-top { min-height: 52px; }
.dex-lp-row-icon {
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; display: grid; place-items: center; overflow: hidden;
  background: color-mix(in srgb, var(--color-text-primary) 7%, transparent); color: var(--color-text-primary);
}
.dex-lp-row-top .dex-lp-row-icon { width: 36px; height: 36px; border-radius: 10px; }
.dex-lp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dex-lp-row-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dex-lp-row-top .dex-lp-row-title { font-size: 14px; font-weight: 600; }
.dex-lp-row-sub { font-size: 11px; color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dex-lp-row[aria-selected="true"] { background: var(--color-accent-fill); color: var(--color-accent-text); }
.dex-lp-row[aria-selected="true"] .dex-lp-row-sub { color: color-mix(in srgb, var(--color-accent-text) 82%, transparent); }
.dex-lp-row[aria-selected="true"] .dex-lp-row-icon { background: color-mix(in srgb, var(--color-accent-text) 20%, transparent); color: var(--color-accent-text); }
.dex-lp-empty { padding: 28px 0; text-align: center; font-size: 13px; color: var(--color-text-tertiary); overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .dex-lp-icon { transition: none; } .dex-lp-tile:active .dex-lp-icon { transform: none; } }
`;
