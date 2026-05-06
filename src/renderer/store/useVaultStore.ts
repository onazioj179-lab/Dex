// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Vault Store (Zustand)
 * ===========================================================================
 * 
 * State management for Password Manager and Authenticator.
 * Communicates with VaultController via IPC.
 */

import { create } from 'zustand';

// ===========================================================================
// Types
// ===========================================================================

export interface VaultCredential {
  id: string;
  type: 'website' | 'app' | 'custom' | 'note';
  title: string;
  username?: string;
  email?: string;
  password?: string;
  url?: string;
  notes?: string;
  category: VaultCategory;
  tags: string[];
  totpSecret?: string;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
  passwordStrength?: 'weak' | 'medium' | 'strong';
  favorite: boolean;
}

export interface AuthenticatorEntry {
  id: string;
  service: string;
  account: string;
  secret: string;
  issuer?: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: number;
  category: VaultCategory;
  linkedCredentialId?: string;
  createdAt: number;
  icon?: string;
}

export type VaultCategory = 'work' | 'personal' | 'finance' | 'dev' | 'social' | 'custom';

export interface VaultSettings {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  passwordGeneratorLength: number;
  passwordGeneratorOptions: {
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
  showPasswordStrength: boolean;
  enableBrowserCapture: boolean;
}

export interface PasswordAudit {
  weak: VaultCredential[];
  reused: { password: string; credentials: VaultCredential[] }[];
  old: VaultCredential[];
}

interface VaultState {
  // State
  isUnlocked: boolean;
  vaultExists: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Data
  credentials: VaultCredential[];
  authenticators: AuthenticatorEntry[];
  categories: { id: string; name: string; icon?: string }[];
  settings: VaultSettings | null;
  
  // UI State
  selectedCredentialId: string | null;
  selectedAuthenticatorId: string | null;
  searchQuery: string;
  activeCategory: VaultCategory | 'all';
  
  // Actions - Vault
  initialize: () => Promise<void>;
  createVault: (masterPassword: string) => Promise<boolean>;
  unlockVault: (masterPassword: string) => Promise<boolean>;
  lockVault: () => Promise<void>;
  changeMasterPassword: (current: string, newPass: string) => Promise<boolean>;
  
  // Actions - Credentials
  loadCredentials: () => Promise<void>;
  getCredential: (id: string) => Promise<VaultCredential | null>;
  addCredential: (credential: Partial<VaultCredential>) => Promise<string | null>;
  updateCredential: (id: string, updates: Partial<VaultCredential>) => Promise<boolean>;
  deleteCredential: (id: string) => Promise<boolean>;
  searchCredentials: (query: string) => Promise<void>;
  
  // Actions - Authenticator
  loadAuthenticators: () => Promise<void>;
  addAuthenticator: (entry: Partial<AuthenticatorEntry>) => Promise<string | null>;
  updateAuthenticator: (id: string, updates: Partial<AuthenticatorEntry>) => Promise<boolean>;
  deleteAuthenticator: (id: string) => Promise<boolean>;
  generateTOTP: (id: string) => Promise<{ code: string; remainingSeconds: number } | null>;
  parseOTPUri: (uri: string) => Promise<Partial<AuthenticatorEntry> | null>;
  
  // Actions - Password Generator
  generatePassword: (options?: Partial<VaultSettings['passwordGeneratorOptions']>) => Promise<string>;
  
  // Actions - Clipboard
  copyToClipboard: (text: string, autoClear?: boolean) => Promise<void>;
  
  // Actions - Audit
  auditPasswords: () => Promise<PasswordAudit>;
  
  // Actions - Settings
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<VaultSettings>) => Promise<boolean>;
  
  // Actions - Categories
  loadCategories: () => Promise<void>;
  addCategory: (category: { name: string; icon?: string }) => Promise<string | null>;
  
  // Actions - Export/Import
  exportVault: (password: string) => Promise<string | null>;
  importVault: (data: string, password: string) => Promise<boolean>;
  
  // UI Actions
  setSelectedCredential: (id: string | null) => void;
  setSelectedAuthenticator: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveCategory: (category: VaultCategory | 'all') => void;
  clearError: () => void;
}

