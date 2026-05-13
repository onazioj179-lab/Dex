// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * GCD/LCM helpers for both `number` and `bigint` types. The number
 * variants handle non-negative integers up to Number.MAX_SAFE_INTEGER.
 */

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a / gcd(a, b)) * Math.abs(b);
}

export function gcdMany(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let g = Math.abs(values[0]!);
  for (let i = 1; i < values.length; i += 1) {
    g = gcd(g, values[i]!);
    if (g === 1) return 1;
  }
  return g;
}

export function lcmMany(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let r = Math.abs(values[0]!);
  for (let i = 1; i < values.length; i += 1) r = lcm(r, values[i]!);
  return r;
}

export function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function lcmBig(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  const ax = a < 0n ? -a : a;
  const bx = b < 0n ? -b : b;
  return (ax / gcdBig(ax, bx)) * bx;
}
