// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * WCAG color-contrast utilities (T1-053).
 *
 * Computes relative luminance + contrast ratio per WCAG 2.1, returns AA / AAA
 * pass/fail for normal and large text.
 */

export interface RGB { r: number; g: number; b: number; }

export function parseColor(css: string): RGB | null {
  const s = css.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return null;
  }
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(rgb: RGB): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastResult {
  ratio: number;
  passAANormal: boolean;   // >= 4.5
  passAALarge: boolean;    // >= 3
  passAAANormal: boolean;  // >= 7
  passAAALarge: boolean;   // >= 4.5
}

export function evaluateContrast(foreground: string, background: string): ContrastResult | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    passAANormal: ratio >= 4.5,
    passAALarge: ratio >= 3,
    passAAANormal: ratio >= 7,
    passAAALarge: ratio >= 4.5,
  };
}
