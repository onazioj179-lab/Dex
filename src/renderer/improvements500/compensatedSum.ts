// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function kahanSum(values: ReadonlyArray<number>): number {
  let sum = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const y = values[i] - c;
    const t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  return sum;
}

export function neumaierSum(values: ReadonlyArray<number>): number {
  let sum = 0;
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) c += sum - t + x;
    else c += x - t + sum;
    sum = t;
  }
  return sum + c;
}
