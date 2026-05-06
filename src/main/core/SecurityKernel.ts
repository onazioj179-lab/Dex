// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Security Kernel
// ==========================================================================
// Feature 19: Secure Enclave Equivalent (safeStorage-backed key vault)
// Feature 20: Runtime Module Integrity (hash verification at load)
// Feature 21: Plugin Runtime Sandboxing (memory+time budget enforcement)
// Feature 22: Database Encryption and Key Rotation
// Feature 23: IPC Validation Extension (deep schema + rate limiting)
// Feature 24: Signed Exports (hash-signed file exports)
// Feature 25: Capability-Based Plugin Access (fine-grained permissions)
// Feature 26: Append-Only Audit Log
// Feature 27: Pointer/Reference Validation (safe dereference guards)
// ==========================================================================

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app, safeStorage } from 'electron';

// ---------------------------------------------------------------------------
// Feature 19: Secure Enclave (Key Vault)
// ---------------------------------------------------------------------------

interface VaultEntry {
  name: string;
  encryptedValue: Buffer;
  createdAt: number;
  rotatedAt: number;
  version: number;
}

class SecureKeyVault {
  private vault = new Map<string, VaultEntry>();
  private vaultPath = '';
  private masterKeyCache: Buffer | null = null;

  initialize(): void {
    this.vaultPath = path.join(app.getPath('userData'), '.dex-vault');
    this.loadVault();
    log.info('[SecureKeyVault] Feature 19: Secure key vault initialized');
  }

