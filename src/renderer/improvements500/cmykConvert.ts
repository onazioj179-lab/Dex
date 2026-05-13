// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RGB <-> CMYK colour conversion. RGB channels are 0-255; CMYK
 * channels are 0-1.
 */

export interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface RGB8 {
  r: number;
  g: number;
  b: number;
}

export function rgbToCmyk(rgb: RGB8): CMYK {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  const inv = 1 - k;
  return {
    c: (1 - r - k) / inv,
    m: (1 - g - k) / inv,
    y: (1 - b - k) / inv,
    k,
  };
}

export function cmykToRgb(cmyk: CMYK): RGB8 {
  const r = 255 * (1 - cmyk.c) * (1 - cmyk.k);
  const g = 255 * (1 - cmyk.m) * (1 - cmyk.k);
  const b = 255 * (1 - cmyk.y) * (1 - cmyk.k);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}
