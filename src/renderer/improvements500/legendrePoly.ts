// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Legendre polynomial P_n(x) via Bonnet's recursion.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function legendreP(n: number, x: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError('legendreP: n must be a non-negative integer');
  if (n === 0) return 1;
  if (n === 1) return x;
  let pPrev = 1;
  let pCur = x;
  for (let k = 1; k < n; k++) {
    const pNext = ((2 * k + 1) * x * pCur - k * pPrev) / (k + 1);
    pPrev = pCur;
    pCur = pNext;
  }
  return pCur;
}
