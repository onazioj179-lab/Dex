// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { detectTempo, detectOnsets } from '../../src/shared/media/beatDetect';

const SR = 8000;

/** Build a click track: short impulses every `periodSec`. */
function clicks(durSec: number, periodSec: number): Float32Array {
  const n = Math.round(SR * durSec);
  const out = new Float32Array(n);
  const period = Math.round(periodSec * SR);
  for (let t = 0; t < n; t += period) {
    for (let k = 0; k < 8 && t + k < n; k++) out[t + k] = 1;
  }
  return out;
}

describe('beatDetect.detectTempo (#233 real tempo engine)', () => {
  it('recovers ~120 BPM from a 0.5s click track', () => {
    const sig = clicks(4, 0.5); // 120 BPM
    const { bpm, confidence } = detectTempo(sig, SR, { hop: 256 });
    expect(bpm).toBeGreaterThan(105);
    expect(bpm).toBeLessThan(135);
    expect(confidence).toBeGreaterThan(0);
  });

  it('recovers ~100 BPM from a 0.6s click track', () => {
    const sig = clicks(5, 0.6); // 100 BPM
    const { bpm } = detectTempo(sig, SR, { hop: 256 });
    expect(bpm).toBeGreaterThan(88);
    expect(bpm).toBeLessThan(112);
  });

  it('returns zero for empty/invalid input', () => {
    expect(detectTempo(new Float32Array(0), SR).bpm).toBe(0);
    expect(detectTempo(new Float32Array(100), 0).bpm).toBe(0);
  });
});

describe('beatDetect.detectOnsets (#241 real beat engine)', () => {
  it('finds roughly one onset per click', () => {
    const sig = clicks(4, 0.5); // ~8 clicks
    const onsets = detectOnsets(sig, SR, { hop: 256 });
    expect(onsets.length).toBeGreaterThanOrEqual(6);
    expect(onsets.length).toBeLessThanOrEqual(10);
    // first onset is near the start
    expect(onsets[0]).toBeLessThan(0.6);
  });
});
