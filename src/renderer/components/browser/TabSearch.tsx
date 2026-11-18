// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Browser › Search tabs (Ctrl+Shift+A). Finds a tab by title or address in
// sessions of any size (renders at most 200 matches), shows which tabs sleep.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOverlay } from '../../services/overlayStack';

export interface TabSearchItem { id: string; title: string; url: string; pinned?: boolean; sleeping?: boolean; active?: boolean }

const MAX_ROWS = 200;

export function filterTabs(tabs: TabSearchItem[], query: string): TabSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs.slice(0, MAX_ROWS);
  const words = q.split(/\s+/);
  const out: TabSearchItem[] = [];
  for (const t of tabs) {
    const hay = `${t.title} ${t.url}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) { out.push(t); if (out.length >= MAX_ROWS) break; }
  }
  return out;
}

export const TabSearch: React.FC<{ tabs: TabSearchItem[]; onPick: (id: string) => void; onClose: () => void }> = ({ tabs, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const { zIndex } = useOverlay(true, onClose, { ref: panelRef });
  const results = useMemo(() => filterTabs(tabs, q), [tabs, q]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-row="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Search tabs"
      className="dex-mat-frosted"
      style={{
        position: 'absolute', top: 44, right: 12, width: 'min(420px, calc(100% - 24px))', maxHeight: 420, zIndex: Math.max(zIndex, 200),
        display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      }}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); onPick(results[sel].id); onClose(); }
        }}
        placeholder={`Search ${tabs.length} tab${tabs.length === 1 ? '' : 's'}`}
        aria-label="Search tabs"
        aria-controls="dex-tab-search-list"
        aria-activedescendant={results[sel] ? `dex-tab-search-${results[sel].id}` : undefined}
        style={{ margin: 10, height: 34, borderRadius: 9999, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', padding: '0 14px', fontSize: 13, outline: 'none' }}
      />
      <div id="dex-tab-search-list" role="listbox" aria-label="Tabs" style={{ overflowY: 'auto', padding: '0 6px 6px' }}>
        {results.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No tab matches.</div>}
        {results.map((t, i) => (
          <div
            key={t.id}
            id={`dex-tab-search-${t.id}`}
            data-row={i}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
            onClick={() => { onPick(t.id); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: i === sel ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: t.sleeping ? 0.6 : 1 }}>{t.title || 'New Tab'}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.url || '—'}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
              {t.active ? 'Open' : t.sleeping ? 'Sleeping' : t.pinned ? 'Pinned' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabSearch;
