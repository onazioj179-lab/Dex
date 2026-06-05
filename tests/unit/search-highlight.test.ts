// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { highlightRanges, highlightSegments } from '../../src/shared/search/highlight';

describe('search highlight', () => {
  it('finds case-insensitive ranges', () => {
    expect(highlightRanges('Prism Editor', 'prism')).toEqual([{ start: 0, end: 5 }]);
    expect(highlightRanges('Open the Browser', 'browser')).toEqual([{ start: 9, end: 16 }]);
  });

  it('highlights multiple terms and merges overlaps', () => {
    const ranges = highlightRanges('research workspace', 'research work');
    expect(ranges).toEqual([{ start: 0, end: 8 }, { start: 9, end: 13 }]);
  });

  it('returns no ranges when nothing matches', () => {
    expect(highlightRanges('hello', 'xyz')).toEqual([]);
    expect(highlightRanges('', 'x')).toEqual([]);
    expect(highlightRanges('hello', '')).toEqual([]);
  });

  it('segments reconstruct the full text', () => {
    const segs = highlightSegments('Prism Editor', 'prism');
    expect(segs).toEqual([
      { text: 'Prism', match: true },
      { text: ' Editor', match: false },
    ]);
    expect(segs.map((s) => s.text).join('')).toBe('Prism Editor');
  });

  it('segments with no match return the whole string unmatched', () => {
    expect(highlightSegments('hello', 'zzz')).toEqual([{ text: 'hello', match: false }]);
  });

  it('handles repeated occurrences of a term', () => {
    expect(highlightRanges('aXaXa', 'a')).toEqual([
      { start: 0, end: 1 }, { start: 2, end: 3 }, { start: 4, end: 5 },
    ]);
  });
});
