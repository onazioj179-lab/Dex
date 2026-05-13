// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sieve of Atkin: enumerate primes up to n. Faster asymptotically than the
 * Sieve of Eratosthenes for very large n, but more complex to set up.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function sieveOfAtkin(limit: number): number[] {
  if (!Number.isInteger(limit) || limit < 2) return [];
  const sieve = new Uint8Array(limit + 1);
  const sqrtLimit = Math.floor(Math.sqrt(limit));
  for (let x = 1; x <= sqrtLimit; x++) {
    for (let y = 1; y <= sqrtLimit; y++) {
      const x2 = x * x;
      const y2 = y * y;
      let n = 4 * x2 + y2;
      if (n <= limit && (n % 12 === 1 || n % 12 === 5)) sieve[n] ^= 1;
      n = 3 * x2 + y2;
      if (n <= limit && n % 12 === 7) sieve[n] ^= 1;
      n = 3 * x2 - y2;
      if (x > y && n <= limit && n % 12 === 11) sieve[n] ^= 1;
    }
  }
  for (let r = 5; r <= sqrtLimit; r++) {
    if (sieve[r]) {
      const r2 = r * r;
      for (let i = r2; i <= limit; i += r2) sieve[i] = 0;
    }
  }
  const primes: number[] = [];
  if (limit >= 2) primes.push(2);
  if (limit >= 3) primes.push(3);
  for (let i = 5; i <= limit; i++) if (sieve[i]) primes.push(i);
  return primes;
}
