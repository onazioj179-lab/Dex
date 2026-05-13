// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Theil-Sen estimator: robust median-of-slopes linear regression.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface TheilSenResult {
  slope: number;
  intercept: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n % 2 === 1) return sorted[(n - 1) >> 1]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

export function theilSen(xs: readonly number[], ys: readonly number[]): TheilSenResult {
  const n = xs.length;
  if (n !== ys.length) throw new RangeError('theilSen: xs and ys must match');
  if (n < 2) throw new RangeError('theilSen: need at least 2 points');

  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx !== 0) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  if (slopes.length === 0) throw new RangeError('theilSen: degenerate xs');

  const slope = median(slopes);
  const intercepts: number[] = [];
  for (let i = 0; i < n; i++) intercepts.push(ys[i]! - slope * xs[i]!);
  return { slope, intercept: median(intercepts) };
}
