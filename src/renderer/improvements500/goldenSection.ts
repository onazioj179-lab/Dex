// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Golden-section search for 1D unimodal minimization.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface GoldenSectionOptions {
  tolerance?: number;
  maxIterations?: number;
}

export function goldenSectionMin(
  f: (x: number) => number,
  lower: number,
  upper: number,
  options: GoldenSectionOptions = {},
): number {
  const tol = options.tolerance ?? 1e-9;
  const maxIter = options.maxIterations ?? 200;
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = lower;
  let b = upper;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}
