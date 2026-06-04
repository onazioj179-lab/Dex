// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Accent → theme generator (the roadmap's "wallpaper controls accent colors").
 * Derives a coherent set of UI colors — hover/active/muted/subtle states and the
 * readable text color — from a single accent. Integration layer composing
 * `colorShade`, `textOnColor` and `colorUtils`. Pure: no DOM, no IO.
 */

import { lighten, darken, desaturate, withLightness } from './colorShade';
import { pickTextColor } from './textOnColor';
import { rgbToHex, hexToRgb, type RGB } from './colorUtils';

export interface AccentTheme {
  accent: string;
  hover: string;    // lighter for hover
  active: string;   // darker for press
  muted: string;    // desaturated, for secondary use
  subtle: string;   // very light tint, for backgrounds
  onAccent: string; // readable text over the accent
}

/** Build an accent theme (hex strings) from an accent color. */
export function generateAccentTheme(accent: RGB): AccentTheme {
  return {
    accent: rgbToHex(accent),
    hover: rgbToHex(lighten(accent, 0.08)),
    active: rgbToHex(darken(accent, 0.08)),
    muted: rgbToHex(desaturate(lighten(accent, 0.1), 0.3)),
    subtle: rgbToHex(withLightness(desaturate(accent, 0.2), 92)),
    onAccent: pickTextColor(accent),
  };
}

/** Same, accepting a hex accent; returns null for an invalid hex. */
export function generateAccentThemeHex(hex: string): AccentTheme | null {
  const rgb = hexToRgb(hex);
  return rgb ? generateAccentTheme(rgb) : null;
}
