// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind — timeline view layer. `buildTimeline` (./timeline) turns raw events
 * into sessions; this turns sessions into something the Rewind UI can render: a
 * day-grouped, newest-first list with relative headings ("Today", "Yesterday"),
 * human session labels ("Afternoon in VINX — 12 events"), filtering, and
 * duration formatting. Pure — no DOM, no clock except the injectable `now`.
 */

import type { TimelineSession } from './timeline';

// --- day bucketing ---------------------------------------------------------

/** Local midnight (epoch ms) for the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Relative heading for a day bucket vs. the current day. */
export function dayHeading(dayTs: number, nowDayTs: number): string {
  const diffDays = Math.round((nowDayTs - dayTs) / MS_PER_DAY);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const d = new Date(dayTs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export interface DayGroup {
  /** Local start-of-day epoch ms — the bucket key. */
  dayTs: number;
  heading: string;
  /** Sessions in this day, newest-first. */
  sessions: TimelineSession[];
}

/**
 * Group sessions into day buckets, newest day first and newest session first
 * within each day — the order a scannable timeline renders top-to-bottom.
 */
export function groupSessionsByDay(
  sessions: readonly TimelineSession[],
  now: number = Date.now(),
): DayGroup[] {
  const nowDay = startOfDay(now);
  const buckets = new Map<number, TimelineSession[]>();
  for (const s of sessions) {
    const day = startOfDay(s.startTs);
    const arr = buckets.get(day);
    if (arr) arr.push(s);
    else buckets.set(day, [s]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0]) // newest day first
    .map(([dayTs, daySessions]) => ({
      dayTs,
      heading: dayHeading(dayTs, nowDay),
      sessions: daySessions.sort((a, b) => b.startTs - a.startTs), // newest first
    }));
}

// --- human descriptions ----------------------------------------------------

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Coarse time-of-day bucket for `ts` (local). */
export function timeOfDay(ts: number): TimeOfDay {
  const h = new Date(ts).getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Human one-liner for a timeline row, richer than the raw `session.label`:
 * "Afternoon in VINX +1 app — 12 events".
 */
export function describeSession(s: TimelineSession): string {
  const extra = s.appIds.length - 1;
  const others = extra > 0 ? ` +${extra} app${extra > 1 ? 's' : ''}` : '';
  return `${cap(timeOfDay(s.startTs))} in ${s.primaryAppId}${others} — ${s.eventCount} event${s.eventCount === 1 ? '' : 's'}`;
}

/** Compact duration: "1h 23m", "5m", "12s", "0s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

// --- filtering -------------------------------------------------------------

export interface SessionFilter {
  /** Keep only sessions whose primary app or app set includes this id. */
  appId?: string;
  /** Inclusive lower bound on session start. */
  from?: number;
  /** Inclusive upper bound on session start. */
  to?: number;
  /** Case-insensitive substring over label + app ids. */
  query?: string;
}

/** Filter sessions by app, time window, and/or text query. Order is preserved. */
export function filterSessions(
  sessions: readonly TimelineSession[],
  filter: SessionFilter = {},
): TimelineSession[] {
  const q = filter.query?.trim().toLowerCase();
  return sessions.filter((s) => {
    if (filter.appId && !s.appIds.includes(filter.appId)) return false;
    if (filter.from != null && s.startTs < filter.from) return false;
    if (filter.to != null && s.startTs > filter.to) return false;
    if (q) {
      const hay = `${s.label} ${s.appIds.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
