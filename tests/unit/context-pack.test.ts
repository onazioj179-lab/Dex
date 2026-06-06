// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { packContext, estimateTokens } from '../../src/shared/uki/contextPack';

describe('UKI context packing (#028)', () => {
  it('packs the highest-score items that fit the budget', () => {
    const items = [
      { id: 'a', text: '', tokens: 40, score: 10 },
      { id: 'b', text: '', tokens: 40, score: 5 },
      { id: 'c', text: '', tokens: 30, score: 8 },
    ];
    const r = packContext(items, 80);
    expect(r.included.map((i) => i.id)).toEqual(['a', 'c']);
    expect(r.usedTokens).toBe(70);
    expect(r.droppedIds).toEqual(['b']);
  });

  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(1);
  });
});
