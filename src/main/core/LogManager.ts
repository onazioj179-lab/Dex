// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Log Manager
// ==========================================================================
// Rules 94-97: Logging Architecture
// 94. Log rotation with size-based rollover
// 95. Structured logging (JSON format for machine-readable output)
// 96. Dynamic log level control (debug/info/warn/error)
// 97. Sensitive data redaction (passwords, keys, tokens, paths)
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;
const LOG_CHECK_INTERVAL_MS = 300_000; // 5 minutes
const STRUCTURED_LOG_FILE = 'dex-structured.jsonl';

// ---------------------------------------------------------------------------
// Rule 97: Sensitive data patterns
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /("password"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("token"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("apiKey"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("secret"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("authorization"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("masterKey"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /("privateKey"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
  { pattern: /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/g, replacement: '$1[REDACTED]' },
  { pattern: /([A-Za-z0-9+/]{32,}={0,2})/g, replacement: '[BASE64-REDACTED]' },
];

export function redactSensitiveData(input: string): string {
  let result = input;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rule 95: Structured log entry
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, any>;
  pid: number;
}

// ---------------------------------------------------------------------------
// Log Manager
// ---------------------------------------------------------------------------

class LogManager {
  private logDir: string = '';
  private structuredLogPath: string = '';
  private structuredLogStream: fs.WriteStream | null = null;
  private rotationCheckInterval: NodeJS.Timeout | null = null;
  private currentLevel: LogLevel = 'info';
  private initialized = false;

  private readonly LEVEL_RANK: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  initialize(): void {
    if (this.initialized) return;

    this.logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.structuredLogPath = path.join(this.logDir, STRUCTURED_LOG_FILE);

    // Open structured log stream
    this.structuredLogStream = fs.createWriteStream(this.structuredLogPath, { flags: 'a' });

    // Rule 94: Periodic rotation check
    this.rotationCheckInterval = setInterval(() => this.checkRotation(), LOG_CHECK_INTERVAL_MS);

    // Initial rotation check
    this.checkRotation();

    // Configure electron-log
    this.configureElectronLog();

    this.initialized = true;
    log.info('[LogManager] Initialized (Rules 94-97)');
  }

  // Rule 96: Dynamic log level control
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    log.transports.console.level = level;
    log.transports.file.level = level;
    log.info(`[LogManager] Rule 96: Log level set to '${level}'`);
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  // Rule 95: Write structured log entry
  writeStructured(level: LogLevel, module: string, message: string, data?: Record<string, any>): void {
    if (this.LEVEL_RANK[level] < this.LEVEL_RANK[this.currentLevel]) return;

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message: redactSensitiveData(message), // Rule 97
      data: data ? JSON.parse(redactSensitiveData(JSON.stringify(data))) : undefined,
      pid: process.pid,
    };

    if (this.structuredLogStream && !this.structuredLogStream.destroyed) {
      this.structuredLogStream.write(JSON.stringify(entry) + '\n');
    }
  }

  // Convenience methods
  debug(module: string, message: string, data?: Record<string, any>): void {
    this.writeStructured('debug', module, message, data);
  }

  info(module: string, message: string, data?: Record<string, any>): void {
    this.writeStructured('info', module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, any>): void {
    this.writeStructured('warn', module, message, data);
  }

  error(module: string, message: string, data?: Record<string, any>): void {
    this.writeStructured('error', module, message, data);
  }

  // ---------------------------------------------------------------------------
  // Rule 94: Log rotation
  // ---------------------------------------------------------------------------

  private checkRotation(): void {
    // Rotate structured log
    this.rotateFile(this.structuredLogPath);

    // Rotate electron-log file
    try {
      const electronLogPath = log.transports.file.getFile()?.path;
      if (electronLogPath) {
        this.rotateFile(electronLogPath);
      }
    } catch { /* ok */ }
  }

  private rotateFile(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);

      if (stat.size > MAX_LOG_SIZE_BYTES) {
        // Close stream if it's the structured log
        if (filePath === this.structuredLogPath && this.structuredLogStream) {
          this.structuredLogStream.end();
          this.structuredLogStream = null;
        }

        // Rotate: .4 delete, .3 .4, .2 .3, .1 .2, current .1
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
          const from = `${filePath}.${i}`;
          const to = `${filePath}.${i + 1}`;
          if (fs.existsSync(from)) {
            if (i === MAX_LOG_FILES - 1) {
              fs.unlinkSync(from);
            } else {
              fs.renameSync(from, to);
            }
          }
        }

        fs.renameSync(filePath, `${filePath}.1`);

        // Reopen stream
        if (filePath === this.structuredLogPath) {
          this.structuredLogStream = fs.createWriteStream(this.structuredLogPath, { flags: 'a' });
        }

        log.debug(`[LogManager] Rule 94: Rotated log: ${path.basename(filePath)}`);
      }
    } catch (err) {
      // Don't log rotation errors to avoid recursion
    }
  }

  // ---------------------------------------------------------------------------
  // Configure electron-log
  // ---------------------------------------------------------------------------

  private configureElectronLog(): void {
    try {
      log.transports.file.maxSize = MAX_LOG_SIZE_BYTES;
      log.transports.console.level = this.currentLevel;
      log.transports.file.level = this.currentLevel;
    } catch { /* ok */ }
  }

  // ---------------------------------------------------------------------------
  // Query logs
  // ---------------------------------------------------------------------------

  getRecentLogs(count: number = 100, level?: LogLevel): StructuredLogEntry[] {
    try {
      if (!fs.existsSync(this.structuredLogPath)) return [];

      const content = fs.readFileSync(this.structuredLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const entries: StructuredLogEntry[] = [];

      // Read from end
      for (let i = lines.length - 1; i >= 0 && entries.length < count; i--) {
        try {
          const entry = JSON.parse(lines[i]) as StructuredLogEntry;
          if (!level || entry.level === level) {
            entries.push(entry);
          }
        } catch { /* skip malformed lines */ }
      }

      return entries.reverse();
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    if (this.rotationCheckInterval) {
      clearInterval(this.rotationCheckInterval);
      this.rotationCheckInterval = null;
    }
    if (this.structuredLogStream) {
      this.structuredLogStream.end();
      this.structuredLogStream = null;
    }
    this.initialized = false;
    log.info('[LogManager] Shutdown');
  }
}

export const logManager = new LogManager();

export function initializeLogManager(): void {
  logManager.initialize();
}

export function shutdownLogManager(): void {
  logManager.shutdown();
}
