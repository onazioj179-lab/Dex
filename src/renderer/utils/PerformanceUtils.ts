// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Performance Utilities
// Phase 10: Final performance hardening utilities
// ===========================================================================

import { useRef, useMemo, useEffect, DependencyList } from 'react';

// -------------------------------------------------------------------------
// DEBOUNCE & THROTTLE
// -------------------------------------------------------------------------

// Debounce / throttle: one canonical implementation for the whole codebase
// (consolidation audit finding 6) — re-exported here for existing importers
// and used by the hooks below.
import { debounce, throttle } from '../../shared/perf/helpers';
export { debounce, throttle };

// -------------------------------------------------------------------------
// REACT HOOKS FOR PERFORMANCE
// -------------------------------------------------------------------------

/**
 * Debounced callback hook
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList = []
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => debounce((...args: Parameters<T>) => callbackRef.current(...args), delay),
    [delay, ...deps]
  );
}

/**
 * Throttled callback hook
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number,
  deps: DependencyList = []
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => throttle((...args: Parameters<T>) => callbackRef.current(...args), interval),
    [interval, ...deps]
  );
}

/**
 * Debounced value hook - delays value updates
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Previous value hook - useful for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// -------------------------------------------------------------------------
// MEMOIZATION
// -------------------------------------------------------------------------

/**
 * Simple memoization with size limit
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options?: {
    maxSize?: number;
    keyFn?: (...args: Parameters<T>) => string;
  }
): T {
  const cache = new Map<string, ReturnType<T>>();
  const maxSize = options?.maxSize ?? 100;
  const keyFn = options?.keyFn ?? ((...args) => JSON.stringify(args));
  
  return ((...args: Parameters<T>) => {
    const key = keyFn(...args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    
    // Limit cache size
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    
    cache.set(key, result);
    return result;
  }) as T;
}

// -------------------------------------------------------------------------
// RENDER OPTIMIZATION
// -------------------------------------------------------------------------

/**
 * Shallow comparison for React.memo
 */
export function shallowEqual<T extends Record<string, any>>(a: T, b: T): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  
  return true;
}

/**
 * Deep comparison (use sparingly)
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
  
  return false;
}

// -------------------------------------------------------------------------
// ASYNC UTILITIES
// -------------------------------------------------------------------------

/**
 * Run expensive work in idle time
 */
export function runWhenIdle(callback: () => void, timeout = 2000): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Batch multiple async operations
 */
export async function batchAsync<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));
    // Yield to main thread between batches
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// -------------------------------------------------------------------------
// DOM OPTIMIZATION
// -------------------------------------------------------------------------

/**
 * Batch DOM reads/writes to avoid layout thrashing
 */
const measureQueue: Array<() => void> = [];
const mutateQueue: Array<() => void> = [];
let frameScheduled = false;

function processQueues() {
  // Read phase
  measureQueue.forEach(fn => fn());
  measureQueue.length = 0;
  
  // Write phase
  mutateQueue.forEach(fn => fn());
  mutateQueue.length = 0;
  
  frameScheduled = false;
}

export function measure(fn: () => void): void {
  measureQueue.push(fn);
  scheduleFrame();
}

export function mutate(fn: () => void): void {
  mutateQueue.push(fn);
  scheduleFrame();
}

function scheduleFrame() {
  if (!frameScheduled) {
    frameScheduled = true;
    requestAnimationFrame(processQueues);
  }
}

// Import useState for useDebouncedValue
import { useState, useCallback } from 'react';

// -------------------------------------------------------------------------
// RAF THROTTLE - Smooth 60fps updates
// -------------------------------------------------------------------------

/**
 * Throttle a callback to fire at most once per animation frame.
 * Ideal for mousemove, scroll, resize handlers.
 */
export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T & { cancel: () => void } {
  let frameId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (frameId === null) {
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (lastArgs) fn(...lastArgs);
      });
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  return throttled;
}

/**
 * Hook that returns a RAF-throttled callback.
 */
export function useRAFThrottle<T extends (...args: any[]) => void>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttledRef = useRef<ReturnType<typeof rafThrottle<T>> | null>(null);

  if (!throttledRef.current) {
    throttledRef.current = rafThrottle((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }) as ReturnType<typeof rafThrottle<T>>;
  }

  useEffect(() => {
    return () => throttledRef.current?.cancel();
  }, []);

  return throttledRef.current as T;
}

// -------------------------------------------------------------------------
// VIRTUALIZATION HELPERS
// -------------------------------------------------------------------------

