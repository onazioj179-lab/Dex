// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Google Gemini chat provider. Gemini's REST shape differs again: the key is a
 * `?key=` query param, messages are `contents` with `parts`, the system prompt
 * is `system_instruction`, and roles use "model" for the assistant. Pure
 * build/parse.
 */

import { parseDataUrl, type LLMProvider, type ChatRequest, type ChatResponse, type ModelInfo, type ProviderConfig, type HttpRequest } from './types';
import { liveModels } from './liveModels';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   contextWindow: 1048576, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1048576, capabilities: { tools: true, vision: true, streaming: true } },
];

export const googleProvider: LLMProvider = {
  id: 'google',
  label: 'Google Gemini',
  requiresKey: true,

  listModels: () => liveModels('google') ?? MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const method = req.stream ? 'streamGenerateContent' : 'generateContent';
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        // Vision: Gemini takes inline_data parts (mime_type + base64) alongside text.
        parts: [
          ...(m.content ? [{ text: m.content }] : []),
          ...((m.images ?? []).map((url) => {
            const { mediaType, base64 } = parseDataUrl(url);
            return { inline_data: { mime_type: mediaType, data: base64 } };
          })),
        ],
      }));
    return {
      url: `${base}/models/${req.model}:${method}?key=${config.apiKey ?? ''}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          // Gemini 2.5+ thinks inside the output budget; keep room for the answer.
          ...(req.maxTokens !== undefined ? { maxOutputTokens: /^gemini-(2\.5|[3-9])/.test(req.model) ? Math.max(req.maxTokens, 2048) : req.maxTokens } : {}),
        },
      }),
    };
  },

  parseChatResponse(json: unknown): ChatResponse {
    const j = json as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    return {
      content: text,
      model: 'gemini',
      finishReason: cand?.finishReason,
      usage: j.usageMetadata
        ? { promptTokens: j.usageMetadata.promptTokenCount, completionTokens: j.usageMetadata.candidatesTokenCount }
        : undefined,
    };
  },

  buildModelsRequest(config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    return { url: `${base}/models?pageSize=200&key=${config.apiKey ?? ''}`, method: 'GET', headers: {} };
  },

  parseModels(json: unknown): ModelInfo[] {
    const models = (json as { models?: Array<{ name?: unknown; displayName?: unknown; inputTokenLimit?: unknown; supportedGenerationMethods?: unknown }> })?.models;
    if (!Array.isArray(models)) return [];
    return models
      .filter((m) => typeof m.name === 'string' && (m.name as string).includes('gemini')
        && Array.isArray(m.supportedGenerationMethods) && (m.supportedGenerationMethods as unknown[]).includes('generateContent')
        && !/(embedding|tts|image|live|audio)/.test(m.name as string))
      .map((m) => ({
        id: (m.name as string).replace(/^models\//, ''),
        label: typeof m.displayName === 'string' ? m.displayName : (m.name as string),
        contextWindow: typeof m.inputTokenLimit === 'number' ? m.inputTokenLimit : 1048576,
        capabilities: { tools: true, vision: true, streaming: true },
      }));
  },

  parseStreamChunk(data: string): string {
    const trimmed = data.trim();
    if (trimmed === '') return '';
    try {
      const j = JSON.parse(trimmed) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    } catch {
      return '';
    }
  },
};
