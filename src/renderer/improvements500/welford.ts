// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Welford's online algorithm for numerically stable mean and variance.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class Welford {
  private n = 0;
  private meanV = 0;
  private m2 = 0;

  push(x: number): void {
    this.n += 1;
    const delta = x - this.meanV;
    this.meanV += delta / this.n;
    const delta2 = x - this.meanV;
    this.m2 += delta * delta2;
  }

  count(): number {
    return this.n;
  }

  mean(): number {
    return this.n === 0 ? Number.NaN : this.meanV;
  }

  variance(): number {
    return this.n < 2 ? Number.NaN : this.m2 / (this.n - 1);
  }

  populationVariance(): number {
    return this.n === 0 ? Number.NaN : this.m2 / this.n;
  }

  stddev(): number {
    return Math.sqrt(this.variance());
  }

  reset(): void {
    this.n = 0;
    this.meanV = 0;
    this.m2 = 0;
  }
}
