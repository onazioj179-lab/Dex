// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Box blur (mean filter) on a single-channel grayscale image. The kernel
 * is a square of size (2*radius+1). Edge pixels use clamp-to-edge.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function boxBlur(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius < 0) throw new RangeError('boxBlur: radius must be >= 0');
  const out = new Uint8ClampedArray(width * height);
  const k = 2 * radius + 1;
  const inv = 1 / (k * k);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          sum += src[yy * width + xx]!;
        }
      }
      out[y * width + x] = sum * inv;
    }
  }
  return out;
}
