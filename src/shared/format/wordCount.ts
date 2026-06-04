// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Text statistics (Notes editor, Reader, UKI summaries). Word/character/line
 * counts and an estimated reading time. Pure: no DOM, no IO.
 */

export interface TextStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  lines: number;
  sentences: number;
  readingTimeMin: number;
}

/** Count words (whitespace-delimited, ignoring empty tokens). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/** Characters; `includeSpaces` false strips all whitespace. */
export function countChars(text: string, includeSpaces = true): number {
  return includeSpaces ? text.length : text.replace(/\s/g, '').length;
}

/** Estimated reading time in minutes (rounded up; default 200 wpm). */
export function readingTimeMinutes(text: string, wpm = 200): number {
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / Math.max(1, wpm)));
}

/** Full stats bundle for a document. */
export function textStats(text: string): TextStats {
  const words = countWords(text);
  return {
    words,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    sentences: (text.match(/[^.!?]+[.!?]+/g) || []).length || (text.trim() ? 1 : 0),
    readingTimeMin: readingTimeMinutes(text, 200),
  };
}
