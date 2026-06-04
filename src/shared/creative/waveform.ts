// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Waveform peak reduction (Imosion / Vinx audio display). Reduces a large PCM
 * sample buffer to a small array of per-bucket min/max peaks for fast, stable
 * waveform rendering at a target pixel width. Pure: no DOM, no AudioContext, so
 * it runs in a worker and is unit-testable.
 */

export interface Peak {
  min: number;
  max: number;
}

/**
 * Reduce `samples` to `buckets` min/max peaks. If there are fewer samples than
 * buckets, returns one bucket per sample (no upsampling). Empty input → [].
 */
export function computePeaks(samples: ArrayLike<number>, buckets: number): Peak[] {
  const n = samples.length;
  if (n === 0 || buckets <= 0) return [];
  const count = Math.min(buckets, n);
  const out: Peak[] = new Array(count);
  const step = n / count;

  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * step);
    const end = b === count - 1 ? n : Math.floor((b + 1) * step);
    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }
  return out;
}

/** Overall peak magnitude across all buckets (for normalization / clip checks). */
export function peakMagnitude(peaks: readonly Peak[]): number {
  let m = 0;
  for (const p of peaks) {
    m = Math.max(m, Math.abs(p.min), Math.abs(p.max));
  }
  return m;
}

/** RMS (loudness) of a sample buffer, 0 for empty. */
export function rms(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n);
}
