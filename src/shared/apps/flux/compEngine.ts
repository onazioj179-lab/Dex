// =============================================================================
// DEX Platform — Track G2: Flux comp engine (keyframes + expressions)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Composition + keyframe interpolation + a tiny expression VM (subset of
 * After Effects expressions: time, value, wiggle, linear, ease).
 */

export type EaseMode = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export interface Keyframe<T extends number | number[]> {
  t: number;        // time in seconds
  value: T;
  ease?: EaseMode;
}

export type Channel<T extends number | number[]> = {
  keyframes: Keyframe<T>[];
  /** Optional expression that overrides keyframes when present. */
  expression?: string;
};

const EASE_FN: Record<EaseMode, (t: number) => number> = {
  linear:       t => t,
  'ease-in':    t => t * t,
  'ease-out':   t => 1 - (1 - t) * (1 - t),
  'ease-in-out': t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  hold:         t => (t < 1 ? 0 : 1),
};

export function sampleNumber(channel: Channel<number>, t: number): number {
  const ks = channel.keyframes;
  if (ks.length === 0) return 0;
  if (t <= ks[0]!.t) return ks[0]!.value;
  if (t >= ks[ks.length - 1]!.t) return ks[ks.length - 1]!.value;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
      const eased = EASE_FN[a.ease ?? 'linear'](f);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return ks[ks.length - 1]!.value;
}

export function sampleVector(channel: Channel<number[]>, t: number): number[] {
  const ks = channel.keyframes;
  if (ks.length === 0) return [];
  if (t <= ks[0]!.t) return ks[0]!.value.slice();
  if (t >= ks[ks.length - 1]!.t) return ks[ks.length - 1]!.value.slice();
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
      const eased = EASE_FN[a.ease ?? 'linear'](f);
      const out = a.value.map((av, k) => av + ((b.value[k] ?? av) - av) * eased);
      return out;
    }
  }
  return ks[ks.length - 1]!.value.slice();
}

/** Tiny expression evaluator for FluX. Supports: time, value, wiggle, linear, easeIn/Out. */
export interface ExprContext {
  time: number;
  value: number;
  /** Random source seeded by layer id for determinism. */
  rand: (i: number) => number;
}

export function evalExpression(expr: string, ctx: ExprContext): number {
  const trimmed = expr.trim();
  // value
  if (trimmed === 'value') return ctx.value;
  if (trimmed === 'time') return ctx.time;
  // wiggle(freq, amp)
  const wiggle = /^wiggle\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(trimmed);
  if (wiggle) {
    const freq = parseFloat(wiggle[1]!);
    const amp = parseFloat(wiggle[2]!);
    const i = Math.floor(ctx.time * freq);
    const u = ctx.rand(i) * 2 - 1;
    return ctx.value + u * amp;
  }
  // linear(t, t0, t1, v0, v1)
  const linear = /^linear\(\s*time\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(trimmed);
  if (linear) {
    const t0 = parseFloat(linear[1]!), t1 = parseFloat(linear[2]!);
    const v0 = parseFloat(linear[3]!), v1 = parseFloat(linear[4]!);
    if (ctx.time <= t0) return v0;
    if (ctx.time >= t1) return v1;
    const f = (ctx.time - t0) / Math.max(1e-9, t1 - t0);
    return v0 + (v1 - v0) * f;
  }
  // Pure number
  const n = Number(trimmed);
  if (!Number.isNaN(n)) return n;
  return ctx.value;
}
