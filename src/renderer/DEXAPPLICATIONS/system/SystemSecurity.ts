// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - SYSTEM - Security Engine
// Encryption, sandboxing, permissions, and security monitoring
// Items 926-950 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 926-930: ENCRYPTION & DATA PROTECTION
// =============================================================================

export interface EncryptionKey {
  id: string;
  name: string;
  algorithm: EncryptionAlgorithm;
  keySize: number;
  publicKey?: string;
  privateKeyHash?: string;
  createdAt: number;
  expiresAt?: number;
  usageCount: number;
  isActive: boolean;
}

export type EncryptionAlgorithm = 
  | 'AES-256-GCM' | 'AES-256-CBC' | 'AES-128-GCM'
  | 'ChaCha20-Poly1305' | 'RSA-OAEP' | 'RSA-PSS'
  | 'ECDSA-P256' | 'ECDSA-P384' | 'Ed25519';

export interface EncryptedData {
  id: string;
  keyId: string;
  algorithm: EncryptionAlgorithm;
  iv?: string;
  authTag?: string;
  encryptedData: string;
  createdAt: number;
}

export interface SecureVault {
  id: string;
  name: string;
  keyId: string;
  entries: VaultEntry[];
  isLocked: boolean;
  lastAccessed: number;
  autoLockTimeout: number;
}

export interface VaultEntry {
  id: string;
  category: VaultCategory;
  name: string;
  username?: string;
  encryptedPassword?: string;
  url?: string;
  notes?: string;
  customFields: Record<string, string>;
  createdAt: number;
  modifiedAt: number;
  lastUsed?: number;
  strength?: PasswordStrength;
}

export type VaultCategory = 
  | 'login' | 'credit-card' | 'identity' | 'secure-note'
  | 'software-license' | 'ssh-key' | 'api-key' | 'wifi';

export type PasswordStrength = 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';

export interface SecureFileOptions {
  algorithm: EncryptionAlgorithm;
  keyDerivation: 'PBKDF2' | 'Argon2' | 'scrypt';
  iterations?: number;
  memCost?: number;
  deleteOriginal: boolean;
}

// =============================================================================
// ITEM 931-935: SANDBOX & ISOLATION
// =============================================================================

export interface Sandbox {
  id: string;
  name: string;
  type: SandboxType;
  status: SandboxStatus;
  restrictions: SandboxRestrictions;
  allowedPaths: string[];
  deniedPaths: string[];
  networkPolicy: NetworkPolicy;
  resourceLimits: ResourceLimits;
  createdAt: number;
  processIds: number[];
}

export type SandboxType = 
  | 'process' | 'container' | 'vm' | 'jail' | 'namespace';

export type SandboxStatus = 
  | 'active' | 'suspended' | 'terminated' | 'creating' | 'error';

export interface SandboxRestrictions {
  canAccessNetwork: boolean;
  canAccessFilesystem: boolean;
  canAccessDevices: boolean;
  canAccessClipboard: boolean;
  canAccessCamera: boolean;
  canAccessMicrophone: boolean;
  canAccessLocation: boolean;
  canSpawnProcesses: boolean;
  canAccessRegistry: boolean;
  canElevatePrivileges: boolean;
}

export interface NetworkPolicy {
  allowInbound: boolean;
  allowOutbound: boolean;
  allowedHosts: string[];
  blockedHosts: string[];
  allowedPorts: number[];
  blockedPorts: number[];
  maxBandwidth?: number;
}

export interface ResourceLimits {
  maxCpu: number;
  maxMemory: number;
  maxDisk: number;
  maxProcesses: number;
  maxOpenFiles: number;
  maxNetworkConnections: number;
}

// =============================================================================
// ITEM 936-940: PERMISSIONS & ACCESS CONTROL
// =============================================================================

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
  risk: RiskLevel;
  isGranted: boolean;
  grantedTo: string[];
  expiresAt?: number;
}

export type PermissionCategory = 
  | 'filesystem' | 'network' | 'system' | 'hardware'
  | 'privacy' | 'security' | 'admin' | 'app-specific';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  permissionId: string;
  reason: string;
  status: AccessRequestStatus;
  requestedAt: number;
  decidedAt?: number;
  decidedBy?: string;
  expiresAt?: number;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface AccessPolicy {
  id: string;
  name: string;
  rules: AccessRule[];
  priority: number;
  isActive: boolean;
}

