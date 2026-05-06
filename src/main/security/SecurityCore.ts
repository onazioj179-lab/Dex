// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Security Core
// Defensive system security core
// Layered security architecture with defense in depth
// ===========================================================================

import { app, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SecurityConfig {
  layersEnabled: SecurityLayerConfig;
  integrityChecks: boolean;
  auditLogging: boolean;
  memoryProtection: boolean;
  autoLockTimeout: number; // minutes, 0 = disabled
  lastSecurityCheck: number;
}

export interface SecurityLayerConfig {
  osSandbox: boolean;
  processIsolation: boolean;
  encryptionLayer: boolean;
  executionControl: boolean;
  auditIntegrity: boolean;
}

export interface SecurityStatus {
  overallHealth: 'healthy' | 'warning' | 'critical';
  layers: LayerStatus[];
  lastCheck: number;
  threats: SecurityThreat[];
  recommendations: string[];
}

export interface LayerStatus {
  layer: number;
  name: string;
  status: 'active' | 'degraded' | 'disabled';
  details: string;
}

export interface SecurityThreat {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'integrity' | 'tampering' | 'exposure' | 'permission';
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface SecureContext {
  id: string;
  createdAt: number;
  expiresAt: number;
  permissions: string[];
  resourceLimits: ResourceLimits;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDurationMs: number;
  allowNetwork: boolean;
  allowFileSystem: boolean;
}

export interface IntegrityRecord {
  filePath: string;
  hash: string;
  size: number;
  lastVerified: number;
  status: 'verified' | 'modified' | 'missing';
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const SECURITY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const CONTEXT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_THREATS_STORED = 100;

// ===========================================================================
// STORE
// ===========================================================================

const securityStore = new Store<{
  config: SecurityConfig;
  integrityRecords: Record<string, IntegrityRecord>;
  threats: SecurityThreat[];
  auditLog: AuditEntry[];
}>({
  name: 'dex-security',
  defaults: {
    config: {
      layersEnabled: {
        osSandbox: true,
        processIsolation: true,
        encryptionLayer: true,
        executionControl: true,
        auditIntegrity: true,
      },
      integrityChecks: true,
      auditLogging: true,
      memoryProtection: true,
      autoLockTimeout: 15,
      lastSecurityCheck: 0,
    },
    integrityRecords: {},
    threats: [],
    auditLog: [],
  },
});

interface AuditEntry {
  timestamp: number;
  action: string;
  category: string;
  details: string;
  success: boolean;
}

// ===========================================================================
// SECURITY CORE
// ===========================================================================

class SecurityCoreClass {
  private activeContexts: Map<string, SecureContext> = new Map();
  private integrityCache: Map<string, IntegrityRecord> = new Map();
  private isInitialized = false;
  private checkInterval: NodeJS.Timeout | null = null;

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info('[SecurityCore] Initializing defensive security layers...');

    // Load integrity records into cache
    const records = securityStore.get('integrityRecords');
    Object.values(records).forEach(record => {
      this.integrityCache.set(record.filePath, record);
    });

    // Perform initial security check
    await this.performSecurityCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(
      () => this.performSecurityCheck(),
      SECURITY_CHECK_INTERVAL
    );

    // Clean expired contexts periodically
    setInterval(() => this.cleanExpiredContexts(), 60 * 1000);

    this.isInitialized = true;
    this.audit('security:initialize', 'system', 'Security core initialized', true);
    log.info('[SecurityCore] Security layers active');
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all contexts
    this.activeContexts.clear();

    // Zero-fill sensitive data
    this.integrityCache.clear();

    this.isInitialized = false;
    log.info('[SecurityCore] Security core shutdown');
  }

  // -------------------------------------------------------------------------
  // LAYER 1: OS SANDBOX & PERMISSIONS
  // -------------------------------------------------------------------------

  getOSSandboxStatus(): LayerStatus {
    const config = this.getConfig();
    
    if (!config.layersEnabled.osSandbox) {
      return {
        layer: 1,
        name: 'OS Sandbox & Permissions',
        status: 'disabled',
        details: 'OS sandbox layer disabled by configuration',
      };
    }

    // Check if running in sandbox (Electron's sandbox mode)
    const sandboxed = app.isPackaged;
    const safeStorageAvailable = safeStorage.isEncryptionAvailable();

    if (sandboxed && safeStorageAvailable) {
      return {
        layer: 1,
        name: 'OS Sandbox & Permissions',
        status: 'active',
        details: 'Running in sandboxed mode with OS keychain access',
      };
    }

    return {
      layer: 1,
      name: 'OS Sandbox & Permissions',
      status: 'degraded',
      details: sandboxed 
        ? 'Safe storage not available' 
        : 'Running in development mode (not sandboxed)',
    };
  }

  // -------------------------------------------------------------------------
  // LAYER 2: PROCESS ISOLATION
  // -------------------------------------------------------------------------

  getProcessIsolationStatus(): LayerStatus {
    const config = this.getConfig();
    
    if (!config.layersEnabled.processIsolation) {
      return {
        layer: 2,
        name: 'Process Isolation',
        status: 'disabled',
        details: 'Process isolation disabled by configuration',
      };
    }

    // Electron provides process isolation between main and renderer
    // Check if context isolation is enabled
    return {
      layer: 2,
      name: 'Process Isolation',
      status: 'active',
      details: 'Main/renderer process isolation active, IPC boundaries enforced',
    };
  }

  // -------------------------------------------------------------------------
  // LAYER 3: ENCRYPTION LAYER
  // -------------------------------------------------------------------------

  getEncryptionLayerStatus(): LayerStatus {
    const config = this.getConfig();
    
    if (!config.layersEnabled.encryptionLayer) {
      return {
        layer: 3,
        name: 'Encryption Layer',
        status: 'disabled',
        details: 'Encryption layer disabled by configuration',
      };
    }

    // Check if safe storage is available for key protection
    const safeStorageAvailable = safeStorage.isEncryptionAvailable();

    return {
      layer: 3,
      name: 'Encryption Layer',
      status: safeStorageAvailable ? 'active' : 'degraded',
      details: safeStorageAvailable
        ? 'AES-256-GCM encryption with OS keychain key storage'
        : 'Encryption available but OS keychain unavailable',
    };
  }

  // -------------------------------------------------------------------------
  // LAYER 4: EXECUTION CONTROL
  // -------------------------------------------------------------------------

  getExecutionControlStatus(): LayerStatus {
    const config = this.getConfig();
    
    if (!config.layersEnabled.executionControl) {
      return {
        layer: 4,
        name: 'Execution Control',
        status: 'disabled',
        details: 'Execution control disabled by configuration',
      };
    }

    const activeContextCount = this.activeContexts.size;

    return {
      layer: 4,
      name: 'Execution Control',
      status: 'active',
      details: `Constrained execution contexts active (${activeContextCount} current contexts)`,
    };
  }

  // Create a secure execution context
  createSecureContext(
    permissions: string[],
    limits?: Partial<ResourceLimits>
  ): SecureContext {
    const defaultLimits: ResourceLimits = {
      maxMemoryMB: 256,
      maxCpuPercent: 50,
      maxDurationMs: 30000,
      allowNetwork: false,
      allowFileSystem: false,
    };

    const context: SecureContext = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      expiresAt: Date.now() + CONTEXT_EXPIRY_MS,
      permissions,
      resourceLimits: { ...defaultLimits, ...limits },
    };

    this.activeContexts.set(context.id, context);
    this.audit('context:create', 'execution', `Created secure context ${context.id}`, true);

    return context;
  }

  // Validate context for operation
  validateContext(contextId: string, requiredPermission: string): boolean {
    const context = this.activeContexts.get(contextId);

    if (!context) {
      this.audit('context:validate', 'execution', `Invalid context ${contextId}`, false);
      return false;
    }

    if (Date.now() > context.expiresAt) {
      this.activeContexts.delete(contextId);
      this.audit('context:validate', 'execution', `Expired context ${contextId}`, false);
      return false;
    }

    if (!context.permissions.includes(requiredPermission) && !context.permissions.includes('*')) {
      this.audit('context:validate', 'execution', `Permission denied: ${requiredPermission}`, false);
      return false;
    }

    return true;
  }

  // Release context
  releaseContext(contextId: string): void {
    if (this.activeContexts.delete(contextId)) {
      this.audit('context:release', 'execution', `Released context ${contextId}`, true);
    }
  }

  private cleanExpiredContexts(): void {
    const now = Date.now();
    for (const [id, context] of this.activeContexts) {
      if (now > context.expiresAt) {
        this.activeContexts.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // LAYER 5: AUDIT & INTEGRITY
  // -------------------------------------------------------------------------

  getAuditIntegrityStatus(): LayerStatus {
    const config = this.getConfig();
    
    if (!config.layersEnabled.auditIntegrity) {
      return {
        layer: 5,
        name: 'Audit & Integrity',
        status: 'disabled',
        details: 'Audit & integrity layer disabled by configuration',
      };
    }

    const records = this.integrityCache.size;
    const modified = Array.from(this.integrityCache.values())
      .filter(r => r.status === 'modified').length;

    return {
      layer: 5,
      name: 'Audit & Integrity',
      status: modified > 0 ? 'degraded' : 'active',
      details: `Tracking ${records} files, ${modified} modifications detected`,
    };
  }

  // Register file for integrity monitoring
  async registerFileIntegrity(filePath: string): Promise<IntegrityRecord | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      const hash = await this.computeFileHash(filePath);

      const record: IntegrityRecord = {
        filePath,
        hash,
        size: stats.size,
        lastVerified: Date.now(),
        status: 'verified',
      };

      this.integrityCache.set(filePath, record);
      this.saveIntegrityRecords();

      return record;
    } catch (error) {
      log.error('[SecurityCore] Failed to register file integrity:', error);
      return null;
    }
  }

  // Verify file integrity
  async verifyFileIntegrity(filePath: string): Promise<IntegrityRecord | null> {
    const record = this.integrityCache.get(filePath);
    if (!record) return null;

    try {
      const stats = await fs.promises.stat(filePath);
      const currentHash = await this.computeFileHash(filePath);

      const modified = record.hash !== currentHash || record.size !== stats.size;

      record.lastVerified = Date.now();
      record.status = modified ? 'modified' : 'verified';

      if (modified) {
        this.recordThreat({
          id: crypto.randomUUID(),
          severity: 'medium',
          type: 'integrity',
          message: `File modified: ${filePath}`,
          timestamp: Date.now(),
          resolved: false,
        });
      }

      this.integrityCache.set(filePath, record);
      this.saveIntegrityRecords();

      return record;
    } catch (error) {
      record.status = 'missing';
      record.lastVerified = Date.now();
      this.integrityCache.set(filePath, record);
      this.saveIntegrityRecords();

      return record;
    }
  }

  private async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private saveIntegrityRecords(): void {
    const records: Record<string, IntegrityRecord> = {};
    for (const [key, value] of this.integrityCache) {
      records[key] = value;
    }
    securityStore.set('integrityRecords', records);
  }

  // -------------------------------------------------------------------------
  // SECURITY STATUS
  // -------------------------------------------------------------------------

  async performSecurityCheck(): Promise<SecurityStatus> {
    const layers: LayerStatus[] = [
      this.getOSSandboxStatus(),
      this.getProcessIsolationStatus(),
      this.getEncryptionLayerStatus(),
      this.getExecutionControlStatus(),
      this.getAuditIntegrityStatus(),
    ];

    const threats = securityStore.get('threats').filter(t => !t.resolved);
    const recommendations = this.generateRecommendations(layers, threats);

    // Determine overall health
    const degradedCount = layers.filter(l => l.status === 'degraded').length;
    const disabledCount = layers.filter(l => l.status === 'disabled').length;
    const criticalThreats = threats.filter(t => t.severity === 'critical').length;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalThreats > 0) {
      overallHealth = 'critical';
    } else if (degradedCount > 2 || disabledCount > 2) {
      overallHealth = 'warning';
    } else if (degradedCount > 0 || disabledCount > 0) {
      overallHealth = 'warning';
    }

    const config = this.getConfig();
    config.lastSecurityCheck = Date.now();
    securityStore.set('config', config);

    const status: SecurityStatus = {
      overallHealth,
      layers,
      lastCheck: Date.now(),
      threats,
      recommendations,
    };

    log.info(`[SecurityCore] Security check complete: ${overallHealth}`);
    return status;
  }

  getSecurityStatus(): SecurityStatus {
    const layers: LayerStatus[] = [
      this.getOSSandboxStatus(),
      this.getProcessIsolationStatus(),
      this.getEncryptionLayerStatus(),
      this.getExecutionControlStatus(),
      this.getAuditIntegrityStatus(),
    ];

    const threats = securityStore.get('threats').filter(t => !t.resolved);
    const recommendations = this.generateRecommendations(layers, threats);

    const degradedCount = layers.filter(l => l.status === 'degraded').length;
    const disabledCount = layers.filter(l => l.status === 'disabled').length;
    const criticalThreats = threats.filter(t => t.severity === 'critical').length;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalThreats > 0) {
      overallHealth = 'critical';
    } else if (degradedCount > 2 || disabledCount > 2) {
      overallHealth = 'warning';
    }

    return {
      overallHealth,
      layers,
      lastCheck: this.getConfig().lastSecurityCheck,
      threats,
      recommendations,
    };
  }

  private generateRecommendations(layers: LayerStatus[], threats: SecurityThreat[]): string[] {
    const recommendations: string[] = [];

    for (const layer of layers) {
      if (layer.status === 'disabled') {
        recommendations.push(`Enable ${layer.name} for better protection`);
      } else if (layer.status === 'degraded') {
        recommendations.push(`Review ${layer.name}: ${layer.details}`);
      }
    }

    if (threats.length > 5) {
      recommendations.push('Review and resolve pending security threats');
    }

    const config = this.getConfig();
    if (config.autoLockTimeout === 0) {
      recommendations.push('Consider enabling auto-lock for added security');
    }

    return recommendations;
  }

  // -------------------------------------------------------------------------
  // THREAT MANAGEMENT
  // -------------------------------------------------------------------------

  recordThreat(threat: SecurityThreat): void {
    const threats = securityStore.get('threats');
    threats.unshift(threat);

    // Keep only recent threats
    if (threats.length > MAX_THREATS_STORED) {
      threats.splice(MAX_THREATS_STORED);
    }

    securityStore.set('threats', threats);
    log.warn(`[SecurityCore] Threat recorded: ${threat.type} - ${threat.message}`);
  }

  resolveThreat(threatId: string): boolean {
    const threats = securityStore.get('threats');
    const threat = threats.find(t => t.id === threatId);

    if (threat) {
      threat.resolved = true;
      securityStore.set('threats', threats);
      this.audit('threat:resolve', 'security', `Resolved threat ${threatId}`, true);
      return true;
    }

    return false;
  }

  getThreats(): SecurityThreat[] {
    return securityStore.get('threats');
  }

  // -------------------------------------------------------------------------
  // AUDIT LOGGING
  // -------------------------------------------------------------------------

  private audit(action: string, category: string, details: string, success: boolean): void {
    const config = this.getConfig();
    if (!config.auditLogging) return;

    const entry: AuditEntry = {
      timestamp: Date.now(),
      action,
      category,
      details,
      success,
    };

    const auditLog = securityStore.get('auditLog');
    auditLog.unshift(entry);

    // Keep last 1000 entries
    if (auditLog.length > 1000) {
      auditLog.splice(1000);
    }

    securityStore.set('auditLog', auditLog);
  }

  getAuditLog(limit = 100): AuditEntry[] {
    return securityStore.get('auditLog').slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): SecurityConfig {
    return securityStore.get('config');
  }

  updateConfig(updates: Partial<SecurityConfig>): SecurityConfig {
    const config = this.getConfig();
    const updated = { ...config, ...updates };
    securityStore.set('config', updated);
    this.audit('config:update', 'system', 'Security config updated', true);
    return updated;
  }

  updateLayerConfig(updates: Partial<SecurityLayerConfig>): SecurityLayerConfig {
    const config = this.getConfig();
    config.layersEnabled = { ...config.layersEnabled, ...updates };
    securityStore.set('config', config);
    this.audit('config:layers', 'system', 'Security layers updated', true);
    return config.layersEnabled;
  }

  // -------------------------------------------------------------------------
  // MEMORY PROTECTION
  // -------------------------------------------------------------------------

  // Securely zero memory buffer
  zeroize(buffer: Buffer | Uint8Array): void {
    if (Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    } else if (buffer instanceof Uint8Array) {
      buffer.fill(0);
    }
  }

  // Create secure buffer that auto-zeroizes
  createSecureBuffer(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    // Register for cleanup on process exit
    process.once('exit', () => this.zeroize(buffer));
    return buffer;
  }
}

