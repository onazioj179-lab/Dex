// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Shannon entropy in bits per symbol for a string or byte sequence.
 */

export function shannonEntropy(input: string | Uint8Array): number {
  if (input.length === 0) return 0;
  const counts = new Map<number, number>();
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i += 1) {
      const c = input.charCodeAt(i);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  } else {
    for (let i = 0; i < input.length; i += 1) {
      const c = input[i] ?? 0;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const n = input.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}
