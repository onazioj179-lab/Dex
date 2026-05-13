// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color manipulation helpers — lighten / darken / mix / RGB<->HSL.
 * Used by Settings theme preview, AXL palette, and FLUX gradient editor.
 */

import { parseColor, type RGB } from './contrast';

export interface HSL { h: number; s: number; l: number; }

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (0 <= hp && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function toHex(rgb: RGB): string {
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

export function lighten(css: string, amount: number): string | null {
  const rgb = parseColor(css); if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, Math.min(1, hsl.l + amount));
  return toHex(hslToRgb(hsl));
}

export function darken(css: string, amount: number): string | null { return lighten(css, -amount); }

export function mix(a: string, b: string, ratio = 0.5): string | null {
  const ra = parseColor(a), rb = parseColor(b);
  if (!ra || !rb) return null;
  const t = Math.max(0, Math.min(1, ratio));
  return toHex({
    r: ra.r * (1 - t) + rb.r * t,
    g: ra.g * (1 - t) + rb.g * t,
    b: ra.b * (1 - t) + rb.b * t,
  });
}
