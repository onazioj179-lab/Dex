// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Euler's totient function phi(n): number of positive integers <= n
 * coprime with n. Uses trial division by primes up to sqrt(n).
 */

export function eulerTotient(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('eulerTotient: n must be positive integer');
  if (n === 1) return 1;
  let result = n;
  let m = n;
  for (let p = 2; p * p <= m; p += 1) {
    if (m % p === 0) {
      while (m % p === 0) m = Math.floor(m / p);
      result -= Math.floor(result / p);
    }
  }
  if (m > 1) result -= Math.floor(result / m);
  return result;
}
