// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sieve of Eratosthenes - generate all primes up to N.
 * Returns a Uint32Array of primes in ascending order.
 */

export function primeSieve(limit: number): Uint32Array {
  if (limit < 2) return new Uint32Array(0);
  const sieve = new Uint8Array(limit + 1);
  // 0 and 1 are not prime; mark composites by setting sieve[i] = 1.
  const sqrt = Math.floor(Math.sqrt(limit));
  for (let i = 2; i <= sqrt; i += 1) {
    if (sieve[i] === 0) {
      for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
    }
  }
  const primes: number[] = [];
  for (let i = 2; i <= limit; i += 1) if (sieve[i] === 0) primes.push(i);
  return Uint32Array.from(primes);
}

/** True iff `n` is prime (trial division up to sqrt(n); good for n < ~10^9). */
export function isPrimeTrial(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  const lim = Math.floor(Math.sqrt(n));
  for (let i = 3; i <= lim; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
