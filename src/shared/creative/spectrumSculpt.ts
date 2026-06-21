// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Vision — Spectrum Sculpt (per-hue-band color warp)
 * -----------------------------------------------------------------------------
 * Rotate hue / scale saturation / shift luminance within hue ranges, with a
 * soft linear falloff between bands so transitions stay smooth. Pure HSL math
 * (no DOM/canvas) so it is reusable and unit-testable; the Vinx color engine
 * applies it per pixel.
 */

export interface SpectrumSculptBand {
  /** Band center on the hue circle, 0..1. */
  hueCenter: number;
  /** Full band width on the hue circle, 0..1. */
  hueWidth: number;
  /** Hue rotation applied within the band, -1..1 (full turns). */
  hueShift: number;
  /** Saturation multiplier within the band (1 = unchanged). */
  satScale: number;
  /** Luminance offset within the band, -0.5..0.5. */
  lumShift: number;
}

export interface SpectrumSculpt {
  enabled: boolean;
  bands: SpectrumSculptBand[];
}

/**
 * Warp a single HSL color through the sculpt bands. Pure + side-effect free.
 * h, s, l and the result are all in 0..1; hue wraps circularly.
 */
export function applySpectrumBands(
  h: number, s: number, l: number, bands: readonly SpectrumSculptBand[],
): [number, number, number] {
  let nh = h, ns = s, nl = l;
  for (const band of bands) {
    let dist = Math.abs(h - band.hueCenter);
    if (dist > 0.5) dist = 1 - dist; // shortest distance around the hue circle
    const half = Math.max(0.001, band.hueWidth / 2);
    const falloff = Math.max(0, 1 - dist / half);
    if (falloff > 0) {
      nh = (nh + band.hueShift * falloff + 1) % 1;
      ns = ns * (1 + (band.satScale - 1) * falloff);
      nl = nl + band.lumShift * falloff;
    }
  }
  return [(nh + 1) % 1, Math.max(0, Math.min(1, ns)), Math.max(0, Math.min(1, nl))];
}

/** Six neutral bands (red→magenta) — a no-op starting point for the UI. */
export function defaultSpectrumBands(): SpectrumSculptBand[] {
  return [
    { hueCenter: 0.00, hueWidth: 0.18, hueShift: 0, satScale: 1, lumShift: 0 }, // red
    { hueCenter: 0.083, hueWidth: 0.18, hueShift: 0, satScale: 1, lumShift: 0 }, // orange/yellow
    { hueCenter: 0.33, hueWidth: 0.22, hueShift: 0, satScale: 1, lumShift: 0 }, // green
    { hueCenter: 0.5, hueWidth: 0.18, hueShift: 0, satScale: 1, lumShift: 0 }, // cyan
    { hueCenter: 0.66, hueWidth: 0.18, hueShift: 0, satScale: 1, lumShift: 0 }, // blue
    { hueCenter: 0.83, hueWidth: 0.18, hueShift: 0, satScale: 1, lumShift: 0 }, // magenta
  ];
}
