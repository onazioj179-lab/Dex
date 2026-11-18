// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Context Budget Manager. Runs before every provider call so a request
 * fits the chosen model's context window (which differs per model: 8K local
 * models to 1M hosted ones), instead of failing or being silently cut by the
 * provider.
 *
 * - Budget = smallest window among the models that may answer, minus the
 *   response allocation, times a safety factor (token counts are estimated at
 *   ~4 chars/token here; provider-reported usage is recorded after the call).
 * - The system prompt and the current user turn are pinned.
 * - Exact duplicate messages are dropped (repeated tool results).
 * - Each older message is bounded (tool output, pasted documents) to a share of
 *   the window, keeping its head and tail and saying how much was left out.
 * - Then the oldest unpinned messages go first, replaced by one truthful note
 *   ("N earlier messages left out"), never by a generated summary.
 * Pure; unit-tested in tests/unit/uki-context-budget.test.ts.
 */

import { estimateTokens, totalTokens } from './contextFit';

export interface BudgetMessage { role: string; content: string }

export interface BudgetReport {
  windowTokens: number;
  budgetTokens: number;
  beforeTokens: number;
  afterTokens: number;
  deduplicated: number;
  truncated: number;
  dropped: number;
}

export interface BudgetOptions {
  /** Context windows of the candidate models (tokens). Smallest wins. */
  windows: number[];
  /** Tokens kept free for the reply. */
  responseTokens?: number;
  /** Fraction of the window used for input (estimates are approximate). */
  safety?: number;
}

const DEFAULT_WINDOW = 8192;

function clipMiddle(text: string, maxTokens: number): { text: string; clipped: boolean } {
  const maxChars = Math.max(200, maxTokens * 4);
  if (text.length <= maxChars) return { text, clipped: false };
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  const omitted = text.length - head - tail;
  return { text: `${text.slice(0, head)}\n[… ${omitted} characters left out to fit the model's context …]\n${text.slice(-tail)}`, clipped: true };
}

export function budgetMessages<T extends BudgetMessage>(messages: readonly T[], opts: BudgetOptions): { messages: T[]; report: BudgetReport } {
  const windows = opts.windows.filter((w) => Number.isFinite(w) && w > 0);
  const windowTokens = windows.length ? Math.min(...windows) : DEFAULT_WINDOW;
  const responseTokens = Math.max(0, opts.responseTokens ?? 1024);
  const budgetTokens = Math.max(512, Math.floor((windowTokens - responseTokens) * (opts.safety ?? 0.85)));
  const asFit = (ms: readonly T[]) => ms.map((m) => ({ role: m.role, content: String(m.content ?? '') }));
  const beforeTokens = totalTokens(asFit(messages));
  const report: BudgetReport = { windowTokens, budgetTokens, beforeTokens, afterTokens: beforeTokens, deduplicated: 0, truncated: 0, dropped: 0 };
  if (beforeTokens <= budgetTokens || messages.length === 0) return { messages: [...messages], report };

  const lastIdx = messages.length - 1;
  const pinned = (i: number) => i === lastIdx || (i === 0 && messages[0].role === 'system');

  // 1. Drop exact duplicates (keep the latest copy).
  const seen = new Set<string>();
  let work: { m: T; i: number }[] = [];
  for (let i = lastIdx; i >= 0; i--) {
    const key = `${messages[i].role}\u0000${messages[i].content}`;
    if (!pinned(i) && seen.has(key)) { report.deduplicated++; continue; }
    seen.add(key);
    work.unshift({ m: messages[i], i });
  }

  // 2. Bound each unpinned message to a share of the budget.
  const perMessage = Math.max(256, Math.floor(budgetTokens * 0.25));
  work = work.map((w) => {
    if (pinned(w.i) || estimateTokens(String(w.m.content)) <= perMessage) return w;
    const c = clipMiddle(String(w.m.content), perMessage);
    if (c.clipped) report.truncated++;
    return { ...w, m: { ...w.m, content: c.text } };
  });

  // 3. Oldest unpinned first, until it fits.
  const tokensOf = () => totalTokens(asFit(work.map((w) => w.m)));
  let firstDropAt = -1;
  while (tokensOf() > budgetTokens) {
    const k = work.findIndex((w) => !pinned(w.i));
    if (k < 0) break;
    if (firstDropAt < 0) firstDropAt = k;
    work.splice(k, 1);
    report.dropped++;
  }
  let out = work.map((w) => w.m);
  if (report.dropped > 0) {
    const note = { role: 'user', content: `[${report.dropped} earlier message(s) were left out to fit the model's context.]` } as unknown as T;
    const at = Math.max(0, Math.min(firstDropAt, out.length - 1));
    out = [...out.slice(0, at), note, ...out.slice(at)];
  }
  // 4. Pinned messages alone too large: bound the system prompt last.
  if (totalTokens(asFit(out)) > budgetTokens && out.length > 1 && out[0].role === 'system') {
    const others = totalTokens(asFit(out.slice(1)));
    const c = clipMiddle(String(out[0].content), Math.max(256, budgetTokens - others));
    if (c.clipped) { out[0] = { ...out[0], content: c.text }; report.truncated++; }
  }
  report.afterTokens = totalTokens(asFit(out));
  return { messages: out, report };
}
