// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reservoir sampling (Algorithm R) for selecting k items uniformly at
 * random from a stream of unknown size.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class ReservoirSamplerK<T> {
  private k: number;
  private buffer: T[] = [];
  private seen = 0;
  private rand: () => number;

  constructor(k: number, rand: () => number = Math.random) {
    if (!Number.isInteger(k) || k < 1) throw new RangeError('ReservoirSamplerK: k must be a positive integer');
    this.k = k;
    this.rand = rand;
  }

  push(item: T): void {
    this.seen++;
    if (this.buffer.length < this.k) {
      this.buffer.push(item);
      return;
    }
    const j = Math.floor(this.rand() * this.seen);
    if (j < this.k) this.buffer[j] = item;
  }

  samples(): T[] {
    return this.buffer.slice();
  }

  count(): number {
    return this.seen;
  }
}
