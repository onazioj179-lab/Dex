// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tick-budget hook (T6-016, T6-044).
 *
 * Schedules work inside an animation frame respecting a per-frame budget.
 * Returns a `runBudgeted` callback that drains a queue of work units one
 * frame at a time without ever exceeding `budgetMs` per frame.
 */

import { useCallback, useEffect, useRef } from 'react';

export interface UseTickBudgetOptions {
  /** Max ms allowed per frame (default 8 ms ≈ half a 16 ms frame). */
  budgetMs?: number;
}

export function useTickBudget(options: UseTickBudgetOptions = {}) {
  const budgetMs = options.budgetMs ?? 8;
  const queue = useRef<Array<() => void>>([]);
  const raf = useRef<number | null>(null);

  const drain = useCallback(() => {
    raf.current = null;
    const start = performance.now();
    while (queue.current.length > 0 && performance.now() - start < budgetMs) {
      const next = queue.current.shift();
      try { next?.(); } catch { /* ignore work failure to keep loop alive */ }
    }
    if (queue.current.length > 0) {
      raf.current = requestAnimationFrame(drain);
    }
  }, [budgetMs]);

  const runBudgeted = useCallback((work: () => void) => {
    queue.current.push(work);
    if (raf.current === null) {
      raf.current = requestAnimationFrame(drain);
    }
  }, [drain]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    queue.current = [];
  }, []);

  return runBudgeted;
}

/** Wrap a heavy callback so repeated calls coalesce into rAF. */
export function rafThrottle<T extends unknown[]>(fn: (...args: T) => void) {
  let pending = false;
  let lastArgs: T | null = null;
  return (...args: T) => {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    });
  };
}
