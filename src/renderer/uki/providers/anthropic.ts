// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Anthropic (Claude) chat provider. Anthropic differs from OpenAI: the system
 * prompt is a top-level `system` field (not a message), auth is `x-api-key`,
 * `max_tokens` is required, and responses are content blocks. Pure build/parse.
 */

import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, ProviderConfig, HttpRequest } from './types';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;

const MODELS: ModelInfo[] = [
  { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', contextWindow: 200000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'claude-3-5-haiku-latest',  label: 'Claude 3.5 Haiku',  contextWindow: 200000, capabilities: { tools: true, vision: false, streaming: true } },
  { id: 'claude-3-opus-latest',     label: 'Claude 3 Opus',     contextWindow: 200000, capabilities: { tools: true, vision: true, streaming: true } },
];

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  requiresKey: true,

  listModels: () => MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    // Hoist system messages into the top-level `system` field; the rest stay.
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    return {
      url: `${base}/v1/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(system ? { system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        messages,
        stream: !!req.stream,
      }),
    };
  },

  parseChatResponse(json: unknown): ChatResponse {
    const j = json as {
      model?: string;
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    return {
      content: text,
      model: j.model ?? '',
      finishReason: j.stop_reason,
      usage: j.usage
        ? { promptTokens: j.usage.input_tokens, completionTokens: j.usage.output_tokens }
        : undefined,
    };
  },

  parseStreamChunk(data: string): string {
    const trimmed = data.trim();
    if (trimmed === '') return '';
    try {
      const j = JSON.parse(trimmed) as { type?: string; delta?: { text?: string } };
      return j.type === 'content_block_delta' ? (j.delta?.text ?? '') : '';
    } catch {
      return '';
    }
  },
};
