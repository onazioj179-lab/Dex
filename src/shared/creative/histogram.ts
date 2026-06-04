// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Image histograms (Prism). Computes 256-bin luminance and per-channel
 * histograms from an RGBA pixel buffer (the shape of `ImageData.data`). Pure:
 * no DOM/Canvas, so it runs in a worker and is unit-testable.
 */

export interface ChannelHistograms {
  r: number[];
  g: number[];
  b: number[];
}

function zeroBins(): number[] {
  return new Array(256).fill(0);
}

/** Rec. 601 luma (0–255) histogram from RGBA bytes (stride 4, alpha ignored). */
export function luminanceHistogram(rgba: ArrayLike<number>): number[] {
  const bins = zeroBins();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const y = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    bins[Math.min(255, Math.max(0, y))]++;
  }
  return bins;
}

/** Separate R/G/B histograms from RGBA bytes. */
export function channelHistograms(rgba: ArrayLike<number>): ChannelHistograms {
  const r = zeroBins(), g = zeroBins(), b = zeroBins();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    r[rgba[i] & 255]++;
    g[rgba[i + 1] & 255]++;
    b[rgba[i + 2] & 255]++;
  }
  return { r, g, b };
}

/** Peak bin count in a histogram (for scaling the display). */
export function histogramPeak(bins: readonly number[]): number {
  let m = 0;
  for (const v of bins) if (v > m) m = v;
  return m;
}

/** Mean level (0–255) of a histogram, or 0 when empty. */
export function histogramMean(bins: readonly number[]): number {
  let total = 0, weighted = 0;
  for (let i = 0; i < bins.length; i++) { total += bins[i]; weighted += i * bins[i]; }
  return total === 0 ? 0 : weighted / total;
}
