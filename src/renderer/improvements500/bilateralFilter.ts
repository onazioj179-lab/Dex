// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bilateral filter on a grayscale image. Smooths while preserving edges
 * by weighting both spatial and intensity differences.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function bilateralFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  spatialSigma = 2,
  intensitySigma = 16,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  const radius = Math.max(1, Math.ceil(spatialSigma * 2));
  const sd = -1 / (2 * spatialSigma * spatialSigma);
  const id = -1 / (2 * intensitySigma * intensitySigma);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = src[y * width + x]!;
      let wsum = 0;
      let acc = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const v = src[yy * width + xx]!;
          const w = Math.exp((dx * dx + dy * dy) * sd + (v - center) * (v - center) * id);
          wsum += w;
          acc += w * v;
        }
      }
      out[y * width + x] = wsum > 0 ? acc / wsum : center;
    }
  }
  return out;
}
