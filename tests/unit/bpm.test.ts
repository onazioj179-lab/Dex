import { describe, it, expect } from 'vitest';
import { msPerBeat, beatsToMs, msToBeats, barDurationMs, quantizeToBeat, beatAt } from '../../src/shared/creative/bpm';

describe('bpm / tempo', () => {
  it('converts beats and ms at a tempo', () => {
    expect(msPerBeat(120)).toBe(500);
    expect(beatsToMs(4, 120)).toBe(2000);
    expect(msToBeats(2000, 120)).toBe(4);
  });

  it('computes bar duration', () => {
    expect(barDurationMs(120, 4)).toBe(2000);
    expect(barDurationMs(120, 3)).toBe(1500);
  });

  it('quantizes to beat subdivisions', () => {
    expect(quantizeToBeat(480, 120, 1)).toBe(500); // nearest whole beat
    expect(quantizeToBeat(600, 120, 2)).toBe(500); // nearest 1/2 beat (250ms grid)
    expect(quantizeToBeat(700, 120, 2)).toBe(750); // 700/250 = 2.8 -> 3 steps
  });

  it('finds the beat index', () => {
    expect(beatAt(1100, 120)).toBe(2);
    expect(beatAt(0, 120)).toBe(0);
  });
});
