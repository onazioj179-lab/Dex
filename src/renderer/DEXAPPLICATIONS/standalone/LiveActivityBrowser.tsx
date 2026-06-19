// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LIVE ACTIVITY BROWSER
 * A browsable feed of the persistent activity log (the `activity-feed` namespace,
 * backed identically by the Electron core ActivityFeedManager and the Tauri
 * `activity_feed.rs` port over the shared dex.db). Newest-first, filterable by
 * type, click an entry to open the app that produced it.
 *
 * This is the read surface for a backbone that already existed but had no
 * dedicated browser -- pure renderer, works on both shells.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DexSearchInput } from '../../styles/components';
import { APP_DEFINITIONS, useRunningApps } from '../../store/runningApps';

// --- bridge ---------------------------------------------------------------
// Same invoke seam the feature stores use; degrades to empty under web/no-bridge.
async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  try {
    const bridge = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<T> } }).dex;
    if (bridge?.invoke) return await bridge.invoke(channel, ...args);
  } catch (err) {
    console.warn('[LiveActivity] invoke failed', channel, err);
  }
  return null;
}

interface ActivityEntry {
  id: number;
  event_type: string;
  source: string;
  app: string;
  title: string;
  details: string;
  created_at: string;
}

interface FeedStats {
  today: number;
  thisWeek: number;
  total: number;
  byType: Record<string, number>;
}

const REFRESH_MS = 4000;
const FEED_LIMIT = 200;

// SQLite stores created_at as UTC 'YYYY-MM-DD HH:MM:SS' (no zone) -- normalise to
// a real UTC instant so relative time is correct regardless of the user's locale.
function parseTs(s: string): number {
  if (!s) return 0;
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? 0 : t;
}

function relTime(ts: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Event-type -> glyph. Unknown types fall back to a neutral dot, so a new event
// kind from any app still renders cleanly without a code change.
const TYPE_ICON: Record<string, React.ReactNode> = {
  file: <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />,
  app: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  command: <><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>,
  git: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="9" r="3" /><path d="M18 12v0a6 6 0 0 1-6 6H9" /><line x1="6" y1="9" x2="6" y2="15" /></>,
  transfer: <><polyline points="16 3 21 3 21 8" /><line x1="21" y1="3" x2="14" y2="10" /><polyline points="8 21 3 21 3 16" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  system: <><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="3" /></>,
};
const fallbackIcon = <circle cx="12" cy="12" r="4" />;

const PAGE: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--dex-font-ui)',
};

const LiveActivityBrowser: React.FC = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const launchApp = useRunningApps(s => s.launchApp);
  const bringToFront = useRunningApps(s => s.bringToFront);

  const load = useCallback(async () => {
    const [feed, st] = await Promise.all([
      invoke<ActivityEntry[]>('activity-feed:get', { limit: FEED_LIMIT }),
      invoke<FeedStats>('activity-feed:stats'),
    ]);
    if (Array.isArray(feed)) setEntries(feed);
    if (st && typeof st === 'object') setStats(st);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => { void load(); }, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e =>
      (typeFilter === 'all' || e.event_type === typeFilter) &&
      (!q || e.title.toLowerCase().includes(q) || e.app.toLowerCase().includes(q) || e.source.toLowerCase().includes(q))
    );
  }, [entries, typeFilter, query]);

  const typeChips = useMemo(() => {
    const types = Object.keys(stats?.byType ?? {}).sort((a, b) => (stats!.byType[b] - stats!.byType[a]));
    return ['all', ...types];
  }, [stats]);

  const openApp = useCallback((appId: string) => {
    const def = (APP_DEFINITIONS as Record<string, { name: string; icon: string; color: string }>)[appId];
    if (!def) return;
    try {
      bringToFront(appId);
      launchApp({ id: appId, name: def.name, icon: def.icon, color: def.color });
    } catch { /* navigation best-effort */ }
  }, [launchApp, bringToFront]);

  const clearAll = useCallback(async () => {
    await invoke('activity-feed:clear');
    setEntries([]);
    void load();
  }, [load]);

  return (
    <div style={PAGE}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '0 var(--space-4)', height: 48, flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)',
      }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Live Activity</span>
        {stats && (
          <span className="dex-tnum" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono, monospace)' }}>
            {stats.today} today · {stats.thisWeek} this week · {stats.total} total
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ width: 220 }}>
          <DexSearchInput value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Filter activity" size="sm" fullWidth />
        </div>
        <button
          type="button"
          onClick={() => { void clearAll(); }}
          aria-label="Clear activity log"
          style={{
            height: 28, padding: '0 var(--space-3)', borderRadius: 4, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, flexShrink: 0,
          }}
        >Clear</button>
      </div>

      {/* Type filter chips */}
      {typeChips.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 'var(--space-2) var(--space-4)', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
          {typeChips.map(t => {
            const active = typeFilter === t;
            const count = t === 'all' ? (stats?.total ?? entries.length) : (stats?.byType[t] ?? 0);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => setTypeFilter(t)}
                style={{
                  height: 24, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                  background: active ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                  border: `1px solid ${active ? 'var(--dex-focus-color, #fff)' : 'var(--color-border-subtle)'}`,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >{t}{count ? ` ${count}` : ''}</button>
            );
          })}
        </div>
      )}

      {/* Feed */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-tertiary)', gap: 'var(--space-2)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span style={{ fontSize: 13 }}>{loaded ? 'No activity yet' : 'Loading activity...'}</span>
          </div>
        ) : (
          filtered.map(e => {
            const def = (APP_DEFINITIONS as Record<string, { name: string; color: string }>)[e.app];
            const clickable = !!def;
            return (
              <div
                key={e.id}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => openApp(e.app) : undefined}
                onKeyDown={clickable ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openApp(e.app); } } : undefined}
                className={clickable ? 'dex-hover-bg' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  height: 44, padding: '0 var(--space-4)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: 'var(--color-bg-inset)',
                  color: def?.color || 'var(--color-text-tertiary)',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {TYPE_ICON[e.event_type] ?? fallbackIcon}
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {def?.name || e.app || 'System'}{e.source ? ` · ${e.source}` : ''}
                  </span>
                </span>
                <span className="dex-tnum" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
                  {relTime(parseTs(e.created_at))}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LiveActivityBrowser;
