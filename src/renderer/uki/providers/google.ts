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

import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, ProviderConfig, HttpRequest } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const MODELS: ModelInfo[] = [
  { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   contextWindow: 2000000, capabilities: { tools: true, vision: true, streaming: true } },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextWindow: 1000000, capabilities: { tools: true, vision: true, streaming: true } },
];

export const googleProvider: LLMProvider = {
  id: 'google',
  label: 'Google Gemini',
  requiresKey: true,

  listModels: () => MODELS,

  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest {
    const base = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const method = req.stream ? 'streamGenerateContent' : 'generateContent';
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    return {
      url: `${base}/models/${req.model}:${method}?key=${config.apiKey ?? ''}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
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
