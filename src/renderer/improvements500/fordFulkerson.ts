// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Edmonds-Karp implementation of Ford-Fulkerson max-flow on a directed
 * capacitated graph. Uses BFS to find augmenting paths; runs in
 * O(V * E^2).
 */

export interface FlowEdge {
  from: number;
  to: number;
  capacity: number;
}

interface ResidualEdge {
  to: number;
  capacity: number;
  flow: number;
  index: number; // index of the reverse edge in adj[to]
}

/** Returns max flow from `source` to `sink` in `nodes`-vertex graph. */
export function fordFulkerson(
  nodes: number,
  edges: ReadonlyArray<FlowEdge>,
  source: number,
  sink: number,
): number {
  const adj: ResidualEdge[][] = [];
  for (let i = 0; i < nodes; i += 1) adj.push([]);
  for (const e of edges) {
    if (e.capacity < 0) throw new Error('negative capacity not allowed');
    adj[e.from]!.push({ to: e.to, capacity: e.capacity, flow: 0, index: adj[e.to]!.length });
    adj[e.to]!.push({ to: e.from, capacity: 0, flow: 0, index: adj[e.from]!.length - 1 });
  }
  let totalFlow = 0;
  for (;;) {
    // BFS to find shortest augmenting path
    const parentNode = new Int32Array(nodes).fill(-1);
    const parentEdge = new Int32Array(nodes).fill(-1);
    parentNode[source] = source;
    const queue: number[] = [source];
    while (queue.length > 0 && parentNode[sink] === -1) {
      const u = queue.shift()!;
      const list = adj[u]!;
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i]!;
        if (parentNode[e.to] === -1 && e.capacity - e.flow > 0) {
          parentNode[e.to] = u;
          parentEdge[e.to] = i;
          if (e.to === sink) break;
          queue.push(e.to);
        }
      }
    }
    if (parentNode[sink] === -1) break;
    // Find bottleneck capacity
    let bottleneck = Infinity;
    let v = sink;
    while (v !== source) {
      const u = parentNode[v]!;
      const e = adj[u]![parentEdge[v]!]!;
      bottleneck = Math.min(bottleneck, e.capacity - e.flow);
      v = u;
    }
    // Augment along path
    v = sink;
    while (v !== source) {
      const u = parentNode[v]!;
      const e = adj[u]![parentEdge[v]!]!;
      e.flow += bottleneck;
      adj[v]![e.index]!.flow -= bottleneck;
      v = u;
    }
    totalFlow += bottleneck;
  }
  return totalFlow;
}
