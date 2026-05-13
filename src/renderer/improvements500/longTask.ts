// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Long-task tracker (T6-044): reports tasks over a threshold via the
 * PerformanceObserver longtask entry type, with a polyfill stub for
 * environments without it.
 */

export type LongTaskListener = (info: { duration: number; startTime: number; name: string }) => void;

let observer: PerformanceObserver | null = null;
const listeners = new Set<LongTaskListener>();

export function startLongTaskTracker(thresholdMs = 50): boolean {
  if (typeof PerformanceObserver === 'undefined') return false;
  if (observer) return true;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < thresholdMs) continue;
        for (const l of listeners) {
          l({ duration: entry.duration, startTime: entry.startTime, name: entry.name });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    return true;
  } catch {
    observer = null;
    return false;
  }
}

export function stopLongTaskTracker(): void {
  observer?.disconnect();
  observer = null;
}

export function onLongTask(listener: LongTaskListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Manual span helper for code paths that already know they may be slow. */
export function measureSpan<T>(name: string, fn: () => T, thresholdMs = 50): T {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = fn();
  const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  if (dt >= thresholdMs) {
    for (const l of listeners) l({ duration: dt, startTime: t0, name });
  }
  return result;
}
