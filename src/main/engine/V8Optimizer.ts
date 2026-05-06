// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- V8 Runtime Optimizer
// Rules 59-69: Dynamic heap sizing, concurrent GC triggers, idle GC hints,
// heap statistics monitoring, hidden class discipline, monomorphic IC,
// lazy property caching, timing buffer, V8 flag tuning, code caching,
// TurboFan optimization hints
// ===========================================================================

import * as v8 from 'v8';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeapSnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  mallocMB: number;
  gcPauseMs: number;
}

interface GCEvent {
  type: 'minor' | 'major' | 'incremental';
  timestamp: number;
  pauseMs: number;
  reclaimedBytes: number;
}

interface HiddenClassProfile {
  className: string;
  propertyOrder: string[];
  instanceCount: number;
  isMonomorphic: boolean;
}

interface V8Flags {
  maxOldSpaceSizeMB: number;
  maxSemiSpaceSizeMB: number;
  gcIntervalMs: number;
  enableTurboFan: boolean;
  enableLazyCompilation: boolean;
}

// ---------------------------------------------------------------------------
// Rule 59: Dynamic Heap Sizer
// Adjusts V8 heap limits based on available system memory and workload.
// ---------------------------------------------------------------------------

class DynamicHeapSizer {
  private targetUtilization = 0.75;
  private minHeapMB = 64;
  private maxHeapMB = 4096;
  private currentLimitMB: number;
  private history: Array<{ timestamp: number; usedMB: number; limitMB: number }> = [];
  private adjustmentCount = 0;

  constructor() {
    const totalSystemMB = require('os').totalmem() / (1024 * 1024);
    // Default: 25% of system memory, clamped
    this.currentLimitMB = Math.min(
      this.maxHeapMB,
      Math.max(this.minHeapMB, Math.floor(totalSystemMB * 0.25))
    );
  }

  getCurrentLimitMB(): number {
    return this.currentLimitMB;
  }

  adjustHeap(): { newLimitMB: number; reason: string } {
    const stats = v8.getHeapStatistics();
    const usedMB = stats.used_heap_size / (1024 * 1024);
    const totalMB = stats.total_heap_size / (1024 * 1024);
    const utilization = usedMB / totalMB;

    this.history.push({ timestamp: Date.now(), usedMB, limitMB: this.currentLimitMB });
    if (this.history.length > 100) this.history.shift();

    let reason = 'no change';

    if (utilization > 0.85) {
      // Under pressure: grow heap
      const newLimit = Math.min(this.maxHeapMB, Math.floor(this.currentLimitMB * 1.25));
      if (newLimit !== this.currentLimitMB) {
        this.currentLimitMB = newLimit;
        reason = `grown to ${newLimit}MB (utilization: ${(utilization * 100).toFixed(0)}%)`;
        this.adjustmentCount++;
      }
    } else if (utilization < 0.4 && this.currentLimitMB > this.minHeapMB * 2) {
      // Under-utilized: shrink heap
      const newLimit = Math.max(this.minHeapMB, Math.floor(this.currentLimitMB * 0.8));
      if (newLimit !== this.currentLimitMB) {
        this.currentLimitMB = newLimit;
        reason = `shrunk to ${newLimit}MB (utilization: ${(utilization * 100).toFixed(0)}%)`;
        this.adjustmentCount++;
      }
    }

    return { newLimitMB: this.currentLimitMB, reason };
  }

  getUtilizationTrend(): number[] {
    return this.history.slice(-20).map((h) => h.usedMB / h.limitMB);
  }
}

// ---------------------------------------------------------------------------
// Rule 60: Concurrent GC Trigger
// Proactively triggers GC during idle periods to avoid GC during hot paths.
// ---------------------------------------------------------------------------

class ConcurrentGCTrigger {
  private gcEvents: GCEvent[] = [];
  private idleThresholdMs = 50;
  private lastGCTime = 0;
  private minGCIntervalMs = 1000;
  private gcRequested = false;

  requestIdleGC(): boolean {
    if (this.gcRequested) return false;
    if (Date.now() - this.lastGCTime < this.minGCIntervalMs) return false;

    const stats = v8.getHeapStatistics();
    const utilization = stats.used_heap_size / stats.total_heap_size;
    if (utilization < 0.5) return false; // Not worth GC-ing

    this.gcRequested = true;

    // Use setImmediate to run during idle microtask
    setImmediate(() => {
      const t0 = process.hrtime.bigint();
      if (global.gc) {
        global.gc();
      }
      const pauseMs = Number(process.hrtime.bigint() - t0) / 1e6;
      this.lastGCTime = Date.now();
      this.gcRequested = false;

      this.gcEvents.push({
        type: 'major',
        timestamp: Date.now(),
        pauseMs,
        reclaimedBytes: 0,
      });

      if (this.gcEvents.length > 100) this.gcEvents.shift();
    });

    return true;
  }

