// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { stripMarkdown, plainPreview } from '../../src/shared/uki/markdownStrip';

describe('markdown strip', () => {
  it('removes headings, emphasis and inline code', () => {
    expect(stripMarkdown('# Title\n\n**bold** and _italic_ and `code`'))
      .toBe('Title\n\nbold and italic and code');
  });

  it('keeps link/image text', () => {
    expect(stripMarkdown('[link](http://x)')).toBe('link');
    expect(stripMarkdown('![alt](img.png)')).toBe('alt');
  });

  it('removes list markers and blockquotes', () => {
    expect(stripMarkdown('- item1\n- item2')).toBe('item1\nitem2');
    expect(stripMarkdown('> quoted line')).toBe('quoted line');
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond');
  });

  it('keeps code-block contents', () => {
    expect(stripMarkdown('```js\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('makes a single-line preview with ellipsis', () => {
    const long = 'word '.repeat(50);
    const p = plainPreview(long, 20);
    expect(p.length).toBeLessThanOrEqual(20);
    expect(p.endsWith('…')).toBe(true);
  });
});
