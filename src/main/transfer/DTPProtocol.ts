// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Transfer Protocol (DTP) -- Binary Protocol Definition
 * Custom high-throughput binary protocol for maximum-speed file transfers.
 * Runs on raw TCP sockets with no HTTP overhead.
 *
 * Frame format (big-endian):
 *   Bytes 0-1:  Frame type (uint16)
 *   Bytes 2-5:  Sequence number (uint32)
 *   Bytes 6-9:  Payload length (uint32)
 *   Bytes 10+:  Payload (variable)
 */

// Frame types
export const DTP_FRAME = {
  HANDSHAKE:        0x0001,
  FILE_MANIFEST:    0x0002,
  FILE_CHUNK:       0x0003,
  CHUNK_ACK:        0x0004,
  TRANSFER_COMPLETE:0x0005,
  ERROR:            0x0006,
  PAUSE:            0x0007,
  RESUME:           0x0008,
  CANCEL:           0x0009,
  BANDWIDTH_TEST:   0x000A,
  BANDWIDTH_RESULT: 0x000B,
  BLOCK_HASH:       0x000C,
  BLOCK_RESEND:     0x000D,
  DEVICE_INFO:      0x000E,
  PING:             0x000F,
  PONG:             0x0010,
} as const;

export type DTPFrameType = typeof DTP_FRAME[keyof typeof DTP_FRAME];

export const DTP_HEADER_SIZE = 10;
export const DTP_PORT = 58432;
export const DTP_SERVICE_TYPE = '_dex-transfer._tcp';
export const DTP_MAGIC = Buffer.from([0x44, 0x54, 0x50, 0x31]); // "DTP1"

// Adaptive chunk sizes based on throughput
export const CHUNK_SIZE_INITIAL  = 256 * 1024;       // 256 KB
export const CHUNK_SIZE_MEDIUM   = 4 * 1024 * 1024;  // 4 MB (>100 MB/s)
export const CHUNK_SIZE_LARGE    = 16 * 1024 * 1024;  // 16 MB (>500 MB/s)
export const BLOCK_HASH_SIZE     = 64 * 1024 * 1024;  // 64 MB blocks for BLAKE3

// Stream count based on bandwidth
export const STREAMS_SLOW   = 2;   // <100 Mbps
export const STREAMS_MEDIUM = 4;   // 100 Mbps - 1 Gbps
export const STREAMS_FAST   = 8;   // 1-10 Gbps
export const STREAMS_ULTRA  = 16;  // >10 Gbps

// Socket buffer sizes
export const SOCKET_SEND_BUFFER  = 16 * 1024 * 1024;  // 16 MB
export const SOCKET_RECV_BUFFER  = 16 * 1024 * 1024;  // 16 MB

// Transfer settings
export const BANDWIDTH_TEST_SIZE = 32 * 1024 * 1024;   // 32 MB
export const BANDWIDTH_TEST_DURATION_MS = 5000;
export const RESUME_SAVE_INTERVAL_MS = 5000;
export const PROGRESS_UPDATE_INTERVAL_MS = 100;
export const MAX_CONCURRENT_TRANSFERS = 4;
export const MAX_STREAMS_PER_TRANSFER = 16;

// Compressed format detection
export const COMPRESSED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif',
  '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm',
  '.mp3', '.aac', '.ogg', '.flac', '.m4a', '.wma',
  '.zip', '.rar', '.7z', '.gz', '.bz2', '.xz', '.zst', '.tar.gz', '.tgz',
  '.heic', '.heif', '.dng',
  '.pdf', '.docx', '.xlsx', '.pptx',
]);

export interface DTPFrame {
  type: DTPFrameType;
  sequence: number;
  payloadLength: number;
  payload: Buffer;
}

/**
 * Encode a DTP frame into a buffer for transmission.
 */
export function encodeFrame(type: DTPFrameType, sequence: number, payload: Buffer): Buffer {
  const frame = Buffer.allocUnsafe(DTP_HEADER_SIZE + payload.length);
  frame.writeUInt16BE(type, 0);
  frame.writeUInt32BE(sequence, 2);
  frame.writeUInt32BE(payload.length, 6);
  payload.copy(frame, DTP_HEADER_SIZE);
  return frame;
}

