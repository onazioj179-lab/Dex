// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AI usage totals + an optional daily token cap for cloud providers.
 *
 * Non-streaming calls record the token counts the provider returns. Streaming
 * replies carry no usage, so they are recorded as an ESTIMATE (characters / 4)
 * and flagged as such. The cap applies only to cloud (key-requiring) providers;
 * local models are never limited. Totals reset each local day. Plain
 * localStorage: counts, not content.
 */

const USAGE_KEY = 'dex-uki-usage';
const CAP_KEY = 'dex-uki-daily-token-cap';

export interface ProviderUsage { prompt: number; completion: number; calls: number; estimated: number }
export interface UsageDay { date: string; byProvider: Record<string, ProviderUsage> }

export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function readUsage(now = new Date()): UsageDay {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null') as UsageDay | null;
    if (raw && raw.date === today(now) && raw.byProvider && typeof raw.byProvider === 'object') return raw;
  } catch { /* corrupt: start fresh */ }
  return { date: today(now), byProvider: {} };
}

/** Add one call's tokens. `estimated` marks counts DEX inferred (streaming). */
export function recordUsage(providerId: string, prompt: number, completion: number, estimated = false, now = new Date()): void {
  const day = readUsage(now);
  const cur = day.byProvider[providerId] ?? { prompt: 0, completion: 0, calls: 0, estimated: 0 };
  const p = Math.max(0, Math.round(prompt || 0));
  const c = Math.max(0, Math.round(completion || 0));
  day.byProvider[providerId] = {
    prompt: cur.prompt + p,
    completion: cur.completion + c,
    calls: cur.calls + 1,
    estimated: cur.estimated + (estimated ? p + c : 0),
  };
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(day)); } catch { /* quota */ }
}

/** Rough token estimate for text without provider counts. */
export const estimateTokens = (text: string) => Math.ceil((text || '').length / 4);

/** Total cloud tokens today (all key-requiring providers). */
export function cloudTokensToday(isCloud: (providerId: string) => boolean, now = new Date()): number {
  const day = readUsage(now);
  return Object.entries(day.byProvider)
    .filter(([id]) => isCloud(id))
    .reduce((n, [, u]) => n + u.prompt + u.completion, 0);
}

/** Daily cloud token cap; 0 = no cap. */
export function getDailyTokenCap(): number {
  try {
    const v = Number(localStorage.getItem(CAP_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function setDailyTokenCap(cap: number): void {
  try {
    if (cap > 0) localStorage.setItem(CAP_KEY, String(Math.floor(cap)));
    else localStorage.removeItem(CAP_KEY);
  } catch { /* storage unavailable */ }
}

/** Throws when a cloud call would exceed the daily cap (local calls never do). */
export function assertWithinCap(providerLabel: string, cloud: boolean, isCloud: (id: string) => boolean): void {
  if (!cloud) return;
  const cap = getDailyTokenCap();
  if (cap > 0 && cloudTokensToday(isCloud) >= cap) {
    throw new Error(`Daily cloud AI limit reached (${cap.toLocaleString()} tokens). ${providerLabel} was not called. Raise or clear the limit in Settings › AI Providers, or switch to Local only.`);
  }
}
