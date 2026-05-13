// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function percentileLinear(values: ReadonlyArray<number>, p: number): number {
  if (values.length === 0) return NaN;
  if (p < 0 || p > 1) throw new RangeError('p must be in [0,1]');
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

export function quantiles(values: ReadonlyArray<number>, qs: ReadonlyArray<number>): number[] {
  return qs.map((q) => percentileLinear(values, q));
}
