// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Database Write Thread
// ==========================================================================
// ALL SQLite write operations are serialized through this single thread
// to prevent write contention. Reads happen on the calling thread.
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as path from 'path';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// better-sqlite3 is synchronous, ideal for a dedicated write thread
let Database: any;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.warn('[DatabaseWrite] better-sqlite3 not available, database operations disabled:', e);
  Database = null;
}

const openDatabases = new Map<string, any>();

function getDb(dbPath: string): any {
  if (openDatabases.has(dbPath)) return openDatabases.get(dbPath);
  if (!Database) return null;
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('page_size = 4096');
    db.pragma('foreign_keys = ON');
    openDatabases.set(dbPath, db);
    return db;
  } catch {
    return null;
  }
}

function closeAll(): void {
  for (const [, db] of openDatabases) {
    try { db.close(); } catch { /* ignore */ }
  }
  openDatabases.clear();
}

function runWrite(dbPath: string, sql: string, params: any[]): { changes: number; lastInsertRowid: number } {
  const db = getDb(dbPath);
  if (!db) throw new Error(`Cannot open database: ${dbPath}`);
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
}

function runBatchWrite(dbPath: string, statements: Array<{ sql: string; params: any[] }>): number {
  const db = getDb(dbPath);
  if (!db) throw new Error(`Cannot open database: ${dbPath}`);
  let totalChanges = 0;
  const transaction = db.transaction(() => {
    for (const { sql, params } of statements) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      totalChanges += result.changes;
    }
  });
  transaction();
  return totalChanges;
}

function runExec(dbPath: string, sql: string): void {
  const db = getDb(dbPath);
  if (!db) throw new Error(`Cannot open database: ${dbPath}`);
  db.exec(sql);
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
      case 'write': {
        const { dbPath, sql, params } = msg.payload;
        const result = runWrite(dbPath, sql, params || []);
        respond(msg, result);
        break;
      }
      case 'batch-write': {
        const { dbPath, statements } = msg.payload;
        const totalChanges = runBatchWrite(dbPath, statements);
        respond(msg, { totalChanges });
        break;
      }
      case 'exec': {
        const { dbPath, sql } = msg.payload;
        runExec(dbPath, sql);
        respond(msg, { ok: true });
        break;
      }
      case 'open': {
        const db = getDb(msg.payload.dbPath);
        respond(msg, { ok: db !== null });
        break;
      }
      case 'close': {
        const db = openDatabases.get(msg.payload.dbPath);
        if (db) {
          try { db.close(); } catch { /* ignore */ }
          openDatabases.delete(msg.payload.dbPath);
        }
        respond(msg, { ok: true });
        break;
      }
      case 'close-all': {
        closeAll();
        respond(msg, { ok: true });
        break;
      }
      case 'vacuum': {
        const db = getDb(msg.payload.dbPath);
        if (db) db.exec('VACUUM');
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

process.on('exit', () => closeAll());
