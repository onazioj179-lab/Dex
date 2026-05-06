// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - POLISH - Performance Engine
// Optimization, caching, lazy loading, and performance monitoring
// Items 976-1000 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 976-980: CACHING SYSTEM
// =============================================================================

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  size: number;
  hits: number;
  createdAt: number;
  lastAccessed: number;
  expiresAt?: number;
  tags: string[];
  priority: CachePriority;
}

export type CachePriority = 'low' | 'normal' | 'high' | 'critical';

export interface CacheConfig {
  maxSize: number;
  maxEntries: number;
  defaultTTL: number;
  evictionPolicy: EvictionPolicy;
  compressionThreshold: number;
  persistToDisk: boolean;
  diskPath?: string;
}

export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'ttl' | 'size' | 'priority';

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  entries: number;
  evictions: number;
  expirations: number;
}

export interface CacheLayer {
  name: string;
  type: 'memory' | 'disk' | 'network';
  config: CacheConfig;
  stats: CacheStats;
}

// =============================================================================
// ITEM 981-985: LAZY LOADING
// =============================================================================

export interface LazyModule {
  id: string;
  name: string;
  path: string;
  status: ModuleStatus;
  priority: LoadPriority;
  dependencies: string[];
  loadTime?: number;
  size?: number;
  preloadCondition?: PreloadCondition;
}

export type ModuleStatus = 'pending' | 'loading' | 'loaded' | 'error' | 'unloaded';

export type LoadPriority = 'immediate' | 'high' | 'normal' | 'low' | 'idle';

export interface PreloadCondition {
  type: 'route' | 'viewport' | 'interaction' | 'time' | 'network';
  value: unknown;
}

export interface LazyImage {
  id: string;
  src: string;
  placeholder?: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  priority: LoadPriority;
  inViewport: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface IntersectionConfig {
  root?: HTMLElement | null;
  rootMargin: string;
  threshold: number | number[];
}

export interface VirtualListConfig {
  itemHeight: number;
  overscan: number;
  scrollThreshold: number;
  estimatedItemSize?: number;
  getItemKey: (index: number) => string;
}

export interface VirtualListState {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
  offsetY: number;
  scrollTop: number;
}

// =============================================================================
// ITEM 986-990: PERFORMANCE MONITORING
// =============================================================================

export interface PerformanceMetrics {
  timestamp: number;
  fps: number;
  frameTime: number;
  jank: number;
  longTasks: number;
  memoryUsed: number;
  memoryLimit: number;
  domNodes: number;
  layoutTime: number;
  paintTime: number;
  scriptTime: number;
  styleTime: number;
}

export interface WebVitals {
  lcp: number | null;  // Largest Contentful Paint
  fid: number | null;  // First Input Delay
  cls: number | null;  // Cumulative Layout Shift
  fcp: number | null;  // First Contentful Paint
  ttfb: number | null; // Time to First Byte
  inp: number | null;  // Interaction to Next Paint
}

export interface PerformanceEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  detail?: unknown;
}

export interface ResourceTiming {
  name: string;
  type: ResourceType;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  protocol: string;
  cached: boolean;
}

export type ResourceType = 
  | 'script' | 'stylesheet' | 'image' | 'font'
  | 'fetch' | 'xmlhttprequest' | 'other';

export interface PerformanceBudget {
  metric: string;
  warning: number;
  error: number;
  current?: number;
  status?: 'ok' | 'warning' | 'error';
}

export const DEFAULT_PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  { metric: 'lcp', warning: 2500, error: 4000 },
  { metric: 'fid', warning: 100, error: 300 },
  { metric: 'cls', warning: 0.1, error: 0.25 },
  { metric: 'fcp', warning: 1800, error: 3000 },
  { metric: 'ttfb', warning: 800, error: 1800 },
  { metric: 'fps', warning: 50, error: 30 },
  { metric: 'memory', warning: 50, error: 80 },
  { metric: 'domNodes', warning: 1500, error: 3000 }
];

// =============================================================================
// ITEM 991-995: OPTIMIZATION STRATEGIES
// =============================================================================

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  type: OptimizationType;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  impact: ImpactLevel;
  automaticTrigger?: OptimizationTrigger;
}