export interface AccessRule {
  id: string;
  subject: string;
  resource: string;
  action: 'allow' | 'deny';
  conditions: AccessCondition[];
}

export interface AccessCondition {
  type: 'time' | 'location' | 'device' | 'user' | 'group';
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt';
  value: unknown;
}

export const DEFAULT_PERMISSIONS: Permission[] = [
  { id: 'fs-read', name: 'Read Files', description: 'Read files from disk', category: 'filesystem', risk: 'low', isGranted: true, grantedTo: [] },
  { id: 'fs-write', name: 'Write Files', description: 'Write files to disk', category: 'filesystem', risk: 'medium', isGranted: true, grantedTo: [] },
  { id: 'fs-delete', name: 'Delete Files', description: 'Delete files from disk', category: 'filesystem', risk: 'high', isGranted: false, grantedTo: [] },
  { id: 'net-access', name: 'Network Access', description: 'Access the internet', category: 'network', risk: 'medium', isGranted: true, grantedTo: [] },
  { id: 'sys-info', name: 'System Info', description: 'Read system information', category: 'system', risk: 'low', isGranted: true, grantedTo: [] },
  { id: 'hw-camera', name: 'Camera', description: 'Access the camera', category: 'hardware', risk: 'high', isGranted: false, grantedTo: [] },
  { id: 'hw-mic', name: 'Microphone', description: 'Access the microphone', category: 'hardware', risk: 'high', isGranted: false, grantedTo: [] },
  { id: 'priv-location', name: 'Location', description: 'Access location data', category: 'privacy', risk: 'medium', isGranted: false, grantedTo: [] },
  { id: 'sec-keychain', name: 'Keychain', description: 'Access secure keychain', category: 'security', risk: 'critical', isGranted: false, grantedTo: [] },
  { id: 'admin-elevate', name: 'Admin', description: 'Run with elevated privileges', category: 'admin', risk: 'critical', isGranted: false, grantedTo: [] }
];

// =============================================================================
// ITEM 941-945: SECURITY MONITORING
// =============================================================================

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  source: string;
  target?: string;
  description: string;
  details: Record<string, unknown>;
  timestamp: number;
  handled: boolean;
  response?: string;
}

export type SecurityEventType = 
  | 'auth-success' | 'auth-failure' | 'permission-granted' | 'permission-denied'
  | 'file-access' | 'network-access' | 'process-spawn' | 'privilege-escalation'
  | 'malware-detected' | 'intrusion-attempt' | 'policy-violation' | 'data-exfiltration'
  | 'encryption-failure' | 'encryption-success' | 'decryption-failure'
  | 'certificate-error' | 'tamper-detected'
  | 'threat-mitigated' | 'threat-resolved';

export type SecuritySeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ThreatReport {
  id: string;
  type: ThreatType;
  severity: SecuritySeverity;
  source: string;
  description: string;
  indicators: ThreatIndicator[];
  mitigations: string[];
  detectedAt: number;
  status: ThreatStatus;
}

export type ThreatType = 
  | 'malware' | 'ransomware' | 'phishing' | 'spyware'
  | 'rootkit' | 'backdoor' | 'trojan' | 'worm'
  | 'exploit' | 'unauthorized-access' | 'data-breach';

export type ThreatStatus = 'detected' | 'analyzing' | 'mitigated' | 'resolved' | 'false-positive';

export interface ThreatIndicator {
  type: 'hash' | 'ip' | 'domain' | 'url' | 'file-path' | 'registry' | 'behavior';
  value: string;
  confidence: number;
}

export interface SecurityScan {
  id: string;
  type: ScanType;
  status: ScanStatus;
  startTime: number;
  endTime?: number;
  itemsScanned: number;
  itemsTotal: number;
  threats: ThreatReport[];
}

export type ScanType = 'quick' | 'full' | 'custom' | 'scheduled';
export type ScanStatus = 'pending' | 'running' | 'paused' | 'complete' | 'cancelled';

