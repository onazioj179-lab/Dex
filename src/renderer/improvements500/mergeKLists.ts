// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Merge K sorted lists/arrays into a single sorted array using a
 * binary-heap. O(N log K) where N is total elements.
 */

interface HeapNode<T> {
  value: T;
  listIdx: number;
  itemIdx: number;
}

class MinHeap<T> {
  private data: HeapNode<T>[] = [];
  constructor(private compare: (a: T, b: T) => number) {}
  push(n: HeapNode<T>): void {
    this.data.push(n);
    this.up(this.data.length - 1);
  }
  pop(): HeapNode<T> | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.down(0);
    }
    return top;
  }
  get size(): number {
    return this.data.length;
  }
  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(this.data[p]!.value, this.data[i]!.value) <= 0) break;
      [this.data[p], this.data[i]] = [this.data[i]!, this.data[p]!];
      i = p;
    }
  }
  private down(i: number): void {
    const n = this.data.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let s = i;
      if (l < n && this.compare(this.data[l]!.value, this.data[s]!.value) < 0) s = l;
      if (r < n && this.compare(this.data[r]!.value, this.data[s]!.value) < 0) s = r;
      if (s === i) break;
      [this.data[s], this.data[i]] = [this.data[i]!, this.data[s]!];
      i = s;
    }
  }
}

export function mergeKSortedLists<T>(
  lists: ReadonlyArray<ReadonlyArray<T>>,
  compare: (a: T, b: T) => number = (a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0),
): T[] {
  const heap = new MinHeap<T>(compare);
  for (let i = 0; i < lists.length; i += 1) {
    if (lists[i]!.length > 0) heap.push({ value: lists[i]![0]!, listIdx: i, itemIdx: 0 });
  }
  const out: T[] = [];
  while (heap.size > 0) {
    const top = heap.pop()!;
    out.push(top.value);
    const next = top.itemIdx + 1;
    if (next < lists[top.listIdx]!.length) {
      heap.push({ value: lists[top.listIdx]![next]!, listIdx: top.listIdx, itemIdx: next });
    }
  }
  return out;
}
