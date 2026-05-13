// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Count business days (Mon-Fri) between two dates inclusive of start, exclusive of end.
// Optionally subtract a set of holiday timestamps (date-only, normalized to UTC midnight).

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function businessDaysBetween(
  start: Date,
  end: Date,
  holidays: ReadonlyArray<Date> = [],
): number {
  const s = startOfUtcDay(start);
  const e = startOfUtcDay(end);
  if (e <= s) return 0;
  const holidaySet = new Set(holidays.map((h) => startOfUtcDay(h)));
  let count = 0;
  for (let t = s; t < e; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidaySet.has(t)) continue;
    count++;
  }
  return count;
}

export function addBusinessDays(
  start: Date,
  days: number,
  holidays: ReadonlyArray<Date> = [],
): Date {
  const holidaySet = new Set(holidays.map((h) => startOfUtcDay(h)));
  let t = startOfUtcDay(start);
  let remaining = days;
  const step = days >= 0 ? 86400000 : -86400000;
  while (remaining !== 0) {
    t += step;
    const day = new Date(t).getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidaySet.has(t)) continue;
    remaining += days >= 0 ? -1 : 1;
  }
  return new Date(t);
}
