// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX -- Renderer Heap Monitor
 * Monitors renderer process memory usage and takes progressive action
 * to prevent OOM-induced white screens.
 *
 * Thresholds:
 * - 80% heap: release caches, emit memory-pressure-moderate
 * - 90% heap: serialize state via IPC, release non-essential data, emit memory-pressure-high
 * - 95% heap: send renderer-memory-critical to main process for intervention
 */

import { sharedTick } from '../services/SharedTick';

type PressureLevel = 'normal' | 'moderate' | 'high' | 'critical';

interface HeapMonitorState {
  level: PressureLevel;
  usedMB: number;
  totalMB: number;
  utilization: number;
  lastCheck: number;
}

type PressureCallback = (state: HeapMonitorState) => void;

const pressureListeners: Map<PressureLevel, Set<PressureCallback>> = new Map();
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let currentLevel: PressureLevel = 'normal';
let criticalSentAt = 0;

function getHeapInfo(): { usedMB: number; totalMB: number; limitMB: number } | null {
  const perf = (performance as any);
  if (!perf?.memory) return null;
  return {
    usedMB: perf.memory.usedJSHeapSize / (1024 * 1024),
    totalMB: perf.memory.totalJSHeapSize / (1024 * 1024),
    limitMB: perf.memory.jsHeapSizeLimit / (1024 * 1024),
  };
}

function emit(level: PressureLevel, state: HeapMonitorState): void {
  const set = pressureListeners.get(level);
  if (set) {
    set.forEach(fn => { try { fn(state); } catch { /* silent */ } });
  }
}

function releaseCaches(): void {
  // Clear image caches from data URLs stored in memory
  const imgs = document.querySelectorAll('img[src^="data:"]');
  imgs.forEach(img => {
    if (!img.closest('[data-keep-cache]')) {
      (img as HTMLImageElement).src = '';
    }
  });

  // Clear any sessionStorage caches except critical keys
  const keepKeys = new Set(['dex-chunk-reload', 'dex-app-state']);
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key && !keepKeys.has(key) && key.startsWith('cache-')) {
      sessionStorage.removeItem(key);
    }
  }
}

async function serializeStateToMain(): Promise<void> {
  try {
    const dex = (window as any).dex;
    if (dex?.invoke) {
      const appState = {
        url: window.location.href,
        scrollPositions: {} as Record<string, number>,
        timestamp: Date.now(),
      };
      // Save scroll positions of main containers
      document.querySelectorAll('[data-scroll-persist]').forEach(el => {
        const id = el.getAttribute('data-scroll-persist');
        if (id) appState.scrollPositions[id] = el.scrollTop;
      });
      await dex.invoke('renderer:save-emergency-state', appState);
    }
  } catch {
    // Best effort -- if IPC fails we cannot save
  }
}

async function sendCriticalAlert(): Promise<void> {
  // Rate limit: at most once per 30 seconds
  if (Date.now() - criticalSentAt < 30_000) return;
  criticalSentAt = Date.now();
  try {
    const dex = (window as any).dex;
    if (dex?.invoke) {
      await dex.invoke('renderer:memory-critical', {
        usedMB: getHeapInfo()?.usedMB ?? 0,
        timestamp: Date.now(),
      });
    }
  } catch { /* best effort */ }
}

function check(): void {
  const info = getHeapInfo();
  if (!info) return;

  const utilization = info.usedMB / info.limitMB;
  let newLevel: PressureLevel = 'normal';

  if (utilization > 0.95) {
    newLevel = 'critical';
  } else if (utilization > 0.90) {
    newLevel = 'high';
  } else if (utilization > 0.80) {
    newLevel = 'moderate';
  }

  const state: HeapMonitorState = {
    level: newLevel,
    usedMB: Math.round(info.usedMB),
    totalMB: Math.round(info.limitMB),
    utilization: Math.round(utilization * 100) / 100,
    lastCheck: Date.now(),
  };

  if (newLevel !== currentLevel) {
    currentLevel = newLevel;

    if (newLevel === 'moderate' || newLevel === 'high' || newLevel === 'critical') {
      releaseCaches();
    }
    if (newLevel === 'high' || newLevel === 'critical') {
      serializeStateToMain();
    }
    if (newLevel === 'critical') {
      sendCriticalAlert();
    }

    emit(newLevel, state);
  }
}

/**
 * Start the heap monitor. Call once at renderer startup.
 */
export function startHeapMonitor(): void {
  if (monitorInterval) return;
  sharedTick.subscribe('heap-monitor', check, 30_000);
  monitorInterval = 1 as any; // sentinel to prevent double-start
  // Initial check
  check();
}

/**
 * Stop the heap monitor.
 */
export function stopHeapMonitor(): void {
  if (monitorInterval) {
    sharedTick.unsubscribe('heap-monitor');
    monitorInterval = null;
  }
}

/**
 * Listen for a specific memory pressure level.
 */
export function onMemoryPressure(level: PressureLevel, callback: PressureCallback): () => void {
  if (!pressureListeners.has(level)) pressureListeners.set(level, new Set());
  pressureListeners.get(level)!.add(callback);
  return () => { pressureListeners.get(level)?.delete(callback); };
}

/**
 * Get current heap state synchronously.
 */
export function getHeapState(): HeapMonitorState {
  const info = getHeapInfo();
  return {
    level: currentLevel,
    usedMB: Math.round(info?.usedMB ?? 0),
    totalMB: Math.round(info?.limitMB ?? 0),
    utilization: info ? Math.round((info.usedMB / info.limitMB) * 100) / 100 : 0,
    lastCheck: Date.now(),
  };
}
