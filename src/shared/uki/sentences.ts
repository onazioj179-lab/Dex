// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sentence splitting (UKI streaming + summarization). Splits prose into
 * sentences for incremental rendering ("speak/show one sentence at a time") and
 * for extractive summaries. Heuristic — avoids breaking on a few common
 * abbreviations and decimals. Pure: no DOM, no IO.
 */

// Common abbreviations that end with a period but not a sentence.
const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'fig', 'no', 'vol']);

/** Split `text` into trimmed, non-empty sentences. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = text[i + 1] ?? '';
      // Don't split inside a decimal number ("3.14").
      if (ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(next)) continue;
      // Don't split right after a known abbreviation.
      const lastWord = buf.trim().split(/\s+/).pop()?.replace(/[.!?]+$/, '').toLowerCase() ?? '';
      if (ch === '.' && ABBREV.has(lastWord)) continue;
      // A boundary needs end-of-text or whitespace before the next char.
      if (next === '' || /\s/.test(next)) {
        const s = buf.trim();
        if (s) out.push(s);
        buf = '';
      }
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/** First `n` sentences joined — a cheap extractive summary. */
export function firstSentences(text: string, n: number): string {
  return splitSentences(text).slice(0, Math.max(0, n)).join(' ');
}

/** Count sentences in `text`. */
export function sentenceCount(text: string): number {
  return splitSentences(text).length;
}
