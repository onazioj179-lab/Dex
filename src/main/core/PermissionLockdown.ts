// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Permission Lockdown System
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// Complete permission mapping, graceful degradation, restricted mode
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { DexPermissions } from '../../shared/types';
import { securityAudit } from './SecurityAudit';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PermissionDefinition {
  id: keyof DexPermissions;
  name: string;
  description: string;
  reason: string;                     // Why this permission exists
  requiredFor: string[];              // Which features require it
  requestedWhen: string;              // When is it requested
  risk: 'low' | 'medium' | 'high';
  essential: boolean;                 // Can Dex function without it?
  canDisable: boolean;                // Can user disable this?
  degradedFeatures: string[];         // What degrades if disabled
}

export interface PermissionState {
  enabled: boolean;
  grantedAt: number | null;
  revokedAt: number | null;
  usageCount: number;
  lastUsed: number | null;
}

export interface RestrictedModeConfig {
  enabled: boolean;
  allowedPermissions: (keyof DexPermissions)[];
  reason?: string;
  activatedAt?: number;
}

// ===========================================================================
// PERMISSION MAP - Complete documentation of all permissions
// ===========================================================================

export const PERMISSION_MAP: Record<keyof DexPermissions, PermissionDefinition> = {
  openApps: {
    id: 'openApps',
    name: 'Open Applications',
    description: 'Launch applications and open URLs in browser',
    reason: 'Enables automation actions that start programs',
    requiredFor: ['Actions', 'Rules', 'Workflows', 'Operations'],
    requestedWhen: 'First action that opens an application is created',
    risk: 'low',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Cannot auto-launch applications', 'URL opening disabled'],
  },

  closeApps: {
    id: 'closeApps',
    name: 'Close Applications',
    description: 'Terminate running applications and processes',
    reason: 'Enables automation that manages running programs',
    requiredFor: ['Actions', 'Rules', 'Power management'],
    requestedWhen: 'First action that closes an application is created',
    risk: 'medium',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Cannot auto-close applications', 'Resource cleanup limited'],
  },

  runCommands: {
    id: 'runCommands',
    name: 'Run Terminal Commands',
    description: 'Execute shell commands and scripts',
    reason: 'Enables advanced automation through system commands',
    requiredFor: ['Custom scripts', 'Power profiles', 'System operations'],
    requestedWhen: 'First command or script action is created',
    risk: 'high',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Custom scripts disabled', 'Some power features limited'],
  },

  adjustVolume: {
    id: 'adjustVolume',
    name: 'System Volume Control',
    description: 'Adjust system audio volume',
    reason: 'Enables volume automation in modes and rules',
    requiredFor: ['Volume actions', 'Focus mode', 'Presentation mode'],
    requestedWhen: 'First volume action is created',
    risk: 'low',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Volume automation disabled'],
  },

  fileSystem: {
    id: 'fileSystem',
    name: 'File System Access',
    description: 'Open files and folders in their default applications',
    reason: 'Enables file and folder quick actions',
    requiredFor: ['File actions', 'Project launching'],
    requestedWhen: 'First file or folder action is created',
    risk: 'medium',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Cannot open files/folders', 'Project actions limited'],
  },

  network: {
    id: 'network',
    name: 'Network Status Monitoring',
    description: 'Monitor network connection status',
    reason: 'Enables network-based rules and conditions',
    requiredFor: ['Network rules', 'Connection-based automation'],
    requestedWhen: 'First network condition rule is created',
    risk: 'low',
    essential: false,
    canDisable: true,
    degradedFeatures: ['Network rules will not trigger'],
  },
};

// ===========================================================================
// STORE
// ===========================================================================