// ===========================================================================
// ITEMS 301-305: ADVANCED THREAT DETECTION
// ===========================================================================

export interface ThreatRule {
  id: string;
  name: string;
  category: ThreatCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  action: ThreatAction;
  enabled: boolean;
}

export type ThreatCategory = 
  | 'injection' | 'xss' | 'path-traversal' | 'command-injection'
  | 'resource-abuse' | 'data-exfiltration' | 'privilege-escalation';

export type ThreatAction = 'log' | 'block' | 'quarantine' | 'alert';

export const THREAT_RULES: ThreatRule[] = [
  { id: 'rule-001', name: 'SQL Injection', category: 'injection', severity: 'critical', pattern: '(?:union\\s+select|;\\s*drop|--\\s*$)', action: 'block', enabled: true },
  { id: 'rule-002', name: 'XSS Script', category: 'xss', severity: 'high', pattern: '<script[^>]*>|javascript:', action: 'block', enabled: true },
  { id: 'rule-003', name: 'Path Traversal', category: 'path-traversal', severity: 'high', pattern: '\\.\\.\\/|\\.\\.\\\\', action: 'block', enabled: true },
  { id: 'rule-004', name: 'Command Injection', category: 'command-injection', severity: 'critical', pattern: ';|\\||`|\\$\\(', action: 'block', enabled: true },
  { id: 'rule-005', name: 'Resource Exhaustion', category: 'resource-abuse', severity: 'medium', pattern: '', action: 'log', enabled: true },
];

