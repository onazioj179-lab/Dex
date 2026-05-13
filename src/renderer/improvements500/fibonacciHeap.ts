// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface FibNode<T> {
  key: T;
  degree: number;
  parent: FibNode<T> | null;
  child: FibNode<T> | null;
  left: FibNode<T>;
  right: FibNode<T>;
  marked: boolean;
}

export class FibonacciHeap<T> {
  private min: FibNode<T> | null = null;
  private _size = 0;
  private readonly cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
    this.cmp = cmp;
  }

  get size(): number {
    return this._size;
  }

  push(key: T): void {
    const node: FibNode<T> = {
      key,
      degree: 0,
      parent: null,
      child: null,
      left: null as unknown as FibNode<T>,
      right: null as unknown as FibNode<T>,
      marked: false,
    };
    node.left = node;
    node.right = node;
    this.min = this.mergeRootLists(this.min, node);
    this._size++;
  }

  peek(): T | undefined {
    return this.min ? this.min.key : undefined;
  }

  private mergeRootLists(a: FibNode<T> | null, b: FibNode<T> | null): FibNode<T> | null {
    if (!a) return b;
    if (!b) return a;
    const aRight = a.right;
    a.right = b.right;
    b.right.left = a;
    b.right = aRight;
    aRight.left = b;
    return this.cmp(a.key, b.key) <= 0 ? a : b;
  }

  pop(): T | undefined {
    const z = this.min;
    if (!z) return undefined;
    if (z.child) {
      let c = z.child;
      do {
        c.parent = null;
        c = c.right;
      } while (c !== z.child);
      this.min = this.mergeRootLists(z, z.child);
    }
    z.left.right = z.right;
    z.right.left = z.left;
    if (z === z.right) {
      this.min = null;
    } else {
      this.min = z.right;
      this.consolidate();
    }
    this._size--;
    return z.key;
  }

  private consolidate(): void {
    if (!this.min) return;
    const A: Array<FibNode<T> | null> = [];
    const roots: FibNode<T>[] = [];
    let cur = this.min;
    do {
      roots.push(cur);
      cur = cur.right;
    } while (cur !== this.min);
    for (let w of roots) {
      let x = w;
      let d = x.degree;
      while (A[d]) {
        let y = A[d]!;
        if (this.cmp(x.key, y.key) > 0) {
          const tmp = x;
          x = y;
          y = tmp;
        }
        // link y under x
        y.left.right = y.right;
        y.right.left = y.left;
        y.parent = x;
        if (!x.child) {
          y.left = y;
          y.right = y;
          x.child = y;
        } else {
          y.left = x.child;
          y.right = x.child.right;
          x.child.right.left = y;
          x.child.right = y;
        }
        x.degree++;
        y.marked = false;
        A[d] = null;
        d++;
      }
      A[d] = x;
    }
    this.min = null;
    for (const node of A) {
      if (!node) continue;
      node.left = node;
      node.right = node;
      this.min = this.mergeRootLists(this.min, node);
    }
  }
}
