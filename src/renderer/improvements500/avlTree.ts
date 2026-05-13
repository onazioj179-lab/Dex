// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AVL tree - self-balancing binary search tree with O(log n) operations.
 */

interface AvlNode<T> {
  value: T;
  height: number;
  left: AvlNode<T> | null;
  right: AvlNode<T> | null;
}

export interface AvlTreeOptions<T> {
  compare?: (a: T, b: T) => number;
}

function height<T>(n: AvlNode<T> | null): number {
  return n === null ? 0 : n.height;
}

function update<T>(n: AvlNode<T>): void {
  n.height = 1 + Math.max(height(n.left), height(n.right));
}

function balance<T>(n: AvlNode<T>): number {
  return height(n.left) - height(n.right);
}

function rotateRight<T>(y: AvlNode<T>): AvlNode<T> {
  const x = y.left!;
  y.left = x.right;
  x.right = y;
  update(y);
  update(x);
  return x;
}

function rotateLeft<T>(x: AvlNode<T>): AvlNode<T> {
  const y = x.right!;
  x.right = y.left;
  y.left = x;
  update(x);
  update(y);
  return y;
}

function rebalance<T>(n: AvlNode<T>, cmp: (a: T, b: T) => number, value: T): AvlNode<T> {
  update(n);
  const b = balance(n);
  if (b > 1 && cmp(value, n.left!.value) < 0) return rotateRight(n);
  if (b < -1 && cmp(value, n.right!.value) > 0) return rotateLeft(n);
  if (b > 1 && cmp(value, n.left!.value) > 0) {
    n.left = rotateLeft(n.left!);
    return rotateRight(n);
  }
  if (b < -1 && cmp(value, n.right!.value) < 0) {
    n.right = rotateRight(n.right!);
    return rotateLeft(n);
  }
  return n;
}

export class AvlTree<T> {
  private root: AvlNode<T> | null = null;
  private size_ = 0;
  private readonly compare: (a: T, b: T) => number;

  constructor(opts: AvlTreeOptions<T> = {}) {
    this.compare = opts.compare ?? ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  get size(): number {
    return this.size_;
  }

  insert(value: T): void {
    let inserted = false;
    const insertNode = (n: AvlNode<T> | null): AvlNode<T> => {
      if (n === null) {
        inserted = true;
        return { value, height: 1, left: null, right: null };
      }
      const c = this.compare(value, n.value);
      if (c < 0) n.left = insertNode(n.left);
      else if (c > 0) n.right = insertNode(n.right);
      else return n;
      return rebalance(n, this.compare, value);
    };
    this.root = insertNode(this.root);
    if (inserted) this.size_ += 1;
  }

  contains(value: T): boolean {
    let n = this.root;
    while (n !== null) {
      const c = this.compare(value, n.value);
      if (c === 0) return true;
      n = c < 0 ? n.left : n.right;
    }
    return false;
  }

  inOrder(): T[] {
    const out: T[] = [];
    const walk = (n: AvlNode<T> | null): void => {
      if (n === null) return;
      walk(n.left);
      out.push(n.value);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }

  height(): number {
    return height(this.root);
  }
}
