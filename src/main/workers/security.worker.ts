// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Security Thread
// ==========================================================================
// All encryption, hashing, and integrity checks run here.
// Never exposes raw keys outside this thread.
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as crypto from 'crypto';
import * as fs from 'fs';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Key management (in-memory only, never leaves this thread)
// ---------------------------------------------------------------------------
let masterKeyBuffer: Buffer | null = null;

function setMasterKey(keyHex: string): void {
  masterKeyBuffer = Buffer.from(keyHex, 'hex');
}

function clearMasterKey(): void {
  if (masterKeyBuffer) {
    masterKeyBuffer.fill(0);
    masterKeyBuffer = null;
  }
}

function deriveDbKey(dbName: string): Buffer {
  if (!masterKeyBuffer) throw new Error('Master key not set');
  return crypto.hkdfSync('sha256', masterKeyBuffer, Buffer.alloc(0), Buffer.from(dbName, 'utf8'), 32) as unknown as Buffer;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------
function hashData(data: string | Buffer, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

function hashFile(filePath: string, algorithm: string = 'sha256'): string {
  const data = fs.readFileSync(filePath);
  return hashData(data, algorithm);
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------
function encrypt(plaintext: string, keyHex: string): { ciphertext: string; iv: string; tag: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { ciphertext, iv: iv.toString('hex'), tag };
}

function decrypt(ciphertext: string, keyHex: string, ivHex: string, tagHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------
function verifyFileHash(filePath: string, expectedHash: string, algorithm: string = 'sha256'): boolean {
  try {
    const actual = hashFile(filePath, algorithm);
    return actual === expectedHash;
  } catch {
    return false;
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
  try {
    switch (msg.type) {
      case 'set-master-key':
        setMasterKey(msg.payload.keyHex);
        respond(msg, { ok: true });
        break;
      case 'clear-master-key':
        clearMasterKey();
        respond(msg, { ok: true });
        break;
      case 'derive-db-key': {
        const derived = deriveDbKey(msg.payload.dbName);
        respond(msg, { keyHex: derived.toString('hex') });
        break;
      }
      case 'hash-data':
        respond(msg, { hash: hashData(msg.payload.data, msg.payload.algorithm) });
        break;
      case 'hash-file':
        respond(msg, { hash: hashFile(msg.payload.filePath, msg.payload.algorithm) });
        break;
      case 'encrypt': {
        const result = encrypt(msg.payload.plaintext, msg.payload.keyHex);
        respond(msg, result);
        break;
      }
      case 'decrypt': {
        const plaintext = decrypt(msg.payload.ciphertext, msg.payload.keyHex, msg.payload.iv, msg.payload.tag);
        respond(msg, { plaintext });
        break;
      }
      case 'verify-hash': {
        const valid = verifyFileHash(msg.payload.filePath, msg.payload.expectedHash, msg.payload.algorithm);
        respond(msg, { valid });
        break;
      }
      case 'random-bytes': {
        const bytes = crypto.randomBytes(msg.payload.size || 32);
        respond(msg, { hex: bytes.toString('hex') });
        break;
      }
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});

process.on('exit', () => clearMasterKey());
