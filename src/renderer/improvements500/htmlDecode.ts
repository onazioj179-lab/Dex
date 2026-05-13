// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Decode HTML/XML entities. Counterpart to `xmlEscape`.
 * Handles named entities for the canonical 5 (lt, gt, amp, quot, apos),
 * decimal `&#NNN;`, and hex `&#xHH;`.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

export function htmlDecode(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16);
      if (Number.isFinite(code)) return safeFromCode(code);
      return m;
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      if (Number.isFinite(code)) return safeFromCode(code);
      return m;
    }
    const named = NAMED[body];
    return named === undefined ? m : named;
  });
}

function safeFromCode(code: number): string {
  if (code < 0 || code > 0x10ffff) return '';
  try { return String.fromCodePoint(code); } catch { return ''; }
}