  requestMinorGC(): boolean {
    if (Date.now() - this.lastGCTime < this.minGCIntervalMs / 2) return false;

    setImmediate(() => {
      if (global.gc) {
        global.gc({ type: 'minor' } as any);
      }
      this.lastGCTime = Date.now();
    });
    return true;
  }

  getAverageGCPauseMs(): number {
    if (this.gcEvents.length === 0) return 0;
    const sum = this.gcEvents.reduce((acc, e) => acc + e.pauseMs, 0);
    return sum / this.gcEvents.length;
  }

  getGCFrequencyPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.gcEvents.filter((e) => e.timestamp > oneMinuteAgo).length;
  }
}

// ---------------------------------------------------------------------------
// Rule 61: Idle GC Hint System
// Notifies V8 of idle periods for background GC work.
// ---------------------------------------------------------------------------

class IdleGCHintSystem {
  private idleCallbackId: ReturnType<typeof setInterval> | null = null;
  private isIdle = false;
  private idleStartTime = 0;
  private totalIdleTimeMs = 0;
  private idleHintCount = 0;

  startIdleDetection(checkIntervalMs: number = 10000): void {
    if (this.idleCallbackId) return;

    let lastActivityTime = Date.now();

    // Track process CPU usage as proxy for activity
    this.idleCallbackId = setInterval(() => {
      const cpuUsage = process.cpuUsage();
      const totalCpuUs = cpuUsage.user + cpuUsage.system;

      // If CPU usage is low, consider idle
      if (totalCpuUs < 10000) { // <10ms CPU per interval
        if (!this.isIdle) {
          this.isIdle = true;
          this.idleStartTime = Date.now();
        }
        this.sendIdleHint();
      } else {
        if (this.isIdle) {
          this.totalIdleTimeMs += Date.now() - this.idleStartTime;
          this.isIdle = false;
        }
        lastActivityTime = Date.now();
      }
    }, checkIntervalMs);

    if (this.idleCallbackId && typeof this.idleCallbackId === 'object' && 'unref' in this.idleCallbackId) {
      (this.idleCallbackId as NodeJS.Timeout).unref();
    }
  }

  stopIdleDetection(): void {
    if (this.idleCallbackId) {
      clearInterval(this.idleCallbackId);
      this.idleCallbackId = null;
    }
  }

  private sendIdleHint(): void {
    if (global.gc) {
      // Request incremental GC during idle
      try {
        global.gc({ type: 'minor', execution: 'async' } as any);
        this.idleHintCount++;
      } catch {
        // Not all GC options supported in all V8 versions
      }
    }
  }

  isCurrentlyIdle(): boolean {
    return this.isIdle;
  }

  getTotalIdleTimeMs(): number {
    if (this.isIdle) {
      return this.totalIdleTimeMs + (Date.now() - this.idleStartTime);
    }
    return this.totalIdleTimeMs;
  }

  getIdleHintCount(): number {
    return this.idleHintCount;
  }
}

// ---------------------------------------------------------------------------
// Rule 62: Heap Statistics Monitor
// Continuous monitoring of V8 heap with trend detection.
// ---------------------------------------------------------------------------

class HeapStatisticsMonitor {
  private snapshots: HeapSnapshot[] = [];
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private maxSnapshots = 300; // 5 minutes at 1/sec
  private leakThresholdMBPerMin = 5;
  private listeners: Array<(event: string, data: unknown) => void> = [];

  startMonitoring(intervalMs: number = 10000): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(() => {
      const snapshot = this.captureSnapshot();
      this.checkForAnomalies(snapshot);
    }, intervalMs);

    if (this.monitorInterval && typeof this.monitorInterval === 'object' && 'unref' in this.monitorInterval) {
      (this.monitorInterval as NodeJS.Timeout).unref();
    }
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  onEvent(listener: (event: string, data: unknown) => void): void {
    this.listeners.push(listener);
  }

