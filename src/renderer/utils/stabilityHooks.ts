// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Renderer Stability Hooks
// Phase 1: Client-side stability integration
// Provides stability ping, activity tracking, and error boundaries
// ===========================================================================

import { useState, useEffect } from 'react';

// ===========================================================================
// TYPES
// ===========================================================================

export interface StabilityEvent {
  type: string;
  message: string;
  timestamp: number;
}

export interface StabilityStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  recoveredEvents: number;
  failedRecoveries: number;
  uptimeMs: number;
  lastEventTime: number | null;
  currentHealth: 'excellent' | 'good' | 'degraded' | 'critical';
}

export interface Phase1Report {
  generatedAt: number;
  status: {
    initialized: boolean;
    health: string;
    startupTime: number;
    uptime: number;
  };
  recommendations: string[];
}

// ===========================================================================
// STABILITY HOOKS
// ===========================================================================

let pingInterval: NodeJS.Timeout | null = null;
let activityTimeout: NodeJS.Timeout | null = null;
let isInitialized = false;

/**
 * Initialize renderer stability hooks
 * Call this early in the renderer process
 */
export function initializeRendererStability(): void {
  if (isInitialized) return;

  // Start ping interval for health checks
  startPingInterval();

  // Setup activity tracking
  setupActivityTracking();

  // Setup error boundary
  setupGlobalErrorHandlers();

  // Listen for stability events from main process
  setupStabilityListeners();

  isInitialized = true;
  if (import.meta.env.DEV) console.log('[Stability] Renderer stability hooks initialized');
}

/**
 * Shutdown renderer stability hooks
 */
export function shutdownRendererStability(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

  if (activityTimeout) {
    clearTimeout(activityTimeout);
    activityTimeout = null;
  }

  isInitialized = false;
}

// ===========================================================================
// PING/PONG HEALTH CHECK
// ===========================================================================

function startPingInterval(): void {
  if (pingInterval) return;

  // Send async ping every 30 seconds (non-blocking)
  pingInterval = setInterval(() => {
    try {
      window.electron?.ipcRenderer?.invoke?.('stability:ping').then((result: any) => {
        if (!result?.pong) {
          console.warn('[Stability] Ping failed - main process may be unresponsive');
        }
      }).catch((e: unknown) => { console.warn('[Stability] Ping IPC failed:', e); });
    } catch (error) {
      console.error('[Stability] Ping error:', error);
    }
  }, 30000);
}

// ===========================================================================
// ACTIVITY TRACKING
// ===========================================================================

function setupActivityTracking(): void {
  const recordActivity = () => {
    try {
      window.electron?.ipcRenderer?.send?.('memory:recordActivity');
    } catch (e) {
      // Non-critical - IPC may not be available during startup/shutdown
      if (import.meta.env.DEV) {
        console.debug('[Stability] Activity tracking unavailable:', e);
      }
    }
  };

  // Track various user activities
  const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
  
  // Debounced activity recording
  let lastActivity = 0;
  const debounceMs = 1000;

  const handleActivity = () => {
    const now = Date.now();
    if (now - lastActivity > debounceMs) {
      lastActivity = now;
      recordActivity();
    }
  };

  events.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });
}

// ===========================================================================
// GLOBAL ERROR HANDLERS
// ===========================================================================

function setupGlobalErrorHandlers(): void {
  // Catch uncaught errors
  window.addEventListener('error', (event) => {
    console.error('[Stability] Uncaught error:', event.error);
    reportErrorToMain('uncaught-error', event.error?.message || 'Unknown error', event.error?.stack);
  });

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Stability] Unhandled rejection:', event.reason);
    const message = event.reason?.message || String(event.reason) || 'Unknown rejection';
    reportErrorToMain('unhandled-rejection', message, event.reason?.stack);
  });
}

function reportErrorToMain(type: string, message: string, stack?: string): void {
  try {
    window.electron?.ipcRenderer?.invoke?.('stability:reportError', {
      type,
      message,
      stack,
      timestamp: Date.now(),
      source: 'renderer',
    });
  } catch (e) {
    // Can't report to main - log locally instead
    console.warn('[Stability] Failed to report error to main process:', e);
  }
}

// ===========================================================================
// STABILITY EVENT LISTENERS
// ===========================================================================

