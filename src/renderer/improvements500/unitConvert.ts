// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Common unit conversions for layout, time, and storage. Pure deterministic
 * functions; no I/O. CSS pixel base assumes the standard 96 dpi reference.
 */

const PX_PER_IN = 96;
const PX_PER_CM = PX_PER_IN / 2.54;
const PX_PER_MM = PX_PER_CM / 10;
const PX_PER_PT = PX_PER_IN / 72;

export type LengthUnit = 'px' | 'in' | 'cm' | 'mm' | 'pt';

export function lengthToPx(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'px': return value;
    case 'in': return value * PX_PER_IN;
    case 'cm': return value * PX_PER_CM;
    case 'mm': return value * PX_PER_MM;
    case 'pt': return value * PX_PER_PT;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function pxToLength(px: number, unit: LengthUnit): number {
  switch (unit) {
    case 'px': return px;
    case 'in': return px / PX_PER_IN;
    case 'cm': return px / PX_PER_CM;
    case 'mm': return px / PX_PER_MM;
    case 'pt': return px / PX_PER_PT;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export type TimeUnit = 'ms' | 's' | 'm' | 'h' | 'd';

export function timeToMs(value: number, unit: TimeUnit): number {
  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60_000;
    case 'h': return value * 3_600_000;
    case 'd': return value * 86_400_000;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB';
const POW: Record<ByteUnit, number> = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };

export function bytesTo(value: number, unit: ByteUnit, base: 1000 | 1024 = 1024): number {
  return value / Math.pow(base, POW[unit]);
}

export function toBytes(value: number, unit: ByteUnit, base: 1000 | 1024 = 1024): number {
  return value * Math.pow(base, POW[unit]);
}
