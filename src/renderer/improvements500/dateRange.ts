// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lazy generators over date ranges. Inclusive of `start`, exclusive of `end`.
 * UTC-only to keep behavior predictable across DST boundaries.
 */

export function* dateRangeDays(start: Date, end: Date): Generator<Date> {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new Error('dateRangeDays: start and end must be Date');
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('dateRangeDays: invalid Date');
  }
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = end.getTime();
  while (d.getTime() < stop) {
    yield new Date(d.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function* dateRangeMonths(start: Date, end: Date): Generator<Date> {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('dateRangeMonths: invalid Date');
  }
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = end.getTime();
  while (d.getTime() < stop) {
    yield new Date(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
}

export function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ub - ua) / MS);
}
