// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Dijkstra's shortest-path algorithm on weighted graphs with non-negative
 * edge weights. Returns distance and predecessor arrays from source.
 */

export interface WeightedEdge {
  to: number;
  weight: number;
}

export interface DijkstraResult {
  distance: Float64Array;
  predecessor: Int32Array;
}

/** Min-heap optimized over (priority, value) pairs. */
class MinPQ {
  private readonly heap: Array<{ p: number; v: number }> = [];

  push(p: number, v: number): void {
    this.heap.push({ p, v });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent]!.p <= this.heap[i]!.p) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!];
      i = parent;
    }
  }

  pop(): { p: number; v: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      while (true) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < n && this.heap[l]!.p < this.heap[smallest]!.p) smallest = l;
        if (r < n && this.heap[r]!.p < this.heap[smallest]!.p) smallest = r;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i]!, this.heap[smallest]!];
        i = smallest;
      }
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }
}

export function dijkstra(
  graph: ReadonlyArray<readonly WeightedEdge[]>,
  source: number,
): DijkstraResult {
  const n = graph.length;
  if (source < 0 || source >= n) throw new RangeError('source out of range');
  const distance = new Float64Array(n).fill(Infinity);
  const predecessor = new Int32Array(n).fill(-1);
  distance[source] = 0;
  const pq = new MinPQ();
  pq.push(0, source);
  while (pq.size > 0) {
    const { p, v } = pq.pop()!;
    if (p > distance[v]!) continue;
    for (const e of graph[v]!) {
      if (e.weight < 0) throw new Error('Dijkstra requires non-negative edge weights');
      const nd = p + e.weight;
      if (nd < distance[e.to]!) {
        distance[e.to] = nd;
        predecessor[e.to] = v;
        pq.push(nd, e.to);
      }
    }
  }
  return { distance, predecessor };
}

/** Reconstruct shortest path from source -> target using predecessor array. */
export function reconstructPath(predecessor: Int32Array, source: number, target: number): number[] {
  const path: number[] = [];
  let cur = target;
  while (cur !== -1 && cur !== source) {
    path.push(cur);
    cur = predecessor[cur]!;
  }
  if (cur === -1) return [];
  path.push(source);
  path.reverse();
  return path;
}
