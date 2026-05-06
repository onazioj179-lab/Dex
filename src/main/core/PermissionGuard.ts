// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Permission Guard
// Phase 1: Permission Handling - Graceful handling of permission revocation
// Handle permission revoke mid-session, graceful feature disable, no crashes
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import { DataStore } from '../store/DataStore';
import { DexPermissions } from '../../shared/types';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PermissionState {
  permission: keyof DexPermissions;
  granted: boolean;
  lastChecked: number;
  revokedAt?: number;
  revokeReason?: string;
}

export interface PermissionGuardConfig {
  checkIntervalMs: number;
  gracefulDegradation: boolean;
  notifyOnRevoke: boolean;
  autoDisableFeatures: boolean;
}

export interface FeatureDependency {
  feature: string;
  requiredPermissions: (keyof DexPermissions)[];
  enabled: boolean;
  degradedMode: boolean;
}

// ===========================================================================
// PERMISSION GUARD CLASS
// ===========================================================================

class PermissionGuardClass extends EventEmitter {
  private dataStore: DataStore | null = null;
  private config: PermissionGuardConfig;
  private permissionStates: Map<keyof DexPermissions, PermissionState> = new Map();
  private featureDependencies: Map<string, FeatureDependency> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.config = {
      checkIntervalMs: 30000, // Check every 30 seconds
      gracefulDegradation: true,
      notifyOnRevoke: true,
      autoDisableFeatures: true,
    };
    this.setMaxListeners(50);
    this.registerDefaultFeatures();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(dataStore: DataStore): Promise<void> {
    if (this.isInitialized) return;

    this.dataStore = dataStore;
    await this.loadPermissionStates();
    this.startPermissionMonitor();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[PermissionGuard] Permission guard initialized');
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.removeAllListeners();
    log.info('[PermissionGuard] Permission guard shut down');
  }

  // -------------------------------------------------------------------------
  // DEFAULT FEATURE DEPENDENCIES
  // -------------------------------------------------------------------------

  private registerDefaultFeatures(): void {
    // Define which features depend on which permissions
    this.registerFeature('app-launcher', ['openApps']);
    this.registerFeature('app-killer', ['closeApps']);
    this.registerFeature('command-execution', ['runCommands']);
    this.registerFeature('volume-control', ['adjustVolume']);
    this.registerFeature('file-operations', ['fileSystem']);
    this.registerFeature('network-monitor', ['network']);
    this.registerFeature('automation-runner', ['runCommands', 'fileSystem']);
    this.registerFeature('voice-commands', ['runCommands']);
  }

  registerFeature(feature: string, requiredPermissions: (keyof DexPermissions)[]): void {
    this.featureDependencies.set(feature, {
      feature,
      requiredPermissions,
      enabled: true,
      degradedMode: false,
    });
  }

  // -------------------------------------------------------------------------
  // PERMISSION STATE MANAGEMENT
  // -------------------------------------------------------------------------

  private async loadPermissionStates(): Promise<void> {
    if (!this.dataStore) return;

    const permissions = this.dataStore.getPermissions();
    const permissionKeys: (keyof DexPermissions)[] = [
      'openApps', 'closeApps', 'runCommands', 'adjustVolume', 'fileSystem', 'network'
    ];

    for (const key of permissionKeys) {
      this.permissionStates.set(key, {
        permission: key,
        granted: permissions[key] ?? false,
        lastChecked: Date.now(),
      });
    }

    this.updateFeatureStates();
  }

