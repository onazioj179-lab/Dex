// =============================================================================
// DEX Platform — App Menu (launcher panel)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
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
  currentApp: string;
  runningIds: Set<string>;
  renderIcon: (id: string, size: number) => React.ReactNode;
  onLaunch: (id: string) => void;
  onClose: () => void;
}


const INDEXED_RESULT_ID = /^(setting-|file-|fs-|note-|cmd-|command-|dexcmd-|codeproject-)/;
const INDEXED_CATEGORIES = new Set(['settings', 'files', 'notes', 'commands', 'projects']);

function titleMatch(title: string, query: string): number {
  const text = title.toLowerCase();
  if (text === query) return 3;
  if (text.startsWith(query)) return 2;
  return text.includes(query) ? 1 : 0;
}

export const AppMenuPanel: React.FC<AppMenuPanelProps> = ({ apps, currentApp, runningIds, renderIcon, onLaunch, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
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
      // Keep original categories so promoted results still report their source.
      return spotlightEngine.search(q, { markTop: false })
        .filter(r => r.score >= 30 && (INDEXED_RESULT_ID.test(r.id) || INDEXED_CATEGORIES.has(r.category)))
        .slice(0, 12);
    } catch { return []; }
    // indexTick: async sources (files, projects) arrived after the keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, indexTick]);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected &&
          (document.activeElement === document.body || document.activeElement === input)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [q]);
  const changeQuery = (value: string) => { setActiveKey(null); setQuery(value); };

  const pinned = pinnedIds.map(id => byId.get(id)).filter((a): a is MenuApp => !!a);

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
    } else if (q && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
      e.preventDefault();
      const step = e.key.startsWith('Page') ? 5 : 1;
      const direction = e.key.endsWith('Down') ? 1 : -1;
      const next = Math.max(0, Math.min(selected + step * direction, rows.length - 1));
      setActiveKey(rows[next]?.key ?? null);
    } else if (q && e.key === 'Enter') { e.preventDefault(); rows[selected]?.run(); }
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
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      changeQuery(e.key);
      inputRef.current?.focus();
      return;
    }
    else return;
    e.preventDefault();
    btns[next]?.focus();
  };

  type Row = { key: string; title: string; sub: string; icon: React.ReactNode; kind: string; score: number; run: () => void; context?: (e: React.MouseEvent) => void };
  const ranked: Row[] = [
    ...hits.map((h): Row => ({
      key: `${h.kind}:${h.appId}:${h.actionId ?? ''}`,
      title: h.label,
      sub: h.kind === 'action' ? h.detail : (runningIds.has(h.appId) ? 'Running' : ''),
      icon: h.kind === 'app' ? renderIcon(h.appId, 18) : <DexIcon name={h.icon} size={16} color="currentColor" />,
      kind: h.kind === 'action' ? 'Action' : 'App',
      score: h.score,
      run: () => runHit(h),
      context: (e) => { e.preventDefault(); openAppContextMenu({ appId: h.appId, x: e.clientX, y: e.clientY, source: 'search' }); },
    })),
    ...more.map((m): Row => {
      const kind = m.category === 'settings' || m.id.startsWith('setting-') ? 'Setting'
        : m.id.startsWith('codeproject-') || m.category === 'projects' ? 'Project'
        : m.category === 'files' || /^(file-|fs-)/.test(m.id) ? 'File'
        : m.category === 'notes' || m.id.startsWith('note-') ? 'Note' : 'Command';
      return {
        key: m.id, title: m.title, sub: m.subtitle || '',
        icon: <DexIcon name={m.icon || 'search'} size={16} color="currentColor" />,
        // Spotlight's title and usage bonuses use a wider scale than the app registry.
        kind, score: Math.min(100, m.score / 1.8),
        run: () => { try { m.action(); } finally { onClose(); } },
      };
    }),
  ];
  const normalizedQuery = q.toLowerCase();
  const rows = ranked.sort((a, b) => titleMatch(b.title, normalizedQuery) - titleMatch(a.title, normalizedQuery) || b.score - a.score);
  const selected = Math.max(0, rows.findIndex(row => row.key === activeKey));
  const activeId = rows.length ? `${resultsId}-${selected}` : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [q, activeId, rows[selected]?.key]);

  return (
    <>
      <style>{LAUNCHPAD_CSS}</style>
      <div className="dex-lp-search">
        <DexIcon name="search" size={17} color="currentColor" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={!!activeId}
          aria-controls={activeId ? resultsId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Search apps and actions"
          placeholder="Search"
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
      {q ? (rows.length ? (
        <div id={resultsId} role="listbox" aria-label="Search results" className="dex-lp-results">
          {rows.map((r, index) => (
                <div key={r.key}
                  id={`${resultsId}-${index}`}
                  role="option"
                  aria-selected={index === selected}
                  className="dex-lp-row"
                  onMouseDown={event => event.preventDefault()}
                  onClick={r.run}
                  onContextMenu={r.context}
                >
                  <span className="dex-lp-row-icon">{r.icon}</span>
                  <span className="dex-lp-row-text">
                    <span className="dex-lp-row-title" title={r.title}>{r.title}</span>
                    {r.sub && <span className="dex-lp-row-sub" title={r.sub}>{r.sub}</span>}
                  </span>
                  <span className="dex-lp-row-kind">{r.kind}</span>
                </div>
          ))}
        </div>
      ) : <div role="status" className="dex-lp-empty">No results</div>) : (
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
  border: 1px solid var(--color-border);
  transition: border-color 150ms var(--ease-out);
}
.dex-lp-search:focus-within { border-color: var(--color-border-strong); }
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
.dex-lp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 84px), 1fr)); row-gap: 14px; column-gap: 4px; padding-bottom: 8px; }
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
.dex-lp-results { display: grid; gap: 2px; padding-bottom: 8px; }
.dex-lp-row { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 12px; border-radius: 9px; cursor: pointer; color: var(--color-text-primary); }
.dex-lp-row:hover { background: var(--color-bg-hover); }
.dex-lp-row-icon {
  width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; display: grid; place-items: center; overflow: hidden;
  background: var(--color-bg-active); color: var(--color-text-primary);
}
.dex-lp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dex-lp-row-title { font-size: 14px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dex-lp-row-sub { font-size: 12px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dex-lp-row-kind { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; }
.dex-lp-row[aria-selected="true"] { background: var(--color-bg-active); }
.dex-lp-empty { padding: 22px 12px; text-align: center; font-size: 13px; color: var(--color-text-secondary); }
@media (prefers-reduced-motion: reduce) { .dex-lp-icon { transition: none; } .dex-lp-tile:active .dex-lp-icon { transform: none; } }
`;
