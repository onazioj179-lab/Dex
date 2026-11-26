// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's long memory of conversations.
 *
 * Every conversation (the UKI app and the floating panel) is kept in her app,
 * in dex.db, with no limit (`uki-chat:*`, src-tauri/src/uki_chat.rs). This
 * module lets her use it:
 *  - `recallFromHistory` finds earlier messages related to what the user is
 *    asking and returns a short, labelled block for the model;
 *  - `isHistoryRequest` spots "what did we talk about…", "last time…",
 *    "continue our chat about…", so she searches harder and says what she found;
 *  - `recentWindow` keeps the live prompt bounded even when one conversation
 *    has thousands of messages (the full history stays on disk);
 *  - `PanelHistory` saves floating-panel turns into a conversation in her app.
 */

import { updateRelationship } from './philosophy';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

export interface HistoryHit {
  conversation_id: string;
  conversation_title?: string;
  role: string;
  content: string;
  timestamp: number;
}

const STOP = new Set(('a an and are as at be but by can could did do does for from had has have how i if in into is it its ' +
  'me my of on or our please remember recall earlier previous before last time chat chats conversation conversations talk ' +
  'talked talking said say tell that the their them then there these they this to us was we were what when where which who ' +
  'why will with would you your about again continue back ago yesterday week uki').split(' '));

/** "what did we say about…", "last time", "remember our chat on…", "continue where we left off". */
export function isHistoryRequest(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(we|i|you)\s+(talked|spoke|discussed|chatted|said|were talking)\b/.test(t)
    || /\bdid (we|i|you) (talk|speak|discuss|chat|say|decide|agree|plan)\b/.test(t)
    || /\b(last time|earlier (chat|conversation)|previous (chat|conversation|session)s?|our (chat|conversation|talk)|chat history|conversation history)\b/.test(t)
    || /\b(remember|recall)\b.*\b(we|our|i told you|you told me|said)\b/.test(t)
    || /\b(continue|pick up|carry on)\b.*\b(where we left off|our|last|previous|earlier)\b/.test(t);
}

/** The words worth searching for (lowercase, de-duplicated, longest first). */
export function historyKeywords(text: string, max = 5): string[] {
  const words = (text.toLowerCase().match(/[a-z0-9][a-z0-9'+#.-]{2,}/g) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/\.+$/, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, max);
}

/** Score and merge search hits: more keyword matches and newer first, one per message. */
export function rankHits(hits: HistoryHit[], keywords: string[], excludeConversation?: string | null, max = 8): HistoryHit[] {
  const seen = new Set<string>();
  const scored: Array<{ h: HistoryHit; score: number }> = [];
  for (const h of hits) {
    if (!h?.content || (excludeConversation && h.conversation_id === excludeConversation)) continue;
    const key = `${h.conversation_id}|${h.timestamp}|${h.content.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lc = h.content.toLowerCase();
    const matches = keywords.filter((k) => lc.includes(k)).length;
    scored.push({ h, score: matches * 1e13 + (h.timestamp || 0) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.h);
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

/** The labelled block for the model. Empty string when nothing relevant was found. */
export function formatRecall(hits: HistoryHit[], now = Date.now()): string {
  if (!hits.length) return '';
  const lines = hits.map((h) => {
    const days = Math.floor((now - (h.timestamp || now)) / 86_400_000);
    const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    const who = h.role === 'user' ? 'User' : 'UKI';
    return `- ${when}, in "${clip(h.conversation_title || 'a conversation', 40)}": ${who}: ${clip(h.content, 280)}`;
  });
  return `[From earlier conversations with this user (their saved history in UKI). Use it when it helps, say so when you rely on it, and do not invent anything it does not say.]\n${lines.join('\n')}`;
}

/** Search the saved history for what the user is asking about. Never throws. */
export async function recallFromHistory(invoke: Invoke, text: string, opts: { excludeConversation?: string | null; max?: number } = {}): Promise<string> {
  const keywords = historyKeywords(text, isHistoryRequest(text) ? 6 : 4);
  if (!keywords.length) return '';
  try {
    const results = await Promise.all(keywords.map((k) => invoke('uki-chat:search', k, 40).catch(() => [])));
    const hits = results.flatMap((r) => (Array.isArray(r) ? (r as HistoryHit[]) : []));
    // A plain question only borrows history when at least two of its words match, so
    // ordinary chat is not padded with loosely related old messages.
    const ranked = rankHits(hits, keywords, opts.excludeConversation, opts.max ?? 8)
      .filter((h) => isHistoryRequest(text) || keywords.filter((k) => h.content.toLowerCase().includes(k)).length >= Math.min(2, keywords.length));
    return formatRecall(ranked);
  } catch {
    return '';
  }
}

/** Keep the last `max` messages for the live prompt; older ones stay on disk and come back through recall. */
export function recentWindow<T>(messages: T[], max = 40): T[] {
  return messages.length > max ? messages.slice(-max) : messages;
}

/**
 * Saves floating-panel turns into one conversation in the UKI app per panel
 * session (a new one after 30 idle minutes), so her history lives in her app.
 */
export class PanelHistory {
  private id: string | null = null;
  private last = 0;
  constructor(private invoke: () => Invoke | null, private idleMs = 30 * 60_000) {}

  async record(userText: string, reply: string, now = Date.now()): Promise<void> {
    const inv = this.invoke();
    if (!inv || !userText.trim()) return;
    try {
      if (!this.id || now - this.last > this.idleMs) {
        const conv = (await inv('uki-chat:createConversation', userText.trim().slice(0, 48))) as { id?: string } | null;
        this.id = conv?.id ?? null;
        // A new conversation changes how well she knows the user (uki/philosophy.ts).
        const list = await inv('uki-chat:listConversations', 100000).catch(() => null);
        if (Array.isArray(list)) updateRelationship(list as Array<{ title?: string }>);
      }
      this.last = now;
      if (!this.id) return;
      await inv('uki-chat:appendMessage', this.id, { id: `p-${now.toString(36)}-u`, role: 'user', content: userText, timestamp: now });
      if (reply.trim()) await inv('uki-chat:appendMessage', this.id, { id: `p-${now.toString(36)}-a`, role: 'copilot', content: reply, timestamp: now + 1 });
      try { window.dispatchEvent(new CustomEvent('dex-uki-history-changed')); } catch { /* non-DOM */ }
    } catch { /* history is best-effort; never break a reply */ }
  }

  get conversationId(): string | null { return this.id; }
}
