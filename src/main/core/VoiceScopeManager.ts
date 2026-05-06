// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Voice Scope Manager
// Phase 46: Permission-based voice command scopes
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type VoiceScope = 
  | 'dex-only'
  | 'file-access'
  | 'app-control'
  | 'transfer'
  | 'media-control'
  | 'system';

export type ConfirmationLevel = 'never' | 'destructive' | 'always';

export interface ScopeDefinition {
  id: VoiceScope;
  name: string;
  description: string;
  examples: string[];
  riskLevel: 'low' | 'medium' | 'high';
  defaultEnabled: boolean;
}

export interface VoiceScopeConfig {
  scope: VoiceScope;
  enabled: boolean;
  confirmationLevel: ConfirmationLevel;
  allowedTargets: string[]; // Specific apps, folders, devices
}

export interface VoiceScopeStatus {
  scope: VoiceScope;
  enabled: boolean;
  confirmationLevel: ConfirmationLevel;
  allowedTargets: string[];
  usageCount: number;
  lastUsed: number | null;
}

// ===========================================================================
// SCOPE DEFINITIONS
// ===========================================================================

export const VOICE_SCOPES: Record<VoiceScope, ScopeDefinition> = {
  'dex-only': {
    id: 'dex-only',
    name: 'Dex Actions',
    description: 'Navigate Dex, create notes, run workflows, manage timers',
    examples: ['Open notes', 'Go to actions', 'Start timer for 25 minutes'],
    riskLevel: 'low',
    defaultEnabled: true, // Safe scope, enabled by default
  },
  'file-access': {
    id: 'file-access',
    name: 'File Operations',
    description: 'Search, rename, move, copy, delete files in allowed folders',
    examples: ['Find recent images', 'Rename these files', 'Move to Documents'],
    riskLevel: 'medium',
    defaultEnabled: false,
  },
  'app-control': {
    id: 'app-control',
    name: 'App Control',
    description: 'Open and close approved applications',
    examples: ['Open Chrome', 'Close Spotify', 'Launch VS Code'],
    riskLevel: 'medium',
    defaultEnabled: false,
  },
  'transfer': {
    id: 'transfer',
    name: 'File Transfer',
    description: 'Send files to approved devices',
    examples: ['Send this to my phone', 'Transfer to laptop'],
    riskLevel: 'medium',
    defaultEnabled: false,
  },
  'media-control': {
    id: 'media-control',
    name: 'Media Control',
    description: 'Play, pause, skip, control volume',
    examples: ['Play', 'Pause', 'Volume up', 'Next track'],
    riskLevel: 'low',
    defaultEnabled: false,
  },
  'system': {
    id: 'system',
    name: 'System Actions',
    description: 'Create documents, open folders (within allowed paths)',
    examples: ['Create new document', 'Open Downloads folder'],
    riskLevel: 'high',
    defaultEnabled: false,
  },
};

// ===========================================================================
// STORE
// ===========================================================================

const DEFAULT_SCOPE_CONFIGS: Record<VoiceScope, VoiceScopeConfig> = {
  'dex-only': {
    scope: 'dex-only',
    enabled: true,
    confirmationLevel: 'never',
    allowedTargets: [],
  },
  'file-access': {
    scope: 'file-access',
    enabled: false,
    confirmationLevel: 'destructive',
    allowedTargets: [], // User must add allowed folders
  },
  'app-control': {
    scope: 'app-control',
    enabled: false,
    confirmationLevel: 'always',
    allowedTargets: [], // User must add allowed apps
  },
  'transfer': {
    scope: 'transfer',
    enabled: false,
    confirmationLevel: 'always',
    allowedTargets: [], // User must add allowed devices
  },
  'media-control': {
    scope: 'media-control',
    enabled: false,
    confirmationLevel: 'never',
    allowedTargets: [],
  },
  'system': {
    scope: 'system',
    enabled: false,
    confirmationLevel: 'always',
    allowedTargets: [],
  },
};

