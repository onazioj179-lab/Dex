// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Model catalogs follow the provider (retired ids used to 404 every request),
// and request shapes match what current models accept.
//
import { describe, it, expect, beforeEach } from 'vitest';
import { anthropicProvider } from '../../src/renderer/uki/providers/anthropic';
import { openaiProvider, isReasoningModel } from '../../src/renderer/uki/providers/openai';
import { googleProvider } from '../../src/renderer/uki/providers/google';
import { openrouterProvider } from '../../src/renderer/uki/providers/openrouter';
import { providerForModel } from '../../src/renderer/uki/providers/registry';
import { refreshLiveModels, liveModels, clearLiveModels, _resetLiveModelsForTests } from '../../src/renderer/uki/providers/liveModels';

const msgs = [{ role: 'user' as const, content: 'hi' }];
const okJson = (body: unknown) => (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

beforeEach(() => _resetLiveModelsForTests());

describe('static catalogs are current', () => {
  it('lists no retired model families', () => {
    const ids = [anthropicProvider, openaiProvider, googleProvider, openrouterProvider].flatMap((p) => p.listModels().map((m) => m.id));
    expect(ids).toContain('claude-opus-5-5');
    expect(ids.some((id) => /claude-3|gemini-1\.5|gpt-4-turbo/.test(id))).toBe(false);
  });
});

describe('request shapes', () => {
  it('OpenAI reasoning models get max_completion_tokens and no temperature', () => {
    expect(isReasoningModel('gpt-5')).toBe(true);
    expect(isReasoningModel('o3-mini')).toBe(true);
    expect(isReasoningModel('gpt-4o')).toBe(false);
    const body = JSON.parse(openaiProvider.buildChatRequest({ model: 'gpt-5', messages: msgs, temperature: 0.7, maxTokens: 600 }, { apiKey: 'k' }).body!);
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(4096);
  });

  it('Gemini 2.5 keeps room for thinking inside the output budget', () => {
    const body = JSON.parse(googleProvider.buildChatRequest({ model: 'gemini-2.5-flash', messages: msgs, maxTokens: 600 }, { apiKey: 'k' }).body!);
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
  });
});

describe('live model lists', () => {
  it('Anthropic: lists via /v1/models with the browser-access header and stores the result', async () => {
    const req = anthropicProvider.buildModelsRequest!({ apiKey: 'ak' });
    expect(req.url).toBe('https://api.anthropic.com/v1/models?limit=100');
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const n = await refreshLiveModels(anthropicProvider, { apiKey: 'ak' }, okJson({
      data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', max_input_tokens: 1000000 }, { id: 'not-claude' }],
    }));
    expect(n).toBe(1);
    expect(anthropicProvider.listModels()).toEqual([
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', contextWindow: 1000000, capabilities: { tools: true, vision: true, streaming: true } },
    ]);
    clearLiveModels('anthropic');
    expect(liveModels('anthropic')).toBeNull();
    expect(anthropicProvider.listModels()[0].id).toBe('claude-opus-5-5');
  });

  it('OpenAI keeps chat models only; Gemini keeps generateContent models', () => {
    const o = openaiProvider.parseModels!({ data: [{ id: 'gpt-5' }, { id: 'text-embedding-3-large' }, { id: 'gpt-4o-realtime-preview' }, { id: 'o3' }, { id: 'dall-e-3' }] }).map((m) => m.id);
    expect(o).toEqual(['gpt-5', 'o3']);
    const g = googleProvider.parseModels!({ models: [
      { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] });
    expect(g.map((m) => m.id)).toEqual(['gemini-2.5-pro']);
  });

  it('a failed or keyless listing leaves the static fallback in place', async () => {
    const fail = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await refreshLiveModels(openaiProvider, { apiKey: 'k' }, fail)).toBeNull();
    expect(await refreshLiveModels(openaiProvider, { apiKey: '' }, okJson({ data: [{ id: 'gpt-5' }] }))).toBeNull();
    expect(openaiProvider.listModels()[0].id).toBe('gpt-5');
  });
});

describe('routing ids that no list contains', () => {
  it('routes by model family (saved preferences for renamed models)', () => {
    expect(providerForModel('claude-3-5-sonnet-latest')?.id).toBe('anthropic');
    expect(providerForModel('gpt-4o-mini')?.id).toBe('openai');
    expect(providerForModel('gemini-1.5-pro')?.id).toBe('google');
    expect(providerForModel('anthropic/claude-x')?.id).toBe('openrouter');
    expect(providerForModel('mystery')).toBeUndefined();
  });
});
