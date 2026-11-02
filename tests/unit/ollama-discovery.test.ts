// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import {
  ollamaProvider, parseOllamaTags, refreshOllamaModels, ollamaHasNoModels, _setInstalledOllamaModels,
} from '../../src/renderer/uki/providers/ollama';
import { configuredCandidates } from '../../src/renderer/uki/providers/connect';

afterEach(() => { _setInstalledOllamaModels(null); localStorage.clear(); });

describe('local Ollama model discovery', () => {
  it('parses /api/tags and flags vision models', () => {
    const list = parseOllamaTags({ models: [{ name: 'llama3.2:3b' }, { name: 'llava:7b' }, { name: '' }] });
    expect(list.map((m) => m.id)).toEqual(['llama3.2:3b', 'llava:7b']);
    expect(list[1].capabilities.vision).toBe(true);
    expect(list[0].capabilities.vision).toBeUndefined();
  });

  it('lists what is installed, and reports an empty install honestly', async () => {
    await refreshOllamaModels(async () => ({ ok: true, json: async () => ({ models: [] }) }));
    expect(ollamaProvider.listModels()).toEqual([]);
    expect(ollamaHasNoModels()).toBe(true);
    await refreshOllamaModels(async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen2.5:0.5b' }] }) }));
    expect(ollamaProvider.listModels().map((m) => m.id)).toEqual(['qwen2.5:0.5b']);
  });

  it('leaves the list unchanged when Ollama is unreachable', async () => {
    expect(await refreshOllamaModels(async () => { throw new Error('ECONNREFUSED'); })).toBeNull();
    expect(ollamaProvider.listModels().length).toBeGreaterThan(0); // suggested defaults
  });

  it('once the user connects local AI, an installed model is a candidate without any key', () => {
    localStorage.setItem('dex-uki-local-ai-enabled', '1');
    _setInstalledOllamaModels(parseOllamaTags({ models: [{ name: 'llama3.2:3b' }] }));
    expect(configuredCandidates('auto').map((c) => c.id)).toContain('llama3.2:3b');
  });
});

describe('native Ollama proxy adapter (desktop app)', () => {
  it('maps only default-base URLs to proxy paths', async () => {
    const { ollamaPath, nativeOllamaFetch } = await import('../../src/renderer/uki/providers/ollama');
    expect(ollamaPath('http://localhost:11434/api/chat')).toBe('/api/chat');
    expect(ollamaPath('http://127.0.0.1:11434/api/tags')).toBe('/api/tags');
    expect(ollamaPath('http://evil.example/api/chat')).toBeNull();
    const calls: unknown[][] = [];
    const f = nativeOllamaFetch(async (...a: unknown[]) => { calls.push(a); return { ok: true, status: 200, body: '{"models":[{"name":"phi3"}]}' }; })!;
    const r = await f('http://localhost:11434/api/tags');
    expect(await r.json()).toEqual({ models: [{ name: 'phi3' }] });
    expect(calls[0]).toEqual(['ollama:request', 'GET', '/api/tags', '']);
    const bad = await f('http://evil.example/api/chat', { method: 'POST', body: '{}' });
    expect(bad.ok).toBe(false);
    expect(calls).toHaveLength(1); // never proxied
  });

  it('returns null outside the desktop app', async () => {
    const { nativeOllamaFetch } = await import('../../src/renderer/uki/providers/ollama');
    expect(nativeOllamaFetch(null)).toBeNull();
  });
});
