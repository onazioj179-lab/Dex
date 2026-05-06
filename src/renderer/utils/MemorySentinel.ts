// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MemorySentinel -- renderer-side memory pressure watchdog.
 *
 * Watches `performance.memory` and fires callbacks at configurable thresholds.
 * On platforms without `performance.memory` (Firefox, Safari) it is a no-op.
 *
 * Three pressure levels:
 *   moderate  -- 70 % heap utilization: emit warning, request GC suggestion
 *   high      -- 85 %: emit warning + hint to suspend background processes
 *   critical  -- 95 %: emit error + request emergency purge
 *
 * W1#6: memory leak guard utility
 */

import { DisposableGroup } from '../../shared/disposable';
import { rendererMetrics } from '../../shared/metrics';

export type PressureLevel = 'moderate' | 'high' | 'critical';

export interface MemoryPressureEvent {
  readonly level: PressureLevel;
  readonly heapUsedMB: number;
  readonly heapLimitMB: number;
  readonly utilization: number;
  readonly t: number;
}

export type MemoryPressureCallback = (e: MemoryPressureEvent) => void;

const CHECK_INTERVAL_MS = 10_000;
const THRESHOLDS: Record<PressureLevel, number> = {
  moderate: 0.70,
  high: 0.85,
  critical: 0.95,
};

const heapGauge = rendererMetrics.gauge('renderer.heap.used', 'MB');
const pressureCounter = rendererMetrics.counter('renderer.memory.pressure', 'events');

function getMemory(): { used: number; limit: number; utilization: number } | null {
  const mem = (performance as any).memory;
  if (!mem) return null;
  const used = mem.usedJSHeapSize / (1024 * 1024);
  const limit = mem.jsHeapSizeLimit / (1024 * 1024);
  return { used, limit, utilization: limit > 0 ? used / limit : 0 };
}

export class MemorySentinel {
  private readonly _callbacks: Map<PressureLevel, Set<MemoryPressureCallback>> = new Map([
    ['moderate', new Set()],
    ['high', new Set()],
    ['critical', new Set()],
  ]);
  private _group: DisposableGroup | null = null;
  private _lastLevel: PressureLevel | null = null;

  on(level: PressureLevel, cb: MemoryPressureCallback): () => void {
    this._callbacks.get(level)!.add(cb);
    return () => this._callbacks.get(level)!.delete(cb);
  }

  start(intervalMs = CHECK_INTERVAL_MS): this {
    if (this._group && !this._group.isDisposed) return this;
    if (!getMemory()) return this; // platform unsupported

    this._group = new DisposableGroup();
    const id = setInterval(() => this._check(), intervalMs);
    this._group.addInterval(id);
    return this;
  }

  stop(): void {
    this._group?.dispose();
    this._group = null;
    this._lastLevel = null;
  }

  private _check(): void {
    const mem = getMemory();
    if (!mem) return;
    heapGauge.set(mem.used);

    let level: PressureLevel | null = null;
    if (mem.utilization >= THRESHOLDS.critical) level = 'critical';
    else if (mem.utilization >= THRESHOLDS.high) level = 'high';
    else if (mem.utilization >= THRESHOLDS.moderate) level = 'moderate';

    if (!level) { this._lastLevel = null; return; }
    // Only fire when transitioning to a higher level to avoid spam
    if (this._lastLevel === level) return;
    this._lastLevel = level;
    pressureCounter.inc();

    const event: MemoryPressureEvent = {
      level,
      heapUsedMB: mem.used,
      heapLimitMB: mem.limit,
      utilization: mem.utilization,
      t: Date.now(),
    };
    this._callbacks.get(level)!.forEach(cb => { try { cb(event); } catch { /* guard */ } });
  }
}

/** Shared renderer-side sentinel (started lazily). */
export const memorySentinel = new MemorySentinel();
