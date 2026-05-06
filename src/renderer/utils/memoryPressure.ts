// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Memory Pressure Monitoring 🧠
 * 
 * Monitors memory usage and provides hooks for components to respond to
 * memory pressure events. Integrates with the adaptive canvas system.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MemoryPressureLevel = 'normal' | 'moderate' | 'critical';

export interface MemoryInfo {
  usedHeapMB: number;
  totalHeapMB: number;
  heapLimitMB: number;
  usagePercent: number;
  pressureLevel: MemoryPressureLevel;
}

export type MemoryPressureCallback = (info: MemoryInfo) => void;

// ═══════════════════════════════════════════════════════════════════════════
// THRESHOLDS (configurable)
// ═══════════════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  moderate: 0.70, // 70% heap usage
  critical: 0.85, // 85% heap usage
  checkInterval: 10000, // 10 seconds
  gcInterval: 60000, // 1 minute (for gc hints)
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let currentPressure: MemoryPressureLevel = 'normal';
let lastMemoryInfo: MemoryInfo | null = null;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<MemoryPressureCallback>();
const cleanupCallbacks = new Map<string, () => void>();

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY INFO RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current memory information (Chrome/Electron only)
 */
export function getMemoryInfo(): MemoryInfo | null {
  // Check if performance.memory is available (Chrome/Electron)
  const perf = performance as typeof performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perf.memory) {
    return null;
  }

  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;
  
  const usedHeapMB = usedJSHeapSize / (1024 * 1024);
  const totalHeapMB = totalJSHeapSize / (1024 * 1024);
  const heapLimitMB = jsHeapSizeLimit / (1024 * 1024);
  const usagePercent = usedJSHeapSize / jsHeapSizeLimit;

  let pressureLevel: MemoryPressureLevel = 'normal';
  if (usagePercent >= THRESHOLDS.critical) {
    pressureLevel = 'critical';
  } else if (usagePercent >= THRESHOLDS.moderate) {
    pressureLevel = 'moderate';
  }

  return {
    usedHeapMB,
    totalHeapMB,
    heapLimitMB,
    usagePercent,
    pressureLevel,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESSURE MONITORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start monitoring memory pressure
 */
export function startMemoryMonitoring(): void {
  if (checkIntervalId) return;

  const checkMemory = () => {
    const info = getMemoryInfo();
    if (!info) return;

    lastMemoryInfo = info;

    // Notify on pressure level changes
    if (info.pressureLevel !== currentPressure) {
      const oldPressure = currentPressure;
      currentPressure = info.pressureLevel;

      console.log(
        `[MemoryPressure] ${oldPressure} → ${currentPressure} ` +
        `(${info.usedHeapMB.toFixed(0)}MB / ${info.heapLimitMB.toFixed(0)}MB, ` +
        `${(info.usagePercent * 100).toFixed(1)}%)`
      );

      // Notify all listeners
      listeners.forEach(cb => {
        try {
          cb(info);
        } catch (e) {
          console.error('[MemoryPressure] Listener error:', e);
        }
      });

      // Auto-cleanup on critical pressure
      if (info.pressureLevel === 'critical') {
        runCleanupCallbacks();
      }
    }
  };

  // Initial check
  checkMemory();

  // Start periodic checks
  checkIntervalId = setInterval(checkMemory, THRESHOLDS.checkInterval);
}

/**
 * Stop monitoring memory pressure
 */
export function stopMemoryMonitoring(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTENERS & CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to memory pressure changes
 */
export function onMemoryPressure(callback: MemoryPressureCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Register a cleanup callback for critical memory pressure
 */
export function registerCleanup(id: string, callback: () => void): void {
  cleanupCallbacks.set(id, callback);
}

/**
 * Unregister a cleanup callback
 */
export function unregisterCleanup(id: string): void {
  cleanupCallbacks.delete(id);
}

/**
 * Run all registered cleanup callbacks
 */
function runCleanupCallbacks(): void {
  console.log(`[MemoryPressure] Running ${cleanupCallbacks.size} cleanup callbacks...`);
  cleanupCallbacks.forEach((cb, id) => {
    try {
      cb();
      console.log(`[MemoryPressure] Cleanup '${id}' completed`);
    } catch (e) {
      console.error(`[MemoryPressure] Cleanup '${id}' failed:`, e);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL CLEANUP UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clear all image cache (for canvas-heavy apps)
 */
export function clearImageCache(): void {
  // Clear any global image caches
  if (typeof window !== 'undefined' && 'caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        if (name.includes('image') || name.includes('thumbnail')) {
          caches.delete(name);
        }
      });
    });
  }
}

/**
 * Suggest garbage collection (hint only, no guarantee)
 */
export function hintGC(): void {
  // In Electron, we can expose gc() via contextBridge
  const win = window as Window & { gc?: () => void };
  if (typeof win.gc === 'function') {
    win.gc();
    console.log('[MemoryPressure] GC hint sent');
  }
}

/**
 * Reduce quality settings based on pressure
 */
export function getQualityForPressure(): 'high' | 'medium' | 'low' {
  switch (currentPressure) {
    case 'critical': return 'low';
    case 'moderate': return 'medium';
    default: return 'high';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';

/**
 * Hook to get current memory pressure level
 */
export function useMemoryPressure(): MemoryPressureLevel {
  const [pressure, setPressure] = useState<MemoryPressureLevel>(currentPressure);

  useEffect(() => {
    return onMemoryPressure(info => setPressure(info.pressureLevel));
  }, []);

  return pressure;
}

/**
 * Hook to get full memory info
 */
export function useMemoryInfo(): MemoryInfo | null {
  const [info, setInfo] = useState<MemoryInfo | null>(lastMemoryInfo);

  useEffect(() => {
    return onMemoryPressure(setInfo);
  }, []);

  return info;
}

/**
 * Hook to register cleanup callback
 */
export function useMemoryCleanup(id: string, callback: () => void): void {
  useEffect(() => {
    registerCleanup(id, callback);
    return () => unregisterCleanup(id);
  }, [id, callback]);
}

/**
 * Hook for adaptive quality based on memory pressure
 */
export function useAdaptiveQuality(): 'high' | 'medium' | 'low' {
  const pressure = useMemoryPressure();
  
  return useCallback(() => {
    switch (pressure) {
      case 'critical': return 'low';
      case 'moderate': return 'medium';
      default: return 'high';
    }
  }, [pressure])();
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS DISPLAY HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format memory info for display
 */
export function formatMemoryInfo(info: MemoryInfo): string {
  const emoji = info.pressureLevel === 'critical' ? '🔴' 
    : info.pressureLevel === 'moderate' ? '🟡' 
    : '🟢';
  
  return `${emoji} ${info.usedHeapMB.toFixed(0)}MB / ${info.heapLimitMB.toFixed(0)}MB (${(info.usagePercent * 100).toFixed(0)}%)`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-START
// ═══════════════════════════════════════════════════════════════════════════

// Auto-start monitoring when imported in renderer
if (typeof window !== 'undefined') {
  startMemoryMonitoring();
}
