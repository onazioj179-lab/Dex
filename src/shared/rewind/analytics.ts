// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind activity analytics (RWD-039/040) — pure rollups over the same
 * `ActivityEvent` stream that `timeline.ts` groups into sessions. Powers the
 * "most productive time" and per-app usage breakdowns the Rewind/Home views
 * surface. No DOM, no IO, no clock dependency.
 */

import type { ActivityEvent } from './timeline';

export interface AppUsage {
  appId: string;
  count: number;
  /** Share of all events, 0..1. */
  share: number;
}

/** Per-app event counts, busiest first, with each app's share of the total. */
export function appUsageBreakdown(events: readonly ActivityEvent[]): AppUsage[] {
  const total = events.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.appId, (counts.get(e.appId) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([appId, count]) => ({ appId, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.appId.localeCompare(b.appId));
}

/** Event counts per local hour 0..23 (index = hour). */
export function activeHours(events: readonly ActivityEvent[]): number[] {
  const hours = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.ts).getHours();
    if (h >= 0 && h < 24) hours[h]++;
  }
  return hours;
}

/** The hour (0..23) with the most activity, or null when there is none. */
export function busiestHour(events: readonly ActivityEvent[]): number | null {
  if (events.length === 0) return null;
  const hours = activeHours(events);
  let best = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[best]) best = h;
  return hours[best] === 0 ? null : best;
}

/** Distinct apps touched. */
export function distinctApps(events: readonly ActivityEvent[]): number {
  return new Set(events.map((e) => e.appId)).size;
}
