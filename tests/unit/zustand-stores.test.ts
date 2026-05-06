// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for DEX Zustand stores.
 * Tests: runningApps, dockPinStore, useStore (theme)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
  },
  writable: true,
});

// Mock document
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    documentElement: { setAttribute: vi.fn(), getAttribute: vi.fn() },
  };
} else {
  vi.spyOn(document.documentElement, 'setAttribute').mockImplementation(() => {});
}

// ========================================================================
// Running Apps Store Tests
// ========================================================================
describe('useRunningApps', () => {
  let store: any;

  beforeEach(async () => {
    // Clear storage between tests
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    // Dynamic import to get fresh store
    vi.resetModules();
    const mod = await import('../../src/renderer/store/runningApps');
    store = mod.useRunningApps;
    // Reset state
    store.setState({ runningApps: [], currentAppId: 'home' });
  });

  const testApp = {
    id: 'browser',
    name: 'Browser',
    icon: 'globe',
    color: '#0a84ff',
  };

  it('starts with empty running apps and home as current', () => {
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps).toEqual([]);
    expect(currentAppId).toBe('home');
  });

  it('launchApp adds a new app to running apps', () => {
    store.getState().launchApp(testApp);
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps).toHaveLength(1);
    expect(runningApps[0].id).toBe('browser');
    expect(runningApps[0].isMinimized).toBe(false);
    expect(currentAppId).toBe('browser');
  });

  it('launchApp focuses existing app instead of duplicating', () => {
    store.getState().launchApp(testApp);
    store.getState().launchApp(testApp);
    const { runningApps } = store.getState();
    expect(runningApps).toHaveLength(1);
  });

  it('closeApp removes app and updates currentAppId', () => {
    store.getState().launchApp(testApp);
    store.getState().closeApp('browser');
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps).toHaveLength(0);
    expect(currentAppId).toBe('home');
  });

  it('closeApp focuses last app when closing current', () => {
    store.getState().launchApp(testApp);
    store.getState().launchApp({ id: 'notes', name: 'Notes', icon: 'file-text', color: '#30d158' });
    store.getState().setCurrentApp('notes');
    store.getState().closeApp('notes');
    const { currentAppId } = store.getState();
    expect(currentAppId).toBe('browser');
  });

  it('closeAllApps clears everything back to home', () => {
    store.getState().launchApp(testApp);
    store.getState().launchApp({ id: 'notes', name: 'Notes', icon: 'file-text', color: '#30d158' });
    store.getState().closeAllApps();
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps).toHaveLength(0);
    expect(currentAppId).toBe('home');
  });

  it('minimizeApp sets isMinimized and goes to home', () => {
    store.getState().launchApp(testApp);
    store.getState().minimizeApp('browser');
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps[0].isMinimized).toBe(true);
    expect(currentAppId).toBe('home');
  });

  it('restoreApp unfocuses and updates timestamp', () => {
    store.getState().launchApp(testApp);
    store.getState().minimizeApp('browser');
    store.getState().restoreApp('browser');
    const { runningApps, currentAppId } = store.getState();
    expect(runningApps[0].isMinimized).toBe(false);
    expect(currentAppId).toBe('browser');
  });

  it('isAppRunning returns correct boolean', () => {
    expect(store.getState().isAppRunning('browser')).toBe(false);
    store.getState().launchApp(testApp);
    expect(store.getState().isAppRunning('browser')).toBe(true);
  });

  it('getRunningApp returns the app or undefined', () => {
    expect(store.getState().getRunningApp('browser')).toBeUndefined();
    store.getState().launchApp(testApp);
    const app = store.getState().getRunningApp('browser');
    expect(app).toBeDefined();
    expect(app!.name).toBe('Browser');
  });
});

// ========================================================================
// Dock Pin Store Tests
// ========================================================================
describe('useDockPins', () => {
  let store: any;

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.resetModules();
    const mod = await import('../../src/renderer/store/dockPinStore');
    store = mod.useDockPins;
  });

  it('has default pins including permanent ones', () => {
    const { pins } = store.getState();
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.some((p: any) => p.id === 'settings')).toBe(true);
    expect(pins.some((p: any) => p.id === 'rewind')).toBe(true);
  });

  it('pinApp adds new app to dock', () => {
    const before = store.getState().pins.length;
    store.getState().pinApp('test-app');
    const { pins } = store.getState();
    expect(pins.length).toBe(before + 1);
    expect(pins.some((p: any) => p.id === 'test-app')).toBe(true);
  });

  it('pinApp does not duplicate existing pin', () => {
    store.getState().pinApp('test-app');
    const before = store.getState().pins.length;
    store.getState().pinApp('test-app');
    expect(store.getState().pins.length).toBe(before);
  });

  it('unpinApp removes non-permanent app', () => {
    store.getState().pinApp('test-app');
    store.getState().unpinApp('test-app');
    expect(store.getState().pins.some((p: any) => p.id === 'test-app')).toBe(false);
  });

  it('unpinApp does not remove permanent pins', () => {
    store.getState().unpinApp('settings');
    expect(store.getState().pins.some((p: any) => p.id === 'settings')).toBe(true);
    store.getState().unpinApp('rewind');
    expect(store.getState().pins.some((p: any) => p.id === 'rewind')).toBe(true);
  });

  it('isPinned returns correct boolean', () => {
    expect(store.getState().isPinned('settings')).toBe(true);
    expect(store.getState().isPinned('nonexistent-app')).toBe(false);
  });

  it('setMode updates dock mode', () => {
    store.getState().setMode('always-visible');
    expect(store.getState().mode).toBe('always-visible');
    store.getState().setMode('floating');
    expect(store.getState().mode).toBe('floating');
  });

  it('setMagnification toggles magnification', () => {
    store.getState().setMagnification(false);
    expect(store.getState().magnification).toBe(false);
    store.getState().setMagnification(true);
    expect(store.getState().magnification).toBe(true);
  });

  it('setIconSize updates icon size', () => {
    store.getState().setIconSize(64);
    expect(store.getState().iconSize).toBe(64);
  });
});

// ========================================================================
// Theme Store Tests
// ========================================================================
describe('useThemeStore', () => {
  let store: any;

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.resetModules();
    const mod = await import('../../src/renderer/store/useStore');
    store = mod.useThemeStore;
  });

  it('defaults to dark theme', () => {
    expect(store.getState().theme).toBe('dark');
  });

  it('setTheme updates theme and persists', () => {
    store.getState().setTheme('light');
    expect(store.getState().theme).toBe('light');
    expect(mockStorage['dex-theme']).toBe('light');
  });

  it('toggleTheme switches between dark and light', () => {
    store.getState().setTheme('dark');
    store.getState().toggleTheme();
    expect(store.getState().theme).toBe('light');
    store.getState().toggleTheme();
    expect(store.getState().theme).toBe('dark');
  });
});
