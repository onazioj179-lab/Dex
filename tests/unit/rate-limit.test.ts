// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createBucket, refill, tryConsume, msUntilAvailable } from '../../src/shared/automation/rateLimit';

describe('token bucket rate limit', () => {
  it('consumes available tokens', () => {
    let b = createBucket(2, 0, 1000); // no refill
    let r = tryConsume(b, 1000);
    expect(r.allowed).toBe(true);
    expect(r.bucket.tokens).toBe(1);
    r = tryConsume(r.bucket, 1000);
    expect(r.allowed).toBe(true);
    expect(r.bucket.tokens).toBe(0);
    r = tryConsume(r.bucket, 1000);
    expect(r.allowed).toBe(false);
    expect(r.bucket.tokens).toBe(0);
  });

  it('refills over elapsed time up to capacity', () => {
    const empty = { tokens: 0, capacity: 10, refillPerMs: 0.001, lastRefill: 1000 };
    expect(refill(empty, 2000).tokens).toBe(1); // 1000ms * 0.001
    expect(refill(empty, 100_000).tokens).toBe(10); // capped at capacity
    expect(refill(empty, 1000).tokens).toBe(0); // no time elapsed
  });

  it('respects cost', () => {
    const b = createBucket(5, 0, 1000);
    const r = tryConsume(b, 1000, 3);
    expect(r.allowed).toBe(true);
    expect(r.bucket.tokens).toBe(2);
    expect(tryConsume(r.bucket, 1000, 3).allowed).toBe(false);
  });

  it('computes ms until available', () => {
    const empty = { tokens: 0, capacity: 10, refillPerMs: 0.001, lastRefill: 1000 };
    expect(msUntilAvailable(empty, 1000, 1)).toBe(1000);
    expect(msUntilAvailable(createBucket(5, 0, 1000), 1000, 1)).toBe(0); // already has tokens
  });
});
