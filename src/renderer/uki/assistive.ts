// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI assistive intents that work on-device, no AI provider needed:
 *   - notes:      "take a note that…", "note: …", "write down …", "remember that …"
 *   - summaries:  "summarize <text>", "summarize this" (the open app),
 *                 "summarize my clipboard", "summarize that" (UKI's last answer)
 *   - reasoning:  "show your thinking", "how did you get that" — UKI shows how
 *                 it reached an answer ONLY when asked (never unprompted).
 * Pure functions; the overlay does the side effects.
 */

/** The note text the user asked UKI to save, or null. */
export function parseNoteRequest(text: string): string | null {
  const t = text.trim();
  const patterns = [
    /^(?:please\s+)?(?:can you\s+)?(?:take|make|add|write|create|jot(?:\s+down)?)\s+(?:a\s+|me\s+a\s+)?note(?:\s+(?:that|saying|about|of))?\s*[:,-]?\s+(.+)$/is,
    /^note(?:\s+that)?\s*[:,-]\s*(.+)$/is,
    /^note\s+that\s+(.+)$/is,
    /^(?:write|jot)\s+(?:this\s+)?down\s*[:,-]?\s+(.+)$/is,
    /^remember\s+that\s+(.+)$/is,
    /^(?:add|save)\s+(?:this\s+)?to\s+(?:my\s+)?notes?\s*[:,-]?\s+(.+)$/is,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

export type SummarizeTarget =
  | { kind: 'text'; text: string }
  | { kind: 'screen' }
  | { kind: 'clipboard' }
  | { kind: 'last' };

/** What the user asked UKI to summarize, or null. */
export function parseSummarizeRequest(text: string): SummarizeTarget | null {
  const t = text.trim();
  const m = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:summari[sz]e|sum up|tl;?dr|give me (?:a|the) (?:summary|gist) of)\b\s*[:,-]?\s*(.*)$/is);
  if (!m) return null;
  const rest = m[1].trim().replace(/[?.!]+$/, '');
  if (!rest || /^(?:this|it|the (?:page|screen|app|window|document|note)|what(?:'s| is) (?:open|on (?:my |the )?screen)|my (?:screen|note|page)|this (?:page|note|app|document))$/i.test(rest)) {
    return { kind: 'screen' };
  }
  if (/^(?:my |the )?clipboard$/i.test(rest)) return { kind: 'clipboard' };
  if (/^(?:that|your (?:last )?(?:answer|reply|response))$/i.test(rest)) return { kind: 'last' };
  return { kind: 'text', text: rest };
}

/** "show your thinking", "how did you get that", "explain your reasoning". */
export function isReasoningRequest(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[?.!]+$/, '');
  return /^(?:(?:show|tell|explain)(?: me)? (?:your|the) (?:thinking|reasoning|thought process|steps)|how did you (?:get|work out|figure out|come up with|arrive at) (?:that|this|it)|why did you (?:say|answer) (?:that|this)|what was your reasoning)$/.test(t);
}

const STOP = new Set(('a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me my your our their not no do does did have has had will would can could should may might must just also very really than about into over after before more most such there here what which who whom when where why how all any each few other some own same too only up down out off again further once').split(' '));

/** Sentences of a text (keeps abbreviations and decimals mostly intact). */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * On-device extractive summary: the `max` most representative sentences, in
 * their original order. Short texts come back unchanged.
 */
export function summarizeText(text: string, max = 3): string {
  const all = sentences(text);
  if (all.length <= max) return all.join(' ');
  const freq = new Map<string, number>();
  const words = (s: string) => (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(w => w.length > 2 && !STOP.has(w));
  for (const s of all) for (const w of words(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = all.map((s, i) => {
    const ws = words(s);
    const score = ws.length ? ws.reduce((n, w) => n + (freq.get(w) ?? 0), 0) / Math.sqrt(ws.length) : 0;
    // A small lead bonus: openings usually state the point.
    return { s, i, score: score * (i === 0 ? 1.25 : 1) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s)
    .join(' ');
}

/** How UKI got to an answer, in plain words (shown only when asked). */
export function describeReasoning(steps: string[] | undefined, intent: string | undefined): string {
  const clean = (steps ?? []).filter(s => !/^(Context:|Checking slash|Checking AutoPilot|Normalized phrasing|Learned pattern hint)/.test(s));
  if (clean.length === 0) return intent ? `I matched your request to "${intent}" and answered directly.` : 'I answered directly, without a lookup.';
  return 'Here is how I got there:\n' + clean.map((s, i) => `${i + 1}. ${s}`).join('\n');
}
