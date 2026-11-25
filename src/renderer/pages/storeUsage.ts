// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Store helper: rank apps by how often the user really opened them
 * (engagement stats.appUsageCounts). Apps never opened are left out, so the
 * "Your most used" rail stays hidden on a fresh profile instead of padding
 * itself with arbitrary picks.
 */
export function mostUsedAppIds(
  counts: Readonly<Record<string, number>>,
  limit: number,
  include: (id: string) => boolean = () => true,
): string[] {
  return Object.entries(counts)
    .filter(([id, n]) => Number.isFinite(n) && n > 0 && include(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}
