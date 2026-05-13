// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface ExtGcdResult {
  g: bigint;
  x: bigint;
  y: bigint;
}

export function extendedEuclidean(a: bigint, b: bigint): ExtGcdResult {
  if (b === 0n) return { g: a < 0n ? -a : a, x: a < 0n ? -1n : 1n, y: 0n };
  let oldR = a;
  let r = b;
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  if (oldR < 0n) {
    oldR = -oldR;
    oldS = -oldS;
    oldT = -oldT;
  }
  return { g: oldR, x: oldS, y: oldT };
}
