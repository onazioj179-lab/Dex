// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordUsage, readUsage, setDailyTokenCap, cloudTokensToday, today } from '../../src/renderer/uki/providers/usage';
import { chat, chatWithFallback } from '../../src/renderer/uki/providers/orchestrator';
import { setApiKey } from '../../src/renderer/uki/keystore';

const okOpenAI = (content: string, prompt = 10, completion = 5) => vi.fn(async () => ({
  ok: true, status: 200,
  json: async () => ({ model: 'gpt-4o', choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: completion } }),
  text: async () => '',
}));

beforeEach(() => localStorage.clear());

describe('AI usage totals and daily cloud cap', () => {
  it('accumulates per provider per day and resets on a new day', () => {
    const d1 = new Date(2026, 10, 1, 10);
    recordUsage('openai', 100, 20, false, d1);
    recordUsage('openai', 50, 10, true, d1);
    expect(readUsage(d1).byProvider.openai).toEqual({ prompt: 150, completion: 30, calls: 2, estimated: 60 });
    expect(readUsage(new Date(2026, 10, 2, 9)).byProvider).toEqual({});
    expect(today(d1)).toBe('2026-11-01');
  });

  it('records the token counts a provider returns', async () => {
    setApiKey('openai', 'sk-test');
    await chat('gpt-4o', [{ role: 'user', content: 'hi' }], { processingMode: 'hybrid' }, okOpenAI('hello', 12, 3));
    expect(readUsage().byProvider.openai).toMatchObject({ prompt: 12, completion: 3, calls: 1, estimated: 0 });
  });

  it('blocks cloud calls once the cap is reached, without sending anything', async () => {
    setApiKey('openai', 'sk-test');
    setDailyTokenCap(100);
    recordUsage('openai', 90, 20);
    expect(cloudTokensToday((id) => id === 'openai')).toBe(110);
    const fetchImpl = okOpenAI('x');
    await expect(chat('gpt-4o', [{ role: 'user', content: 'hi' }], { processingMode: 'hybrid' }, fetchImpl)).rejects.toThrow(/Daily cloud AI limit/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a capped cloud model falls back to the next allowed model', async () => {
    setApiKey('openai', 'sk-test');
    setDailyTokenCap(10);
    recordUsage('openai', 20, 0);
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      json: async () => (url.includes('11434') ? { model: 'llama3.1', message: { content: 'local answer' } } : {}),
      text: async () => '',
    }));
    const res = await chatWithFallback(['gpt-4o', 'llama3.1'], [{ role: 'user', content: 'hi' }], { processingMode: 'hybrid' }, fetchImpl);
    expect(res.content).toBe('local answer');
    expect(fetchImpl.mock.calls.every(([u]) => String(u).includes('11434'))).toBe(true);
  });
});
