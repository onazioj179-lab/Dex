// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX - Smart Inbox (Future backlog #32)
 * -----------------------------------------------------------------------------
 * One surface that aggregates recent notifications and cross-app activity, with
 * click-through to the source app.
 *
 * Data sources (all guarded, degrade cleanly when the native hub is absent):
 *   1. The Unified Notification Hub via `notification-center:getAll` (backed by
 *      dex.db). Each row's priority/icon/source travels inside the persisted
 *      `action` JSON `_dexMeta` envelope (see services/notify.ts), decoded here.
 *   2. Live `dex-notification` CustomEvents — prepended as they fire, and used
 *      as the sole feed when the hub channel is missing (older preload / Tauri
 *      parity gap). These are also captured into a session ring so they survive
 *      a refresh-within-session.
 *   3. Cross-app activity from the in-renderer ContextBus replay buffer
 *      (`app:opened`, `file:saved`, `note:saved`, etc.).
 *
 * Click-through: dispatches `dex-open-app` with the item's source so AppManager
 * resolves it against real app ids / display names (non-app sources no-op).
 * Mutations (mark-all-read / clear) hit the hub when present, else act locally.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ContextBus, { type ContextChannel, type ContextEventMap } from '../../services/ContextBus';
import { readHubMeta, type NotificationIcon } from '../../services/notify';
import type { NotificationPriority } from '../../../shared/notifications/group';

// ---------------------------------------------------------------------------
// Item model — a unified row spanning notifications + activity.
// ---------------------------------------------------------------------------

type InboxKind = 'notification' | 'activity';

interface InboxItem {
  /** Stable key. Hub rows use `hub:<id>`; live/activity use a synthesized id. */
  key: string;
  kind: InboxKind;
  title: string;
  body: string;
  source: string;
  icon: NotificationIcon;
  priority: NotificationPriority;
  ts: number;
  read: boolean;
  /** Hub row id when this came from the persistent center (for mark/clear). */
  hubId?: number;
}

// ---------------------------------------------------------------------------
// Safe bridge access — null in non-bridge contexts (web preview / SSR / tests).
// ---------------------------------------------------------------------------

function bridge(): { invoke: (channel: string, ...args: unknown[]) => Promise<any> } | null {
  const dex = (typeof window !== 'undefined' ? (window as any).dex : null) || null;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}

// ---------------------------------------------------------------------------
// Decoders.
// ---------------------------------------------------------------------------

const VALID_ICONS: readonly NotificationIcon[] = ['info', 'success', 'warning', 'error'];

function coerceIcon(value: unknown, fallback: NotificationIcon = 'info'): NotificationIcon {
  return typeof value === 'string' && (VALID_ICONS as readonly string[]).includes(value)
    ? (value as NotificationIcon)
    : fallback;
}

/** Decode a persistent hub row into an InboxItem (mirrors unifiedSystemsStore). */
function fromHubRow(raw: any): InboxItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = readHubMeta(raw.action);
  const id = typeof raw.id === 'number' ? raw.id : undefined;
  const source = meta?.source ?? (typeof raw.app === 'string' && raw.app ? raw.app : 'System');
  return {
    key: id != null ? `hub:${id}` : `hub:${raw.title ?? ''}:${raw.timestamp ?? ''}`,
    kind: 'notification',
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    source,
    icon: meta?.icon ?? 'info',
    priority: meta?.priority ?? 'normal',
    ts: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    read: typeof raw.read === 'number' ? raw.read !== 0 : false,
    hubId: id,
  };
}

let liveSeq = 0;

/** Decode a live `dex-notification` CustomEvent detail into an InboxItem. */
function fromLiveEvent(detail: any): InboxItem | null {
  if (!detail || typeof detail !== 'object') return null;
  const title = typeof detail.title === 'string' ? detail.title : '';
  if (!title) return null;
  const source = typeof detail.source === 'string' && detail.source ? detail.source : 'System';
  return {
    key: `live:${Date.now()}:${liveSeq++}`,
    kind: 'notification',
    title,
    body: typeof detail.body === 'string' ? detail.body : '',
    source,
    icon: coerceIcon(detail.icon),
    priority: (['low', 'normal', 'high', 'urgent'] as const).includes(detail.priority)
      ? detail.priority
      : 'normal',
    ts: Date.now(),
    read: false,
  };
}

