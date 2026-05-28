// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
  },
}));

const storeData: Record<string, unknown> = {};
vi.mock('electron-store', () => ({
  default: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key in storeData) return storeData[key];
      return defaultValue;
    }),
    set: vi.fn((key: string, value: unknown) => {
      storeData[key] = value;
    }),
    delete: vi.fn((key: string) => { delete storeData[key]; }),
    path: '/mock/dex-security.json',
  })),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  createReadStream: vi.fn(() => {
    const { EventEmitter } = require('events');
    const stream = new EventEmitter();
    setTimeout(() => {
      stream.emit('data', Buffer.from('test-content'));
      stream.emit('end');
    }, 0);
    return stream;
  }),
  promises: {
    stat: vi.fn(() => Promise.resolve({ size: 100 })),
    readFile: vi.fn(() => Promise.resolve('test-content')),
    writeFile: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve('test-content')),
  writeFile: vi.fn(() => Promise.resolve()),
  stat: vi.fn(() => Promise.resolve({ size: 100 })),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStoreData(): void {
  for (const key of Object.keys(storeData)) delete storeData[key];
  storeData['config'] = {
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
  };
  storeData['integrityRecords'] = {};
  storeData['threats'] = [];
  storeData['auditLog'] = [];
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SecurityCore', () => {
  let SecurityCore: any;
  let detectThreats: any;
  let THREAT_RULES: any;
  let createSecurityEvent: any;
  let calculateMetrics: any;
  let maskSensitiveData: any;
  let generateComplianceReport: any;
  let COMPLIANCE_REQUIREMENTS: any;

  beforeEach(async () => {
    vi.resetModules();
    resetStoreData();

    const mod = await import('../../src/main/security/SecurityCore');
    SecurityCore = mod.SecurityCore;
    detectThreats = mod.detectThreats;
    THREAT_RULES = mod.THREAT_RULES;
    createSecurityEvent = mod.createSecurityEvent;
    calculateMetrics = mod.calculateMetrics;
    maskSensitiveData = mod.maskSensitiveData;
    generateComplianceReport = mod.generateComplianceReport;
    COMPLIANCE_REQUIREMENTS = mod.COMPLIANCE_REQUIREMENTS;
  });

  // =========================================================================
  // SECURITY STATUS
  // =========================================================================

  describe('getSecurityStatus()', () => {
    it('returns a status with five layer entries', () => {
      const status = SecurityCore.getSecurityStatus();
      expect(status.layers).toHaveLength(5);
      expect(status.layers.map((l: any) => l.layer)).toEqual([1, 2, 3, 4, 5]);
    });

    it('reports healthy when all layers are active and no threats', () => {
      // In non-packaged dev mode, sandbox is degraded so health should be warning
      const status = SecurityCore.getSecurityStatus();
      // With app.isPackaged = false the sandbox layer is degraded, so expect warning
      expect(['healthy', 'warning']).toContain(status.overallHealth);
    });

    it('reports critical when there are critical-severity threats', () => {
      storeData['threats'] = [
        {
          id: 'threat-1',
          severity: 'critical',
          type: 'tampering',
          message: 'Critical test threat',
          timestamp: Date.now(),
          resolved: false,
        },
      ];
      const status = SecurityCore.getSecurityStatus();
      expect(status.overallHealth).toBe('critical');
    });

    it('includes recommendations for degraded layers', () => {
      const status = SecurityCore.getSecurityStatus();
      // dev mode means sandbox is degraded -> expect a recommendation
      expect(status.recommendations.length).toBeGreaterThan(0);
    });

    it('includes resolved threats in threat list only if unresolved', () => {
      storeData['threats'] = [
        { id: 't-1', severity: 'low', type: 'integrity', message: 'a', timestamp: 1, resolved: false },
        { id: 't-2', severity: 'low', type: 'integrity', message: 'b', timestamp: 2, resolved: true },
      ];
      const status = SecurityCore.getSecurityStatus();
      expect(status.threats).toHaveLength(1);
      expect(status.threats[0].id).toBe('t-1');
    });
  });

  // =========================================================================
  // LAYER STATUS REPORTING
  // =========================================================================

  describe('layer status methods', () => {
    it('getOSSandboxStatus() returns disabled when osSandbox is false', () => {
      (storeData['config'] as any).layersEnabled.osSandbox = false;
      const s = SecurityCore.getOSSandboxStatus();
      expect(s.status).toBe('disabled');
      expect(s.layer).toBe(1);
    });

    it('getOSSandboxStatus() returns degraded in dev mode', () => {
      const s = SecurityCore.getOSSandboxStatus();
      // app.isPackaged is false
      expect(s.status).toBe('degraded');
      expect(s.details).toContain('development');
    });

    it('getProcessIsolationStatus() returns active by default', () => {
      const s = SecurityCore.getProcessIsolationStatus();
      expect(s.status).toBe('active');
      expect(s.layer).toBe(2);
    });

    it('getProcessIsolationStatus() returns disabled when processIsolation is off', () => {
      (storeData['config'] as any).layersEnabled.processIsolation = false;
      const s = SecurityCore.getProcessIsolationStatus();
      expect(s.status).toBe('disabled');
    });

    it('getEncryptionLayerStatus() returns active when safe storage is available', () => {
      const s = SecurityCore.getEncryptionLayerStatus();
      expect(s.status).toBe('active');
      expect(s.layer).toBe(3);
    });

    it('getEncryptionLayerStatus() returns degraded when safe storage unavailable', async () => {
      const { safeStorage } = await import('electron');
      (safeStorage.isEncryptionAvailable as any).mockReturnValueOnce(false);
      const s = SecurityCore.getEncryptionLayerStatus();
      expect(s.status).toBe('degraded');
    });

    it('getEncryptionLayerStatus() returns disabled when encryptionLayer is off', () => {
      (storeData['config'] as any).layersEnabled.encryptionLayer = false;
      const s = SecurityCore.getEncryptionLayerStatus();
      expect(s.status).toBe('disabled');
    });

    it('getExecutionControlStatus() returns active with context count', () => {
      const s = SecurityCore.getExecutionControlStatus();
      expect(s.status).toBe('active');
      expect(s.layer).toBe(4);
      expect(s.details).toContain('0 current contexts');
    });

    it('getAuditIntegrityStatus() returns active when no modified files', () => {
      const s = SecurityCore.getAuditIntegrityStatus();
      expect(s.status).toBe('active');
      expect(s.layer).toBe(5);
    });
  });

  // =========================================================================
  // SECURE CONTEXT
  // =========================================================================

  describe('createSecureContext()', () => {
    it('creates a context with default resource limits', () => {
      const ctx = SecurityCore.createSecureContext(['read', 'write']);
      expect(ctx.id).toBeTruthy();
      expect(ctx.permissions).toEqual(['read', 'write']);
      expect(ctx.resourceLimits.maxMemoryMB).toBe(256);
      expect(ctx.resourceLimits.maxCpuPercent).toBe(50);
      expect(ctx.resourceLimits.allowNetwork).toBe(false);
      expect(ctx.resourceLimits.allowFileSystem).toBe(false);
    });

    it('merges custom resource limits over defaults', () => {
      const ctx = SecurityCore.createSecureContext(['net'], {
        maxMemoryMB: 512,
        allowNetwork: true,
      });
      expect(ctx.resourceLimits.maxMemoryMB).toBe(512);
      expect(ctx.resourceLimits.allowNetwork).toBe(true);
      // defaults still present
      expect(ctx.resourceLimits.maxCpuPercent).toBe(50);
    });

    it('sets expiry in the future', () => {
      const before = Date.now();
      const ctx = SecurityCore.createSecureContext([]);
      expect(ctx.expiresAt).toBeGreaterThan(before);
      expect(ctx.createdAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('validateContext()', () => {
    it('returns true for valid context with matching permission', () => {
      const ctx = SecurityCore.createSecureContext(['read']);
      expect(SecurityCore.validateContext(ctx.id, 'read')).toBe(true);
    });

    it('returns false for unknown context id', () => {
      expect(SecurityCore.validateContext('nonexistent-id', 'read')).toBe(false);
    });

    it('returns false when required permission is missing', () => {
      const ctx = SecurityCore.createSecureContext(['write']);
      expect(SecurityCore.validateContext(ctx.id, 'read')).toBe(false);
    });

    it('returns true when context has wildcard permission', () => {
      const ctx = SecurityCore.createSecureContext(['*']);
      expect(SecurityCore.validateContext(ctx.id, 'anything')).toBe(true);
    });

    it('returns false for expired context', () => {
      const ctx = SecurityCore.createSecureContext(['read']);
      // Manually expire the context by setting expiresAt to the past
      const internalCtx = (SecurityCore as any).activeContexts.get(ctx.id);
      internalCtx.expiresAt = Date.now() - 1000;
      expect(SecurityCore.validateContext(ctx.id, 'read')).toBe(false);
    });
  });

  describe('releaseContext()', () => {
    it('removes a context so validation fails afterward', () => {
      const ctx = SecurityCore.createSecureContext(['read']);
      SecurityCore.releaseContext(ctx.id);
      expect(SecurityCore.validateContext(ctx.id, 'read')).toBe(false);
    });

    it('does not throw when releasing an unknown context', () => {
      expect(() => SecurityCore.releaseContext('bogus-id')).not.toThrow();
    });
  });

  // =========================================================================
  // THREAT MANAGEMENT
  // =========================================================================

  describe('recordThreat()', () => {
    it('adds a threat to the store', () => {
      SecurityCore.recordThreat({
        id: 'threat-99',
        severity: 'high',
        type: 'tampering',
        message: 'Test tampering',
        timestamp: Date.now(),
        resolved: false,
      });
      const threats = storeData['threats'] as any[];
      expect(threats[0].id).toBe('threat-99');
    });

    it('limits stored threats to MAX_THREATS_STORED (100)', () => {
      for (let i = 0; i < 110; i++) {
        SecurityCore.recordThreat({
          id: `threat-${i}`,
          severity: 'low',
          type: 'integrity',
          message: `Threat ${i}`,
          timestamp: Date.now(),
          resolved: false,
        });
      }
      const threats = storeData['threats'] as any[];
      expect(threats.length).toBeLessThanOrEqual(100);
    });
  });

  describe('resolveThreat()', () => {
    it('marks a threat as resolved', () => {
      storeData['threats'] = [
        { id: 't-1', severity: 'low', type: 'integrity', message: 'x', timestamp: 1, resolved: false },
      ];
      expect(SecurityCore.resolveThreat('t-1')).toBe(true);
      expect((storeData['threats'] as any[])[0].resolved).toBe(true);
    });

    it('returns false when threat id is not found', () => {
      storeData['threats'] = [];
      expect(SecurityCore.resolveThreat('nonexistent')).toBe(false);
    });
  });

  describe('getThreats()', () => {
    it('returns all threats including resolved', () => {
      storeData['threats'] = [
        { id: 't-1', resolved: false },
        { id: 't-2', resolved: true },
      ];
      expect(SecurityCore.getThreats()).toHaveLength(2);
    });
  });

  // =========================================================================
  // CONFIG MANAGEMENT
  // =========================================================================

  describe('getConfig() / updateConfig()', () => {
    it('returns the current security config', () => {
      const config = SecurityCore.getConfig();
      expect(config.integrityChecks).toBe(true);
      expect(config.autoLockTimeout).toBe(15);
    });

    it('merges partial updates into config', () => {
      const updated = SecurityCore.updateConfig({ autoLockTimeout: 30 });
      expect(updated.autoLockTimeout).toBe(30);
      // other fields unchanged
      expect(updated.integrityChecks).toBe(true);
    });

    it('persists config updates to the store', () => {
      SecurityCore.updateConfig({ memoryProtection: false });
      expect((storeData['config'] as any).memoryProtection).toBe(false);
    });
  });

  describe('updateLayerConfig()', () => {
    it('merges partial layer config updates', () => {
      const result = SecurityCore.updateLayerConfig({ osSandbox: false });
      expect(result.osSandbox).toBe(false);
      expect(result.processIsolation).toBe(true);
    });

    it('persists layer changes to the store', () => {
      SecurityCore.updateLayerConfig({ encryptionLayer: false });
      expect((storeData['config'] as any).layersEnabled.encryptionLayer).toBe(false);
    });
  });

  // =========================================================================
  // AUDIT LOG
  // =========================================================================

  describe('getAuditLog()', () => {
    it('returns audit entries limited by count', () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        timestamp: Date.now(),
        action: `action-${i}`,
        category: 'test',
        details: 'detail',
        success: true,
      }));
      storeData['auditLog'] = entries;
      expect(SecurityCore.getAuditLog(3)).toHaveLength(3);
    });

    it('returns all entries when limit exceeds count', () => {
      storeData['auditLog'] = [
        { timestamp: 1, action: 'a', category: 'c', details: 'd', success: true },
      ];
      expect(SecurityCore.getAuditLog(100)).toHaveLength(1);
    });
  });

  // =========================================================================
  // MEMORY PROTECTION
  // =========================================================================

  describe('zeroize()', () => {
    it('fills a Buffer with zeros', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      SecurityCore.zeroize(buf);
      expect(buf.every((b: number) => b === 0)).toBe(true);
    });

    it('fills a Uint8Array with zeros', () => {
      const arr = new Uint8Array([10, 20, 30]);
      SecurityCore.zeroize(arr);
      expect(arr.every((b: number) => b === 0)).toBe(true);
    });
  });

  describe('createSecureBuffer()', () => {
    it('creates a buffer of requested size filled with zeros', () => {
      const buf = SecurityCore.createSecureBuffer(32);
      expect(buf.length).toBe(32);
      expect(buf.every((b: number) => b === 0)).toBe(true);
    });
  });

  // =========================================================================
  // INITIALIZE / SHUTDOWN
  // =========================================================================

  describe('initialize() / shutdown()', () => {
    it('initializes without error', async () => {
      await expect(SecurityCore.initialize()).resolves.not.toThrow();
    });

    it('is idempotent on second call', async () => {
      await SecurityCore.initialize();
      await expect(SecurityCore.initialize()).resolves.not.toThrow();
    });

    it('shutdown clears contexts and caches', async () => {
      await SecurityCore.initialize();
      SecurityCore.createSecureContext(['read']);
      SecurityCore.shutdown();
      // All contexts cleared after shutdown
      expect((SecurityCore as any).activeContexts.size).toBe(0);
    });
  });

  // =========================================================================
  // performSecurityCheck()
  // =========================================================================

  describe('performSecurityCheck()', () => {
    it('returns a SecurityStatus with all five layers', async () => {
      const status = await SecurityCore.performSecurityCheck();
      expect(status.layers).toHaveLength(5);
      expect(status.lastCheck).toBeGreaterThan(0);
      expect(typeof status.overallHealth).toBe('string');
    });

    it('updates lastSecurityCheck in config', async () => {
      const before = Date.now();
      await SecurityCore.performSecurityCheck();
      expect((storeData['config'] as any).lastSecurityCheck).toBeGreaterThanOrEqual(before);
    });
  });

  // =========================================================================
  // THREAT DETECTION (detectThreats)
  // =========================================================================

  describe('detectThreats()', () => {
    it('detects SQL injection patterns', () => {
      const matched = detectThreats('SELECT * FROM users UNION SELECT * FROM passwords', THREAT_RULES);
      expect(matched.some((r: any) => r.name === 'SQL Injection')).toBe(true);
    });

    it('detects XSS script patterns', () => {
      const matched = detectThreats('<script>alert(1)</script>', THREAT_RULES);
      expect(matched.some((r: any) => r.name === 'XSS Script')).toBe(true);
    });

    it('detects path traversal patterns', () => {
      const matched = detectThreats('../../etc/passwd', THREAT_RULES);
      expect(matched.some((r: any) => r.name === 'Path Traversal')).toBe(true);
    });

    it('detects command injection patterns', () => {
      const matched = detectThreats('ls; rm -rf /', THREAT_RULES);
      expect(matched.some((r: any) => r.name === 'Command Injection')).toBe(true);
    });

    it('returns empty array for clean input', () => {
      const matched = detectThreats('Hello world', THREAT_RULES);
      // filter out rules with empty pattern (Resource Exhaustion)
      const nonEmpty = matched.filter((r: any) => r.pattern !== '');
      expect(nonEmpty).toHaveLength(0);
    });

    it('skips disabled rules', () => {
      const rules = [
        { ...THREAT_RULES[0], enabled: false },
      ];
      const matched = detectThreats('UNION SELECT', rules);
      expect(matched).toHaveLength(0);
    });

    it('skips rules with empty pattern', () => {
      const rules = [
        { id: 'r-empty', name: 'Empty', category: 'test', severity: 'low', pattern: '', action: 'log', enabled: true },
      ];
      const matched = detectThreats('anything', rules);
      expect(matched).toHaveLength(0);
    });

    it('handles invalid regex gracefully', () => {
      const rules = [
        { id: 'r-bad', name: 'BadRegex', category: 'test', severity: 'low', pattern: '(unclosed', action: 'log', enabled: true },
      ];
      expect(() => detectThreats('test', rules)).not.toThrow();
      expect(detectThreats('test', rules)).toHaveLength(0);
    });
  });

  // =========================================================================
  // SECURITY EVENTS & METRICS
  // =========================================================================

  describe('createSecurityEvent()', () => {
    it('creates an event with the expected shape', () => {
      const evt = createSecurityEvent('login-success', 'auth-module', { user: 'test' });
      expect(evt.id).toMatch(/^evt_/);
      expect(evt.type).toBe('login-success');
      expect(evt.source).toBe('auth-module');
      expect(evt.severity).toBe('info');
      expect(evt.handled).toBe(false);
    });

    it('accepts custom severity', () => {
      const evt = createSecurityEvent('threat-detected', 'scanner', {}, 'critical');
      expect(evt.severity).toBe('critical');
    });
  });

  describe('calculateMetrics()', () => {
    it('counts events by type and severity', () => {
      const events = [
        createSecurityEvent('login-success', 's', {}),
        createSecurityEvent('login-failure', 's', {}, 'warning'),
        createSecurityEvent('threat-detected', 's', {}, 'critical'),
        createSecurityEvent('quarantine', 's', {}, 'error'),
      ];
      const metrics = calculateMetrics(events);
      expect(metrics.totalEvents).toBe(4);
      expect(metrics.eventsByType['login-success']).toBe(1);
      expect(metrics.eventsByType['threat-detected']).toBe(1);
      expect(metrics.eventsBySeverity['critical']).toBe(1);
      expect(metrics.threatsBlocked).toBe(2); // threat-detected + quarantine
    });

    it('tracks lastEventTime as the maximum timestamp', () => {
      const events = [
        { ...createSecurityEvent('login-success', 's', {}), timestamp: 100 },
        { ...createSecurityEvent('login-failure', 's', {}), timestamp: 500 },
        { ...createSecurityEvent('login-success', 's', {}), timestamp: 300 },
      ];
      const metrics = calculateMetrics(events);
      expect(metrics.lastEventTime).toBe(500);
    });

    it('returns zeros for empty event list', () => {
      const metrics = calculateMetrics([]);
      expect(metrics.totalEvents).toBe(0);
      expect(metrics.threatsBlocked).toBe(0);
      expect(metrics.lastEventTime).toBe(0);
    });
  });

  // =========================================================================
  // DATA PROTECTION (maskSensitiveData)
  // =========================================================================

  describe('maskSensitiveData()', () => {
    it('masks SSN patterns', () => {
      const result = maskSensitiveData('SSN: 123-45-6789', ['pii']);
      expect(result).not.toContain('123-45-6789');
      expect(result).toContain('***');
    });

    it('masks email addresses', () => {
      const result = maskSensitiveData('Email: user@example.com', ['pii']);
      expect(result).not.toContain('user@example.com');
    });

    it('masks credit card numbers', () => {
      const result = maskSensitiveData('Card: 4111-1111-1111-1111', ['financial']);
      expect(result).not.toContain('4111');
    });

    it('masks credential patterns', () => {
      const result = maskSensitiveData('password=mysecretvalue', ['credentials']);
      expect(result).not.toContain('password=mysecretvalue');
    });

    it('returns original text when no data types match', () => {
      const text = 'Just a normal sentence.';
      const result = maskSensitiveData(text, ['health']);
      expect(result).toBe(text);
    });

    it('handles multiple data types', () => {
      const text = 'SSN: 123-45-6789 Card: 4111 1111 1111 1111';
      const result = maskSensitiveData(text, ['pii', 'financial']);
      expect(result).not.toContain('123-45-6789');
      expect(result).not.toContain('4111');
    });
  });

  // =========================================================================
  // COMPLIANCE REPORT (generateComplianceReport)
  // =========================================================================

  describe('generateComplianceReport()', () => {
    it('calculates overall score correctly', () => {
      const checks = [
        { id: '1', standard: 'gdpr' as const, requirement: 'Encryption at rest', status: 'pass' as const, details: 'ok' },
        { id: '2', standard: 'gdpr' as const, requirement: 'Access controls', status: 'pass' as const, details: 'ok' },
        { id: '3', standard: 'gdpr' as const, requirement: 'Audit logging', status: 'fail' as const, details: 'missing' },
      ];
      const report = generateComplianceReport('gdpr', checks);
      expect(report.passCount).toBe(2);
      expect(report.failCount).toBe(1);
      expect(report.overallScore).toBe(67); // 2/3 = 66.67 -> rounds to 67
    });

    it('returns 100 score when all pass', () => {
      const checks = [
        { id: '1', standard: 'soc2' as const, requirement: 'Security policies', status: 'pass' as const, details: 'ok' },
      ];
      const report = generateComplianceReport('soc2', checks);
      expect(report.overallScore).toBe(100);
    });

    it('returns 100 when there are no applicable checks', () => {
      const report = generateComplianceReport('hipaa', []);
      expect(report.overallScore).toBe(100);
      expect(report.passCount).toBe(0);
    });

    it('excludes not-applicable checks from score calculation', () => {
      const checks = [
        { id: '1', standard: 'pci-dss' as const, requirement: 'Firewall', status: 'pass' as const, details: 'ok' },
        { id: '2', standard: 'pci-dss' as const, requirement: 'Anti-virus', status: 'not-applicable' as const, details: 'n/a' },
      ];
      const report = generateComplianceReport('pci-dss', checks);
      // 1 pass out of 1 applicable = 100%
      expect(report.overallScore).toBe(100);
    });

    it('filters checks by standard', () => {
      const checks = [
        { id: '1', standard: 'gdpr' as const, requirement: 'A', status: 'pass' as const, details: '' },
        { id: '2', standard: 'hipaa' as const, requirement: 'B', status: 'fail' as const, details: '' },
      ];
      const report = generateComplianceReport('gdpr', checks);
      expect(report.checks).toHaveLength(1);
      expect(report.failCount).toBe(0);
    });

    it('counts warnings', () => {
      const checks = [
        { id: '1', standard: 'iso27001' as const, requirement: 'A', status: 'warning' as const, details: '' },
        { id: '2', standard: 'iso27001' as const, requirement: 'B', status: 'pass' as const, details: '' },
      ];
      const report = generateComplianceReport('iso27001', checks);
      expect(report.warningCount).toBe(1);
    });
  });

  // =========================================================================
  // COMPLIANCE REQUIREMENTS constant
  // =========================================================================

  describe('COMPLIANCE_REQUIREMENTS', () => {
    it('has entries for all supported standards', () => {
      expect(COMPLIANCE_REQUIREMENTS['gdpr'].length).toBeGreaterThan(0);
      expect(COMPLIANCE_REQUIREMENTS['hipaa'].length).toBeGreaterThan(0);
      expect(COMPLIANCE_REQUIREMENTS['pci-dss'].length).toBeGreaterThan(0);
      expect(COMPLIANCE_REQUIREMENTS['soc2'].length).toBeGreaterThan(0);
      expect(COMPLIANCE_REQUIREMENTS['iso27001'].length).toBeGreaterThan(0);
    });
  });
});
