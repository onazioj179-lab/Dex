// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Approximate Tanner Helland blackbody color temperature -> sRGB conversion.
// Input kelvin in [1000, 40000]. Returns sRGB [0,1].
export function kelvinToRgb(kelvin: number): { r: number; g: number; b: number } {
  const k = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    if (k <= 19) b = 0;
    else b = 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  return {
    r: Math.max(0, Math.min(255, r)) / 255,
    g: Math.max(0, Math.min(255, g)) / 255,
    b: Math.max(0, Math.min(255, b)) / 255,
  };
}
