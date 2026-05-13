// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Min-max normalization to a target range (default [0, 1]).
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface MinMaxResult {
  values: number[];
  min: number;
  max: number;
}

export function minMaxNormalize(data: readonly number[], lower = 0, upper = 1): MinMaxResult {
  if (data.length === 0) return { values: [], min: 0, max: 0 };
  let min = data[0]!;
  let max = data[0]!;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (span === 0) return { values: new Array<number>(data.length).fill(lower), min, max };
  const k = (upper - lower) / span;
  const values = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) values[i] = lower + (data[i]! - min) * k;
  return { values, min, max };
}
