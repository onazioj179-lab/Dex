// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.10.0 wave Q - audio core tests

import { describe, expect, it } from 'vitest';
import {
  DELIVERY_TARGETS,
  applyCompressor,
  applyFade,
  applyLimiter,
  applyModulationMatrix,
  applyNoiseGate,
  bitCrush,
  checkDelivery,
  chromaFromFrequencies,
  combDelay,
  compressorGainDb,
  computeBiquadCoefficients,
  dbToGain,
  detectChord,
  detectOnsets,
  detectPitchYin,
  dftMagnitude,
  dominantFrequency,
  envelopeFollower,
  equalPowerCrossfade,
  estimateKey,
  estimateTempo,
  fadeShape,
  frequencyToMidi,
  gainToDb,
  integratedLufs,
  lfoValue,
  midSideDecode,
  midSideEncode,
  midiToFrequency,
  multiTapDelay,
  normalisePeak,
  panGains,
  panMono,
  peakAbs,
  planLatencyCompensation,
  processBiquad,
  processStateVariableFilter,
  renderAdsr,
  rms,
  rmsDb,
  snapMidiToScale,
  spectralCentroid,
  stemFileName,
  tempoSyncMs,
  truePeak,
  waveshape,
  zeroCrossingRate,
} from '../../src/shared/audio';

function sine(freq: number, sampleRate: number, samples: number, amp = 1): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp;
  return out;
}

