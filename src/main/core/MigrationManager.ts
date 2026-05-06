// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { app, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
  checksum: string;
}

interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
  success: number;
  execution_ms: number;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        folder_id TEXT,
        pinned INTEGER DEFAULT 0,
        trashed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        word_count INTEGER DEFAULT 0,
        color TEXT DEFAULT NULL,
        tags TEXT DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS note_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        due_date TEXT DEFAULT NULL,
        completed_at TEXT DEFAULT NULL,
        board_id TEXT,
        column_id TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        tags TEXT DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS task_boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        columns TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS media_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        width INTEGER DEFAULT NULL,
        height INTEGER DEFAULT NULL,
        duration_seconds REAL DEFAULT NULL,
        thumbnail_path TEXT DEFAULT NULL,
        tags TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        imported_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS recycle_bin (
        id TEXT PRIMARY KEY,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_data TEXT NOT NULL,
        deleted_at TEXT DEFAULT (datetime('now')),
        auto_purge_at TEXT
      );
    `,
    down: `
      DROP TABLE IF EXISTS recycle_bin;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS media_files;
      DROP TABLE IF EXISTS task_boards;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS note_folders;
      DROP TABLE IF EXISTS notes;
    `,
    checksum: ''
  },
  {
    version: 2,
    name: 'add_automation_tables',
    up: `
      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        trigger_type TEXT NOT NULL,
        trigger_config TEXT DEFAULT '{}',
        action_type TEXT NOT NULL,
        action_config TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        last_run_at TEXT DEFAULT NULL,
        run_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT DEFAULT '',
        executed_at TEXT DEFAULT (datetime('now')),
        duration_ms INTEGER DEFAULT 0
      );
    `,
    down: `
      DROP TABLE IF EXISTS automation_logs;
      DROP TABLE IF EXISTS automation_rules;
    `,
    checksum: ''
  },
  {
    version: 3,
    name: 'add_version_history',
    up: `
      CREATE TABLE IF NOT EXISTS version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_version_history_item ON version_history(item_type, item_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_version_history_item;
      DROP TABLE IF EXISTS version_history;
    `,
    checksum: ''
  },
  {
    version: 4,
    name: 'add_tags_table',
    up: `
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT NULL,
        usage_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tag_id, item_type, item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tag_assignments_item ON tag_assignments(item_type, item_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tag_assignments_item;
      DROP TABLE IF EXISTS tag_assignments;
      DROP TABLE IF EXISTS tags;
    `,
    checksum: ''
  },
  {
    version: 5,
    name: 'add_time_tracking',
    up: `
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        project TEXT DEFAULT '',
        description TEXT DEFAULT '',
        start_time TEXT NOT NULL,
        end_time TEXT DEFAULT NULL,
        duration_seconds INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
    `,
    down: `
      DROP INDEX IF EXISTS idx_time_entries_start;
      DROP TABLE IF EXISTS time_entries;
    `,
    checksum: ''
  },
  {
    version: 6,
    name: 'add_personal_changelog',
    up: `
      CREATE TABLE IF NOT EXISTS personal_changelog (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        related_id TEXT DEFAULT NULL,
        related_type TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_personal_changelog_date ON personal_changelog(date DESC);
    `,
    down: `
      DROP INDEX IF EXISTS idx_personal_changelog_date;
      DROP TABLE IF EXISTS personal_changelog;
    `,
    checksum: ''
  },
  {
    version: 7,
    name: 'add_display_and_window_tables',
    up: `
      CREATE TABLE IF NOT EXISTS displays (
        id TEXT PRIMARY KEY,
        label TEXT,
        bounds_x INTEGER, bounds_y INTEGER, bounds_w INTEGER, bounds_h INTEGER,
        work_area_x INTEGER, work_area_y INTEGER, work_area_w INTEGER, work_area_h INTEGER,
        scale_factor REAL,
        rotation INTEGER,
        internal INTEGER,
        last_seen TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS window_placements (
        window_id TEXT PRIMARY KEY,
        display_id TEXT,
        x INTEGER, y INTEGER, width INTEGER, height INTEGER,
        maximized INTEGER DEFAULT 0,
        fullscreen INTEGER DEFAULT 0,
        saved_at TEXT DEFAULT (datetime('now'))
      );
    `,
    down: `
      DROP TABLE IF EXISTS window_placements;
      DROP TABLE IF EXISTS displays;
    `,
    checksum: ''
  },
  {
    version: 8,
    name: 'add_licensing_tables',
    up: `
      CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY,
        license_key TEXT,
        tier TEXT DEFAULT 'free',
        machine_id TEXT,
        verification_hash TEXT,
        activated_at TEXT,
        trial_start TEXT,
        trial_end TEXT
      );
      CREATE TABLE IF NOT EXISTS telemetry_settings (
        id INTEGER PRIMARY KEY,
        usage_opted_in INTEGER DEFAULT 0,
        crash_opted_in INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `,
    down: `
      DROP TABLE IF EXISTS telemetry_settings;
      DROP TABLE IF EXISTS license;
    `,
    checksum: ''
  },
  {
    version: 9,
    name: 'add_help_system_tables',
    up: `
      CREATE TABLE IF NOT EXISTS help_articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        keys TEXT NOT NULL,
        category TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS feature_discovery (
        id TEXT PRIMARY KEY,
        feature_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_selector TEXT,
        shown_at TEXT DEFAULT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS feature_discovery;
      DROP TABLE IF EXISTS keyboard_shortcuts;
      DROP TABLE IF EXISTS help_articles;
    `,
    checksum: ''
  },
  {
    version: 10,
    name: 'add_locale_and_backup_tables',
    up: `
      CREATE TABLE IF NOT EXISTS locale_settings (
        id INTEGER PRIMARY KEY,
        locale TEXT DEFAULT 'en'
      );
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT DEFAULT '',
        databases TEXT DEFAULT '[]',
        checksum TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS backup_settings (
        id INTEGER PRIMARY KEY,
        auto_enabled INTEGER DEFAULT 1,
        interval_hours INTEGER DEFAULT 24,
        max_backups INTEGER DEFAULT 10,
        backup_path TEXT DEFAULT '',
        last_auto_backup TEXT DEFAULT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `,
    down: `
      DROP TABLE IF EXISTS backup_settings;
      DROP TABLE IF EXISTS backups;
      DROP TABLE IF EXISTS locale_settings;
    `,
    checksum: ''
  }
];

function computeChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql.trim()).digest('hex').substring(0, 16);
}

for (const m of MIGRATIONS) {
  m.checksum = computeChecksum(m.up);
}

export class MigrationManager {
  private db: Database.Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now')),
          success INTEGER DEFAULT 1,
          execution_ms INTEGER DEFAULT 0
        );
      `);

      this.runPendingMigrations();
      this.setupIPC();
      this.initialized = true;
      log.info('[MigrationManager] Initialized. Current version:', this.getCurrentVersion());
    } catch (err) {
      log.error('[MigrationManager] Initialization failed:', err);
    }
  }

  private getCurrentVersion(): number {
    if (!this.db) return 0;
    const row = this.db.prepare(
      'SELECT MAX(version) as ver FROM schema_migrations WHERE success = 1'
    ).get() as any;
    return row?.ver || 0;
  }

  private getAppliedMigrations(): MigrationRecord[] {
    if (!this.db) return [];
    return this.db.prepare(
      'SELECT version, name, checksum, applied_at, success, execution_ms FROM schema_migrations ORDER BY version'
    ).all() as MigrationRecord[];
  }

  private runPendingMigrations(): void {
    if (!this.db) return;

    const applied = this.getAppliedMigrations();
    const appliedMap = new Map(applied.map(a => [a.version, a]));

    for (const existing of applied) {
      const migration = MIGRATIONS.find(m => m.version === existing.version);
      if (migration && existing.checksum !== migration.checksum) {
        log.warn(
          `[MigrationManager] Checksum mismatch for migration ${existing.version} (${existing.name}). ` +
          `Expected: ${migration.checksum}, Found: ${existing.checksum}. Skipping re-run.`
        );
      }
    }

    for (const migration of MIGRATIONS) {
      if (appliedMap.has(migration.version)) continue;

      log.info(`[MigrationManager] Running migration ${migration.version}: ${migration.name}`);
      const start = Date.now();
      const txn = this.db.transaction(() => {
        this.db!.exec(migration.up);
      });

      try {
        txn();
        const elapsed = Date.now() - start;
        this.db.prepare(
          'INSERT INTO schema_migrations (version, name, checksum, success, execution_ms) VALUES (?, ?, ?, 1, ?)'
        ).run(migration.version, migration.name, migration.checksum, elapsed);
        log.info(`[MigrationManager] Migration ${migration.version} completed in ${elapsed}ms`);
      } catch (err) {
        const elapsed = Date.now() - start;
        log.error(`[MigrationManager] Migration ${migration.version} failed:`, err);
        this.db.prepare(
          'INSERT OR REPLACE INTO schema_migrations (version, name, checksum, success, execution_ms) VALUES (?, ?, ?, 0, ?)'
        ).run(migration.version, migration.name, migration.checksum, elapsed);
        throw err;
      }
    }
  }

  rollback(targetVersion: number): { success: boolean; rolledBack: number[] } {
    if (!this.db) return { success: false, rolledBack: [] };

    const currentVersion = this.getCurrentVersion();
    if (targetVersion >= currentVersion) {
      return { success: true, rolledBack: [] };
    }

    const toRollback = MIGRATIONS
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    const rolledBack: number[] = [];

    for (const migration of toRollback) {
      log.info(`[MigrationManager] Rolling back migration ${migration.version}: ${migration.name}`);
      try {
        const txn = this.db.transaction(() => {
          this.db!.exec(migration.down);
          this.db!.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
        });
        txn();
        rolledBack.push(migration.version);
        log.info(`[MigrationManager] Rolled back migration ${migration.version}`);
      } catch (err) {
        log.error(`[MigrationManager] Rollback of migration ${migration.version} failed:`, err);
        return { success: false, rolledBack };
      }
    }

    return { success: true, rolledBack };
  }

  getStatus(): {
    currentVersion: number;
    latestVersion: number;
    pendingCount: number;
    migrations: Array<{
      version: number;
      name: string;
      status: 'applied' | 'pending' | 'failed';
      appliedAt?: string;
      executionMs?: number;
    }>;
  } {
    const applied = this.getAppliedMigrations();
    const appliedMap = new Map(applied.map(a => [a.version, a]));
    const currentVersion = this.getCurrentVersion();
    const latestVersion = MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;

    const migrations = MIGRATIONS.map(m => {
      const record = appliedMap.get(m.version);
      let status: 'applied' | 'pending' | 'failed' = 'pending';
      if (record) {
        status = record.success ? 'applied' : 'failed';
      }
      return {
        version: m.version,
        name: m.name,
        status,
        appliedAt: record?.applied_at,
        executionMs: record?.execution_ms
      };
    });

    return {
      currentVersion,
      latestVersion,
      pendingCount: migrations.filter(m => m.status === 'pending').length,
      migrations
    };
  }

  private setupIPC(): void {
    ipcMain.handle('migration:get-status', () => this.getStatus());
    ipcMain.handle('migration:get-version', () => this.getCurrentVersion());
    ipcMain.handle('migration:rollback', (_e, targetVersion: number) => {
      return this.rollback(targetVersion);
    });
  }

  destroy(): void {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[MigrationManager] Destroyed');
  }
}

export const migrationManager = new MigrationManager();
