// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audio gain utilities (Imosion mixing). dB <-> linear-gain conversion, peak
 * detection, and peak normalization for sample buffers. Pure: no DOM, no
 * AudioContext — just the math, so it is unit-testable and reusable in workers.
 */

/** Linear amplitude gain (1 = unity) from decibels. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Decibels from a linear amplitude gain. -Infinity at/below 0. */
export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/** Clamp a linear gain into [0, max] (default headroom-free unity ceiling 4x). */
export function clampGain(gain: number, max = 4): number {
  if (!Number.isFinite(gain) || gain < 0) return 0;
  return Math.min(max, gain);
}

/** Peak absolute amplitude of a sample buffer (0 for empty). */
export function peakAmplitude(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * Gain needed to bring the buffer's peak to `targetPeak` (default 1.0). Returns
 * 1 for silent buffers (nothing to normalize).
 */
export function normalizeGain(samples: ArrayLike<number>, targetPeak = 1): number {
  const peak = peakAmplitude(samples);
  if (peak <= 0) return 1;
  return targetPeak / peak;
}

/** Apply a gain to a copy of the samples (does not mutate input). */
export function applyGain(samples: readonly number[], gain: number): number[] {
  return samples.map((s) => s * gain);
}
