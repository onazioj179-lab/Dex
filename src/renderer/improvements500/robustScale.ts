// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Robust scaler: subtracts the median and divides by the median absolute
 * deviation (MAD). Less sensitive to outliers than z-score normalization.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface RobustScaleResult {
  values: number[];
  median: number;
  mad: number;
}

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) >> 1]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

export function robustScale(data: readonly number[]): RobustScaleResult {
  const n = data.length;
  if (n === 0) return { values: [], median: 0, mad: 0 };
  const sorted = data.slice().sort((a, b) => a - b);
  const median = medianOf(sorted);
  const devs = data.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = medianOf(devs);
  if (mad === 0) return { values: new Array<number>(n).fill(0), median, mad };
  const values = new Array<number>(n);
  for (let i = 0; i < n; i++) values[i] = (data[i]! - median) / mad;
  return { values, median, mad };
}