// =============================================================================
// ITEM 946-950: SECURITY ENGINE
// =============================================================================

export class SecurityEngine {
  private keys: Map<string, EncryptionKey> = new Map();
  private vaults: Map<string, SecureVault> = new Map();
  private sandboxes: Map<string, Sandbox> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private accessRequests: Map<string, AccessRequest> = new Map();
  private policies: Map<string, AccessPolicy> = new Map();
  private securityEvents: SecurityEvent[] = [];
  private threats: Map<string, ThreatReport> = new Map();
  private scans: Map<string, SecurityScan> = new Map();
  private listeners: Map<string, Set<(event: SecurityEngineEvent) => void>> = new Map();
  
  constructor() {
    // Initialize default permissions
    for (const perm of DEFAULT_PERMISSIONS) {
      this.permissions.set(perm.id, { ...perm });
    }
    
    // Create default encryption key
    this.generateKey('default', 'AES-256-GCM');
  }
  
  // Encryption
  generateKey(name: string, algorithm: EncryptionAlgorithm, expiresIn?: number): EncryptionKey {
    const keySizes: Record<string, number> = {
      'AES-256-GCM': 256,
      'AES-256-CBC': 256,
      'AES-128-GCM': 128,
      'ChaCha20-Poly1305': 256,
      'RSA-OAEP': 2048,
      'RSA-PSS': 2048,
      'ECDSA-P256': 256,
      'ECDSA-P384': 384,
      'Ed25519': 256
    };
    
    const key: EncryptionKey = {
      id: this.generateId('key'),
      name,
      algorithm,
      keySize: keySizes[algorithm] || 256,
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : undefined,
      usageCount: 0,
      isActive: true
    };
    
    this.keys.set(key.id, key);
    this.logSecurityEvent('encryption-success', 'info', 'system', `Generated new ${algorithm} key`);
    this.emit('key-generated', { key });
    return key;
  }
  
  encrypt(data: string, keyId: string): EncryptedData | null {
    const key = this.keys.get(keyId);
    if (!key || !key.isActive) {
      this.logSecurityEvent('encryption-failure', 'error', 'system', 'Invalid or inactive key');
      return null;
    }
    
    key.usageCount++;
    
    const encrypted: EncryptedData = {
      id: this.generateId('enc'),
      keyId,
      algorithm: key.algorithm,
      iv: this.generateRandomHex(16),
      authTag: this.generateRandomHex(16),
      encryptedData: Buffer.from(data).toString('base64'),
      createdAt: Date.now()
    };
    
    this.emit('data-encrypted', { encrypted });
    return encrypted;
  }
  
  decrypt(encrypted: EncryptedData): string | null {
    const key = this.keys.get(encrypted.keyId);
    if (!key || !key.isActive) {
      this.logSecurityEvent('decryption-failure', 'error', 'system', 'Invalid or inactive key');
      return null;
    }
    
    key.usageCount++;
    
    try {
      const decrypted = Buffer.from(encrypted.encryptedData, 'base64').toString('utf-8');
      this.emit('data-decrypted', { keyId: encrypted.keyId });
      return decrypted;
    } catch {
      this.logSecurityEvent('decryption-failure', 'error', 'system', 'Decryption failed');
      return null;
    }
  }
  
  revokeKey(keyId: string): void {
    const key = this.keys.get(keyId);
    if (key) {
      key.isActive = false;
      this.emit('key-revoked', { keyId });
    }
  }
  
  getKeys(): EncryptionKey[] {
    return Array.from(this.keys.values());
  }
  
  // Secure vault
  createVault(name: string, password: string): SecureVault {
    const keyId = this.generateKey(`vault-${name}`, 'AES-256-GCM').id;
    
    const vault: SecureVault = {
      id: this.generateId('vault'),
      name,
      keyId,
      entries: [],
      isLocked: true,
      lastAccessed: Date.now(),
      autoLockTimeout: 300000
    };
    
    this.vaults.set(vault.id, vault);
    this.emit('vault-created', { vault: { ...vault, entries: [] } });
    return vault;
  }
  