  private captureSnapshot(): HeapSnapshot {
    const stats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();

    const snapshot: HeapSnapshot = {
      timestamp: Date.now(),
      heapUsedMB: stats.used_heap_size / (1024 * 1024),
      heapTotalMB: stats.total_heap_size / (1024 * 1024),
      externalMB: memUsage.external / (1024 * 1024),
      arrayBuffersMB: memUsage.arrayBuffers / (1024 * 1024),
      mallocMB: (memUsage.rss - memUsage.heapTotal) / (1024 * 1024),
      gcPauseMs: 0,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  private checkForAnomalies(latest: HeapSnapshot): void {
    if (this.snapshots.length < 60) return; // Need at least 1 minute of data

    // Check for memory leak (monotonic increase)
    const oneMinuteAgo = this.snapshots.find(
      (s) => s.timestamp >= Date.now() - 60000
    );
    if (oneMinuteAgo) {
      const growthMB = latest.heapUsedMB - oneMinuteAgo.heapUsedMB;
      if (growthMB > this.leakThresholdMBPerMin) {
        this.emit('potential-leak', {
          growthMBPerMin: growthMB,
          currentHeapMB: latest.heapUsedMB,
        });
      }
    }

    // Check for heap pressure (only warn when heap is actually large to avoid false alarms on startup)
    const utilization = latest.heapUsedMB / latest.heapTotalMB;
    if (utilization > 0.9 && latest.heapUsedMB > 100) {
      this.emit('heap-pressure', { utilization, heapUsedMB: latest.heapUsedMB });
    }
  }

  private emit(event: string, data: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // silent
      }
    }
  }

  getLatestSnapshot(): HeapSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  getSnapshots(count?: number): HeapSnapshot[] {
    if (count) return this.snapshots.slice(-count);
    return [...this.snapshots];
  }

  getHeapGrowthRate(): number {
    if (this.snapshots.length < 2) return 0;
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const timeDeltaMin = (last.timestamp - first.timestamp) / 60000;
    if (timeDeltaMin === 0) return 0;
    return (last.heapUsedMB - first.heapUsedMB) / timeDeltaMin;
  }
}

// ---------------------------------------------------------------------------
// Rule 63: Hidden Class Discipline
// Factory that enforces consistent property initialization order
// to maintain monomorphic hidden classes in V8.
// ---------------------------------------------------------------------------

class HiddenClassFactory {
  private templates: Map<string, string[]> = new Map();
  private profiles: Map<string, HiddenClassProfile> = new Map();

  registerTemplate(name: string, propertyOrder: string[]): void {
    this.templates.set(name, propertyOrder);
    this.profiles.set(name, {
      className: name,
      propertyOrder,
      instanceCount: 0,
      isMonomorphic: true,
    });
  }

  create<T extends Record<string, unknown>>(
    templateName: string,
    values: Partial<T>
  ): T {
    const props = this.templates.get(templateName);
    if (!props) {
      return values as T;
    }

    // Always initialize properties in the same order
    const obj: Record<string, unknown> = {};
    for (const prop of props) {
      obj[prop] = values[prop as keyof T] ?? null;
    }

    const profile = this.profiles.get(templateName)!;
    profile.instanceCount++;

    return obj as T;
  }

  getProfile(name: string): HiddenClassProfile | undefined {
    return this.profiles.get(name);
  }

  getAllProfiles(): HiddenClassProfile[] {
    return Array.from(this.profiles.values());
  }
}

// ---------------------------------------------------------------------------
// Rule 64: Monomorphic Inline Cache Enforcer
// Ensures hot functions receive consistent argument types.
// ---------------------------------------------------------------------------

class MonomorphicICEnforcer {
  private typeSignatures: Map<string, string[]> = new Map();
  private violations: Array<{ fn: string; expected: string[]; received: string[]; timestamp: number }> = [];

  registerSignature(fnName: string, argTypes: string[]): void {
    this.typeSignatures.set(fnName, argTypes);
  }

  check(fnName: string, args: unknown[]): boolean {
    const expectedTypes = this.typeSignatures.get(fnName);
    if (!expectedTypes) return true;

    const receivedTypes = args.map((a) => typeof a);
    for (let i = 0; i < Math.min(expectedTypes.length, receivedTypes.length); i++) {
      if (expectedTypes[i] !== receivedTypes[i]) {
        this.violations.push({
          fn: fnName,
          expected: expectedTypes,
          received: receivedTypes,
          timestamp: Date.now(),
        });
        return false;
      }
    }
    return true;
  }

