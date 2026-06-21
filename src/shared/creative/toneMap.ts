// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Vision — Dynamic Range Studio (HDR tone mapping)
 * -----------------------------------------------------------------------------
 * Compress high-dynamic-range linear values into the 0..1 display range with
 * filmic operators (Reinhard / ACES) plus an exposure control — so blown
 * highlights roll off instead of clipping. Pure math (operates on linear
 * values), so it is reusable + unit-testable; the Vinx color engine applies it
 * per pixel.
 */

export type ToneMapOperator = 'reinhard' | 'aces' | 'none';

export const TONE_MAP_OPERATORS: ToneMapOperator[] = ['none', 'reinhard', 'aces'];

export interface ToneMapSettings {
  enabled: boolean;
  operator: ToneMapOperator;
  /** Exposure in stops (EV); 0 = unchanged. */
  exposure: number;
}

/** Reinhard tone map: x / (1 + x). Maps [0,inf) -> [0,1), monotonic. */
export function reinhard(x: number): number {
  const v = x < 0 ? 0 : x;
  return v / (1 + v);
}

/** ACES filmic approximation (Narkowicz). Maps [0,inf) -> [0,1], clamped. */
export function acesFilmic(x: number): number {
  const v = x < 0 ? 0 : x;
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const out = (v * (a * v + b)) / (v * (c * v + d) + e);
  return out < 0 ? 0 : out > 1 ? 1 : out;
}

/** Apply an operator to a single linear value -> 0..1. */
export function toneMapValue(x: number, op: ToneMapOperator): number {
  switch (op) {
    case 'reinhard': return reinhard(x);
    case 'aces': return acesFilmic(x);
    default: return x < 0 ? 0 : x > 1 ? 1 : x;
  }
}

/**
 * Tone-map a linear RGB triplet with exposure. Inputs are linear (0..inf);
 * outputs are display-range linear (0..1).
 */
export function toneMapRgb(
  r: number, g: number, b: number, op: ToneMapOperator, exposureEV: number,
): [number, number, number] {
  const gain = Math.pow(2, exposureEV);
  return [toneMapValue(r * gain, op), toneMapValue(g * gain, op), toneMapValue(b * gain, op)];
}
