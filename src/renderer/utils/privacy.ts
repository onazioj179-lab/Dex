// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Privacy-First (Phase 5: Items 1126-1175)
// Privacy controls, encryption, data handling, anonymization
// =============================================================================

// =============================================================================
// PRIVACY CONTROLS (Items 1126-1135)
// =============================================================================

// ---------------------------------------------------------------------------
// 1126-1128. Privacy Dashboard State
// ---------------------------------------------------------------------------

export interface PrivacySettings {
  // Data collection
  analyticsEnabled: boolean;
  crashReportsEnabled: boolean;
  usageStatsEnabled: boolean;
  
  // Tracking
  doNotTrack: boolean;
  blockThirdPartyCookies: boolean;
  blockTrackers: boolean;
  blockFingerprinting: boolean;
  
  // Storage
  clearOnExit: boolean;
  historyRetentionDays: number;
  cookieRetentionDays: number;
  
  // Network
  dnsOverHttps: boolean;
  dnsProvider: 'cloudflare' | 'google' | 'quad9' | 'custom';
  customDnsUrl?: string;
  
  // Content
  blockAutoplay: boolean;
  blockNotifications: boolean;
  strictMode: boolean;
}

export const defaultPrivacySettings: PrivacySettings = {
  analyticsEnabled: false,
  crashReportsEnabled: true,
  usageStatsEnabled: false,
  
  doNotTrack: true,
  blockThirdPartyCookies: true,
  blockTrackers: true,
  blockFingerprinting: true,
  
  clearOnExit: false,
  historyRetentionDays: 30,
  cookieRetentionDays: 30,
  
  dnsOverHttps: true,
  dnsProvider: 'cloudflare',
  
  blockAutoplay: true,
  blockNotifications: true,
  strictMode: false,
};

export interface PrivacyScore {
  score: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  factors: Array<{
    name: string;
    impact: number;
    status: 'good' | 'warning' | 'bad';
    description: string;
    recommendation?: string;
  }>;
}

