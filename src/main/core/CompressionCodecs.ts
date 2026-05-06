// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Compression Codecs and Encoding
// ==========================================================================
// Technique 24: IPC Payload Compression
// Technique 50: Delta Encoding for State Sync
// Technique 51: LZ4 Pure-JS Compression
// Technique 52: RLE for Sparse Timeline Data
// Technique 56: Dictionary Compression for Repeated Strings
// ==========================================================================

import * as zlib from 'zlib';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 51: LZ4 Pure-JS Implementation
// ---------------------------------------------------------------------------

const LZ4_MIN_MATCH = 4;
const LZ4_HASH_LOG = 16;
const LZ4_HASH_SIZE = 1 << LZ4_HASH_LOG;

function lz4Hash(val: number): number {
  return ((val * 2654435761) >>> (32 - LZ4_HASH_LOG)) & (LZ4_HASH_SIZE - 1);
}

export function lz4Compress(input: Uint8Array): Uint8Array {
  const inLen = input.length;
  if (inLen === 0) return new Uint8Array(0);
  if (inLen < 13) {
    // Too small to compress, store literal
    const out = new Uint8Array(inLen + 1);
    out[0] = (inLen << 4) & 0xF0;
    out.set(input, 1);
    return out;
  }

  const hashTable = new Int32Array(LZ4_HASH_SIZE).fill(-1);
  const output: number[] = [];
  let anchor = 0;
  let pos = 0;

  while (pos < inLen - 5) {
    const seq = (input[pos] | (input[pos + 1] << 8) | (input[pos + 2] << 16) | (input[pos + 3] << 24)) >>> 0;
    const h = lz4Hash(seq);
    const ref = hashTable[h];
    hashTable[h] = pos;

    if (ref < 0 || pos - ref > 65535 ||
        input[ref] !== input[pos] || input[ref + 1] !== input[pos + 1] ||
        input[ref + 2] !== input[pos + 2] || input[ref + 3] !== input[pos + 3]) {
      pos++;
      continue;
    }

    // Match found
    let matchLen = LZ4_MIN_MATCH;
    while (pos + matchLen < inLen && input[ref + matchLen] === input[pos + matchLen]) matchLen++;

    const litLen = pos - anchor;
    const offset = pos - ref;

    // Token byte
    let token = 0;
    if (litLen >= 15) {
      token = 0xF0;
    } else {
      token = (litLen << 4) & 0xF0;
    }
    if (matchLen - LZ4_MIN_MATCH >= 15) {
      token |= 0x0F;
    } else {
      token |= (matchLen - LZ4_MIN_MATCH) & 0x0F;
    }
    output.push(token);

    // Extra literal length bytes
    if (litLen >= 15) {
      let remaining = litLen - 15;
      while (remaining >= 255) { output.push(255); remaining -= 255; }
      output.push(remaining);
    }

    // Literal bytes
    for (let i = anchor; i < pos; i++) output.push(input[i]);

    // Offset (little-endian 16-bit)
    output.push(offset & 0xFF);
    output.push((offset >>> 8) & 0xFF);

    // Extra match length bytes
    if (matchLen - LZ4_MIN_MATCH >= 15) {
      let remaining = matchLen - LZ4_MIN_MATCH - 15;
      while (remaining >= 255) { output.push(255); remaining -= 255; }
      output.push(remaining);
    }

    pos += matchLen;
    anchor = pos;
  }

  // Last literals
  const lastLitLen = inLen - anchor;
  if (lastLitLen > 0) {
    let token: number;
    if (lastLitLen >= 15) {
      token = 0xF0;
    } else {
      token = (lastLitLen << 4) & 0xF0;
    }
    output.push(token);
    if (lastLitLen >= 15) {
      let remaining = lastLitLen - 15;
      while (remaining >= 255) { output.push(255); remaining -= 255; }
      output.push(remaining);
    }
    for (let i = anchor; i < inLen; i++) output.push(input[i]);
  }

  return new Uint8Array(output);
}

export function lz4Decompress(input: Uint8Array, maxOutputSize: number = 16 * 1024 * 1024): Uint8Array {
  const inLen = input.length;
  if (inLen === 0) return new Uint8Array(0);

  const output: number[] = [];
  let pos = 0;

  while (pos < inLen) {
    if (output.length > maxOutputSize) break;

    const token = input[pos++];

    // Literal length
    let litLen = (token >>> 4) & 0x0F;
    if (litLen === 15) {
      let b: number;
      do { b = input[pos++]; litLen += b; } while (b === 255 && pos < inLen);
    }

    // Copy literals
    for (let i = 0; i < litLen && pos < inLen; i++) output.push(input[pos++]);

    if (pos >= inLen) break;

    // Offset
    const offset = input[pos] | (input[pos + 1] << 8);
    pos += 2;
    if (offset === 0) break;

    // Match length
    let matchLen = (token & 0x0F) + LZ4_MIN_MATCH;
    if ((token & 0x0F) === 15) {
      let b: number;
      do { b = input[pos++]; matchLen += b; } while (b === 255 && pos < inLen);
    }

    // Copy match
    const matchStart = output.length - offset;
    for (let i = 0; i < matchLen; i++) {
      output.push(output[matchStart + i]);
    }
  }

  return new Uint8Array(output);
}

