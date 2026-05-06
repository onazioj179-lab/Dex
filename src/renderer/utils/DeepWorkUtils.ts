// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 14: Deep Work Utilities
// Memory management and performance stability for extended sessions
// ===========================================================================
// Philosophy: Stability over speed, invisible optimization

import { sharedTick } from '../services/SharedTick';

/**
 * Memory management utilities for long-running sessions
 * Helps prevent memory leaks and performance degradation
 */
export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private cleanupCallbacks: Set<() => void> = new Set();
  private gcScheduleId: NodeJS.Timeout | null = null;
  private lastGC: number = 0;
  private memoryWarningThreshold: number = 0.85; // 85% memory usage
  
  private constructor() {
    this.startMonitoring();
  }
  
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }
  
  /**
   * Register a cleanup callback to be called during memory pressure
   */
  registerCleanup(callback: () => void): () => void {
    this.cleanupCallbacks.add(callback);
    return () => this.cleanupCallbacks.delete(callback);
  }
  
  /**
   * Request soft garbage collection of registered resources
   */
  softGC(): void {
    const now = Date.now();
    // Throttle GC to at most once per 30 seconds
    if (now - this.lastGC < 30000) return;
    
    this.lastGC = now;
    console.debug('[MemoryManager] Running soft GC');
    
    // Run all registered cleanup callbacks
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (err) {
        console.error('[MemoryManager] Cleanup callback error:', err);
      }
    });
    
    // Suggest browser GC if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }
  
  /**
   * Start periodic memory monitoring
   */
  private startMonitoring(): void {
    // Check memory every 60 seconds
    sharedTick.subscribe('deep-work-mem', () => {
      this.checkMemoryPressure();
    }, 60000);
  }
  
  /**
   * Check current memory pressure and trigger GC if needed
   */
  private checkMemoryPressure(): void {
    if (typeof performance === 'undefined' || !(performance as any).memory) {
      return;
    }
    
    const memory = (performance as any).memory;
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    
    if (usageRatio > this.memoryWarningThreshold) {
      console.warn(`[MemoryManager] High memory usage: ${(usageRatio * 100).toFixed(1)}%`);
      this.softGC();
    }
  }
  
  /**
   * Get current memory stats
   */
  getStats(): { used: number; total: number; percent: number } | null {
    if (typeof performance === 'undefined' || !(performance as any).memory) {
      return null;
    }
    
    const memory = (performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.jsHeapSizeLimit,
      percent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
    };
  }
  
  /**
   * Cleanup and destroy the manager
   */
  destroy(): void {
    sharedTick.unsubscribe('deep-work-mem');
    this.cleanupCallbacks.clear();
    MemoryManager.instance = null;
  }
}

/**
 * Idle detection for optimizing background behavior
 */
export class IdleDetector {
  private lastActivity: number = Date.now();
  private idleCallbacks: Set<(isIdle: boolean, duration: number) => void> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;
  private idleThreshold: number;
  private isIdle: boolean = false;
  
  constructor(idleThreshold: number = 60000) { // Default 1 minute
    this.idleThreshold = idleThreshold;
    this.setupListeners();
    this.startChecking();
  }
  
  /**
   * Register callback for idle state changes
   */
  onIdleChange(callback: (isIdle: boolean, duration: number) => void): () => void {
    this.idleCallbacks.add(callback);
    return () => this.idleCallbacks.delete(callback);
  }
  
  /**
   * Record user activity
   */
  recordActivity(): void {
    const wasIdle = this.isIdle;
    this.lastActivity = Date.now();
    this.isIdle = false;
    
    if (wasIdle) {
      this.notifyCallbacks(false, 0);
    }
  }
  
  /**
   * Get current idle state
   */
  getIdleState(): { isIdle: boolean; duration: number } {
    const duration = Date.now() - this.lastActivity;
    return {
      isIdle: duration >= this.idleThreshold,
      duration,
    };
  }
  
  private setupListeners(): void {
    if (typeof window === 'undefined') return;
    
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      window.addEventListener(event, () => this.recordActivity(), { passive: true });
    });
  }
  
  private startChecking(): void {
    sharedTick.subscribe('idle-detector', () => {
      const duration = Date.now() - this.lastActivity;
      const nowIdle = duration >= this.idleThreshold;
      
      if (nowIdle !== this.isIdle) {
        this.isIdle = nowIdle;
        this.notifyCallbacks(nowIdle, duration);
      }
    }, 10000); // Check every 10 seconds
  }
  
  private notifyCallbacks(isIdle: boolean, duration: number): void {
    this.idleCallbacks.forEach(callback => {
      try {
        callback(isIdle, duration);
      } catch (err) {
        console.error('[IdleDetector] Callback error:', err);
      }
    });
  }
  
  destroy(): void {
    sharedTick.unsubscribe('idle-detector');
    this.idleCallbacks.clear();
  }
}

/**
 * CPU yielding utility for heavy operations
 * Prevents UI freezes during intensive tasks
 */
export const yieldToMain = (): Promise<void> => {
  return new Promise(resolve => {
    if ('scheduler' in globalThis && (globalThis as any).scheduler?.yield) {
      (globalThis as any).scheduler.yield().then(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
};

/**
 * Batch async operations with CPU yielding
 */
export async function batchWithYield<T>(
  items: T[],
  processor: (item: T) => Promise<void> | void,
  batchSize: number = 10
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    for (const item of batch) {
      await processor(item);
    }
    
    // Yield to main thread between batches
    if (i + batchSize < items.length) {
      await yieldToMain();
    }
  }
}

/**
 * Debounce utility for state updates
 */
export function createDebouncer<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle utility for frequent events
 */
export function createThrottler<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= limit) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
        timeoutId = null;
      }, limit - timeSinceLastCall);
    }
  };
}

/**
 * State compaction utility for deep sessions
 * Reduces memory footprint of accumulated state
 */
export function compactState<T extends Record<string, any>>(
  state: T,
  maxItems: number = 100,
  arrayKeys: (keyof T)[] = []
): T {
  const compacted = { ...state };
  
  for (const key of arrayKeys) {
    const arr = compacted[key];
    if (Array.isArray(arr) && arr.length > maxItems) {
      // Keep most recent items
      compacted[key] = arr.slice(-maxItems) as T[keyof T];
    }
  }
  
  return compacted;
}

// Export singleton instances
export const memoryManager = MemoryManager.getInstance();