export function calculatePrivacyScore(settings: PrivacySettings): PrivacyScore {
  const factors: PrivacyScore['factors'] = [];
  let score = 50; // Base score
  
  // Analytics (10 points)
  if (!settings.analyticsEnabled) {
    score += 10;
    factors.push({
      name: 'Analytics',
      impact: 10,
      status: 'good',
      description: 'Analytics collection is disabled',
    });
  } else {
    factors.push({
      name: 'Analytics',
      impact: -10,
      status: 'bad',
      description: 'Analytics data is being collected',
      recommendation: 'Disable analytics for better privacy',
    });
  }
  
  // Tracking protection (15 points)
  if (settings.blockTrackers) {
    score += 15;
    factors.push({
      name: 'Tracker Blocking',
      impact: 15,
      status: 'good',
      description: 'Third-party trackers are blocked',
    });
  } else {
    factors.push({
      name: 'Tracker Blocking',
      impact: -15,
      status: 'bad',
      description: 'Trackers can follow your activity',
      recommendation: 'Enable tracker blocking',
    });
  }
  
  // Fingerprinting (10 points)
  if (settings.blockFingerprinting) {
    score += 10;
    factors.push({
      name: 'Fingerprinting Protection',
      impact: 10,
      status: 'good',
      description: 'Browser fingerprinting is blocked',
    });
  } else {
    factors.push({
      name: 'Fingerprinting Protection',
      impact: -5,
      status: 'warning',
      description: 'Sites can fingerprint your browser',
      recommendation: 'Enable fingerprinting protection',
    });
  }
  
  // DNS (5 points)
  if (settings.dnsOverHttps) {
    score += 5;
    factors.push({
      name: 'DNS Privacy',
      impact: 5,
      status: 'good',
      description: 'DNS queries are encrypted',
    });
  } else {
    factors.push({
      name: 'DNS Privacy',
      impact: -3,
      status: 'warning',
      description: 'DNS queries are visible to ISP',
      recommendation: 'Enable DNS over HTTPS',
    });
  }
  
  // Third-party cookies (10 points)
  if (settings.blockThirdPartyCookies) {
    score += 10;
    factors.push({
      name: 'Third-Party Cookies',
      impact: 10,
      status: 'good',
      description: 'Third-party cookies are blocked',
    });
  } else {
    factors.push({
      name: 'Third-Party Cookies',
      impact: -10,
      status: 'bad',
      description: 'Third-party cookies can track you',
      recommendation: 'Block third-party cookies',
    });
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Calculate grade
  let grade: PrivacyScore['grade'];
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';
  
  return { score, grade, factors };
}

// ---------------------------------------------------------------------------
// 1129-1131. Permission Manager
// ---------------------------------------------------------------------------

export type PermissionType = 
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'storage'
  | 'midi'
  | 'usb'
  | 'serial'
  | 'bluetooth';

export interface PermissionRecord {
  id: string;
  origin: string;
  permission: PermissionType;
  state: 'granted' | 'denied' | 'prompt';
  grantedAt?: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessed?: Date;
}

export interface PermissionPolicy {
  defaultState: 'prompt' | 'deny';
  autoExpireDays?: number;
  blockedOrigins: string[];
  trustedOrigins: string[];
}

export class PermissionManager {
  private permissions = new Map<string, PermissionRecord>();
  private policy: PermissionPolicy;
  private listeners = new Set<(record: PermissionRecord) => void>();
  
  constructor(policy: Partial<PermissionPolicy> = {}) {
    this.policy = {
      defaultState: policy.defaultState || 'prompt',
      autoExpireDays: policy.autoExpireDays,
      blockedOrigins: policy.blockedOrigins || [],
      trustedOrigins: policy.trustedOrigins || [],
    };
  }
  
  private getKey(origin: string, permission: PermissionType): string {
    return `${origin}:${permission}`;
  }
  
  query(origin: string, permission: PermissionType): PermissionRecord['state'] {
    // Check blocked list first
    if (this.policy.blockedOrigins.some(p => origin.includes(p))) {
      return 'denied';
    }
    
    // Check trusted list
    if (this.policy.trustedOrigins.some(p => origin.includes(p))) {
      return 'granted';
    }
    
    const key = this.getKey(origin, permission);
    const record = this.permissions.get(key);
    
    if (!record) {
      return this.policy.defaultState === 'deny' ? 'denied' : 'prompt';
    }
    
    // Check expiry
    if (record.expiresAt && new Date() > record.expiresAt) {
      return 'prompt';
    }
    
    return record.state;
  }
  
  grant(origin: string, permission: PermissionType, options: { expiresAt?: Date } = {}): void {
    const key = this.getKey(origin, permission);
    const existing = this.permissions.get(key);
    
    const record: PermissionRecord = {
      id: key,
      origin,
      permission,
      state: 'granted',
      grantedAt: new Date(),
      expiresAt: options.expiresAt || (this.policy.autoExpireDays 
        ? new Date(Date.now() + this.policy.autoExpireDays * 24 * 60 * 60 * 1000)
        : undefined),
      accessCount: existing?.accessCount || 0,
      lastAccessed: existing?.lastAccessed,
    };
    
    this.permissions.set(key, record);
    this.notifyListeners(record);
  }
  
  deny(origin: string, permission: PermissionType): void {
    const key = this.getKey(origin, permission);
    const record: PermissionRecord = {
      id: key,
      origin,
      permission,
      state: 'denied',
      accessCount: 0,
    };
    
    this.permissions.set(key, record);
    this.notifyListeners(record);
  }
  
  revoke(origin: string, permission: PermissionType): void {
    const key = this.getKey(origin, permission);
    this.permissions.delete(key);
  }
  
  revokeAll(origin: string): void {
    for (const key of this.permissions.keys()) {
      if (key.startsWith(`${origin}:`)) {
        this.permissions.delete(key);
      }
    }
  }
  
  recordAccess(origin: string, permission: PermissionType): void {
    const key = this.getKey(origin, permission);
    const record = this.permissions.get(key);
    
    if (record) {
      record.accessCount++;
      record.lastAccessed = new Date();
    }
  }
  
  getAllForOrigin(origin: string): PermissionRecord[] {
    const records: PermissionRecord[] = [];
    for (const record of this.permissions.values()) {
      if (record.origin === origin) {
        records.push(record);
      }
    }
    return records;
  }
  
  getAll(): PermissionRecord[] {
    return Array.from(this.permissions.values());
  }
  
  onPermissionChange(listener: (record: PermissionRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(record: PermissionRecord): void {
    for (const listener of this.listeners) {
      listener(record);
    }
  }
}

// ---------------------------------------------------------------------------
// 1132-1135. Data Minimization
// ---------------------------------------------------------------------------

export interface DataRetentionPolicy {
  category: string;
  retentionDays: number;
  autoDelete: boolean;
  anonymizeAfterDays?: number;
}

export interface StoredData {
  id: string;
  category: string;
  createdAt: Date;
  lastAccessed?: Date;
  size: number;
  encrypted: boolean;
  anonymized: boolean;
}

export class DataRetentionManager {
  private policies = new Map<string, DataRetentionPolicy>();
  private data = new Map<string, StoredData>();
  
  setPolicy(policy: DataRetentionPolicy): void {
    this.policies.set(policy.category, policy);
  }
  
  registerData(data: StoredData): void {
    this.data.set(data.id, data);
  }
  
  async enforceRetention(): Promise<{ deleted: number; anonymized: number }> {
    const now = new Date();
    let deleted = 0;
    let anonymized = 0;
    
    for (const [id, data] of this.data) {
      const policy = this.policies.get(data.category);
      if (!policy) continue;
      
      const ageInDays = (now.getTime() - data.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      
      // Check for deletion
      if (policy.autoDelete && ageInDays > policy.retentionDays) {
        this.data.delete(id);
        deleted++;
        continue;
      }
      
      // Check for anonymization
      if (policy.anonymizeAfterDays && ageInDays > policy.anonymizeAfterDays && !data.anonymized) {
        data.anonymized = true;
        anonymized++;
      }
    }
    
    return { deleted, anonymized };
  }
  
  getDataByCategory(category: string): StoredData[] {
    return Array.from(this.data.values()).filter(d => d.category === category);
  }
  
  getStorageUsage(): Map<string, number> {
    const usage = new Map<string, number>();
    
    for (const data of this.data.values()) {
      const current = usage.get(data.category) || 0;
      usage.set(data.category, current + data.size);
    }
    
    return usage;
  }
  
  clearCategory(category: string): number {
    let count = 0;
    for (const [id, data] of this.data) {
      if (data.category === category) {
        this.data.delete(id);
        count++;
      }
    }
    return count;
  }
  
  clearAll(): void {
    this.data.clear();
  }
}


// =============================================================================
// ENCRYPTION (Items 1136-1150)
// =============================================================================

// ---------------------------------------------------------------------------
// 1136-1140. Encryption Utilities
// ---------------------------------------------------------------------------

export interface EncryptionKey {
  id: string;
  key: CryptoKey;
  algorithm: 'AES-GCM' | 'AES-CBC';
  createdAt: Date;
  expiresAt?: Date;
}

export interface EncryptedData {
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  keyId: string;
  algorithm: string;
  authTag?: ArrayBuffer;
}

export class EncryptionService {
  private keys = new Map<string, EncryptionKey>();
  
  async generateKey(
    algorithm: 'AES-GCM' | 'AES-CBC' = 'AES-GCM',
    options: { expiresAt?: Date } = {}
  ): Promise<EncryptionKey> {
    const key = await crypto.subtle.generateKey(
      { name: algorithm, length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const encryptionKey: EncryptionKey = {
      id: crypto.randomUUID(),
      key,
      algorithm,
      createdAt: new Date(),
      expiresAt: options.expiresAt,
    };
    
    this.keys.set(encryptionKey.id, encryptionKey);
    return encryptionKey;
  }
  
  async importKey(
    rawKey: ArrayBuffer,
    algorithm: 'AES-GCM' | 'AES-CBC' = 'AES-GCM'
  ): Promise<EncryptionKey> {
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: algorithm, length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const encryptionKey: EncryptionKey = {
      id: crypto.randomUUID(),
      key,
      algorithm,
      createdAt: new Date(),
    };
    
    this.keys.set(encryptionKey.id, encryptionKey);
    return encryptionKey;
  }
  
  async encrypt(data: ArrayBuffer, keyId: string): Promise<EncryptedData> {
    const encryptionKey = this.keys.get(keyId);
    if (!encryptionKey) throw new Error('Key not found');
    
    // Check expiry
    if (encryptionKey.expiresAt && new Date() > encryptionKey.expiresAt) {
      throw new Error('Key has expired');
    }
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: encryptionKey.algorithm, iv },
      encryptionKey.key,
      data
    );
    
    return {
      ciphertext,
      iv,
      keyId,
      algorithm: encryptionKey.algorithm,
    };
  }
  
  async decrypt(encryptedData: EncryptedData): Promise<ArrayBuffer> {
    const encryptionKey = this.keys.get(encryptedData.keyId);
    if (!encryptionKey) throw new Error('Key not found');
    
    return crypto.subtle.decrypt(
      { name: encryptionKey.algorithm, iv: encryptedData.iv as BufferSource },
      encryptionKey.key,
      encryptedData.ciphertext
    );
  }
  
  async exportKey(keyId: string): Promise<ArrayBuffer> {
    const encryptionKey = this.keys.get(keyId);
    if (!encryptionKey) throw new Error('Key not found');
    
    return crypto.subtle.exportKey('raw', encryptionKey.key);
  }
  
  deleteKey(keyId: string): boolean {
    return this.keys.delete(keyId);
  }
  
  clearExpiredKeys(): number {
    const now = new Date();
    let count = 0;
    
    for (const [id, key] of this.keys) {
      if (key.expiresAt && now > key.expiresAt) {
        this.keys.delete(id);
        count++;
      }
    }
    
    return count;
  }
}

// ---------------------------------------------------------------------------
// 1141-1145. Secure Storage
// ---------------------------------------------------------------------------

export interface SecureStorageOptions {
  encryptionKeyId?: string;
  compress?: boolean;
  ttl?: number;
}

export class SecureStorage {
  private encryption: EncryptionService;
  private storage: Map<string, { data: EncryptedData | string; expiresAt?: Date }>;
  private defaultKeyId?: string;
  
  constructor(encryptionService: EncryptionService) {
    this.encryption = encryptionService;
    this.storage = new Map();
  }
  
  async setDefaultKey(keyId: string): Promise<void> {
    this.defaultKeyId = keyId;
  }
  
  async setItem(
    key: string,
    value: unknown,
    options: SecureStorageOptions = {}
  ): Promise<void> {
    const keyId = options.encryptionKeyId || this.defaultKeyId;
    const data = JSON.stringify(value);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    let stored: EncryptedData | string;
    
    if (keyId) {
      stored = await this.encryption.encrypt(encoded.buffer, keyId);
    } else {
      // Fallback to base64 encoding (not encrypted)
      stored = btoa(data);
    }
    
    this.storage.set(key, {
      data: stored,
      expiresAt: options.ttl ? new Date(Date.now() + options.ttl) : undefined,
    });
  }
  
  async getItem<T = unknown>(key: string): Promise<T | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;
    
    // Check expiry
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.storage.delete(key);
      return null;
    }
    
    let data: string;
    
    if (typeof entry.data === 'string') {
      // Base64 encoded
      data = atob(entry.data);
    } else {
      // Encrypted
      const decrypted = await this.encryption.decrypt(entry.data);
      const decoder = new TextDecoder();
      data = decoder.decode(decrypted);
    }
    
    return JSON.parse(data) as T;
  }
  
  removeItem(key: string): boolean {
    return this.storage.delete(key);
  }
  
  clear(): void {
    this.storage.clear();
  }
  
  keys(): string[] {
    return Array.from(this.storage.keys());
  }
  
  clearExpired(): number {
    const now = new Date();
    let count = 0;
    
    for (const [key, entry] of this.storage) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.storage.delete(key);
        count++;
      }
    }
    
    return count;
  }
}

