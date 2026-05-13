// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export class SegTree2D {
  private readonly rows: number;
  private readonly cols: number;
  private readonly t: Float64Array;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.t = new Float64Array(4 * rows * 4 * cols);
  }

  private idx(r: number, c: number): number {
    return r * (4 * this.cols) + c;
  }

  private updateY(nx: number, lx: number, rx: number, ny: number, ly: number, ry: number, x: number, y: number, v: number): void {
    if (ly === ry) {
      if (lx === rx) this.t[this.idx(nx, ny)] = v;
      else this.t[this.idx(nx, ny)] = this.t[this.idx(nx * 2, ny)] + this.t[this.idx(nx * 2 + 1, ny)];
      return;
    }
    const my = (ly + ry) >> 1;
    if (y <= my) this.updateY(nx, lx, rx, ny * 2, ly, my, x, y, v);
    else this.updateY(nx, lx, rx, ny * 2 + 1, my + 1, ry, x, y, v);
    this.t[this.idx(nx, ny)] = this.t[this.idx(nx, ny * 2)] + this.t[this.idx(nx, ny * 2 + 1)];
  }

  private updateX(nx: number, lx: number, rx: number, x: number, y: number, v: number): void {
    if (lx !== rx) {
      const mx = (lx + rx) >> 1;
      if (x <= mx) this.updateX(nx * 2, lx, mx, x, y, v);
      else this.updateX(nx * 2 + 1, mx + 1, rx, x, y, v);
    }
    this.updateY(nx, lx, rx, 1, 0, this.cols - 1, x, y, v);
  }

  update(r: number, c: number, value: number): void {
    if (this.rows === 0 || this.cols === 0) return;
    this.updateX(1, 0, this.rows - 1, r, c, value);
  }

  private queryY(nx: number, ny: number, ly: number, ry: number, l: number, r: number): number {
    if (r < ly || ry < l) return 0;
    if (l <= ly && ry <= r) return this.t[this.idx(nx, ny)];
    const my = (ly + ry) >> 1;
    return this.queryY(nx, ny * 2, ly, my, l, r) + this.queryY(nx, ny * 2 + 1, my + 1, ry, l, r);
  }

  private queryX(nx: number, lx: number, rx: number, lr: number, rr: number, lc: number, rc: number): number {
    if (rr < lx || rx < lr) return 0;
    if (lr <= lx && rx <= rr) return this.queryY(nx, 1, 0, this.cols - 1, lc, rc);
    const mx = (lx + rx) >> 1;
    return (
      this.queryX(nx * 2, lx, mx, lr, rr, lc, rc) +
      this.queryX(nx * 2 + 1, mx + 1, rx, lr, rr, lc, rc)
    );
  }

  rangeSum(r1: number, c1: number, r2: number, c2: number): number {
    if (this.rows === 0 || this.cols === 0) return 0;
    return this.queryX(1, 0, this.rows - 1, r1, r2, c1, c2);
  }
}
