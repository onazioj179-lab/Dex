// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CIE76 deltaE distance between two Lab colors. Smaller is more similar.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface DeltaE76Color {
  l: number;
  a: number;
  b: number;
}

export function deltaE76(a: DeltaE76Color, b: DeltaE76Color): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}
