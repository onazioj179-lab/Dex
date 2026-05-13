// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Local-maxima peak detection over a 1D signal with minimum spacing and
 * minimum prominence above the local baseline.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface PeakDetectOptions {
  minDistance?: number;
  minHeight?: number;
}

export function detectPeaks(signal: readonly number[], options: PeakDetectOptions = {}): number[] {
  const minDistance = options.minDistance ?? 1;
  const minHeight = options.minHeight ?? Number.NEGATIVE_INFINITY;
  const peaks: number[] = [];
  for (let i = 1; i < signal.length - 1; i++) {
    const v = signal[i]!;
    if (v <= signal[i - 1]! || v <= signal[i + 1]!) continue;
    if (v < minHeight) continue;
    if (peaks.length > 0 && i - peaks[peaks.length - 1]! < minDistance) {
      if (v > signal[peaks[peaks.length - 1]!]!) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}
