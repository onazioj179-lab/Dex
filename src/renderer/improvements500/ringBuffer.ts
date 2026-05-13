// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Generic fixed-capacity ring (circular) buffer. O(1) push and shift; oldest
 * entries are overwritten when capacity is reached.
 */

export class RingBuffer<T> {
  private readonly data: Array<T | undefined>;
  private head = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isInteger(capacity)) {
      throw new Error('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.data = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  push(value: T): T | undefined {
    let evicted: T | undefined;
    if (this.count === this.capacity) {
      evicted = this.data[this.head] as T | undefined;
      this.data[this.head] = value;
      this.head = (this.head + 1) % this.capacity;
    } else {
      const tail = (this.head + this.count) % this.capacity;
      this.data[tail] = value;
      this.count += 1;
    }
    return evicted;
  }

  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const v = this.data[this.head] as T;
    this.data[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;
    return v;
  }

  peek(): T | undefined {
    return this.count === 0 ? undefined : (this.data[this.head] as T);
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i += 1) {
      out.push(this.data[(this.head + i) % this.capacity] as T);
    }
    return out;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i += 1) this.data[i] = undefined;
    this.head = 0;
    this.count = 0;
  }
}
