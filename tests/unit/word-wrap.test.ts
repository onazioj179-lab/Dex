// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { wrapText, wrap } from '../../src/shared/text/wordWrap';

describe('word wrap', () => {
  it('greedily wraps to width', () => {
    expect(wrapText('the quick brown fox', 9)).toEqual(['the quick', 'brown fox']);
  });

  it('hard-breaks long words', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('preserves existing newlines', () => {
    expect(wrapText('a\nb', 10)).toEqual(['a', 'b']);
    expect(wrapText('', 10)).toEqual(['']);
  });

  it('wrap joins back to a string', () => {
    expect(wrap('one two three', 7)).toBe('one two\nthree');
  });
});
