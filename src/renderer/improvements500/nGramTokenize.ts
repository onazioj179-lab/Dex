// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * N-gram tokenization. Returns sliding windows of length `n` over
 * the input. For strings, character n-grams. For arrays, generic.
 */

export function nGramTokenize(input: string, n: number): string[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('nGramTokenize: n must be a positive integer');
  }
  if (input.length < n) return [];
  const out: string[] = new Array(input.length - n + 1);
  for (let i = 0; i <= input.length - n; i += 1) {
    out[i] = input.slice(i, i + n);
  }
  return out;
}

export function nGramArray<T>(items: ReadonlyArray<T>, n: number): T[][] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('nGramArray: n must be a positive integer');
  }
  if (items.length < n) return [];
  const out: T[][] = new Array(items.length - n + 1);
  for (let i = 0; i <= items.length - n; i += 1) {
    out[i] = items.slice(i, i + n) as T[];
  }
  return out;
}
