// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Under the Hood (Phase 4: Items 1026-1125)
// Performance optimizations, caching, workers, memory management, database
// =============================================================================

// =============================================================================
// PERFORMANCE OPTIMIZATIONS (Items 1026-1045)
// =============================================================================

// ---------------------------------------------------------------------------
// 1026-1028. Virtual List with Dynamic Heights
// ---------------------------------------------------------------------------

export interface VirtualListConfig {
  containerHeight: number;
  estimatedItemHeight: number;
  overscan: number;
  scrollingDelay: number;
}

export interface VirtualListState {
  scrollTop: number;
  visibleRange: { start: number; end: number };
  heights: Map<number, number>;
  offsets: number[];
  totalHeight: number;
  isScrolling: boolean;
}

export function createVirtualListState(
  itemCount: number,
  config: VirtualListConfig
): VirtualListState {
  const heights = new Map<number, number>();
  const offsets = new Array(itemCount).fill(0);
  let offset = 0;
  
  for (let i = 0; i < itemCount; i++) {
    offsets[i] = offset;
    offset += config.estimatedItemHeight;
  }
  
  return {
    scrollTop: 0,
    visibleRange: { start: 0, end: Math.ceil(config.containerHeight / config.estimatedItemHeight) + config.overscan },
    heights,
    offsets,
    totalHeight: offset,
    isScrolling: false,
  };
}

export function updateVirtualListScroll(
  state: VirtualListState,
  scrollTop: number,
  config: VirtualListConfig
): VirtualListState {
  let start = 0;
  let end = state.offsets.length - 1;
  
  while (start < end) {
    const mid = Math.floor((start + end) / 2);
    if (state.offsets[mid] < scrollTop) {
      start = mid + 1;
    } else {
      end = mid;
    }
  }
  
  const visibleStart = Math.max(0, start - config.overscan);
  const visibleEnd = Math.min(
    state.offsets.length - 1,
    start + Math.ceil(config.containerHeight / config.estimatedItemHeight) + config.overscan
  );
  
  return {
    ...state,
    scrollTop,
    visibleRange: { start: visibleStart, end: visibleEnd },
    isScrolling: true,
  };
}

export function measureVirtualListItem(
  state: VirtualListState,
  index: number,
  height: number,
  estimatedHeight: number
): VirtualListState {
  if (state.heights.get(index) === height) return state;
  
  const heights = new Map(state.heights);
  heights.set(index, height);
  
  const offsets = [...state.offsets];
  let offset = index > 0 ? offsets[index - 1] + (heights.get(index - 1) || estimatedHeight) : 0;
  
  for (let i = index; i < offsets.length; i++) {
    offsets[i] = offset;
    offset += heights.get(i) || estimatedHeight;
  }
  
  return { ...state, heights, offsets, totalHeight: offset };
}

// ---------------------------------------------------------------------------
// 1029-1031. Request Animation Frame Batching
// ---------------------------------------------------------------------------

type RAFCallback = (deltaTime: number) => void;

interface RAFBatcher {
  subscribe: (id: string, callback: RAFCallback, priority?: number) => void;
  unsubscribe: (id: string) => void;
  pause: () => void;
  resume: () => void;
  isRunning: boolean;
}