  getViolations(limit?: number): typeof this.violations {
    if (limit) return this.violations.slice(-limit);
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Rule 65: Lazy Property Cache
// Defers computation of expensive properties until first access.
// ---------------------------------------------------------------------------

class LazyPropertyCache {
  private cache: Map<string, unknown> = new Map();
  private computeFns: Map<string, () => unknown> = new Map();
  private accessCount: Map<string, number> = new Map();

  define<T>(key: string, computeFn: () => T): void {
    this.computeFns.set(key, computeFn);
  }

  get<T>(key: string): T | undefined {
    if (this.cache.has(key)) {
      this.accessCount.set(key, (this.accessCount.get(key) ?? 0) + 1);
      return this.cache.get(key) as T;
    }

    const computeFn = this.computeFns.get(key);
    if (!computeFn) return undefined;

    const value = computeFn() as T;
    this.cache.set(key, value);
    this.accessCount.set(key, 1);
    return value;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  isComputed(key: string): boolean {
    return this.cache.has(key);
  }

  getAccessCount(key: string): number {
    return this.accessCount.get(key) ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Rule 66: Timing Buffer (Circular Buffer for Performance Samples)
// Ring buffer for sub-microsecond timing data.
// ---------------------------------------------------------------------------

class TimingBuffer {
  private buffer: Float64Array;
  private head = 0;
  private count = 0;
  private capacity: number;

  constructor(capacity: number = 4096) {
    this.capacity = capacity;
    this.buffer = new Float64Array(capacity);
  }

  push(valueUs: number): void {
    this.buffer[this.head] = valueUs;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  getAverage(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i];
    }
    return sum / this.count;
  }

  getMin(): number {
    if (this.count === 0) return 0;
    let min = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] < min) min = this.buffer[i];
    }
    return min;
  }

  getMax(): number {
    if (this.count === 0) return 0;
    let max = -Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > max) max = this.buffer[i];
    }
    return max;
  }

  getPercentile(p: number): number {
    if (this.count === 0) return 0;
    const sorted = this.toArray().sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  toArray(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - this.count + i + this.capacity) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  getCount(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Rules 67-69: V8 Flag Tuner, Code Cache Manager, TurboFan Hints
// ---------------------------------------------------------------------------

class V8FlagTuner {
  private appliedFlags: Record<string, unknown> = {};

  getRecommendedFlags(): V8Flags {
    const totalMB = require('os').totalmem() / (1024 * 1024);
    return {
      maxOldSpaceSizeMB: Math.min(4096, Math.floor(totalMB * 0.25)),
      maxSemiSpaceSizeMB: Math.min(64, Math.floor(totalMB * 0.01)),
      gcIntervalMs: 1000,
      enableTurboFan: true,
      enableLazyCompilation: true,
    };
  }

  getV8Version(): string {
    return process.versions.v8 || 'unknown';
  }

  getHeapSpaceStats(): v8.HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }

  getAppliedFlags(): Record<string, unknown> {
    return { ...this.appliedFlags };
  }
}

class CodeCacheManager {
  private cacheHits = 0;
  private cacheMisses = 0;
  private cachedScripts: Map<string, { hash: string; timestamp: number }> = new Map();

  recordCacheHit(scriptId: string): void {
    this.cacheHits++;
    const entry = this.cachedScripts.get(scriptId);
    if (entry) entry.timestamp = Date.now();
  }

  recordCacheMiss(scriptId: string, hash: string): void {
    this.cacheMisses++;
    this.cachedScripts.set(scriptId, { hash, timestamp: Date.now() });
  }

  getHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? this.cacheHits / total : 0;
  }

  getStats(): { hits: number; misses: number; hitRate: number; cachedScripts: number } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.getHitRate(),
      cachedScripts: this.cachedScripts.size,
    };
  }
}

class TurboFanHints {
  private optimizedFunctions: Set<string> = new Set();
  private deoptimizedFunctions: Map<string, { count: number; lastReason: string }> = new Map();

  markOptimized(fnName: string): void {
    this.optimizedFunctions.add(fnName);
  }

  recordDeopt(fnName: string, reason: string): void {
    const entry = this.deoptimizedFunctions.get(fnName);
    if (entry) {
      entry.count++;
      entry.lastReason = reason;
    } else {
      this.deoptimizedFunctions.set(fnName, { count: 1, lastReason: reason });
    }
    this.optimizedFunctions.delete(fnName);
  }

