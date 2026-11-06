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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from './DexIcon';
import { searchApps, type AppSearchHit } from '../services/appRegistry';
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
  gridColumn: '1 / -1', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)', padding: 'var(--space-2) 4px 2px', display: 'flex', alignItems: 'center', gap: 6,
};

export const AppMenuPanel: React.FC<AppMenuPanelProps> = ({ apps, categories, currentApp, runningIds, history, renderIcon, onLaunch, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pinnedIds = useMenuPinnedIds();
  const byId = useMemo(() => new Map(apps.map(a => [a.id, a])), [apps]);
  const ids = useMemo(() => apps.map(a => a.id), [apps]);
  const hits = useMemo(() => searchApps(query, ids), [query, ids]);
  const q = query.trim();

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); }, []);
  useEffect(() => { setActive(0); }, [query]);

  const pinned = pinnedIds.map(id => byId.get(id)).filter((a): a is MenuApp => !!a);
  const recent = history.filter(id => id !== 'home' && !pinnedIds.includes(id)).map(id => byId.get(id)).filter((a): a is MenuApp => !!a).slice(0, 6);

  const runHit = (h: AppSearchHit | undefined) => {
    if (!h) return;
    if (h.kind === 'action' && h.actionId) { runAppAction(h.appId, h.actionId); onClose(); }
    else onLaunch(h.appId);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (query) setQuery(''); else onClose();
    } else if (q && e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
    else if (q && e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (q && e.key === 'Enter') { e.preventDefault(); runHit(hits[active]); }
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
          boxShadow: isActive ? '0 0 0 1.5px var(--color-accent)' : 'none', overflow: 'hidden',
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
      <div style={{ position: 'relative', marginBottom: 'var(--space-2)' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
          <DexIcon name="search" size={14} color="currentColor" />
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={!!q}
          aria-controls="dex-app-menu-results"
          aria-activedescendant={q && hits[active] ? `dex-app-hit-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Search apps and actions"
          placeholder="Search apps and actions"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          style={{
            width: '100%', boxSizing: 'border-box', height: 34, padding: '0 32px 0 32px', borderRadius: 10,
            border: '1px solid var(--color-border)', background: 'var(--color-bg-inset, rgba(0,0,0,0.25))',
            color: 'var(--color-text-primary)', fontSize: 13, outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DexIcon name="close" size={12} color="currentColor" />
          </button>
        )}
      </div>

      {q ? (
        <div id="dex-app-menu-results" role="listbox" aria-label="Results">
          {hits.length === 0 && (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center', padding: 'var(--space-5) 0' }}>No apps or actions match &ldquo;{q}&rdquo;</div>
          )}
          {hits.map((h, i) => (
            <div
              key={`${h.kind}:${h.appId}:${h.actionId ?? ''}`}
              id={`dex-app-hit-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => runHit(h)}
              onContextMenu={e => { e.preventDefault(); openAppContextMenu({ appId: h.appId, x: e.clientX, y: e.clientY, source: 'search' }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, cursor: 'pointer',
                background: i === active ? 'var(--color-accent-light, rgba(10,132,255,0.14))' : 'transparent',
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
              {i === active && <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0 4px' }}>Enter</span>}
            </div>
          ))}
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
              <div role="presentation" style={{ ...header, fontSize: 10, letterSpacing: '0.04em', textTransform: 'none', fontWeight: 500, padding: '6px 4px 0' }}>{cat.label}</div>
              {cat.apps.map(a => tile(a, 'all'))}
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))', fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>Right-click an app for options</span>
        <span>Drag an app to the Dock to pin it</span>
      </div>
    </>
  );
};
