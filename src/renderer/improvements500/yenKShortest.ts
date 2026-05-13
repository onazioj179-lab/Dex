// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface YenEdge {
  to: number;
  weight: number;
}

export interface YenPath {
  nodes: number[];
  cost: number;
}

function dijkstra(
  graph: ReadonlyArray<ReadonlyArray<YenEdge>>,
  src: number,
  dst: number,
  removedEdges: Set<string>,
  removedNodes: Set<number>,
): YenPath | null {
  const n = graph.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  dist[src] = 0;
  const visited = new Uint8Array(n);
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best && !removedNodes.has(i)) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    visited[u] = 1;
    if (u === dst) break;
    for (const e of graph[u]) {
      if (removedNodes.has(e.to)) continue;
      if (removedEdges.has(`${u},${e.to}`)) continue;
      const nd = dist[u] + e.weight;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
      }
    }
  }
  if (!isFinite(dist[dst])) return null;
  const nodes: number[] = [];
  let cur = dst;
  while (cur !== -1) {
    nodes.push(cur);
    cur = prev[cur];
  }
  nodes.reverse();
  return { nodes, cost: dist[dst] };
}

export function yenKShortest(
  graph: ReadonlyArray<ReadonlyArray<YenEdge>>,
  src: number,
  dst: number,
  k: number,
): YenPath[] {
  const result: YenPath[] = [];
  const first = dijkstra(graph, src, dst, new Set(), new Set());
  if (!first) return result;
  result.push(first);
  const candidates: YenPath[] = [];
  for (let i = 1; i < k; i++) {
    const prev = result[i - 1];
    for (let j = 0; j < prev.nodes.length - 1; j++) {
      const spurNode = prev.nodes[j];
      const rootPath = prev.nodes.slice(0, j + 1);
      const removedEdges = new Set<string>();
      const removedNodes = new Set<number>();
      for (const p of result) {
        if (p.nodes.length > j && rootPath.every((v, idx) => v === p.nodes[idx])) {
          removedEdges.add(`${p.nodes[j]},${p.nodes[j + 1]}`);
        }
      }
      for (let r = 0; r < rootPath.length - 1; r++) removedNodes.add(rootPath[r]);
      const spur = dijkstra(graph, spurNode, dst, removedEdges, removedNodes);
      if (spur) {
        const nodes = rootPath.slice(0, -1).concat(spur.nodes);
        let cost = 0;
        for (let r = 0; r < nodes.length - 1; r++) {
          const e = graph[nodes[r]].find((x) => x.to === nodes[r + 1]);
          if (!e) {
            cost = Number.POSITIVE_INFINITY;
            break;
          }
          cost += e.weight;
        }
        if (isFinite(cost)) candidates.push({ nodes, cost });
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.cost - b.cost);
    const next = candidates.shift()!;
    result.push(next);
  }
  return result;
}
