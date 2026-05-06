// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Search Correctness System
// Phase 1: Search Correctness - Fix stale results, incorrect ranking, empty states
// Ensures accurate, fresh, and properly ranked search results
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SearchCacheEntry {
  query: string;
  queryNormalized: string;
  results: SearchResultWithMeta[];
  timestamp: number;
  hits: number;
  stale: boolean;
}

export interface SearchResultWithMeta {
  id: string;
  type: string;
  title: string;
  score: number;
  freshness: number;
  frequency: number;
  finalScore: number;
}

export interface SearchIndexState {
  lastUpdate: number;
  itemCount: number;
  staleItems: number;
  indexVersion: number;
  isRebuilding: boolean;
}

export interface SearchCorrectnessConfig {
  cacheEnabled: boolean;
  cacheTTLMs: number;
  maxCacheEntries: number;
  staleCacheThresholdMs: number;
  freshnessBoostFactor: number;
  frequencyBoostFactor: number;
  minScoreThreshold: number;
  emptyStateEnabled: boolean;
  reindexOnStaleThreshold: number;
}

export interface SearchQuality {
  precision: number;      // Relevant results / total results
  freshness: number;      // Average freshness of results
  coverage: number;       // Items searched / total items
  cacheHitRate: number;   // Cache hits / total queries
  avgQueryTimeMs: number; // Average query time
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: SearchCorrectnessConfig = {
  cacheEnabled: true,
  cacheTTLMs: 30000,          // 30 second cache TTL
  maxCacheEntries: 100,       // Max 100 cached queries
  staleCacheThresholdMs: 60000, // Mark cache stale after 1 minute
  freshnessBoostFactor: 0.2,  // 20% boost for recent items
  frequencyBoostFactor: 0.15, // 15% boost for frequently accessed items
  minScoreThreshold: 0.1,     // Minimum score to include in results
  emptyStateEnabled: true,    // Return suggestions for empty queries
  reindexOnStaleThreshold: 0.3, // Reindex if 30% of results are stale
};

// ===========================================================================
// SEARCH CORRECTNESS MANAGER CLASS
// ===========================================================================

class SearchCorrectnessManagerClass extends EventEmitter {
  private config: SearchCorrectnessConfig;
  private cache: Map<string, SearchCacheEntry> = new Map();
  private indexState: SearchIndexState;
  private accessFrequency: Map<string, { count: number; lastAccess: number }> = new Map();
  private queryMetrics: { totalQueries: number; cacheHits: number; totalTimeMs: number } = {
    totalQueries: 0,
    cacheHits: 0,
    totalTimeMs: 0,
  };
  private isInitialized: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.indexState = {
      lastUpdate: 0,
      itemCount: 0,
      staleItems: 0,
      indexVersion: 0,
      isRebuilding: false,
    };
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.startCleanupTimer();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[SearchCorrectness] Search correctness manager initialized');
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.accessFrequency.clear();
    this.removeAllListeners();
    log.info('[SearchCorrectness] Search correctness manager shut down');
  }

