// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Treap - randomized balanced BST. Each node has a key + random priority;
 * tree maintains BST order on key and max-heap order on priority.
 */

interface TreapNode<K> {
  key: K;
  priority: number;
  left: TreapNode<K> | null;
  right: TreapNode<K> | null;
  size: number;
}

export interface TreapOptions<K> {
  compare?: (a: K, b: K) => number;
}

function sz<K>(n: TreapNode<K> | null): number {
  return n === null ? 0 : n.size;
}

function recalc<K>(n: TreapNode<K>): void {
  n.size = 1 + sz(n.left) + sz(n.right);
}

function rotR<K>(p: TreapNode<K>): TreapNode<K> {
  const q = p.left!;
  p.left = q.right;
  q.right = p;
  recalc(p);
  recalc(q);
  return q;
}

function rotL<K>(p: TreapNode<K>): TreapNode<K> {
  const q = p.right!;
  p.right = q.left;
  q.left = p;
  recalc(p);
  recalc(q);
  return q;
}

export class Treap<K> {
  private root: TreapNode<K> | null = null;
  private readonly compare: (a: K, b: K) => number;

  constructor(opts: TreapOptions<K> = {}) {
    this.compare = opts.compare ?? ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  get size(): number {
    return sz(this.root);
  }

  insert(key: K): void {
    this.root = this.insertNode(this.root, key);
  }

  private insertNode(n: TreapNode<K> | null, key: K): TreapNode<K> {
    if (n === null) {
      return { key, priority: Math.random(), left: null, right: null, size: 1 };
    }
    const c = this.compare(key, n.key);
    if (c === 0) return n;
    if (c < 0) {
      n.left = this.insertNode(n.left, key);
      if (n.left!.priority > n.priority) n = rotR(n);
    } else {
      n.right = this.insertNode(n.right, key);
      if (n.right!.priority > n.priority) n = rotL(n);
    }
    recalc(n);
    return n;
  }

  contains(key: K): boolean {
    let n = this.root;
    while (n !== null) {
      const c = this.compare(key, n.key);
      if (c === 0) return true;
      n = c < 0 ? n.left : n.right;
    }
    return false;
  }

  inOrder(): K[] {
    const out: K[] = [];
    const walk = (n: TreapNode<K> | null): void => {
      if (n === null) return;
      walk(n.left);
      out.push(n.key);
      walk(n.right);
    };
    walk(this.root);
    return out;
  }
}
