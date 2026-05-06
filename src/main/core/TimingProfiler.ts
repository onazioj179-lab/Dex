// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Timing, Profiling & Release Validation
// ==========================================================================
// Technique 81: hrtime.bigint Timing Infrastructure
// Technique 82: Pre-Allocated Timing Buffer
// Technique 83: Scope Timer with Auto-Report
// Technique 85: Tail-Call Optimization Pattern
// Technique 89: Local Variable Caching in Timing Loops
// Technique 90: Release Profiling Step
// Technique 91: Startup Time Budget Enforcement
// Technique 92: Memory Budget per Module
// Technique 93: IPC Latency Budget
// Technique 94: Frame Budget for Renderer
// Technique 95: Database Query Budget
// Technique 96: Event Loop Lag Monitoring
// Technique 97: GC Pause Duration Tracking
// Technique 98: Hot Path Identification
// Technique 99: Cold Start vs Warm Start Tracking
// Technique 100: Overall Performance Score
// ==========================================================================

import * as log from 'electron-log';
import * as v8 from 'v8';

// ---------------------------------------------------------------------------
// Technique 81: hrtime.bigint High-Resolution Timer
// ---------------------------------------------------------------------------

export function hrtimeNow(): bigint {
  return process.hrtime.bigint();
}

export function hrtimeElapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

export function hrtimeElapsedUs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000;
}

export function hrtimeElapsedNs(start: bigint): bigint {
  return process.hrtime.bigint() - start;
}

// ---------------------------------------------------------------------------
// Technique 82: Pre-Allocated Timing Buffer
// ---------------------------------------------------------------------------

const TIMING_BUFFER_SIZE = 4096;

class TimingBuffer {
  private labels: Int32Array;
  private starts: Float64Array;
  private ends: Float64Array;
  private writeIdx = 0;
  private capacity: number;
  private labelNames: Map<number, string> = new Map();
  private nextLabelId = 1;

  constructor(capacity: number = TIMING_BUFFER_SIZE) {
    this.capacity = capacity;
    this.labels = new Int32Array(capacity);
    this.starts = new Float64Array(capacity);
    this.ends = new Float64Array(capacity);
  }

  registerLabel(name: string): number {
    const id = this.nextLabelId++;
    this.labelNames.set(id, name);
    return id;
  }

  begin(labelId: number): number {
    const idx = this.writeIdx;
    this.labels[idx] = labelId;
    this.starts[idx] = performance.now();
    this.ends[idx] = 0;
    return idx;
  }

  end(idx: number): number {
    const now = performance.now();
    this.ends[idx] = now;
    const duration = now - this.starts[idx];
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    return duration;
  }

  getAverageByLabel(labelId: number): number {
    let total = 0;
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.labels[i] === labelId && this.ends[i] > 0) {
        total += this.ends[i] - this.starts[i];
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  getPercentileByLabel(labelId: number, p: number): number {
    const durations: number[] = [];
    for (let i = 0; i < this.capacity; i++) {
      if (this.labels[i] === labelId && this.ends[i] > 0) {
        durations.push(this.ends[i] - this.starts[i]);
      }
    }
    if (durations.length === 0) return 0;
    durations.sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * durations.length) - 1;
    return durations[Math.max(0, idx)];
  }

  getSummary(): Array<{ label: string; avg: number; p50: number; p95: number; p99: number; count: number }> {
    const results: Array<{ label: string; avg: number; p50: number; p95: number; p99: number; count: number }> = [];
    for (const [labelId, name] of this.labelNames) {
      const durations: number[] = [];
      for (let i = 0; i < this.capacity; i++) {
        if (this.labels[i] === labelId && this.ends[i] > 0) {
          durations.push(this.ends[i] - this.starts[i]);
        }
      }
      if (durations.length === 0) continue;
      durations.sort((a, b) => a - b);
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
      const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
      const p99 = durations[Math.floor(durations.length * 0.99)] || 0;
      results.push({ label: name, avg, p50, p95, p99, count: durations.length });
    }
    return results;
  }

  clear(): void {
    this.labels.fill(0);
    this.starts.fill(0);
    this.ends.fill(0);
    this.writeIdx = 0;
  }
}

export const timingBuffer = new TimingBuffer();

