// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Memory Leak Prevention System
// Phase 1: Memory and Performance - Fix memory leaks, verify long-session stability
// Ensures idle CPU is approximately 0, stable 8+ hour sessions
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, webContents } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface LeakDetectionResult {
  detected: boolean;
  type: 'heap' | 'listeners' | 'timers' | 'handles' | 'unknown';
  source?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentValue: number;
  threshold: number;
  recommendation: string;
}

export interface ResourceTracker {
  id: string;
  type: 'interval' | 'timeout' | 'listener' | 'webcontents' | 'handle';
  createdAt: number;
  source: string;
  cleanup: () => void;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
  arrayBuffersMB: number;
}

export interface LeakPreventionConfig {
  snapshotIntervalMs: number;
  maxSnapshotsRetained: number;
  heapGrowthThresholdMB: number;
  listenerLeakThreshold: number;
  idleCheckIntervalMs: number;
  autoCleanupEnabled: boolean;
  forceGCOnHighPressure: boolean;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: LeakPreventionConfig = {
  snapshotIntervalMs: 60000,        // Snapshot every minute
  maxSnapshotsRetained: 60,         // Keep 1 hour of snapshots
  heapGrowthThresholdMB: 50,        // Alert if heap grows 50MB/hour
  listenerLeakThreshold: 100,       // Alert if >100 listeners on emitter
  idleCheckIntervalMs: 10000,       // Check idle state every 10 seconds
  autoCleanupEnabled: true,         // Automatically clean up detected leaks
  forceGCOnHighPressure: true,      // Force GC when memory is high
};

// ===========================================================================
// MEMORY LEAK PREVENTION CLASS
// ===========================================================================

class MemoryLeakPreventionClass extends EventEmitter {
  private config: LeakPreventionConfig;
  private snapshots: MemorySnapshot[] = [];
  private trackedResources: Map<string, ResourceTracker> = new Map();
  private snapshotInterval: NodeJS.Timeout | null = null;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private isIdle: boolean = true;
  private lastActivityTime: number = Date.now();
  private startTime: number = Date.now();
  private isInitialized: boolean = false;

  // Weak references for tracking without preventing GC
  private weakWindowRefs: WeakMap<BrowserWindow, { createdAt: number; id: number }> = new WeakMap();
  private windowCount: number = 0;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setMaxListeners(20); // Prevent listener leak warnings on this emitter
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.startSnapshotCollection();
    this.startIdleMonitor();
    this.setupWindowTracking();
    this.registerIPCHandlers();

    // Take initial snapshot
    this.takeSnapshot();

    this.isInitialized = true;
    log.info('[LeakPrevention] Memory leak prevention system initialized');
  }

  shutdown(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Clean up all tracked resources
    this.cleanupAllTrackedResources();

    this.removeAllListeners();
    log.info('[LeakPrevention] Memory leak prevention system shut down');
  }

  // -------------------------------------------------------------------------
  // MEMORY SNAPSHOT COLLECTION
  // -------------------------------------------------------------------------

  private startSnapshotCollection(): void {
    if (this.snapshotInterval) return;

    this.snapshotInterval = setInterval(() => {
      this.takeSnapshot();
      this.analyzeForLeaks();
    }, this.config.snapshotIntervalMs);
  }

