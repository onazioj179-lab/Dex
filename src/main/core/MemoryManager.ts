// ═══════════════════════════════════════════════════════════════════════════
// DEX - Memory Manager
// Phase 15: Deep Internal Micro-Optimization
// Enforces stable memory usage with bounded caches and automatic cleanup
// ═══════════════════════════════════════════════════════════════════════════

import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDED CACHE - LRU with TTL support
// ═══════════════════════════════════════════════════════════════════════════

export interface CacheOptions {
  maxSize: number;           // Maximum number of entries
  maxMemoryMB?: number;      // Optional memory limit
  ttlMs?: number;            // Time-to-live in milliseconds
  onEvict?: (key: string, value: any) => void;
}

interface CacheEntry<T> {
  value: T;
  accessedAt: number;
  createdAt: number;
  sizeBytes?: number;
}

export class BoundedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private totalBytes = 0;
  private options: Required<CacheOptions>;

  constructor(options: CacheOptions) {
    this.options = {
      maxSize: options.maxSize,
      maxMemoryMB: options.maxMemoryMB ?? Infinity,
      ttlMs: options.ttlMs ?? Infinity,
      onEvict: options.onEvict ?? (() => {}),
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    // Update access order (move to end)
    entry.accessedAt = Date.now();
    this.moveToEnd(key);

    return entry.value;
  }

  set(key: string, value: T, sizeBytes?: number): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const entry: CacheEntry<T> = {
      value,
      accessedAt: Date.now(),
      createdAt: Date.now(),
      sizeBytes,
    };

    // Evict if necessary before adding
    while (this.shouldEvict(sizeBytes)) {
      this.evictOne();
    }

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    if (sizeBytes) this.totalBytes += sizeBytes;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.sizeBytes) this.totalBytes -= entry.sizeBytes;
    this.options.onEvict(key, entry.value);
    this.cache.delete(key);
    this.removeFromOrder(key);

    return true;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    for (const [key, entry] of this.cache) {
      this.options.onEvict(key, entry.value);
    }
    this.cache.clear();
    this.accessOrder = [];
    this.totalBytes = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get memoryUsageMB(): number {
    return this.totalBytes / (1024 * 1024);
  }

  // Cleanup expired entries
  prune(): number {
    let pruned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry, now)) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  private isExpired(entry: CacheEntry<T>, now = Date.now()): boolean {
    return (now - entry.createdAt) > this.options.ttlMs;
  }

  private shouldEvict(additionalBytes = 0): boolean {
    if (this.cache.size >= this.options.maxSize) return true;
    if (this.options.maxMemoryMB !== Infinity) {
      const projectedMB = (this.totalBytes + additionalBytes) / (1024 * 1024);
      if (projectedMB > this.options.maxMemoryMB) return true;
    }
    return false;
  }

  private evictOne(): void {
    if (this.accessOrder.length === 0) return;
    
    // Evict least recently used (first in order)
    const key = this.accessOrder[0];
    this.delete(key);
  }

  private moveToEnd(key: string): void {
    this.removeFromOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEAK REFERENCE CACHE - For large objects that can be GC'd
// ═══════════════════════════════════════════════════════════════════════════

export class WeakCache<T extends object> {
  private cache = new Map<string, WeakRef<T>>();
  private registry: FinalizationRegistry<string>;

  constructor() {
    this.registry = new FinalizationRegistry((key: string) => {
      this.cache.delete(key);
    });
  }

  get(key: string): T | undefined {
    const ref = this.cache.get(key);
    return ref?.deref();
  }

  set(key: string, value: T): void {
    const ref = new WeakRef(value);
    this.cache.set(key, ref);
    this.registry.register(value, key);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  // Get count of still-valid references
  get activeSize(): number {
    let count = 0;
    for (const [, ref] of this.cache) {
      if (ref.deref() !== undefined) count++;
    }
    return count;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY MONITOR
// ═══════════════════════════════════════════════════════════════════════════

export interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssKB: number;
  pressure: 'low' | 'medium' | 'high' | 'critical';
}

export interface MemoryManagerOptions {
  checkIntervalMs?: number;
  highPressureThresholdMB?: number;
  criticalPressureThresholdMB?: number;
  onPressureChange?: (pressure: MemoryStats['pressure']) => void;
}

class MemoryManagerClass {
  private caches: Map<string, BoundedCache<any>> = new Map();
  private weakCaches: Map<string, WeakCache<any>> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private lastPressure: MemoryStats['pressure'] = 'low';
  private options: Required<MemoryManagerOptions>;

  constructor() {
    this.options = {
      checkIntervalMs: 120000, // Check every 2 minutes - reduced monitoring overhead
      highPressureThresholdMB: 512,  // Relaxed: trigger cleanup at 512MB
      criticalPressureThresholdMB: 1024, // Relaxed: emergency at 1GB
      onPressureChange: () => {},
    };
  }

  configure(options: MemoryManagerOptions): void {
    this.options = { ...this.options, ...options };
  }

  // Create or retrieve a named bounded cache
  createCache<T>(name: string, options: CacheOptions): BoundedCache<T> {
    if (this.caches.has(name)) {
      return this.caches.get(name) as BoundedCache<T>;
    }

    const cache = new BoundedCache<T>(options);
    this.caches.set(name, cache);
    return cache;
  }

  // Create or retrieve a named weak cache
  createWeakCache<T extends object>(name: string): WeakCache<T> {
    if (this.weakCaches.has(name)) {
      return this.weakCaches.get(name) as WeakCache<T>;
    }

    const cache = new WeakCache<T>();
    this.weakCaches.set(name, cache);
    return cache;
  }

  getCache<T>(name: string): BoundedCache<T> | undefined {
    return this.caches.get(name) as BoundedCache<T> | undefined;
  }

  // Start monitoring memory pressure
  startMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkPressure();
    }, this.options.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Get current memory statistics
  getStats(): MemoryStats {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / (1024 * 1024);
    const heapTotalMB = usage.heapTotal / (1024 * 1024);

    let pressure: MemoryStats['pressure'] = 'low';
    if (heapUsedMB > this.options.criticalPressureThresholdMB) {
      pressure = 'critical';
    } else if (heapUsedMB > this.options.highPressureThresholdMB) {
      pressure = 'high';
    } else if (heapUsedMB > this.options.highPressureThresholdMB * 0.7) {
      pressure = 'medium';
    }

    return {
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      externalMB: Math.round(usage.external / (1024 * 1024) * 100) / 100,
      rssKB: Math.round(usage.rss / 1024),
      pressure,
    };
  }

  // Force garbage collection (if exposed)
  forceGC(): void {
    if (global.gc) {
      global.gc();
      log.info('[MemoryManager] Forced garbage collection');
    }
  }

  // Prune all caches
  pruneAll(): void {
    let totalPruned = 0;
    for (const [name, cache] of this.caches) {
      const pruned = cache.prune();
      if (pruned > 0) {
        log.debug(`[MemoryManager] Pruned ${pruned} entries from ${name}`);
        totalPruned += pruned;
      }
    }
    if (totalPruned > 0) {
      log.info(`[MemoryManager] Total pruned: ${totalPruned} entries`);
    }
  }

  // Clear all caches in emergency
  emergencyClear(): void {
    log.warn('[MemoryManager] Emergency clear triggered');
    for (const [name, cache] of this.caches) {
      cache.clear();
      log.info(`[MemoryManager] Cleared cache: ${name}`);
    }
  }

  // Alias for ResourceGovernor integration
  pruneOld(): void {
    this.pruneAll();
  }

  // Clear all caches completely
  clearAll(): void {
    this.emergencyClear();
    this.forceGC();
  }

  private checkPressure(): void {
    const stats = this.getStats();

    if (stats.pressure !== this.lastPressure) {
      log.info(`[MemoryManager] Pressure changed: ${this.lastPressure} -> ${stats.pressure}`);
      this.lastPressure = stats.pressure;
      this.options.onPressureChange(stats.pressure);

      // Auto-respond to pressure
      if (stats.pressure === 'high') {
        this.pruneAll();
      } else if (stats.pressure === 'critical') {
        this.pruneAll();
        this.forceGC();
      }
    }
  }

  // Get summary of all managed caches
  getCacheSummary(): Record<string, { size: number; memoryMB: number }> {
    const summary: Record<string, { size: number; memoryMB: number }> = {};
    for (const [name, cache] of this.caches) {
      summary[name] = {
        size: cache.size,
        memoryMB: cache.memoryUsageMB,
      };
    }
    return summary;
  }
}

// Singleton instance
export const memoryManager = new MemoryManagerClass();

// ═══════════════════════════════════════════════════════════════════════════
// BUFFER POOL - Reuse buffers to reduce allocations
// ═══════════════════════════════════════════════════════════════════════════

export class BufferPool {
  private pool: Buffer[] = [];
  private maxPoolSize: number;
  private defaultBufferSize: number;

  constructor(maxPoolSize = 10, defaultBufferSize = 64 * 1024) {
    this.maxPoolSize = maxPoolSize;
    this.defaultBufferSize = defaultBufferSize;
  }

  acquire(size?: number): Buffer {
    const targetSize = size ?? this.defaultBufferSize;

    // Try to find a suitable buffer in the pool
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].length >= targetSize) {
        const buffer = this.pool.splice(i, 1)[0];
        return buffer.slice(0, targetSize);
      }
    }

    // Allocate new buffer
    return Buffer.allocUnsafe(targetSize);
  }

  release(buffer: Buffer): void {
    if (this.pool.length < this.maxPoolSize) {
      // Clear sensitive data
      buffer.fill(0);
      this.pool.push(buffer);
    }
    // If pool is full, let the buffer be garbage collected
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

export const bufferPool = new BufferPool();
