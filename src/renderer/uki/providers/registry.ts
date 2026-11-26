// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Provider + model registry. Aggregates the available `LLMProvider`s and offers
 * lookups the orchestrator and Settings UI use (which providers exist, which
 * models each exposes, and which provider owns a given model). Pure.
 */

import type { LLMProvider, ProviderId, ModelInfo } from './types';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import { ollamaProvider } from './ollama';
import { googleProvider } from './google';
import { openrouterProvider } from './openrouter';
import { groqProvider, mistralProvider, deepseekProvider, xaiProvider } from './compatible';

const PROVIDERS: Record<string, LLMProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  ollama: ollamaProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  mistral: mistralProvider,
  deepseek: deepseekProvider,
  xai: xaiProvider,
};

export function getProvider(id: ProviderId): LLMProvider | undefined {
  return PROVIDERS[id];
}

export function allProviders(): LLMProvider[] {
  return Object.values(PROVIDERS);
}

export interface RegisteredModel extends ModelInfo {
  provider: ProviderId;
}

/** Every model across all providers, tagged with its provider. */
export function allModels(): RegisteredModel[] {
  return allProviders().flatMap((p) => p.listModels().map((m) => ({ ...m, provider: p.id })));
}

/** Resolve a model id to its provider-tagged info, or undefined. */
export function findModel(modelId: string): RegisteredModel | undefined {
  return allModels().find((m) => m.id === modelId);
}

/** The provider that owns a given model id. */
export function providerForModel(modelId: string): LLMProvider | undefined {
  const m = findModel(modelId);
  if (m) return getProvider(m.provider);
  // Not in any current list (a saved preference for a renamed model, or an id
  // a live catalog has not loaded yet): route by the id's family.
  if (modelId.includes('/')) return getProvider('openrouter');
  if (modelId.startsWith('claude-')) return getProvider('anthropic');
  if (modelId.startsWith('gemini-')) return getProvider('google');
  if (/^(gpt-|o\d|chatgpt-)/.test(modelId)) return getProvider('openai');
  if (modelId.startsWith('grok-')) return getProvider('xai');
  if (modelId.startsWith('deepseek-')) return getProvider('deepseek');
  if (/^(mistral|codestral|magistral|ministral|pixtral)-/.test(modelId)) return getProvider('mistral');
  if (/^(llama-|gemma|qwen)/.test(modelId)) return getProvider('groq');
  return undefined;
}
