// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rolling-window simple moving average and exponential moving average. Both
 * accept a stream of samples via `push` and report the current average.
 */

export class MovingAverage {
  private readonly window: number[];
  private readonly capacity: number;
  private sum = 0;
  private head = 0;
  private filled = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.window = new Array(capacity).fill(0);
  }

  push(value: number): number {
    if (this.filled === this.capacity) {
      this.sum -= this.window[this.head];
    } else {
      this.filled += 1;
    }
    this.window[this.head] = value;
    this.sum += value;
    this.head = (this.head + 1) % this.capacity;
    return this.sum / this.filled;
  }

  value(): number {
    return this.filled === 0 ? NaN : this.sum / this.filled;
  }

  reset(): void {
    this.sum = 0;
    this.head = 0;
    this.filled = 0;
    this.window.fill(0);
  }
}

export class ExponentialMovingAverage {
  private current: number | null = null;
  private readonly alpha: number;

  constructor(alpha: number) {
    if (alpha <= 0 || alpha > 1) throw new Error('alpha must be in (0, 1]');
    this.alpha = alpha;
  }

  push(value: number): number {
    this.current = this.current === null
      ? value
      : this.alpha * value + (1 - this.alpha) * this.current;
    return this.current;
  }

  value(): number {
    return this.current === null ? NaN : this.current;
  }

  reset(): void {
    this.current = null;
  }
}
