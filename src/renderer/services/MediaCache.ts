// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Creative Media Cache
 * -----------------------------------------------------------------------------
 * Process-wide LRU cache for derived media artifacts shared across creative
 * apps (Vinx, Imosion, Prism, Flux, Forge, AXL):
 *
 *   - Audio peaks / waveform mip-maps
 *   - Video / image thumbnails
 *   - Decoded media metadata (duration, channels, sampleRate, codec)
 *
 * Bounded by entry count AND total bytes; LRU eviction. All entries are
 * keyed by a stable content fingerprint (caller supplies hash; typically
 * sha256 of source URL + lastModified or contentHash for blob inputs).
 *
 * Pure in-memory; no IndexedDB persistence here -- reload tolerance is the
 * job of per-app project snapshots. Persisting derived artifacts in IDB is
 * a future concern once profile data shows the cold-rebuild cost matters.
 */

export type MediaCacheKind = 'audioPeaks' | 'thumbnail' | 'metadata' | 'spectrogram';

export interface MediaCacheEntry<T = unknown> {
  key: string;
  kind: MediaCacheKind;
  value: T;
  byteSize: number;
  lastUsed: number;
  hits: number;
}

export interface MediaCacheStats {
  entries: number;
  bytes: number;
  bytesLimit: number;
  entriesLimit: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface MediaCacheConfig {
  /** Soft cap on total bytes; LRU evicts until under cap. */
  maxBytes?: number;
  /** Hard cap on entry count. */
  maxEntries?: number;
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024; // 256MB
const DEFAULT_MAX_ENTRIES = 4096;

class MediaCacheImpl {
  private map = new Map<string, MediaCacheEntry>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private maxBytes: number;
  private maxEntries: number;

  constructor(cfg: MediaCacheConfig = {}) {
    this.maxBytes = cfg.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxEntries = cfg.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** Configure caps at runtime (e.g. shrink under memory pressure). */
  configure(cfg: MediaCacheConfig): void {
    if (cfg.maxBytes !== undefined) this.maxBytes = cfg.maxBytes;
    if (cfg.maxEntries !== undefined) this.maxEntries = cfg.maxEntries;
    this.evict();
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get<T = unknown>(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    // Refresh LRU position via re-insert.
    this.map.delete(key);
    e.lastUsed = Date.now();
    e.hits++;
    this.map.set(key, e);
    this.hits++;
    return e.value as T;
  }

  set<T = unknown>(key: string, kind: MediaCacheKind, value: T, byteSize: number): void {
    if (byteSize < 0) byteSize = 0;
    // Refuse single entries larger than the cap entirely.
    if (byteSize > this.maxBytes) return;

    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.byteSize;
      this.map.delete(key);
    }
    const entry: MediaCacheEntry<T> = {
      key,
      kind,
      value,
      byteSize,
      lastUsed: Date.now(),
      hits: 0,
    };
    this.map.set(key, entry as MediaCacheEntry);
    this.bytes += byteSize;
    this.evict();
  }

  delete(key: string): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    this.bytes -= e.byteSize;
    this.map.delete(key);
    return true;
  }

  /** Drop every entry whose key starts with the given prefix (e.g. project id). */
  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const k of Array.from(this.map.keys())) {
      if (k.startsWith(prefix)) {
        const e = this.map.get(k)!;
        this.bytes -= e.byteSize;
        this.map.delete(k);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  private evict(): void {
    // Map iteration order is insertion order, so the first key is the LRU.
    while ((this.bytes > this.maxBytes || this.map.size > this.maxEntries) && this.map.size > 0) {
      const firstKey = this.map.keys().next().value as string | undefined;
      if (firstKey === undefined) break;
      const e = this.map.get(firstKey);
      if (!e) { this.map.delete(firstKey); continue; }
      this.bytes -= e.byteSize;
      this.map.delete(firstKey);
      this.evictions++;
    }
  }

  getStats(): MediaCacheStats {
    return {
      entries: this.map.size,
      bytes: this.bytes,
      bytesLimit: this.maxBytes,
      entriesLimit: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}

/** Process-wide singleton. */
export const mediaCache = new MediaCacheImpl();

// Consolidation (FINDING 11): CacheRegistry is the owner/registrar of all
// renderer caches, MediaCache included. Register here so registry-driven
// pressure relief (HeapMonitor -> flushAll, IdleResourceBalancer) flushes this
// cache, and diagnostics (getCacheSnapshot) can observe its live byte size,
// without MediaCache's callers needing to know about the registry.
void import('./CacheRegistry').then(({ registerCache }) => {
  registerCache({
    name: 'MediaCache',
    flush: () => {
      const before = mediaCache.getStats().bytes;
      mediaCache.clear();
      return before;
    },
    sizeBytes: () => mediaCache.getStats().bytes,
  });
}).catch(() => { /* ignore -- registry not available (e.g. SSR/test) */ });

// Cooperative shrink under memory pressure -- subscribe lazily to avoid a
// hard import cycle with the renderer-only event bus during SSR/test runs.
if (typeof window !== 'undefined') {
  // Defer import to break SSR hostility; dexBus only exists in renderer.
  void import('../../shared/eventBus').then(({ dexBus }) => {
    (dexBus as unknown as { on: (k: string, fn: (p: { level: string }) => void) => void })
      .on('memory:pressure', (payload) => {
        if (payload.level === 'critical') {
          mediaCache.configure({ maxBytes: 32 * 1024 * 1024, maxEntries: 512 });
        } else if (payload.level === 'high') {
          mediaCache.configure({ maxBytes: 96 * 1024 * 1024, maxEntries: 1024 });
        } else {
          mediaCache.configure({ maxBytes: DEFAULT_MAX_BYTES, maxEntries: DEFAULT_MAX_ENTRIES });
        }
      });
  }).catch(() => { /* ignore -- bus not available */ });
}
