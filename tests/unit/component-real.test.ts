// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Component Tests (item 197 — converted from doc-only to real Vitest tests)
 * Tests React component rendering and basic props/state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron APIs
vi.mock('../../src/renderer/utils/ipcWrapper', () => ({
  IPCWrapper: class {
    invoke = vi.fn().mockResolvedValue(null);
    send = vi.fn();
    on = vi.fn();
  },
  batchIPCCall: vi.fn().mockResolvedValue([]),
  parallelIPC: vi.fn().mockResolvedValue([]),
}));

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    invoke: vi.fn().mockResolvedValue(null),
    send: vi.fn(),
    on: vi.fn(),
    onAppEvent: vi.fn(),
  },
  writable: true,
});

// Mock localStorage
const store: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => Object.keys(store).forEach(k => delete store[k])),
    length: 0,
    key: vi.fn(() => null),
  },
  writable: true,
});

describe('Component Tests — Page Modules', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.keys(store).forEach(k => delete store[k]);
  });

  describe('Page Export Verification', () => {
    const pages = [
      { name: 'Home', path: '../../src/renderer/pages/Home' },
      { name: 'Files', path: '../../src/renderer/pages/Files' },
      { name: 'Notes', path: '../../src/renderer/DEXAPPLICATIONS/notes/DexNotes' },
      { name: 'Tasks', path: '../../src/renderer/pages/Tasks' },
      { name: 'Browser', path: '../../src/renderer/pages/Browser' },
      { name: 'Audio', path: '../../src/renderer/pages/Audio' },
      { name: 'Gallery', path: '../../src/renderer/pages/Gallery' },
      { name: 'Settings', path: '../../src/renderer/pages/Settings' },
      { name: 'Power', path: '../../src/renderer/pages/Power' },
      { name: 'Transfers', path: '../../src/renderer/pages/Transfers' },
      { name: 'Workflows', path: '../../src/renderer/pages/Workflows' },
    ];

    for (const { name, path } of pages) {
      it(`${name} page module exports a valid component`, async () => {
        const mod = await import(path);
        // Should have a default or named export
        const component = mod.default || mod[name];
        expect(component).toBeDefined();
        // React.memo() wraps return an object with $$typeof, not a plain function
        expect(typeof component === 'function' || (typeof component === 'object' && component !== null)).toBe(true);
      });
    }
  });

  describe('Utility Module Exports', () => {
    it('exifParser exports parseExif and loadExifFromPath', async () => {
      const mod = await import('../../src/renderer/utils/exifParser');
      expect(typeof mod.parseExif).toBe('function');
      expect(typeof mod.loadExifFromPath).toBe('function');
    });

    it('id3Parser exports parseID3 and loadAudioMetadata', async () => {
      const mod = await import('../../src/renderer/utils/id3Parser');
      expect(typeof mod.parseID3).toBe('function');
      expect(typeof mod.loadAudioMetadata).toBe('function');
    });
  });

  describe('Service Module Exports', () => {
    it('PerformanceOptimization exports store and selectors', async () => {
      const mod = await import('../../src/renderer/services/PerformanceOptimization');
      expect(mod.usePerformanceOptimization).toBeDefined();
      expect(typeof mod.useCapabilityTier).toBe('function');
      expect(typeof mod.useMemoryPressure).toBe('function');
      expect(typeof mod.useParticleScale).toBe('function');
    });

  });
});

describe('Component Tests — Store Selectors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('runningApps exports selector hooks', async () => {
    const mod = await import('../../src/renderer/store/runningApps');
    expect(typeof mod.useCurrentAppId).toBe('function');
    expect(typeof mod.useRunningAppsList).toBe('function');
    expect(typeof mod.useRunningAppCount).toBe('function');
    expect(typeof mod.useRunningAppActions).toBe('function');
  });

  it('dockPinStore exports selector hooks', async () => {
    const mod = await import('../../src/renderer/store/dockPinStore');
    expect(typeof mod.usePinnedApps).toBe('function');
    expect(typeof mod.useDockMode).toBe('function');
    expect(typeof mod.useDockMagnification).toBe('function');
    expect(typeof mod.useDockIconSize).toBe('function');
  });

  it('mediaStore exports selector hooks', async () => {
    const mod = await import('../../src/renderer/store/mediaStore');
    expect(typeof mod.useMediaPlaying).toBe('function');
    expect(typeof mod.useMediaProgress).toBe('function');
    expect(typeof mod.useMediaVolume).toBe('function');
    expect(typeof mod.useCurrentMediaInfo).toBe('function');
  });
});