/**
 * Decode a DTP frame header from a buffer.
 * Returns null if buffer is too small.
 */
export function decodeFrameHeader(buffer: Buffer): { type: DTPFrameType; sequence: number; payloadLength: number } | null {
  if (buffer.length < DTP_HEADER_SIZE) return null;
  return {
    type: buffer.readUInt16BE(0) as DTPFrameType,
    sequence: buffer.readUInt32BE(2),
    payloadLength: buffer.readUInt32BE(6),
  };
}

/**
 * Handshake payload structure (binary-encoded).
 */
export interface HandshakePayload {
  magic: Buffer;          // 4 bytes: DTP1
  version: number;        // uint8: protocol version
  deviceId: string;       // Device identifier
  deviceName: string;     // Human-readable name
  deviceType: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  sessionToken: string;   // Auth token
  dhPublicKey: Buffer;    // Diffie-Hellman public key for encryption
}

export function encodeHandshake(hs: HandshakePayload): Buffer {
  const deviceIdBuf = Buffer.from(hs.deviceId, 'utf8');
  const deviceNameBuf = Buffer.from(hs.deviceName, 'utf8');
  const deviceTypeBuf = Buffer.from(hs.deviceType, 'utf8');
  const tokenBuf = Buffer.from(hs.sessionToken, 'utf8');

  // Layout: magic(4) + version(1) + deviceIdLen(2) + deviceId + deviceNameLen(2) + deviceName
  //         + deviceTypeLen(1) + deviceType + tokenLen(2) + token + dhKeyLen(2) + dhKey
  const totalLen = 4 + 1 + 2 + deviceIdBuf.length + 2 + deviceNameBuf.length
    + 1 + deviceTypeBuf.length + 2 + tokenBuf.length + 2 + hs.dhPublicKey.length;

  const buf = Buffer.allocUnsafe(totalLen);
  let offset = 0;

  DTP_MAGIC.copy(buf, offset); offset += 4;
  buf.writeUInt8(1, offset); offset += 1; // version 1

  buf.writeUInt16BE(deviceIdBuf.length, offset); offset += 2;
  deviceIdBuf.copy(buf, offset); offset += deviceIdBuf.length;

  buf.writeUInt16BE(deviceNameBuf.length, offset); offset += 2;
  deviceNameBuf.copy(buf, offset); offset += deviceNameBuf.length;

  buf.writeUInt8(deviceTypeBuf.length, offset); offset += 1;
  deviceTypeBuf.copy(buf, offset); offset += deviceTypeBuf.length;

  buf.writeUInt16BE(tokenBuf.length, offset); offset += 2;
  tokenBuf.copy(buf, offset); offset += tokenBuf.length;

  buf.writeUInt16BE(hs.dhPublicKey.length, offset); offset += 2;
  hs.dhPublicKey.copy(buf, offset);

  return buf;
}

export function decodeHandshake(buf: Buffer): HandshakePayload | null {
  try {
    let offset = 0;

    const magic = buf.subarray(offset, offset + 4); offset += 4;
    if (!magic.equals(DTP_MAGIC)) return null;

    const version = buf.readUInt8(offset); offset += 1;
    if (version !== 1) return null;

    const deviceIdLen = buf.readUInt16BE(offset); offset += 2;
    const deviceId = buf.subarray(offset, offset + deviceIdLen).toString('utf8'); offset += deviceIdLen;

    const deviceNameLen = buf.readUInt16BE(offset); offset += 2;
    const deviceName = buf.subarray(offset, offset + deviceNameLen).toString('utf8'); offset += deviceNameLen;

    const deviceTypeLen = buf.readUInt8(offset); offset += 1;
    const deviceType = buf.subarray(offset, offset + deviceTypeLen).toString('utf8') as HandshakePayload['deviceType'];
    offset += deviceTypeLen;

    const tokenLen = buf.readUInt16BE(offset); offset += 2;
    const sessionToken = buf.subarray(offset, offset + tokenLen).toString('utf8'); offset += tokenLen;

    const dhKeyLen = buf.readUInt16BE(offset); offset += 2;
    const dhPublicKey = Buffer.from(buf.subarray(offset, offset + dhKeyLen));

    return { magic, version, deviceId, deviceName, deviceType, sessionToken, dhPublicKey };
  } catch {
    return null;
  }
}

