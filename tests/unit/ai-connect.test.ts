import { describe, it, expect, beforeEach } from 'vitest';
import {
  pickConfiguredModelId,
  hasConfiguredProvider,
  askConfiguredLLM,
  streamConfiguredLLM,
  PROVIDER_PRIORITY,
  type StreamFetchLike,
} from '../../src/renderer/uki/providers/connect';
import { setApiKey } from '../../src/renderer/uki/keystore';
import type { FetchLike } from '../../src/renderer/uki/providers/orchestrator';

beforeEach(() => localStorage.clear());

describe('pickConfiguredModelId (pure model selection)', () => {
  it('returns null when nothing is configured', () => {
    expect(pickConfiguredModelId([])).toBeNull();
  });

  it('picks the first provider in priority order', () => {
    expect(pickConfiguredModelId(['openai'])).toBe('gpt-4o');
    expect(pickConfiguredModelId(['anthropic'])).toBe('claude-3-5-sonnet-latest');
  });

  it('honors priority when several providers are configured', () => {
    // anthropic + openai both set -> openai wins (earlier in PROVIDER_PRIORITY)
    expect(pickConfiguredModelId(['anthropic', 'openai'])).toBe('gpt-4o');
    expect(PROVIDER_PRIORITY.indexOf('openai')).toBeLessThan(PROVIDER_PRIORITY.indexOf('anthropic'));
  });

  it('ignores unknown provider ids', () => {
    expect(pickConfiguredModelId(['not-a-provider'])).toBeNull();
  });
});

describe('hasConfiguredProvider (reads keystore)', () => {
  it('is false with no keys, true once a key is stored', () => {
    expect(hasConfiguredProvider()).toBe(false);
    setApiKey('openai', 'sk-test');
    expect(hasConfiguredProvider()).toBe(true);
  });
});

describe('askConfiguredLLM (end-to-end via injectable fetch)', () => {
  const okFetch = (content: string): FetchLike => async () => ({
    ok: true,
    status: 200,
    json: async () => ({ model: 'gpt-4o', choices: [{ message: { content }, finish_reason: 'stop' }] }),
    text: async () => '',
  });

  it('returns null when no provider is configured', async () => {
    const out = await askConfiguredLLM('hello', 'sys', { fetchImpl: okFetch('hi') });
    expect(out).toBeNull();
  });

  it('routes to the configured provider and returns its text', async () => {
    setApiKey('openai', 'sk-test');
    const out = await askConfiguredLLM('what is dex?', 'You are UKI.', { fetchImpl: okFetch('DEX is a desktop environment.') });
    expect(out).toBe('DEX is a desktop environment.');
  });

  it('prepends the system prompt and history, appends the user turn', async () => {
    setApiKey('openai', 'sk-test');
    let sentBody: any = null;
    const capture: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init.body || '{}');
      return { ok: true, status: 200, json: async () => ({ model: 'gpt-4o', choices: [{ message: { content: 'ok' } }] }), text: async () => '' };
    };
    await askConfiguredLLM('latest question', 'SYSTEM', {
      history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'earlier reply' }],
      fetchImpl: capture,
    });
    const roles = sentBody.messages.map((m: any) => m.role);
    expect(roles[0]).toBe('system');
    expect(sentBody.messages[0].content).toBe('SYSTEM');
    expect(sentBody.messages[sentBody.messages.length - 1]).toEqual({ role: 'user', content: 'latest question' });
    expect(roles).toContain('assistant');
  });

  it('degrades to null on HTTP failure (never throws into the UI)', async () => {
    setApiKey('openai', 'sk-test');
    const failFetch: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'server error' });
    const out = await askConfiguredLLM('q', 'sys', { fetchImpl: failFetch });
    expect(out).toBeNull();
  });

  it('returns null on an empty completion', async () => {
    setApiKey('openai', 'sk-test');
    const out = await askConfiguredLLM('q', 'sys', { fetchImpl: okFetch('   ') });
    expect(out).toBeNull();
  });
});

describe('streamConfiguredLLM (token streaming)', () => {
  async function* gen(chunks: string[]): AsyncIterable<string> {
    for (const c of chunks) yield c;
  }
  const streamFetch = (chunks: string[], ok = true, status = 200): StreamFetchLike =>
    async () => ({ ok, status, body: gen(chunks) });

  const sse = (content: string) => `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`;

  it('streams OpenAI SSE tokens and returns the full text', async () => {
    setApiKey('openai', 'sk-test');
    const tokens: string[] = [];
    const full = await streamConfiguredLLM('hi', 'sys', (tok) => tokens.push(tok), {
      streamFetch: streamFetch([sse('Hel'), sse('lo'), sse(' there'), 'data: [DONE]\n']),
    });
    expect(tokens).toEqual(['Hel', 'lo', ' there']);
    expect(full).toBe('Hello there');
  });

  it('reassembles a token whose JSON line is split across chunk boundaries', async () => {
    setApiKey('openai', 'sk-test');
    const seen: string[] = [];
    // The single data line is cut in the middle of the JSON string.
    const line = sse('World'); // 'data: {...:"World"}}]}\n'
    const cut = Math.floor(line.length / 2);
    const full = await streamConfiguredLLM('hi', 'sys', (_t, acc) => seen.push(acc), {
      streamFetch: streamFetch([line.slice(0, cut), line.slice(cut)]),
    });
    expect(full).toBe('World');
    expect(seen[seen.length - 1]).toBe('World');
  });

  it('returns null when no provider is configured', async () => {
    const full = await streamConfiguredLLM('hi', 'sys', () => {}, { streamFetch: streamFetch([sse('x')]) });
    expect(full).toBeNull();
  });

  it('returns null on a non-ok streamed response', async () => {
    setApiKey('openai', 'sk-test');
    const full = await streamConfiguredLLM('hi', 'sys', () => {}, { streamFetch: streamFetch([], false, 500) });
    expect(full).toBeNull();
  });

  it('streams Ollama NDJSON locally without a key (explicit model)', async () => {
    const tokens: string[] = [];
    const full = await streamConfiguredLLM('hi', 'sys', (tok) => tokens.push(tok), {
      modelId: 'llama3.1',
      streamFetch: streamFetch([
        '{"message":{"content":"Local "}}\n',
        '{"message":{"content":"reply"}}\n',
      ]),
    });
    expect(tokens).toEqual(['Local ', 'reply']);
    expect(full).toBe('Local reply');
  });
});
