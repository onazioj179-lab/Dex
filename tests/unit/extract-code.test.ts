// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { extractCodeBlocks, hasCodeBlock, extractInlineCode } from '../../src/shared/uki/extractCode';

describe('extract code', () => {
  it('extracts fenced blocks with language', () => {
    expect(extractCodeBlocks('```ts\nconst x = 1;\n```')).toEqual([
      { lang: 'ts', code: 'const x = 1;' },
    ]);
  });

  it('extracts multiple blocks', () => {
    const md = 'a\n```js\nfoo()\n```\nb\n```\nplain\n```';
    const blocks = extractCodeBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ lang: 'js', code: 'foo()' });
    expect(blocks[1]).toEqual({ lang: '', code: 'plain' });
  });

  it('detects presence', () => {
    expect(hasCodeBlock('no code here')).toBe(false);
    expect(hasCodeBlock('```\nx\n```')).toBe(true);
  });

  it('extracts inline code excluding fences', () => {
    expect(extractInlineCode('use `foo` and `bar`')).toEqual(['foo', 'bar']);
    expect(extractInlineCode('```\n`notinline`\n```\nbut `yes`')).toEqual(['yes']);
  });
});
