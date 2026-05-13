/*
 * DEX - CRC-32 (IEEE 802.3 / ISO 3309) for renderer (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 *
 * Note: The native module ships its own CRC32 for main-process use; this
 * is the renderer-side pure-JS implementation, exported via the barrel.
 */

const TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** Compute CRC-32 of bytes or UTF-8 string. */
export function crc32(input: string | Uint8Array, seed = 0): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let c = (~seed) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (~c) >>> 0;
}

/** Hex-encoded zero-padded CRC-32 (8 chars, lowercase). */
export function crc32Hex(input: string | Uint8Array): string {
  return crc32(input).toString(16).padStart(8, '0');
}
