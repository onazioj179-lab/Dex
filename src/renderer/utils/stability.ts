// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Global Stability Layer
// Catches uncaught errors, prevents crashes, ensures smooth operation
// =============================================================================

import { logError, safeStorage, getHardwareProfile } from './compatibility';

// =============================================================================
// GLOBAL ERROR HANDLING
// =============================================================================

interface CrashReport {
  id: string;
  timestamp: number;
  type: 'error' | 'unhandledrejection' | 'resourceError';
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  userAgent: string;
  hardwareTier: string;
  sessionDuration: number;
}

const SESSION_START = Date.now();
const crashReports: CrashReport[] = [];
let isInstalled = false;

/**
 * Generate unique crash ID
 */
function generateCrashId(): string {
  return `crash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create crash report
 */
function createCrashReport(
  type: CrashReport['type'],
  message: string,
  details: Partial<CrashReport> = {}
): CrashReport {
  const profile = getHardwareProfile();
  
  return {
    id: generateCrashId(),
    timestamp: Date.now(),
    type,
    message,
    userAgent: navigator.userAgent,
    hardwareTier: profile.tier,
    sessionDuration: Date.now() - SESSION_START,
    ...details,
  };
}

/**
 * Store crash report
 */
function storeCrashReport(report: CrashReport): void {
  crashReports.push(report);
  
  // Store in localStorage (keep last 20)
  try {
    const stored = JSON.parse(safeStorage.getItem('dex_crash_reports') || '[]');
    stored.push(report);
    while (stored.length > 20) stored.shift();
    safeStorage.setItem('dex_crash_reports', JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Handle uncaught errors
 */
function handleError(event: ErrorEvent): void {
  event.preventDefault();
  
  const report = createCrashReport('error', event.message, {
    stack: event.error?.stack,
    url: event.filename,
    line: event.lineno,
    column: event.colno,
  });
  
  storeCrashReport(report);
  logError(event.error || new Error(event.message));
  
  console.error('[DEX Stability] Caught error:', event.message);
  
  // Show user-friendly message for critical errors
  if (isCriticalError(event.message)) {
    showErrorNotification('Something went wrong. DEX is recovering...');
  }
}

/**
 * Handle unhandled promise rejections
 */
function handleRejection(event: PromiseRejectionEvent): void {
  event.preventDefault();
  
  const message = event.reason?.message || String(event.reason);
  const stack = event.reason?.stack;
  
  const report = createCrashReport('unhandledrejection', message, { stack });
  storeCrashReport(report);
  
  console.error('[DEX Stability] Unhandled rejection:', message);
}

/**
 * Handle resource loading errors
 */
function handleResourceError(event: Event): void {
  const target = event.target as HTMLElement;
  if (!target) return;
  
  const tagName = target.tagName?.toLowerCase();
  const src = (target as HTMLImageElement).src || 
              (target as HTMLScriptElement).src || 
              (target as HTMLLinkElement).href;
  
  if (!src) return;
  
  const report = createCrashReport('resourceError', `Failed to load ${tagName}: ${src}`, {
    url: src,
  });
  
  storeCrashReport(report);
  console.warn('[DEX Stability] Resource error:', src);
}

/**
 * Check if error is critical
 */
function isCriticalError(message: string): boolean {
  const criticalPatterns = [
    /out of memory/i,
    /stack overflow/i,
    /maximum call stack/i,
    /cannot read propert/i,
    /undefined is not a function/i,
    /null is not an object/i,
    /chunk load/i,
    /loading chunk/i,
  ];
  
  return criticalPatterns.some(pattern => pattern.test(message));
}

/**
 * Show error notification to user
 */
function showErrorNotification(message: string): void {
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'dex-error-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    z-index: var(--z-emergency, 50000);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease;
  `;
  
  notification.textContent = message;
  
  // Remove existing
  document.getElementById('dex-error-notification')?.remove();
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

/**
 * Install global error handlers
 */
export function installErrorHandlers(): void {
  if (isInstalled) return;
  
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  window.addEventListener('error', handleResourceError, true);
  
  isInstalled = true;
  console.log('[DEX Stability] Error handlers installed');
}

/**
 * Uninstall global error handlers
 */
export function uninstallErrorHandlers(): void {
  window.removeEventListener('error', handleError);
  window.removeEventListener('unhandledrejection', handleRejection);
  window.removeEventListener('error', handleResourceError, true);
  
  isInstalled = false;
}

/**
 * Get crash reports
 */
export function getCrashReports(): CrashReport[] {
  return [...crashReports];
}

/**
 * Clear crash reports
 */
export function clearCrashReports(): void {
  crashReports.length = 0;
  safeStorage.removeItem('dex_crash_reports');
}

// =============================================================================
// RECOVERY MECHANISMS
// =============================================================================

interface RecoveryState {
  key: string;
  data: unknown;
  timestamp: number;
}

const recoveryStates = new Map<string, RecoveryState>();
const RECOVERY_KEY = 'dex_recovery_states';

/**
 * Save state for recovery
 */
export function saveRecoveryState(key: string, data: unknown): void {
  const state: RecoveryState = {
    key,
    data,
    timestamp: Date.now(),
  };
  
  recoveryStates.set(key, state);
  
  // Persist to storage
  try {
    const stored = JSON.parse(safeStorage.getItem(RECOVERY_KEY) || '{}');
    stored[key] = state;
    safeStorage.setItem(RECOVERY_KEY, JSON.stringify(stored));
  } catch {
    // Ignore
  }
}

/**
 * Get recovery state
 */
export function getRecoveryState<T>(key: string): T | null {
  // Try memory first
  const memState = recoveryStates.get(key);
  if (memState) {
    return memState.data as T;
  }
  
  // Try storage
  try {
    const stored = JSON.parse(safeStorage.getItem(RECOVERY_KEY) || '{}');
    if (stored[key]) {
      return stored[key].data as T;
    }
  } catch {
    // Ignore
  }
  
  return null;
}

/**
 * Clear recovery state
 */
export function clearRecoveryState(key?: string): void {
  if (key) {
    recoveryStates.delete(key);
    try {
      const stored = JSON.parse(safeStorage.getItem(RECOVERY_KEY) || '{}');
      delete stored[key];
      safeStorage.setItem(RECOVERY_KEY, JSON.stringify(stored));
    } catch {
      // Ignore
    }
  } else {
    recoveryStates.clear();
    safeStorage.removeItem(RECOVERY_KEY);
  }
}

/**
 * Check if there are recovery states from previous session
 */
export function hasRecoverableState(): boolean {
  try {
    const stored = safeStorage.getItem(RECOVERY_KEY);
    if (!stored) return false;
    
    const states = JSON.parse(stored);
    return Object.keys(states).length > 0;
  } catch {
    return false;
  }
}

// =============================================================================
// AUTO-SAVE MANAGER
// =============================================================================

type AutoSaveCallback = (key: string) => unknown;
const autoSaveCallbacks = new Map<string, AutoSaveCallback>();
let autoSaveInterval: number | null = null;
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

/**
 * Register auto-save callback
 */
export function registerAutoSave(key: string, callback: AutoSaveCallback): () => void {
  autoSaveCallbacks.set(key, callback);
  
  // Start interval if not running
  if (!autoSaveInterval && autoSaveCallbacks.size > 0) {
    autoSaveInterval = window.setInterval(performAutoSave, AUTO_SAVE_INTERVAL);
  }
  
  return () => {
    autoSaveCallbacks.delete(key);
    if (autoSaveCallbacks.size === 0 && autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
  };
}

/**
 * Perform auto-save
 */
function performAutoSave(): void {
  for (const [key, callback] of autoSaveCallbacks) {
    try {
      const data = callback(key);
      if (data !== undefined) {
        saveRecoveryState(key, data);
      }
    } catch (e) {
      console.error(`[DEX Stability] Auto-save failed for ${key}:`, e);
    }
  }
}

/**
 * Trigger immediate auto-save
 */
export function triggerAutoSave(): void {
  performAutoSave();
}

// =============================================================================
// HEARTBEAT MONITOR
// =============================================================================

let heartbeatInterval: number | null = null;
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = 5000;
const FREEZE_THRESHOLD = 15000;

/**
 * Start heartbeat monitor
 */
export function startHeartbeat(): void {
  if (heartbeatInterval) return;
  
  heartbeatInterval = window.setInterval(() => {
    const now = Date.now();
    const delta = now - lastHeartbeat;
    
    if (delta > FREEZE_THRESHOLD) {
      console.warn(`[DEX Stability] Detected freeze: ${delta}ms since last heartbeat`);
      
      // Log freeze event
      const report = createCrashReport('error', `UI freeze detected: ${delta}ms`);
      storeCrashReport(report);
    }
    
    lastHeartbeat = now;
  }, HEARTBEAT_INTERVAL);
}

/**
 * Stop heartbeat monitor
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// =============================================================================
// SAFE DOM OPERATIONS
// =============================================================================

/**
 * Safely query selector
 */
export function safeQuerySelector<T extends Element>(
  selector: string,
  parent: ParentNode = document
): T | null {
  try {
    return parent.querySelector<T>(selector);
  } catch (e) {
    console.error('[DEX Stability] Invalid selector:', selector);
    return null;
  }
}

/**
 * Safely query selector all
 */
export function safeQuerySelectorAll<T extends Element>(
  selector: string,
  parent: ParentNode = document
): T[] {
  try {
    return Array.from(parent.querySelectorAll<T>(selector));
  } catch (e) {
    console.error('[DEX Stability] Invalid selector:', selector);
    return [];
  }
}

/**
 * Safely add event listener
 */
export function safeAddEventListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | null | undefined,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void {
  if (!element) return () => {};
  
  try {
    element.addEventListener(type, listener, options);
    return () => element.removeEventListener(type, listener, options);
  } catch (e) {
    console.error('[DEX Stability] Failed to add event listener:', e);
    return () => {};
  }
}

/**
 * Safely set innerHTML
 */
export function safeSetInnerHTML(element: HTMLElement | null, html: string): void {
  if (!element) return;
  
  try {
    element.innerHTML = html;
  } catch (e) {
    console.error('[DEX Stability] Failed to set innerHTML:', e);
    element.textContent = html.replace(/<[^>]*>/g, '');
  }
}

// =============================================================================
// SAFE TIMERS
// =============================================================================

const activeTimers = new Set<number>();
const activeIntervals = new Set<number>();

/**
 * Safe setTimeout that tracks timers
 */
export function safeSetTimeout(callback: () => void, delay: number): number {
  const id = window.setTimeout(() => {
    activeTimers.delete(id);
    try {
      callback();
    } catch (e) {
      console.error('[DEX Stability] Timer callback error:', e);
      logError(e instanceof Error ? e : new Error(String(e)));
    }
  }, delay);
  
  activeTimers.add(id);
  return id;
}

/**
 * Safe clearTimeout
 */
export function safeClearTimeout(id: number): void {
  activeTimers.delete(id);
  clearTimeout(id);
}

/**
 * Safe setInterval that tracks intervals
 */
export function safeSetInterval(callback: () => void, delay: number): number {
  const id = window.setInterval(() => {
    try {
      callback();
    } catch (e) {
      console.error('[DEX Stability] Interval callback error:', e);
      logError(e instanceof Error ? e : new Error(String(e)));
    }
  }, delay);
  
  activeIntervals.add(id);
  return id;
}

/**
 * Safe clearInterval
 */
export function safeClearInterval(id: number): void {
  activeIntervals.delete(id);
  clearInterval(id);
}

/**
 * Clear all tracked timers and intervals
 */
export function clearAllTimers(): void {
  activeTimers.forEach(id => clearTimeout(id));
  activeTimers.clear();
  
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize stability layer
 */
export function initStability(): void {
  // Install error handlers
  installErrorHandlers();
  
  // Start heartbeat
  startHeartbeat();
  
  // Handle page unload
  window.addEventListener('beforeunload', () => {
    triggerAutoSave();
  });
  
  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      triggerAutoSave();
    }
  });
  
  // Add CSS for notifications
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  console.log('[DEX Stability] Initialized');
}

/**
 * Cleanup stability layer
 */
export function cleanupStability(): void {
  uninstallErrorHandlers();
  stopHeartbeat();
  clearAllTimers();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Error handling
  installErrorHandlers,
  uninstallErrorHandlers,
  getCrashReports,
  clearCrashReports,
  
  // Recovery
  saveRecoveryState,
  getRecoveryState,
  clearRecoveryState,
  hasRecoverableState,
  
  // Auto-save
  registerAutoSave,
  triggerAutoSave,
  
  // Heartbeat
  startHeartbeat,
  stopHeartbeat,
  
  // Safe DOM
  safeQuerySelector,
  safeQuerySelectorAll,
  safeAddEventListener,
  safeSetInnerHTML,
  
  // Safe timers
  safeSetTimeout,
  safeClearTimeout,
  safeSetInterval,
  safeClearInterval,
  clearAllTimers,
  
  // Init
  initStability,
  cleanupStability,
};
