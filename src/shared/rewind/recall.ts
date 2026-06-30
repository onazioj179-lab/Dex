// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-session recall — resolve a natural phrase ("last thursday", "yesterday",
 * "3 days ago", "2026-06-25") to a calendar day (YYYY-MM-DD) so UKI can pull the
 * Rewind activity history for that day. Pure + clock-injected so it is fully
 * unit-testable and deterministic (no hidden `new Date()`).
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a recall phrase to a YYYY-MM-DD day relative to `now`, or null if it
 * cannot be understood. Weekday names resolve to the most recent PAST occurrence
 * (never today). ISO dates pass through after validation.
 */
export function resolveRecallDate(when: string, now: Date): string | null {
  const s = (when ?? '').trim().toLowerCase();
  if (!s) return null;

  // Explicit ISO date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const probe = new Date(`${s}T00:00:00`);
    return Number.isNaN(probe.getTime()) ? null : s;
  }

  if (s === 'today') return toISO(now);
  if (s === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toISO(d);
  }

  const daysAgo = s.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgo) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgo[1], 10));
    return toISO(d);
  }

  if (s === 'last week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return toISO(d);
  }

  // Weekday, optionally "last <weekday>" -> most recent past occurrence.
  const wd = s.replace(/^last\s+/, '');
  const idx = WEEKDAYS.indexOf(wd);
  if (idx >= 0) {
    const d = new Date(now);
    let diff = d.getDay() - idx;
    if (diff <= 0) diff += 7; // strictly in the past, not today
    d.setDate(d.getDate() - diff);
    return toISO(d);
  }

  return null;
}
