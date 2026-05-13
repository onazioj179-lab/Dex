// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Topological sort via Kahn's algorithm. Returns null on cycle.
 * Edges given as adjacency list mapping node -> dependencies (predecessors).
 */

export interface TopoGraph {
  /** Total number of nodes, indexed 0..nodes-1. */
  nodes: number;
  /** Each entry is a list of nodes that must come AFTER this one (successors). */
  edges: ReadonlyArray<readonly number[]>;
}

export function topologicalSort(graph: TopoGraph): number[] | null {
  const { nodes, edges } = graph;
  if (edges.length !== nodes) throw new Error('edges length must equal nodes');
  const indegree = new Int32Array(nodes);
  for (let u = 0; u < nodes; u += 1) {
    for (const v of edges[u]!) {
      if (v < 0 || v >= nodes) throw new RangeError('edge target out of range');
      indegree[v] = indegree[v]! + 1;
    }
  }
  const queue: number[] = [];
  for (let i = 0; i < nodes; i += 1) if (indegree[i] === 0) queue.push(i);
  const order: number[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of edges[u]!) {
      indegree[v] = indegree[v]! - 1;
      if (indegree[v] === 0) queue.push(v);
    }
  }
  return order.length === nodes ? order : null;
}
