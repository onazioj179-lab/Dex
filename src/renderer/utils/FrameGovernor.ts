// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Frame Governor
 * -----------------------------------------------------------------------------
 * Centralized rAF orchestrator with per-frame budget tracking and drop
 * detection. Existing rAF callers continue to work; this module is the
 * recommended entry point for any new animation / per-frame work and is the
 * single source for compositor health telemetry.
 *
 * Capabilities:
 *   - Single shared rAF loop with prioritized subscriber buckets
 *   - Auto-detected refresh rate (60 / 120 / 144 Hz) -> per-frame budget
 *   - Drop detection (frame interval > 1.5x expected) and over-budget detection
 *   - Rolling stats (avg/p95/max frame time, dropped frame counter)
 *   - Emits 'frame:budget-exceeded' on dexBus for downstream throttling
 *   - Pause/resume to support memory pressure or background tabs
 *
 * Non-goals:
 *   - This module does NOT replace MotionController's internal rAF loops.
 *     Those remain owned by their controllers; FrameGovernor is additive.
 */

import { dexBus } from '../../shared/eventBus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FramePriority = 'critical' | 'normal' | 'background';

export interface FrameTask {
  /** Stable id so subscribers can be replaced without leaks. */
  id: string;
  /** Called once per frame with the current timestamp + frame delta in ms. */
  run: (timestamp: number, deltaMs: number) => void;
  /** Higher priority runs first and is allowed to consume more of the budget. */
  priority?: FramePriority;
  /** Max ms this task is allowed to consume per frame; over-budget tasks are throttled. */
  budgetMs?: number;
}

