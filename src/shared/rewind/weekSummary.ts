// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Week summary aggregation (Rewind weekly report, Home trends). Rolls a set of
 * per-day summaries into a week view: totals, average focus, busiest day, and
 * the most-frequent top app. Pure: composes `DaySummary`. No DOM, no IO.
 */

import type { DaySummary } from './daySummary';

export interface WeekSummary {
  days: number;
  totalEvents: number;
  totalActiveMs: number;
  avgFocus: number;        // mean focus over active days
  topApp: string | null;   // most-frequent top app across days
  busiestDayIndex: number; // index of the day with the most events (-1 when empty)
}

/** Aggregate per-day summaries into a week summary (input order = day order). */
export function weekSummary(daySummaries: readonly DaySummary[]): WeekSummary {
  if (daySummaries.length === 0) {
    return { days: 0, totalEvents: 0, totalActiveMs: 0, avgFocus: 0, topApp: null, busiestDayIndex: -1 };
  }

  let totalEvents = 0;
  let totalActiveMs = 0;
  let focusSum = 0;
  let activeDays = 0;
  let busiestDayIndex = 0;
  let busiestEvents = -1;
  const appCounts = new Map<string, number>();

  daySummaries.forEach((d, i) => {
    totalEvents += d.eventCount;
    totalActiveMs += d.totalActiveMs;
    if (d.eventCount > 0) { focusSum += d.focus; activeDays++; }
    if (d.eventCount > busiestEvents) { busiestEvents = d.eventCount; busiestDayIndex = i; }
    if (d.topApp) appCounts.set(d.topApp, (appCounts.get(d.topApp) ?? 0) + 1);
  });

  let topApp: string | null = null;
  let topCount = 0;
  appCounts.forEach((count, app) => { if (count > topCount) { topCount = count; topApp = app; } });

  return {
    days: daySummaries.length,
    totalEvents,
    totalActiveMs,
    avgFocus: activeDays === 0 ? 0 : Math.round(focusSum / activeDays),
    topApp,
    busiestDayIndex,
  };
}
