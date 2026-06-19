// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bracket matching for code editors (DEX v6 Track G). Given a position on a
 * bracket character, finds its depth-aware partner. Pure + unit-tested; the editor
 * uses it for jump-to-matching-bracket. Does NOT account for brackets inside
 * strings/comments -- a deliberate, simple v1 (matches most editors' fast path).
 */

const OPEN: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
const CLOSE: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

export interface BracketMatch {
  openPos: number;
  closePos: number;
}

/**
 * If `text[pos]` is a bracket, return the positions of it and its matching
 * partner (depth-aware); otherwise null. Opening brackets search forward,
 * closing brackets search backward.
 */
export function findMatchingBracket(text: string, pos: number): BracketMatch | null {
  if (pos < 0 || pos >= text.length) return null;
  const ch = text[pos];
  if (OPEN[ch]) {
    const close = OPEN[ch];
    let depth = 1;
    for (let i = pos + 1; i < text.length; i++) {
      if (text[i] === ch) depth++;
      else if (text[i] === close && --depth === 0) return { openPos: pos, closePos: i };
    }
  } else if (CLOSE[ch]) {
    const open = CLOSE[ch];
    let depth = 1;
    for (let i = pos - 1; i >= 0; i--) {
      if (text[i] === ch) depth++;
      else if (text[i] === open && --depth === 0) return { openPos: i, closePos: pos };
    }
  }
  return null;
}
