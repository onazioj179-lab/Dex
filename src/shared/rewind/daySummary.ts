// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Day summary (Rewind overview / Home insight). Composes the focus score,
 * per-app usage and the activity heatmap into one scannable summary of a day's
 * activity. Pure: no DOM, no IO — built from the other Rewind pure modules.
 */

import { focusScore, type FocusEvent } from './focusScore';
import { appUsage } from './appUsage';
import { activityHeatmap, heatmapPeak } from './heatmap';

export interface DaySummary {
  eventCount: number;
  focus: number;        // 0..100
  topApp: string | null;
  totalActiveMs: number;
  peakHour: number | null; // 0..23
}

/** Build a day summary from activity events ({ ts, appId }). */
export function summarizeDay(events: readonly FocusEvent[]): DaySummary {
  if (events.length === 0) {
    return { eventCount: 0, focus: 0, topApp: null, totalActiveMs: 0, peakHour: null };
  }
  const focus = focusScore(events).score;
  const usage = appUsage(events);
  const totalActiveMs = usage.reduce((sum, u) => sum + u.ms, 0);
  const topApp = usage.length ? usage[0].appId : null;
  const peak = heatmapPeak(activityHeatmap(events.map((e) => e.ts)));

  return {
    eventCount: events.length,
    focus,
    topApp,
    totalActiveMs,
    peakHour: peak.count > 0 ? peak.hour : null,
  };
}
