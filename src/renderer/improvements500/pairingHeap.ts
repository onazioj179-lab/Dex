// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface PhNode<T> {
  value: T;
  child: PhNode<T> | null;
  sibling: PhNode<T> | null;
}

function meld<T>(a: PhNode<T> | null, b: PhNode<T> | null, cmp: (x: T, y: T) => number): PhNode<T> | null {
  if (!a) return b;
  if (!b) return a;
  if (cmp(a.value, b.value) <= 0) {
    b.sibling = a.child;
    a.child = b;
    return a;
  }
  a.sibling = b.child;
  b.child = a;
  return b;
}

function mergePairs<T>(node: PhNode<T> | null, cmp: (x: T, y: T) => number): PhNode<T> | null {
  if (!node || !node.sibling) return node;
  const a = node;
  const b = node.sibling;
  const rest = b.sibling;
  a.sibling = null;
  b.sibling = null;
  return meld(meld(a, b, cmp), mergePairs(rest, cmp), cmp);
}

export class PairingHeap<T> {
  private root: PhNode<T> | null = null;
  private _size = 0;
  private readonly cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
    this.cmp = cmp;
  }

  get size(): number {
    return this._size;
  }

  push(value: T): void {
    this.root = meld(this.root, { value, child: null, sibling: null }, this.cmp);
    this._size++;
  }

  peek(): T | undefined {
    return this.root ? this.root.value : undefined;
  }

  pop(): T | undefined {
    if (!this.root) return undefined;
    const v = this.root.value;
    this.root = mergePairs(this.root.child, this.cmp);
    this._size--;
    return v;
  }
}
