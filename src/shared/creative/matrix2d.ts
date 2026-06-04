// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D affine transforms (Prism/Flux/Canvas/AXL). A `Matrix2D` is the 6-value
 * affine form used by CSS/Canvas `transform`:
 *   | a c e |   x' = a·x + c·y + e
 *   | b d f |   y' = b·x + d·y + f
 *   | 0 0 1 |
 * Compose, apply, and invert without DOM. Pure: no DOM, no IO.
 */

export interface Matrix2D { a: number; b: number; c: number; d: number; e: number; f: number }
export interface Point { x: number; y: number }

export function identity(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function translate(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx: number, sy: number = sx): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Rotation by `radians` about the origin. */
export function rotate(radians: number): Matrix2D {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Matrix product m1·m2 (applies m2 first, then m1, to a point). */
export function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Compose a list left-to-right: compose(A, B, C) applies A, then B, then C. */
export function compose(...matrices: Matrix2D[]): Matrix2D {
  return matrices.reduce((acc, m) => multiply(m, acc), identity());
}

/** Apply a matrix to a point. */
export function applyToPoint(m: Matrix2D, p: Point): Point {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

/** Determinant of the linear part (a·d − b·c). */
export function determinant(m: Matrix2D): number {
  return m.a * m.d - m.b * m.c;
}

/** Inverse matrix, or null when singular (non-invertible). */
export function invert(m: Matrix2D): Matrix2D | null {
  const det = determinant(m);
  if (det === 0) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Serialize to a CSS `matrix(a,b,c,d,e,f)` string. */
export function toCss(m: Matrix2D): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
}
