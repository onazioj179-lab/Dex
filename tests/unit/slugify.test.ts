// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from '../../src/shared/format/slugify';

describe('slugify', () => {
  it('slugifies names', () => {
    expect(slugify('My File 2!')).toBe('my-file-2');
    expect(slugify('  a---b  ')).toBe('a-b');
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  it('handles accents and punctuation', () => {
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('!!!')).toBe('');
  });

  it('ensures uniqueness', () => {
    expect(uniqueSlug('My Project', ['my-project'])).toBe('my-project-2');
    expect(uniqueSlug('My Project', ['my-project', 'my-project-2'])).toBe('my-project-3');
    expect(uniqueSlug('My Project', [])).toBe('my-project');
  });

  it('falls back for empty slugs', () => {
    expect(uniqueSlug('!!!', [], 'untitled')).toBe('untitled');
  });
});
