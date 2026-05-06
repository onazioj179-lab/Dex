// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Session Replay Manager (Feature 1)
// Records every significant user action and enables full session replay.
// Stores replay data in SQLite with automatic 7-session cleanup.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { databaseManager } from './DatabaseManager';

export interface ReplayEntry {
  id: number;
  session_id: string;
  action_type: string;
  app: string;
  before_state: string;
  after_state: string;
  timestamp: number;
}

export interface ReplaySession {
  session_id: string;
  start_time: number;
  end_time: number;
  action_count: number;
  duration_ms: number;
}

class SessionReplayManager {
  private mainWindow: BrowserWindow | null = null;
  private currentSessionId: string = '';
  private sessionStartTime: number = 0;
  private readonly MAX_SESSIONS = 7;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.currentSessionId = crypto.randomUUID();
    this.sessionStartTime = Date.now();
    this.createTables();
    this.cleanupOldSessions();
    this.registerIPC();
    log.info('[SessionReplay] Session replay manager initialized, session:', this.currentSessionId);
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_replay (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        app TEXT NOT NULL,
        before_state TEXT,
        after_state TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_replay_session ON session_replay(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_replay_timestamp ON session_replay(timestamp);
    `);
  }

  private cleanupOldSessions(): void {
    const db = this.getDb();
    if (!db) return;

    try {
      const sessions = db.prepare(
        `SELECT DISTINCT session_id, MIN(timestamp) as start_time
         FROM session_replay
         GROUP BY session_id
         ORDER BY start_time DESC`
      ).all();

      if (sessions.length > this.MAX_SESSIONS) {
        const toDelete = sessions.slice(this.MAX_SESSIONS);
        const deleteStmt = db.prepare('DELETE FROM session_replay WHERE session_id = ?');
        for (const s of toDelete) {
          deleteStmt.run(s.session_id);
        }
        log.info(`[SessionReplay] Cleaned up ${toDelete.length} old sessions`);
      }
    } catch (err) {
      log.warn('[SessionReplay] Cleanup error:', err);
    }
  }

  private compressJson(data: any): string {
    try {
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf-8'));
      return compressed.toString('base64');
    } catch {
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  }

  private decompressJson(compressed: string): any {
    try {
      const buffer = Buffer.from(compressed, 'base64');
      const decompressed = zlib.inflateSync(buffer);
      return JSON.parse(decompressed.toString('utf-8'));
    } catch {
      try {
        return JSON.parse(compressed);
      } catch {
        return compressed;
      }
    }
  }

  recordAction(actionType: string, app: string, beforeState: any, afterState: any): number {
    const db = this.getDb();
    if (!db) return -1;

    try {
      const compressedBefore = this.compressJson(beforeState);
      const compressedAfter = this.compressJson(afterState);
      const now = Date.now();

      const result = db.prepare(
        `INSERT INTO session_replay (session_id, action_type, app, before_state, after_state, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(this.currentSessionId, actionType, app, compressedBefore, compressedAfter, now);

      return Number(result.lastInsertRowid);
    } catch (err) {
      log.warn('[SessionReplay] Record error:', err);
      return -1;
    }
  }

  getSessions(): ReplaySession[] {
    const db = this.getDb();
    if (!db) return [];

    try {
      return db.prepare(
        `SELECT session_id,
                MIN(timestamp) as start_time,
                MAX(timestamp) as end_time,
                COUNT(*) as action_count,
                (MAX(timestamp) - MIN(timestamp)) as duration_ms
         FROM session_replay
         GROUP BY session_id
         ORDER BY start_time DESC`
      ).all() as ReplaySession[];
    } catch (err) {
      log.warn('[SessionReplay] getSessions error:', err);
      return [];
    }
  }

  getSessionActions(sessionId: string): ReplayEntry[] {
    const db = this.getDb();
    if (!db) return [];

    try {
      const rows = db.prepare(
        'SELECT * FROM session_replay WHERE session_id = ? ORDER BY timestamp ASC'
      ).all(sessionId) as ReplayEntry[];

      return rows.map(row => ({
        ...row,
        before_state: this.decompressJson(row.before_state),
        after_state: this.decompressJson(row.after_state),
      }));
    } catch (err) {
      log.warn('[SessionReplay] getSessionActions error:', err);
      return [];
    }
  }

  getCurrentSessionId(): string {
    return this.currentSessionId;
  }

  private registerIPC(): void {
    ipcMain.handle('session-replay:getSessions', async () => {
      return this.getSessions();
    });

    ipcMain.handle('session-replay:getSessionActions', async (_event, sessionId: string) => {
      return this.getSessionActions(sessionId);
    });

    ipcMain.handle('session-replay:recordAction', async (_event, actionType: string, app: string, beforeState: any, afterState: any) => {
      return this.recordAction(actionType, app, beforeState, afterState);
    });

    ipcMain.handle('session-replay:getCurrentSession', async () => {
      return { sessionId: this.currentSessionId, startTime: this.sessionStartTime };
    });
  }
}

export const sessionReplayManager = new SessionReplayManager();
