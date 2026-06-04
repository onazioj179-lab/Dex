// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Prompt assembly (UKI orchestrator). Builds the message array for a provider
 * call from the system prompt, live context, conversation history and the new
 * user input, then trims it to a token budget via `contextFit` — keeping the
 * system/context/latest-user messages pinned and dropping the oldest history
 * first. Pure: no DOM, no IO.
 */

import { fitToContext, totalTokens, type FitMessage } from './contextFit';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface PromptParts {
  /** System prompt (always kept). */
  system?: string;
  /** Live desktop/operator context (always kept). */
  context?: string;
  /** Prior turns, oldest-first (trimmed to fit). */
  history?: readonly HistoryTurn[];
  /** The new user input (always kept). */
  user: string;
}

export interface BuiltPrompt {
  messages: FitMessage[];
  tokens: number;
  droppedHistory: number;
}

/** Assemble + budget-trim a prompt. */
export function buildPrompt(parts: PromptParts, maxTokens: number): BuiltPrompt {
  const messages: FitMessage[] = [];
  if (parts.system) messages.push({ role: 'system', content: parts.system, pinned: true });
  if (parts.context) messages.push({ role: 'system', content: parts.context, pinned: true });
  for (const turn of parts.history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: parts.user, pinned: true });

  const before = messages.filter((m) => !m.pinned).length;
  const fit = fitToContext(messages, maxTokens);
  const after = fit.messages.filter((m) => !m.pinned).length;

  return {
    messages: fit.messages,
    tokens: fit.tokens,
    droppedHistory: before - after,
  };
}

/** Estimated token cost of a built prompt's messages. */
export function promptTokens(messages: readonly FitMessage[]): number {
  return totalTokens(messages);
}
