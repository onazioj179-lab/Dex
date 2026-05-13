// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function fwht(a: Float64Array, invert = false): void {
  const n = a.length;
  if ((n & (n - 1)) !== 0) throw new Error('length must be power of two');
  for (let len = 1; len < n; len <<= 1) {
    for (let i = 0; i < n; i += len << 1) {
      for (let j = i; j < i + len; j++) {
        const u = a[j];
        const v = a[j + len];
        a[j] = u + v;
        a[j + len] = u - v;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) a[i] /= n;
  }
}
