// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Ascii85/Base85 (Adobe variant) encoding.
const ASCII85_OFFSET = 33; // '!'

export function base85Encode(data: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  while (i + 4 <= data.length) {
    let n =
      (data[i] * 0x1000000 + (data[i + 1] << 16) + (data[i + 2] << 8) + data[i + 3]) >>> 0;
    if (n === 0) {
      out.push('z');
    } else {
      const c = new Array<number>(5);
      for (let k = 4; k >= 0; k--) {
        c[k] = (n % 85) + ASCII85_OFFSET;
        n = Math.floor(n / 85);
      }
      out.push(String.fromCharCode(...c));
    }
    i += 4;
  }
  const rem = data.length - i;
  if (rem > 0) {
    const padded = new Uint8Array(4);
    for (let k = 0; k < rem; k++) padded[k] = data[i + k];
    let n = (padded[0] * 0x1000000 + (padded[1] << 16) + (padded[2] << 8) + padded[3]) >>> 0;
    const c = new Array<number>(5);
    for (let k = 4; k >= 0; k--) {
      c[k] = (n % 85) + ASCII85_OFFSET;
      n = Math.floor(n / 85);
    }
    out.push(String.fromCharCode(...c.slice(0, rem + 1)));
  }
  return out.join('');
}

export function base85Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  let buf: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'z' && buf.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    buf.push(s.charCodeAt(i) - ASCII85_OFFSET);
    if (buf.length === 5) {
      let n = 0;
      for (let k = 0; k < 5; k++) n = n * 85 + buf[k];
      bytes.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
      buf = [];
    }
  }
  if (buf.length > 0) {
    const rem = buf.length;
    while (buf.length < 5) buf.push(84);
    let n = 0;
    for (let k = 0; k < 5; k++) n = n * 85 + buf[k];
    const decoded = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    for (let k = 0; k < rem - 1; k++) bytes.push(decoded[k]);
  }
  return new Uint8Array(bytes);
}
