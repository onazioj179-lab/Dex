// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Run-length encoder/decoder over a Uint8Array. Encoded format
 * uses (count, byte) pairs. Counts are split into chunks of 255.
 */

export function rleEncode(input: Uint8Array): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const b = input[i]!;
    let run = 1;
    while (i + run < input.length && input[i + run] === b && run < 255) run += 1;
    out.push(run, b);
    i += run;
  }
  return new Uint8Array(out);
}

export function rleDecode(encoded: Uint8Array): Uint8Array {
  if (encoded.length % 2 !== 0) throw new Error('rleDecode: encoded length must be even');
  let total = 0;
  for (let i = 0; i < encoded.length; i += 2) total += encoded[i]!;
  const out = new Uint8Array(total);
  let pos = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const run = encoded[i]!;
    const b = encoded[i + 1]!;
    for (let j = 0; j < run; j += 1) out[pos++] = b;
  }
  return out;
}