export interface VirtualRange {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

/**
 * Calculate which items are visible in a virtual scroll container.
 */
export function calculateVirtualRange(
  totalItems: number,
  itemHeight: number,
  containerHeight: number,
  scrollTop: number,
  overscan = 3
): VirtualRange {
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(totalItems, visibleStart + visibleCount + overscan);
  
  return {
    start,
    end,
    offsetTop: start * itemHeight,
    totalHeight: totalItems * itemHeight,
  };
}

/**
 * Hook for virtual scrolling with fixed item height.
 */
export function useVirtualScroll(
  totalItems: number,
  itemHeight: number,
  containerRef: React.RefObject<HTMLElement>,
  overscan = 3
): VirtualRange {
  const [range, setRange] = useState<VirtualRange>({
    start: 0,
    end: Math.min(totalItems, 20),
    offsetTop: 0,
    totalHeight: totalItems * itemHeight,
  });

  const updateRange = useRAFThrottle(() => {
    const container = containerRef.current;
    if (!container) return;

    const newRange = calculateVirtualRange(
      totalItems,
      itemHeight,
      container.clientHeight,
      container.scrollTop,
      overscan
    );

    setRange(prev => {
      if (prev.start === newRange.start && prev.end === newRange.end) {
        return prev;
      }
      return newRange;
    });
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', updateRange, { passive: true });
    window.addEventListener('resize', updateRange, { passive: true });
    updateRange();

    return () => {
      container.removeEventListener('scroll', updateRange);
      window.removeEventListener('resize', updateRange);
    };
  }, [totalItems, itemHeight, overscan]);

  return range;
}

// -------------------------------------------------------------------------
// RAF LOOP - Managed animation loop with cleanup
// -------------------------------------------------------------------------

export interface RAFLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Create a managed requestAnimationFrame loop.
 */
export function createRAFLoop(
  callback: (deltaTime: number, elapsed: number) => void
): RAFLoop {
  let frameId: number | null = null;
  let lastTime = 0;
  let startTime = 0;
  let running = false;

  const tick = (time: number) => {
    if (!running) return;
    
    if (lastTime === 0) {
      lastTime = time;
      startTime = time;
    }
    
    const deltaTime = time - lastTime;
    const elapsed = time - startTime;
    lastTime = time;
    
    callback(deltaTime, elapsed);
    
    frameId = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      frameId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}

/**
 * Hook that creates a stable RAF loop.
 */
export function useRAFLoop(
  callback: (deltaTime: number, elapsed: number) => void,
  enabled = true
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const loop = createRAFLoop((dt, elapsed) => {
      callbackRef.current(dt, elapsed);
    });

    loop.start();
    return () => loop.stop();
  }, [enabled]);
}

// -------------------------------------------------------------------------
// CLEANUP REGISTRY - Track and clean up subscriptions
// -------------------------------------------------------------------------

export type CleanupFn = () => void;

export class CleanupRegistry {
  private cleanups: CleanupFn[] = [];

  add(cleanup: CleanupFn): void {
    this.cleanups.push(cleanup);
  }

  cleanup(): void {
    for (const fn of this.cleanups) {
      try { fn(); } catch (e) { console.warn('[CleanupRegistry] Error:', e); }
    }
    this.cleanups = [];
  }
}

/**
 * Hook that tracks cleanup functions and runs them on unmount.
 */
export function useCleanup(): (cleanup: CleanupFn) => void {
  const registryRef = useRef<CleanupRegistry | null>(null);

  if (!registryRef.current) {
    registryRef.current = new CleanupRegistry();
  }

  useEffect(() => {
    return () => registryRef.current?.cleanup();
  }, []);

  return useCallback((cleanup: CleanupFn) => {
    registryRef.current?.add(cleanup);
  }, []);
}

// -------------------------------------------------------------------------
// DOUBLE BUFFER - Prevent flicker in canvas operations
// -------------------------------------------------------------------------

/**
 * Create a double-buffered canvas for flicker-free rendering.
 */
export function createDoubleBuffer(width: number, height: number): {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  backCtx: CanvasRenderingContext2D;
  swap: () => void;
  resize: (w: number, h: number) => void;
} {
  const front = document.createElement('canvas');
  const back = document.createElement('canvas');
  
  front.width = width;
  front.height = height;
  back.width = width;
  back.height = height;
  
  const frontCtx = front.getContext('2d')!;
  const backCtx = back.getContext('2d')!;
  
  return {
    front,
    back,
    backCtx,
    swap() {
      frontCtx.clearRect(0, 0, width, height);
      frontCtx.drawImage(back, 0, 0);
    },
    resize(w: number, h: number) {
      front.width = w;
      front.height = h;
      back.width = w;
      back.height = h;
    },
  };
}

// -------------------------------------------------------------------------
// INTERSECTION OBSERVER POOL - Reuse observers
// -------------------------------------------------------------------------

type IntersectionCallback = (entry: IntersectionObserverEntry) => void;

const observerPool = new Map<string, {
  observer: IntersectionObserver;
  callbacks: Map<Element, IntersectionCallback>;
}>();

/**
 * Get or create a shared IntersectionObserver for given options.
 */
export function observeIntersection(
  element: Element,
  callback: IntersectionCallback,
  options: IntersectionObserverInit = {}
): () => void {
  const key = JSON.stringify(options);
  
  let poolEntry = observerPool.get(key);
  
  if (!poolEntry) {
    const callbacks = new Map<Element, IntersectionCallback>();
    
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const cb = callbacks.get(entry.target);
        if (cb) cb(entry);
      }
    }, options);
    
    poolEntry = { observer, callbacks };
    observerPool.set(key, poolEntry);
  }
  
  poolEntry.callbacks.set(element, callback);
  poolEntry.observer.observe(element);
  
  return () => {
    poolEntry!.callbacks.delete(element);
    poolEntry!.observer.unobserve(element);
    
    if (poolEntry!.callbacks.size === 0) {
      poolEntry!.observer.disconnect();
      observerPool.delete(key);
    }
  };
}

/**
 * Hook for intersection observation with automatic cleanup.
 */
export function useIntersection(
  ref: React.RefObject<Element>,
  callback: IntersectionCallback,
  options?: IntersectionObserverInit
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    return observeIntersection(element, callback, options);
  }, [ref, callback, options]);
}

// -------------------------------------------------------------------------
// PERFORMANCE MARKS - Simple profiling helpers
// -------------------------------------------------------------------------

const perfMarks = new Map<string, number>();

export function perfStart(label: string): void {
  perfMarks.set(label, performance.now());
}

export function perfEnd(label: string): number {
  const start = perfMarks.get(label);
  if (start === undefined) return 0;
  
  const duration = performance.now() - start;
  perfMarks.delete(label);
  
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
  }
  
  return duration;
}
