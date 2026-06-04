import { describe, it, expect } from 'vitest';
import { rankDocuments } from '../../src/shared/search/rankDocuments';

const docs = [
  { id: '1', text: 'the quick brown fox' },
  { id: '2', text: 'lazy dog sleeps' },
  { id: '3', text: 'quick fox runs quick' },
];

describe('rank documents (integration)', () => {
  it('ranks matching docs and excludes non-matches', () => {
    const ranked = rankDocuments('quick fox', docs);
    const ids = ranked.map((r) => r.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('2'); // no query terms
    expect(ranked).toHaveLength(2);
  });

  it('empty query or docs → []', () => {
    expect(rankDocuments('', docs)).toEqual([]);
    expect(rankDocuments('quick', [])).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rankDocuments('quick fox', docs, { limit: 1 })).toHaveLength(1);
  });

  it('recency blend favors the fresher of two equal matches', () => {
    const now = 10_000_000;
    const equalDocs = [
      { id: 'old', text: 'quick fox', ts: now - 1_000_000 },
      { id: 'new', text: 'quick fox', ts: now },
    ];
    const ranked = rankDocuments('quick fox', equalDocs, { recencyHalfLifeMs: 100_000, now });
    expect(ranked[0].id).toBe('new');
  });
});
