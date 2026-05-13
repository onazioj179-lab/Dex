// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Decibel <-> linear amplitude conversion.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function linearToDb(linear: number, floorDb = -120): number {
  if (linear <= 0) return floorDb;
  return 20 * Math.log10(linear);
}

export function clipDb(db: number, floorDb = -120, ceilingDb = 0): number {
  return Math.min(ceilingDb, Math.max(floorDb, db));
}
