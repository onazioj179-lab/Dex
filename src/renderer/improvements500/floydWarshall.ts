// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Floyd-Warshall all-pairs shortest paths. O(V^3) time, O(V^2) memory.
 */

export interface FloydEdge {
  from: number;
  to: number;
  weight: number;
}

export interface FloydResult {
  distance: Float64Array; // flattened V*V
  next: Int32Array; // for path reconstruction
  size: number;
}

export function floydWarshall(nodes: number, edges: ReadonlyArray<FloydEdge>): FloydResult {
  const n = nodes;
  const distance = new Float64Array(n * n).fill(Infinity);
  const next = new Int32Array(n * n).fill(-1);
  for (let i = 0; i < n; i += 1) distance[i * n + i] = 0;
  for (const e of edges) {
    distance[e.from * n + e.to] = e.weight;
    next[e.from * n + e.to] = e.to;
  }
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      const dik = distance[i * n + k]!;
      if (dik === Infinity) continue;
      for (let j = 0; j < n; j += 1) {
        const dkj = distance[k * n + j]!;
        if (dkj === Infinity) continue;
        const through = dik + dkj;
        if (through < distance[i * n + j]!) {
          distance[i * n + j] = through;
          next[i * n + j] = next[i * n + k]!;
        }
      }
    }
  }
  return { distance, next, size: n };
}

export function floydPath(result: FloydResult, source: number, target: number): number[] {
  if (result.next[source * result.size + target]! === -1) return [];
  const path: number[] = [source];
  let cur = source;
  while (cur !== target) {
    cur = result.next[cur * result.size + target]!;
    if (cur === -1) return [];
    path.push(cur);
  }
  return path;
}
