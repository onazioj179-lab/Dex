// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment node
/**
 * ===========================================================================
 * SECURITY CONTROLLER TESTS
 * ===========================================================================
 *
 * Unit tests for SecurityController (both the class and the extended handlers):
 * - IPC handler registration
 * - Permission registry queries (getPermissions, getPermission)
 * - togglePermission: required vs optional, not-found
 * - Security log accumulation (getLog)
 * - Sandbox verification (verifySandbox)
 * - Security report shape (getReport)
 * - exportAudit happy/error paths
 * - Extended handlers: securityCore:*, secureKeys:*, secureTransfer:*, networkHygiene:*
 * - Secure context lifecycle (createSecureContext / destroySecureContext)
 * - Transfer handlers: initiate, approve, reject, getActive, getAll
 * - Network hygiene: getStatus, addTrustedDomain, pause/resume
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// IPC handler capture
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, Function>();

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '1.0.0-test'),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn(() => null),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
  dialog: {
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(() => Promise.resolve({ canceled: true, filePath: '' })),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve('{}')),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Mocks for security services imported by registerExtendedSecurityHandlers
// ---------------------------------------------------------------------------

vi.mock('../../src/main/security/SecurityCore', () => ({
  SecurityCore: {
    initialize: vi.fn(() => Promise.resolve()),
    shutdown: vi.fn(),
    getSecurityStatus: vi.fn(() => ({
      overall: 'secure',
      layers: [{ layer: 1, status: 'active' }, { layer: 2, status: 'active' }],
    })),
    performSecurityCheck: vi.fn(() => Promise.resolve({ passed: true })),
    getConfig: vi.fn(() => ({ enabled: true })),
    updateConfig: vi.fn((cfg: any) => cfg),
    updateLayerConfig: vi.fn((cfg: any) => cfg),
    getThreats: vi.fn(() => []),
    resolveThreat: vi.fn(() => true),
    getAuditLog: vi.fn((limit?: number) => [{ event: 'test', ts: Date.now() }]),
    registerFileIntegrity: vi.fn(() => Promise.resolve({ hash: 'abc123' })),
    verifyFileIntegrity: vi.fn(() => Promise.resolve({ valid: true })),
  },
}));

vi.mock('../../src/main/security/SecureKeyManager', () => ({
  SecureKeyManager: {
    initialize: vi.fn(() => Promise.resolve()),
    listKeys: vi.fn(() => [{ id: 'key1', name: 'Test Key' }]),
    generateKey: vi.fn(() => Promise.resolve({ id: 'new-key', name: 'generated' })),
    deriveKeyFromPassword: vi.fn(() => Promise.resolve({ id: 'derived-key' })),
    rotateKey: vi.fn(() => Promise.resolve({ id: 'rotated-key' })),
    deleteKey: vi.fn(() => Promise.resolve(true)),
    lock: vi.fn(),
    unlock: vi.fn(() => Promise.resolve(true)),
    isUnlocked: vi.fn(() => true),
    getRotationPolicy: vi.fn(() => ({ intervalDays: 90 })),
    updateRotationPolicy: vi.fn((p: any) => p),
  },
}));

vi.mock('../../src/main/security/SecureTransferHub', () => ({
  SecureTransferHub: {
    initialize: vi.fn(() => Promise.resolve()),
    getConfig: vi.fn(() => ({ requireApproval: false, encrypt: true })),
    updateConfig: vi.fn((cfg: any) => cfg),
    initiateTransfer: vi.fn(() =>
      Promise.resolve({ id: 'transfer-1', fileName: 'test.txt', status: 'pending' })
    ),
    requestApproval: vi.fn(() => Promise.resolve()),
    approveTransfer: vi.fn(() => Promise.resolve(true)),
    rejectTransfer: vi.fn(() => Promise.resolve(true)),
    validateQuarantined: vi.fn(() => Promise.resolve({ valid: true })),
    approveAndMove: vi.fn(() => Promise.resolve(true)),
    getTransfer: vi.fn((id: string) => ({ id, fileName: 'test.txt' })),
    getActiveTransfers: vi.fn(() => [{ id: 'transfer-1', status: 'pending' }]),
    getAllTransfers: vi.fn(() => [{ id: 'transfer-1' }, { id: 'transfer-2' }]),
    getTransferLog: vi.fn((limit?: number) => [{ id: 'log-1' }]),
    cleanupQuarantine: vi.fn(() => Promise.resolve(3)),
  },
}));

vi.mock('../../src/main/security/NetworkHygieneMonitor', () => ({
  NetworkHygieneMonitor: {
    initialize: vi.fn(() => Promise.resolve()),
    shutdown: vi.fn(),
    getConfig: vi.fn(() => ({ allowedDomains: [], blockedDomains: [] })),
    updateConfig: vi.fn((cfg: any) => cfg),
    getNetworkStatus: vi.fn(() => ({ isOnline: true, paused: false })),
    getConnectivityState: vi.fn(() => Promise.resolve({ connected: true })),
    validateConnection: vi.fn(() => Promise.resolve({ allowed: true })),
    validateCertificate: vi.fn(() => Promise.resolve({ valid: true })),
    addTrustedDomain: vi.fn(),
    removeTrustedDomain: vi.fn(),
    addBlockedDomain: vi.fn(),
    removeBlockedDomain: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPausedState: vi.fn(() => false),
    getConnectionLog: vi.fn((limit?: number) => []),
    getStatistics: vi.fn(() => ({ total: 0 })),
    resetStatistics: vi.fn(),
  },
}));

vi.mock('../../src/main/security/IPCCrypto', () => ({
  IPCCrypto: {
    open: vi.fn((sealed: any) => {
      if (typeof sealed === 'string') return sealed;
      if (sealed && sealed.__plaintext !== undefined) return sealed.__plaintext;
      return '';
    }),
    seal: vi.fn((text: string) => ({ __plaintext: text })),
    init: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const fakeEvent = { sender: { id: 1 } };

function invokeIPC(channel: string, ...args: any[]): any {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No IPC handler registered for: ${channel}`);
  return handler(fakeEvent, ...args);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecurityController', () => {
  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    vi.clearAllMocks();

    // Re-apply the mock for electron after resetModules so the new module
    // import picks up the handler capture map correctly.
    const { ipcMain } = await import('electron');
    (ipcMain.handle as any).mockImplementation((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    });

    // Importing the module registers the SecurityController class handlers.
    await import('../../src/main/controllers/SecurityController');
    const mod = await import('../../src/main/controllers/SecurityController');
    mod.registerExtendedSecurityHandlers();
  });

  // -------------------------------------------------------------------------
  // IPC handler registration
  // -------------------------------------------------------------------------

  describe('IPC handler registration', () => {
    it('registers all core security: channels', () => {
      const coreChannels = [
        'security:getPermissions',
        'security:getPermission',
        'security:togglePermission',
        'security:getReport',
        'security:getLog',
        'security:verifySandbox',
        'security:exportAudit',
      ];
      for (const ch of coreChannels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });

    it('registers all extended security: channels', () => {
      const extendedChannels = [
        'security:get-layered-status',
        'security:perform-deep-check',
        'security:get-core-config',
        'security:update-core-config',
        'security:get-threats',
        'security:resolve-threat',
        'security:get-full-audit-log',
        'security:register-file-integrity',
        'security:verify-file-integrity',
      ];
      for (const ch of extendedChannels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });

    it('registers all securityCore: channels', () => {
      const channels = [
        'securityCore:getStatus',
        'securityCore:getLayerStatus',
        'securityCore:getThreats',
        'securityCore:acknowledgeThreats',
        'securityCore:runSecurityCheck',
        'securityCore:getConfig',
        'securityCore:updateConfig',
        'securityCore:registerFileIntegrity',
        'securityCore:verifyFileIntegrity',
        'securityCore:createSecureContext',
        'securityCore:destroySecureContext',
        'securityCore:logAuditEvent',
        'securityCore:getAuditLog',
        'securityCore:exportAuditLog',
      ];
      for (const ch of channels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });

    it('registers all secureKeys: channels', () => {
      const channels = [
        'secureKeys:listKeys',
        'secureKeys:generateKey',
        'secureKeys:deleteKey',
        'secureKeys:lock',
        'secureKeys:unlock',
        'secureKeys:isLocked',
        'keys:list',
        'keys:generate',
        'keys:rotate',
        'keys:delete',
        'keys:lock',
        'keys:unlock',
        'keys:is-unlocked',
        'keys:get-rotation-policy',
        'keys:update-rotation-policy',
      ];
      for (const ch of channels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });

    it('registers all transfer: and secureTransfer: channels', () => {
      const channels = [
        'transfer:get-config',
        'transfer:update-config',
        'transfer:initiate',
        'transfer:approve',
        'transfer:reject',
        'transfer:validate',
        'transfer:get-active',
        'transfer:get-all',
        'transfer:get-log',
        'transfer:cleanup-quarantine',
        'secureTransfer:getTransfers',
        'secureTransfer:getActiveTransfers',
        'secureTransfer:initiate',
        'secureTransfer:approveTransfer',
        'secureTransfer:rejectTransfer',
      ];
      for (const ch of channels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });

    it('registers all network: and networkHygiene: channels', () => {
      const channels = [
        'network:get-hygiene-config',
        'network:update-hygiene-config',
        'network:get-hygiene-status',
        'network:get-connectivity',
        'network:validate-connection',
        'network:validate-certificate',
        'network:add-trusted-domain',
        'network:remove-trusted-domain',
        'network:add-blocked-domain',
        'network:remove-blocked-domain',
        'network:pause-hygiene',
        'network:resume-hygiene',
        'network:is-paused',
        'network:get-connection-log',
        'network:get-statistics',
        'network:reset-statistics',
        'networkHygiene:getStatus',
        'networkHygiene:getConnectivity',
      ];
      for (const ch of channels) {
        expect(ipcHandlers.has(ch), `Missing handler for ${ch}`).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // security:getPermissions
  // -------------------------------------------------------------------------

  describe('security:getPermissions', () => {
    it('returns an array of permission objects', () => {
      const result = invokeIPC('security:getPermissions');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('each permission has required shape fields', () => {
      const result = invokeIPC('security:getPermissions');
      for (const perm of result) {
        expect(perm).toHaveProperty('id');
        expect(perm).toHaveProperty('name');
        expect(perm).toHaveProperty('enabled');
        expect(perm).toHaveProperty('required');
        expect(perm).toHaveProperty('scope');
        expect(perm).toHaveProperty('risks');
        expect(perm).toHaveProperty('mitigations');
      }
    });

    it('includes the file-system permission', () => {
      const result = invokeIPC('security:getPermissions');
      const fs = result.find((p: any) => p.id === 'file-system');
      expect(fs).toBeDefined();
      expect(fs.required).toBe(true);
      expect(fs.enabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // security:getPermission
  // -------------------------------------------------------------------------

  describe('security:getPermission', () => {
    it('returns the correct permission by id', () => {
      const perm = invokeIPC('security:getPermission', 'clipboard');
      expect(perm).toBeDefined();
      expect(perm.id).toBe('clipboard');
      expect(perm.scope).toBe('both');
    });

    it('returns undefined for an unknown permission id', () => {
      const result = invokeIPC('security:getPermission', 'non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // security:togglePermission
  // -------------------------------------------------------------------------

  describe('security:togglePermission', () => {
    it('disables an optional permission successfully', () => {
      const result = invokeIPC('security:togglePermission', 'notifications', false);
      expect(result.success).toBe(true);

      const perm = invokeIPC('security:getPermission', 'notifications');
      expect(perm.enabled).toBe(false);
    });

    it('re-enables an optional permission', () => {
      invokeIPC('security:togglePermission', 'notifications', false);
      const result = invokeIPC('security:togglePermission', 'notifications', true);
      expect(result.success).toBe(true);

      const perm = invokeIPC('security:getPermission', 'notifications');
      expect(perm.enabled).toBe(true);
    });

    it('refuses to disable a required permission', () => {
      const result = invokeIPC('security:togglePermission', 'file-system', false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot disable required permission');
    });

    it('returns error for unknown permission id', () => {
      const result = invokeIPC('security:togglePermission', 'does-not-exist', false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission not found');
    });
  });

  // -------------------------------------------------------------------------
  // security:getLog
  // -------------------------------------------------------------------------

  describe('security:getLog', () => {
    it('returns an array (may be empty before any events)', () => {
      const log = invokeIPC('security:getLog');
      expect(Array.isArray(log)).toBe(true);
    });

    it('contains policy-applied event after construction', () => {
      const log = invokeIPC('security:getLog');
      const hasPolicy = log.some((e: any) => e.event === 'policies-applied');
      expect(hasPolicy).toBe(true);
    });

    it('security events have timestamp, event, and details fields', () => {
      const log = invokeIPC('security:getLog');
      for (const entry of log) {
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('event');
        expect(entry).toHaveProperty('details');
      }
    });

    it('toggling a permission appends an event to the log', () => {
      const before = (invokeIPC('security:getLog') as any[]).length;
      invokeIPC('security:togglePermission', 'audio-control', false);
      const after = (invokeIPC('security:getLog') as any[]).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  // -------------------------------------------------------------------------
  // security:verifySandbox
  // -------------------------------------------------------------------------

  describe('security:verifySandbox', () => {
    it('returns sandboxed boolean and details record', () => {
      const result = invokeIPC('security:verifySandbox');
      expect(result).toHaveProperty('sandboxed');
      expect(result).toHaveProperty('details');
      expect(typeof result.sandboxed).toBe('boolean');
    });

    it('details contains expected security keys', () => {
      const { details } = invokeIPC('security:verifySandbox');
      expect(details).toHaveProperty('contextIsolation');
      expect(details).toHaveProperty('nodeIntegration');
      expect(details).toHaveProperty('webSecurity');
    });

    it('contextIsolation is true and nodeIntegration is false', () => {
      const { details } = invokeIPC('security:verifySandbox');
      expect(details.contextIsolation).toBe(true);
      expect(details.nodeIntegration).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // security:getReport
  // -------------------------------------------------------------------------

  describe('security:getReport', () => {
    it('returns a report with expected top-level fields', async () => {
      const report = await invokeIPC('security:getReport');
      expect(report).toHaveProperty('appVersion');
      expect(report).toHaveProperty('reportDate');
      expect(report).toHaveProperty('permissions');
      expect(report).toHaveProperty('sandbox');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('risks');
    });

    it('permissions array is populated', async () => {
      const report = await invokeIPC('security:getReport');
      expect(Array.isArray(report.permissions)).toBe(true);
      expect(report.permissions.length).toBeGreaterThan(0);
    });

    it('risks array contains medium risk when process-control is enabled', async () => {
      // process-control is enabled by default in the registry
      const report = await invokeIPC('security:getReport');
      const processRisk = report.risks.find(
        (r: any) => r.description.includes('process')
      );
      expect(processRisk).toBeDefined();
      expect(processRisk.level).toBe('medium');
    });

    it('recommendations includes network warning when network is disabled', async () => {
      invokeIPC('security:togglePermission', 'network', false);
      const report = await invokeIPC('security:getReport');
      const hasNetworkRec = report.recommendations.some((r: string) =>
        r.includes('Network is disabled')
      );
      expect(hasNetworkRec).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // security:exportAudit
  // -------------------------------------------------------------------------

  describe('security:exportAudit', () => {
    it('returns success and a path on happy path', async () => {
      const result = await invokeIPC('security:exportAudit');
      expect(result.success).toBe(true);
      expect(result.path).toContain('security-audit.json');
    });

    it('returns failure when writeFile throws', async () => {
      const { writeFile } = await import('fs/promises');
      (writeFile as any).mockRejectedValueOnce(new Error('disk full'));

      const result = await invokeIPC('security:exportAudit');
      expect(result.success).toBe(false);
      expect(result.path).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // securityCore:* handlers
  // -------------------------------------------------------------------------

  describe('securityCore:getStatus', () => {
    it('returns the layered security status object', async () => {
      const status = await invokeIPC('securityCore:getStatus');
      expect(status).toHaveProperty('overall');
      expect(status).toHaveProperty('layers');
    });
  });

  describe('securityCore:getLayerStatus', () => {
    it('returns data for a specific layer', async () => {
      const layer = await invokeIPC('securityCore:getLayerStatus', 1);
      expect(layer).toBeDefined();
      expect(layer.layer).toBe(1);
    });

    it('returns null for a non-existent layer number', async () => {
      const layer = await invokeIPC('securityCore:getLayerStatus', 99);
      expect(layer).toBeNull();
    });
  });

  describe('securityCore:getThreats', () => {
    it('returns an array (empty by default in mock)', async () => {
      const threats = await invokeIPC('securityCore:getThreats');
      expect(Array.isArray(threats)).toBe(true);
    });
  });

  describe('securityCore:acknowledgeThreats', () => {
    it('returns true when resolving multiple threat ids', async () => {
      const result = await invokeIPC('securityCore:acknowledgeThreats', ['t1', 't2']);
      expect(result).toBe(true);
    });
  });

  describe('securityCore:runSecurityCheck', () => {
    it('returns check result with passed field', async () => {
      const result = await invokeIPC('securityCore:runSecurityCheck');
      expect(result).toHaveProperty('passed');
    });
  });

  describe('securityCore:createSecureContext / destroySecureContext', () => {
    it('creates a context successfully', async () => {
      const result = await invokeIPC('securityCore:createSecureContext', 'ctx-abc');
      expect(result.success).toBe(true);
      expect(result.contextId).toBe('ctx-abc');
    });

    it('refuses to create a duplicate context', async () => {
      await invokeIPC('securityCore:createSecureContext', 'ctx-dup');
      const result = await invokeIPC('securityCore:createSecureContext', 'ctx-dup');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('destroys an existing context successfully', async () => {
      await invokeIPC('securityCore:createSecureContext', 'ctx-destroy');
      const result = await invokeIPC('securityCore:destroySecureContext', 'ctx-destroy');
      expect(result.success).toBe(true);
    });

    it('destroy succeeds even for a non-existent context id', async () => {
      const result = await invokeIPC('securityCore:destroySecureContext', 'ctx-missing');
      expect(result.success).toBe(true);
    });
  });

  describe('securityCore:logAuditEvent', () => {
    it('returns true when logging succeeds', async () => {
      const result = await invokeIPC('securityCore:logAuditEvent', { type: 'test' });
      expect(result).toBe(true);
    });
  });

  describe('securityCore:getAuditLog', () => {
    it('returns an array of log entries', async () => {
      const log = await invokeIPC('securityCore:getAuditLog', { limit: 5 });
      expect(Array.isArray(log)).toBe(true);
    });
  });

  describe('securityCore:exportAuditLog', () => {
    it('returns a JSON string of log entries', async () => {
      const result = await invokeIPC('securityCore:exportAuditLog');
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // secureKeys:* / keys:* handlers
  // -------------------------------------------------------------------------

  describe('secureKeys:listKeys', () => {
    it('returns an array of key metadata objects', async () => {
      const keys = await invokeIPC('secureKeys:listKeys');
      expect(Array.isArray(keys)).toBe(true);
      expect(keys[0]).toHaveProperty('id');
    });
  });

  describe('secureKeys:generateKey', () => {
    it('returns a new key object', async () => {
      const key = await invokeIPC('secureKeys:generateKey', 'my-key', 'encryption');
      expect(key).toHaveProperty('id');
    });
  });

  describe('secureKeys:deleteKey', () => {
    it('returns true on successful deletion', async () => {
      const result = await invokeIPC('secureKeys:deleteKey', 'key1');
      expect(result).toBe(true);
    });
  });

  describe('secureKeys:lock / secureKeys:isLocked', () => {
    it('lock returns true', async () => {
      const result = await invokeIPC('secureKeys:lock');
      expect(result).toBe(true);
    });

    it('isLocked returns boolean', async () => {
      const result = await invokeIPC('secureKeys:isLocked');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('keys:get-rotation-policy / keys:update-rotation-policy', () => {
    it('get-rotation-policy returns a policy object', async () => {
      const policy = await invokeIPC('keys:get-rotation-policy');
      expect(policy).toHaveProperty('intervalDays');
    });

    it('update-rotation-policy returns the updated policy', async () => {
      const updated = await invokeIPC('keys:update-rotation-policy', { intervalDays: 30 });
      expect(updated).toEqual({ intervalDays: 30 });
    });
  });

  // -------------------------------------------------------------------------
  // transfer:* / secureTransfer:* handlers
  // -------------------------------------------------------------------------

  describe('transfer:get-config', () => {
    it('returns the transfer config object', async () => {
      const config = await invokeIPC('transfer:get-config');
      expect(config).toHaveProperty('requireApproval');
    });
  });

  describe('transfer:get-active', () => {
    it('returns an array of active transfers', async () => {
      const active = await invokeIPC('transfer:get-active');
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('transfer:get-all', () => {
    it('returns all transfers as an array', async () => {
      const all = await invokeIPC('transfer:get-all');
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(2);
    });
  });

  describe('transfer:approve / transfer:reject', () => {
    it('approve returns true for a valid transfer', async () => {
      const result = await invokeIPC('transfer:approve', 'transfer-1');
      expect(result).toBe(true);
    });

    it('reject returns true for a valid transfer', async () => {
      const result = await invokeIPC('transfer:reject', 'transfer-1');
      expect(result).toBe(true);
    });
  });

  describe('secureTransfer:initiate', () => {
    it('returns a transfer object with id', async () => {
      const transfer = await invokeIPC(
        'secureTransfer:initiate',
        '/tmp/test.txt',
        '/tmp/dest/',
        true
      );
      expect(transfer).toHaveProperty('id');
      expect(transfer).toHaveProperty('fileName');
    });
  });

  describe('secureTransfer:approveTransfer / rejectTransfer', () => {
    it('approveTransfer returns true', async () => {
      const result = await invokeIPC('secureTransfer:approveTransfer', 'transfer-1');
      expect(result).toBe(true);
    });

    it('rejectTransfer returns true', async () => {
      const result = await invokeIPC('secureTransfer:rejectTransfer', 'transfer-1');
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // network:* / networkHygiene:* handlers
  // -------------------------------------------------------------------------

  describe('network:get-hygiene-status', () => {
    it('returns network status object', async () => {
      const status = await invokeIPC('network:get-hygiene-status');
      expect(status).toHaveProperty('isOnline');
    });
  });

  describe('network:add-trusted-domain / network:remove-trusted-domain', () => {
    it('add-trusted-domain returns true', async () => {
      const result = await invokeIPC('network:add-trusted-domain', 'example.com');
      expect(result).toBe(true);
    });

    it('remove-trusted-domain returns true', async () => {
      const result = await invokeIPC('network:remove-trusted-domain', 'example.com');
      expect(result).toBe(true);
    });
  });

  describe('network:pause-hygiene / network:resume-hygiene / network:is-paused', () => {
    it('pause returns true', async () => {
      const result = await invokeIPC('network:pause-hygiene');
      expect(result).toBe(true);
    });

    it('resume returns true', async () => {
      const result = await invokeIPC('network:resume-hygiene');
      expect(result).toBe(true);
    });

    it('is-paused returns a boolean', async () => {
      const result = await invokeIPC('network:is-paused');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('network:get-statistics / network:reset-statistics', () => {
    it('get-statistics returns a statistics object', async () => {
      const stats = await invokeIPC('network:get-statistics');
      expect(stats).toHaveProperty('total');
    });

    it('reset-statistics returns true', async () => {
      const result = await invokeIPC('network:reset-statistics');
      expect(result).toBe(true);
    });
  });

  describe('networkHygiene:getStatus', () => {
    it('returns network status with isOnline field', async () => {
      const status = await invokeIPC('networkHygiene:getStatus');
      expect(status).toHaveProperty('isOnline');
    });
  });

  describe('networkHygiene:getConnectivity', () => {
    it('returns connectivity state', async () => {
      const state = await invokeIPC('networkHygiene:getConnectivity');
      expect(state).toHaveProperty('connected');
    });
  });
});