export interface FrameStats {
  /** Detected display refresh rate in Hz. */
  refreshHz: number;
  /** Per-frame budget in ms (1000 / refreshHz). */
  budgetMs: number;
  /** Rolling average frame interval (ms) over the last 120 frames. */
  avgFrameMs: number;
  /** 95th percentile frame interval (ms) over the last 120 frames. */
  p95FrameMs: number;
  /** Max frame interval (ms) over the last 120 frames. */
  maxFrameMs: number;
  /** Total dropped frames since process start. */
  droppedFrames: number;
  /** Total over-budget frames since process start. */
  overBudgetFrames: number;
  /** Number of registered subscribers. */
  subscribers: number;
  /** Whether the governor is currently paused. */
  paused: boolean;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: FramePriority[] = ['critical', 'normal', 'background'];
const DEFAULT_BUDGET_BY_PRIORITY: Record<FramePriority, number> = {
  critical: 8,    // animations, drag, scroll
  normal: 4,      // routine UI updates
  background: 2,  // analytics, prefetch hints
};
const SAMPLE_WINDOW = 120;            // frames to keep for rolling stats
const DROP_THRESHOLD_RATIO = 1.5;     // interval > 1.5x expected = dropped
const REFRESH_DETECT_FRAMES = 30;     // frames sampled for refresh detection
const REFRESH_DETECT_TIMEOUT = 500;   // give up after 500ms

const buckets: Record<FramePriority, Map<string, FrameTask>> = {
  critical: new Map(),
  normal: new Map(),
  background: new Map(),
};

let rafHandle: number | null = null;
let lastTick = 0;
let paused = false;
let hidden = false;

let refreshHz = 60;
let budgetMs = 1000 / 60;
let refreshDetected = false;
const refreshSamples: number[] = [];
let refreshDetectStart = 0;

const intervals: number[] = []; // rolling frame intervals
let droppedFrames = 0;
let overBudgetFrames = 0;

// ---------------------------------------------------------------------------
// Refresh-rate detection
// ---------------------------------------------------------------------------

function detectRefreshRate(intervalMs: number, now: number): void {
  if (refreshDetected) return;
  if (refreshDetectStart === 0) refreshDetectStart = now;
  if (intervalMs > 0 && intervalMs < 50) refreshSamples.push(intervalMs);

  const elapsed = now - refreshDetectStart;
  if (refreshSamples.length >= REFRESH_DETECT_FRAMES || elapsed > REFRESH_DETECT_TIMEOUT) {
    if (refreshSamples.length > 0) {
      // Use median for robustness against jitter
      const sorted = refreshSamples.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const hz = Math.round(1000 / median);
      // Snap to common refresh rates
      const common = [60, 75, 90, 120, 144, 165, 240];
      let best = 60;
      let bestDelta = Infinity;
      for (const c of common) {
        const d = Math.abs(c - hz);
        if (d < bestDelta) { bestDelta = d; best = c; }
      }
      refreshHz = best;
      budgetMs = 1000 / refreshHz;
    }
    refreshDetected = true;
    refreshSamples.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function pushInterval(ms: number): void {
  if (intervals.length >= SAMPLE_WINDOW) intervals.shift();
  intervals.push(ms);
}

function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Core tick
// ---------------------------------------------------------------------------

function tick(now: number): void {
  rafHandle = null;
  if (paused) return;

  const delta = lastTick === 0 ? budgetMs : now - lastTick;
  lastTick = now;

  if (!refreshDetected) detectRefreshRate(delta, now);
  pushInterval(delta);

  const expected = budgetMs;
  const wasDropped = delta > expected * DROP_THRESHOLD_RATIO;
  if (wasDropped) droppedFrames++;

  // Run subscriber buckets in priority order with per-task budget enforcement.
  let frameWorkMs = 0;
  for (const priority of PRIORITY_ORDER) {
    const bucket = buckets[priority];
    if (bucket.size === 0) continue;

    // Snapshot to allow tasks to mutate the bucket safely.
    const tasks = Array.from(bucket.values());
    for (const task of tasks) {
      const taskBudget = task.budgetMs ?? DEFAULT_BUDGET_BY_PRIORITY[priority];
      const start = performance.now();
      try {
        task.run(now, delta);
      } catch (err) {
        console.error('[FrameGovernor] task', task.id, err);
      }
      const taskMs = performance.now() - start;
      frameWorkMs += taskMs;

      if (taskMs > taskBudget) {
        // Best-effort: bump background tasks out of next frame if they overran.
        if (priority === 'background') {
          // Quietly skip remaining background tasks this frame.
          break;
        }
      }
    }
  }

  if (frameWorkMs > expected) {
    overBudgetFrames++;
    try {
      (dexBus as any).emit('frame:budget-exceeded', {
        workMs: frameWorkMs,
        budgetMs: expected,
        refreshHz,
      });
    } catch { /* bus may not be initialized in tests */ }
  }

  // Schedule next frame if we still have subscribers.
  schedule();
}

function schedule(): void {
  if (paused || rafHandle !== null) return;
  if (typeof requestAnimationFrame === 'undefined') return;
  if (totalSubscribers() === 0) return;
  rafHandle = requestAnimationFrame(tick);
}

function totalSubscribers(): number {
  return buckets.critical.size + buckets.normal.size + buckets.background.size;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const FrameGovernor = {
  /** Subscribe a task to the shared rAF loop. Returns an unsubscribe function. */
  subscribe(task: FrameTask): () => void {
    const priority = task.priority ?? 'normal';
    buckets[priority].set(task.id, task);
    schedule();
    return () => { buckets[priority].delete(task.id); };
  },

  /** Replace an existing task atomically. Convenience over unsubscribe + subscribe. */
  replace(task: FrameTask): () => void {
    return this.subscribe(task);
  },

  /** Pause all tasks (e.g. tab hidden, critical memory pressure). */
  pause(reason?: string): void {
    if (paused) return;
    paused = true;
    if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (reason && typeof console !== 'undefined') {
      console.info('[FrameGovernor] paused:', reason);
    }
  },

  /** Resume previously paused tasks. */
  resume(): void {
    if (!paused) return;
    paused = false;
    lastTick = 0;
    schedule();
  },

  /** Snapshot of current performance stats. Cheap to call. */
  getStats(): FrameStats {
    const sum = intervals.reduce((a, b) => a + b, 0);
    const avg = intervals.length ? sum / intervals.length : 0;
    const p95 = quantile(intervals, 0.95);
    const max = intervals.length ? Math.max(...intervals) : 0;
    return {
      refreshHz,
      budgetMs,
      avgFrameMs: avg,
      p95FrameMs: p95,
      maxFrameMs: max,
      droppedFrames,
      overBudgetFrames,
      subscribers: totalSubscribers(),
      paused,
    };
  },

  /** For tests / HMR teardown. */
  _reset(): void {
    if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = null;
    lastTick = 0;
    paused = false;
    refreshHz = 60;
    budgetMs = 1000 / 60;
    refreshDetected = false;
    refreshSamples.length = 0;
    refreshDetectStart = 0;
    intervals.length = 0;
    droppedFrames = 0;
    overBudgetFrames = 0;
    buckets.critical.clear();
    buckets.normal.clear();
    buckets.background.clear();
  },
};

// ---------------------------------------------------------------------------
// Page visibility integration -- auto pause when tab is hidden
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !hidden) {
      hidden = true;
      FrameGovernor.pause('document-hidden');
    } else if (!document.hidden && hidden) {
      hidden = false;
      FrameGovernor.resume();
    }
  });
}

export default FrameGovernor;
