// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export class Fenwick2D {
  private readonly rows: number;
  private readonly cols: number;
  private readonly t: Float64Array;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.t = new Float64Array((rows + 1) * (cols + 1));
  }

  update(r: number, c: number, delta: number): void {
    for (let i = r + 1; i <= this.rows; i += i & -i) {
      for (let j = c + 1; j <= this.cols; j += j & -j) {
        this.t[i * (this.cols + 1) + j] += delta;
      }
    }
  }

  private prefix(r: number, c: number): number {
    let s = 0;
    for (let i = r; i > 0; i -= i & -i) {
      for (let j = c; j > 0; j -= j & -j) {
        s += this.t[i * (this.cols + 1) + j];
      }
    }
    return s;
  }

  rangeSum(r1: number, c1: number, r2: number, c2: number): number {
    return (
      this.prefix(r2 + 1, c2 + 1) -
      this.prefix(r1, c2 + 1) -
      this.prefix(r2 + 1, c1) +
      this.prefix(r1, c1)
    );
  }
}
