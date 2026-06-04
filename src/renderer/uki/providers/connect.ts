// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * The bridge between the AI-provider framework and UKI's chat surface. Given
 * which providers the user has configured (a key in the keystore), it picks the
 * best default model and runs a one-shot chat through the orchestrator. This is
 * what makes "paste a key in Settings → ask UKI a free-form question" work
 * end-to-end. Model selection is pure (injectable provider list) so it is fully
 * unit-testable; the live send reuses the orchestrator's injectable `fetch`.
 */

import { getProvider } from './registry';
import { chat, type FetchLike, type ChatOptions } from './orchestrator';
import { configuredProviders } from '../keystore';
import type { ChatMessage, ProviderId } from './types';

/**
 * Preference order when several providers are configured. Hosted, higher-quality
 * providers first; Ollama last because it also needs a local server running
 * (a configured key is not sufficient on its own).
 */
export const PROVIDER_PRIORITY: ProviderId[] = ['openai', 'anthropic', 'google', 'openrouter', 'ollama'];

/**
 * Pick the default chat model id for the first configured provider (in priority
 * order). `configured` is the list of provider ids that have a stored key — passed
 * in so this stays pure/testable. Returns null when nothing is configured.
 */
export function pickConfiguredModelId(configured: readonly string[]): string | null {
  for (const pid of PROVIDER_PRIORITY) {
    if (!configured.includes(pid)) continue;
    const provider = getProvider(pid);
    const model = provider?.listModels()[0];
    if (model) return model.id;
  }
  return null;
}

/** True when at least one usable provider is configured (a key is present). */
export function hasConfiguredProvider(): boolean {
  return pickConfiguredModelId(configuredProviders()) !== null;
}

export interface AskOptions {
  /** Prior turns to give the model context (most-recent last). */
  history?: ChatMessage[];
  chatOptions?: ChatOptions;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchLike;
  /** Override the model id (else the configured default is used). */
  modelId?: string;
}

/**
 * Ask the user's configured LLM a free-form question. Returns the assistant
 * text, or null if no provider is configured or the call fails (the caller then
 * degrades to the existing local/HF fallback — UKI never hard-fails on this).
 */
export async function askConfiguredLLM(
  userText: string,
  systemPrompt: string,
  opts: AskOptions = {},
): Promise<string | null> {
  const modelId = opts.modelId ?? pickConfiguredModelId(configuredProviders());
  if (!modelId) return null;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(opts.history ?? []),
    { role: 'user', content: userText },
  ];

  try {
    const res = await chat(
      modelId,
      messages,
      opts.chatOptions ?? { temperature: 0.7, maxTokens: 600 },
      opts.fetchImpl,
    );
    const text = res.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
