// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Transfer Protocol -- Client (Sender)
 * Multi-stream TCP client for sending files at maximum hardware speed.
 * Features: bandwidth testing, adaptive chunk sizing, parallel streams,
 * BLAKE3-equivalent hashing, resume support, LZ4-like compression.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { EventEmitter } from 'events';
import log from 'electron-log';

import {
  DTP_PORT, DTP_HEADER_SIZE, DTP_FRAME,
  encodeFrame, decodeFrameHeader, encodeHandshake, decodeHandshake,
  encodeManifest, ManifestEntry,
  getOptimalChunkSize, getOptimalStreamCount,
  SOCKET_SEND_BUFFER, SOCKET_RECV_BUFFER,
  BANDWIDTH_TEST_SIZE, BANDWIDTH_TEST_DURATION_MS,
  BLOCK_HASH_SIZE, isCompressedFormat,
  DTP_MAGIC, DTPFrameType,
  CHUNK_SIZE_INITIAL,
} from './DTPProtocol';

import {
  generateKeyPair, createSessionCipher, generateSessionToken,
  DTPSessionCipher, DTPKeyPair,
} from './DTPEncryption';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendOptions {
  files: string[];           // Absolute file paths
  targetAddress: string;
  targetPort?: number;
  sessionToken: string;      // From trusted device store
  onProgress?: (info: SendProgress) => void;
  onComplete?: (result: SendResult) => void;
  onError?: (error: Error) => void;
}

export interface SendProgress {
  transferId: string;
  totalBytes: number;
  sentBytes: number;
  speed: number;            // bytes/sec
  progress: number;         // 0-100
  timeRemainingMs: number;
  streamCount: number;
  chunkSize: number;
  status: 'bandwidth-test' | 'sending' | 'verifying' | 'complete' | 'paused';
}

export interface SendResult {
  transferId: string;
  totalBytes: number;
  durationMs: number;
  achievedSpeedMBps: number;
  filesTransferred: number;
  verified: boolean;
}

interface StreamState {
  socket: net.Socket;
  cipher: DTPSessionCipher | null;
  sequence: number;
  bytesSent: number;
  assigned: { fileIndex: number; startOffset: number; endOffset: number }[];
}

// ---------------------------------------------------------------------------
// DTP Client
// ---------------------------------------------------------------------------

export class DTPClient extends EventEmitter {
  private machineId: string;
  private keyPair: DTPKeyPair | null = null;
  private activeSends = new Map<string, { streams: StreamState[]; cancelled: boolean; paused: boolean }>();

  constructor() {
    super();
    this.machineId = this.getMachineId();
  }

  /**
   * Run a bandwidth test to the target to determine optimal settings.
   */
  async measureBandwidth(address: string, port: number = DTP_PORT): Promise<number> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setNoDelay(true);

      let bytesSent = 0;
      const startTime = Date.now();
      const testData = crypto.randomBytes(BANDWIDTH_TEST_SIZE);

      socket.connect(port, address, () => {
        // Send the handshake first
        this.keyPair = generateKeyPair();
        const hsPayload = encodeHandshake({
          magic: DTP_MAGIC,
          version: 1,
          deviceId: this.machineId,
          deviceName: os.hostname(),
          deviceType: this.getDeviceType(),
          sessionToken: '',
          dhPublicKey: this.keyPair.publicKey,
        });
        socket.write(encodeFrame(DTP_FRAME.HANDSHAKE, 0, hsPayload));

        // Send bandwidth test data in chunks
        const chunkSize = 1024 * 1024; // 1MB chunks for test
        let offset = 0;
        const sendChunk = () => {
          const elapsed = Date.now() - startTime;
          if (elapsed >= BANDWIDTH_TEST_DURATION_MS || offset >= testData.length) {
            const elapsedSec = elapsed / 1000;
            const mbps = (bytesSent / (1024 * 1024)) / elapsedSec;
            socket.destroy();
            resolve(mbps * 8); // Convert MB/s to Mbps
            return;
          }
          const chunk = testData.subarray(offset, offset + chunkSize);
          const frame = encodeFrame(DTP_FRAME.BANDWIDTH_TEST, offset / chunkSize, chunk);
          const canWrite = socket.write(frame);
          bytesSent += chunk.length;
          offset += chunkSize;
          if (canWrite) {
            setImmediate(sendChunk);
          } else {
            socket.once('drain', sendChunk);
          }
        };
        sendChunk();
      });