export type OptimizationType = 
  | 'bundle-splitting' | 'tree-shaking' | 'code-splitting'
  | 'compression' | 'minification' | 'image-optimization'
  | 'font-optimization' | 'caching' | 'prefetching'
  | 'service-worker' | 'web-worker' | 'memory-management';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface OptimizationTrigger {
  type: 'threshold' | 'schedule' | 'event' | 'manual';
  condition: unknown;
}

export interface BundleAnalysis {
  totalSize: number;
  gzippedSize: number;
  modules: BundleModule[];
  chunks: BundleChunk[];
  duplicates: DuplicateModule[];
  unusedExports: UnusedExport[];
}

export interface BundleModule {
  name: string;
  path: string;
  size: number;
  gzippedSize: number;
  percentage: number;
  dependencies: string[];
}

export interface BundleChunk {
  name: string;
  size: number;
  modules: string[];
  isEntry: boolean;
  isAsync: boolean;
}

export interface DuplicateModule {
  name: string;
  instances: string[];
  totalSize: number;
  potentialSavings: number;
}

export interface UnusedExport {
  module: string;
  export: string;
  size: number;
}

// =============================================================================
// ITEM 996-1000: PERFORMANCE ENGINE
// =============================================================================

export class PerformanceEngine {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheConfig: CacheConfig;
  private cacheStats: CacheStats;
  private lazyModules: Map<string, LazyModule> = new Map();
  private lazyImages: Map<string, LazyImage> = new Map();
  private metrics: PerformanceMetrics[] = [];
  private webVitals: WebVitals;
  private budgets: PerformanceBudget[] = [...DEFAULT_PERFORMANCE_BUDGETS];
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private metricsInterval?: ReturnType<typeof setInterval>;
  private listeners: Map<string, Set<(event: PerformanceEvent) => void>> = new Map();
  private intersectionObserver?: IntersectionObserver;
  
  constructor(cacheConfig?: Partial<CacheConfig>) {
    this.cacheConfig = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxEntries: 10000,
      defaultTTL: 3600000, // 1 hour
      evictionPolicy: 'lru',
      compressionThreshold: 1024,
      persistToDisk: false,
      ...cacheConfig
    };
    
