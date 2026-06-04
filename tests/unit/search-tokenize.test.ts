import { describe, it, expect } from 'vitest';
import { tokenize, termFrequencies } from '../../src/shared/search/tokenize';

describe('tokenize', () => {
  it('lowercases, splits, drops stopwords and short tokens', () => {
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
    expect(tokenize('a I it is')).toEqual([]); // all stopwords / too short
  });

  it('splits on punctuation', () => {
    expect(tokenize('Hello, world! email@example.com')).toEqual(['hello', 'world', 'email', 'example', 'com']);
  });

  it('can keep stopwords and de-duplicate', () => {
    expect(tokenize('go go go', { unique: true })).toEqual(['go']);
    expect(tokenize('the the', { stopwords: false, minLength: 2 })).toEqual(['the', 'the']);
  });

  it('respects minLength', () => {
    expect(tokenize('ab abc abcd', { stopwords: false, minLength: 3 })).toEqual(['abc', 'abcd']);
  });

  it('computes term frequencies', () => {
    const f = termFrequencies('hello hello world');
    expect(f.get('hello')).toBe(2);
    expect(f.get('world')).toBe(1);
  });
});
