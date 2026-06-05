// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { mergeConsecutive, dropEmpty, isAlternating, normalizeMessages } from '../../src/shared/uki/mergeMessages';

describe('merge messages', () => {
  it('merges adjacent same-role messages', () => {
    expect(mergeConsecutive([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'c' },
    ])).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ]);
  });

  it('drops empty messages', () => {
    expect(dropEmpty([{ role: 'user', content: '  ' }, { role: 'user', content: 'x' }]))
      .toEqual([{ role: 'user', content: 'x' }]);
  });

  it('detects alternation (ignoring system)', () => {
    expect(isAlternating([
      { role: 'system', content: 's' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])).toBe(true);
    expect(isAlternating([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }])).toBe(false);
  });

  it('normalize drops empties then merges, yielding alternation', () => {
    const out = normalizeMessages([
      { role: 'user', content: 'a' },
      { role: 'user', content: '' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'c' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }]);
    expect(isAlternating(out)).toBe(true);
  });
});