export function createRAFBatcher(): RAFBatcher {
  const callbacks = new Map<string, { callback: RAFCallback; priority: number }>();
  let animationFrameId: number | null = null;
  let lastTime = 0;
  let isRunning = false;
  
  const tick = (currentTime: number) => {
    if (!isRunning) return;
    
    const deltaTime = lastTime ? currentTime - lastTime : 16.67;
    lastTime = currentTime;
    
    const sorted = Array.from(callbacks.values()).sort((a, b) => b.priority - a.priority);
    for (const { callback } of sorted) {
      try {
        callback(deltaTime);
      } catch (e) {
        console.error('RAFBatcher callback error:', e);
      }
    }
    
    animationFrameId = requestAnimationFrame(tick);
  };
  
  return {
    subscribe(id: string, callback: RAFCallback, priority = 0) {
      callbacks.set(id, { callback, priority });
      if (!isRunning) {
        isRunning = true;
        animationFrameId = requestAnimationFrame(tick);
      }
    },
    unsubscribe(id: string) {
      callbacks.delete(id);
      if (callbacks.size === 0 && animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        isRunning = false;
      }
    },
    pause() {
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    resume() {
      if (!isRunning && callbacks.size > 0) {
        isRunning = true;
        lastTime = 0;
        animationFrameId = requestAnimationFrame(tick);
      }
    },
    get isRunning() { return isRunning; },
  };
}

// ---------------------------------------------------------------------------
// 1032-1034. Debounce & Throttle Utilities
// ---------------------------------------------------------------------------

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean; maxWait?: number } = {}
): T & { cancel: () => void; flush: () => void } {
  const { leading = false, trailing = true, maxWait } = options;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let result: ReturnType<T>;
  
  const invokeFunc = () => {
    if (lastArgs) {
      result = fn.apply(lastThis, lastArgs) as ReturnType<T>;
      lastArgs = null;
      lastThis = null;
    }
    return result;
  };
  
  const startTimer = () => {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (trailing && lastArgs) {
        invokeFunc();
      }
    }, delay);
  };
  
  const debounced = function(this: unknown, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    
    if (leading && !timeoutId) {
      result = invokeFunc();
    }
    
    if (timeoutId) clearTimeout(timeoutId);
    startTimer();
    
    if (maxWait && !maxTimeoutId) {
      maxTimeoutId = setTimeout(() => {
        maxTimeoutId = null;
        if (timeoutId) clearTimeout(timeoutId);
        invokeFunc();
        startTimer();
      }, maxWait);
    }
    
    return result;
  } as T & { cancel: () => void; flush: () => void };
  
  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (maxTimeoutId) clearTimeout(maxTimeoutId);
    timeoutId = null;
    maxTimeoutId = null;
    lastArgs = null;
  };
  
  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    return invokeFunc();
  };
  
  return debounced;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void } {
  const { leading = true, trailing = true } = options;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let result: ReturnType<T>;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;
  
  const throttled = function(this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = limit - (now - lastCallTime);
    
    lastArgs = args;
    lastThis = this;
    
    if (remaining <= 0 || remaining > limit) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      if (leading) {
        result = fn.apply(lastThis, lastArgs) as ReturnType<T>;
        lastArgs = null;
        lastThis = null;
      }
    } else if (!timeoutId && trailing) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        if (trailing && lastArgs) {
          result = fn.apply(lastThis, lastArgs) as ReturnType<T>;
          lastArgs = null;
          lastThis = null;
        }
      }, remaining);
    }
    
    return result;
  } as T & { cancel: () => void };
  
  throttled.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    lastArgs = null;
    lastCallTime = 0;
  };
  
  return throttled;
}

// ---------------------------------------------------------------------------
// 1035-1037. Intersection Observer Pool
// ---------------------------------------------------------------------------

interface ObserverEntry {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
}

class IntersectionObserverPool {
  private observers = new Map<string, IntersectionObserver>();
  private callbacks = new Map<string, ObserverEntry>();
  
  private getKey(options: IntersectionObserverInit): string {
    return JSON.stringify({
      root: options.root,
      rootMargin: options.rootMargin || '0px',
      threshold: options.threshold || 0,
    });
  }
  
  observe(
    element: Element,
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {}
  ): () => void {
    const key = this.getKey(options);
    
    if (!this.observers.has(key)) {
      const observer = new IntersectionObserver((entries, obs) => {
        const entry = this.callbacks.get(key);
        if (entry) {
          const relevantEntries = entries.filter(e => entry.elements.has(e.target));
          if (relevantEntries.length > 0) {
            entry.callback(relevantEntries, obs);
          }
        }
      }, options);
      
      this.observers.set(key, observer);
      this.callbacks.set(key, { callback, elements: new Set() });
    }
    
    const observer = this.observers.get(key)!;
    const entry = this.callbacks.get(key)!;
    
    entry.elements.add(element);
    entry.callback = callback;
    observer.observe(element);
    
    return () => {
      observer.unobserve(element);
      entry.elements.delete(element);
      
      if (entry.elements.size === 0) {
        observer.disconnect();
        this.observers.delete(key);
        this.callbacks.delete(key);
      }
    };
  }
}

export const intersectionObserverPool = new IntersectionObserverPool();

