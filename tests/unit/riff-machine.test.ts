// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Idea Forge (Riff Machine) — rule-based melodic generation (pure, deterministic).
import { describe, it, expect } from 'vitest';
import { generateRiff, scalePitches, RIFF_SCALES } from '../../src/shared/audio/riffMachine';

describe('generateRiff', () => {
  it('is deterministic for the same inputs + seed', () => {
    const a = generateRiff({ root: 60, scale: 'minor', bars: 2, seed: 5 });
    const b = generateRiff({ root: 60, scale: 'minor', bars: 2, seed: 5 });
    expect(a).toEqual(b);
  });

  it('keeps every note within the chosen scale', () => {
    for (const scale of RIFF_SCALES) {
      const root = 60;
      const allowed = new Set(scalePitches(root, scale, 3).map(p => ((p - root) % 12 + 12) % 12));
      const riff = generateRiff({ root, scale, bars: 4, density: 1, seed: 11 });
      for (const n of riff) {
        expect(allowed.has(((n.pitch - root) % 12 + 12) % 12)).toBe(true);
      }
    }
  });

  it('always anchors a note on the first downbeat', () => {
    const riff = generateRiff({ root: 57, scale: 'pentatonicMinor', bars: 2, density: 0, seed: 3 });
    expect(riff.length).toBeGreaterThan(0);
    expect(riff[0].startTime).toBe(0);
  });

  it('places notes on the rhythm grid within the bar span', () => {
    const bars = 3, stepsPerBar = 8;
    const riff = generateRiff({ root: 60, scale: 'major', bars, stepsPerBar, density: 0.8, seed: 9 });
    const stepBeats = 4 / stepsPerBar;
    for (const n of riff) {
      expect(n.startTime).toBeGreaterThanOrEqual(0);
      expect(n.startTime).toBeLessThan(bars * 4);
      // startTime lands on the grid
      expect(Math.abs((n.startTime / stepBeats) - Math.round(n.startTime / stepBeats))).toBeLessThan(1e-9);
      expect(n.velocity).toBeGreaterThanOrEqual(0);
      expect(n.velocity).toBeLessThanOrEqual(127);
    }
  });

  it('produces denser output at higher density', () => {
    const sparse = generateRiff({ root: 60, scale: 'major', bars: 4, density: 0.1, seed: 1 });
    const dense = generateRiff({ root: 60, scale: 'major', bars: 4, density: 1, seed: 1 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });
});
