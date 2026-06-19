// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Calendar conflict detection (DEX v6 Track G). Given timed events, returns the
 * set of event ids that overlap at least one other event on the SAME day. Pure +
 * unit-tested; Calendar uses it to flag double-booked slots. Times are minutes
 * from midnight; touching ranges (end === start) are NOT treated as a conflict.
 */

export interface TimedEvent {
  id: string;
  /** Calendar date key (e.g. ISO yyyy-mm-dd); only same-date events are compared. */
  date: string;
  /** Start time in minutes from midnight. */
  start: number;
  /** End time in minutes from midnight. */
  end: number;
}

/**
 * Returns the ids of every event that overlaps another event on the same date.
 * O(n log n) per day in the common case (sorted sweep with early break).
 */
export function findEventConflicts(events: TimedEvent[]): Set<string> {
  const conflicts = new Set<string>();

  const byDate: Record<string, TimedEvent[]> = {};
  for (const e of events) {
    (byDate[e.date] ||= []).push(e);
  }

  for (const date of Object.keys(byDate)) {
    const sorted = byDate[date]
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Sorted by start: once a later event starts at/after i's end, nothing
        // further can overlap i either.
        if (sorted[j].start >= sorted[i].end) break;
        conflicts.add(sorted[i].id);
        conflicts.add(sorted[j].id);
      }
    }
  }

  return conflicts;
}
