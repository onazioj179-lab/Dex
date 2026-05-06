// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Rewind Logger Thread
// ==========================================================================
// All activity capture runs here. Never on the main thread.
// Receives events via parentPort, writes journal entries to disk.
// ==========================================================================

import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

const journalDir = process.env.DEX_USER_DATA
  ? path.join(process.env.DEX_USER_DATA, 'rewind', 'journal')
  : path.join(process.cwd(), 'rewind', 'journal');

let writeBuffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 2000;

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) { console.error('[RewindLogger] Failed to create journal directory:', dir, e); }
}

function todayFile(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(journalDir, `${ymd}.jsonl`);
}

function flushBuffer(): void {
  if (writeBuffer.length === 0) return;
  ensureDir(journalDir);
  const filePath = todayFile();
  const data = writeBuffer.join('\n') + '\n';
  writeBuffer = [];
  try {
    fs.appendFileSync(filePath, data, { encoding: 'utf8', mode: 0o600 });
  } catch (e) { console.error('[RewindLogger] Failed to write audit log:', filePath, e); }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

function logActivity(entry: any): void {
  const line = JSON.stringify({
    ...entry,
    _ts: Date.now(),
  });
  writeBuffer.push(line);
  scheduleFlush();
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
      case 'log-activity':
        logActivity(msg.payload);
        respond(msg, { ok: true });
        break;
      case 'flush':
        flushBuffer();
        respond(msg, { ok: true });
        break;
      case 'get-today-count': {
        const fp = todayFile();
        let count = 0;
        try {
          if (fs.existsSync(fp)) {
            const content = fs.readFileSync(fp, 'utf8');
            count = content.split('\n').filter(l => l.trim().length > 0).length;
          }
        } catch { /* ignore */ }
        respond(msg, { count });
        break;
      }
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