// ---------------------------------------------------------------------------
// 1146-1150. Password/Key Derivation
// ---------------------------------------------------------------------------

export interface DerivedKeyOptions {
  salt?: Uint8Array;
  iterations?: number;
  keyLength?: number;
  algorithm?: 'PBKDF2' | 'Argon2';
}

const defaultDerivedKeyOptions: Required<Omit<DerivedKeyOptions, 'salt'>> = {
  iterations: 100000,
  keyLength: 256,
  algorithm: 'PBKDF2',
};

export async function deriveKey(
  password: string,
  options: DerivedKeyOptions = {}
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const opts = { ...defaultDerivedKeyOptions, ...options };
  const salt = options.salt || crypto.getRandomValues(new Uint8Array(16));
  
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: opts.iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: opts.keyLength },
    true,
    ['encrypt', 'decrypt']
  );
  
  return { key, salt };
}

export async function hashPassword(password: string, salt?: Uint8Array): Promise<{
  hash: string;
  salt: Uint8Array;
}> {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const combined = new Uint8Array(passwordBuffer.length + actualSalt.length);
  combined.set(passwordBuffer);
  combined.set(actualSalt, passwordBuffer.length);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { hash, salt: actualSalt };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: Uint8Array
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}


// =============================================================================
// DATA ANONYMIZATION (Items 1151-1165)
// =============================================================================

