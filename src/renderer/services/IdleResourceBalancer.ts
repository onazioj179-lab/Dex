// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// IdleResourceBalancer (K6)
//
// Connects the idle-pause system to memory management so that when DEX
// transitions to idle, background caches are proactively flushed and worker
// scheduling is reduced. On resume, normal scheduling restores.
//
// Actions on idle:
//   1. Flush all registered caches (via CacheRegistry.flushAll).
//   2. Hint V8 GC if available.
//   3. Emit 'dex:worker-throttle' so background workers reduce frequency.
//
// Actions on resume:
//   1. Emit 'dex:worker-resume' so background workers restore frequency.
//
// Call startIdleResourceBalancer() once at app startup after both
// startIdlePauseCoordinator() and HeapMonitor are running.
// =============================================================================

import { flushAll } from '../services/CacheRegistry';

let _started = false;

function emitWorkerThrottle(throttled: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent('dex:worker-throttle', { detail: { throttled } }));
  } catch {
    // window may not exist in test/SSR contexts
  }
}

function onIdle(): void {
  // 1. Flush all registered caches proactively under idle.
  flushAll();

  // 2. Hint V8 GC if available (no-op in normal builds).
  const w = globalThis as { gc?: () => void };
  if (typeof w.gc === 'function') {
    try { w.gc(); } catch { /* intentional */ }
  }

  // 3. Ask workers to throttle.
  emitWorkerThrottle(true);
}

function onResume(): void {
  emitWorkerThrottle(false);
}

/**
 * Start the idle resource balancer. Idempotent — safe to call multiple times.
 * Must be called after `startIdlePauseCoordinator()`.
 */
export function startIdleResourceBalancer(): void {
  if (_started) return;
  _started = true;

  if (typeof window === 'undefined') return;

  window.addEventListener('dex:idle-pause', onIdle);
  window.addEventListener('dex:idle-resume', onResume);
}

/**
 * Stop the balancer (test cleanup only).
 */
export function _stopIdleResourceBalancer(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('dex:idle-pause', onIdle);
    window.removeEventListener('dex:idle-resume', onResume);
  }
  _started = false;
}

/**
 * Whether the balancer is currently running. Primarily for tests.
 */
export function isIdleBalancerStarted(): boolean {
  return _started;
}
