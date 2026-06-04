// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-app usage time (Rewind analytics, Home insights). Attributes the dwell
 * between consecutive activity events to the earlier event's app and sums per
 * app. Pure: no DOM, no IO.
 */

export interface UsageEvent {
  ts: number;
  appId: string;
}

export interface AppUsage {
  appId: string;
  ms: number;
  share: number; // 0..1 of total tracked time
}

/**
 * Total tracked time per app, most-used first. `maxGapMs` caps the dwell
 * attributed to a single gap (so an overnight gap doesn't count as usage).
 */
export function appUsage(events: readonly UsageEvent[], maxGapMs = 5 * 60_000): AppUsage[] {
  if (events.length < 2) {
    return events.length === 1 ? [{ appId: events[0].appId, ms: 0, share: 0 }] : [];
  }
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const totals = new Map<string, number>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const dwell = Math.min(maxGapMs, Math.max(0, sorted[i + 1].ts - sorted[i].ts));
    totals.set(sorted[i].appId, (totals.get(sorted[i].appId) ?? 0) + dwell);
  }

  let grand = 0;
  totals.forEach((ms) => { grand += ms; });

  return Array.from(totals.entries())
    .map(([appId, ms]) => ({ appId, ms, share: grand > 0 ? ms / grand : 0 }))
    .sort((a, b) => b.ms - a.ms);
}

/** The single most-used app, or null. */
export function mostUsedApp(events: readonly UsageEvent[], maxGapMs?: number): string | null {
  const usage = appUsage(events, maxGapMs);
  return usage.length ? usage[0].appId : null;
}