// ---------------------------------------------------------------------------
// 1151-1155. PII Detection and Redaction
// ---------------------------------------------------------------------------

export interface PIIPattern {
  type: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

const defaultPIIPatterns: PIIPattern[] = [
  {
    type: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL REDACTED]',
  },
  {
    type: 'phone',
    pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: '[PHONE REDACTED]',
  },
  {
    type: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    replacement: '[SSN REDACTED]',
  },
  {
    type: 'creditCard',
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    replacement: '[CARD REDACTED]',
  },
  {
    type: 'ipAddress',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: (match) => {
      // Keep network portion, mask host
      const parts = match.split('.');
      return `${parts[0]}.${parts[1]}.XXX.XXX`;
    },
  },
];

export class PIIRedactor {
  private patterns: PIIPattern[];
  
  constructor(customPatterns: PIIPattern[] = []) {
    this.patterns = [...defaultPIIPatterns, ...customPatterns];
  }
  
  redact(text: string): { redacted: string; detections: Array<{ type: string; count: number }> } {
    const detections = new Map<string, number>();
    let redacted = text;
    
    for (const pattern of this.patterns) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        detections.set(pattern.type, matches.length);
        
        if (typeof pattern.replacement === 'function') {
          redacted = redacted.replace(pattern.pattern, pattern.replacement);
        } else {
          redacted = redacted.replace(pattern.pattern, pattern.replacement);
        }
      }
    }
    
    return {
      redacted,
      detections: Array.from(detections.entries()).map(([type, count]) => ({ type, count })),
    };
  }
  
  detect(text: string): Array<{ type: string; matches: string[]; positions: number[] }> {
    const results: Array<{ type: string; matches: string[]; positions: number[] }> = [];
    
    for (const pattern of this.patterns) {
      const matches: string[] = [];
      const positions: number[] = [];
      
      let match;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        matches.push(match[0]);
        positions.push(match.index);
      }
      
      if (matches.length > 0) {
        results.push({ type: pattern.type, matches, positions });
      }
    }
    
    return results;
  }
  
  addPattern(pattern: PIIPattern): void {
    this.patterns.push(pattern);
  }
}

