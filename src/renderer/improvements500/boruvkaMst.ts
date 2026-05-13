// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface BoruvkaEdge {
  u: number;
  v: number;
  weight: number;
}

class DSU {
  parent: Int32Array;
  rank: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    a = this.find(a);
    b = this.find(b);
    if (a === b) return false;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
    return true;
  }
}

export function boruvkaMst(n: number, edges: ReadonlyArray<BoruvkaEdge>): { mst: BoruvkaEdge[]; cost: number } {
  const dsu = new DSU(n);
  const mst: BoruvkaEdge[] = [];
  let cost = 0;
  let components = n;
  while (components > 1) {
    const cheapest = new Int32Array(n).fill(-1);
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const ru = dsu.find(e.u);
      const rv = dsu.find(e.v);
      if (ru === rv) continue;
      if (cheapest[ru] === -1 || edges[cheapest[ru]].weight > e.weight) cheapest[ru] = i;
      if (cheapest[rv] === -1 || edges[cheapest[rv]].weight > e.weight) cheapest[rv] = i;
    }
    let added = false;
    for (let v = 0; v < n; v++) {
      const idx = cheapest[v];
      if (idx === -1) continue;
      const e = edges[idx];
      if (dsu.union(e.u, e.v)) {
        mst.push(e);
        cost += e.weight;
        components--;
        added = true;
      }
    }
    if (!added) break;
  }
  return { mst, cost };
}
