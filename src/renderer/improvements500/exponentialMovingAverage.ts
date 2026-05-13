// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Single-pole exponential moving average. alpha in (0,1].
export class ExponentialMovingAverage {
  private value: number | null = null;
  constructor(private readonly alpha: number) {
    if (alpha <= 0 || alpha > 1) throw new RangeError('alpha must be in (0,1]');
  }

  next(x: number): number {
    if (this.value === null) this.value = x;
    else this.value = this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

export function emaSeries(values: ReadonlyArray<number>, alpha: number): Float32Array {
  const ema = new ExponentialMovingAverage(alpha);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = ema.next(values[i]);
  return out;
}
