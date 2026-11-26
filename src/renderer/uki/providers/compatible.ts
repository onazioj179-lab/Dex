// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OpenAI-compatible hosted providers (Groq, Mistral, DeepSeek, xAI). They speak
 * the same chat/completions and /models wire format as OpenAI, so each is the
 * OpenAI request/response code pointed at its own endpoint with its own model
 * list. Also: recognising which provider a pasted key belongs to, so "paste any
 * key" works without picking the provider first.
 */

import type { LLMProvider, ModelInfo, ProviderId } from './types';
import { openaiProvider } from './openai';
import { liveModels } from './liveModels';

interface CompatibleSpec {
  id: ProviderId;
  label: string;
  base: string;
  models: ModelInfo[];
  /** Live /models ids worth offering for chat (drop audio, embeddings, …). */
  keepModel?: (id: string) => boolean;
}

const chat = (id: string, label: string, contextWindow: number, vision = false): ModelInfo =>
  ({ id, label, contextWindow, capabilities: { tools: true, vision, streaming: true } });

const NOT_CHAT = /(whisper|tts|audio|embed|moderation|guard|ocr|image|transcri)/i;

function compatible(spec: CompatibleSpec): LLMProvider {
  return {
    id: spec.id,
    label: spec.label,
    requiresKey: true,
    listModels: () => liveModels(spec.id) ?? spec.models,
    buildChatRequest(req, config) {
      // Plain temperature / max_tokens: the OpenAI reasoning-model rules (by id
      // prefix) never apply to these providers' model names.
      const r = openaiProvider.buildChatRequest({ ...req }, { ...config, baseUrl: config.baseUrl || spec.base });
      const body = JSON.parse(r.body as string) as Record<string, unknown>;
      delete body.max_completion_tokens;
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
      return { ...r, body: JSON.stringify(body) };
    },
    parseChatResponse: openaiProvider.parseChatResponse,
    buildModelsRequest: (config) => openaiProvider.buildModelsRequest!({ ...config, baseUrl: config.baseUrl || spec.base }),
    parseModels(json) {
      const data = (json as { data?: Array<{ id?: unknown }> })?.data;
      if (!Array.isArray(data)) return [];
      const keep = spec.keepModel ?? (() => true);
      return data
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && !NOT_CHAT.test(id) && keep(id))
        .sort()
        .map((id) => spec.models.find((m) => m.id === id) ?? chat(id, id, 128000));
    },
    parseStreamChunk: openaiProvider.parseStreamChunk,
  };
}

export const groqProvider = compatible({
  id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1',
  models: [
    chat('llama-3.3-70b-versatile', 'Llama 3.3 70B', 131072),
    chat('openai/gpt-oss-120b', 'GPT-OSS 120B', 131072),
    chat('llama-3.1-8b-instant', 'Llama 3.1 8B (fast)', 131072),
  ],
});

export const mistralProvider = compatible({
  id: 'mistral', label: 'Mistral', base: 'https://api.mistral.ai/v1',
  models: [
    chat('mistral-large-latest', 'Mistral Large', 131072),
    chat('mistral-medium-latest', 'Mistral Medium', 131072, true),
    chat('mistral-small-latest', 'Mistral Small', 131072, true),
  ],
  keepModel: (id) => /latest$/.test(id),
});

export const deepseekProvider = compatible({
  id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1',
  models: [chat('deepseek-chat', 'DeepSeek Chat', 65536), chat('deepseek-reasoner', 'DeepSeek Reasoner', 65536)],
});

export const xaiProvider = compatible({
  id: 'xai', label: 'xAI (Grok)', base: 'https://api.x.ai/v1',
  models: [chat('grok-4', 'Grok 4', 256000, true), chat('grok-3-mini', 'Grok 3 mini', 131072)],
});

/**
 * Which provider a pasted key belongs to, from its published prefix. A bare
 * `sk-…` is OpenAI's format and also DeepSeek's, and Mistral keys have no prefix,
 * so those come back as candidates to try in order (see identifyKey).
 */
export function providersForKey(raw: string): ProviderId[] {
  const key = raw.trim();
  if (!key) return [];
  if (key.startsWith('sk-ant-')) return ['anthropic'];
  if (key.startsWith('sk-or-')) return ['openrouter'];
  if (key.startsWith('AIza')) return ['google'];
  if (key.startsWith('gsk_')) return ['groq'];
  if (key.startsWith('xai-')) return ['xai'];
  if (key.startsWith('sk-proj-') || key.startsWith('sk-svcacct-')) return ['openai'];
  if (key.startsWith('sk-')) return ['openai', 'deepseek'];
  if (/^[A-Za-z0-9]{32}$/.test(key)) return ['mistral'];
  return [];
}
