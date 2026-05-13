// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bellman-Ford single-source shortest paths. Handles negative edge
 * weights and detects negative cycles reachable from the source.
 */

export interface DirectedEdge {
  from: number;
  to: number;
  weight: number;
}

export interface BellmanFordResult {
  distance: Float64Array;
  predecessor: Int32Array;
  hasNegativeCycle: boolean;
}

export function bellmanFord(
  nodes: number,
  edges: ReadonlyArray<DirectedEdge>,
  source: number,
): BellmanFordResult {
  const distance = new Float64Array(nodes).fill(Infinity);
  const predecessor = new Int32Array(nodes).fill(-1);
  distance[source] = 0;
  for (let i = 0; i < nodes - 1; i += 1) {
    let updated = false;
    for (const e of edges) {
      if (distance[e.from]! + e.weight < distance[e.to]!) {
        distance[e.to] = distance[e.from]! + e.weight;
        predecessor[e.to] = e.from;
        updated = true;
      }
    }
    if (!updated) break;
  }
  let hasNegativeCycle = false;
  for (const e of edges) {
    if (distance[e.from]! + e.weight < distance[e.to]!) {
      hasNegativeCycle = true;
      break;
    }
  }
  return { distance, predecessor, hasNegativeCycle };
}
