// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Encrypted Local Logs
// System 5 Feature 8: Encrypted logs that NEVER touch network
// All Dex activity logged locally with encryption, searchable, auto-purge
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'security' | 'audit';
export type LogCategory = 
  | 'system'
  | 'user-action'
  | 'file-operation'
  | 'security-event'
  | 'permission'
  | 'network'
  | 'performance'
  | 'error'
  | 'automation';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  sessionId: string;
  source: string;
  hash: string;
}

export interface LogSession {
  id: string;
  startTime: number;
  endTime?: number;
  entryCount: number;
  encrypted: boolean;
}

export interface LogFilter {
  startTime?: number;
  endTime?: number;
  levels?: LogLevel[];
  categories?: LogCategory[];
  search?: string;
  sessionId?: string;
}

export interface LogStats {
  totalEntries: number;
  entriesByLevel: Record<LogLevel, number>;
  entriesByCategory: Record<LogCategory, number>;
  oldestEntry?: number;
  newestEntry?: number;
  diskUsageBytes: number;
  sessionsCount: number;
}

export interface LogConfig {
  enabled: boolean;
  encryptionEnabled: boolean;
  maxEntriesPerFile: number;
  maxTotalSizeMB: number;
  retentionDays: number;
  autoCompression: boolean;
  compressionAfterDays: number;
  sensitiveFields: string[];
  excludeCategories: LogCategory[];
}

// ===========================================================================
// ENCRYPTION CONSTANTS
// ===========================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const VERSION = 1;

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: LogConfig = {
  enabled: true,
  encryptionEnabled: true,
  maxEntriesPerFile: 10000,
  maxTotalSizeMB: 100,
  retentionDays: 30,
  autoCompression: true,
  compressionAfterDays: 7,
  sensitiveFields: ['password', 'token', 'secret', 'key', 'credential', 'auth'],
  excludeCategories: [],
};

// ===========================================================================
// ENCRYPTED LOCAL LOGS
// ===========================================================================

class EncryptedLocalLogsClass extends EventEmitter {
  private config: LogConfig;
  private logsPath = '';
  private sessionId: string;
  private currentFile: string | null = null;
  private currentEntryCount = 0;
  private encryptionKey: Buffer | null = null;
  private writeBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessions: Map<string, LogSession> = new Map();
  private isInitialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.sessionId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.logsPath = path.join(app.getPath('userData'), 'encrypted-logs');
    
