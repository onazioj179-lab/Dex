// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { levenshtein, similarity, closestMatch } from '../../src/shared/search/levenshtein';

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });

  it('computes normalized similarity', () => {
    expect(similarity('cat', 'cat')).toBe(1);
    expect(similarity('cat', 'bat')).toBeCloseTo(2 / 3, 6);
    expect(similarity('', '')).toBe(1);
  });

  it('finds the closest match', () => {
    const m = closestMatch('prizm', ['prism', 'vinx', 'forge']);
    expect(m?.value).toBe('prism');
    expect(m?.distance).toBe(1);
  });

  it('honors maxDistance', () => {
    expect(closestMatch('xyz', ['abc'], 1)).toBeNull();
    expect(closestMatch('abc', ['abc'], 0)?.value).toBe('abc');
  });
});
