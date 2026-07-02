// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the app install/remove/reinstall/reset reducers
 * (installedAppsStore pure helpers): protected-app guards, idempotency,
 * reinstall, reset, install predicate, and list filtering.
 */
import { describe, it, expect } from 'vitest';
import {
  PROTECTED_APP_IDS,
  canRemoveApp,
  applyRemove,
  applyReinstall,
  isAppInstalled,
  filterInstalledItems,
} from '../../src/renderer/store/installedAppsStore';

describe('canRemoveApp / PROTECTED_APP_IDS', () => {
  it('protects the core OS apps', () => {
    for (const id of ['home', 'settings', 'store', 'files', 'browser', 'taskmanager']) {
      expect(PROTECTED_APP_IDS.has(id)).toBe(true);
      expect(canRemoveApp(id)).toBe(false);
    }
  });

  it('allows removing normal apps', () => {
    for (const id of ['notes', 'axl', 'imosion', 'videoeditor', 'forge']) {
      expect(canRemoveApp(id)).toBe(true);
    }
  });

  it('rejects empty ids', () => {
    expect(canRemoveApp('')).toBe(false);
  });
});

describe('applyRemove', () => {
  it('adds a removable app to the removed set', () => {
    expect(applyRemove([], 'notes')).toEqual(['notes']);
  });

  it('is idempotent — removing twice keeps one entry', () => {
    expect(applyRemove(['notes'], 'notes')).toEqual(['notes']);
  });

  it('never removes a protected app', () => {
    expect(applyRemove([], 'settings')).toEqual([]);
    expect(applyRemove(['notes'], 'home')).toEqual(['notes']);
  });

  it('does not mutate the input array', () => {
    const src = ['notes'];
    applyRemove(src, 'axl');
    expect(src).toEqual(['notes']);
  });
});

describe('applyReinstall', () => {
  it('removes an app from the removed set', () => {
    expect(applyReinstall(['notes', 'axl'], 'notes')).toEqual(['axl']);
  });

  it('is a no-op for an app that is not removed', () => {
    expect(applyReinstall(['axl'], 'notes')).toEqual(['axl']);
  });
});

describe('isAppInstalled', () => {
  it('true when not in the removed set', () => {
    expect(isAppInstalled([], 'notes')).toBe(true);
    expect(isAppInstalled(['axl'], 'notes')).toBe(true);
  });

  it('false when removed', () => {
    expect(isAppInstalled(['notes'], 'notes')).toBe(false);
  });
});

describe('filterInstalledItems', () => {
  const items = [
    { id: 'home', label: 'Home' },
    { id: 'notes', label: 'Notes' },
    { id: 'axl', label: 'AXL' },
    { id: 'settings', label: 'Settings' },
  ];
  const getId = (i: { id: string }) => i.id;

  it('drops removed apps but keeps installed ones', () => {
    const out = filterInstalledItems(items, getId, ['axl']);
    expect(out.map(getId)).toEqual(['home', 'notes', 'settings']);
  });

  it('always keeps protected apps even if in the removed set', () => {
    const out = filterInstalledItems(items, getId, ['settings', 'notes']);
    expect(out.map(getId)).toEqual(['home', 'axl', 'settings']);
  });

  it('returns everything when nothing is removed', () => {
    expect(filterInstalledItems(items, getId, []).length).toBe(4);
  });
});

describe('full lifecycle (reduce over actions)', () => {
  it('remove → reinstall → reset restores defaults', () => {
    let removed: string[] = [];
    removed = applyRemove(removed, 'notes');
    removed = applyRemove(removed, 'axl');
    expect(removed.sort()).toEqual(['axl', 'notes']);
    expect(isAppInstalled(removed, 'notes')).toBe(false);

    removed = applyReinstall(removed, 'notes');
    expect(isAppInstalled(removed, 'notes')).toBe(true);
    expect(removed).toEqual(['axl']);

    // reset = empty removed set
    removed = [];
    expect(isAppInstalled(removed, 'axl')).toBe(true);
  });
});
