// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Boyer-Moore-Horspool string search. Single-pattern, returns first match
 * index or -1. Bad-character shift only.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function boyerMooreHorspool(text: string, pattern: string, start = 0): number {
  const m = pattern.length;
  const n = text.length;
  if (m === 0) return start;
  if (m > n - start) return -1;
  const shift = new Map<string, number>();
  for (let i = 0; i < m - 1; i++) shift.set(pattern[i]!, m - 1 - i);
  let i = start;
  while (i <= n - m) {
    let j = m - 1;
    while (j >= 0 && pattern[j] === text[i + j]) j--;
    if (j < 0) return i;
    i += shift.get(text[i + m - 1]!) ?? m;
  }
  return -1;
}

export function boyerMooreHorspoolAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  let i = 0;
  for (;;) {
    const idx = boyerMooreHorspool(text, pattern, i);
    if (idx < 0) break;
    out.push(idx);
    i = idx + Math.max(1, pattern.length);
  }
  return out;
}
