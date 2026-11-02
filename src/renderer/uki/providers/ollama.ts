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

/**
 * Ask the local Ollama which models are installed (localhost only, 2 s timeout).
 * Returns the list, or null if Ollama is not reachable (list left unchanged).
 */
export async function refreshOllamaModels(
  fetchImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u, i) => fetch(u, i),
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