// ---------------------------------------------------------------------------
// 1156-1160. Data Anonymization
// ---------------------------------------------------------------------------

export interface AnonymizationConfig {
  fields: Map<string, AnonymizationStrategy>;
  preserveStructure: boolean;
  hashSalt?: string;
}

export type AnonymizationStrategy =
  | { type: 'redact' }
  | { type: 'hash'; algorithm?: 'SHA-256' | 'SHA-512' }
  | { type: 'mask'; char?: string; keepStart?: number; keepEnd?: number }
  | { type: 'generalize'; precision?: number }
  | { type: 'randomize'; preserveFormat?: boolean }
  | { type: 'pseudonymize'; mapping?: Map<string, string> };

export class DataAnonymizer {
  private config: AnonymizationConfig;
  private pseudonymMaps = new Map<string, Map<string, string>>();
  
  constructor(config: Partial<AnonymizationConfig> = {}) {
    this.config = {
      fields: config.fields || new Map(),
      preserveStructure: config.preserveStructure ?? true,
      hashSalt: config.hashSalt,
    };
  }
  
  async anonymize(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      const strategy = this.config.fields.get(key);
      
      if (!strategy) {
        result[key] = value;
        continue;
      }
      
      result[key] = await this.applyStrategy(key, value, strategy);
    }
    
