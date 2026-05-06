// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX - Phase 51: Final Performance Optimizer
// Maximum safe performance ceiling with zero waste
// =============================================================================

import log from 'electron-log';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as v8 from 'v8';

// =============================================================================
// PERFORMANCE TARGETS (HARD LIMITS)
// =============================================================================

export const PERF_TARGETS = {
  // Idle state (app visible but not in use)
  IDLE_CPU_MAX: 0.5,              // 0.5% CPU max at idle
  IDLE_GPU_MAX: 0,                // Zero GPU at idle
  IDLE_MEMORY_GROWTH: 0,          // Zero memory growth when idle
  
  // Active state (user interacting)
  ACTIVE_CPU_MAX: 15,             // 15% CPU max during normal use
  ACTIVE_GPU_BURST: 10,           // 10% GPU during animations
  ACTIVE_MEMORY_HEADROOM: 100,    // 100MB headroom for operations
  
  // Response times (ms)
  INPUT_LATENCY_MAX: 8,           // 8ms input latency (120Hz)
  RENDER_FRAME_MAX: 8.33,         // 8.33ms frame time (120Hz)
  IPC_ROUNDTRIP_MAX: 5,           // 5ms IPC roundtrip
  STATE_UPDATE_MAX: 2,            // 2ms state update
  
  // Memory (MB)
  HEAP_BASELINE: 80,              // 80MB heap baseline
  HEAP_ACTIVE_MAX: 300,           // 300MB heap during active use
  HEAP_EMERGENCY: 450,            // 450MB triggers emergency GC
  
  // Long-session stability
  SESSION_MAX_HOURS: 168,         // 1 week continuous operation
  MEMORY_DRIFT_MAX_PER_HOUR: 1,   // Max 1MB drift per hour
  GC_PAUSE_MAX: 50,               // 50ms max GC pause
};

// =============================================================================
// STATE OPTIMIZATION
// =============================================================================

interface PendingUpdate {
  key: string;
  value: unknown;
  timestamp: number;
}

class StateOptimizer {
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private batchTimeout: NodeJS.Timeout | null = null;
  private lastFlush = 0;
  private updateCount = 0;
  private coalescedCount = 0;
  
  // Batch state updates to reduce redundant renders
  queueUpdate(key: string, value: unknown): void {
    const existing = this.pendingUpdates.get(key);
    
    if (existing) {
      // Coalesce - only keep latest value
      existing.value = value;
      existing.timestamp = Date.now();
      this.coalescedCount++;
    } else {
      this.pendingUpdates.set(key, {
        key,
        value,
        timestamp: Date.now(),
      });
    }
    
    this.scheduleFlush();
  }
  
  private scheduleFlush(): void {
    if (this.batchTimeout) return;
    
    // Flush on next frame (16ms) or immediately if urgent
    const timeSinceFlush = Date.now() - this.lastFlush;
    const delay = timeSinceFlush < 16 ? 16 - timeSinceFlush : 0;
    
    this.batchTimeout = setTimeout(() => {
      this.flush();
    }, delay);
  }
  
  private flush(): void {
    this.batchTimeout = null;
    this.lastFlush = Date.now();
    
    if (this.pendingUpdates.size === 0) return;
    
    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();
    this.updateCount += updates.length;
    
    // Emit batched updates
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send('state:batch-update', updates);
      }
    }
  }
  
  getStats(): { updates: number; coalesced: number; efficiency: number } {
    const total = this.updateCount + this.coalescedCount;
    return {
      updates: this.updateCount,
      coalesced: this.coalescedCount,
      efficiency: total > 0 ? (this.coalescedCount / total) * 100 : 0,
    };
  }
  
  reset(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.pendingUpdates.clear();
  }
}

// =============================================================================
// IPC OPTIMIZATION
// =============================================================================

interface IPCCall {
  channel: string;
  timestamp: number;
  duration?: number;
}

class IPCOptimizer {
  private recentCalls: IPCCall[] = [];
  private channelCache: Map<string, { value: unknown; timestamp: number; ttl: number }> = new Map();
  private callCounts: Map<string, number> = new Map();
  private readonly MAX_RECENT = 100;
  private readonly CACHE_DEFAULT_TTL = 1000; // 1 second default cache
  
  // Channels that can be cached
  private readonly CACHEABLE_CHANNELS = new Set([
    'system:getStatus',
    'power:getStats',
    'resource:getSnapshot',
    'health:getStatus',
    'mode:getActive',
  ]);
  
  // Channels that should be rate-limited
  private readonly RATE_LIMITED_CHANNELS: Map<string, number> = new Map([
    ['logs:get', 100],           // Max 10 calls/second
    ['system:getProcesses', 500], // Max 2 calls/second
    ['files:getRecent', 1000],   // Max 1 call/second
  ]);
  
  recordCall(channel: string, duration?: number): void {
    this.recentCalls.push({ channel, timestamp: Date.now(), duration });
    
    // Increment call count
    this.callCounts.set(channel, (this.callCounts.get(channel) || 0) + 1);
    
    // Keep only recent calls
    if (this.recentCalls.length > this.MAX_RECENT) {
      this.recentCalls.shift();
    }
  }
  
