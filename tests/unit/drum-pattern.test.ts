// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Session Performer — rule-based drum-pattern generator (pure, deterministic).
import { describe, it, expect } from 'vitest';
import { generateDrumPattern, DRUM_GENRES } from '../../src/shared/audio/drumPattern';

describe('generateDrumPattern', () => {
  it('returns a grid of the requested dimensions', () => {
    const g = generateDrumPattern({ genre: 'rock', rows: 8, steps: 16 });
    expect(g.length).toBe(8);
    expect(g.every(r => r.length === 16)).toBe(true);
  });

  it('is deterministic for the same genre + seed', () => {
    const a = generateDrumPattern({ genre: 'funk', rows: 6, steps: 16, seed: 42 });
    const b = generateDrumPattern({ genre: 'funk', rows: 6, steps: 16, seed: 42 });
    expect(a).toEqual(b);
  });

  it('house is four-on-the-floor (kick on every quarter)', () => {
    const g = generateDrumPattern({ genre: 'house', rows: 4, steps: 16 });
    expect(g[0][0]).toBe(true);
    expect(g[0][4]).toBe(true);
    expect(g[0][8]).toBe(true);
    expect(g[0][12]).toBe(true);
  });

  it('places the snare on the backbeats (steps 4 and 12)', () => {
    for (const genre of DRUM_GENRES) {
      const g = generateDrumPattern({ genre, rows: 4, steps: 16 });
      expect(g[1][4]).toBe(true);
      expect(g[1][12]).toBe(true);
    }
  });

  it('produces at least one kick for every genre', () => {
    for (const genre of DRUM_GENRES) {
      const g = generateDrumPattern({ genre, rows: 4, steps: 16, seed: 7 });
      expect(g[0].some(Boolean)).toBe(true);
    }
  });

  it('scales authored 16-step patterns to other step counts', () => {
    const g = generateDrumPattern({ genre: 'house', rows: 4, steps: 32 });
    expect(g[0].length).toBe(32);
    expect(g[0][0]).toBe(true);   // step 0
    expect(g[0][8]).toBe(true);   // 16-step "4" -> 32-step "8"
    expect(g[0][16]).toBe(true);  // 16-step "8" -> 32-step "16"
  });

  it('never writes outside the grid', () => {
    const g = generateDrumPattern({ genre: 'trap', rows: 3, steps: 8, seed: 99 });
    expect(g.length).toBe(3);
    expect(g.every(r => r.length === 8)).toBe(true);
  });
});
