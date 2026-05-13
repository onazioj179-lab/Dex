// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Basic descriptive statistics on numeric arrays. Empty inputs return NaN
 * (rather than throwing) for mean/median/stddev so they compose with chart
 * rendering paths that may not yet have data.
 */

export function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function variance(values: ReadonlyArray<number>): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  let s = 0;
  for (const v of values) {
    const d = v - m;
    s += d * d;
  }
  return s / (values.length - 1); // sample variance
}

export function stddev(values: ReadonlyArray<number>): number {
  const v = variance(values);
  return Number.isNaN(v) ? NaN : Math.sqrt(v);
}

/** Linear-interpolation percentile (q in [0, 1]). */
export function percentile(values: ReadonlyArray<number>, q: number): number {
  if (values.length === 0) return NaN;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function minMax(values: ReadonlyArray<number>): { min: number; max: number } {
  if (values.length === 0) return { min: NaN, max: NaN };
  let mn = values[0];
  let mx = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
}
