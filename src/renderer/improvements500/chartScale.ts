// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Linear and logarithmic chart scales plus "nice" tick generation. Pure
 * functions; no rendering. Range is the pixel range, domain is the data
 * range.
 */

export interface Scale {
  toRange(value: number): number;
  toDomain(pixel: number): number;
  ticks(approxCount?: number): number[];
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dDelta = d1 - d0;
  const rDelta = r1 - r0;
  return {
    toRange(value: number): number {
      if (dDelta === 0) return r0;
      return r0 + ((value - d0) / dDelta) * rDelta;
    },
    toDomain(pixel: number): number {
      if (rDelta === 0) return d0;
      return d0 + ((pixel - r0) / rDelta) * dDelta;
    },
    ticks(approxCount = 10): number[] {
      return niceTicks(d0, d1, approxCount);
    },
  };
}

export function logScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 <= 0 || d1 <= 0) throw new Error('logScale requires strictly positive domain');
  const ld0 = Math.log10(d0);
  const ld1 = Math.log10(d1);
  const dDelta = ld1 - ld0;
  const rDelta = r1 - r0;
  return {
    toRange(value: number): number {
      if (value <= 0) return r0;
      return r0 + ((Math.log10(value) - ld0) / dDelta) * rDelta;
    },
    toDomain(pixel: number): number {
      const lv = ld0 + ((pixel - r0) / rDelta) * dDelta;
      return Math.pow(10, lv);
    },
    ticks(): number[] {
      const out: number[] = [];
      const start = Math.floor(ld0);
      const end = Math.ceil(ld1);
      for (let p = start; p <= end; p += 1) out.push(Math.pow(10, p));
      return out.filter((v) => v >= d0 && v <= d1);
    },
  };
}

/** Wilkinson-style "nice" tick spacing. */
export function niceTicks(min: number, max: number, approxCount = 10): number[] {
  if (min === max) return [min];
  const range = Math.abs(max - min);
  const rough = range / Math.max(1, approxCount);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let step: number;
  if (norm < 1.5) step = pow;
  else if (norm < 3) step = 2 * pow;
  else if (norm < 7) step = 5 * pow;
  else step = 10 * pow;
  const start = Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) {
    out.push(Number(v.toFixed(12)));
  }
  return out;
}
