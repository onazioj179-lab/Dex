// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Security Hardening
// ==========================================================================
// Rules 61-70: Security Architecture
// 61. Database encryption at rest (SQLCipher-compatible key derivation)
// 62. Master key stored via safeStorage (OS keychain) -- EncryptionOrchestrator
// 63. HKDF key derivation per domain -- EncryptionOrchestrator
// 64. AES-256-GCM for all sensitive data -- EncryptionOrchestrator
// 65. Memory zeroing for key material on shutdown -- EncryptionOrchestrator
// 66. Integrity hashes (SHA-256) for critical files
// 67. Audit trail for all security events (dex-security DB)
// 68. Input sanitization for all IPC payloads
// 69. CSP headers on all renderer windows
// 70. Plugin sandbox with forbidden pattern enforcement
// ==========================================================================

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app, BrowserWindow, session } from 'electron';

// ---------------------------------------------------------------------------
// Rule 66: File integrity verification
// ---------------------------------------------------------------------------

interface IntegrityRecord {
  filePath: string;
  hash: string;
  algorithm: string;
  verifiedAt: number;
}

class IntegrityVerifier {
  private knownHashes = new Map<string, IntegrityRecord>();

  // Compute and store hash for a critical file
  computeHash(filePath: string, algorithm: string = 'sha256'): string | null {
    try {
      const data = fs.readFileSync(filePath);
      const hash = crypto.createHash(algorithm).update(data).digest('hex');
      this.knownHashes.set(filePath, {
        filePath,
        hash,
        algorithm,
        verifiedAt: Date.now(),
      });

      // Persist to dex-security DB
      try {
        const { databaseCluster } = require('./DatabaseCluster');
        databaseCluster.writeStmt('sec:set-hash', filePath, hash, algorithm, Date.now());
      } catch { /* ok */ }

      return hash;
    } catch {
      return null;
    }
  }

  // Verify a file against its known hash
  verify(filePath: string): { valid: boolean; expected?: string; actual?: string } {
    const known = this.knownHashes.get(filePath);
    if (!known) {
      // Try DB
      try {
        const { databaseCluster } = require('./DatabaseCluster');
        const row = databaseCluster.runStmt('sec:get-hash', filePath);
        if (row) {
          const actual = this.computeCurrentHash(filePath, row.algorithm);
          return { valid: actual === row.hash, expected: row.hash, actual: actual ?? undefined };
        }
      } catch { /* ok */ }
      return { valid: true }; // No baseline -- assume ok
    }

    const actual = this.computeCurrentHash(filePath, known.algorithm);
    return { valid: actual === known.hash, expected: known.hash, actual: actual ?? undefined };
  }

  private computeCurrentHash(filePath: string, algorithm: string): string | null {
    try {
      const data = fs.readFileSync(filePath);
      return crypto.createHash(algorithm).update(data).digest('hex');
    } catch {
      return null;
    }
  }

  // Verify all known files
  verifyAll(): { total: number; valid: number; invalid: string[] } {
    const invalid: string[] = [];
    let valid = 0;
    for (const [filePath] of this.knownHashes) {
      const result = this.verify(filePath);
      if (result.valid) valid++;
      else invalid.push(filePath);
    }
    return { total: this.knownHashes.size, valid, invalid };
  }
}

// ---------------------------------------------------------------------------
// Rule 67: Security audit trail
// ---------------------------------------------------------------------------

class SecurityAuditor {
  log(action: string, subject: string, details: string, severity: 'info' | 'warn' | 'error' | 'critical' = 'info'): void {
    try {
      const { databaseCluster } = require('./DatabaseCluster');
      databaseCluster.auditLog(action, subject, details, severity);
    } catch {
      // Audit must never throw -- fallback to electron-log
      log.info(`[AUDIT:${severity}] ${action} | ${subject} | ${details}`);
    }
  }

  logLogin(method: string, success: boolean): void {
    this.log('login', method, success ? 'Login succeeded' : 'Login failed', success ? 'info' : 'warn');
  }

  logKeyOperation(operation: string, keyId: string): void {
    this.log('key-operation', operation, `Key: ${keyId}`, 'info');
  }

