// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { ResultCache, hashKey } from '../../src/shared/uki/resultCache';

describe('UKI result cache (#041)', () => {
  it('caches, bumps LRU recency, and evicts the oldest', () => {
    const c = new ResultCache<number>({ capacity: 2 });
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // bump 'a' so 'b' becomes oldest
    c.set('c', 3);              // evicts 'b'
    expect(c.has('b')).toBe(false);
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('expires entries past their TTL', () => {
    let t = 0;
    const c = new ResultCache<string>({ ttlMs: 100, now: () => t });
    c.set('k', 'v');
    t = 50;
    expect(c.get('k')).toBe('v');
    t = 150;
    expect(c.get('k')).toBeUndefined();
  });

  it('hashKey is stable and order-sensitive', () => {
    expect(hashKey('a', { x: 1 })).toBe(hashKey('a', { x: 1 }));
    expect(hashKey('a', 'b')).not.toBe(hashKey('b', 'a'));
  });
});
