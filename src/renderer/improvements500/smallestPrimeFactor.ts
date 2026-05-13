// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Smallest-prime-factor sieve (linear sieve). Returns an Int32Array
 * `spf` of length n+1 where spf[i] is the smallest prime factor of i
 * (with spf[0] = spf[1] = 0). Allows O(log n) factorization.
 */

export function smallestPrimeFactorSieve(n: number): Int32Array {
  if (!Number.isInteger(n) || n < 0) throw new Error('smallestPrimeFactorSieve: n must be non-negative integer');
  const spf = new Int32Array(n + 1);
  const primes: number[] = [];
  for (let i = 2; i <= n; i += 1) {
    if (spf[i] === 0) {
      spf[i] = i;
      primes.push(i);
    }
    for (let j = 0; j < primes.length; j += 1) {
      const p = primes[j]!;
      const m = i * p;
      if (p > spf[i]! || m > n) break;
      spf[m] = p;
    }
  }
  return spf;
}

/** Factorize using a precomputed SPF sieve. */
export function factorizeWithSpf(n: number, spf: Int32Array): number[] {
  if (n < 2) return [];
  const out: number[] = [];
  let v = n;
  while (v > 1) {
    const p = spf[v]!;
    out.push(p);
    v = Math.floor(v / p);
  }
  return out;
}
