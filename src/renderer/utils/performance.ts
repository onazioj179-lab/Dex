// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 30: UI Performance Utilities
// Core utilities for rendering optimization and input latency control
// ===========================================================================

// -----------------------------------------------------------------------------
// IDLE CALLBACK MANAGEMENT
// -----------------------------------------------------------------------------

type IdleCallback = (deadline: IdleDeadline) => void;

interface IdleWorkItem {
  id: number;
  callback: IdleCallback;
  priority: number;
}

const idleCallbackQueue: IdleWorkItem[] = [];
let idleCallbackScheduled = false;
let nextIdleWorkId = 1;

/**
 * Schedule work during browser idle time
 * Priority: 1 (highest) to 10 (lowest)
 * Returns an ID that can be used to cancel the work
 */
export function scheduleIdleWork(callback: IdleCallback, priority = 5): number {
  const id = nextIdleWorkId++;
  idleCallbackQueue.push({ id, callback, priority });
  idleCallbackQueue.sort((a, b) => a.priority - b.priority);
  
  if (!idleCallbackScheduled) {
    idleCallbackScheduled = true;
    requestIdleCallback(processIdleQueue, { timeout: 2000 });
  }
  
  return id;
}

/**
 * Cancel scheduled idle work by ID
 */
export function cancelIdleWork(id: number): boolean {
  const index = idleCallbackQueue.findIndex(item => item.id === id);
  if (index !== -1) {
    idleCallbackQueue.splice(index, 1);
    return true;
  }
  return false;
}

function processIdleQueue(deadline: IdleDeadline): void {
  while (idleCallbackQueue.length > 0 && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
    const item = idleCallbackQueue.shift();
    if (item) {
      try {
        item.callback(deadline);
      } catch (err) {
        console.error('[IdleWork] Error in idle callback:', err);
      }
    }
  }
  
  if (idleCallbackQueue.length > 0) {
    requestIdleCallback(processIdleQueue, { timeout: 2000 });
  } else {
    idleCallbackScheduled = false;
  }
}

// -----------------------------------------------------------------------------
// THROTTLING & DEBOUNCING
// -----------------------------------------------------------------------------

/**
 * Throttle function calls - max one call per interval
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  intervalMs: number
): T {
  let lastCall = 0;
  let scheduledCall: ReturnType<typeof setTimeout> | null = null;
  
  return ((...args: unknown[]) => {
    const now = performance.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    } else if (!scheduledCall) {
      scheduledCall = setTimeout(() => {
        lastCall = performance.now();
        scheduledCall = null;
        fn(...args);
      }, intervalMs - timeSinceLastCall);
    }
  }) as T;
}

/**
 * Debounce function calls - only call after pause in invocations
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const debounced = ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delayMs);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

// -----------------------------------------------------------------------------
// FRAME BUDGET MANAGEMENT
// ---------------------------------------------------------====================

const FRAME_BUDGET_MS = 16; // 60fps target

/**
 * Execute work in chunks that fit within frame budget
 */
export async function executeInFrameBudget<T>(
  items: T[],
  processor: (item: T) => void,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  let processed = 0;
  const total = items.length;
  
  return new Promise((resolve) => {
    function processChunk(): void {
      const startTime = performance.now();
      
      while (processed < total) {
        processor(items[processed]);
        processed++;
        
        if (performance.now() - startTime > FRAME_BUDGET_MS * 0.8) {
          // Approaching frame budget, yield
          onProgress?.(processed, total);
          requestAnimationFrame(processChunk);
          return;
        }
      }
      
      onProgress?.(processed, total);
      resolve();
    }
    
    requestAnimationFrame(processChunk);
  });
}

// -----------------------------------------------------------------------------
// RENDER TRACKING
// -----------------------------------------------------------------------------

interface RenderMetrics {
  component: string;
  renderCount: number;
  totalTime: number;
  avgTime: number;
  lastRender: number;
}

const renderMetrics = new Map<string, RenderMetrics>();

/**
 * Track render performance for a component
 */
export function trackRender(component: string, renderTime: number): void {
  const existing = renderMetrics.get(component);
  
  if (existing) {
    existing.renderCount++;
    existing.totalTime += renderTime;
    existing.avgTime = existing.totalTime / existing.renderCount;
    existing.lastRender = Date.now();
  } else {
    renderMetrics.set(component, {
      component,
      renderCount: 1,
      totalTime: renderTime,
      avgTime: renderTime,
      lastRender: Date.now()
    });
  }
}

