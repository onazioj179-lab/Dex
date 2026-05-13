// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reservoir sampling (Algorithm R). Samples k items uniformly at random
 * from a stream of unknown length using O(k) memory.
 */

export class ReservoirSampler<T> {
  private readonly k: number;
  private readonly buf: T[];
  private seen = 0;
  private readonly rand: () => number;

  constructor(k: number, random?: () => number) {
    if (!Number.isInteger(k) || k <= 0) throw new Error('ReservoirSampler: k must be a positive integer');
    this.k = k;
    this.buf = [];
    this.rand = random ?? Math.random;
  }

  push(item: T): void {
    if (this.seen < this.k) {
      this.buf.push(item);
    } else {
      const j = Math.floor(this.rand() * (this.seen + 1));
      if (j < this.k) this.buf[j] = item;
    }
    this.seen += 1;
  }

  sample(): T[] {
    return this.buf.slice();
  }

  count(): number { return this.seen; }
}

export function reservoirSample<T>(items: Iterable<T>, k: number, random?: () => number): T[] {
  const r = new ReservoirSampler<T>(k, random);
  for (const item of items) r.push(item);
  return r.sample();
}
