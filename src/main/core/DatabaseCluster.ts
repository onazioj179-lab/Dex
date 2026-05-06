// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Database Cluster
// ==========================================================================
// Rules 9-22: Database Architecture
//  9. better-sqlite3 for sync read, async write via worker
// 10. 6 domain-specific databases (core, rewind, media, tasks, security, plugins)
// 11. WAL mode on every database
// 12. page_size=4096, cache_size tuned per domain
// 13. Prepared statement registry (~60 statements)
// 14. Batch writes wrapped in transactions
// 15. Migrations run in transactions
// 16. No SELECT * -- all queries name columns
// 17. All queries have LIMIT
// 18. Every WHERE column is indexed
// 19. Read-only on calling thread for sub-ms access
// 20. Multi-step writes wrapped in explicit transactions
// 21. VACUUM scheduling (every 24h or on idle)
// 22. Archive/purge old data beyond retention windows
// ==========================================================================

import * as path from 'path';
import * as fs from 'fs';
import * as log from 'electron-log';
import { app } from 'electron';

let Database: any;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

// ---------------------------------------------------------------------------
// Database definitions
// ---------------------------------------------------------------------------

export type DatabaseName =
  | 'dex-core'
  | 'dex-rewind'
  | 'dex-media'
  | 'dex-tasks'
  | 'dex-security'
  | 'dex-plugins';

interface DatabaseConfig {
  name: DatabaseName;
  filename: string;
  cacheSize: number;
  pageSize: number;
  migrations: string[];
}