// ---------------------------------------------------------------------------
// 1038-1045. Performance Monitoring
// ---------------------------------------------------------------------------

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage?: number;
  longTasks: number;
  layoutShifts: number;
  inputDelay: number;
}

export function createPerformanceMonitor(): {
  start: () => void;
  stop: () => void;
  getMetrics: () => PerformanceMetrics;
  onMetricsUpdate: (callback: (metrics: PerformanceMetrics) => void) => () => void;
} {
  let isRunning = false;
  let rafId: number | null = null;
  let lastTime = 0;
  let frameCount = 0;
  let fpsUpdateTime = 0;
  const callbacks: Set<(metrics: PerformanceMetrics) => void> = new Set();
  
  const metrics: PerformanceMetrics = {
    fps: 60,
    frameTime: 16.67,
    memoryUsage: undefined,
    longTasks: 0,
    layoutShifts: 0,
    inputDelay: 0,
  };
  
  let longTaskObserver: PerformanceObserver | null = null;
  let layoutShiftObserver: PerformanceObserver | null = null;
  
  const tick = (currentTime: number) => {
    if (!isRunning) return;
    
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    frameCount++;
    
    metrics.frameTime = deltaTime;
    
    if (currentTime - fpsUpdateTime >= 1000) {
      metrics.fps = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
      frameCount = 0;
      fpsUpdateTime = currentTime;
      
      if ('memory' in performance) {
        const memory = (performance as { memory: { usedJSHeapSize: number } }).memory;
        metrics.memoryUsage = memory.usedJSHeapSize;
      }
      
      callbacks.forEach(cb => cb({ ...metrics }));
    }
    
    rafId = requestAnimationFrame(tick);
  };
  
  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      lastTime = performance.now();
      fpsUpdateTime = lastTime;
      frameCount = 0;
      
      rafId = requestAnimationFrame(tick);
      
      try {
        longTaskObserver = new PerformanceObserver((list) => {
          metrics.longTasks += list.getEntries().length;
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch { /* Not supported */ }
      
      try {
        layoutShiftObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as { hadRecentInput?: boolean }).hadRecentInput) {
              metrics.layoutShifts++;
            }
          }
        });
        layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
      } catch { /* Not supported */ }
    },
    
    stop() {
      isRunning = false;
      if (rafId) cancelAnimationFrame(rafId);
      longTaskObserver?.disconnect();
      layoutShiftObserver?.disconnect();
    },
    
    getMetrics() {
      return { ...metrics };
    },
    
    onMetricsUpdate(callback) {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
  };
}


// =============================================================================
// CACHING SYSTEMS (Items 1046-1060)
// =============================================================================

// ---------------------------------------------------------------------------
// 1046-1050. LRU Cache with TTL
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiry: number | null;
  size: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private currentSize = 0;
  private defaultTTL: number | null;
  
  constructor(options: { maxSize?: number; defaultTTL?: number } = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024;
    this.defaultTTL = options.defaultTTL || null;
  }
  
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (entry.expiry && Date.now() > entry.expiry) {
      this.delete(key);
      return undefined;
    }
    
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  set(key: K, value: V, options: { ttl?: number; size?: number } = {}): void {
    const size = options.size || this.estimateSize(value);
    const ttl = options.ttl ?? this.defaultTTL;
    const expiry = ttl ? Date.now() + ttl : null;
    
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }
    
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      this.delete(oldestKey as K);
    }
    
    this.cache.set(key, { value, expiry, size });
    this.currentSize += size;
  }
  
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }
  
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.delete(key);
      return false;
    }
    return true;
  }
  
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }
  
  get size(): number {
    return this.cache.size;
  }
  
  get memoryUsage(): number {
    return this.currentSize;
  }
  
  private estimateSize(value: V): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return JSON.stringify(value).length * 2;
  }
}

// ---------------------------------------------------------------------------
// 1051-1055. Memoization with Cache Key
// ---------------------------------------------------------------------------

type MemoizeOptions<A extends unknown[], K> = {
  maxSize?: number;
  ttl?: number;
  keyFn?: (...args: A) => K;
};

