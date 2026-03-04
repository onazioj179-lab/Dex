// ═══════════════════════════════════════════════════════════════════════════
// DEX - Renderer Performance Utilities
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ═══════════════════════════════════════════════════════════════════════════
// Render Path Micro-Optimization + 120Hz Support
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// RENDER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const RENDER_CONFIG = {
  // Frame targets
  TARGET_FRAME_TIME_120HZ: 8.33,
  TARGET_FRAME_TIME_60HZ: 16.67,
  
  // Paint budgets
  MAX_PAINT_TIME_MS: 4,
  MAX_LAYOUT_TIME_MS: 2,
  MAX_STYLE_TIME_MS: 1,
  
  // Virtualization
  OVERSCAN_COUNT: 3,                   // Items to render beyond viewport
  RECYCLE_THRESHOLD: 50,               // Recycle DOM nodes after this many
  
  // Memoization
  MEMO_CACHE_SIZE: 100,                // Max memoized values
  MEMO_TTL_MS: 60000,                  // Memo expiry time
  
  // Batching
  BATCH_DELAY_MS: 0,                   // Use microtask timing
  MAX_BATCH_SIZE: 10,                  // Max updates per batch
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// VIRTUALIZED LIST HOOK
// ═══════════════════════════════════════════════════════════════════════════

interface VirtualizedListOptions<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualizedListResult<T> {
  visibleItems: Array<{ item: T; index: number; style: React.CSSProperties }>;
  totalHeight: number;
  onScroll: (scrollTop: number) => void;
  scrollTop: number;
}

/**
 * Virtualized list hook - renders only visible items
 * Scales with what's visible, not total data size
 */
export function useVirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = RENDER_CONFIG.OVERSCAN_COUNT,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleItems = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    
    const result: Array<{ item: T; index: number; style: React.CSSProperties }> = [];
    
    for (let i = startIndex; i < endIndex; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: 'absolute',
          top: i * itemHeight,
          height: itemHeight,
          left: 0,
          right: 0,
          willChange: 'transform', // GPU layer hint
        },
      });
    }
    
    return result;
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);
  
  const totalHeight = items.length * itemHeight;
  
  const onScroll = useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
  }, []);
  
  return { visibleItems, totalHeight, onScroll, scrollTop };
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER SCHEDULING
// ═══════════════════════════════════════════════════════════════════════════

type RenderCallback = () => void;

let pendingRenders: RenderCallback[] = [];
let isScheduled = false;

/**
 * Schedule a render update aligned with frame timing
 * Batches multiple updates into single frame
 */
export function scheduleRender(callback: RenderCallback): void {
  pendingRenders.push(callback);
  
  if (!isScheduled) {
    isScheduled = true;
    requestAnimationFrame(() => {
      const renders = pendingRenders;
      pendingRenders = [];
      isScheduled = false;
      
      // Execute all pending renders
      for (const render of renders) {
        try {
          render();
        } catch (err) {
          console.error('[RenderScheduler] Render error:', err);
        }
      }
    });
  }
}

/**
 * Schedule work during idle time (non-blocking)
 */
export function scheduleIdleRender(callback: RenderCallback, timeout = 2000): void {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      (deadline) => {
        if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
          callback();
        } else {
          // Reschedule if no time
          scheduleIdleRender(callback, timeout);
        }
      },
      { timeout }
    );
  } else {
    // Fallback: use setTimeout
    setTimeout(callback, 16);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MEMOIZATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

interface MemoEntry<T> {
  value: T;
  timestamp: number;
}

const memoCache = new Map<string, MemoEntry<unknown>>();

/**
 * Memoize expensive computations with TTL
 */
export function memoize<T>(key: string, compute: () => T, ttlMs = RENDER_CONFIG.MEMO_TTL_MS): T {
  const cached = memoCache.get(key) as MemoEntry<T> | undefined;
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < ttlMs) {
    return cached.value;
  }
  
  const value = compute();
  memoCache.set(key, { value, timestamp: now });
  
  // Prune old entries if cache is too large
  if (memoCache.size > RENDER_CONFIG.MEMO_CACHE_SIZE) {
    const oldestKey = memoCache.keys().next().value;
    if (oldestKey) memoCache.delete(oldestKey);
  }
  
  return value;
}

/**
 * Clear memoization cache
 */
export function clearMemoCache(): void {
  memoCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT HOOKS FOR PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook that only re-renders when value actually changes (deep compare)
 */
export function useStableValue<T>(value: T): T {
  const ref = useRef<T>(value);
  const stringified = JSON.stringify(value);
  const prevStringified = useRef(stringified);
  
  if (prevStringified.current !== stringified) {
    ref.current = value;
    prevStringified.current = stringified;
  }
  
  return ref.current;
}

/**
 * Hook that defers updates to idle time
 */
export function useDeferredValue<T>(value: T, maxWait = 100): T {
  const [deferredValue, setDeferredValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Use idle callback if available
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(
        () => setDeferredValue(value),
        { timeout: maxWait }
      );
      return () => cancelIdleCallback(id);
    } else {
      timeoutRef.current = setTimeout(() => {
        setDeferredValue(value);
      }, 16); // One frame
      return () => clearTimeout(timeoutRef.current);
    }
  }, [value, maxWait]);
  
  return deferredValue;
}

