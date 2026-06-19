// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Activity-pattern insights (DEX v6 Track G). Synthesizes the Learn app's
 * hourly / day-of-week activity totals into human-meaningful peaks -- the busiest
 * consecutive hour window and the busiest day. Pure + unit-tested; turns raw
 * heatmap data into a one-line "you're most active..." summary.
 */

export interface PeakWindow {
  /** Inclusive start hour (0-23). */
  startHour: number;
  /** Exclusive end hour (1-24). */
  endHour: number;
  /** Total activity within the window. */
  score: number;
}

/**
 * Find the consecutive hour window of length `windowSize` with the highest
 * summed activity. Returns null when there is no activity at all.
 */
export function findPeakHourWindow(hourTotals: number[], windowSize = 3): PeakWindow | null {
  const n = hourTotals.length;
  if (n === 0 || windowSize <= 0) return null;
  const w = Math.min(windowSize, n);

  let best = -1;
  let bestStart = 0;
  for (let start = 0; start + w <= n; start++) {
    let sum = 0;
    for (let i = start; i < start + w; i++) sum += hourTotals[i] || 0;
    if (sum > best) { best = sum; bestStart = start; }
  }

  return best > 0 ? { startHour: bestStart, endHour: bestStart + w, score: best } : null;
}

/**
 * Index of the single largest value, or null when every value is zero/negative.
 * Ties resolve to the earliest index.
 */
export function peakIndex(totals: number[]): number | null {
  let best = 0;
  let idx = -1;
  for (let i = 0; i < totals.length; i++) {
    const v = totals[i] || 0;
    if (v > best) { best = v; idx = i; }
  }
  return idx >= 0 ? idx : null;
}
