// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polynomial multiplication using FFT-based convolution. O(n log n).
 * For tiny polynomials (n <= 64) falls back to schoolbook multiply.
 */

import { fft, ifft } from './fft';

/**
 * Multiply two polynomials given as coefficient arrays in increasing
 * order of degree (a[0] is constant term). Returns the product
 * polynomial coefficients, also in increasing degree.
 */
export function polyMul(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return new Float64Array(0);
  const resultLen = la + lb - 1;
  if (la <= 64 || lb <= 64) {
    const out = new Float64Array(resultLen);
    for (let i = 0; i < la; i += 1) {
      const ai = a[i]!;
      if (ai === 0) continue;
      for (let j = 0; j < lb; j += 1) out[i + j] = out[i + j]! + ai * b[j]!;
    }
    return out;
  }
  let size = 1;
  while (size < resultLen) size <<= 1;
  const ar = new Float64Array(size);
  const br = new Float64Array(size);
  for (let i = 0; i < la; i += 1) ar[i] = a[i]!;
  for (let i = 0; i < lb; i += 1) br[i] = b[i]!;
  const A = fft({ real: ar, imag: new Float64Array(size) });
  const B = fft({ real: br, imag: new Float64Array(size) });
  const cr = new Float64Array(size);
  const ci = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    cr[i] = A.real[i]! * B.real[i]! - A.imag[i]! * B.imag[i]!;
    ci[i] = A.real[i]! * B.imag[i]! + A.imag[i]! * B.real[i]!;
  }
  const C = ifft({ real: cr, imag: ci });
  const out = new Float64Array(resultLen);
  for (let i = 0; i < resultLen; i += 1) out[i] = C.real[i]!;
  return out;
}
