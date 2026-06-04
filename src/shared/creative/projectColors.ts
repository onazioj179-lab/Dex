// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Deterministic key → color (project accents, tag chips, avatar/session colors,
 * Rewind chart series). The same key always maps to the same pleasant color.
 * Integration layer composing `nameHue` + `colorUtils`. Pure: no DOM, no IO.
 */

import { nameHue } from '../format/initials';
import { hslToRgb, rgbToHex, type RGB } from './colorUtils';
import { pickTextColor } from './textOnColor';

/** A stable RGB color for a key (default pleasant saturation/lightness). */
export function colorForKey(key: string, saturation = 65, lightness = 55): RGB {
  return hslToRgb({ h: nameHue(key), s: saturation, l: lightness });
}

/** A stable hex color for a key. */
export function hexForKey(key: string, saturation = 65, lightness = 55): string {
  return rgbToHex(colorForKey(key, saturation, lightness));
}

export interface KeyColor {
  bg: string;
  fg: string; // readable text over bg
}

/** A bg + readable fg pair for a key (chips, badges). */
export function chipColorForKey(key: string): KeyColor {
  const bg = colorForKey(key);
  return { bg: rgbToHex(bg), fg: pickTextColor(bg) };
}

/** Distinct hex colors for a set of keys (evenly spread when keys collide). */
export function paletteForKeys(keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  keys.forEach((key) => { out[key] = hexForKey(key); });
  return out;
}
