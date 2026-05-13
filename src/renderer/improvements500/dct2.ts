// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Discrete cosine transform type II (DCT-II), naive O(N^2). Useful for
 * audio analysis and JPEG-style compression at small block sizes.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function dct2(input: readonly number[]): number[] {
  const n = input.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  const factor = Math.PI / n;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += input[i]! * Math.cos(factor * (i + 0.5) * k);
    out[k] = sum;
  }
  return out;
}

export function idct2(input: readonly number[]): number[] {
  const n = input.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  const factor = Math.PI / n;
  for (let i = 0; i < n; i++) {
    let sum = 0.5 * input[0]!;
    for (let k = 1; k < n; k++) sum += input[k]! * Math.cos(factor * (i + 0.5) * k);
    out[i] = (2 * sum) / n;
  }
  return out;
}
