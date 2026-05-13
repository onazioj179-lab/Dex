// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Vose's alias method for O(1) weighted random sampling.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class AliasSampler {
  private prob: Float64Array;
  private alias: Int32Array;
  private rand: () => number;

  constructor(weights: readonly number[], rand: () => number = Math.random) {
    const n = weights.length;
    if (n === 0) throw new RangeError('AliasSampler: weights must be non-empty');
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (weights[i]! < 0 || !Number.isFinite(weights[i]!)) {
        throw new RangeError('AliasSampler: weights must be non-negative finite');
      }
      sum += weights[i]!;
    }
    if (sum <= 0) throw new RangeError('AliasSampler: total weight must be positive');

    const prob = new Float64Array(n);
    const alias = new Int32Array(n);
    const scaled = new Float64Array(n);
    for (let i = 0; i < n; i++) scaled[i] = (weights[i]! * n) / sum;

    const small: number[] = [];
    const large: number[] = [];
    for (let i = 0; i < n; i++) {
      if (scaled[i]! < 1) small.push(i);
      else large.push(i);
    }

    while (small.length > 0 && large.length > 0) {
      const s = small.pop()!;
      const l = large.pop()!;
      prob[s] = scaled[s]!;
      alias[s] = l;
      scaled[l] = scaled[l]! + scaled[s]! - 1;
      if (scaled[l]! < 1) small.push(l);
      else large.push(l);
    }
    while (large.length > 0) prob[large.pop()!] = 1;
    while (small.length > 0) prob[small.pop()!] = 1;

    this.prob = prob;
    this.alias = alias;
    this.rand = rand;
  }

  sample(): number {
    const n = this.prob.length;
    const i = Math.floor(this.rand() * n);
    return this.rand() < this.prob[i]! ? i : this.alias[i]!;
  }
}
