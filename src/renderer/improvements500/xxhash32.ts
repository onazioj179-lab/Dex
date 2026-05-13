/*
 * DEX - xxHash32 non-cryptographic hash (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 *
 * Reference: https://github.com/Cyan4973/xxHash xxHash32 spec.
 */

const PRIME1 = 2654435761;
const PRIME2 = 2246822519;
const PRIME3 = 3266489917;
const PRIME4 = 668265263;
const PRIME5 = 374761393;

function rotl32(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function mul32(a: number, b: number): number {
  return Math.imul(a, b) >>> 0;
}

/** xxHash32 of bytes or UTF-8 string with optional 32-bit seed. */
export function xxhash32(input: string | Uint8Array, seed = 0): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const len = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let h32: number;
  let i = 0;

  if (len >= 16) {
    let v1 = (seed + PRIME1 + PRIME2) >>> 0;
    let v2 = (seed + PRIME2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - PRIME1) >>> 0;
    const limit = len - 16;
    while (i <= limit) {
      v1 = mul32(rotl32((v1 + mul32(view.getUint32(i, true), PRIME2)) >>> 0, 13), PRIME1);
      v2 = mul32(rotl32((v2 + mul32(view.getUint32(i + 4, true), PRIME2)) >>> 0, 13), PRIME1);
      v3 = mul32(rotl32((v3 + mul32(view.getUint32(i + 8, true), PRIME2)) >>> 0, 13), PRIME1);
      v4 = mul32(rotl32((v4 + mul32(view.getUint32(i + 12, true), PRIME2)) >>> 0, 13), PRIME1);
      i += 16;
    }
    h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
  } else {
    h32 = (seed + PRIME5) >>> 0;
  }

  h32 = (h32 + len) >>> 0;

  while (i + 4 <= len) {
    h32 = mul32(rotl32((h32 + mul32(view.getUint32(i, true), PRIME3)) >>> 0, 17), PRIME4);
    i += 4;
  }
  while (i < len) {
    h32 = mul32(rotl32((h32 + mul32(bytes[i]!, PRIME5)) >>> 0, 11), PRIME1);
    i += 1;
  }

  h32 = mul32(h32 ^ (h32 >>> 15), PRIME2);
  h32 = mul32(h32 ^ (h32 >>> 13), PRIME3);
  h32 = (h32 ^ (h32 >>> 16)) >>> 0;
  return h32;
}

/** Hex-encoded zero-padded xxHash32 (8 chars). */
export function xxhash32Hex(input: string | Uint8Array, seed = 0): string {
  return xxhash32(input, seed).toString(16).padStart(8, '0');
}
