import { describe, it, expect } from 'vitest';
import { computePeaks, peakMagnitude, rms } from '../../src/shared/creative/waveform';

describe('waveform peaks', () => {
  it('reduces samples to per-bucket min/max', () => {
    const peaks = computePeaks([1, -1, 0.5, -0.5], 2);
    expect(peaks).toEqual([
      { min: -1, max: 1 },
      { min: -0.5, max: 0.5 },
    ]);
  });

  it('returns [] for empty input or zero buckets', () => {
    expect(computePeaks([], 10)).toEqual([]);
    expect(computePeaks([1, 2], 0)).toEqual([]);
  });

  it('does not upsample beyond sample count', () => {
    const peaks = computePeaks([0.5, -0.5], 10);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toEqual({ min: 0.5, max: 0.5 });
  });

  it('computes peak magnitude and rms', () => {
    expect(peakMagnitude([{ min: -1, max: 0.2 }, { min: -0.1, max: 0.3 }])).toBe(1);
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 6);
    expect(rms([])).toBe(0);
  });
});
