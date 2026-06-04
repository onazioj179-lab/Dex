// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Context-window fitting (UKI-017). Distinct from `tokenBudget.ts` (which meters
 * rate-limit budgets): this estimates how many tokens a conversation will cost
 * and trims it to fit a model's context window before a provider call. Real
 * tokenizers are provider-specific/async; this is a fast ~4-chars/token
 * heuristic + an oldest-first trimmer that never drops pinned messages (e.g. the
 * system prompt). Pure: no DOM, no IO.
 */

export interface FitMessage {
  role: string;
  content: string;
  /** Pinned messages (e.g. the system prompt) are never trimmed. */
  pinned?: boolean;
}

/** Per-message structural overhead in tokens (role tags, separators). */
const MESSAGE_OVERHEAD = 4;

/** Heuristic token estimate for a string (~4 chars/token). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimated tokens for a single message incl. structural overhead. */
export function messageTokens(m: FitMessage): number {
  return estimateTokens(m.content) + MESSAGE_OVERHEAD;
}

/** Total estimated tokens across messages. */
export function totalTokens(messages: readonly FitMessage[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

export interface FitResult {
  messages: FitMessage[];
  tokens: number;
  /** Number of messages dropped to fit. */
  dropped: number;
}

/**
 * Trim a conversation to fit `maxTokens`, dropping the oldest non-pinned
 * messages first while preserving order and all pinned messages. If pinned
 * messages alone exceed the budget they are kept (the caller decides next).
 */
export function fitToContext(messages: readonly FitMessage[], maxTokens: number): FitResult {
  const start = totalTokens(messages);
  if (start <= maxTokens) {
    return { messages: [...messages], tokens: start, dropped: 0 };
  }
  const result = [...messages];
  let dropped = 0;
  let idx = 0;
  while (totalTokens(result) > maxTokens && idx < result.length) {
    if (result[idx].pinned) { idx++; continue; }
    result.splice(idx, 1);
    dropped++;
  }
  return { messages: result, tokens: totalTokens(result), dropped };
}
