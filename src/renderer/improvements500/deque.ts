// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Double-ended queue (deque) backed by a circular array. Amortized
 * O(1) push/pop at either end.
 */

export class Deque<T> {
  private buf: Array<T | undefined>;
  private head = 0;
  private tail = 0;
  private size_ = 0;

  constructor(initialCapacity = 16) {
    this.buf = new Array(Math.max(2, initialCapacity));
  }

  get size(): number {
    return this.size_;
  }

  private grow(): void {
    const next = new Array<T | undefined>(this.buf.length * 2);
    for (let i = 0; i < this.size_; i += 1) {
      next[i] = this.buf[(this.head + i) % this.buf.length];
    }
    this.buf = next;
    this.head = 0;
    this.tail = this.size_;
  }

  pushBack(value: T): void {
    if (this.size_ === this.buf.length) this.grow();
    this.buf[this.tail] = value;
    this.tail = (this.tail + 1) % this.buf.length;
    this.size_ += 1;
  }

  pushFront(value: T): void {
    if (this.size_ === this.buf.length) this.grow();
    this.head = (this.head - 1 + this.buf.length) % this.buf.length;
    this.buf[this.head] = value;
    this.size_ += 1;
  }

  popBack(): T | undefined {
    if (this.size_ === 0) return undefined;
    this.tail = (this.tail - 1 + this.buf.length) % this.buf.length;
    const v = this.buf[this.tail];
    this.buf[this.tail] = undefined;
    this.size_ -= 1;
    return v;
  }

  popFront(): T | undefined {
    if (this.size_ === 0) return undefined;
    const v = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) % this.buf.length;
    this.size_ -= 1;
    return v;
  }

  peekFront(): T | undefined {
    return this.size_ === 0 ? undefined : this.buf[this.head];
  }

  peekBack(): T | undefined {
    if (this.size_ === 0) return undefined;
    const idx = (this.tail - 1 + this.buf.length) % this.buf.length;
    return this.buf[idx];
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.size_; i += 1) {
      out.push(this.buf[(this.head + i) % this.buf.length] as T);
    }
    return out;
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.size_ = 0;
  }
}
