// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Minimal LZSS-style sliding window compressor with fixed window/lookahead sizes.
// Output format: stream of tokens. Token starts with a flag byte; bits indicate
// whether each of the following 8 items is a literal (1) or a (offset,len) match (0).

const WINDOW = 4096;
const MIN_MATCH = 3;
const MAX_MATCH = 18;

export function lzssCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  while (pos < input.length) {
    const flagIdx = out.length;
    out.push(0);
    let flag = 0;
    for (let bit = 0; bit < 8 && pos < input.length; bit++) {
      const start = Math.max(0, pos - WINDOW);
      let bestLen = 0;
      let bestOff = 0;
      const maxLen = Math.min(MAX_MATCH, input.length - pos);
      for (let i = start; i < pos; i++) {
        let l = 0;
        while (l < maxLen && input[i + l] === input[pos + l]) l++;
        if (l > bestLen) {
          bestLen = l;
          bestOff = pos - i;
          if (l === maxLen) break;
        }
      }
      if (bestLen >= MIN_MATCH) {
        const lenCode = bestLen - MIN_MATCH;
        out.push(((bestOff >> 4) & 0xff) | 0x00);
        out.push(((bestOff & 0x0f) << 4) | (lenCode & 0x0f));
        pos += bestLen;
      } else {
        flag |= 1 << bit;
        out.push(input[pos]);
        pos++;
      }
    }
    out[flagIdx] = flag;
  }
  return new Uint8Array(out);
}

export function lzssDecompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  while (pos < input.length) {
    const flag = input[pos++];
    for (let bit = 0; bit < 8 && pos < input.length; bit++) {
      if (flag & (1 << bit)) {
        out.push(input[pos++]);
      } else {
        if (pos + 1 >= input.length) break;
        const hi = input[pos++];
        const lo = input[pos++];
        const off = (hi << 4) | (lo >> 4);
        const len = (lo & 0x0f) + MIN_MATCH;
        const start = out.length - off;
        for (let i = 0; i < len; i++) out.push(out[start + i]);
      }
    }
  }
  return new Uint8Array(out);
}
