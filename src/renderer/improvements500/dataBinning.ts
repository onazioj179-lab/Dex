// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Histogram binning for charts and analytics. Equal-width bins by default.
 * Provides a Sturges-rule auto-bin-count helper.
 */

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface HistogramOptions {
  bins?: number;
  /** Override min (default: data min). */
  min?: number;
  /** Override max (default: data max). */
  max?: number;
}

export function sturgesBinCount(n: number): number {
  if (n <= 0) return 1;
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

export function histogram(values: ReadonlyArray<number>, opts: HistogramOptions = {}): HistogramBin[] {
  if (values.length === 0) return [];
  let mn = opts.min ?? Infinity;
  let mx = opts.max ?? -Infinity;
  if (opts.min === undefined || opts.max === undefined) {
    for (const v of values) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  if (mn === mx) {
    return [{ start: mn, end: mn, count: values.length }];
  }
  const binCount = Math.max(1, opts.bins ?? sturgesBinCount(values.length));
  const width = (mx - mn) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i += 1) {
    bins.push({ start: mn + i * width, end: mn + (i + 1) * width, count: 0 });
  }
  for (const v of values) {
    if (v < mn || v > mx) continue;
    let idx = Math.floor((v - mn) / width);
    if (idx === binCount) idx = binCount - 1; // include max in last bin
    bins[idx].count += 1;
  }
  return bins;
}
