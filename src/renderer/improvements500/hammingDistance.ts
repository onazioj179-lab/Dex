// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hamming distance between equal-length strings or byte arrays.
 * Counts the number of positions at which corresponding symbols differ.
 */

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error('hammingDistance: strings must be equal length');
  }
  let count = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) count += 1;
  }
  return count;
}

export function hammingDistanceBytes(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error('hammingDistanceBytes: arrays must be equal length');
  }
  let count = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = a[i]! ^ b[i]!;
    while (x !== 0) {
      x &= x - 1;
      count += 1;
    }
  }
  return count;
}
