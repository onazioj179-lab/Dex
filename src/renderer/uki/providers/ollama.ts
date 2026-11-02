// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ollama local provider (privacy-first, no API key, runs on localhost). Streams
 * NDJSON (one JSON object per line) rather than SSE. Pure build/parse.
 */

import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, ProviderConfig, HttpRequest } from './types';

const DEFAULT_BASE = 'http://localhost:11434';

// Common local models; the live list comes from the Ollama daemon at runtime.
const MODELS: ModelInfo[] = [
  { id: 'llama3.1',  label: 'Llama 3.1',  contextWindow: 128000, capabilities: { tools: true, streaming: true } },
  { id: 'qwen2.5',   label: 'Qwen 2.5',   contextWindow: 32768,  capabilities: { tools: true, streaming: true } },
  { id: 'mistral',   label: 'Mistral',    contextWindow: 32768,  capabilities: { streaming: true } },
];

// Models actually installed in the local Ollama (from /api/tags). null = not
// checked yet (fall back to the suggested list above); [] = Ollama is running
// but has no models, so nothing local can answer and the UI says so.
let installed: ModelInfo[] | null = null;

const VISION_RE = /llava|vision|bakllava|moondream|gemma3|qwen2\.5vl|minicpm-v/i;

/** Parse an Ollama /api/tags response into ModelInfo entries. */
export function parseOllamaTags(json: unknown): ModelInfo[] {
  const models = (json as { models?: Array<{ name?: unknown; model?: unknown }> })?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => String(m?.name ?? m?.model ?? '').trim())
    .filter((name) => name.length > 0 && name.length <= 120)
    .map((name) => ({
      id: name,
      label: name,
      // Ollama does not report the context window here; 8K is its default.
      contextWindow: 8192,
      capabilities: { streaming: true, ...(VISION_RE.test(name) ? { vision: true } : {}) },
    }));
}

// ---- native proxy (desktop app) ----------------------------------------------
// Ollama answers 403 to the packaged app's origin (http://tauri.localhost), so in
// the desktop app requests go through the narrow `ollama:request` proxy
// (src-tauri/src/ollama_proxy.rs: 127.0.0.1:11434, /api/tags + /api/chat only).

type NativeInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function nativeInvoke(): NativeInvoke | null {
  const dex = (globalThis as unknown as { dex?: { invoke?: NativeInvoke }; __TAURI__?: unknown }).dex;
  // Only the Tauri shell has the proxy; the web preview keeps plain fetch.
  if (!(globalThis as { __TAURI__?: unknown }).__TAURI__ || !dex?.invoke) return null;
  return dex.invoke.bind(dex);
}

/** Map a default-base Ollama URL to its path, or null for anything else. */
export function ollamaPath(url: string): string | null {
  for (const base of [DEFAULT_BASE, 'http://127.0.0.1:11434']) {
    if (url.startsWith(base + '/')) return url.slice(base.length);
  }
  return null;
}

interface ProxyResult { ok?: boolean; status?: number; body?: string; error?: string }

/**
 * A fetch-compatible function backed by the native proxy, or null when not in
 * the desktop app. Only default-base URLs are proxied; anything else returns
 * a failed response (never reaches the network).
 */
export function nativeOllamaFetch(invoke: NativeInvoke | null = nativeInvoke()):
  ((url: string, init?: { method?: string; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>; body: AsyncIterable<string> }>) | null {
  if (!invoke) return null;
  return async (url, init) => {
    const path = ollamaPath(url);
    const r = (path ? await invoke('ollama:request', init?.method ?? 'GET', path, init?.body ?? '') : { ok: false, status: 0, error: 'not a local Ollama URL' }) as ProxyResult;
    const text = r.body ?? r.error ?? '';
    return {
      ok: !!r.ok,
      status: r.status ?? 0,
      json: async () => JSON.parse(text || '{}'),
      text: async () => text,
      // Streaming: the proxy returns the whole NDJSON body at once.
      body: (async function* () { if (text) yield text; })(),
    };
  };
}

/**
 * Ask the local Ollama which models are installed (localhost only, 2 s timeout).
 * Returns the list, or null if Ollama is not reachable (list left unchanged).
 */
export async function refreshOllamaModels(
  fetchImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }> = nativeOllamaFetch() ?? ((u, i) => fetch(u, i)),
  base = DEFAULT_BASE,
): Promise<ModelInfo[] | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 2000) : null;
  try {
    const res = await fetchImpl(`${base.replace(/\/$/, '')}/api/tags`, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) return null;
    installed = parseOllamaTags(await res.json());
    return installed;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- explicit opt-in ----------------------------------------------------------
// DEX never contacts a local AI service on its own: no probe at startup and no
// silent routing to it. The user turns it on in Settings > AI Providers. Older
// installs that had already chosen local processing count as opted in.

const LOCAL_AI_KEY = 'dex-uki-local-ai-enabled';

export function isLocalAiEnabled(): boolean {
  try {
    const v = localStorage.getItem(LOCAL_AI_KEY);
    if (v !== null) return v === '1';
    return localStorage.getItem('dex-uki-processing-mode') === 'local-only'
      || localStorage.getItem('dex-uki-routing-goal') === 'offline';
  } catch {
    return false;
  }
}

/** Turn the local AI connection on (checks installed models) or off (forgets them). */
export async function setLocalAiEnabled(on: boolean): Promise<ModelInfo[] | null> {
  try { localStorage.setItem(LOCAL_AI_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
  if (!on) { installed = null; return null; }
  return refreshOllamaModels();
}

/** Installed local models (null until Ollama has been checked). */
export function ollamaInstalledModels(): ModelInfo[] | null {
  return installed;
}

/** True once Ollama answered and reported zero installed models. */
export function ollamaHasNoModels(): boolean {
  return installed !== null && installed.length === 0;
}

/** Test hook. */
export function _setInstalledOllamaModels(list: ModelInfo[] | null): void {
  installed = list;
}

export const ollamaProvider: LLMProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  requiresKey: false,

  listModels: () => installed ?? MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return {
      url: `${base}/api/chat`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: !!req.stream,
        options: {
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { num_predict: req.maxTokens } : {}),
        },
      }),
    };
  },

  parseChatResponse(json: unknown): ChatResponse {
    const j = json as {
      model?: string;
      message?: { content?: string };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      content: j.message?.content ?? '',
      model: j.model ?? '',
      finishReason: j.done_reason,
      usage: { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count },
    };
  },

  parseStreamChunk(data: string): string {
    const trimmed = data.trim();
    if (trimmed === '') return '';
    try {
      const j = JSON.parse(trimmed) as { message?: { content?: string } };
      return j.message?.content ?? '';
    } catch {
      return '';
    }
  },
};