  // Check if we should use cache
  shouldUseCache(channel: string): boolean {
    if (!this.CACHEABLE_CHANNELS.has(channel)) return false;
    
    const cached = this.channelCache.get(channel);
    if (!cached) return false;
    
    return Date.now() - cached.timestamp < cached.ttl;
  }
  
  getCached(channel: string): unknown | null {
    const cached = this.channelCache.get(channel);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.value;
    }
    return null;
  }
  
  setCache(channel: string, value: unknown, ttl?: number): void {
    this.channelCache.set(channel, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.CACHE_DEFAULT_TTL,
    });
  }
  
  // Check rate limit
  isRateLimited(channel: string): boolean {
    const minInterval = this.RATE_LIMITED_CHANNELS.get(channel);
    if (!minInterval) return false;
    
    const lastCall = this.recentCalls
      .filter(c => c.channel === channel)
      .pop();
    
    if (!lastCall) return false;
    
    return Date.now() - lastCall.timestamp < minInterval;
  }
  
  getStats(): {
    totalCalls: number;
    avgDuration: number;
    topChannels: Array<{ channel: string; count: number }>;
    cacheHitRate: number;
  } {
    const totalCalls = Array.from(this.callCounts.values()).reduce((a, b) => a + b, 0);
    
    const durations = this.recentCalls
      .filter(c => c.duration !== undefined)
      .map(c => c.duration!);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    
    const topChannels = Array.from(this.callCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([channel, count]) => ({ channel, count }));
    
    return { totalCalls, avgDuration, topChannels, cacheHitRate: 0 };
  }
  
  clearCache(): void {
    this.channelCache.clear();
  }
}

// =============================================================================
// MEMORY OPTIMIZER
// =============================================================================

class MemoryOptimizer {
  private baselineHeap = 0;
  private lastGC = 0;
  private gcCount = 0;
  private memorySnapshots: Array<{ timestamp: number; heapMB: number }> = [];
  
  constructor() {
    this.captureBaseline();
  }
  
  private captureBaseline(): void {
    const mem = process.memoryUsage();
    this.baselineHeap = mem.heapUsed / 1024 / 1024;
  }
  
  // Record memory snapshot for drift analysis
  recordSnapshot(): void {
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    
    this.memorySnapshots.push({
      timestamp: Date.now(),
      heapMB,
    });
    
    // Keep only last hour of snapshots (one per minute = 60 max)
    if (this.memorySnapshots.length > 60) {
      this.memorySnapshots.shift();
    }
  }
  
  // Calculate memory drift per hour
  getMemoryDrift(): number {
    if (this.memorySnapshots.length < 2) return 0;
    
    const oldest = this.memorySnapshots[0];
    const newest = this.memorySnapshots[this.memorySnapshots.length - 1];
    
    const timeDiffHours = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
    if (timeDiffHours < 0.1) return 0; // Need at least 6 minutes of data
    
    const memoryDiff = newest.heapMB - oldest.heapMB;
    return memoryDiff / timeDiffHours;
  }
  
  // Request garbage collection if available
  requestGC(force = false): boolean {
    const now = Date.now();
    const timeSinceLastGC = now - this.lastGC;
    
    // Don't GC too frequently (minimum 30 seconds between GCs)
    if (!force && timeSinceLastGC < 30000) {
      return false;
    }
    
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    
    // Only GC if heap is elevated or forced
    if (!force && heapMB < PERF_TARGETS.HEAP_ACTIVE_MAX) {
      return false;
    }
    
    // Request GC via V8
    if (global.gc) {
      this.lastGC = now;
      this.gcCount++;
      global.gc();
      return true;
    }
    
    return false;
  }
  
  // Aggressive memory release for idle state
  releaseForIdle(): void {
    // Clear caches
    ipcOptimizer.clearCache();
    
    // Request GC
    this.requestGC(true);
    
    // Reduce V8 heap if possible
    try {
      v8.setFlagsFromString('--max-old-space-size=256');
    } catch {
      // Ignore if not supported
    }
  }
  
  getStats(): {
    baselineHeapMB: number;
    currentHeapMB: number;
    driftPerHour: number;
    gcCount: number;
    isHealthy: boolean;
  } {
    const mem = process.memoryUsage();
    const currentHeapMB = mem.heapUsed / 1024 / 1024;
    const driftPerHour = this.getMemoryDrift();
    
    return {
      baselineHeapMB: this.baselineHeap,
      currentHeapMB,
      driftPerHour,
      gcCount: this.gcCount,
      isHealthy: driftPerHour < PERF_TARGETS.MEMORY_DRIFT_MAX_PER_HOUR,
    };
  }
}

// =============================================================================
// IDLE DETECTOR
// =============================================================================

