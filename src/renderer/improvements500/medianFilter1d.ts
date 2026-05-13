// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sliding-window median filter for 1D signals. Window size must be odd.
 * Edges are mirrored.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function medianFilter1d(input: readonly number[], windowSize: number): number[] {
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize % 2 === 0) {
    throw new RangeError('medianFilter1d: windowSize must be a positive odd integer');
  }
  const half = (windowSize - 1) >> 1;
  const n = input.length;
  const out: number[] = new Array(n);
  const buf: number[] = new Array(windowSize);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < windowSize; k++) {
      let idx = i - half + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      if (idx < 0 || idx >= n) idx = i;
      buf[k] = input[idx]!;
    }
    buf.sort((a, b) => a - b);
    out[i] = buf[half]!;
  }
  return out;
}