describe('wave Q - levels and fades', () => {
  it('converts dB and gain with stable floor', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 6);
    expect(gainToDb(1)).toBeCloseTo(0, 6);
    expect(gainToDb(0)).toBe(-120);
  });

  it('converts midi notes and frequencies', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6);
  });

  it('normalises peak to a target dB', () => {
    const out = normalisePeak(new Float32Array([0.25, -0.5]), -6);
    expect(peakAbs(out)).toBeCloseTo(dbToGain(-6), 5);
  });

  it('renders common fade shapes', () => {
    expect(fadeShape(0.5, 'linear')).toBeCloseTo(0.5, 6);
    expect(fadeShape(0.5, 's-curve')).toBeCloseTo(0.5, 6);
    expect(fadeShape(-1)).toBe(0);
    expect(fadeShape(2)).toBe(1);
  });

  it('applies fade-in and fade-out without changing length', () => {
    const out = applyFade(new Float32Array([1, 1, 1, 1, 1]), 2, 2, 'linear');
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(1);
    expect(out[4]).toBe(0);
  });

  it('crossfades with equal-power midpoint', () => {
    const out = equalPowerCrossfade(new Float32Array([1]), new Float32Array([1]), 0.5);
    expect(out[0]).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('wave Q - stereo and routing', () => {
  it('creates equal-power center pan gains', () => {
    const gains = panGains(0, '-3db');
    expect(gains.left).toBeCloseTo(Math.SQRT1_2, 6);
    expect(gains.right).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('pans mono blocks to stereo', () => {
    const out = panMono(new Float32Array([1, 1]), -1);
    expect(out.left[0]).toBeCloseTo(1, 6);
    expect(out.right[0]).toBeCloseTo(0, 6);
  });

  it('mid-side round trips a stereo pair', () => {
    const encoded = midSideEncode(new Float32Array([1, 0.25]), new Float32Array([0, -0.25]));
    const decoded = midSideDecode(encoded.mid, encoded.side);
    expect(decoded.left[0]).toBeCloseTo(1, 6);
    expect(decoded.right[1]).toBeCloseTo(-0.25, 6);
  });

  it('plans latency compensation from plugin chains', () => {
    const plan = planLatencyCompensation([
      { id: 'vocals', pluginLatencies: [64, 32] },
      { id: 'drums', pluginLatencies: [16] },
    ]);
    expect(plan.maxLatencySamples).toBe(96);
    expect(plan.perTrackDelaySamples.drums).toBe(80);
  });

  it('formats safe stem names from tokens', () => {
    expect(stemFileName('{index}-{project}-{track}.{ext}', {
      project: 'demo:one',
      track: 'lead/vocal',
      index: 3,
      extension: '.wav',
    })).toBe('03-demo-one-lead-vocal.wav');
  });
});

describe('wave Q - filters', () => {
  it('computes stable lowpass coefficients', () => {
    const coeffs = computeBiquadCoefficients({ type: 'lowpass', sampleRate: 48_000, frequencyHz: 1_000 });
    expect(Number.isFinite(coeffs.b0)).toBe(true);
    expect(Number.isFinite(coeffs.a1)).toBe(true);
    expect(coeffs.b0).toBeGreaterThan(0);
  });

  it('processes impulse through biquad and returns state', () => {
    const coeffs = computeBiquadCoefficients({ type: 'lowpass', sampleRate: 48_000, frequencyHz: 2_000 });
    const result = processBiquad(new Float32Array([1, 0, 0, 0]), coeffs);
    expect(result.output[0]).toBeCloseTo(coeffs.b0, 6);
    expect(Math.abs(result.state.y1)).toBeGreaterThan(0);
  });

  it('state-variable filter emits mode-specific output', () => {
    const input = new Float32Array([1, 0, 0, 0, 0]);
    const low = processStateVariableFilter(input, { mode: 'lowpass', sampleRate: 48_000, frequencyHz: 500 }).output;
    const high = processStateVariableFilter(input, { mode: 'highpass', sampleRate: 48_000, frequencyHz: 500 }).output;
    expect(low[0]).not.toBeCloseTo(high[0], 6);
  });
});

describe('wave Q - dynamics and tone', () => {
  it('envelope follows attacks faster than releases', () => {
    const env = envelopeFollower(new Float32Array([0, 1, 1, 0, 0]), { sampleRate: 1_000, attackMs: 1, releaseMs: 200 });
    expect(env[2]).toBeGreaterThan(env[1]);
    expect(env[4]).toBeGreaterThan(0);
  });

  it('computes compressor gain reduction above threshold', () => {
    expect(compressorGainDb(-6, { thresholdDb: -12, ratio: 4 })).toBeCloseTo(-4.5, 5);
    expect(compressorGainDb(-20, { thresholdDb: -12, ratio: 4 })).toBe(0);
  });

  it('compresses hot samples', () => {
    const out = applyCompressor(new Float32Array([1, 1, 1, 1]), {
      sampleRate: 1_000,
      attackMs: 1,
      releaseMs: 10,
      thresholdDb: -18,
      ratio: 4,
    });
    expect(out[3]).toBeLessThan(1);
  });

  it('gates quiet samples and keeps loud samples', () => {
    const out = applyNoiseGate(new Float32Array([0.001, 0.8]), { thresholdDb: -40, floorDb: -80 });
    expect(Math.abs(out[0])).toBeLessThan(0.001);
    expect(out[1]).toBeCloseTo(0.8, 6);
  });

  it('limits peaks to ceiling', () => {
    const out = applyLimiter(new Float32Array([-2, 0, 2]), -6);
    expect(peakAbs(out)).toBeCloseTo(dbToGain(-6), 6);
  });

  it('waveshapes and bit-crushes samples', () => {
    expect(waveshape(new Float32Array([10]), 1, 'hard')[0]).toBe(1);
    expect(bitCrush(new Float32Array([0.1, 0.2, 0.3]), 2, 2)[0]).toBe(bitCrush(new Float32Array([0.1, 0.2, 0.3]), 2, 2)[1]);
  });
});

describe('wave Q - delays and modulation', () => {
  it('comb delay repeats an impulse', () => {
    const out = combDelay(new Float32Array([1, 0, 0, 0]), 2, 0.5, 1);
    expect(out[2]).toBeCloseTo(1, 6);
  });

  it('multi-tap delay adds configured taps', () => {
    const out = multiTapDelay(new Float32Array([1, 0, 0, 0]), [{ delaySamples: 1, gain: 0.5 }, { delaySamples: 3, gain: 0.25 }]);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[3]).toBeCloseTo(0.25, 6);
  });

  it('converts beats to tempo-synced milliseconds', () => {
    expect(tempoSyncMs(120, 1)).toBe(500);
  });

  it('renders deterministic LFO values', () => {
    expect(lfoValue('sine', 0.25)).toBeCloseTo(1, 6);
    expect(lfoValue('square', 0.75)).toBe(-1);
    expect(lfoValue('sample-hold', 0.5, 0.25)).toBe(0.25);
  });

  it('renders ADSR envelope phases', () => {
    const env = renderAdsr({ sampleRate: 1_000, attackMs: 2, decayMs: 2, sustain: 0.5, releaseMs: 2, gateSamples: 6, totalSamples: 10 });
    expect(env[0]).toBe(0);
    expect(env[3]).toBeGreaterThan(0.5);
    expect(env[9]).toBe(0);
  });

  it('applies modulation routes onto destinations', () => {
    const out = applyModulationMatrix({ cutoff: 1000 }, { lfo1: 0.5, env1: 1 }, [
      { source: 'lfo1', destination: 'cutoff', amount: 200 },
      { source: 'env1', destination: 'gain', amount: 0.25 },
    ]);
    expect(out.cutoff).toBe(1100);
    expect(out.gain).toBe(0.25);
  });
});

describe('wave Q - meters and spectrum', () => {
  it('computes rms, rms dB, loudness, and true peak', () => {
    const input = new Float32Array([1, -1, 1, -1]);
    expect(rms(input)).toBe(1);
    expect(rmsDb(input)).toBeCloseTo(0, 6);
    expect(integratedLufs(input)).toBeCloseTo(-0.691, 3);
    expect(truePeak(input)).toBe(1);
  });

  it('computes zero crossing rate', () => {
    expect(zeroCrossingRate(new Float32Array([1, -1, 1, -1]))).toBe(1);
  });

  it('finds dominant sine frequency with DFT', () => {
    const input = sine(1_000, 8_000, 64);
    const bins = dftMagnitude(input, 8_000, 16);
    expect(dominantFrequency(bins)).toBeCloseTo(1_000, 0);
    expect(spectralCentroid(bins)).toBeGreaterThan(500);
  });

  it('checks delivery target loudness and peak', () => {
    const check = checkDelivery(new Float32Array([0.1, -0.1, 0.1]), DELIVERY_TARGETS.spotify);
    expect(check.target.id).toBe('spotify');
    expect(check.gainToTargetDb).toBeGreaterThan(0);
    expect(check.passesPeak).toBe(true);
  });
});

describe('wave Q - pitch, tempo, and harmony', () => {
  it('detects pitch with YIN', () => {
    const result = detectPitchYin(sine(440, 8_000, 1024), 8_000, 80, 800);
    expect(result.frequencyHz).toBeCloseTo(440, -1);
    expect(result.probability).toBeGreaterThan(0.75);
  });

  it('detects onsets and estimates tempo', () => {
    const input = new Float32Array(8_000);
    for (const idx of [0, 2_000, 4_000, 6_000]) input[idx] = 1;
    const onsets = detectOnsets(input, 1_000, 10);
    expect(onsets.length).toBeGreaterThanOrEqual(2);
    expect(estimateTempo(onsets, 8_000)).toBeCloseTo(120, 0);
  });

  it('maps frequency peaks to chroma', () => {
    const chroma = chromaFromFrequencies([{ frequencyHz: 440, magnitude: 1 }]);
    expect(chroma[9]).toBe(1);
  });

  it('estimates a C major key profile', () => {
    const estimate = estimateKey([1, 0, 0.2, 0, 0.8, 0.5, 0, 0.9, 0, 0.4, 0, 0.3]);
    expect(estimate.key).toBe('C');
    expect(estimate.mode).toBe('major');
  });

  it('detects basic triads', () => {
    const chord = detectChord([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
    expect(chord.root).toBe('C');
    expect(chord.quality).toBe('major');
  });

  it('snaps notes to scales', () => {
    expect(snapMidiToScale(61, 60, 'major')).toBe(62);
  });
});