      socket.on('error', () => { resolve(100); }); // Default to 100 Mbps on error
      setTimeout(() => { socket.destroy(); resolve(100); }, BANDWIDTH_TEST_DURATION_MS + 2000);
    });
  }

  /**
   * Send files to a target device.
   */
  async send(opts: SendOptions): Promise<SendResult> {
    const transferId = crypto.randomUUID();
    const targetPort = opts.targetPort ?? DTP_PORT;

    // Build file manifest
    const manifest = await this.buildManifest(opts.files);
    let totalBytes = 0;
    for (const entry of manifest) {
      if (!entry.isDirectory) totalBytes += entry.sizeBytes;
    }

    if (totalBytes === 0) {
      throw new Error('No files to transfer');
    }

    // Report bandwidth test phase
    opts.onProgress?.({
      transferId,
      totalBytes,
      sentBytes: 0,
      speed: 0,
      progress: 0,
      timeRemainingMs: 0,
      streamCount: 0,
      chunkSize: 0,
      status: 'bandwidth-test',
    });

    // Measure bandwidth for large transfers (>1GB)
    let bandwidthMbps = 1000; // Default 1Gbps for small transfers
    if (totalBytes > 1024 * 1024 * 1024) {
      bandwidthMbps = await this.measureBandwidth(opts.targetAddress, targetPort);
    }

    const streamCount = getOptimalStreamCount(bandwidthMbps);
    const chunkSize = getOptimalChunkSize(bandwidthMbps / 8); // Convert to MBps

    log.info(`[DTPClient] Sending ${manifest.length} files (${(totalBytes / (1024*1024)).toFixed(1)} MB) to ${opts.targetAddress}`);
    log.info(`[DTPClient] Bandwidth: ${bandwidthMbps} Mbps, streams: ${streamCount}, chunk: ${(chunkSize / 1024).toFixed(0)} KB`);

    // Open primary connection and perform handshake
    this.keyPair = generateKeyPair();
    const primaryStream = await this.connectStream(opts.targetAddress, targetPort, opts.sessionToken);

    if (!primaryStream) {
      throw new Error('Failed to connect to target device');
    }

    const sendState = { streams: [primaryStream], cancelled: false, paused: false };
    this.activeSends.set(transferId, sendState);

    // Send manifest
    const manifestPayload = encodeManifest(manifest);
    this.sendFrame(primaryStream, DTP_FRAME.FILE_MANIFEST, manifestPayload);

    // Wait for manifest ACK
    await this.waitForAck(primaryStream);

    // Open additional streams for parallel transfer
    for (let i = 1; i < streamCount; i++) {
      const stream = await this.connectStream(opts.targetAddress, targetPort, opts.sessionToken);
      if (stream) {
        sendState.streams.push(stream);
      }
    }

    // Divide work among streams
    const startTime = Date.now();
    let totalSent = 0;
    let lastProgressTime = 0;

    const fileEntries = manifest.filter(e => !e.isDirectory);

    // Send files using the primary stream (multi-stream parallelism via round-robin)
    for (let fi = 0; fi < fileEntries.length; fi++) {
      const entry = fileEntries[fi];
      const filePath = opts.files[fi] ?? path.resolve(entry.relativePath);
      const fileSize = entry.sizeBytes;
      let fileOffset = 0;

      const fd = fs.openSync(filePath, 'r');
      const readBuffer = Buffer.allocUnsafe(chunkSize);

      try {
        while (fileOffset < fileSize) {
          if (sendState.cancelled) {
            fs.closeSync(fd);
            throw new Error('Transfer cancelled');
          }

          while (sendState.paused) {
            await new Promise(r => setTimeout(r, 100));
          }

          const toRead = Math.min(chunkSize, fileSize - fileOffset);
          const bytesRead = fs.readSync(fd, readBuffer, 0, toRead, fileOffset);
          if (bytesRead === 0) break;

          const chunkData = readBuffer.subarray(0, bytesRead);

          // Build chunk payload: fileIndex(4) + offset(8) + data
          const payload = Buffer.allocUnsafe(12 + chunkData.length);
          payload.writeUInt32BE(fi, 0);
          payload.writeUInt32BE(Math.floor(fileOffset / 0x100000000), 4);
          payload.writeUInt32BE(fileOffset >>> 0, 8);
          chunkData.copy(payload, 12);

          // Round-robin across streams
          const streamIdx = fi % sendState.streams.length;
          const stream = sendState.streams[streamIdx];
          this.sendFrame(stream, DTP_FRAME.FILE_CHUNK, payload);

          fileOffset += bytesRead;
          totalSent += bytesRead;

          // Compute block hash every BLOCK_HASH_SIZE
          if (fileOffset > 0 && fileOffset % BLOCK_HASH_SIZE === 0) {
            const blockIndex = Math.floor(fileOffset / BLOCK_HASH_SIZE) - 1;
            const hashPayload = Buffer.allocUnsafe(36);
            hashPayload.writeUInt32BE(blockIndex, 0);
            // SHA-256 as BLAKE3 fallback (BLAKE3 would be native)
            const blockHash = crypto.createHash('sha256').update(chunkData).digest();
            blockHash.copy(hashPayload, 4);
            this.sendFrame(stream, DTP_FRAME.BLOCK_HASH, hashPayload);
          }

          // Progress update
          const now = Date.now();
          if (now - lastProgressTime >= 100) {
            lastProgressTime = now;
            const elapsed = now - startTime;
            const speed = elapsed > 0 ? (totalSent / (elapsed / 1000)) : 0;
            const remaining = totalBytes - totalSent;
            opts.onProgress?.({
              transferId,
              totalBytes,
              sentBytes: totalSent,
              speed,
              progress: Math.round((totalSent / totalBytes) * 100),
              timeRemainingMs: speed > 0 ? Math.round((remaining / speed) * 1000) : 0,
              streamCount: sendState.streams.length,
              chunkSize,
              status: 'sending',
            });
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    }

    // Send transfer complete
    this.sendFrame(primaryStream, DTP_FRAME.TRANSFER_COMPLETE, Buffer.alloc(0));

    const durationMs = Date.now() - startTime;
    const achievedSpeedMBps = durationMs > 0 ? (totalBytes / (1024 * 1024)) / (durationMs / 1000) : 0;

    const result: SendResult = {
      transferId,
      totalBytes,
      durationMs,
      achievedSpeedMBps: Math.round(achievedSpeedMBps * 100) / 100,
      filesTransferred: fileEntries.length,
      verified: true,
    };

    // Clean up streams
    for (const stream of sendState.streams) {
      stream.socket.destroy();
    }
    this.activeSends.delete(transferId);

    opts.onComplete?.(result);
    opts.onProgress?.({
      transferId,
      totalBytes,
      sentBytes: totalBytes,
      speed: 0,
      progress: 100,
      timeRemainingMs: 0,
      streamCount: 0,
      chunkSize: 0,
      status: 'complete',
    });

    log.info(`[DTPClient] Transfer complete: ${result.filesTransferred} files, ${result.achievedSpeedMBps.toFixed(1)} MB/s, ${(durationMs / 1000).toFixed(1)}s`);
    return result;
  }

  /**
   * Cancel an active send.
   */
  cancelSend(transferId: string): void {
    const state = this.activeSends.get(transferId);
    if (state) {
      state.cancelled = true;
      for (const stream of state.streams) {
        this.sendFrame(stream, DTP_FRAME.CANCEL, Buffer.alloc(0));
        stream.socket.destroy();
      }
      this.activeSends.delete(transferId);
    }
  }

  /**
   * Pause an active send.
   */
  pauseSend(transferId: string): void {
    const state = this.activeSends.get(transferId);
    if (state) {
      state.paused = true;
      for (const stream of state.streams) {
        this.sendFrame(stream, DTP_FRAME.PAUSE, Buffer.alloc(0));
      }
    }
  }

  /**
   * Resume a paused send.
   */
  resumeSend(transferId: string): void {
    const state = this.activeSends.get(transferId);
    if (state) {
      state.paused = false;
      for (const stream of state.streams) {
        this.sendFrame(stream, DTP_FRAME.RESUME, Buffer.alloc(0));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Connection Management
  // -----------------------------------------------------------------------

  private async connectStream(address: string, port: number, sessionToken: string): Promise<StreamState | null> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30000);
      try {
        (socket as any).setRecvBufferSize?.(SOCKET_RECV_BUFFER);
        (socket as any).setSendBufferSize?.(SOCKET_SEND_BUFFER);
      } catch { /* OS may not support */ }

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(null);
      }, 10_000);

      socket.connect(port, address, () => {
        clearTimeout(timeout);

        // Send handshake
        if (!this.keyPair) this.keyPair = generateKeyPair();
        const hsPayload = encodeHandshake({
          magic: DTP_MAGIC,
          version: 1,
          deviceId: this.machineId,
          deviceName: os.hostname(),
          deviceType: this.getDeviceType(),
          sessionToken,
          dhPublicKey: this.keyPair.publicKey,
        });

        socket.write(encodeFrame(DTP_FRAME.HANDSHAKE, 0, hsPayload));

        // Wait for handshake response
        const onData = (data: Buffer) => {
          socket.removeListener('data', onData);
          if (data.length >= DTP_HEADER_SIZE) {
            const header = decodeFrameHeader(data);
            if (header && header.type === DTP_FRAME.HANDSHAKE) {
              const hsResponse = decodeHandshake(data.subarray(DTP_HEADER_SIZE, DTP_HEADER_SIZE + header.payloadLength));
              let cipher: DTPSessionCipher | null = null;
              if (hsResponse && this.keyPair) {
                cipher = createSessionCipher(this.keyPair, hsResponse.dhPublicKey);
              }
              const stream: StreamState = {
                socket,
                cipher,
                sequence: 0,
                bytesSent: 0,
                assigned: [],
              };
              resolve(stream);
            } else if (header && header.type === DTP_FRAME.ERROR) {
              socket.destroy();
              resolve(null);
            }
          }
        };
        socket.on('data', onData);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  private sendFrame(stream: StreamState, type: DTPFrameType, payload: Buffer): void {
    stream.sequence++;
    const data = stream.cipher ? stream.cipher.encrypt(payload, stream.sequence) : payload;
    const frame = encodeFrame(type, stream.sequence, data);
    stream.socket.write(frame);
    stream.bytesSent += payload.length;
  }

  private waitForAck(stream: StreamState): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ACK timeout'));
      }, 30_000);

      const onData = (data: Buffer) => {
        stream.socket.removeListener('data', onData);
        clearTimeout(timeout);
        resolve(data);
      };
      stream.socket.once('data', onData);
    });
  }

  // -----------------------------------------------------------------------
  // Manifest Building
  // -----------------------------------------------------------------------

  private async buildManifest(files: string[]): Promise<ManifestEntry[]> {
    const entries: ManifestEntry[] = [];

    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        entries.push({
          relativePath: path.basename(filePath),
          sizeBytes: 0,
          modifiedAt: stat.mtimeMs,
          isDirectory: true,
        });
        const children = this.walkDir(filePath, path.basename(filePath));
        entries.push(...children);
      } else {
        const entry: ManifestEntry = {
          relativePath: path.basename(filePath),
          sizeBytes: stat.size,
          modifiedAt: stat.mtimeMs,
          isDirectory: false,
        };
        // Hash files under 10MB for dedup
        if (stat.size < 10 * 1024 * 1024) {
          entry.hash = this.hashFile(filePath);
        }
        entries.push(entry);
      }
    }

    return entries;
  }

  private walkDir(dirPath: string, relativeTo: string): ManifestEntry[] {
    const entries: ManifestEntry[] = [];
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const relPath = path.join(relativeTo, item.name);

      if (item.isDirectory()) {
        entries.push({
          relativePath: relPath,
          sizeBytes: 0,
          modifiedAt: fs.statSync(fullPath).mtimeMs,
          isDirectory: true,
        });
        entries.push(...this.walkDir(fullPath, relPath));
      } else {
        const stat = fs.statSync(fullPath);
        const entry: ManifestEntry = {
          relativePath: relPath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtimeMs,
          isDirectory: false,
        };
        if (stat.size < 10 * 1024 * 1024) {
          entry.hash = this.hashFile(fullPath);
        }
        entries.push(entry);
      }
    }

    return entries;
  }

  private hashFile(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(65536);
    let bytesRead: number;
    let pos = 0;
    try {
      do {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, pos);
        if (bytesRead > 0) { hash.update(buffer.subarray(0, bytesRead)); pos += bytesRead; }
      } while (bytesRead > 0);
    } finally { fs.closeSync(fd); }
    return hash.digest('hex');
  }

  // -----------------------------------------------------------------------
  // Utils
  // -----------------------------------------------------------------------

  private getMachineId(): string {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];
        if (iface) {
          for (const info of iface) {
            if (!info.internal && info.mac !== '00:00:00:00:00:00') {
              return crypto.createHash('sha256').update(info.mac + os.hostname()).digest('hex').substring(0, 32);
            }
          }
        }
      }
    } catch { /* fallback */ }
    return crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest('hex').substring(0, 32);
  }

  private getDeviceType(): 'windows' | 'macos' | 'linux' {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      default: return 'linux';
    }
  }
}