  private startPermissionMonitor(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkPermissionChanges();
    }, this.config.checkIntervalMs);

    log.info('[PermissionGuard] Permission monitor started');
  }

  private async checkPermissionChanges(): Promise<void> {
    if (!this.dataStore) return;

    const currentPermissions = this.dataStore.getPermissions();
    const changes: Array<{ permission: keyof DexPermissions; wasGranted: boolean; isGranted: boolean }> = [];

    for (const [key, state] of this.permissionStates) {
      const currentValue = currentPermissions[key] ?? false;
      
      if (state.granted !== currentValue) {
        changes.push({
          permission: key,
          wasGranted: state.granted,
          isGranted: currentValue,
        });

        // Update state
        state.granted = currentValue;
        state.lastChecked = Date.now();
        
        if (!currentValue) {
          state.revokedAt = Date.now();
        } else {
          state.revokedAt = undefined;
          state.revokeReason = undefined;
        }
      }
    }

    // Process changes
    for (const change of changes) {
      if (change.wasGranted && !change.isGranted) {
        await this.handlePermissionRevoked(change.permission);
      } else if (!change.wasGranted && change.isGranted) {
        await this.handlePermissionGranted(change.permission);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PERMISSION CHANGE HANDLERS
  // -------------------------------------------------------------------------

  private async handlePermissionRevoked(permission: keyof DexPermissions): Promise<void> {
    log.warn(`[PermissionGuard] Permission revoked: ${permission}`);

    // Update affected features
    this.updateFeatureStates();

    // Notify renderer
    if (this.config.notifyOnRevoke) {
      this.notifyPermissionChange(permission, false);
    }

    // Emit event for other systems
    this.emit('permission-revoked', { permission, affectedFeatures: this.getAffectedFeatures(permission) });

    // Auto-disable features if configured
    if (this.config.autoDisableFeatures) {
      await this.disableAffectedFeatures(permission);
    }
  }

  private async handlePermissionGranted(permission: keyof DexPermissions): Promise<void> {
    log.info(`[PermissionGuard] Permission granted: ${permission}`);

    // Re-enable affected features
    this.updateFeatureStates();

    // Notify renderer
    this.notifyPermissionChange(permission, true);

    // Emit event
    this.emit('permission-granted', { permission, affectedFeatures: this.getAffectedFeatures(permission) });
  }

  // -------------------------------------------------------------------------
  // FEATURE STATE MANAGEMENT
  // -------------------------------------------------------------------------

  private updateFeatureStates(): void {
    for (const [, feature] of this.featureDependencies) {
      const allGranted = feature.requiredPermissions.every(p => {
        const state = this.permissionStates.get(p);
        return state?.granted ?? false;
      });

      const someGranted = feature.requiredPermissions.some(p => {
        const state = this.permissionStates.get(p);
        return state?.granted ?? false;
      });

      feature.enabled = allGranted;
      feature.degradedMode = !allGranted && someGranted && this.config.gracefulDegradation;
    }
  }

  private getAffectedFeatures(permission: keyof DexPermissions): string[] {
    const affected: string[] = [];
    
    for (const [name, feature] of this.featureDependencies) {
      if (feature.requiredPermissions.includes(permission)) {
        affected.push(name);
      }
    }

    return affected;
  }

  private async disableAffectedFeatures(permission: keyof DexPermissions): Promise<void> {
    const affected = this.getAffectedFeatures(permission);
    
    for (const featureName of affected) {
      const feature = this.featureDependencies.get(featureName);
      if (feature) {
        feature.enabled = false;
        log.info(`[PermissionGuard] Disabled feature: ${featureName} (missing ${permission})`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PERMISSION CHECKS (PUBLIC API)
  // -------------------------------------------------------------------------

  /**
   * Check if a specific permission is granted
   */
  hasPermission(permission: keyof DexPermissions): boolean {
    const state = this.permissionStates.get(permission);
    return state?.granted ?? false;
  }

  /**
   * Check if a feature is available (all required permissions granted)
   */
  isFeatureAvailable(feature: string): boolean {
    const dependency = this.featureDependencies.get(feature);
    return dependency?.enabled ?? false;
  }

  /**
   * Check if a feature is in degraded mode
   */
  isFeatureDegraded(feature: string): boolean {
    const dependency = this.featureDependencies.get(feature);
    return dependency?.degradedMode ?? false;
  }

  /**
   * Get all permission states
   */
  getAllPermissionStates(): PermissionState[] {
    return Array.from(this.permissionStates.values());
  }

  /**
   * Get all feature dependencies
   */
  getAllFeatures(): FeatureDependency[] {
    return Array.from(this.featureDependencies.values());
  }

  /**
   * Safe execution wrapper - only runs if permission is granted
   */
  async withPermission<T>(
    permission: keyof DexPermissions,
    operation: () => Promise<T>,
    onDenied?: () => T
  ): Promise<T | undefined> {
    if (!this.hasPermission(permission)) {
      log.warn(`[PermissionGuard] Operation blocked - missing permission: ${permission}`);
      this.emit('operation-blocked', { permission });
      return onDenied?.();
    }

    try {
      return await operation();
    } catch (error) {
      log.error(`[PermissionGuard] Operation failed with permission ${permission}:`, error);
      throw error;
    }
  }

  /**
   * Safe execution wrapper - only runs if feature is available
   */
  async withFeature<T>(
    feature: string,
    operation: () => Promise<T>,
    degradedOperation?: () => Promise<T>,
    onUnavailable?: () => T
  ): Promise<T | undefined> {
    const featureDep = this.featureDependencies.get(feature);
    
    if (!featureDep) {
      log.warn(`[PermissionGuard] Unknown feature: ${feature}`);
      return onUnavailable?.();
    }

    if (featureDep.enabled) {
      return await operation();
    }

    if (featureDep.degradedMode && degradedOperation) {
      log.info(`[PermissionGuard] Running ${feature} in degraded mode`);
      return await degradedOperation();
    }

    log.warn(`[PermissionGuard] Feature unavailable: ${feature}`);
    this.emit('feature-unavailable', { feature, missingPermissions: this.getMissingPermissions(feature) });
    return onUnavailable?.();
  }

  /**
   * Get missing permissions for a feature
   */
  getMissingPermissions(feature: string): (keyof DexPermissions)[] {
    const featureDep = this.featureDependencies.get(feature);
    if (!featureDep) return [];

    return featureDep.requiredPermissions.filter(p => !this.hasPermission(p));
  }

  // -------------------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------------------

  private notifyPermissionChange(permission: keyof DexPermissions, granted: boolean): void {
    const windows = BrowserWindow.getAllWindows();
    
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('permission:changed', {
          permission,
          granted,
          affectedFeatures: this.getAffectedFeatures(permission),
          timestamp: Date.now(),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('permission:check', (_, permission: keyof DexPermissions) => {
      return this.hasPermission(permission);
    });

    ipcMain.handle('permission:checkFeature', (_, feature: string) => {
      return {
        available: this.isFeatureAvailable(feature),
        degraded: this.isFeatureDegraded(feature),
        missingPermissions: this.getMissingPermissions(feature),
      };
    });

    ipcMain.handle('permission:getAllStates', () => {
      return this.getAllPermissionStates();
    });

    ipcMain.handle('permission:getAllFeatures', () => {
      return this.getAllFeatures();
    });

    ipcMain.handle('permission:request', async (_, permission: keyof DexPermissions) => {
      return this.requestPermission(permission);
    });
  }

  /**
   * Request a permission from the user
   */
  async requestPermission(permission: keyof DexPermissions): Promise<boolean> {
    const PERMISSION_NAMES: Record<keyof DexPermissions, string> = {
      openApps: 'Open Applications',
      closeApps: 'Close Applications',
      runCommands: 'Run Commands',
      adjustVolume: 'Adjust Volume',
      fileSystem: 'File System Access',
      network: 'Network Monitoring',
    };

    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Allow', 'Deny'],
      defaultId: 0,
      cancelId: 1,
      title: 'Permission Request',
      message: `Allow Dex to use "${PERMISSION_NAMES[permission]}"?`,
      detail: 'This permission is required for the feature you are trying to use.',
    });

    if (result.response === 0 && this.dataStore) {
      await this.dataStore.setPermission(permission, true);
      const state = this.permissionStates.get(permission);
      if (state) {
        state.granted = true;
        state.lastChecked = Date.now();
      }
      this.updateFeatureStates();
      return true;
    }

    return false;
  }
}

// Singleton instance
export const permissionGuard = new PermissionGuardClass();

// Export for registration
export function registerPermissionGuardHandlers(): void {
  // Handlers are registered during initialization
}
