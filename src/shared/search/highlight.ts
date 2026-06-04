// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search match highlighting (SCH-035). Computes the character ranges in a result
 * title/subtitle that matched the query, so the search UI can bold them without
 * re-implementing matching. Case-insensitive, term-based (each whitespace-split
 * query term highlighted), with overlapping ranges merged. Pure: no DOM.
 */

export interface HighlightRange {
  start: number;
  end: number; // exclusive
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Ranges in `text` matching any query term. Merged + sorted. */
export function highlightRanges(text: string, query: string): HighlightRange[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0 || !text) return [];
  const hay = text.toLowerCase();

  const raw: HighlightRange[] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const idx = hay.indexOf(term, from);
      if (idx === -1) break;
      raw.push({ start: idx, end: idx + term.length });
      from = idx + term.length;
    }
  }
  if (raw.length === 0) return [];

  // Merge overlapping/adjacent ranges.
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const last = merged[merged.length - 1];
    if (raw[i].start <= last.end) {
      last.end = Math.max(last.end, raw[i].end);
    } else {
      merged.push(raw[i]);
    }
  }
  return merged;
}

/**
 * Split `text` into alternating matched/unmatched segments for rendering
 * (e.g. map to <mark> vs plain spans). Always reconstructs the full text.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return text ? [{ text, match: false }] : [];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), match: false });
    segments.push({ text: text.slice(r.start, r.end), match: true });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
