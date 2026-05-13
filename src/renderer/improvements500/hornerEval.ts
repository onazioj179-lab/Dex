// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Horner's method for fast polynomial evaluation.
 * Coefficients are little-endian: coeffs[0] is constant term.
 */

export function hornerEval(coeffs: ReadonlyArray<number>, x: number): number {
  if (coeffs.length === 0) return 0;
  let result = coeffs[coeffs.length - 1]!;
  for (let i = coeffs.length - 2; i >= 0; i -= 1) {
    result = result * x + coeffs[i]!;
  }
  return result;
}
