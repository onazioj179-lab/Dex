// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function lagrangeInterpolate(xs: ReadonlyArray<number>, ys: ReadonlyArray<number>, x: number): number {
  if (xs.length !== ys.length) throw new Error('length mismatch');
  const n = xs.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    let term = ys[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      term *= (x - xs[j]) / (xs[i] - xs[j]);
    }
    total += term;
  }
  return total;
}