// ---------------------------------------------------------------------------
// Technique 50: Delta Encoding for State Sync
// ---------------------------------------------------------------------------

export interface DeltaPatch {
  added: Record<string, unknown>;
  removed: string[];
  modified: Record<string, { from: unknown; to: unknown }>;
}

export function computeDelta(prev: Record<string, unknown>, next: Record<string, unknown>): DeltaPatch {
  const added: Record<string, unknown> = {};
  const removed: string[] = [];
  const modified: Record<string, { from: unknown; to: unknown }> = {};

  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));

  for (const key of nextKeys) {
    if (!prevKeys.has(key)) {
      added[key] = next[key];
    } else if (!deepEqual(prev[key], next[key])) {
      modified[key] = { from: prev[key], to: next[key] };
    }
  }
  for (const key of prevKeys) {
    if (!nextKeys.has(key)) removed.push(key);
  }

  return { added, removed, modified };
}

export function applyDelta(state: Record<string, unknown>, delta: DeltaPatch): Record<string, unknown> {
  const result = { ...state };

  for (const key of delta.removed) {
    delete result[key];
  }
  for (const [key, value] of Object.entries(delta.added)) {
    result[key] = value;
  }
  for (const [key, change] of Object.entries(delta.modified)) {
    result[key] = change.to;
  }

  return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!deepEqual(objA[k], objB[k])) return false;
  }
  return true;
}

// Numeric delta encoding for typed arrays
export function deltaEncode(values: Float64Array): Float64Array {
  if (values.length <= 1) return new Float64Array(values);
  const encoded = new Float64Array(values.length);
  encoded[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    encoded[i] = values[i] - values[i - 1];
  }
  return encoded;
}

export function deltaDecode(encoded: Float64Array): Float64Array {
  if (encoded.length <= 1) return new Float64Array(encoded);
  const decoded = new Float64Array(encoded.length);
  decoded[0] = encoded[0];
  for (let i = 1; i < encoded.length; i++) {
    decoded[i] = decoded[i - 1] + encoded[i];
  }
  return decoded;
}

// Integer delta encoding for timestamps
export function deltaEncodeInt32(values: Int32Array): Int32Array {
  if (values.length <= 1) return new Int32Array(values);
  const encoded = new Int32Array(values.length);
  encoded[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    encoded[i] = values[i] - values[i - 1];
  }
  return encoded;
}

export function deltaDecodeInt32(encoded: Int32Array): Int32Array {
  if (encoded.length <= 1) return new Int32Array(encoded);
  const decoded = new Int32Array(encoded.length);
  decoded[0] = encoded[0];
  for (let i = 1; i < encoded.length; i++) {
    decoded[i] = decoded[i - 1] + encoded[i];
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Technique 52: Run-Length Encoding for Sparse Timeline Data
// ---------------------------------------------------------------------------

export interface RLERun<T> {
  value: T;
  count: number;
}

export function rleEncode<T>(data: T[]): RLERun<T>[] {
  if (data.length === 0) return [];
  const runs: RLERun<T>[] = [];
  let current = data[0];
  let count = 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i] === current) {
      count++;
    } else {
      runs.push({ value: current, count });
      current = data[i];
      count = 1;
    }
  }
  runs.push({ value: current, count });
  return runs;
}

export function rleDecode<T>(runs: RLERun<T>[]): T[] {
  const result: T[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) result.push(run.value);
  }
  return result;
}

// Typed array RLE for Int32
export function rleEncodeInt32(data: Int32Array): { values: Int32Array; counts: Int32Array } {
  if (data.length === 0) return { values: new Int32Array(0), counts: new Int32Array(0) };
  const values: number[] = [];
  const counts: number[] = [];
  let current = data[0];
  let count = 1;
  for (let i = 1; i < data.length; i++) {
    if (data[i] === current) {
      count++;
    } else {
      values.push(current);
      counts.push(count);
      current = data[i];
      count = 1;
    }
  }
  values.push(current);
  counts.push(count);
  return { values: new Int32Array(values), counts: new Int32Array(counts) };
}

