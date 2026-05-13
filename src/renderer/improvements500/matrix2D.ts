// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2x2 and 3x3 matrix utilities (multiply, determinant, inverse).
 * Stored row-major as flat number arrays.
 */

export type Mat2 = readonly [number, number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export function mat2Multiply(a: Mat2, b: Mat2): Mat2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

export function mat2Determinant(m: Mat2): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function mat2Inverse(m: Mat2): Mat2 {
  const det = mat2Determinant(m);
  if (det === 0) throw new Error('matrix is singular');
  const inv = 1 / det;
  return [m[3] * inv, -m[1] * inv, -m[2] * inv, m[0] * inv];
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[j + 3]! + a[i * 3 + 2]! * b[j + 6]!;
    }
  }
  return out as unknown as Mat3;
}

export function mat3Determinant(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function mat3Inverse(m: Mat3): Mat3 {
  const det = mat3Determinant(m);
  if (det === 0) throw new Error('matrix is singular');
  const inv = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * inv,
    (m[2] * m[7] - m[1] * m[8]) * inv,
    (m[1] * m[5] - m[2] * m[4]) * inv,
    (m[5] * m[6] - m[3] * m[8]) * inv,
    (m[0] * m[8] - m[2] * m[6]) * inv,
    (m[2] * m[3] - m[0] * m[5]) * inv,
    (m[3] * m[7] - m[4] * m[6]) * inv,
    (m[1] * m[6] - m[0] * m[7]) * inv,
    (m[0] * m[4] - m[1] * m[3]) * inv,
  ];
}