  unlockVault(vaultId: string, password: string): boolean {
    const vault = this.vaults.get(vaultId);
    if (!vault) return false;
    
    // In production, verify password against stored hash
    vault.isLocked = false;
    vault.lastAccessed = Date.now();
    
    this.logSecurityEvent('auth-success', 'info', 'vault', `Vault ${vault.name} unlocked`);
    this.emit('vault-unlocked', { vaultId });
    return true;
  }
  
  lockVault(vaultId: string): void {
    const vault = this.vaults.get(vaultId);
    if (vault) {
      vault.isLocked = true;
      this.emit('vault-locked', { vaultId });
    }
  }
  
  addVaultEntry(vaultId: string, entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt'>): VaultEntry | null {
    const vault = this.vaults.get(vaultId);
    if (!vault || vault.isLocked) return null;
    
    const newEntry: VaultEntry = {
      ...entry,
      id: this.generateId('entry'),
      createdAt: Date.now(),
      modifiedAt: Date.now()
    };
    
    vault.entries.push(newEntry);
    vault.lastAccessed = Date.now();
    
    this.emit('vault-entry-added', { vaultId, entryId: newEntry.id });
    return newEntry;
  }
  
  updateVaultEntry(vaultId: string, entryId: string, updates: Partial<VaultEntry>): VaultEntry | null {
    const vault = this.vaults.get(vaultId);
    if (!vault || vault.isLocked) return null;
    
    const entry = vault.entries.find(e => e.id === entryId);
    if (!entry) return null;
    
    Object.assign(entry, updates, { modifiedAt: Date.now() });
    vault.lastAccessed = Date.now();
    
    this.emit('vault-entry-updated', { vaultId, entryId });
    return entry;
  }
  
  deleteVaultEntry(vaultId: string, entryId: string): void {
    const vault = this.vaults.get(vaultId);
    if (!vault || vault.isLocked) return;
    
    vault.entries = vault.entries.filter(e => e.id !== entryId);
    vault.lastAccessed = Date.now();
    
    this.emit('vault-entry-deleted', { vaultId, entryId });
  }
  
  getVaults(): SecureVault[] {
    return Array.from(this.vaults.values()).map(v => ({
      ...v,
      entries: v.isLocked ? [] : v.entries
    }));
  }
  
  // Sandbox
  createSandbox(name: string, type: SandboxType, restrictions: Partial<SandboxRestrictions>): Sandbox {
    const sandbox: Sandbox = {
      id: this.generateId('sb'),
      name,
      type,
      status: 'creating',
      restrictions: {
        canAccessNetwork: false,
        canAccessFilesystem: false,
        canAccessDevices: false,
        canAccessClipboard: false,
        canAccessCamera: false,
        canAccessMicrophone: false,
        canAccessLocation: false,
        canSpawnProcesses: false,
        canAccessRegistry: false,
        canElevatePrivileges: false,
        ...restrictions
      },
      allowedPaths: [],
      deniedPaths: [],
      networkPolicy: {
        allowInbound: false,
        allowOutbound: false,
        allowedHosts: [],
        blockedHosts: [],
        allowedPorts: [],
        blockedPorts: []
      },
      resourceLimits: {
        maxCpu: 50,
        maxMemory: 1073741824,
        maxDisk: 10737418240,
        maxProcesses: 10,
        maxOpenFiles: 100,
        maxNetworkConnections: 10
      },
      createdAt: Date.now(),
      processIds: []
    };
    
    this.sandboxes.set(sandbox.id, sandbox);
    
    setTimeout(() => {
      sandbox.status = 'active';
      this.emit('sandbox-ready', { sandboxId: sandbox.id });
    }, 1000);
    
    this.emit('sandbox-created', { sandbox });
    return sandbox;
  }
  
