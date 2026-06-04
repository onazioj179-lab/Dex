// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hour-of-day activity histogram (Rewind heatmap, "when are you productive").
 * Buckets timestamps into 24 local-hour bins and finds the peak hour. Pure: no
 * DOM, no IO.
 */

export interface TimedEvent { ts: number }

/** Counts per local hour (index 0–23). */
export function hourHistogram(events: readonly TimedEvent[]): number[] {
  const bins = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.ts).getHours();
    if (h >= 0 && h < 24) bins[h]++;
  }
  return bins;
}

/** The busiest hour (0–23), or -1 when there is no activity. */
export function peakHour(events: readonly TimedEvent[]): number {
  const bins = hourHistogram(events);
  let peak = -1;
  let best = 0;
  for (let h = 0; h < 24; h++) {
    if (bins[h] > best) { best = bins[h]; peak = h; }
  }
  return peak;
}

/** Sum of activity in a [startHour, endHour) window (handles wrap-around). */
export function activityInWindow(events: readonly TimedEvent[], startHour: number, endHour: number): number {
  const bins = hourHistogram(events);
  let total = 0;
  for (let h = 0; h < 24; h++) {
    const inWindow = startHour <= endHour
      ? h >= startHour && h < endHour
      : h >= startHour || h < endHour; // wraps past midnight
    if (inWindow) total += bins[h];
  }
  return total;
}
