// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color scales / gradients (Prism gradient tool, Rewind charts, heatmaps).
 * Interpolates a smooth N-step ramp across an ordered list of color stops.
 * Reuses `mixColors` from `colorBlend`. Pure: no DOM, no IO.
 */

import { mixColors, type RGB } from './colorBlend';

/** Sample a multi-stop gradient at position t (0..1). */
export function sampleScale(stops: readonly RGB[], t: number): RGB {
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  if (stops.length === 1) return { ...stops[0] };
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  return mixColors(stops[i], stops[i + 1], localT);
}

/** Generate `n` evenly-spaced colors across the stops (inclusive of ends). */
export function colorScale(stops: readonly RGB[], n: number): RGB[] {
  if (n <= 0) return [];
  if (n === 1) return [sampleScale(stops, 0)];
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) out.push(sampleScale(stops, i / (n - 1)));
  return out;
}

/** A two-stop ramp a→b with `n` steps. */
export function gradient(a: RGB, b: RGB, n: number): RGB[] {
  return colorScale([a, b], n);
}
