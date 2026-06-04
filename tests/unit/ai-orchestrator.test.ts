import { describe, it, expect, beforeEach } from 'vitest';
import { getProvider, findModel, providerForModel, allModels } from '../../src/renderer/uki/providers/registry';
import { chat, chatWithFallback, type FetchLike } from '../../src/renderer/uki/providers/orchestrator';
import { setApiKey } from '../../src/renderer/uki/keystore';

beforeEach(() => localStorage.clear());

describe('provider registry', () => {
  it('resolves providers and models', () => {
    expect(getProvider('openai')?.label).toBe('OpenAI');
    expect(findModel('gpt-4o')?.provider).toBe('openai');
    expect(providerForModel('claude-3-5-sonnet-latest')?.id).toBe('anthropic');
    expect(allModels().length).toBeGreaterThan(5);
  });
});

const okFetch = (content: string): FetchLike => async () => ({
  ok: true, status: 200,
  json: async () => ({ model: 'gpt-4o', choices: [{ message: { content }, finish_reason: 'stop' }] }),
  text: async () => '',
});

describe('orchestrator chat', () => {
  it('sends and parses a response with a configured key', async () => {
    setApiKey('openai', 'sk-x');
    const res = await chat('gpt-4o', [{ role: 'user', content: 'hi' }], {}, okFetch('hello!'));
    expect(res.content).toBe('hello!');
  });

  it('errors on unknown model', async () => {
    await expect(chat('no-such-model', [{ role: 'user', content: 'hi' }], {}, okFetch('x'))).rejects.toThrow(/Unknown model/);
  });

  it('errors when a key-required provider has no key', async () => {
    await expect(chat('gpt-4o', [{ role: 'user', content: 'hi' }], {}, okFetch('x'))).rejects.toThrow(/No API key/);
  });

  it('errors on HTTP failure', async () => {
    setApiKey('openai', 'sk-x');
    const failFetch: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'bad key' });
    await expect(chat('gpt-4o', [{ role: 'user', content: 'hi' }], {}, failFetch)).rejects.toThrow(/401/);
  });

  it('does not require a key for ollama (local)', async () => {
    const ollamaFetch: FetchLike = async () => ({
      ok: true, status: 200, json: async () => ({ model: 'llama3.1', message: { content: 'local reply' } }), text: async () => '',
    });
    const res = await chat('llama3.1', [{ role: 'user', content: 'hi' }], {}, ollamaFetch);
    expect(res.content).toBe('local reply');
  });

  it('falls back to the next model on failure', async () => {
    setApiKey('openai', 'sk-x');
    let calls = 0;
    const flaky: FetchLike = async (url) => {
      calls++;
      if (/anthropic/.test(url)) return { ok: false, status: 500, json: async () => ({}), text: async () => 'down' };
      return { ok: true, status: 200, json: async () => ({ model: 'gpt-4o', choices: [{ message: { content: 'ok' } }] }), text: async () => '' };
    };
    // anthropic (needs key, none set) fails, falls back to gpt-4o
    const res = await chatWithFallback(['claude-3-5-sonnet-latest', 'gpt-4o'], [{ role: 'user', content: 'hi' }], {}, flaky);
    expect(res.content).toBe('ok');
  });
});
