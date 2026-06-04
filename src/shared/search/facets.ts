// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Search facets (result filter chips: "Apps 4 · Files 12 · Notes 3"). Counts
 * results by kind and source and filters by a chosen facet. Integration layer
 * over the unified `SearchResult`. Pure: no DOM, no IO.
 */

import type { SearchResult, SearchKind } from './SearchOrchestrator';

export interface Facet {
  kind: SearchKind;
  count: number;
}

/** Result counts per kind, most-frequent first. */
export function computeKindFacets(results: readonly SearchResult[]): Facet[] {
  const counts = new Map<SearchKind, number>();
  for (const r of results) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** Result counts per source provider. */
export function computeSourceFacets(results: readonly SearchResult[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/** Keep only results of the given kind (null/undefined → all). */
export function filterByKind(results: readonly SearchResult[], kind: SearchKind | null): SearchResult[] {
  return kind ? results.filter((r) => r.kind === kind) : [...results];
}
