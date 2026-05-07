// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Operation Smoothness primitives — wave G.
 *
 * Pure functions and tiny stateful machines that surfaces opt into to
 * feel world-class: frame-budget yields, debouncing, throttling,
 * hover-intent timing, scroll-position memory, idle prefetch queueing,
 * and a long-task ring buffer for a hidden perf overlay.
 *
 * No DOM, no React, no electron — every clock is supplied by the
 * caller so tests are deterministic.
 */

// DEX v3.8.9 wave G - smoothness helpers

// -------- frame budget ------------------------------------------------------

/** Default budget per frame in ms (60fps target leaves ~12ms after browser overhead). */
export const FRAME_BUDGET_MS = 12 as const;

/**
 * Walk an array, calling `step` for each item, but yield to the caller
 * whenever the elapsed wall-clock time crosses `budgetMs`. Returns the
 * index reached so the caller can resume on the next frame.
 *
 * Pure: takes an explicit `now()` clock so it is deterministic in tests.
 */
export function stepWithBudget<T>(
  items: readonly T[],
  startIndex: number,
  step: (item: T, index: number) => void,
  now: () => number,
  budgetMs: number = FRAME_BUDGET_MS
): { nextIndex: number; done: boolean } {
  if (startIndex < 0) startIndex = 0;
  if (startIndex >= items.length) return { nextIndex: items.length, done: true };
  const start = now();
  let i = startIndex;
  while (i < items.length) {
    step(items[i], i);
    i += 1;
    if (now() - start >= budgetMs) break;
  }
  return { nextIndex: i, done: i >= items.length };
}

// -------- debounce ---------------------------------------------------------

/**
 * Decide whether a fresh event should fire now or be deferred. Returns
 * the next allowed-fire timestamp; caller stores it and re-checks.
 *
 * `nextAllowed === nowMs` means "fire now".
 */
export function debouncePlan(
  nowMs: number,
  lastFiredMs: number | null,
  delayMs: number
): { fire: boolean; nextAllowedMs: number } {
  if (lastFiredMs === null) return { fire: true, nextAllowedMs: nowMs };
  const elapsed = nowMs - lastFiredMs;
  if (elapsed >= delayMs) return { fire: true, nextAllowedMs: nowMs };
  return { fire: false, nextAllowedMs: lastFiredMs + delayMs };
}

// -------- throttle ---------------------------------------------------------

/**
 * Leading-edge throttle: fire once, then ignore all events within
 * `intervalMs`. Returns whether to fire and when the next fire is allowed.
 */
export function throttlePlan(
  nowMs: number,
  lastFiredMs: number | null,
  intervalMs: number
): { fire: boolean; nextAllowedMs: number } {
  if (lastFiredMs === null) return { fire: true, nextAllowedMs: nowMs + intervalMs };
  if (nowMs - lastFiredMs >= intervalMs) {
    return { fire: true, nextAllowedMs: nowMs + intervalMs };
  }
  return { fire: false, nextAllowedMs: lastFiredMs + intervalMs };
}

// -------- hover intent -----------------------------------------------------

/**
 * Default hover-intent delay in ms — long enough that a fast cursor
 * sweep does not flash a tooltip, short enough that intentional dwell
 * feels instant.
 */
export const HOVER_INTENT_MS = 80 as const;

export interface HoverIntentState {
  /** When the cursor first entered the target. Null = not hovering. */
  enteredAt: number | null;
  /** Whether the intent has fired. */
  fired: boolean;
}

/** Initial state for a hover-intent tracker. */
export function newHoverIntent(): HoverIntentState {
  return { enteredAt: null, fired: false };
}

/** Cursor entered the target. */
export function hoverEnter(state: HoverIntentState, nowMs: number): HoverIntentState {
  return { enteredAt: nowMs, fired: false };
}

/** Cursor left the target — clears any pending intent. */
export function hoverLeave(_state: HoverIntentState): HoverIntentState {
  return newHoverIntent();
}

/**
 * Tick the hover-intent state machine. Returns `{ fired: true }` when
 * the dwell time crosses `delayMs` and the intent has not already fired.
 */
export function hoverTick(
  state: HoverIntentState,
  nowMs: number,
  delayMs: number = HOVER_INTENT_MS
): { state: HoverIntentState; fire: boolean } {
  if (state.enteredAt === null) return { state, fire: false };
  if (state.fired) return { state, fire: false };
  if (nowMs - state.enteredAt >= delayMs) {
    return { state: { enteredAt: state.enteredAt, fired: true }, fire: true };
  }
  return { state, fire: false };
}

// -------- scroll position memory ------------------------------------------

/**
 * Per-route scroll-position memory. Keyed by an arbitrary route key
 * (path + qs). Pure map operations — caller persists if desired.
 */
export interface ScrollMemory {
  positions: Record<string, number>;
}

export function newScrollMemory(): ScrollMemory {
  return { positions: {} };
}

