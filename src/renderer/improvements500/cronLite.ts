// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Minimal cron expression parser and "next run after" calculator.
 * Format: 5 fields - minute hour dayOfMonth month dayOfWeek.
 * Supports `*`, comma lists, ranges `a-b`, and steps `*\/n` / `a-b/n`.
 * Day-of-week: 0-6 (Sun=0). Day-of-month: 1-31. Month: 1-12.
 */

interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('cronLite: expected 5 fields');
  return {
    minute: parseField(fields[0]!, 0, 59),
    hour: parseField(fields[1]!, 0, 23),
    dom: parseField(fields[2]!, 1, 31),
    month: parseField(fields[3]!, 1, 12),
    dow: parseField(fields[4]!, 0, 6),
    domStar: fields[2] === '*',
    dowStar: fields[4] === '*',
  };
}

function parseField(field: string, lo: number, hi: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    let stepStr = '1';
    let rangeStr = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      rangeStr = part.slice(0, slash);
      stepStr = part.slice(slash + 1);
    }
    const step = Number(stepStr);
    if (!Number.isInteger(step) || step <= 0) throw new Error(`cronLite: bad step in "${field}"`);
    let start = lo;
    let end = hi;
    if (rangeStr === '*' || rangeStr === '') {
      // keep lo..hi
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-');
      start = Number(a);
      end = Number(b);
    } else {
      start = Number(rangeStr);
      end = start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < lo || end > hi || start > end) {
      throw new Error(`cronLite: bad range in "${field}"`);
    }
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return out;
}

export function nextCronAfter(expr: string, after: Date): Date {
  const c = parseCron(expr);
  const d = new Date(after.getTime() + 60_000); // start at next minute
  d.setSeconds(0, 0);
  // Cap iterations to avoid infinite loop on impossible expressions.
  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    if (!c.month.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    const domOk = c.dom.has(d.getDate());
    const dowOk = c.dow.has(d.getDay());
    const dayOk = c.domStar && c.dowStar
      ? true
      : c.domStar ? dowOk
      : c.dowStar ? domOk
      : (domOk || dowOk);
    if (!dayOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!c.hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!c.minute.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d;
  }
  throw new Error('cronLite: no next run within search horizon');
}
