// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Order-0 binary arithmetic coder. Encodes a Uint8Array with a static frequency
// table built from the input. Suitable for educational use / small payloads.

interface Model {
  cum: Uint32Array; // length 257; cum[256] = total
}

function buildModel(data: Uint8Array): Model {
  const freq = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) freq[data[i]]++;
  for (let i = 0; i < 256; i++) if (freq[i] === 0) freq[i] = 1;
  const cum = new Uint32Array(257);
  for (let i = 0; i < 256; i++) cum[i + 1] = cum[i] + freq[i];
  return { cum };
}

const TOP = 0xffffffff >>> 0;

export interface ArithmeticEncoded {
  bytes: Uint8Array;
  freq: Uint32Array; // length 256, raw frequencies
  length: number;
}

export function arithmeticEncode(data: Uint8Array): ArithmeticEncoded {
  const freq = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) freq[data[i]]++;
  const adjusted = freq.slice();
  for (let i = 0; i < 256; i++) if (adjusted[i] === 0) adjusted[i] = 1;
  const cum = new Uint32Array(257);
  for (let i = 0; i < 256; i++) cum[i + 1] = cum[i] + adjusted[i];
  const total = cum[256];
  let low = 0;
  let high = TOP;
  const out: number[] = [];
  let pendingBits = 0;
  let buffer = 0;
  let bufferBits = 0;
  const writeBit = (b: number): void => {
    buffer = (buffer << 1) | b;
    bufferBits++;
    if (bufferBits === 8) {
      out.push(buffer & 0xff);
      buffer = 0;
      bufferBits = 0;
    }
  };
  const writeWithPending = (b: number): void => {
    writeBit(b);
    for (let i = 0; i < pendingBits; i++) writeBit(b ^ 1);
    pendingBits = 0;
  };
  for (let i = 0; i < data.length; i++) {
    const sym = data[i];
    const range = high - low + 1;
    high = (low + Math.floor((range * cum[sym + 1]) / total) - 1) >>> 0;
    low = (low + Math.floor((range * cum[sym]) / total)) >>> 0;
    while (true) {
      if (high < 0x80000000) {
        writeWithPending(0);
      } else if (low >= 0x80000000) {
        writeWithPending(1);
        low = (low - 0x80000000) >>> 0;
        high = (high - 0x80000000) >>> 0;
      } else if (low >= 0x40000000 && high < 0xc0000000) {
        pendingBits++;
        low = (low - 0x40000000) >>> 0;
        high = (high - 0x40000000) >>> 0;
      } else break;
      low = (low << 1) >>> 0;
      high = (((high << 1) >>> 0) | 1) >>> 0;
    }
  }
  pendingBits++;
  if (low < 0x40000000) writeWithPending(0);
  else writeWithPending(1);
  while (bufferBits > 0) writeBit(0);
  return { bytes: new Uint8Array(out), freq, length: data.length };
}

export function arithmeticDecode(encoded: ArithmeticEncoded): Uint8Array {
  const adjusted = encoded.freq.slice();
  for (let i = 0; i < 256; i++) if (adjusted[i] === 0) adjusted[i] = 1;
  const cum = new Uint32Array(257);
  for (let i = 0; i < 256; i++) cum[i + 1] = cum[i] + adjusted[i];
  const total = cum[256];
  let low = 0;
  let high = TOP;
  let value = 0;
  let bytePos = 0;
  let bitPos = 0;
  const readBit = (): number => {
    if (bytePos >= encoded.bytes.length) return 0;
    const b = (encoded.bytes[bytePos] >> (7 - bitPos)) & 1;
    bitPos++;
    if (bitPos === 8) {
      bitPos = 0;
      bytePos++;
    }
    return b;
  };
  for (let i = 0; i < 32; i++) value = ((value << 1) | readBit()) >>> 0;
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    const range = high - low + 1;
    const target = Math.floor(((value - low + 1) * total - 1) / range);
    let sym = 0;
    let lo = 0;
    let hi = 256;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1] <= target) lo = mid + 1;
      else hi = mid;
    }
    sym = lo;
    out[i] = sym;
    high = (low + Math.floor((range * cum[sym + 1]) / total) - 1) >>> 0;
    low = (low + Math.floor((range * cum[sym]) / total)) >>> 0;
    while (true) {
      if (high < 0x80000000) {
        // do nothing
      } else if (low >= 0x80000000) {
        value = (value - 0x80000000) >>> 0;
        low = (low - 0x80000000) >>> 0;
        high = (high - 0x80000000) >>> 0;
      } else if (low >= 0x40000000 && high < 0xc0000000) {
        value = (value - 0x40000000) >>> 0;
        low = (low - 0x40000000) >>> 0;
        high = (high - 0x40000000) >>> 0;
      } else break;
      low = (low << 1) >>> 0;
      high = (((high << 1) >>> 0) | 1) >>> 0;
      value = (((value << 1) >>> 0) | readBit()) >>> 0;
    }
  }
  return out;
}