export function rememberScroll(memory: ScrollMemory, key: string, scrollTop: number): ScrollMemory {
  if (key === '') return memory;
  return { positions: { ...memory.positions, [key]: Math.max(0, Math.floor(scrollTop)) } };
}

export function recallScroll(memory: ScrollMemory, key: string): number {
  return memory.positions[key] ?? 0;
}

export function forgetScroll(memory: ScrollMemory, key: string): ScrollMemory {
  if (!(key in memory.positions)) return memory;
  const next = { ...memory.positions };
  delete next[key];
  return { positions: next };
}

// -------- idle prefetch queue ---------------------------------------------

export interface PrefetchTask<T = unknown> {
  /** Stable id so duplicates are deduped. */
  id: string;
  /** Higher = sooner. Default 0. */
  priority?: number;
  /** Opaque payload the caller will hand back to its loader. */
  payload: T;
}

/**
 * Pure priority queue for idle-time prefetches. Higher `priority`
 * fires first; ties break by insertion order (FIFO). Adding a task
 * with an existing id replaces the priority but keeps the position.
 */
export interface PrefetchQueue<T = unknown> {
  tasks: PrefetchTask<T>[];
}

export function newPrefetchQueue<T>(): PrefetchQueue<T> {
  return { tasks: [] };
}

export function enqueuePrefetch<T>(
  queue: PrefetchQueue<T>,
  task: PrefetchTask<T>
): PrefetchQueue<T> {
  const existing = queue.tasks.findIndex((t) => t.id === task.id);
  if (existing >= 0) {
    const next = queue.tasks.slice();
    next[existing] = { ...next[existing], priority: task.priority ?? 0, payload: task.payload };
    return { tasks: next };
  }
  return { tasks: [...queue.tasks, task] };
}

export function dequeuePrefetch<T>(queue: PrefetchQueue<T>): {
  task: PrefetchTask<T> | null;
  rest: PrefetchQueue<T>;
} {
  if (queue.tasks.length === 0) return { task: null, rest: queue };
  let bestIndex = 0;
  let bestPriority = queue.tasks[0].priority ?? 0;
  for (let i = 1; i < queue.tasks.length; i += 1) {
    const p = queue.tasks[i].priority ?? 0;
    if (p > bestPriority) {
      bestPriority = p;
      bestIndex = i;
    }
  }
  const task = queue.tasks[bestIndex];
  const rest = { tasks: queue.tasks.slice(0, bestIndex).concat(queue.tasks.slice(bestIndex + 1)) };
  return { task, rest };
}

// -------- long-task ring buffer (perf overlay) ----------------------------

export const LONG_TASK_THRESHOLD_MS = 50 as const;
export const LONG_TASK_BUFFER_SIZE = 100 as const;

export interface LongTask {
  /** Wall-clock timestamp when the task started. */
  startedAt: number;
  /** Duration in ms. */
  durationMs: number;
  /** Free-form label so the overlay can group ("nexus.render", "files.scan"). */
  label: string;
}

export interface LongTaskBuffer {
  entries: LongTask[];
  capacity: number;
}

export function newLongTaskBuffer(capacity: number = LONG_TASK_BUFFER_SIZE): LongTaskBuffer {
  return { entries: [], capacity: Math.max(1, capacity) };
}

/**
 * Record a finished task. Tasks under the threshold are dropped
 * silently; long ones are appended and the buffer trimmed to capacity.
 */
export function recordTask(
  buffer: LongTaskBuffer,
  task: LongTask,
  thresholdMs: number = LONG_TASK_THRESHOLD_MS
): LongTaskBuffer {
  if (task.durationMs < thresholdMs) return buffer;
  const next = [...buffer.entries, task];
  if (next.length > buffer.capacity) next.splice(0, next.length - buffer.capacity);
  return { entries: next, capacity: buffer.capacity };
}

/** Group tasks by label, summing duration and count. */
export function summariseTasks(buffer: LongTaskBuffer): Array<{
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
}> {
  const map = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  for (const task of buffer.entries) {
    const cur = map.get(task.label) ?? { count: 0, totalMs: 0, maxMs: 0 };
    cur.count += 1;
    cur.totalMs += task.durationMs;
    if (task.durationMs > cur.maxMs) cur.maxMs = task.durationMs;
    map.set(task.label, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

// -------- reduced-motion fallback ----------------------------------------

/**
 * Returns the duration the caller should actually animate for, given
 * the user's reduced-motion preference. Reduced motion collapses to 0
 * (instant) by default; opacity-only transitions can pass a small
 * non-zero `opacityFallback`.
 */
export function effectiveAnimationMs(
  requestedMs: number,
  prefersReducedMotion: boolean,
  opacityFallback: number = 0
): number {
  if (!prefersReducedMotion) return Math.max(0, requestedMs);
  return Math.max(0, opacityFallback);
}
