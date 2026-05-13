// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// basE91 - more efficient binary-to-text than Base85.
// Reference: http://base91.sourceforge.net/
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

const DECODE_TABLE = new Int16Array(256).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) DECODE_TABLE[ALPHABET.charCodeAt(i)] = i;

export function base91Encode(data: Uint8Array): string {
  let b = 0;
  let n = 0;
  let out = '';
  for (let i = 0; i < data.length; i++) {
    b |= data[i] << n;
    n += 8;
    if (n > 13) {
      let v = b & 8191;
      if (v > 88) {
        b >>= 13;
        n -= 13;
      } else {
        v = b & 16383;
        b >>= 14;
        n -= 14;
      }
      out += ALPHABET[v % 91] + ALPHABET[Math.floor(v / 91)];
    }
  }
  if (n > 0) {
    out += ALPHABET[b % 91];
    if (n > 7 || b > 90) out += ALPHABET[Math.floor(b / 91)];
  }
  return out;
}

export function base91Decode(s: string): Uint8Array {
  let b = 0;
  let n = 0;
  let v = -1;
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = DECODE_TABLE[s.charCodeAt(i)];
    if (c < 0) continue;
    if (v < 0) {
      v = c;
    } else {
      v += c * 91;
      b |= v << n;
      n += (v & 8191) > 88 ? 13 : 14;
      do {
        out.push(b & 0xff);
        b >>= 8;
        n -= 8;
      } while (n > 7);
      v = -1;
    }
  }
  if (v >= 0) out.push((b | (v << n)) & 0xff);
  return new Uint8Array(out);
}
