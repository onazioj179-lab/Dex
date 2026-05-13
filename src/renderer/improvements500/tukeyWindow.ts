// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tukey-window taper. Cosine-tapered rectangular window controlled by an
 * alpha parameter in [0, 1]: 0 -> rectangular, 1 -> Hann.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function tukeyWindow(n: number, alpha = 0.5): Float64Array {
  if (n < 1) return new Float64Array(0);
  const out = new Float64Array(n);
  if (n === 1) { out[0] = 1; return out; }
  if (alpha <= 0) { out.fill(1); return out; }
  if (alpha >= 1) {
    for (let i = 0; i < n; i++) out[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    return out;
  }
  const taperLen = Math.floor((alpha * (n - 1)) / 2);
  for (let i = 0; i < n; i++) {
    if (i < taperLen) {
      out[i] = 0.5 * (1 + Math.cos(Math.PI * (i / taperLen - 1)));
    } else if (i > n - 1 - taperLen) {
      out[i] = 0.5 * (1 + Math.cos(Math.PI * ((i - (n - 1 - taperLen)) / taperLen)));
    } else {
      out[i] = 1;
    }
  }
  return out;
}