export function memoize<A extends unknown[], R, K = string>(
  fn: (...args: A) => R,
  options: MemoizeOptions<A, K> = {}
): ((...args: A) => R) & { cache: Map<K, R>; clear: () => void } {
  const {
    maxSize = 100,
    ttl,
    keyFn = ((...args: A) => JSON.stringify(args) as unknown as K),
  } = options;
  
  const cache = new Map<K, { value: R; timestamp: number }>();
  
  const memoized = ((...args: A): R => {
    const key = keyFn(...args);
    const cached = cache.get(key);
    
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
      cache.delete(key);
    }
    
    const result = fn(...args);
    
    if (cache.size >= maxSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey as K);
    }
    
    cache.set(key, { value: result, timestamp: Date.now() });
    return result;
  }) as ((...args: A) => R) & { cache: Map<K, R>; clear: () => void };
  
  memoized.cache = cache as unknown as Map<K, R>;
  memoized.clear = () => cache.clear();
  
  return memoized;
}

// ---------------------------------------------------------------------------
// 1056-1060. Request Deduplication
// ---------------------------------------------------------------------------

type InflightRequest<T> = {
  promise: Promise<T>;
  timestamp: number;
  subscribers: number;
};

export class RequestDeduplicator<K = string, V = unknown> {
  private inflight = new Map<K, InflightRequest<V>>();
  private keyFn: (request: unknown) => K;
  private staleTime: number;
  
  constructor(options: { keyFn?: (request: unknown) => K; staleTime?: number } = {}) {
    this.keyFn = options.keyFn || ((r: unknown) => JSON.stringify(r) as unknown as K);
    this.staleTime = options.staleTime || 0;
  }
  
  async dedupe<T extends V>(
    key: K | unknown,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const cacheKey = typeof key === 'object' ? this.keyFn(key) : key as K;
    
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      if (this.staleTime === 0 || Date.now() - existing.timestamp < this.staleTime) {
        existing.subscribers++;
        return existing.promise as Promise<T>;
      }
      this.inflight.delete(cacheKey);
    }
    
    const promise = requestFn().finally(() => {
      const entry = this.inflight.get(cacheKey);
      if (entry) {
        entry.subscribers--;
        if (entry.subscribers <= 0) {
          this.inflight.delete(cacheKey);
        }
      }
    });
    
    this.inflight.set(cacheKey, {
      promise: promise as Promise<V>,
      timestamp: Date.now(),
      subscribers: 1,
    });
    
    return promise;
  }
  
  get pendingCount(): number {
    return this.inflight.size;
  }
}


// =============================================================================
// MEMORY MANAGEMENT (Items 1076-1090)
// =============================================================================

// ---------------------------------------------------------------------------
// 1076-1080. Object Pool
// ---------------------------------------------------------------------------

export class ObjectPool<T> {
  private pool: T[] = [];
  private activeCount = 0;
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  
  constructor(options: {
    factory: () => T;
    reset?: (obj: T) => void;
    initialSize?: number;
    maxSize?: number;
  }) {
    this.factory = options.factory;
    this.reset = options.reset || (() => {});
    this.maxSize = options.maxSize || 100;
    
    const initialSize = options.initialSize || 10;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }
  
  acquire(): T {
    this.activeCount++;
    
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    return this.factory();
  }
  
  release(obj: T): void {
    this.activeCount--;
    
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }
  
  get available(): number {
    return this.pool.length;
  }
  
  get active(): number {
    return this.activeCount;
  }
  
  clear(): void {
    this.pool.length = 0;
  }
}

// ---------------------------------------------------------------------------
// 1081-1085. Weak Reference Cache
// ---------------------------------------------------------------------------

export class WeakCache<K extends object, V> {
  private cache = new WeakMap<K, V>();
  private registry: FinalizationRegistry<string>;
  private keyTracker = new Map<string, WeakRef<K>>();
  private keyIdCounter = 0;
  
  constructor(onFinalize?: (key: string) => void) {
    this.registry = new FinalizationRegistry((keyId) => {
      this.keyTracker.delete(keyId);
      onFinalize?.(keyId);
    });
  }
  
  get(key: K): V | undefined {
    return this.cache.get(key);
  }
  
