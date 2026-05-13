// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Performance.mark/measure wrapper with safe fallback when User Timing API
 * is unavailable. Maintains a small in-memory ring of the most recent measures
 * for ad-hoc inspection.
 */

export interface PerfMeasure {
  name: string;
  durationMs: number;
  startTime: number;
}

const RING_CAPACITY = 256;
const ring: PerfMeasure[] = [];

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function pushRing(m: PerfMeasure): void {
  if (ring.length >= RING_CAPACITY) ring.shift();
  ring.push(m);
}

export function perfMark(name: string): void {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    try {
      performance.mark(name);
    } catch {
      /* ignore */
    }
  }
}

export function perfMeasure(name: string, startMark: string, endMark?: string): PerfMeasure {
  const start = nowMs();
  let durationMs = 0;
  if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
    try {
      const m = endMark
        ? performance.measure(name, startMark, endMark)
        : performance.measure(name, startMark);
      durationMs = m && typeof m.duration === 'number' ? m.duration : 0;
    } catch {
      durationMs = 0;
    }
  }
  const measure: PerfMeasure = { name, durationMs, startTime: start };
  pushRing(measure);
  return measure;
}

/** Time a synchronous function. */
export function perfTime<T>(name: string, fn: () => T): T {
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    pushRing({ name, durationMs: nowMs() - t0, startTime: t0 });
  }
}

/** Time an async function. */
export async function perfTimeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = nowMs();
  try {
    return await fn();
  } finally {
    pushRing({ name, durationMs: nowMs() - t0, startTime: t0 });
  }
}

export function recentMeasures(): readonly PerfMeasure[] {
  return ring.slice();
}

export function clearMeasures(): void {
  ring.length = 0;
}