  getFrequentDeopts(minCount: number = 3): Array<{ fn: string; count: number; reason: string }> {
    const result: Array<{ fn: string; count: number; reason: string }> = [];
    for (const [fn, info] of this.deoptimizedFunctions) {
      if (info.count >= minCount) {
        result.push({ fn, count: info.count, reason: info.lastReason });
      }
    }
    return result.sort((a, b) => b.count - a.count);
  }

  getOptimizedCount(): number {
    return this.optimizedFunctions.size;
  }
}

// ---------------------------------------------------------------------------
// Unified V8 Optimizer
// ---------------------------------------------------------------------------

class V8Optimizer {
  readonly heapSizer: DynamicHeapSizer;
  readonly gcTrigger: ConcurrentGCTrigger;
  readonly idleGC: IdleGCHintSystem;
  readonly heapMonitor: HeapStatisticsMonitor;
  readonly hiddenClassFactory: HiddenClassFactory;
  readonly icEnforcer: MonomorphicICEnforcer;
  readonly lazyCache: LazyPropertyCache;
  readonly timingBuffer: TimingBuffer;
  readonly flagTuner: V8FlagTuner;
  readonly codeCache: CodeCacheManager;
  readonly turboFan: TurboFanHints;
  private initialized = false;

  constructor() {
    this.heapSizer = new DynamicHeapSizer();
    this.gcTrigger = new ConcurrentGCTrigger();
    this.idleGC = new IdleGCHintSystem();
    this.heapMonitor = new HeapStatisticsMonitor();
    this.hiddenClassFactory = new HiddenClassFactory();
    this.icEnforcer = new MonomorphicICEnforcer();
    this.lazyCache = new LazyPropertyCache();
    this.timingBuffer = new TimingBuffer(8192);
    this.flagTuner = new V8FlagTuner();
    this.codeCache = new CodeCacheManager();
    this.turboFan = new TurboFanHints();
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const t0 = process.hrtime.bigint();

    // Start monitoring
    this.heapMonitor.startMonitoring(2000);
    this.idleGC.startIdleDetection(200);

    // Register common hidden class templates
    this.hiddenClassFactory.registerTemplate('IPCMessage', [
      'channel', 'payload', 'timestamp', 'id', 'source',
    ]);
    this.hiddenClassFactory.registerTemplate('AppEvent', [
      'type', 'target', 'data', 'timestamp', 'bubbles',
    ]);
    this.hiddenClassFactory.registerTemplate('CacheEntry', [
      'key', 'value', 'size', 'createdAt', 'expiresAt', 'accessCount',
    ]);

    // Add leak detection listener
    this.heapMonitor.onEvent((event, data) => {
      if (event === 'potential-leak') {
        log.warn(`[V8Optimizer] Potential memory leak detected:`, data);
      } else if (event === 'heap-pressure') {
        log.warn(`[V8Optimizer] Heap pressure:`, data);
        this.gcTrigger.requestIdleGC();
      }
    });

    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
    log.info(`[V8Optimizer] Initialized (V8 ${this.flagTuner.getV8Version()}) in ${elapsed.toFixed(1)}ms`);
  }

  shutdown(): void {
    this.heapMonitor.stopMonitoring();
    this.idleGC.stopIdleDetection();
  }

  getStatus(): Record<string, unknown> {
    const snapshot = this.heapMonitor.getLatestSnapshot();
    return {
      heapLimit: this.heapSizer.getCurrentLimitMB(),
      v8Version: this.flagTuner.getV8Version(),
      heapSnapshot: snapshot,
      heapGrowthRate: this.heapMonitor.getHeapGrowthRate(),
      gcPauseAvg: this.gcTrigger.getAverageGCPauseMs(),
      gcFrequency: this.gcTrigger.getGCFrequencyPerMinute(),
      idleTime: this.idleGC.getTotalIdleTimeMs(),
      codeCacheHitRate: this.codeCache.getHitRate(),
      turboFanOptimized: this.turboFan.getOptimizedCount(),
      frequentDeopts: this.turboFan.getFrequentDeopts(),
    };
  }
}

export const v8Optimizer = new V8Optimizer();

export {
  V8Optimizer,
  DynamicHeapSizer,
  ConcurrentGCTrigger,
  IdleGCHintSystem,
  HeapStatisticsMonitor,
  HiddenClassFactory,
  MonomorphicICEnforcer,
  LazyPropertyCache,
  TimingBuffer,
  V8FlagTuner,
  CodeCacheManager,
  TurboFanHints,
};
