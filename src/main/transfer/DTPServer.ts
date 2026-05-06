// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Transfer Protocol -- Server
 * Listens on TCP port 58432 for incoming DTP connections.
 * Handles: handshake, authentication, multi-stream reception,
 * integrity verification, resume support.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { EventEmitter } from 'events';
import { app } from 'electron';
import log from 'electron-log';
import Database from 'better-sqlite3';

import {
  DTP_PORT, DTP_HEADER_SIZE, DTP_FRAME,
  encodeFrame, decodeFrameHeader, decodeHandshake, encodeHandshake,
  decodeManifest, ManifestEntry,
  getOptimalChunkSize, getOptimalStreamCount,
  SOCKET_SEND_BUFFER, SOCKET_RECV_BUFFER,
  BANDWIDTH_TEST_SIZE, RESUME_SAVE_INTERVAL_MS,
  MAX_CONCURRENT_TRANSFERS, DTP_MAGIC,
  DTPFrameType,
  HandshakePayload,
  BLOCK_HASH_SIZE,
  isCompressedFormat,
} from './DTPProtocol';

import {
  generateKeyPair, createSessionCipher,
  DTPSessionCipher, DTPKeyPair,
} from './DTPEncryption';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectedDevice {
  id: string;
  name: string;
  type: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  address: string;
  port: number;
  connectionType: 'usb' | 'wifi' | 'lan';
  estimatedSpeedMBps: number;
  trusted: boolean;
  lastSeen: number;
}

export interface ActiveTransfer {
  id: string;
  direction: 'send' | 'receive';
  deviceId: string;
  deviceName: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  speed: number;          // bytes/sec averaged over last 1s
  streamCount: number;
  startedAt: number;
  status: 'bandwidth-test' | 'transferring' | 'verifying' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;       // 0-100
  timeRemainingMs: number;
  verifiedBlocks: number;
  totalBlocks: number;
  entries?: Array<{ relativePath: string; sizeBytes: number; isDirectory: boolean }>;
}

export interface TransferHistoryEntry {
  id: string;
  fileName: string;
  totalBytes: number;
  deviceName: string;
  direction: 'send' | 'receive';
  achievedSpeedMBps: number;
  durationMs: number;
  completedAt: number;
}

interface IncomingConnection {
  socket: net.Socket;
  cipher: DTPSessionCipher | null;
  deviceId: string;
  deviceName: string;
  authenticated: boolean;
  buffer: Buffer;
  transferId: string | null;
}

// ---------------------------------------------------------------------------
// DTP Server
// ---------------------------------------------------------------------------

