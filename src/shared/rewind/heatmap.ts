// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Activity heatmap (Rewind analytics / Nexus knowledge view). Buckets timestamps
 * into a 7×24 matrix (day-of-week × hour-of-day) for the classic activity
 * heatmap, plus peak detection. Pure: no DOM, no IO.
 */

/** A 7×24 matrix: rows = day of week (0=Sun), cols = hour (0–23). */
export type Heatmap = number[][];

function emptyMatrix(): Heatmap {
  return Array.from({ length: 7 }, () => new Array(24).fill(0));
}

/** Build a 7×24 activity heatmap from event timestamps (epoch ms). */
export function activityHeatmap(timestamps: readonly number[]): Heatmap {
  const m = emptyMatrix();
  for (const ts of timestamps) {
    const d = new Date(ts);
    m[d.getDay()][d.getHours()]++;
  }
  return m;
}

export interface HeatPeak {
  day: number;
  hour: number;
  count: number;
}

/** The busiest (day, hour) cell. count 0 when empty. */
export function heatmapPeak(m: Heatmap): HeatPeak {
  let peak: HeatPeak = { day: 0, hour: 0, count: 0 };
  for (let d = 0; d < m.length; d++) {
    for (let h = 0; h < m[d].length; h++) {
      if (m[d][h] > peak.count) peak = { day: d, hour: h, count: m[d][h] };
    }
  }
  return peak;
}

/** Total events per hour across all days (length-24 array). */
export function hourlyTotals(m: Heatmap): number[] {
  const totals = new Array(24).fill(0);
  for (const row of m) for (let h = 0; h < 24; h++) totals[h] += row[h];
  return totals;
}
