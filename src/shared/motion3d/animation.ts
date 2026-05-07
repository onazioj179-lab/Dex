// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave E v4.0.1 - Flux animation core.
// Easing curves, keyframe interpolation, particles, IK, expression DSL.

// ---------- Easing ----------

export type EasingFn = (t: number) => number;

export const easings: Readonly<Record<string, EasingFn>> = Object.freeze({
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => --t * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - --t * t * t * t,
  easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => {
    if (t === 0 || t === 1) return t;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  easeOutBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  easeOutElastic: t => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: t => {
    const n1 = 7.5625; const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
});

export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let x = t;
    for (let i = 0; i < 8; i++) {
      const xt = bezier(x, p1x, p2x);
      const dx = bezierDerivative(x, p1x, p2x);
      if (Math.abs(xt - t) < 1e-5) break;
      if (Math.abs(dx) < 1e-6) break;
      x = x - (xt - t) / dx;
    }
    return bezier(x, p1y, p2y);
  };
}

function bezier(t: number, a: number, b: number): number {
  return 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
}

function bezierDerivative(t: number, a: number, b: number): number {
  return 3 * (1 - t) ** 2 * a + 6 * (1 - t) * t * (b - a) + 3 * t ** 2 * (1 - b);
}

// ---------- Keyframe interpolation ----------

export interface Keyframe<T> {
  timeMs: number;
  value: T;
  easing?: keyof typeof easings | EasingFn;
  inTangent?: number;
  outTangent?: number;
}

export function evaluateKeyframes(keyframes: ReadonlyArray<Keyframe<number>>, timeMs: number): number {
  if (keyframes.length === 0) return 0;
  if (timeMs <= keyframes[0].timeMs) return keyframes[0].value;
  if (timeMs >= keyframes[keyframes.length - 1].timeMs) return keyframes[keyframes.length - 1].value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (timeMs >= a.timeMs && timeMs <= b.timeMs) {
      const span = b.timeMs - a.timeMs;
      if (span === 0) return b.value;
      const t = (timeMs - a.timeMs) / span;
      const eased = (typeof a.easing === 'function' ? a.easing : easings[(a.easing as string) ?? 'linear'])(t);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

// ---------- Particle systems ----------

export interface Vec3 { x: number; y: number; z: number }

export interface Particle {
  id: number;
  position: Vec3;
  velocity: Vec3;
  ageMs: number;
  lifeMs: number;
  size: number;
}

export interface ParticleEmitterParams {
  emitRatePerSec: number;
  initialVelocity: Vec3;
  velocityJitter: number;
  lifeMs: number;
  gravity: Vec3;
  maxParticles: number;
}

export function stepParticles(
  particles: ReadonlyArray<Particle>,
  emitter: ParticleEmitterParams,
  dtMs: number,
  rng: () => number,
  nextId: number,
): { particles: Particle[]; nextId: number } {
  const dt = dtMs / 1000;
  const out: Particle[] = [];
  for (const p of particles) {
    const ageMs = p.ageMs + dtMs;
    if (ageMs >= p.lifeMs) continue;
    out.push({
      ...p,
      ageMs,
      position: {
        x: p.position.x + p.velocity.x * dt,
        y: p.position.y + p.velocity.y * dt,
        z: p.position.z + p.velocity.z * dt,
      },
      velocity: {
        x: p.velocity.x + emitter.gravity.x * dt,
        y: p.velocity.y + emitter.gravity.y * dt,
        z: p.velocity.z + emitter.gravity.z * dt,
      },
    });
  }
  let id = nextId;
  const toEmit = Math.min(
    Math.floor(emitter.emitRatePerSec * dt),
    Math.max(0, emitter.maxParticles - out.length),
  );
  for (let i = 0; i < toEmit; i++) {
    out.push({
      id: id++,
      position: { x: 0, y: 0, z: 0 },
      velocity: {
        x: emitter.initialVelocity.x + (rng() - 0.5) * emitter.velocityJitter,
        y: emitter.initialVelocity.y + (rng() - 0.5) * emitter.velocityJitter,
        z: emitter.initialVelocity.z + (rng() - 0.5) * emitter.velocityJitter,
      },
      ageMs: 0,
      lifeMs: emitter.lifeMs,
      size: 1,
    });
  }
  return { particles: out, nextId: id };
}

// ---------- 2-bone IK ----------

export interface IkResult { jointAngle: number; tipAngle: number; reachable: boolean }

export function solveIk2Bone(
  l1: number, l2: number, targetX: number, targetY: number,
): IkResult {
  const dist = Math.hypot(targetX, targetY);
  const reachable = dist <= l1 + l2 && dist >= Math.abs(l1 - l2);
  const clamped = Math.max(Math.abs(l1 - l2), Math.min(l1 + l2, dist));
  const cosA = (l1 * l1 + clamped * clamped - l2 * l2) / (2 * l1 * clamped);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const aBase = Math.atan2(targetY, targetX);
  const cosB = (l1 * l1 + l2 * l2 - clamped * clamped) / (2 * l1 * l2);
  const b = Math.acos(Math.max(-1, Math.min(1, cosB)));
  return {
    jointAngle: aBase - a,
    tipAngle: Math.PI - b,
    reachable,
  };
}

// ---------- Expression DSL (safe evaluator) ----------

export type ExpressionValue = number;

export interface ExpressionContext { time: number; index: number; value: number; pi: number }

export function evaluateExpression(expr: string, ctx: ExpressionContext): ExpressionValue {
  // Allowed: digits, basic operators, identifiers from ctx, math functions.
  const allowed = /^[0-9+\-*/().,\s%a-zA-Z_]+$/;
  if (!allowed.test(expr)) throw new Error('expression contains disallowed characters');
  const fns = { sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, exp: Math.exp, log: Math.log };
  const ids = new Set([...Object.keys(fns), ...Object.keys(ctx)]);
  for (const word of expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []) {
    if (!ids.has(word)) throw new Error(`unknown identifier: ${word}`);
  }
  // Build function via Function constructor in restricted scope.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const f = new Function(
    'time', 'index', 'value', 'pi',
    'sin', 'cos', 'tan', 'abs', 'min', 'max', 'pow', 'sqrt', 'floor', 'ceil', 'round', 'exp', 'log',
    `"use strict"; return (${expr});`,
  );
  const result = f(
    ctx.time, ctx.index, ctx.value, ctx.pi,
    fns.sin, fns.cos, fns.tan, fns.abs, fns.min, fns.max, fns.pow, fns.sqrt, fns.floor, fns.ceil, fns.round, fns.exp, fns.log,
  );
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('expression did not evaluate to a finite number');
  }
  return result;
}
