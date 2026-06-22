// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Small, shared sort/filter primitives so list surfaces (Kanban, Notes search,
 * DexCode workspace search) all sort and filter with identical semantics. Pure:
 * no DOM, no React.
 */

export type SortDir = 'asc' | 'desc';

/** Rank a task priority so it sorts most-urgent-first under 'asc'. */
export function priorityRank(priority: string | undefined): number {
  switch (priority) {
    case 'urgent': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return 4;
  }
}

/**
 * Multi-term AND substring match: every whitespace-separated term in `query`
 * must appear (case-insensitively) somewhere in `haystack`. An empty query
 * matches everything. This is the canonical in-list search semantic.
 */
export function textIncludesAll(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = haystack.toLowerCase();
  return q.split(/\s+/).every(term => hay.includes(term));
}

/** Comparator that orders by a derived key with direction. Stable for equals. */
export function byField<T>(
  key: (item: T) => number | string,
  dir: SortDir = 'asc',
): (a: T, b: T) => number {
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * sign;
    if (ka > kb) return 1 * sign;
    return 0;
  };
}

/** Non-mutating sort helper (Array.prototype.sort mutates in place). */
export function sortedBy<T>(items: readonly T[], cmp: (a: T, b: T) => number): T[] {
  return [...items].sort(cmp);
}
