// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bitap (shift-or) approximate string match. Returns the first match index
 * within `maxErrors` Hamming-style mismatches, or -1.
 * Limited to patterns of length <= 31 because of 32-bit bit operations.
 */

export function bitapSearch(text: string, pattern: string, maxErrors = 0): number {
  if (pattern.length === 0) return 0;
  if (pattern.length > 31) throw new Error('bitapSearch: pattern length must be <= 31');
  if (maxErrors < 0) throw new Error('bitapSearch: maxErrors must be >= 0');
  const k = maxErrors;
  const masks = new Map<string, number>();
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    masks.set(ch, (masks.get(ch) ?? ~0) & ~(1 << i));
  }
  // R[d] holds state for d errors. All bits set initially (no match).
  const R = new Array<number>(k + 1).fill(~0);
  const Rnew = new Array<number>(k + 1).fill(~0);
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    const charMask = masks.get(ch) ?? ~0;
    Rnew[0] = ((R[0]! << 1) | charMask) >>> 0;
    for (let d = 1; d <= k; d += 1) {
      // Wu-Manber: match | insert | delete | substitute
      Rnew[d] = (
        ((R[d]! << 1) | charMask)
        & ((Rnew[d - 1]! << 1) >>> 0)
        & ((R[d - 1]! << 1) >>> 0)
        & R[d - 1]!
      ) >>> 0;
    }
    for (let d = 0; d <= k; d += 1) R[d] = Rnew[d]!;
    if ((R[k]! & (1 << (pattern.length - 1))) === 0) {
      return i - pattern.length + 1;
    }
  }
  return -1;
}
