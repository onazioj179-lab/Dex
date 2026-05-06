// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { app, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log';

type CheckStatus = 'pass' | 'warning' | 'fail';

interface HealthCheckResult {
  id: string;
  name: string;
  category: string;
  status: CheckStatus;
  message: string;
  details?: string;
  repairAvailable: boolean;
  repairAction?: string;
}

interface FullHealthReport {
  timestamp: string;
  overallStatus: CheckStatus;
  checks: HealthCheckResult[];
  systemInfo: {
    platform: string;
    arch: string;
    osVersion: string;
    nodeVersion: string;
    electronVersion: string;
    totalMemory: number;
    freeMemory: number;
    cpuCount: number;
    uptime: number;
    appVersion: string;
    userDataPath: string;
  };
}

const DATABASE_FILES = ['dex-core.db', 'dex-notes.db', 'help.db'];

const REQUIRED_DIRECTORIES = [
  'databases', 'backups', 'exports', 'cache', 'logs', 'temp'
];

export class HealthCheckManager {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.setupIPC();
    this.initialized = true;
    log.info('[HealthCheckManager] Initialized');
  }

  async runFullCheck(): Promise<FullHealthReport> {
    const checks: HealthCheckResult[] = [];

    checks.push(this.checkDatabaseIntegrity());
    checks.push(this.checkDatabaseWalMode());
    checks.push(this.checkDatabaseSize());
    checks.push(this.checkSchemaVersion());
    checks.push(this.checkDirectoryStructure());
    checks.push(this.checkDiskSpace());
    checks.push(this.checkMemory());
    checks.push(this.checkSettingsFile());
    checks.push(this.checkBackupHealth());
    checks.push(this.checkLogFileSize());
    checks.push(this.checkTempDirectory());
    checks.push(this.checkFilePermissions());
    checks.push(this.checkOrphanedRecords());
    checks.push(this.checkFTS5Index());
    checks.push(this.checkProcessResources());

    let overallStatus: CheckStatus = 'pass';
    for (const check of checks) {
      if (check.status === 'fail') {
        overallStatus = 'fail';
        break;
      }
      if (check.status === 'warning') {
        overallStatus = 'warning';
      }
    }

    const report: FullHealthReport = {
      timestamp: new Date().toISOString(),
      overallStatus,
      checks,
      systemInfo: {
        platform: process.platform,
        arch: process.arch,
        osVersion: os.release(),
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length,
        uptime: os.uptime(),
        appVersion: app.getVersion(),
        userDataPath: app.getPath('userData')
      }
    };

    log.info(`[HealthCheckManager] Health check complete. Status: ${overallStatus}. Checks: ${checks.length}`);
    return report;
  }

  private checkDatabaseIntegrity(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const errors: string[] = [];

    for (const dbFile of DATABASE_FILES) {
      const dbPath = path.join(userDataPath, dbFile);
      if (!fs.existsSync(dbPath)) continue;

      try {
        const db = new Database(dbPath, { readonly: true });
        const result = db.pragma('integrity_check') as any[];
        db.close();

        if (!result || result.length === 0 || result[0].integrity_check !== 'ok') {
          errors.push(`${dbFile}: integrity check failed`);
        }
      } catch (err: any) {
        errors.push(`${dbFile}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      return {
        id: 'db-integrity',
        name: 'Database Integrity',
        category: 'Database',
        status: 'fail',
        message: 'One or more databases failed integrity check',
        details: errors.join('; '),
        repairAvailable: true,
        repairAction: 'rebuild-database'
      };
    }

    return {
      id: 'db-integrity',
      name: 'Database Integrity',
      category: 'Database',
      status: 'pass',
      message: 'All databases passed integrity check',
      repairAvailable: false
    };
  }

  private checkDatabaseWalMode(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const warnings: string[] = [];

    for (const dbFile of DATABASE_FILES) {
      const dbPath = path.join(userDataPath, dbFile);
      if (!fs.existsSync(dbPath)) continue;

      try {
        const db = new Database(dbPath, { readonly: true });
        const result = db.pragma('journal_mode') as any[];
        db.close();

        if (!result || result.length === 0 || result[0].journal_mode !== 'wal') {
          warnings.push(`${dbFile}: journal mode is ${result?.[0]?.journal_mode || 'unknown'}`);
        }
      } catch (err: any) {
        warnings.push(`${dbFile}: could not check journal mode`);
      }
    }

    if (warnings.length > 0) {
      return {
        id: 'db-wal',
        name: 'WAL Mode',
        category: 'Database',
        status: 'warning',
        message: 'Some databases are not using WAL mode',
        details: warnings.join('; '),
        repairAvailable: true,
        repairAction: 'enable-wal'
      };
    }

    return {
      id: 'db-wal',
      name: 'WAL Mode',
      category: 'Database',
      status: 'pass',
      message: 'All databases are using WAL mode',
      repairAvailable: false
    };
  }

  private checkDatabaseSize(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    let totalSize = 0;
    const largeDbs: string[] = [];
    const WARN_SIZE = 500 * 1024 * 1024; // 500MB

    for (const dbFile of DATABASE_FILES) {
      const dbPath = path.join(userDataPath, dbFile);
      if (!fs.existsSync(dbPath)) continue;

      const stats = fs.statSync(dbPath);
      totalSize += stats.size;
      if (stats.size > WARN_SIZE) {
        largeDbs.push(`${dbFile}: ${(stats.size / 1048576).toFixed(1)} MB`);
      }

      const walPath = dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        const walStats = fs.statSync(walPath);
        totalSize += walStats.size;
      }
    }

    if (largeDbs.length > 0) {
      return {
        id: 'db-size',
        name: 'Database Size',
        category: 'Database',
        status: 'warning',
        message: `Total database size: ${(totalSize / 1048576).toFixed(1)} MB`,
        details: largeDbs.join('; '),
        repairAvailable: true,
        repairAction: 'vacuum-databases'
      };
    }

    return {
      id: 'db-size',
      name: 'Database Size',
      category: 'Database',
      status: 'pass',
      message: `Total database size: ${(totalSize / 1048576).toFixed(1)} MB`,
      repairAvailable: false
    };
  }

  private checkSchemaVersion(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'dex-core.db');
    if (!fs.existsSync(dbPath)) {
      return {
        id: 'schema-version',
        name: 'Schema Version',
        category: 'Database',
        status: 'warning',
        message: 'Core database not found',
        repairAvailable: false
      };
    }

    try {
      const db = new Database(dbPath, { readonly: true });
      const tableCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ).get();

      if (!tableCheck) {
        db.close();
        return {
          id: 'schema-version',
          name: 'Schema Version',
          category: 'Database',
          status: 'warning',
          message: 'Migration table not found. Migrations may not have run.',
          repairAvailable: true,
          repairAction: 'run-migrations'
        };
      }

      const row = db.prepare(
        'SELECT MAX(version) as ver FROM schema_migrations WHERE success = 1'
      ).get() as any;
      const failedRow = db.prepare(
        'SELECT COUNT(*) as cnt FROM schema_migrations WHERE success = 0'
      ).get() as any;
      db.close();

      if (failedRow?.cnt > 0) {
        return {
          id: 'schema-version',
          name: 'Schema Version',
          category: 'Database',
          status: 'fail',
          message: `Schema version: ${row?.ver || 0}. ${failedRow.cnt} failed migrations detected.`,
          repairAvailable: true,
          repairAction: 'run-migrations'
        };
      }

      return {
        id: 'schema-version',
        name: 'Schema Version',
        category: 'Database',
        status: 'pass',
        message: `Schema version: ${row?.ver || 0}`,
        repairAvailable: false
      };
    } catch (err: any) {
      return {
        id: 'schema-version',
        name: 'Schema Version',
        category: 'Database',
        status: 'fail',
        message: `Could not check schema version: ${err.message}`,
        repairAvailable: false
      };
    }
  }

  private checkDirectoryStructure(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const missing: string[] = [];

    for (const dir of REQUIRED_DIRECTORIES) {
      const dirPath = path.join(userDataPath, dir);
      if (!fs.existsSync(dirPath)) {
        missing.push(dir);
      }
    }

    if (missing.length > 0) {
      return {
        id: 'dir-structure',
        name: 'Directory Structure',
        category: 'Filesystem',
        status: 'warning',
        message: `Missing directories: ${missing.join(', ')}`,
        repairAvailable: true,
        repairAction: 'create-directories'
      };
    }

    return {
      id: 'dir-structure',
      name: 'Directory Structure',
      category: 'Filesystem',
      status: 'pass',
      message: 'All required directories exist',
      repairAvailable: false
    };
  }

  private checkDiskSpace(): HealthCheckResult {
    try {
      const userDataPath = app.getPath('userData');
      const stats = fs.statfsSync(userDataPath);
      const freeBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      const freeGB = freeBytes / (1024 * 1024 * 1024);
      const percentFree = (freeBytes / totalBytes) * 100;

      if (freeGB < 1) {
        return {
          id: 'disk-space',
          name: 'Disk Space',
          category: 'System',
          status: 'fail',
          message: `Very low disk space: ${freeGB.toFixed(2)} GB free (${percentFree.toFixed(1)}%)`,
          repairAvailable: false
        };
      }

      if (freeGB < 5) {
        return {
          id: 'disk-space',
          name: 'Disk Space',
          category: 'System',
          status: 'warning',
          message: `Low disk space: ${freeGB.toFixed(1)} GB free (${percentFree.toFixed(1)}%)`,
          repairAvailable: false
        };
      }

      return {
        id: 'disk-space',
        name: 'Disk Space',
        category: 'System',
        status: 'pass',
        message: `${freeGB.toFixed(1)} GB free (${percentFree.toFixed(1)}%)`,
        repairAvailable: false
      };
    } catch (_err) {
      return {
        id: 'disk-space',
        name: 'Disk Space',
        category: 'System',
        status: 'pass',
        message: 'Disk space check unavailable on this platform',
        repairAvailable: false
      };
    }
  }

  private checkMemory(): HealthCheckResult {
    const totalMB = os.totalmem() / (1024 * 1024);
    const freeMB = os.freemem() / (1024 * 1024);
    const usedPercent = ((totalMB - freeMB) / totalMB) * 100;

    const processMemory = process.memoryUsage();
    const heapMB = processMemory.heapUsed / (1024 * 1024);

    if (heapMB > 500) {
      return {
        id: 'memory',
        name: 'Memory Usage',
        category: 'System',
        status: 'warning',
        message: `DEX is using ${heapMB.toFixed(0)} MB heap. System: ${usedPercent.toFixed(0)}% used.`,
        repairAvailable: false
      };
    }

    return {
      id: 'memory',
      name: 'Memory Usage',
      category: 'System',
      status: 'pass',
      message: `DEX heap: ${heapMB.toFixed(0)} MB. System: ${freeMB.toFixed(0)} MB free of ${totalMB.toFixed(0)} MB.`,
      repairAvailable: false
    };
  }

  private checkSettingsFile(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');

    if (!fs.existsSync(settingsPath)) {
      return {
        id: 'settings-file',
        name: 'Settings File',
        category: 'Configuration',
        status: 'pass',
        message: 'No settings file found (using defaults)',
        repairAvailable: false
      };
    }

    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      JSON.parse(content);
      return {
        id: 'settings-file',
        name: 'Settings File',
        category: 'Configuration',
        status: 'pass',
        message: 'Settings file is valid JSON',
        repairAvailable: false
      };
    } catch (_err) {
      return {
        id: 'settings-file',
        name: 'Settings File',
        category: 'Configuration',
        status: 'fail',
        message: 'Settings file contains invalid JSON',
        repairAvailable: true,
        repairAction: 'reset-settings'
      };
    }
  }

  private checkBackupHealth(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const backupDir = path.join(userDataPath, 'backups');

    if (!fs.existsSync(backupDir)) {
      return {
        id: 'backup-health',
        name: 'Backup Health',
        category: 'Backup',
        status: 'warning',
        message: 'Backup directory does not exist. No backups have been created.',
        repairAvailable: true,
        repairAction: 'create-directories'
      };
    }

    const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.dexbak'));
    if (backupFiles.length === 0) {
      return {
        id: 'backup-health',
        name: 'Backup Health',
        category: 'Backup',
        status: 'warning',
        message: 'No backup files found. Create a backup to protect your data.',
        repairAvailable: false
      };
    }

    return {
      id: 'backup-health',
      name: 'Backup Health',
      category: 'Backup',
      status: 'pass',
      message: `${backupFiles.length} backup file(s) found`,
      repairAvailable: false
    };
  }

  private checkLogFileSize(): HealthCheckResult {
    try {
      const logPath = log.transports.file.getFile().path;
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > 50) {
          return {
            id: 'log-size',
            name: 'Log File Size',
            category: 'Maintenance',
            status: 'warning',
            message: `Log file is ${sizeMB.toFixed(1)} MB. Consider clearing logs.`,
            repairAvailable: true,
            repairAction: 'clear-logs'
          };
        }

        return {
          id: 'log-size',
          name: 'Log File Size',
          category: 'Maintenance',
          status: 'pass',
          message: `Log file: ${sizeMB.toFixed(1)} MB`,
          repairAvailable: false
        };
      }
    } catch (_err) {
      // Log file may not be accessible
    }

    return {
      id: 'log-size',
      name: 'Log File Size',
      category: 'Maintenance',
      status: 'pass',
      message: 'Log file check complete',
      repairAvailable: false
    };
  }

  private checkTempDirectory(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const tempDir = path.join(userDataPath, 'temp');

    if (!fs.existsSync(tempDir)) {
      return {
        id: 'temp-dir',
        name: 'Temp Directory',
        category: 'Maintenance',
        status: 'pass',
        message: 'No temp directory. No stale temp files.',
        repairAvailable: false
      };
    }

    let totalSize = 0;
    let count = 0;
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      try {
        const entryPath = path.join(tempDir, entry);
        const stats = fs.statSync(entryPath);
        totalSize += stats.size;
        count++;
      } catch (_err) {
        // Skip inaccessible files
      }
    }

    const sizeMB = totalSize / (1024 * 1024);

    if (sizeMB > 100) {
      return {
        id: 'temp-dir',
        name: 'Temp Directory',
        category: 'Maintenance',
        status: 'warning',
        message: `${count} temp files using ${sizeMB.toFixed(1)} MB. Consider cleaning.`,
        repairAvailable: true,
        repairAction: 'clear-temp'
      };
    }

    return {
      id: 'temp-dir',
      name: 'Temp Directory',
      category: 'Maintenance',
      status: 'pass',
      message: `${count} temp files using ${sizeMB.toFixed(1)} MB`,
      repairAvailable: false
    };
  }

  private checkFilePermissions(): HealthCheckResult {
    const userDataPath = app.getPath('userData');

    try {
      const testFile = path.join(userDataPath, '.health-check-test');
      fs.writeFileSync(testFile, 'test', 'utf-8');
      const readBack = fs.readFileSync(testFile, 'utf-8');
      fs.unlinkSync(testFile);

      if (readBack !== 'test') {
        return {
          id: 'file-permissions',
          name: 'File Permissions',
          category: 'Filesystem',
          status: 'fail',
          message: 'File read/write test returned unexpected content',
          repairAvailable: false
        };
      }

      return {
        id: 'file-permissions',
        name: 'File Permissions',
        category: 'Filesystem',
        status: 'pass',
        message: 'Read/write access to user data directory is working',
        repairAvailable: false
      };
    } catch (err: any) {
      return {
        id: 'file-permissions',
        name: 'File Permissions',
        category: 'Filesystem',
        status: 'fail',
        message: `Cannot read/write to user data directory: ${err.message}`,
        repairAvailable: false
      };
    }
  }

  private checkOrphanedRecords(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'dex-core.db');

    if (!fs.existsSync(dbPath)) {
      return {
        id: 'orphaned-records',
        name: 'Orphaned Records',
        category: 'Database',
        status: 'pass',
        message: 'No core database to check',
        repairAvailable: false
      };
    }

    try {
      const db = new Database(dbPath, { readonly: true });
      const warnings: string[] = [];

      const hasRecycleBin = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recycle_bin'"
      ).get();

      if (hasRecycleBin) {
        const oldItems = db.prepare(
          "SELECT COUNT(*) as cnt FROM recycle_bin WHERE auto_purge_at < datetime('now')"
        ).get() as any;
        if (oldItems?.cnt > 0) {
          warnings.push(`${oldItems.cnt} expired items in recycle bin`);
        }
      }

      db.close();

      if (warnings.length > 0) {
        return {
          id: 'orphaned-records',
          name: 'Orphaned Records',
          category: 'Database',
          status: 'warning',
          message: warnings.join('; '),
          repairAvailable: true,
          repairAction: 'purge-expired'
        };
      }

      return {
        id: 'orphaned-records',
        name: 'Orphaned Records',
        category: 'Database',
        status: 'pass',
        message: 'No orphaned or expired records found',
        repairAvailable: false
      };
    } catch (_err) {
      return {
        id: 'orphaned-records',
        name: 'Orphaned Records',
        category: 'Database',
        status: 'pass',
        message: 'Could not check for orphaned records',
        repairAvailable: false
      };
    }
  }

  private checkFTS5Index(): HealthCheckResult {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'dex-notes.db');

    if (!fs.existsSync(dbPath)) {
      return {
        id: 'fts5-index',
        name: 'Full-Text Search Index',
        category: 'Database',
        status: 'pass',
        message: 'Notes database not found (FTS5 check skipped)',
        repairAvailable: false
      };
    }

    try {
      const db = new Database(dbPath, { readonly: true });
      const ftsTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'"
      ).all() as any[];
      db.close();

      if (ftsTable.length === 0) {
        return {
          id: 'fts5-index',
          name: 'Full-Text Search Index',
          category: 'Database',
          status: 'warning',
          message: 'No FTS5 index found in notes database',
          repairAvailable: true,
          repairAction: 'rebuild-fts'
        };
      }

      return {
        id: 'fts5-index',
        name: 'Full-Text Search Index',
        category: 'Database',
        status: 'pass',
        message: `Found ${ftsTable.length} FTS index table(s)`,
        repairAvailable: false
      };
    } catch (_err) {
      return {
        id: 'fts5-index',
        name: 'Full-Text Search Index',
        category: 'Database',
        status: 'warning',
        message: 'Could not check FTS5 index',
        repairAvailable: false
      };
    }
  }

  private checkProcessResources(): HealthCheckResult {
    const memUsage = process.memoryUsage();
    const rssMB = memUsage.rss / (1024 * 1024);
    const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
    const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
    const externalMB = memUsage.external / (1024 * 1024);

    if (rssMB > 1000) {
      return {
        id: 'process-resources',
        name: 'Process Resources',
        category: 'System',
        status: 'warning',
        message: `High memory usage - RSS: ${rssMB.toFixed(0)} MB, Heap: ${heapUsedMB.toFixed(0)}/${heapTotalMB.toFixed(0)} MB`,
        repairAvailable: false
      };
    }

    return {
      id: 'process-resources',
      name: 'Process Resources',
      category: 'System',
      status: 'pass',
      message: `RSS: ${rssMB.toFixed(0)} MB, Heap: ${heapUsedMB.toFixed(0)}/${heapTotalMB.toFixed(0)} MB, External: ${externalMB.toFixed(0)} MB`,
      repairAvailable: false
    };
  }

  async repair(action: string): Promise<{ success: boolean; message: string }> {
    const userDataPath = app.getPath('userData');

    switch (action) {
      case 'create-directories': {
        let created = 0;
        for (const dir of REQUIRED_DIRECTORIES) {
          const dirPath = path.join(userDataPath, dir);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            created++;
          }
        }
        return { success: true, message: `Created ${created} missing directories` };
      }

      case 'enable-wal': {
        let fixed = 0;
        for (const dbFile of DATABASE_FILES) {
          const dbPath = path.join(userDataPath, dbFile);
          if (!fs.existsSync(dbPath)) continue;
          try {
            const db = new Database(dbPath);
            db.pragma('journal_mode = WAL');
            db.close();
            fixed++;
          } catch (_err) {
            // Skip databases that cannot be opened
          }
        }
        return { success: true, message: `Enabled WAL mode on ${fixed} databases` };
      }

      case 'vacuum-databases': {
        let vacuumed = 0;
        for (const dbFile of DATABASE_FILES) {
          const dbPath = path.join(userDataPath, dbFile);
          if (!fs.existsSync(dbPath)) continue;
          try {
            const db = new Database(dbPath);
            db.exec('VACUUM');
            db.close();
            vacuumed++;
          } catch (_err) {
            // Skip databases that cannot be vacuumed
          }
        }
        return { success: true, message: `Vacuumed ${vacuumed} databases` };
      }

      case 'clear-temp': {
        const tempDir = path.join(userDataPath, 'temp');
        if (fs.existsSync(tempDir)) {
          const entries = fs.readdirSync(tempDir);
          let cleared = 0;
          for (const entry of entries) {
            try {
              fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
              cleared++;
            } catch (_err) {
              // Skip files that cannot be deleted
            }
          }
          return { success: true, message: `Cleared ${cleared} temp items` };
        }
        return { success: true, message: 'No temp directory to clear' };
      }

      case 'clear-logs': {
        try {
          const logPath = log.transports.file.getFile().path;
          if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '', 'utf-8');
            return { success: true, message: 'Log file cleared' };
          }
        } catch (_err) {
          // Log clearing failed
        }
        return { success: true, message: 'Log file cleared or not found' };
      }

      case 'reset-settings': {
        const settingsPath = path.join(userDataPath, 'settings.json');
        const backupPath = settingsPath + '.bak';
        if (fs.existsSync(settingsPath)) {
          fs.copyFileSync(settingsPath, backupPath);
          fs.writeFileSync(settingsPath, '{}', 'utf-8');
          return { success: true, message: 'Settings reset to defaults. Old settings backed up to settings.json.bak' };
        }
        return { success: true, message: 'No settings file to reset' };
      }

      case 'purge-expired': {
        const dbPath = path.join(userDataPath, 'dex-core.db');
        if (fs.existsSync(dbPath)) {
          try {
            const db = new Database(dbPath);
            const result = db.prepare(
              "DELETE FROM recycle_bin WHERE auto_purge_at < datetime('now')"
            ).run();
            db.close();
            return { success: true, message: `Purged ${result.changes} expired recycle bin items` };
          } catch (_err) {
            return { success: false, message: 'Could not purge expired records' };
          }
        }
        return { success: true, message: 'No database to purge' };
      }

      default:
        return { success: false, message: `Unknown repair action: ${action}` };
    }
  }

  private setupIPC(): void {
    ipcMain.handle('health:run-check', () => this.runFullCheck());
    ipcMain.handle('health:repair', (_e, action: string) => this.repair(action));
  }

  destroy(): void {
    this.initialized = false;
    log.info('[HealthCheckManager] Destroyed');
  }
}

export const healthCheckManager = new HealthCheckManager();
