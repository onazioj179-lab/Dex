// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave B audio mastering tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  biquadCoefficients, processBiquad,
  adsrLevelAt,
  loudnessLUFS, truePeakDb,
  processCompressor, processLimiter,
  detectBpm,
  panGains,
  detectKey, chromaFromMagnitudes,
  quantizeBeat, applyHumanize,
  PLATFORM_LUFS_TARGETS, loudnessGainToTarget,
} from '../../src/shared/audio/mastering';

describe('biquad', () => {
  it('lowpass attenuates high freq', () => {
    const sr = 48000;
    const coef = biquadCoefficients('lowpass', sr, 1000, 0.707);
    const sig = new Float32Array(2048);
    for (let i = 0; i < sig.length; i++) sig[i] = Math.sin(2 * Math.PI * 12000 * i / sr);
    const { output } = processBiquad(sig, coef);
    const energyIn = sig.reduce((a, b) => a + b * b, 0);
    const energyOut = output.reduce((a, b) => a + b * b, 0);
    expect(energyOut).toBeLessThan(energyIn / 4);
  });

  it('throws on bad params', () => {
    expect(() => biquadCoefficients('lowpass', 0, 100, 1)).toThrow();
    expect(() => biquadCoefficients('lowpass', 48000, 50000, 1)).toThrow();
    expect(() => biquadCoefficients('lowpass', 48000, 100, 0)).toThrow();
  });

  it('all biquad types produce coefficients', () => {
    const types = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf'] as const;
    for (const t of types) {
      const c = biquadCoefficients(t, 48000, 1000, 0.7, 3);
      expect(Number.isFinite(c.b0)).toBe(true);
    }
  });
});

describe('ADSR', () => {
  it('attack rises to 1', () => {
    expect(adsrLevelAt({ attackMs: 100, decayMs: 0, sustain: 1, releaseMs: 0 }, 50, null)).toBeCloseTo(0.5);
    expect(adsrLevelAt({ attackMs: 100, decayMs: 0, sustain: 1, releaseMs: 0 }, 100, null)).toBeCloseTo(1);
  });
  it('release falls to 0', () => {
    const p = { attackMs: 0, decayMs: 0, sustain: 0.5, releaseMs: 100 };
    expect(adsrLevelAt(p, 200, 0)).toBeCloseTo(0.5);
    expect(adsrLevelAt(p, 200, 100)).toBeCloseTo(0);
  });
  it('sustain held', () => {
    expect(adsrLevelAt({ attackMs: 10, decayMs: 10, sustain: 0.7, releaseMs: 0 }, 100, null)).toBeCloseTo(0.7);
  });
});

describe('loudness + true peak', () => {
  it('LUFS finite for sine', () => {
    const sr = 48000;
    const ch = new Float32Array(sr);
    for (let i = 0; i < ch.length; i++) ch[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / sr);
    const lufs = loudnessLUFS([ch], sr);
    expect(Number.isFinite(lufs)).toBe(true);
    expect(lufs).toBeLessThan(0);
  });
  it('true peak detects above sample peak', () => {
    const samples = new Float32Array([0, 0.9, 0, -0.9, 0]);
    expect(truePeakDb(samples)).toBeGreaterThanOrEqual(20 * Math.log10(0.9) - 1e-6);
  });
});

describe('compressor + limiter', () => {
  it('compressor reduces gain over threshold', () => {
    const sig = new Float32Array(1000).fill(0.8);
    const out = processCompressor(sig, { thresholdDb: -12, ratio: 4, attackMs: 1, releaseMs: 50, kneeDb: 2, makeupDb: 0 }, 48000);
    // Steady-state should be reduced; allow tiny float overshoot at the very first sample before envelope settles.
    expect(out[out.length - 1]).toBeLessThan(0.8);
  });
  it('limiter holds ceiling', () => {
    const sig = new Float32Array(2000).fill(0.99);
    const out = processLimiter(sig, -1, 50, 48000);
    const ceiling = Math.pow(10, -1 / 20);
    for (let i = 100; i < out.length; i++) expect(Math.abs(out[i])).toBeLessThanOrEqual(ceiling + 1e-3);
  });
});

describe('BPM detection', () => {
  it('approximates 120 BPM', () => {
    const sr = 22050;
    const dur = sr * 4;
    const sig = new Float32Array(dur);
    const period = sr / 2; // 120 bpm = 2 beats/sec
    for (let i = 0; i < dur; i++) sig[i] = (i % period < 1024) ? 1 : 0;
    const bpm = detectBpm(sig, sr);
    expect(bpm).toBeGreaterThan(110);
    expect(bpm).toBeLessThan(130);
  });
});

describe('pan law', () => {
  it('linear center', () => {
    const g = panGains(0, 'linear');
    expect(g.left).toBeCloseTo(0.5);
    expect(g.right).toBeCloseTo(0.5);
  });
  it('-3dB equal power center', () => {
    const g = panGains(0, '-3dB');
    expect(g.left * g.left + g.right * g.right).toBeCloseTo(1);
  });
  it('full right', () => {
    const g = panGains(1, 'linear');
    expect(g.left).toBe(0);
    expect(g.right).toBe(1);
  });
});

describe('key detection', () => {
  it('detects C major chroma', () => {
    const c = [1, 0, 0.7, 0, 0.8, 0.5, 0, 0.9, 0, 0.4, 0, 0.6];
    const k = detectKey(c);
    expect(k.key).toBe('C');
    expect(k.mode).toBe('major');
  });
  it('chromaFromMagnitudes returns length 12', () => {
    const m = new Float32Array(1024); m.fill(1);
    expect(chromaFromMagnitudes(m, 48000).length).toBe(12);
  });
  it('throws on non-12 chroma', () => {
    expect(() => detectKey([1, 2, 3])).toThrow();
  });
});

describe('quantize + humanize', () => {
  it('snaps to grid at full strength', () => {
    expect(quantizeBeat(0.6, 4)).toBeCloseTo(0.5);
  });
  it('partial strength interpolates', () => {
    expect(quantizeBeat(0.6, 4, 0.5)).toBeCloseTo(0.55);
  });
  it('humanize is deterministic per seed', () => {
    expect(applyHumanize(1, 0.1, 42)).toBe(applyHumanize(1, 0.1, 42));
  });
});

describe('loudness targets', () => {
  it('platforms exposed', () => {
    expect(PLATFORM_LUFS_TARGETS.spotify).toBe(-14);
  });
  it('gain to target', () => {
    expect(loudnessGainToTarget(-20, -14)).toBe(6);
  });
});
