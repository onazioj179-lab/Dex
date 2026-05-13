// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Round-robin scheduler iterator. Cycles through a list, optionally
 * skipping disabled entries.
 */

export class RoundRobin<T> {
  private readonly items: T[];
  private cursor = 0;

  constructor(items: readonly T[]) {
    if (items.length === 0) throw new Error('RoundRobin requires at least one item');
    this.items = items.slice();
  }

  next(): T {
    const v = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.items.length;
    return v;
  }

  /** Pick next item satisfying `predicate`; throws if none satisfy after one full cycle. */
  nextWhere(predicate: (item: T) => boolean): T {
    for (let i = 0; i < this.items.length; i += 1) {
      const v = this.next();
      if (predicate(v)) return v;
    }
    throw new Error('No item satisfies predicate');
  }

  reset(): void {
    this.cursor = 0;
  }

  get position(): number {
    return this.cursor;
  }

  get size(): number {
    return this.items.length;
  }
}
