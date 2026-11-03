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
import { liveModels } from './liveModels';

const DEFAULT_BASE = 'https://api.openai.com/v1';

// Reasoning models (GPT-5, o-series) reject a custom temperature and take
// max_completion_tokens, which also has to cover their hidden reasoning.
export function isReasoningModel(id: string): boolean {
  return /^(gpt-5|o\d)/.test(id);
}
const MIN_REASONING_TOKENS = 4096;

const MODELS: ModelInfo[] = [
  { id: 'gpt-5',       label: 'GPT-5',       contextWindow: 400000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gpt-5-mini',  label: 'GPT-5 mini',  contextWindow: 400000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gpt-4o',      label: 'GPT-4o',      contextWindow: 128000, capabilities: { tools: true, vision: true, streaming: true } },
];

export const openaiProvider: LLMProvider = {
  id: 'openai',
  label: 'OpenAI',
  requiresKey: true,

  listModels: () => liveModels('openai') ?? MODELS,

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
        ...(isReasoningModel(req.model)
          ? (req.maxTokens !== undefined ? { max_completion_tokens: Math.max(req.maxTokens, MIN_REASONING_TOKENS) } : {})
          : {
              ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
              ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
            }),
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

  buildModelsRequest(config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return { url: `${base}/models`, method: 'GET', headers: { Authorization: `Bearer ${config.apiKey ?? ''}` } };
  },

  parseModels(json: unknown): ModelInfo[] {
    const data = (json as { data?: Array<{ id?: unknown }> })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string'
        && /^(gpt-|o\d|chatgpt-)/.test(id)
        && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct|moderation)/.test(id))
      .sort()
      .map((id) => ({
        id,
        label: id,
        contextWindow: /^(gpt-5|gpt-4\.1|o\d)/.test(id) ? 400000 : 128000,
        capabilities: { tools: true, vision: /^(gpt-4o|gpt-4\.1|gpt-5|o\d)/.test(id), streaming: true },
      }));
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
