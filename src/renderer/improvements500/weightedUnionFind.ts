// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Weighted union-find with path compression. Returns connected components
 * after a sequence of union operations.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class WeightedUnionFind {
  private parent: Int32Array;
  private size: Int32Array;
  private componentCount: number;

  constructor(n: number) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('WeightedUnionFind: n must be a non-negative integer');
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      this.parent[i] = i;
      this.size[i] = 1;
    }
    this.componentCount = n;
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!;
      x = this.parent[x]!;
    }
    return x;
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra]! < this.size[rb]!) {
      this.parent[ra] = rb;
      this.size[rb] = this.size[rb]! + this.size[ra]!;
    } else {
      this.parent[rb] = ra;
      this.size[ra] = this.size[ra]! + this.size[rb]!;
    }
    this.componentCount--;
    return true;
  }

  components(): number {
    return this.componentCount;
  }

  componentSize(x: number): number {
    return this.size[this.find(x)]!;
  }
}
