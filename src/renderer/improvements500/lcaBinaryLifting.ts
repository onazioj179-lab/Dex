// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lowest Common Ancestor via binary lifting. O((n + q) log n).
 */

export class LcaBinaryLifting {
  private readonly LOG: number;
  private readonly up: Int32Array[];
  private readonly depth: Int32Array;

  constructor(adj: ReadonlyArray<readonly number[]>, root = 0) {
    const n = adj.length;
    this.depth = new Int32Array(n);
    this.LOG = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
    this.up = Array.from({ length: this.LOG }, () => new Int32Array(n).fill(-1));
    // Iterative DFS to fill depth + up[0]
    const stack: Array<[number, number]> = [[root, -1]];
    while (stack.length > 0) {
      const [u, p] = stack.pop()!;
      this.up[0]![u] = p;
      for (const v of adj[u]!) {
        if (v !== p) {
          this.depth[v] = this.depth[u]! + 1;
          stack.push([v, u]);
        }
      }
    }
    for (let k = 1; k < this.LOG; k += 1) {
      for (let v = 0; v < n; v += 1) {
        const mid = this.up[k - 1]![v]!;
        this.up[k]![v] = mid === -1 ? -1 : this.up[k - 1]![mid]!;
      }
    }
  }

  query(u: number, v: number): number {
    if (this.depth[u]! < this.depth[v]!) [u, v] = [v, u];
    let diff = this.depth[u]! - this.depth[v]!;
    for (let k = 0; k < this.LOG && diff > 0; k += 1) {
      if (diff & 1) u = this.up[k]![u]!;
      diff >>= 1;
    }
    if (u === v) return u;
    for (let k = this.LOG - 1; k >= 0; k -= 1) {
      if (this.up[k]![u]! !== this.up[k]![v]!) {
        u = this.up[k]![u]!;
        v = this.up[k]![v]!;
      }
    }
    return this.up[0]![u]!;
  }
}
