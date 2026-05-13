// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Precomputed sine lookup table with linear interpolation. Good
 * trade-off for hot rendering loops that need sin/cos but tolerate
 * small error (~1e-4 with default 4096-entry table).
 */

const TABLE_SIZE = 4096;
const TABLE = new Float64Array(TABLE_SIZE + 1);
const TWO_PI = Math.PI * 2;
(function init(): void {
  for (let i = 0; i <= TABLE_SIZE; i += 1) TABLE[i] = Math.sin((i / TABLE_SIZE) * TWO_PI);
})();

/** Lookup-table sine. */
export function sinTable(angle: number): number {
  let t = (angle / TWO_PI) % 1;
  if (t < 0) t += 1;
  const idx = t * TABLE_SIZE;
  const i = idx | 0;
  const frac = idx - i;
  const a = TABLE[i]!;
  const b = TABLE[i + 1]!;
  return a + (b - a) * frac;
}

/** Lookup-table cosine: cos(x) = sin(x + pi/2). */
export function cosTable(angle: number): number {
  return sinTable(angle + Math.PI / 2);
}
