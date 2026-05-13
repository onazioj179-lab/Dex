// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Chinese Remainder Theorem solver. Given pairs (remainder, modulus)
 * with pairwise coprime moduli, returns the unique x in [0, M) where
 * M is the product, satisfying x ≡ remainder_i (mod modulus_i).
 */

function egcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { g: a, x: 1n, y: 0n };
  const r = egcd(b, a % b);
  return { g: r.g, x: r.y, y: r.x - (a / b) * r.y };
}

function modPos(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

export interface CrtPair {
  remainder: bigint;
  modulus: bigint;
}

export interface CrtResult {
  remainder: bigint;
  modulus: bigint;
}

/**
 * Generalized CRT - works even with non-coprime moduli (returns a
 * unique solution mod lcm), or throws when systems are inconsistent.
 */
export function chineseRemainder(pairs: ReadonlyArray<CrtPair>): CrtResult {
  if (pairs.length === 0) return { remainder: 0n, modulus: 1n };
  let r1 = modPos(pairs[0]!.remainder, pairs[0]!.modulus);
  let m1 = pairs[0]!.modulus;
  for (let i = 1; i < pairs.length; i += 1) {
    const r2 = modPos(pairs[i]!.remainder, pairs[i]!.modulus);
    const m2 = pairs[i]!.modulus;
    const g = egcd(m1, m2);
    const diff = r2 - r1;
    if (diff % g.g !== 0n) throw new Error('CRT system has no solution');
    const lcm = (m1 / g.g) * m2;
    const k = modPos((diff / g.g) * g.x, m2 / g.g);
    r1 = modPos(r1 + m1 * k, lcm);
    m1 = lcm;
  }
  return { remainder: r1, modulus: m1 };
}
