// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Eulerian path / circuit detection and construction via Hierholzer's
 * algorithm. Works on undirected multigraphs given as adjacency lists
 * with edge IDs (so duplicate edges are tracked individually).
 */

export interface UndirectedEdge {
  u: number;
  v: number;
}

export interface EulerianResult {
  exists: boolean;
  /** Sequence of node IDs visited; empty if not exists. */
  path: number[];
  /** True if the path forms a circuit (start === end). */
  isCircuit: boolean;
}

export function eulerianPath(nodes: number, edges: ReadonlyArray<UndirectedEdge>): EulerianResult {
  const m = edges.length;
  if (m === 0) return { exists: true, path: nodes > 0 ? [0] : [], isCircuit: true };
  const adj: Array<Array<{ to: number; id: number }>> = [];
  for (let i = 0; i < nodes; i += 1) adj.push([]);
  const degree = new Int32Array(nodes);
  for (let i = 0; i < m; i += 1) {
    const e = edges[i]!;
    adj[e.u]!.push({ to: e.v, id: i });
    adj[e.v]!.push({ to: e.u, id: i });
    degree[e.u] = degree[e.u]! + 1;
    degree[e.v] = degree[e.v]! + 1;
  }
  const odd: number[] = [];
  for (let i = 0; i < nodes; i += 1) if (degree[i]! % 2 === 1) odd.push(i);
  if (odd.length !== 0 && odd.length !== 2) {
    return { exists: false, path: [], isCircuit: false };
  }
  let start = 0;
  if (odd.length === 2) start = odd[0]!;
  else {
    for (let i = 0; i < nodes; i += 1) {
      if (degree[i]! > 0) {
        start = i;
        break;
      }
    }
  }
  const used = new Uint8Array(m);
  const it = new Int32Array(nodes);
  const stack: number[] = [start];
  const path: number[] = [];
  while (stack.length > 0) {
    const v = stack[stack.length - 1]!;
    while (it[v]! < adj[v]!.length && used[adj[v]![it[v]!]!.id]) it[v] = it[v]! + 1;
    if (it[v]! === adj[v]!.length) {
      path.push(v);
      stack.pop();
    } else {
      const next = adj[v]![it[v]!]!;
      used[next.id] = 1;
      it[v] = it[v]! + 1;
      stack.push(next.to);
    }
  }
  // Need to use every edge for an Eulerian path
  for (let i = 0; i < m; i += 1) {
    if (!used[i]) return { exists: false, path: [], isCircuit: false };
  }
  path.reverse();
  return { exists: true, path, isCircuit: odd.length === 0 };
}