export function rleDecodeInt32(values: Int32Array, counts: Int32Array): Int32Array {
  let totalLen = 0;
  for (let i = 0; i < counts.length; i++) totalLen += counts[i];
  const result = new Int32Array(totalLen);
  let pos = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const c = counts[i];
    for (let j = 0; j < c; j++) result[pos++] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Technique 24: IPC Payload Compression
// ---------------------------------------------------------------------------

const IPC_COMPRESS_THRESHOLD = 10240; // 10 KB threshold

export function compressIPCPayload(payload: Buffer | Uint8Array): { data: Buffer; compressed: boolean } {
  if (payload.length < IPC_COMPRESS_THRESHOLD) {
    return { data: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), compressed: false };
  }
  try {
    const compressed = zlib.deflateRawSync(payload, { level: 1 }); // Fast compression
    if (compressed.length < payload.length * 0.9) {
      return { data: compressed, compressed: true };
    }
    return { data: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), compressed: false };
  } catch {
    return { data: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), compressed: false };
  }
}

export function decompressIPCPayload(data: Buffer, compressed: boolean): Buffer {
  if (!compressed) return data;
  try {
    return zlib.inflateRawSync(data);
  } catch {
    return data;
  }
}

// Async versions for large payloads
export function compressIPCPayloadAsync(payload: Buffer | Uint8Array): Promise<{ data: Buffer; compressed: boolean }> {
  return new Promise((resolve) => {
    if (payload.length < IPC_COMPRESS_THRESHOLD) {
      resolve({ data: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), compressed: false });
      return;
    }
    zlib.deflateRaw(payload, { level: 1 }, (err, result) => {
      if (err || result.length >= payload.length * 0.9) {
        resolve({ data: Buffer.isBuffer(payload) ? payload : Buffer.from(payload), compressed: false });
      } else {
        resolve({ data: result, compressed: true });
      }
    });
  });
}

export function decompressIPCPayloadAsync(data: Buffer, compressed: boolean): Promise<Buffer> {
  return new Promise((resolve) => {
    if (!compressed) { resolve(data); return; }
    zlib.inflateRaw(data, (err, result) => {
      resolve(err ? data : result);
    });
  });
}

// ---------------------------------------------------------------------------
// Technique 56: Dictionary Compression for Repeated Strings
// ---------------------------------------------------------------------------

export class DictionaryCompressor {
  private dictionary: Map<string, number> = new Map();
  private reverseDictionary: Map<number, string> = new Map();
  private nextId = 1;

  encode(value: string): number {
    const existing = this.dictionary.get(value);
    if (existing !== undefined) return existing;
    const id = this.nextId++;
    this.dictionary.set(value, id);
    this.reverseDictionary.set(id, value);
    return id;
  }

  decode(id: number): string | undefined {
    return this.reverseDictionary.get(id);
  }

  encodeArray(values: string[]): Int32Array {
    const result = new Int32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      result[i] = this.encode(values[i]);
    }
    return result;
  }

  decodeArray(ids: Int32Array): string[] {
    const result: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      result.push(this.reverseDictionary.get(ids[i]) || '');
    }
    return result;
  }

  get size(): number { return this.dictionary.size; }

  // Serialize dictionary for persistence
  serialize(): string {
    const entries: Array<[string, number]> = [];
    for (const [key, val] of this.dictionary) entries.push([key, val]);
    return JSON.stringify(entries);
  }

  deserialize(data: string): void {
    try {
      const entries = JSON.parse(data) as Array<[string, number]>;
      this.dictionary.clear();
      this.reverseDictionary.clear();
      let maxId = 0;
      for (const [key, val] of entries) {
        this.dictionary.set(key, val);
        this.reverseDictionary.set(val, key);
        if (val > maxId) maxId = val;
      }
      this.nextId = maxId + 1;
    } catch { /* ignore malformed data */ }
  }
}

// Pre-built compressors for common domains
export const eventTypeDictionary = new DictionaryCompressor();
export const appNameDictionary = new DictionaryCompressor();
export const filePathDictionary = new DictionaryCompressor();
export const logSourceDictionary = new DictionaryCompressor();

// Pre-encode common values
const COMMON_EVENT_TYPES = [
  'app-ready', 'app-focus', 'app-blur', 'app-closed', 'app-switched',
  'file-created', 'file-modified', 'file-deleted', 'file-renamed',
  'task-created', 'task-completed', 'task-deleted',
  'focus-session-start', 'focus-session-end', 'idle-start', 'idle-end',
  'rewind-snapshot', 'plugin-loaded', 'plugin-unloaded',
  'system-warning', 'system-error', 'performance-violation',
];
const COMMON_APP_NAMES = [
  'imosion', 'forge', 'vinx', 'rewind', 'flux', 'prism',
  'calculator', 'calendar', 'kanban', 'notes', 'tasks',
  'password-generator', 'files', 'settings', 'achievements',
];

for (const t of COMMON_EVENT_TYPES) eventTypeDictionary.encode(t);
for (const a of COMMON_APP_NAMES) appNameDictionary.encode(a);

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializeCompressionCodecs(): void {
  log.info('[CompressionCodecs] Techniques 24, 50-52, 56: Compression codecs initialized');
}

export function shutdownCompressionCodecs(): void {
  // Stateless - nothing to clean up
}
