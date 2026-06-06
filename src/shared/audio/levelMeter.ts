// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audio level meter (ROADMAP-600 §3.S #555). Pure meter-state computation —
 * peak / RMS / LUFS / true-peak with peak-hold + clip detection — built on the
 * existing `shared/audio` analysis primitives. The renderer
 * AudioPlaybackService feeds analyser blocks through `updateMeter` each frame.
 */

// DEX v6.0 — audio level meter

import { peakAbs, type SampleBlock } from './dsp';
import { rmsDb, integratedLufs, truePeak } from './analysis';

export interface MeterState {
  /** Linear peak 0..1. */
  peak: number;
  peakDb: number;
  rmsDb: number;
  lufs: number;
  /** Inter-sample (true) peak, linear 0..1+. */
  truePeak: number;
  /** True once the signal reaches/exceeds the clip threshold. */
  clip: boolean;
  /** Decaying peak-hold for a meter cap, linear 0..1. */
  peakHold: number;
}

export interface MeterOptions {
  /** Linear clip threshold. Default 0.999. */
  clipThreshold?: number;
  /** Per-update multiplicative decay of peak-hold. Default 0.92. */
  holdDecay?: number;
}

export function createMeterState(): MeterState {
  return { peak: 0, peakDb: -Infinity, rmsDb: -Infinity, lufs: -Infinity, truePeak: 0, clip: false, peakHold: 0 };
}

/** Fold a sample block into the running meter state (pure). */
export function updateMeter(prev: MeterState, block: SampleBlock, opts: MeterOptions = {}): MeterState {
  const clipThreshold = opts.clipThreshold ?? 0.999;
  const holdDecay = opts.holdDecay ?? 0.92;
  const peak = peakAbs(block);
  const tp = truePeak(block);
  const peakHold = Math.max(peak, prev.peakHold * holdDecay);
  return {
    peak,
    peakDb: peak <= 0 ? -Infinity : 20 * Math.log10(peak),
    rmsDb: rmsDb(block),
    lufs: integratedLufs(block),
    truePeak: tp,
    clip: prev.clip || tp >= clipThreshold,
    peakHold,
  };
}