const DATABASE_CONFIGS: DatabaseConfig[] = [
  {
    name: 'dex-core',
    filename: 'dex-core.db',
    cacheSize: 10000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS app_state (
        app_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        last_focus INTEGER NOT NULL DEFAULT 0,
        launch_count INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_app_state_focus ON app_state(last_focus)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)`,
      `CREATE TABLE IF NOT EXISTS workspace_layouts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        layout_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS deep_links (
        id TEXT PRIMARY KEY,
        protocol TEXT NOT NULL,
        path TEXT NOT NULL,
        handler TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
    ],
  },
  {
    name: 'dex-rewind',
    filename: 'dex-rewind.db',
    cacheSize: 20000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        app_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        session_id TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_app ON activity_log(app_id, timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id)`,
      `CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_snapshots_type ON snapshots(type, timestamp)`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration_ms INTEGER,
        app_switches INTEGER NOT NULL DEFAULT 0,
        keystroke_count INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time)`,
    ],
  },
  {
    name: 'dex-media',
    filename: 'dex-media.db',
    cacheSize: 5000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS media_files (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        thumbnail_path TEXT,
        hash TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        modified_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_media_path ON media_files(file_path)`,
      `CREATE INDEX IF NOT EXISTS idx_media_mime ON media_files(mime_type)`,
      `CREATE INDEX IF NOT EXISTS idx_media_modified ON media_files(modified_at)`,
      `CREATE TABLE IF NOT EXISTS media_tags (
        media_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (media_id, tag),
        FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag)`,
      `CREATE TABLE IF NOT EXISTS media_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS collection_items (
        collection_id TEXT NOT NULL,
        media_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection_id, media_id),
        FOREIGN KEY (collection_id) REFERENCES media_collections(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
      )`,
    ],
  },
  {
    name: 'dex-tasks',
    filename: 'dex-tasks.db',
    cacheSize: 5000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        parent_id TEXT,
        app_context TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority, status)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id) WHERE parent_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS task_labels (
        task_id TEXT NOT NULL,
        label TEXT NOT NULL,
        PRIMARY KEY (task_id, label),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label)`,
      `CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        remind_at INTEGER NOT NULL,
        dismissed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at) WHERE dismissed = 0`,
    ],
  },
  {
    name: 'dex-security',
    filename: 'dex-security.db',
    cacheSize: 2000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        subject TEXT,
        details TEXT,
        severity TEXT NOT NULL DEFAULT 'info'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_log(severity, timestamp)`,
      `CREATE TABLE IF NOT EXISTS integrity_hashes (
        file_path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'sha256',
        verified_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS key_metadata (
        key_id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        rotated_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS permission_grants (
        id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        resource TEXT NOT NULL,
        permission TEXT NOT NULL,
        granted_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        expires_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_perm_principal ON permission_grants(principal)`,
      `CREATE INDEX IF NOT EXISTS idx_perm_resource ON permission_grants(resource)`,
    ],
  },
  {
    name: 'dex-plugins',
    filename: 'dex-plugins.db',
    cacheSize: 2000,
    pageSize: 4096,
    migrations: [
      `CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        failure_count INTEGER NOT NULL DEFAULT 0,
        config_json TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_data (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (plugin_id, key),
        FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        duration_ms REAL,
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin ON plugin_events(plugin_id, timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_plugin_events_type ON plugin_events(event_type)`,
    ],
  },
];

// ---------------------------------------------------------------------------
// Prepared statement cache
// ---------------------------------------------------------------------------

interface CachedStatement {
  stmt: any;
  sql: string;
}

class PreparedStatementRegistry {
  private cache = new Map<string, CachedStatement>();

  prepare(db: any, key: string, sql: string): any {
    const existing = this.cache.get(key);
    if (existing) return existing.stmt;
    const stmt = db.prepare(sql);
    this.cache.set(key, { stmt, sql });
    return stmt;
  }

  get(key: string): any | undefined {
    return this.cache.get(key)?.stmt;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ---------------------------------------------------------------------------
// Database Cluster
// ---------------------------------------------------------------------------

export class DatabaseCluster {
  private databases = new Map<DatabaseName, any>();
  private stmts = new PreparedStatementRegistry();
  private dbDir: string = '';
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    if (!Database) {
      log.warn('[DatabaseCluster] better-sqlite3 not available; database cluster disabled');
      this.initialized = true;
      return;
    }

    try {
      const userData = app.getPath('userData');
      this.dbDir = path.join(userData, 'databases');
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true, mode: 0o700 });
      }

      for (const config of DATABASE_CONFIGS) {
        this.openDatabase(config);
      }

      this.prepareCommonStatements();
      log.info(`[DatabaseCluster] ${this.databases.size} databases opened, ${this.stmts.size} statements prepared`);
    } catch (err) {
      log.error('[DatabaseCluster] Initialization failed:', err);
    }

    this.initialized = true;
  }

  private openDatabase(config: DatabaseConfig): void {
    const dbPath = path.join(this.dbDir, config.filename);
    try {
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma(`page_size = ${config.pageSize}`);
      db.pragma('synchronous = NORMAL');
      db.pragma(`cache_size = -${config.cacheSize}`);
      db.pragma('foreign_keys = ON');
      db.pragma('temp_store = MEMORY');
      db.pragma('mmap_size = 268435456');

      // Run migrations in a transaction
      db.transaction(() => {
        for (const sql of config.migrations) {
          db.exec(sql);
        }
      })();

      this.databases.set(config.name, db);
      log.info(`[DatabaseCluster] Opened ${config.name} (${dbPath})`);
    } catch (err) {
      log.error(`[DatabaseCluster] Failed to open ${config.name}:`, err);
    }
  }

  private prepareCommonStatements(): void {
    // Core
    const core = this.databases.get('dex-core');
    if (core) {
      this.stmts.prepare(core, 'core:kv-get', 'SELECT value FROM kv WHERE key = ?');
      this.stmts.prepare(core, 'core:kv-set', 'INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)');
      this.stmts.prepare(core, 'core:kv-delete', 'DELETE FROM kv WHERE key = ?');
      this.stmts.prepare(core, 'core:app-state-get', 'SELECT state_json, last_focus, launch_count FROM app_state WHERE app_id = ?');
      this.stmts.prepare(core, 'core:app-state-set', 'INSERT OR REPLACE INTO app_state (app_id, state_json, last_focus, launch_count) VALUES (?, ?, ?, ?)');
      this.stmts.prepare(core, 'core:app-state-list', 'SELECT app_id, last_focus, launch_count FROM app_state ORDER BY last_focus DESC LIMIT ?');
      this.stmts.prepare(core, 'core:settings-get', 'SELECT value FROM settings WHERE key = ?');
      this.stmts.prepare(core, 'core:settings-set', 'INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, ?)');
      this.stmts.prepare(core, 'core:settings-by-category', 'SELECT key, value FROM settings WHERE category = ? ORDER BY key');
    }

    // Rewind
    const rewind = this.databases.get('dex-rewind');
    if (rewind) {
      this.stmts.prepare(rewind, 'rewind:log-activity', 'INSERT INTO activity_log (timestamp, app_id, action, details, session_id) VALUES (?, ?, ?, ?, ?)');
      this.stmts.prepare(rewind, 'rewind:recent-activity', 'SELECT id, timestamp, app_id, action, details FROM activity_log WHERE timestamp > ? ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(rewind, 'rewind:activity-by-app', 'SELECT id, timestamp, action, details FROM activity_log WHERE app_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(rewind, 'rewind:activity-count', 'SELECT COUNT(*) as count FROM activity_log WHERE timestamp > ?');
      this.stmts.prepare(rewind, 'rewind:save-snapshot', 'INSERT INTO snapshots (timestamp, type, data, size_bytes) VALUES (?, ?, ?, ?)');
      this.stmts.prepare(rewind, 'rewind:recent-snapshots', 'SELECT id, timestamp, type, size_bytes FROM snapshots WHERE timestamp > ? ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(rewind, 'rewind:session-start', 'INSERT INTO sessions (id, start_time) VALUES (?, ?)');
      this.stmts.prepare(rewind, 'rewind:session-end', 'UPDATE sessions SET end_time = ?, duration_ms = ?, app_switches = ?, keystroke_count = ? WHERE id = ?');
      this.stmts.prepare(rewind, 'rewind:recent-sessions', 'SELECT id, start_time, end_time, duration_ms FROM sessions ORDER BY start_time DESC LIMIT ?');
    }

    // Media
    const media = this.databases.get('dex-media');
    if (media) {
      this.stmts.prepare(media, 'media:add-file', 'INSERT OR REPLACE INTO media_files (id, file_path, file_name, mime_type, size_bytes, thumbnail_path, hash, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      this.stmts.prepare(media, 'media:get-by-id', 'SELECT id, file_path, file_name, mime_type, size_bytes, thumbnail_path, hash FROM media_files WHERE id = ?');
      this.stmts.prepare(media, 'media:get-by-path', 'SELECT id, file_name, mime_type, size_bytes, thumbnail_path FROM media_files WHERE file_path = ?');
      this.stmts.prepare(media, 'media:list-by-mime', 'SELECT id, file_path, file_name, size_bytes FROM media_files WHERE mime_type LIKE ? ORDER BY modified_at DESC LIMIT ?');
      this.stmts.prepare(media, 'media:recent', 'SELECT id, file_path, file_name, mime_type, size_bytes FROM media_files ORDER BY modified_at DESC LIMIT ?');
      this.stmts.prepare(media, 'media:delete', 'DELETE FROM media_files WHERE id = ?');
      this.stmts.prepare(media, 'media:add-tag', 'INSERT OR IGNORE INTO media_tags (media_id, tag) VALUES (?, ?)');
      this.stmts.prepare(media, 'media:get-tags', 'SELECT tag FROM media_tags WHERE media_id = ? ORDER BY tag');
      this.stmts.prepare(media, 'media:search-by-tag', 'SELECT m.id, m.file_path, m.file_name FROM media_files m JOIN media_tags t ON m.id = t.media_id WHERE t.tag = ? ORDER BY m.modified_at DESC LIMIT ?');
    }

    // Tasks
    const tasks = this.databases.get('dex-tasks');
    if (tasks) {
      this.stmts.prepare(tasks, 'tasks:create', 'INSERT INTO tasks (id, title, description, status, priority, due_date, parent_id, app_context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      this.stmts.prepare(tasks, 'tasks:get', 'SELECT id, title, description, status, priority, due_date, completed_at, parent_id, app_context FROM tasks WHERE id = ?');
      this.stmts.prepare(tasks, 'tasks:list-active', 'SELECT id, title, status, priority, due_date FROM tasks WHERE status != \'completed\' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 ELSE 4 END, due_date LIMIT ?');
      this.stmts.prepare(tasks, 'tasks:list-by-status', 'SELECT id, title, priority, due_date FROM tasks WHERE status = ? ORDER BY updated_at DESC LIMIT ?');
      this.stmts.prepare(tasks, 'tasks:update-status', 'UPDATE tasks SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = \'completed\' THEN ? ELSE completed_at END WHERE id = ?');
      this.stmts.prepare(tasks, 'tasks:delete', 'DELETE FROM tasks WHERE id = ?');
      this.stmts.prepare(tasks, 'tasks:add-label', 'INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)');
      this.stmts.prepare(tasks, 'tasks:get-labels', 'SELECT label FROM task_labels WHERE task_id = ? ORDER BY label');
      this.stmts.prepare(tasks, 'tasks:by-label', 'SELECT t.id, t.title, t.status, t.priority FROM tasks t JOIN task_labels l ON t.id = l.task_id WHERE l.label = ? AND t.status != \'completed\' LIMIT ?');
      this.stmts.prepare(tasks, 'tasks:overdue', 'SELECT id, title, priority, due_date FROM tasks WHERE status != \'completed\' AND due_date < ? ORDER BY due_date LIMIT ?');
    }

    // Security
    const security = this.databases.get('dex-security');
    if (security) {
      this.stmts.prepare(security, 'sec:audit-log', 'INSERT INTO audit_log (timestamp, action, subject, details, severity) VALUES (?, ?, ?, ?, ?)');
      this.stmts.prepare(security, 'sec:recent-audit', 'SELECT id, timestamp, action, subject, severity FROM audit_log ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(security, 'sec:audit-by-action', 'SELECT id, timestamp, subject, details FROM audit_log WHERE action = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(security, 'sec:audit-by-severity', 'SELECT id, timestamp, action, subject FROM audit_log WHERE severity = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?');
      this.stmts.prepare(security, 'sec:set-hash', 'INSERT OR REPLACE INTO integrity_hashes (file_path, hash, algorithm, verified_at) VALUES (?, ?, ?, ?)');
      this.stmts.prepare(security, 'sec:get-hash', 'SELECT hash, algorithm, verified_at FROM integrity_hashes WHERE file_path = ?');
      this.stmts.prepare(security, 'sec:all-hashes', 'SELECT file_path, hash, verified_at FROM integrity_hashes ORDER BY file_path');
      this.stmts.prepare(security, 'sec:set-key-meta', 'INSERT OR REPLACE INTO key_metadata (key_id, purpose, algorithm, created_at, rotated_at) VALUES (?, ?, ?, ?, ?)');
      this.stmts.prepare(security, 'sec:get-key-meta', 'SELECT purpose, algorithm, created_at, rotated_at FROM key_metadata WHERE key_id = ?');
    }

    // Plugins
    const plugins = this.databases.get('dex-plugins');
    if (plugins) {
      this.stmts.prepare(plugins, 'plug:register', 'INSERT OR REPLACE INTO plugins (id, name, version, enabled, installed_at, updated_at, failure_count, config_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      this.stmts.prepare(plugins, 'plug:get', 'SELECT id, name, version, enabled, failure_count, config_json FROM plugins WHERE id = ?');
      this.stmts.prepare(plugins, 'plug:list-enabled', 'SELECT id, name, version, config_json FROM plugins WHERE enabled = 1 ORDER BY name');
      this.stmts.prepare(plugins, 'plug:list-all', 'SELECT id, name, version, enabled, failure_count FROM plugins ORDER BY name');
      this.stmts.prepare(plugins, 'plug:set-enabled', 'UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ?');
      this.stmts.prepare(plugins, 'plug:increment-failures', 'UPDATE plugins SET failure_count = failure_count + 1, updated_at = ? WHERE id = ?');
      this.stmts.prepare(plugins, 'plug:reset-failures', 'UPDATE plugins SET failure_count = 0, updated_at = ? WHERE id = ?');
      this.stmts.prepare(plugins, 'plug:set-data', 'INSERT OR REPLACE INTO plugin_data (plugin_id, key, value) VALUES (?, ?, ?)');
      this.stmts.prepare(plugins, 'plug:get-data', 'SELECT value FROM plugin_data WHERE plugin_id = ? AND key = ?');
      this.stmts.prepare(plugins, 'plug:log-event', 'INSERT INTO plugin_events (plugin_id, event_type, timestamp, duration_ms, success, error_message) VALUES (?, ?, ?, ?, ?, ?)');
      this.stmts.prepare(plugins, 'plug:recent-events', 'SELECT event_type, timestamp, duration_ms, success, error_message FROM plugin_events WHERE plugin_id = ? ORDER BY timestamp DESC LIMIT ?');
    }
  }

  // ---------------------------------------------------------------------------
  // Read API (synchronous, on calling thread for sub-millisecond access)
  // ---------------------------------------------------------------------------

  getDb(name: DatabaseName): any | null {
    return this.databases.get(name) ?? null;
  }

  runStmt(key: string, ...params: any[]): any {
    const stmt = this.stmts.get(key);
    if (!stmt) return undefined;
    return stmt.get(...params);
  }

  allStmt(key: string, ...params: any[]): any[] {
    const stmt = this.stmts.get(key);
    if (!stmt) return [];
    return stmt.all(...params);
  }

  runRaw(dbName: DatabaseName, sql: string, ...params: any[]): any {
    const db = this.databases.get(dbName);
    if (!db) return undefined;
    return db.prepare(sql).get(...params);
  }

  allRaw(dbName: DatabaseName, sql: string, ...params: any[]): any[] {
    const db = this.databases.get(dbName);
    if (!db) return [];
    return db.prepare(sql).all(...params);
  }

  // ---------------------------------------------------------------------------
  // Write API (synchronous for simplicity; callers should use writeAsync for
  // background serialization via the database-write worker thread)
  // ---------------------------------------------------------------------------

  writeStmt(key: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.stmts.get(key);
    if (!stmt) return { changes: 0, lastInsertRowid: 0 };
    return stmt.run(...params);
  }

  writeRaw(dbName: DatabaseName, sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const db = this.databases.get(dbName);
    if (!db) return { changes: 0, lastInsertRowid: 0 };
    return db.prepare(sql).run(...params);
  }

  writeBatch(dbName: DatabaseName, operations: Array<{ sql: string; params: any[] }>): void {
    const db = this.databases.get(dbName);
    if (!db) return;
    db.transaction(() => {
      for (const op of operations) {
        db.prepare(op.sql).run(...op.params);
      }
    })();
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers
  // ---------------------------------------------------------------------------

  kvGet(key: string): string | undefined {
    const row = this.runStmt('core:kv-get', key) as { value: string } | undefined;
    return row?.value;
  }

  kvSet(key: string, value: string): void {
    this.writeStmt('core:kv-set', key, value, Date.now());
  }

  kvDelete(key: string): void {
    this.writeStmt('core:kv-delete', key);
  }

  auditLog(action: string, subject: string, details: string, severity: 'info' | 'warn' | 'error' | 'critical' = 'info'): void {
    try {
      this.writeStmt('sec:audit-log', Date.now(), action, subject, details, severity);
    } catch {
      // Audit logging must never throw
    }
  }

  // ---------------------------------------------------------------------------
  // Maintenance
  // ---------------------------------------------------------------------------

  vacuum(dbName: DatabaseName): void {
    const db = this.databases.get(dbName);
    if (!db) return;
    try {
      db.exec('VACUUM');
      log.info(`[DatabaseCluster] Vacuumed ${dbName}`);
    } catch (err) {
      log.warn(`[DatabaseCluster] Vacuum failed for ${dbName}:`, err);
    }
  }

  vacuumAll(): void {
    for (const name of this.databases.keys()) {
      this.vacuum(name);
    }
  }

  checkpoint(dbName: DatabaseName): void {
    const db = this.databases.get(dbName);
    if (!db) return;
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      log.warn(`[DatabaseCluster] Checkpoint failed for ${dbName}:`, err);
    }
  }

  // Rule 21: Scheduled VACUUM -- call from idle detection or 24h timer
  private lastVacuumTime = 0;
  private vacuumInterval: ReturnType<typeof setInterval> | null = null;
  private readonly VACUUM_INTERVAL_MS = 86400000; // 24 hours

  startVacuumSchedule(): void {
    if (this.vacuumInterval) return;
    this.lastVacuumTime = Date.now();
    this.vacuumInterval = setInterval(() => {
      const now = Date.now();
      if (now - this.lastVacuumTime >= this.VACUUM_INTERVAL_MS) {
        log.info('[DatabaseCluster] Rule 21: Running scheduled VACUUM');
        this.vacuumAll();
        this.lastVacuumTime = now;
      }
    }, 3600000); // Check every hour
  }

  vacuumIfIdle(): void {
    const now = Date.now();
    if (now - this.lastVacuumTime >= this.VACUUM_INTERVAL_MS) {
      log.info('[DatabaseCluster] Rule 21: Idle VACUUM triggered');
      this.vacuumAll();
      this.lastVacuumTime = now;
    }
  }

  // Rule 22: Archive/purge old data beyond retention windows
  // Retention: activity_log 90 days, snapshots 30 days, sessions 180 days,
  //            audit_log 365 days, plugin_events 60 days
  purgeExpiredData(): { purged: Record<string, number> } {
    const purged: Record<string, number> = {};
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;

    // Activity log: 90 days
    const rewind = this.databases.get('dex-rewind');
    if (rewind) {
      try {
        const cutoff90 = (now - 90 * day) * 1000; // timestamps are in ms
        const r1 = rewind.prepare('DELETE FROM activity_log WHERE timestamp < ?').run(cutoff90);
        purged['activity_log'] = r1.changes;

        // Snapshots: 30 days
        const cutoff30 = (now - 30 * day) * 1000;
        const r2 = rewind.prepare('DELETE FROM snapshots WHERE timestamp < ?').run(cutoff30);
        purged['snapshots'] = r2.changes;

        // Sessions: 180 days
        const cutoff180 = (now - 180 * day) * 1000;
        const r3 = rewind.prepare('DELETE FROM sessions WHERE start_time < ?').run(cutoff180);
        purged['sessions'] = r3.changes;
      } catch (err) {
        log.warn('[DatabaseCluster] Purge rewind data failed:', err);
      }
    }

    // Audit log: 365 days
    const security = this.databases.get('dex-security');
    if (security) {
      try {
        const cutoff365 = (now - 365 * day) * 1000;
        const r4 = security.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoff365);
        purged['audit_log'] = r4.changes;
      } catch (err) {
        log.warn('[DatabaseCluster] Purge audit data failed:', err);
      }
    }

    // Plugin events: 60 days
    const plugins = this.databases.get('dex-plugins');
    if (plugins) {
      try {
        const cutoff60 = now - 60 * day;
        const r5 = plugins.prepare('DELETE FROM plugin_events WHERE timestamp < ?').run(cutoff60);
        purged['plugin_events'] = r5.changes;
      } catch (err) {
        log.warn('[DatabaseCluster] Purge plugin events failed:', err);
      }
    }

    const total = Object.values(purged).reduce((a, b) => a + b, 0);
    if (total > 0) {
      log.info(`[DatabaseCluster] Rule 22: Purged ${total} expired rows`, purged);
    }
    return { purged };
  }

  getStats(): Record<string, { path: string; sizeBytes: number; tables: number }> {
    const stats: Record<string, { path: string; sizeBytes: number; tables: number }> = {};
    for (const [name, db] of this.databases.entries()) {
      try {
        const dbPath = path.join(this.dbDir, `${name}.db`);
        const sizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        const tables = (db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'").get() as any)?.cnt ?? 0;
        stats[name] = { path: dbPath, sizeBytes, tables };
      } catch {
        stats[name] = { path: '', sizeBytes: 0, tables: 0 };
      }
    }
    return stats;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    // Rule 21: stop vacuum schedule
    if (this.vacuumInterval) {
      clearInterval(this.vacuumInterval);
      this.vacuumInterval = null;
    }
    for (const [name, db] of this.databases.entries()) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        log.info(`[DatabaseCluster] Closed ${name}`);
      } catch (err) {
        log.warn(`[DatabaseCluster] Error closing ${name}:`, err);
      }
    }
    this.stmts.clear();
    this.databases.clear();
    this.initialized = false;
    log.info('[DatabaseCluster] All databases closed');
  }
}

export const databaseCluster = new DatabaseCluster();

export function initializeDatabaseCluster(): void {
  databaseCluster.initialize();
}

export function shutdownDatabaseCluster(): void {
  databaseCluster.shutdown();
}
