// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color harmony (Prism/Canvas palette generators). Produces the hue wheel angles
 * for common color schemes from a base hue (degrees). Works purely on hue, so it
 * composes with any HSL→RGB conversion. Pure: no DOM, no IO.
 */

export type HarmonyScheme =
  | 'complementary' | 'analogous' | 'triadic'
  | 'tetradic' | 'split-complementary' | 'monochromatic';

/** Normalize a hue into [0, 360). */
export function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

const OFFSETS: Record<HarmonyScheme, number[]> = {
  complementary: [0, 180],
  analogous: [-30, 0, 30],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  'split-complementary': [0, 150, 210],
  monochromatic: [0], // same hue; vary lightness/saturation elsewhere
};

/** Hue angles (degrees) for a scheme around `baseHue`. */
export function harmonyHues(baseHue: number, scheme: HarmonyScheme): number[] {
  const base = normalizeHue(baseHue);
  return OFFSETS[scheme].map((o) => normalizeHue(base + o));
}

/** Angular distance between two hues (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(d, 360 - d);
}