    return result;
  }
  
  private async applyStrategy(
    field: string,
    value: unknown,
    strategy: AnonymizationStrategy
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    
    const strValue = String(value);
    
    switch (strategy.type) {
      case 'redact':
        return '[REDACTED]';
        
      case 'hash': {
        const encoder = new TextEncoder();
        const data = encoder.encode(this.config.hashSalt ? `${this.config.hashSalt}:${strValue}` : strValue);
        const hashBuffer = await crypto.subtle.digest(strategy.algorithm || 'SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
      }
        
      case 'mask': {
        const char = strategy.char || '*';
        const keepStart = strategy.keepStart || 0;
        const keepEnd = strategy.keepEnd || 0;
        
        if (keepStart + keepEnd >= strValue.length) return strValue;
        
        const start = strValue.substring(0, keepStart);
        const end = strValue.substring(strValue.length - keepEnd);
        const middle = char.repeat(strValue.length - keepStart - keepEnd);
        
        return start + middle + end;
      }
        
      case 'generalize': {
        if (typeof value === 'number') {
          const precision = strategy.precision || 10;
          return Math.floor(value / precision) * precision;
        }
        return value;
      }
        
      case 'randomize': {
        if (strategy.preserveFormat) {
          // Preserve format, replace content
          return strValue.replace(/[a-zA-Z]/g, () => 
            String.fromCharCode(97 + Math.floor(Math.random() * 26))
          ).replace(/[0-9]/g, () => 
            String(Math.floor(Math.random() * 10))
          );
        }
        return crypto.randomUUID();
      }
        
      case 'pseudonymize': {
        let map = this.pseudonymMaps.get(field);
        if (!map) {
          map = strategy.mapping || new Map();
          this.pseudonymMaps.set(field, map);
        }
        
        if (!map.has(strValue)) {
          map.set(strValue, crypto.randomUUID().substring(0, 8));
        }
        
        return map.get(strValue);
      }
        
      default:
        return value;
    }
  }
  
  setStrategy(field: string, strategy: AnonymizationStrategy): void {
    this.config.fields.set(field, strategy);
  }
  
  getPseudonymMapping(field: string): Map<string, string> | undefined {
    return this.pseudonymMaps.get(field);
  }
}

// ---------------------------------------------------------------------------
// 1161-1165. K-Anonymity
// ---------------------------------------------------------------------------

export interface QuasiIdentifier {
  field: string;
  generalize: (value: unknown) => unknown;
}

export function checkKAnonymity<T extends Record<string, unknown>>(
  data: T[],
  quasiIdentifiers: string[],
  k: number
): { isKAnonymous: boolean; minGroupSize: number; violatingRecords: T[] } {
  // Group by quasi-identifiers
  const groups = new Map<string, T[]>();
  
  for (const record of data) {
    const key = quasiIdentifiers.map(qi => String(record[qi])).join('|');
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }
  
  // Find minimum group size and violating records
  let minGroupSize = Infinity;
  const violatingRecords: T[] = [];
  
  for (const group of groups.values()) {
    if (group.length < k) {
      violatingRecords.push(...group);
    }
    minGroupSize = Math.min(minGroupSize, group.length);
  }
  
  return {
    isKAnonymous: minGroupSize >= k,
    minGroupSize,
    violatingRecords,
  };
}

