// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Instant App Loader
// Prefetch, cache, and instant-mount system for snappy app opening
// =============================================================================

import { lazy } from 'react';

// ---------------------------------------------------------------------------
// APP PRELOAD CACHE
// ---------------------------------------------------------------------------

interface PreloadedModule {
  component: React.LazyExoticComponent<any>;
  promise: Promise<any>;
  loaded: boolean;
  timestamp: number;
  lastAccess: number; // Track last access for LRU
}

const preloadCache = new Map<string, PreloadedModule>();
const MAX_PRELOAD_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 15; // Limit cache to prevent memory bloat

/**
 * LRU eviction - remove oldest accessed entries when cache exceeds limit
 */
function evictStaleEntries(): void {
  // First: remove expired entries
  const now = Date.now();
  for (const [appId, entry] of preloadCache) {
    if (now - entry.timestamp > MAX_PRELOAD_AGE_MS) {
      preloadCache.delete(appId);
    }
  }
  
  // Second: if still over limit, evict LRU entries
  if (preloadCache.size > MAX_CACHE_SIZE) {
    const sorted = [...preloadCache.entries()].sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );
    const toEvict = sorted.slice(0, preloadCache.size - MAX_CACHE_SIZE);
    for (const [appId] of toEvict) {
      preloadCache.delete(appId);
    }
  }
}

// ---------------------------------------------------------------------------
// PRIORITY LEVELS
// ---------------------------------------------------------------------------

export type PreloadPriority = 'immediate' | 'high' | 'medium' | 'low' | 'idle';

const priorityApps: Record<PreloadPriority, string[]> = {
  // Preload immediately on boot
  immediate: ['home', 'settings'],
  // Preload on first user interaction
  high: ['files', 'notes', 'browser'],
  // Preload after high priority
  medium: ['tasks', 'gallery', 'calendar', 'audio'],
  // Preload during idle
  low: ['calculator', 'stopwatch', 'unitconverter', 'colorpicker', 'weather'],
  // Preload on hover/intent
  idle: ['videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl', 'rewind', 'kanban'],
};

// ---------------------------------------------------------------------------
// PRELOAD FUNCTIONS
// ---------------------------------------------------------------------------

const appImports: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  home: () => import('../pages/Home'),
  files: () => import('../pages/Files'),
  browser: () => import('../pages/Browser'),
  settings: () => import('../pages/Settings'),
  transfers: () => import('../pages/Transfers'),
  notes: () => import('../DEXAPPLICATIONS/notes/DexNotes'),
  tasks: () => import('../pages/Tasks'),
  power: () => import('../pages/Power'),
  workflows: () => import('../pages/Workflows'),
  gallery: () => import('../pages/Gallery'),
  audio: () => import('../pages/Audio'),
  videoeditor: () => import('../DEXAPPLICATIONS/vinx/Vinx'),
  imosion: () => import('../DEXAPPLICATIONS/imosion/Imosion'),
  prism: () => import('../DEXAPPLICATIONS/prism/Prism'),
  flux: () => import('../DEXAPPLICATIONS/flux/Flux'),
  forge: () => import('../DEXAPPLICATIONS/forge/Forge'),
  calculator: () => import('../DEXAPPLICATIONS/standalone/Calculator'),
  calendar: () => import('../DEXAPPLICATIONS/standalone/Calendar'),
  passwordgenerator: () => import('../DEXAPPLICATIONS/standalone/PasswordGenerator'),
  rewind: () => import('../DEXAPPLICATIONS/rewind/Rewind'),
  kanban: () => import('../DEXAPPLICATIONS/standalone/KanbanApp'),
  achievements: () => import('../DEXAPPLICATIONS/standalone/Achievements'),
  recyclebin: () => import('../DEXAPPLICATIONS/standalone/RecycleBin'),
  axl: () => import('../DEXAPPLICATIONS/axl/Axl'),
  stopwatch: () => import('../DEXAPPLICATIONS/standalone/Stopwatch'),
  unitconverter: () => import('../DEXAPPLICATIONS/standalone/UnitConverter'),
  pomodoro: () => import('../DEXAPPLICATIONS/standalone/PomodoroTimer'),
  qrcode: () => import('../DEXAPPLICATIONS/standalone/QRCodeGenerator'),
  colorpicker: () => import('../DEXAPPLICATIONS/standalone/ColorPicker'),
  weather: () => import('../DEXAPPLICATIONS/standalone/Weather'),
  worldclock: () => import('../DEXAPPLICATIONS/standalone/WorldClock'),
  noisegenerator: () => import('../DEXAPPLICATIONS/standalone/NoiseGenerator'),
  dexcode: () => import('../DEXAPPLICATIONS/standalone/DexCode'),
  nexus: () => import('../DEXAPPLICATIONS/standalone/Nexus'),
  learn: () => import('../DEXAPPLICATIONS/standalone/Learn'),
};

/**
 * Preload a single app module
 */
export function preloadApp(appId: string): Promise<void> {
  const importFn = appImports[appId];
  if (!importFn) return Promise.resolve();

  // Check cache
  const cached = preloadCache.get(appId);
  if (cached && cached.loaded && Date.now() - cached.timestamp < MAX_PRELOAD_AGE_MS) {
    cached.lastAccess = Date.now(); // Update LRU timestamp
    return Promise.resolve();
  }

  // Evict stale entries before adding new one
  evictStaleEntries();

  // Start preload
  const now = Date.now();
  const promise = importFn()
    .then(() => {
      const entry = preloadCache.get(appId);
      if (entry) {
        entry.loaded = true;
        entry.timestamp = Date.now();
        entry.lastAccess = Date.now();
      }
    })
    .catch((err) => {
      console.warn(`[InstantLoader] Failed to preload ${appId}:`, err);
    });

  // Create lazy component with cached promise
  const component = lazy(() => importFn());
  
  preloadCache.set(appId, {
    component,
    promise,
    loaded: false,
    timestamp: now,
    lastAccess: now,
  });

  return promise;
}

