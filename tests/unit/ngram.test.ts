// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { ngrams, ngramSimilarity, ngramRank } from '../../src/shared/search/ngram';

describe('ngram', () => {
  it('produces padded bigrams', () => {
    expect(ngrams('ab', 2)).toEqual([' a', 'ab', 'b ']);
  });

  it('similarity is 1 for identical, lower for different', () => {
    expect(ngramSimilarity('apple', 'apple')).toBe(1);
    expect(ngramSimilarity('apple', 'apples')).toBeGreaterThan(0.5);
    expect(ngramSimilarity('apple', 'zzzzz')).toBeLessThan(0.2);
  });

  it('ranks candidates by similarity', () => {
    const ranked = ngramRank('prism', ['prism', 'prisma', 'forge'], 0);
    expect(ranked[0].value).toBe('prism');
    expect(ranked[0].score).toBe(1);
    expect(ranked.map((r) => r.value)).not.toContain('forge'); // 0 overlap filtered? (threshold 0)
  });

  it('honors the threshold', () => {
    const ranked = ngramRank('apple', ['apples', 'zzz'], 0.3);
    expect(ranked.map((r) => r.value)).toEqual(['apples']);
  });
});
