// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Imosion chord detector tests
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { computeChromaFrame, matchChord, detectChords } from '../../src/renderer/DEXAPPLICATIONS/imosion/ImosionChordDetect';

const SAMPLE_RATE = 44100;

function tone(frequency: number, lengthSec: number, amplitude = 0.33): Float32Array {
  const length = Math.floor(lengthSec * SAMPLE_RATE);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    output[i] = Math.sin(2 * Math.PI * frequency * t) * amplitude;
  }
  return output;
}

function sumSignals(...signals: Float32Array[]): Float32Array {
  const length = signals[0]?.length ?? 0;
  const output = new Float32Array(length);
  for (const signal of signals) {
    for (let i = 0; i < length; i++) {
      output[i] += signal[i] ?? 0;
    }
  }
  return output;
}

describe('ImosionChordDetect', () => {
  it('computes a normalized 12-bin chroma frame', () => {
    const cMajorSingle = tone(261.63, 0.25, 0.8);
    // FFT requires a power-of-two frame.
    const chroma = computeChromaFrame(cMajorSingle.slice(0, 4096), SAMPLE_RATE);

    expect(chroma).toHaveLength(12);
    const norm = Math.sqrt(chroma.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it('matches C major triad from synthetic tones', () => {
    const c4 = tone(261.63, 1.0);
    const e4 = tone(329.63, 1.0);
    const g4 = tone(392.0, 1.0);
    const signal = sumSignals(c4, e4, g4);

    const chroma = computeChromaFrame(signal.slice(0, 4096), SAMPLE_RATE);
    const chord = matchChord(chroma);

    expect(chord.root).toBe('C');
    expect(chord.quality).toBe('maj');
    expect(chord.confidence).toBeGreaterThan(0.7);
  });

  it('matches A minor triad from synthetic tones', () => {
    const a3 = tone(220.0, 1.0);
    const c4 = tone(261.63, 1.0);
    const e4 = tone(329.63, 1.0);
    const signal = sumSignals(a3, c4, e4);

    const chord = matchChord(computeChromaFrame(signal.slice(0, 4096), SAMPLE_RATE));

    expect(chord.root).toBe('A');
    expect(chord.quality).toBe('min');
    expect(chord.confidence).toBeGreaterThan(0.65);
  });

  it('returns stable chord segments over a two-chord progression', () => {
    const cMajor = sumSignals(tone(261.63, 0.9), tone(329.63, 0.9), tone(392.0, 0.9));
    // G major triad: G3 + B3 + D4 (D4 = 293.66 Hz).
    const gMajor = sumSignals(tone(196.0, 0.9), tone(246.94, 0.9), tone(293.66, 0.9));

    const joined = new Float32Array(cMajor.length + gMajor.length);
    joined.set(cMajor, 0);
    joined.set(gMajor, cMajor.length);

    const segments = detectChords(joined, {
      sampleRate: SAMPLE_RATE,
      frameSize: 4096,
      hopSize: 2048,
      minConfidence: 0.55,
      minSegmentSec: 0.1,
    });

    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0].root).toBe('C');
    expect(segments[0].quality).toBe('maj');

    const last = segments[segments.length - 1];
    expect(last.root).toBe('G');
    expect(last.quality).toBe('maj');
  });
});
