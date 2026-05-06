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
import * as zlib from 'zlib';
import log from 'electron-log';

interface BackupRecord {
  id: string;
  filename: string;
  filepath: string;
  size_bytes: number;
  type: 'automatic' | 'manual' | 'pre_update' | 'pre_restore';
  description: string;
  databases: string[];
  checksum: string;
  created_at: string;
}

interface BackupSettings {
  auto_enabled: boolean;
  interval_hours: number;
  max_backups: number;
  backup_path: string;
  last_auto_backup: string | null;
}

interface RestoreResult {
  success: boolean;
  restoredDatabases: string[];
  errors: string[];
}

const DATABASE_FILES = [
  'dex-core.db',
  'dex-notes.db',
  'help.db'
];

export class BackupRestoreManager {
  private db: Database.Database | null = null;
  private initialized = false;
  private autoBackupTimer: ReturnType<typeof setInterval> | null = null;
  private backupDir: string = '';

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
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
      `);

      const settingsRow = this.db.prepare('SELECT id FROM backup_settings WHERE id = 1').get();
      if (!settingsRow) {
        this.backupDir = path.join(userDataPath, 'backups');
        this.db.prepare(
          'INSERT INTO backup_settings (id, auto_enabled, interval_hours, max_backups, backup_path) VALUES (1, 1, 24, 10, ?)'
        ).run(this.backupDir);
      } else {
        const s = this.db.prepare('SELECT backup_path FROM backup_settings WHERE id = 1').get() as any;
        this.backupDir = s.backup_path || path.join(userDataPath, 'backups');
      }

      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      this.startAutoBackup();
      this.setupIPC();
      this.initialized = true;
      log.info('[BackupRestoreManager] Initialized. Backup dir:', this.backupDir);
    } catch (err) {
      log.error('[BackupRestoreManager] Initialization failed:', err);
    }
  }

  private getSettings(): BackupSettings {
    if (!this.db) {
      return { auto_enabled: true, interval_hours: 24, max_backups: 10, backup_path: '', last_auto_backup: null };
    }
    const row = this.db.prepare('SELECT * FROM backup_settings WHERE id = 1').get() as any;
    return {
      auto_enabled: row.auto_enabled === 1,
      interval_hours: row.interval_hours,
      max_backups: row.max_backups,
      backup_path: row.backup_path,
      last_auto_backup: row.last_auto_backup
    };
  }

  updateSettings(settings: Partial<BackupSettings>): void {
    if (!this.db) return;
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    this.db.prepare(`
      UPDATE backup_settings SET
        auto_enabled = ?, interval_hours = ?, max_backups = ?, backup_path = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      updated.auto_enabled ? 1 : 0,
      updated.interval_hours,
      updated.max_backups,
      updated.backup_path
    );

    if (updated.backup_path !== this.backupDir) {
      this.backupDir = updated.backup_path;
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
    }

    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = null;
    }
    if (updated.auto_enabled) {
      this.startAutoBackup();
    }
  }

  private startAutoBackup(): void {
    const settings = this.getSettings();
    if (!settings.auto_enabled) return;

    const intervalMs = settings.interval_hours * 60 * 60 * 1000;
    this.autoBackupTimer = setInterval(() => {
      this.createBackup('automatic', 'Automatic backup').catch(err => {
        log.error('[BackupRestoreManager] Auto backup failed:', err);
      });
    }, intervalMs);

    if (settings.last_auto_backup) {
      const elapsed = Date.now() - new Date(settings.last_auto_backup).getTime();
      if (elapsed > intervalMs) {
        this.createBackup('automatic', 'Automatic backup').catch(err => {
          log.error('[BackupRestoreManager] Catchup auto backup failed:', err);
        });
      }
    }
  }

  async createBackup(
    type: 'automatic' | 'manual' | 'pre_update' | 'pre_restore' = 'manual',
    description: string = ''
  ): Promise<BackupRecord> {
    const userDataPath = app.getPath('userData');
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `dex-backup-${timestamp}-${type}.dexbak`;
    const filepath = path.join(this.backupDir, filename);

    const backupData: Record<string, Buffer> = {};
    const includedDatabases: string[] = [];

    for (const dbFile of DATABASE_FILES) {
      const dbFilePath = path.join(userDataPath, dbFile);
      if (fs.existsSync(dbFilePath)) {
        backupData[dbFile] = fs.readFileSync(dbFilePath);
        includedDatabases.push(dbFile);
      }
    }

    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      backupData['settings.json'] = fs.readFileSync(settingsPath);
    }

    const manifest = {
      version: 1,
      type,
      created_at: new Date().toISOString(),
      app_version: app.getVersion(),
      databases: includedDatabases,
      files: Object.keys(backupData)
    };
    backupData['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

    const archive = Buffer.from(JSON.stringify(
      Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, v.toString('base64')])
      )
    ), 'utf-8');

    const compressed = zlib.gzipSync(archive, { level: 6 });
    fs.writeFileSync(filepath, compressed);

    const hash = crypto.createHash('sha256');
    hash.update(compressed);
    const checksum = hash.digest('hex');

    const sizeBytes = compressed.length;

    if (this.db) {
      this.db.prepare(`
        INSERT INTO backups (id, filename, filepath, size_bytes, type, description, databases, checksum, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(id, filename, filepath, sizeBytes, type, description, JSON.stringify(includedDatabases), checksum);

      if (type === 'automatic') {
        this.db.prepare("UPDATE backup_settings SET last_auto_backup = datetime('now') WHERE id = 1").run();
      }

      this.pruneOldBackups();
    }

    log.info(`[BackupRestoreManager] Created ${type} backup: ${filename} (${sizeBytes} bytes)`);

    return {
      id, filename, filepath, size_bytes: sizeBytes, type, description,
      databases: includedDatabases, checksum, created_at: new Date().toISOString()
    };
  }

  private pruneOldBackups(): void {
    if (!this.db) return;
    const settings = this.getSettings();
    const autoBackups = this.db.prepare(
      "SELECT id, filepath FROM backups WHERE type = 'automatic' ORDER BY created_at DESC"
    ).all() as any[];

    if (autoBackups.length > settings.max_backups) {
      const toDelete = autoBackups.slice(settings.max_backups);
      for (const b of toDelete) {
        try {
          if (fs.existsSync(b.filepath)) {
            fs.unlinkSync(b.filepath);
          }
          this.db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
        } catch (err) {
          log.warn('[BackupRestoreManager] Failed to prune backup:', b.id, err);
        }
      }
    }
  }

  listBackups(): BackupRecord[] {
    if (!this.db) return [];
    const rows = this.db.prepare(
      'SELECT * FROM backups ORDER BY created_at DESC'
    ).all() as any[];
    return rows.map(r => ({
      ...r,
      databases: JSON.parse(r.databases || '[]')
    }));
  }

  verifyBackup(backupId: string): { valid: boolean; details: string } {
    if (!this.db) return { valid: false, details: 'Database not initialized' };

    const row = this.db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!row) return { valid: false, details: 'Backup not found' };

    if (!fs.existsSync(row.filepath)) {
      return { valid: false, details: 'Backup file is missing from disk' };
    }

    try {
      const fileData = fs.readFileSync(row.filepath);
      const hash = crypto.createHash('sha256');
      hash.update(fileData);
      const computedChecksum = hash.digest('hex');

      if (computedChecksum !== row.checksum) {
        return { valid: false, details: 'Checksum mismatch. Backup file may be corrupted.' };
      }

      const decompressed = zlib.gunzipSync(fileData);
      const archive = JSON.parse(decompressed.toString('utf-8'));

      if (!archive['manifest.json']) {
        return { valid: false, details: 'Backup is missing manifest.' };
      }

      const manifest = JSON.parse(Buffer.from(archive['manifest.json'], 'base64').toString('utf-8'));
      if (!manifest.version || !manifest.databases) {
        return { valid: false, details: 'Manifest is malformed.' };
      }

      return { valid: true, details: `Backup valid. Contains ${manifest.databases.length} databases, created at ${manifest.created_at}.` };
    } catch (err: any) {
      return { valid: false, details: `Verification failed: ${err.message}` };
    }
  }

  async restoreBackup(
    backupId: string,
    selectedDatabases?: string[]
  ): Promise<RestoreResult> {
    if (!this.db) return { success: false, restoredDatabases: [], errors: ['Database not initialized'] };

    const row = this.db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!row) return { success: false, restoredDatabases: [], errors: ['Backup not found'] };

    const verification = this.verifyBackup(backupId);
    if (!verification.valid) {
      return { success: false, restoredDatabases: [], errors: [verification.details] };
    }

    await this.createBackup('pre_restore', 'Pre-restore safety backup');

    const fileData = fs.readFileSync(row.filepath);
    const decompressed = zlib.gunzipSync(fileData);
    const archive = JSON.parse(decompressed.toString('utf-8')) as Record<string, string>;
    const manifest = JSON.parse(Buffer.from(archive['manifest.json'], 'base64').toString('utf-8'));

    const databasesToRestore = selectedDatabases || manifest.databases;
    const userDataPath = app.getPath('userData');
    const restoredDatabases: string[] = [];
    const errors: string[] = [];

    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }

    for (const dbFile of databasesToRestore) {
      if (!archive[dbFile]) {
        errors.push(`Database ${dbFile} not found in backup`);
        continue;
      }

      const targetPath = path.join(userDataPath, dbFile);
      try {
        const dbData = Buffer.from(archive[dbFile], 'base64');
        fs.writeFileSync(targetPath, dbData);
        restoredDatabases.push(dbFile);
      } catch (err: any) {
        errors.push(`Failed to restore ${dbFile}: ${err.message}`);
      }
    }

    if (archive['settings.json']) {
      try {
        const settingsData = Buffer.from(archive['settings.json'], 'base64');
        fs.writeFileSync(path.join(userDataPath, 'settings.json'), settingsData);
      } catch (err: any) {
        errors.push(`Failed to restore settings: ${err.message}`);
      }
    }

    try {
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
    } catch (err: any) {
      errors.push(`Failed to reopen database: ${err.message}`);
    }

    log.info(`[BackupRestoreManager] Restore complete. Restored: ${restoredDatabases.join(', ')}. Errors: ${errors.length}`);

    return {
      success: errors.length === 0,
      restoredDatabases,
      errors
    };
  }

  deleteBackup(backupId: string): boolean {
    if (!this.db) return false;
    const row = this.db.prepare('SELECT filepath FROM backups WHERE id = ?').get(backupId) as any;
    if (!row) return false;

    try {
      if (fs.existsSync(row.filepath)) {
        fs.unlinkSync(row.filepath);
      }
      this.db.prepare('DELETE FROM backups WHERE id = ?').run(backupId);
      log.info(`[BackupRestoreManager] Deleted backup: ${backupId}`);
      return true;
    } catch (err) {
      log.error('[BackupRestoreManager] Delete failed:', err);
      return false;
    }
  }

  private setupIPC(): void {
    ipcMain.handle('backup:create', (_e, type?: string, description?: string) => {
      return this.createBackup(
        (type as any) || 'manual',
        description || 'Manual backup'
      );
    });
    ipcMain.handle('backup:list', () => this.listBackups());
    ipcMain.handle('backup:verify', (_e, backupId: string) => this.verifyBackup(backupId));
    ipcMain.handle('backup:restore', (_e, backupId: string, selectedDbs?: string[]) => {
      return this.restoreBackup(backupId, selectedDbs);
    });
    ipcMain.handle('backup:delete', (_e, backupId: string) => this.deleteBackup(backupId));
    ipcMain.handle('backup:get-settings', () => this.getSettings());
    ipcMain.handle('backup:update-settings', (_e, settings: Partial<BackupSettings>) => {
      this.updateSettings(settings);
      return this.getSettings();
    });
  }

  destroy(): void {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = null;
    }
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[BackupRestoreManager] Destroyed');
  }
}

export const backupRestoreManager = new BackupRestoreManager();
