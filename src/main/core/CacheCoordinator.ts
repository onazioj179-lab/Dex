// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Cache Coordinator
// ==========================================================================
// Rules 23-28: Caching Architecture
// 23. Map-based LRU caches with TTL per domain (via MemoryManager)
// 24. Write-through invalidation -- any write invalidates related cache keys
// 25. Pre-computed analytics cache refreshed on idle
// 26. Pre-built search index for instant Spotlight-style search
// 27. Thumbnail cache with mtime comparison (stale = regenerate)
// 28. Cache size budgets enforced by ResourceGovernor pressure
// ==========================================================================

import * as log from 'electron-log';
import { memoryManager, BoundedCache } from './MemoryManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThumbnailMeta {
  thumbPath: string;
  sourceMtime: number;
  generatedAt: number;
}

interface SearchIndexEntry {
  id: string;
  type: 'app' | 'file' | 'task' | 'setting' | 'action';
  title: string;
  keywords: string[];
  score: number;
  context?: string;
}

interface AnalyticsSnapshot {
  topApps: Array<{ appId: string; launches: number; totalMs: number }>;
  taskCompletionRate: number;
  avgSessionMinutes: number;
  activeDays7: number;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Cache Coordinator
// ---------------------------------------------------------------------------

class CacheCoordinator {
  // Rule 23: Domain caches
  private queryCache!: BoundedCache<any>;
  private thumbnailCache!: BoundedCache<ThumbnailMeta>;
  private searchIndex!: BoundedCache<SearchIndexEntry[]>;
  private analyticsCache!: BoundedCache<AnalyticsSnapshot>;
  private appStateCache!: BoundedCache<any>;

  private initialized = false;
  private idleRefreshInterval: ReturnType<typeof setInterval> | null = null;

  // Rule 24: Write-through invalidation tags
  // Maps a domain tag to a set of cache keys that should be invalidated
  private invalidationMap = new Map<string, Set<string>>();

  initialize(): void {
    if (this.initialized) return;

    // Rule 23: Create domain-specific caches with TTL
    this.queryCache = memoryManager.createCache('query-cache', {
      maxSize: 500,
      maxMemoryMB: 32,
      ttlMs: 300000, // 5 minutes
    });

    this.thumbnailCache = memoryManager.createCache('thumbnail-cache', {
      maxSize: 2000,
      maxMemoryMB: 64,
      ttlMs: 3600000, // 1 hour
    });

    this.searchIndex = memoryManager.createCache('search-index', {
      maxSize: 10,
      ttlMs: 600000, // 10 minutes
    });

    this.analyticsCache = memoryManager.createCache('analytics-cache', {
      maxSize: 20,
      ttlMs: 900000, // 15 minutes
    });

    this.appStateCache = memoryManager.createCache('app-state-cache', {
      maxSize: 100,
      maxMemoryMB: 16,
      ttlMs: 600000, // 10 minutes
    });

    // Rule 25: Refresh analytics cache on idle (every 5 min)
    this.idleRefreshInterval = setInterval(() => {
      this.refreshAnalyticsCacheIfStale();
    }, 300000);

    this.initialized = true;
    log.info('[CacheCoordinator] Initialized (Rules 23-28)');
  }

  // ---------------------------------------------------------------------------
  // Rule 23: Query cache (wrapped DB reads)
  // ---------------------------------------------------------------------------

  getCachedQuery<T>(key: string): T | undefined {
    return this.queryCache.get(key) as T | undefined;
  }