  set(key: K, value: V): void {
    const keyId = `key-${++this.keyIdCounter}`;
    this.cache.set(key, value);
    this.keyTracker.set(keyId, new WeakRef(key));
    this.registry.register(key, keyId);
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  get activeCount(): number {
    let count = 0;
    for (const ref of this.keyTracker.values()) {
      if (ref.deref()) count++;
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// 1086-1090. Memory Pressure Detection
// ---------------------------------------------------------------------------

export interface MemoryPressureState {
  level: 'low' | 'moderate' | 'critical';
  usedHeap: number;
  totalHeap: number;
  usagePercent: number;
  timestamp: number;
}

export function createMemoryPressureMonitor(
  config: { lowThreshold?: number; moderateThreshold?: number; criticalThreshold?: number; checkInterval?: number } = {},
  onPressureChange?: (state: MemoryPressureState) => void
): {
  start: () => void;
  stop: () => void;
  getState: () => MemoryPressureState;
} {
  const cfg = {
    lowThreshold: config.lowThreshold || 50,
    moderateThreshold: config.moderateThreshold || 70,
    criticalThreshold: config.criticalThreshold || 85,
    checkInterval: config.checkInterval || 5000,
  };
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentState: MemoryPressureState = {
    level: 'low',
    usedHeap: 0,
    totalHeap: 0,
    usagePercent: 0,
    timestamp: Date.now(),
  };
  
  const check = () => {
    if (!('memory' in performance)) return;
    
    const memory = (performance as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    const usedHeap = memory.usedJSHeapSize;
    const totalHeap = memory.totalJSHeapSize;
    const usagePercent = (usedHeap / totalHeap) * 100;
    
    let level: MemoryPressureState['level'] = 'low';
    if (usagePercent >= cfg.criticalThreshold) {
      level = 'critical';
    } else if (usagePercent >= cfg.moderateThreshold) {
      level = 'moderate';
    }
    
    const newState: MemoryPressureState = {
      level,
      usedHeap,
      totalHeap,
      usagePercent,
      timestamp: Date.now(),
    };
    
    if (newState.level !== currentState.level) {
      onPressureChange?.(newState);
    }
    
    currentState = newState;
  };
  
  return {
    start() {
      check();
      intervalId = setInterval(check, cfg.checkInterval);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    getState() {
      return { ...currentState };
    },
  };
}


// =============================================================================
// DATABASE & TASK SCHEDULING (Items 1091-1125)
// =============================================================================

// ---------------------------------------------------------------------------
// 1091-1100. IndexedDB Wrapper
// ---------------------------------------------------------------------------

export interface DBConfig {
  name: string;
  version: number;
  stores: Array<{
    name: string;
    keyPath: string;
    autoIncrement?: boolean;
    indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>;
  }>;
}

export class IndexedDBWrapper {
  private db: IDBDatabase | null = null;
  private pendingWrites: Map<string, { key: IDBValidKey; value: unknown }[]> = new Map();
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private flushDelay = 100;
  
  constructor(private config: DBConfig) {}
  
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.name, this.config.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        for (const storeConfig of this.config.stores) {
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            const store = db.createObjectStore(storeConfig.name, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.autoIncrement,
            });
            
            for (const index of storeConfig.indexes || []) {
              store.createIndex(index.name, index.keyPath, { unique: index.unique });
            }
          }
        }
      };
    });
  }
  
  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not open');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  
  async getAll<T>(storeName: string, query?: IDBKeyRange, count?: number): Promise<T[]> {
    if (!this.db) throw new Error('Database not open');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll(query, count);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  
  put(storeName: string, value: unknown): void {
    const pending = this.pendingWrites.get(storeName) || [];
    pending.push({ key: '' as IDBValidKey, value });
    this.pendingWrites.set(storeName, pending);
    this.scheduleFlush();
  }
  
  private scheduleFlush(): void {
    if (this.flushTimeout) return;
    
    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flush();
    }, this.flushDelay);
  }
  
  async flush(): Promise<void> {
    if (!this.db || this.pendingWrites.size === 0) return;
    
    const storeNames = Array.from(this.pendingWrites.keys());
    const tx = this.db.transaction(storeNames, 'readwrite');
    
    for (const [storeName, items] of this.pendingWrites) {
      const store = tx.objectStore(storeName);
      for (const { value } of items) {
        store.put(value);
      }
    }
    
    this.pendingWrites.clear();
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  close(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    this.flush();
    this.db?.close();
    this.db = null;
  }
}

