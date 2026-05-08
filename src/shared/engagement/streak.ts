// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Daily streak.
 *
 * Pure functions for tracking how many consecutive days a user has
 * opened DEX. Local-only -- no network, no telemetry. The store is a
 * tiny JSON object the caller persists wherever it likes (we use a
 * file in the Electron userData dir).
 *
 * Rules:
 *  - First launch ever:        streak = 1, longest = 1.
 *  - Same calendar day again:  no change.
 *  - Next calendar day:        streak += 1, longest = max(longest, streak).
 *  - Skipped one or more days: streak resets to 1.
 *
 * "Calendar day" is computed in the user's local timezone using the
 * provided `now` Date (defaults to the system clock). This means a user
 * who opens DEX at 23:55 and again at 00:05 the next day correctly
 * gets a +1, not a reset.
 */

export interface StreakState {
  /** Number of consecutive days, current run. */
  current: number;
  /** All-time longest streak. */
  longest: number;
  /** Total number of distinct days the app was opened. */
  totalDays: number;
  /** ISO local-day key (YYYY-MM-DD) of the last counted launch. */
  lastDay: string;
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  longest: 0,
  totalDays: 0,
  lastDay: '',
};

/** Format a Date as YYYY-MM-DD using local-time components (no UTC drift). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Days between two YYYY-MM-DD keys (b - a). Returns NaN when either is empty/invalid. */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return NaN;
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  if (pa.length !== 3 || pb.length !== 3 || pa.some(n => Number.isNaN(n)) || pb.some(n => Number.isNaN(n))) return NaN;
  const da = Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!);
  const db = Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Apply a launch event to the prior state and return the new state.
 * Pure -- safe to call repeatedly with the same `now`; same-day calls
 * leave the state unchanged.
 */
export function recordLaunch(prior: StreakState | null | undefined, now: Date = new Date()): StreakState {
  const today = localDayKey(now);
  const base: StreakState = prior ?? EMPTY_STREAK;
  if (base.lastDay === today) return base;
  if (!base.lastDay) {
    return { current: 1, longest: 1, totalDays: 1, lastDay: today };
  }
  const gap = daysBetween(base.lastDay, today);
  let nextCurrent: number;
  if (Number.isNaN(gap) || gap < 0) {
    // Defensive: if the saved day is in the future or unparseable, treat as a reset.
    nextCurrent = 1;
  } else if (gap === 0) {
    return base;
  } else if (gap === 1) {
    nextCurrent = base.current + 1;
  } else {
    nextCurrent = 1;
  }
  return {
    current: nextCurrent,
    longest: Math.max(base.longest, nextCurrent),
    totalDays: base.totalDays + 1,
    lastDay: today,
  };
}

/**
 * Calm, restrained tray-tooltip line. Plural-aware.
 * Examples: "Day 1 - DEX", "Day 12 - DEX (best 30)".
 */
export function tooltipFor(state: StreakState): string {
  if (state.current <= 0) return 'DEX';
  const head = `Day ${state.current} - DEX`;
  if (state.longest > state.current) return `${head} (best ${state.longest})`;
  return head;
}