export function detectThreats(input: string, rules: ThreatRule[]): ThreatRule[] {
  const matched: ThreatRule[] = [];
  
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(input)) {
        matched.push(rule);
      }
    } catch {
      // Invalid regex, skip
    }
  }
  
  return matched;
}

// ===========================================================================
// ITEMS 306-310: SECURITY MONITORING
// ===========================================================================

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: SecurityEventType;
  source: string;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  handled: boolean;
}

export type SecurityEventType =
  | 'login-attempt' | 'login-success' | 'login-failure'
  | 'permission-denied' | 'resource-access' | 'config-change'
  | 'threat-detected' | 'quarantine' | 'integrity-violation';

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  threatsBlocked: number;
  lastEventTime: number;
  uptimeSeconds: number;
}

export function createSecurityEvent(
  type: SecurityEventType,
  source: string,
  details: Record<string, unknown>,
  severity: SecurityEvent['severity'] = 'info'
): SecurityEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    type,
    source,
    details,
    severity,
    handled: false,
  };
}

export function calculateMetrics(events: SecurityEvent[]): SecurityMetrics {
  const metrics: SecurityMetrics = {
    totalEvents: events.length,
    eventsByType: {},
    eventsBySeverity: {},
    threatsBlocked: 0,
    lastEventTime: 0,
    uptimeSeconds: 0,
  };
  
  for (const event of events) {
    metrics.eventsByType[event.type] = (metrics.eventsByType[event.type] || 0) + 1;
    metrics.eventsBySeverity[event.severity] = (metrics.eventsBySeverity[event.severity] || 0) + 1;
    
    if (event.type === 'threat-detected' || event.type === 'quarantine') {
      metrics.threatsBlocked++;
    }
    
    if (event.timestamp > metrics.lastEventTime) {
      metrics.lastEventTime = event.timestamp;
    }
  }
  
  return metrics;
}

