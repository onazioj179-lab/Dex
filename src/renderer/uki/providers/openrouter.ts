// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OpenRouter provider — an aggregator that is OpenAI-API-compatible, so it
 * reuses the OpenAI request body + response parsing and only swaps the base URL
 * and adds attribution headers. One key unlocks many upstream models.
 */

import type { LLMProvider, ChatRequest, ModelInfo, ProviderConfig, HttpRequest } from './types';
import { openaiProvider } from './openai';
import { liveModels } from './liveModels';

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

const MODELS: ModelInfo[] = [
  { id: 'openai/gpt-4o',                    label: 'GPT-4o (via OpenRouter)',     contextWindow: 128000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B (OR)',          contextWindow: 128000, capabilities: { streaming: true } },
];

export const openrouterProvider: LLMProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  requiresKey: true,

  listModels: () => liveModels('openrouter') ?? MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    // Reuse OpenAI's compatible body + bearer auth; swap URL + add OR headers.
    const oai = openaiProvider.buildChatRequest(req, config);
    return {
      ...oai,
      url: `${base}/chat/completions`,
      headers: {
        ...oai.headers,
        'HTTP-Referer': 'https://github.com/onazioj179-lab/Dex',
        'X-Title': 'DEX',
      },
    };
  },

  buildModelsRequest(config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return { url: `${base}/models`, method: 'GET', headers: { Authorization: `Bearer ${config.apiKey ?? ''}` } };
  },

  // OpenRouter lists hundreds of models; keep the ones that can call tools
  // (UKI's agent needs them), newest-looking first, capped for the picker.
  parseModels(json: unknown): ModelInfo[] {
    const data = (json as { data?: Array<{ id?: unknown; name?: unknown; context_length?: unknown; supported_parameters?: unknown; architecture?: { input_modalities?: unknown } }> })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((m) => typeof m.id === 'string' && Array.isArray(m.supported_parameters) && (m.supported_parameters as unknown[]).includes('tools'))
      .slice(0, 80)
      .map((m) => ({
        id: m.id as string,
        label: typeof m.name === 'string' ? m.name : (m.id as string),
        contextWindow: typeof m.context_length === 'number' ? m.context_length : 128000,
        capabilities: {
          tools: true,
          vision: Array.isArray(m.architecture?.input_modalities) && (m.architecture!.input_modalities as unknown[]).includes('image'),
          streaming: true,
        },
      }));
  },

  parseChatResponse: openaiProvider.parseChatResponse,
  parseStreamChunk: openaiProvider.parseStreamChunk,
};
