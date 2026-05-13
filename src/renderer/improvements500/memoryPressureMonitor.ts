// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Memory-pressure monitor. Subscribers receive level transitions when the
 * reported usage ratio crosses configured thresholds with hysteresis to
 * prevent thrashing.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export type MemoryPressureLevel = 'nominal' | 'elevated' | 'critical';

export interface MemoryPressureThresholds {
  elevated: number;
  critical: number;
  hysteresis?: number;
}

export type MemoryPressureListener = (
  level: MemoryPressureLevel,
  ratio: number,
) => void;

export class MemoryPressureMonitor {
  private current: MemoryPressureLevel = 'nominal';
  private listeners = new Set<MemoryPressureListener>();

  constructor(private thresholds: MemoryPressureThresholds) {
    if (thresholds.elevated >= thresholds.critical) {
      throw new RangeError('elevated threshold must be < critical threshold');
    }
  }

  report(ratio: number): MemoryPressureLevel {
    const h = this.thresholds.hysteresis ?? 0.03;
    let next: MemoryPressureLevel = this.current;
    if (this.current === 'nominal') {
      if (ratio >= this.thresholds.critical) next = 'critical';
      else if (ratio >= this.thresholds.elevated) next = 'elevated';
    } else if (this.current === 'elevated') {
      if (ratio >= this.thresholds.critical) next = 'critical';
      else if (ratio < this.thresholds.elevated - h) next = 'nominal';
    } else {
      if (ratio < this.thresholds.critical - h) next = 'elevated';
      if (ratio < this.thresholds.elevated - h) next = 'nominal';
    }
    if (next !== this.current) {
      this.current = next;
      for (const l of this.listeners) {
        try { l(next, ratio); } catch { /* swallow */ }
      }
    }
    return next;
  }

  level(): MemoryPressureLevel { return this.current; }

  subscribe(listener: MemoryPressureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
