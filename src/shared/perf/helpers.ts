// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Performance helpers used widely in the renderer:
 *
 *  - debounce / throttle
 *  - retry with exponential backoff + jitter
 *  - virtual-scroll visible-range calculator
 */

// DEX v3.8.9 - perf helpers

export function debounce<F extends (...args: unknown[]) => void>(fn: F, ms: number): F & { cancel: () => void } {
  let h: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: unknown[]) => {
    if (h) clearTimeout(h);
    h = setTimeout(() => { h = null; fn(...args); }, ms);
  }) as F & { cancel: () => void };
  wrapped.cancel = () => { if (h) { clearTimeout(h); h = null; } };
  return wrapped;
}

export function throttle<F extends (...args: unknown[]) => void>(fn: F, ms: number): F {
  let lastCall = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);
    lastArgs = args;
    if (remaining <= 0) {
      lastCall = now;
      if (pending) { clearTimeout(pending); pending = null; }
      fn(...args);
    } else if (!pending) {
      pending = setTimeout(() => {
        lastCall = Date.now();
        pending = null;
        if (lastArgs) fn(...lastArgs);
      }, remaining);
    }
  }) as F;
}

export interface RetryOptions {
  attempts: number;        // total tries (>=1)
  baseMs: number;          // initial delay
  capMs: number;           // upper bound on a single delay
  jitter?: number;         // +/- fraction (0..1) added to each delay
  /** Optional predicate; only retry when it returns true. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (attempt >= opts.attempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) break;
      await sleep(nextDelay(attempt, opts));
    }
  }
  throw lastErr;
}

export function nextDelay(attempt: number, opts: RetryOptions): number {
  const exp = Math.min(opts.capMs, opts.baseMs * Math.pow(2, attempt - 1));
  const jitter = opts.jitter ?? 0;
  if (jitter <= 0) return exp;
  const swing = exp * jitter;
  // Deterministic jitter for tests: hash of attempt instead of Math.random.
  const j = (Math.sin(attempt * 9.137) + 1) / 2;     // 0..1
  return Math.round(exp - swing + j * swing * 2);
}

// ---------- virtual scroll ----------

export interface VisibleRange {
  startIndex: number;
  endIndex: number;       // exclusive
}

export function visibleRange(args: {
  total: number;
  itemHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan?: number;
}): VisibleRange {
  if (args.total <= 0 || args.itemHeight <= 0 || args.viewportHeight <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }
  const overscan = args.overscan ?? 3;
  const startIndex = Math.max(0, Math.floor(args.scrollTop / args.itemHeight) - overscan);
  const visibleCount = Math.ceil(args.viewportHeight / args.itemHeight) + overscan * 2;
  const endIndex = Math.min(args.total, startIndex + visibleCount);
  return { startIndex, endIndex };
}
