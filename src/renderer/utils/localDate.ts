// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Calendar days are LOCAL. `new Date('2026-11-18')` is UTC midnight, which
// west of UTC is the previous evening: a task picked for the 18th landed on
// the 17th and showed overdue early. Parse date-only strings as the local day;
// anything with a time keeps its own meaning. Format back the same way.

/** A Date for a date-only "YYYY-MM-DD" (local midnight) or any other date string/number. */
export function parseLocalDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" of the local day (for <input type="date"> values). */
export function toLocalDateInput(d: Date | number | null | undefined): string {
  if (d == null) return '';
  const x = typeof d === 'number' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/**
 * Due dates saved before the local-day fix were the picked day at UTC midnight
 * ("…T00:00:00.000Z"), which shows as the previous day west of UTC. Read such
 * a value as the local day it was picked for; any other value is unchanged.
 */
export function repairPickedDay(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z$/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return parseLocalDate(v);
}
