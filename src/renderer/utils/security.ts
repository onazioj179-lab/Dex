// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Security & Privacy (Phase N: Items 846-865)
// Data protection, encryption, sandboxing, and privacy controls
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptionConfig {
  algorithm: 'AES-GCM' | 'AES-CBC' | 'RSA-OAEP';
  keySize: 128 | 192 | 256;
  iv?: Uint8Array;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface PrivacySettings {
  telemetryEnabled: boolean;
  crashReportsEnabled: boolean;
  analyticsEnabled: boolean;
  personalizedAdsEnabled: boolean;
  dataRetentionDays: number;
  shareUsageData: boolean;
}

export interface DataExportRequest {
  id: string;
  type: 'full' | 'partial';
  categories: string[];
  format: 'json' | 'csv' | 'xml';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  downloadUrl?: string;
}

export interface DataDeletionRequest {
  id: string;
  categories: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
}

export interface SandboxPermission {
  id: string;
  resource: 'filesystem' | 'network' | 'clipboard' | 'camera' | 'microphone' | 'geolocation';
  allowed: boolean;
  scope?: string;
  expiresAt?: number;
}

export interface SecurityAuditLog {
  id: string;
  action: string;
  resource: string;
  userId?: string;
  timestamp: number;
  details?: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'blocked';
}

// ---------------------------------------------------------------------------
// 846-850. Encryption
// ---------------------------------------------------------------------------

export class EncryptionManager {
  private keyCache: Map<string, CryptoKey> = new Map();

  // 846. AES Encryption
  async generateKey(config: EncryptionConfig = { algorithm: 'AES-GCM', keySize: 256 }): Promise<CryptoKey> {
    const key = await crypto.subtle.generateKey(
      {
        name: config.algorithm.startsWith('AES') ? 'AES-GCM' : 'RSA-OAEP',
        length: config.keySize,
      },
      true,
      ['encrypt', 'decrypt']
    );
    return key as CryptoKey;
  }

  async encrypt(data: string | ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );

    return { encrypted, iv };
  }

  async decrypt(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encrypted
    );
  }

  async decryptToString(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<string> {
    const decrypted = await this.decrypt(encrypted, key, iv);
    return new TextDecoder().decode(decrypted);
  }

  // 847. Key Derivation
  async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // 848. RSA Key Pairs
  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
    return keyPair as KeyPair;
  }

  async encryptWithPublicKey(data: string | ArrayBuffer, publicKey: CryptoKey): Promise<ArrayBuffer> {
    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      dataBuffer
    );
  }

  async decryptWithPrivateKey(encrypted: ArrayBuffer, privateKey: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encrypted
    );
  }

  // 849. Digital Signatures
  async signData(data: string | ArrayBuffer, privateKey: CryptoKey): Promise<ArrayBuffer> {
    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      dataBuffer
    );
  }

  async verifySignature(data: string | ArrayBuffer, signature: ArrayBuffer, publicKey: CryptoKey): Promise<boolean> {
    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      signature,
      dataBuffer
    );
  }

  // 850. Secure Hashing
  async hash(data: string | ArrayBuffer, algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256'): Promise<string> {
    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async generateSalt(length = 16): Promise<Uint8Array> {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  // Key Management
  cacheKey(id: string, key: CryptoKey): void {
    this.keyCache.set(id, key);
  }

  getCachedKey(id: string): CryptoKey | undefined {
    return this.keyCache.get(id);
  }

  clearKeyCache(): void {
    this.keyCache.clear();
  }
}

export const encryptionManager = new EncryptionManager();

// ---------------------------------------------------------------------------
// 851-855. Sandboxing & Isolation
// ---------------------------------------------------------------------------

export class SandboxManager {
  private permissions: Map<string, SandboxPermission> = new Map();
  private iframeRefs: Map<string, HTMLIFrameElement> = new Map();

  // 851. Permission Management
  grantPermission(permission: Omit<SandboxPermission, 'id'>): SandboxPermission {
    const perm: SandboxPermission = {
      ...permission,
      id: this.generateId(),
    };
    this.permissions.set(perm.id, perm);
    return perm;
  }

  revokePermission(id: string): boolean {
    return this.permissions.delete(id);
  }

  checkPermission(resource: SandboxPermission['resource'], scope?: string): boolean {
    for (const perm of this.permissions.values()) {
      if (perm.resource === resource && perm.allowed) {
        if (perm.expiresAt && perm.expiresAt < Date.now()) continue;
        if (scope && perm.scope && !scope.startsWith(perm.scope)) continue;
        return true;
      }
    }
    return false;
  }

  getPermissions(): SandboxPermission[] {
    return Array.from(this.permissions.values());
  }

  // 852. Content Security Policy
  generateCSP(options: {
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
  } = {}): string {
    const directives: string[] = [];

    const defaults = {
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    };

    const merged = { ...defaults, ...options };

    if (merged.scriptSrc) directives.push(`script-src ${merged.scriptSrc.join(' ')}`);
    if (merged.styleSrc) directives.push(`style-src ${merged.styleSrc.join(' ')}`);
    if (merged.imgSrc) directives.push(`img-src ${merged.imgSrc.join(' ')}`);
    if (merged.connectSrc) directives.push(`connect-src ${merged.connectSrc.join(' ')}`);
    if (merged.fontSrc) directives.push(`font-src ${merged.fontSrc.join(' ')}`);
    if (merged.objectSrc) directives.push(`object-src ${merged.objectSrc.join(' ')}`);
    if (merged.mediaSrc) directives.push(`media-src ${merged.mediaSrc.join(' ')}`);
    if (merged.frameSrc) directives.push(`frame-src ${merged.frameSrc.join(' ')}`);

    return directives.join('; ');
  }

  // 853. Sandboxed iframe
  createSandboxedFrame(id: string, content: string, options: {
    allowScripts?: boolean;
    allowForms?: boolean;
    allowPopups?: boolean;
    allowSameOrigin?: boolean;
  } = {}): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    
    const sandboxFlags: string[] = [];
    if (options.allowScripts) sandboxFlags.push('allow-scripts');
    if (options.allowForms) sandboxFlags.push('allow-forms');
    if (options.allowPopups) sandboxFlags.push('allow-popups');
    if (options.allowSameOrigin) sandboxFlags.push('allow-same-origin');
    
    iframe.setAttribute('sandbox', sandboxFlags.join(' '));
    iframe.srcdoc = content;
    iframe.style.border = 'none';
    
    this.iframeRefs.set(id, iframe);
    return iframe;
  }

  destroySandboxedFrame(id: string): void {
    const iframe = this.iframeRefs.get(id);
    if (iframe) {
      iframe.remove();
      this.iframeRefs.delete(id);
    }
  }

  // 854. Web Worker Sandbox
  createSandboxedWorker(code: string): Worker {
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  }

  // 855. Process Isolation (stub for Electron)
  createIsolatedContext(name: string): { id: string; postMessage: (msg: unknown) => void } {
    const id = this.generateId();
    // In Electron, this would create a separate renderer process
    return {
      id,
      postMessage: (msg: unknown) => {
        console.log(`[IsolatedContext:${name}] Message:`, msg);
      },
    };
  }

  private generateId(): string {
    return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const sandboxManager = new SandboxManager();

// ---------------------------------------------------------------------------
// 856-860. Privacy Controls
// ---------------------------------------------------------------------------

export class PrivacyManager {
  private settings: PrivacySettings = {
    telemetryEnabled: false,
    crashReportsEnabled: true,
    analyticsEnabled: false,
    personalizedAdsEnabled: false,
    dataRetentionDays: 30,
    shareUsageData: false,
  };
  private dataCategories: Map<string, { description: string; size: number }> = new Map();
  private exportRequests: Map<string, DataExportRequest> = new Map();
  private deletionRequests: Map<string, DataDeletionRequest> = new Map();

  // 856. Privacy Dashboard
  getSettings(): PrivacySettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<PrivacySettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.persistSettings();
  }

  private persistSettings(): void {
    localStorage.setItem('dex-privacy-settings', JSON.stringify(this.settings));
  }

  loadSettings(): void {
    const stored = localStorage.getItem('dex-privacy-settings');
    if (stored) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(stored) };
      } catch {
        // Use defaults
      }
    }
  }

  // 857. Consent Management
  hasConsent(category: 'telemetry' | 'analytics' | 'crashReports' | 'personalizedAds'): boolean {
    switch (category) {
      case 'telemetry': return this.settings.telemetryEnabled;
      case 'analytics': return this.settings.analyticsEnabled;
      case 'crashReports': return this.settings.crashReportsEnabled;
      case 'personalizedAds': return this.settings.personalizedAdsEnabled;
      default: return false;
    }
  }

  setConsent(category: 'telemetry' | 'analytics' | 'crashReports' | 'personalizedAds', allowed: boolean): void {
    switch (category) {
      case 'telemetry': this.settings.telemetryEnabled = allowed; break;
      case 'analytics': this.settings.analyticsEnabled = allowed; break;
      case 'crashReports': this.settings.crashReportsEnabled = allowed; break;
      case 'personalizedAds': this.settings.personalizedAdsEnabled = allowed; break;
    }
    this.persistSettings();
  }

  // 858. Data Export (GDPR)
  async requestDataExport(options: {
    categories?: string[];
    format?: 'json' | 'csv' | 'xml';
  } = {}): Promise<DataExportRequest> {
    const request: DataExportRequest = {
      id: this.generateId(),
      type: options.categories ? 'partial' : 'full',
      categories: options.categories || Array.from(this.dataCategories.keys()),
      format: options.format || 'json',
      status: 'pending',
      createdAt: Date.now(),
    };

    this.exportRequests.set(request.id, request);
    
    // Process asynchronously
    this.processExportRequest(request.id);
    
    return request;
  }

  private async processExportRequest(id: string): Promise<void> {
    const request = this.exportRequests.get(id);
    if (!request) return;

    request.status = 'processing';

    try {
      // Simulate data collection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const data: Record<string, unknown> = {};
      for (const category of request.categories) {
        data[category] = await this.collectCategoryData(category);
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      request.downloadUrl = URL.createObjectURL(blob);
      request.status = 'completed';
      request.completedAt = Date.now();
    } catch {
      request.status = 'failed';
    }
  }

  private async collectCategoryData(category: string): Promise<unknown> {
    // Collect data for category
    return { category, exportedAt: new Date().toISOString() };
  }

  getExportRequest(id: string): DataExportRequest | undefined {
    return this.exportRequests.get(id);
  }

  // 859. Data Deletion (Right to be Forgotten)
  async requestDataDeletion(categories?: string[]): Promise<DataDeletionRequest> {
    const request: DataDeletionRequest = {
      id: this.generateId(),
      categories: categories || Array.from(this.dataCategories.keys()),
      status: 'pending',
      createdAt: Date.now(),
    };

    this.deletionRequests.set(request.id, request);
    
    // Process asynchronously
    this.processDeletionRequest(request.id);
    
    return request;
  }

  private async processDeletionRequest(id: string): Promise<void> {
    const request = this.deletionRequests.get(id);
    if (!request) return;

    request.status = 'processing';

    try {
      for (const category of request.categories) {
        await this.deleteCategoryData(category);
      }
      
      request.status = 'completed';
      request.completedAt = Date.now();
    } catch {
      request.status = 'failed';
    }
  }

  private async deleteCategoryData(category: string): Promise<void> {
    // Delete data for category
    this.dataCategories.delete(category);
    localStorage.removeItem(`dex-data-${category}`);
  }

  getDeletionRequest(id: string): DataDeletionRequest | undefined {
    return this.deletionRequests.get(id);
  }

  // 860. Data Minimization
  registerDataCategory(category: string, description: string): void {
    this.dataCategories.set(category, { description, size: 0 });
  }

  updateDataSize(category: string, size: number): void {
    const cat = this.dataCategories.get(category);
    if (cat) cat.size = size;
  }

  getDataCategories(): { category: string; description: string; size: number }[] {
    return Array.from(this.dataCategories.entries()).map(([category, data]) => ({
      category,
      ...data,
    }));
  }

  getTotalDataSize(): number {
    let total = 0;
    this.dataCategories.forEach(cat => total += cat.size);
    return total;
  }

  private generateId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const privacyManager = new PrivacyManager();

// ---------------------------------------------------------------------------
// 861-865. Security Auditing
// ---------------------------------------------------------------------------

export class SecurityAuditor {
  private logs: SecurityAuditLog[] = [];
  private maxLogs = 10000;
  private listeners: ((log: SecurityAuditLog) => void)[] = [];

  // 861. Audit Logging
  log(entry: Omit<SecurityAuditLog, 'id' | 'timestamp'>): SecurityAuditLog {
    const log: SecurityAuditLog = {
      ...entry,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.logs.push(log);
    
    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.notifyListeners(log);
    return log;
  }

  // 862. Access Control Logging
  logAccess(resource: string, action: string, userId?: string, outcome: 'success' | 'failure' | 'blocked' = 'success'): void {
    this.log({
      action: `access:${action}`,
      resource,
      userId,
      outcome,
    });
  }

  // 863. Authentication Logging
  logAuth(action: 'login' | 'logout' | 'failed' | 'mfa', userId?: string, details?: Record<string, unknown>): void {
    this.log({
      action: `auth:${action}`,
      resource: 'authentication',
      userId,
      outcome: action === 'failed' ? 'failure' : 'success',
      details,
    });
  }

  // 864. Data Access Logging
  logDataAccess(category: string, operation: 'read' | 'write' | 'delete', userId?: string): void {
    this.log({
      action: `data:${operation}`,
      resource: category,
      userId,
      outcome: 'success',
    });
  }

  // 865. Security Event Detection
  detectAnomalies(): { type: string; severity: 'low' | 'medium' | 'high'; details: string }[] {
    const anomalies: { type: string; severity: 'low' | 'medium' | 'high'; details: string }[] = [];
    const recentLogs = this.logs.filter(l => Date.now() - l.timestamp < 3600000); // Last hour

    // Check for multiple failed logins
    const failedLogins = recentLogs.filter(l => l.action === 'auth:failed');
    if (failedLogins.length > 5) {
      anomalies.push({
        type: 'multiple_failed_logins',
        severity: 'high',
        details: `${failedLogins.length} failed login attempts in the last hour`,
      });
    }

    // Check for blocked access attempts
    const blockedAccess = recentLogs.filter(l => l.outcome === 'blocked');
    if (blockedAccess.length > 10) {
      anomalies.push({
        type: 'multiple_blocked_access',
        severity: 'medium',
        details: `${blockedAccess.length} blocked access attempts in the last hour`,
      });
    }

    // Check for unusual data deletion
    const deletions = recentLogs.filter(l => l.action.includes('delete'));
    if (deletions.length > 20) {
      anomalies.push({
        type: 'mass_deletion',
        severity: 'high',
        details: `${deletions.length} deletion operations in the last hour`,
      });
    }

    return anomalies;
  }

  // Query logs
  getLogs(options: {
    action?: string;
    resource?: string;
    userId?: string;
    outcome?: 'success' | 'failure' | 'blocked';
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): SecurityAuditLog[] {
    let filtered = this.logs;

    if (options.action) {
      filtered = filtered.filter(l => l.action.includes(options.action!));
    }
    if (options.resource) {
      filtered = filtered.filter(l => l.resource === options.resource);
    }
    if (options.userId) {
      filtered = filtered.filter(l => l.userId === options.userId);
    }
    if (options.outcome) {
      filtered = filtered.filter(l => l.outcome === options.outcome);
    }
    if (options.startTime) {
      filtered = filtered.filter(l => l.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter(l => l.timestamp <= options.endTime!);
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clearLogs(): void {
    this.logs = [];
  }

  onLog(callback: (log: SecurityAuditLog) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(log: SecurityAuditLog): void {
    this.listeners.forEach(l => l(log));
  }

  private generateId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const securityAuditor = new SecurityAuditor();

// ---------------------------------------------------------------------------
// Secure Storage
// ---------------------------------------------------------------------------

export class SecureStorage {
  private encryptionKey: CryptoKey | null = null;

  async init(password: string): Promise<void> {
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    this.encryptionKey = await encryptionManager.deriveKey(password, salt);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!this.encryptionKey) throw new Error('Storage not initialized');

    const { encrypted, iv } = await encryptionManager.encrypt(value, this.encryptionKey);
    
    const stored = {
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
    };
    
    localStorage.setItem(`secure:${key}`, JSON.stringify(stored));
  }

  async getItem(key: string): Promise<string | null> {
    if (!this.encryptionKey) throw new Error('Storage not initialized');

    const stored = localStorage.getItem(`secure:${key}`);
    if (!stored) return null;

    try {
      const { data, iv } = JSON.parse(stored);
      const encrypted = new Uint8Array(data).buffer;
      const ivArray = new Uint8Array(iv);
      
      return encryptionManager.decryptToString(encrypted, this.encryptionKey, ivArray);
    } catch {
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(`secure:${key}`);
  }

  async clear(): Promise<void> {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('secure:'));
    keys.forEach(k => localStorage.removeItem(k));
  }

  isInitialized(): boolean {
    return this.encryptionKey !== null;
  }
}

export const secureStorage = new SecureStorage();

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function usePrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings>(() => privacyManager.getSettings());

  useEffect(() => {
    privacyManager.loadSettings();
    setSettings(privacyManager.getSettings());
  }, []);

  const updateSettings = useCallback((updates: Partial<PrivacySettings>) => {
    privacyManager.updateSettings(updates);
    setSettings(privacyManager.getSettings());
  }, []);

  return { settings, updateSettings };
}

export function useSecurityAudit() {
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [anomalies, setAnomalies] = useState<ReturnType<typeof securityAuditor.detectAnomalies>>([]);

  useEffect(() => {
    const update = () => {
      setLogs(securityAuditor.getLogs({ limit: 100 }));
      setAnomalies(securityAuditor.detectAnomalies());
    };

    update();
    const unsubscribe = securityAuditor.onLog(() => update());
    return unsubscribe;
  }, []);

  return { logs, anomalies, auditor: securityAuditor };
}

export function useSecureStorage(password: string) {
  const storage = useRef(new SecureStorage());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.current.init(password).then(() => setReady(true));
  }, [password]);

  return {
    ready,
    setItem: useCallback((key: string, value: string) => storage.current.setItem(key, value), []),
    getItem: useCallback((key: string) => storage.current.getItem(key), []),
    removeItem: useCallback((key: string) => storage.current.removeItem(key), []),
    clear: useCallback(() => storage.current.clear(), []),
  };
}

export function useEncryption() {
  return {
    generateKey: encryptionManager.generateKey.bind(encryptionManager),
    encrypt: encryptionManager.encrypt.bind(encryptionManager),
    decrypt: encryptionManager.decrypt.bind(encryptionManager),
    hash: encryptionManager.hash.bind(encryptionManager),
    generateKeyPair: encryptionManager.generateKeyPair.bind(encryptionManager),
  };
}

export function useSandbox() {
  const [permissions, setPermissions] = useState<SandboxPermission[]>([]);

  useEffect(() => {
    setPermissions(sandboxManager.getPermissions());
  }, []);

  const grantPermission = useCallback((permission: Omit<SandboxPermission, 'id'>) => {
    const perm = sandboxManager.grantPermission(permission);
    setPermissions(sandboxManager.getPermissions());
    return perm;
  }, []);

  const revokePermission = useCallback((id: string) => {
    sandboxManager.revokePermission(id);
    setPermissions(sandboxManager.getPermissions());
  }, []);

  const checkPermission = useCallback((resource: SandboxPermission['resource'], scope?: string) => {
    return sandboxManager.checkPermission(resource, scope);
  }, []);

  return { permissions, grantPermission, revokePermission, checkPermission };
}
