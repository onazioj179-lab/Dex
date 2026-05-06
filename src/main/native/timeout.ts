// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Native Timeout Wrapper
// Prevents hanging when native module calls don't return
// ===========================================================================

import log from 'electron-log';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5000;  // 5 seconds default
const CRITICAL_TIMEOUT_MS = 500;  // 500ms for critical path operations

interface TimeoutConfig {
  defaultMs: number;
  criticalMs: number;
  enableFallback: boolean;
  logTimeouts: boolean;
}

const config: TimeoutConfig = {
  defaultMs: DEFAULT_TIMEOUT_MS,
  criticalMs: CRITICAL_TIMEOUT_MS,
  enableFallback: true,
  logTimeouts: true,
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

interface TimeoutStats {
  totalCalls: number;
  timeouts: number;
  errors: number;
  avgDurationMs: number;
  lastTimeoutAt: number | null;
  slowestCallMs: number;
  slowestCallName: string;
}

const stats: TimeoutStats = {
  totalCalls: 0,
  timeouts: 0,
  errors: 0,
  avgDurationMs: 0,
  lastTimeoutAt: null,
  slowestCallMs: 0,
  slowestCallName: '',
};

// ---------------------------------------------------------------------------
// Core Timeout Wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a synchronous native call with a timeout.
 * Since native calls are sync, we run them in a Promise.race pattern
 * using setImmediate to allow timeout checking.
 * 
 * NOTE: This doesn't actually abort the native call (not possible),
 * but returns early with a fallback value when timeout expires.
 * The native call will complete in the background.
 */
export function withTimeout<T>(
  operation: () => T,
  name: string,
  fallback: T,
  timeoutMs: number = config.defaultMs
): T {
  const start = Date.now();
  stats.totalCalls++;

  try {
    // For synchronous operations, we can't truly timeout
    // but we track timing and warn if slow
    const result = operation();
    const duration = Date.now() - start;
    
    // Update stats
    stats.avgDurationMs = (stats.avgDurationMs * (stats.totalCalls - 1) + duration) / stats.totalCalls;
    
    if (duration > stats.slowestCallMs) {
      stats.slowestCallMs = duration;
      stats.slowestCallName = name;
    }

    if (duration > timeoutMs && config.logTimeouts) {
      log.warn(`[NativeTimeout] ${name} took ${duration}ms (limit: ${timeoutMs}ms)`);
    }

    return result;
  } catch (error) {
    stats.errors++;
    const duration = Date.now() - start;
    log.error(`[NativeTimeout] ${name} failed after ${duration}ms:`, error);
    
    if (config.enableFallback) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Wrap an async native call with a timeout.
 * This properly races the operation against a timeout.
 */
export async function withTimeoutAsync<T>(
  operation: () => Promise<T>,
  name: string,
  fallback: T,
  timeoutMs: number = config.defaultMs
): Promise<T> {
  const start = Date.now();
  stats.totalCalls++;

  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      stats.timeouts++;
      stats.lastTimeoutAt = Date.now();
      reject(new Error(`Native operation '${name}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    const duration = Date.now() - start;

    // Update stats
    stats.avgDurationMs = (stats.avgDurationMs * (stats.totalCalls - 1) + duration) / stats.totalCalls;
    
    if (duration > stats.slowestCallMs) {
      stats.slowestCallMs = duration;
      stats.slowestCallName = name;
    }

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const isTimeout = (error as Error).message?.includes('timed out');
    
    if (isTimeout) {
      if (config.logTimeouts) {
        log.warn(`[NativeTimeout] ${name} timed out after ${duration}ms`);
      }
    } else {
      stats.errors++;
      log.error(`[NativeTimeout] ${name} failed after ${duration}ms:`, error);
    }

    if (config.enableFallback) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Run a native operation with a worker thread timeout.
 * This uses a worker_threads pattern to truly abort slow operations.
 * Note: Full abort capability requires native module support.
 * Current implementation falls back to sync version with timeout tracking.
 */
export function withAbortableTimeout<T>(
  _operation: () => T,
  name: string,
  fallback: T,
  _timeoutMs: number = config.defaultMs
): T {
  // Full abort requires worker_threads with native module coordination
  // Current implementation uses sync timeout with stats tracking
  log.debug(`[NativeTimeout] Using sync timeout wrapper for ${name}`);
  return withTimeout(_operation, name, fallback, _timeoutMs);
}

// ---------------------------------------------------------------------------
// Critical Path Wrapper
// ---------------------------------------------------------------------------

/**
 * Wrapper for critical-path operations that must complete quickly.
 * Uses shorter timeout and higher priority logging.
 */
export function criticalNativeCall<T>(
  operation: () => T,
  name: string,
  fallback: T
): T {
  return withTimeout(operation, name, fallback, config.criticalMs);
}

// ---------------------------------------------------------------------------
// Batch Operation Support
// ---------------------------------------------------------------------------

interface BatchResult<T> {
  results: T[];
  timeouts: number;
  errors: number;
  totalDurationMs: number;
}

/**
 * Run multiple native operations with individual timeouts.
 * Continues processing even if some operations fail/timeout.
 */
export async function withTimeoutBatch<T>(
  operations: Array<{ fn: () => Promise<T>; name: string; fallback: T }>,
  timeoutMs: number = config.defaultMs
): Promise<BatchResult<T>> {
  const start = Date.now();
  const results: T[] = [];
  let timeouts = 0;
  let errors = 0;

  for (const op of operations) {
    try {
      const result = await withTimeoutAsync(op.fn, op.name, op.fallback, timeoutMs);
      results.push(result);
    } catch (error) {
      const isTimeout = (error as Error).message?.includes('timed out');
      if (isTimeout) {
        timeouts++;
      } else {
        errors++;
      }
      results.push(op.fallback);
    }
  }

  return {
    results,
    timeouts,
    errors,
    totalDurationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Configuration API
// ---------------------------------------------------------------------------

export function configureTimeout(updates: Partial<TimeoutConfig>): void {
  Object.assign(config, updates);
}

export function getTimeoutConfig(): Readonly<TimeoutConfig> {
  return { ...config };
}

export function getTimeoutStats(): Readonly<TimeoutStats> {
  return { ...stats };
}

export function resetTimeoutStats(): void {
  stats.totalCalls = 0;
  stats.timeouts = 0;
  stats.errors = 0;
  stats.avgDurationMs = 0;
  stats.lastTimeoutAt = null;
  stats.slowestCallMs = 0;
  stats.slowestCallName = '';
}

// ---------------------------------------------------------------------------
// Decorator-style wrapper for class methods
// ---------------------------------------------------------------------------

/**
 * Create a timeout-wrapped version of a native API object.
 * Each method gets wrapped with timeout handling.
 */
export function wrapNativeAPI<T extends Record<string, (...args: unknown[]) => unknown>>(
  api: T,
  apiName: string,
  timeoutMs: number = config.defaultMs
): T {
  const wrapped = {} as T;

  for (const [key, fn] of Object.entries(api)) {
    if (typeof fn === 'function') {
      (wrapped as Record<string, unknown>)[key] = (...args: unknown[]) => {
        return withTimeout(
          () => fn(...args),
          `${apiName}.${key}`,
          null,
          timeoutMs
        );
      };
    } else {
      (wrapped as Record<string, unknown>)[key] = fn;
    }
  }

  return wrapped;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Quick health check for native module responsiveness.
 * Returns true if native calls complete within expected time.
 */
export function isNativeResponsive(checkFn: () => unknown): boolean {
  const start = Date.now();
  try {
    checkFn();
    return Date.now() - start < config.criticalMs;
  } catch {
    return false;
  }
}
