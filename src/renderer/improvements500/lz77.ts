// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LZ77 sliding-window compression. Output triples (offset, length,
 * nextByte). Lossless and self-contained; uses a default 4 KiB
 * window with 18-byte max match.
 */

export interface Lz77Token {
  offset: number;
  length: number;
  /** Next literal byte to emit after the match, or -1 if end-of-stream. */
  next: number;
}

const WINDOW = 4096;
const MAX_MATCH = 18;

export function lz77Encode(input: Uint8Array): Lz77Token[] {
  const out: Lz77Token[] = [];
  let pos = 0;
  while (pos < input.length) {
    let bestLen = 0;
    let bestOff = 0;
    const start = Math.max(0, pos - WINDOW);
    for (let candidate = start; candidate < pos; candidate += 1) {
      let len = 0;
      while (
        len < MAX_MATCH &&
        pos + len < input.length &&
        input[candidate + len] === input[pos + len]
      ) {
        len += 1;
      }
      if (len > bestLen) {
        bestLen = len;
        bestOff = pos - candidate;
        if (len === MAX_MATCH) break;
      }
    }
    if (pos + bestLen < input.length) {
      out.push({ offset: bestOff, length: bestLen, next: input[pos + bestLen]! });
      pos += bestLen + 1;
    } else {
      out.push({ offset: bestOff, length: bestLen, next: -1 });
      pos += bestLen;
    }
  }
  return out;
}

export function lz77Decode(tokens: ReadonlyArray<Lz77Token>): Uint8Array {
  const buf: number[] = [];
  for (const t of tokens) {
    const start = buf.length - t.offset;
    for (let i = 0; i < t.length; i += 1) buf.push(buf[start + i]!);
    if (t.next >= 0) buf.push(t.next);
  }
  return Uint8Array.from(buf);
}
