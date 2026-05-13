// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Scharr edge magnitude on a grayscale image. More rotationally symmetric
 * than Sobel.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function scharrEdges(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  const get = (x: number, y: number): number => {
    const xx = Math.min(width - 1, Math.max(0, x));
    const yy = Math.min(height - 1, Math.max(0, y));
    return src[yy * width + xx]!;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        3 * (get(x + 1, y - 1) - get(x - 1, y - 1)) +
        10 * (get(x + 1, y) - get(x - 1, y)) +
        3 * (get(x + 1, y + 1) - get(x - 1, y + 1));
      const gy =
        3 * (get(x - 1, y + 1) - get(x - 1, y - 1)) +
        10 * (get(x, y + 1) - get(x, y - 1)) +
        3 * (get(x + 1, y + 1) - get(x + 1, y - 1));
      out[y * width + x] = Math.min(255, Math.hypot(gx, gy) / 16);
    }
  }
  return out;
}
