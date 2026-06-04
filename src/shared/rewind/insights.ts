// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind insights service (Home/Rewind dashboard view-model). Composes the
 * Rewind analytics primitives — sessions (`timeline`), per-app time (`appUsage`),
 * hour histogram, focus score, streaks — into a single structured summary the UI
 * renders. This is the integration layer that makes those pure modules
 * load-bearing. Pure: no DOM, no IO.
 */

import { buildTimeline } from './timeline';
import { appUsage, type AppUsage } from './appUsage';
import { hourHistogram, peakHour } from './hourHistogram';
import { focusScore } from './focusScore';
import { computeStreaks, type StreakResult } from './streak';

export interface InsightEvent {
  ts: number;
  appId: string;
}

export interface RewindInsights {
  eventCount: number;
  sessionCount: number;
  appUsage: AppUsage[];
  topApp: string | null;
  hourHistogram: number[];
  peakHour: number;
  focus: number;
  streaks: StreakResult;
  activeDays: string[];
}

function dateShard(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Build the full insights view-model from raw activity events. */
export function rewindInsights(events: readonly InsightEvent[], today: string): RewindInsights {
  const sessions = buildTimeline(events.map((e) => ({ ts: e.ts, appId: e.appId, kind: 'app' })));
  const usage = appUsage(events);
  const activeDays = Array.from(new Set(events.map((e) => dateShard(e.ts)))).sort();

  return {
    eventCount: events.length,
    sessionCount: sessions.length,
    appUsage: usage,
    topApp: usage.length ? usage[0].appId : null,
    hourHistogram: hourHistogram(events),
    peakHour: peakHour(events),
    focus: focusScore(events).score,
    streaks: computeStreaks(activeDays, today),
    activeDays,
  };
}
