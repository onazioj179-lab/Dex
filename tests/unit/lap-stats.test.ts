// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Stopwatch lap statistics (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { computeLapStats } from '../../src/shared/format/lapStats';

describe('computeLapStats', () => {
  it('returns null when there are no usable splits', () => {
    expect(computeLapStats([])).toBeNull();
    expect(computeLapStats([0, -5, NaN, Infinity])).toBeNull();
  });

  it('computes average, total and count', () => {
    const s = computeLapStats([100, 200, 300])!;
    expect(s.count).toBe(3);
    expect(s.total).toBe(600);
    expect(s.average).toBe(200);
  });

  it('computes the median for odd and even counts', () => {
    expect(computeLapStats([300, 100, 200])!.median).toBe(200); // odd -> middle
    expect(computeLapStats([100, 200, 300, 400])!.median).toBe(250); // even -> mean of middle two
  });

  it('reports fastest and slowest regardless of input order', () => {
    const s = computeLapStats([500, 120, 333])!;
    expect(s.fastest).toBe(120);
    expect(s.slowest).toBe(500);
  });

  it('gives zero std dev for identical splits and a positive one otherwise', () => {
    expect(computeLapStats([250, 250, 250])!.stdDev).toBe(0);
    expect(computeLapStats([100, 300])!.stdDev).toBeCloseTo(100, 6);
  });

  it('drops non-positive / non-finite splits before aggregating', () => {
    const s = computeLapStats([100, 0, 200, NaN, -3])!;
    expect(s.count).toBe(2);
    expect(s.average).toBe(150);
  });
});
