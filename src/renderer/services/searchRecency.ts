// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Usage-based result re-ranking (SCH ranking). The unified search ranks by
 * relevance; this nudges results the user actually picks (frequency) and picked
 * recently (recency) upward — "learned" ranking without changing the
 * orchestrator. Generic over any `{ id, score }`. Pure: no DOM, no IO.
 */

export interface UsageStat {
  count: number;
  lastTs: number;
}

export type UsageMap = Record<string, UsageStat>;

export interface RecencyOptions {
  /** Weight of pick frequency. Default 0.15 per log step. */
  freqWeight?: number;
  /** Weight of recency. Default 0.25 at "just used". */
  recencyWeight?: number;
  /** Half-life (ms) for the recency decay. Default 7 days. */
  halfLifeMs?: number;
  now?: number;
}

/** Multiplicative boost factor (>= 1) for one result given its usage. */
export function usageBoost(stat: UsageStat | undefined, opts: RecencyOptions = {}): number {
  if (!stat || stat.count <= 0) return 1;
  const freqWeight = opts.freqWeight ?? 0.15;
  const recencyWeight = opts.recencyWeight ?? 0.25;
  const halfLife = opts.halfLifeMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = opts.now ?? Date.now();

  const freq = freqWeight * Math.log2(stat.count + 1);
  const age = Math.max(0, now - stat.lastTs);
  const recency = recencyWeight * Math.pow(0.5, age / halfLife);
  return 1 + freq + recency;
}

/**
 * Return a new array re-ranked by `score * usageBoost`, descending. Input is
 * not mutated; ties keep input order (stable).
 */
export function reRankByUsage<T extends { id: string; score: number }>(
  results: readonly T[],
  usage: UsageMap,
  opts: RecencyOptions = {},
): T[] {
  return results
    .map((r, i) => ({ r, i, s: r.score * usageBoost(usage[r.id], opts) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

/** Record a pick into a usage map (returns a new map). */
export function recordUsage(usage: UsageMap, id: string, now: number = Date.now()): UsageMap {
  const prev = usage[id];
  return { ...usage, [id]: { count: (prev?.count ?? 0) + 1, lastTs: now } };
}
