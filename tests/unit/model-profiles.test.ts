// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  getModelProfile,
  MODEL_PROFILES,
  DEFAULT_PROFILE,
  blendedCost,
  INTELLIGENCE_SCORE,
  LATENCY_SCORE,
} from '../../src/shared/uki/modelProfiles';

describe('modelProfiles catalog', () => {
  it('returns the neutral default profile for unknown model ids', () => {
    expect(getModelProfile('totally-unknown-model')).toBe(DEFAULT_PROFILE);
  });

  it('marks Ollama models as local and zero-cost', () => {
    const p = getModelProfile('llama3.1');
    expect(p.local).toBe(true);
    expect(blendedCost(p)).toBe(0);
  });

  it('hosted models are not local', () => {
    expect(getModelProfile('gpt-4o').local).toBe(false);
  });

  it('a frontier model costs more than a fast one from the same vendor', () => {
    expect(blendedCost(getModelProfile('gpt-4o'))).toBeGreaterThan(blendedCost(getModelProfile('gpt-4o-mini')));
  });

  it('covers every model id the providers currently advertise', () => {
    // Guards against a provider model id drifting out of the routing catalog.
    const advertised = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
      'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'llama3.1', 'qwen2.5', 'mistral',
      'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct',
    ];
    for (const id of advertised) expect(MODEL_PROFILES[id]).toBeDefined();
  });

  it('orders the score tables: frontier > fast, instant > slow', () => {
    expect(INTELLIGENCE_SCORE.frontier).toBeGreaterThan(INTELLIGENCE_SCORE.balanced);
    expect(INTELLIGENCE_SCORE.balanced).toBeGreaterThan(INTELLIGENCE_SCORE.fast);
    expect(LATENCY_SCORE.instant).toBeGreaterThan(LATENCY_SCORE.fast);
    expect(LATENCY_SCORE.fast).toBeGreaterThan(LATENCY_SCORE.medium);
    expect(LATENCY_SCORE.medium).toBeGreaterThan(LATENCY_SCORE.slow);
  });

  it('weights output cost above input cost in the blend', () => {
    // blend = in + out*2 -> a model with high output price ranks more expensive.
    const cheapOut = { ...DEFAULT_PROFILE, costPer1kIn: 0.01, costPer1kOut: 0 };
    const dearOut = { ...DEFAULT_PROFILE, costPer1kIn: 0, costPer1kOut: 0.01 };
    expect(blendedCost(dearOut)).toBeGreaterThan(blendedCost(cheapOut));
  });
});
