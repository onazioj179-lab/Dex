// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus tag index (filter-by-tag in memory views, tag clouds, related-by-tag).
 * Builds an inverted index from tags to entity ids and ranks tags by frequency.
 * Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

function allEntities(model: NexusModel): NexusEntity[] {
  const out: NexusEntity[] = [];
  for (const k of ALL_KINDS) out.push(...model.byKind(k));
  return out;
}

/** Inverted index: tag → entity ids that carry it. */
export function buildTagIndex(model: NexusModel): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const e of allEntities(model)) {
    for (const tag of e.tags ?? []) {
      const key = tag.toLowerCase();
      const list = index.get(key) ?? [];
      list.push(e.id);
      index.set(key, list);
    }
  }
  return index;
}

/** Entities carrying `tag`, most-recent first. */
export function entitiesByTag(model: NexusModel, tag: string): NexusEntity[] {
  const ids = new Set(buildTagIndex(model).get(tag.toLowerCase()) ?? []);
  return allEntities(model).filter((e) => ids.has(e.id)).sort((a, b) => b.ts - a.ts);
}

export interface TagCount { tag: string; count: number }

/** All tags ranked by how many entities use them (a tag cloud). */
export function tagCloud(model: NexusModel): TagCount[] {
  const index = buildTagIndex(model);
  return Array.from(index.entries())
    .map(([tag, ids]) => ({ tag, count: ids.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
