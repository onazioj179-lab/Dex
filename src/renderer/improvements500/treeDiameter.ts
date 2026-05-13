// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tree diameter and center via two-pass BFS. Diameter is the longest
 * path between any two nodes. Tree must be connected and acyclic.
 */

export interface TreeDiameterResult {
  /** Length (in edges) of the longest path. */
  diameter: number;
  /** Endpoints of the diameter path. */
  endpoints: [number, number];
  /** Center node(s) of the tree (one or two). */
  centers: number[];
}

function farthestBfs(graph: ReadonlyArray<readonly number[]>, start: number): {
  node: number;
  dist: number;
  parent: Int32Array;
} {
  const n = graph.length;
  const dist = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const queue: number[] = [start];
  dist[start] = 0;
  let farthest = start;
  let maxDist = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of graph[u]!) {
      if (dist[v] === -1) {
        dist[v] = dist[u]! + 1;
        parent[v] = u;
        if (dist[v]! > maxDist) {
          maxDist = dist[v]!;
          farthest = v;
        }
        queue.push(v);
      }
    }
  }
  return { node: farthest, dist: maxDist, parent };
}

export function treeDiameter(graph: ReadonlyArray<readonly number[]>): TreeDiameterResult {
  if (graph.length === 0) return { diameter: 0, endpoints: [-1, -1], centers: [] };
  const a = farthestBfs(graph, 0).node;
  const b = farthestBfs(graph, a);
  // Reconstruct path
  const path: number[] = [];
  for (let cur = b.node; cur !== -1; cur = b.parent[cur]!) path.push(cur);
  const center1 = path[path.length >> 1]!;
  const centers = path.length % 2 === 0 ? [path[(path.length >> 1) - 1]!, center1] : [center1];
  return { diameter: b.dist, endpoints: [a, b.node], centers };
}
