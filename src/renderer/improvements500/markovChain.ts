// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Order-N Markov chain. Train on a sequence of tokens; sample new sequences
 * from the learned transition table.
 */

export class MarkovChain<T> {
  private readonly order: number;
  private readonly table = new Map<string, T[]>();
  private readonly starts: T[][] = [];

  constructor(order = 2) {
    if (!Number.isInteger(order) || order < 1) throw new Error('MarkovChain: order must be a positive integer');
    this.order = order;
  }

  train(sequence: readonly T[]): void {
    if (sequence.length <= this.order) return;
    this.starts.push(sequence.slice(0, this.order) as T[]);
    for (let i = 0; i + this.order < sequence.length; i += 1) {
      const key = this.keyOf(sequence.slice(i, i + this.order));
      const next = sequence[i + this.order]!;
      const arr = this.table.get(key);
      if (arr) arr.push(next); else this.table.set(key, [next]);
    }
  }

  generate(maxLength: number, random?: () => number): T[] {
    const rand = random ?? Math.random;
    if (this.starts.length === 0) return [];
    const start = this.starts[Math.floor(rand() * this.starts.length)]!;
    const out: T[] = start.slice();
    while (out.length < maxLength) {
      const window = out.slice(out.length - this.order);
      const key = this.keyOf(window);
      const choices = this.table.get(key);
      if (!choices || choices.length === 0) break;
      out.push(choices[Math.floor(rand() * choices.length)]!);
    }
    return out;
  }

  private keyOf(window: readonly T[]): string {
    return window.map((t) => JSON.stringify(t)).join('\u0001');
  }
}
