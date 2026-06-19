// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OpenAI chat provider. Implements the `LLMProvider` contract with pure request
 * building + response parsing (testable without a key/network). The orchestrator
 * supplies the key and performs the send.
 */

import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, ProviderConfig, HttpRequest } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

const MODELS: ModelInfo[] = [
  { id: 'gpt-4o',      label: 'GPT-4o',      contextWindow: 128000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', contextWindow: 128000, capabilities: { tools: true, vision: true, streaming: true } },
];

export const openaiProvider: LLMProvider = {
  id: 'openai',
  label: 'OpenAI',
  requiresKey: true,

  listModels: () => MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return {
      url: `${base}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map((m) => ({
          role: m.role,
          // Vision: when a message carries images, send OpenAI's multimodal
          // content array (text part + image_url parts, data URLs accepted).
          content: m.images && m.images.length
            ? [
                ...(m.content ? [{ type: 'text', text: m.content }] : []),
                ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
              ]
            : m.content,
        })),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        stream: !!req.stream,
      }),
    };
  },

  parseChatResponse(json: unknown): ChatResponse {
    const j = json as {
      model?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = j.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      model: j.model ?? '',
      finishReason: choice?.finish_reason,
      usage: j.usage
        ? { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens }
        : undefined,
    };
  },

  parseStreamChunk(data: string): string {
    const trimmed = data.trim();
    if (trimmed === '' || trimmed === '[DONE]') return '';
    try {
      const j = JSON.parse(trimmed) as { choices?: Array<{ delta?: { content?: string } }> };
      return j.choices?.[0]?.delta?.content ?? '';
    } catch {
      return '';
    }
  },
};
