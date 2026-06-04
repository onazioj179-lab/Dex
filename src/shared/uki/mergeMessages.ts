// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Message normalization for providers (UKI orchestrator). Some chat APIs require
 * strictly alternating user/assistant roles; this merges consecutive same-role
 * messages into one and can drop empties. Pure: no DOM, no IO.
 */

export interface ChatMessage {
  role: string;
  content: string;
}

/** Merge adjacent same-role messages, joining content with `separator`. */
export function mergeConsecutive(messages: readonly ChatMessage[], separator = '\n\n'): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}${separator}${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Drop messages whose content is empty/whitespace. */
export function dropEmpty(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.content.trim() !== '');
}

/** True when roles strictly alternate (ignoring a leading system message). */
export function isAlternating(messages: readonly ChatMessage[]): boolean {
  const body = messages.filter((m) => m.role !== 'system');
  for (let i = 1; i < body.length; i++) {
    if (body[i].role === body[i - 1].role) return false;
  }
  return true;
}

/** Normalize: drop empties, then merge consecutive same-role messages. */
export function normalizeMessages(messages: readonly ChatMessage[], separator = '\n\n'): ChatMessage[] {
  return mergeConsecutive(dropEmpty(messages), separator);
}
