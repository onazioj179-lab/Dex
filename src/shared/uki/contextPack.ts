// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Context window packing (ROADMAP-600 §1.A #028, §1.B #075). Pure greedy
 * packer: given candidate context items with token costs + relevance scores and
 * a token budget, include the highest-value items that fit. Used to seed UKI
 * prompts with the most relevant memory/snippets without blowing the window.
 */

// DEX v6.0 — UKI context packing

export interface ContextItem {
  id: string;
  text: string;
  /** Estimated token cost of including this item. */
  tokens: number;
  /** Relevance/recency score; higher packs first. */
  score: number;
}

export interface PackResult {
  included: ContextItem[];
  usedTokens: number;
  droppedIds: string[];
}

/** Rough token estimate (~4 chars/token) for callers without a tokenizer. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Greedily pack items by descending score (ties: fewer tokens first) until the
 * budget is exhausted. A too-large item is skipped, not truncated; smaller
 * lower-ranked items may still fit after it.
 */
export function packContext(items: readonly ContextItem[], budgetTokens: number): PackResult {
  const budget = Math.max(0, Math.floor(budgetTokens));
  const ordered = [...items].sort((a, b) => (b.score - a.score) || (a.tokens - b.tokens));
  const included: ContextItem[] = [];
  const droppedIds: string[] = [];
  let used = 0;
  for (const item of ordered) {
    if (item.tokens <= budget - used) {
      included.push(item);
      used += item.tokens;
    } else {
      droppedIds.push(item.id);
    }
  }
  return { included, usedTokens: used, droppedIds };
}
