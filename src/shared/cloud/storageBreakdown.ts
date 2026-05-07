// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Storage usage breakdown by category + cleanup suggestions.
 */

// DEX v3.8.9 - storage breakdown

export type UsageCategory =
  | 'notes' | 'snippets' | 'media' | 'workspaces'
  | 'history' | 'plugins' | 'cache' | 'misc';

export interface UsageItem {
  id: string;
  category: UsageCategory;
  bytes: number;
  lastAccessedAt: number;
  /** Optional human-readable label for the cleanup wizard. */
  label?: string;
}

export interface UsageBreakdown {
  totals: Record<UsageCategory, number>;
  total: number;
}

const ZERO_TOTALS: Record<UsageCategory, number> = {
  notes: 0, snippets: 0, media: 0, workspaces: 0,
  history: 0, plugins: 0, cache: 0, misc: 0,
};

export function summariseUsage(items: UsageItem[]): UsageBreakdown {
  const totals = { ...ZERO_TOTALS };
  let total = 0;
  for (const it of items) {
    totals[it.category] = (totals[it.category] ?? 0) + it.bytes;
    total += it.bytes;
  }
  return { totals, total };
}

/** Pick top-N largest items overall. */
export function largestItems(items: UsageItem[], n: number = 10): UsageItem[] {
  return [...items].sort((a, b) => b.bytes - a.bytes).slice(0, n);
}

/** Pick items idle for at least `daysIdle` and at least `minBytes`. */
export function staleLargeItems(items: UsageItem[], opts: { daysIdle?: number; minBytes?: number; now?: number } = {}): UsageItem[] {
  const days = opts.daysIdle ?? 180;
  const min = opts.minBytes ?? 10 * 1024 * 1024;
  const now = opts.now ?? Date.now();
  const ms = days * 24 * 60 * 60 * 1000;
  return items.filter((it) => it.bytes >= min && now - it.lastAccessedAt >= ms);
}

/** Cleanup suggestions ranked by potential bytes saved. */
export function cleanupSuggestions(items: UsageItem[], opts: { now?: number } = {}): Array<{ category: UsageCategory; bytes: number; reason: string }> {
  const now = opts.now ?? Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const sixMonths = now - 180 * 24 * 60 * 60 * 1000;
  const out: Array<{ category: UsageCategory; bytes: number; reason: string }> = [];
  const cacheBytes = items.filter((i) => i.category === 'cache').reduce((s, i) => s + i.bytes, 0);
  if (cacheBytes > 0) out.push({ category: 'cache', bytes: cacheBytes, reason: 'cache can be cleared safely' });
  const oldHistory = items.filter((i) => i.category === 'history' && i.lastAccessedAt < yearAgo).reduce((s, i) => s + i.bytes, 0);
  if (oldHistory > 0) out.push({ category: 'history', bytes: oldHistory, reason: 'history older than a year' });
  const staleMedia = items.filter((i) => i.category === 'media' && i.lastAccessedAt < sixMonths).reduce((s, i) => s + i.bytes, 0);
  if (staleMedia > 0) out.push({ category: 'media', bytes: staleMedia, reason: 'media not opened in 6 months' });
  return out.sort((a, b) => b.bytes - a.bytes);
}
