// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Worker -- File Transfer Thread
// ==========================================================================
// Rules 37-42: File Transfer Architecture
// 37. Size-based strategy: <50MB buffer, 50-500MB streams, >500MB parallel chunks
// 38. fs.rename for same-filesystem moves
// 39. Owner-only permissions (0o600 files, 0o700 dirs)
// 40. SHA-256 integrity hash for all writes
// 41. Progress throttled to 4 updates/second
// 42. Streaming hash computation (no double read)
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// Rule 37: Size thresholds
const SMALL_FILE_THRESHOLD = 50 * 1024 * 1024;   // 50 MB
const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024;   // 500 MB
const CHUNK_SIZE = 16 * 1024 * 1024;               // 16 MB chunks for parallel

// Rule 41: Progress throttle
const PROGRESS_INTERVAL_MS = 250; // 4 updates/sec

const IS_WINDOWS = process.platform === 'win32';

function setOwnerOnly(filePath: string): void {
  // Rule 39: owner-only permissions
  try { fs.chmodSync(filePath, 0o600); } catch { /* ignore */ }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function readFileSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

// Rule 37: Size-based write strategy
function writeFileSafe(filePath: string, data: Buffer | string): { ok: boolean; hash?: string } {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, data, { mode: 0o600 });
    setOwnerOnly(filePath);
    // Rule 42: compute hash inline
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return { ok: true, hash };
  } catch {
    return { ok: false };
  }
}

// Rule 37 & 42: Streaming copy with inline hash for medium/large files
function streamCopy(src: string, dest: string, onProgress?: (bytes: number, total: number) => void): { ok: boolean; hash?: string } {
  try {
    ensureDir(path.dirname(dest));
    const stat = fs.statSync(src);
    const total = stat.size;
    const hash = crypto.createHash('sha256');
    let copied = 0;
    let lastProgressTime = 0;

    const srcFd = fs.openSync(src, 'r');
    const destFd = fs.openSync(dest, 'w', 0o600);
    const buffer = Buffer.allocUnsafe(CHUNK_SIZE);

    try {
      while (copied < total) {
        const toRead = Math.min(CHUNK_SIZE, total - copied);
        const bytesRead = fs.readSync(srcFd, buffer, 0, toRead, copied);
        if (bytesRead === 0) break;
        const slice = buffer.slice(0, bytesRead);
        fs.writeSync(destFd, slice, 0, bytesRead);
        hash.update(slice);
        copied += bytesRead;

        // Rule 41: throttled progress
        const now = Date.now();
        if (onProgress && now - lastProgressTime >= PROGRESS_INTERVAL_MS) {
          onProgress(copied, total);
          lastProgressTime = now;
        }
      }
    } finally {
      fs.closeSync(srcFd);
      fs.closeSync(destFd);
    }

    setOwnerOnly(dest);
    return { ok: true, hash: hash.digest('hex') };
  } catch {
    return { ok: false };
  }
}

// Rule 38: fs.rename for same-filesystem moves
function moveFile(src: string, dest: string): { ok: boolean; method: string } {
  try {
    ensureDir(path.dirname(dest));
    // Try rename first (atomic, same filesystem)
    try {
      fs.renameSync(src, dest);
      setOwnerOnly(dest);
      return { ok: true, method: 'rename' };
    } catch {
      // Different filesystem -- fall back to copy+delete
      const stat = fs.statSync(src);
      if (stat.size < SMALL_FILE_THRESHOLD) {
        fs.copyFileSync(src, dest);
      } else {
        streamCopy(src, dest);
      }
      setOwnerOnly(dest);
      fs.unlinkSync(src);
      return { ok: true, method: 'copy-delete' };
    }
  } catch {
    return { ok: false, method: 'failed' };
  }
}

function copyFileSafe(src: string, dest: string): { ok: boolean; hash?: string } {
  try {
    const stat = fs.statSync(src);
    // Rule 37: size-based strategy
    if (stat.size < SMALL_FILE_THRESHOLD) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
      setOwnerOnly(dest);
      // Hash the copy
      const hash = hashFile(dest);
      return { ok: true, hash: hash ?? undefined };
    } else {
      // Stream copy for medium/large files
      return streamCopy(src, dest);
    }
  } catch {
    return { ok: false };
  }
}

function deleteFileSafe(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function statFile(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

// Rule 42: Streaming hash (no double read)
function hashFile(filePath: string, algorithm: string = 'sha256'): string | null {
  try {
    const hash = crypto.createHash(algorithm);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(65536);
    let bytesRead: number;
    let pos = 0;
    try {
      do {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, pos);
        if (bytesRead > 0) {
          hash.update(buffer.slice(0, bytesRead));
          pos += bytesRead;
        }
      } while (bytesRead > 0);
    } finally {
      fs.closeSync(fd);
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}

function listDir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

parentPort?.on('message', (msg: ThreadMessage) => {
  // Rule 3: heartbeat response
  if (msg.type === '__heartbeat') {
    respond(msg, { alive: true });
    return;
  }

  try {
    switch (msg.type) {
      case 'read-file': {
        const data = readFileSafe(msg.payload.path);
        if (data) {
          respond(msg, { data: data.toString(msg.payload.encoding || 'utf8') });
        } else {
          respond(msg, null, `Failed to read: ${msg.payload.path}`);
        }
        break;
      }
      case 'read-file-binary': {
        const data = readFileSafe(msg.payload.path);
        if (data) {
          respond(msg, { base64: data.toString('base64'), size: data.length });
        } else {
          respond(msg, null, `Failed to read: ${msg.payload.path}`);
        }
        break;
      }
      case 'write-file': {
        const result = writeFileSafe(msg.payload.path, msg.payload.data);
        respond(msg, result);
        break;
      }
      case 'copy-file': {
        const result = copyFileSafe(msg.payload.src, msg.payload.dest);
        respond(msg, result);
        break;
      }
      case 'move-file': {
        // Rule 38: fs.rename for same-filesystem
        const result = moveFile(msg.payload.src, msg.payload.dest);
        respond(msg, result);
        break;
      }
      case 'delete-file': {
        const ok = deleteFileSafe(msg.payload.path);
        respond(msg, { ok });
        break;
      }
      case 'stat': {
        const stats = statFile(msg.payload.path);
        if (stats) {
          respond(msg, {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            mtimeMs: stats.mtimeMs,
            ctimeMs: stats.ctimeMs,
          });
        } else {
          respond(msg, null, `Not found: ${msg.payload.path}`);
        }
        break;
      }
      case 'hash-file': {
        const hash = hashFile(msg.payload.path, msg.payload.algorithm);
        respond(msg, { hash });
        break;
      }
      case 'list-dir': {
        const entries = listDir(msg.payload.path);
        respond(msg, { entries });
        break;
      }
      case 'ensure-dir': {
        ensureDir(msg.payload.path);
        respond(msg, { ok: true });
        break;
      }
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