// Pre-register common timing labels
export const TIMING_LABELS = {
  IPC_ROUNDTRIP: timingBuffer.registerLabel('ipc_roundtrip'),
  DB_QUERY: timingBuffer.registerLabel('db_query'),
  DB_INSERT: timingBuffer.registerLabel('db_insert'),
  FILE_READ: timingBuffer.registerLabel('file_read'),
  FILE_WRITE: timingBuffer.registerLabel('file_write'),
  RENDER_FRAME: timingBuffer.registerLabel('render_frame'),
  EVENT_DISPATCH: timingBuffer.registerLabel('event_dispatch'),
  PLUGIN_EXECUTE: timingBuffer.registerLabel('plugin_execute'),
  SEARCH_QUERY: timingBuffer.registerLabel('search_query'),
  COMPRESSION: timingBuffer.registerLabel('compression'),
  ENCRYPTION: timingBuffer.registerLabel('encryption'),
  JSON_PARSE: timingBuffer.registerLabel('json_parse'),
  JSON_STRINGIFY: timingBuffer.registerLabel('json_stringify'),
  MEDIA_ENCODE: timingBuffer.registerLabel('media_encode'),
  MEDIA_DECODE: timingBuffer.registerLabel('media_decode'),
  AI_INFERENCE: timingBuffer.registerLabel('ai_inference'),
  STARTUP_PHASE_A: timingBuffer.registerLabel('startup_phase_a'),
  STARTUP_PHASE_B: timingBuffer.registerLabel('startup_phase_b'),
  STARTUP_PHASE_C: timingBuffer.registerLabel('startup_phase_c'),
  STARTUP_TOTAL: timingBuffer.registerLabel('startup_total'),
  WINDOW_CREATE: timingBuffer.registerLabel('window_create'),
  APP_SWITCH: timingBuffer.registerLabel('app_switch'),
  STATE_SYNC: timingBuffer.registerLabel('state_sync'),
} as const;

// ---------------------------------------------------------------------------
// Technique 83: Scope Timer with Auto-Report
// ---------------------------------------------------------------------------

export class ScopeTimer {
  private startTime: bigint;
  private label: string;
  private thresholdMs: number;

  constructor(label: string, thresholdMs: number = 100) {
    this.label = label;
    this.thresholdMs = thresholdMs;
    this.startTime = process.hrtime.bigint();
  }

  stop(): number {
    const elapsedMs = Number(process.hrtime.bigint() - this.startTime) / 1_000_000;
    if (elapsedMs > this.thresholdMs) {
      log.warn(`[ScopeTimer] ${this.label} took ${elapsedMs.toFixed(2)}ms (threshold: ${this.thresholdMs}ms)`);
    }
    return elapsedMs;
  }
}

export function scopeTimer(label: string, thresholdMs: number = 100): ScopeTimer {
  return new ScopeTimer(label, thresholdMs);
}

// Decorator-style timing for async functions
export function timedAsync<T>(label: string, fn: () => Promise<T>, thresholdMs: number = 100): Promise<T> {
  const timer = new ScopeTimer(label, thresholdMs);
  return fn().finally(() => timer.stop());
}

// ---------------------------------------------------------------------------
// Technique 85: Trampoline (Tail-Call Optimization Pattern)
// ---------------------------------------------------------------------------

type Thunk<T> = () => Thunk<T> | T;

export function trampoline<T>(fn: Thunk<T>): T {
  let result: Thunk<T> | T = fn;
  while (typeof result === 'function') {
    result = (result as Thunk<T>)();
  }
  return result;
}

// Example: recursive sum using trampoline
export function trampolineSum(arr: number[], idx: number = 0, acc: number = 0): Thunk<number> | number {
  if (idx >= arr.length) return acc;
  return () => trampolineSum(arr, idx + 1, acc + arr[idx]);
}

// ---------------------------------------------------------------------------
// Technique 91-99: Performance Budget System
// ---------------------------------------------------------------------------

interface PerformanceBudget {
  name: string;
  budgetMs: number;
  violations: number;
  lastViolationMs: number;
  totalSamples: number;
  totalMs: number;
}

class PerformanceBudgetTracker {
  private budgets: Map<string, PerformanceBudget> = new Map();

