// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Linear-to-mel and mel-to-linear frequency conversion.
 * Uses the Slaney/HTK formula log10 form.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function melFilterbankCenters(numFilters: number, lowHz: number, highHz: number): number[] {
  if (numFilters < 1) return [];
  const lowMel = hzToMel(lowHz);
  const highMel = hzToMel(highHz);
  const step = (highMel - lowMel) / (numFilters + 1);
  const out = new Array<number>(numFilters);
  for (let i = 0; i < numFilters; i++) out[i] = melToHz(lowMel + (i + 1) * step);
  return out;
}
