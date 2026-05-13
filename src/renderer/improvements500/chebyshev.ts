// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Chebyshev polynomial of the first kind T_n(x) and its evaluation via
 * Clenshaw's recurrence on a coefficient series.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function chebyshevT(n: number, x: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError('chebyshevT: n must be a non-negative integer');
  if (n === 0) return 1;
  if (n === 1) return x;
  let tPrev = 1;
  let tCur = x;
  for (let k = 2; k <= n; k++) {
    const t = 2 * x * tCur - tPrev;
    tPrev = tCur;
    tCur = t;
  }
  return tCur;
}

export function clenshawChebyshev(coeffs: readonly number[], x: number): number {
  const n = coeffs.length;
  if (n === 0) return 0;
  let bk1 = 0;
  let bk2 = 0;
  for (let k = n - 1; k >= 1; k--) {
    const bk = 2 * x * bk1 - bk2 + coeffs[k]!;
    bk2 = bk1;
    bk1 = bk;
  }
  return x * bk1 - bk2 + coeffs[0]!;
}
