// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Abbreviation / initialism matching (command palette, app launcher). Lets "vsc"
 * find "Visual Studio Code" (initials) and "stng" find "Settings" (subsequence).
 * Pure: no DOM, no IO.
 */

/** True when `abbr` matches the initials of the words in `text` (in order). */
export function matchInitials(abbr: string, text: string): boolean {
  const a = abbr.toLowerCase().replace(/\s+/g, '');
  if (a === '') return true;
  const initials = text
    .toLowerCase()
    .split(/[\s._/-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  // `a` must be a prefix-ordered subsequence of the initials.
  let i = 0;
  for (const ch of initials) {
    if (ch === a[i]) i++;
    if (i === a.length) return true;
  }
  return i === a.length;
}

/** True when each char of `abbr` appears in `text` in order (subsequence). */
export function matchSubsequence(abbr: string, text: string): boolean {
  const a = abbr.toLowerCase().replace(/\s+/g, '');
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (i < a.length && ch === a[i]) i++;
  }
  return i === a.length;
}

/**
 * Combined abbreviation score: 1.0 for an initials match, 0.6 for a subsequence
 * match, 0 otherwise. Initials are the strongest signal for launchers.
 */
export function abbreviationScore(abbr: string, text: string): number {
  if (abbr.trim() === '') return 0;
  if (matchInitials(abbr, text)) return 1;
  if (matchSubsequence(abbr, text)) return 0.6;
  return 0;
}
