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
import { DexSearchInput } from '../../styles/components';
import { restoreRecycledItem, unrestorableReason } from '../../services/recycleRestore';

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

function itemBytes(json: string): number {
  try {
    return new Blob([json || '']).size;
  } catch {
    return (json || '').length;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function humanSize(json: string): string {
  return formatBytes(itemBytes(json));
}

// Derive a folder-ish key from an original location for sort/grouping.
function originalFolder(loc: string): string {
  if (!loc) return '';
  const norm = loc.replace(/\\/g, '/');
  const cut = norm.lastIndexOf('/');
  return cut > 0 ? norm.slice(0, cut) : norm;
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* non-fatal */
  }
}

type SortKey = 'date' | 'size' | 'folder';

// ── Styles ─────────────────────────────────────────────────────
const rootStyle: React.CSSProperties = {
  height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg-base, #0a0a0f)',
  color: 'var(--color-text-primary, #e5e5ea)',
  overflow: 'hidden',
};
// Flush glass header strip: the .dex-liquid-glass class supplies the translucent
// material; borderRadius:0 + a hairline borderBottom keep it edge-to-edge chrome.
const headerStyle: React.CSSProperties = {
  padding: 'var(--space-5) var(--space-6) 14px', flexShrink: 0, borderRadius: 0,
  borderBottom: '1px solid var(--color-border-subtle)',
};
const listArea: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-5) var(--space-5)',
};
// Flush glass selection toolbar; class owns the material, borderRadius:0 keeps it edge-to-edge.
const selectToolbar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px var(--space-6)', flexShrink: 0, borderRadius: 0,
  borderBottom: '1px solid var(--color-border-subtle)',
};
const groupHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)', padding: '14px 0 6px',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--space-2) 10px',
  borderRadius: 'var(--radius-lg)', cursor: 'default', transition: 'background 0.15s',
};
const btnSmall: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 'var(--radius-lg)', border: 'none', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s',
};
const emptyState: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  flex: 1, gap: 'var(--space-3)', opacity: 0.5,
};

