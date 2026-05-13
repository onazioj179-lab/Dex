// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Convert correlated color temperature (Kelvin) to approximate sRGB.
 * Useful for white-balance UI sliders. Output is 0-255 per channel.
 * Tanner Helland approximation; valid roughly 1000K..40000K.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface TempRgb {
  r: number;
  g: number;
  b: number;
}

function clamp(v: number): number {
  return Math.min(255, Math.max(0, v));
}

export function colorTemperatureToRgb(kelvin: number): TempRgb {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}
