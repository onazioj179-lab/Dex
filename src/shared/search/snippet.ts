// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search-result snippets (Spotlight/Files/Notes result previews). Extracts a
 * window of text around the first query-term match, with ellipses, so results
 * show context instead of a truncated prefix. Pairs with `highlight.ts` for the
 * UI emphasis. Pure: no DOM, no IO.
 */

const ELLIPSIS = '…';

/** Index of the earliest occurrence of any query term (case-insensitive). */
function firstMatchIndex(text: string, query: string): number {
  const hay = text.toLowerCase();
  let best = -1;
  for (const term of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = hay.indexOf(term);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

/**
 * A snippet of `text` centered on the first match of `query`, at most
 * ~`radius*2` chars wide, with leading/trailing ellipses where truncated. Falls
 * back to the start of the text when nothing matches.
 */
export function extractSnippet(text: string, query: string, radius = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= radius * 2) return clean;

  const idx = firstMatchIndex(clean, query);
  if (idx === -1) {
    return clean.slice(0, radius * 2).trimEnd() + ELLIPSIS;
  }

  let start = Math.max(0, idx - radius);
  let end = Math.min(clean.length, idx + radius);
  // Snap to word boundaries where reasonable.
  if (start > 0) {
    const sp = clean.indexOf(' ', start);
    if (sp !== -1 && sp < idx) start = sp + 1;
  }
  if (end < clean.length) {
    const sp = clean.lastIndexOf(' ', end);
    if (sp > idx) end = sp;
  }

  return (start > 0 ? ELLIPSIS : '') + clean.slice(start, end).trim() + (end < clean.length ? ELLIPSIS : '');
}
