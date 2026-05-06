// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 32: Crash Recovery & Data Integrity
// Resilient state management and crash recovery
// ===========================================================================

// -----------------------------------------------------------------------------
// STORAGE KEYS
// -----------------------------------------------------------------------------

const RECOVERY_KEY = 'dex_crash_recovery';
const STATE_KEY = 'dex_app_state';
const INTEGRITY_KEY = 'dex_integrity_check';
const SESSION_KEY = 'dex_session_data';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

interface RecoveryData {
  timestamp: number;
  reason: string;
  state?: unknown;
  stack?: string;
}

interface StateSnapshot {
  timestamp: number;
  version: number;
  checksum: string;
  data: unknown;
}

interface IntegrityCheck {
  lastCheck: number;
  status: 'ok' | 'corrupted' | 'unknown';
  errors: string[];
}

// -----------------------------------------------------------------------------
// CHECKSUM UTILITIES
// -----------------------------------------------------------------------------

/**
 * Simple hash function for data integrity
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Calculate checksum for data
 */
function calculateChecksum(data: unknown): string {
  const json = JSON.stringify(data);
  return simpleHash(json);
}

/**
 * Verify data checksum
 */
function verifyChecksum(data: unknown, expectedChecksum: string): boolean {
  const actualChecksum = calculateChecksum(data);
  return actualChecksum === expectedChecksum;
}

// -----------------------------------------------------------------------------
// SAFE STORAGE
// -----------------------------------------------------------------------------

/**
 * Safely read from localStorage with error handling
 */
function safeRead<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    return JSON.parse(stored) as T;
  } catch (e) {
    console.error(`[CrashRecovery] Failed to read ${key}:`, e);
    return defaultValue;
  }
}

/**
 * Safely write to localStorage with error handling
 */
function safeWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[CrashRecovery] Failed to write ${key}:`, e);
    return false;
  }
}

/**
 * Safely remove from localStorage
 */
function safeRemove(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`[CrashRecovery] Failed to remove ${key}:`, e);
    return false;
  }
}

// -----------------------------------------------------------------------------
// STATE PERSISTENCE
// -----------------------------------------------------------------------------

/**
 * Save application state with integrity check
 */
export function saveState(state: unknown, version = 1): boolean {
  const checksum = calculateChecksum(state);
  
  const snapshot: StateSnapshot = {
    timestamp: Date.now(),
    version,
    checksum,
    data: state,
  };

  return safeWrite(STATE_KEY, snapshot);
}

/**
 * Load application state with integrity verification
 */
export function loadState<T>(): { state: T | null; corrupted: boolean } {
  const snapshot = safeRead<StateSnapshot | null>(STATE_KEY, null);
  
  if (!snapshot) {
    return { state: null, corrupted: false };
  }

  // Verify integrity
  const isValid = verifyChecksum(snapshot.data, snapshot.checksum);
  
  if (!isValid) {
    console.warn('[CrashRecovery] State corruption detected');
    return { state: null, corrupted: true };
  }

  return { state: snapshot.data as T, corrupted: false };
}

/**
 * Clear saved state
 */
export function clearState(): void {
  safeRemove(STATE_KEY);
}

// -----------------------------------------------------------------------------
// CRASH RECOVERY
// -----------------------------------------------------------------------------

let recoveryListeners: Array<(data: RecoveryData) => void> = [];

/**
 * Mark that app crashed with reason
 */
export function markCrash(reason: string, state?: unknown, error?: Error): void {
  const recoveryData: RecoveryData = {
    timestamp: Date.now(),
    reason,
    state,
    stack: error?.stack,
  };

  safeWrite(RECOVERY_KEY, recoveryData);
}

/**
 * Check if app crashed previously
 */
export function checkCrash(): RecoveryData | null {
  return safeRead<RecoveryData | null>(RECOVERY_KEY, null);
}

/**
 * Clear crash marker (call after successful recovery)
 */
export function clearCrash(): void {
  safeRemove(RECOVERY_KEY);
}

/**
 * Add crash recovery listener
 */
export function onCrashRecovery(listener: (data: RecoveryData) => void): () => void {
  recoveryListeners.push(listener);
  return () => {
    recoveryListeners = recoveryListeners.filter(l => l !== listener);
  };
}

/**
 * Attempt automatic recovery
 */
export function attemptRecovery(): { recovered: boolean; data: RecoveryData | null } {
  const crashData = checkCrash();
  
  if (!crashData) {
    return { recovered: false, data: null };
  }

  // Notify listeners
  recoveryListeners.forEach(listener => {
    try {
      listener(crashData);
    } catch (e) {
      console.error('[CrashRecovery] Listener error:', e);
    }
  });

  // Clear the crash marker
  clearCrash();

  return { recovered: true, data: crashData };
}

// -----------------------------------------------------------------------------
// INTEGRITY CHECKING
// -----------------------------------------------------------------------------

/**
 * Run data integrity check
 */
export function runIntegrityCheck(): IntegrityCheck {
  const errors: string[] = [];

  // Check localStorage health
  try {
    const testKey = '__dex_integrity_test__';
    localStorage.setItem(testKey, 'test');
    const value = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (value !== 'test') {
      errors.push('localStorage read/write mismatch');
    }
  } catch (e) {
    errors.push(`localStorage error: ${e}`);
  }

  // Check state integrity
  const { corrupted } = loadState();
  if (corrupted) {
    errors.push('Application state corrupted');
  }

  // Check session data
  const session = safeRead<unknown>(SESSION_KEY, null);
  if (session) {
    try {
      // Verify session structure
      if (typeof session !== 'object' || session === null) {
        errors.push('Session data invalid structure');
      }
    } catch (e) {
      errors.push(`Session verification error: ${e}`);
    }
  }

  const result: IntegrityCheck = {
    lastCheck: Date.now(),
    status: errors.length === 0 ? 'ok' : 'corrupted',
    errors,
  };

  // Store integrity check result
  safeWrite(INTEGRITY_KEY, result);

  return result;
}

/**
 * Get last integrity check result
 */
export function getLastIntegrityCheck(): IntegrityCheck | null {
  return safeRead<IntegrityCheck | null>(INTEGRITY_KEY, null);
}

// -----------------------------------------------------------------------------
// SESSION MANAGEMENT
// -----------------------------------------------------------------------------

/**
 * Save session data (for tab/window recovery)
 */
export function saveSession(data: unknown): boolean {
  return safeWrite(SESSION_KEY, {
    timestamp: Date.now(),
    data,
  });
}

/**
 * Load session data
 */
export function loadSession<T>(): T | null {
  const session = safeRead<{ timestamp: number; data: T } | null>(SESSION_KEY, null);
  
  if (!session) return null;

  // Check if session is stale (more than 24 hours old)
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (Date.now() - session.timestamp > maxAge) {
    safeRemove(SESSION_KEY);
    return null;
  }

  return session.data;
}

/**
 * Clear session data
 */
export function clearSession(): void {
  safeRemove(SESSION_KEY);
}

// -----------------------------------------------------------------------------
// GLOBAL ERROR HANDLER
// -----------------------------------------------------------------------------

let errorHandlerInstalled = false;

/**
 * Install global error handlers for crash detection
 */
export function installCrashHandlers(): () => void {
  if (errorHandlerInstalled) {
    return () => {};
  }

  const handleError = (event: ErrorEvent) => {
    console.error('[CrashRecovery] Uncaught error:', event.error);
    markCrash('uncaught_error', undefined, event.error);
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    console.error('[CrashRecovery] Unhandled rejection:', event.reason);
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    markCrash('unhandled_rejection', undefined, error);
  };

  const handleBeforeUnload = () => {
    // Save current state before unload
    // Don't mark as crash - this is normal navigation
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  window.addEventListener('beforeunload', handleBeforeUnload);

  errorHandlerInstalled = true;

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    errorHandlerInstalled = false;
  };
}

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

/**
 * Initialize crash recovery system
 */
export function initCrashRecovery(): () => void {
  // Install error handlers
  const uninstallHandlers = installCrashHandlers();

  // Check for previous crash
  const { recovered, data } = attemptRecovery();
  
  if (recovered && data) {
    console.warn('[CrashRecovery] Recovering from previous crash:', data.reason);
  }

  // Run initial integrity check
  const integrity = runIntegrityCheck();
  
  if (integrity.status !== 'ok') {
    console.warn('[CrashRecovery] Integrity issues detected:', integrity.errors);
  }

  return () => {
    uninstallHandlers();
    recoveryListeners = [];
  };
}
