// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Natural sort (Files, asset lists, Forge queue). Orders strings the way people
 * expect: "file2" before "file10", case-insensitively, by comparing numeric
 * runs as numbers. Pure: no DOM, no IO.
 */

/** Split a string into alternating text/number chunks. */
function chunk(s: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /(\d+)|(\D+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] !== undefined ? Number(m[1]) : m[2].toLowerCase());
  }
  return out;
}

/** Compare two strings naturally (returns <0, 0, >0). */
export function naturalCompare(a: string, b: string): number {
  const ca = chunk(a);
  const cb = chunk(b);
  const len = Math.min(ca.length, cb.length);
  for (let i = 0; i < len; i++) {
    const x = ca[i];
    const y = cb[i];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else {
      const sx = String(x);
      const sy = String(y);
      if (sx !== sy) return sx < sy ? -1 : 1;
    }
  }
  return ca.length - cb.length;
}

/** Return a new array sorted naturally. Optional key extractor. */
export function sortNatural<T>(items: readonly T[], key: (item: T) => string = (x) => String(x)): T[] {
  return [...items].sort((a, b) => naturalCompare(key(a), key(b)));
}
