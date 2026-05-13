// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Romberg integration: Richardson extrapolation on the trapezoid rule.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function rombergIntegrate(
  f: (x: number) => number,
  a: number,
  b: number,
  maxLevels = 8,
): number {
  if (maxLevels < 1) throw new RangeError('rombergIntegrate: maxLevels must be >= 1');
  const R: number[][] = [];
  R[0] = [(b - a) * (f(a) + f(b)) / 2];
  for (let n = 1; n < maxLevels; n++) {
    R[n] = new Array(n + 1).fill(0);
    const h = (b - a) / 2 ** n;
    let sum = 0;
    const k = 2 ** (n - 1);
    for (let i = 1; i <= k; i++) sum += f(a + (2 * i - 1) * h);
    R[n]![0] = R[n - 1]![0]! / 2 + h * sum;
    for (let m = 1; m <= n; m++) {
      const factor = 4 ** m;
      R[n]![m] = (factor * R[n]![m - 1]! - R[n - 1]![m - 1]!) / (factor - 1);
    }
  }
  return R[maxLevels - 1]![maxLevels - 1]!;
}
