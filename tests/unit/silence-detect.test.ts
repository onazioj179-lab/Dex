// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  detectSilence,
  planSilenceRemoval,
  toMonoPCM,
} from '../../src/shared/media/silenceDetect';

const SR = 1000; // 1 kHz keeps the math readable (1 sample = 1 ms)

/** Build a signal from [durationSec, amplitude] segments. */
function build(segments: Array<[number, number]>): Float32Array {
  const total = segments.reduce((n, [d]) => n + Math.round(d * SR), 0);
  const out = new Float32Array(total);
  let i = 0;
  for (const [d, amp] of segments) {
    const n = Math.round(d * SR);
    for (let k = 0; k < n; k++) out[i++] = amp;
  }
  return out;
}

describe('silenceDetect.detectSilence (#199 real DSP engine)', () => {
  it('finds a silent gap between two loud segments', () => {
    const sig = build([[0.3, 0.5], [0.4, 0], [0.3, 0.5]]);
    const regions = detectSilence(sig, SR, { thresholdDb: -40, minSilenceSec: 0.2, windowSec: 0.02 });
    expect(regions).toHaveLength(1);
    expect(regions[0].startSec).toBeCloseTo(0.3, 2);
    expect(regions[0].endSec).toBeCloseTo(0.7, 2);
  });

  it('ignores gaps shorter than minSilenceSec', () => {
    const sig = build([[0.3, 0.5], [0.1, 0], [0.3, 0.5]]); // 0.1s gap
    const regions = detectSilence(sig, SR, { minSilenceSec: 0.2, windowSec: 0.02 });
    expect(regions).toHaveLength(0);
  });

  it('all-silent → one region spanning the whole clip; all-loud → none', () => {
    const silent = build([[1, 0]]);
    expect(detectSilence(silent, SR, { minSilenceSec: 0.2 })).toHaveLength(1);
    const loud = build([[1, 0.5]]);
    expect(detectSilence(loud, SR, { minSilenceSec: 0.2 })).toHaveLength(0);
  });

  it('respects the dBFS threshold (quiet-but-present audio is not silence)', () => {
    // amplitude 0.05 → 20*log10(0.05) ≈ -26 dB: above a -40 floor, below a -20 floor.
    const quiet = build([[0.5, 0.5], [0.4, 0.05], [0.5, 0.5]]);
    expect(detectSilence(quiet, SR, { thresholdDb: -40, minSilenceSec: 0.2 })).toHaveLength(0);
    expect(detectSilence(quiet, SR, { thresholdDb: -20, minSilenceSec: 0.2 })).toHaveLength(1);
  });

  it('handles empty input safely', () => {
    expect(detectSilence(new Float32Array(0), SR)).toEqual([]);
    expect(detectSilence(new Float32Array(10), 0)).toEqual([]);
  });
});

describe('silenceDetect.planSilenceRemoval', () => {
  it('plans keep/remove with padding and correct durations', () => {
    const sig = build([[0.3, 0.5], [0.4, 0], [0.3, 0.5]]); // total 1.0s, gap [0.3,0.7]
    const plan = planSilenceRemoval(sig, SR, { minSilenceSec: 0.2, windowSec: 0.02, paddingSec: 0.05 });
    expect(plan.originalSec).toBeCloseTo(1.0, 2);
    // padding shrinks the cut from [0.3,0.7] to [0.35,0.65] → 0.3s removed
    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].startSec).toBeCloseTo(0.35, 2);
    expect(plan.remove[0].endSec).toBeCloseTo(0.65, 2);
    expect(plan.removedSec).toBeCloseTo(0.3, 2);
    expect(plan.keptSec).toBeCloseTo(0.7, 2);
    // keep segments are the complement and cover the rest
    expect(plan.keep[0]).toMatchObject({ startSec: 0 });
    expect(plan.keep[plan.keep.length - 1].endSec).toBeCloseTo(1.0, 2);
  });

  it('removes nothing when there is no qualifying silence', () => {
    const sig = build([[1, 0.5]]);
    const plan = planSilenceRemoval(sig, SR, { minSilenceSec: 0.2 });
    expect(plan.removedSec).toBe(0);
    expect(plan.keep).toEqual([{ startSec: 0, endSec: 1 }]);
  });
});

describe('silenceDetect.toMonoPCM', () => {
  it('averages stereo channels to mono', () => {
    const l = new Float32Array([1, 0, -1]);
    const r = new Float32Array([0, 1, -1]);
    const mono = toMonoPCM([l, r], 3);
    expect(Array.from(mono)).toEqual([0.5, 0.5, -1]);
  });
  it('returns the single channel as-is for mono', () => {
    const c = new Float32Array([0.2, 0.4]);
    expect(toMonoPCM([c], 2)).toBe(c);
  });
});
