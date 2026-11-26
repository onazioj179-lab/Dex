// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { providersForKey, groqProvider, deepseekProvider } from '../../src/renderer/uki/providers/compatible';
import { identifyKey } from '../../src/renderer/uki/providers/identifyKey';
import { providerForModel, getProvider } from '../../src/renderer/uki/providers/registry';

describe('paste any key', () => {
  it('recognises providers by key prefix', () => {
    expect(providersForKey('sk-ant-api03-x')).toEqual(['anthropic']);
    expect(providersForKey('sk-or-v1-x')).toEqual(['openrouter']);
    expect(providersForKey('AIzaSyX')).toEqual(['google']);
    expect(providersForKey('gsk_abc')).toEqual(['groq']);
    expect(providersForKey('xai-abc')).toEqual(['xai']);
    expect(providersForKey('sk-proj-abc')).toEqual(['openai']);
    expect(providersForKey('sk-abc123')).toEqual(['openai', 'deepseek']);
    expect(providersForKey('a'.repeat(32))).toEqual(['mistral']);
    expect(providersForKey('hello')).toEqual([]);
  });

  it('an ambiguous key goes to the first provider that accepts it, and only to candidates', async () => {
    const asked: string[] = [];
    const id = await identifyKey('sk-abc123', async (url) => {
      asked.push(url);
      return { ok: url.startsWith('https://api.deepseek.com'), status: url.startsWith('https://api.deepseek.com') ? 200 : 401 };
    });
    expect(id).toBe('deepseek');
    expect(asked).toEqual(['https://api.openai.com/v1/models', 'https://api.deepseek.com/v1/models']);
    expect(await identifyKey('sk-abc123', async () => ({ ok: false, status: 401 }))).toBeNull();
  });

  it('compatible providers send OpenAI-format requests to their own endpoint', () => {
    const r = groqProvider.buildChatRequest({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0.2 }, { apiKey: 'gsk_k' });
    expect(r.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(r.headers.Authorization).toBe('Bearer gsk_k');
    const body = JSON.parse(r.body as string);
    expect(body).toMatchObject({ model: 'llama-3.3-70b-versatile', max_tokens: 50, temperature: 0.2 });
    expect(body.max_completion_tokens).toBeUndefined();
    expect(deepseekProvider.parseChatResponse({ choices: [{ message: { content: 'yo' } }], model: 'deepseek-chat' }).content).toBe('yo');
  });

  it('routes model ids to the new providers', () => {
    expect(providerForModel('grok-4')?.id).toBe('xai');
    expect(providerForModel('deepseek-chat')?.id).toBe('deepseek');
    expect(providerForModel('mistral-large-latest')?.id).toBe('mistral');
    expect(getProvider('groq')?.requiresKey).toBe(true);
  });
});
