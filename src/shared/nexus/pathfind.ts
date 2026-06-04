// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus graph navigation — shortest path between two memory entities over the
 * relation graph (NEX). Powers "how is X connected to Y?" in the memory views.
 * BFS, so the first path found is a fewest-hops path. Pure: no DOM, no IO.
 */

import type { NexusModel } from './model';

/**
 * Fewest-hops path of entity ids from `fromId` to `toId` (inclusive), or null if
 * unreachable. Returns [fromId] when from === to.
 */
export function shortestPath(model: NexusModel, fromId: string, toId: string): string[] | null {
  if (!model.hasEntity(fromId) || !model.hasEntity(toId)) return null;
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  const prev = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const rel of model.relationsFrom(current)) {
      if (visited.has(rel.to)) continue;
      visited.add(rel.to);
      prev.set(rel.to, current);
      if (rel.to === toId) {
        // Reconstruct.
        const path = [toId];
        let node = toId;
        while (prev.has(node)) {
          node = prev.get(node)!;
          path.unshift(node);
        }
        return path;
      }
      queue.push(rel.to);
    }
  }
  return null;
}

/** Whether `toId` is reachable from `fromId`. */
export function isConnected(model: NexusModel, fromId: string, toId: string): boolean {
  return shortestPath(model, fromId, toId) !== null;
}

/** Number of hops between two entities, or -1 when unreachable. */
export function hopDistance(model: NexusModel, fromId: string, toId: string): number {
  const path = shortestPath(model, fromId, toId);
  return path ? path.length - 1 : -1;
}