const scopeStore = new Store<{
  scopes: Record<VoiceScope, VoiceScopeConfig>;
  usageStats: Record<VoiceScope, { count: number; lastUsed: number | null }>;
}>({
  name: 'voice-scopes',
  defaults: {
    scopes: DEFAULT_SCOPE_CONFIGS,
    usageStats: {
      'dex-only': { count: 0, lastUsed: null },
      'file-access': { count: 0, lastUsed: null },
      'app-control': { count: 0, lastUsed: null },
      'transfer': { count: 0, lastUsed: null },
      'media-control': { count: 0, lastUsed: null },
      'system': { count: 0, lastUsed: null },
    },
  },
});

// ===========================================================================
// VOICE SCOPE MANAGER
// ===========================================================================

class VoiceScopeManager {
  private static instance: VoiceScopeManager;
  private initialized = false;

  private constructor() {}

  static getInstance(): VoiceScopeManager {
    if (!VoiceScopeManager.instance) {
      VoiceScopeManager.instance = new VoiceScopeManager();
    }
    return VoiceScopeManager.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();

    this.initialized = true;
    log.info('[VoiceScopeManager] Initialized');
  }

  private setupIPC(): void {
    // Scope definitions
    ipcMain.handle('voiceScope:getDefinitions', () => this.getScopeDefinitions());
    
    // Scope management
    ipcMain.handle('voiceScope:getAll', () => this.getAllScopeStatus());
    ipcMain.handle('voiceScope:get', (_, scope) => this.getScopeStatus(scope));
    ipcMain.handle('voiceScope:enable', (_, scope) => this.enableScope(scope));
    ipcMain.handle('voiceScope:disable', (_, scope) => this.disableScope(scope));
    ipcMain.handle('voiceScope:setConfirmation', (_, scope, level) => this.setConfirmationLevel(scope, level));
    
    // Target management
    ipcMain.handle('voiceScope:addTarget', (_, scope, target) => this.addAllowedTarget(scope, target));
    ipcMain.handle('voiceScope:removeTarget', (_, scope, target) => this.removeAllowedTarget(scope, target));
    ipcMain.handle('voiceScope:getTargets', (_, scope) => this.getAllowedTargets(scope));
    
    // Validation
    ipcMain.handle('voiceScope:isAllowed', (_, scope) => this.isScopeAllowed(scope));
    ipcMain.handle('voiceScope:isTargetAllowed', (_, scope, target) => this.isTargetAllowed(scope, target));
    
    // Reset
    ipcMain.handle('voiceScope:reset', () => this.resetAllScopes());
  }

  // -------------------------------------------------------------------------
  // SCOPE DEFINITIONS
  // -------------------------------------------------------------------------

  getScopeDefinitions(): ScopeDefinition[] {
    return Object.values(VOICE_SCOPES);
  }

  getScopeDefinition(scope: VoiceScope): ScopeDefinition {
    return VOICE_SCOPES[scope];
  }

  // -------------------------------------------------------------------------
  // SCOPE STATUS
  // -------------------------------------------------------------------------

  getAllScopeStatus(): VoiceScopeStatus[] {
    const scopes = scopeStore.get('scopes');
    const stats = scopeStore.get('usageStats');

    return Object.values(scopes).map(config => ({
      scope: config.scope,
      enabled: config.enabled,
      confirmationLevel: config.confirmationLevel,
      allowedTargets: config.allowedTargets,
      usageCount: stats[config.scope].count,
      lastUsed: stats[config.scope].lastUsed,
    }));
  }

  getScopeStatus(scope: VoiceScope): VoiceScopeStatus | null {
    const scopes = scopeStore.get('scopes');
    const stats = scopeStore.get('usageStats');
    const config = scopes[scope];

    if (!config) return null;

    return {
      scope: config.scope,
      enabled: config.enabled,
      confirmationLevel: config.confirmationLevel,
      allowedTargets: config.allowedTargets,
      usageCount: stats[scope].count,
      lastUsed: stats[scope].lastUsed,
    };
  }

  // -------------------------------------------------------------------------
  // SCOPE MANAGEMENT
  // -------------------------------------------------------------------------

