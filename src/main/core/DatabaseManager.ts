// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Central SQLite Database Manager
// Single database connection shared by all DEX subsystems.
// All tables created on first run. No migrations needed.
// ==========================================================================

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as log from 'electron-log';

let Database: any;
try {
  Database = require('better-sqlite3');
} catch {
  log.warn('[DatabaseManager] better-sqlite3 not available, using in-memory fallback');
}

export class DatabaseManager {
  private db: any = null;
  private dbPath: string;
  private initialized = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'databases');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbPath = path.join(dbDir, 'dex.db');
  }

  initialize(): void {
    if (this.initialized) return;
    try {
      if (!Database) {
        log.warn('[DatabaseManager] SQLite not available -- running without persistence');
        this.initialized = true; // Don't retry -- graceful degradation
        return;
      }
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000');

      // Quick integrity check after potential crash recovery
      try {
        const check = this.db.pragma('quick_check');
        if (check?.[0]?.quick_check !== 'ok') {
          log.warn('[DatabaseManager] Integrity check returned:', check);
        }
      } catch (intErr) {
        log.warn('[DatabaseManager] Integrity check failed:', intErr);
      }

      this.createTables();
      this.initialized = true;
      log.info('[DatabaseManager] Database initialized at', this.dbPath);
    } catch (err) {
      log.warn('[DatabaseManager] SQLite unavailable -- running without persistence:', (err as Error).message);
      this.initialized = true; // Don't retry -- graceful degradation
    }
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        action TEXT DEFAULT NULL,
        read INTEGER DEFAULT 0,
        delivery TEXT DEFAULT 'all',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_preferences (
        app TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        delivery TEXT DEFAULT 'all'
      );

      CREATE TABLE IF NOT EXISTS media_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        duration INTEGER DEFAULT NULL,
        width INTEGER DEFAULT NULL,
        height INTEGER DEFAULT NULL,
        imported_by TEXT NOT NULL,
        last_used INTEGER NOT NULL,
        use_count INTEGER DEFAULT 1,
        thumbnail TEXT DEFAULT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        snapshot BLOB NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        auto_saved INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS recycle_bin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_data TEXT NOT NULL,
        original_location TEXT DEFAULT '',
        deleted_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_layouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        layout_data TEXT NOT NULL,
        built_in INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scratchpad (
        id INTEGER PRIMARY KEY DEFAULT 1,
        content TEXT DEFAULT '',
        position_x INTEGER DEFAULT -1,
        position_y INTEGER DEFAULT -1,
        width INTEGER DEFAULT 400,
        height INTEGER DEFAULT 300,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feedback_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        description TEXT NOT NULL,
        system_info TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS detached_windows (
        app_id TEXT PRIMARY KEY,
        x INTEGER DEFAULT -1,
        y INTEGER DEFAULT -1,
        width INTEGER DEFAULT 800,
        height INTEGER DEFAULT 600,
        maximized INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_app ON notifications(app);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
      CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(type);
      CREATE INDEX IF NOT EXISTS idx_media_library_filepath ON media_library(filepath);
      CREATE INDEX IF NOT EXISTS idx_version_history_project ON version_history(app, project_id);
      CREATE INDEX IF NOT EXISTS idx_version_history_timestamp ON version_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_app ON recycle_bin(app);
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON recycle_bin(expires_at);
    `);
  }

  getDatabase(): any {
    if (!this.db) {
      this.initialize();
    }
    return this.db;
  }

  isReady(): boolean {
    return this.initialized && this.db !== null;
  }

  getSetting(key: string, defaultValue: string = ''): string {
    if (!this.db) return defaultValue;
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return;
    this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
  }

  /**
   * Run multiple operations inside a single SQLite transaction.
   * Automatically rolls back on error for atomicity.
   */
  transaction<T>(fn: () => T): T | undefined {
    if (!this.db) return undefined;
    const run = this.db.transaction(fn);
    return run();
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.initialized = false;
        log.info('[DatabaseManager] Database closed');
      } catch (err) {
        log.error('[DatabaseManager] Failed to close database:', err);
      }
    }
  }
}

export const databaseManager = new DatabaseManager();
