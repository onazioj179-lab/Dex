// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Harmony palettes as concrete colors (Prism/Canvas palette generators,
 * wallpaper-accent theming). Composes `colorHarmony` (hue angles) with
 * `colorUtils.hslToRgb` to produce actual RGB swatches for a scheme. Pure: no DOM.
 */

import { harmonyHues, type HarmonyScheme } from './colorHarmony';
import { hslToRgb, rgbToHsl, rgbToHex, type HSL, type RGB } from './colorUtils';

/** RGB swatches for a harmony scheme around a base HSL color. */
export function harmonyPalette(base: HSL, scheme: HarmonyScheme): RGB[] {
  return harmonyHues(base.h, scheme).map((h) => hslToRgb({ h, s: base.s, l: base.l }));
}

/** Hex swatches for a harmony scheme around a base RGB color. */
export function harmonyHexes(baseRgb: RGB, scheme: HarmonyScheme): string[] {
  const base = rgbToHsl(baseRgb);
  return harmonyPalette(base, scheme).map(rgbToHex);
}

/** Monochromatic ramp: same hue, varied lightness (darkest → lightest). */
export function monochromeRamp(base: HSL, steps = 5): RGB[] {
  const n = Math.max(1, steps);
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const l = n === 1 ? base.l : Math.round((i / (n - 1)) * 100);
    out.push(hslToRgb({ h: base.h, s: base.s, l }));
  }
  return out;
}