  setCachedQuery(key: string, value: any, domain?: string): void {
    this.queryCache.set(key, value);
    if (domain) {
      this.registerInvalidation(domain, `query:${key}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 24: Write-through invalidation
  // ---------------------------------------------------------------------------

  private registerInvalidation(domain: string, cacheKey: string): void {
    if (!this.invalidationMap.has(domain)) {
      this.invalidationMap.set(domain, new Set());
    }
    this.invalidationMap.get(domain)!.add(cacheKey);
  }

  invalidateDomain(domain: string): number {
    const keys = this.invalidationMap.get(domain);
    if (!keys || keys.size === 0) return 0;

    let invalidated = 0;
    for (const key of keys) {
      if (key.startsWith('query:')) {
        const actualKey = key.slice(6);
        if (this.queryCache.has(actualKey)) {
          this.queryCache.delete(actualKey);
          invalidated++;
        }
      }
    }
    keys.clear();
    return invalidated;
  }

  // Call after any database write
  onWrite(domain: string): void {
    const count = this.invalidateDomain(domain);
    if (count > 0) {
      log.debug(`[CacheCoordinator] Rule 24: Invalidated ${count} cache entries for domain ${domain}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 25: Pre-computed analytics cache
  // ---------------------------------------------------------------------------

  getAnalyticsSnapshot(): AnalyticsSnapshot | undefined {
    return this.analyticsCache.get('latest');
  }

  setAnalyticsSnapshot(snapshot: AnalyticsSnapshot): void {
    this.analyticsCache.set('latest', snapshot);
  }

  private refreshAnalyticsCacheIfStale(): void {
    const existing = this.analyticsCache.get('latest');
    if (existing && Date.now() - existing.generatedAt < 600000) return; // fresh enough
    // Actual computation delegated to analytics worker -- just mark stale
    log.debug('[CacheCoordinator] Rule 25: Analytics cache stale, will refresh on next read');
  }

  // ---------------------------------------------------------------------------
  // Rule 26: Pre-built search index
  // ---------------------------------------------------------------------------

  getSearchIndex(): SearchIndexEntry[] {
    return this.searchIndex.get('global') ?? [];
  }

  setSearchIndex(entries: SearchIndexEntry[]): void {
    this.searchIndex.set('global', entries);
  }

  searchInstant(query: string, limit: number = 20): SearchIndexEntry[] {
    const index = this.getSearchIndex();
    if (index.length === 0 || !query) return [];

    const lower = query.toLowerCase();
    const results: Array<SearchIndexEntry & { matchScore: number }> = [];

    for (const entry of index) {
      let matchScore = 0;
      if (entry.title.toLowerCase().includes(lower)) matchScore += 10;
      for (const kw of entry.keywords) {
        if (kw.toLowerCase().includes(lower)) matchScore += 5;
      }
      if (matchScore > 0) {
        results.push({ ...entry, matchScore: matchScore + entry.score });
      }
    }

    return results
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit)
      .map(({ matchScore, ...rest }) => rest);
  }

  // ---------------------------------------------------------------------------
  // Rule 27: Thumbnail cache with mtime comparison
  // ---------------------------------------------------------------------------

  getThumbnail(filePath: string): ThumbnailMeta | undefined {
    return this.thumbnailCache.get(filePath);
  }

  setThumbnail(filePath: string, meta: ThumbnailMeta): void {
    this.thumbnailCache.set(filePath, meta);
  }

  isThumbnailStale(filePath: string, currentMtime: number): boolean {
    const cached = this.thumbnailCache.get(filePath);
    if (!cached) return true;
    return cached.sourceMtime !== currentMtime;
  }

  // ---------------------------------------------------------------------------
  // Rule 28: App state cache
  // ---------------------------------------------------------------------------

  getCachedAppState(appId: string): any | undefined {
    return this.appStateCache.get(appId);
  }

  setCachedAppState(appId: string, state: any): void {
    this.appStateCache.set(appId, state);
  }

  // ---------------------------------------------------------------------------
  // Pressure response (Rule 28: budgets enforced by ResourceGovernor)
  // ---------------------------------------------------------------------------

  reduceCacheSizes(): void {
    log.info('[CacheCoordinator] Rule 28: Reducing cache sizes due to memory pressure');
    this.queryCache.prune();
    this.thumbnailCache.prune();
    this.searchIndex.prune();
    this.analyticsCache.prune();
    this.appStateCache.prune();
  }

  clearAllCaches(): void {
    this.queryCache.clear();
    this.thumbnailCache.clear();
    this.searchIndex.clear();
    this.analyticsCache.clear();
    this.appStateCache.clear();
    this.invalidationMap.clear();
    log.info('[CacheCoordinator] All caches cleared');
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): Record<string, { size: number; memoryMB: number }> {
    return {
      queryCache: { size: this.queryCache.size, memoryMB: this.queryCache.memoryUsageMB },
      thumbnailCache: { size: this.thumbnailCache.size, memoryMB: this.thumbnailCache.memoryUsageMB },
      searchIndex: { size: this.searchIndex.size, memoryMB: this.searchIndex.memoryUsageMB },
      analyticsCache: { size: this.analyticsCache.size, memoryMB: this.analyticsCache.memoryUsageMB },
      appStateCache: { size: this.appStateCache.size, memoryMB: this.appStateCache.memoryUsageMB },
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    if (this.idleRefreshInterval) {
      clearInterval(this.idleRefreshInterval);
      this.idleRefreshInterval = null;
    }
    this.clearAllCaches();
    this.initialized = false;
    log.info('[CacheCoordinator] Shutdown');
  }
}

export const cacheCoordinator = new CacheCoordinator();

export function initializeCacheCoordinator(): void {
  cacheCoordinator.initialize();
}

export function shutdownCacheCoordinator(): void {
  cacheCoordinator.shutdown();
}
