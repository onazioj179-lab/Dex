// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Duration parsing — the inverse of `format/units.formatDuration`. Parses human
 * spans like "1h 30m", "90m", "2d 3h", "500ms", "45s" into milliseconds, so
 * settings inputs (autosave interval, retention, backup cadence) accept friendly
 * text. Pure: no DOM, no IO.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Order matters: 'ms' before 's'/'m' so "500ms" parses as milliseconds.
const TOKEN_RE = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi;

/**
 * Parse a duration string to ms. Sums all unit tokens ("1h 30m" → 5400000).
 * A bare number is treated as milliseconds. Returns null when nothing parses.
 */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (str === '') return null;

  // Bare number → milliseconds.
  if (/^\d+(?:\.\d+)?$/.test(str)) return Number(str);

  let total = 0;
  let matched = false;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(str)) !== null) {
    const value = Number(m[1]);
    const unit = m[2];
    if (Number.isFinite(value) && unit in UNIT_MS) {
      total += value * UNIT_MS[unit];
      matched = true;
    }
  }
  return matched ? total : null;
}

/** Parse to ms, or fall back to a default when invalid. */
export function parseDurationOr(input: string, fallbackMs: number): number {
  const v = parseDuration(input);
  return v === null ? fallbackMs : v;
}
