// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { idf, bm25Score, rankByBm25, type CorpusStats } from '../../src/shared/search/bm25';

const stats: CorpusStats = {
  totalDocs: 10,
  avgDocLength: 100,
  docFreq: new Map([['apple', 1], ['the', 10]]),
};

describe('bm25', () => {
  it('IDF is higher for rarer terms', () => {
    expect(idf('apple', stats)).toBeGreaterThan(idf('the', stats));
    expect(idf('the', stats)).toBeGreaterThanOrEqual(0);
  });

  it('scores 0 when no query term occurs in the doc', () => {
    expect(bm25Score(['apple'], new Map(), 100, stats)).toBe(0);
  });

  it('scores positive when the term occurs', () => {
    const score = bm25Score(['apple'], new Map([['apple', 3]]), 100, stats);
    expect(score).toBeGreaterThan(0);
  });

  it('saturates: more tf increases score but sub-linearly', () => {
    const s1 = bm25Score(['apple'], new Map([['apple', 1]]), 100, stats);
    const s5 = bm25Score(['apple'], new Map([['apple', 5]]), 100, stats);
    expect(s5).toBeGreaterThan(s1);
    expect(s5).toBeLessThan(s1 * 5); // saturation, not linear
  });

  it('ranks the matching doc first', () => {
    const docs = [
      { id: 'no', termFreq: new Map<string, number>(), length: 100 },
      { id: 'yes', termFreq: new Map([['apple', 2]]), length: 100 },
    ];
    const ranked = rankByBm25(['apple'], docs, stats);
    expect(ranked[0].doc.id).toBe('yes');
  });
});
