// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Aspect-ratio & fit math (Vinx/Prism/Forge export + viewers). Compute
 * contain/cover/stretch sizing of a source into a target box, simplify ratios,
 * and recognise common presets (16:9, 4:3, 1:1, 9:16, 21:9). Pure: no DOM, no IO.
 */

export interface Size { width: number; height: number }

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

/** Reduce a width:height to its simplest integer ratio, e.g. 1920x1080 → 16:9. */
export function simplifyRatio(width: number, height: number): [number, number] {
  const g = gcd(width, height);
  return [Math.round(width / g), Math.round(height / g)];
}

const PRESETS: Record<string, string> = {
  '16:9': 'Widescreen', '4:3': 'Standard', '1:1': 'Square',
  '9:16': 'Vertical', '21:9': 'Cinematic', '3:2': 'Photo', '2:1': 'Univisium',
};

/** Name a ratio if it matches a known preset, else "W:H". */
export function ratioLabel(width: number, height: number): string {
  const [w, h] = simplifyRatio(width, height);
  const key = `${w}:${h}`;
  return PRESETS[key] ? `${key} (${PRESETS[key]})` : key;
}

export type FitMode = 'contain' | 'cover' | 'stretch';

/**
 * Size a `source` into a `target` box per fit mode:
 * - contain: largest size fully inside target (letterbox),
 * - cover: smallest size fully covering target (crop),
 * - stretch: exactly target.
 * Returns integer pixel dimensions.
 */
export function fitSize(source: Size, target: Size, mode: FitMode = 'contain'): Size {
  if (source.width <= 0 || source.height <= 0) return { width: 0, height: 0 };
  if (mode === 'stretch') {
    return { width: Math.round(target.width), height: Math.round(target.height) };
  }
  const scaleW = target.width / source.width;
  const scaleH = target.height / source.height;
  const scale = mode === 'cover' ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);
  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}

/** Compute the new height for a width that preserves the source ratio. */
export function heightForWidth(source: Size, width: number): number {
  if (source.width <= 0) return 0;
  return Math.round((width / source.width) * source.height);
}

/** Compute the new width for a height that preserves the source ratio. */
export function widthForHeight(source: Size, height: number): number {
  if (source.height <= 0) return 0;
  return Math.round((height / source.height) * source.width);
}