export function enforceKAnonymity<T extends Record<string, unknown>>(
  data: T[],
  quasiIdentifiers: QuasiIdentifier[],
  k: number,
  maxIterations = 10
): T[] {
  let result = [...data];
  
  for (let i = 0; i < maxIterations; i++) {
    const qiFields = quasiIdentifiers.map(qi => qi.field);
    const check = checkKAnonymity(result, qiFields, k);
    
    if (check.isKAnonymous) break;
    
    // Generalize all quasi-identifiers
    result = result.map(record => {
      const newRecord = { ...record } as Record<string, unknown>;
      for (const qi of quasiIdentifiers) {
        newRecord[qi.field as string] = qi.generalize(record[qi.field]);
      }
      return newRecord as T;
    });
  }
  
  return result;
}


// =============================================================================
// TRACKING PROTECTION (Items 1166-1175)
// =============================================================================

// ---------------------------------------------------------------------------
// 1166-1170. Tracker Blocker
// ---------------------------------------------------------------------------

export interface TrackerRule {
  id: string;
  pattern: RegExp;
  category: 'advertising' | 'analytics' | 'social' | 'fingerprinting' | 'other';
  action: 'block' | 'strip-params' | 'redirect';
  replacementUrl?: string;
}

export interface BlockedRequest {
  url: string;
  rule: TrackerRule;
  timestamp: Date;
  tabId?: number;
}

export class TrackerBlocker {
  private rules: TrackerRule[] = [];
  private blocked: BlockedRequest[] = [];
  private enabled = true;
  private whitelist = new Set<string>();
  
  constructor(rules: TrackerRule[] = []) {
    this.rules = rules;
  }
  
  addRule(rule: TrackerRule): void {
    this.rules.push(rule);
  }
  
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }
  
  checkUrl(url: string): { blocked: boolean; rule?: TrackerRule } {
    if (!this.enabled) return { blocked: false };
    
    // Check whitelist
    try {
      const urlObj = new URL(url);
      if (this.whitelist.has(urlObj.hostname)) {
        return { blocked: false };
      }
    } catch {
      // Invalid URL
    }
    
    for (const rule of this.rules) {
      if (rule.pattern.test(url)) {
        return { blocked: true, rule };
      }
    }
    
    return { blocked: false };
  }
  
  processUrl(url: string, tabId?: number): { action: 'allow' | 'block' | 'modify'; newUrl?: string } {
    const check = this.checkUrl(url);
    
    if (!check.blocked || !check.rule) {
      return { action: 'allow' };
    }
    
    this.blocked.push({
      url,
      rule: check.rule,
      timestamp: new Date(),
      tabId,
    });
    
    switch (check.rule.action) {
      case 'block':
        return { action: 'block' };
      
      case 'strip-params':
        try {
          const urlObj = new URL(url);
          // Remove tracking parameters
          const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
          trackingParams.forEach(p => urlObj.searchParams.delete(p));
          return { action: 'modify', newUrl: urlObj.toString() };
        } catch {
          return { action: 'block' };
        }
      
      case 'redirect':
        return { action: 'modify', newUrl: check.rule.replacementUrl };
      
      default:
        return { action: 'block' };
    }
  }
  
  getBlockedCount(): number {
    return this.blocked.length;
  }
  
  getBlockedByCategory(): Map<TrackerRule['category'], number> {
    const counts = new Map<TrackerRule['category'], number>();
    
    for (const request of this.blocked) {
      const current = counts.get(request.rule.category) || 0;
      counts.set(request.rule.category, current + 1);
    }
    
    return counts;
  }
  
  getRecentBlocked(limit = 50): BlockedRequest[] {
    return this.blocked.slice(-limit);
  }
  
  addToWhitelist(domain: string): void {
    this.whitelist.add(domain);
  }
  
  removeFromWhitelist(domain: string): void {
    this.whitelist.delete(domain);
  }
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  clearHistory(): void {
    this.blocked = [];
  }
}

