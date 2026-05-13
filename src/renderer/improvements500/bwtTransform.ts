// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Burrows-Wheeler Transform via simple O(n^2 log n) rotation sort.
// Suitable for small inputs / educational use.

export interface BwtResult {
  data: Uint8Array;
  primaryIndex: number;
}

export function bwtTransform(input: Uint8Array): BwtResult {
  const n = input.length;
  if (n === 0) return { data: new Uint8Array(0), primaryIndex: 0 };
  const indices = new Int32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  const sorted = Array.from(indices).sort((a, b) => {
    for (let k = 0; k < n; k++) {
      const ai = input[(a + k) % n];
      const bi = input[(b + k) % n];
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });
  const out = new Uint8Array(n);
  let primaryIndex = 0;
  for (let i = 0; i < n; i++) {
    const start = sorted[i];
    out[i] = input[(start + n - 1) % n];
    if (start === 0) primaryIndex = i;
  }
  return { data: out, primaryIndex };
}

export function bwtInverse(input: BwtResult): Uint8Array {
  const n = input.data.length;
  if (n === 0) return new Uint8Array(0);
  const lf = new Int32Array(n);
  const sortedFirst = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => input.data[a] - input.data[b],
  );
  for (let i = 0; i < n; i++) lf[sortedFirst[i]] = i;
  const out = new Uint8Array(n);
  let row = input.primaryIndex;
  for (let i = n - 1; i >= 0; i--) {
    out[i] = input.data[row];
    row = lf[row];
  }
  return out;
}
