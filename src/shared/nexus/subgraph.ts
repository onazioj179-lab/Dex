// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus neighborhood / subgraph extraction (NEX — focus view, "show me what's
 * around this"). BFS out from a center entity up to `hops` away over the relation
 * graph. Pure: no DOM, no IO.
 */

import type { NexusModel } from './model';

export interface NeighborNode {
  id: string;
  /** Hop distance from the center (0 = center). */
  depth: number;
}

/**
 * Ids within `hops` of `centerId` (BFS). Includes the center at depth 0. Empty
 * when the center is unknown.
 */
export function neighborhood(model: NexusModel, centerId: string, hops = 1): NeighborNode[] {
  if (!model.hasEntity(centerId) || hops < 0) return [];
  const out: NeighborNode[] = [{ id: centerId, depth: 0 }];
  const visited = new Set<string>([centerId]);
  let frontier = [centerId];

  for (let depth = 1; depth <= hops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const rel of model.relationsFrom(id)) {
        if (visited.has(rel.to)) continue;
        if (!model.hasEntity(rel.to)) continue;
        visited.add(rel.to);
        out.push({ id: rel.to, depth });
        next.push(rel.to);
      }
    }
    frontier = next;
  }
  return out;
}

/** Just the neighbor ids (excluding the center). */
export function neighborIds(model: NexusModel, centerId: string, hops = 1): string[] {
  return neighborhood(model, centerId, hops).filter((n) => n.depth > 0).map((n) => n.id);
}

/** Count of entities within `hops` of the center (excluding the center). */
export function neighborhoodSize(model: NexusModel, centerId: string, hops = 1): number {
  return neighborIds(model, centerId, hops).length;
}
