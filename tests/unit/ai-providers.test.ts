import { describe, it, expect } from 'vitest';
import { openaiProvider } from '../../src/renderer/uki/providers/openai';
import { anthropicProvider } from '../../src/renderer/uki/providers/anthropic';
import { ollamaProvider } from '../../src/renderer/uki/providers/ollama';
import type { ChatMessage } from '../../src/renderer/uki/providers/types';

const msgs: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'hi' },
];

describe('OpenAI provider', () => {
  it('builds the chat request', () => {
    const r = openaiProvider.buildChatRequest({ model: 'gpt-4o', messages: msgs, temperature: 0.5, maxTokens: 100 }, { apiKey: 'sk-x' });
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer sk-x');
    const body = JSON.parse(r.body!);
    expect(body.model).toBe('gpt-4o');
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toHaveLength(2);
  });

  it('parses the response and a stream chunk', () => {
    const resp = openaiProvider.parseChatResponse({
      model: 'gpt-4o', choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    });
    expect(resp).toEqual({ content: 'hello', model: 'gpt-4o', finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 3 } });
    expect(openaiProvider.parseStreamChunk('{"choices":[{"delta":{"content":"he"}}]}')).toBe('he');
    expect(openaiProvider.parseStreamChunk('[DONE]')).toBe('');
  });
});

describe('Anthropic provider', () => {
  it('hoists the system message and uses x-api-key', () => {
    const r = anthropicProvider.buildChatRequest({ model: 'claude-3-5-sonnet-latest', messages: msgs, maxTokens: 50 }, { apiKey: 'ak' });
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.headers['x-api-key']).toBe('ak');
    expect(r.headers['anthropic-version']).toBeTruthy();
    const body = JSON.parse(r.body!);
    expect(body.system).toBe('You are helpful.');
    expect(body.max_tokens).toBe(50);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]); // system not in messages
  });

  it('parses content blocks and a stream delta', () => {
    const resp = anthropicProvider.parseChatResponse({
      model: 'claude-3-5-sonnet-latest', content: [{ type: 'text', text: 'hi there' }],
      stop_reason: 'end_turn', usage: { input_tokens: 4, output_tokens: 2 },
    });
    expect(resp.content).toBe('hi there');
    expect(resp.usage).toEqual({ promptTokens: 4, completionTokens: 2 });
    expect(anthropicProvider.parseStreamChunk('{"type":"content_block_delta","delta":{"text":"x"}}')).toBe('x');
    expect(anthropicProvider.parseStreamChunk('{"type":"message_start"}')).toBe('');
  });
});

describe('Ollama provider', () => {
  it('targets localhost with no key', () => {
    expect(ollamaProvider.requiresKey).toBe(false);
    const r = ollamaProvider.buildChatRequest({ model: 'llama3.1', messages: msgs, temperature: 0.2 }, {});
    expect(r.url).toBe('http://localhost:11434/api/chat');
    expect(r.headers.Authorization).toBeUndefined();
    expect(JSON.parse(r.body!).options.temperature).toBe(0.2);
  });

  it('parses message content', () => {
    expect(ollamaProvider.parseChatResponse({ model: 'llama3.1', message: { content: 'yo' }, done_reason: 'stop' }).content).toBe('yo');
    expect(ollamaProvider.parseStreamChunk('{"message":{"content":"z"}}')).toBe('z');
  });
});
