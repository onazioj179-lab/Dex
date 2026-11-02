// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { isLocalAiEnabled, setLocalAiEnabled, _setInstalledOllamaModels } from '../../src/renderer/uki/providers/ollama';
import { configuredCandidates } from '../../src/renderer/uki/providers/connect';

describe('local AI is opt-in', () => {
  beforeEach(() => {
    localStorage.clear();
    _setInstalledOllamaModels(null);
  });

  it('is off on a fresh install', () => {
    expect(isLocalAiEnabled()).toBe(false);
  });

  it('a running Ollama is not used until the user connects it', () => {
    _setInstalledOllamaModels([{ id: 'qwen2.5:0.5b', label: 'qwen', contextWindow: 8192, capabilities: { streaming: true } }]);
    expect(configuredCandidates('offline').some((c) => c.id === 'qwen2.5:0.5b')).toBe(false);
    expect(configuredCandidates('auto').some((c) => c.id === 'qwen2.5:0.5b')).toBe(false);
    localStorage.setItem('dex-uki-local-ai-enabled', '1');
    expect(configuredCandidates('auto').some((c) => c.id === 'qwen2.5:0.5b')).toBe(true);
  });

  it('turning it off forgets installed models', async () => {
    _setInstalledOllamaModels([{ id: 'm', label: 'm', contextWindow: 8192, capabilities: { streaming: true } }]);
    await setLocalAiEnabled(false);
    expect(isLocalAiEnabled()).toBe(false);
    expect(configuredCandidates('offline').length).toBe(0);
  });

  it('installs that already chose local processing stay connected', () => {
    localStorage.setItem('dex-uki-processing-mode', 'local-only');
    expect(isLocalAiEnabled()).toBe(true);
  });
});