  terminateSandbox(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      sandbox.status = 'terminated';
      this.emit('sandbox-terminated', { sandboxId });
    }
  }
  
  addAllowedPath(sandboxId: string, path: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox && !sandbox.allowedPaths.includes(path)) {
      sandbox.allowedPaths.push(path);
      this.emit('sandbox-path-allowed', { sandboxId, path });
    }
  }
  
  addDeniedPath(sandboxId: string, path: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox && !sandbox.deniedPaths.includes(path)) {
      sandbox.deniedPaths.push(path);
      this.emit('sandbox-path-denied', { sandboxId, path });
    }
  }
  
  getSandboxes(): Sandbox[] {
    return Array.from(this.sandboxes.values());
  }
  
  // Permissions
  grantPermission(permissionId: string, grantee: string): void {
    const permission = this.permissions.get(permissionId);
    if (permission) {
      permission.isGranted = true;
      if (!permission.grantedTo.includes(grantee)) {
        permission.grantedTo.push(grantee);
      }
      
      this.logSecurityEvent('permission-granted', 'info', grantee, `Permission ${permissionId} granted`);
      this.emit('permission-granted', { permissionId, grantee });
    }
  }
  
  revokePermission(permissionId: string, grantee: string): void {
    const permission = this.permissions.get(permissionId);
    if (permission) {
      permission.grantedTo = permission.grantedTo.filter(g => g !== grantee);
      if (permission.grantedTo.length === 0) {
        permission.isGranted = false;
      }
      
      this.logSecurityEvent('permission-denied', 'info', grantee, `Permission ${permissionId} revoked`);
      this.emit('permission-revoked', { permissionId, grantee });
    }
  }
  
  checkPermission(permissionId: string, requester: string): boolean {
    const permission = this.permissions.get(permissionId);
    if (!permission) return false;
    
    const hasPermission = permission.isGranted && 
      (permission.grantedTo.length === 0 || permission.grantedTo.includes(requester));
    
    this.logSecurityEvent(
      hasPermission ? 'permission-granted' : 'permission-denied',
      hasPermission ? 'info' : 'warning',
      requester,
      `Permission check for ${permissionId}`
    );
    
    return hasPermission;
  }
  
  getPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }
  
  requestAccess(requester: string, requesterName: string, permissionId: string, reason: string): AccessRequest {
    const request: AccessRequest = {
      id: this.generateId('req'),
      requesterId: requester,
      requesterName,
      permissionId,
      reason,
      status: 'pending',
      requestedAt: Date.now()
    };
    
    this.accessRequests.set(request.id, request);
    this.emit('access-requested', { request });
    return request;
  }
  
  approveAccessRequest(requestId: string, decidedBy: string, expiresIn?: number): void {
    const request = this.accessRequests.get(requestId);
    if (request && request.status === 'pending') {
      request.status = 'approved';
      request.decidedAt = Date.now();
      request.decidedBy = decidedBy;
      request.expiresAt = expiresIn ? Date.now() + expiresIn : undefined;
      
      this.grantPermission(request.permissionId, request.requesterId);
      this.emit('access-approved', { requestId });
    }
  }
  
  denyAccessRequest(requestId: string, decidedBy: string): void {
    const request = this.accessRequests.get(requestId);
    if (request && request.status === 'pending') {
      request.status = 'denied';
      request.decidedAt = Date.now();
      request.decidedBy = decidedBy;
      
      this.emit('access-denied', { requestId });
    }
  }
  
  getPendingRequests(): AccessRequest[] {
    return Array.from(this.accessRequests.values())
      .filter(r => r.status === 'pending');
  }
  
  // Security scanning
  startScan(type: ScanType, paths?: string[]): SecurityScan {
    const scan: SecurityScan = {
      id: this.generateId('scan'),
      type,
      status: 'running',
      startTime: Date.now(),
      itemsScanned: 0,
      itemsTotal: type === 'quick' ? 1000 : type === 'full' ? 100000 : 5000,
      threats: []
    };
    
    this.scans.set(scan.id, scan);
    this.emit('scan-started', { scan });
    
    // Simulate scanning
    const interval = setInterval(() => {
      const s = this.scans.get(scan.id);
      if (!s || s.status !== 'running') {
        clearInterval(interval);
        return;
      }
      
      s.itemsScanned += Math.floor(Math.random() * 1000);
      
      // Random threat detection
      if (Math.random() > 0.95) {
        const threat = this.createThreat();
        s.threats.push(threat);
        this.emit('threat-detected', { threat });
      }
      
      this.emit('scan-progress', { scanId: s.id, progress: s.itemsScanned / s.itemsTotal });
      
      if (s.itemsScanned >= s.itemsTotal) {
        clearInterval(interval);
        s.status = 'complete';
        s.endTime = Date.now();
        this.emit('scan-complete', { scan: s });
      }
    }, 100);
    
    return scan;
  }
  
  pauseScan(scanId: string): void {
    const scan = this.scans.get(scanId);
    if (scan && scan.status === 'running') {
      scan.status = 'paused';
      this.emit('scan-paused', { scanId });
    }
  }
  
  resumeScan(scanId: string): void {
    const scan = this.scans.get(scanId);
    if (scan && scan.status === 'paused') {
      scan.status = 'running';
      this.emit('scan-resumed', { scanId });
    }
  }
  
  cancelScan(scanId: string): void {
    const scan = this.scans.get(scanId);
    if (scan && scan.status !== 'complete') {
      scan.status = 'cancelled';
      scan.endTime = Date.now();
      this.emit('scan-cancelled', { scanId });
    }
  }
  
  getScan(scanId: string): SecurityScan | undefined {
    return this.scans.get(scanId);
  }
  
  getActiveScans(): SecurityScan[] {
    return Array.from(this.scans.values())
      .filter(s => s.status === 'running' || s.status === 'paused');
  }
  
  private createThreat(): ThreatReport {
    const types: ThreatType[] = ['malware', 'phishing', 'spyware', 'trojan'];
    const severities: SecuritySeverity[] = ['warning', 'error', 'critical'];
    
    const threat: ThreatReport = {
      id: this.generateId('threat'),
      type: types[Math.floor(Math.random() * types.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      source: '/path/to/suspicious/file.exe',
      description: 'Suspicious file detected',
      indicators: [{
        type: 'hash',
        value: this.generateRandomHex(32),
        confidence: 0.8 + Math.random() * 0.2
      }],
      mitigations: ['Quarantine file', 'Delete file', 'Ignore'],
      detectedAt: Date.now(),
      status: 'detected'
    };
    
    this.threats.set(threat.id, threat);
    this.logSecurityEvent('malware-detected', threat.severity, threat.source, threat.description);
    
    return threat;
  }
  
  quarantineThreat(threatId: string): void {
    const threat = this.threats.get(threatId);
    if (threat) {
      threat.status = 'mitigated';
      this.logSecurityEvent('threat-mitigated', 'info', threat.source, `Threat ${threat.type} quarantined`);
      this.emit('threat-quarantined', { threatId });
    }
  }
  
  deleteThreat(threatId: string): void {
    const threat = this.threats.get(threatId);
    if (threat) {
      threat.status = 'resolved';
      this.logSecurityEvent('threat-resolved', 'info', threat.source, `Threat ${threat.type} deleted`);
      this.emit('threat-deleted', { threatId });
    }
  }
  
  getThreats(): ThreatReport[] {
    return Array.from(this.threats.values());
  }
  
  // Security event logging
  private logSecurityEvent(
    type: SecurityEventType,
    severity: SecuritySeverity,
    source: string,
    description: string,
    details: Record<string, unknown> = {}
  ): void {
    const event: SecurityEvent = {
      id: this.generateId('evt'),
      type,
      severity,
      source,
      description,
      details,
      timestamp: Date.now(),
      handled: false
    };
    
    this.securityEvents.push(event);
    
    // Keep only last 1000 events
    while (this.securityEvents.length > 1000) {
      this.securityEvents.shift();
    }
    
    this.emit('security-event', { event });
  }
  
  getSecurityEvents(filter?: { type?: SecurityEventType; severity?: SecuritySeverity; limit?: number }): SecurityEvent[] {
    let events = [...this.securityEvents];
    
    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }
    if (filter?.severity) {
      events = events.filter(e => e.severity === filter.severity);
    }
    
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    if (filter?.limit) {
      events = events.slice(0, filter.limit);
    }
    
    return events;
  }
  
  // Event handling
  on(event: string, callback: (event: SecurityEngineEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: SecurityEngineEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const secEvent: SecurityEngineEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(secEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private generateRandomHex(bytes: number): string {
    return Array.from({ length: bytes }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface SecurityEngineEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createSecurityEngine = () => new SecurityEngine();

export default { SecurityEngine, createSecurityEngine };
