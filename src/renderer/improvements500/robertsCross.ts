// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Roberts cross edge magnitude on a grayscale image.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function robertsCross(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = src[y * width + x]!;
      const b = src[y * width + x + 1]!;
      const c = src[(y + 1) * width + x]!;
      const d = src[(y + 1) * width + x + 1]!;
      const gx = a - d;
      const gy = b - c;
      out[y * width + x] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return out;
}
