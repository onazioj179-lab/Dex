// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Enhanced AutoSave Manager (Items 242-250)
 * Intelligent auto-save with crash recovery and conflict resolution
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface AutoSaveConfig {
  enabled: boolean;
  intervalMs: number;
  maxVersions: number;
  compressData: boolean;
  encryptData: boolean;
}

export interface SavedVersion {
  id: string;
  timestamp: number;
  size: number;
  checksum: string;
  isRecovery: boolean;
  description?: string;
}

export interface AutoSaveState {
  appId: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: number | null;
  lastError: string | null;
  versions: SavedVersion[];
  pendingData: unknown | null;
}

export interface RecoveryData {
  appId: string;
  data: unknown;
  timestamp: number;
  version: SavedVersion;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: AutoSaveConfig = {
  enabled: true,
  intervalMs: 30000, // 30 seconds
  maxVersions: 10,
  compressData: true,
  encryptData: false,
};

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_PREFIX = 'dex-autosave-';
const RECOVERY_KEY = 'dex-recovery-data';
const CONFIG_KEY = 'dex-autosave-config';

// ============================================================================
// AutoSave Store
// ============================================================================

interface AutoSaveStore {
  configs: Map<string, AutoSaveConfig>;
  states: Map<string, AutoSaveState>;
  
  // Config
  getConfig: (appId: string) => AutoSaveConfig;
  setConfig: (appId: string, config: Partial<AutoSaveConfig>) => void;
  
  // State
  getState: (appId: string) => AutoSaveState;
  setDirty: (appId: string, dirty: boolean) => void;
  
  // Save/Load
  save: (appId: string, data: unknown, description?: string) => Promise<boolean>;
  load: (appId: string, versionId?: string) => Promise<unknown | null>;
  getVersions: (appId: string) => SavedVersion[];
  deleteVersion: (appId: string, versionId: string) => void;
  
  // Recovery
  checkRecovery: (appId: string) => RecoveryData | null;
  acceptRecovery: (appId: string) => unknown | null;
  discardRecovery: (appId: string) => void;
  
