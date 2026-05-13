// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Prim's algorithm for minimum spanning tree on undirected weighted
 * graphs. O((V+E) log V) with binary heap.
 */

export interface MstEdge {
  u: number;
  v: number;
  weight: number;
}

interface HeapItem {
  node: number;
  weight: number;
  via: number; // edge endpoint we came from
}

class MinHeap {
  private heap: HeapItem[] = [];
  push(item: HeapItem): void {
    this.heap.push(item);
    this.up(this.heap.length - 1);
  }
  pop(): HeapItem | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.down(0);
    }
    return top;
  }
  get size(): number {
    return this.heap.length;
  }
  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p]!.weight <= this.heap[i]!.weight) break;
      [this.heap[p], this.heap[i]] = [this.heap[i]!, this.heap[p]!];
      i = p;
    }
  }
  private down(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let s = i;
      if (l < n && this.heap[l]!.weight < this.heap[s]!.weight) s = l;
      if (r < n && this.heap[r]!.weight < this.heap[s]!.weight) s = r;
      if (s === i) break;
      [this.heap[s], this.heap[i]] = [this.heap[i]!, this.heap[s]!];
      i = s;
    }
  }
}

export interface MstResult {
  edges: MstEdge[];
  totalWeight: number;
}

export function primMst(nodes: number, edges: ReadonlyArray<MstEdge>): MstResult {
  if (nodes === 0) return { edges: [], totalWeight: 0 };
  const adj: Array<Array<{ to: number; weight: number }>> = [];
  for (let i = 0; i < nodes; i += 1) adj.push([]);
  for (const e of edges) {
    adj[e.u]!.push({ to: e.v, weight: e.weight });
    adj[e.v]!.push({ to: e.u, weight: e.weight });
  }
  const inMst = new Uint8Array(nodes);
  const heap = new MinHeap();
  inMst[0] = 1;
  for (const n of adj[0]!) heap.push({ node: n.to, weight: n.weight, via: 0 });
  const result: MstEdge[] = [];
  let total = 0;
  while (heap.size > 0 && result.length < nodes - 1) {
    const top = heap.pop()!;
    if (inMst[top.node]) continue;
    inMst[top.node] = 1;
    result.push({ u: top.via, v: top.node, weight: top.weight });
    total += top.weight;
    for (const n of adj[top.node]!) {
      if (!inMst[n.to]) heap.push({ node: n.to, weight: n.weight, via: top.node });
    }
  }
  return { edges: result, totalWeight: total };
}
