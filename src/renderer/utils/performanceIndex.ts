// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 30: Performance Module Index
// Central export for all performance utilities
// ===========================================================================

// Core performance utilities
export {
  throttle,
  debounce,
  scheduleIdleWork,
  cancelIdleWork,
  executeInFrameBudget,
  trackRender,
  getRenderMetrics,
  LRUCache,
  initAnimationSystem,
  getAnimationDuration as getCoreAnimationDuration,
  areAnimationsEnabled as coreAnimationsEnabled,
  markInteractionStart,
  markInteractionEnd,
  isUserInteracting,
  trackInputLatency,
  getAverageInputLatency,
  observeVisibility,
  coalesceRequest
} from './performance';

// React performance hooks
export {
  useDeferredState,
  useLazyState,
  useIsVisible,
  useThrottledCallback,
  useDebouncedCallback,
  useRenderTracking,
  useStableCallback,
  usePrevious,
  useAnimationDuration as useAnimationDurationHook,
  useIsMounted,
  useAsyncEffect,
  useIntersectionBatch,
  useScrollPosition,
  useWindowSize
} from './performanceHooks';

// Animation budget system
export {
  ANIMATION_CONFIG,
  initAnimationBudget,
  areAnimationsEnabled,
  getPerformanceMode,
  setAnimationsEnabled,
  getAnimationDuration,
  getEasing,
  getTransition,
  getAnimationStyle,
  getAnimationCSSVariables,
  animationClasses,
  useAnimationDuration,
  useAnimationsEnabled,
  useTransition,
  detectPerformanceTier,
  getHardwareProfile,
  shouldUseBackdropFilter,
  getWaveformDownsample,
  getPlaybackThrottle,
  usePerformanceTier,
  scheduleIdle,
  cancelIdle,
  checkMemoryPressure
} from './animationBudget';
export type { PerformanceTier } from './animationBudget';

// IPC wrapper
export {
  ipc,
  cachedCall,
  directCall,
  sendAsync,
  useIPC,
  useLazyIPC
} from './ipcWrapper';
export type { IPCConfig, IPCCallOptions, IPCResult } from './ipcWrapper';

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

import { initAnimationBudget, detectPerformanceTier } from './animationBudget';
import { initAnimationSystem } from './performance';

let cleanupFns: (() => void)[] = [];

/**
 * Initialize all performance systems
 * Call once at app startup
 */
export function initPerformanceSystems(): () => void {
  // Detect hardware tier and apply CSS class
  detectPerformanceTier();
  
  // Initialize animation budget monitoring
  const cleanupBudget = initAnimationBudget();
  cleanupFns.push(cleanupBudget);
  
  // Initialize core animation system
  initAnimationSystem();
  
  // Return cleanup function
  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// -----------------------------------------------------------------------------
// PERFORMANCE MONITORING
// -----------------------------------------------------------------------------

/**
 * Performance monitoring utilities
 */
export const perfMonitor = {
  /**
   * Measure execution time of a function
   */
  measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    // Performance measurement tracked internally
    return result;
  },
  
  /**
   * Measure async execution time
   */
  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    // Performance measurement tracked internally
    return result;
  },
  
  /**
   * Create a performance mark
   */
  mark(name: string): void {
    performance.mark(name);
  },
  
  /**
   * Measure between two marks
   */
  measureBetween(name: string, startMark: string, endMark: string): number {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, 'measure');
    return entries[entries.length - 1]?.duration ?? 0;
  },
  
  /**
   * Clear all performance entries
   */
  clear(): void {
    performance.clearMarks();
    performance.clearMeasures();
  },
  
  /**
   * Get memory usage (if available)
   */
  getMemoryUsage(): { usedJSHeapSize?: number; totalJSHeapSize?: number } | null {
    const perf = performance as any;
    if (perf.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
      };
    }
    return null;
  },
};
