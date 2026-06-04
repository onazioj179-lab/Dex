// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Recent-commands store (Command Palette). Tracks the last-used command ids so
 * the palette can surface a "Recent" group when it opens empty: move-to-front,
 * de-duplicated, capped, and resilient to corrupt storage. Persistence only —
 * the only side effect is localStorage. Unit-testable.
 */

const RECENT_KEY = 'dex-command-palette-recent';
export const RECENT_MAX = 6;

/** The recent command ids, most-recent first (empty on miss/corruption). */
export function getRecentCommandIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Record `id` as the most-recent command. Returns the updated list. */
export function recordRecentCommand(id: string): string[] {
  if (!id) return getRecentCommandIds();
  try {
    const next = [id, ...getRecentCommandIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getRecentCommandIds();
  }
}

/** Clear the recent-commands history. */
export function clearRecentCommands(): void {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* storage unavailable */ }
}
