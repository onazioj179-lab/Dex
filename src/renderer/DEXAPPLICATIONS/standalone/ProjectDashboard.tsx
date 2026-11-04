// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Project Dashboard
 * -----------------------------------------------------------------------------
 * A single per-project overview that aggregates, read-only, the things spread
 * across the workspace: the active Project Space (Stage) it belongs to, open
 * task counts (today / overdue), note totals, and the most recent cross-app
 * activity from the ContextBus replay buffer.
 *
 * Everything here is a CONSUMER. It reads existing surfaces — the stage store,
 * the Tasks localStorage payload, the Notes store, the ContextBus ring buffer —
 * and never invents backend channels. Each data source is independently guarded
 * so a missing one degrades to an empty state instead of breaking the panel.
 *
 * Navigation is fire-and-forget via the `dex-open-app` CustomEvent (the same
 * contract AppManager listens on), and feedback uses `dex-toast`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStageStore, STAGE_KIND_META, type StageKind } from '../../store/stageStore';
import { ContextBus, type ContextChannel } from '../../services/ContextBus';
import { frameScheduler } from '../../services/FrameScheduler';

// ---------------------------------------------------------------------------
// Cross-app helpers (match the standalone-app conventions)
// ---------------------------------------------------------------------------

/** Open another DEX app. AppManager resolves by id/name from the detail. */
function openApp(appId: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId } }));
  } catch { /* navigation is best-effort */ }
}

/** Lightweight toast via the shared dex-toast contract. */
function toast(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch { /* toast is best-effort */ }
}

// ---------------------------------------------------------------------------
// Tasks (read-only view over the Tasks app's localStorage payload)
// ---------------------------------------------------------------------------
// Tasks persists at localStorage['dex-tasks'] as an array of task objects with
// `dueDate` serialized as an ISO string (or null). We only READ it here.

interface RawTask {
  id?: string;
  title?: string;
  completed?: boolean;
  dueDate?: string | null;
  dueTime?: string | null;
  snoozedUntil?: string | null;
}

interface TaskSummary {
  available: boolean;
  open: number;
  today: number;
  overdue: number;
}

const EMPTY_TASKS: TaskSummary = { available: false, open: 0, today: 0, overdue: 0 };

function startOfDay(d: Date): number {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r.getTime();
}

