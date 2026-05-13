// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Generic `groupBy`, `keyBy`, `countBy` collection helpers.
 */

export function groupBy<T, K extends string | number>(
  items: Iterable<T>,
  key: (item: T) => K,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(key(item));
    let bucket = out[k];
    if (!bucket) { bucket = []; out[k] = bucket; }
    bucket.push(item);
  }
  return out;
}

export function keyBy<T, K extends string | number>(
  items: Iterable<T>,
  key: (item: T) => K,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) {
    out[String(key(item))] = item;
  }
  return out;
}

export function countBy<T, K extends string | number>(
  items: Iterable<T>,
  key: (item: T) => K,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = String(key(item));
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
