// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Token-bucket rate limiter (sync engine, UKI provider calls, IPC bursts). A
 * pure, immutable bucket: refill is computed from elapsed time, consumption
 * returns a new bucket + whether it was allowed. No timers, so it is fully
 * deterministic and testable; the caller supplies `now`.
 */

export interface TokenBucket {
  /** Current tokens (may be fractional after partial refill). */
  tokens: number;
  /** Max tokens. */
  capacity: number;
  /** Tokens replenished per millisecond. */
  refillPerMs: number;
  /** Timestamp the bucket was last refilled. */
  lastRefill: number;
}

/** Create a full bucket. */
export function createBucket(capacity: number, refillPerMs: number, now: number): TokenBucket {
  return { tokens: capacity, capacity, refillPerMs, lastRefill: now };
}

/** Refill a bucket up to capacity based on elapsed time since `lastRefill`. */
export function refill(bucket: TokenBucket, now: number): TokenBucket {
  const elapsed = Math.max(0, now - bucket.lastRefill);
  if (elapsed === 0) return bucket;
  const tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
  return { ...bucket, tokens, lastRefill: now };
}

export interface ConsumeResult {
  bucket: TokenBucket;
  allowed: boolean;
}

/**
 * Try to consume `cost` tokens at time `now`. Returns the updated bucket and
 * whether the request was allowed (tokens only deducted when allowed).
 */
export function tryConsume(bucket: TokenBucket, now: number, cost = 1): ConsumeResult {
  const filled = refill(bucket, now);
  if (filled.tokens >= cost) {
    return { bucket: { ...filled, tokens: filled.tokens - cost }, allowed: true };
  }
  return { bucket: filled, allowed: false };
}

/** Ms until `cost` tokens will be available (0 if already available). */
export function msUntilAvailable(bucket: TokenBucket, now: number, cost = 1): number {
  const filled = refill(bucket, now);
  if (filled.tokens >= cost) return 0;
  if (filled.refillPerMs <= 0) return Infinity;
  return Math.ceil((cost - filled.tokens) / filled.refillPerMs);
}
