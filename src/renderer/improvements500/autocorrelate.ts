// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Naive autocorrelation of a real-valued signal at lag k for k in 0..n-1.
 * Useful for pitch detection at small sizes.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function autocorrelate(signal: readonly number[]): number[] {
  const n = signal.length;
  const out = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n - k; i++) sum += signal[i]! * signal[i + k]!;
    out[k] = sum;
  }
  return out;
}
