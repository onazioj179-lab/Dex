// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Separable 1D Gaussian blur over Float32Array. Caller can apply twice (H and V) for 2D.
export function gaussianKernel1D(sigma: number, radius?: number): Float32Array {
  const r = radius ?? Math.max(1, Math.ceil(sigma * 3));
  const size = r * 2 + 1;
  const kernel = new Float32Array(size);
  const inv2s2 = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-i * i * inv2s2);
    kernel[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

export function gaussianBlur1D(
  input: ReadonlyArray<number> | Float32Array,
  sigma: number,
): Float32Array {
  const kernel = gaussianKernel1D(sigma);
  const r = (kernel.length - 1) >> 1;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      else if (idx >= input.length) idx = input.length - 2 - (idx - input.length);
      if (idx < 0) idx = 0;
      if (idx >= input.length) idx = input.length - 1;
      acc += input[idx] * kernel[k + r];
    }
    out[i] = acc;
  }
  return out;
}
