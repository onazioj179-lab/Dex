// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cron parsing + matching (scheduled tasks / routines). Standard 5-field cron
 * ("min hour day-of-month month day-of-week") supporting `*`, ranges (a-b),
 * lists (a,b), and steps (*​/n, a-b/n). `cronMatches` tests a Date against the
 * spec. Pure: no DOM, no timers — the scheduler owns firing.
 */

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
}

function expandField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`bad step: ${part}`);

    let lo = min;
    let hi = max;
    if (rangePart !== '*') {
      const bounds = rangePart.split('-');
      lo = parseInt(bounds[0], 10);
      hi = bounds.length > 1 ? parseInt(bounds[1], 10) : lo;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`bad range: ${part}`);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`out of range: ${part}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron expression. Throws on malformed input. */
export function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron needs 5 fields, got ${fields.length}`);
  return {
    minute: expandField(fields[0], 0, 59),
    hour: expandField(fields[1], 0, 23),
    dayOfMonth: expandField(fields[2], 1, 31),
    month: expandField(fields[3], 1, 12),
    dayOfWeek: expandField(fields[4], 0, 6), // 0 = Sunday
  };
}

/** True when `date` (local time) satisfies the cron spec. */
export function cronMatches(spec: CronSpec, date: Date): boolean {
  return (
    spec.minute.has(date.getMinutes()) &&
    spec.hour.has(date.getHours()) &&
    spec.dayOfMonth.has(date.getDate()) &&
    spec.month.has(date.getMonth() + 1) &&
    spec.dayOfWeek.has(date.getDay())
  );
}

/** Convenience: parse + match in one call (returns false on parse error). */
export function matchesCron(expr: string, date: Date): boolean {
  try { return cronMatches(parseCron(expr), date); } catch { return false; }
}