/**
 * Preload multiple apps with priority batching
 */
export function preloadAppsByPriority(priority: PreloadPriority): Promise<void[]> {
  const apps = priorityApps[priority] || [];
  return Promise.all(apps.map(preloadApp));
}

/**
 * Check if an app is preloaded
 */
export function isAppPreloaded(appId: string): boolean {
  const cached = preloadCache.get(appId);
  return cached?.loaded === true && Date.now() - cached.timestamp < MAX_PRELOAD_AGE_MS;
}

/**
 * Get preloaded component or create new lazy one
 */
export function getAppComponent(appId: string): React.LazyExoticComponent<any> | null {
  const importFn = appImports[appId];
  if (!importFn) return null;

  const cached = preloadCache.get(appId);
  if (cached) {
    cached.lastAccess = Date.now(); // Update LRU timestamp on access
    return cached.component;
  }

  // Evict before adding
  evictStaleEntries();

  // Create and cache
  const now = Date.now();
  const component = lazy(importFn);
  preloadCache.set(appId, {
    component,
    promise: Promise.resolve(),
    loaded: false,
    timestamp: now,
    lastAccess: now,
  });

  return component;
}

// ---------------------------------------------------------------------------
// PRELOAD STRATEGIES
// ---------------------------------------------------------------------------

/**
 * Preload on hover intent (called when user hovers over dock/launchpad icon)
 */
export function preloadOnHover(appId: string): void {
  // Use requestIdleCallback for non-blocking preload
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => preloadApp(appId), { timeout: 500 });
  } else {
    setTimeout(() => preloadApp(appId), 50);
  }
}

/**
 * Preload apps near the current app (likely next navigation)
 */
export function preloadNearbyApps(currentAppId: string): void {
  const allApps = Object.keys(appImports);
  const currentIndex = allApps.indexOf(currentAppId);
  
  // Preload 2 apps before and after current
  const nearby = [
    allApps[currentIndex - 1],
    allApps[currentIndex + 1],
    allApps[currentIndex - 2],
    allApps[currentIndex + 2],
  ].filter(Boolean);

  if ('requestIdleCallback' in window) {
    nearby.forEach((appId, i) => {
      (window as any).requestIdleCallback(() => preloadApp(appId), { timeout: 1000 + i * 200 });
    });
  }
}

// ---------------------------------------------------------------------------
// BOOT SEQUENCE
// ---------------------------------------------------------------------------

let bootCompleted = false;

/**
 * Initialize instant loader - call on app boot
 */
export function initInstantLoader(): void {
  if (bootCompleted) return;
  bootCompleted = true;

  // Stage 1: Immediate (during boot)
  preloadAppsByPriority('immediate');

  // Stage 2: High priority (after first paint)
  requestAnimationFrame(() => {
    setTimeout(() => {
      preloadAppsByPriority('high');
    }, 100);
  });

  // Stage 3: Medium priority (after interaction)
  const preloadMedium = () => {
    preloadAppsByPriority('medium');
    window.removeEventListener('click', preloadMedium);
    window.removeEventListener('keydown', preloadMedium);
  };
  window.addEventListener('click', preloadMedium, { once: true });
  window.addEventListener('keydown', preloadMedium, { once: true });

  // Stage 4: Low priority (idle)
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      preloadAppsByPriority('low');
    }, { timeout: 5000 });
  }
}

// ---------------------------------------------------------------------------
// INSTANT LOADING STATE
// ---------------------------------------------------------------------------

const loadingStates = new Map<string, 'loading' | 'ready' | 'error'>();
const loadingListeners = new Set<(appId: string, state: 'loading' | 'ready' | 'error') => void>();

export function subscribeToLoadingState(
  listener: (appId: string, state: 'loading' | 'ready' | 'error') => void
): () => void {
  loadingListeners.add(listener);
  return () => loadingListeners.delete(listener);
}

export function getLoadingState(appId: string): 'loading' | 'ready' | 'error' | undefined {
  return loadingStates.get(appId);
}

export function setLoadingState(appId: string, state: 'loading' | 'ready' | 'error'): void {
  loadingStates.set(appId, state);
  loadingListeners.forEach(l => l(appId, state));
}

// ---------------------------------------------------------------------------
// CLEANUP
// ---------------------------------------------------------------------------

// Store interval ID for cleanup
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Clear old preloaded modules to free memory
 */
export function cleanupPreloadCache(): void {
  const now = Date.now();
  for (const [appId, entry] of preloadCache.entries()) {
    if (now - entry.timestamp > MAX_PRELOAD_AGE_MS * 2) {
      preloadCache.delete(appId);
    }
  }
}

/**
 * Stop the cleanup interval (for testing or shutdown)
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Cleanup every 10 minutes
if (typeof window !== 'undefined') {
  cleanupIntervalId = setInterval(cleanupPreloadCache, 10 * 60 * 1000);
}

export default {
  preloadApp,
  preloadAppsByPriority,
  preloadOnHover,
  preloadNearbyApps,
  isAppPreloaded,
  getAppComponent,
  initInstantLoader,
  subscribeToLoadingState,
  getLoadingState,
  setLoadingState,
};
