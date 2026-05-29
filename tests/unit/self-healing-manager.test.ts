// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

const ipcHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// ---------------------------------------------------------------------------
// electron-store in-memory stub
// ---------------------------------------------------------------------------

type StoreData = {
  config: any;
  checkpoints: any[];
  corruptionHistory: any[];
  lastHealthCheck: number;
  consecutiveFailures: number;
};

const DEFAULT_CONFIG = {
  enabled: true,
  checkIntervalMs: 5 * 60 * 1000,
  maxCheckpoints: 5,
  autoRecover: true,
  notifyOnRecovery: true,
};

let storeData: StoreData;

function resetStoreData() {
  storeData = {
    config: { ...DEFAULT_CONFIG },
    checkpoints: [],
    corruptionHistory: [],
    lastHealthCheck: 0,
    consecutiveFailures: 0,
  };
}

vi.mock('electron-store', () => ({
  default: vi.fn(function() {
    return {
      get: vi.fn((key: keyof StoreData) => storeData[key]),
      set: vi.fn((key: keyof StoreData, value: any) => {
        (storeData as any)[key] = value;
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// fs mock
// ---------------------------------------------------------------------------

const mockFsStore: Record<string, string> = {};
const mockDirs = new Set<string>();
// Normalize separators so the mock matches both POSIX (`/`) seed paths and the
// backslash paths that path.join() produces on Windows.
const norm = (p: string) => p.replace(/\\/g, '/');

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => mockDirs.has(norm(p)) || norm(p) in mockFsStore),
  mkdirSync: vi.fn((p: string) => { mockDirs.add(norm(p)); }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    mockFsStore[norm(dest)] = mockFsStore[norm(src)] ?? '';
  }),
  readFileSync: vi.fn((p: string) => mockFsStore[norm(p)] ?? '{}'),
  writeFileSync: vi.fn((p: string, data: string) => { mockFsStore[norm(p)] = data; }),
  statSync: vi.fn(() => ({ size: 128 })),
  readdirSync: vi.fn(() => ['settings.json']),
  rmSync: vi.fn(),
}));

// =============================================================================
// Tests
// =============================================================================

describe('SelfHealingManager', () => {
  let selfHealingManager: any;

  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    resetStoreData();
    Object.keys(mockFsStore).forEach(k => delete mockFsStore[k]);
    mockDirs.clear();

    // Re-seed electron-store mock defaults after module reset
    vi.mock('electron-store', () => ({
      default: vi.fn(function() {
        return {
          get: vi.fn((key: keyof StoreData) => storeData[key]),
          set: vi.fn((key: keyof StoreData, value: any) => {
            (storeData as any)[key] = value;
          }),
        };
      }),
    }));

    const mod = await import('../../src/main/core/SelfHealingManager');
    selfHealingManager = mod.selfHealingManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Module exports
  // -------------------------------------------------------------------------

  describe('module exports', () => {
    it('exports a selfHealingManager singleton', () => {
      expect(selfHealingManager).toBeDefined();
    });

    it('singleton is the default export', async () => {
      const mod = await import('../../src/main/core/SelfHealingManager');
      expect(mod.default).toBe(mod.selfHealingManager);
    });

    it('getInstance() always returns the same instance', async () => {
      // The class is not exported directly but the singleton wraps it;
      // importing twice returns the same object reference via module cache
      const mod1 = await import('../../src/main/core/SelfHealingManager');
      const mod2 = await import('../../src/main/core/SelfHealingManager');
      expect(mod1.selfHealingManager).toBe(mod2.selfHealingManager);
    });
  });

  // -------------------------------------------------------------------------
  // initialize()
  // -------------------------------------------------------------------------

  describe('initialize()', () => {
    it('initializes without throwing', async () => {
      await expect(selfHealingManager.initialize()).resolves.not.toThrow();
    });

    it('registers IPC handlers on the channel map', async () => {
      await selfHealingManager.initialize();
      expect(ipcHandlers.has('healing:getConfig')).toBe(true);
      expect(ipcHandlers.has('healing:updateConfig')).toBe(true);
      expect(ipcHandlers.has('healing:getHealth')).toBe(true);
      expect(ipcHandlers.has('healing:runCheck')).toBe(true);
      expect(ipcHandlers.has('healing:getCheckpoints')).toBe(true);
      expect(ipcHandlers.has('healing:rollback')).toBe(true);
      expect(ipcHandlers.has('healing:getCorruptionHistory')).toBe(true);
    });

    it('is idempotent – calling twice does not re-register handlers', async () => {
      const { ipcMain } = await import('electron');
      vi.mocked(ipcMain.handle).mockClear();
      await selfHealingManager.initialize();
      await selfHealingManager.initialize();
      // handle should only be called during the first initialization
      expect(vi.mocked(ipcMain.handle).mock.calls.length).toBeLessThanOrEqual(7);
    });
  });

  // -------------------------------------------------------------------------
  // getConfig() / updateConfig()
  // -------------------------------------------------------------------------

  describe('getConfig()', () => {
    it('returns the default configuration', async () => {
      await selfHealingManager.initialize();
      const config = selfHealingManager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.checkIntervalMs).toBe(5 * 60 * 1000);
      expect(config.maxCheckpoints).toBe(5);
      expect(config.autoRecover).toBe(true);
      expect(config.notifyOnRecovery).toBe(true);
    });
  });

  describe('updateConfig()', () => {
    it('merges partial updates into the existing config', async () => {
      await selfHealingManager.initialize();
      const updated = await selfHealingManager.updateConfig({ enabled: false });
      expect(updated.enabled).toBe(false);
      expect(updated.maxCheckpoints).toBe(5); // unchanged
    });

    it('persists the updated config to the store', async () => {
      await selfHealingManager.initialize();
      await selfHealingManager.updateConfig({ maxCheckpoints: 10 });
      expect(storeData.config.maxCheckpoints).toBe(10);
    });

    it('IPC handler healing:updateConfig delegates to updateConfig()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:updateConfig')!;
      const result = await handler({}, { enabled: false });
      expect(result.enabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // registerValidator() / registerRecoveryAction()
  // -------------------------------------------------------------------------

  describe('registerValidator()', () => {
    it('accepts a custom validator without throwing', async () => {
      await selfHealingManager.initialize();
      expect(() =>
        selfHealingManager.registerValidator('test-component', async () => true)
      ).not.toThrow();
    });
  });

  describe('registerRecoveryAction()', () => {
    it('accepts a custom recovery action without throwing', async () => {
      await selfHealingManager.initialize();
      expect(() =>
        selfHealingManager.registerRecoveryAction('test-component', async () => true)
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // runHealthCheck()
  // -------------------------------------------------------------------------

  describe('runHealthCheck()', () => {
    it('returns a HealthReport with the expected shape', async () => {
      await selfHealingManager.initialize();
      // Override validators to return true so status is healthy
      selfHealingManager.registerValidator('settings', async () => true);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      const report = await selfHealingManager.runHealthCheck();
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('lastCheck');
      expect(report).toHaveProperty('checksPerformed');
      expect(report).toHaveProperty('corruptionsDetected');
      expect(report).toHaveProperty('autoRecoveries');
      expect(report).toHaveProperty('currentIssues');
    });

    it('returns "healthy" when all validators pass', async () => {
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('settings', async () => true);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      const report = await selfHealingManager.runHealthCheck();
      expect(report.status).toBe('healthy');
      expect(report.currentIssues).toHaveLength(0);
    });

    it('detects corruption when a validator fails and auto-recovery is disabled', async () => {
      storeData.config = { ...DEFAULT_CONFIG, autoRecover: false };
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('settings', async () => false);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      const report = await selfHealingManager.runHealthCheck();
      expect(['degraded', 'critical']).toContain(report.status);
      expect(report.currentIssues.length).toBeGreaterThan(0);
    });

    it('records corruption to corruptionHistory in the store', async () => {
      storeData.config = { ...DEFAULT_CONFIG, autoRecover: false };
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('settings', async () => false);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      await selfHealingManager.runHealthCheck();
      expect(storeData.corruptionHistory.length).toBeGreaterThan(0);
    });

    it('auto-recovers and clears issues when recovery action succeeds', async () => {
      storeData.config = { ...DEFAULT_CONFIG, autoRecover: true };
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('custom', async () => false);
      selfHealingManager.registerRecoveryAction('custom', async () => true);

      const report = await selfHealingManager.runHealthCheck();
      // Issue was auto-recovered so it should not appear in currentIssues
      const customIssues = report.currentIssues.filter((i: any) => i.component === 'custom');
      expect(customIssues).toHaveLength(0);
    });

    it('increments consecutiveFailures when issues are not resolved', async () => {
      storeData.config = { ...DEFAULT_CONFIG, autoRecover: false };
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('settings', async () => false);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      await selfHealingManager.runHealthCheck();
      expect(storeData.consecutiveFailures).toBeGreaterThan(0);
    });

    it('resets consecutiveFailures to 0 when all checks pass', async () => {
      storeData.consecutiveFailures = 3;
      await selfHealingManager.initialize();
      selfHealingManager.registerValidator('settings', async () => true);
      selfHealingManager.registerValidator('workflows', async () => true);
      selfHealingManager.registerValidator('memory', async () => true);

      await selfHealingManager.runHealthCheck();
      expect(storeData.consecutiveFailures).toBe(0);
    });

    it('IPC handler healing:runCheck delegates to runHealthCheck()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:runCheck')!;
      const report = await handler({});
      expect(report).toHaveProperty('status');
    });
  });

  // -------------------------------------------------------------------------
  // getHealthReport()
  // -------------------------------------------------------------------------

  describe('getHealthReport()', () => {
    it('returns a HealthReport object', async () => {
      await selfHealingManager.initialize();
      const report = selfHealingManager.getHealthReport();
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('lastCheck');
      expect(report.lastCheck).toBe(storeData.lastHealthCheck);
    });

    it('status is "healthy" when corruptionHistory is empty', async () => {
      storeData.corruptionHistory = [];
      await selfHealingManager.initialize();
      const report = selfHealingManager.getHealthReport();
      expect(report.status).toBe('healthy');
    });

    it('reflects corruptions from the last 24 hours in currentIssues', async () => {
      storeData.corruptionHistory = [
        {
          id: 'c1',
          detectedAt: Date.now() - 1000,
          component: 'settings',
          severity: 'high',
          description: 'corrupted',
          autoRecovered: false,
          recoveryAction: null,
        },
      ];
      await selfHealingManager.initialize();
      const report = selfHealingManager.getHealthReport();
      expect(report.currentIssues).toHaveLength(1);
      expect(['critical', 'degraded']).toContain(report.status);
    });

    it('excludes auto-recovered corruptions from currentIssues', async () => {
      storeData.corruptionHistory = [
        {
          id: 'c2',
          detectedAt: Date.now() - 500,
          component: 'memory',
          severity: 'medium',
          description: 'mem high',
          autoRecovered: true,
          recoveryAction: 'auto-recovery',
        },
      ];
      await selfHealingManager.initialize();
      const report = selfHealingManager.getHealthReport();
      expect(report.currentIssues).toHaveLength(0);
    });

    it('IPC handler healing:getHealth delegates to getHealthReport()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:getHealth')!;
      const report = handler({});
      expect(report).toHaveProperty('status');
    });
  });

  // -------------------------------------------------------------------------
  // createCheckpoint() / getCheckpoints()
  // -------------------------------------------------------------------------

  describe('createCheckpoint()', () => {
    it('returns a checkpoint object with required fields', async () => {
      await selfHealingManager.initialize();
      const checkpoint = await selfHealingManager.createCheckpoint();
      expect(checkpoint).not.toBeNull();
      expect(checkpoint).toHaveProperty('id');
      expect(checkpoint).toHaveProperty('timestamp');
      expect(checkpoint).toHaveProperty('hash');
      expect(checkpoint).toHaveProperty('size');
      expect(checkpoint).toHaveProperty('valid');
    });

    it('stores the checkpoint in the store', async () => {
      await selfHealingManager.initialize();
      storeData.checkpoints = [];
      await selfHealingManager.createCheckpoint();
      expect(storeData.checkpoints.length).toBeGreaterThan(0);
    });

    it('marks the checkpoint as valid', async () => {
      await selfHealingManager.initialize();
      const checkpoint = await selfHealingManager.createCheckpoint();
      expect(checkpoint!.valid).toBe(true);
    });

    it('enforces maxCheckpoints by removing oldest entries', async () => {
      storeData.config = { ...DEFAULT_CONFIG, maxCheckpoints: 2 };
      await selfHealingManager.initialize();
      storeData.checkpoints = [];

      await selfHealingManager.createCheckpoint();
      await selfHealingManager.createCheckpoint();
      await selfHealingManager.createCheckpoint();

      expect(storeData.checkpoints.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getCheckpoints()', () => {
    it('returns the current checkpoints array', async () => {
      storeData.checkpoints = [{ id: 'cp_1', timestamp: 1, hash: 'abc', size: 0, valid: true }];
      await selfHealingManager.initialize();
      const checkpoints = selfHealingManager.getCheckpoints();
      expect(checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(checkpoints.some((cp: any) => cp.id === 'cp_1')).toBe(true);
    });

    it('IPC handler healing:getCheckpoints delegates to getCheckpoints()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:getCheckpoints')!;
      expect(Array.isArray(handler({}))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // rollbackToCheckpoint()
  // -------------------------------------------------------------------------

  describe('rollbackToCheckpoint()', () => {
    it('returns false when the checkpoint id does not exist', async () => {
      await selfHealingManager.initialize();
      storeData.checkpoints = [];
      const result = await selfHealingManager.rollbackToCheckpoint('non-existent');
      expect(result).toBe(false);
    });

    it('returns false when the checkpoint directory is missing', async () => {
      const cpId = 'checkpoint_999';
      storeData.checkpoints = [{ id: cpId, timestamp: 1, hash: 'x', size: 0, valid: true }];
      await selfHealingManager.initialize();
      // mockDirs does NOT contain the checkpoint path → existsSync returns false
      const result = await selfHealingManager.rollbackToCheckpoint(cpId);
      expect(result).toBe(false);
    });

    it('returns true and copies files when checkpoint directory exists', async () => {
      const cpId = 'checkpoint_valid';
      storeData.checkpoints = [{ id: cpId, timestamp: 1, hash: 'x', size: 0, valid: true }];
      await selfHealingManager.initialize();

      // Seed the mock filesystem so existsSync passes for the checkpoint dir
      mockDirs.add(`/mock/userData/checkpoints/${cpId}`);
      mockFsStore[`/mock/userData/checkpoints/${cpId}/settings.json`] = '{}';

      const result = await selfHealingManager.rollbackToCheckpoint(cpId);
      expect(result).toBe(true);
    });

    it('IPC handler healing:rollback delegates to rollbackToCheckpoint()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:rollback')!;
      const result = await handler({}, 'no-such-checkpoint');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getCorruptionHistory()
  // -------------------------------------------------------------------------

  describe('getCorruptionHistory()', () => {
    it('returns an empty array when there is no history', async () => {
      storeData.corruptionHistory = [];
      await selfHealingManager.initialize();
      expect(selfHealingManager.getCorruptionHistory()).toEqual([]);
    });

    it('returns up to the default limit of 50 entries', async () => {
      storeData.corruptionHistory = Array.from({ length: 80 }, (_, i) => ({
        id: `c${i}`,
        detectedAt: Date.now(),
        component: 'settings',
        severity: 'low',
        description: '',
        autoRecovered: false,
        recoveryAction: null,
      }));
      await selfHealingManager.initialize();
      expect(selfHealingManager.getCorruptionHistory().length).toBeLessThanOrEqual(50);
    });

    it('respects a custom limit argument', async () => {
      storeData.corruptionHistory = Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        detectedAt: Date.now(),
        component: 'memory',
        severity: 'low',
        description: '',
        autoRecovered: false,
        recoveryAction: null,
      }));
      await selfHealingManager.initialize();
      expect(selfHealingManager.getCorruptionHistory(5).length).toBeLessThanOrEqual(5);
    });

    it('IPC handler healing:getCorruptionHistory delegates to getCorruptionHistory()', async () => {
      await selfHealingManager.initialize();
      const handler = ipcHandlers.get('healing:getCorruptionHistory')!;
      expect(Array.isArray(handler({}))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // shutdown()
  // -------------------------------------------------------------------------

  describe('shutdown()', () => {
    it('resolves without throwing', async () => {
      await selfHealingManager.initialize();
      await expect(selfHealingManager.shutdown()).resolves.not.toThrow();
    });

    it('creates a final checkpoint on shutdown', async () => {
      await selfHealingManager.initialize();
      storeData.checkpoints = [];
      await selfHealingManager.shutdown();
      expect(storeData.checkpoints.length).toBeGreaterThan(0);
    });
  });
});
