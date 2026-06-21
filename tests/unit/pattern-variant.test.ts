// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Variant System — pattern variation (pure, deterministic).
import { describe, it, expect } from 'vitest';
import { varyPattern, patternDistance } from '../../src/shared/audio/patternVariant';

function makeGrid(rows: number, cols: number, fill = false): boolean[][] {
  return Array.from({ length: rows }, () => new Array<boolean>(cols).fill(fill));
}

describe('varyPattern', () => {
  it('preserves grid dimensions', () => {
    const g = makeGrid(4, 16);
    const v = varyPattern(g, 0.5, 1);
    expect(v.length).toBe(4);
    expect(v.every(r => r.length === 16)).toBe(true);
  });

  it('intensity 0 returns an identical grid', () => {
    const g = makeGrid(4, 16);
    g[0][0] = true; g[1][4] = true;
    expect(varyPattern(g, 0, 1)).toEqual(g);
  });

  it('is deterministic for the same grid + intensity + seed', () => {
    const g = makeGrid(6, 16);
    expect(varyPattern(g, 0.6, 9)).toEqual(varyPattern(g, 0.6, 9));
  });

  it('produces a real variation at high intensity (some cells differ)', () => {
    const g = makeGrid(8, 16);
    const v = varyPattern(g, 1, 3);
    expect(patternDistance(g, v)).toBeGreaterThan(0);
  });

  it('stays recognizable — low intensity changes fewer cells than high', () => {
    const g = makeGrid(8, 16);
    const low = patternDistance(g, varyPattern(g, 0.1, 5));
    const high = patternDistance(g, varyPattern(g, 1, 5));
    expect(high).toBeGreaterThan(low);
  });

  it('does not mutate the input grid', () => {
    const g = makeGrid(4, 8);
    const copy = g.map(r => [...r]);
    varyPattern(g, 1, 2);
    expect(g).toEqual(copy);
  });
});