/**
 * Hook that tracks render count (for debugging)
 */
export function useRenderCount(componentName: string): number {
  const countRef = useRef(0);
  countRef.current++;
  
  useEffect(() => {
    if (countRef.current > 100) {
      console.warn(`[RenderCount] ${componentName} has rendered ${countRef.current} times`);
    }
  });
  
  return countRef.current;
}

/**
 * Hook that prevents unnecessary re-renders from callbacks
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const ref = useRef(callback);
  ref.current = callback;
  
  return useCallback((...args: Parameters<T>) => {
    return ref.current(...args);
  }, []) as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// FRAME TIME MEASUREMENT
// ═══════════════════════════════════════════════════════════════════════════

let lastFrameTime = performance.now();
let frameTimeHistory: number[] = [];

/**
 * Measure frame time for performance tracking
 */
export function measureFrameTime(): { frameTime: number; avgFrameTime: number } {
  const now = performance.now();
  const frameTime = now - lastFrameTime;
  lastFrameTime = now;
  
  frameTimeHistory.push(frameTime);
  if (frameTimeHistory.length > 60) {
    frameTimeHistory.shift();
  }
  
  const avgFrameTime = frameTimeHistory.reduce((a, b) => a + b, 0) / frameTimeHistory.length;
  
  return { frameTime, avgFrameTime };
}

/**
 * Check if we're within frame budget
 */
export function isWithinFrameBudget(target = RENDER_CONFIG.TARGET_FRAME_TIME_120HZ): boolean {
  if (frameTimeHistory.length === 0) return true;
  const avgFrameTime = frameTimeHistory.reduce((a, b) => a + b, 0) / frameTimeHistory.length;
  return avgFrameTime <= target;
}

// ═══════════════════════════════════════════════════════════════════════════
// GPU LAYER HINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CSS properties that promote to GPU layer (use sparingly!)
 */
export const GPU_LAYER_STYLES: React.CSSProperties = {
  transform: 'translateZ(0)',
  willChange: 'transform',
};

/**
 * CSS properties for compositor-only animations
 */
export const COMPOSITOR_SAFE_STYLES: React.CSSProperties = {
  willChange: 'transform, opacity',
};

/**
 * Remove GPU layer hints after animation
 */
export const RESET_LAYER_STYLES: React.CSSProperties = {
  transform: 'none',
  willChange: 'auto',
};

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optimized scroll handler with passive events
 */
export function createScrollHandler(
  callback: (scrollTop: number) => void,
  throttleMs = 8 // ~120Hz
): { onScroll: (e: React.UIEvent) => void; cleanup: () => void } {
  let lastCall = 0;
  let rafId: number | null = null;
  
  const onScroll = (e: React.UIEvent) => {
    const now = performance.now();
    const scrollTop = (e.target as HTMLElement).scrollTop;
    
    if (now - lastCall >= throttleMs) {
      lastCall = now;
      
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        callback(scrollTop);
        rafId = null;
      });
    }
  };
  
  const cleanup = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
  };
  
  return { onScroll, cleanup };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINT TIMING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Measure paint time for a render
 */
export async function measurePaintTime(renderFn: () => void): Promise<number> {
  const start = performance.now();
  
  renderFn();
  
  // Wait for paint
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  const end = performance.now();
  return end - start;
}

/**
 * Check if paint time is within budget
 */
export function isPaintWithinBudget(paintTime: number): boolean {
  return paintTime <= RENDER_CONFIG.MAX_PAINT_TIME_MS;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER BATCHING
// ═══════════════════════════════════════════════════════════════════════════

type BatchCallback = () => void;

let batchQueue: BatchCallback[] = [];
let batchScheduled = false;

/**
 * Batch multiple state updates into single render
 */
export function batchUpdates(callback: BatchCallback): void {
  batchQueue.push(callback);
  
  if (!batchScheduled) {
    batchScheduled = true;
    
    // Use microtask for immediate batching
    queueMicrotask(() => {
      const callbacks = batchQueue;
      batchQueue = [];
      batchScheduled = false;
      
      // Execute all batched updates
      for (const cb of callbacks) {
        try {
          cb();
        } catch (err) {
          console.error('[BatchUpdates] Error:', err);
        }
      }
    });
  }
}

export default {
  useVirtualizedList,
  useStableValue,
  useDeferredValue,
  useRenderCount,
  useStableCallback,
  scheduleRender,
  scheduleIdleRender,
  memoize,
  clearMemoCache,
  measureFrameTime,
  isWithinFrameBudget,
  createScrollHandler,
  measurePaintTime,
  isPaintWithinBudget,
  batchUpdates,
  GPU_LAYER_STYLES,
  COMPOSITOR_SAFE_STYLES,
  RESET_LAYER_STYLES,
  RENDER_CONFIG,
};
