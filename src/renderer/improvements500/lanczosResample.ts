// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Lanczos resampling for 1D signals.
function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczosKernel(x: number, a: number): number {
  if (x <= -a || x >= a) return 0;
  return sinc(x) * sinc(x / a);
}

export function lanczosResample(
  input: ReadonlyArray<number> | Float32Array,
  outputLength: number,
  a = 3,
): Float32Array {
  const out = new Float32Array(outputLength);
  if (input.length === 0 || outputLength === 0) return out;
  const ratio = input.length / outputLength;
  for (let i = 0; i < outputLength; i++) {
    const center = (i + 0.5) * ratio - 0.5;
    const left = Math.floor(center) - a + 1;
    const right = Math.floor(center) + a;
    let sum = 0;
    let weight = 0;
    for (let j = left; j <= right; j++) {
      const k = lanczosKernel(center - j, a);
      const idx = j < 0 ? 0 : j >= input.length ? input.length - 1 : j;
      sum += input[idx] * k;
      weight += k;
    }
    out[i] = weight === 0 ? 0 : sum / weight;
  }
  return out;
}
