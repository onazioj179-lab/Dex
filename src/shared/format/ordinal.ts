// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ordinal numbers (dates "June 3rd", leaderboards, "2nd attempt"). English
 * ordinal suffixes with correct 11–13 handling. Pure: no DOM, no IO.
 */

/** The ordinal suffix for an integer ("st", "nd", "rd", "th"). */
export function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (abs % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** Format an integer as an ordinal ("1st", "22nd", "113th"). */
export function ordinal(n: number): string {
  return `${Math.trunc(n)}${ordinalSuffix(n)}`;
}
