// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Numerically stable log-sum-exp.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function logSumExp(x: readonly number[]): number {
  if (x.length === 0) return Number.NEGATIVE_INFINITY;
  let m = x[0]!;
  for (let i = 1; i < x.length; i++) if (x[i]! > m) m = x[i]!;
  if (!Number.isFinite(m)) return m;
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.exp(x[i]! - m);
  return m + Math.log(sum);
}
