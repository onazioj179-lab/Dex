import { describe, it, expect } from 'vitest';
import {
  dbToGain, gainToDb, clampGain, peakAmplitude, normalizeGain, applyGain,
} from '../../src/shared/creative/audioUtils';

describe('audio utils', () => {
  it('converts dB <-> gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 6);
    expect(dbToGain(6)).toBeCloseTo(1.995, 2);
    expect(gainToDb(1)).toBeCloseTo(0, 6);
    expect(gainToDb(2)).toBeCloseTo(6.02, 1);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('round-trips dB through gain', () => {
    for (const db of [-12, -6, 0, 3, 9]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 5);
    }
  });

  it('clamps gain into range', () => {
    expect(clampGain(-1)).toBe(0);
    expect(clampGain(2)).toBe(2);
    expect(clampGain(10, 4)).toBe(4);
    expect(clampGain(Number.NaN)).toBe(0);
  });

  it('finds peak amplitude', () => {
    expect(peakAmplitude([0.1, -0.5, 0.3])).toBe(0.5);
    expect(peakAmplitude([])).toBe(0);
  });

  it('computes normalize gain and applies it without mutating', () => {
    expect(normalizeGain([0.1, -0.5, 0.3])).toBe(2);
    expect(normalizeGain([0, 0])).toBe(1); // silent
    const src = [1, 2, 3];
    expect(applyGain(src, 2)).toEqual([2, 4, 6]);
    expect(src).toEqual([1, 2, 3]);
  });
});
