// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unsharp mask sharpen filter. Subtracts a blurred copy from the original
 * and adds the difference back scaled by amount.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
import { boxBlur } from './boxBlur';

export function unsharpMask(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius = 1,
  amount = 1,
): Uint8ClampedArray {
  const blurred = boxBlur(src, width, height, radius);
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < src.length; i++) {
    const sharpened = src[i]! + amount * (src[i]! - blurred[i]!);
    out[i] = Math.min(255, Math.max(0, sharpened));
  }
  return out;
}
