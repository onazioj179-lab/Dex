// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Imosion peak/RMS/crest metering (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { computeSignalLevels } from '../../src/shared/audio/dsp';

describe('computeSignalLevels', () => {
  it('reports silence as -120 dB with zero crest', () => {
    const l = computeSignalLevels(new Float32Array(128));
    expect(l.peakDb).toBe(-120);
    expect(l.rmsDb).toBe(-120);
    expect(l.crestDb).toBe(0);
  });

  it('measures a full-scale DC block at 0 dB peak and rms (no crest)', () => {
    const l = computeSignalLevels(new Float32Array(64).fill(1));
    expect(l.peakDb).toBeCloseTo(0, 6);
    expect(l.rmsDb).toBeCloseTo(0, 6);
    expect(l.crestDb).toBeCloseTo(0, 6);
  });

  it('gives a full-scale square wave ~0 crest', () => {
    // Alternating +1/-1: peak = rms = 1 -> crest ~ 0.
    const sq = Float32Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const l = computeSignalLevels(sq);
    expect(l.peakDb).toBeCloseTo(0, 6);
    expect(l.rmsDb).toBeCloseTo(0, 6);
    expect(l.crestDb).toBeCloseTo(0, 6);
  });

  it('reports a positive crest factor for a peaky signal', () => {
    // Mostly quiet with one loud sample -> peak >> rms -> large crest.
    const data = new Float32Array(100);
    data[0] = 1; // single full-scale spike
    const l = computeSignalLevels(data);
    expect(l.peakDb).toBeCloseTo(0, 6);
    expect(l.rmsDb).toBeLessThan(-15);
    expect(l.crestDb).toBeGreaterThan(15);
  });

  it('computes RMS of a half-scale sine near -9 dBFS', () => {
    const n = 2048;
    const sine = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * i) / 64));
    const l = computeSignalLevels(sine);
    // RMS of amplitude-0.5 sine = 0.5/sqrt(2) ~= 0.3536 -> ~ -9.03 dBFS.
    expect(l.rmsDb).toBeCloseTo(-9.03, 1);
    expect(l.peakDb).toBeCloseTo(-6.02, 1); // peak ~0.5 -> -6.02 dB
  });
});