// ---------------------------------------------------------------------------
// 1106-1115. Task Scheduler
// ---------------------------------------------------------------------------

export interface ScheduledTask {
  id: string;
  name: string;
  handler: () => Promise<void>;
  schedule: { type: 'interval'; milliseconds: number } | { type: 'once'; at: Date };
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failCount: number;
}

export class TaskScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Set<string>();
  
  schedule(task: Omit<ScheduledTask, 'runCount' | 'failCount'>): string {
    const fullTask: ScheduledTask = { ...task, runCount: 0, failCount: 0 };
    this.tasks.set(task.id, fullTask);
    
    if (task.enabled) {
      this.scheduleNext(task.id);
    }
    
    return task.id;
  }
  
  private scheduleNext(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.enabled) return;
    
    const existingTimeout = this.timeouts.get(taskId);
    if (existingTimeout) clearTimeout(existingTimeout);
    
    let delay: number;
    const now = new Date();
    
    if (task.schedule.type === 'interval') {
      delay = task.schedule.milliseconds;
    } else {
      delay = Math.max(0, task.schedule.at.getTime() - now.getTime());
    }
    
    task.nextRun = new Date(now.getTime() + delay);
    
    const timeout = setTimeout(() => this.runTask(taskId), delay);
    this.timeouts.set(taskId, timeout);
  }
  
  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !task.enabled || this.running.has(taskId)) return;
    
    this.running.add(taskId);
    task.lastRun = new Date();
    
    try {
      await task.handler();
      task.runCount++;
    } catch {
      task.failCount++;
    } finally {
      this.running.delete(taskId);
      
      if (task.schedule.type !== 'once') {
        this.scheduleNext(taskId);
      }
    }
  }
  
  cancel(taskId: string): void {
    const timeout = this.timeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(taskId);
    }
    this.tasks.delete(taskId);
  }
  
  pause(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = false;
      const timeout = this.timeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(taskId);
      }
    }
  }
  
  resume(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = true;
      this.scheduleNext(taskId);
    }
  }
  
  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }
  
  cancelAll(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.tasks.clear();
  }
}

// ---------------------------------------------------------------------------
// 1116-1125. Request Queue with Retry
// ---------------------------------------------------------------------------

export interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  retries: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  priority: number;
}

export class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private activeCount = 0;
  private concurrency: number;
  private defaultRetries: number;
  private resolvers = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  
  constructor(config: { concurrency?: number; defaultRetries?: number } = {}) {
    this.concurrency = config.concurrency || 4;
    this.defaultRetries = config.defaultRetries || 3;
  }
  
  enqueue<T>(
    execute: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number; timeout?: number; priority?: number } = {}
  ): Promise<T> {
    const request: QueuedRequest<T> = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      execute,
      retries: 0,
      maxRetries: options.maxRetries ?? this.defaultRetries,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000,
      priority: options.priority ?? 0,
    };
    
    return new Promise((resolve, reject) => {
      this.resolvers.set(request.id, { resolve: resolve as (v: unknown) => void, reject });
      
      const insertIndex = this.queue.findIndex(r => r.priority < request.priority);
      if (insertIndex === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIndex, 0, request);
      }
      
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const request = this.queue.shift()!;
      this.activeCount++;
      this.executeRequest(request);
    }
  }
  
  private async executeRequest(request: QueuedRequest<unknown>): Promise<void> {
    const { resolve, reject } = this.resolvers.get(request.id)!;
    
    try {
      const result = await Promise.race([
        request.execute(),
        new Promise<never>((_, rej) => 
          setTimeout(() => rej(new Error('Request timeout')), request.timeout)
        ),
      ]);
      
      resolve(result);
      this.resolvers.delete(request.id);
    } catch (error) {
      if (request.retries < request.maxRetries) {
        request.retries++;
        await new Promise(r => setTimeout(r, request.retryDelay * Math.pow(2, request.retries - 1)));
        this.queue.unshift(request);
      } else {
        reject(error as Error);
        this.resolvers.delete(request.id);
      }
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }
  
  get pendingCount(): number {
    return this.queue.length;
  }
  
  clear(): void {
    for (const { reject } of this.resolvers.values()) {
      reject(new Error('Queue cleared'));
    }
    this.queue.length = 0;
    this.resolvers.clear();
  }
}
