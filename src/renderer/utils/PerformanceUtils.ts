// ═══════════════════════════════════════════════════════════════════════════
// DEX - Performance Utilities
// Phase 10: Final performance hardening utilities
// ═══════════════════════════════════════════════════════════════════════════

import { useRef, useMemo, useEffect, DependencyList } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// DEBOUNCE & THROTTLE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Debounce a function - only call after a delay since last invocation
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function - only call once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= interval) {
      lastCall = now;
      fn(...args);
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, interval - timeSinceLastCall);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// REACT HOOKS FOR PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// MEMOIZATION
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// RENDER OPTIMIZATION
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// ASYNC UTILITIES
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// DOM OPTIMIZATION
// ─────────────────────────────────────────────────────────────────────────

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
import { useState } from 'react';
