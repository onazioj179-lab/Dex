// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus entity search (NEX-008). Fuzzy-searches the `NexusModel` across all
 * memory entities (label + tags), optionally scoped to a kind, so the memory-
 * first views and the unified search's Nexus provider share one ranking. Reuses
 * the existing `fuzzyMatch` from the command registry. Pure: no DOM, no IO.
 */

import { fuzzyMatch } from '../commands/registry';
import type { NexusModel, NexusEntity, NexusEntityKind } from './model';

export interface NexusSearchHit {
  entity: NexusEntity;
  score: number;
}

export interface NexusSearchOptions {
  kind?: NexusEntityKind;
  limit?: number;
  /** Recency tie-break weight applied to the fuzzy score. Default small. */
  recencyWeight?: number;
}

/**
 * Search entities by query. Ranks by fuzzy relevance over "label + tags", with
 * a light recency nudge so equally-relevant newer items sort first. Empty query
 * returns the most-recent entities (optionally of one kind).
 */
export function searchEntities(
  model: NexusModel,
  query: string,
  opts: NexusSearchOptions = {},
): NexusSearchHit[] {
  const limit = opts.limit ?? 20;
  const recencyWeight = opts.recencyWeight ?? 1e-9;
  const q = query.trim();

  const KINDS: NexusEntityKind[] =
    opts.kind ? [opts.kind]
              : ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

  const all: NexusEntity[] = [];
  for (const k of KINDS) all.push(...model.byKind(k));

  if (!q) {
    return all
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit)
      .map((entity) => ({ entity, score: 1 }));
  }

  const hits: NexusSearchHit[] = [];
  for (const entity of all) {
    const hay = `${entity.label} ${(entity.tags ?? []).join(' ')}`;
    const base = fuzzyMatch(hay, q);
    if (base > 0) hits.push({ entity, score: base + entity.ts * recencyWeight });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
