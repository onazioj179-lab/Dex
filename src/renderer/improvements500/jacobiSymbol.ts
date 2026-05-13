// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Jacobi symbol (a/n) for odd positive n. Generalises the Legendre
 * symbol; result is -1, 0, or 1. Useful in primality tests like
 * Solovay-Strassen.
 */

export function jacobiSymbol(a: bigint, n: bigint): -1 | 0 | 1 {
  if (n <= 0n || n % 2n === 0n) throw new Error('jacobiSymbol: n must be a positive odd integer');
  let aa = ((a % n) + n) % n;
  let nn = n;
  let result: 1 | -1 = 1;
  while (aa !== 0n) {
    while (aa % 2n === 0n) {
      aa /= 2n;
      const r = nn % 8n;
      if (r === 3n || r === 5n) result = (-result) as 1 | -1;
    }
    const tmp = aa;
    aa = nn;
    nn = tmp;
    if (aa % 4n === 3n && nn % 4n === 3n) result = (-result) as 1 | -1;
    aa %= nn;
  }
  return nn === 1n ? result : 0;
}
