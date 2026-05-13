// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Soundex phonetic encoding (American Soundex). Produces a 4-character
 * code (one letter + 3 digits) intended to match similarly-pronounced
 * English names.
 */

const SOUNDEX_MAP: Record<string, string> = {
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

export function soundex(name: string): string {
  if (name.length === 0) return '0000';
  const upper = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (upper.length === 0) return '0000';
  const first = upper[0]!;
  let prev = SOUNDEX_MAP[first] ?? '';
  let code = first;
  for (let i = 1; i < upper.length && code.length < 4; i += 1) {
    const d = SOUNDEX_MAP[upper[i]!] ?? '';
    if (d !== '' && d !== prev) {
      code += d;
    }
    if (upper[i] !== 'H' && upper[i] !== 'W') {
      prev = d;
    }
  }
  while (code.length < 4) code += '0';
  return code;
}
