// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * A/V sync (ROADMAP-600 §3.U #591). Pure offset + drift estimation: find the
 * lag that best aligns two signals (cross-correlation) and fit the residual
 * drift slope from corresponding timestamp pairs, then apply the correction.
 */

// DEX v6.0 — media A/V sync

/** Best alignment lag (in samples/frames) maximising cross-correlation. */
export function avSyncOffset(
  reference: readonly number[],
  target: readonly number[],
  maxLag: number,
): number {
  const n = Math.min(reference.length, target.length);
  if (n === 0) return 0;
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      s += reference[i] * target[j];
    }
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  return bestLag;
}

/**
 * Drift slope: least-squares fit of (target - ref) against ref time. A non-zero
 * slope means clocks diverge over time (e.g. 0.001 = +1ms per 1s). Returns 0
 * for degenerate input.
 */
export function driftSlope(refTimes: readonly number[], targetTimes: readonly number[]): number {
  const n = Math.min(refTimes.length, targetTimes.length);
  if (n < 2) return 0;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = refTimes[i];
    const y = targetTimes[i] - refTimes[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

/** Apply a constant offset + linear drift correction to a timestamp. */
export function correctedTime(t: number, offset: number, slope = 0): number {
  return t + offset + slope * t;
}
