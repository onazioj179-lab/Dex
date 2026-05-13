// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Z-score normalization: subtracts the sample mean and divides by the
 * sample standard deviation. Returns a new array; the input is not
 * mutated. If stddev is zero, returns an array of zeros.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ZScoreResult {
  values: number[];
  mean: number;
  stddev: number;
}

export function zScoreNormalize(data: readonly number[]): ZScoreResult {
  const n = data.length;
  if (n === 0) return { values: [], mean: 0, stddev: 0 };
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of data) sq += (v - mean) * (v - mean);
  const stddev = Math.sqrt(sq / n);
  if (stddev === 0) return { values: new Array<number>(n).fill(0), mean, stddev };
  const values = new Array<number>(n);
  for (let i = 0; i < n; i++) values[i] = (data[i]! - mean) / stddev;
  return { values, mean, stddev };
}
