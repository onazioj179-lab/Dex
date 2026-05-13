// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Miller-Rabin probabilistic primality test using BigInt arithmetic.
 * Deterministic for n < 2^64 with the standard 12-witness set.
 */

const WITNESSES: readonly bigint[] = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
];

function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/** Miller-Rabin primality. Accepts number or BigInt. Deterministic for n < 2^64. */
export function millerRabin(n: number | bigint): boolean {
  const N = typeof n === 'bigint' ? n : BigInt(n);
  if (N < 2n) return false;
  if (N === 2n || N === 3n) return true;
  if ((N & 1n) === 0n) return false;
  let d = N - 1n;
  let r = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r += 1;
  }
  outer: for (const a of WITNESSES) {
    if (a >= N) continue;
    let x = modpow(a, d, N);
    if (x === 1n || x === N - 1n) continue;
    for (let i = 0; i < r - 1; i += 1) {
      x = (x * x) % N;
      if (x === N - 1n) continue outer;
    }
    return false;
  }
  return true;
}
