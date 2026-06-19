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

import { getProvider, providerForModel, allModels, allProviders } from './registry';
import { chatWithFallback, type FetchLike, type ChatOptions } from './orchestrator';
import { createStreamParser, type StreamFormat } from './stream';
import { getPreferredModel, getRoutingGoal } from './modelPrefs';
import { configuredProviders, getApiKey } from '../keystore';
import { routeModels, classifyTask, type RouteCandidate, type RoutingGoal } from '../../../shared/uki/smartRouter';
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

/**
 * The model candidates the Smart Router may choose from for a goal. For
 * `offline` these are the local (keyless) providers; for every other goal they
 * are the providers the user has configured a key for. Shaped as plain
 * `RouteCandidate`s so the same set can feed either the TS router or the native
 * (Tauri) `smart_router_route` command — see services/platform.
 */
export function configuredCandidates(goal: RoutingGoal): RouteCandidate[] {
  const providerIds = new Set<string>(
    goal === 'offline'
      ? allProviders().filter((p) => !p.requiresKey).map((p) => p.id)
      : configuredProviders().filter((pid) => getProvider(pid as ProviderId)),
  );
  return allModels()
    .filter((m) => providerIds.has(m.provider))
    .map((m) => ({
      id: m.id,
      contextWindow: m.contextWindow,
      vision: !!m.capabilities.vision,
      tools: !!m.capabilities.tools,
    }));
}

/**
 * Smart Router entry point: rank the configured candidates for a goal + prompt.
 * Returns model ids best-first for `chatWithFallback`, or [] when nothing usable
 * is available (e.g. `offline` with no local model — the caller then degrades).
 */
export function routeConfiguredModels(goal: RoutingGoal, userText: string): string[] {
  return routeModels(goal, classifyTask(userText), configuredCandidates(goal));
}

export interface AskOptions {
  /** Prior turns to give the model context (most-recent last). */
  history?: ChatMessage[];
  chatOptions?: ChatOptions;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchLike;
  /** Override the model id (skips the Smart Router and uses exactly this model). */
  modelId?: string;
  /** Override the routing goal (else the stored goal, defaulting to 'auto'). */
  goal?: RoutingGoal;
  /**
   * Image attachments (data URLs) for vision — e.g. a screenshot from UKI's
   * "look at my screen". When present, routing is restricted to vision-capable
   * models; if none is configured the call returns null (caller degrades).
   */
  images?: string[];
}

/** True when a configured provider exposes at least one vision-capable model. */
export function hasVisionProvider(): boolean {
  return configuredCandidates('auto').some((c) => c.vision);
}

/** The configured model ids that support vision (for image-bearing requests). */
function visionModelIds(goal: RoutingGoal): Set<string> {
  return new Set(configuredCandidates(goal).filter((c) => c.vision).map((c) => c.id));
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
  // The Smart Router produces an ordered list; chatWithFallback tries each in
  // turn (so a cheap/fast first pick degrades to the next on failure). An
  // explicit modelId override pins exactly one model.
  const goal = opts.goal ?? getRoutingGoal();
  let modelIds = opts.modelId ? [opts.modelId] : routeConfiguredModels(goal, userText);
  // With image attachments, only vision-capable models can answer; degrade (null)
  // when none is configured rather than sending images a text model will drop.
  if (opts.images && opts.images.length) {
    const vision = visionModelIds(goal);
    const visionFirst = modelIds.filter((id) => vision.has(id));
    modelIds = visionFirst.length ? visionFirst : [...vision];
  }
  if (modelIds.length === 0) return null;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(opts.history ?? []),
    { role: 'user', content: userText, ...(opts.images && opts.images.length ? { images: opts.images } : {}) },
  ];

  try {
    const res = await chatWithFallback(
      modelIds,
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
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
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
  /** Abort the in-flight stream (caller's "stop" control). */
  signal?: AbortSignal;
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
  // Streaming commits tokens as they arrive, so it can't fall back mid-reply —
  // it streams from the Smart Router's top pick (or an explicit override).
  const goal = opts.goal ?? getRoutingGoal();
  let modelId = opts.modelId
    ?? routeConfiguredModels(goal, userText)[0]
    ?? pickConfiguredModelId(configuredProviders());
  // With image attachments, pin a vision-capable model; degrade (null) if the
  // chosen model can't see images and no vision model is configured.
  if (opts.images && opts.images.length) {
    const vision = visionModelIds(goal);
    if (!modelId || !vision.has(modelId)) {
      modelId = routeConfiguredModels(goal, userText).find((id) => vision.has(id)) ?? [...vision][0] ?? null;
    }
  }
  if (!modelId) return null;
  const provider = providerForModel(modelId);
  if (!provider) return null;

  const apiKey = provider.requiresKey ? getApiKey(provider.id) ?? '' : undefined;
  if (provider.requiresKey && !apiKey) return null;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(opts.history ?? []),
    { role: 'user', content: userText, ...(opts.images && opts.images.length ? { images: opts.images } : {}) },
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
    const res = await doFetch(httpReq.url, { method: httpReq.method, headers: httpReq.headers, body: httpReq.body, signal: opts.signal });
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
