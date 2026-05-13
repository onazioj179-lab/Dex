// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Layer normalization across the feature dimension of a single sample.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface LayerNormOptions {
  epsilon?: number;
  gamma?: ReadonlyArray<number>;
  beta?: ReadonlyArray<number>;
}

export function layerNormalize(x: readonly number[], options: LayerNormOptions = {}): number[] {
  const n = x.length;
  if (n === 0) return [];
  let mean = 0;
  for (const v of x) mean += v;
  mean /= n;
  let varSum = 0;
  for (const v of x) varSum += (v - mean) * (v - mean);
  const variance = varSum / n;
  const eps = options.epsilon ?? 1e-5;
  const denom = Math.sqrt(variance + eps);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let normalized = (x[i]! - mean) / denom;
    if (options.gamma) normalized *= options.gamma[i] ?? 1;
    if (options.beta) normalized += options.beta[i] ?? 0;
    out[i] = normalized;
  }
  return out;
}
