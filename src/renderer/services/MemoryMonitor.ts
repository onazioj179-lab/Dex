// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Memory Pressure Monitor (Items 281-290)
 * Intelligent memory management with pressure detection and cleanup
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type MemoryPressureLevel = 'normal' | 'moderate' | 'high' | 'critical';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss?: number;
  percentUsed: number;
  timestamp: number;
}

export interface MemoryThresholds {
  moderate: number; // 60%
  high: number;     // 80%
  critical: number; // 95%
}

export interface CleanupTask {
  id: string;
  name: string;
  priority: number; // Higher = run first
  estimatedSavings: number; // bytes
  cleanup: () => void | Promise<void>;
}

// ============================================================================
// Default Thresholds
// ============================================================================

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  moderate: 0.60,
  high: 0.80,
  critical: 0.95,
};

// ============================================================================
// Memory Store
// ============================================================================

interface MemoryState {
  stats: MemoryStats | null;
  pressureLevel: MemoryPressureLevel;
  thresholds: MemoryThresholds;
  cleanupTasks: CleanupTask[];
  isMonitoring: boolean;
  lastCleanup: number;
  
  // Actions
  updateStats: (stats: MemoryStats) => void;
  setPressureLevel: (level: MemoryPressureLevel) => void;
  setThresholds: (thresholds: Partial<MemoryThresholds>) => void;
  registerCleanupTask: (task: CleanupTask) => void;
  unregisterCleanupTask: (id: string) => void;
  runCleanup: (force?: boolean) => Promise<void>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  stats: null,
  pressureLevel: 'normal',
  thresholds: DEFAULT_THRESHOLDS,
  cleanupTasks: [],
  isMonitoring: false,
  lastCleanup: 0,

  updateStats: (stats) => {
    const { thresholds } = get();
    let pressureLevel: MemoryPressureLevel = 'normal';
    
    if (stats.percentUsed >= thresholds.critical) {
      pressureLevel = 'critical';
    } else if (stats.percentUsed >= thresholds.high) {
      pressureLevel = 'high';
    } else if (stats.percentUsed >= thresholds.moderate) {
      pressureLevel = 'moderate';
    }
    
    set({ stats, pressureLevel });
    
    // Auto-trigger cleanup at high pressure
    if (pressureLevel === 'high' || pressureLevel === 'critical') {
      const now = Date.now();
      const lastCleanup = get().lastCleanup;
      
      // Don't cleanup more than once per minute
      if (now - lastCleanup > 60000) {
        get().runCleanup();
      }
    }
  },

  setPressureLevel: (level) => set({ pressureLevel: level }),

  setThresholds: (newThresholds) => {
    set(state => ({
      thresholds: { ...state.thresholds, ...newThresholds },
    }));
  },

  registerCleanupTask: (task) => {
    set(state => {
      // Avoid duplicates
      if (state.cleanupTasks.some(t => t.id === task.id)) {
        return state;
      }
      return {
        cleanupTasks: [...state.cleanupTasks, task].sort((a, b) => b.priority - a.priority),
      };
    });
  },

  unregisterCleanupTask: (id) => {
    set(state => ({
      cleanupTasks: state.cleanupTasks.filter(t => t.id !== id),
    }));
  },

  runCleanup: async (force = false) => {
    const { pressureLevel, cleanupTasks, lastCleanup } = get();
    
    // Skip if not needed (unless forced)
    if (!force && pressureLevel === 'normal') {
      return;
    }
    
    // Rate limit
    const now = Date.now();
    if (!force && now - lastCleanup < 30000) {
      return;
    }
    
    set({ lastCleanup: now });
    
    // Run cleanup tasks in priority order
    for (const task of cleanupTasks) {
      try {
        await task.cleanup();
      } catch (err) {
        console.warn(`[MemoryMonitor] Task ${task.name} failed:`, err);
      }
    }
    
    // Request garbage collection if available
    if (typeof (globalThis as any).gc === 'function') {
      try {
        (globalThis as any).gc();
      } catch (e) {
        // gc not available
      }
    }
  },

  startMonitoring: () => {
    if (get().isMonitoring) return;
    set({ isMonitoring: true });
    startMemoryPolling();
  },

  stopMonitoring: () => {
    set({ isMonitoring: false });
    stopMemoryPolling();
  },
}));

