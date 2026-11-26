// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  isHistoryRequest, historyKeywords, rankHits, formatRecall, recallFromHistory, recentWindow, PanelHistory,
} from '../../src/renderer/uki/chatHistory';

describe('UKI conversation history', () => {
  it('spots requests about earlier chats', () => {
    expect(isHistoryRequest('What did we talk about yesterday?')).toBe(true);
    expect(isHistoryRequest('continue where we left off on the budget')).toBe(true);
    expect(isHistoryRequest('remember what I told you about my sister')).toBe(true);
    expect(isHistoryRequest('show our chat history about maps')).toBe(true);
    expect(isHistoryRequest('What is the capital of Ghana?')).toBe(false);
  });

  it('keeps the meaningful words', () => {
    expect(historyKeywords('What did we talk about the Lagos trip budget last time?')).toEqual(['budget', 'lagos', 'trip']);
  });

  it('ranks by matches then recency and can skip the current conversation', () => {
    const hits = [
      { conversation_id: 'a', role: 'user', content: 'lagos trip', timestamp: 1 },
      { conversation_id: 'b', role: 'copilot', content: 'lagos trip budget is 900', timestamp: 2 },
      { conversation_id: 'c', role: 'user', content: 'budget', timestamp: 3 },
      { conversation_id: 'b', role: 'copilot', content: 'lagos trip budget is 900', timestamp: 2 },
    ];
    const r = rankHits(hits, ['lagos', 'trip', 'budget'], 'c');
    expect(r.map((h) => h.conversation_id)).toEqual(['b', 'a']);
  });

  it('formats a labelled, bounded block', () => {
    const now = Date.UTC(2026, 10, 25);
    const block = formatRecall([{ conversation_id: 'x', conversation_title: 'Trip', role: 'user', content: 'Book the flight', timestamp: now - 86_400_000 }], now);
    expect(block).toContain('From earlier conversations');
    expect(block).toContain('yesterday, in "Trip": User: Book the flight');
    expect(formatRecall([])).toBe('');
  });

  it('searches the store and needs two matching words for ordinary questions', async () => {
    const invoke = vi.fn(async (_ch: string, q: unknown) => (q === 'lagos'
      ? [{ conversation_id: 'b', conversation_title: 'Trip', role: 'copilot', content: 'Your lagos trip budget is 900', timestamp: 5 },
        { conversation_id: 'd', conversation_title: 'Other', role: 'user', content: 'lagos weather', timestamp: 6 }]
      : []));
    const plain = await recallFromHistory(invoke, 'lagos trip budget ideas');
    expect(plain).toContain('900');
    expect(plain).not.toContain('weather');
    expect(invoke).toHaveBeenCalledWith('uki-chat:search', 'lagos', 40);
    expect(await recallFromHistory(vi.fn().mockRejectedValue(new Error('x')), 'lagos trip')).toBe('');
  });

  it('bounds the live prompt window', () => {
    expect(recentWindow([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
    expect(recentWindow([1], 2)).toEqual([1]);
  });

  it('saves panel turns into one conversation per session', async () => {
    const calls: unknown[][] = [];
    const invoke = vi.fn(async (...a: unknown[]) => { calls.push(a); return a[0] === 'uki-chat:createConversation' ? { id: `c${calls.length}` } : {}; });
    const h = new PanelHistory(() => invoke, 1000);
    await h.record('hello', 'hi there', 10_000);
    await h.record('again', 'sure', 10_500);
    await h.record('later', 'ok', 20_000);
    expect(calls.filter((c) => c[0] === 'uki-chat:createConversation')).toHaveLength(2);
    expect(calls.filter((c) => c[0] === 'uki-chat:appendMessage')).toHaveLength(6);
  });
});
