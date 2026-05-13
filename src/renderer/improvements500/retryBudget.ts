// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Retry budget: caps total retries within a sliding window so a degraded
 * downstream cannot trigger a retry storm. Pairs nicely with `circuitBreaker`
 * and `retryAfter` from earlier waves.
 */

export interface RetryBudgetOptions {
  /** Max retries allowed per windowMs. */
  maxRetries: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export class RetryBudget {
  private readonly maxRetries: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly stamps: number[] = [];

  constructor(options: RetryBudgetOptions) {
    if (!Number.isFinite(options.maxRetries) || options.maxRetries < 0) {
      throw new Error('RetryBudget: maxRetries must be >= 0');
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new Error('RetryBudget: windowMs must be > 0');
    }
    this.maxRetries = Math.floor(options.maxRetries);
    this.windowMs = options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  private trim(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length > 0 && this.stamps[0] < cutoff) {
      this.stamps.shift();
    }
  }

  /** Tries to consume a retry slot. Returns true on success. */
  tryConsume(): boolean {
    this.trim();
    if (this.stamps.length >= this.maxRetries) return false;
    this.stamps.push(this.now());
    return true;
  }

  available(): number {
    this.trim();
    return Math.max(0, this.maxRetries - this.stamps.length);
  }

  reset(): void {
    this.stamps.length = 0;
  }
}
