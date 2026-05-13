// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 4 - Compositor + Performance kernel primitives.
 *
 * Pure logic for frame scheduling priorities, GPU memory pressure
 * classification, and adaptive quality selection. Renderer/compositor code
 * adopts these incrementally to replace ad hoc heuristics.
 */

export type FramePriority = 'input' | 'animation' | 'background' | 'idle';

export interface FrameTask {
  readonly id: string;
  readonly priority: FramePriority;
  readonly estCostMs: number;
  readonly run: () => void;
}

const PRIORITY_RANK: Record<FramePriority, number> = {
  input: 0,
  animation: 1,
  background: 2,
  idle: 3,
};

export interface FrameScheduleResult {
  readonly ran: string[];
  readonly deferred: string[];
  readonly elapsedMs: number;
}

/**
 * Greedy budget-aware scheduler. Tasks are sorted by priority, then by
 * insertion order (stable). Tasks that don't fit the remaining budget are
 * deferred and returned for the next frame.
 */
export class FrameScheduler {
  private queue: FrameTask[] = [];

  enqueue(task: FrameTask): void {
    if (!task.id) throw new Error('task id required');
    if (this.queue.some((t) => t.id === task.id)) throw new Error(`task ${task.id} already queued`);
    this.queue.push(task);
  }

  size(): number { return this.queue.length; }

  cancel(id: string): boolean {
    const i = this.queue.findIndex((t) => t.id === id);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    return true;
  }

  runFrame(budgetMs: number, now: () => number = () => Date.now()): FrameScheduleResult {
    if (budgetMs <= 0) {
      const deferred = this.queue.map((t) => t.id);
      return { ran: [], deferred, elapsedMs: 0 };
    }
    const start = now();
    const sorted = this.queue.slice().sort((a, b) => {
      const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (r !== 0) return r;
      return this.queue.indexOf(a) - this.queue.indexOf(b);
    });
    const ran: string[] = [];
    const deferred: string[] = [];
    let used = 0;
    for (const task of sorted) {
      if (used + task.estCostMs <= budgetMs) {
        try { task.run(); } catch { /* per-task isolation */ }
        used += task.estCostMs;
        ran.push(task.id);
      } else {
        deferred.push(task.id);
      }
    }
    this.queue = this.queue.filter((t) => deferred.includes(t.id));
    const elapsedMs = Math.max(used, now() - start);
    return { ran, deferred, elapsedMs };
  }
}

export type GpuPressureLevel = 'low' | 'medium' | 'high' | 'critical';

export interface GpuPressureReading {
  readonly usedBytes: number;
  readonly totalBytes: number;
}

/**
 * Standard pressure thresholds: <60% low, <80% medium, <92% high, else critical.
 */
export function gpuPressure(reading: GpuPressureReading): GpuPressureLevel {
  if (reading.totalBytes <= 0) return 'critical';
  const ratio = reading.usedBytes / reading.totalBytes;
  if (ratio < 0.6) return 'low';
  if (ratio < 0.8) return 'medium';
  if (ratio < 0.92) return 'high';
  return 'critical';
}

export type QualityTier = 'ultra' | 'high' | 'balanced' | 'eco';

export interface QualityInputs {
  readonly frameTimeP95Ms: number;
  readonly gpuPressure: GpuPressureLevel;
  readonly batterySaver?: boolean;
  readonly thermalThrottling?: boolean;
}

/**
 * Conservative quality governor. Picks the lowest tier indicated by any
 * input. Defaults to balanced.
 */
export function selectQualityTier(inputs: QualityInputs): QualityTier {
  if (inputs.batterySaver || inputs.thermalThrottling) return 'eco';
  if (inputs.gpuPressure === 'critical' || inputs.frameTimeP95Ms > 33) return 'eco';
  if (inputs.gpuPressure === 'high' || inputs.frameTimeP95Ms > 22) return 'balanced';
  if (inputs.gpuPressure === 'medium' || inputs.frameTimeP95Ms > 17) return 'high';
  return 'ultra';
}
