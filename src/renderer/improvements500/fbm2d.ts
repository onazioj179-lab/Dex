// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fractional Brownian motion (fBm) over a 2D noise function. Sums multiple
 * octaves with frequency *= lacunarity and amplitude *= persistence.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
}

export function fbm2d(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  options: FbmOptions = {},
): number {
  const octaves = options.octaves ?? 4;
  const lacunarity = options.lacunarity ?? 2;
  const persistence = options.persistence ?? 0.5;
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : total / norm;
}
