// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Local diagnostics: operational numbers about DEX itself, for Nexus >
 * Diagnostics. Privacy rules, by construction:
 *   - Numbers, app ids and error messages only. Never document contents,
 *     clipboard text, passwords or keystrokes.
 *   - Stays on this computer. Nothing here sends data anywhere.
 *   - Low overhead: event listeners and one PerformanceObserver. Frame timing
 *     runs only while someone asks for it (measureFrames), never in the
 *     background.
 */

import { useRunningApps } from '../../store/runningApps';

export interface LaunchSample { appId: string; ms: number; at: number }
export interface ErrorSample { message: string; at: number; source: 'error' | 'rejection' }
export interface FrameStats { fps: number; p50: number; p95: number; slowFrames: number; frames: number }
export interface Snapshot {
  sessionStartedAt: number;
  startup: { domContentLoadedMs: number | null; loadMs: number | null; shellReadyMs: number | null };
  launches: LaunchSample[];
  longTasks: { count: number; totalMs: number; maxMs: number };
  errors: { count: number; recent: ErrorSample[] };
  heapMB: number | null;
}

const LAUNCH_KEY = 'dex-diag-launches';
const MAX_LAUNCHES = 50;
const MAX_ERRORS = 20;

let started = false;
let shellReadyMs: number | null = null;
let launches: LaunchSample[] = [];
const longTasks = { count: 0, totalMs: 0, maxMs: 0 };
const errors: { count: number; recent: ErrorSample[] } = { count: 0, recent: [] };
const listeners = new Set<() => void>();

// Frames pause while the window is hidden, so a measurement that spans a hidden
// period would count the hidden time. `hiddenEpoch` changes on every hide; a
// measurement is kept only if it is the same at the start and at the end.
let hiddenEpoch = 0;
const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
if (typeof document !== 'undefined') {
  if (isHidden()) hiddenEpoch++;
  document.addEventListener('visibilitychange', () => { if (isHidden()) hiddenEpoch++; });
}
const bootEpoch = hiddenEpoch;

function emit(): void {
  for (const l of listeners) { try { l(); } catch { /* listener error */ } }
}

function loadLaunches(): LaunchSample[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LAUNCH_KEY) || '[]');
    return Array.isArray(raw)
      ? raw.filter((s) => s && typeof s.appId === 'string' && Number.isFinite(s.ms) && Number.isFinite(s.at)).slice(-MAX_LAUNCHES)
      : [];
  } catch {
    return [];
  }
}

function saveLaunches(): void {
  try { localStorage.setItem(LAUNCH_KEY, JSON.stringify(launches)); } catch { /* quota / private mode */ }
}

/** Record one app launch: from the launch request to the app's first painted frame. */
export function recordLaunch(appId: string, ms: number, at = Date.now()): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  launches = [...launches, { appId, ms: Math.round(ms), at }].slice(-MAX_LAUNCHES);
  saveLaunches();
  emit();
}

export function recordError(message: string, source: ErrorSample['source']): void {
  errors.count++;
  errors.recent = [{ message: message.slice(0, 200), at: Date.now(), source }, ...errors.recent].slice(0, MAX_ERRORS);
  emit();
}

/** Call once the shell has rendered its first frame. */
export function markShellReady(): void {
  if (shellReadyMs !== null || typeof performance === 'undefined') return;
  if (hiddenEpoch !== bootEpoch || isHidden()) return; // hidden during startup: no honest number
  shellReadyMs = Math.round(performance.now());
  emit();
}

/** Wait for an app's container to appear and paint, then record the launch. */
function watchLaunch(appId: string, t0: number): void {
  if (isHidden()) return;
  const epoch = hiddenEpoch;
  const deadline = t0 + 10_000;
  const check = () => {
    if (hiddenEpoch !== epoch) return; // window was hidden meanwhile
    // Inline apps mount in [data-app-id]; windowed apps in [data-floating-window].
    // Watching only the first made every windowed launch poll each frame for
    // the full 10 s and never be recorded.
    const id = CSS.escape(appId);
    const el = document.querySelector(`[data-app-id="${id}"], [data-floating-window="${id}"]`);
    if (el && el.childElementCount > 0) {
      // The frame after the one that inserted the content is the first painted one.
      requestAnimationFrame(() => { if (hiddenEpoch === epoch) recordLaunch(appId, performance.now() - t0); });
      return;
    }
    if (performance.now() < deadline) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/** Start collecting. Idempotent. */
export function startLocalMetrics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  launches = loadLaunches();

  window.addEventListener('error', (e) => recordError(e.message || 'Unknown error', 'error'));
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    recordError(r instanceof Error ? r.message : String(r ?? 'Unhandled rejection'), 'rejection');
  });

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.count++;
        longTasks.totalMs += entry.duration;
        longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
      }
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch { /* long tasks not supported */ }

  let known = new Set(useRunningApps.getState().runningApps.map((a) => a.id));
  useRunningApps.subscribe((state) => {
    const ids = new Set(state.runningApps.map((a) => a.id));
    for (const id of ids) if (!known.has(id)) watchLaunch(id, performance.now());
    known = ids;
  });
}

export function getSnapshot(): Snapshot {
  const nav = typeof performance !== 'undefined'
    ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
    : undefined;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return {
    sessionStartedAt: Date.now() - Math.round(performance.now()),
    startup: {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null,
      shellReadyMs,
    },
    launches: [...launches],
    longTasks: { count: longTasks.count, totalMs: Math.round(longTasks.totalMs), maxMs: Math.round(longTasks.maxMs) },
    errors: { count: errors.count, recent: [...errors.recent] },
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
  };
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function clearLaunches(): void {
  launches = [];
  saveLaunches();
  emit();
}

/** Percentile of a numeric list (nearest rank). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Summarise frame intervals (ms). A slow frame is one over 1.5x a 60 Hz frame. */
export function summariseFrames(intervals: number[], spanMs: number): FrameStats {
  return {
    fps: spanMs > 0 ? Math.round((intervals.length / spanMs) * 1000) : 0,
    p50: Math.round(percentile(intervals, 50) * 10) / 10,
    p95: Math.round(percentile(intervals, 95) * 10) / 10,
    slowFrames: intervals.filter((d) => d > 25).length,
    frames: intervals.length,
  };
}

/** Measure frame timing for `durationMs`. Runs only while awaited; null if the window is hidden. */
export function measureFrames(durationMs = 2000): Promise<FrameStats | null> {
  if (isHidden()) return Promise.resolve(null);
  const epoch = hiddenEpoch;
  return new Promise((resolve) => {
    const onHide = () => { if (isHidden()) { document.removeEventListener('visibilitychange', onHide); resolve(null); } };
    document.addEventListener('visibilitychange', onHide);
    const intervals: number[] = [];
    let start = 0;
    let last = 0;
    const step = (t: number) => {
      if (!start) { start = t; last = t; requestAnimationFrame(step); return; }
      intervals.push(t - last);
      last = t;
      if (hiddenEpoch !== epoch) return;
      if (t - start < durationMs) requestAnimationFrame(step);
      else { document.removeEventListener('visibilitychange', onHide); resolve(summariseFrames(intervals, t - start)); }
    };
    requestAnimationFrame(step);
  });
}
