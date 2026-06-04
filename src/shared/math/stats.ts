// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Descriptive statistics (Rewind analytics, perf metrics, usage charts). Pure
 * array math — empty inputs return 0 (or NaN-free defaults). No DOM, no IO.
 */

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function min(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

export function max(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/** Median (average of the two middle values for even counts). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** The `p` (0..1) percentile via linear interpolation. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Clamped sum-to-1 normalization of a weight array (empty → []). */
export function normalizeWeights(values: readonly number[]): number[] {
  const total = sum(values.map((v) => Math.max(0, v)));
  if (total === 0) return values.map(() => 0);
  return values.map((v) => Math.max(0, v) / total);
}