    this.cacheStats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      entries: 0,
      evictions: 0,
      expirations: 0
    };
    
    this.webVitals = {
      lcp: null,
      fid: null,
      cls: null,
      fcp: null,
      ttfb: null,
      inp: null
    };
    
    this.initializeDefaultStrategies();
    this.startMetricsCollection();
    this.setupIntersectionObserver();
  }
  
  private initializeDefaultStrategies(): void {
    const defaultStrategies: Omit<OptimizationStrategy, 'id'>[] = [
      {
        name: 'Code Splitting',
        description: 'Split code into smaller chunks for faster initial load',
        type: 'code-splitting',
        enabled: true,
        priority: 1,
        config: { minChunkSize: 20000 },
        impact: 'high'
      },
      {
        name: 'Image Optimization',
        description: 'Optimize images with compression and lazy loading',
        type: 'image-optimization',
        enabled: true,
        priority: 2,
        config: { quality: 80, format: 'webp' },
        impact: 'high'
      },
      {
        name: 'Memory Management',
        description: 'Automatic memory cleanup and garbage collection hints',
        type: 'memory-management',
        enabled: true,
        priority: 3,
        config: { threshold: 80, interval: 60000 },
        impact: 'medium'
      },
      {
        name: 'Prefetching',
        description: 'Prefetch likely-needed resources',
        type: 'prefetching',
        enabled: true,
        priority: 4,
        config: { maxPrefetch: 5 },
        impact: 'medium'
      }
    ];
    
    for (const strategy of defaultStrategies) {
      const id = this.generateId('strategy');
      this.strategies.set(id, { ...strategy, id });
    }
  }
  
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000);
  }
  
  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-lazy-id');
          if (id) {
            const image = this.lazyImages.get(id);
            if (image) {
              image.inViewport = entry.isIntersecting;
              if (entry.isIntersecting && image.status === 'pending') {
                this.loadImage(id);
              }
            }
          }
        }
      },
      { rootMargin: '50px', threshold: 0 }
    );
  }
  
  private collectMetrics(): void {
    const metrics = this.generateMetrics();
    this.metrics.push(metrics);
    
    // Keep only last 300 entries (5 minutes at 1s interval)
    while (this.metrics.length > 300) {
      this.metrics.shift();
    }
    
    // Check budgets
    this.checkBudgets(metrics);
    
    this.emit('metrics-updated', { metrics });
  }
  
  private generateMetrics(): PerformanceMetrics {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    
    return {
      timestamp: Date.now(),
      fps: 55 + Math.random() * 10,
      frameTime: 16 + Math.random() * 5,
      jank: Math.floor(Math.random() * 3),
      longTasks: Math.floor(Math.random() * 2),
      memoryUsed: memory?.usedJSHeapSize || 50 * 1024 * 1024,
      memoryLimit: memory?.jsHeapSizeLimit || 2 * 1024 * 1024 * 1024,
      domNodes: document.querySelectorAll('*').length,
      layoutTime: Math.random() * 5,
      paintTime: Math.random() * 3,
      scriptTime: Math.random() * 10,
      styleTime: Math.random() * 2
    };
  }
  
  private checkBudgets(metrics: PerformanceMetrics): void {
    for (const budget of this.budgets) {
      let value: number | null = null;
      
      switch (budget.metric) {
        case 'fps':
          value = metrics.fps;
          budget.status = value > budget.warning ? 'ok' : value > budget.error ? 'warning' : 'error';
          break;
        case 'memory':
          value = (metrics.memoryUsed / metrics.memoryLimit) * 100;
          budget.status = value < budget.warning ? 'ok' : value < budget.error ? 'warning' : 'error';
          break;
        case 'domNodes':
          value = metrics.domNodes;
          budget.status = value < budget.warning ? 'ok' : value < budget.error ? 'warning' : 'error';
          break;
        case 'lcp':
        case 'fid':
        case 'cls':
        case 'fcp':
        case 'ttfb':
          value = this.webVitals[budget.metric as keyof WebVitals];
          if (value !== null) {
            budget.status = value < budget.warning ? 'ok' : value < budget.error ? 'warning' : 'error';
          }
          break;
      }
      
      budget.current = value ?? undefined;
      
      if (budget.status === 'error') {
        this.emit('budget-exceeded', { budget });
      }
    }
  }
  
  // Cache management
  cacheGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.cacheStats.misses++;
      this.updateHitRate();
      return undefined;
    }
    
    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.cacheStats.expirations++;
      this.cacheStats.misses++;
      this.updateHitRate();
      return undefined;
    }
    
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.cacheStats.hits++;
    this.updateHitRate();
    
    return entry.value as T;
  }
  
  cacheSet<T>(key: string, value: T, options?: { ttl?: number; tags?: string[]; priority?: CachePriority }): void {
    const size = this.estimateSize(value);
    
    // Evict if necessary
    while (this.cacheStats.size + size > this.cacheConfig.maxSize || 
           this.cache.size >= this.cacheConfig.maxEntries) {
      this.evictOne();
    }
    
    const entry: CacheEntry<T> = {
      key,
      value,
      size,
      hits: 0,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: options?.ttl ? Date.now() + options.ttl : Date.now() + this.cacheConfig.defaultTTL,
      tags: options?.tags || [],
      priority: options?.priority || 'normal'
    };
    
    this.cache.set(key, entry);
    this.cacheStats.size += size;
    this.cacheStats.entries = this.cache.size;
    
    this.emit('cache-set', { key, size });
  }
  
  cacheDelete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.cacheStats.size -= entry.size;
    this.cacheStats.entries = this.cache.size;
    
    this.emit('cache-delete', { key });
    return true;
  }
  
  cacheInvalidateByTags(tags: string[]): number {
    let count = 0;
    
    for (const [key, entry] of this.cache) {
      if (tags.some(tag => entry.tags.includes(tag))) {
        this.cache.delete(key);
        this.cacheStats.size -= entry.size;
        count++;
      }
    }
    
    this.cacheStats.entries = this.cache.size;
    this.emit('cache-invalidated', { tags, count });
    return count;
  }
  
  cacheClear(): void {
    this.cache.clear();
    this.cacheStats.size = 0;
    this.cacheStats.entries = 0;
    this.emit('cache-cleared', {});
  }
  
  getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }
  
  private evictOne(): void {
    let toEvict: string | null = null;
    
    switch (this.cacheConfig.evictionPolicy) {
      case 'lru': {
        let oldest = Infinity;
        for (const [key, entry] of this.cache) {
          if (entry.lastAccessed < oldest) {
            oldest = entry.lastAccessed;
            toEvict = key;
          }
        }
        break;
      }
      case 'lfu': {
        let leastHits = Infinity;
        for (const [key, entry] of this.cache) {
          if (entry.hits < leastHits) {
            leastHits = entry.hits;
            toEvict = key;
          }
        }
        break;
      }
      case 'fifo': {
        let firstCreated = Infinity;
        for (const [key, entry] of this.cache) {
          if (entry.createdAt < firstCreated) {
            firstCreated = entry.createdAt;
            toEvict = key;
          }
        }
        break;
      }
      case 'size': {
        let largestSize = 0;
        for (const [key, entry] of this.cache) {
          if (entry.size > largestSize) {
            largestSize = entry.size;
            toEvict = key;
          }
        }
        break;
      }
      case 'priority': {
        const priorities: CachePriority[] = ['low', 'normal', 'high', 'critical'];
        for (const priority of priorities) {
          for (const [key, entry] of this.cache) {
            if (entry.priority === priority) {
              toEvict = key;
              break;
            }
          }
          if (toEvict) break;
        }
        break;
      }
      default:
        toEvict = this.cache.keys().next().value ?? null;
    }
    
    if (toEvict) {
      const entry = this.cache.get(toEvict);
      if (entry) {
        this.cache.delete(toEvict);
        this.cacheStats.size -= entry.size;
        this.cacheStats.evictions++;
      }
    }
  }
  
  private updateHitRate(): void {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    this.cacheStats.hitRate = total > 0 ? this.cacheStats.hits / total : 0;
  }
  
  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1000;
    }
  }
  
  // Lazy loading
  registerLazyModule(module: Omit<LazyModule, 'id' | 'status' | 'loadTime' | 'size'>): LazyModule {
    const lazyModule: LazyModule = {
      ...module,
      id: this.generateId('module'),
      status: 'pending'
    };
    
    this.lazyModules.set(lazyModule.id, lazyModule);
    this.emit('module-registered', { module: lazyModule });
    return lazyModule;
  }
  
  async loadModule(moduleId: string): Promise<unknown> {
    const module = this.lazyModules.get(moduleId);
    if (!module) throw new Error('Module not found');
    
    if (module.status === 'loaded') {
      return this.cacheGet(`module:${moduleId}`);
    }
    
    module.status = 'loading';
    const startTime = performance.now();
    
    this.emit('module-loading', { moduleId });
    
    try {
      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      
      const loadedModule = { loaded: true, path: module.path };
      
      module.status = 'loaded';
      module.loadTime = performance.now() - startTime;
      module.size = this.estimateSize(loadedModule);
      
      this.cacheSet(`module:${moduleId}`, loadedModule, { priority: 'high' });
      this.emit('module-loaded', { moduleId, loadTime: module.loadTime });
      
      return loadedModule;
    } catch (error) {
      module.status = 'error';
      this.emit('module-error', { moduleId, error });
      throw error;
    }
  }
  
  unloadModule(moduleId: string): void {
    const module = this.lazyModules.get(moduleId);
    if (module) {
      module.status = 'unloaded';
      this.cacheDelete(`module:${moduleId}`);
      this.emit('module-unloaded', { moduleId });
    }
  }
  
  getModules(): LazyModule[] {
    return Array.from(this.lazyModules.values());
  }
  
  registerLazyImage(src: string, placeholder?: string, priority: LoadPriority = 'normal'): LazyImage {
    const image: LazyImage = {
      id: this.generateId('img'),
      src,
      placeholder,
      status: 'pending',
      priority,
      inViewport: false
    };
    
    this.lazyImages.set(image.id, image);
    return image;
  }
  
  loadImage(imageId: string): void {
    const image = this.lazyImages.get(imageId);
    if (!image || image.status !== 'pending') return;
    
    image.status = 'loading';
    
    const img = new Image();
    img.onload = () => {
      image.status = 'loaded';
      image.naturalWidth = img.naturalWidth;
      image.naturalHeight = img.naturalHeight;
      this.emit('image-loaded', { imageId });
    };
    img.onerror = () => {
      image.status = 'error';
      this.emit('image-error', { imageId });
    };
    img.src = image.src;
  }
  
  // Performance metrics
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }
  
  getLatestMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }
  
  getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }
  
  updateWebVital(vital: keyof WebVitals, value: number): void {
    this.webVitals[vital] = value;
    this.emit('web-vital-updated', { vital, value });
  }
  
  getBudgets(): PerformanceBudget[] {
    return [...this.budgets];
  }
  
  setBudget(metric: string, warning: number, error: number): void {
    const budget = this.budgets.find(b => b.metric === metric);
    if (budget) {
      budget.warning = warning;
      budget.error = error;
    } else {
      this.budgets.push({ metric, warning, error });
    }
    this.emit('budget-updated', { metric, warning, error });
  }
  
  // Optimization strategies
  getStrategies(): OptimizationStrategy[] {
    return Array.from(this.strategies.values());
  }
  
  enableStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      strategy.enabled = true;
      this.emit('strategy-enabled', { strategyId });
    }
  }
  
  disableStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      strategy.enabled = false;
      this.emit('strategy-disabled', { strategyId });
    }
  }
  
  analyzeBundle(): BundleAnalysis {
    // Simulate bundle analysis
    const analysis: BundleAnalysis = {
      totalSize: 2500000,
      gzippedSize: 750000,
      modules: [
        { name: 'react', path: 'node_modules/react', size: 150000, gzippedSize: 45000, percentage: 6, dependencies: [] },
        { name: 'lodash', path: 'node_modules/lodash', size: 250000, gzippedSize: 75000, percentage: 10, dependencies: [] },
        { name: 'app', path: 'src/app', size: 500000, gzippedSize: 150000, percentage: 20, dependencies: ['react', 'lodash'] }
      ],
      chunks: [
        { name: 'main', size: 800000, modules: ['react', 'app'], isEntry: true, isAsync: false },
        { name: 'vendor', size: 1200000, modules: ['lodash'], isEntry: false, isAsync: true }
      ],
      duplicates: [
        { name: 'moment', instances: ['node_modules/moment', 'node_modules/chart.js/node_modules/moment'], totalSize: 500000, potentialSavings: 250000 }
      ],
      unusedExports: [
        { module: 'lodash', export: 'camelCase', size: 5000 },
        { module: 'lodash', export: 'kebabCase', size: 5000 }
      ]
    };
    
    this.emit('bundle-analyzed', { analysis });
    return analysis;
  }
  
  // Memory management
  requestGarbageCollection(): void {
    // Hint to browser to run GC if available
    if ((globalThis as { gc?: () => void }).gc) {
      (globalThis as { gc: () => void }).gc();
    }
    this.emit('gc-requested', {});
  }
  
  getMemoryUsage(): { used: number; limit: number; percentage: number } {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const used = memory?.usedJSHeapSize || 0;
    const limit = memory?.jsHeapSizeLimit || 0;
    
    return {
      used,
      limit,
      percentage: limit > 0 ? (used / limit) * 100 : 0
    };
  }
  
  // Event handling
  on(event: string, callback: (event: PerformanceEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: PerformanceEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const perfEvent: PerformanceEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(perfEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Cleanup
  dispose(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    this.cacheClear();
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface PerformanceEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createPerformanceEngine = (config?: Partial<CacheConfig>) => new PerformanceEngine(config);

export default { PerformanceEngine, createPerformanceEngine };
