// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  estimateTokens, messageTokens, totalTokens, fitToContext, type FitMessage,
} from '../../src/shared/uki/contextFit';

describe('uki context fit', () => {
  it('estimates tokens ~4 chars/token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('includes per-message overhead', () => {
    const m: FitMessage = { role: 'user', content: 'abcd' }; // 1 + 4
    expect(messageTokens(m)).toBe(5);
  });

  it('returns all messages when under budget', () => {
    const msgs: FitMessage[] = [{ role: 'user', content: 'hi' }];
    const r = fitToContext(msgs, 1000);
    expect(r.dropped).toBe(0);
    expect(r.messages).toHaveLength(1);
  });

  it('drops oldest non-pinned messages to fit', () => {
    const msgs: FitMessage[] = [
      { role: 'system', content: 'x'.repeat(40), pinned: true }, // ~14 tokens, kept
      { role: 'user', content: 'a'.repeat(40) },  // ~14
      { role: 'assistant', content: 'b'.repeat(40) }, // ~14
      { role: 'user', content: 'c'.repeat(40) },  // ~14
    ];
    const r = fitToContext(msgs, 32);
    expect(r.tokens).toBeLessThanOrEqual(32);
    expect(r.dropped).toBeGreaterThan(0);
    // system prompt is pinned -> always present
    expect(r.messages.some((m) => m.pinned)).toBe(true);
    expect(r.messages[0].role).toBe('system');
  });

  it('keeps pinned even if they alone exceed budget', () => {
    const msgs: FitMessage[] = [{ role: 'system', content: 'z'.repeat(400), pinned: true }];
    const r = fitToContext(msgs, 10);
    expect(r.messages).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });

  it('totalTokens sums message costs', () => {
    const msgs: FitMessage[] = [{ role: 'user', content: 'abcd' }, { role: 'user', content: 'abcd' }];
    expect(totalTokens(msgs)).toBe(10); // (1+4)*2
  });
});
