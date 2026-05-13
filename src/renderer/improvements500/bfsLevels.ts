// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * BFS layering - assign every reachable node a level (distance in
 * edges) from a source. Returns Int32Array of distances; -1 means
 * unreachable.
 */

export function bfsLevels(
  graph: ReadonlyArray<readonly number[]>,
  source: number,
): Int32Array {
  const n = graph.length;
  const dist = new Int32Array(n).fill(-1);
  if (source < 0 || source >= n) return dist;
  dist[source] = 0;
  let head = 0;
  const queue: number[] = [source];
  while (head < queue.length) {
    const u = queue[head]!;
    head += 1;
    for (const v of graph[u]!) {
      if (dist[v] === -1) {
        dist[v] = dist[u]! + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

/** Group nodes by BFS level - returns array indexed by level. */
export function bfsLayers(
  graph: ReadonlyArray<readonly number[]>,
  source: number,
): number[][] {
  const dist = bfsLevels(graph, source);
  const layers: number[][] = [];
  for (let i = 0; i < dist.length; i += 1) {
    const d = dist[i]!;
    if (d < 0) continue;
    while (layers.length <= d) layers.push([]);
    layers[d]!.push(i);
  }
  return layers;
}
