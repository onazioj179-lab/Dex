// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave E motion + animation tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  easings, cubicBezier,
  evaluateKeyframes,
  stepParticles,
  solveIk2Bone,
  evaluateExpression,
} from '../../src/shared/motion3d/animation';

describe('easings', () => {
  it('all easings 0 -> 0 and 1 -> 1', () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0)).toBeCloseTo(0, 2);
      expect(fn(1)).toBeCloseTo(1, 2);
    }
  });
  it('cubicBezier ease-out is concave', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });
});

describe('keyframes', () => {
  const kfs = [
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: 100, easing: 'linear' as const },
  ];
  it('clamps before first', () => {
    expect(evaluateKeyframes(kfs, -100)).toBe(0);
  });
  it('clamps after last', () => {
    expect(evaluateKeyframes(kfs, 5000)).toBe(100);
  });
  it('linear at midpoint', () => {
    expect(evaluateKeyframes(kfs, 500)).toBe(50);
  });
});

describe('particles', () => {
  it('emits and ages', () => {
    const rng = () => 0.5;
    const params = { emitRatePerSec: 100, initialVelocity: { x: 0, y: 1, z: 0 }, velocityJitter: 0, lifeMs: 1000, gravity: { x: 0, y: -9.8, z: 0 }, maxParticles: 1000 };
    let p = stepParticles([], params, 100, rng, 0);
    expect(p.particles.length).toBeGreaterThan(0);
    p = stepParticles(p.particles, params, 100, rng, p.nextId);
    expect(p.particles[0].ageMs).toBeGreaterThan(0);
  });
  it('respects maxParticles', () => {
    const rng = () => 0;
    const params = { emitRatePerSec: 10000, initialVelocity: { x: 0, y: 0, z: 0 }, velocityJitter: 0, lifeMs: 100000, gravity: { x: 0, y: 0, z: 0 }, maxParticles: 10 };
    const p = stepParticles([], params, 1000, rng, 0);
    expect(p.particles.length).toBeLessThanOrEqual(10);
  });
});

describe('IK', () => {
  it('reachable when within range', () => {
    expect(solveIk2Bone(1, 1, 1.5, 0).reachable).toBe(true);
  });
  it('unreachable beyond reach', () => {
    expect(solveIk2Bone(1, 1, 5, 0).reachable).toBe(false);
  });
  it('returns finite angles', () => {
    const r = solveIk2Bone(1, 1, 0.5, 0.5);
    expect(Number.isFinite(r.jointAngle)).toBe(true);
    expect(Number.isFinite(r.tipAngle)).toBe(true);
  });
});

describe('expression evaluator', () => {
  it('evaluates basic math', () => {
    expect(evaluateExpression('time + value * 2', { time: 1, index: 0, value: 3, pi: Math.PI })).toBe(7);
  });
  it('uses sin', () => {
    expect(evaluateExpression('sin(pi/2)', { time: 0, index: 0, value: 0, pi: Math.PI })).toBeCloseTo(1);
  });
  it('rejects unknown identifier', () => {
    expect(() => evaluateExpression('eval("x")', { time: 0, index: 0, value: 0, pi: Math.PI })).toThrow();
  });
  it('rejects disallowed characters', () => {
    expect(() => evaluateExpression('time + "abc"', { time: 0, index: 0, value: 0, pi: Math.PI })).toThrow();
  });
});