// ---------------------------------------------------------------------------
// 1171-1175. Fingerprinting Protection
// ---------------------------------------------------------------------------

export interface FingerprintProtectionConfig {
  spoofCanvas: boolean;
  spoofWebGL: boolean;
  spoofAudio: boolean;
  spoofFonts: boolean;
  spoofScreen: boolean;
  spoofTimezone: boolean;
  noiseLevel: 'low' | 'medium' | 'high';
}

export const defaultFingerprintConfig: FingerprintProtectionConfig = {
  spoofCanvas: true,
  spoofWebGL: true,
  spoofAudio: true,
  spoofFonts: true,
  spoofScreen: true,
  spoofTimezone: true,
  noiseLevel: 'medium',
};

export function generateFingerprintNoise(config: FingerprintProtectionConfig): {
  canvasNoise: number;
  audioNoise: number;
  screenNoise: { width: number; height: number };
  timezoneOffset: number;
} {
  const noiseMultiplier = config.noiseLevel === 'low' ? 0.5 
    : config.noiseLevel === 'high' ? 2 
    : 1;
  
  return {
    canvasNoise: (Math.random() - 0.5) * 0.01 * noiseMultiplier,
    audioNoise: (Math.random() - 0.5) * 0.0001 * noiseMultiplier,
    screenNoise: {
      width: Math.floor((Math.random() - 0.5) * 100 * noiseMultiplier),
      height: Math.floor((Math.random() - 0.5) * 100 * noiseMultiplier),
    },
    timezoneOffset: Math.floor((Math.random() - 0.5) * 60 * noiseMultiplier),
  };
}

export interface FingerprintReport {
  entropy: number;
  uniqueness: 'low' | 'medium' | 'high' | 'very-high';
  components: Array<{
    name: string;
    value: string;
    entropy: number;
    risk: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
}

export function analyzeFingerprintRisk(): FingerprintReport {
  const components: FingerprintReport['components'] = [];
  const recommendations: string[] = [];
  
  // User Agent
  const ua = navigator.userAgent;
  components.push({
    name: 'User Agent',
    value: ua.substring(0, 50) + '...',
    entropy: 10,
    risk: 'medium',
  });
  
  // Screen
  const screenInfo = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  components.push({
    name: 'Screen',
    value: screenInfo,
    entropy: 5,
    risk: 'low',
  });
  
  // Timezone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  components.push({
    name: 'Timezone',
    value: tz,
    entropy: 3,
    risk: 'low',
  });
  
  // Languages
  const languages = navigator.languages.join(', ');
  components.push({
    name: 'Languages',
    value: languages,
    entropy: 4,
    risk: 'low',
  });
  
  // Hardware concurrency
  const cores = navigator.hardwareConcurrency;
  components.push({
    name: 'CPU Cores',
    value: String(cores),
    entropy: 2,
    risk: 'low',
  });
  
  // Total entropy
  const totalEntropy = components.reduce((sum, c) => sum + c.entropy, 0);
  
  // Uniqueness
  let uniqueness: FingerprintReport['uniqueness'];
  if (totalEntropy < 20) uniqueness = 'low';
  else if (totalEntropy < 30) uniqueness = 'medium';
  else if (totalEntropy < 40) uniqueness = 'high';
  else uniqueness = 'very-high';
  
  // Recommendations
  if (totalEntropy > 25) {
    recommendations.push('Enable canvas fingerprinting protection');
    recommendations.push('Use a privacy-focused browser mode');
  }
  if (components.find(c => c.name === 'User Agent')?.entropy ?? 0 > 8) {
    recommendations.push('Consider using a more common user agent');
  }
  
  return {
    entropy: totalEntropy,
    uniqueness,
    components,
    recommendations,
  };
}


// All exports are at declaration