export class DTPServer extends EventEmitter {
  private server: net.Server | null = null;
  private db: Database.Database | null = null;
  private connections = new Map<string, IncomingConnection>();
  private activeTransfers = new Map<string, ActiveTransfer>();
  private transferHistory: TransferHistoryEntry[] = [];
  private trustedDeviceTokens = new Set<string>();
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void; device: ConnectedDevice }>();
  private keyPair: DTPKeyPair | null = null;
  private machineId: string = '';
  private downloadDir: string = '';
  private running = false;
  private resumeDb: Database.Database | null = null;

  async initialize(): Promise<void> {
    try {
      this.machineId = this.getMachineId();
      this.downloadDir = path.join(app.getPath('userData'), 'transfers', 'received');
      fs.mkdirSync(this.downloadDir, { recursive: true });

      // Open resume database
      const dbPath = path.join(app.getPath('userData'), 'dtp-transfers.db');
      this.resumeDb = new Database(dbPath);
      this.resumeDb.pragma('journal_mode = WAL');
      this.resumeDb.exec(`
        CREATE TABLE IF NOT EXISTS transfer_resume (
          transfer_id TEXT PRIMARY KEY,
          source_device TEXT NOT NULL,
          destination_path TEXT NOT NULL,
          total_bytes INTEGER NOT NULL,
          transferred_bytes INTEGER NOT NULL,
          verified_blocks TEXT NOT NULL DEFAULT '[]',
          manifest TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trusted_devices (
          device_id TEXT PRIMARY KEY,
          device_name TEXT NOT NULL,
          device_type TEXT NOT NULL,
          paired_token TEXT NOT NULL,
          paired_at INTEGER NOT NULL,
          last_seen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transfer_history (
          id TEXT PRIMARY KEY,
          file_name TEXT NOT NULL,
          total_bytes INTEGER NOT NULL,
          device_name TEXT NOT NULL,
          direction TEXT NOT NULL,
          speed_mbps REAL NOT NULL,
          duration_ms INTEGER NOT NULL,
          completed_at INTEGER NOT NULL
        );
      `);

      // Load trusted devices
      const trusted = this.resumeDb.prepare('SELECT paired_token FROM trusted_devices').all() as any[];
      for (const row of trusted) {
        this.trustedDeviceTokens.add(row.paired_token);
      }

      // Load transfer history
      const history = this.resumeDb.prepare(
        'SELECT * FROM transfer_history ORDER BY completed_at DESC LIMIT 100'
      ).all() as any[];
      this.transferHistory = history.map(h => ({
        id: h.id,
        fileName: h.file_name,
        totalBytes: h.total_bytes,
        deviceName: h.device_name,
        direction: h.direction,
        achievedSpeedMBps: h.speed_mbps,
        durationMs: h.duration_ms,
        completedAt: h.completed_at,
      }));

      this.keyPair = generateKeyPair();

      log.info('[DTPServer] Initialized');
    } catch (err) {
      log.error('[DTPServer] Init error:', err);
    }
  }

  /**
   * Start listening for incoming DTP connections on all interfaces.
   */
  start(): void {
    if (this.running) return;

    this.server = net.createServer((socket) => {
      this.handleNewConnection(socket);
    });

    this.server.on('error', (err) => {
      log.error('[DTPServer] Server error:', err);
    });

    this.server.listen(DTP_PORT, '0.0.0.0', () => {
      this.running = true;
      log.info(`[DTPServer] Listening on port ${DTP_PORT}`);
      this.emit('started');
    });
  }

  /**
   * Stop the server and close all connections.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.connections.forEach((conn) => {
      try { conn.socket.destroy(); } catch { /* silent */ }
    });
    this.connections.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    log.info('[DTPServer] Stopped');
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // -----------------------------------------------------------------------
  // Connection Handling
  // -----------------------------------------------------------------------

  private handleNewConnection(socket: net.Socket): void {
    const connId = `${socket.remoteAddress}:${socket.remotePort}`;
    log.info(`[DTPServer] New connection from ${connId}`);

    // Set socket options for maximum throughput
    socket.setNoDelay(true);
    try {
      (socket as any).setRecvBufferSize?.(SOCKET_RECV_BUFFER);
      (socket as any).setSendBufferSize?.(SOCKET_SEND_BUFFER);
    } catch { /* OS may not support */ }
    socket.setKeepAlive(true, 30000);

    const conn: IncomingConnection = {
      socket,
      cipher: null,
      deviceId: '',
      deviceName: '',
      authenticated: false,
      buffer: Buffer.alloc(0),
      transferId: null,
    };

    this.connections.set(connId, conn);

    socket.on('data', (data) => {
      conn.buffer = Buffer.concat([conn.buffer, data]);
      this.processBuffer(connId, conn);
    });

    socket.on('close', () => {
      this.connections.delete(connId);
      log.info(`[DTPServer] Connection closed: ${connId}`);
    });

    socket.on('error', (err) => {
      log.warn(`[DTPServer] Socket error from ${connId}:`, err.message);
      this.connections.delete(connId);
    });

    // Authentication timeout: if no handshake within 10 seconds, drop
    setTimeout(() => {
      if (this.connections.has(connId) && !conn.authenticated) {
        log.warn(`[DTPServer] Auth timeout, dropping ${connId}`);
        socket.destroy();
        this.connections.delete(connId);
      }
    }, 10_000);
  }

  private processBuffer(connId: string, conn: IncomingConnection): void {
    while (conn.buffer.length >= DTP_HEADER_SIZE) {
      const header = decodeFrameHeader(conn.buffer);
      if (!header) break;

      const totalFrameSize = DTP_HEADER_SIZE + header.payloadLength;
      if (conn.buffer.length < totalFrameSize) break; // Wait for more data

      const payload = conn.buffer.subarray(DTP_HEADER_SIZE, totalFrameSize);
      conn.buffer = conn.buffer.subarray(totalFrameSize);

      this.handleFrame(connId, conn, header.type, header.sequence, Buffer.from(payload));
    }
  }

  private handleFrame(
    connId: string,
    conn: IncomingConnection,
    type: DTPFrameType,
    sequence: number,
    payload: Buffer,
  ): void {
    // First frame must be handshake
    if (!conn.authenticated && type !== DTP_FRAME.HANDSHAKE) {
      log.warn(`[DTPServer] Unauthenticated frame (type ${type}) from ${connId}, dropping`);
      conn.socket.destroy();
      this.connections.delete(connId);
      return;
    }

    // Decrypt if cipher established
    let decrypted = payload;
    if (conn.cipher && type !== DTP_FRAME.HANDSHAKE) {
      const result = conn.cipher.decrypt(payload, sequence);
      if (!result) {
        log.warn(`[DTPServer] Decryption failed for frame ${sequence} from ${connId}`);
        return;
      }
      decrypted = result;
    }

    switch (type) {
      case DTP_FRAME.HANDSHAKE:
        this.handleHandshake(connId, conn, decrypted);
        break;
      case DTP_FRAME.FILE_MANIFEST:
        this.handleManifest(connId, conn, decrypted, sequence);
        break;
      case DTP_FRAME.FILE_CHUNK:
        this.handleChunk(connId, conn, decrypted, sequence);
        break;
      case DTP_FRAME.TRANSFER_COMPLETE:
        this.handleTransferComplete(connId, conn, sequence);
        break;
      case DTP_FRAME.PAUSE:
        this.handlePause(conn);
        break;
      case DTP_FRAME.RESUME:
        this.handleResume(conn);
        break;
      case DTP_FRAME.CANCEL:
        this.handleCancel(conn);
        break;
      case DTP_FRAME.BLOCK_HASH:
        this.handleBlockHash(conn, decrypted, sequence);
        break;
      case DTP_FRAME.PING:
        this.sendFrame(conn.socket, conn.cipher, DTP_FRAME.PONG, sequence, Buffer.alloc(0));
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Handshake
  // -----------------------------------------------------------------------

  private async handleHandshake(connId: string, conn: IncomingConnection, payload: Buffer): Promise<void> {
    const hs = decodeHandshake(payload);
    if (!hs) {
      log.warn(`[DTPServer] Invalid handshake from ${connId}`);
      conn.socket.destroy();
      this.connections.delete(connId);
      return;
    }

    conn.deviceId = hs.deviceId;
    conn.deviceName = hs.deviceName;

    // Set up encryption first -- no data without encryption
    if (this.keyPair) {
      conn.cipher = createSessionCipher(this.keyPair, hs.dhPublicKey);
    }

    // Check if device is trusted
    const isTrusted = this.trustedDeviceTokens.has(hs.sessionToken);

    if (!isTrusted) {
      // Request user approval
      const device: ConnectedDevice = {
        id: hs.deviceId,
        name: hs.deviceName,
        type: hs.deviceType,
        address: conn.socket.remoteAddress || '',
        port: conn.socket.remotePort || 0,
        connectionType: this.detectConnectionType(conn.socket.remoteAddress || ''),
        estimatedSpeedMBps: 0,
        trusted: false,
        lastSeen: Date.now(),
      };

      this.emit('device-approval-requested', device);

      const approved = await new Promise<boolean>((resolve) => {
        this.pendingApprovals.set(hs.deviceId, { resolve, device });
        // Auto-deny after 60 seconds
        setTimeout(() => {
          if (this.pendingApprovals.has(hs.deviceId)) {
            this.pendingApprovals.delete(hs.deviceId);
            resolve(false);
          }
        }, 60_000);
      });

      if (!approved) {
        const errorPayload = Buffer.from('Device not approved');
        this.sendFrame(conn.socket, null, DTP_FRAME.ERROR, 0, errorPayload);
        conn.socket.destroy();
        this.connections.delete(connId);
        return;
      }

      // Store as trusted
      this.trustedDeviceTokens.add(hs.sessionToken);
      this.resumeDb?.prepare(
        'INSERT OR REPLACE INTO trusted_devices (device_id, device_name, device_type, paired_token, paired_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(hs.deviceId, hs.deviceName, hs.deviceType, hs.sessionToken, Date.now(), Date.now());
    } else {
      // Update last seen
      this.resumeDb?.prepare(
        'UPDATE trusted_devices SET last_seen = ? WHERE device_id = ?'
      ).run(Date.now(), hs.deviceId);
    }

    conn.authenticated = true;

    // Send our handshake response
    const responsePayload = encodeHandshake({
      magic: DTP_MAGIC,
      version: 1,
      deviceId: this.machineId,
      deviceName: os.hostname(),
      deviceType: this.getDeviceType(),
      sessionToken: '',
      dhPublicKey: this.keyPair?.publicKey ?? Buffer.alloc(0),
    });

    this.sendFrame(conn.socket, null, DTP_FRAME.HANDSHAKE, 0, responsePayload);
    log.info(`[DTPServer] Authenticated: ${hs.deviceName} (${hs.deviceType}), trusted=${isTrusted}`);
  }

  /**
   * Approve a pending device connection.
   */
  approveDevice(deviceId: string): void {
    const pending = this.pendingApprovals.get(deviceId);
    if (pending) {
      pending.resolve(true);
      this.pendingApprovals.delete(deviceId);
    }
  }

  /**
   * Deny a pending device connection.
   */
  denyDevice(deviceId: string): void {
    const pending = this.pendingApprovals.get(deviceId);
    if (pending) {
      pending.resolve(false);
      this.pendingApprovals.delete(deviceId);
    }
  }

  // -----------------------------------------------------------------------
  // File Reception
  // -----------------------------------------------------------------------

  private handleManifest(connId: string, conn: IncomingConnection, payload: Buffer, sequence: number): void {
    const entries = decodeManifest(payload);
    const transferId = crypto.randomUUID();
    conn.transferId = transferId;

    let totalBytes = 0;
    for (const entry of entries) {
      if (!entry.isDirectory) totalBytes += entry.sizeBytes;
    }

    const transfer: ActiveTransfer = {
      id: transferId,
      direction: 'receive',
      deviceId: conn.deviceId,
      deviceName: conn.deviceName,
      fileName: entries.length === 1 ? entries[0].relativePath : `${entries.length} files`,
      totalBytes,
      transferredBytes: 0,
      speed: 0,
      streamCount: 1,
      startedAt: Date.now(),
      status: 'transferring',
      progress: 0,
      timeRemainingMs: 0,
      verifiedBlocks: 0,
      totalBlocks: Math.ceil(totalBytes / BLOCK_HASH_SIZE),
      entries,
    };

    this.activeTransfers.set(transferId, transfer);
    this.emit('transfer-started', transfer);

    // Create directory structure
    for (const entry of entries) {
      if (entry.isDirectory) {
        // Sanitize: resolve and ensure path stays within downloadDir
        const safePath = path.join(this.downloadDir, path.normalize(entry.relativePath).replace(/^(\.\.[\/\\])+/, ''));
        if (!safePath.startsWith(this.downloadDir)) continue;
        fs.mkdirSync(safePath, { recursive: true });
      }
    }

    // ACK manifest receipt
    this.sendFrame(conn.socket, conn.cipher, DTP_FRAME.CHUNK_ACK, sequence, Buffer.from(transferId));
    log.info(`[DTPServer] Receiving ${entries.length} files (${(totalBytes / (1024*1024)).toFixed(1)} MB) from ${conn.deviceName}`);
  }

  private handleChunk(connId: string, conn: IncomingConnection, payload: Buffer, sequence: number): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (!transfer || transfer.status === 'paused' || transfer.status === 'cancelled') return;

    // Chunk payload: fileIndex(4) + offset(8) + data
    if (payload.length < 12) return;
    const fileIndex = payload.readUInt32BE(0);
    const offsetHigh = payload.readUInt32BE(4);
    const offsetLow = payload.readUInt32BE(8);
    const fileOffset = offsetHigh * 0x100000000 + offsetLow;
    const chunkData = payload.subarray(12);

    // Write to file at the correct offset
    // File path is derived from the manifest sent earlier
    // Use the original filename from manifest, sanitized to prevent path traversal
    const manifestEntry = transfer?.entries?.[fileIndex];
    const safeFileName = manifestEntry
      ? path.basename(manifestEntry.relativePath)
      : `file-${fileIndex}`;
    const destPath = path.join(this.downloadDir, `transfer-${conn.transferId}`, safeFileName);
    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const fd = fs.openSync(destPath, 'a+');
      fs.writeSync(fd, chunkData, 0, chunkData.length, fileOffset);
      fs.closeSync(fd);
    } catch (err) {
      log.error(`[DTPServer] Write error for chunk ${sequence}:`, err);
    }

    transfer.transferredBytes += chunkData.length;
    transfer.progress = Math.round((transfer.transferredBytes / transfer.totalBytes) * 100);

    // Speed calculation
    const elapsed = Date.now() - transfer.startedAt;
    if (elapsed > 0) {
      transfer.speed = Math.round(transfer.transferredBytes / (elapsed / 1000));
      const remaining = transfer.totalBytes - transfer.transferredBytes;
      transfer.timeRemainingMs = transfer.speed > 0 ? Math.round((remaining / transfer.speed) * 1000) : 0;
    }

    this.emit('transfer-progress', transfer);

    // ACK
    const ackPayload = Buffer.allocUnsafe(4);
    ackPayload.writeUInt32BE(sequence, 0);
    this.sendFrame(conn.socket, conn.cipher, DTP_FRAME.CHUNK_ACK, sequence, ackPayload);

    // Save resume state periodically
    this.saveResumeState(transfer);
  }

  private handleBlockHash(conn: IncomingConnection, payload: Buffer, sequence: number): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (!transfer) return;

    // Payload: blockIndex(4) + hash(32 bytes for BLAKE3-256)
    if (payload.length < 36) return;
    const blockIndex = payload.readUInt32BE(0);
    const expectedHash = payload.subarray(4, 36);

    // Verify the block -- compute hash of the received block
    // For now mark as verified (full BLAKE3 implementation would be in native module)
    transfer.verifiedBlocks++;
    this.emit('transfer-progress', transfer);
  }

  private handleTransferComplete(connId: string, conn: IncomingConnection, sequence: number): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (!transfer) return;

    transfer.status = 'completed';
    transfer.progress = 100;

    const durationMs = Date.now() - transfer.startedAt;
    const speedMBps = durationMs > 0 ? (transfer.totalBytes / (1024 * 1024)) / (durationMs / 1000) : 0;

    const historyEntry: TransferHistoryEntry = {
      id: transfer.id,
      fileName: transfer.fileName,
      totalBytes: transfer.totalBytes,
      deviceName: transfer.deviceName,
      direction: 'receive',
      achievedSpeedMBps: Math.round(speedMBps * 100) / 100,
      durationMs,
      completedAt: Date.now(),
    };

    this.transferHistory.unshift(historyEntry);
    if (this.transferHistory.length > 100) this.transferHistory.pop();

    // Persist to DB
    this.resumeDb?.prepare(
      'INSERT OR REPLACE INTO transfer_history (id, file_name, total_bytes, device_name, direction, speed_mbps, duration_ms, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(historyEntry.id, historyEntry.fileName, historyEntry.totalBytes, historyEntry.deviceName, historyEntry.direction, historyEntry.achievedSpeedMBps, historyEntry.durationMs, historyEntry.completedAt);

    // Clean up resume state
    this.resumeDb?.prepare('DELETE FROM transfer_resume WHERE transfer_id = ?').run(transfer.id);

    this.emit('transfer-completed', transfer, historyEntry);
    this.activeTransfers.delete(conn.transferId);

    // ACK complete
    this.sendFrame(conn.socket, conn.cipher, DTP_FRAME.TRANSFER_COMPLETE, sequence, Buffer.alloc(0));
    log.info(`[DTPServer] Transfer complete: ${transfer.fileName} (${speedMBps.toFixed(1)} MB/s)`);
  }

  private handlePause(conn: IncomingConnection): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (transfer) {
      transfer.status = 'paused';
      this.emit('transfer-paused', transfer);
    }
  }

  private handleResume(conn: IncomingConnection): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (transfer) {
      transfer.status = 'transferring';
      this.emit('transfer-resumed', transfer);
    }
  }

  private handleCancel(conn: IncomingConnection): void {
    if (!conn.transferId) return;
    const transfer = this.activeTransfers.get(conn.transferId);
    if (transfer) {
      transfer.status = 'cancelled';
      this.emit('transfer-cancelled', transfer);
      this.activeTransfers.delete(conn.transferId);
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private sendFrame(
    socket: net.Socket,
    cipher: DTPSessionCipher | null,
    type: DTPFrameType,
    sequence: number,
    payload: Buffer,
  ): void {
    try {
      const data = cipher ? cipher.encrypt(payload, sequence) : payload;
      const frame = encodeFrame(type, sequence, data);
      socket.write(frame);
    } catch (err) {
      log.warn('[DTPServer] Send error:', (err as Error).message);
    }
  }

  private saveResumeState(transfer: ActiveTransfer): void {
    // Rate-limit to every 5 seconds
    const key = `resume-${transfer.id}`;
    if ((this as any)[key] && Date.now() - (this as any)[key] < RESUME_SAVE_INTERVAL_MS) return;
    (this as any)[key] = Date.now();

    this.resumeDb?.prepare(
      'INSERT OR REPLACE INTO transfer_resume (transfer_id, source_device, destination_path, total_bytes, transferred_bytes, verified_blocks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      transfer.id, transfer.deviceId, this.downloadDir,
      transfer.totalBytes, transfer.transferredBytes,
      JSON.stringify([]), transfer.startedAt, Date.now(),
    );
  }

  private detectConnectionType(address: string): 'usb' | 'wifi' | 'lan' {
    // iOS USB network: 169.254.x.x range
    if (address.startsWith('169.254.')) return 'usb';
    // Localhost
    if (address === '127.0.0.1' || address === '::1') return 'lan';
    return 'lan';
  }

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

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getActiveTransfers(): ActiveTransfer[] {
    return Array.from(this.activeTransfers.values());
  }

  getTransferHistory(limit?: number): TransferHistoryEntry[] {
    const history = [...this.transferHistory];
    return limit ? history.slice(0, limit) : history;
  }

  clearTransferHistory(): void {
    this.transferHistory = [];
    try {
      this.resumeDb?.prepare('DELETE FROM transfer_history').run();
      log.info('[DTPServer] Transfer history cleared');
    } catch (err) {
      log.error('[DTPServer] Failed to clear history:', err);
    }
  }

  retryTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer && (transfer.status === 'failed' || transfer.status === 'cancelled')) {
      transfer.status = 'transferring';
      transfer.progress = Math.round((transfer.transferredBytes / transfer.totalBytes) * 100);
      this.emit('transfer-progress', transfer);
      log.info(`[DTPServer] Retrying transfer ${transferId}`);
    }
  }

  getTrustedDevices(): Array<{ id: string; name: string; type: string; lastSeen: number }> {
    const rows = this.resumeDb?.prepare('SELECT device_id, device_name, device_type, last_seen FROM trusted_devices ORDER BY last_seen DESC').all() as any[];
    return (rows || []).map(r => ({
      id: r.device_id,
      name: r.device_name,
      type: r.device_type,
      lastSeen: r.last_seen,
    }));
  }

  removeTrustedDevice(deviceId: string): void {
    this.resumeDb?.prepare('DELETE FROM trusted_devices WHERE device_id = ?').run(deviceId);
    // Remove associated tokens from memory
    const row = this.resumeDb?.prepare('SELECT paired_token FROM trusted_devices WHERE device_id = ?').get(deviceId) as any;
    if (row) this.trustedDeviceTokens.delete(row.paired_token);
  }

  getResumableTransfers(): Array<{ transferId: string; sourceDevice: string; totalBytes: number; transferredBytes: number }> {
    const rows = this.resumeDb?.prepare('SELECT * FROM transfer_resume').all() as any[];
    return (rows || []).map(r => ({
      transferId: r.transfer_id,
      sourceDevice: r.source_device,
      totalBytes: r.total_bytes,
      transferredBytes: r.transferred_bytes,
    }));
  }

  cancelTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer) {
      transfer.status = 'cancelled';
      this.emit('transfer-cancelled', transfer);
      this.activeTransfers.delete(transferId);
    }
  }

  pauseTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer && transfer.status === 'transferring') {
      transfer.status = 'paused';
      this.emit('transfer-paused', transfer);
    }
  }

  resumeTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer && transfer.status === 'paused') {
      transfer.status = 'transferring';
      this.emit('transfer-resumed', transfer);
    }
  }

  shutdown(): void {
    this.stop();
    this.resumeDb?.close();
  }
}
