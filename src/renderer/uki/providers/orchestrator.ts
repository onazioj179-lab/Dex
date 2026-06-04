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

import { providerForModel } from './registry';
import { getApiKey } from '../keystore';
import type { ChatMessage, ChatResponse } from './types';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<FetchResponse>;

/** Send a chat completion for `modelId`. Throws on unknown model / missing key / HTTP error. */
export async function chat(
  modelId: string,
  messages: ChatMessage[],
  opts: ChatOptions = {},
  fetchImpl?: FetchLike,
): Promise<ChatResponse> {
  const provider = providerForModel(modelId);
  if (!provider) throw new Error(`Unknown model: ${modelId}`);

  const apiKey = provider.requiresKey ? getApiKey(provider.id) ?? '' : undefined;
  if (provider.requiresKey && !apiKey) {
    throw new Error(`No API key configured for ${provider.label}`);
  }

  const httpReq = provider.buildChatRequest(
    { model: modelId, messages, temperature: opts.temperature, maxTokens: opts.maxTokens },
    { apiKey, baseUrl: opts.baseUrl },
  );

  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) throw new Error('No fetch implementation available');

  const res = await doFetch(httpReq.url, { method: httpReq.method, headers: httpReq.headers, body: httpReq.body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${provider.label} request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return provider.parseChatResponse(await res.json());
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
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All models failed');
}
