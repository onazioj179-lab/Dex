// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Euclidean rhythm generator (Bjorklund's algorithm). Distributes k pulses
 * as evenly as possible across n steps. Returns a binary pattern of
 * length n.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function euclideanRhythm(steps: number, pulses: number): number[] {
  if (!Number.isInteger(steps) || steps < 0) throw new RangeError('euclideanRhythm: steps must be a non-negative integer');
  if (!Number.isInteger(pulses) || pulses < 0) throw new RangeError('euclideanRhythm: pulses must be a non-negative integer');
  if (pulses > steps) pulses = steps;
  if (steps === 0) return [];
  if (pulses === 0) return new Array(steps).fill(0);
  if (pulses === steps) return new Array(steps).fill(1);

  let groups: number[][] = [];
  for (let i = 0; i < pulses; i++) groups.push([1]);
  for (let i = 0; i < steps - pulses; i++) groups.push([0]);

  while (true) {
    const ones: number[][] = [];
    const zeros: number[][] = [];
    for (const g of groups) (g[0] === 1 ? ones : zeros).push(g);
    const pairCount = Math.min(ones.length, zeros.length);
    if (pairCount <= 1) break;
    const merged: number[][] = [];
    for (let i = 0; i < pairCount; i++) merged.push([...ones[i]!, ...zeros[i]!]);
    if (ones.length > pairCount) merged.push(...ones.slice(pairCount));
    if (zeros.length > pairCount) merged.push(...zeros.slice(pairCount));
    if (merged.length === groups.length) break;
    groups = merged;
  }

  return groups.flat();
}
