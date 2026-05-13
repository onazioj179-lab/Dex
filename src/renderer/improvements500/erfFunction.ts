// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Error function erf(x) and its complement erfc(x). Uses the
 * Abramowitz & Stegun 7.1.26 rational approximation; max error ~1.5e-7.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const A1 = 0.254829592;
const A2 = -0.284496736;
const A3 = 1.421413741;
const A4 = -1.453152027;
const A5 = 1.061405429;
const P = 0.3275911;

export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + P * ax);
  const y = 1 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function erfc(x: number): number {
  return 1 - erf(x);
}
