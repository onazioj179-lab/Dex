// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Median blur (square neighborhood) on a grayscale image. Removes
 * salt-and-pepper noise. radius >= 1.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function medianBlur(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius = 1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  const k = 2 * radius + 1;
  const buf = new Array<number>(k * k);
  const mid = (k * k) >> 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let i = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          buf[i++] = src[yy * width + xx]!;
        }
      }
      buf.sort((a, b) => a - b);
      out[y * width + x] = buf[mid]!;
    }
  }
  return out;
}
