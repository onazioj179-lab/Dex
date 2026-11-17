// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { baseAppId, windowNumber, nextWindowId, windowName, byAppId, supportsMultipleWindows, isExtraWindow } from '../../src/renderer/services/appWindows';
import { useRunningApps, APP_DEFINITIONS } from '../../src/renderer/store/runningApps';

describe('app windows', () => {
  it('window ids resolve to their app', () => {
    expect(baseAppId('notes~3')).toBe('notes');
    expect(baseAppId('notes')).toBe('notes');
    expect(windowNumber('notes~3')).toBe(3);
    expect(windowNumber('notes~x')).toBe(1);
    expect(isExtraWindow('files~2')).toBe(true);
    expect(windowName('Notes', 'notes~2')).toBe('Notes 2');
    expect(windowName('Notes', 'notes')).toBe('Notes');
  });

  it('next window id fills the lowest free number', () => {
    expect(nextWindowId('notes', [])).toBe('notes');
    expect(nextWindowId('notes', ['notes'])).toBe('notes~2');
    expect(nextWindowId('notes', ['notes', 'notes~2', 'notes~4'])).toBe('notes~3');
    expect(nextWindowId('notes', ['notes~2'])).toBe('notes');
  });

  it('per-app maps answer window ids and list only real apps', () => {
    const m = byAppId({ notes: { w: 1, name: 'Notes' } }, (v, id) => ({ ...v, name: windowName(v.name, id) }));
    expect(m['notes~2']).toEqual({ w: 1, name: 'Notes 2' });
    expect(m['notes~2']).toBe(m['notes~2']); // cached: stable identity for memoised consumers
    expect(m['ghost~2']).toBeUndefined();
    expect('notes~2' in m).toBe(true);
    expect(Object.keys(m)).toEqual(['notes']);
    expect(APP_DEFINITIONS['notes~2']?.name).toBe('Notes 2');
    expect(Object.keys(APP_DEFINITIONS)).not.toContain('notes~2');
  });

  describe('store', () => {
    beforeEach(() => useRunningApps.setState({ runningApps: [], currentAppId: 'home', sessionHistory: [] }));

    it('opens a second Notes window; closing it leaves the first open', () => {
      const s = useRunningApps.getState();
      s.launchApp({ id: 'notes', name: 'Notes', icon: 'notes', color: '#fff' });
      const id = s.openNewWindow('notes');
      expect(id).toBe('notes~2');
      expect(useRunningApps.getState().runningApps.map(a => a.id)).toEqual(['notes', 'notes~2']);
      expect(useRunningApps.getState().runningApps[1].name).toBe('Notes 2');
      expect(useRunningApps.getState().currentAppId).toBe('notes~2');
      useRunningApps.getState().closeApp('notes~2');
      expect(useRunningApps.getState().runningApps.map(a => a.id)).toEqual(['notes']);
    });

    it('apps without multi-window support never get a second window', () => {
      expect(supportsMultipleWindows('settings')).toBe(false);
      expect(useRunningApps.getState().openNewWindow('settings')).toBeNull();
      useRunningApps.getState().launchApp({ id: 'settings~2', name: 'x', icon: 'x', color: '#fff' });
      expect(useRunningApps.getState().runningApps.map(a => a.id)).toEqual(['settings']);
    });
  });
});
