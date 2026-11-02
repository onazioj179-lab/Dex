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

import { parseDataUrl, type LLMProvider, type ChatRequest, type ChatResponse, type ModelInfo, type ProviderConfig, type HttpRequest } from './types';
import { liveModels } from './liveModels';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
// Current Claude models think before answering and that thinking counts
// against max_tokens, so a small cap returns an empty reply. Callers ask for
// ~600; never send less than this floor.
const DEFAULT_MAX_TOKENS = 16000;
const MIN_MAX_TOKENS = 8192;

const caps = { tools: true, vision: true, streaming: true };
const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5',   contextWindow: 1_000_000, capabilities: caps },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', contextWindow: 1_000_000, capabilities: caps },
  { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5',  contextWindow: 1_000_000, capabilities: caps },
  { id: 'claude-fable-5-1',  label: 'Claude Fable 5.1',  contextWindow: 1_000_000, capabilities: caps },
];

function headers(config: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey ?? '',
    'anthropic-version': API_VERSION,
    // Required for direct browser/WebView fetch (Tauri's WebView2): without
    // this Anthropic-sanctioned opt-in, the request is CORS-blocked.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  requiresKey: true,

  listModels: () => liveModels('anthropic') ?? MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    // Hoist system messages into the top-level `system` field; the rest stay.
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        // Vision: Anthropic wants a content-block array with base64 image sources.
        content: m.images && m.images.length
          ? [
              ...(m.content ? [{ type: 'text', text: m.content }] : []),
              ...m.images.map((url) => {
                const { mediaType, base64 } = parseDataUrl(url);
                return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
              }),
            ]
          : m.content,
      }));
    return {
      url: `${base}/v1/messages`,
      method: 'POST',
      headers: headers(config),
      // No temperature: current Claude models reject sampling parameters.
      body: JSON.stringify({
        model: req.model,
        max_tokens: Math.max(req.maxTokens ?? DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS),
        ...(system ? { system } : {}),
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

  buildModelsRequest(config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return { url: `${base}/v1/models?limit=100`, method: 'GET', headers: headers(config) };
  },

  parseModels(json: unknown): ModelInfo[] {
    const data = (json as { data?: Array<{ id?: unknown; display_name?: unknown; max_input_tokens?: unknown }> })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((m) => typeof m.id === 'string' && (m.id as string).startsWith('claude-'))
      .map((m) => ({
        id: m.id as string,
        label: typeof m.display_name === 'string' ? m.display_name : (m.id as string),
        contextWindow: typeof m.max_input_tokens === 'number' ? m.max_input_tokens : 200000,
        capabilities: caps,
      }));
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
