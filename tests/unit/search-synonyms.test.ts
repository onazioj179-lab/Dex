import { describe, it, expect } from 'vitest';
import { synonymsOf, expandTerms } from '../../src/shared/search/synonyms';

describe('search synonyms', () => {
  it('returns synonyms including the term', () => {
    const syn = synonymsOf('pic');
    expect(syn).toContain('pic');
    expect(syn).toContain('image');
    expect(syn).toContain('photo');
  });

  it('is bidirectional', () => {
    expect(synonymsOf('image')).toContain('pic');
    expect(synonymsOf('vid')).toContain('video');
    expect(synonymsOf('video')).toContain('vid');
  });

  it('returns the term itself when unknown', () => {
    expect(synonymsOf('xyzzy')).toEqual(['xyzzy']);
  });

  it('expands a query originals-first then synonyms, de-duped', () => {
    const terms = expandTerms('vid');
    expect(terms[0]).toBe('vid'); // original first
    expect(terms).toContain('video');
    expect(terms).toContain('movie');
    expect(new Set(terms).size).toBe(terms.length); // no dups
  });

  it('handles multi-term queries', () => {
    const terms = expandTerms('new doc');
    expect(terms.slice(0, 2)).toEqual(['new', 'doc']); // originals first
    expect(terms).toContain('create');
    expect(terms).toContain('document');
  });
});
