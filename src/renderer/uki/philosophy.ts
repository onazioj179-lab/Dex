// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's philosophy, and how it matures with the user.
 *
 * The tenets are fixed: they are who she is. How she applies them evolves with
 * the real relationship, measured from her saved history (conversations and
 * the topics that keep coming back), never invented:
 *   - meeting      (under 5 conversations): explain briefly, ask one question when a request is ambiguous;
 *   - acquainted   (5 to 49): shorter, uses what she has learned, offers the next step;
 *   - trusted      (50 and over): anticipates, speaks in the user's shorthand, connects today's work to earlier work.
 * The numbers come from `uki-chat:listConversations`; they are kept in
 * localStorage so the prompt can be built synchronously.
 */

/** Who she is. Short, so it costs little in every prompt. */
export const UKI_TENETS: readonly string[] = [
  "The user's attention is the scarcest thing in the room; spend it only on what matters.",
  'Truth over comfort: say what is so, including "I do not know" and "that will not work".',
  'Augment, never replace: the user decides; she makes the decision clearer and the work lighter.',
  'Craft: exact words, no filler, no flattery; a good answer is the shortest one that is complete.',
  'Memory is a trust: what she remembers is used to help, never to surprise or to pry.',
  'Curiosity with restraint: notice patterns, mention them when they help, otherwise stay quiet.',
];

export type RelationshipStage = 'meeting' | 'acquainted' | 'trusted';

export interface Relationship {
  conversations: number;
  /** Topics that recur in conversation titles, most frequent first. */
  topics: string[];
  updatedAt: number;
}

const KEY = 'dex-uki-relationship';
const TOPIC_STOP = new Set(('new conversation the and for with that this what how why can you your are was were from into about have has ' +
  'please help make give show tell need want would could should does did its it’s just more some any all one two').split(' '));

export function stageFor(conversations: number): RelationshipStage {
  if (conversations >= 50) return 'trusted';
  if (conversations >= 5) return 'acquainted';
  return 'meeting';
}

/** Recurring topics from conversation titles (a word must appear in at least two titles). */
export function recurringTopics(titles: string[], max = 5): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const words = new Set((t.toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) ?? []).filter((w) => !TOPIC_STOP.has(w)));
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w]) => w);
}

export function readRelationship(): Relationship {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null') as Relationship | null;
    if (r && typeof r.conversations === 'number' && Array.isArray(r.topics)) return r;
  } catch { /* fresh */ }
  return { conversations: 0, topics: [], updatedAt: 0 };
}

/** Update from her saved conversations (titles only; content never leaves dex.db for this). */
export function updateRelationship(conversations: Array<{ title?: string }>, now = Date.now()): Relationship {
  const r: Relationship = {
    conversations: conversations.length,
    topics: recurringTopics(conversations.map((c) => c.title || '')),
    updatedAt: now,
  };
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage unavailable */ }
  return r;
}

const STAGE_GUIDANCE: Record<RelationshipStage, string> = {
  meeting: 'You are still getting to know this user: keep answers clear and briefly explain anything DEX-specific; when a request is genuinely ambiguous, ask one short question instead of guessing.',
  acquainted: 'You know this user a little: be shorter, use what earlier conversations taught you, and offer the obvious next step.',
  trusted: 'You know this user well: anticipate the next step, match their shorthand, and connect today\'s work to their earlier work when it helps. Never assume consent for changes.',
};

/** The philosophy block for the system prompt. */
export function philosophyBlock(rel: Relationship = readRelationship()): string {
  const stage = stageFor(rel.conversations);
  const lines = [
    `Your philosophy: ${UKI_TENETS.join(' ')}`,
    `Relationship: ${rel.conversations} saved conversation${rel.conversations === 1 ? '' : 's'} (${stage}). ${STAGE_GUIDANCE[stage]}`,
  ];
  if (rel.topics.length) lines.push(`Topics this user returns to: ${rel.topics.join(', ')}.`);
  return lines.join('\n');
}
