// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Stern-Brocot tree navigation. Generates the Stern-Brocot path
 * (sequence of 'L' / 'R') for a given positive rational p/q in
 * lowest terms, and reconstructs the rational from a path.
 */

export function sternBrocotPath(p: number, q: number): string {
  if (!Number.isInteger(p) || !Number.isInteger(q) || p <= 0 || q <= 0) {
    throw new Error('sternBrocotPath: requires positive integers');
  }
  // Reduce
  const g = gcd(p, q);
  let a = p / g;
  let b = q / g;
  let path = '';
  while (a !== b) {
    if (a < b) {
      path += 'L';
      b -= a;
    } else {
      path += 'R';
      a -= b;
    }
  }
  return path;
}

export function sternBrocotFromPath(path: string): { num: number; den: number } {
  // Mediant matrix: columns are the two ancestors (left, right).
  // Start with L=0/1, R=1/0. Current node = (col0+col1).
  let m: [[number, number], [number, number]] = [
    [0, 1],
    [1, 0],
  ];
  for (const ch of path) {
    if (ch === 'L') {
      // Move left: new right ancestor = current node
      m[0]![1] = m[0]![0]! + m[0]![1]!;
      m[1]![1] = m[1]![0]! + m[1]![1]!;
    } else if (ch === 'R') {
      // Move right: new left ancestor = current node
      m[0]![0] = m[0]![0]! + m[0]![1]!;
      m[1]![0] = m[1]![0]! + m[1]![1]!;
    } else {
      throw new Error(`sternBrocotFromPath: invalid character '${ch}'`);
    }
  }
  return { num: m[0]![0]! + m[0]![1]!, den: m[1]![0]! + m[1]![1]! };
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