  private takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsedMB: memUsage.heapUsed / (1024 * 1024),
      heapTotalMB: memUsage.heapTotal / (1024 * 1024),
      externalMB: memUsage.external / (1024 * 1024),
      rssMB: memUsage.rss / (1024 * 1024),
      arrayBuffersMB: memUsage.arrayBuffers / (1024 * 1024),
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots
    if (this.snapshots.length > this.config.maxSnapshotsRetained) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshotsRetained);
    }

    return snapshot;
  }

  // -------------------------------------------------------------------------
  // LEAK DETECTION
  // -------------------------------------------------------------------------

  private analyzeForLeaks(): LeakDetectionResult[] {
    const results: LeakDetectionResult[] = [];

    // Check heap growth rate
    const heapGrowthResult = this.checkHeapGrowth();
    if (heapGrowthResult) {
      results.push(heapGrowthResult);
    }

    // Check for listener leaks
    const listenerResult = this.checkListenerLeaks();
    if (listenerResult) {
      results.push(listenerResult);
    }

    // Check for orphaned resources
    const orphanedResult = this.checkOrphanedResources();
    if (orphanedResult) {
      results.push(orphanedResult);
    }

    // Emit and handle results
    for (const result of results) {
      this.emit('leak-detected', result);
      
      if (result.severity === 'critical' || result.severity === 'high') {
        log.warn(`[LeakPrevention] ${result.type} leak detected: ${result.recommendation}`);
        
        if (this.config.autoCleanupEnabled) {
          this.attemptAutoCleanup(result);
        }
      }
    }

    return results;
  }

  private checkHeapGrowth(): LeakDetectionResult | null {
    if (this.snapshots.length < 10) return null;

    // Calculate growth over last 10 snapshots (roughly 10 minutes)
    const recentSnapshots = this.snapshots.slice(-10);
    const oldestHeap = recentSnapshots[0].heapUsedMB;
    const newestHeap = recentSnapshots[recentSnapshots.length - 1].heapUsedMB;
    const growthMB = newestHeap - oldestHeap;

    // Extrapolate to hourly growth
    const timeSpanMs = recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp;
    const hourlyGrowthMB = (growthMB / timeSpanMs) * 3600000;

    if (hourlyGrowthMB > this.config.heapGrowthThresholdMB) {
      return {
        detected: true,
        type: 'heap',
        severity: hourlyGrowthMB > this.config.heapGrowthThresholdMB * 2 ? 'critical' : 'high',
        currentValue: hourlyGrowthMB,
        threshold: this.config.heapGrowthThresholdMB,
        recommendation: `Memory growing at ${hourlyGrowthMB.toFixed(1)}MB/hour. Consider investigating recent code changes.`,
      };
    }

    return null;
  }

  private checkListenerLeaks(): LeakDetectionResult | null {
    // Check EventEmitter listener counts
    const emitterCounts: { name: string; count: number }[] = [];

    // Check ipcMain listeners
    const ipcChannels = (ipcMain as any)._events;
    if (ipcChannels) {
      for (const [channel, listeners] of Object.entries(ipcChannels)) {
        const count = Array.isArray(listeners) ? listeners.length : 1;
        if (count > this.config.listenerLeakThreshold) {
          emitterCounts.push({ name: `ipcMain:${channel}`, count });
        }
      }
    }

    if (emitterCounts.length > 0) {
      const worst = emitterCounts.sort((a, b) => b.count - a.count)[0];
      return {
        detected: true,
        type: 'listeners',
        source: worst.name,
        severity: worst.count > this.config.listenerLeakThreshold * 2 ? 'critical' : 'medium',
        currentValue: worst.count,
        threshold: this.config.listenerLeakThreshold,
        recommendation: `${worst.name} has ${worst.count} listeners. Check for missing removeListener calls.`,
      };
    }

    return null;
  }

  private checkOrphanedResources(): LeakDetectionResult | null {
    // Check for old tracked resources that should have been cleaned up
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    let orphanedCount = 0;

    for (const [, tracker] of this.trackedResources) {
      if (now - tracker.createdAt > maxAge) {
        orphanedCount++;
      }
    }

    if (orphanedCount > 10) {
      return {
        detected: true,
        type: 'handles',
        severity: orphanedCount > 50 ? 'high' : 'medium',
        currentValue: orphanedCount,
        threshold: 10,
        recommendation: `${orphanedCount} tracked resources are older than 1 hour. Consider cleaning them up.`,
      };
    }

    return null;
  }

  private attemptAutoCleanup(result: LeakDetectionResult): void {
    switch (result.type) {
      case 'heap':
        if (this.config.forceGCOnHighPressure && global.gc) {
          global.gc();
          log.info('[LeakPrevention] Forced garbage collection');
        }
        break;

      case 'handles':
        this.cleanupOldTrackedResources();
        break;

      default:
        // Emit cleanup request for other systems
        this.emit('cleanup-requested', { type: result.type });
        break;
    }
  }

  // -------------------------------------------------------------------------
  // IDLE STATE MONITORING (CPU = 0 when idle)
  // -------------------------------------------------------------------------

  private startIdleMonitor(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const idleThreshold = 30000; // 30 seconds without activity = idle

      const wasIdle = this.isIdle;
      this.isIdle = (now - this.lastActivityTime) > idleThreshold;

      if (!wasIdle && this.isIdle) {
        this.onEnterIdle();
      } else if (wasIdle && !this.isIdle) {
        this.onExitIdle();
      }
    }, this.config.idleCheckIntervalMs);
  }

  private onEnterIdle(): void {
    log.debug('[LeakPrevention] Entering idle state');
    this.emit('idle-entered');

    // Trigger memory cleanup
    if (this.config.forceGCOnHighPressure && global.gc) {
      const stats = this.getCurrentStats();
      if (stats.heapUsedMB > 150) {
        global.gc();
        log.info('[LeakPrevention] Garbage collection on idle entry');
      }
    }
  }

  private onExitIdle(): void {
    log.debug('[LeakPrevention] Exiting idle state');
    this.emit('idle-exited');
  }

  /**
   * Record user activity (call this from input handlers)
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  // -------------------------------------------------------------------------
  // RESOURCE TRACKING
  // -------------------------------------------------------------------------

  /**
   * Track a timer (interval or timeout) for cleanup
   */
  trackTimer(
    id: string,
    type: 'interval' | 'timeout',
    timer: NodeJS.Timeout,
    source: string
  ): void {
    const tracker: ResourceTracker = {
      id,
      type,
      createdAt: Date.now(),
      source,
      cleanup: () => {
        if (type === 'interval') {
          clearInterval(timer);
        } else {
          clearTimeout(timer);
        }
      },
    };

    this.trackedResources.set(id, tracker);
  }

  /**
   * Track an event listener for cleanup
   */
  trackListener(
    id: string,
    emitter: EventEmitter,
    event: string,
    listener: (...args: any[]) => void,
    source: string
  ): void {
    const tracker: ResourceTracker = {
      id,
      type: 'listener',
      createdAt: Date.now(),
      source,
      cleanup: () => {
        emitter.removeListener(event, listener);
      },
    };

    this.trackedResources.set(id, tracker);
  }

  /**
   * Untrack and clean up a resource
   */
  untrackResource(id: string): void {
    const tracker = this.trackedResources.get(id);
    if (tracker) {
      tracker.cleanup();
      this.trackedResources.delete(id);
    }
  }

  private cleanupOldTrackedResources(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [id, tracker] of this.trackedResources) {
      if (now - tracker.createdAt > maxAge) {
        log.info(`[LeakPrevention] Cleaning up old resource: ${id} (${tracker.source})`);
        tracker.cleanup();
        this.trackedResources.delete(id);
      }
    }
  }

  private cleanupAllTrackedResources(): void {
    for (const [id, tracker] of this.trackedResources) {
      try {
        tracker.cleanup();
      } catch (error) {
        log.error(`[LeakPrevention] Failed to cleanup resource ${id}:`, error);
      }
    }
    this.trackedResources.clear();
  }

  // -------------------------------------------------------------------------
  // WINDOW TRACKING
  // -------------------------------------------------------------------------

  private setupWindowTracking(): void {
    // Track window creation
    const originalBrowserWindow = BrowserWindow;
    
    // Track webContents
    webContents.getAllWebContents().forEach(wc => {
      wc.on('destroyed', () => {
        log.debug('[LeakPrevention] WebContents destroyed');
      });
    });
  }

  /**
   * Register a window for tracking
   */
  trackWindow(window: BrowserWindow): void {
    this.windowCount++;
    this.weakWindowRefs.set(window, {
      createdAt: Date.now(),
      id: window.id,
    });

    window.on('closed', () => {
      this.windowCount--;
      log.debug(`[LeakPrevention] Window closed. Active windows: ${this.windowCount}`);
    });
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  /**
   * Get current memory statistics
   */
  getCurrentStats(): {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    uptimeHours: number;
    trackedResources: number;
    isIdle: boolean;
  } {
    const memUsage = process.memoryUsage();

    return {
      heapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100,
      heapTotalMB: Math.round(memUsage.heapTotal / (1024 * 1024) * 100) / 100,
      rssMB: Math.round(memUsage.rss / (1024 * 1024) * 100) / 100,
      uptimeHours: Math.round((Date.now() - this.startTime) / 3600000 * 100) / 100,
      trackedResources: this.trackedResources.size,
      isIdle: this.isIdle,
    };
  }

  /**
   * Get memory growth trend
   */
  getGrowthTrend(): {
    hourlyGrowthMB: number;
    trend: 'stable' | 'growing' | 'shrinking' | 'unknown';
  } {
    if (this.snapshots.length < 2) {
      return { hourlyGrowthMB: 0, trend: 'unknown' };
    }

    const recentSnapshots = this.snapshots.slice(-10);
    const oldestHeap = recentSnapshots[0].heapUsedMB;
    const newestHeap = recentSnapshots[recentSnapshots.length - 1].heapUsedMB;
    const growthMB = newestHeap - oldestHeap;

    const timeSpanMs = recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp;
    const hourlyGrowthMB = timeSpanMs > 0 ? (growthMB / timeSpanMs) * 3600000 : 0;

    let trend: 'stable' | 'growing' | 'shrinking' | 'unknown';
    if (Math.abs(hourlyGrowthMB) < 5) {
      trend = 'stable';
    } else if (hourlyGrowthMB > 0) {
      trend = 'growing';
    } else {
      trend = 'shrinking';
    }

    return {
      hourlyGrowthMB: Math.round(hourlyGrowthMB * 100) / 100,
      trend,
    };
  }

  /**
   * Force cleanup and garbage collection
   */
  forceCleanup(): void {
    log.info('[LeakPrevention] Forcing cleanup...');

    // Clean old tracked resources
    this.cleanupOldTrackedResources();

    // Emit cleanup event for other systems
    this.emit('cleanup-requested', { type: 'forced' });

    // Force GC if available
    if (global.gc) {
      global.gc();
      log.info('[LeakPrevention] Forced garbage collection');
    }
  }

  /**
   * Get recent memory snapshots
   */
  getSnapshots(count: number = 10): MemorySnapshot[] {
    return this.snapshots.slice(-count);
  }

  /**
   * Run a full leak analysis
   */
  runLeakAnalysis(): LeakDetectionResult[] {
    return this.analyzeForLeaks();
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('memory:getStats', () => this.getCurrentStats());
    ipcMain.handle('memory:getGrowthTrend', () => this.getGrowthTrend());
    ipcMain.handle('memory:getSnapshots', (_, count?: number) => this.getSnapshots(count));
    ipcMain.handle('memory:forceCleanup', () => {
      this.forceCleanup();
      return { success: true };
    });
    ipcMain.handle('memory:runAnalysis', () => this.runLeakAnalysis());
    ipcMain.on('memory:recordActivity', () => this.recordActivity());
  }
}

// Singleton instance
export const memoryLeakPrevention = new MemoryLeakPreventionClass();

// Export initialization function
export function initializeMemoryLeakPrevention(): Promise<void> {
  return memoryLeakPrevention.initialize();
}