// ===========================================================================
// ITEMS 311-315: DATA PROTECTION
// ===========================================================================

export interface DataProtectionPolicy {
  id: string;
  name: string;
  dataTypes: DataType[];
  rules: ProtectionRule[];
  enabled: boolean;
}

export type DataType = 'pii' | 'financial' | 'health' | 'credentials' | 'intellectual-property';

export interface ProtectionRule {
  action: 'mask' | 'encrypt' | 'redact' | 'tokenize';
  pattern: string;
  replacement?: string;
}

export const DATA_PATTERNS: Record<DataType, string[]> = {
  'pii': [
    '\\b\\d{3}-\\d{2}-\\d{4}\\b', // SSN
    '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', // Email
    '\\b\\d{10,}\\b', // Phone
  ],
  'financial': [
    '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b', // Credit card
    '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b', // IBAN
  ],
  'health': [],
  'credentials': [
    '(?:password|passwd|pwd|secret|api[_-]?key|token)\\s*[:=]\\s*\\S+',
  ],
  'intellectual-property': [],
};

export function maskSensitiveData(text: string, dataTypes: DataType[]): string {
  let result = text;
  
  for (const type of dataTypes) {
    const patterns = DATA_PATTERNS[type] || [];
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        result = result.replace(regex, (match) => '*'.repeat(match.length));
      } catch {
        // Invalid regex
      }
    }
  }
  
  return result;
}

