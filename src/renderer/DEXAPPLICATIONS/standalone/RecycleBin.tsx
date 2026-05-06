// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Recycle Bin (Trash)
 * Grouped view by app, restore / permanent delete / empty all.
 * 30-day countdown badges, search, storage info.
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';

// ── IPC helper ─────────────────────────────────────────────────
async function ipc(channel: string, ...args: any[]): Promise<any> {
  try {
    if ((window as any).dex?.invoke) return await (window as any).dex.invoke(channel, ...args);
    return null;
  } catch (err) {
    console.warn(`[RecycleBin] IPC ${channel} failed:`, err);
    return null;
  }
}

interface RecycleBinItem {
  id: number;
  app: string;
  item_type: string;
  item_name: string;
  item_data: string;
  original_location: string;
  deleted_at: number;
  expires_at: number;
}

interface GroupedItems {
  app: string;
  count: number;
  items: RecycleBinItem[];
}

// ── Helpers ────────────────────────────────────────────────────
const APP_LABELS: Record<string, string> = {
  notes: 'Notes', files: 'Files', tasks: 'Tasks', kanban: 'Kanban',
  calendar: 'Calendar', workflows: 'Workflows', gallery: 'Gallery',
  audio: 'Audio', browser: 'Browser',
};
const appLabel = (app: string) => APP_LABELS[app] || app.charAt(0).toUpperCase() + app.slice(1);

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000));
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanSize(json: string): string {
  const bytes = new Blob([json]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ── Styles ─────────────────────────────────────────────────────
const rootStyle: React.CSSProperties = {
  height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg-base, #0a0a0f)',
  color: 'var(--color-text-primary, #e5e5ea)',
  overflow: 'hidden',
};
const headerStyle: React.CSSProperties = {
  padding: '20px 24px 14px', flexShrink: 0,
  background: 'var(--color-bg-surface-solid, #1C1C1E)',
  borderBottom: '1px solid var(--color-border-subtle)',
};
const searchInput: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)',
  color: '#e5e5ea', fontSize: 13, outline: 'none',
};
const listArea: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '12px 20px 20px',
};
const groupHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)', padding: '14px 0 6px',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
  borderRadius: 8, cursor: 'default', transition: 'background 0.15s',
};
const btnSmall: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s',
};
const emptyState: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  flex: 1, gap: 12, opacity: 0.5,
};

