// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lambert W function principal branch W_0(x) for x >= -1/e.
 * Uses Halley's iteration with a series-derived initial guess.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const INV_E = 1 / Math.E;

export function lambertW0(x: number, tolerance = 1e-12, maxIterations = 100): number {
  if (x < -INV_E) throw new RangeError('lambertW0: x must be >= -1/e');
  if (x === 0) return 0;
  let w: number;
  if (x < 1) {
    const p = Math.sqrt(2 * (Math.E * x + 1));
    w = -1 + p - (p * p) / 3 + (11 * p * p * p) / 72;
  } else {
    w = Math.log(x);
    if (x > 3) w -= Math.log(w);
  }
  for (let i = 0; i < maxIterations; i++) {
    const ew = Math.exp(w);
    const wew = w * ew;
    const f = wew - x;
    const denom = ew * (w + 1) - ((w + 2) * f) / (2 * w + 2);
    const dw = f / denom;
    w -= dw;
    if (Math.abs(dw) < tolerance * Math.max(1, Math.abs(w))) return w;
  }
  return w;
}
