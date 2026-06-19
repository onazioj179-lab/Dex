// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lap statistics for the Stopwatch (DEX v6 Track G). Given the per-lap split
 * durations (NOT cumulative times), returns aggregate stats. Pure + unit-tested;
 * the Stopwatch uses it for the average / median / consistency footer.
 */

export interface LapStats {
  /** Number of valid (finite, positive) splits considered. */
  count: number;
  /** Sum of all splits. */
  total: number;
  /** Arithmetic mean split duration. */
  average: number;
  /** Median split duration (mean of the two middle values when even). */
  median: number;
  /** Fastest (smallest) split. */
  fastest: number;
  /** Slowest (largest) split. */
  slowest: number;
  /** Population standard deviation of the splits (a consistency measure). */
  stdDev: number;
}

/**
 * Aggregate per-lap split durations. Ignores non-finite or non-positive values
 * (a partial/zero lap should not skew the stats). Returns null when nothing
 * usable remains.
 */
export function computeLapStats(splits: number[]): LapStats | null {
  const valid = splits.filter(s => Number.isFinite(s) && s > 0);
  if (valid.length === 0) return null;

  const total = valid.reduce((a, b) => a + b, 0);
  const average = total / valid.length;

  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  const variance = valid.reduce((a, b) => a + (b - average) ** 2, 0) / valid.length;

  return {
    count: valid.length,
    total,
    average,
    median,
    fastest: sorted[0],
    slowest: sorted[sorted.length - 1],
    stdDev: Math.sqrt(variance),
  };
}
