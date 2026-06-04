// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Word wrapping (note/label rendering, plain-text export, terminal output).
 * Greedy wrap to a column width, preserving existing newlines and hard-breaking
 * words longer than the width. Pure: no DOM, no IO.
 */

/** Break a single word that exceeds `width` into width-sized chunks. */
function hardBreak(word: string, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
  return out;
}

/** Wrap `text` to `width` columns, returning the wrapped lines. */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return text.split('\n');
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const chunks = word.length > width ? hardBreak(word, width) : [word];
      for (const chunk of chunks) {
        if (line === '') {
          line = chunk;
        } else if (line.length + 1 + chunk.length <= width) {
          line += ` ${chunk}`;
        } else {
          lines.push(line);
          line = chunk;
        }
      }
    }
    if (line !== '') lines.push(line);
  }
  return lines;
}

/** Wrap and re-join into a single string with newlines. */
export function wrap(text: string, width: number): string {
  return wrapText(text, width).join('\n');
}
