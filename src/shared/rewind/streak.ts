// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Activity streaks (Rewind productivity / Home). Given the set of days that had
 * activity ("YYYY-MM-DD"), compute the longest run of consecutive days and the
 * current streak (consecutive days ending today, or yesterday if today is not
 * yet active). Pure: no DOM, no IO, injectable "today".
 */

const DAY_MS = 86_400_000;
const SHARD_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayIndex(shard: string): number | null {
  if (!SHARD_RE.test(shard)) return null;
  const [y, m, d] = shard.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return Math.floor(date.getTime() / DAY_MS);
}

export interface StreakResult {
  current: number;
  longest: number;
}

/** Compute current + longest consecutive-day streaks from active day shards. */
export function computeStreaks(activeDays: readonly string[], today: string): StreakResult {
  // Unique, valid day indices, ascending.
  const idx = Array.from(new Set(
    activeDays.map(dayIndex).filter((n): n is number => n !== null),
  )).sort((a, b) => a - b);

  if (idx.length === 0) return { current: 0, longest: 0 };

  // Longest run of consecutive indices.
  let longest = 1, run = 1;
  for (let i = 1; i < idx.length; i++) {
    run = idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Current streak: walk back from today (or yesterday) while days are present.
  const todayIdx = dayIndex(today);
  let current = 0;
  if (todayIdx !== null) {
    const present = new Set(idx);
    // Anchor at today if active, else yesterday (a streak that ended yesterday
    // still counts as "current" until a day is fully missed).
    let cursor = present.has(todayIdx) ? todayIdx : (present.has(todayIdx - 1) ? todayIdx - 1 : null);
    while (cursor !== null && present.has(cursor)) {
      current++;
      cursor--;
    }
  }

  return { current, longest };
}