// ---------------------------------------------------------------------------
// Cross-app activity from the ContextBus replay buffer.
// ---------------------------------------------------------------------------

const ACTIVITY_LABELS: Partial<Record<ContextChannel, (p: any) => { title: string; body: string; source: string }>> = {
  'app:opened': (p) => ({ title: 'Opened app', body: p.appId, source: p.appId }),
  'app:closed': (p) => ({ title: 'Closed app', body: p.appId, source: p.appId }),
  'app:focused': (p) => ({ title: 'Focused', body: p.appId, source: p.appId }),
  'file:saved': (p) => ({ title: 'File saved', body: p.path || '', source: p.appId }),
  'file:opened': (p) => ({ title: 'File opened', body: p.path || '', source: p.appId }),
  'note:saved': (p) => ({ title: 'Note saved', body: p.id || '', source: 'notes' }),
  'note:opened': (p) => ({ title: 'Note opened', body: p.title || p.id || '', source: 'notes' }),
  'task:created': (p) => ({ title: 'Task created', body: p.title || '', source: 'kanban' }),
  'task:completed': (p) => ({ title: 'Task completed', body: p.id || '', source: 'kanban' }),
  'clipboard:updated': (p) => ({ title: 'Clipboard updated', body: p.kind || '', source: 'System' }),
};