  async enableScope(scope: VoiceScope): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]) return false;

    scopes[scope].enabled = true;
    scopeStore.set('scopes', scopes);

    this.notifyScopeChanged(scope, true);
    log.info(`[VoiceScopeManager] Scope enabled: ${scope}`);
    return true;
  }

  async disableScope(scope: VoiceScope): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]) return false;

    scopes[scope].enabled = false;
    scopeStore.set('scopes', scopes);

    this.notifyScopeChanged(scope, false);
    log.info(`[VoiceScopeManager] Scope disabled: ${scope}`);
    return true;
  }

  async setConfirmationLevel(scope: VoiceScope, level: ConfirmationLevel): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]) return false;

    scopes[scope].confirmationLevel = level;
    scopeStore.set('scopes', scopes);

    return true;
  }

  async isScopeAllowed(scope: VoiceScope): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    return scopes[scope]?.enabled ?? false;
  }

  getConfirmationLevel(scope: VoiceScope): ConfirmationLevel {
    const scopes = scopeStore.get('scopes');
    return scopes[scope]?.confirmationLevel ?? 'always';
  }

  // -------------------------------------------------------------------------
  // TARGET MANAGEMENT
  // -------------------------------------------------------------------------

  async addAllowedTarget(scope: VoiceScope, target: string): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]) return false;

    const normalizedTarget = target.toLowerCase().trim();
    
    if (!scopes[scope].allowedTargets.includes(normalizedTarget)) {
      scopes[scope].allowedTargets.push(normalizedTarget);
      scopeStore.set('scopes', scopes);
    }

    return true;
  }

  async removeAllowedTarget(scope: VoiceScope, target: string): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]) return false;

    const normalizedTarget = target.toLowerCase().trim();
    const index = scopes[scope].allowedTargets.indexOf(normalizedTarget);
    
    if (index !== -1) {
      scopes[scope].allowedTargets.splice(index, 1);
      scopeStore.set('scopes', scopes);
    }

    return true;
  }

  getAllowedTargets(scope: VoiceScope): string[] {
    const scopes = scopeStore.get('scopes');
    return scopes[scope]?.allowedTargets ?? [];
  }

  async isTargetAllowed(scope: VoiceScope, target: string): Promise<boolean> {
    const scopes = scopeStore.get('scopes');
    if (!scopes[scope]?.enabled) return false;

    // If no targets specified, allow all (for scopes that don't need target restrictions)
    if (scopes[scope].allowedTargets.length === 0) {
      // For certain scopes, empty target list means "allow all"
      if (scope === 'dex-only' || scope === 'media-control') {
        return true;
      }
      // For other scopes, empty target list means "nothing allowed yet"
      return false;
    }

    const normalizedTarget = target.toLowerCase().trim();
    return scopes[scope].allowedTargets.some(allowed => 
      normalizedTarget.includes(allowed) || allowed.includes(normalizedTarget)
    );
  }

  // -------------------------------------------------------------------------
  // USAGE TRACKING
  // -------------------------------------------------------------------------

  recordScopeUsage(scope: VoiceScope): void {
    const stats = scopeStore.get('usageStats');
    stats[scope].count++;
    stats[scope].lastUsed = Date.now();
    scopeStore.set('usageStats', stats);
  }

  // -------------------------------------------------------------------------
  // RESET
  // -------------------------------------------------------------------------

  async resetAllScopes(): Promise<boolean> {
    scopeStore.set('scopes', DEFAULT_SCOPE_CONFIGS);
    log.info('[VoiceScopeManager] All scopes reset to defaults');
    return true;
  }

  // -------------------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------------------

  private notifyScopeChanged(scope: VoiceScope, enabled: boolean): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voiceScope:changed', { scope, enabled });
      }
    }
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  getScopeRiskLevel(scope: VoiceScope): 'low' | 'medium' | 'high' {
    return VOICE_SCOPES[scope]?.riskLevel ?? 'high';
  }

  getEnabledScopes(): VoiceScope[] {
    const scopes = scopeStore.get('scopes');
    return Object.values(scopes)
      .filter(s => s.enabled)
      .map(s => s.scope);
  }

  getScopeSummary(): {
    totalScopes: number;
    enabledScopes: number;
    highRiskEnabled: boolean;
  } {
    const scopes = scopeStore.get('scopes');
    const enabled = Object.values(scopes).filter(s => s.enabled);
    const highRiskEnabled = enabled.some(s => 
      VOICE_SCOPES[s.scope]?.riskLevel === 'high'
    );

    return {
      totalScopes: Object.keys(VOICE_SCOPES).length,
      enabledScopes: enabled.length,
      highRiskEnabled,
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const voiceScopeManager = VoiceScopeManager.getInstance();
export default voiceScopeManager;
