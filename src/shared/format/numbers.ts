// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Number formatters for compact UI (Home / Nexus / Rewind analytics counts).
 * Pure: no DOM, no IO, no locale surprises (fixed rules for deterministic UI).
 */

/** Clamp a number into [lo, hi] -- re-exported from the shared math canonical. */
export { clamp } from '../math/num';

/** "999", "1.2k", "3.4M", "1.0B" — compact magnitude. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return `${neg}${Math.round(abs)}`;
  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'k' },
  ];
  for (const u of units) {
    if (abs >= u.v) {
      const val = abs / u.v;
      // One decimal unless it rounds to a whole >= 100 in that unit.
      const str = val >= 100 ? String(Math.round(val)) : val.toFixed(1);
      return `${neg}${str}${u.s}`;
    }
  }
  return `${neg}${Math.round(abs)}`;
}

/** "42%" from a 0..1 ratio (or pass already-percent with `fromRatio=false`). */
export function formatPercent(value: number, fromRatio = true, decimals = 0): string {
  if (!Number.isFinite(value)) return '0%';
  const pct = fromRatio ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/** "1st", "2nd", "3rd", "11th", "21st" — English ordinal. */
export function ordinal(n: number): string {
  const i = Math.round(n);
  const mod100 = Math.abs(i) % 100;
  const mod10 = mod100 % 10;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }
  return `${i}${suffix}`;
}
