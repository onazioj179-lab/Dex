// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Modular inverse + extended Euclidean algorithm. BigInt-based for
 * correctness on values larger than Number can represent safely.
 */

export interface ExtendedGcd {
  gcd: bigint;
  x: bigint;
  y: bigint;
}

/** Returns gcd plus Bezout coefficients (a*x + b*y = gcd). */
export function extendedGcd(a: bigint, b: bigint): ExtendedGcd {
  let oldR = a;
  let r = b;
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return { gcd: oldR, x: oldS, y: oldT };
}

/** Modular inverse of a mod m. Throws if gcd(a, m) != 1. */
export function modInverse(a: bigint, m: bigint): bigint {
  if (m <= 0n) throw new Error('modulus must be positive');
  const { gcd, x } = extendedGcd(((a % m) + m) % m, m);
  if (gcd !== 1n) throw new Error('inverse does not exist');
  return ((x % m) + m) % m;
}
