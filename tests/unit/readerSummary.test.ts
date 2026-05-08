// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { summarize, splitSentences, tokenize } from '../../src/shared/reader/readerSummary';

const SAMPLE = `
Climate scientists tracked an unusual heatwave across western Europe last summer.
The continent recorded its hottest July on record. Heatwaves are growing more
frequent in many regions. The unusual heatwave caused power-grid stress and
prompted emergency cooling stations. Researchers say the trend is consistent
with long-term warming projections from the IPCC. Local governments are now
preparing new heatwave response plans for next summer.
`.trim();

describe('readerSummary', () => {
  it('splitSentences finds multiple sentences', () => {
    const s = splitSentences('First sentence. Second sentence! Third one? Yes.');
    expect(s).toHaveLength(4);
  });

  it('splitSentences returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('tokenize drops stopwords and short tokens', () => {
    const t = tokenize('The quick brown fox jumps over a lazy dog.');
    expect(t).not.toContain('the');
    expect(t).not.toContain('a');
    expect(t).toContain('quick');
    expect(t).toContain('brown');
    expect(t).toContain('fox');
  });

  it('summarize returns the source unchanged when sentence count <= target', () => {
    const text = 'One sentence. Two sentences.';
    const r = summarize(text, { sentences: 5 });
    expect(r.totalSentences).toBe(2);
    expect(r.picks).toHaveLength(2);
    expect(r.summary).toBe(text);
  });

  it('summarize returns target count of sentences for longer input', () => {
    const r = summarize(SAMPLE, { sentences: 3 });
    expect(r.picks).toHaveLength(3);
    expect(r.totalSentences).toBeGreaterThan(3);
  });

  it('summary picks are returned in original document order', () => {
    const r = summarize(SAMPLE, { sentences: 3 });
    const sentences = splitSentences(SAMPLE);
    const indices = r.picks.map((p) => sentences.indexOf(p));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('summarize returns empty result for empty input', () => {
    const r = summarize('');
    expect(r.summary).toBe('');
    expect(r.picks).toEqual([]);
    expect(r.totalSentences).toBe(0);
  });

  it('summarize favors sentences with frequent terms', () => {
    const text = 'Dogs are loyal animals. Cats are independent. Dogs love their owners. Dogs make great companions.';
    const r = summarize(text, { sentences: 1 });
    expect(r.picks[0].toLowerCase()).toContain('dog');
  });
});
