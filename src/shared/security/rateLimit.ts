// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Token-bucket rate limiter
 * -----------------------------------------------------------------------------
 * Pure deterministic rate limiter. Caller supplies the clock so tests are not
 * flaky. Used by:
 *   - sign-in attempts per IP
 *   - account creation per IP per day
 *   - Stripe checkout sessions per account per hour
 *   - cloud sync push per device per minute
 *   - UKI plan executions per account per minute (already exists; this
 *     module replaces the ad-hoc throttle there)
 *
 * The bucket holds `capacity` tokens and refills at `refillPerMs` per ms.
 * Each `tryConsume(n)` returns true and removes n tokens if available, else
 * false and removes nothing.
 */

// DEX v3.8.7 - rate limiting

export interface RateLimitConfig {
  /** Maximum tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per millisecond. e.g. 10 / 60_000 = 10/min. */
  refillPerMs: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private config: RateLimitConfig, now: number = Date.now()) {
    if (config.capacity <= 0) throw new Error('capacity must be > 0');
    if (config.refillPerMs < 0) throw new Error('refillPerMs must be >= 0');
    this.tokens = config.capacity;
    this.lastRefill = now;
  }

  private refill(now: number): void {
    if (now <= this.lastRefill) return;
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.config.capacity, this.tokens + elapsed * this.config.refillPerMs);
    this.lastRefill = now;
  }

  available(now: number = Date.now()): number {
    this.refill(now);
    return this.tokens;
  }

  tryConsume(n: number = 1, now: number = Date.now()): boolean {
    if (n <= 0) return true;
    this.refill(now);
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }

  /** Milliseconds until the bucket has at least `n` tokens. */
  retryAfterMs(n: number = 1, now: number = Date.now()): number {
    this.refill(now);
    if (this.tokens >= n) return 0;
    if (this.config.refillPerMs === 0) return Infinity;
    return Math.ceil((n - this.tokens) / this.config.refillPerMs);
  }

  reset(now: number = Date.now()): void {
    this.tokens = this.config.capacity;
    this.lastRefill = now;
  }
}

/** Per-key rate limiter. Keys are usually IP, accountId, or deviceId. */
export class KeyedRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  constructor(private config: RateLimitConfig) {}

  tryConsume(key: string, n: number = 1, now: number = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) { b = new TokenBucket(this.config, now); this.buckets.set(key, b); }
    return b.tryConsume(n, now);
  }

  retryAfterMs(key: string, n: number = 1, now: number = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b) return 0;
    return b.retryAfterMs(n, now);
  }

  /** Drop buckets that have been idle longer than maxIdleMs. */
  evict(maxIdleMs: number, now: number = Date.now()): number {
    let dropped = 0;
    for (const [key, bucket] of this.buckets) {
      // Access private via cast (controlled within module).
      const last = (bucket as unknown as { lastRefill: number }).lastRefill;
      if (now - last > maxIdleMs) { this.buckets.delete(key); dropped++; }
    }
    return dropped;
  }

  size(): number { return this.buckets.size; }
}

/**
 * Pre-configured limiters. Tuned conservatively to favour real users while
 * making automated abuse expensive. All numbers are also documented in
 * docs/SECURITY.md.
 */
export const LIMITS = {
  /** 5 sign-in attempts per IP per minute. */
  signInPerIp: { capacity: 5, refillPerMs: 5 / 60_000 },
  /** 3 account creations per IP per day. */
  accountCreatePerIp: { capacity: 3, refillPerMs: 3 / (24 * 60 * 60 * 1000) },
  /** 10 Stripe checkout sessions per account per hour. */
  checkoutPerAccount: { capacity: 10, refillPerMs: 10 / (60 * 60 * 1000) },
  /** 60 cloud-sync pushes per device per minute. */
  syncPushPerDevice: { capacity: 60, refillPerMs: 60 / 60_000 },
  /** 30 UKI plan executions per account per minute. */
  ukiPlanPerAccount: { capacity: 30, refillPerMs: 30 / 60_000 },
  /** 100 search queries per account per minute. */
  searchPerAccount: { capacity: 100, refillPerMs: 100 / 60_000 },
} as const satisfies Record<string, RateLimitConfig>;
