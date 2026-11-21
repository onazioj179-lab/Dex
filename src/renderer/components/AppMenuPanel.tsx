// =============================================================================
// DEX Platform — App Menu (launcher panel)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Sections: Search · Pinned · Recent · All Apps (by category).
// - Search covers app names, categories and registered quick actions; Enter
//   runs only the highlighted result, never a guess.
// - Recent is this device's own launch history (already kept by the shell);
//   there is no recommendation engine and nothing leaves the machine.
// - Right-click any app for the shared app menu; drag an app onto the Dock
//   to pin it; drag pinned apps (or Alt+←/→) to reorder them.

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DexIcon from './DexIcon';
import { DexSearchInput } from '../styles/components';
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

const header: React.CSSProperties = {
  gridColumn: '1 / -1', fontSize: 10, fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none',
  color: 'var(--color-text-tertiary)', padding: 'var(--space-2) 4px 2px', display: 'flex', alignItems: 'center', gap: 6,
};

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
  const recent = history.filter(id => id !== 'home' && !pinnedIds.includes(id)).map(id => byId.get(id)).filter((a): a is MenuApp => !!a).slice(0, 6);

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
    else if (q && e.key === 'Enter') { e.preventDefault(); if (total) runAt(selected); }
    else if (!q && e.key === 'ArrowDown') { e.preventDefault(); gridRef.current?.querySelector<HTMLButtonElement>('button[data-launchpad-app-id]')?.focus(); }
  };

  const tile = (app: MenuApp, section: 'pinned' | 'recent' | 'all', index?: number) => {
    const isActive = currentApp === app.id;
    const isRunning = runningIds.has(app.id);
    return (
      <button
        key={`${section}:${app.id}`}
        type="button"
        data-launchpad-app-id={app.id}
        data-section={section}
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
          if (section === 'pinned' && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && index !== undefined) {
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
        onDragOver={(e) => { if (section === 'pinned' && e.dataTransfer.types.includes(DEX_APP_DRAG_TYPE)) { e.preventDefault(); setDragOver(app.id); } }}
        onDragLeave={() => setDragOver(d => (d === app.id ? null : d))}
        onDrop={(e) => {
          if (section !== 'pinned') return;
          e.preventDefault();
          setDragOver(null);
          const dragged = e.dataTransfer.getData(DEX_APP_DRAG_TYPE);
          if (!dragged || dragged === app.id) return;
          appPinning.place('menu', dragged, app.id);
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--color-bg-hover)' : 'transparent'; }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: '8px 4px', borderRadius: 10, width: '100%',
          background: isActive ? 'var(--color-bg-hover)' : 'transparent',
          border: 'none', cursor: 'pointer', transition: 'background 0.12s ease',
          boxShadow: dragOver === app.id ? 'inset 2px 0 0 var(--color-accent)' : 'none',
        }}
      >
        <div style={{
          color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, borderRadius: 10,
          background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
          overflow: 'hidden',
        }}>
          {renderIcon(app.id, 22)}
        </div>
        <span style={{ fontSize: 10, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: isActive ? 600 : 400, textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.01em', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.label}</span>
        <div aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: isRunning ? 'var(--color-text-secondary)' : 'transparent', marginTop: -3 }} />
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

  return (
    <>
      <div style={{ flex: '0 0 auto', paddingBottom: 'var(--space-3)' }}>
        <DexSearchInput
          ref={inputRef}
          size="lg"
          fullWidth
          reserveClearSpace
          role="combobox"
          aria-expanded={!!q}
          aria-controls={q ? resultsId : undefined}
          aria-activedescendant={q && total ? `${resultsId}-${selected}` : undefined}
          aria-autocomplete="list"
          aria-label="Search apps and actions"
          placeholder="Search apps, files, notes, and settings"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={onSearchKey}
          onClear={() => { changeQuery(''); inputRef.current?.focus(); }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div ref={scrollRef} className="spotlight-results-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
      {q ? (
        <div id={resultsId} role="listbox" aria-label="Results">
          {!hasMatches && (
            <div role="status" style={{ color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center', padding: 'var(--space-5) 0', overflowWrap: 'anywhere' }}>Nothing matches &ldquo;{q}&rdquo;</div>
          )}
          {hits.map((h, i) => (
            <div
              key={`${h.kind}:${h.appId}:${h.actionId ?? ''}`}
              id={`${resultsId}-${i}`}
              role="option"
              aria-selected={i === selected}
              onMouseMove={() => setActive(i)}
              onClick={() => runHit(h)}
              onContextMenu={e => { e.preventDefault(); openAppContextMenu({ appId: h.appId, x: e.clientX, y: e.clientY, source: 'search' }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, cursor: 'pointer',
                background: i === selected ? 'var(--color-bg-active)' : 'transparent',
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)', color: 'var(--color-text-primary)', overflow: 'hidden' }}>
                {h.kind === 'app' ? renderIcon(h.appId, 16) : <DexIcon name={h.icon} size={14} color="currentColor" />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{h.kind === 'action' ? `Action · ${h.detail}` : h.detail || 'App'}</span>
              </span>
              {runningIds.has(h.appId) && h.kind === 'app' && <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>Running</span>}
            </div>
          ))}
          {more.map((m, k) => {
            const i = hits.length + k;
            const kind = m.category === 'settings' || m.id.startsWith('setting-') ? 'Setting'
              : m.id.startsWith('codeproject-') || m.category === 'projects' ? 'Project'
              : m.id.startsWith('uki-ask-') ? 'UKI'
              : m.category === 'files' || /^(file-|fs-)/.test(m.id) ? 'File'
              : m.category === 'notes' || m.id.startsWith('note-') ? 'Note' : 'Command';
            return (
              <div
                key={m.id}
                id={`${resultsId}-${i}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setActive(i)}
                onClick={() => runAt(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, cursor: 'pointer', background: i === selected ? 'var(--color-bg-active)' : 'transparent' }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)', color: 'var(--color-text-primary)' }}>
                  <DexIcon name={m.icon || 'search'} size={14} color="currentColor" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kind}{m.subtitle ? ` · ${m.subtitle}` : ''}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', columnGap: 2, rowGap: 4 }} aria-label="Applications" data-launchpad-grid="" onKeyDown={onGridKey}>
          <div role="presentation" style={header}>Pinned</div>
          {pinned.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 4px 8px' }}>Right-click an app and choose Pin to App Menu.</div>
          )}
          {pinned.map((a, i) => tile(a, 'pinned', i))}
          {recent.length > 0 && <div role="presentation" style={header}>Recent</div>}
          {recent.map(a => tile(a, 'recent'))}
          <div role="presentation" style={header}>All apps</div>
          {categories.map(cat => (
            <React.Fragment key={cat.label}>
              <div role="presentation" style={{ ...header, fontSize: 10, letterSpacing: '0.01em', textTransform: 'none', fontWeight: 500, padding: '6px 4px 0' }}>{cat.label}</div>
              {cat.apps.map(a => tile(a, 'all'))}
            </React.Fragment>
          ))}
        </div>
      )}
      </div>
    </>
  );
};
