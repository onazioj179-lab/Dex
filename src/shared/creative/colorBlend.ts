// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color blend modes (Prism layer compositing, CRT-106). Per-channel blend of a
 * base color under a blend color for the common modes, operating on 0–255 RGB.
 * Pure: no DOM/Canvas, so it runs in a worker and is unit-testable.
 */

export interface RGB { r: number; g: number; b: number }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'difference' | 'add';

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/** Blend two 0..1 channel values per mode. */
export function blendChannel(base: number, blend: number, mode: BlendMode): number {
  switch (mode) {
    case 'normal': return blend;
    case 'multiply': return base * blend;
    case 'screen': return 1 - (1 - base) * (1 - blend);
    case 'overlay': return base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
    case 'darken': return Math.min(base, blend);
    case 'lighten': return Math.max(base, blend);
    case 'difference': return Math.abs(base - blend);
    case 'add': return Math.min(1, base + blend);
    default: return blend;
  }
}

/** Blend two RGB colors per mode (channels independent). */
export function blendColors(base: RGB, blend: RGB, mode: BlendMode): RGB {
  const ch = (b: number, s: number) => clamp255(blendChannel(b / 255, s / 255, mode) * 255);
  return { r: ch(base.r, blend.r), g: ch(base.g, blend.g), b: ch(base.b, blend.b) };
}

/** Linear interpolation of two colors by t (0..1). */
export function mixColors(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: clamp255(a.r + (b.r - a.r) * k),
    g: clamp255(a.g + (b.g - a.g) * k),
    b: clamp255(a.b + (b.b - a.b) * k),
  };
}

/** Composite `blend` over `base` at `opacity` (0..1) using a blend mode. */
export function compositeOver(base: RGB, blend: RGB, mode: BlendMode, opacity: number): RGB {
  const blended = blendColors(base, blend, mode);
  return mixColors(base, blended, Math.min(1, Math.max(0, opacity)));
}