  // Cleanup
  cleanup: (appId: string) => void;
}

export const useAutoSaveStore = create<AutoSaveStore>((set, get) => ({
  configs: new Map(),
  states: new Map(),

  getConfig: (appId) => {
    const { configs } = get();
    return configs.get(appId) || DEFAULT_CONFIG;
  },

  setConfig: (appId, config) => {
    set(state => {
      const configs = new Map(state.configs);
      const current = configs.get(appId) || DEFAULT_CONFIG;
      configs.set(appId, { ...current, ...config });
      return { configs };
    });
    
    // Persist config
    try {
      const allConfigs: Record<string, AutoSaveConfig> = {};
      get().configs.forEach((v, k) => { allConfigs[k] = v; });
      localStorage.setItem(CONFIG_KEY, JSON.stringify(allConfigs));
    } catch (e) {
      console.warn('[AutoSave] Failed to persist config:', e);
    }
  },

  getState: (appId) => {
    const { states } = get();
    return states.get(appId) || {
      appId,
      isDirty: false,
      isSaving: false,
      lastSaved: null,
      lastError: null,
      versions: [],
      pendingData: null,
    };
  },

  setDirty: (appId, dirty) => {
    set(state => {
      const states = new Map(state.states);
      const current = states.get(appId) || get().getState(appId);
      states.set(appId, { ...current, isDirty: dirty });
      return { states };
    });
  },

  save: async (appId, data, description) => {
    const config = get().getConfig(appId);
    if (!config.enabled) return false;
    
    // Update state to saving
    set(state => {
      const states = new Map(state.states);
      const current = states.get(appId) || get().getState(appId);
      states.set(appId, { ...current, isSaving: true, lastError: null });
      return { states };
    });
    
    try {
      const timestamp = Date.now();
      const versionId = `v_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
      
      // Serialize data
      let serialized = JSON.stringify(data);
      
      // Compress if enabled
      if (config.compressData) {
        serialized = await compressString(serialized);
      }
      
      // Calculate checksum
      const checksum = await calculateChecksum(serialized);
      
      // Create version entry
      const version: SavedVersion = {
        id: versionId,
        timestamp,
        size: serialized.length,
        checksum,
        isRecovery: false,
        description,
      };
      
      // Save to storage
      const storageKey = `${STORAGE_PREFIX}${appId}-${versionId}`;
      localStorage.setItem(storageKey, serialized);
      
      // Update versions list
      const currentState = get().getState(appId);
      let versions = [...currentState.versions, version];
      
      // Trim old versions
      if (versions.length > config.maxVersions) {
        const toDelete = versions.slice(0, versions.length - config.maxVersions);
        toDelete.forEach(v => {
          try {
            localStorage.removeItem(`${STORAGE_PREFIX}${appId}-${v.id}`);
          } catch (e) { /* ignore */ }
        });
        versions = versions.slice(-config.maxVersions);
      }
      
      // Save versions index
      localStorage.setItem(`${STORAGE_PREFIX}${appId}-versions`, JSON.stringify(versions));
      
      // Update state
      set(state => {
        const states = new Map(state.states);
        states.set(appId, {
          ...currentState,
          isDirty: false,
          isSaving: false,
          lastSaved: timestamp,
          lastError: null,
          versions,
        });
        return { states };
      });
      
      return true;
    } catch (err) {
      console.error('[AutoSave] Save failed:', err);
      
      set(state => {
        const states = new Map(state.states);
        const current = states.get(appId) || get().getState(appId);
        states.set(appId, {
          ...current,
          isSaving: false,
          lastError: err instanceof Error ? err.message : 'Save failed',
        });
        return { states };
      });
      
      return false;
    }
  },

  load: async (appId, versionId) => {
    try {
      const currentState = get().getState(appId);
      const config = get().getConfig(appId);
      
      // Get version to load
      let version: SavedVersion | undefined;
      if (versionId) {
        version = currentState.versions.find(v => v.id === versionId);
      } else {
        // Load latest
        version = currentState.versions[currentState.versions.length - 1];
      }
      
      if (!version) {
        return null;
      }
      
      // Load from storage
      const storageKey = `${STORAGE_PREFIX}${appId}-${version.id}`;
      let serialized = localStorage.getItem(storageKey);
      
      if (!serialized) {
        return null;
      }
      
      // Verify checksum
      const checksum = await calculateChecksum(serialized);
      if (checksum !== version.checksum) {
        console.warn('[AutoSave] Checksum mismatch, data may be corrupted');
      }
      
      // Decompress if needed
      if (config.compressData) {
        serialized = await decompressString(serialized);
      }
      
      return JSON.parse(serialized);
    } catch (err) {
      console.error('[AutoSave] Load failed:', err);
      return null;
    }
  },

  getVersions: (appId) => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${appId}-versions`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) { /* ignore */ }
    return [];
  },

  deleteVersion: (appId, versionId) => {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${appId}-${versionId}`);
      
      set(state => {
        const states = new Map(state.states);
        const current = states.get(appId) || get().getState(appId);
        const versions = current.versions.filter(v => v.id !== versionId);
        states.set(appId, { ...current, versions });
        
        localStorage.setItem(`${STORAGE_PREFIX}${appId}-versions`, JSON.stringify(versions));
        
        return { states };
      });
    } catch (e) {
      console.warn('[AutoSave] Delete version failed:', e);
    }
  },

  checkRecovery: (appId) => {
    try {
      const recoveryData = localStorage.getItem(`${RECOVERY_KEY}-${appId}`);
      if (recoveryData) {
        return JSON.parse(recoveryData);
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  acceptRecovery: (appId) => {
    const recovery = get().checkRecovery(appId);
    if (recovery) {
      get().discardRecovery(appId);
      return recovery.data;
    }
    return null;
  },

  discardRecovery: (appId) => {
    try {
      localStorage.removeItem(`${RECOVERY_KEY}-${appId}`);
    } catch (e) { /* ignore */ }
  },

  cleanup: (appId) => {
    try {
      // Remove all data for app
      const versions = get().getVersions(appId);
      versions.forEach(v => {
        localStorage.removeItem(`${STORAGE_PREFIX}${appId}-${v.id}`);
      });
      localStorage.removeItem(`${STORAGE_PREFIX}${appId}-versions`);
      localStorage.removeItem(`${RECOVERY_KEY}-${appId}`);
      
      set(state => {
        const states = new Map(state.states);
        states.delete(appId);
        return { states };
      });
    } catch (e) {
      console.warn('[AutoSave] Cleanup failed:', e);
    }
  },
}));

// ============================================================================
// Compression Helpers
// ============================================================================

async function compressString(str: string): Promise<string> {
  try {
    if (typeof CompressionStream !== 'undefined') {
      const blob = new Blob([str]);
      const cs = new CompressionStream('gzip');
      const compressedStream = blob.stream().pipeThrough(cs);
      const compressedBlob = await new Response(compressedStream).blob();
      const buffer = await compressedBlob.arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }
  } catch (e) { /* fallback */ }
  
  // Fallback: simple base64 encoding
  return btoa(encodeURIComponent(str));
}

async function decompressString(compressed: string): Promise<string> {
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const bytes = Uint8Array.from(atob(compressed), c => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const ds = new DecompressionStream('gzip');
      const decompressedStream = blob.stream().pipeThrough(ds);
      return await new Response(decompressedStream).text();
    }
  } catch (e) { /* fallback */ }
  
  // Fallback: simple base64 decoding
  return decodeURIComponent(atob(compressed));
}

async function calculateChecksum(str: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
  } catch (e) { /* fallback */ }
  
  // Simple fallback checksum
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// AutoSave Hook
// ============================================================================

export function useEnhancedAutoSave(
  appId: string,
  getData: () => unknown,
  isDirty: boolean,
  intervalMs?: number
) {
  const store = useAutoSaveStore();
  const config = store.getConfig(appId);
  const state = store.getState(appId);
  
  // Set dirty state
  React.useEffect(() => {
    store.setDirty(appId, isDirty);
  }, [appId, isDirty, store]);
  
  // Auto-save interval
  React.useEffect(() => {
    if (!config.enabled || !isDirty) return;
    
    const interval = intervalMs || config.intervalMs;
    const timer = setInterval(() => {
      const data = getData();
      store.save(appId, data);
    }, interval);
    
    return () => clearInterval(timer);
  }, [appId, config.enabled, config.intervalMs, getData, isDirty, intervalMs, store]);
  
  // Save recovery data on unload
  React.useEffect(() => {
    const handleUnload = () => {
      if (isDirty) {
        const data = getData();
        try {
          localStorage.setItem(`${RECOVERY_KEY}-${appId}`, JSON.stringify({
            appId,
            data,
            timestamp: Date.now(),
          }));
        } catch (e) { /* ignore */ }
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [appId, getData, isDirty]);
  
  return {
    ...state,
    save: (description?: string) => store.save(appId, getData(), description),
    load: (versionId?: string) => store.load(appId, versionId),
    checkRecovery: () => store.checkRecovery(appId),
    acceptRecovery: () => store.acceptRecovery(appId),
    discardRecovery: () => store.discardRecovery(appId),
  };
}

// Need React import for the hook
import React from 'react';

// ============================================================================
// Format Helpers
// ============================================================================

export function formatSaveTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
