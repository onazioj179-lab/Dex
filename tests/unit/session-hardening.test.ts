// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// @vitest-environment node

/**
 * ===========================================================================
 * DEX UNIT TESTS - SessionHardening
 * Tab lifecycle, session snapshots, navigation events, health monitoring
 * ===========================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks - must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockIpcMainHandlers = new Map<string, Function>();
const mockBrowserWindowInstances: any[] = [];
const mockWebContentsListeners = new Map<string, Function>();
const mockAppListeners = new Map<string, Function>();

vi.mock('electron', () => {
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      mockIpcMainHandlers.set(channel, handler);
    }),
    removeHandler: vi.fn(),
  };

  const mockWindowInstance = {
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 720 })),
    isMaximized: vi.fn(() => false),
    on: vi.fn((event: string, cb: Function) => {
      mockAppListeners.set(`window:${event}`, cb);
    }),
  };
  mockBrowserWindowInstances.push(mockWindowInstance);

  const BrowserWindow = {
    getAllWindows: vi.fn(() => mockBrowserWindowInstances),
  };

  const app = {
    getPath: vi.fn(() => '/tmp/dex-test-session'),
    on: vi.fn((event: string, cb: Function) => {
      mockAppListeners.set(event, cb);
    }),
  };

  const mockWebContentsInstance = {
    on: vi.fn((event: string, cb: Function) => {
      mockWebContentsListeners.set(event, cb);
    }),
    isDestroyed: vi.fn(() => false),
    executeJavaScript: vi.fn(() => Promise.resolve(null)),
  };

  const webContents = {
    fromId: vi.fn(() => mockWebContentsInstance),
  };

  return { ipcMain, BrowserWindow, app, webContents };
});

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve('[]')),
  writeFile: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import type {
  TabState,
  SessionSnapshot,
  NavigationEvent,
  SessionHardeningConfig,
  TabHealthStatus,
} from '../../src/main/security/SessionHardening';

// We need to create fresh instances per test. The module exports a singleton,
// so we re-import via dynamic import with cache busting per describe block.
// Instead, we'll test via the IPC handlers that the class registers during
// initialize(), plus the direct public API on the singleton.

let sessionHardening: any;
let initializeSessionHardening: () => Promise<void>;

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('SessionHardening', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    mockIpcMainHandlers.clear();
    mockWebContentsListeners.clear();
    mockAppListeners.clear();

    // Re-import to get a fresh module (singleton resets not available)
    vi.resetModules();

    const mod = await import('../../src/main/security/SessionHardening');
    sessionHardening = mod.sessionHardening;
    initializeSessionHardening = mod.initializeSessionHardening;
  });

  afterEach(() => {
    try { sessionHardening.shutdown(); } catch { /* already shut down */ }
    vi.useRealTimers();
  });

  // =========================================================================
  // DEFAULT CONFIGURATION
  // =========================================================================

  describe('default configuration', () => {
    it('should have sensible default values', () => {
      const config = sessionHardening.getConfig();
      expect(config.maxTabs).toBe(50);
      expect(config.tabMemoryLimitMB).toBe(512);
      expect(config.unresponsiveTimeoutMs).toBe(5000);
      expect(config.autoSaveIntervalMs).toBe(30000);
      expect(config.maxSnapshots).toBe(10);
      expect(config.enableCrashRecovery).toBe(true);
      expect(config.maxRecoveryAttempts).toBe(3);
      expect(config.navigationTimeoutMs).toBe(30000);
      expect(config.maxNavigationHistory).toBe(100);
    });
  });

  // =========================================================================
  // INITIALIZATION & SHUTDOWN
  // =========================================================================

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await initializeSessionHardening();
      // IPC handlers should be registered
      expect(mockIpcMainHandlers.size).toBeGreaterThan(0);
    });

    it('should be idempotent (calling initialize twice does not error)', async () => {
      await initializeSessionHardening();
      await initializeSessionHardening();
      // No error means idempotent
    });

    it('should register all expected IPC handlers', async () => {
      await initializeSessionHardening();

      const expectedChannels = [
        'sessionHardening:registerTab',
        'sessionHardening:unregisterTab',
        'sessionHardening:setActiveTab',
        'sessionHardening:getTab',
        'sessionHardening:getAllTabs',
        'sessionHardening:navigateBack',
        'sessionHardening:navigateForward',
        'sessionHardening:reloadTab',
        'sessionHardening:captureSnapshot',
        'sessionHardening:getLatestSnapshot',
        'sessionHardening:getAllSnapshots',
        'sessionHardening:restoreFromSnapshot',
        'sessionHardening:getTabHealth',
        'sessionHardening:getAllTabHealth',
        'sessionHardening:getNavigationHistory',
        'sessionHardening:getConfig',
        'sessionHardening:updateConfig',
      ];

      for (const channel of expectedChannels) {
        expect(mockIpcMainHandlers.has(channel)).toBe(true);
      }
    });
  });

  describe('shutdown', () => {
    it('should clear intervals and pending navigations', async () => {
      await initializeSessionHardening();
      sessionHardening.shutdown();
      // After shutdown, registering a tab should still work structurally
      // but intervals should be cleared (no auto-save, no health check)
    });

    it('should remove all event listeners', async () => {
      await initializeSessionHardening();
      const listener = vi.fn();
      sessionHardening.on('tab-registered', listener);
      sessionHardening.shutdown();
      // After shutdown and removeAllListeners, emitting should not call listener
      sessionHardening.emit('tab-registered', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TAB MANAGEMENT
  // =========================================================================

  describe('tab registration', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should register a new tab and track it', () => {
      const result = sessionHardening.registerTab({
        id: 'tab-1',
        windowId: 1,
        webContentsId: 100,
        url: 'https://example.com',
        title: 'Example',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(sessionHardening.getTabCount()).toBe(1);
    });

    it('should set default title to "New Tab" when title is omitted', () => {
      sessionHardening.registerTab({
        id: 'tab-notitle',
        windowId: 1,
        webContentsId: 101,
        url: 'https://example.com',
      });

      const tab = sessionHardening.getTab('tab-notitle');
      expect(tab).toBeDefined();
      expect(tab!.title).toBe('New Tab');
    });

    it('should initialize tab state correctly', () => {
      const before = Date.now();
      sessionHardening.registerTab({
        id: 'tab-init',
        windowId: 2,
        webContentsId: 200,
        url: 'https://init.test',
        title: 'Init',
      });

      const tab = sessionHardening.getTab('tab-init');
      expect(tab).toBeDefined();
      expect(tab!.id).toBe('tab-init');
      expect(tab!.windowId).toBe(2);
      expect(tab!.webContentsId).toBe(200);
      expect(tab!.url).toBe('https://init.test');
      expect(tab!.isActive).toBe(false);
      expect(tab!.isResponsive).toBe(true);
      expect(tab!.navigationHistory).toEqual(['https://init.test']);
      expect(tab!.historyIndex).toBe(0);
      expect(tab!.createdAt).toBeGreaterThanOrEqual(before);
      expect(tab!.lastActiveAt).toBeGreaterThanOrEqual(before);
    });

    it('should emit "tab-registered" event', () => {
      const listener = vi.fn();
      sessionHardening.on('tab-registered', listener);

      sessionHardening.registerTab({
        id: 'tab-emit',
        windowId: 1,
        webContentsId: 101,
        url: 'https://emit.test',
      });

      expect(listener).toHaveBeenCalledWith({ tabId: 'tab-emit' });
    });

    it('should record a "new-tab" navigation event on registration', () => {
      sessionHardening.registerTab({
        id: 'tab-nav-evt',
        windowId: 1,
        webContentsId: 102,
        url: 'https://nav.test',
      });

      expect(sessionHardening.getNavigationEventCount()).toBe(1);
    });
  });

  describe('max tab limit', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should enforce the maximum tab limit', () => {
      // Default maxTabs is 50
      for (let i = 0; i < 50; i++) {
        const result = sessionHardening.registerTab({
          id: `tab-${i}`,
          windowId: 1,
          webContentsId: 1000 + i,
          url: `https://example.com/page-${i}`,
        });
        expect(result.success).toBe(true);
      }

      // 51st tab should be rejected
      const overflow = sessionHardening.registerTab({
        id: 'tab-overflow',
        windowId: 1,
        webContentsId: 9999,
        url: 'https://example.com/overflow',
      });

      expect(overflow.success).toBe(false);
      expect(overflow.error).toContain('Maximum tab limit');
      expect(overflow.error).toContain('50');
      expect(sessionHardening.getTabCount()).toBe(50);
    });

    it('should allow new tab after closing one at max capacity', () => {
      for (let i = 0; i < 50; i++) {
        sessionHardening.registerTab({
          id: `tab-${i}`,
          windowId: 1,
          webContentsId: 1000 + i,
          url: `https://example.com/${i}`,
        });
      }

      sessionHardening.unregisterTab('tab-0');
      expect(sessionHardening.getTabCount()).toBe(49);

      const result = sessionHardening.registerTab({
        id: 'tab-new',
        windowId: 1,
        webContentsId: 2000,
        url: 'https://example.com/new',
      });
      expect(result.success).toBe(true);
      expect(sessionHardening.getTabCount()).toBe(50);
    });
  });

  describe('tab unregistration', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should remove a tab and emit event', () => {
      sessionHardening.registerTab({
        id: 'tab-del',
        windowId: 1,
        webContentsId: 100,
        url: 'https://delete.test',
      });

      const listener = vi.fn();
      sessionHardening.on('tab-unregistered', listener);

      sessionHardening.unregisterTab('tab-del');

      expect(sessionHardening.getTab('tab-del')).toBeUndefined();
      expect(sessionHardening.getTabCount()).toBe(0);
      expect(listener).toHaveBeenCalledWith({ tabId: 'tab-del' });
    });

    it('should record a "close-tab" navigation event', () => {
      sessionHardening.registerTab({
        id: 'tab-close-evt',
        windowId: 1,
        webContentsId: 100,
        url: 'https://close.test',
      });

      const countBefore = sessionHardening.getNavigationEventCount();
      sessionHardening.unregisterTab('tab-close-evt');
      expect(sessionHardening.getNavigationEventCount()).toBe(countBefore + 1);
    });

    it('should do nothing for a non-existent tab', () => {
      const listener = vi.fn();
      sessionHardening.on('tab-unregistered', listener);

      sessionHardening.unregisterTab('nonexistent');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('tab activation', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
      sessionHardening.registerTab({ id: 'tab-a', windowId: 1, webContentsId: 1, url: 'https://a.test' });
      sessionHardening.registerTab({ id: 'tab-b', windowId: 1, webContentsId: 2, url: 'https://b.test' });
    });

    it('should set the specified tab as active and others as inactive', () => {
      sessionHardening.setActiveTab('tab-a');

      const tabA = sessionHardening.getTab('tab-a');
      const tabB = sessionHardening.getTab('tab-b');

      expect(tabA!.isActive).toBe(true);
      expect(tabB!.isActive).toBe(false);
    });

    it('should update lastActiveAt on the activated tab', () => {
      const before = Date.now();
      vi.advanceTimersByTime(1000);

      sessionHardening.setActiveTab('tab-b');
      const tabB = sessionHardening.getTab('tab-b');
      expect(tabB!.lastActiveAt).toBeGreaterThan(before);
    });

    it('should switch active tab correctly', () => {
      sessionHardening.setActiveTab('tab-a');
      expect(sessionHardening.getTab('tab-a')!.isActive).toBe(true);
      expect(sessionHardening.getTab('tab-b')!.isActive).toBe(false);

      sessionHardening.setActiveTab('tab-b');
      expect(sessionHardening.getTab('tab-a')!.isActive).toBe(false);
      expect(sessionHardening.getTab('tab-b')!.isActive).toBe(true);
    });

    it('should emit "active-tab-changed" event', () => {
      const listener = vi.fn();
      sessionHardening.on('active-tab-changed', listener);

      sessionHardening.setActiveTab('tab-a');
      expect(listener).toHaveBeenCalledWith({ tabId: 'tab-a' });
    });
  });

  describe('getAllTabs', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should return all registered tabs as an array', () => {
      sessionHardening.registerTab({ id: 't1', windowId: 1, webContentsId: 1, url: 'https://1.test' });
      sessionHardening.registerTab({ id: 't2', windowId: 1, webContentsId: 2, url: 'https://2.test' });

      const all = sessionHardening.getAllTabs();
      expect(all).toHaveLength(2);
      expect(all.map((t: TabState) => t.id).sort()).toEqual(['t1', 't2']);
    });

    it('should return empty array when no tabs are registered', () => {
      expect(sessionHardening.getAllTabs()).toEqual([]);
    });
  });

  // =========================================================================
  // NAVIGATION
  // =========================================================================

  describe('navigation back/forward', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
      sessionHardening.registerTab({
        id: 'nav-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://page1.test',
      });
    });

    it('should return false for navigateBack with no history', () => {
      const result = sessionHardening.navigateBack('nav-tab');
      expect(result).toBe(false);
    });

    it('should return false for navigateForward at end of history', () => {
      const result = sessionHardening.navigateForward('nav-tab');
      expect(result).toBe(false);
    });

    it('should return false for navigateBack on non-existent tab', () => {
      expect(sessionHardening.navigateBack('nonexistent')).toBe(false);
    });

    it('should return false for navigateForward on non-existent tab', () => {
      expect(sessionHardening.navigateForward('nonexistent')).toBe(false);
    });
  });

  describe('reloadTab', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should record a reload navigation event', () => {
      sessionHardening.registerTab({
        id: 'reload-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://reload.test',
      });

      const countBefore = sessionHardening.getNavigationEventCount();
      sessionHardening.reloadTab('reload-tab');
      expect(sessionHardening.getNavigationEventCount()).toBe(countBefore + 1);
    });

    it('should do nothing for non-existent tab', () => {
      const countBefore = sessionHardening.getNavigationEventCount();
      sessionHardening.reloadTab('no-such-tab');
      expect(sessionHardening.getNavigationEventCount()).toBe(countBefore);
    });
  });

  // =========================================================================
  // SESSION SNAPSHOTS
  // =========================================================================

  describe('session snapshots', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should capture a snapshot with current tab state', async () => {
      sessionHardening.registerTab({
        id: 'snap-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://snapshot.test',
        title: 'Snapshot Page',
      });

      const snapshot = await sessionHardening.captureSnapshot('test');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.id).toBeDefined();
      expect(snapshot!.timestamp).toBeGreaterThan(0);
      expect(snapshot!.tabs).toHaveLength(1);
      expect(snapshot!.tabs[0].id).toBe('snap-tab');
      expect(snapshot!.windowBounds).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
      expect(snapshot!.isMaximized).toBe(false);
    });

    it('should return null when no windows exist', async () => {
      const { BrowserWindow } = await import('electron');
      (BrowserWindow.getAllWindows as any).mockReturnValueOnce([]);

      const snapshot = await sessionHardening.captureSnapshot('no-window');
      expect(snapshot).toBeNull();
    });

    it('should track active tab ID in snapshot', async () => {
      sessionHardening.registerTab({ id: 'st1', windowId: 1, webContentsId: 1, url: 'https://1.test' });
      sessionHardening.registerTab({ id: 'st2', windowId: 1, webContentsId: 2, url: 'https://2.test' });
      sessionHardening.setActiveTab('st2');

      const snapshot = await sessionHardening.captureSnapshot('active-test');
      expect(snapshot!.activeTabId).toBe('st2');
    });

    it('should set activeTabId to null when no tabs are active', async () => {
      const snapshot = await sessionHardening.captureSnapshot('empty');
      expect(snapshot).not.toBeNull();
      expect(snapshot!.activeTabId).toBeNull();
    });

    it('should limit stored snapshots to maxSnapshots', async () => {
      // Default maxSnapshots is 10
      for (let i = 0; i < 15; i++) {
        await sessionHardening.captureSnapshot(`snap-${i}`);
      }

      const all = sessionHardening.getAllSnapshots();
      expect(all.length).toBeLessThanOrEqual(10);
    });

    it('should return latest snapshot', async () => {
      await sessionHardening.captureSnapshot('first');
      vi.advanceTimersByTime(100);
      await sessionHardening.captureSnapshot('second');

      const latest = sessionHardening.getLatestSnapshot();
      expect(latest).not.toBeNull();
      // The second snapshot should be more recent
      const all = sessionHardening.getAllSnapshots();
      expect(latest!.id).toBe(all[all.length - 1].id);
    });

    it('should return null for getLatestSnapshot when no snapshots exist', () => {
      const latest = sessionHardening.getLatestSnapshot();
      expect(latest).toBeNull();
    });
  });

  describe('restoreFromSnapshot', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should return success for a valid snapshot id', async () => {
      const snapshot = await sessionHardening.captureSnapshot('restore-test');
      const result = await sessionHardening.restoreFromSnapshot(snapshot!.id);
      expect(result.success).toBe(true);
    });

    it('should emit "restore-requested" event', async () => {
      const listener = vi.fn();
      sessionHardening.on('restore-requested', listener);

      const snapshot = await sessionHardening.captureSnapshot('emit-test');
      await sessionHardening.restoreFromSnapshot(snapshot!.id);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].snapshot.id).toBe(snapshot!.id);
    });

    it('should return error for non-existent snapshot', async () => {
      const result = await sessionHardening.restoreFromSnapshot('nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Snapshot not found');
    });
  });

  // =========================================================================
  // TAB HEALTH
  // =========================================================================

  describe('tab health status', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should return null for non-existent tab', () => {
      expect(sessionHardening.getTabHealth('nonexistent')).toBeNull();
    });

    it('should report "healthy" status for a freshly created responsive tab', () => {
      sessionHardening.registerTab({
        id: 'healthy-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://healthy.test',
      });

      const health = sessionHardening.getTabHealth('healthy-tab');
      expect(health).not.toBeNull();
      expect(health!.status).toBe('healthy');
      expect(health!.issues).toHaveLength(0);
      expect(health!.id).toBe('healthy-tab');
    });

    it('should report "unresponsive" when tab.isResponsive is false', () => {
      sessionHardening.registerTab({
        id: 'unres-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://unresponsive.test',
      });

      // Manually set responsive to false (simulates webContents "unresponsive" event)
      const tab = sessionHardening.getTab('unres-tab');
      tab.isResponsive = false;

      const health = sessionHardening.getTabHealth('unres-tab');
      expect(health!.status).toBe('unresponsive');
      expect(health!.issues).toContain('Tab is not responding');
    });

    it('should report "critical" when memory exceeds limit', () => {
      sessionHardening.registerTab({
        id: 'mem-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://memory.test',
      });

      const tab = sessionHardening.getTab('mem-tab');
      tab.memoryUsage = 600; // Above 512 MB limit

      const health = sessionHardening.getTabHealth('mem-tab');
      expect(health!.status).toBe('critical');
      expect(health!.issues.some((i: string) => i.includes('High memory'))).toBe(true);
    });

    it('should report "warning" when memory exceeds 75% of limit', () => {
      sessionHardening.registerTab({
        id: 'warn-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://warn.test',
      });

      const tab = sessionHardening.getTab('warn-tab');
      tab.memoryUsage = 400; // 400 > 384 (512 * 0.75)

      const health = sessionHardening.getTabHealth('warn-tab');
      expect(health!.status).toBe('warning');
      expect(health!.issues.some((i: string) => i.includes('Elevated memory'))).toBe(true);
    });

    it('should report "warning" for long-inactive tabs (>30 min)', () => {
      sessionHardening.registerTab({
        id: 'inactive-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://inactive.test',
      });

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      const health = sessionHardening.getTabHealth('inactive-tab');
      expect(health!.status).toBe('warning');
      expect(health!.issues.some((i: string) => i.includes('Inactive for'))).toBe(true);
    });

    it('should return health for all tabs via getAllTabHealth', () => {
      sessionHardening.registerTab({ id: 'h1', windowId: 1, webContentsId: 1, url: 'https://1.test' });
      sessionHardening.registerTab({ id: 'h2', windowId: 1, webContentsId: 2, url: 'https://2.test' });

      const allHealth = sessionHardening.getAllTabHealth();
      expect(allHealth).toHaveLength(2);
      expect(allHealth.every((h: TabHealthStatus) => h.status === 'healthy')).toBe(true);
    });
  });

  // =========================================================================
  // NAVIGATION EVENT TRACKING
  // =========================================================================

  describe('navigation event recording', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should count navigation events across tab operations', () => {
      sessionHardening.registerTab({
        id: 'evt-tab',
        windowId: 1,
        webContentsId: 100,
        url: 'https://events.test',
      });
      // registerTab records 1 "new-tab" event
      expect(sessionHardening.getNavigationEventCount()).toBe(1);

      sessionHardening.reloadTab('evt-tab');
      // reloadTab records 1 "reload" event
      expect(sessionHardening.getNavigationEventCount()).toBe(2);

      sessionHardening.unregisterTab('evt-tab');
      // unregisterTab records 1 "close-tab" event
      expect(sessionHardening.getNavigationEventCount()).toBe(3);
    });
  });

  // =========================================================================
  // CRASH RECOVERY
  // =========================================================================

  describe('crash recovery tracking', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('should reset recovery attempts', () => {
      // resetRecoveryAttempts is a public method
      sessionHardening.resetRecoveryAttempts();
      // Should not throw
    });
  });

  // =========================================================================
  // PUBLIC API UTILITIES
  // =========================================================================

  describe('public API', () => {
    beforeEach(async () => {
      await initializeSessionHardening();
    });

    it('getTabCount returns 0 initially', () => {
      expect(sessionHardening.getTabCount()).toBe(0);
    });

    it('getTabCount reflects registered and unregistered tabs', () => {
      sessionHardening.registerTab({ id: 'c1', windowId: 1, webContentsId: 1, url: 'https://1.test' });
      sessionHardening.registerTab({ id: 'c2', windowId: 1, webContentsId: 2, url: 'https://2.test' });
      expect(sessionHardening.getTabCount()).toBe(2);

      sessionHardening.unregisterTab('c1');
      expect(sessionHardening.getTabCount()).toBe(1);
    });

    it('getNavigationEventCount returns 0 initially', () => {
      expect(sessionHardening.getNavigationEventCount()).toBe(0);
    });

    it('getConfig returns a copy of the config', () => {
      const config1 = sessionHardening.getConfig();
      const config2 = sessionHardening.getConfig();
      expect(config1).toEqual(config2);
      // Modifying the returned config should not affect the internal state
      config1.maxTabs = 999;
      expect(sessionHardening.getConfig().maxTabs).toBe(50);
    });
  });
});
