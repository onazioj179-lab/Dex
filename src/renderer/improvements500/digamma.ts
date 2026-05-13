// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Digamma function psi(x) = d/dx ln(Gamma(x)). Uses recurrence to push x
 * above 6 then applies the asymptotic expansion.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function digamma(x: number): number {
  if (x <= 0 && x === Math.floor(x)) return Number.NaN;
  let result = 0;
  let v = x;
  while (v < 6) {
    result -= 1 / v;
    v += 1;
  }
  const inv = 1 / v;
  const inv2 = inv * inv;
  result += Math.log(v) - 0.5 * inv;
  result -=
    inv2 *
    (1 / 12 - inv2 * (1 / 120 - inv2 * (1 / 252 - inv2 * (1 / 240 - inv2 * (5 / 660)))));
  return result;
}
