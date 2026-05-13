// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Token bucket rate limiter. Tokens refill at a steady rate up to a capacity;
 * `tryConsume` succeeds when enough tokens are available, otherwise rejects
 * without blocking. `consumeAsync` waits the appropriate refill duration.
 */

export interface TokenBucketOptions {
  capacity: number;
  /** Tokens added per millisecond. */
  refillPerMs: number;
  /** Initial tokens (default: capacity). */
  initial?: number;
  /** Optional clock injection. */
  now?: () => number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(opts: TokenBucketOptions) {
    if (opts.capacity <= 0) throw new Error('capacity must be > 0');
    if (opts.refillPerMs <= 0) throw new Error('refillPerMs must be > 0');
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerMs;
    this.now = opts.now ?? (() => Date.now());
    this.tokens = Math.min(opts.initial ?? opts.capacity, opts.capacity);
    this.lastRefill = this.now();
  }

  private refill(): void {
    const t = this.now();
    const dt = t - this.lastRefill;
    if (dt > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerMs);
      this.lastRefill = t;
    }
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Returns ms to wait until `count` tokens will be available. */
  msUntilAvailable(count = 1): number {
    this.refill();
    if (this.tokens >= count) return 0;
    return Math.ceil((count - this.tokens) / this.refillPerMs);
  }

  async consumeAsync(count = 1): Promise<void> {
    const wait = this.msUntilAvailable(count);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!this.tryConsume(count)) {
      // Race: another caller drained tokens; try once more after the same delay.
      await new Promise((r) => setTimeout(r, this.msUntilAvailable(count)));
      this.tryConsume(count);
    }
  }
}
