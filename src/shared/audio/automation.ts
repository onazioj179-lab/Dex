// =============================================================================
// DEX Platform — Wave 1.1 Imosion: sample-accurate automation
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * AutomationLane — per-parameter automation curve sampled per audio frame.
 *
 * Each lane has an ordered list of points (t in seconds, value 0..1, curve
 * shape selector). `valueAt(t)` returns the interpolated value with sample
 * accuracy. `bake(t0, t1, sr)` returns a Float32Array of `(t1-t0)*sr` samples
 * for fast read-out by the audio engine.
 *
 * Curve shapes:
 *   'linear' — straight line
 *   'log'    — ease-in-out using log curve (good for pan/level)
 *   'bezier' — cubic bezier with per-point handle pair
 *   'hold'   — step (no interpolation, value sticks until next point)
 *
 * No DOM, no IPC. Pure logic.
 */

export type CurveShape = 'linear' | 'log' | 'bezier' | 'hold';

export interface AutomationPoint {
  /** Time in seconds. */
  t: number;
  /** Value (typically 0..1; lane-defined units). */
  v: number;
  /** Outgoing curve shape (towards next point). */
  curve?: CurveShape;
  /** Bezier handle (only used when curve === 'bezier'). */
  bezier?: { ox: number; oy: number; ix: number; iy: number };
}

export interface AutomationLaneState {
  /** Lane id (parameter path, e.g. 'track.3.volume'). */
  id: string;
  /** Sorted by t ascending. */
  points: AutomationPoint[];
  /** Default value when no points exist. */
  defaultValue: number;
  /** Min/max clamp. */
  min: number;
  max: number;
}

export class AutomationLane {
  private points: AutomationPoint[];
  constructor(private state: AutomationLaneState) {
    this.points = [...state.points].sort((a, b) => a.t - b.t);
  }

  get id(): string { return this.state.id; }

  addPoint(p: AutomationPoint): void {
    // Replace existing point at same t
    const idx = this.points.findIndex(x => Math.abs(x.t - p.t) < 1e-9);
    if (idx >= 0) this.points[idx] = p;
    else {
      this.points.push(p);
      this.points.sort((a, b) => a.t - b.t);
    }
  }

  removePointAt(t: number, eps: number = 1e-6): boolean {
    const i = this.points.findIndex(p => Math.abs(p.t - t) < eps);
    if (i === -1) return false;
    this.points.splice(i, 1);
    return true;
  }

  get all(): readonly AutomationPoint[] { return this.points; }

  /**
   * Sample value at time t. Binary search for surrounding points.
   */
  valueAt(t: number): number {
    if (this.points.length === 0) return this.clamp(this.state.defaultValue);
    if (t <= this.points[0]!.t) return this.clamp(this.points[0]!.v);
    const last = this.points[this.points.length - 1]!;
    if (t >= last.t) return this.clamp(last.v);

    // Binary search for the segment containing t
    let lo = 0, hi = this.points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.points[mid]!.t <= t) lo = mid;
      else hi = mid;
    }
    const a = this.points[lo]!;
    const b = this.points[hi]!;
    const u = (t - a.t) / (b.t - a.t);
    return this.clamp(interp(a, b, u));
  }

  /**
   * Bake values into a Float32Array sampled at sample-rate `sr` between
   * `t0` and `t1` (seconds). Length = round((t1-t0)*sr).
   */
  bake(t0: number, t1: number, sr: number): Float32Array {
    const n = Math.max(0, Math.round((t1 - t0) * sr));
    const out = new Float32Array(n);
    if (n === 0) return out;
    const dt = 1 / sr;
    for (let i = 0; i < n; i++) out[i] = this.valueAt(t0 + i * dt);
    return out;
  }

  private clamp(v: number): number {
    if (v < this.state.min) return this.state.min;
    if (v > this.state.max) return this.state.max;
    return v;
  }

  toJSON(): AutomationLaneState {
    return { ...this.state, points: [...this.points] };
  }
}

function interp(a: AutomationPoint, b: AutomationPoint, u: number): number {
  const shape: CurveShape = a.curve ?? 'linear';
  switch (shape) {
    case 'hold':
      return a.v;
    case 'linear':
      return a.v + (b.v - a.v) * u;
    case 'log': {
      // Smooth easing using cosine — symmetric, monotonic
      const k = (1 - Math.cos(u * Math.PI)) / 2;
      return a.v + (b.v - a.v) * k;
    }
    case 'bezier': {
      if (!a.bezier) return a.v + (b.v - a.v) * u;
      // 1D cubic bezier where x is parameterized by u directly. The bezier
      // handles' x components shape the time warp; y components shape value.
      const { oy, iy } = a.bezier;
      // Bernstein basis
      const u2 = u * u, u3 = u2 * u;
      const oneMinus = 1 - u;
      const om2 = oneMinus * oneMinus, om3 = om2 * oneMinus;
      const c0 = a.v;
      const c1 = a.v + oy * (b.v - a.v);
      const c2 = b.v + iy * (a.v - b.v);
      const c3 = b.v;
      return om3 * c0 + 3 * om2 * u * c1 + 3 * oneMinus * u2 * c2 + u3 * c3;
    }
  }
}
