// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Recurring schedules (AUT) — the timing policy behind automation triggers,
 * Rewind backups, and any "run every N / daily at / weekly on" job. Computes the
 * next due time and whether a job is due, given the last run. Pure (no timers,
 * no IO): the main process owns the actual scheduling; this owns the math.
 */

export type Recurrence =
  | { kind: 'interval'; everyMs: number }
  | { kind: 'daily'; hour: number; minute?: number }
  | { kind: 'weekly'; weekday: number; hour: number; minute?: number }; // weekday 0=Sun

function atTime(base: Date, hour: number, minute: number): number {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Next fire time at or after `from` (epoch ms). For `interval`, that's
 * `from + everyMs`. For daily/weekly it's the next local clock occurrence.
 */
export function nextDue(rec: Recurrence, from: number): number {
  if (rec.kind === 'interval') {
    return from + Math.max(1, rec.everyMs);
  }
  const minute = rec.minute ?? 0;
  const fromDate = new Date(from);

  if (rec.kind === 'daily') {
    let t = atTime(fromDate, rec.hour, minute);
    if (t <= from) t = atTime(new Date(from + 86_400_000), rec.hour, minute);
    return t;
  }

  // weekly
  const targetDow = ((rec.weekday % 7) + 7) % 7;
  for (let add = 0; add <= 7; add++) {
    const day = new Date(from + add * 86_400_000);
    if (day.getDay() === targetDow) {
      const t = atTime(day, rec.hour, minute);
      if (t > from) return t;
    }
  }
  // Fallback (only if from is exactly the target instant): one week later.
  return atTime(new Date(from + 7 * 86_400_000), rec.hour, minute);
}

/** True when the job should run now (next fire after `lastRun` has arrived). */
export function isDue(rec: Recurrence, lastRun: number, now: number): boolean {
  return nextDue(rec, lastRun) <= now;
}

/** Ms until the next fire from `now` (0 if already due). */
export function msUntilDue(rec: Recurrence, lastRun: number, now: number): number {
  return Math.max(0, nextDue(rec, lastRun) - now);
}
