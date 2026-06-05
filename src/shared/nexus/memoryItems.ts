// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus 2.0 — memory-item ranking & recency bucketing.
 * -----------------------------------------------------------------------------
 * `memoryViews` defines *which* memory views exist; this defines *how their
 * contents are ordered and grouped*. The sidebar/content panes need items sorted
 * the way a person recalls work — pinned first, then most-relevant (recency ×
 * frequency), and grouped into scannable "Today / This week / This month /
 * Older" sections. Pure — the clock is injected.
 */

export interface MemoryItem {
  id: string;
  /** Which NexusView (memoryViews.ts) this belongs to. */
  viewId: string;
  title: string;
  /** Last touched, epoch ms. */
  updatedTs: number;
  /** Times accessed/touched — the frequency signal. Default 1. */
  hits?: number;
  /** Pinned items always sort to the top of their group. */
  pinned?: boolean;
}

export type RecencyBucket = 'today' | 'week' | 'month' | 'older';

const MS_DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Which recency bucket a timestamp falls into relative to `now`. */
export function recencyBucket(ts: number, now: number): RecencyBucket {
  const today = startOfDay(now);
  if (ts >= today) return 'today';
  const ageDays = (today - startOfDay(ts)) / MS_DAY;
  if (ageDays < 7) return 'week';
  if (ageDays < 31) return 'month';
  return 'older';
}

export const RECENCY_BUCKET_LABELS: Record<RecencyBucket, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  older: 'Older',
};

/** Default half-life for recency decay (7 days): a week-old item scores ½. */
export const DEFAULT_HALF_LIFE_MS = 7 * MS_DAY;

/**
 * Relevance score combining recency (exponential decay) and frequency. A more
 * recently touched item outranks an older one; ties broken by how often it was
 * used. `hits` is dampened (log) so a single very-frequent item can't dominate.
 */
export function recencyScore(item: MemoryItem, now: number, halfLifeMs: number = DEFAULT_HALF_LIFE_MS): number {
  const age = Math.max(0, now - item.updatedTs);
  const decay = Math.pow(0.5, age / Math.max(1, halfLifeMs));
  const freq = 1 + Math.log2(1 + Math.max(0, (item.hits ?? 1) - 1));
  return decay * freq;
}

export interface RankOptions {
  halfLifeMs?: number;
  /** When true (default), pinned items sort above unpinned regardless of score. */
  pinnedFirst?: boolean;
}

/** Items for one view, most-relevant first (pinned on top by default). */
export function rankMemoryItems(items: readonly MemoryItem[], now: number, opts: RankOptions = {}): MemoryItem[] {
  const halfLifeMs = opts.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const pinnedFirst = opts.pinnedFirst ?? true;
  return [...items].sort((a, b) => {
    if (pinnedFirst && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const sb = recencyScore(b, now, halfLifeMs);
    const sa = recencyScore(a, now, halfLifeMs);
    if (sb !== sa) return sb - sa;
    if (b.updatedTs !== a.updatedTs) return b.updatedTs - a.updatedTs;
    return a.id.localeCompare(b.id);
  });
}

/** Keep only items belonging to `viewId`. */
export function itemsForView(items: readonly MemoryItem[], viewId: string): MemoryItem[] {
  return items.filter((i) => i.viewId === viewId);
}

export interface RecencyGroup {
  bucket: RecencyBucket;
  label: string;
  items: MemoryItem[];
}

const BUCKET_ORDER: RecencyBucket[] = ['today', 'week', 'month', 'older'];

/**
 * Rank then split items into recency sections, in display order, omitting empty
 * sections. Within each section items keep their ranked order.
 */
export function groupByRecency(items: readonly MemoryItem[], now: number, opts: RankOptions = {}): RecencyGroup[] {
  const ranked = rankMemoryItems(items, now, opts);
  const byBucket = new Map<RecencyBucket, MemoryItem[]>();
  for (const item of ranked) {
    const b = recencyBucket(item.updatedTs, now);
    const arr = byBucket.get(b);
    if (arr) arr.push(item);
    else byBucket.set(b, [item]);
  }
  return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((bucket) => ({
    bucket,
    label: RECENCY_BUCKET_LABELS[bucket],
    items: byBucket.get(bucket)!,
  }));
}