const permissionStore = new Store<{
  states: Record<keyof DexPermissions, PermissionState>;
  restrictedMode: RestrictedModeConfig;
}>({
  name: 'dex-permissions',
  defaults: {
    states: {
      openApps: { enabled: true, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
      closeApps: { enabled: false, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
      runCommands: { enabled: false, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
      adjustVolume: { enabled: true, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
      fileSystem: { enabled: true, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
      network: { enabled: true, grantedAt: null, revokedAt: null, usageCount: 0, lastUsed: null },
    },
    restrictedMode: {
      enabled: false,
      allowedPermissions: ['openApps', 'adjustVolume', 'network'],
    },
  },
});

// ===========================================================================
// PERMISSION LOCKDOWN CLASS
// ===========================================================================

class PermissionLockdownClass {
  // -------------------------------------------------------------------------
  // PERMISSION QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get complete permission information
   */
  getPermissionMap(): Record<keyof DexPermissions, PermissionDefinition & PermissionState> {
    const states = permissionStore.get('states');
    const result = {} as Record<keyof DexPermissions, PermissionDefinition & PermissionState>;

    for (const [key, def] of Object.entries(PERMISSION_MAP)) {
      const permKey = key as keyof DexPermissions;
      result[permKey] = {
        ...def,
        ...states[permKey],
      };
    }

    return result;
  }

  /**
   * Check if a permission is currently granted
   */
  isGranted(permission: keyof DexPermissions): boolean {
    const states = permissionStore.get('states');
    const restrictedMode = permissionStore.get('restrictedMode');

    // In restricted mode, only allowed permissions work
    if (restrictedMode.enabled) {
      if (!restrictedMode.allowedPermissions.includes(permission)) {
        return false;
      }
    }

    return states[permission]?.enabled ?? false;
  }

  /**
   * Check permission and log the check
   */
  check(permission: keyof DexPermissions, source: string): boolean {
    const granted = this.isGranted(permission);
    
    securityAudit.logPermissionCheck(permission, granted, source);

    if (!granted) {
      log.debug(`[PermissionLockdown] Permission denied: ${permission} (source: ${source})`);
    }

    return granted;
  }

  /**
   * Record permission usage
   */
  recordUsage(permission: keyof DexPermissions): void {
    const states = permissionStore.get('states');
    const state = states[permission];
    if (state) {
      state.usageCount++;
      state.lastUsed = Date.now();
      permissionStore.set('states', states);
    }
  }

  // -------------------------------------------------------------------------
  // PERMISSION MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Grant a permission
   */
  grant(permission: keyof DexPermissions): boolean {
    const def = PERMISSION_MAP[permission];
    if (!def) return false;

    const states = permissionStore.get('states');
    states[permission] = {
      ...states[permission],
      enabled: true,
      grantedAt: Date.now(),
      revokedAt: null,
    };
    permissionStore.set('states', states);

    securityAudit.log('permission', 'grant', `Permission granted: ${permission}`, {
      severity: def.risk === 'high' ? 'medium' : 'low',
      source: 'PermissionLockdown',
    });

    log.info(`[PermissionLockdown] Permission granted: ${permission}`);
    return true;
  }

  /**
   * Revoke a permission
   */
  revoke(permission: keyof DexPermissions): boolean {
    const def = PERMISSION_MAP[permission];
    if (!def || !def.canDisable) {
      log.warn(`[PermissionLockdown] Cannot revoke essential permission: ${permission}`);
      return false;
    }

    const states = permissionStore.get('states');
    states[permission] = {
      ...states[permission],
      enabled: false,
      revokedAt: Date.now(),
    };
    permissionStore.set('states', states);

    securityAudit.log('permission', 'revoke', `Permission revoked: ${permission}`, {
      severity: 'low',
      source: 'PermissionLockdown',
    });

    log.info(`[PermissionLockdown] Permission revoked: ${permission}`);
    return true;
  }

  /**
   * Get degraded features for current permission state
   */
  getDegradedFeatures(): string[] {
    const states = permissionStore.get('states');
    const degraded: string[] = [];

    for (const [key, state] of Object.entries(states)) {
      if (!state.enabled) {
        const def = PERMISSION_MAP[key as keyof DexPermissions];
        if (def) {
          degraded.push(...def.degradedFeatures);
        }
      }
    }

    return [...new Set(degraded)];
  }

  // -------------------------------------------------------------------------
  // RESTRICTED MODE
  // -------------------------------------------------------------------------

  /**
   * Enable restricted mode
   */
  enableRestrictedMode(allowedPermissions?: (keyof DexPermissions)[], reason?: string): void {
    const config: RestrictedModeConfig = {
      enabled: true,
      allowedPermissions: allowedPermissions ?? ['openApps', 'adjustVolume', 'network'],
      reason,
      activatedAt: Date.now(),
    };
    permissionStore.set('restrictedMode', config);

    securityAudit.log('permission', 'restricted-mode-enabled', `Restricted mode enabled: ${reason ?? 'user requested'}`, {
      severity: 'medium',
      source: 'PermissionLockdown',
      metadata: { allowedPermissions: config.allowedPermissions },
    });

    log.info(`[PermissionLockdown] Restricted mode enabled`);
  }

  /**
   * Disable restricted mode
   */
  disableRestrictedMode(): void {
    permissionStore.set('restrictedMode.enabled', false);

    securityAudit.log('permission', 'restricted-mode-disabled', 'Restricted mode disabled', {
      severity: 'low',
      source: 'PermissionLockdown',
    });

    log.info(`[PermissionLockdown] Restricted mode disabled`);
  }

  /**
   * Check if restricted mode is active
   */
  isRestrictedMode(): boolean {
    return permissionStore.get('restrictedMode').enabled;
  }

  /**
   * Get restricted mode configuration
   */
  getRestrictedModeConfig(): RestrictedModeConfig {
    return permissionStore.get('restrictedMode');
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  /**
   * Get permission statistics
   */
  getStatistics(): {
    total: number;
    enabled: number;
    highRisk: number;
    unused: number;
    mostUsed: { permission: keyof DexPermissions; count: number } | null;
  } {
    const states = permissionStore.get('states');
    let enabled = 0;
    let highRisk = 0;
    let unused = 0;
    let mostUsed: { permission: keyof DexPermissions; count: number } | null = null;

    for (const [key, state] of Object.entries(states)) {
      const permKey = key as keyof DexPermissions;
      const def = PERMISSION_MAP[permKey];

      if (state.enabled) {
        enabled++;
        if (def?.risk === 'high') highRisk++;
      }

      if (state.usageCount === 0) unused++;

      if (!mostUsed || state.usageCount > mostUsed.count) {
        mostUsed = { permission: permKey, count: state.usageCount };
      }
    }

    return {
      total: Object.keys(PERMISSION_MAP).length,
      enabled,
      highRisk,
      unused,
      mostUsed: mostUsed?.count ? mostUsed : null,
    };
  }

  /**
   * Get all permission states as DexPermissions object
   */
  getPermissionsObject(): DexPermissions {
    const states = permissionStore.get('states');
    return {
      openApps: states.openApps?.enabled ?? false,
      closeApps: states.closeApps?.enabled ?? false,
      runCommands: states.runCommands?.enabled ?? false,
      adjustVolume: states.adjustVolume?.enabled ?? false,
      fileSystem: states.fileSystem?.enabled ?? false,
      network: states.network?.enabled ?? false,
    };
  }
}

// Export singleton instance
export const permissionLockdown = new PermissionLockdownClass();