    try {
      await fs.mkdir(this.logsPath, { recursive: true });
      await this.initializeEncryption();
      await this.loadSessions();
      await this.startSession();
      await this.runMaintenance();
      
      this.isInitialized = true;
      log.info('[EncryptedLogs] Initialized');
    } catch (error) {
      log.error('[EncryptedLogs] Initialization failed:', error);
    }
  }

  private async initializeEncryption(): Promise<void> {
    if (!this.config.encryptionEnabled) return;

    const keyPath = path.join(this.logsPath, '.key');
    
    try {
      if (fsSync.existsSync(keyPath) && safeStorage.isEncryptionAvailable()) {
        // Load existing key
        const encryptedKey = await fs.readFile(keyPath);
        const keyBase64 = safeStorage.decryptString(encryptedKey);
        this.encryptionKey = Buffer.from(keyBase64, 'base64');
      } else {
        // Generate new key
        this.encryptionKey = crypto.randomBytes(KEY_LENGTH);
        
        if (safeStorage.isEncryptionAvailable()) {
          const encryptedKey = safeStorage.encryptString(this.encryptionKey.toString('base64'));
          await fs.writeFile(keyPath, encryptedKey);
        }
      }
    } catch (error) {
      log.error('[EncryptedLogs] Encryption setup failed:', error);
      this.config.encryptionEnabled = false;
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Log from renderer
    ipcMain.handle('logs:write', async (_event, level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>) => {
      return this.write(level, category, message, data, 'renderer');
    });

    // Query logs
    ipcMain.handle('logs:query', async (_event, filter: LogFilter, limit?: number) => {
      return this.query(filter, limit);
    });

    // Get stats
    ipcMain.handle('logs:stats', async () => {
      return this.getStats();
    });

    // Export logs (for user inspection)
    ipcMain.handle('logs:export', async (_event, filter: LogFilter, outputPath: string) => {
      return this.exportLogs(filter, outputPath);
    });

    // Clear logs
    ipcMain.handle('logs:clear', async (_event, olderThanDays?: number) => {
      return this.clearLogs(olderThanDays);
    });

    // Get config
    ipcMain.handle('logs:config', () => {
      return { ...this.config, encryptionKey: undefined };
    });

    // Update config
    ipcMain.handle('logs:setConfig', (_event, updates: Partial<LogConfig>) => {
      return this.updateConfig(updates);
    });

    // Get sessions
    ipcMain.handle('logs:sessions', () => {
      return this.getSessions();
    });
  }

  // -------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -------------------------------------------------------------------------

  private async loadSessions(): Promise<void> {
    const indexPath = path.join(this.logsPath, 'sessions.json');
    
    try {
      if (fsSync.existsSync(indexPath)) {
        const data = await fs.readFile(indexPath, 'utf-8');
        const sessions = JSON.parse(data) as LogSession[];
        
        for (const session of sessions) {
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      log.error('[EncryptedLogs] Failed to load sessions:', error);
    }
  }

  private async saveSessions(): Promise<void> {
    const indexPath = path.join(this.logsPath, 'sessions.json');
    const sessions = Array.from(this.sessions.values());
    await fs.writeFile(indexPath, JSON.stringify(sessions, null, 2));
  }

  private async startSession(): Promise<void> {
    const session: LogSession = {
      id: this.sessionId,
      startTime: Date.now(),
      entryCount: 0,
      encrypted: this.config.encryptionEnabled,
    };

    this.sessions.set(this.sessionId, session);
    await this.saveSessions();

    // Start new log file
    await this.rotateLogFile();
  }

  getSessions(): LogSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startTime - a.startTime);
  }

  // -------------------------------------------------------------------------
  // LOGGING
  // -------------------------------------------------------------------------

  async write(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
    source: string = 'main'
  ): Promise<{ success: boolean; entryId?: string }> {
    if (!this.config.enabled) {
      return { success: false };
    }

    if (this.config.excludeCategories.includes(category)) {
      return { success: false };
    }

    // Sanitize sensitive data
    const sanitizedData = data ? this.sanitizeData(data) : undefined;

    const entry: LogEntry = {
      id: `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      data: sanitizedData,
      sessionId: this.sessionId,
      source,
      hash: '',
    };

    // Compute integrity hash
    entry.hash = this.computeEntryHash(entry);

    // Buffer the entry
    this.writeBuffer.push(entry);

    // Schedule flush
    this.scheduleFlush();

    // Update session stats
    const session = this.sessions.get(this.sessionId);
    if (session) {
      session.entryCount++;
    }

    this.emit('log:written', entry);
    return { success: true, entryId: entry.id };
  }

  // Convenience methods
  debug(message: string, data?: Record<string, unknown>): void {
    this.write('debug', 'system', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write('info', 'system', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write('warn', 'system', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write('error', 'error', message, data);
  }

  security(message: string, data?: Record<string, unknown>): void {
    this.write('security', 'security-event', message, data);
  }

  audit(message: string, data?: Record<string, unknown>): void {
    this.write('audit', 'permission', message, data);
  }

  userAction(message: string, data?: Record<string, unknown>): void {
    this.write('info', 'user-action', message, data);
  }

  fileOperation(message: string, data?: Record<string, unknown>): void {
    this.write('info', 'file-operation', message, data);
  }

  // -------------------------------------------------------------------------
  // DATA SANITIZATION
  // -------------------------------------------------------------------------

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      
      // Check if this is a sensitive field
      const isSensitive = this.config.sensitiveFields.some(field => 
        keyLower.includes(field.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private computeEntryHash(entry: LogEntry): string {
    const content = JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      category: entry.category,
      message: entry.message,
      sessionId: entry.sessionId,
    });

    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  // -------------------------------------------------------------------------
  // FILE OPERATIONS
  // -------------------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(async () => {
      await this.flush();
      this.flushTimer = null;
    }, 1000);
  }

  private async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;

    const entries = [...this.writeBuffer];
    this.writeBuffer = [];

    try {
      // Check if we need to rotate
      if (this.currentEntryCount >= this.config.maxEntriesPerFile) {
        await this.rotateLogFile();
      }

      // Write entries
      await this.appendEntries(entries);
      this.currentEntryCount += entries.length;

    } catch (error) {
      log.error('[EncryptedLogs] Flush failed:', error);
      // Re-add entries to buffer
      this.writeBuffer = [...entries, ...this.writeBuffer];
    }
  }

  private async rotateLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `log-${timestamp}.enc`;
    this.currentFile = path.join(this.logsPath, filename);
    this.currentEntryCount = 0;

    // Write header
    const header = {
      version: VERSION,
      sessionId: this.sessionId,
      createdAt: Date.now(),
      encrypted: this.config.encryptionEnabled,
    };

    await fs.writeFile(this.currentFile, this.encryptData(JSON.stringify(header) + '\n'));
  }

  private async appendEntries(entries: LogEntry[]): Promise<void> {
    if (!this.currentFile) {
      await this.rotateLogFile();
    }

    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    const encrypted = this.encryptData(lines);
    
    await fs.appendFile(this.currentFile!, encrypted);
  }

  // -------------------------------------------------------------------------
  // ENCRYPTION
  // -------------------------------------------------------------------------

  private encryptData(data: string): Buffer {
    if (!this.config.encryptionEnabled || !this.encryptionKey) {
      return Buffer.from(data, 'utf-8');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf-8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();

    // Format: [version(1)] [iv(12)] [tag(16)] [encrypted data]
    const result = Buffer.alloc(1 + IV_LENGTH + TAG_LENGTH + encrypted.length);
    result[0] = VERSION;
    iv.copy(result, 1);
    tag.copy(result, 1 + IV_LENGTH);
    encrypted.copy(result, 1 + IV_LENGTH + TAG_LENGTH);

    return result;
  }

  private decryptData(data: Buffer): string {
    if (!this.config.encryptionEnabled || !this.encryptionKey) {
      return data.toString('utf-8');
    }

    const version = data[0];
    if (version !== VERSION) {
      throw new Error(`Unsupported log version: ${version}`);
    }

    const iv = data.slice(1, 1 + IV_LENGTH);
    const tag = data.slice(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.slice(1 + IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf-8');
  }

  // -------------------------------------------------------------------------
  // QUERYING
  // -------------------------------------------------------------------------

  async query(filter: LogFilter, limit: number = 100): Promise<LogEntry[]> {
    const results: LogEntry[] = [];
    const files = await this.getLogFiles();

    // Sort files by date (newest first)
    files.sort((a, b) => b.localeCompare(a));

    for (const file of files) {
      if (results.length >= limit) break;

      try {
        const entries = await this.readLogFile(file);
        
        for (const entry of entries) {
          if (results.length >= limit) break;
          if (this.matchesFilter(entry, filter)) {
            results.push(entry);
          }
        }
      } catch (error) {
        log.error(`[EncryptedLogs] Failed to read ${file}:`, error);
      }
    }

    return results;
  }

  private matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
    if (filter.startTime && entry.timestamp < filter.startTime) return false;
    if (filter.endTime && entry.timestamp > filter.endTime) return false;
    if (filter.levels && !filter.levels.includes(entry.level)) return false;
    if (filter.categories && !filter.categories.includes(entry.category)) return false;
    if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
    
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const messageMatch = entry.message.toLowerCase().includes(searchLower);
      const dataMatch = entry.data && JSON.stringify(entry.data).toLowerCase().includes(searchLower);
      if (!messageMatch && !dataMatch) return false;
    }

    return true;
  }

  private async getLogFiles(): Promise<string[]> {
    const files = await fs.readdir(this.logsPath);
    return files
      .filter(f => f.startsWith('log-') && f.endsWith('.enc'))
      .map(f => path.join(this.logsPath, f));
  }

  private async readLogFile(filePath: string): Promise<LogEntry[]> {
    const data = await fs.readFile(filePath);
    const decrypted = this.decryptData(data);
    const lines = decrypted.split('\n').filter(line => line.trim());
    
    const entries: LogEntry[] = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch {
        // Skip malformed entries
      }
    }

    return entries;
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  async getStats(): Promise<LogStats> {
    const files = await this.getLogFiles();
    
    const stats: LogStats = {
      totalEntries: 0,
      entriesByLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        security: 0,
        audit: 0,
      },
      entriesByCategory: {
        system: 0,
        'user-action': 0,
        'file-operation': 0,
        'security-event': 0,
        permission: 0,
        network: 0,
        performance: 0,
        error: 0,
        automation: 0,
      },
      diskUsageBytes: 0,
      sessionsCount: this.sessions.size,
    };

    for (const file of files) {
      try {
        const stat = await fs.stat(file);
        stats.diskUsageBytes += stat.size;

        const entries = await this.readLogFile(file);
        stats.totalEntries += entries.length;

        for (const entry of entries) {
          stats.entriesByLevel[entry.level]++;
          stats.entriesByCategory[entry.category]++;

          if (!stats.oldestEntry || entry.timestamp < stats.oldestEntry) {
            stats.oldestEntry = entry.timestamp;
          }
          if (!stats.newestEntry || entry.timestamp > stats.newestEntry) {
            stats.newestEntry = entry.timestamp;
          }
        }
      } catch (error) {
        log.error(`[EncryptedLogs] Failed to stat ${file}:`, error);
      }
    }

    return stats;
  }

  // -------------------------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------------------------

  async exportLogs(filter: LogFilter, outputPath: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const entries = await this.query(filter, 100000);
      
      // Export as plain JSON (user can inspect)
      const exportData = {
        exportedAt: Date.now(),
        filter,
        entryCount: entries.length,
        entries: entries.map(e => ({
          ...e,
          timestampReadable: new Date(e.timestamp).toISOString(),
        })),
      };

      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
      
      this.audit('Logs exported', { outputPath, count: entries.length });
      return { success: true, count: entries.length };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, count: 0, error: errorMsg };
    }
  }

  // -------------------------------------------------------------------------
  // MAINTENANCE
  // -------------------------------------------------------------------------

  private async runMaintenance(): Promise<void> {
    await this.pruneOldLogs();
    await this.enforceMaxSize();
    await this.compressOldLogs();

    // Schedule daily maintenance
    setInterval(() => {
      this.runMaintenance();
    }, 24 * 60 * 60 * 1000);
  }

  private async pruneOldLogs(): Promise<void> {
    const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    const files = await this.getLogFiles();

    for (const file of files) {
      try {
        const stat = await fs.stat(file);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(file);
          log.debug(`[EncryptedLogs] Pruned old log: ${path.basename(file)}`);
        }
      } catch (error) {
        log.error(`[EncryptedLogs] Failed to prune ${file}:`, error);
      }
    }
  }

  private async enforceMaxSize(): Promise<void> {
    const maxBytes = this.config.maxTotalSizeMB * 1024 * 1024;
    const files = await this.getLogFiles();
    
    // Sort by date (oldest first)
    files.sort((a, b) => a.localeCompare(b));

    let totalSize = 0;
    for (const file of files) {
      const stat = await fs.stat(file);
      totalSize += stat.size;
    }

    // Delete oldest files until under limit
    while (totalSize > maxBytes && files.length > 1) {
      const oldest = files.shift()!;
      const stat = await fs.stat(oldest);
      await fs.unlink(oldest);
      totalSize -= stat.size;
      log.debug(`[EncryptedLogs] Removed to enforce size limit: ${path.basename(oldest)}`);
    }
  }

  private async compressOldLogs(): Promise<void> {
    if (!this.config.autoCompression) return;

    const cutoff = Date.now() - (this.config.compressionAfterDays * 24 * 60 * 60 * 1000);
    const files = await this.getLogFiles();

    for (const file of files) {
      // Skip already compressed
      if (file.endsWith('.gz')) continue;

      try {
        const stat = await fs.stat(file);
        if (stat.mtimeMs < cutoff) {
          const data = await fs.readFile(file);
          const compressed = await new Promise<Buffer>((resolve, reject) => {
            zlib.gzip(data, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          await fs.writeFile(file + '.gz', compressed);
          await fs.unlink(file);
          log.debug(`[EncryptedLogs] Compressed: ${path.basename(file)}`);
        }
      } catch (error) {
        log.error(`[EncryptedLogs] Failed to compress ${file}:`, error);
      }
    }
  }

  async clearLogs(olderThanDays?: number): Promise<{ success: boolean; deleted: number }> {
    const cutoff = olderThanDays 
      ? Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)
      : Number.MAX_SAFE_INTEGER;

    const files = await this.getLogFiles();
    let deleted = 0;

    for (const file of files) {
      // Don't delete current file
      if (file === this.currentFile) continue;

      try {
        const stat = await fs.stat(file);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(file);
          deleted++;
        }
      } catch (error) {
        log.error(`[EncryptedLogs] Failed to delete ${file}:`, error);
      }
    }

    this.audit('Logs cleared', { olderThanDays, deleted });
    return { success: true, deleted };
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  updateConfig(updates: Partial<LogConfig>): { success: boolean } {
    this.config = { ...this.config, ...updates };
    this.emit('config:changed', this.config);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Flush remaining entries
    await this.flush();

    // Close session
    const session = this.sessions.get(this.sessionId);
    if (session) {
      session.endTime = Date.now();
      await this.saveSessions();
    }

    log.info('[EncryptedLogs] Shutdown complete');
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const EncryptedLocalLogs = new EncryptedLocalLogsClass();
