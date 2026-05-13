// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Histogram equalization for a grayscale (8-bit) image. Improves contrast
 * by remapping intensities to spread the histogram uniformly.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function histogramEqualize(
  src: Uint8ClampedArray | Uint8Array,
): Uint8ClampedArray {
  const n = src.length;
  if (n === 0) return new Uint8ClampedArray(0);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[src[i]!]!++;
  const cdf = new Uint32Array(256);
  let acc = 0;
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    cdf[i] = acc;
    if (cdfMin === 0 && acc > 0) cdfMin = acc;
  }
  const lut = new Uint8ClampedArray(256);
  const denom = n - cdfMin;
  if (denom <= 0) return new Uint8ClampedArray(src);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(((cdf[i]! - cdfMin) * 255) / denom);
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = lut[src[i]!]!;
  return out;
}
