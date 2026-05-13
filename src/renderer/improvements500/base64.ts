// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Base64 + URL-safe base64 helpers that work in renderer and tests
 * without depending on Node Buffer or DOM atob/btoa parameter quirks.
 */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeWithAlpha(bytes: Uint8Array, alpha: string, pad: boolean): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += alpha[a >> 2] + alpha[((a & 3) << 4) | (b >> 4)] + alpha[((b & 15) << 2) | (c >> 6)] + alpha[c & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const a = bytes[i];
    out += alpha[a >> 2] + alpha[(a & 3) << 4];
    if (pad) out += '==';
  } else if (rem === 2) {
    const a = bytes[i], b = bytes[i + 1];
    out += alpha[a >> 2] + alpha[((a & 3) << 4) | (b >> 4)] + alpha[(b & 15) << 2];
    if (pad) out += '=';
  }
  return out;
}

function decodeWithAlpha(input: string, alpha: string): Uint8Array {
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < alpha.length; i++) lookup[alpha.charCodeAt(i)] = i;
  // Strip padding and any whitespace.
  const clean = input.replace(/[=\s]+$/, '').replace(/\s+/g, '');
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = lookup[clean.charCodeAt(i)];
    if (v < 0) throw new Error(`base64: invalid char at ${i}`);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function encodeBase64(bytes: Uint8Array): string { return encodeWithAlpha(bytes, ALPHA, true); }
export function decodeBase64(s: string): Uint8Array { return decodeWithAlpha(s, ALPHA); }
export function encodeBase64Url(bytes: Uint8Array): string { return encodeWithAlpha(bytes, URL_ALPHA, false); }
export function decodeBase64Url(s: string): Uint8Array { return decodeWithAlpha(s, URL_ALPHA); }

export function utf8Encode(s: string): Uint8Array { return new TextEncoder().encode(s); }
export function utf8Decode(b: Uint8Array): string { return new TextDecoder().decode(b); }
