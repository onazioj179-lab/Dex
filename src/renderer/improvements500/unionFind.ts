// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Union-Find (Disjoint Set Union) with path compression and union by rank.
 */

export class UnionFind {
  private readonly parent: Int32Array;
  private readonly rank: Uint16Array;
  private components_: number;

  constructor(size: number) {
    if (size < 0) throw new Error('size must be non-negative');
    this.parent = new Int32Array(size);
    this.rank = new Uint16Array(size);
    this.components_ = size;
    for (let i = 0; i < size; i += 1) this.parent[i] = i;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root]! !== root) root = this.parent[root]!;
    // Path compression.
    let cur = x;
    while (this.parent[cur]! !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra]! < this.rank[rb]!) {
      this.parent[ra] = rb;
    } else if (this.rank[ra]! > this.rank[rb]!) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra] = this.rank[ra]! + 1;
    }
    this.components_ -= 1;
    return true;
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  get components(): number {
    return this.components_;
  }
}
