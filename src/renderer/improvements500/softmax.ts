// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Numerically stable softmax. Subtracts max for stability.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function softmax(x: readonly number[]): number[] {
  const n = x.length;
  if (n === 0) return [];
  let m = x[0]!;
  for (let i = 1; i < n; i++) if (x[i]! > m) m = x[i]!;
  let sum = 0;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.exp(x[i]! - m);
    sum += out[i]!;
  }
  if (sum === 0) return new Array<number>(n).fill(1 / n);
  for (let i = 0; i < n; i++) out[i] = out[i]! / sum;
  return out;
}
