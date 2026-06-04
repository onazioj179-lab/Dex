// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Source citation formatting (UKI-083). When UKI answers using a free API
 * (Wikipedia, weather, …) it should name its sources. This de-duplicates
 * sources by URL, numbers them stably, and renders a citation list — so the
 * prompt/response layer cites transparently. Pure: no DOM, no IO.
 */

export interface Source {
  title: string;
  url: string;
}

export interface Citation {
  n: number;
  title: string;
  url: string;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** De-duplicate by URL and assign stable 1-based numbers (first-seen order). */
export function buildCitations(sources: readonly Source[]): Citation[] {
  const seen = new Map<string, number>();
  const out: Citation[] = [];
  for (const s of sources) {
    if (!s.url || !s.url.trim()) continue;
    const key = normalizeUrl(s.url);
    if (seen.has(key)) continue;
    const n = out.length + 1;
    seen.set(key, n);
    out.push({ n, title: s.title.trim() || s.url, url: s.url.trim() });
  }
  return out;
}

/** The citation number for a given URL within a built list, or null. */
export function citationNumber(citations: readonly Citation[], url: string): number | null {
  const key = normalizeUrl(url);
  const hit = citations.find((c) => normalizeUrl(c.url) === key);
  return hit ? hit.n : null;
}

/** Render "[1] Title — url" lines for appending to a response. */
export function formatCitations(citations: readonly Citation[]): string {
  return citations.map((c) => `[${c.n}] ${c.title} — ${c.url}`).join('\n');
}

/** Append an inline marker like " [1]" for the given URL, or '' if unknown. */
export function inlineMarker(citations: readonly Citation[], url: string): string {
  const n = citationNumber(citations, url);
  return n ? ` [${n}]` : '';
}