/**
 * Get render metrics for debugging
 */
export function getRenderMetrics(): RenderMetrics[] {
  return Array.from(renderMetrics.values())
    .sort((a, b) => b.totalTime - a.totalTime);
}

/**
 * Clear render metrics
 */
export function clearRenderMetrics(): void {
  renderMetrics.clear();
}

// -----------------------------------------------------------------------------
// MEMORY MANAGEMENT
// -----------------------------------------------------------------------------

/**
 * LRU Cache with size limit
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
  }
  
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
  
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
  
  values(): IterableIterator<V> {
    return this.cache.values();
  }
}

// -----------------------------------------------------------------------------
// ANIMATION BUDGET SYSTEM
// -----------------------------------------------------------------------------

interface AnimationConfig {
  enabled: boolean;
  duration: number;
  reducedMotion: boolean;
}

let animationConfig: AnimationConfig = {
  enabled: true,
  duration: 150,
  reducedMotion: false
};

/**
 * Initialize animation system - respects user preferences
 */
export function initAnimationSystem(): void {
  // Check for reduced motion preference
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  animationConfig.reducedMotion = mediaQuery.matches;
  
  mediaQuery.addEventListener('change', (e) => {
    animationConfig.reducedMotion = e.matches;
  });
}

/**
 * Get animation duration based on current config
 */
export function getAnimationDuration(base = 150): number {
  if (!animationConfig.enabled || animationConfig.reducedMotion) {
    return 0;
  }
  return Math.min(base, animationConfig.duration);
}

/**
 * Check if animations are enabled
 */
export function areAnimationsEnabled(): boolean {
  return animationConfig.enabled && !animationConfig.reducedMotion;
}

/**
 * Disable animations (e.g., under high load)
 */
export function setAnimationsEnabled(enabled: boolean): void {
  animationConfig.enabled = enabled;
}

// -----------------------------------------------------------------------------
// INPUT LATENCY TRACKING
// -----------------------------------------------------------------------------

let inputLatencySum = 0;
let inputLatencyCount = 0;
let lastInputTime = 0;
let interactionStartTime = 0;
let isInteracting = false;

/**
 * Mark the start of a user interaction
 */
export function markInteractionStart(): void {
  interactionStartTime = performance.now();
  isInteracting = true;
}

/**
 * Mark the end of a user interaction
 * Returns the duration of the interaction in milliseconds
 */
export function markInteractionEnd(): number {
  const duration = performance.now() - interactionStartTime;
  isInteracting = false;
  return duration;
}

/**
 * Track input event latency
 */
export function trackInputLatency(eventTime: number): void {
  const now = performance.now();
  const latency = now - eventTime;
  
  inputLatencySum += latency;
  inputLatencyCount++;
  lastInputTime = now;
  
  // Warn if latency is high
  if (latency > 100) {
    console.warn(`[Performance] High input latency: ${latency.toFixed(1)}ms`);
  }
}

/**
 * Get average input latency
 */
export function getAverageInputLatency(): number {
  if (inputLatencyCount === 0) return 0;
  return inputLatencySum / inputLatencyCount;
}

/**
 * Check if user is actively interacting
 */
export function isUserInteracting(): boolean {
  return isInteracting || performance.now() - lastInputTime < 100;
}

// -----------------------------------------------------------------------------
// INTERSECTION OBSERVER POOL
// -----------------------------------------------------------------------------

type IntersectionCallback = (isIntersecting: boolean) => void;

const observerCallbacks = new WeakMap<Element, IntersectionCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const callback = observerCallbacks.get(entry.target);
          callback?.(entry.isIntersecting);
        }
      },
      { rootMargin: '100px' } // Pre-load slightly before visible
    );
  }
  return sharedObserver;
}

/**
 * Observe element visibility using shared observer
 */
export function observeVisibility(
  element: Element,
  callback: IntersectionCallback
): () => void {
  const observer = getSharedObserver();
  observerCallbacks.set(element, callback);
  observer.observe(element);
  
  return () => {
    observer.unobserve(element);
    observerCallbacks.delete(element);
  };
}

// -----------------------------------------------------------------------------
// REQUEST COALESCING
// -----------------------------------------------------------------------------

const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * Coalesce identical requests - returns existing promise if request is in flight
 */
export function coalesceRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  
  const promise = requestFn().finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, promise);
  return promise;
}
