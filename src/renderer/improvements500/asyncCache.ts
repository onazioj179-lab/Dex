// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * In-memory cache with TTL + LRU bound (T6-040 thumbnail cache,
 * T6-041 metadata cache, generic for any IO-bound source).
 *
 * Wraps an async loader; concurrent calls for the same key share a single
 * in-flight promise (request coalescing).
 */

interface Entry<V> { value: V; expiresAt: number; }

export interface AsyncCacheOptions {
  ttlMs: number;
  /** Max number of entries (LRU evict). 0 = unbounded. */
  maxEntries?: number;
}

export class AsyncCache<K, V> {
  private map = new Map<K, Entry<V>>();
  private inflight = new Map<K, Promise<V>>();
  constructor(
    private readonly loader: (key: K) => Promise<V>,
    private readonly opts: AsyncCacheOptions,
  ) {}

  async get(key: K): Promise<V> {
    const now = Date.now();
    const hit = this.map.get(key);
    if (hit && hit.expiresAt > now) {
      // LRU touch
      this.map.delete(key);
      this.map.set(key, hit);
      return hit.value;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = this.loader(key)
      .then((v) => {
        this.map.set(key, { value: v, expiresAt: Date.now() + this.opts.ttlMs });
        this.evictIfNeeded();
        this.inflight.delete(key);
        return v;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });
    this.inflight.set(key, p);
    return p;
  }

  invalidate(key: K): void { this.map.delete(key); }
  clear(): void { this.map.clear(); this.inflight.clear(); }
  size(): number { return this.map.size; }

  private evictIfNeeded(): void {
    const max = this.opts.maxEntries ?? 0;
    if (max <= 0) return;
    while (this.map.size > max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