// ── Row component ──────────────────────────────────────────────
const ItemRow = memo(({ item, selected, busy, onToggleSelect, onRestore, onDelete }: {
  item: RecycleBinItem;
  selected: boolean;
  busy: boolean;
  onToggleSelect: (id: number) => void;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}) => {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const days = daysLeft(item.expires_at);
  const notRestorable = unrestorableReason(item);
  const badgeColor = days <= 3 ? 'var(--color-error)' : days <= 7 ? 'var(--color-warning)' : 'var(--color-border)';

  return (
    <div
      style={{ ...rowStyle, background: selected ? 'var(--color-accent-soft, rgba(74,158,255,0.18))' : hover ? 'var(--color-bg-hover)' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      {/* Select */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(item.id)}
        aria-label={`Select ${item.item_name || 'item'}`}
        style={{ cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }}
      />

      {/* Badge */}
      <span style={{
        display: 'inline-block', minWidth: 38, textAlign: 'center',
        padding: '2px 6px', borderRadius: 'var(--radius-md)',
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
          {item.item_type} &middot; Deleted {formatDate(item.deleted_at)} &middot; {humanSize(item.item_data)}
        </div>
        {item.original_location && (
          <div
            title={item.original_location}
            style={{
              fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1, opacity: 0.8,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            <span style={{ opacity: 0.7 }}>From </span>{item.original_location}
          </div>
        )}
        {notRestorable && (
          <div style={{ fontSize: 11, color: 'var(--color-warning)', marginTop: 1 }}>{notRestorable}</div>
        )}
      </div>

      {/* Actions (on hover or keyboard focus) */}
      {(hover || focused) && (
        <>
          {!notRestorable && (
            <button
              disabled={busy}
              style={{ ...btnSmall, background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-primary)', opacity: busy ? 0.5 : 1 }}
              onClick={() => onRestore(item.id)}
              aria-label={`Restore ${item.item_name || 'item'}`}
            >Restore</button>
          )}
          <button
            disabled={busy}
            style={{ ...btnSmall, background: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)', opacity: busy ? 0.5 : 1 }}
            onClick={() => onDelete(item.id)}
            aria-label={`Permanently delete ${item.item_name || 'item'}`}
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [olderDays, setOlderDays] = useState(7);
  const [busy, setBusy] = useState(false);

  // Load items
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [grouped, count] = await Promise.all([
        ipc('recycle-bin:getGrouped') as Promise<GroupedItems[] | null>,
        ipc('recycle-bin:getCount') as Promise<number | null>,
      ]);
      setGroups(Array.isArray(grouped) ? grouped : []);
      setTotalCount(typeof count === 'number' ? count : 0);
    } catch (err) {
      console.warn('[RecycleBin] reload failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Listen for count broadcasts from main
  useEffect(() => {
    const handler = (_e: any, count: number) => { setTotalCount(count); reload(); };
    const api = (window as any).dex;
    if (api?.on) api.on('recycle-bin:count', handler);
    return () => { if (api?.off) api.off('recycle-bin:count', handler); };
  }, [reload]);

  // Find an item by id across all loaded groups (for nicer toast text).
  const findItem = useCallback((id: number): RecycleBinItem | undefined => {
    for (const g of groups) {
      const hit = g.items.find(i => i.id === id);
      if (hit) return hit;
    }
    return undefined;
  }, [groups]);

  // Actions
  const handleRestore = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const it = findItem(id);
      if (!it) throw new Error('Item not found');
      // Put it back in its app first; drop the bin row only once that worked.
      await restoreRecycledItem(it, (ch, ...a) => (window as any).dex.invoke(ch, ...a));
      await ipc('recycle-bin:restore', id);
      toast('success', it.original_location
        ? `Restored "${it.item_name || 'item'}" to ${it.original_location}`
        : 'Item restored');
    } catch (err) {
      console.warn('[RecycleBin] restore failed:', err);
      toast('error', err instanceof Error ? `Could not restore: ${err.message}` : 'Could not restore item');
    } finally {
      setBusy(false);
      reload();
    }
  }, [reload, findItem]);

  const handleDelete = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const it = findItem(id);
      await ipc('recycle-bin:permanentlyDelete', id);
      toast('success', `Permanently deleted "${it?.item_name || 'item'}"`);
    } catch (err) {
      console.warn('[RecycleBin] delete failed:', err);
      toast('error', 'Could not delete item');
    } finally {
      setBusy(false);
      reload();
    }
  }, [reload, findItem]);

  const handleEmptyAll = useCallback(async () => {
    setBusy(true);
    try {
      await ipc('recycle-bin:emptyAll');
      toast('success', 'Trash emptied');
    } catch (err) {
      console.warn('[RecycleBin] emptyAll failed:', err);
      toast('error', 'Could not empty trash');
    } finally {
      setConfirmEmpty(false);
      setBusy(false);
      reload();
    }
  }, [reload]);

  // Empty everything older than N days — built from per-item permanent delete
  // since there is no dedicated channel for it.
  const handleEmptyOlderThan = useCallback(async () => {
    const cutoff = Date.now() - olderDays * 86_400_000;
    const stale = groups.flatMap(g => g.items).filter(i => i.deleted_at <= cutoff);
    if (stale.length === 0) {
      toast('info', `No items older than ${olderDays} day${olderDays === 1 ? '' : 's'}`);
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const it of stale) {
        try {
          await ipc('recycle-bin:permanentlyDelete', it.id);
          ok++;
        } catch (err) {
          console.warn('[RecycleBin] delete (older-than) failed for', it.id, err);
        }
      }
      toast(ok > 0 ? 'success' : 'error',
        ok > 0
          ? `Deleted ${ok} item${ok === 1 ? '' : 's'} older than ${olderDays} day${olderDays === 1 ? '' : 's'}`
          : 'Could not delete older items');
    } finally {
      setBusy(false);
      reload();
    }
  }, [groups, olderDays, reload]);

  // Sort comparator for the chosen key.
  const sortItems = useCallback((items: RecycleBinItem[]): RecycleBinItem[] => {
    const arr = [...items];
    switch (sortKey) {
      case 'size':
        arr.sort((a, b) => itemBytes(b.item_data) - itemBytes(a.item_data));
        break;
      case 'folder':
        arr.sort((a, b) =>
          originalFolder(a.original_location).localeCompare(originalFolder(b.original_location)) ||
          b.deleted_at - a.deleted_at);
        break;
      case 'date':
      default:
        arr.sort((a, b) => b.deleted_at - a.deleted_at); // most recently deleted first
        break;
    }
    return arr;
  }, [sortKey]);

  // Filtered + searched + sorted. Search matches name, type, source-app label,
  // and original location/folder.
  const visibleGroups = useMemo(() => {
    let g = groups;
    if (appFilter) g = g.filter(gr => gr.app === appFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      g = g.map(gr => {
        const appHit = gr.app.toLowerCase().includes(q) || appLabel(gr.app).toLowerCase().includes(q);
        const items = gr.items.filter(i =>
          appHit ||
          (i.item_name || '').toLowerCase().includes(q) ||
          (i.item_type || '').toLowerCase().includes(q) ||
          (i.original_location || '').toLowerCase().includes(q)
        );
        return { ...gr, items, count: items.length };
      }).filter(gr => gr.items.length > 0);
    }
    return g.map(gr => ({ ...gr, items: sortItems(gr.items) }));
  }, [groups, appFilter, search, sortItems]);

  const totalVisible = visibleGroups.reduce((s, g) => s + g.items.length, 0);

  // Size reclaimable: whole bin and currently-visible subset.
  const totalReclaimable = useMemo(
    () => groups.reduce((s, g) => s + g.items.reduce((t, i) => t + itemBytes(i.item_data), 0), 0),
    [groups],
  );
  const visibleReclaimable = useMemo(
    () => visibleGroups.reduce((s, g) => s + g.items.reduce((t, i) => t + itemBytes(i.item_data), 0), 0),
    [visibleGroups],
  );

  // ── Multi-select ───────────────────────────────────────────
  const visibleIds = useMemo(
    () => visibleGroups.flatMap(g => g.items.map(i => i.id)),
    [visibleGroups],
  );

  // Never keep a selection on items the current filter/search has hidden —
  // a bulk action should only ever touch what the user can actually see.
  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelected(prev => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = visibleIds.length > 0 && selected.size === visibleIds.length;
  const toggleSelectAll = useCallback(() => {
    setSelected(prev => prev.size === visibleIds.length ? new Set() : new Set(visibleIds));
  }, [visibleIds]);

  const handleRestoreSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          const it = findItem(id);
          if (!it) throw new Error('Item not found');
          await restoreRecycledItem(it, (ch, ...a) => (window as any).dex.invoke(ch, ...a));
          await ipc('recycle-bin:restore', id);
          ok++;
        } catch (err) {
          failed++;
          console.warn('[RecycleBin] bulk restore failed for', id, err);
        }
      }
      if (ok > 0) toast('success', `Restored ${ok} item${ok === 1 ? '' : 's'}${failed ? ` · ${failed} could not be restored` : ''}`);
      else toast('error', `Could not restore ${failed === 1 ? 'the item' : 'these items'}`);
    } finally {
      setSelected(new Set());
      setBusy(false);
      reload();
    }
  }, [selected, reload, findItem]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        try { await ipc('recycle-bin:permanentlyDelete', id); ok++; }
        catch (err) { console.warn('[RecycleBin] bulk delete failed for', id, err); }
      }
      toast(ok > 0 ? 'success' : 'error',
        ok > 0 ? `Permanently deleted ${ok} item${ok === 1 ? '' : 's'}` : 'Could not delete items');
    } finally {
      setSelected(new Set());
      setBusy(false);
      reload();
    }
  }, [selected, reload]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={rootStyle}>
      {/* Header */}
      <div className="dex-liquid-glass" style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Trash</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
              {totalReclaimable > 0 && <> &middot; {formatBytes(totalReclaimable)} reclaimable</>}
              {' '}&middot; auto-deleted after 30 days
            </div>
          </div>
          {totalCount > 0 && (
            confirmEmpty ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={busy}
                  style={{ ...btnSmall, background: 'rgba(255,69,58,0.2)', color: 'var(--color-error)', opacity: busy ? 0.5 : 1 }}
                  onClick={handleEmptyAll}
                >Confirm Empty</button>
                <button
                  disabled={busy}
                  style={{ ...btnSmall, background: 'var(--color-border-subtle)', color: 'var(--color-text-primary, #e5e5ea)' }}
                  onClick={() => setConfirmEmpty(false)}
                >Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Empty items older than N days */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>older than</span>
                  <select
                    value={olderDays}
                    onChange={e => setOlderDays(Number(e.target.value))}
                    aria-label="Age threshold in days"
                    style={{
                      ...btnSmall, padding: '4px 6px',
                      background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                    }}
                  >
                    {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>{d}d</option>)}
                  </select>
                  <button
                    disabled={busy}
                    style={{ ...btnSmall, background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: busy ? 0.5 : 1 }}
                    onClick={handleEmptyOlderThan}
                    title={`Permanently delete items deleted more than ${olderDays} days ago`}
                  >Clear old</button>
                </div>
                <button
                  disabled={busy}
                  style={{ ...btnSmall, background: 'rgba(255,69,58,0.12)', color: 'var(--color-error)', opacity: busy ? 0.5 : 1 }}
                  onClick={() => setConfirmEmpty(true)}
                >Empty Trash</button>
              </div>
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
                background: !appFilter ? 'var(--color-accent-soft, rgba(74,158,255,0.25))' : 'var(--color-bg-hover)',
                color: !appFilter ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >All</button>
            {groups.map(g => (
              <button
                key={g.app}
                onClick={() => setAppFilter(appFilter === g.app ? null : g.app)}
                style={{
                  ...btnSmall,
                  background: appFilter === g.app ? 'var(--color-accent-soft, rgba(74,158,255,0.25))' : 'var(--color-bg-hover)',
                  color: appFilter === g.app ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >{appLabel(g.app)} ({g.count})</button>
            ))}
          </div>
        )}

        {/* Search + sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DexSearchInput
              size="sm"
              fullWidth
              placeholder="Search by name or app..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Sort</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              aria-label="Sort items"
              style={{
                ...btnSmall, padding: '4px 8px',
                background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
              }}
            >
              <option value="date">Date deleted</option>
              <option value="size">Size</option>
              <option value="folder">Original folder</option>
            </select>
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {!loading && totalVisible > 0 && (
        <div className="dex-liquid-glass" style={selectToolbar}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              aria-label="Select all visible items"
              style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${totalVisible} shown · ${formatBytes(visibleReclaimable)}`}
            </span>
          </label>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={busy}
                style={{ ...btnSmall, background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-primary)', opacity: busy ? 0.5 : 1 }}
                onClick={handleRestoreSelected}
              >Restore {selected.size}</button>
              <button
                disabled={busy}
                style={{ ...btnSmall, background: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)', opacity: busy ? 0.5 : 1 }}
                onClick={handleDeleteSelected}
              >Delete {selected.size}</button>
              <button
                disabled={busy}
                style={{ ...btnSmall, background: 'var(--color-border-subtle)', color: 'var(--color-text-primary, #e5e5ea)' }}
                onClick={() => setSelected(new Set())}
              >Clear</button>
            </div>
          )}
        </div>
      )}

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
                  selected={selected.has(item.id)}
                  busy={busy}
                  onToggleSelect={toggleSelect}
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
