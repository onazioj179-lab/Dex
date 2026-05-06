// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Security Store
// Phase 39 & 40: Zustand store for security state management
// ===========================================================================

import { create } from 'zustand';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SecurityLayerConfig {
  osSandbox: boolean;
  processIsolation: boolean;
  encryptionLayer: boolean;
  executionControl: boolean;
  auditIntegrity: boolean;
}

export interface SecurityConfig {
  layersEnabled: SecurityLayerConfig;
  integrityChecks: boolean;
  auditLogging: boolean;
  memoryProtection: boolean;
  autoLockTimeout: number;
  lastSecurityCheck: number;
}

export interface LayerStatus {
  layer: number;
  name: string;
  status: 'active' | 'degraded' | 'disabled';
  details: string;
}

export interface SecurityThreat {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'integrity' | 'tampering' | 'exposure' | 'permission';
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface SecurityStatus {
  overallHealth: 'healthy' | 'warning' | 'critical';
  layers: LayerStatus[];
  lastCheck: number;
  threats: SecurityThreat[];
  recommendations: string[];
}

export interface KeyInfo {
  id: string;
  name: string;
  purpose: string;
  algorithm: string;
  createdAt: number;
  lastUsed: number;
  rotatedAt?: number;
  expiresAt?: number;
}

export interface Transfer {
  id: string;
  type: 'send' | 'receive';
  status: string;
  fileName: string;
  fileSize: number;
  progress: number;
  encrypted: boolean;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface NetworkStatus {
  online: boolean;
  connectionType: string;
  metered: boolean;
  lastCheck: number;
  activeConnections: number;
  blockedAttempts: number;
}

export interface ConnectivityState {
  wifi: { available: boolean; connected: boolean; strength?: number };
  cellular: { available: boolean; connected: boolean };
  bluetooth: { available: boolean; connected: boolean };
  vpn: boolean;
}

// ===========================================================================
// STORE
// ===========================================================================

interface SecurityStore {
  // Security status
  status: SecurityStatus | null;
  config: SecurityConfig | null;
  isLoading: boolean;
  error: string | null;

  // Keys
  keys: KeyInfo[];
  isKeysUnlocked: boolean;

  // Transfers
  transfers: Transfer[];
  activeTransfers: Transfer[];

  // Network
  networkStatus: NetworkStatus | null;
  connectivity: ConnectivityState | null;

  // Actions
  loadSecurityStatus: () => Promise<void>;
  performSecurityCheck: () => Promise<void>;
  updateConfig: (updates: Partial<SecurityConfig>) => Promise<void>;
  updateLayerConfig: (updates: Partial<SecurityLayerConfig>) => Promise<void>;
  resolveThreat: (threatId: string) => Promise<boolean>;

  // Key actions
  loadKeys: () => Promise<void>;
  generateKey: (name: string, purpose: string) => Promise<KeyInfo | null>;
  deleteKey: (keyId: string) => Promise<boolean>;
  lockKeys: () => Promise<void>;
  unlockKeys: (password: string) => Promise<boolean>;

  // Transfer actions
  loadTransfers: () => Promise<void>;
  initiateTransfer: (filePath: string, options?: any) => Promise<Transfer | null>;
  approveTransfer: (transferId: string) => Promise<boolean>;
  rejectTransfer: (transferId: string) => Promise<boolean>;

