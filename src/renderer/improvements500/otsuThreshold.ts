// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Otsu's adaptive threshold for grayscale image histograms. Returns the
 * threshold (0..255) that maximizes between-class variance.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function otsuThreshold(image: Uint8Array | Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < image.length; i++) hist[image[i]!]++;
  const total = image.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

export function applyThreshold(
  image: Uint8Array | Uint8ClampedArray,
  threshold: number,
): Uint8Array {
  const out = new Uint8Array(image.length);
  for (let i = 0; i < image.length; i++) out[i] = image[i]! > threshold ? 255 : 0;
  return out;
}
