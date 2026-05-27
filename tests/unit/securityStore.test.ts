/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSecurityCore = {
  getStatus: vi.fn(),
  getConfig: vi.fn(),
  runSecurityCheck: vi.fn(),
  updateConfig: vi.fn(),
  acknowledgeThreats: vi.fn(),
};

const mockSecureKeys = {
  listKeys: vi.fn(),
  isLocked: vi.fn(),
  generateKey: vi.fn(),
  deleteKey: vi.fn(),
  lock: vi.fn(),
  unlock: vi.fn(),
};

const mockTransfers = {
  listTransfers: vi.fn(),
  initiateTransfer: vi.fn(),
  approveTransfer: vi.fn(),
  rejectTransfer: vi.fn(),
};

const mockNetwork = {
  getStatus: vi.fn(),
  getConnectivity: vi.fn(),
};

Object.defineProperty(window, 'dex', {
  value: {
    securityCore: mockSecurityCore,
    secureKeys: mockSecureKeys,
    transfers: mockTransfers,
    network: mockNetwork,
  },
  writable: true,
  configurable: true,
});

describe('useSecurityStore', () => {
  let store: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/renderer/store/securityStore');
    store = mod.useSecurityStore;
    store.setState({
      status: null,
      config: null,
      isLoading: false,
      error: null,
      keys: [],
      isKeysUnlocked: false,
      transfers: [],
      activeTransfers: [],
      networkStatus: null,
      connectivity: null,
    });
  });

  describe('initial state', () => {
    it('starts with null status and config', () => {
      const state = store.getState();
      expect(state.status).toBeNull();
      expect(state.config).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('starts with empty keys and locked', () => {
      const state = store.getState();
      expect(state.keys).toEqual([]);
      expect(state.isKeysUnlocked).toBe(false);
    });

    it('starts with empty transfers', () => {
      expect(store.getState().transfers).toEqual([]);
      expect(store.getState().activeTransfers).toEqual([]);
    });
  });

  describe('loadSecurityStatus', () => {
    it('loads status and config from backend', async () => {
      const mockStatus = {
        overallHealth: 'healthy',
        layers: [{ layer: 1, name: 'Sandbox', status: 'active', details: 'ok' }],
        lastCheck: Date.now(),
        threats: [],
        recommendations: [],
      };
      const mockConfig = {
        layersEnabled: { osSandbox: true, processIsolation: true, encryptionLayer: true, executionControl: true, auditIntegrity: true },
        integrityChecks: true,
        auditLogging: true,
        memoryProtection: true,
        autoLockTimeout: 300000,
        lastSecurityCheck: Date.now(),
      };

      mockSecurityCore.getStatus.mockResolvedValue(mockStatus);
      mockSecurityCore.getConfig.mockResolvedValue(mockConfig);

      await store.getState().loadSecurityStatus();

      expect(store.getState().status).toEqual(mockStatus);
      expect(store.getState().config).toEqual(mockConfig);
      expect(store.getState().isLoading).toBe(false);
    });

    it('falls back to defaults when backend returns null', async () => {
      mockSecurityCore.getStatus.mockResolvedValue(null);
      mockSecurityCore.getConfig.mockResolvedValue(null);

      await store.getState().loadSecurityStatus();

      const { status, config } = store.getState();
      expect(status).toBeDefined();
      expect(status.overallHealth).toBe('healthy');
      expect(status.layers).toHaveLength(5);
      expect(config).toBeDefined();
      expect(config.layersEnabled.osSandbox).toBe(true);
    });

    it('sets error on failure', async () => {
      mockSecurityCore.getStatus.mockRejectedValue(new Error('Network down'));

      await store.getState().loadSecurityStatus();

      expect(store.getState().error).toBe('Network down');
      expect(store.getState().isLoading).toBe(false);
    });
  });

  describe('performSecurityCheck', () => {
    it('updates status with check results', async () => {
      const checkResult = {
        overallHealth: 'warning' as const,
        layers: [],
        lastCheck: Date.now(),
        threats: [{ id: 't1', severity: 'medium', type: 'exposure', message: 'test', timestamp: Date.now(), resolved: false }],
        recommendations: ['Update something'],
      };
      mockSecurityCore.runSecurityCheck.mockResolvedValue(checkResult);

      await store.getState().performSecurityCheck();

      expect(store.getState().status).toEqual(checkResult);
      expect(store.getState().isLoading).toBe(false);
    });

    it('keeps existing state when check returns null', async () => {
      store.setState({ status: { overallHealth: 'healthy', layers: [], lastCheck: 1, threats: [], recommendations: [] } });
      mockSecurityCore.runSecurityCheck.mockResolvedValue(null);

      await store.getState().performSecurityCheck();

      expect(store.getState().status.overallHealth).toBe('healthy');
    });
  });

  describe('resolveThreat', () => {
    it('resolves a threat and refreshes status', async () => {
      mockSecurityCore.acknowledgeThreats.mockResolvedValue(true);
      mockSecurityCore.getStatus.mockResolvedValue({ overallHealth: 'healthy', layers: [], lastCheck: Date.now(), threats: [], recommendations: [] });
      mockSecurityCore.getConfig.mockResolvedValue(null);

      const resolved = await store.getState().resolveThreat('threat-1');

      expect(resolved).toBe(true);
      expect(mockSecurityCore.acknowledgeThreats).toHaveBeenCalledWith(['threat-1']);
    });

    it('returns false on error', async () => {
      mockSecurityCore.acknowledgeThreats.mockRejectedValue(new Error('fail'));

      const resolved = await store.getState().resolveThreat('threat-1');

      expect(resolved).toBe(false);
    });
  });

  describe('key management', () => {
    it('loadKeys populates keys list and unlock status', async () => {
      mockSecureKeys.listKeys.mockResolvedValue([
        { id: 'k1', name: 'Master', purpose: 'master', algorithm: 'aes-256-gcm', createdAt: 1, lastUsed: 2 },
      ]);
      mockSecureKeys.isLocked.mockResolvedValue(false);

      await store.getState().loadKeys();

      expect(store.getState().keys).toHaveLength(1);
      expect(store.getState().keys[0].name).toBe('Master');
      expect(store.getState().isKeysUnlocked).toBe(true);
    });

    it('generateKey adds a new key and refreshes', async () => {
      const newKey = { id: 'k2', name: 'Transfer', purpose: 'transfer', algorithm: 'aes-256-gcm', createdAt: Date.now(), lastUsed: Date.now() };
      mockSecureKeys.generateKey.mockResolvedValue(newKey);
      mockSecureKeys.listKeys.mockResolvedValue([newKey]);
      mockSecureKeys.isLocked.mockResolvedValue(false);

      const result = await store.getState().generateKey('Transfer', 'transfer');

      expect(result).toEqual(newKey);
    });

    it('deleteKey removes key and refreshes', async () => {
      mockSecureKeys.deleteKey.mockResolvedValue(true);
      mockSecureKeys.listKeys.mockResolvedValue([]);
      mockSecureKeys.isLocked.mockResolvedValue(false);

      const deleted = await store.getState().deleteKey('k1');

      expect(deleted).toBe(true);
    });

    it('lockKeys sets isKeysUnlocked to false', async () => {
      store.setState({ isKeysUnlocked: true });
      mockSecureKeys.lock.mockResolvedValue(undefined);

      await store.getState().lockKeys();

      expect(store.getState().isKeysUnlocked).toBe(false);
    });

    it('unlockKeys sets isKeysUnlocked on success', async () => {
      mockSecureKeys.unlock.mockResolvedValue(true);

      const result = await store.getState().unlockKeys('password123');

      expect(result).toBe(true);
      expect(store.getState().isKeysUnlocked).toBe(true);
    });

    it('unlockKeys returns false on failure', async () => {
      mockSecureKeys.unlock.mockResolvedValue(false);

      const result = await store.getState().unlockKeys('wrong');

      expect(result).toBe(false);
      expect(store.getState().isKeysUnlocked).toBe(false);
    });
  });
});