  define(name: string, budgetMs: number): void {
    this.budgets.set(name, { name, budgetMs, violations: 0, lastViolationMs: 0, totalSamples: 0, totalMs: 0 });
  }

  record(name: string, durationMs: number): boolean {
    const budget = this.budgets.get(name);
    if (!budget) return true;
    budget.totalSamples++;
    budget.totalMs += durationMs;
    if (durationMs > budget.budgetMs) {
      budget.violations++;
      budget.lastViolationMs = durationMs;
      return false; // Over budget
    }
    return true; // Within budget
  }

  getBudget(name: string): PerformanceBudget | undefined {
    return this.budgets.get(name);
  }

  getAllBudgets(): PerformanceBudget[] {
    return Array.from(this.budgets.values());
  }

  getViolationRate(name: string): number {
    const budget = this.budgets.get(name);
    if (!budget || budget.totalSamples === 0) return 0;
    return budget.violations / budget.totalSamples;
  }

  getAverageMs(name: string): number {
    const budget = this.budgets.get(name);
    if (!budget || budget.totalSamples === 0) return 0;
    return budget.totalMs / budget.totalSamples;
  }

  reset(): void {
    for (const budget of this.budgets.values()) {
      budget.violations = 0;
      budget.lastViolationMs = 0;
      budget.totalSamples = 0;
      budget.totalMs = 0;
    }
  }
}

export const performanceBudgets = new PerformanceBudgetTracker();

// Define all performance budgets
// Technique 91: Startup budgets
performanceBudgets.define('startup:phase_a', 500);   // Core init: 500ms
performanceBudgets.define('startup:phase_b', 1000);  // Window create: 1s
performanceBudgets.define('startup:phase_c', 2000);  // Full ready: 2s
performanceBudgets.define('startup:total', 3000);     // Total cold start: 3s

// Technique 92: Memory budgets
performanceBudgets.define('memory:idle_heap', 80);     // 80 MB idle
performanceBudgets.define('memory:active_heap', 300);  // 300 MB active
performanceBudgets.define('memory:per_app', 50);       // 50 MB per inner app
performanceBudgets.define('memory:rss_total', 500);    // 500 MB RSS total

// Technique 93: IPC budgets
performanceBudgets.define('ipc:roundtrip', 8);      // 8ms roundtrip
performanceBudgets.define('ipc:batch', 16);          // 16ms batch window
performanceBudgets.define('ipc:large_payload', 50);  // 50ms for large payloads

// Technique 94: Frame budgets
performanceBudgets.define('frame:render', 16);      // 16ms (60fps)
performanceBudgets.define('frame:input', 8);        // 8ms input latency
performanceBudgets.define('frame:animation', 4);    // 4ms animation frame

// Technique 95: Database budgets
performanceBudgets.define('db:simple_query', 5);     // 5ms simple query
performanceBudgets.define('db:complex_query', 50);   // 50ms complex query
performanceBudgets.define('db:insert', 2);           // 2ms single insert
performanceBudgets.define('db:batch_insert', 100);   // 100ms batch insert
performanceBudgets.define('db:migration', 5000);     // 5s migration

// App-specific budgets
performanceBudgets.define('app:switch', 100);       // 100ms app switch
performanceBudgets.define('app:load', 500);         // 500ms app load
performanceBudgets.define('search:query', 50);      // 50ms search
performanceBudgets.define('search:index', 1000);    // 1s full re-index
performanceBudgets.define('file:save', 200);        // 200ms file save
performanceBudgets.define('plugin:load', 1000);     // 1s plugin load
performanceBudgets.define('plugin:execute', 5000);  // 5s plugin exec

// ---------------------------------------------------------------------------
// Technique 96: Event Loop Lag Monitoring
// ---------------------------------------------------------------------------

class EventLoopMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lagSamples: Float64Array;
  private sampleIdx = 0;
  private maxSamples: number;
  private lastCheck = 0;
  private highLagCount = 0;
  private lagThresholdMs: number;

  constructor(maxSamples: number = 1000, lagThresholdMs: number = 50) {
    this.maxSamples = maxSamples;
    this.lagSamples = new Float64Array(maxSamples);
    this.lagThresholdMs = lagThresholdMs;
  }

  start(intervalMs: number = 100): void {
    this.lastCheck = performance.now();
    this.interval = setInterval(() => {
      const now = performance.now();
      const expected = intervalMs;
      const actual = now - this.lastCheck;
      const lag = Math.max(0, actual - expected);
      this.lagSamples[this.sampleIdx % this.maxSamples] = lag;
      this.sampleIdx++;
      if (lag > this.lagThresholdMs) this.highLagCount++;
      this.lastCheck = now;
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  get averageLag(): number {
    const count = Math.min(this.sampleIdx, this.maxSamples);
    if (count === 0) return 0;
    let total = 0;
    for (let i = 0; i < count; i++) total += this.lagSamples[i];
    return total / count;
  }

  get maxLag(): number {
    const count = Math.min(this.sampleIdx, this.maxSamples);
    let max = 0;
    for (let i = 0; i < count; i++) {
      if (this.lagSamples[i] > max) max = this.lagSamples[i];
    }
    return max;
  }

  get p99Lag(): number {
    const count = Math.min(this.sampleIdx, this.maxSamples);
    if (count === 0) return 0;
    const sorted = Array.from(this.lagSamples.subarray(0, count)).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  get highLagRate(): number {
    return this.sampleIdx > 0 ? this.highLagCount / this.sampleIdx : 0;
  }
}

export const eventLoopMonitor = new EventLoopMonitor();

// ---------------------------------------------------------------------------
// Technique 97: GC Pause Duration Tracking
// ---------------------------------------------------------------------------

class GCTracker {
  private pauses: Float64Array;
  private pauseIdx = 0;
  private maxPauses: number;
  private observer: PerformanceObserver | null = null;

  constructor(maxPauses: number = 500) {
    this.maxPauses = maxPauses;
    this.pauses = new Float64Array(maxPauses);
  }

  start(): void {
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'gc') {
            this.pauses[this.pauseIdx % this.maxPauses] = entry.duration;
            this.pauseIdx++;
          }
        }
      });
      this.observer.observe({ entryTypes: ['gc'] });
    } catch {
      // GC observation not supported in this environment
    }
  }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
  }

  get averagePauseMs(): number {
    const count = Math.min(this.pauseIdx, this.maxPauses);
    if (count === 0) return 0;
    let total = 0;
    for (let i = 0; i < count; i++) total += this.pauses[i];
    return total / count;
  }

  get maxPauseMs(): number {
    const count = Math.min(this.pauseIdx, this.maxPauses);
    let max = 0;
    for (let i = 0; i < count; i++) if (this.pauses[i] > max) max = this.pauses[i];
    return max;
  }

  get totalPauses(): number { return this.pauseIdx; }
}

export const gcTracker = new GCTracker();

// ---------------------------------------------------------------------------
// Technique 98: Hot Path Identification
// ---------------------------------------------------------------------------

class HotPathTracker {
  private callCounts: Map<string, number> = new Map();
  private totalDurations: Map<string, number> = new Map();

  record(pathName: string, durationMs: number): void {
    this.callCounts.set(pathName, (this.callCounts.get(pathName) || 0) + 1);
    this.totalDurations.set(pathName, (this.totalDurations.get(pathName) || 0) + durationMs);
  }

  getHotPaths(topN: number = 10): Array<{ path: string; calls: number; totalMs: number; avgMs: number }> {
    const paths: Array<{ path: string; calls: number; totalMs: number; avgMs: number }> = [];
    for (const [pathName, calls] of this.callCounts) {
      const totalMs = this.totalDurations.get(pathName) || 0;
      paths.push({ path: pathName, calls, totalMs, avgMs: totalMs / calls });
    }
    // Sort by total time
    paths.sort((a, b) => b.totalMs - a.totalMs);
    return paths.slice(0, topN);
  }

  reset(): void {
    this.callCounts.clear();
    this.totalDurations.clear();
  }
}

export const hotPathTracker = new HotPathTracker();

// ---------------------------------------------------------------------------
// Technique 99: Cold Start vs Warm Start Tracking
// ---------------------------------------------------------------------------

interface StartupRecord {
  type: 'cold' | 'warm';
  totalMs: number;
  phases: Record<string, number>;
  timestamp: number;
}

