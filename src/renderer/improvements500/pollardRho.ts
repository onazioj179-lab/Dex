// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pollard's rho integer factorization for moderate n (BigInt-based,
 * safe for values larger than Number.MAX_SAFE_INTEGER). Returns a
 * non-trivial factor of `n`, or n itself if n is prime / Pollard fails.
 */

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function pollardRho(n: bigint): bigint {
  if (n <= 1n) throw new Error('pollardRho: n must be > 1');
  if (n % 2n === 0n) return 2n;
  let c = 1n;
  while (c < n) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    while (d === 1n) {
      x = (x * x + c) % n;
      y = (y * y + c) % n;
      y = (y * y + c) % n;
      const diff = x > y ? x - y : y - x;
      d = gcdBig(diff, n);
    }
    if (d !== n) return d;
    c += 1n;
  }
  return n;
}