/**
 * File manifest entry for folder transfers.
 */
export interface ManifestEntry {
  relativePath: string;
  sizeBytes: number;
  modifiedAt: number;
  hash?: string;           // BLAKE3 hash for files < 10MB
  isDirectory: boolean;
}

/**
 * Encode a file manifest into a binary buffer.
 */
export function encodeManifest(entries: ManifestEntry[]): Buffer {
  const parts: Buffer[] = [];
  // Entry count
  const countBuf = Buffer.allocUnsafe(4);
  countBuf.writeUInt32BE(entries.length, 0);
  parts.push(countBuf);

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.relativePath, 'utf8');
    const hashBuf = entry.hash ? Buffer.from(entry.hash, 'utf8') : Buffer.alloc(0);

    // pathLen(2) + path + size(8) + modifiedAt(8) + hashLen(2) + hash + isDir(1)
    const entryBuf = Buffer.allocUnsafe(2 + pathBuf.length + 8 + 8 + 2 + hashBuf.length + 1);
    let off = 0;

    entryBuf.writeUInt16BE(pathBuf.length, off); off += 2;
    pathBuf.copy(entryBuf, off); off += pathBuf.length;

    // Write size as two uint32 (high + low) for >4GB file support
    const high = Math.floor(entry.sizeBytes / 0x100000000);
    const low = entry.sizeBytes >>> 0;
    entryBuf.writeUInt32BE(high, off); off += 4;
    entryBuf.writeUInt32BE(low, off); off += 4;

    entryBuf.writeUInt32BE(Math.floor(entry.modifiedAt / 0x100000000), off); off += 4;
    entryBuf.writeUInt32BE(entry.modifiedAt >>> 0, off); off += 4;

    entryBuf.writeUInt16BE(hashBuf.length, off); off += 2;
    hashBuf.copy(entryBuf, off); off += hashBuf.length;

    entryBuf.writeUInt8(entry.isDirectory ? 1 : 0, off);

    parts.push(entryBuf);
  }

  return Buffer.concat(parts);
}

export function decodeManifest(buf: Buffer): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  let offset = 0;

  const count = buf.readUInt32BE(offset); offset += 4;

  for (let i = 0; i < count; i++) {
    const pathLen = buf.readUInt16BE(offset); offset += 2;
    const relativePath = buf.subarray(offset, offset + pathLen).toString('utf8'); offset += pathLen;

    const sizeHigh = buf.readUInt32BE(offset); offset += 4;
    const sizeLow = buf.readUInt32BE(offset); offset += 4;
    const sizeBytes = sizeHigh * 0x100000000 + sizeLow;

    const modHigh = buf.readUInt32BE(offset); offset += 4;
    const modLow = buf.readUInt32BE(offset); offset += 4;
    const modifiedAt = modHigh * 0x100000000 + modLow;

    const hashLen = buf.readUInt16BE(offset); offset += 2;
    const hash = hashLen > 0 ? buf.subarray(offset, offset + hashLen).toString('utf8') : undefined;
    offset += hashLen;

    const isDirectory = buf.readUInt8(offset) === 1; offset += 1;

    entries.push({ relativePath, sizeBytes, modifiedAt, hash, isDirectory });
  }

  return entries;
}

/**
 * Determine optimal chunk size based on measured throughput.
 */
export function getOptimalChunkSize(throughputMBps: number): number {
  if (throughputMBps > 500) return CHUNK_SIZE_LARGE;
  if (throughputMBps > 100) return CHUNK_SIZE_MEDIUM;
  return CHUNK_SIZE_INITIAL;
}

/**
 * Determine optimal stream count based on measured bandwidth.
 */
export function getOptimalStreamCount(bandwidthMbps: number): number {
  if (bandwidthMbps > 10000) return STREAMS_ULTRA;
  if (bandwidthMbps > 1000) return STREAMS_FAST;
  if (bandwidthMbps > 100) return STREAMS_MEDIUM;
  return STREAMS_SLOW;
}

/**
 * Check if a file extension indicates already-compressed data.
 */
export function isCompressedFormat(filePath: string): boolean {
  const ext = filePath.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  return COMPRESSED_EXTENSIONS.has(ext);
}
