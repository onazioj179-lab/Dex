// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI AI-provider contract. UKI today has NO LLM integration; this is the
 * abstraction every provider (OpenAI/Anthropic/Google/Ollama/OpenRouter/local)
 * implements so the orchestrator can route, fall back, and stream uniformly.
 *
 * Design for testability: each provider splits **request building** and
 * **response parsing** (both pure) from the network send. That way the entire
 * framework is unit-testable here without a key or network — only the actual
 * `fetch` needs a key, which the user supplies later.
 */

export type ProviderId =
  | 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter' | 'local';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ModelInfo {
  id: string;
  label: string;
  /** Max context window in tokens. */
  contextWindow: number;
  capabilities: { tools?: boolean; vision?: boolean; streaming?: boolean };
}

export interface ProviderConfig {
  apiKey?: string;
  /** Override the default API base URL (e.g. local Ollama / self-host). */
  baseUrl?: string;
}

/** A normalized HTTP request a provider produces; the orchestrator sends it. */
export interface HttpRequest {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body?: string;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** True when the provider needs an API key (false for local/Ollama). */
  readonly requiresKey: boolean;
  /** Models this provider exposes (+ capability flags). */
  listModels(): ModelInfo[];
  /** Build the chat-completion HTTP request (pure — no network). */
  buildChatRequest(req: ChatRequest, config: ProviderConfig): HttpRequest;
  /** Parse a provider's raw JSON response into a normalized ChatResponse. */
  parseChatResponse(json: unknown): ChatResponse;
  /** Extract the incremental text from one streaming SSE data chunk (or ''). */
  parseStreamChunk(data: string): string;
}
