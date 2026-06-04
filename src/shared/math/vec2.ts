// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D vector math (Flux motion, AXL sketching, Canvas/Prism transforms, drag
 * deltas). Pure value-type operations — inputs are never mutated. No DOM, no IO.
 */

export interface Vec2 { x: number; y: number }

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(a: Vec2, k: number): Vec2 { return { x: a.x * k, y: a.y * k }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }

export function length(a: Vec2): number { return Math.hypot(a.x, a.y); }
export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Unit vector (returns {0,0} for a zero vector). */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Linear interpolation between two points by t. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Angle of the vector in radians (atan2). */
export function angle(a: Vec2): number { return Math.atan2(a.y, a.x); }

/** Unit vector from an angle (radians). */
export function fromAngle(radians: number, len = 1): Vec2 {
  return { x: Math.cos(radians) * len, y: Math.sin(radians) * len };
}

/** Perpendicular (90° CCW) vector. */
export function perpendicular(a: Vec2): Vec2 { return { x: -a.y, y: a.x }; }

/** Rotate a vector by `radians` about the origin. */
export function rotate(a: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