/** Resolve a task's effective due timestamp (folding in the optional time-of-day). */
function taskDueMs(t: RawTask): number | null {
  if (!t.dueDate) return null;
  const d = new Date(t.dueDate);
  if (isNaN(d.getTime())) return null;
  if (t.dueTime) {
    const [h, m] = String(t.dueTime).split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

function isSnoozed(t: RawTask, now: number): boolean {
  if (!t.snoozedUntil) return false;
  const until = new Date(t.snoozedUntil);
  return !isNaN(until.getTime()) && until.getTime() > now;
}

function readTaskSummary(): TaskSummary {
  try {
    const raw = localStorage.getItem('dex-tasks');
    if (!raw) return EMPTY_TASKS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_TASKS;
    const now = Date.now();
    const todayStart = startOfDay(new Date(now));
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;
    let open = 0;
    let today = 0;
    let overdue = 0;
    for (const t of parsed as RawTask[]) {
      if (!t || t.completed) continue;
      open += 1;
      if (isSnoozed(t, now)) continue;
      const due = taskDueMs(t);
      if (due == null) continue;
      if (due < now) overdue += 1;
      else if (due >= todayStart && due < todayEnd) today += 1;
    }
    return { available: true, open, today, overdue };
  } catch {
    return EMPTY_TASKS;
  }
}

// ---------------------------------------------------------------------------
// Notes (read-only view over the Notes store's localStorage fallback)
// ---------------------------------------------------------------------------
// notesStore persists its browser/native fallback at localStorage['dex-notes-
// fallback-v1']. We read only the lightweight list (id/title/updated_at) so the
// dashboard stays decoupled from the live Zustand store and never triggers IPC.

interface NoteListLite {
  id: string;
  title: string;
  updated_at: number;
}

interface NotesSummary {
  available: boolean;
  total: number;
  recent: NoteListLite[];
}

const EMPTY_NOTES: NotesSummary = { available: false, total: 0, recent: [] };

function readNotesSummary(): NotesSummary {
  try {
    const raw = localStorage.getItem('dex-notes-fallback-v1');
    if (!raw) return EMPTY_NOTES;
    const parsed = JSON.parse(raw);
    const notesObj = parsed && typeof parsed === 'object' ? parsed.notes : null;
    if (!notesObj || typeof notesObj !== 'object') return EMPTY_NOTES;
    const list: NoteListLite[] = Object.values(notesObj as Record<string, unknown>)
      .map((n) => {
        const note = (n || {}) as Record<string, unknown>;
        return {
          id: String(note.id ?? ''),
          title: String(note.title ?? '').trim() || 'Untitled',
          updated_at: Number(note.updated_at ?? 0) || 0,
        };
      })
      .filter((n) => n.id);
    list.sort((a, b) => b.updated_at - a.updated_at);
    return { available: true, total: list.length, recent: list.slice(0, 5) };
  } catch {
    return EMPTY_NOTES;
  }
}

// ---------------------------------------------------------------------------
// Activity (ContextBus replay ring buffer)
// ---------------------------------------------------------------------------

interface ActivityItem {
  channel: ContextChannel;
  ts: number;
  label: string;
  /** App to open on click-through, when derivable from the payload. */
  appId?: string;
}

/** A human label + click target for a buffered ContextBus event. */
function describeEvent(channel: ContextChannel, payload: unknown): { label: string; appId?: string } {
  const p = (payload || {}) as Record<string, unknown>;
  const appId = typeof p.appId === 'string' ? p.appId : (typeof p.source === 'string' ? p.source : undefined);
  const title = typeof p.title === 'string' ? p.title : undefined;
  const path = typeof p.path === 'string' ? p.path : undefined;
  const base = path ? path.split(/[\\/]/).pop() || path : undefined;
  switch (channel) {
    case 'app:opened':       return { label: `Opened ${appId ?? 'app'}`, appId };
    case 'app:closed':       return { label: `Closed ${appId ?? 'app'}`, appId };
    case 'app:focused':      return { label: `Focused ${appId ?? 'app'}`, appId };
    case 'file:saved':       return { label: `Saved ${base ?? 'file'}`, appId };
    case 'file:opened':      return { label: `Opened ${base ?? 'file'}`, appId };
    case 'task:created':     return { label: `New task: ${title ?? 'task'}`, appId: 'tasks' };
    case 'task:completed':   return { label: 'Completed a task', appId: 'tasks' };
    case 'note:opened':      return { label: `Opened note${title ? `: ${title}` : ''}`, appId: 'notes' };
    case 'note:saved':       return { label: 'Saved a note', appId: 'notes' };
    case 'selection:changed':return { label: `Selection in ${appId ?? 'app'}`, appId };
    case 'clipboard:updated':return { label: 'Clipboard updated' };
    case 'workflow:trigger': return { label: `Workflow: ${typeof p.reason === 'string' ? p.reason : 'triggered'}` };
    case 'ambient:hint':     return { label: typeof p.text === 'string' ? p.text : 'Ambient hint' };
    case 'continuity:project': return { label: 'Project context switched' };
    case 'continuity:stage':   return { label: 'Workspace switched' };
    default:                 return { label: channel.replace(/[:_]/g, ' '), appId };
  }
}

function readActivity(limit: number): ActivityItem[] {
  try {
    const events = ContextBus.replay();
    if (!Array.isArray(events) || events.length === 0) return [];
    return events
      .slice()
      .reverse()
      .slice(0, limit)
      .map((e) => {
        const { label, appId } = describeEvent(e.channel, e.payload);
        return { channel: e.channel, ts: e.ts, label, appId };
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
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

// ---------------------------------------------------------------------------
// Quick links
// ---------------------------------------------------------------------------

const QUICK_LINKS: { appId: string; label: string }[] = [
  { appId: 'tasks', label: 'Tasks' },
  { appId: 'notes', label: 'Notes' },
  { appId: 'kanban', label: 'Kanban' },
  { appId: 'calendar', label: 'Calendar' },
];

// ---------------------------------------------------------------------------
// Tiny inline visuals (no asset deps — pure SVG, theme-token colored)
// ---------------------------------------------------------------------------

/** A thin progress ring. `frac` in [0,1]; null renders a muted empty track. */
const ProgressRing: React.FC<{ frac: number | null; color: string; size?: number }> = ({
  frac, color, size = 30,
}) => {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-border)" strokeWidth={stroke}
      />
      {frac != null && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      )}
    </svg>
  );
};

/** A compact 24-hour activity sparkline rendered as normalized bars. */
const Sparkline: React.FC<{ buckets: number[]; max: number; color: string }> = ({
  buckets, max, color,
}) => (
  <div style={s.spark} aria-hidden="true">
    {buckets.map((v, i) => (
      <span
        key={i}
        style={{
          ...s.sparkBar,
          height: `${Math.max(6, Math.round((v / max) * 100))}%`,
          background: v > 0 ? color : 'var(--color-border)',
          opacity: v > 0 ? 0.9 : 0.5,
        }}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ACTIVITY_LIMIT = 12;

// Scoped interaction polish for the dashboard's clickable surfaces (a half-applied
// edit referenced this without defining it; completed here).
const SCOPED_CSS = `
.dex-projdash-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
.dex-projdash-card:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,0,0,0.28); }
.dex-projdash-card:not(:disabled):active { transform: translateY(0) scale(0.99); }
.dex-projdash-link { transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease; }
.dex-projdash-link:hover { transform: translateY(-1px); border-color: var(--color-accent); }
.dex-projdash-link:active { transform: scale(0.97); }
.dex-projdash-row { transition: background 0.1s ease; }
.dex-projdash-row:not(:disabled):hover { background: var(--color-bg-hover, rgba(255,255,255,0.05)); }
.dex-projdash-refresh { transition: transform 0.12s ease, background 0.12s ease, color 0.12s ease; }
.dex-projdash-refresh:hover { background: var(--color-bg-surface); color: var(--color-text-primary); }
.dex-projdash-refresh:active { transform: scale(0.96); }
`;

const ProjectDashboard: React.FC = () => {
  // The active Project Space (Stage) IS the active "project" context in DEX.
  const activeStage = useStageStore((st) => st.getActiveStage());

  const [tasks, setTasks] = useState<TaskSummary>(EMPTY_TASKS);
  const [notes, setNotes] = useState<NotesSummary>(EMPTY_NOTES);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const refresh = useCallback(() => {
    setTasks(readTaskSummary());
    setNotes(readNotesSummary());
    setActivity(readActivity(ACTIVITY_LIMIT));
  }, []);

  useEffect(() => {
    refresh();
    // Re-read on focus (cheap, localStorage + in-memory) and on a slow poll so
    // the overview stays roughly live without subscribing to every store.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => frameScheduler.schedule(refresh, { appId: 'projectdash', priority: 'idle' }), 15000);
    // Catch cross-app activity as it streams in — the bus drives the live feed.
    const offs: Array<() => void> = [];
    const channels: ContextChannel[] = [
      'app:opened', 'app:closed', 'file:saved', 'file:opened',
      'task:created', 'task:completed', 'note:opened', 'note:saved',
    ];
    try {
      for (const ch of channels) {
        offs.push(ContextBus.on(ch, () => setActivity(readActivity(ACTIVITY_LIMIT))));
      }
    } catch { /* bus unavailable — poll still covers it */ }
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      offs.forEach((off) => { try { off(); } catch { /* noop */ } });
    };
  }, [refresh]);

  const kind: StageKind = (activeStage?.kind as StageKind) || 'general';
  const kindMeta = STAGE_KIND_META[kind] ?? STAGE_KIND_META.general;
  const accent = activeStage?.accent || kindMeta.accent || 'var(--color-accent)';

  const projectName = activeStage?.name?.trim() || 'No active project';
  const appCount = activeStage?.windows?.length ?? 0;

  // Fraction of open tasks that are clear (not due today / not overdue) — drives
  // the stat-card ring. Degrades to a full ring when there is nothing pressing.
  const tasksClearFrac = tasks.available && tasks.open > 0
    ? Math.max(0, Math.min(1, (tasks.open - tasks.today - tasks.overdue) / tasks.open))
    : 1;

  const stats = useMemo(() => ([
    {
      key: 'tasks',
      label: 'Open tasks',
      value: tasks.available ? tasks.open : null,
      sub: tasks.available
        ? `${tasks.today} today · ${tasks.overdue} overdue`
        : 'Tasks not set up yet',
      appId: 'tasks',
      tone: tasks.overdue > 0 ? 'var(--color-error)' : accent,
      progress: tasks.available ? tasksClearFrac : null,
    },
    {
      key: 'notes',
      label: 'Notes',
      value: notes.available ? notes.total : null,
      sub: notes.available
        ? (notes.recent[0] ? `Latest: ${notes.recent[0].title}` : 'No notes yet')
        : 'Notes not set up yet',
      appId: 'notes',
      tone: accent,
      progress: notes.available && notes.total > 0 ? 1 : null,
    },
    {
      key: 'activity',
      label: 'Recent activity',
      value: activity.length || null,
      sub: activity.length ? 'cross-app events' : 'No activity recorded',
      appId: undefined as string | undefined,
      tone: accent,
      progress: activity.length ? Math.min(1, activity.length / ACTIVITY_LIMIT) : null,
    },
  ]), [tasks, notes, activity, accent, tasksClearFrac]);

  // Compact activity sparkline: events bucketed across the last 24 hours.
  const sparkBuckets = useMemo(() => {
    const buckets = new Array(24).fill(0) as number[];
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    for (const a of activity) {
      const hoursAgo = Math.floor((now - a.ts) / hourMs);
      if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo] += 1;
    }
    return buckets;
  }, [activity]);
  const sparkMax = Math.max(1, ...sparkBuckets);

  return (
    <div style={s.container} className="dex-projdash">
      <style>{SCOPED_CSS}</style>
      {/* ---- Header ---- */}
      <header style={s.header}>
        <div style={s.headerMain}>
          <span style={{ ...s.kindDot, background: accent }} />
          <div style={s.headerText}>
            <div style={s.title}>{projectName}</div>
            <div style={s.subtitle}>
              {kindMeta.label} workspace
              {appCount > 0 ? ` · ${appCount} ${appCount === 1 ? 'window' : 'windows'}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          style={s.refreshBtn}
          className="dex-projdash-refresh"
          onClick={() => { refresh(); toast('info', 'Dashboard refreshed'); }}
          title="Refresh dashboard"
          aria-label="Refresh dashboard"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ flexShrink: 0 }}>
            <path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M18.5 3v3h-3M5.5 21v-3h3"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </header>

      {/* ---- Stat cards ---- */}
      <section style={s.statRow}>
        {stats.map((stat) => (
          <button
            key={stat.key}
            type="button"
            className="dex-liquid-glass dex-projdash-card"
            style={s.statCard}
            onClick={() => stat.appId && openApp(stat.appId)}
            disabled={!stat.appId}
            title={stat.appId ? `Open ${stat.label}` : undefined}
          >
            <div style={s.statTop}>
              <div style={s.statLabel}>{stat.label}</div>
              <ProgressRing frac={stat.progress} color={stat.tone} />
            </div>
            <div style={{ ...s.statValue, color: stat.value == null ? 'var(--color-text-muted)' : stat.tone }}>
              {stat.value == null ? '—' : stat.value}
            </div>
            <div style={s.statSub}>{stat.sub}</div>
          </button>
        ))}
      </section>

      {/* ---- Quick links ---- */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Quick links</div>
        <div style={s.linkRow}>
          {QUICK_LINKS.map((link) => (
            <button
              key={link.appId}
              type="button"
              className="dex-liquid-glass dex-projdash-link"
              style={s.linkBtn}
              onClick={() => openApp(link.appId)}
              title={`Open ${link.label}`}
            >
              {link.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---- Recent activity feed ---- */}
      <section style={{ ...s.section, flex: 1, minHeight: 0 }}>
        <div style={s.sectionHead}>
          <div style={s.sectionLabel}>Recent activity</div>
          {activity.length > 0 && (
            <Sparkline buckets={sparkBuckets} max={sparkMax} color={accent} />
          )}
        </div>
        {activity.length === 0 ? (
          <div style={s.empty}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              style={{ opacity: 0.5, marginBottom: 4 }}>
              <path d="M3 12h4l2 6 4-14 2 8h6" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={s.emptyTitle}>No recent activity yet</div>
            <div style={s.emptyHint}>As you work across apps, events stream in here.</div>
          </div>
        ) : (
          <div style={s.feed}>
            {activity.map((item, i) => {
              const clickable = !!item.appId;
              return (
                <button
                  key={`${item.channel}-${item.ts}-${i}`}
                  type="button"
                  className={clickable ? 'dex-projdash-row' : undefined}
                  style={{ ...s.feedRow, cursor: clickable ? 'pointer' : 'default' }}
                  onClick={() => item.appId && openApp(item.appId)}
                  disabled={!clickable}
                  title={clickable ? `Open ${item.appId}` : undefined}
                >
                  <span style={{ ...s.feedDot, background: accent }} aria-hidden="true" />
                  <span style={s.feedLabel}>{item.label}</span>
                  <span style={s.feedTime}>{relativeTime(item.ts)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Recent notes (when present) ---- */}
      {notes.available && notes.recent.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionLabel}>Recent notes</div>
          <div style={s.feed}>
            {notes.recent.map((n) => (
              <button
                key={n.id}
                type="button"
                className="dex-projdash-row"
                style={{ ...s.feedRow, cursor: 'pointer' }}
                onClick={() => openApp('notes')}
                title="Open Notes"
              >
                <span style={{ ...s.feedDot, background: accent }} aria-hidden="true" />
                <span style={s.feedLabel}>{n.title}</span>
                <span style={s.feedTime}>{relativeTime(n.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles (standalone-app token conventions)
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
    padding: 'var(--space-5)', overflow: 'auto',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--space-4)', flexShrink: 0,
  },
  headerMain: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 },
  kindDot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
  headerText: { minWidth: 0 },
  title: {
    fontSize: 20, fontWeight: 700, lineHeight: 1.2,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  subtitle: { fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 2 },
  refreshBtn: {
    padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
    fontFamily: 'var(--font-family)',
  },
  statRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 'var(--space-3)', flexShrink: 0,
  },
  statCard: {
    display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
    padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
    cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  statLabel: { fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 },
  statValue: { fontSize: 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  statSub: {
    fontSize: 12, color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 },
  sectionLabel: {
    fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  linkRow: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  linkBtn: {
    padding: '8px 16px', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  feed: {
    display: 'flex', flexDirection: 'column', gap: 2,
    overflow: 'auto', minHeight: 0,
  },
  feedRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--space-3)', padding: '8px var(--space-3)', borderRadius: 'var(--radius-sm)',
    border: 'none', background: 'transparent', textAlign: 'left',
    color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: 13,
  },
  feedLabel: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 },
  feedTime: {
    fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
    border: '1px dashed var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center',
  },
};

export default ProjectDashboard;
