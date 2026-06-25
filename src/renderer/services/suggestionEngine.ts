// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX App Suggestion Engine
 * -----------------------------------------------------------------------------
 * Turns the silently-collected usage signals in `store/learningStore` into a
 * ranked "what would you open next" list for the launcher. Pure and
 * deterministic (no DOM, no IO, no `Date.now()` unless caller omits `now`) so it
 * is fully unit-testable.
 *
 * Four signals, combined multiplicatively on top of a base of 1 so an app with
 * no data still scores 1 and ordering stays sensible from the first launch:
 *   - frequency  : how often the app is opened           (log-scaled)
 *   - recency    : how recently it was last opened        (exponential decay)
 *   - time-of-day: how much of its use clusters near now  (hour histogram)
 *   - pairing    : how often it follows the current app   (transition counts)
 */

export interface AppUsageStats {
  /** Open count per app id. */
  visits: Record<string, number>;
  /** Last-open epoch ms per app id. */
  lastActive: Record<string, number>;
  /** Per-app 24-slot launch histogram across the hours of the day. */
  hourly: Record<string, number[]>;
  /** from-app -> { to-app -> count } transition counts. */
  pairs: Record<string, Record<string, number>>;
}

export interface SuggestionOptions {
  /** Reference time. Defaults to now. */
  now?: number;
  /** Recency half-life in ms. Default 7 days. */
  halfLifeMs?: number;
  /** Weight of open frequency. Default 0.6 per log2 step. */
  freqWeight?: number;
  /** Weight of recency at "just used". Default 0.5. */
  recencyWeight?: number;
  /** Weight of time-of-day affinity. Default 0.5. */
  timeWeight?: number;
  /** Weight of pairing affinity from the current app. Default 1.0. */
  pairWeight?: number;
  /** App ids to exclude from the result (e.g. 'home'). 'home' is always excluded. */
  exclude?: readonly string[];
}

export interface AppSuggestion {
  appId: string;
  score: number;
}

const HOUR = 60 * 60 * 1000;

/** Sum a numeric array, treating a missing array as 0. */
function sum(arr: number[] | undefined): number {
  if (!arr) return 0;
  let t = 0;
  for (const n of arr) t += n;
  return t;
}

/**
 * Time-of-day affinity in [0, 1]: the share of this app's launches that fall
 * within +/-1 hour of `hour` (wrapping at midnight), relative to a flat
 * baseline. 0 means "no more likely than chance", up toward 1 means "strongly
 * clustered at this time".
 */
function timeAffinity(hist: number[] | undefined, hour: number): number {
  const total = sum(hist);
  if (!hist || total <= 0) return 0;
  const lo = (hour + 23) % 24;
  const hi = (hour + 1) % 24;
  const near = (hist[lo] || 0) + (hist[hour] || 0) + (hist[hi] || 0);
  const share = near / total;
  const baseline = 3 / 24; // the 3-hour window's share under a flat distribution
  if (share <= baseline) return 0;
  return (share - baseline) / (1 - baseline);
}

/**
 * Rank apps by learned likelihood of being opened next. Higher is better.
 * Apps with any usage data are always considered; `currentAppId` (and 'home')
 * are excluded. Stable: ties fall back to alphabetical id order.
 */
export function rankAppSuggestions(
  stats: AppUsageStats,
  currentAppId: string | null,
  opts: SuggestionOptions = {},
): AppSuggestion[] {
  const now = opts.now ?? Date.now();
  const halfLife = opts.halfLifeMs ?? 7 * 24 * HOUR;
  const freqW = opts.freqWeight ?? 0.6;
  const recW = opts.recencyWeight ?? 0.5;
  const timeW = opts.timeWeight ?? 0.5;
  const pairW = opts.pairWeight ?? 1.0;
  const hour = new Date(now).getHours();

  const excluded = new Set<string>(['home', ...(opts.exclude ?? [])]);
  if (currentAppId) excluded.add(currentAppId);

  // Candidate set: anything we have ANY signal for.
  const candidates = new Set<string>([
    ...Object.keys(stats.visits ?? {}),
    ...Object.keys(stats.lastActive ?? {}),
    ...Object.keys(stats.hourly ?? {}),
  ]);

  const transitions = currentAppId ? stats.pairs?.[currentAppId] : undefined;
  const transitionTotal = transitions ? sum(Object.values(transitions)) : 0;

  const out: AppSuggestion[] = [];
  for (const appId of candidates) {
    if (excluded.has(appId)) continue;

    const visits = stats.visits?.[appId] ?? 0;
    const freq = freqW * Math.log2(visits + 1);

    const last = stats.lastActive?.[appId] ?? 0;
    const age = Math.max(0, now - last);
    const recency = last > 0 ? recW * Math.pow(0.5, age / halfLife) : 0;

    const time = timeW * timeAffinity(stats.hourly?.[appId], hour);

    const pair =
      transitionTotal > 0 ? pairW * ((transitions![appId] ?? 0) / transitionTotal) : 0;

    const score = 1 + freq + recency + time + pair;
    out.push({ appId, score });
  }

  out.sort((a, b) => b.score - a.score || (a.appId < b.appId ? -1 : a.appId > b.appId ? 1 : 0));
  return out;
}
