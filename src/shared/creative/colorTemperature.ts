// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color temperature (Prism grading hints, palette grouping, wallpaper mood).
 * Classifies a color as warm / cool / neutral from its hue, and gives a signed
 * warmth score. Composes `colorUtils` (no duplicate conversion). Pure: no DOM.
 */

import { rgbToHsl, type RGB } from './colorUtils';

export type Temperature = 'warm' | 'cool' | 'neutral';

/** Classify a hue (0–360) as warm, cool, or neutral. */
export function temperatureOfHue(hue: number): Temperature {
  const h = ((hue % 360) + 360) % 360;
  // Reds/oranges/yellows/magentas are warm; greens/cyans/blues are cool.
  if (h < 75 || h >= 300) return 'warm';
  if (h >= 120 && h < 270) return 'cool';
  return 'neutral'; // yellow-green & blue-violet transition bands
}

/**
 * Signed warmth from −1 (coolest, ~210°) to +1 (warmest, ~30°), via cosine of
 * the hue offset from the warm axis. Low-saturation colors trend toward 0.
 */
export function warmthScore(rgb: RGB): number {
  const { h, s } = rgbToHsl(rgb);
  const rad = ((h - 30) * Math.PI) / 180; // 30° = warmest
  return Math.cos(rad) * (s / 100);
}

/** Classify an RGB color by temperature (neutral when nearly gray). */
export function colorTemperature(rgb: RGB): Temperature {
  const { s } = rgbToHsl(rgb);
  if (s < 10) return 'neutral'; // near-gray has no temperature
  return temperatureOfHue(rgbToHsl(rgb).h);
}
