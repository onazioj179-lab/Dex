// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Kruskal's algorithm for minimum spanning tree using union-find.
 * O(E log E) - sorts edges, then unions until V-1 edges are added.
 */

import type { MstEdge, MstResult } from './primMst';

class DSU {
  private parent: Int32Array;
  private rank: Uint16Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Uint16Array(n);
    for (let i = 0; i < n; i += 1) this.parent[i] = i;
  }
  find(x: number): number {
    let r = x;
    while (this.parent[r]! !== r) r = this.parent[r]!;
    let cur = x;
    while (this.parent[cur]! !== r) {
      const nxt = this.parent[cur]!;
      this.parent[cur] = r;
      cur = nxt;
    }
    return r;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra]! < this.rank[rb]!) this.parent[ra] = rb;
    else if (this.rank[ra]! > this.rank[rb]!) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra] = this.rank[ra]! + 1;
    }
    return true;
  }
}

export function kruskalMst(nodes: number, edges: ReadonlyArray<MstEdge>): MstResult {
  const sorted = edges.slice().sort((a, b) => a.weight - b.weight);
  const dsu = new DSU(nodes);
  const result: MstEdge[] = [];
  let total = 0;
  for (const e of sorted) {
    if (dsu.union(e.u, e.v)) {
      result.push(e);
      total += e.weight;
      if (result.length === nodes - 1) break;
    }
  }
  return { edges: result, totalWeight: total };
}
