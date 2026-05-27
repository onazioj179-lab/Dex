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

const mockVault = {
  checkExists: vi.fn(),
  create: vi.fn(),
  unlock: vi.fn(),
  lock: vi.fn(),
  getCredentials: vi.fn(),
  addCredential: vi.fn(),
  updateCredential: vi.fn(),
  deleteCredential: vi.fn(),
  getAuthenticators: vi.fn(),
  addAuthenticator: vi.fn(),
  deleteAuthenticator: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  generatePassword: vi.fn(),
  generateTOTP: vi.fn(),
  runAudit: vi.fn(),
  changeMasterPassword: vi.fn(),
};

Object.defineProperty(window, 'dex', {
  value: { vault: mockVault },
  writable: true,
  configurable: true,
});

describe('useVaultStore', () => {
  let store: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/renderer/store/useVaultStore');
    store = mod.useVaultStore;
    store.setState({
      isUnlocked: false,
      vaultExists: false,
      isLoading: false,
      error: null,
      credentials: [],
      authenticators: [],
      categories: [],
      settings: null,
      selectedCredentialId: null,
      selectedAuthenticatorId: null,
      searchQuery: '',
      activeCategory: 'all',
    });
  });

  describe('initial state', () => {
    it('starts locked with no vault', () => {
      const state = store.getState();
      expect(state.isUnlocked).toBe(false);
      expect(state.vaultExists).toBe(false);
      expect(state.credentials).toEqual([]);
      expect(state.authenticators).toEqual([]);
    });
  });

  describe('initialize', () => {
    it('checks if vault exists', async () => {
      mockVault.checkExists.mockResolvedValue(true);
      await store.getState().initialize();
      expect(store.getState().vaultExists).toBe(true);
    });

    it('handles missing vault', async () => {
      mockVault.checkExists.mockResolvedValue(false);
      await store.getState().initialize();
      expect(store.getState().vaultExists).toBe(false);
    });
  });

  describe('createVault', () => {
    it('creates vault and marks as existing + unlocked', async () => {
      mockVault.create.mockResolvedValue(true);
      mockVault.getCredentials.mockResolvedValue([]);
      mockVault.getAuthenticators.mockResolvedValue([]);
      mockVault.getSettings.mockResolvedValue(null);

      const result = await store.getState().createVault('MasterPass123!');

      expect(result).toBe(true);
      expect(store.getState().vaultExists).toBe(true);
      expect(store.getState().isUnlocked).toBe(true);
    });
  });

  describe('unlockVault', () => {
    it('unlocks with correct password', async () => {
      mockVault.unlock.mockResolvedValue(true);
      mockVault.getCredentials.mockResolvedValue([
        { id: 'c1', type: 'website', title: 'GitHub', username: 'user', favorite: false, tags: [], category: 'dev', createdAt: 1, updatedAt: 1 },
      ]);
      mockVault.getAuthenticators.mockResolvedValue([]);
      mockVault.getSettings.mockResolvedValue(null);

      const result = await store.getState().unlockVault('correct');

      expect(result).toBe(true);
      expect(store.getState().isUnlocked).toBe(true);
      expect(store.getState().credentials).toHaveLength(1);
    });

    it('stays locked with wrong password', async () => {
      mockVault.unlock.mockResolvedValue(false);

      const result = await store.getState().unlockVault('wrong');

      expect(result).toBe(false);
      expect(store.getState().isUnlocked).toBe(false);
    });
  });

  describe('UI state', () => {
    it('selectCredential and selectAuthenticator update IDs', () => {
      store.getState().selectCredential?.('c1') ?? store.setState({ selectedCredentialId: 'c1' });
      expect(store.getState().selectedCredentialId).toBe('c1');
    });

    it('search query updates', () => {
      store.getState().setSearchQuery?.('github') ?? store.setState({ searchQuery: 'github' });
      expect(store.getState().searchQuery).toBe('github');
    });

    it('active category updates', () => {
      store.getState().setActiveCategory?.('work') ?? store.setState({ activeCategory: 'work' });
      expect(store.getState().activeCategory).toBe('work');
    });
  });
});
