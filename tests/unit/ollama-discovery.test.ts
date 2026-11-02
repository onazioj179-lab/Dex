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

  it('an installed local model becomes a routing candidate without any key', () => {
    _setInstalledOllamaModels(parseOllamaTags({ models: [{ name: 'llama3.2:3b' }] }));
    expect(configuredCandidates('auto').map((c) => c.id)).toContain('llama3.2:3b');
  });
});