function setupStabilityListeners(): void {
  const ipcRenderer = window.electron?.ipcRenderer;
  if (!ipcRenderer) return;

  // Listen for critical events
  ipcRenderer.on?.('stability:critical-event', (_: any, event: StabilityEvent) => {
    console.warn('[Stability] Critical event from main:', event);
    showStabilityNotification(event);
  });

  // Listen for permission changes
  ipcRenderer.on?.('permission:changed', (_: any, data: { permission: string; granted: boolean }) => {
    if (import.meta.env.DEV) console.log('[Stability] Permission changed:', data);
    // Could trigger UI update here
  });

  // Listen for automation hard stops
  ipcRenderer.on?.('automation:hard-stopped', (_: any, data: { executionId: string; reason: string }) => {
    console.warn('[Stability] Automation hard stopped:', data);
  });

  // Listen for search index updates
  ipcRenderer.on?.('search:index-updated', (_: any, data: { version: number; itemCount: number }) => {
    if (import.meta.env.DEV) console.log('[Stability] Search index updated:', data);
  });
}

function showStabilityNotification(event: StabilityEvent): void {
  // Show a non-intrusive notification for critical events
  // This could be replaced with a toast or notification component
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Dex Stability Alert', {
      body: event.message,
      icon: '/icon.png',
      silent: true,
    });
  }
}

// ===========================================================================
// PUBLIC API
// ===========================================================================

/**
 * Get current stability stats from main process
 */
export async function getStabilityStats(): Promise<StabilityStats | null> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('stability:getStats') ?? null;
  } catch {
    return null;
  }
}

/**
 * Get recent stability events from main process
 */
export async function getRecentStabilityEvents(count: number = 20): Promise<StabilityEvent[]> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('stability:getRecentEvents', count) || [];
  } catch {
    return [];
  }
}

/**
 * Check if system is stable
 */
export async function isSystemStable(): Promise<boolean> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('stability:isStable') || false;
  } catch {
    return true; // Assume stable if can't check
  }
}

/**
 * Get Phase 1 status report
 */
export async function getPhase1Report(): Promise<Phase1Report | null> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('phase1:getReport') ?? null;
  } catch {
    return null;
  }
}

/**
 * Get memory statistics
 */
export async function getMemoryStats(): Promise<{
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  uptimeHours: number;
  isIdle: boolean;
} | null> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('memory:getStats') ?? null;
  } catch {
    return null;
  }
}

/**
 * Force memory cleanup
 */
export async function forceMemoryCleanup(): Promise<boolean> {
  try {
    const result = await window.electron?.ipcRenderer?.invoke?.('memory:forceCleanup');
    return result?.success || false;
  } catch {
    return false;
  }
}

/**
 * Check if a feature is available (permissions granted)
 */
export async function isFeatureAvailable(feature: string): Promise<{
  available: boolean;
  degraded: boolean;
  missingPermissions: string[];
}> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('permission:checkFeature', feature) || {
      available: false,
      degraded: false,
      missingPermissions: [],
    };
  } catch {
    return { available: false, degraded: false, missingPermissions: [] };
  }
}

/**
 * Request a permission
 */
export async function requestPermission(permission: string): Promise<boolean> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('permission:request', permission) || false;
  } catch {
    return false;
  }
}

/**
 * Check if an automation is currently running
 */
export async function isAutomationRunning(automationId: string): Promise<boolean> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('automation:stability:isRunning', automationId) || false;
  } catch {
    return false;
  }
}

/**
 * Hard stop an automation
 */
export async function hardStopAutomation(executionId: string, reason: string): Promise<boolean> {
  try {
    const result = await window.electron?.ipcRenderer?.invoke?.('automation:stability:hardStop', executionId, reason);
    return result?.success || false;
  } catch {
    return false;
  }
}

/**
 * Get search index state
 */
export async function getSearchIndexState(): Promise<{
  lastUpdate: number;
  itemCount: number;
  isRebuilding: boolean;
} | null> {
  try {
    return await window.electron?.ipcRenderer?.invoke?.('search:getIndexState') ?? null;
  } catch {
    return null;
  }
}

/**
 * Invalidate search cache
 */
export async function invalidateSearchCache(reason?: string): Promise<boolean> {
  try {
    const result = await window.electron?.ipcRenderer?.invoke?.('search:invalidateCache', reason);
    return result?.success || false;
  } catch {
    return false;
  }
}

// ===========================================================================
// REACT HOOK (Optional)
// ===========================================================================

/**
 * React hook for stability status
 * Usage: const { isStable, health, stats } = useStability();
 */
export function useStability() {
  const [isStable, setIsStable] = useState(true);
  const [health, setHealth] = useState<'excellent' | 'good' | 'degraded' | 'critical'>('good');
  const [stats, setStats] = useState<StabilityStats | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const [stableResult, statsResult] = await Promise.all([
        isSystemStable(),
        getStabilityStats(),
      ]);
      if (!mounted) return;
      setIsStable(stableResult);
      if (statsResult) {
        setStats(statsResult);
        setHealth(statsResult.currentHealth);
      }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { isStable, health, stats };
}