// ── Row component ──────────────────────────────────────────────
const ItemRow = memo(({ item, onRestore, onDelete }: {
  item: RecycleBinItem;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}) => {
  const [hover, setHover] = useState(false);
  const days = daysLeft(item.expires_at);
  const badgeColor = days <= 3 ? 'var(--color-error)' : days <= 7 ? 'var(--color-warning)' : 'var(--color-border)';

  return (
    <div
      style={{ ...rowStyle, background: hover ? 'var(--color-bg-hover)' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Badge */}
      <span style={{
        display: 'inline-block', minWidth: 38, textAlign: 'center',
        padding: '2px 6px', borderRadius: 6,
        background: badgeColor, fontSize: 11, fontWeight: 700,
        color: days <= 7 ? '#fff' : 'var(--color-text-secondary)',
      }}>
        {days}d
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.item_name || 'Untitled'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
          {item.item_type} &middot; {formatDate(item.deleted_at)} &middot; {humanSize(item.item_data)}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      {hover && (
        <>
          <button
            style={{ ...btnSmall, background: 'rgba(48,209,88,0.18)', color: 'var(--color-success)' }}
            onClick={() => onRestore(item.id)}
          >Restore</button>
          <button
            style={{ ...btnSmall, background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)' }}
            onClick={() => onDelete(item.id)}
          >Delete</button>
        </>
      )}
    </div>
  );
});

// ── Main component ─────────────────────────────────────────────
const RecycleBin: React.FC = () => {
  const [groups, setGroups] = useState<GroupedItems[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [appFilter, setAppFilter] = useState<string | null>(null);

  // Load items
  const reload = useCallback(async () => {
    setLoading(true);
    const [grouped, count] = await Promise.all([
      ipc('recycle-bin:getGrouped') as Promise<GroupedItems[] | null>,
      ipc('recycle-bin:getCount') as Promise<number | null>,
    ]);
    setGroups(grouped || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Listen for count broadcasts from main
  useEffect(() => {
    const handler = (_e: any, count: number) => { setTotalCount(count); reload(); };
    const api = (window as any).dex;
    if (api?.on) api.on('recycle-bin:count', handler);
    return () => { if (api?.off) api.off('recycle-bin:count', handler); };
  }, [reload]);

  // Actions
  const handleRestore = useCallback(async (id: number) => {
    await ipc('recycle-bin:restore', id);
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id: number) => {
    await ipc('recycle-bin:permanentlyDelete', id);
    reload();
  }, [reload]);

  const handleEmptyAll = useCallback(async () => {
    await ipc('recycle-bin:emptyAll');
    setConfirmEmpty(false);
    reload();
  }, [reload]);

  // Filtered + searched
  const visibleGroups = useMemo(() => {
    let g = groups;
    if (appFilter) g = g.filter(gr => gr.app === appFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      g = g.map(gr => ({
        ...gr,
        items: gr.items.filter(i =>
          i.item_name.toLowerCase().includes(q) ||
          i.item_type.toLowerCase().includes(q)
        ),
        count: 0, // recalculated below
      })).filter(gr => gr.items.length > 0).map(gr => ({ ...gr, count: gr.items.length }));
    }
    return g;
  }, [groups, appFilter, search]);

  const totalVisible = visibleGroups.reduce((s, g) => s + g.items.length, 0);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={rootStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Trash</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {totalCount} {totalCount === 1 ? 'item' : 'items'} &middot; auto-deleted after 30 days
            </div>
          </div>
          {totalCount > 0 && (
            confirmEmpty ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  style={{ ...btnSmall, background: 'rgba(255,69,58,0.2)', color: 'var(--color-error)' }}
                  onClick={handleEmptyAll}
                >Confirm Empty</button>
                <button
                  style={{ ...btnSmall, background: 'var(--color-border-subtle)', color: '#e5e5ea' }}
                  onClick={() => setConfirmEmpty(false)}
                >Cancel</button>
              </div>
            ) : (
              <button
                style={{ ...btnSmall, background: 'rgba(255,69,58,0.12)', color: 'var(--color-error)' }}
                onClick={() => setConfirmEmpty(true)}
              >Empty Trash</button>
            )
          )}
        </div>

        {/* App filter pills */}
        {groups.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setAppFilter(null)}
              style={{
                ...btnSmall,
                background: !appFilter ? 'rgba(10,132,255,0.25)' : 'var(--color-bg-hover)',
                color: !appFilter ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >All</button>
            {groups.map(g => (
              <button
                key={g.app}
                onClick={() => setAppFilter(appFilter === g.app ? null : g.app)}
                style={{
                  ...btnSmall,
                  background: appFilter === g.app ? 'rgba(10,132,255,0.25)' : 'var(--color-bg-hover)',
                  color: appFilter === g.app ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >{appLabel(g.app)} ({g.count})</button>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search trash..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInput}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={emptyState}>
          <div style={{ fontSize: 14 }}>Loading...</div>
        </div>
      ) : totalVisible === 0 ? (
        <div style={emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {search ? 'No matching items' : 'Trash is empty'}
          </div>
          <div style={{ fontSize: 12 }}>
            {search ? 'Try a different search term' : 'Deleted items will appear here'}
          </div>
        </div>
      ) : (
        <div style={listArea}>
          {visibleGroups.map(g => (
            <div key={g.app}>
              <div style={groupHeader}>{appLabel(g.app)} ({g.items.length})</div>
              {g.items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(RecycleBin);
