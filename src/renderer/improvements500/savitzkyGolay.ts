// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Savitzky-Golay smoothing filter (order 2) using precomputed coefficients
// for window sizes 5, 7, 9, 11. For other sizes, falls back to a uniform mean.
const COEFFS: Record<number, number[]> = {
  5: [-3, 12, 17, 12, -3].map((v) => v / 35),
  7: [-2, 3, 6, 7, 6, 3, -2].map((v) => v / 21),
  9: [-21, 14, 39, 54, 59, 54, 39, 14, -21].map((v) => v / 231),
  11: [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36].map((v) => v / 429),
};

export function savitzkyGolay(
  input: ReadonlyArray<number> | Float32Array,
  windowSize: number,
): Float32Array {
  if (windowSize % 2 === 0 || windowSize < 3) {
    throw new Error('windowSize must be an odd integer >= 3');
  }
  const coeffs = COEFFS[windowSize] ?? new Array<number>(windowSize).fill(1 / windowSize);
  const half = (windowSize - 1) >> 1;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) {
      let idx = i + k;
      if (idx < 0) idx = 0;
      if (idx >= input.length) idx = input.length - 1;
      acc += input[idx] * coeffs[k + half];
    }
    out[i] = acc;
  }
  return out;
}