class StartupTracker {
  private records: StartupRecord[] = [];
  private currentPhaseStarts: Map<string, bigint> = new Map();
  private currentPhases: Record<string, number> = {};
  private startTime: bigint = 0n;
  private isCold = true;

  beginStartup(cold: boolean): void {
    this.isCold = cold;
    this.startTime = process.hrtime.bigint();
    this.currentPhases = {};
    this.currentPhaseStarts.clear();
  }

  beginPhase(name: string): void {
    this.currentPhaseStarts.set(name, process.hrtime.bigint());
  }

  endPhase(name: string): number {
    const start = this.currentPhaseStarts.get(name);
    if (!start) return 0;
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    this.currentPhases[name] = durationMs;
    return durationMs;
  }

  endStartup(): StartupRecord {
    const totalMs = Number(process.hrtime.bigint() - this.startTime) / 1_000_000;
    const record: StartupRecord = {
      type: this.isCold ? 'cold' : 'warm',
      totalMs,
      phases: { ...this.currentPhases },
      timestamp: Date.now(),
    };
    this.records.push(record);
    return record;
  }

  get coldStartAverage(): number {
    const cold = this.records.filter(r => r.type === 'cold');
    if (cold.length === 0) return 0;
    return cold.reduce((s, r) => s + r.totalMs, 0) / cold.length;
  }

  get warmStartAverage(): number {
    const warm = this.records.filter(r => r.type === 'warm');
    if (warm.length === 0) return 0;
    return warm.reduce((s, r) => s + r.totalMs, 0) / warm.length;
  }

  get allRecords(): StartupRecord[] { return [...this.records]; }
}

export const startupTracker = new StartupTracker();

// ---------------------------------------------------------------------------
// Technique 100: Overall Performance Score
// ---------------------------------------------------------------------------

export interface PerformanceScorecard {
  overallScore: number; // 0-100
  categories: {
    startup: number;
    memory: number;
    ipc: number;
    database: number;
    eventLoop: number;
    gc: number;
    responsiveness: number;
  };
  details: Record<string, unknown>;
  timestamp: number;
}

