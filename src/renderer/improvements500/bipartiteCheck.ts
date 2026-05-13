// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bipartite check via 2-coloring BFS. Returns the color array
 * (0 or 1 per vertex, -1 for unreached) when the graph is bipartite,
 * or null if any odd cycle is found. Operates on undirected graph.
 */

export function bipartiteCheck(graph: ReadonlyArray<readonly number[]>): Int8Array | null {
  const n = graph.length;
  const color = new Int8Array(n).fill(-1);
  for (let s = 0; s < n; s += 1) {
    if (color[s] !== -1) continue;
    color[s] = 0;
    const queue: number[] = [s];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const v of graph[u]!) {
        if (color[v] === -1) {
          color[v] = (color[u]! ^ 1) as 0 | 1;
          queue.push(v);
        } else if (color[v] === color[u]) {
          return null;
        }
      }
    }
  }
  return color;
}
