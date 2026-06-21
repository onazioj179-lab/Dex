// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// Cache Expiry
// Long-session stability primitives: a generic TTL + LRU cache and a shared
// sweep registry so caches can reclaim memory together on deep idle.
// ===========================================================================

interface CacheEntry<V> {
  value: V;
  expiresAt: number; // epoch ms; Infinity means no expiry
}

export interface TTLCacheOptions {
  /** Default time-to-live for entries, in ms. 0 or undefined means no expiry. */
  defaultTtlMs?: number;
  /** Upper bound on entries; oldest (LRU) entries are evicted on overflow. */
  maxEntries?: number;
}

/**
 * A small, dependency-free TTL cache with an optional LRU bound.
 *
 * Entries expire after their TTL elapses. When `maxEntries` is set, inserting
 * beyond the bound evicts the least-recently-used entry. `get`/`set`/`has`
 * refresh recency by re-inserting into the underlying Map (insertion order is
 * the recency order).
 */
export class TTLCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options: TTLCacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs && options.defaultTtlMs > 0 ? options.defaultTtlMs : 0;
    this.maxEntries = options.maxEntries && options.maxEntries > 0 ? options.maxEntries : 0;
  }

  /** Current number of stored entries (may include not-yet-swept expired ones). */
  get size(): number {
    return this.store.size;
  }

  /** Returns the value if present and unexpired; otherwise drops it and returns undefined. */
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency: re-insert so this key becomes most-recently-used.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /** Stores a value with an optional per-entry TTL (falls back to the default). */
  set(key: K, value: V, ttlMs?: number): this {
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = ttl && ttl > 0 ? Date.now() + ttl : Infinity;
    // Delete first so re-insertion lands at the most-recently-used position.
    this.store.delete(key);
    this.store.set(key, { value, expiresAt });
    this.enforceBound();
    return this;
  }

  /** True if the key is present and unexpired. Drops it if expired. */
  has(key: K): boolean {
    const entry = this.store.get(key);
    if (entry === undefined) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** Removes a key. Returns true if it existed. */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /** Drops all expired entries. Returns the number removed. */
  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Empties the cache. */
  clear(): void {
    this.store.clear();
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return entry.expiresAt <= Date.now();
  }

  private enforceBound(): void {
    if (this.maxEntries <= 0) return;
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared sweep registry
// ---------------------------------------------------------------------------

const sweepables = new Set<() => void>();

/**
 * Registers a sweep function so it can be invoked alongside others via
 * `sweepAll()`. Returns an unregister function.
 */
export function registerSweepable(fn: () => void): () => void {
  sweepables.add(fn);
  return () => {
    sweepables.delete(fn);
  };
}

/** Invokes every registered sweep function, isolating individual failures. */
export function sweepAll(): void {
  for (const fn of sweepables) {
    try {
      fn();
    } catch {
      // Best-effort: one cache's failure must not block the others.
    }
  }
}

// ---------------------------------------------------------------------------
// Idle hook
// ---------------------------------------------------------------------------

let idleSweepBound = false;

/**
 * Listens for `dex-idle-continuity-change` and runs `sweepAll()` when the shell
 * transitions into `extended-idle`. Idempotent and SSR-safe. Returns a teardown
 * function (a no-op when no listener was attached).
 */
export function onIdleSweep(): () => void {
  if (typeof window === 'undefined' || idleSweepBound) {
    return () => {};
  }
  idleSweepBound = true;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ current?: string }>).detail;
    if (detail?.current === 'extended-idle') {
      sweepAll();
    }
  };

  window.addEventListener('dex-idle-continuity-change', handler as EventListener);
  return () => {
    window.removeEventListener('dex-idle-continuity-change', handler as EventListener);
    idleSweepBound = false;
  };
}