  logIntegrityCheck(result: { total: number; valid: number; invalid: string[] }): void {
    const severity = result.invalid.length > 0 ? 'error' : 'info';
    this.log('integrity-check', 'system', `${result.valid}/${result.total} valid`, severity);
  }

  logPluginBlock(pluginId: string, reason: string): void {
    this.log('plugin-blocked', pluginId, reason, 'warn');
  }

  logIPCViolation(channel: string, reason: string): void {
    this.log('ipc-violation', channel, reason, 'warn');
  }
}

// ---------------------------------------------------------------------------
// Rule 68: Input sanitization
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /import\s*\(/i,
  /require\s*\(/i,
  /__proto__/i,
  /constructor\s*\[/i,
  /prototype\s*\[/i,
];

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        return input.replace(/<[^>]*>/g, ''); // Strip HTML
      }
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (input && typeof input === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      // Block prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      clean[key] = sanitizeInput(value);
    }
    return clean;
  }
  return input;
}

// ---------------------------------------------------------------------------
// Rule 69: CSP headers for renderer windows
// ---------------------------------------------------------------------------

export function applyCSPHeaders(): void {
  try {
    const defaultSession = session.defaultSession;
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: file:; " +
            "media-src 'self' file: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws: wss: http://127.0.0.1:*; " +
            "worker-src 'self' blob:;"
          ],
        },
      });
    });
    log.info('[SecurityHardening] Rule 69: CSP headers applied');
  } catch (err) {
    log.warn('[SecurityHardening] Failed to apply CSP:', err);
  }
}

// ---------------------------------------------------------------------------
// Rule 70: Plugin sandbox forbidden patterns
// ---------------------------------------------------------------------------

export const PLUGIN_FORBIDDEN_PATTERNS = [
  /require\s*\(\s*['"]child_process/,
  /require\s*\(\s*['"]fs/,
  /require\s*\(\s*['"]net/,
  /require\s*\(\s*['"]http/,
  /require\s*\(\s*['"]https/,
  /require\s*\(\s*['"]dgram/,
  /require\s*\(\s*['"]cluster/,
  /require\s*\(\s*['"]worker_threads/,
  /require\s*\(\s*['"]vm/,
  /process\.exit/,
  /process\.kill/,
  /process\.env/,
  /child_process/,
  /execSync/,
  /spawnSync/,
  /eval\s*\(/,
  /Function\s*\(/,
  /global\.globalThis/,
  /globalThis/,
];

export function scanPluginCode(code: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const pattern of PLUGIN_FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      violations.push(pattern.source);
    }
  }
  return { safe: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Composite security hardening singleton
// ---------------------------------------------------------------------------

class SecurityHardening {
  readonly integrity = new IntegrityVerifier();
  readonly auditor = new SecurityAuditor();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    // Rule 69: Apply CSP
    applyCSPHeaders();

    this.initialized = true;
    log.info('[SecurityHardening] Initialized (Rules 61-70)');
  }

  // Rule 66: Hash critical app files
  hashCriticalFiles(): void {
    try {
      const appPath = app.getAppPath();
      const criticalFiles = [
        path.join(appPath, 'package.json'),
      ];

      // Also hash the main process entry
      const mainEntry = path.join(appPath, 'dist', 'main', 'main.js');
      if (fs.existsSync(mainEntry)) criticalFiles.push(mainEntry);

      const preloadEntry = path.join(appPath, 'dist', 'main', 'preload.js');
      if (fs.existsSync(preloadEntry)) criticalFiles.push(preloadEntry);

      for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
          this.integrity.computeHash(file);
        }
      }

      log.info(`[SecurityHardening] Rule 66: Hashed ${criticalFiles.length} critical files`);
    } catch (err) {
      log.warn('[SecurityHardening] Failed to hash critical files:', err);
    }
  }

  // Full integrity check
  runIntegrityCheck(): { total: number; valid: number; invalid: string[] } {
    const result = this.integrity.verifyAll();
    this.auditor.logIntegrityCheck(result);
    return result;
  }

  shutdown(): void {
    this.initialized = false;
    log.info('[SecurityHardening] Shutdown');
  }
}

export const securityHardening = new SecurityHardening();

export function initializeSecurityHardening(): void {
  securityHardening.initialize();
}

export function shutdownSecurityHardening(): void {
  securityHardening.shutdown();
}
