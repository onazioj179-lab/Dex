// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { truncateMiddle, truncateEnd, truncatePath } from '../../src/shared/format/truncateMiddle';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncateMiddle('hello', 20)).toBe('hello');
  });

  it('elides the middle', () => {
    expect(truncateMiddle('abcdefghij', 7)).toBe('abc…hij');
  });

  it('truncates the end', () => {
    expect(truncateEnd('abcdefghij', 5)).toBe('abcd…');
    expect(truncateEnd('abc', 5)).toBe('abc');
  });

  it('truncates a path keeping the filename', () => {
    expect(truncatePath('a/b/c/d/file.txt', 14)).toBe('a/…/file.txt');
    expect(truncatePath('short.txt', 50)).toBe('short.txt');
  });

  it('normalizes backslashes in paths', () => {
    expect(truncatePath('a\\b\\c\\d\\file.txt', 14)).toBe('a/…/file.txt');
  });
});
