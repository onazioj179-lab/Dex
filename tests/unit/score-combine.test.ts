// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { combineScores, combineNamed, recencyBoost } from '../../src/shared/search/scoreCombine';

describe('score combine', () => {
  it('weighted-averages signals', () => {
    expect(combineScores([{ score: 1, weight: 1 }, { score: 0, weight: 1 }])).toBe(0.5);
    expect(combineScores([{ score: 0.8, weight: 3 }, { score: 0.4, weight: 1 }])).toBeCloseTo(0.7, 6);
  });

  it('clamps scores and handles no weight', () => {
    expect(combineScores([{ score: 2, weight: 1 }])).toBe(1); // clamped
    expect(combineScores([])).toBe(0);
    expect(combineScores([{ score: 0.5, weight: 0 }])).toBe(0);
  });

  it('combineNamed uses a weight map', () => {
    expect(combineNamed({ lexical: 0.5, vector: 1 })).toBe(0.75); // equal default weights
    expect(combineNamed({ a: 1, b: 0 }, { a: 3, b: 1 })).toBeCloseTo(0.75, 6);
  });

  it('recencyBoost decays with age', () => {
    const fresh = recencyBoost(0.5, 0, 1000);
    const old = recencyBoost(0.5, 1000, 1000);
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeCloseTo(0.5, 6);
  });
});
