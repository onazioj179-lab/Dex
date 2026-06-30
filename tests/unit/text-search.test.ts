// =============================================================================
// DEX Platform — ranked line search tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { searchLines, tokenize } from '../../src/shared/search/textSearch';

const CODE = [
  'function add(a, b) {',          // 1
  '  return a + b;',               // 2
  '}',                             // 3
  'const sum = add(1, 2);',        // 4
  'function multiply(x, y) { return x * y; }', // 5
].join('\n');

describe('tokenize', () => {
  it('lowercases and drops short/punctuation tokens', () => {
    expect(tokenize('Return  X, multiply()')).toEqual(['return', 'multiply']);
    expect(tokenize('  ')).toEqual([]);
  });
});

describe('searchLines', () => {
  it('returns the lines containing a term, best first', () => {
    const hits = searchLines(CODE, 'function');
    const lineNos = hits.map((h) => h.line);
    expect(lineNos).toContain(1);
    expect(lineNos).toContain(5);
    expect(hits[0].text.length).toBeGreaterThan(0);
  });

  it('ranks a line containing ALL query terms above a partial match', () => {
    // line 5 has both "return" and "multiply"; line 2 only "return".
    const hits = searchLines(CODE, 'return multiply');
    expect(hits[0].line).toBe(5);
    expect(hits.find((h) => h.line === 2)).toBeTruthy();
    const top = hits.find((h) => h.line === 5)!;
    const partial = hits.find((h) => h.line === 2)!;
    expect(top.score).toBeGreaterThan(partial.score);
  });

  it('returns nothing for a miss or an empty query', () => {
    expect(searchLines(CODE, 'nonexistent')).toEqual([]);
    expect(searchLines(CODE, '')).toEqual([]);
    expect(searchLines('', 'add')).toEqual([]);
  });

  it('honors the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => `line ${i} value`).join('\n');
    expect(searchLines(many, 'value', 5)).toHaveLength(5);
  });
});