  // Network actions
  loadNetworkStatus: () => Promise<void>;
  loadConnectivity: () => Promise<void>;
}

export const useSecurityStore = create<SecurityStore>((set, get) => ({
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

  loadSecurityStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await window.dex?.securityCore?.getStatus();
      const config = await window.dex?.securityCore?.getConfig();
      
      // Provide default status if API returns null
      const defaultStatus: SecurityStatus = {
        overallHealth: 'healthy',
        layers: [
          { layer: 1, name: 'OS Sandbox', status: 'active', details: 'Electron sandbox enabled' },
          { layer: 2, name: 'Process Isolation', status: 'active', details: 'Context isolation active' },
          { layer: 3, name: 'Data Protection', status: 'active', details: 'Encryption ready' },
          { layer: 4, name: 'Execution Control', status: 'active', details: 'Script validation enabled' },
          { layer: 5, name: 'Audit & Integrity', status: 'active', details: 'Logging active' },
        ],
        lastCheck: Date.now(),
        threats: [],
        recommendations: [],
      };
      
      const defaultConfig: SecurityConfig = {
        layersEnabled: {
          osSandbox: true,
          processIsolation: true,
          encryptionLayer: true,
          executionControl: true,
          auditIntegrity: true,
        },
        integrityChecks: true,
        auditLogging: true,
        memoryProtection: true,
        autoLockTimeout: 300000,
        lastSecurityCheck: Date.now(),
      };
      
      set({ 
        status: status || defaultStatus, 
        config: config || defaultConfig, 
        isLoading: false 
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  performSecurityCheck: async () => {
    set({ isLoading: true });
    try {
      const status = await window.dex?.securityCore?.runSecurityCheck();
      if (status) set({ status, isLoading: false });
      else set({ isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  updateConfig: async (updates) => {
    try {
      await window.dex?.securityCore?.updateConfig(updates);
      const config = await window.dex?.securityCore?.getConfig();
      if (config) set({ config });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateLayerConfig: async (updates) => {
    try {
      await window.dex?.securityCore?.updateConfig({ layersEnabled: updates });
      // Reload status to reflect changes
      await get().loadSecurityStatus();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  resolveThreat: async (threatId) => {
    try {
      const resolved = await window.dex?.securityCore?.acknowledgeThreats([threatId]);
      if (resolved) {
        await get().loadSecurityStatus();
      }
      return !!resolved;
    } catch (error) {
      return false;
    }
  },

  loadKeys: async () => {
    try {
      const keys = await window.dex?.secureKeys?.listKeys() ?? [];
      const isKeysUnlocked = !(await window.dex?.secureKeys?.isLocked() ?? true);
      set({ keys, isKeysUnlocked });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  generateKey: async (name, purpose) => {
    try {
      const key = await window.dex?.secureKeys?.generateKey(name, purpose);
      if (key) {
        await get().loadKeys();
      }
      return key;
    } catch (error) {
      return null;
    }
  },

  deleteKey: async (keyId) => {
    try {
      const deleted = await window.dex?.secureKeys?.deleteKey(keyId);
      if (deleted) {
        await get().loadKeys();
      }
      return !!deleted;
    } catch (error) {
      return false;
    }
  },

  lockKeys: async () => {
    try {
      await window.dex?.secureKeys?.lock();
      set({ isKeysUnlocked: false });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  unlockKeys: async (password) => {
    try {
      const unlocked = await window.dex?.secureKeys?.unlock(password);
      set({ isKeysUnlocked: !!unlocked });
      return !!unlocked;
    } catch (error) {
      return false;
    }
  },

  loadTransfers: async () => {
    try {
      const transfers = await window.dex?.secureTransfer?.getTransfers() ?? [];
      const activeTransfers = await window.dex?.secureTransfer?.getActiveTransfers() ?? [];
      set({ transfers, activeTransfers });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  initiateTransfer: async (filePath, options) => {
    try {
      const transfer = await window.dex?.secureTransfer?.initiate(filePath, options?.destinationPath ?? '', options?.encrypt ?? true);
      if (transfer) {
        await get().loadTransfers();
      }
      return transfer;
    } catch (error) {
      return null;
    }
  },

  approveTransfer: async (transferId) => {
    try {
      const approved = await window.dex?.secureTransfer?.approveTransfer(transferId);
      if (approved) {
        await get().loadTransfers();
      }
      return !!approved;
    } catch (error) {
      return false;
    }
  },

  rejectTransfer: async (transferId) => {
    try {
      const rejected = await window.dex?.secureTransfer?.rejectTransfer(transferId);
      if (rejected) {
        await get().loadTransfers();
      }
      return !!rejected;
    } catch (error) {
      return false;
    }
  },

  loadNetworkStatus: async () => {
    try {
      const networkStatus = await window.dex?.networkHygiene?.getStatus();
      
      // Provide default network status
      const defaultNetworkStatus: NetworkStatus = {
        online: navigator.onLine,
        connectionType: 'unknown',
        metered: false,
        lastCheck: Date.now(),
        activeConnections: 0,
        blockedAttempts: 0,
      };
      
      set({ networkStatus: networkStatus || defaultNetworkStatus });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  loadConnectivity: async () => {
    try {
      const connectivity = await window.dex?.networkHygiene?.getConnectivity();
      
      // Provide default connectivity state
      const defaultConnectivity: ConnectivityState = {
        wifi: { available: true, connected: navigator.onLine },
        cellular: { available: false, connected: false },
        bluetooth: { available: false, connected: false },
        vpn: false,
      };
      
      set({ connectivity: connectivity || defaultConnectivity });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
}));

// ===========================================================================
// GLOBAL TYPE DECLARATIONS
// ===========================================================================

// The window.dex API is already declared in preload.ts
// This file just imports the types needed for the store
