// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// CacheRegistry — unified registry for all renderer-side caches (K10).
//
// Any module that maintains an in-memory cache registers an entry here.
// HeapMonitor calls flushAll() when memory pressure is high so individual
// caches don't need to know about each other.
// =============================================================================

export interface CacheEntry {
  /** Human-readable name used in diagnostics / dev-tools. */
  name: string;
  /**
   * Flush callback. Should return the number of bytes freed when known,
   * otherwise undefined. Must never throw.
   */
  flush: () => number | undefined;
  /**
   * Optional live size estimate in bytes — polled by diagnostics.
   * Omit if computing is expensive.
   */
  sizeBytes?: () => number;
}

type CacheId = string;

const registry = new Map<CacheId, CacheEntry>();
let idCounter = 0;

/**
 * Register a cache. Returns an opaque id used to unregister later.
 *
 * @example
 * const id = registerCache({ name: 'LayerImageCache', flush: () => { map.clear(); return 0; } });
 * // on cleanup:
 * unregisterCache(id);
 */
export function registerCache(entry: CacheEntry): CacheId {
  const id = `cache-${++idCounter}`;
  registry.set(id, entry);
  return id;
}

/**
 * Remove a previously registered cache entry.
 */
export function unregisterCache(id: CacheId): void {
  registry.delete(id);
}

/**
 * Flush all registered caches. Returns the sum of bytes freed when known.
 * Called by HeapMonitor under memory pressure.
 */
export function flushAll(): number {
  let totalFreed = 0;
  for (const entry of registry.values()) {
    try {
      const freed = entry.flush();
      if (typeof freed === 'number') totalFreed += freed;
    } catch {
      // intentional: one broken cache must not abort others
    }
  }
  return totalFreed;
}

/**
 * Flush a subset of caches by name prefix.
 * Useful for targeted pressure relief (e.g. flush only 'LayerImage*').
 */
export function flushByPrefix(prefix: string): number {
  let totalFreed = 0;
  for (const entry of registry.values()) {
    if (!entry.name.startsWith(prefix)) continue;
    try {
      const freed = entry.flush();
      if (typeof freed === 'number') totalFreed += freed;
    } catch {
      // intentional: one broken cache must not abort others
    }
  }
  return totalFreed;
}

/**
 * Return a snapshot of registered caches with optional live size estimates.
 * Used by dev diagnostics / memory inspector.
 */
export function getCacheSnapshot(): Array<{ id: CacheId; name: string; sizeBytes?: number }> {
  const out: Array<{ id: CacheId; name: string; sizeBytes?: number }> = [];
  for (const [id, entry] of registry.entries()) {
    out.push({
      id,
      name: entry.name,
      sizeBytes: entry.sizeBytes ? entry.sizeBytes() : undefined,
    });
  }
  return out;
}

/**
 * Number of registered caches. Primarily for tests.
 */
export function registrySize(): number {
  return registry.size;
}