/** Pull recent cross-app events from the ContextBus replay ring. */
function readActivity(): InboxItem[] {
  let buffered: { channel: ContextChannel; payload: unknown; ts: number }[] = [];
  try {
    buffered = ContextBus.replay();
  } catch {
    return [];
  }
  const out: InboxItem[] = [];
  for (const ev of buffered) {
    const labeler = ACTIVITY_LABELS[ev.channel];
    if (!labeler) continue;
    let label: { title: string; body: string; source: string };
    try {
      label = labeler(ev.payload as any);
    } catch {
      continue;
    }
    out.push({
      key: `act:${ev.channel}:${ev.ts}`,
      kind: 'activity',
      title: label.title,
      body: label.body,
      source: label.source || 'System',
      icon: 'info',
      priority: 'low',
      ts: ev.ts,
      read: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time + grouping helpers.
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return `${day}d ago`;
  }
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const ICON_COLOR: Record<NotificationIcon, string> = {
  info: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning, #d9a300)',
  error: 'var(--color-error)',
};

const ICON_GLYPH: Record<NotificationIcon, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '×',
};

function emitToast(type: 'info' | 'success' | 'error', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* never let UI feedback throw */
  }
}

// Session ring of live events — survives a refresh-within-session even when the
// hub channel is absent (module-scope so it outlives unmount/remount).
const SESSION_LIVE_CAP = 200;
const sessionLive: InboxItem[] = [];

// ---------------------------------------------------------------------------
// Component.
// ---------------------------------------------------------------------------

const SmartInbox: React.FC = () => {
  const [hubItems, setHubItems] = useState<InboxItem[]>([]);
  const [liveItems, setLiveItems] = useState<InboxItem[]>(() => sessionLive.slice());
  const [activity, setActivity] = useState<InboxItem[]>([]);
  const [hubAvailable, setHubAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<'time' | 'source'>('time');
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Locally-applied read/cleared state for items the hub can't persist
  // (live + activity), and an optimistic overlay over hub rows.
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // --- Load the persistent hub once on mount (guarded). ---------------------
  const loadHub = useCallback(async () => {
    const dex = bridge();
    if (!dex) {
      if (mountedRef.current) {
        setHubAvailable(false);
        setLoading(false);
      }
      return;
    }
    try {
      const data = await dex.invoke('notification-center:getAll', 200);
      if (!mountedRef.current) return;
      if (Array.isArray(data)) {
        const decoded = data.map(fromHubRow).filter(Boolean) as InboxItem[];
        setHubItems(decoded);
        setHubAvailable(true);
      } else {
        // Channel present but returned null — treat as empty hub, still "available".
        setHubItems([]);
        setHubAvailable(data === null ? true : false);
      }
    } catch {
      if (mountedRef.current) setHubAvailable(false);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setActivity(readActivity());
    loadHub();
    return () => {
      mountedRef.current = false;
    };
  }, [loadHub]);

  // --- Live notification events: prepend + persist into the session ring. ---
  useEffect(() => {
    const onNotification = (event: Event) => {
      const item = fromLiveEvent((event as CustomEvent).detail);
      if (!item) return;
      sessionLive.unshift(item);
      if (sessionLive.length > SESSION_LIVE_CAP) sessionLive.length = SESSION_LIVE_CAP;
      if (mountedRef.current) setLiveItems((prev) => [item, ...prev].slice(0, SESSION_LIVE_CAP));
    };
    // A hub write happened elsewhere — refresh the persistent feed.
    const onPersisted = () => { loadHub(); };
    window.addEventListener('dex-notification', onNotification as EventListener);
    window.addEventListener('dex-notification-persisted', onPersisted as EventListener);
    return () => {
      window.removeEventListener('dex-notification', onNotification as EventListener);
      window.removeEventListener('dex-notification-persisted', onPersisted as EventListener);
    };
  }, [loadHub]);

  // --- Live cross-app activity via ContextBus. ------------------------------
  useEffect(() => {
    const channels = Object.keys(ACTIVITY_LABELS) as ContextChannel[];
    const offs: Array<() => void> = [];
    for (const ch of channels) {
      try {
        offs.push(
          ContextBus.on(ch, (payload: ContextEventMap[typeof ch]) => {
            const labeler = ACTIVITY_LABELS[ch];
            if (!labeler) return;
            let label: { title: string; body: string; source: string };
            try { label = labeler(payload as any); } catch { return; }
            const item: InboxItem = {
              key: `act:${ch}:${Date.now()}:${liveSeq++}`,
              kind: 'activity',
              title: label.title,
              body: label.body,
              source: label.source || 'System',
              icon: 'info',
              priority: 'low',
              ts: Date.now(),
              read: true,
            };
            if (mountedRef.current) setActivity((prev) => [item, ...prev].slice(0, 200));
          }),
        );
      } catch {
        /* a missing channel must not break the rest */
      }
    }
    return () => { offs.forEach((off) => { try { off(); } catch { /* noop */ } }); };
  }, []);

  // --- Merge + dedupe all sources into one feed. ----------------------------
  const allItems = useMemo(() => {
    const merged = [...hubItems, ...liveItems, ...activity];
    const seen = new Set<string>();
    const deduped: InboxItem[] = [];
    for (const it of merged) {
      if (cleared.has(it.key)) continue;
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      deduped.push(localRead.has(it.key) ? { ...it, read: true } : it);
    }
    deduped.sort((a, b) => b.ts - a.ts);
    return deduped;
  }, [hubItems, liveItems, activity, cleared, localRead]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((it) => set.add(it.source));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((it) => {
      if (sourceFilter !== 'all' && it.source !== sourceFilter) return false;
      if (unreadOnly && it.read) return false;
      if (q) {
        const hay = `${it.title} ${it.body} ${it.source}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allItems, sourceFilter, query, unreadOnly]);

  const unreadCount = useMemo(() => allItems.reduce((n, it) => (it.read ? n : n + 1), 0), [allItems]);

  // --- Actions. -------------------------------------------------------------

  const openSource = useCallback((item: InboxItem) => {
    // Mark read locally (always) and in the hub (when persistent).
    setLocalRead((prev) => new Set(prev).add(item.key));
    if (item.hubId != null) {
      const dex = bridge();
      if (dex) {
        try { void dex.invoke('notification-center:markRead', item.hubId); } catch { /* noop */ }
      }
    }
    // Click-through: AppManager resolves appName against app ids + display names.
    // Non-app sources (e.g. "System") resolve to null and harmlessly no-op.
    try {
      window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appName: item.source } }));
    } catch {
      /* noop */
    }
  }, []);

  // Mark a single item read (optimistic local + hub when persistent).
  const markOneRead = useCallback((item: InboxItem) => {
    setLocalRead((prev) => (prev.has(item.key) ? prev : new Set(prev).add(item.key)));
    if (item.hubId != null) {
      const dex = bridge();
      if (dex) {
        try { void dex.invoke('notification-center:markRead', item.hubId); } catch { /* noop */ }
      }
    }
  }, []);

  // Dismiss (archive) a single item from the feed.
  const dismissOne = useCallback((item: InboxItem) => {
    setCleared((prev) => (prev.has(item.key) ? prev : new Set(prev).add(item.key)));
    if (item.hubId != null) {
      const dex = bridge();
      if (dex) {
        try { void dex.invoke('notification-center:markRead', item.hubId); } catch { /* noop */ }
      }
    }
    emitToast('info', 'Dismissed');
  }, []);

  const markAllRead = useCallback(async () => {
    setLocalRead(new Set(allItems.map((it) => it.key)));
    const dex = bridge();
    if (dex && hubAvailable) {
      try { await dex.invoke('notification-center:markAllRead'); } catch { /* noop */ }
    }
    emitToast('success', 'All marked as read');
  }, [allItems, hubAvailable]);

  const clearAll = useCallback(async () => {
    setCleared(new Set(allItems.map((it) => it.key)));
    sessionLive.length = 0;
    setLiveItems([]);
    setActivity([]);
    const dex = bridge();
    if (dex && hubAvailable) {
      try {
        await dex.invoke('notification-center:clearAll');
        setHubItems([]);
      } catch { /* noop */ }
    }
    emitToast('info', 'Inbox cleared');
  }, [allItems, hubAvailable]);

  // --- Build grouped sections for render. -----------------------------------
  const sections = useMemo(() => {
    if (groupMode === 'source') {
      const bySource = new Map<string, InboxItem[]>();
      for (const it of visibleItems) {
        const arr = bySource.get(it.source) || [];
        arr.push(it);
        bySource.set(it.source, arr);
      }
      return Array.from(bySource.entries())
        .map(([source, items]) => ({ label: source, items }))
        .sort((a, b) => (b.items[0]?.ts ?? 0) - (a.items[0]?.ts ?? 0));
    }
    const today: InboxItem[] = [];
    const earlier: InboxItem[] = [];
    for (const it of visibleItems) (isToday(it.ts) ? today : earlier).push(it);
    const secs: { label: string; items: InboxItem[] }[] = [];
    if (today.length) secs.push({ label: 'Today', items: today });
    if (earlier.length) secs.push({ label: 'Earlier', items: earlier });
    return secs;
  }, [visibleItems, groupMode]);

  // Flat ordered list of visible keys, for arrow-key navigation across sections.
  const flatKeys = useMemo(() => sections.flatMap((s) => s.items.map((it) => it.key)), [sections]);

  // Keep the active row valid as the feed changes; default to the first row.
  useEffect(() => {
    if (flatKeys.length === 0) { setActiveKey(null); return; }
    setActiveKey((cur) => (cur && flatKeys.includes(cur) ? cur : flatKeys[0]));
  }, [flatKeys]);

  // Roving keyboard navigation over the message list (Apple-Mail style j/k + arrows).
  const onListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (flatKeys.length === 0) return;
    const idx = activeKey ? flatKeys.indexOf(activeKey) : -1;
    const focusRow = (key: string) => {
      setActiveKey(key);
      try {
        (document.querySelector(`[data-inbox-row="${CSS.escape(key)}"]`) as HTMLElement | null)?.focus();
      } catch { /* CSS.escape may be absent in old engines — selection state still updates */ }
    };
    const item = activeKey ? visibleItems.find((it) => it.key === activeKey) : undefined;
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        focusRow(flatKeys[Math.min(flatKeys.length - 1, idx + 1)] ?? flatKeys[0]);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        focusRow(flatKeys[Math.max(0, idx - 1)] ?? flatKeys[0]);
        break;
      case 'e':
        if (item) { e.preventDefault(); dismissOne(item); }
        break;
      case 'r':
        if (item) { e.preventDefault(); markOneRead(item); }
        break;
      default:
        break;
    }
  }, [flatKeys, activeKey, visibleItems, dismissOne, markOneRead]);

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------

  return (
    <div style={S.container}>
      <style>{INBOX_CSS}</style>
      {/* Header */}
      <div style={S.header}>
        <div style={S.titleWrap}>
          <span style={S.title}>Smart Inbox</span>
          {unreadCount > 0 && <span style={S.badge}>{unreadCount}</span>}
        </div>
        <div style={S.headerActions}>
          <button
            className="inbox-tool-btn"
            style={S.toolBtn}
            onClick={() => setGroupMode((m) => (m === 'time' ? 'source' : 'time'))}
            title={groupMode === 'time' ? 'Group by source' : 'Group by time'}
          >
            {groupMode === 'time' ? 'By time' : 'By source'}
          </button>
          <button className="inbox-tool-btn" style={S.toolBtn} onClick={markAllRead} disabled={unreadCount === 0} title="Mark all as read">
            Mark all read
          </button>
          <button className="inbox-tool-btn" style={S.toolBtn} onClick={clearAll} disabled={allItems.length === 0} title="Clear inbox">
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={S.searchBar}>
        <div style={S.searchWrap}>
          <svg style={S.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            className="inbox-search-input"
            style={S.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inbox"
            aria-label="Search inbox"
            spellCheck={false}
          />
          {query && (
            <button
              className="inbox-tool-btn"
              style={S.searchClear}
              onClick={() => setQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Source filter */}
      <div style={S.filterBar}>
        <button
          className="inbox-chip"
          style={{ ...S.chip, ...(sourceFilter === 'all' ? S.chipActive : {}) }}
          onClick={() => setSourceFilter('all')}
          aria-pressed={sourceFilter === 'all'}
        >
          All
        </button>
        <button
          className="inbox-chip"
          style={{ ...S.chip, ...(unreadOnly ? S.chipActive : {}) }}
          onClick={() => setUnreadOnly((v) => !v)}
          aria-pressed={unreadOnly}
          title="Show only unread"
        >
          Unread{unreadCount > 0 ? ` ${unreadCount}` : ''}
        </button>
        <span style={S.chipSep} aria-hidden="true" />
        {sources.map((src) => (
          <button
            key={src}
            className="inbox-chip"
            style={{ ...S.chip, ...(sourceFilter === src ? S.chipActive : {}) }}
            onClick={() => setSourceFilter(src)}
            aria-pressed={sourceFilter === src}
          >
            {src}
          </button>
        ))}
        {hubAvailable === false && (
          <span style={S.degradeNote} title="Notification hub unavailable — showing live events captured this session.">
            live only
          </span>
        )}
      </div>

      {/* Body */}
      <div
        style={S.body}
        role="listbox"
        aria-label="Inbox messages"
        tabIndex={-1}
        onKeyDown={onListKeyDown}
      >
        {loading ? (
          <div style={S.list}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="inbox-skeleton-row" style={S.skeletonRow}>
                <span style={S.skeletonDot} className="inbox-shimmer" />
                <span style={S.skeletonLines}>
                  <span style={{ ...S.skeletonLine, width: '55%' }} className="inbox-shimmer" />
                  <span style={{ ...S.skeletonLine, width: '85%' }} className="inbox-shimmer" />
                </span>
              </div>
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyGlyph} aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={S.emptyTitle}>
              {query
                ? `No matches for “${query}”`
                : unreadOnly
                  ? 'No unread items'
                  : sourceFilter === 'all'
                    ? 'Your inbox is clear'
                    : `Nothing from ${sourceFilter}`}
            </div>
            <div style={S.emptyHint}>
              {query
                ? 'Try a different term, or clear the search to see everything.'
                : unreadOnly
                  ? 'You are all caught up. Toggle Unread off to review past items.'
                  : sourceFilter === 'all'
                    ? 'Notifications and recent cross-app activity will collect here. Click an item to jump to its app.'
                    : 'Try a different source, or switch back to All.'}
            </div>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.label} style={S.section}>
              <div style={S.sectionLabel}>
                <span>{section.label}</span>
                <span style={S.sectionCount}>{section.items.length}</span>
              </div>
              <div style={S.list}>
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    data-inbox-row={item.key}
                    className={`inbox-row dex-liquid-glass-strong${item.read ? '' : ' inbox-row-unread'}${activeKey === item.key ? ' inbox-row-active' : ''}`}
                    style={{ ...S.row, ...(item.read ? {} : S.rowUnread) }}
                    role="option"
                    aria-selected={activeKey === item.key}
                    aria-label={`${item.title}${item.body ? `, ${item.body}` : ''}, from ${item.source}, ${relativeTime(item.ts)}${item.read ? '' : ', unread'}`}
                    tabIndex={activeKey === item.key ? 0 : -1}
                    onClick={() => { setActiveKey(item.key); openSource(item); }}
                    onFocus={() => setActiveKey(item.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openSource(item);
                      }
                    }}
                    title={`Open ${item.source}`}
                  >
                    <span style={{ ...S.iconDot, background: ICON_COLOR[item.icon] + '22', color: ICON_COLOR[item.icon] }} aria-hidden="true">
                      {ICON_GLYPH[item.icon]}
                    </span>
                    <span style={S.rowMain}>
                      <span style={S.rowTopLine}>
                        <span style={S.rowTitle}>{item.title}</span>
                        <span style={S.rowTime}>{relativeTime(item.ts)}</span>
                      </span>
                      {item.body && <span style={S.rowBody}>{item.body}</span>}
                      <span style={S.rowMeta}>
                        <span style={S.rowSource}>{item.source}</span>
                        {item.kind === 'activity' && <span style={S.rowKind}>activity</span>}
                        {!item.read && <span style={S.unreadDot} aria-label="unread" />}
                      </span>
                    </span>
                    {/* Hover/focus quick actions (Apple Mail swipe-action parity). */}
                    <span className="inbox-row-actions" style={S.rowActions}>
                      {!item.read && (
                        <button
                          className="inbox-row-action"
                          style={S.rowAction}
                          title="Mark as read"
                          aria-label="Mark as read"
                          onClick={(e) => { e.stopPropagation(); markOneRead(item); }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      <button
                        className="inbox-row-action"
                        style={S.rowAction}
                        title="Dismiss"
                        aria-label="Dismiss"
                        onClick={(e) => { e.stopPropagation(); dismissOne(item); }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles — inline + design tokens, matching standalone-app conventions.
// ---------------------------------------------------------------------------

// Scoped CSS — hover, focus-visible, hover-reveal actions and skeleton shimmer.
// (Class-based pseudo-states can't be expressed via inline style objects.)
const INBOX_CSS = `
.inbox-tool-btn:hover:not(:disabled) { background: var(--color-bg-hover, var(--color-bg-surface)); color: var(--color-text-primary); border-color: var(--color-border-strong, var(--color-border)); }
.inbox-tool-btn:active:not(:disabled) { transform: scale(0.97); }
.inbox-tool-btn:disabled { opacity: 0.45; cursor: default; }
.inbox-tool-btn:focus-visible, .inbox-chip:focus-visible, .inbox-row:focus-visible, .inbox-row-action:focus-visible, .inbox-search-input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.inbox-chip:hover { color: var(--color-text-primary); border-color: var(--color-border-strong, var(--color-border)); }
.inbox-search-input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent); }
.inbox-row:hover { background: var(--color-bg-hover, rgba(255,255,255,0.04)); border-color: var(--color-border, rgba(255,255,255,0.15)); }
.inbox-row.inbox-row-unread:hover { border-color: var(--color-accent); }
.inbox-row.inbox-row-active { border-color: var(--color-accent); }
.inbox-row:active { transform: scale(0.995); }
.inbox-row-actions { opacity: 0; transform: translateX(4px); transition: opacity 0.12s ease, transform 0.12s ease; pointer-events: none; }
.inbox-row:hover .inbox-row-actions, .inbox-row:focus-within .inbox-row-actions, .inbox-row.inbox-row-active .inbox-row-actions { opacity: 1; transform: none; pointer-events: auto; }
.inbox-row-action:hover { background: var(--color-bg-base); color: var(--color-text-primary); border-color: var(--color-border-strong, var(--color-border)); }
.inbox-row-action:active { transform: scale(0.92); }
.inbox-shimmer { position: relative; overflow: hidden; }
.inbox-shimmer::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-text-primary) 8%, transparent), transparent); animation: inbox-shimmer 1.3s ease-in-out infinite; }
@keyframes inbox-shimmer { 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) {
  .inbox-row:active, .inbox-tool-btn:active:not(:disabled), .inbox-row-action:active { transform: none; }
  .inbox-shimmer::after { animation: none; }
  .inbox-row-actions { transition: none; }
}
`;

const S: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border)',
  },
  titleWrap: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  title: { fontSize: 16, fontWeight: 700, letterSpacing: 0.2 },
  badge: {
    minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
    background: 'var(--color-accent)', color: 'var(--color-text-inverse, #fff)',
    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  toolBtn: {
    padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
    transition: 'all 0.15s ease',
  },
  filterBar: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0,
    padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)',
  },
  chip: {
    padding: '4px 12px', borderRadius: 14, border: '1px solid var(--color-border)',
    background: 'transparent', color: 'var(--color-text-tertiary)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-family)',
    transition: 'all 0.15s ease', whiteSpace: 'nowrap',
  },
  chipActive: {
    background: 'var(--color-accent)', color: 'var(--color-text-inverse, #fff)',
    borderColor: 'var(--color-accent)',
  },
  degradeNote: {
    marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)',
    fontStyle: 'italic', whiteSpace: 'nowrap',
  },
  chipSep: {
    width: 1, alignSelf: 'stretch', minHeight: 16, margin: '0 2px',
    background: 'var(--color-border)', flexShrink: 0,
  },
  searchBar: {
    flexShrink: 0, padding: 'var(--space-3) var(--space-5) 0',
  },
  searchWrap: {
    position: 'relative', display: 'flex', alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute', left: 10, color: 'var(--color-text-muted)', pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 30px 7px 30px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'var(--font-family)',
    outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  searchClear: {
    position: 'absolute', right: 6, width: 22, height: 22,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent',
    color: 'var(--color-text-muted)', fontSize: 16, lineHeight: 1, cursor: 'pointer',
    padding: 0, fontFamily: 'var(--font-family)',
  },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4) var(--space-6)' },
  skeletonRow: {
    display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
  },
  skeletonDot: {
    flexShrink: 0, width: 26, height: 26, borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-surface)',
  },
  skeletonLines: { display: 'flex', flexDirection: 'column', gap: 7, flex: 1, paddingTop: 3 },
  skeletonLine: { height: 9, borderRadius: 5, background: 'var(--color-bg-surface)' },
  section: { marginBottom: 'var(--space-4)' },
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
    color: 'var(--color-text-muted)', padding: '0 var(--space-2)',
    margin: 'var(--space-2) 0',
  },
  sectionCount: {
    fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)',
    background: 'var(--color-bg-surface)', borderRadius: 8, padding: '1px 7px',
    fontVariantNumeric: 'tabular-nums', letterSpacing: 0,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    position: 'relative',
    display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', textAlign: 'left',
    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
    border: '1px solid transparent',
    color: 'var(--color-text-primary)',
    cursor: 'pointer', width: '100%', fontFamily: 'var(--font-family)',
    transition: 'border-color 0.12s ease, background 0.12s ease, transform 0.12s ease',
  },
  rowUnread: { borderColor: 'var(--color-accent)' },
  rowActions: {
    position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)',
    display: 'flex', alignItems: 'center', gap: 4,
  },
  rowAction: {
    width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    cursor: 'pointer', padding: 0, fontFamily: 'var(--font-family)',
    transition: 'all 0.12s ease',
  },
  iconDot: {
    flexShrink: 0, width: 26, height: 26, borderRadius: 'var(--radius-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, marginTop: 1,
  },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 },
  rowTopLine: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' },
  rowTitle: {
    fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowTime: {
    fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  rowBody: {
    fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4,
    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 1 },
  rowSource: {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
  },
  rowKind: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
    color: 'var(--color-text-muted)', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-base)',
  },
  unreadDot: {
    width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)',
    marginLeft: 'auto', flexShrink: 0,
  },
  empty: {
    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6)', gap: 'var(--space-2)',
  },
  emptyGlyph: {
    color: 'var(--color-text-muted)', opacity: 0.7, marginBottom: 'var(--space-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-secondary)' },
  emptyHint: { fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, lineHeight: 1.5 },
};

export default SmartInbox;
