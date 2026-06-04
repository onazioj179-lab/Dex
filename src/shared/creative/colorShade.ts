// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color shade adjustments (theme variants, hover/active states, accent ramps).
 * Lighten/darken/saturate by operating in HSL via `colorUtils`. `amount` is a
 * 0..1 fraction of the full range. Pure: no DOM, no IO.
 */

import { rgbToHsl, hslToRgb, type RGB } from './colorUtils';

const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

/** Lighten by `amount` (0..1 of full lightness). */
export function lighten(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, l: clamp100(hsl.l + amount * 100) });
}

/** Darken by `amount` (0..1 of full lightness). */
export function darken(rgb: RGB, amount: number): RGB {
  return lighten(rgb, -amount);
}

/** Increase saturation by `amount` (0..1). */
export function saturate(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, s: clamp100(hsl.s + amount * 100) });
}

/** Decrease saturation by `amount` (0..1). */
export function desaturate(rgb: RGB, amount: number): RGB {
  return saturate(rgb, -amount);
}

/** Set absolute lightness (0..100). */
export function withLightness(rgb: RGB, lightness: number): RGB {
  return hslToRgb({ ...rgbToHsl(rgb), l: clamp100(lightness) });
}

/** Full grayscale (saturation 0). */
export function grayscale(rgb: RGB): RGB {
  return hslToRgb({ ...rgbToHsl(rgb), s: 0 });
}