  private getMasterKey(): Buffer {
    if (this.masterKeyCache) return this.masterKeyCache;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const seed = safeStorage.encryptString('dex-master-key-seed-v2');
        this.masterKeyCache = crypto.createHash('sha256').update(seed).digest();
      } else {
        // Fallback: machine-specific key derivation
        const machineId = `${process.platform}-${process.arch}-${app.getPath('userData')}`;
        this.masterKeyCache = crypto.createHash('sha256').update(machineId).digest();
      }
    } catch {
      const machineId = `${process.platform}-${process.arch}-dex-fallback`;
      this.masterKeyCache = crypto.createHash('sha256').update(machineId).digest();
    }

    return this.masterKeyCache;
  }

  store(name: string, value: string): void {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: IV (16) + AuthTag (16) + EncryptedData
    const combined = Buffer.concat([iv, authTag, encrypted]);

    const existing = this.vault.get(name);
    this.vault.set(name, {
      name,
      encryptedValue: combined,
      createdAt: existing?.createdAt || Date.now(),
      rotatedAt: Date.now(),
      version: (existing?.version || 0) + 1,
    });

    this.persistVault();
  }

  retrieve(name: string): string | null {
    const entry = this.vault.get(name);
    if (!entry) return null;

    try {
      const key = this.getMasterKey();
      const iv = entry.encryptedValue.subarray(0, 16);
      const authTag = entry.encryptedValue.subarray(16, 32);
      const encrypted = entry.encryptedValue.subarray(32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf-8');
    } catch (err) {
      log.warn(`[SecureKeyVault] Failed to decrypt '${name}':`, err);
      return null;
    }
  }

  delete(name: string): boolean {
    const deleted = this.vault.delete(name);
    if (deleted) this.persistVault();
    return deleted;
  }

  has(name: string): boolean {
    return this.vault.has(name);
  }

  rotate(name: string): boolean {
    const current = this.retrieve(name);
    if (current === null) return false;
    this.store(name, current);
    return true;
  }

  rotateAll(): number {
    let rotated = 0;
    for (const name of this.vault.keys()) {
      if (this.rotate(name)) rotated++;
    }
    return rotated;
  }

  list(): Array<{ name: string; version: number; createdAt: number; rotatedAt: number }> {
    return Array.from(this.vault.values()).map(e => ({
      name: e.name,
      version: e.version,
      createdAt: e.createdAt,
      rotatedAt: e.rotatedAt,
    }));
  }

  private persistVault(): void {
    try {
      const serialized: Record<string, { enc: string; createdAt: number; rotatedAt: number; version: number }> = {};
      for (const [name, entry] of this.vault) {
        serialized[name] = {
          enc: entry.encryptedValue.toString('base64'),
          createdAt: entry.createdAt,
          rotatedAt: entry.rotatedAt,
          version: entry.version,
        };
      }
      fs.mkdirSync(path.dirname(this.vaultPath), { recursive: true });
      const tmpPath = this.vaultPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(serialized), 'utf-8');
      fs.renameSync(tmpPath, this.vaultPath);
    } catch (err) {
      log.warn('[SecureKeyVault] Failed to persist vault:', err);
    }
  }

  private loadVault(): void {
    try {
      if (!fs.existsSync(this.vaultPath)) return;

      const raw = fs.readFileSync(this.vaultPath, 'utf-8');
      const serialized = JSON.parse(raw);

      for (const [name, data] of Object.entries(serialized) as any) {
        this.vault.set(name, {
          name,
          encryptedValue: Buffer.from(data.enc, 'base64'),
          createdAt: data.createdAt || Date.now(),
          rotatedAt: data.rotatedAt || Date.now(),
          version: data.version || 1,
        });
      }
    } catch (err) {
      log.warn('[SecureKeyVault] Failed to load vault:', err);
    }
  }

  shutdown(): void {
    this.persistVault();
    if (this.masterKeyCache) {
      this.masterKeyCache.fill(0);
      this.masterKeyCache = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 20: Runtime Module Integrity
// ---------------------------------------------------------------------------

class RuntimeIntegrityChecker {
  private knownHashes = new Map<string, string>();
  private verifiedModules = new Set<string>();
  private violations: Array<{ module: string; expected: string; actual: string; timestamp: number }> = [];

  initialize(): void {
    this.buildBaselineHashes();
    log.info('[RuntimeIntegrity] Feature 20: Module integrity checker initialized');
  }

  private buildBaselineHashes(): void {
    try {
      const corePath = path.join(app.getAppPath(), 'dist', 'main');
      if (!fs.existsSync(corePath)) return;

      const files = fs.readdirSync(corePath).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const fullPath = path.join(corePath, file);
        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        this.knownHashes.set(file, hash);
      }
      log.info(`[RuntimeIntegrity] Baseline: ${this.knownHashes.size} module hashes recorded`);
    } catch {
      // App may not be packaged yet
    }
  }

  verifyModule(modulePath: string): boolean {
    const fileName = path.basename(modulePath);
    const expectedHash = this.knownHashes.get(fileName);
    if (!expectedHash) {
      // Unknown module -- allow but log
      return true;
    }

    try {
      const content = fs.readFileSync(modulePath);
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');

      if (actualHash === expectedHash) {
        this.verifiedModules.add(fileName);
        return true;
      }

      this.violations.push({
        module: fileName,
        expected: expectedHash,
        actual: actualHash,
        timestamp: Date.now(),
      });
      log.warn(`[RuntimeIntegrity] VIOLATION: Module '${fileName}' hash mismatch`);
      return false;
    } catch {
      return false;
    }
  }

  getViolations(): Array<{ module: string; timestamp: number }> {
    return this.violations.map(v => ({ module: v.module, timestamp: v.timestamp }));
  }

  isVerified(moduleName: string): boolean {
    return this.verifiedModules.has(moduleName);
  }

  getStats(): { total: number; verified: number; violations: number } {
    return {
      total: this.knownHashes.size,
      verified: this.verifiedModules.size,
      violations: this.violations.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 21: Plugin Runtime Sandboxing
// ---------------------------------------------------------------------------

interface SandboxBudget {
  maxMemoryMB: number;
  maxExecutionMs: number;
  maxFileOps: number;
  maxNetworkCalls: number;
}

interface SandboxSession {
  pluginId: string;
  budget: SandboxBudget;
  memoryUsed: number;
  executionMs: number;
  fileOps: number;
  networkCalls: number;
  startedAt: number;
  violations: string[];
}

const DEFAULT_SANDBOX_BUDGET: SandboxBudget = {
  maxMemoryMB: 50,
  maxExecutionMs: 5000,
  maxFileOps: 100,
  maxNetworkCalls: 10,
};

class PluginSandbox {
  private sessions = new Map<string, SandboxSession>();
  private budgetOverrides = new Map<string, Partial<SandboxBudget>>();

  createSession(pluginId: string, budgetOverride?: Partial<SandboxBudget>): SandboxSession {
    const override = budgetOverride || this.budgetOverrides.get(pluginId) || {};
    const budget: SandboxBudget = { ...DEFAULT_SANDBOX_BUDGET, ...override };

    const session: SandboxSession = {
      pluginId,
      budget,
      memoryUsed: 0,
      executionMs: 0,
      fileOps: 0,
      networkCalls: 0,
      startedAt: Date.now(),
      violations: [],
    };

    this.sessions.set(pluginId, session);
    return session;
  }

  checkMemory(pluginId: string, bytesUsed: number): boolean {
    const session = this.sessions.get(pluginId);
    if (!session) return true;

    session.memoryUsed = bytesUsed;
    if (bytesUsed > session.budget.maxMemoryMB * 1024 * 1024) {
      session.violations.push(`Memory exceeded: ${Math.round(bytesUsed / 1024 / 1024)}MB > ${session.budget.maxMemoryMB}MB`);
      return false;
    }
    return true;
  }

  checkExecution(pluginId: string): boolean {
    const session = this.sessions.get(pluginId);
    if (!session) return true;

    session.executionMs = Date.now() - session.startedAt;
    if (session.executionMs > session.budget.maxExecutionMs) {
      session.violations.push(`Execution time exceeded: ${session.executionMs}ms > ${session.budget.maxExecutionMs}ms`);
      return false;
    }
    return true;
  }

  recordFileOp(pluginId: string): boolean {
    const session = this.sessions.get(pluginId);
    if (!session) return true;

    session.fileOps++;
    if (session.fileOps > session.budget.maxFileOps) {
      session.violations.push(`File ops exceeded: ${session.fileOps} > ${session.budget.maxFileOps}`);
      return false;
    }
    return true;
  }

  recordNetworkCall(pluginId: string): boolean {
    const session = this.sessions.get(pluginId);
    if (!session) return true;

    session.networkCalls++;
    if (session.networkCalls > session.budget.maxNetworkCalls) {
      session.violations.push(`Network calls exceeded: ${session.networkCalls} > ${session.budget.maxNetworkCalls}`);
      return false;
    }
    return true;
  }

  endSession(pluginId: string): SandboxSession | null {
    const session = this.sessions.get(pluginId);
    if (!session) return null;
    this.sessions.delete(pluginId);
    return session;
  }

  setBudgetOverride(pluginId: string, budget: Partial<SandboxBudget>): void {
    this.budgetOverrides.set(pluginId, budget);
  }

  getSession(pluginId: string): SandboxSession | null {
    return this.sessions.get(pluginId) || null;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// ---------------------------------------------------------------------------
// Feature 22: Database Encryption and Key Rotation
// ---------------------------------------------------------------------------

class DatabaseEncryption {
  private currentKeyVersion = 1;
  private rotationInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    // Check if key exists, create if not
    if (!secureKeyVault.has('db-encryption-key')) {
      const newKey = crypto.randomBytes(32).toString('hex');
      secureKeyVault.store('db-encryption-key', newKey);
      secureKeyVault.store('db-encryption-key-version', '1');
      log.info('[DatabaseEncryption] Feature 22: Generated initial database encryption key');
    }

    const versionStr = secureKeyVault.retrieve('db-encryption-key-version');
    this.currentKeyVersion = versionStr ? parseInt(versionStr, 10) : 1;

    // Schedule key rotation every 30 days
    this.rotationInterval = setInterval(() => {
      this.rotateKey();
    }, 30 * 24 * 60 * 60 * 1000);

    log.info(`[DatabaseEncryption] Feature 22: Database encryption initialized (key version ${this.currentKeyVersion})`);
  }

  encrypt(data: Buffer): Buffer {
    const keyHex = secureKeyVault.retrieve('db-encryption-key');
    if (!keyHex) throw new Error('Database encryption key not found');

    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: version (1) + iv (12) + authTag (16) + encrypted
    const versionBuf = Buffer.alloc(1);
    versionBuf.writeUInt8(this.currentKeyVersion);
    return Buffer.concat([versionBuf, iv, authTag, encrypted]);
  }

  decrypt(encoded: Buffer): Buffer {
    const keyHex = secureKeyVault.retrieve('db-encryption-key');
    if (!keyHex) throw new Error('Database encryption key not found');

    const key = Buffer.from(keyHex, 'hex');
    const iv = encoded.subarray(1, 13);
    const authTag = encoded.subarray(13, 29);
    const encrypted = encoded.subarray(29);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  rotateKey(): void {
    const newKey = crypto.randomBytes(32).toString('hex');
    this.currentKeyVersion++;
    secureKeyVault.store('db-encryption-key', newKey);
    secureKeyVault.store('db-encryption-key-version', this.currentKeyVersion.toString());
    log.info(`[DatabaseEncryption] Key rotated to version ${this.currentKeyVersion}`);
  }

  getKeyVersion(): number {
    return this.currentKeyVersion;
  }

  shutdown(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 23: IPC Validation Extension
// ---------------------------------------------------------------------------

interface IPCRateEntry {
  channel: string;
  timestamps: number[];
}

const IPC_RATE_WINDOW_MS = 1000;
const IPC_MAX_RATE = 100; // 100 messages per second per channel
const IPC_MAX_PAYLOAD_BYTES = 1_048_576; // 1MB

class IPCValidationExtension {
  private rateLimitMap = new Map<string, IPCRateEntry>();
  private schemasRegistered = new Map<string, (payload: unknown) => boolean>();
  private violations: Array<{ channel: string; reason: string; timestamp: number }> = [];

  registerSchema(channel: string, validator: (payload: unknown) => boolean): void {
    this.schemasRegistered.set(channel, validator);
  }

  validate(channel: string, payload: unknown): { valid: boolean; reason: string } {
    // Size check
    const serialized = JSON.stringify(payload);
    if (serialized && serialized.length > IPC_MAX_PAYLOAD_BYTES) {
      const reason = `Payload too large: ${serialized.length} bytes > ${IPC_MAX_PAYLOAD_BYTES}`;
      this.recordViolation(channel, reason);
      return { valid: false, reason };
    }

    // Rate check
    if (!this.checkRate(channel)) {
      const reason = `Rate limit exceeded for channel '${channel}'`;
      this.recordViolation(channel, reason);
      return { valid: false, reason };
    }

    // Schema check
    const validator = this.schemasRegistered.get(channel);
    if (validator && !validator(payload)) {
      const reason = `Schema validation failed for channel '${channel}'`;
      this.recordViolation(channel, reason);
      return { valid: false, reason };
    }

    return { valid: true, reason: '' };
  }

  private checkRate(channel: string): boolean {
    const now = Date.now();
    let entry = this.rateLimitMap.get(channel);
    if (!entry) {
      entry = { channel, timestamps: [] };
      this.rateLimitMap.set(channel, entry);
    }

    // Prune old timestamps
    entry.timestamps = entry.timestamps.filter(t => (now - t) < IPC_RATE_WINDOW_MS);
    entry.timestamps.push(now);

    return entry.timestamps.length <= IPC_MAX_RATE;
  }

  private recordViolation(channel: string, reason: string): void {
    this.violations.push({ channel, reason, timestamp: Date.now() });
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-500);
    }
    log.warn(`[IPCValidation] Feature 23: ${reason}`);
  }

  getViolations(): Array<{ channel: string; reason: string; timestamp: number }> {
    return [...this.violations];
  }

  getStats(): { schemasRegistered: number; violations: number; channelsTracked: number } {
    return {
      schemasRegistered: this.schemasRegistered.size,
      violations: this.violations.length,
      channelsTracked: this.rateLimitMap.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 24: Signed Exports
// ---------------------------------------------------------------------------

class SignedExportManager {
  signExport(data: Buffer, metadata: Record<string, string>): {
    signature: string;
    metadata: Record<string, string>;
    hash: string;
  } {
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    const keyHex = secureKeyVault.retrieve('db-encryption-key');
    const hmacKey = keyHex ? Buffer.from(keyHex, 'hex') : crypto.randomBytes(32);
    const signPayload = hash + JSON.stringify(metadata);
    const signature = crypto.createHmac('sha256', hmacKey).update(signPayload).digest('hex');

    return {
      signature,
      metadata: { ...metadata, hash, signedAt: new Date().toISOString() },
      hash,
    };
  }

  verifyExport(data: Buffer, signature: string, metadata: Record<string, string>): boolean {
    const hash = crypto.createHash('sha256').update(data).digest('hex');

    if (hash !== metadata.hash) return false;

    const keyHex = secureKeyVault.retrieve('db-encryption-key');
    if (!keyHex) return false;

    const hmacKey = Buffer.from(keyHex, 'hex');
    const signPayload = hash + JSON.stringify(metadata);
    const expectedSig = crypto.createHmac('sha256', hmacKey).update(signPayload).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  }
}

// ---------------------------------------------------------------------------
// Feature 25: Capability-Based Plugin Access
// ---------------------------------------------------------------------------

export type PluginCapability =
  | 'fs:read'
  | 'fs:write'
  | 'net:http'
  | 'net:socket'
  | 'ipc:send'
  | 'ipc:receive'
  | 'db:read'
  | 'db:write'
  | 'ui:render'
  | 'ui:notify'
  | 'system:info'
  | 'crypto:encrypt'
  | 'crypto:decrypt';

interface PluginCapabilityGrant {
  pluginId: string;
  capabilities: Set<PluginCapability>;
  grantedAt: number;
  grantedBy: string;
}

class CapabilityAccessManager {
  private grants = new Map<string, PluginCapabilityGrant>();
  private audits: Array<{ pluginId: string; capability: PluginCapability; allowed: boolean; timestamp: number }> = [];

  grant(pluginId: string, capabilities: PluginCapability[], grantedBy: string): void {
    const existing = this.grants.get(pluginId);
    const capSet = existing ? new Set([...existing.capabilities, ...capabilities]) : new Set(capabilities);

    this.grants.set(pluginId, {
      pluginId,
      capabilities: capSet,
      grantedAt: Date.now(),
      grantedBy,
    });

    log.info(`[CapabilityAccess] Feature 25: Granted ${capabilities.join(', ')} to '${pluginId}'`);
  }

  revoke(pluginId: string, capabilities: PluginCapability[]): void {
    const existing = this.grants.get(pluginId);
    if (!existing) return;

    for (const cap of capabilities) {
      existing.capabilities.delete(cap);
    }

    if (existing.capabilities.size === 0) {
      this.grants.delete(pluginId);
    }
  }

  check(pluginId: string, capability: PluginCapability): boolean {
    const grant = this.grants.get(pluginId);
    const allowed = grant ? grant.capabilities.has(capability) : false;

    this.audits.push({ pluginId, capability, allowed, timestamp: Date.now() });
    if (this.audits.length > 5000) {
      this.audits = this.audits.slice(-2500);
    }

    return allowed;
  }

  getCapabilities(pluginId: string): PluginCapability[] {
    const grant = this.grants.get(pluginId);
    return grant ? Array.from(grant.capabilities) : [];
  }

  getAuditLog(): Array<{ pluginId: string; capability: string; allowed: boolean; timestamp: number }> {
    return [...this.audits];
  }
}

// ---------------------------------------------------------------------------
// Feature 26: Append-Only Audit Log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  hash: string;
  previousHash: string;
}

class AppendOnlyAuditLog {
  private entries: AuditLogEntry[] = [];
  private logPath = '';
  private lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
  private writeStream: fs.WriteStream | null = null;
  private entryCount = 0;

  initialize(): void {
    this.logPath = path.join(app.getPath('userData'), 'audit', 'audit.jsonl');
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });

    // Load last hash from existing log
    this.loadLastHash();

    // Open append-only stream
    this.writeStream = fs.createWriteStream(this.logPath, { flags: 'a' });

    log.info('[AuditLog] Feature 26: Append-only audit log initialized');
  }

  private loadLastHash(): void {
    try {
      if (!fs.existsSync(this.logPath)) return;

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        try {
          const lastEntry = JSON.parse(lastLine);
          this.lastHash = lastEntry.hash || this.lastHash;
          this.entryCount = lines.length;
        } catch { /* ok */ }
      }
    } catch { /* ok */ }
  }

  append(actor: string, action: string, resource: string, details: Record<string, unknown> = {}): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit-${++this.entryCount}-${Date.now()}`,
      timestamp: Date.now(),
      actor,
      action,
      resource,
      details,
      previousHash: this.lastHash,
      hash: '', // Computed below
    };

    // Hash chain: SHA-256(previousHash + timestamp + actor + action + resource + details)
    const payload = `${entry.previousHash}|${entry.timestamp}|${entry.actor}|${entry.action}|${entry.resource}|${JSON.stringify(entry.details)}`;
    entry.hash = crypto.createHash('sha256').update(payload).digest('hex');
    this.lastHash = entry.hash;

    // Append to file
    if (this.writeStream) {
      this.writeStream.write(JSON.stringify(entry) + '\n');
    }

    // Keep recent in memory
    this.entries.push(entry);
    if (this.entries.length > 10000) {
      this.entries = this.entries.slice(-5000);
    }

    return entry;
  }

  getRecent(count: number): AuditLogEntry[] {
    return this.entries.slice(-count);
  }

  verifyChain(): { valid: boolean; brokenAt: number | null } {
    try {
      if (!fs.existsSync(this.logPath)) return { valid: true, brokenAt: null };

      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);

      let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

      for (let i = 0; i < lines.length; i++) {
        const entry: AuditLogEntry = JSON.parse(lines[i]);
        if (entry.previousHash !== prevHash) {
          return { valid: false, brokenAt: i };
        }

        const payload = `${entry.previousHash}|${entry.timestamp}|${entry.actor}|${entry.action}|${entry.resource}|${JSON.stringify(entry.details)}`;
        const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');

        if (entry.hash !== expectedHash) {
          return { valid: false, brokenAt: i };
        }

        prevHash = entry.hash;
      }

      return { valid: true, brokenAt: null };
    } catch {
      return { valid: false, brokenAt: 0 };
    }
  }

  getStats(): { totalEntries: number; lastHash: string; logSizeBytes: number } {
    let logSize = 0;
    try {
      if (fs.existsSync(this.logPath)) {
        logSize = fs.statSync(this.logPath).size;
      }
    } catch { /* ok */ }

    return {
      totalEntries: this.entryCount,
      lastHash: this.lastHash,
      logSizeBytes: logSize,
    };
  }

  shutdown(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 27: Pointer/Reference Validation
// ---------------------------------------------------------------------------

export function safeDeref<T>(obj: T | null | undefined, fallback: T): T {
  if (obj === null || obj === undefined) return fallback;
  return obj;
}

export function safeAccess<T, K extends keyof T>(obj: T | null | undefined, key: K, fallback: T[K]): T[K] {
  if (obj === null || obj === undefined) return fallback;
  const val = obj[key];
  return val === null || val === undefined ? fallback : val;
}

export function safeArrayAccess<T>(arr: T[] | null | undefined, index: number, fallback: T): T {
  if (!arr || index < 0 || index >= arr.length) return fallback;
  return arr[index];
}

export function validateRef<T>(
  ref: T | null | undefined,
  name: string
): asserts ref is T {
  if (ref === null || ref === undefined) {
    throw new Error(`[RefValidation] Feature 27: Null reference: '${name}'`);
  }
}

export function isValidRef<T>(ref: T | null | undefined): ref is T {
  return ref !== null && ref !== undefined;
}

class ReferenceValidator {
  private nullDerefs = 0;
  private totalChecks = 0;

  check<T>(ref: T | null | undefined, context: string): ref is T {
    this.totalChecks++;
    if (ref === null || ref === undefined) {
      this.nullDerefs++;
      log.warn(`[RefValidation] Null dereference caught: ${context}`);
      return false;
    }
    return true;
  }

  getStats(): { totalChecks: number; nullDerefs: number; safetyRate: number } {
    return {
      totalChecks: this.totalChecks,
      nullDerefs: this.nullDerefs,
      safetyRate: this.totalChecks > 0 ? (this.totalChecks - this.nullDerefs) / this.totalChecks : 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const secureKeyVault = new SecureKeyVault();
export const runtimeIntegrity = new RuntimeIntegrityChecker();
export const pluginSandbox = new PluginSandbox();
export const databaseEncryption = new DatabaseEncryption();
export const ipcValidation = new IPCValidationExtension();
export const signedExports = new SignedExportManager();
export const capabilityAccess = new CapabilityAccessManager();
export const auditLog = new AppendOnlyAuditLog();
export const referenceValidator = new ReferenceValidator();

export function initializeSecurityKernel(): void {
  secureKeyVault.initialize();
  runtimeIntegrity.initialize();
  databaseEncryption.initialize();
  auditLog.initialize();
  log.info('[SecurityKernel] Features 19-27: Security kernel initialized');
}

export function shutdownSecurityKernel(): void {
  auditLog.shutdown();
  databaseEncryption.shutdown();
  secureKeyVault.shutdown();
}
