// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Permission Manager
// Handles permission checking and management
// ===========================================================================

import { DexPermissions } from '../../shared/types';
import { DataStore } from '../store/DataStore';

export const PERMISSION_DESCRIPTIONS: Record<keyof DexPermissions, { name: string; description: string; risk: 'low' | 'medium' | 'high' }> = {
  openApps: {
    name: 'Open Applications',
    description: 'Allow Dex to open applications and URLs',
    risk: 'low',
  },
  closeApps: {
    name: 'Close Applications',
    description: 'Allow Dex to close or kill running applications',
    risk: 'medium',
  },
  runCommands: {
    name: 'Run Commands',
    description: 'Allow Dex to execute terminal commands and scripts',
    risk: 'high',
  },
  adjustVolume: {
    name: 'Adjust Volume',
    description: 'Allow Dex to control system volume',
    risk: 'low',
  },
  fileSystem: {
    name: 'File System Access',
    description: 'Allow Dex to open files and folders',
    risk: 'medium',
  },
  network: {
    name: 'Network Monitoring',
    description: 'Allow Dex to monitor network connection status',
    risk: 'low',
  },
};

export class PermissionManager {
  private dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  getAllPermissions(): { permissions: DexPermissions; descriptions: typeof PERMISSION_DESCRIPTIONS } {
    return {
      permissions: this.dataStore.getPermissions(),
      descriptions: PERMISSION_DESCRIPTIONS,
    };
  }

  hasPermission(permission: keyof DexPermissions): boolean {
    const permissions = this.dataStore.getPermissions();
    return permissions[permission] ?? false;
  }

  async grantPermission(permission: keyof DexPermissions): Promise<void> {
    await this.dataStore.setPermission(permission, true);
  }

  async revokePermission(permission: keyof DexPermissions): Promise<void> {
    await this.dataStore.setPermission(permission, false);
  }
}
