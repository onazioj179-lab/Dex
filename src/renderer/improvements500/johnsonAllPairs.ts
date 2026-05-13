// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface JohnsonEdge {
  to: number;
  weight: number;
}

function bellmanFord(
  graph: ReadonlyArray<ReadonlyArray<JohnsonEdge>>,
  n: number,
): Float64Array | null {
  const dist = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    for (let u = 0; u < n; u++) {
      for (const e of graph[u]) {
        if (dist[u] + e.weight < dist[e.to]) dist[e.to] = dist[u] + e.weight;
      }
    }
    for (let v = 0; v < n; v++) {
      if (dist[n] + 0 < dist[v]) dist[v] = dist[n];
    }
  }
  for (let u = 0; u < n; u++) {
    for (const e of graph[u]) {
      if (dist[u] + e.weight < dist[e.to]) return null;
    }
  }
  return dist.slice(0, n);
}

function dijkstraPositive(
  graph: ReadonlyArray<ReadonlyArray<JohnsonEdge>>,
  src: number,
): Float64Array {
  const n = graph.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  dist[src] = 0;
  const visited = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[j] < best) {
        best = dist[j];
        u = j;
      }
    }
    if (u === -1) break;
    visited[u] = 1;
    for (const e of graph[u]) {
      const nd = dist[u] + e.weight;
      if (nd < dist[e.to]) dist[e.to] = nd;
    }
  }
  return dist;
}

export function johnsonAllPairs(
  graph: ReadonlyArray<ReadonlyArray<JohnsonEdge>>,
): Float64Array[] | null {
  const n = graph.length;
  const h = bellmanFord(graph, n);
  if (!h) return null;
  const reweighted: JohnsonEdge[][] = graph.map((edges, u) =>
    edges.map((e) => ({ to: e.to, weight: e.weight + h[u] - h[e.to] })),
  );
  const result: Float64Array[] = [];
  for (let s = 0; s < n; s++) {
    const d = dijkstraPositive(reweighted, s);
    for (let v = 0; v < n; v++) {
      if (isFinite(d[v])) d[v] = d[v] - h[s] + h[v];
    }
    result.push(d);
  }
  return result;
}
