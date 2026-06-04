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

import { getProvider, providerForModel } from './registry';
import { chat, type FetchLike, type ChatOptions } from './orchestrator';
import { createStreamParser, type StreamFormat } from './stream';
import { getPreferredModel } from './modelPrefs';
import { configuredProviders, getApiKey } from '../keystore';
import type { ChatMessage, ProviderId } from './types';

/**
 * Preference order when several providers are configured. Hosted, higher-quality
 * providers first; Ollama last because it also needs a local server running
 * (a configured key is not sufficient on its own).
 */
export const PROVIDER_PRIORITY: ProviderId[] = ['openai', 'anthropic', 'google', 'openrouter', 'ollama'];

/**
 * Pick the chat model id for the first configured provider (in priority order):
 * the user's preferred model for that provider if it's set and still valid, else
 * the provider's default (first) model. `configured` is the list of provider ids
 * that have a stored key; `prefFor` resolves a provider's preferred model — both
 * injected so this stays pure/testable. Returns null when nothing is configured.
 */
export function pickConfiguredModelId(
  configured: readonly string[],
  prefFor: (providerId: string) => string | null = getPreferredModel,
): string | null {
  for (const pid of PROVIDER_PRIORITY) {
    if (!configured.includes(pid)) continue;
    const provider = getProvider(pid);
    if (!provider) continue;
    const models = provider.listModels();
    const preferred = prefFor(pid);
    if (preferred && models.some((m) => m.id === preferred)) return preferred;
    if (models[0]) return models[0].id;
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

// ---------------------------------------------------------------------------
// Streaming — token-by-token so the assistant's reply appears as it is produced.
// ---------------------------------------------------------------------------

/** Wire format each provider streams in (OpenAI-style SSE vs Ollama NDJSON). */
const STREAM_FORMAT: Record<string, StreamFormat> = {
  openai: 'sse',
  anthropic: 'sse',
  google: 'sse',
  openrouter: 'sse',
  ollama: 'ndjson',
};

/** A streamed HTTP response: an async iterable of decoded body chunks. */
export interface StreamFetchResponse {
  ok: boolean;
  status: number;
  body: AsyncIterable<string>;
}
export type StreamFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<StreamFetchResponse>;

/** Default stream fetch: real `fetch`, reading the ReadableStream body as text chunks. */
const defaultStreamFetch: StreamFetchLike = async (url, init) => {
  const res = await fetch(url, init);
  const rawBody = res.body as ReadableStream<Uint8Array> | null;
  async function* iterate(): AsyncIterable<string> {
    if (!rawBody) return;
    const reader = rawBody.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield decoder.decode(value, { stream: true });
      }
      const tail = decoder.decode();
      if (tail) yield tail;
    } finally {
      reader.releaseLock?.();
    }
  }
  return { ok: res.ok, status: res.status, body: iterate() };
};

export interface StreamOptions extends AskOptions {
  /** Injectable streaming fetch for tests. */
  streamFetch?: StreamFetchLike;
}

/**
 * Stream a free-form question to the configured LLM. `onToken(token, full)` fires
 * for each incremental token (the running text in `full`). Returns the complete
 * text, or null if no provider is configured or the call fails (caller degrades to
 * the local/HF fallback — partial output is the caller's to keep or discard).
 */
export async function streamConfiguredLLM(
  userText: string,
  systemPrompt: string,
  onToken: (token: string, full: string) => void,
  opts: StreamOptions = {},
): Promise<string | null> {
  const modelId = opts.modelId ?? pickConfiguredModelId(configuredProviders());
  if (!modelId) return null;
  const provider = providerForModel(modelId);
  if (!provider) return null;

  const apiKey = provider.requiresKey ? getApiKey(provider.id) ?? '' : undefined;
  if (provider.requiresKey && !apiKey) return null;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(opts.history ?? []),
    { role: 'user', content: userText },
  ];

  const httpReq = provider.buildChatRequest(
    {
      model: modelId,
      messages,
      temperature: opts.chatOptions?.temperature ?? 0.7,
      maxTokens: opts.chatOptions?.maxTokens ?? 600,
      stream: true,
    },
    { apiKey, baseUrl: opts.chatOptions?.baseUrl },
  );

  const doFetch = opts.streamFetch ?? defaultStreamFetch;
  try {
    const res = await doFetch(httpReq.url, { method: httpReq.method, headers: httpReq.headers, body: httpReq.body });
    if (!res.ok) return null;

    const format = STREAM_FORMAT[provider.id] ?? 'sse';
    const parser = createStreamParser(format, (d) => provider.parseStreamChunk(d));
    let full = '';
    for await (const chunk of res.body) {
      for (const tok of parser.push(chunk)) {
        full += tok;
        onToken(tok, full);
      }
    }
    for (const tok of parser.flush()) {
      full += tok;
      onToken(tok, full);
    }
    const trimmed = full.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
