// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Implicit treap (a.k.a. "treap by size"). Stores a sequence with
 * O(log n) split, merge, insertAt, removeAt, and indexed access.
 * Random priorities keep the tree balanced in expectation.
 */

interface ITNode<T> {
  value: T;
  priority: number;
  size: number;
  left: ITNode<T> | null;
  right: ITNode<T> | null;
}

function sizeOf<T>(n: ITNode<T> | null): number {
  return n ? n.size : 0;
}

function update<T>(n: ITNode<T>): void {
  n.size = 1 + sizeOf(n.left) + sizeOf(n.right);
}

function makeNode<T>(value: T): ITNode<T> {
  return { value, priority: Math.random(), size: 1, left: null, right: null };
}

function merge<T>(a: ITNode<T> | null, b: ITNode<T> | null): ITNode<T> | null {
  if (!a) return b;
  if (!b) return a;
  if (a.priority > b.priority) {
    a.right = merge(a.right, b);
    update(a);
    return a;
  }
  b.left = merge(a, b.left);
  update(b);
  return b;
}

function split<T>(n: ITNode<T> | null, k: number): [ITNode<T> | null, ITNode<T> | null] {
  if (!n) return [null, null];
  const leftSize = sizeOf(n.left);
  if (k <= leftSize) {
    const [l, r] = split(n.left, k);
    n.left = r;
    update(n);
    return [l, n];
  }
  const [l, r] = split(n.right, k - leftSize - 1);
  n.right = l;
  update(n);
  return [n, r];
}

export class ImplicitTreap<T> {
  private root: ITNode<T> | null = null;

  get size(): number {
    return sizeOf(this.root);
  }

  insertAt(index: number, value: T): void {
    const [l, r] = split(this.root, index);
    this.root = merge(merge(l, makeNode(value)), r);
  }

  removeAt(index: number): T | undefined {
    const [l, r] = split(this.root, index);
    const [m, rr] = split(r, 1);
    this.root = merge(l, rr);
    return m ? m.value : undefined;
  }

  at(index: number): T | undefined {
    let cur = this.root;
    while (cur) {
      const leftSize = sizeOf(cur.left);
      if (index < leftSize) cur = cur.left;
      else if (index === leftSize) return cur.value;
      else {
        index -= leftSize + 1;
        cur = cur.right;
      }
    }
    return undefined;
  }

  toArray(): T[] {
    const out: T[] = [];
    const walk = (n: ITNode<T> | null): void => {
      if (!n) return;
      walk(n.left);
      out.push(n.value);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }
}
