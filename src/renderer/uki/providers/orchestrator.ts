// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AI orchestration. Routes a model id to its provider, resolves the API key from
 * the keystore, sends the (provider-built) request, and normalizes the response
 * — with a fallback chain across models. The `fetch` implementation is injectable
 * so the whole flow is unit-testable without network (the only real-key-dependent
 * part is the live send the user enables by adding a key).
 */

import { providerForModel, getProvider } from './registry';
import { assertWithinCap, recordUsage, estimateTokens } from './usage';
import { nativeOllamaFetch } from './ollama';

const isCloudProvider = (id: string) => !!getProvider(id as never)?.requiresKey;
import { getApiKey } from '../keystore';
import type { ChatMessage, ChatResponse } from './types';
import { guardAndNotify } from './outboundGuard';
import { getProcessingMode, getManualModel } from './modelPrefs';
import { endpointAllowed, processingModeLabel, type ProcessingMode } from '../../../shared/uki/assistantPolicy';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  /** Privacy boundary for this call; defaults to the user's stored mode. */
  processingMode?: ProcessingMode;
  /** Pinned model for 'manual' mode; defaults to the stored manual model. */
  manualModel?: string | null;
  /** Abort the in-flight request (the agent's Cancel control). */
  signal?: AbortSignal;
}

/**
 * Throws when `modelId` may not be used under the processing mode. This is the
 * last line of defence: every non-streaming request passes through `chat()`, so
 * a pinned model or a fallback chain can never reach a cloud provider while the
 * user chose Local only (or any model other than the pinned one in Manual).
 */
export function assertModelAllowed(
  modelId: string,
  provider: { id: string; label: string; requiresKey: boolean },
  opts: Pick<ChatOptions, 'processingMode' | 'manualModel' | 'baseUrl'> = {},
): void {
  const mode = opts.processingMode ?? getProcessingMode();
  if (mode === 'manual') {
    const pinned = opts.manualModel !== undefined ? opts.manualModel : getManualModel();
    if (!pinned || pinned !== modelId) {
      throw new Error(`Manual mode allows only the pinned model${pinned ? ` (${pinned})` : ''}; ${modelId} was not sent anything.`);
    }
    return;
  }
  if (!endpointAllowed(mode, { providerId: provider.id, requiresKey: provider.requiresKey, baseUrl: opts.baseUrl })) {
    throw new Error(`${processingModeLabel(mode)} mode blocks ${provider.label}; nothing was sent.`);
  }
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<FetchResponse>;

/** Send a chat completion for `modelId`. Throws on unknown model / missing key / HTTP error. */
export async function chat(
  modelId: string,
  messages: ChatMessage[],
  opts: ChatOptions = {},
  fetchImpl?: FetchLike,
): Promise<ChatResponse> {
  const provider = providerForModel(modelId);
  if (!provider) throw new Error(`Unknown model: ${modelId}`);
  assertModelAllowed(modelId, provider, opts);
  assertWithinCap(provider.label, provider.requiresKey, isCloudProvider);

  const apiKey = provider.requiresKey ? getApiKey(provider.id) ?? '' : undefined;
  if (provider.requiresKey && !apiKey) {
    throw new Error(`No API key configured for ${provider.label}`);
  }

  const httpReq = provider.buildChatRequest(
    { model: modelId, messages: guardAndNotify(messages, provider), temperature: opts.temperature, maxTokens: opts.maxTokens },
    { apiKey, baseUrl: opts.baseUrl },
  );

  const doFetch = fetchImpl
    ?? (provider.id === 'ollama' && !opts.baseUrl ? (nativeOllamaFetch() as unknown as FetchLike | null) : null)
    ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) throw new Error('No fetch implementation available');

  const res = await doFetch(httpReq.url, { method: httpReq.method, headers: httpReq.headers, body: httpReq.body, ...(opts.signal ? { signal: opts.signal } : {}) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${provider.label} request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const parsed = provider.parseChatResponse(await res.json());
  const promptTok = parsed.usage?.promptTokens;
  const completionTok = parsed.usage?.completionTokens;
  const estimated = promptTok === undefined || completionTok === undefined;
  recordUsage(
    provider.id,
    promptTok ?? estimateTokens(messages.map((m) => m.content).join(' ')),
    completionTok ?? estimateTokens(parsed.content),
    estimated,
  );
  return parsed;
}

/** Try each model in order, returning the first success (degrade to a free/local model). */
export async function chatWithFallback(
  modelIds: readonly string[],
  messages: ChatMessage[],
  opts: ChatOptions = {},
  fetchImpl?: FetchLike,
): Promise<ChatResponse> {
  let lastError: unknown = null;
  for (const id of modelIds) {
    try {
      return await chat(id, messages, opts, fetchImpl);
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) break; // cancelled: don't fall through to the next model
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All models failed');
}