class IdleDetector {
  private lastActivity = Date.now();
  private isIdle = false;
  private idleCallbacks: Array<() => void> = [];
  private activeCallbacks: Array<() => void> = [];
  private readonly IDLE_THRESHOLD = 5000; // 5 seconds
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startMonitoring();
  }
  
  recordActivity(): void {
    this.lastActivity = Date.now();
    
    if (this.isIdle) {
      this.isIdle = false;
      this.notifyActive();
    }
  }
  
  onIdle(callback: () => void): void {
    this.idleCallbacks.push(callback);
  }
  
  onActive(callback: () => void): void {
    this.activeCallbacks.push(callback);
  }
  
  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - this.lastActivity;
      
      if (!this.isIdle && timeSinceActivity > this.IDLE_THRESHOLD) {
        this.isIdle = true;
        this.notifyIdle();
      }
    }, 1000);
  }
  
  private notifyIdle(): void {
    for (const callback of this.idleCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('[IdleDetector] Idle callback error:', err);
      }
    }
  }
  
  private notifyActive(): void {
    for (const callback of this.activeCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('[IdleDetector] Active callback error:', err);
      }
    }
  }
  
  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }
  
  isCurrentlyIdle(): boolean {
    return this.isIdle;
  }
  
  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// =============================================================================
// RENDER OPTIMIZER
// =============================================================================

class RenderOptimizer {
  private frameCount = 0;
  private droppedFrames = 0;
  private lastFrameTime = 0;
  private frameTimes: number[] = [];
  
  recordFrame(duration: number): void {
    this.frameCount++;
    this.frameTimes.push(duration);
    
    if (duration > PERF_TARGETS.RENDER_FRAME_MAX) {
      this.droppedFrames++;
    }
    
    // Keep only last 60 frames
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
    
    this.lastFrameTime = duration;
  }
  
  getAverageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }
  
  getFPS(): number {
    const avgFrameTime = this.getAverageFrameTime();
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }
  
  getDropRate(): number {
    return this.frameCount > 0 ? (this.droppedFrames / this.frameCount) * 100 : 0;
  }
  
  getStats(): {
    fps: number;
    avgFrameTime: number;
    dropRate: number;
    isSmooth: boolean;
  } {
    const fps = this.getFPS();
    const avgFrameTime = this.getAverageFrameTime();
    const dropRate = this.getDropRate();
    
    return {
      fps,
      avgFrameTime,
      dropRate,
      isSmooth: fps >= 60 && dropRate < 5,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

export const stateOptimizer = new StateOptimizer();
export const ipcOptimizer = new IPCOptimizer();
export const memoryOptimizer = new MemoryOptimizer();
export const idleDetector = new IdleDetector();
export const renderOptimizer = new RenderOptimizer();

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

export class PerformanceOptimizer {
  private startTime = Date.now();
  private monitorInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.setupIdleOptimizations();
    this.startMonitoring();
  }
  
  private setupIdleOptimizations(): void {
    // When idle, release resources
    idleDetector.onIdle(() => {
      log.info('[PerformanceOptimizer] Entering idle mode - releasing resources');
      memoryOptimizer.releaseForIdle();
      stateOptimizer.reset();
    });
    
    // When active, prepare for work
    idleDetector.onActive(() => {
      log.info('[PerformanceOptimizer] Exiting idle mode - preparing for activity');
    });
  }
  
  private startMonitoring(): void {
    // Record memory snapshot every minute
    this.monitorInterval = setInterval(() => {
      memoryOptimizer.recordSnapshot();
      
      // Check for memory issues
      const memStats = memoryOptimizer.getStats();
      if (memStats.driftPerHour > PERF_TARGETS.MEMORY_DRIFT_MAX_PER_HOUR * 2) {
        log.warn('[PerformanceOptimizer] High memory drift detected:', memStats.driftPerHour, 'MB/hour');
        memoryOptimizer.requestGC(true);
      }
    }, 60000);
  }
  
  recordUserActivity(): void {
    idleDetector.recordActivity();
  }
  
  // Get comprehensive performance report
  getReport(): {
    uptime: number;
    state: StateOptimizerStats;
    ipc: IPCStats;
    memory: MemoryStats;
    render: RenderStats;
    idle: { isIdle: boolean; idleTime: number };
    healthy: boolean;
  } {
    const memStats = memoryOptimizer.getStats();
    const renderStats = renderOptimizer.getStats();
    
    return {
      uptime: Date.now() - this.startTime,
      state: stateOptimizer.getStats(),
      ipc: ipcOptimizer.getStats(),
      memory: memStats,
      render: renderStats,
      idle: {
        isIdle: idleDetector.isCurrentlyIdle(),
        idleTime: idleDetector.getIdleTime(),
      },
      healthy: memStats.isHealthy && renderStats.isSmooth,
    };
  }
  
  shutdown(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    idleDetector.shutdown();
    stateOptimizer.reset();
  }
}

// Type exports
type StateOptimizerStats = ReturnType<StateOptimizer['getStats']>;
type IPCStats = ReturnType<IPCOptimizer['getStats']>;
type MemoryStats = ReturnType<MemoryOptimizer['getStats']>;
type RenderStats = ReturnType<RenderOptimizer['getStats']>;

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
