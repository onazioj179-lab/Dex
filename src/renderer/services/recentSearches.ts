// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Recent searches store (SCH-039) — a small, capped, persisted MRU list of
 * queries the unified search surfaces (Spotlight / command palette) show when
 * the box is empty. Most-recent first, de-duplicated case-insensitively,
 * bounded so it can never grow without limit. localStorage-backed, fail-safe.
 */

const STORAGE_KEY = 'dex-recent-searches';
export const MAX_RECENT_SEARCHES = 12;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Current recent queries, most-recent first. */
export function getRecentSearches(): string[] {
  return read();
}

/**
 * Record a query as most-recent. Trims/ignores blanks, removes any prior
 * case-insensitive duplicate, and caps the list. Returns the new list.
 */
export function addRecentSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return read();
  const lower = q.toLowerCase();
  const next = [q, ...read().filter((x) => x.toLowerCase() !== lower)].slice(0, MAX_RECENT_SEARCHES);
  write(next);
  return next;
}

/** Remove a single query (case-insensitive). Returns the new list. */
export function removeRecentSearch(query: string): string[] {
  const lower = query.trim().toLowerCase();
  const next = read().filter((x) => x.toLowerCase() !== lower);
  write(next);
  return next;
}

/** Clear all recent searches. */
export function clearRecentSearches(): void {
  write([]);
}
