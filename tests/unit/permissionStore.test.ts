// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/renderer/utils/debouncedStorage', () => ({
  debouncedJsonStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

describe('usePermissionStore', () => {
  let store: any;
  let ALL_PERMISSIONS: string[];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/renderer/store/permissionStore');
    store = mod.usePermissionStore;
    ALL_PERMISSIONS = mod.ALL_PERMISSIONS;
    store.setState({
      permissions: Object.fromEntries(
        mod.ALL_PERMISSIONS.map(id => [id, { enabled: false, grantedAt: null, lastUsedAt: null, autoDisableMinutes: 15 }])
      ),
    });
  });

  describe('initial state', () => {
    it('all permissions start disabled', () => {
      const { permissions } = store.getState();
      for (const id of ALL_PERMISSIONS) {
        expect(permissions[id].enabled).toBe(false);
        expect(permissions[id].grantedAt).toBeNull();
      }
    });

    it('auto-disable defaults to 15 minutes', () => {
      const { permissions } = store.getState();
      for (const id of ALL_PERMISSIONS) {
        expect(permissions[id].autoDisableMinutes).toBe(15);
      }
    });
  });

  describe('setPermission', () => {
    it('enables a permission and sets grantedAt', () => {
      const before = Date.now();
      store.getState().setPermission('microphone', true);
      const { permissions } = store.getState();
      expect(permissions.microphone.enabled).toBe(true);
      expect(permissions.microphone.grantedAt).toBeGreaterThanOrEqual(before);
    });

    it('disabling clears grantedAt', () => {
      store.getState().setPermission('camera', true);
      store.getState().setPermission('camera', false);
      const { permissions } = store.getState();
      expect(permissions.camera.enabled).toBe(false);
      expect(permissions.camera.grantedAt).toBeNull();
    });

    it('only affects the targeted permission', () => {
      store.getState().setPermission('bluetooth', true);
      const { permissions } = store.getState();
      expect(permissions.bluetooth.enabled).toBe(true);
      expect(permissions.microphone.enabled).toBe(false);
      expect(permissions.camera.enabled).toBe(false);
    });
  });

  describe('markUsed', () => {
    it('updates lastUsedAt for enabled permission', () => {
      store.getState().setPermission('gps', true);
      const before = Date.now();
      store.getState().markUsed('gps');
      expect(store.getState().permissions.gps.lastUsedAt).toBeGreaterThanOrEqual(before);
    });

    it('does not update lastUsedAt for disabled permission', () => {
      store.getState().markUsed('gps');
      expect(store.getState().permissions.gps.lastUsedAt).toBeNull();
    });
  });

  describe('setAutoDisableMinutes', () => {
    it('changes the auto-disable timeout', () => {
      store.getState().setAutoDisableMinutes('network', 30);
      expect(store.getState().permissions.network.autoDisableMinutes).toBe(30);
    });

    it('clamps minimum to 1 minute', () => {
      store.getState().setAutoDisableMinutes('network', 0);
      expect(store.getState().permissions.network.autoDisableMinutes).toBe(1);

      store.getState().setAutoDisableMinutes('network', -5);
      expect(store.getState().permissions.network.autoDisableMinutes).toBe(1);
    });
  });

  describe('revokeAll', () => {
    it('disables all permissions', () => {
      store.getState().setPermission('microphone', true);
      store.getState().setPermission('camera', true);
      store.getState().setPermission('network', true);
      store.getState().revokeAll();

      const { permissions } = store.getState();
      for (const id of ALL_PERMISSIONS) {
        expect(permissions[id].enabled).toBe(false);
      }
    });
  });

  describe('activePermissions', () => {
    it('returns empty list when all disabled', () => {
      expect(store.getState().activePermissions()).toEqual([]);
    });

    it('returns only enabled permissions', () => {
      store.getState().setPermission('microphone', true);
      store.getState().setPermission('notifications', true);
      const active = store.getState().activePermissions();
      expect(active).toContain('microphone');
      expect(active).toContain('notifications');
      expect(active).not.toContain('camera');
    });
  });
});