export function computePerformanceScore(): PerformanceScorecard {
  const heap = v8.getHeapStatistics();
  const heapUsedMB = heap.used_heap_size / (1024 * 1024);
  const heapTotalMB = heap.total_heap_size / (1024 * 1024);

  // Startup score (based on last cold start or warm start)
  const coldAvg = startupTracker.coldStartAverage;
  const startupScore = coldAvg === 0 ? 100 : Math.max(0, Math.min(100, 100 - ((coldAvg - 1000) / 20)));

  // Memory score
  const memoryScore = Math.max(0, Math.min(100, 100 - ((heapUsedMB - 80) / 4)));

  // IPC score (based on average roundtrip from budgets)
  const ipcBudget = performanceBudgets.getBudget('ipc:roundtrip');
  const ipcScore = ipcBudget && ipcBudget.totalSamples > 0
    ? Math.max(0, Math.min(100, 100 - (performanceBudgets.getViolationRate('ipc:roundtrip') * 100)))
    : 100;

  // Database score
  const dbBudget = performanceBudgets.getBudget('db:simple_query');
  const dbScore = dbBudget && dbBudget.totalSamples > 0
    ? Math.max(0, Math.min(100, 100 - (performanceBudgets.getViolationRate('db:simple_query') * 100)))
    : 100;

  // Event loop score
  const elAvgLag = eventLoopMonitor.averageLag;
  const eventLoopScore = Math.max(0, Math.min(100, 100 - (elAvgLag * 2)));

  // GC score
  const gcAvg = gcTracker.averagePauseMs;
  const gcScore = Math.max(0, Math.min(100, 100 - (gcAvg * 5)));

  // Responsiveness
  const appSwitchBudget = performanceBudgets.getBudget('app:switch');
  const responsivenessScore = appSwitchBudget && appSwitchBudget.totalSamples > 0
    ? Math.max(0, Math.min(100, 100 - (performanceBudgets.getViolationRate('app:switch') * 100)))
    : 100;

  // Weighted average
  const weights = { startup: 0.15, memory: 0.15, ipc: 0.15, database: 0.15, eventLoop: 0.15, gc: 0.10, responsiveness: 0.15 };
  const overallScore = Math.round(
    startupScore * weights.startup +
    memoryScore * weights.memory +
    ipcScore * weights.ipc +
    dbScore * weights.database +
    eventLoopScore * weights.eventLoop +
    gcScore * weights.gc +
    responsivenessScore * weights.responsiveness
  );

  return {
    overallScore,
    categories: {
      startup: Math.round(startupScore),
      memory: Math.round(memoryScore),
      ipc: Math.round(ipcScore),
      database: Math.round(dbScore),
      eventLoop: Math.round(eventLoopScore),
      gc: Math.round(gcScore),
      responsiveness: Math.round(responsivenessScore),
    },
    details: {
      heapUsedMB: Math.round(heapUsedMB),
      heapTotalMB: Math.round(heapTotalMB),
      coldStartAvgMs: Math.round(coldAvg),
      warmStartAvgMs: Math.round(startupTracker.warmStartAverage),
      eventLoopAvgLagMs: elAvgLag.toFixed(2),
      eventLoopP99LagMs: eventLoopMonitor.p99Lag.toFixed(2),
      gcAvgPauseMs: gcAvg.toFixed(2),
      gcMaxPauseMs: gcTracker.maxPauseMs.toFixed(2),
      gcTotalPauses: gcTracker.totalPauses,
      hotPaths: hotPathTracker.getHotPaths(5),
      timingSummary: timingBuffer.getSummary(),
      budgetViolations: performanceBudgets.getAllBudgets().filter(b => b.violations > 0),
    },
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Technique 90: Release Profiling Step
// ---------------------------------------------------------------------------

export async function runReleaseProfileCheck(): Promise<{
  passed: boolean;
  score: PerformanceScorecard;
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const score = computePerformanceScore();

  // Check budgets
  for (const budget of performanceBudgets.getAllBudgets()) {
    if (budget.violations > 0) {
      const rate = budget.totalSamples > 0 ? (budget.violations / budget.totalSamples * 100).toFixed(1) : '0';
      if (budget.violations / Math.max(1, budget.totalSamples) > 0.1) {
        errors.push(`Budget "${budget.name}" violated ${budget.violations}/${budget.totalSamples} times (${rate}%)`);
      } else {
        warnings.push(`Budget "${budget.name}" violated ${budget.violations} times (${rate}%)`);
      }
    }
  }

  // Check heap
  const heap = v8.getHeapStatistics();
  const heapMB = heap.used_heap_size / (1024 * 1024);
  if (heapMB > 400) errors.push(`Heap usage ${heapMB.toFixed(0)}MB exceeds 400MB limit`);
  else if (heapMB > 300) warnings.push(`Heap usage ${heapMB.toFixed(0)}MB approaching 400MB limit`);

  // Check event loop
  if (eventLoopMonitor.averageLag > 20) {
    warnings.push(`Average event loop lag ${eventLoopMonitor.averageLag.toFixed(1)}ms exceeds 20ms`);
  }

  // Check GC
  if (gcTracker.maxPauseMs > 100) {
    warnings.push(`Max GC pause ${gcTracker.maxPauseMs.toFixed(1)}ms exceeds 100ms`);
  }

  // Check overall score
  if (score.overallScore < 50) errors.push(`Overall score ${score.overallScore} below minimum 50`);
  else if (score.overallScore < 70) warnings.push(`Overall score ${score.overallScore} below target 70`);

  const passed = errors.length === 0;

  log.info(`[ReleaseProfile] Score: ${score.overallScore}/100, Passed: ${passed}, Warnings: ${warnings.length}, Errors: ${errors.length}`);

  return { passed, score, warnings, errors };
}

// ---------------------------------------------------------------------------
// Initialization / Shutdown
// ---------------------------------------------------------------------------

export function initializeTimingProfiler(): void {
  eventLoopMonitor.start(100);
  gcTracker.start();
  startupTracker.beginStartup(true); // First startup is always cold

  log.info('[TimingProfiler] Techniques 81-85, 89-100: Timing and profiling initialized');
}

export function shutdownTimingProfiler(): void {
  eventLoopMonitor.stop();
  gcTracker.stop();
  timingBuffer.clear();
  hotPathTracker.reset();
  performanceBudgets.reset();
}
