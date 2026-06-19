// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies bracket matching (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { findMatchingBracket } from '../../src/shared/format/bracketMatcher';

describe('findMatchingBracket', () => {
  it('matches an opening bracket forward', () => {
    expect(findMatchingBracket('if (x) {y}', 3)).toEqual({ openPos: 3, closePos: 5 });
  });
  it('matches a closing bracket backward', () => {
    expect(findMatchingBracket('if (x) {y}', 9)).toEqual({ openPos: 7, closePos: 9 });
  });
  it('is depth-aware with nesting', () => {
    // "(a(b)c)" -> outer ( at 0 matches ) at 6
    expect(findMatchingBracket('(a(b)c)', 0)).toEqual({ openPos: 0, closePos: 6 });
    expect(findMatchingBracket('(a(b)c)', 2)).toEqual({ openPos: 2, closePos: 4 });
  });
  it('returns null for an unbalanced or non-bracket position', () => {
    expect(findMatchingBracket('(a(b)c', 0)).toBeNull(); // no closer for outer
    expect(findMatchingBracket('abc', 1)).toBeNull();    // not a bracket
    expect(findMatchingBracket('()', 5)).toBeNull();     // out of range
  });
  it('matches square brackets and braces too', () => {
    expect(findMatchingBracket('a[b]c', 1)).toEqual({ openPos: 1, closePos: 3 });
    expect(findMatchingBracket('{ }', 0)).toEqual({ openPos: 0, closePos: 2 });
  });
});
