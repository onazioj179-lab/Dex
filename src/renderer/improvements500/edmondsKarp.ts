// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Edmonds-Karp maximum flow (BFS-based Ford-Fulkerson). O(V * E^2).
 * Capacity matrix is V x V; residual graph maintained internally.
 */

export interface EdmondsKarpResult {
  maxFlow: number;
  /** Flow matrix: flow[u][v] = flow sent from u to v (negative for reverse). */
  flow: number[][];
}

export function edmondsKarp(
  capacity: ReadonlyArray<ReadonlyArray<number>>,
  source: number,
  sink: number,
): EdmondsKarpResult {
  const n = capacity.length;
  if (source < 0 || source >= n || sink < 0 || sink >= n) {
    throw new RangeError('edmondsKarp: source/sink out of range');
  }
  const residual: number[][] = [];
  for (let i = 0; i < n; i += 1) residual.push(capacity[i]!.slice());
  const flow: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let total = 0;
  while (true) {
    // BFS to find augmenting path
    const parent = new Int32Array(n).fill(-1);
    parent[source] = source;
    const queue: number[] = [source];
    while (queue.length > 0 && parent[sink] === -1) {
      const u = queue.shift()!;
      for (let v = 0; v < n; v += 1) {
        if (parent[v] === -1 && residual[u]![v]! > 0) {
          parent[v] = u;
          if (v === sink) break;
          queue.push(v);
        }
      }
    }
    if (parent[sink] === -1) break;
    // Find bottleneck
    let bottleneck = Number.POSITIVE_INFINITY;
    for (let v = sink; v !== source; v = parent[v]!) {
      const u = parent[v]!;
      if (residual[u]![v]! < bottleneck) bottleneck = residual[u]![v]!;
    }
    for (let v = sink; v !== source; v = parent[v]!) {
      const u = parent[v]!;
      residual[u]![v] = residual[u]![v]! - bottleneck;
      residual[v]![u] = residual[v]![u]! + bottleneck;
      flow[u]![v] = flow[u]![v]! + bottleneck;
      flow[v]![u] = flow[v]![u]! - bottleneck;
    }
    total += bottleneck;
  }
  return { maxFlow: total, flow };
}