// ===========================================================================
// Store
// ===========================================================================

export const useVaultStore = create<VaultState>((set, get) => ({
  // Initial State
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

  // ===========================================================================
  // Vault Operations
  // ===========================================================================

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });
      if (!window.dex?.vault) {
        set({ isLoading: false, error: 'Vault API not available' });
        return;
      }
      
      const state = await window.dex.vault.getState();
      set({
        isUnlocked: state.isUnlocked,
        vaultExists: state.vaultExists,
        isLoading: false,
      });

      // If unlocked, load all data
      if (state.isUnlocked) {
        await get().loadCredentials();
        await get().loadAuthenticators();
        await get().loadCategories();
        await get().loadSettings();
      }

      // Listen for state changes
      window.dex.vault.onStateChange((newState) => {
        set({
          isUnlocked: newState.isUnlocked,
          vaultExists: newState.vaultExists,
        });

        if (!newState.isUnlocked) {
          // Clear sensitive data when locked
          set({
            credentials: [],
            authenticators: [],
            selectedCredentialId: null,
            selectedAuthenticatorId: null,
          });
        }
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createVault: async (masterPassword: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.create(masterPassword);
      
      if (result.success) {
        set({ isUnlocked: true, vaultExists: true });
        await get().loadCategories();
        await get().loadSettings();
        return true;
      } else {
        set({ error: result.error || 'Failed to create vault' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  unlockVault: async (masterPassword: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.unlock(masterPassword);
      
      if (result.success) {
        set({ isUnlocked: true });
        await get().loadCredentials();
        await get().loadAuthenticators();
        await get().loadCategories();
        await get().loadSettings();
        return true;
      } else {
        set({ error: result.error || 'Invalid master password' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  lockVault: async () => {
    try {
      await window.dex.vault.lock();
      set({
        isUnlocked: false,
        credentials: [],
        authenticators: [],
        selectedCredentialId: null,
        selectedAuthenticatorId: null,
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  changeMasterPassword: async (current: string, newPass: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.changeMasterPassword(current, newPass);
      
      if (!result.success) {
        set({ error: result.error || 'Failed to change password' });
        return false;
      }
      
      return true;
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // ===========================================================================
  // Credential Operations
  // ===========================================================================

  loadCredentials: async () => {
    try {
      const credentials = await window.dex.vault.getCredentials();
      set({ credentials });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  getCredential: async (id: string) => {
    try {
      return await window.dex.vault.getCredential(id);
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  addCredential: async (credential: Partial<VaultCredential>) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.addCredential(credential);
      
      if (result.success && result.id) {
        await get().loadCredentials();
        return result.id;
      } else {
        set({ error: result.error || 'Failed to add credential' });
        return null;
      }
    } catch (error) {
      set({ error: String(error) });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  updateCredential: async (id: string, updates: Partial<VaultCredential>) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.updateCredential(id, updates);
      
      if (result) {
        await get().loadCredentials();
        return true;
      } else {
        set({ error: 'Failed to update credential' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteCredential: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.deleteCredential(id);
      
      if (result) {
        await get().loadCredentials();
        if (get().selectedCredentialId === id) {
          set({ selectedCredentialId: null });
        }
        return true;
      } else {
        set({ error: 'Failed to delete credential' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  searchCredentials: async (query: string) => {
    try {
      if (!query.trim()) {
        await get().loadCredentials();
        return;
      }
      
      const credentials = await window.dex.vault.searchCredentials(query);
      set({ credentials });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // ===========================================================================
  // Authenticator Operations
  // ===========================================================================

  loadAuthenticators: async () => {
    try {
      const authenticators = await window.dex.vault.getAuthenticators();
      set({ authenticators });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  addAuthenticator: async (entry: Partial<AuthenticatorEntry>) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.addAuthenticator(entry);
      
      if (result.success && result.id) {
        await get().loadAuthenticators();
        return result.id;
      } else {
        set({ error: result.error || 'Failed to add authenticator' });
        return null;
      }
    } catch (error) {
      set({ error: String(error) });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  updateAuthenticator: async (id: string, updates: Partial<AuthenticatorEntry>) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.updateAuthenticator(id, updates);
      
      if (result) {
        await get().loadAuthenticators();
        return true;
      } else {
        set({ error: 'Failed to update authenticator' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteAuthenticator: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.deleteAuthenticator(id);
      
      if (result) {
        await get().loadAuthenticators();
        if (get().selectedAuthenticatorId === id) {
          set({ selectedAuthenticatorId: null });
        }
        return true;
      } else {
        set({ error: 'Failed to delete authenticator' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  generateTOTP: async (id: string) => {
    try {
      return await window.dex.vault.generateTOTP(id);
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  parseOTPUri: async (uri: string) => {
    try {
      return await window.dex.vault.parseOTPUri(uri);
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  // ===========================================================================
  // Password Generator & Clipboard
  // ===========================================================================

  generatePassword: async (options) => {
    try {
      return await window.dex.vault.generatePassword(options);
    } catch (error) {
      set({ error: String(error) });
      return '';
    }
  },

  copyToClipboard: async (text: string, autoClear = true) => {
    try {
      // Convert boolean to number (30 seconds if true, undefined if false)
      const clearTimeout = autoClear ? 30 : undefined;
      await window.dex.vault.copyToClipboard(text, clearTimeout);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  // ===========================================================================
  // Audit
  // ===========================================================================

  auditPasswords: async () => {
    try {
      return await window.dex.vault.auditPasswords();
    } catch (error) {
      set({ error: String(error) });
      return { weak: [], reused: [], old: [] };
    }
  },

  // ===========================================================================
  // Settings & Categories
  // ===========================================================================

  loadSettings: async () => {
    try {
      const settings = await window.dex.vault.getSettings();
      set({ settings });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateSettings: async (updates: Partial<VaultSettings>) => {
    try {
      const result = await window.dex.vault.updateSettings(updates);
      
      if (result) {
        await get().loadSettings();
        return true;
      } else {
        set({ error: 'Failed to update settings' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    }
  },

  loadCategories: async () => {
    try {
      const categories = await window.dex.vault.getCategories();
      set({ categories });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  addCategory: async (category: { name: string; icon?: string }) => {
    try {
      const result = await window.dex.vault.addCategory(category);
      
      if (result.success && result.id) {
        await get().loadCategories();
        return result.id;
      } else {
        set({ error: result.error || 'Failed to add category' });
        return null;
      }
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  // ===========================================================================
  // Export/Import
  // ===========================================================================

  exportVault: async (password: string) => {
    try {
      return await window.dex.vault.export(password);
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  importVault: async (data: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const result = await window.dex.vault.import(data, password);
      
      if (result.success) {
        await get().loadCredentials();
        await get().loadAuthenticators();
        return true;
      } else {
        set({ error: result.error || 'Failed to import vault' });
        return false;
      }
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // ===========================================================================
  // UI Actions
  // ===========================================================================

  setSelectedCredential: (id: string | null) => set({ selectedCredentialId: id }),
  setSelectedAuthenticator: (id: string | null) => set({ selectedAuthenticatorId: id }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveCategory: (category: VaultCategory | 'all') => set({ activeCategory: category }),
  clearError: () => set({ error: null }),
}));

// ===========================================================================
// Selectors
// ===========================================================================

export const selectFilteredCredentials = (state: VaultState): VaultCredential[] => {
  let filtered = state.credentials;
  
  // Filter by category
  if (state.activeCategory !== 'all') {
    filtered = filtered.filter(c => c.category === state.activeCategory);
  }
  
  // Filter by search query
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.title.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query) ||
      c.url?.toLowerCase().includes(query) ||
      c.tags.some(t => t.toLowerCase().includes(query))
    );
  }
  
  return filtered;
};

export const selectFilteredAuthenticators = (state: VaultState): AuthenticatorEntry[] => {
  let filtered = state.authenticators;
  
  // Filter by category
  if (state.activeCategory !== 'all') {
    filtered = filtered.filter(a => a.category === state.activeCategory);
  }
  
  // Filter by search query
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(a =>
      a.service.toLowerCase().includes(query) ||
      a.account.toLowerCase().includes(query) ||
      a.issuer?.toLowerCase().includes(query)
    );
  }
  
  return filtered;
};

export default useVaultStore;
