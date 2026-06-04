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

export const ollamaProvider: LLMProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  requiresKey: false,

  listModels: () => MODELS,

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
