// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function modPowBig(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod <= 0n) throw new Error('mod must be positive');
  if (mod === 1n) return 0n;
  let r = 1n;
  base = ((base % mod) + mod) % mod;
  let e = exp;
  if (e < 0n) throw new Error('negative exponent not supported');
  while (e > 0n) {
    if (e & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    e >>= 1n;
  }
  return r;
}
