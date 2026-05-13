// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Ordinary least-squares simple linear regression: y = slope*x + intercept.
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

export function linearRegression(
  xs: ReadonlyArray<number>,
  ys: ReadonlyArray<number>,
): LinearRegressionResult {
  if (xs.length !== ys.length) throw new Error('xs/ys length mismatch');
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  let totVar = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    den += dx * dx;
    totVar += dy * dy;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let resVar = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    const e = ys[i] - pred;
    resVar += e * e;
  }
  const r2 = totVar === 0 ? 1 : 1 - resVar / totVar;
  return { slope, intercept, r2 };
}
