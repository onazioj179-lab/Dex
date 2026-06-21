// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Leak Detector
 * -----------------------------------------------------------------------------
 * A long-session reliability instrument (Phase H: "leak detection, memory
 * snapshots"). DEX is meant to run for hours or days; this watches the JS heap
 * for SUSTAINED monotonic growth that would point to a slow leak, and surfaces
 * it quietly so it can be caught before it degrades the shell.
 *
 * It is an instrument, not a feature: no UI, no user prompts. It samples on a
 * timer, keeps a small rolling window of "memory snapshots", and — when growth
 * looks like a leak — emits a quiet `dex-leak-suspected` CustomEvent + a single
 * console.warn, rate-limited by a cooldown so it never spams.
 *
 * Heap source priority:
 *   1. `performance.memory.usedJSHeapSize` (Chromium, non-standard — typed
 *      defensively below).
 *   2. The latest `xenonStore` memoryUsedMB metric, as a fallback for engines
 *      that do not expose performance.memory.
 *
 * Usage (parent wires this at renderer boot):
 *   import { startLeakDetector } from './services/leakDetector';
 *   const stopLeakDetector = startLeakDetector();
 *   // ... on shutdown / HMR dispose: stopLeakDetector();
 *
 * Idempotent, SSR-safe, and dependency-free apart from the optional xenonStore
 * fallback and dexBus mirror. Importing it has no side effects on its own.
 */

import { dexBus } from '../../shared/eventBus';
import { useXenonStore } from '../store/xenonStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single memory observation. */
export interface MemorySnapshot {
  /** Epoch ms at which the sample was taken. */
  t: number;
  /** Used JS heap at that moment, in megabytes. */
  heapMB: number;
}

/** Summary of the current rolling window. */
export interface LeakReport {
  /** Most recent heap reading, in MB (0 if no sample yet). */
  currentMB: number;
  /** Minimum heap over the window, in MB. */
  minMB: number;
  /** Maximum heap over the window, in MB. */
  maxMB: number;
  /** Mean heap over the window, in MB. */
  avgMB: number;
  /**
   * Growth slope across the window, in MB per minute (least-squares fit).
   * Positive means the heap is trending up.
   */
  slopeMBPerMin: number;
  /** Number of snapshots in the window the report was computed from. */
  samples: number;
  /** Span covered by the window, in minutes. */
  windowMinutes: number;
  /** Where the most recent reading came from. */
  source: 'performance.memory' | 'xenonStore' | 'none';
}

export interface LeakDetectorOptions {
  /** Sampling interval, in ms. Default 60_000 (~1 min). */
  sampleIntervalMs?: number;
  /** How many snapshots to retain in the rolling window. Default 30 (~30 min). */
  windowSize?: number;
  /**
   * How many of the most-recent samples must rise monotonically to count as a
   * leak signal. Default 10.
   */
  monotonicRun?: number;
  /**
   * Total growth, in MB, that the monotonic run must exceed to be flagged.
   * Default 50.
   */
  growthThresholdMB?: number;
  /** Minimum gap between leak warnings, in ms. Default 600_000 (10 min). */
  cooldownMs?: number;
  /**
   * Fractional drop from the running peak that resets the baseline (treated as
   * a GC / deep-idle reclaim). Default 0.25 (a 25% drop resets).
   */
  reclaimResetFraction?: number;
}

interface ResolvedOptions extends Required<LeakDetectorOptions> {}

const DEFAULTS: ResolvedOptions = {
  sampleIntervalMs: 60_000,
  windowSize: 30,
  monotonicRun: 10,
  growthThresholdMB: 50,
  cooldownMs: 600_000,
  reclaimResetFraction: 0.25,
};

// ---------------------------------------------------------------------------
// Module state (singleton)
// ---------------------------------------------------------------------------

interface DetectorState {
  opts: ResolvedOptions;
  snapshots: MemorySnapshot[];
  timer: ReturnType<typeof setInterval> | null;
  lastWarnAt: number;
  /** Highest heap seen since the last baseline reset; used for reclaim detection. */
  peakMB: number;
}

let state: DetectorState | null = null;

// ---------------------------------------------------------------------------
// Heap sampling
// ---------------------------------------------------------------------------

/** Non-standard Chromium shape; typed defensively. */
interface PerformanceMemoryLike {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

/**
 * Reads the current heap in MB, preferring performance.memory and falling back
 * to the xenonStore metric. Returns null when no source is available.
 */
function readHeapMB(): { heapMB: number; source: LeakReport['source'] } | null {
  if (typeof performance !== 'undefined') {
    const mem = (performance as unknown as { memory?: PerformanceMemoryLike }).memory;
    const used = mem?.usedJSHeapSize;
    if (typeof used === 'number' && used > 0) {
      return { heapMB: used / (1024 * 1024), source: 'performance.memory' };
    }
  }

  // Fallback: the most recent kernel-pushed memory metric.
  try {
    const usedMB = useXenonStore.getState().memoryUsedMB;
    if (typeof usedMB === 'number' && usedMB > 0) {
      return { heapMB: usedMB, source: 'xenonStore' };
    }
  } catch {
    // Store may be unavailable in tests; ignore.
  }

  return null;
}

// ---------------------------------------------------------------------------
// Reporting / analysis
// ---------------------------------------------------------------------------

function computeReport(s: DetectorState): LeakReport {
  const snaps = s.snapshots;
  const n = snaps.length;
  if (n === 0) {
    return {
      currentMB: 0,
      minMB: 0,
      maxMB: 0,
      avgMB: 0,
      slopeMBPerMin: 0,
      samples: 0,
      windowMinutes: 0,
      source: 'none',
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const snap of snaps) {
    if (snap.heapMB < min) min = snap.heapMB;
    if (snap.heapMB > max) max = snap.heapMB;
    sum += snap.heapMB;
  }

  const first = snaps[0];
  const last = snaps[n - 1];
  const windowMs = last.t - first.t;
  const windowMinutes = windowMs / 60_000;

  return {
    currentMB: round1(last.heapMB),
    minMB: round1(min),
    maxMB: round1(max),
    avgMB: round1(sum / n),
    slopeMBPerMin: round1(slopeMBPerMin(snaps)),
    samples: n,
    windowMinutes: round1(windowMinutes),
    source: lastSource,
  };
}

/** Tracks the source of the most recent sample for reporting. */
let lastSource: LeakReport['source'] = 'none';

/** Least-squares slope of heapMB vs time, expressed as MB per minute. */
function slopeMBPerMin(snaps: MemorySnapshot[]): number {
  const n = snaps.length;
  if (n < 2) return 0;

  // Use minutes-relative-to-first as x to keep the numbers well-conditioned.
  const x0 = snaps[0].t;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const snap of snaps) {
    const x = (snap.t - x0) / 60_000; // minutes
    const y = snap.heapMB;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Returns true when the tail of the window shows sustained monotonic growth
 * exceeding the configured total-growth threshold.
 */
function isLeakSuspected(s: DetectorState): boolean {
  const { monotonicRun, growthThresholdMB } = s.opts;
  const snaps = s.snapshots;
  if (snaps.length < monotonicRun) return false;

  const tail = snaps.slice(-monotonicRun);
  for (let i = 1; i < tail.length; i += 1) {
    // Strictly non-decreasing; equal samples don't break the run (flat noise),
    // but a single dip does — a real leak climbs steadily.
    if (tail[i].heapMB < tail[i - 1].heapMB) return false;
  }

  const totalGrowth = tail[tail.length - 1].heapMB - tail[0].heapMB;
  return totalGrowth >= growthThresholdMB;
}

// ---------------------------------------------------------------------------
// Sampling tick
// ---------------------------------------------------------------------------

function tick(s: DetectorState): void {
  const reading = readHeapMB();
  if (!reading) return;
  lastSource = reading.source;

  const heapMB = reading.heapMB;

  // Deep-idle / GC reclaim: a large drop from the running peak means the engine
  // gave memory back, so the old baseline is no longer meaningful. Reset the
  // window to the post-reclaim level rather than measuring growth against a
  // pre-reclaim peak (which would mask or distort the next leak signal).
  if (s.peakMB > 0 && heapMB < s.peakMB * (1 - s.opts.reclaimResetFraction)) {
    s.snapshots = [];
    s.peakMB = 0;
  }

  const snap: MemorySnapshot = { t: Date.now(), heapMB };
  s.snapshots.push(snap);
  if (s.snapshots.length > s.opts.windowSize) {
    s.snapshots.splice(0, s.snapshots.length - s.opts.windowSize);
  }
  if (heapMB > s.peakMB) s.peakMB = heapMB;

  if (isLeakSuspected(s)) {
    const now = Date.now();
    if (now - s.lastWarnAt >= s.opts.cooldownMs) {
      s.lastWarnAt = now;
      const report = computeReport(s);
      // Quiet by design: one warning + one event, then silent until cooldown.
      console.warn('[leak-detector] sustained heap growth', report);
      emitLeakSuspected(report);
    }
  }
}

function emitLeakSuspected(report: LeakReport): void {
  // Native window event for any plain listener.
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('dex-leak-suspected', { detail: report }));
    } catch {
      // Non-fatal: dispatch failure must not break sampling.
    }
  }
  // Mirror onto the typed bus for React subscribers.
  try {
    dexBus.emit('dex-leak-suspected', report);
  } catch {
    // Bus may not be ready in tests; ignore.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the leak detector. Idempotent: calling it again while already running
 * returns a teardown that stops the existing instance (it does not start a
 * second timer). SSR-safe: a no-op teardown is returned when there is no
 * `window`.
 *
 * @returns A teardown function that stops sampling and clears the window.
 */
export function startLeakDetector(opts: LeakDetectorOptions = {}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (state && state.timer !== null) {
    // Already running — keep the single instance, just hand back its teardown.
    return stopLeakDetector;
  }

  const resolved: ResolvedOptions = { ...DEFAULTS, ...sanitize(opts) };
  state = {
    opts: resolved,
    snapshots: [],
    timer: null,
    lastWarnAt: 0,
    peakMB: 0,
  };

  // Prime an immediate sample so getReport() is meaningful before the first
  // interval elapses.
  tick(state);

  const s = state;
  s.timer = setInterval(() => tick(s), resolved.sampleIntervalMs);

  return stopLeakDetector;
}

/** Stops sampling and clears the rolling window. Safe to call repeatedly. */
export function stopLeakDetector(): void {
  if (!state) return;
  if (state.timer !== null) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.snapshots = [];
  state.peakMB = 0;
  state = null;
}

/** Returns a copy of the current rolling window of memory snapshots. */
export function getSnapshots(): MemorySnapshot[] {
  return state ? state.snapshots.map((s) => ({ ...s })) : [];
}

/** Returns a summary report over the current window. */
export function getReport(): LeakReport {
  if (!state) {
    return {
      currentMB: 0,
      minMB: 0,
      maxMB: 0,
      avgMB: 0,
      slopeMBPerMin: 0,
      samples: 0,
      windowMinutes: 0,
      source: 'none',
    };
  }
  return computeReport(state);
}

/** True while the detector is actively sampling. Mostly for diagnostics/tests. */
export function isLeakDetectorRunning(): boolean {
  return state !== null && state.timer !== null;
}

function sanitize(opts: LeakDetectorOptions): LeakDetectorOptions {
  const out: LeakDetectorOptions = {};
  if (isPositive(opts.sampleIntervalMs)) out.sampleIntervalMs = opts.sampleIntervalMs;
  if (isPositive(opts.windowSize)) out.windowSize = Math.floor(opts.windowSize!);
  if (isPositive(opts.monotonicRun)) out.monotonicRun = Math.floor(opts.monotonicRun!);
  if (isNonNegative(opts.growthThresholdMB)) out.growthThresholdMB = opts.growthThresholdMB;
  if (isPositive(opts.cooldownMs)) out.cooldownMs = opts.cooldownMs;
  if (
    typeof opts.reclaimResetFraction === 'number' &&
    opts.reclaimResetFraction > 0 &&
    opts.reclaimResetFraction < 1
  ) {
    out.reclaimResetFraction = opts.reclaimResetFraction;
  }
  return out;
}

function isPositive(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isNonNegative(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

export default startLeakDetector;