// ============================================================================
// Memory Polling
// ============================================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;
const POLLING_INTERVAL = 5000; // 5 seconds

function startMemoryPolling(): void {
  if (pollingInterval) return;
  
  const poll = () => {
    const stats = getMemoryStats();
    if (stats) {
      useMemoryStore.getState().updateStats(stats);
    }
  };
  
  poll(); // Initial poll
  pollingInterval = setInterval(poll, POLLING_INTERVAL);
}

function stopMemoryPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

function getMemoryStats(): MemoryStats | null {
  try {
    // Browser memory API
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      return {
        heapUsed: mem.usedJSHeapSize,
        heapTotal: mem.jsHeapSizeLimit,
        external: 0,
        arrayBuffers: 0,
        percentUsed: mem.usedJSHeapSize / mem.jsHeapSizeLimit,
        timestamp: Date.now(),
      };
    }
    
    // Fallback estimation based on DOM complexity
    const elementCount = document.querySelectorAll('*').length;
    const estimatedUsage = elementCount * 1000; // Rough estimate: 1KB per element
    const estimatedTotal = 512 * 1024 * 1024; // Assume 512MB limit
    
    return {
      heapUsed: estimatedUsage,
      heapTotal: estimatedTotal,
      external: 0,
      arrayBuffers: 0,
      percentUsed: estimatedUsage / estimatedTotal,
      timestamp: Date.now(),
    };
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Built-in Cleanup Tasks
// ============================================================================

// Clear old image cache entries
export const imageCacheCleanup: CleanupTask = {
  id: 'image-cache',
  name: 'Clear image cache',
  priority: 50,
  estimatedSavings: 50 * 1024 * 1024, // 50MB
  cleanup: () => {
    // Clear any cached images
    const images = document.querySelectorAll('img[data-cached]');
    images.forEach(img => {
      (img as HTMLImageElement).src = '';
    });
  },
};

// Clear canvas contexts
export const canvasCleanup: CleanupTask = {
  id: 'canvas-cleanup',
  name: 'Release canvas memory',
  priority: 60,
  estimatedSavings: 100 * 1024 * 1024, // 100MB
  cleanup: () => {
    // Clear hidden canvases
    const canvases = document.querySelectorAll('canvas[data-cleanup]');
    canvases.forEach(canvas => {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }
      // Resize to 1x1 to release memory
      (canvas as HTMLCanvasElement).width = 1;
      (canvas as HTMLCanvasElement).height = 1;
    });
  },
};

// Clear undo history
export const undoHistoryCleanup: CleanupTask = {
  id: 'undo-history',
  name: 'Trim undo history',
  priority: 40,
  estimatedSavings: 20 * 1024 * 1024, // 20MB
  cleanup: () => {
    // This would be connected to app-specific undo stores
    window.dispatchEvent(new CustomEvent('dex:trim-undo-history'));
  },
};

// Clear console logs
export const consoleCleanup: CleanupTask = {
  id: 'console-cleanup',
  name: 'Clear console',
  priority: 10,
  estimatedSavings: 5 * 1024 * 1024, // 5MB
  cleanup: () => {
    if (typeof console.clear === 'function') {
      console.clear();
    }
  },
};

// ============================================================================
// Memory Pressure Hooks
// ============================================================================

export function useMemoryPressure(): MemoryPressureLevel {
  return useMemoryStore(state => state.pressureLevel);
}

export function useMemoryStats(): MemoryStats | null {
  return useMemoryStore(state => state.stats);
}

// ============================================================================
// Format Helpers
// ============================================================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getPressureLevelColor(level: MemoryPressureLevel): string {
  switch (level) {
    case 'normal': return 'var(--color-success)';
    case 'moderate': return 'var(--color-warning)';
    case 'high': return 'var(--color-error)';
    case 'critical': return '#ff0000';
    default: return 'var(--color-text-secondary)';
  }
}

// ============================================================================
// Initialize
// ============================================================================

export function initMemoryMonitor(): void {
  const store = useMemoryStore.getState();
  
  // Register built-in cleanup tasks
  store.registerCleanupTask(imageCacheCleanup);
  store.registerCleanupTask(canvasCleanup);
  store.registerCleanupTask(undoHistoryCleanup);
  store.registerCleanupTask(consoleCleanup);
  
  // Start monitoring
  store.startMonitoring();
  
}
