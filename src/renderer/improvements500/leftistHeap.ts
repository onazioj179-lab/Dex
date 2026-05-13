// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface LhNode<T> {
  value: T;
  left: LhNode<T> | null;
  right: LhNode<T> | null;
  rank: number;
}

function rank<T>(n: LhNode<T> | null): number {
  return n ? n.rank : 0;
}

function merge<T>(a: LhNode<T> | null, b: LhNode<T> | null, cmp: (x: T, y: T) => number): LhNode<T> | null {
  if (!a) return b;
  if (!b) return a;
  if (cmp(a.value, b.value) > 0) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  const newRight = merge(a.right, b, cmp);
  let left = a.left;
  let right = newRight;
  if (rank(left) < rank(right)) {
    const t = left;
    left = right;
    right = t;
  }
  return { value: a.value, left, right, rank: rank(right) + 1 };
}

export class LeftistHeap<T> {
  private root: LhNode<T> | null = null;
  private _size = 0;
  private readonly cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
    this.cmp = cmp;
  }

  get size(): number {
    return this._size;
  }

  push(value: T): void {
    this.root = merge(this.root, { value, left: null, right: null, rank: 1 }, this.cmp);
    this._size++;
  }

  peek(): T | undefined {
    return this.root ? this.root.value : undefined;
  }

  pop(): T | undefined {
    if (!this.root) return undefined;
    const v = this.root.value;
    this.root = merge(this.root.left, this.root.right, this.cmp);
    this._size--;
    return v;
  }
}
