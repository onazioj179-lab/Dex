// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reactions and @mentions for comments / shared docs.
 *
 * Reactions are SEMANTIC names, not emoji. The renderer maps each name
 * to a glyph in its icon library so we never ship emoji bytes.
 */

// DEX v3.8.9 - reactions + mentions

export const REACTION_NAMES = [
  'thumbs-up',
  'eyes',
  'heart',
  'celebrate',
  'questioning',
  'thinking',
] as const;

export type ReactionName = (typeof REACTION_NAMES)[number];

export interface ReactionState {
  /** reactionName -> set of user ids who reacted. */
  reactions: Record<string, Set<string>>;
}

export function createReactionState(): ReactionState {
  return { reactions: {} };
}

export function toggleReaction(state: ReactionState, name: ReactionName, userId: string): ReactionState {
  const set = new Set(state.reactions[name] ?? []);
  if (set.has(userId)) set.delete(userId);
  else set.add(userId);
  return { reactions: { ...state.reactions, [name]: set } };
}

export function reactionCounts(state: ReactionState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.reactions)) out[k] = v.size;
  return out;
}

/**
 * Parse `@handle` tokens from a comment body. Handles are
 * `[A-Za-z0-9_]{1,32}` and must follow whitespace or start of string.
 */
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(?:^|\s)@([A-Za-z0-9_]{1,32})(?=\b)/g)) {
    out.add(m[1]);
  }
  return [...out];
}
