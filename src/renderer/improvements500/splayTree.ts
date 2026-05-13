// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface SplayNode<T> {
  key: T;
  left: SplayNode<T> | null;
  right: SplayNode<T> | null;
  parent: SplayNode<T> | null;
}

export class SplayTree<T> {
  private root: SplayNode<T> | null = null;
  private _size = 0;
  private readonly cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
    this.cmp = cmp;
  }

  get size(): number {
    return this._size;
  }

  private rotate(x: SplayNode<T>): void {
    const p = x.parent!;
    const g = p.parent;
    if (p.left === x) {
      p.left = x.right;
      if (x.right) x.right.parent = p;
      x.right = p;
    } else {
      p.right = x.left;
      if (x.left) x.left.parent = p;
      x.left = p;
    }
    p.parent = x;
    x.parent = g;
    if (g) {
      if (g.left === p) g.left = x;
      else g.right = x;
    }
  }

  private splay(x: SplayNode<T>): void {
    while (x.parent) {
      const p = x.parent;
      const g = p.parent;
      if (g) {
        if ((g.left === p) === (p.left === x)) this.rotate(p);
        else this.rotate(x);
      }
      this.rotate(x);
    }
    this.root = x;
  }

  insert(key: T): void {
    if (!this.root) {
      this.root = { key, left: null, right: null, parent: null };
      this._size++;
      return;
    }
    let cur = this.root;
    while (true) {
      const c = this.cmp(key, cur.key);
      if (c === 0) {
        this.splay(cur);
        return;
      }
      if (c < 0) {
        if (!cur.left) {
          cur.left = { key, left: null, right: null, parent: cur };
          this._size++;
          this.splay(cur.left);
          return;
        }
        cur = cur.left;
      } else {
        if (!cur.right) {
          cur.right = { key, left: null, right: null, parent: cur };
          this._size++;
          this.splay(cur.right);
          return;
        }
        cur = cur.right;
      }
    }
  }

  contains(key: T): boolean {
    let cur = this.root;
    let last: SplayNode<T> | null = null;
    while (cur) {
      last = cur;
      const c = this.cmp(key, cur.key);
      if (c === 0) {
        this.splay(cur);
        return true;
      }
      cur = c < 0 ? cur.left : cur.right;
    }
    if (last) this.splay(last);
    return false;
  }
}
