// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Roman numeral conversion (1..3999).
 */

const VALUES: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new RangeError('toRoman: value must be an integer in [1, 3999]');
  }
  let v = n;
  let out = '';
  for (const [num, sym] of VALUES) {
    while (v >= num) {
      out += sym;
      v -= num;
    }
  }
  return out;
}

const SYMBOL_VALUE: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

export function fromRoman(s: string): number {
  if (s.length === 0) throw new Error('fromRoman: empty string');
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!.toUpperCase();
    const v = SYMBOL_VALUE[ch];
    if (v === undefined) throw new Error(`fromRoman: invalid character '${ch}'`);
    const next = i + 1 < s.length ? SYMBOL_VALUE[s[i + 1]!.toUpperCase()] ?? 0 : 0;
    if (v < next) total -= v;
    else total += v;
  }
  return total;
}
