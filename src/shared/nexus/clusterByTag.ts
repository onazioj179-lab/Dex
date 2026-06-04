// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tag clustering (Nexus knowledge view, asset/idea grouping). Groups taggable
 * items into clusters keyed by tag, largest cluster first. An item with multiple
 * tags appears in each of its tag clusters. Pure: no DOM, no IO.
 */

export interface Taggable {
  id: string;
  tags?: readonly string[];
}

export interface TagCluster {
  tag: string;
  ids: string[];
  count: number;
}

/** Cluster items by tag, largest first (ties alphabetical). */
export function clusterByTag(items: readonly Taggable[]): TagCluster[] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase();
      const list = map.get(key) ?? [];
      list.push(item.id);
      map.set(key, list);
    }
  }
  return Array.from(map.entries())
    .map(([tag, ids]) => ({ tag, ids, count: ids.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Frequency of each tag, most common first. */
export function tagFrequencies(items: readonly Taggable[]): Array<{ tag: string; count: number }> {
  return clusterByTag(items).map(({ tag, count }) => ({ tag, count }));
}

/** Items that share at least one tag with the given item (excluding itself). */
export function relatedByTag(items: readonly Taggable[], targetId: string): string[] {
  const target = items.find((i) => i.id === targetId);
  if (!target || !target.tags?.length) return [];
  const tagSet = new Set(target.tags.map((t) => t.toLowerCase()));
  const out = new Set<string>();
  for (const item of items) {
    if (item.id === targetId) continue;
    if ((item.tags ?? []).some((t) => tagSet.has(t.toLowerCase()))) out.add(item.id);
  }
  return Array.from(out);
}
