// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sample-rate conversion via simple linear resampling. Quality is poor
 * for large ratios; use only for UI/viz, not pristine audio export.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function linearResample(
  input: readonly number[] | Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate <= 0 || toRate <= 0) throw new RangeError('linearResample: rates must be positive');
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const hi = Math.min(input.length - 1, lo + 1);
    const t = idx - lo;
    out[i] = (1 - t) * input[lo]! + t * input[hi]!;
  }
  return out;
}
