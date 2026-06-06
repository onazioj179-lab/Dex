// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI result cache (ROADMAP-600 §1.A #041). Pure LRU cache keyed by a stable
 * hash of (prompt, context) so repeated model/tool calls return instantly. No
 * I/O — the agent layer decides what to cache and supplies the clock.
 */

// DEX v6.0 — UKI result cache

export interface ResultCacheOptions {
  /** Max entries before LRU eviction. Default 100. */
  capacity?: number;
  /** Entry time-to-live in ms. Default Infinity (no expiry). */
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface CacheEntry<V> {
  value: V;
  storedAt: number;
}

/** Stable FNV-1a hash of arbitrary parts — use for cache keys. */
export function hashKey(...parts: unknown[]): string {
  const s = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class ResultCache<V = unknown> {
  private readonly map = new Map<string, CacheEntry<V>>(); // insertion order = LRU recency
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: ResultCacheOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 100);
    this.ttlMs = opts.ttlMs ?? Infinity;
    this.now = opts.now ?? (() => Date.now());
  }

  private fresh(entry: CacheEntry<V>): boolean {
    return this.now() - entry.storedAt < this.ttlMs;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (!this.fresh(entry)) { this.map.delete(key); return undefined; }
    // bump recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, storedAt: this.now() });
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
