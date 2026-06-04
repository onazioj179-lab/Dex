import { describe, it, expect } from 'vitest';
import { googleProvider } from '../../src/renderer/uki/providers/google';
import { openrouterProvider } from '../../src/renderer/uki/providers/openrouter';
import { providerForModel, allModels } from '../../src/renderer/uki/providers/registry';
import type { ChatMessage } from '../../src/renderer/uki/providers/types';

const msgs: ChatMessage[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'hi' },
];

describe('Google Gemini provider', () => {
  it('uses ?key= and system_instruction with model role', () => {
    const r = googleProvider.buildChatRequest({ model: 'gemini-1.5-pro', messages: msgs, temperature: 0.3, maxTokens: 80 }, { apiKey: 'gk' });
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=gk');
    const body = JSON.parse(r.body!);
    expect(body.system_instruction.parts[0].text).toBe('sys');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 80 });
  });

  it('parses candidates and stream parts', () => {
    const resp = googleProvider.parseChatResponse({
      candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
    });
    expect(resp.content).toBe('hello');
    expect(resp.usage).toEqual({ promptTokens: 4, completionTokens: 2 });
    expect(googleProvider.parseStreamChunk('{"candidates":[{"content":{"parts":[{"text":"x"}]}}]}')).toBe('x');
  });
});

describe('OpenRouter provider', () => {
  it('is OpenAI-compatible with OR base + attribution headers', () => {
    const r = openrouterProvider.buildChatRequest({ model: 'openai/gpt-4o', messages: msgs }, { apiKey: 'or-key' });
    expect(r.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.headers.Authorization).toBe('Bearer or-key');
    expect(r.headers['X-Title']).toBe('DEX');
    expect(JSON.parse(r.body!).model).toBe('openai/gpt-4o');
  });

  it('reuses OpenAI response parsing', () => {
    expect(openrouterProvider.parseChatResponse({ model: 'x', choices: [{ message: { content: 'ok' } }] }).content).toBe('ok');
  });
});

describe('registry includes the new providers', () => {
  it('routes their models', () => {
    expect(providerForModel('gemini-1.5-pro')?.id).toBe('google');
    expect(providerForModel('openai/gpt-4o')?.id).toBe('openrouter');
    expect(allModels().length).toBeGreaterThanOrEqual(11);
  });
});