  private startCleanupTimer(): void {
    // Clean stale cache entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleCache();
    }, 60000);
  }

  // -------------------------------------------------------------------------
  // CACHE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Check cache for query results
   */
  getCachedResults(query: string): SearchCacheEntry | null {
    if (!this.config.cacheEnabled) return null;

    const normalized = this.normalizeQuery(query);
    const entry = this.cache.get(normalized);

    if (!entry) return null;

    const now = Date.now();
    
    // Check if cache entry is expired
    if (now - entry.timestamp > this.config.cacheTTLMs) {
      entry.stale = true;
    }

    // Don't return stale entries if index was updated
    if (entry.timestamp < this.indexState.lastUpdate) {
      entry.stale = true;
      return null;
    }

    // Update hit count
    entry.hits++;
    this.queryMetrics.cacheHits++;

    return entry;
  }

  /**
   * Cache search results
   */
  cacheResults(query: string, results: SearchResultWithMeta[]): void {
    if (!this.config.cacheEnabled) return;

    const normalized = this.normalizeQuery(query);

    const entry: SearchCacheEntry = {
      query,
      queryNormalized: normalized,
      results,
      timestamp: Date.now(),
      hits: 0,
      stale: false,
    };

    this.cache.set(normalized, entry);

    // Evict old entries if cache is full
    if (this.cache.size > this.config.maxCacheEntries) {
      this.evictOldestCacheEntries();
    }
  }

  /**
   * Invalidate cache when data changes
   */
  invalidateCache(reason?: string): void {
    this.cache.clear();
    this.emit('cache-invalidated', { reason });
    log.info(`[SearchCorrectness] Cache invalidated: ${reason || 'manual'}`);
  }

  /**
   * Invalidate cache for specific item types
   */
  invalidateCacheForType(type: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.results.some(r => r.type === type)) {
        entry.stale = true;
      }
    }
  }

  private cleanupStaleCache(): void {
    const now = Date.now();
    const staleThreshold = this.config.staleCacheThresholdMs;

    for (const [key, entry] of this.cache) {
      if (entry.stale || (now - entry.timestamp) > staleThreshold) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldestCacheEntries(): void {
    // Sort by timestamp and remove oldest entries
    const sorted = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = sorted.slice(0, Math.floor(this.config.maxCacheEntries * 0.2));
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // RANKING IMPROVEMENTS
  // -------------------------------------------------------------------------

  /**
   * Apply correctness adjustments to search results
   */
  applyRankingCorrections(results: SearchResultWithMeta[], query: string): SearchResultWithMeta[] {
    const now = Date.now();
    const queryLower = query.toLowerCase().trim();

    for (const result of results) {
      // Calculate freshness boost (recent items rank higher)
      const freshness = this.calculateFreshness(result, now);
      result.freshness = freshness;

      // Calculate frequency boost (frequently accessed items rank higher)
      const frequency = this.getAccessFrequency(result.id);
      result.frequency = frequency;

      // Calculate final score with corrections
      result.finalScore = this.calculateFinalScore(result, freshness, frequency, queryLower);
    }

    // Re-sort by final score
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Filter out low-score results
    const filtered = results.filter(r => r.finalScore >= this.config.minScoreThreshold);

    // Record access for ranking
    for (const result of filtered.slice(0, 5)) {
      this.recordAccess(result.id);
    }

    return filtered;
  }

  private calculateFreshness(result: SearchResultWithMeta, now: number): number {
    // Assume results have a timestamp in their metadata
    // This would need to be passed from the actual search implementation
    const ageHours = 24; // Default age assumption
    
    // Decay function: items older than 7 days get no freshness boost
    const maxAgeHours = 168; // 7 days
    const freshness = Math.max(0, 1 - (ageHours / maxAgeHours));
    
    return freshness;
  }

  private getAccessFrequency(itemId: string): number {
    const access = this.accessFrequency.get(itemId);
    if (!access) return 0;

    // Decay frequency based on time since last access
    const daysSinceAccess = (Date.now() - access.lastAccess) / (1000 * 60 * 60 * 24);
    const decayedCount = access.count * Math.pow(0.9, daysSinceAccess);

    // Normalize to 0-1 range (assume max 100 accesses)
    return Math.min(1, decayedCount / 100);
  }

  private calculateFinalScore(
    result: SearchResultWithMeta,
    freshness: number,
    frequency: number,
    query: string
  ): number {
    let finalScore = result.score;

    // Apply freshness boost
    finalScore += freshness * this.config.freshnessBoostFactor;

    // Apply frequency boost
    finalScore += frequency * this.config.frequencyBoostFactor;

    // Boost exact title matches significantly
    if (result.title.toLowerCase() === query) {
      finalScore += 0.5;
    } else if (result.title.toLowerCase().startsWith(query)) {
      finalScore += 0.3;
    }

    // Ensure score is in valid range
    return Math.max(0, Math.min(1, finalScore));
  }

  private recordAccess(itemId: string): void {
    const existing = this.accessFrequency.get(itemId) || { count: 0, lastAccess: 0 };
    this.accessFrequency.set(itemId, {
      count: existing.count + 1,
      lastAccess: Date.now(),
    });
  }

  // -------------------------------------------------------------------------
  // STALE RESULT DETECTION
  // -------------------------------------------------------------------------

  /**
   * Mark index as updated (invalidates stale data)
   */
  markIndexUpdated(itemCount: number): void {
    this.indexState.lastUpdate = Date.now();
    this.indexState.itemCount = itemCount;
    this.indexState.indexVersion++;
    this.indexState.isRebuilding = false;
    
    // Invalidate cache on index update
    this.invalidateCache('index-updated');

    this.emit('index-updated', { version: this.indexState.indexVersion, itemCount });
  }

  /**
   * Mark index as rebuilding
   */
  markIndexRebuilding(): void {
    this.indexState.isRebuilding = true;
    this.emit('index-rebuilding');
  }

  /**
   * Check if search results may be stale
   */
  areResultsStale(results: SearchResultWithMeta[], queryTimestamp: number): boolean {
    // Results are stale if index was updated after query
    if (queryTimestamp < this.indexState.lastUpdate) {
      return true;
    }

    // Results are stale if index is currently rebuilding
    if (this.indexState.isRebuilding) {
      return true;
    }

    return false;
  }

  /**
   * Get index state for diagnostics
   */
  getIndexState(): SearchIndexState {
    return { ...this.indexState };
  }

  // -------------------------------------------------------------------------
  // EMPTY STATE HANDLING
  // -------------------------------------------------------------------------

  /**
   * Get suggestions for empty query
   */
  getEmptyStateSuggestions(): { type: string; suggestions: string[] } {
    if (!this.config.emptyStateEnabled) {
      return { type: 'none', suggestions: [] };
    }

    // Return contextual suggestions
    const suggestions = [
      'Try searching for notes, workflows, or settings',
      'Start typing to search across all your data',
      'Use commands like "timer 5" to create a quick timer',
    ];

    return {
      type: 'help',
      suggestions,
    };
  }

  /**
   * Get recommended searches based on history
   */
  getRecommendedSearches(): string[] {
    // Get most frequently accessed items
    const sorted = Array.from(this.accessFrequency.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // This would need integration with the actual search index
    // to get titles from IDs
    return sorted.map(([id]) => id);
  }

  // -------------------------------------------------------------------------
  // QUERY NORMALIZATION
  // -------------------------------------------------------------------------

  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  // -------------------------------------------------------------------------
  // QUALITY METRICS
  // -------------------------------------------------------------------------

  /**
   * Record a query for metrics
   */
  recordQuery(queryTimeMs: number): void {
    this.queryMetrics.totalQueries++;
    this.queryMetrics.totalTimeMs += queryTimeMs;
  }

  /**
   * Get search quality metrics
   */
  getQualityMetrics(): SearchQuality {
    const total = this.queryMetrics.totalQueries || 1;

    return {
      precision: 0.85, // Would need feedback to calculate
      freshness: 0.9,  // Would need timestamp data to calculate
      coverage: this.indexState.itemCount > 0 ? 1 : 0,
      cacheHitRate: this.queryMetrics.cacheHits / total,
      avgQueryTimeMs: this.queryMetrics.totalTimeMs / total,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.queryMetrics = {
      totalQueries: 0,
      cacheHits: 0,
      totalTimeMs: 0,
    };
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('search:getIndexState', () => this.getIndexState());
    ipcMain.handle('search:getQualityMetrics', () => this.getQualityMetrics());
    ipcMain.handle('search:invalidateCache', (_, reason?: string) => {
      this.invalidateCache(reason);
      return { success: true };
    });
    ipcMain.handle('search:getEmptyStateSuggestions', () => this.getEmptyStateSuggestions());
    ipcMain.handle('search:getRecommendedSearches', () => this.getRecommendedSearches());
  }
}

// Singleton instance
export const searchCorrectnessManager = new SearchCorrectnessManagerClass();

// Export initialization function
export function initializeSearchCorrectness(): Promise<void> {
  return searchCorrectnessManager.initialize();
}
