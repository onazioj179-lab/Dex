// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Batch normalization across a batch of scalars (1D feature). Returns
 * the normalized batch and the running statistics for inference reuse.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface BatchNormResult {
  values: number[];
  mean: number;
  variance: number;
}

export function batchNormalize(batch: readonly number[], epsilon = 1e-5): BatchNormResult {
  const n = batch.length;
  if (n === 0) return { values: [], mean: 0, variance: 0 };
  let mean = 0;
  for (const v of batch) mean += v;
  mean /= n;
  let varSum = 0;
  for (const v of batch) varSum += (v - mean) * (v - mean);
  const variance = varSum / n;
  const denom = Math.sqrt(variance + epsilon);
  const values = new Array<number>(n);
  for (let i = 0; i < n; i++) values[i] = (batch[i]! - mean) / denom;
  return { values, mean, variance };
}
