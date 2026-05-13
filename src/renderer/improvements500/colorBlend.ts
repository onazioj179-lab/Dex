// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color blending operations: alpha compositing (source-over), premultiplied
 * alpha conversions, and a screen-blend helper. Distinct from `palette.ts`
 * (which mixes RGB linearly without alpha).
 */

import { parseColor, type RGB } from './contrast';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseRgba(input: string, fallbackAlpha = 1): RGBA {
  const m = /^rgba?\(([^)]+)\)/i.exec(input.trim());
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts[3] !== undefined ? Number(parts[3]) : fallbackAlpha;
    return { r, g, b, a };
  }
  const rgb: RGB = parseColor(input);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: fallbackAlpha };
}

/** Source-over alpha composite: src on top of dst. */
export function compositeOver(src: RGBA, dst: RGBA): RGBA {
  const aOut = src.a + dst.a * (1 - src.a);
  if (aOut === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const r = (src.r * src.a + dst.r * dst.a * (1 - src.a)) / aOut;
  const g = (src.g * src.a + dst.g * dst.a * (1 - src.a)) / aOut;
  const b = (src.b * src.a + dst.b * dst.a * (1 - src.a)) / aOut;
  return { r, g, b, a: aOut };
}

export function toPremultiplied(c: RGBA): RGBA {
  return { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a };
}

export function fromPremultiplied(c: RGBA): RGBA {
  if (c.a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: c.r / c.a, g: c.g / c.a, b: c.b / c.a, a: c.a };
}

/** Screen blend: 1 - (1 - a) * (1 - b). Operates on opaque RGB channels. */
export function screenBlend(a: RGB, b: RGB): RGB {
  return {
    r: 255 - ((255 - a.r) * (255 - b.r)) / 255,
    g: 255 - ((255 - a.g) * (255 - b.g)) / 255,
    b: 255 - ((255 - a.b) * (255 - b.b)) / 255,
  };
}

export function toRgbaString(c: RGBA): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  return `rgba(${r}, ${g}, ${b}, ${Number(c.a.toFixed(4))})`;
}
