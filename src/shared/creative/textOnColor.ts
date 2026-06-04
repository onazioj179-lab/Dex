// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Readable text color picker (chips, tags, avatars, wallpaper-accented UI).
 * Chooses black or white text for a background by WCAG contrast — composing the
 * existing `colorUtils` (no duplicate color math). Pure: no DOM, no IO.
 */

import { contrastRatio, type RGB } from './colorUtils';

/** Black or white, whichever contrasts better against `bg`. */
export function pickTextColor(bg: string | RGB): '#000000' | '#ffffff' {
  return contrastRatio(bg, '#000000') >= contrastRatio(bg, '#ffffff') ? '#000000' : '#ffffff';
}

/** True when a background is light enough to take dark text. */
export function isLightColor(bg: string | RGB): boolean {
  return pickTextColor(bg) === '#000000';
}

/** The contrast ratio of the chosen text color against `bg` (≥ 1). */
export function bestTextContrast(bg: string | RGB): number {
  return Math.max(contrastRatio(bg, '#000000'), contrastRatio(bg, '#ffffff'));
}