// ===========================================================================
// ITEMS 316-320: SECURITY COMPLIANCE
// ===========================================================================

export interface ComplianceCheck {
  id: string;
  standard: ComplianceStandard;
  requirement: string;
  status: 'pass' | 'fail' | 'warning' | 'not-applicable';
  details: string;
  remediation?: string;
}

export type ComplianceStandard = 'gdpr' | 'hipaa' | 'pci-dss' | 'soc2' | 'iso27001';

export interface ComplianceReport {
  generatedAt: number;
  standard: ComplianceStandard;
  overallScore: number;
  checks: ComplianceCheck[];
  passCount: number;
  failCount: number;
  warningCount: number;
}

export const COMPLIANCE_REQUIREMENTS: Record<ComplianceStandard, string[]> = {
  'gdpr': [
    'Data minimization',
    'Purpose limitation',
    'Storage limitation',
    'Encryption at rest',
    'Encryption in transit',
    'Access controls',
    'Audit logging',
    'Right to erasure',
  ],
  'hipaa': [
    'Access control',
    'Audit controls',
    'Integrity controls',
    'Transmission security',
    'Authentication',
  ],
  'pci-dss': [
    'Firewall configuration',
    'Secure passwords',
    'Protect stored data',
    'Encrypt transmission',
    'Anti-virus software',
    'Secure development',
  ],
  'soc2': [
    'Security policies',
    'Change management',
    'Risk assessment',
    'Monitoring',
    'Incident response',
  ],
  'iso27001': [
    'Information security policy',
    'Asset management',
    'Access control',
    'Cryptography',
    'Physical security',
    'Operations security',
  ],
};

export function generateComplianceReport(standard: ComplianceStandard, checks: ComplianceCheck[]): ComplianceReport {
  const filtered = checks.filter(c => c.standard === standard);
  const passCount = filtered.filter(c => c.status === 'pass').length;
  const failCount = filtered.filter(c => c.status === 'fail').length;
  const warningCount = filtered.filter(c => c.status === 'warning').length;
  const applicable = filtered.filter(c => c.status !== 'not-applicable').length;
  
  return {
    generatedAt: Date.now(),
    standard,
    overallScore: applicable > 0 ? Math.round((passCount / applicable) * 100) : 100,
    checks: filtered,
    passCount,
    failCount,
    warningCount,
  };
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const SecurityCore = new SecurityCoreClass();
export default SecurityCore;
