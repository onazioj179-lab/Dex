// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Skip list - probabilistic ordered set with O(log n) expected operations.
 */

interface SkipNode<T> {
  value: T | null;
  forward: Array<SkipNode<T> | null>;
}

export interface SkipListOptions<T> {
  compare?: (a: T, b: T) => number;
  maxLevel?: number;
  probability?: number;
}

export class SkipList<T> {
  private readonly head: SkipNode<T>;
  private readonly compare: (a: T, b: T) => number;
  private readonly maxLevel: number;
  private readonly probability: number;
  private level = 0;
  private size_ = 0;

  constructor(opts: SkipListOptions<T> = {}) {
    this.compare =
      opts.compare ??
      ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    this.maxLevel = opts.maxLevel ?? 16;
    this.probability = opts.probability ?? 0.5;
    this.head = { value: null, forward: new Array(this.maxLevel).fill(null) };
  }

  get size(): number {
    return this.size_;
  }

  private randomLevel(): number {
    let lvl = 0;
    while (Math.random() < this.probability && lvl < this.maxLevel - 1) lvl += 1;
    return lvl;
  }

  insert(value: T): void {
    const update: Array<SkipNode<T>> = new Array(this.maxLevel).fill(this.head);
    let cur: SkipNode<T> = this.head;
    for (let i = this.level; i >= 0; i -= 1) {
      while (cur.forward[i] !== null && this.compare(cur.forward[i]!.value as T, value) < 0) {
        cur = cur.forward[i]!;
      }
      update[i] = cur;
    }
    const lvl = this.randomLevel();
    if (lvl > this.level) {
      for (let i = this.level + 1; i <= lvl; i += 1) update[i] = this.head;
      this.level = lvl;
    }
    const node: SkipNode<T> = { value, forward: new Array(lvl + 1).fill(null) };
    for (let i = 0; i <= lvl; i += 1) {
      node.forward[i] = update[i]!.forward[i] ?? null;
      update[i]!.forward[i] = node;
    }
    this.size_ += 1;
  }

  contains(value: T): boolean {
    let cur: SkipNode<T> = this.head;
    for (let i = this.level; i >= 0; i -= 1) {
      while (cur.forward[i] !== null && this.compare(cur.forward[i]!.value as T, value) < 0) {
        cur = cur.forward[i]!;
      }
    }
    cur = cur.forward[0] ?? this.head;
    return cur !== this.head && this.compare(cur.value as T, value) === 0;
  }

  remove(value: T): boolean {
    const update: Array<SkipNode<T>> = new Array(this.maxLevel).fill(this.head);
    let cur: SkipNode<T> = this.head;
    for (let i = this.level; i >= 0; i -= 1) {
      while (cur.forward[i] !== null && this.compare(cur.forward[i]!.value as T, value) < 0) {
        cur = cur.forward[i]!;
      }
      update[i] = cur;
    }
    cur = cur.forward[0] ?? this.head;
    if (cur === this.head || this.compare(cur.value as T, value) !== 0) return false;
    for (let i = 0; i <= this.level; i += 1) {
      if (update[i]!.forward[i] !== cur) break;
      update[i]!.forward[i] = cur.forward[i] ?? null;
    }
    while (this.level > 0 && this.head.forward[this.level] === null) this.level -= 1;
    this.size_ -= 1;
    return true;
  }

  toArray(): T[] {
    const out: T[] = [];
    let cur = this.head.forward[0];
    while (cur !== null && cur !== undefined) {
      out.push(cur.value as T);
      cur = cur.forward[0] ?? null;
    }
    return out;
  }
}
