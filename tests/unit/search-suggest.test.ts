import { describe, it, expect } from 'vitest';
import { suggestCompletions, bestCompletion } from '../../src/shared/search/suggest';

describe('search suggest', () => {
  it('ranks prefix matches (shorter, then alphabetical)', () => {
    expect(suggestCompletions('pri', ['prism', 'print', 'forge'])).toEqual(['print', 'prism']);
  });

  it('includes substring matches after prefix matches', () => {
    expect(suggestCompletions('ri', ['prism', 'grid', 'forge'])).toEqual(['grid', 'prism']);
  });

  it('can disable substring matching', () => {
    expect(suggestCompletions('ri', ['prism', 'grid'], { substring: false })).toEqual([]);
  });

  it('empty prefix returns the head of candidates', () => {
    expect(suggestCompletions('', ['a', 'b', 'c'], { limit: 2 })).toEqual(['a', 'b']);
  });

  it('respects the limit and bestCompletion', () => {
    expect(suggestCompletions('p', ['prism', 'print', 'pixel'], { limit: 2 })).toHaveLength(2);
    expect(bestCompletion('pri', ['prism', 'print'])).toBe('print');
    expect(bestCompletion('zzz', ['prism'])).toBeNull();
  });
});
