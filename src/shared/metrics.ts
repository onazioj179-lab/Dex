// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * metrics -- lightweight in-process telemetry for DEX.
 *
 * No external dependencies, no network egress. Data lives in a ring buffer
 * and can be flushed to the diagnostics panel or crash reporter.
 *
 * Three metric primitives:
 *   Counter   -- monotonically increasing integer (events, errors, retries)
 *   Gauge     -- latest observed value (memory MB, queue depth)
 *   Histogram -- fixed-bucket latency/size distribution
 */

export interface MetricSnapshot {
  readonly name: string;
  readonly kind: 'counter' | 'gauge' | 'histogram';
  readonly value: number;
  readonly unit?: string;
  readonly tags?: Record<string, string>;
  readonly t: number;
}

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------
export class Counter {
  private _value = 0;

  constructor(
    public readonly name: string,
    public readonly unit?: string,
    public readonly tags?: Record<string, string>,
  ) {}

  inc(by = 1): this { this._value += by; return this; }
  reset(): this { this._value = 0; return this; }
  get value(): number { return this._value; }

  snapshot(): MetricSnapshot {
    return { name: this.name, kind: 'counter', value: this._value, unit: this.unit, tags: this.tags, t: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------
export class Gauge {
  private _value = 0;

  constructor(
    public readonly name: string,
    public readonly unit?: string,
    public readonly tags?: Record<string, string>,
  ) {}

  set(v: number): this { this._value = v; return this; }
  get value(): number { return this._value; }

  snapshot(): MetricSnapshot {
    return { name: this.name, kind: 'gauge', value: this._value, unit: this.unit, tags: this.tags, t: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------
export interface HistogramSnapshot extends MetricSnapshot {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly count: number;
}

export class Histogram {
  private readonly _buf: number[];
  private readonly _cap: number;
  private _min = Infinity;
  private _max = -Infinity;
  private _sum = 0;

  constructor(
    public readonly name: string,
    capacity = 512,
    public readonly unit?: string,
    public readonly tags?: Record<string, string>,
  ) {
    this._buf = [];
    this._cap = capacity;
  }

  record(v: number): this {
    if (this._buf.length >= this._cap) this._buf.shift();
    this._buf.push(v);
    if (v < this._min) this._min = v;
    if (v > this._max) this._max = v;
    this._sum += v;
    return this;
  }

  snapshot(): HistogramSnapshot {
    if (this._buf.length === 0) {
      const z = { name: this.name, kind: 'histogram' as const, value: 0, unit: this.unit, tags: this.tags, t: Date.now(), min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, count: 0 };
      return z;
    }
    const sorted = [...this._buf].sort((a, b) => a - b);
    const n = sorted.length;
    const p = (pct: number) => sorted[Math.min(Math.floor((pct / 100) * n), n - 1)];
    return {
      name: this.name, kind: 'histogram', value: this._sum / n,
      unit: this.unit, tags: this.tags, t: Date.now(),
      min: this._min, max: this._max, mean: this._sum / n,
      p50: p(50), p95: p(95), p99: p(99), count: n,
    };
  }

  reset(): this { this._buf.length = 0; this._min = Infinity; this._max = -Infinity; this._sum = 0; return this; }
}

// ---------------------------------------------------------------------------
// Registry  (lightweight, no global singleton — consumers create per-scope)
// ---------------------------------------------------------------------------
export class MetricRegistry {
  private readonly _counters = new Map<string, Counter>();
  private readonly _gauges = new Map<string, Gauge>();
  private readonly _histograms = new Map<string, Histogram>();

  counter(name: string, unit?: string, tags?: Record<string, string>): Counter {
    if (!this._counters.has(name)) this._counters.set(name, new Counter(name, unit, tags));
    return this._counters.get(name)!;
  }

  gauge(name: string, unit?: string, tags?: Record<string, string>): Gauge {
    if (!this._gauges.has(name)) this._gauges.set(name, new Gauge(name, unit, tags));
    return this._gauges.get(name)!;
  }

  histogram(name: string, capacity?: number, unit?: string, tags?: Record<string, string>): Histogram {
    if (!this._histograms.has(name)) this._histograms.set(name, new Histogram(name, capacity, unit, tags));
    return this._histograms.get(name)!;
  }

  snapshots(): MetricSnapshot[] {
    return [
      ...[...this._counters.values()].map(c => c.snapshot()),
      ...[...this._gauges.values()].map(g => g.snapshot()),
      ...[...this._histograms.values()].map(h => h.snapshot()),
    ];
  }

  reset(): void {
    this._counters.forEach(c => c.reset());
    this._histograms.forEach(h => h.reset());
  }
}

/** Shared registry for renderer-side use. */
export const rendererMetrics = new MetricRegistry();
