// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX TEST SETUP
 * ===========================================================================
 * 
 * Global test setup and mocks for Vitest
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ===========================================================================
// MOCK ELECTRON
// ===========================================================================

const mockElectron = {
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
    getVersion: vi.fn(() => '1.0.1'),
    getName: vi.fn(() => 'DEX'),
    isReady: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    setBounds: vi.fn(),
    isMaximized: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    maximize: vi.fn(),
    minimize: vi.fn(),
    setFullScreen: vi.fn(),
  })),
  dialog: {
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: ['/mock/file.txt'] })),
    showSaveDialog: vi.fn(() => Promise.resolve({ canceled: false, filePath: '/mock/save.txt' })),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
    showErrorBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve('')),
    showItemInFolder: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => 'mock clipboard text'),
    writeText: vi.fn(),
    readHTML: vi.fn(() => '<p>mock</p>'),
    writeHTML: vi.fn(),
    clear: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: () => false })),
    createFromBuffer: vi.fn(() => ({ isEmpty: () => false })),
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    })),
    getAllDisplays: vi.fn(() => []),
  },
  powerMonitor: {
    on: vi.fn(),
    onBatteryPower: false,
  },
  Tray: vi.fn().mockImplementation(() => ({
    setImage: vi.fn(),
    setContextMenu: vi.fn(),
    setToolTip: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
};

vi.mock('electron', () => mockElectron);

// ===========================================================================
// MOCK NODE MODULES
// ===========================================================================

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
      size: 1024,
      mtime: new Date(),
    })),
    promises: {
      readFile: vi.fn(() => Promise.resolve('{}')),
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve()),
      readdir: vi.fn(() => Promise.resolve([])),
      stat: vi.fn(() => Promise.resolve({
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date(),
      })),
      unlink: vi.fn(() => Promise.resolve()),
      rm: vi.fn(() => Promise.resolve()),
    },
  };
});

// ===========================================================================
// MOCK WINDOW / DOM APIs (guarded for node-environment test files)
// ===========================================================================

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  });
  (globalThis as any).ResizeObserver = (window as any).ResizeObserver;

  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: class MockIntersectionObserver {
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    },
  });
  (globalThis as any).IntersectionObserver = (window as any).IntersectionObserver;
}

// Mock dexAPI (preload bridge)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'dexAPI', {
    writable: true,
    value: {
      invoke: vi.fn(() => Promise.resolve(null)),
      send: vi.fn(),
      on: vi.fn(() => vi.fn()), // Returns cleanup function
      platform: 'win32',
      versions: {
        node: '20.0.0',
        chrome: '120.0.0',
        electron: '28.0.0',
      },
    },
  });

  // Stub HTMLCanvasElement.getContext so jsdom does not emit
  // 'Not implemented: HTMLCanvasElement.prototype.getContext' warnings
  // during GPU-tier detection and animation budget probing.
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
  }
}

// ===========================================================================
// GLOBAL TEST HOOKS
// ===========================================================================

beforeAll(() => {
  // intentionally empty — no noise
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Cleanup after all tests
  vi.restoreAllMocks();
});

// ===========================================================================
// TEST UTILITIES
// ===========================================================================

export const mockElectronModule = mockElectron;

export function createMockWindow() {
  return new mockElectron.BrowserWindow();
}

export function mockIPCResponse(channel: string, response: any) {
  mockElectron.ipcRenderer.invoke.mockImplementation((ch: string) => {
    if (ch === channel) return Promise.resolve(response);
    return Promise.resolve(null);
  });
}

export function mockDexAPIResponse(channel: string, response: any) {
  if (typeof window === 'undefined') return;
  (window.dexAPI as any).invoke.mockImplementation((ch: string) => {
    if (ch === channel) return Promise.resolve(response);
    return Promise.resolve(null);
  });
}
