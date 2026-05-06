// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Extension Framework (Future-Safe)
// Phase 18: Post-Release Evolution & Ecosystem Readiness
// Controlled extension model with strict sandboxing
// NOTE: This is a foundation for future extensibility, not actively shipped
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ===========================================================================
// TYPES
// ===========================================================================

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: ExtensionPermission[];
  entryPoint: string;
  minDexVersion?: string;
  maxDexVersion?: string;
}

export type ExtensionPermission =
  | 'operations:read'      // Read operation definitions
  | 'operations:write'     // Create new operations
  | 'actions:read'         // Read action definitions
  | 'actions:execute'      // Execute actions
  | 'files:read'           // Read files (sandboxed)
  | 'files:write'          // Write files (sandboxed)
  | 'ui:panel'             // Show custom UI panel
  | 'network:http';        // Make HTTP requests (requires approval)

// Permissions that are NEVER allowed for extensions
export const FORBIDDEN_PERMISSIONS = [
  'encryption:*',          // No access to encryption keys
  'system:*',              // No system-level control
  'permissions:*',         // No permission modification
  'core:*',                // No core system access
] as const;

export interface InstalledExtension {
  manifest: ExtensionManifest;
  installedAt: number;
  enabled: boolean;
  verified: boolean;
  sandboxPath: string;
  usageCount: number;
  lastUsed?: number;
}

export interface ExtensionStatus {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  verified: boolean;
  permissions: ExtensionPermission[];
  permissionsGranted: boolean;
}

// ===========================================================================
// STORE
// ===========================================================================

const extensionStore = new Store<{
  extensions: Record<string, InstalledExtension>;
  grantedPermissions: Record<string, ExtensionPermission[]>;
  enabled: boolean;        // Master switch for extension system
}>({
  name: 'dex-extensions',
  defaults: {
    extensions: {},
    grantedPermissions: {},
    enabled: true,         // Enabled by default
  },
});

// ===========================================================================
// EXTENSION FRAMEWORK CLASS
// ===========================================================================

class ExtensionFrameworkClass {
  private sandboxRoot: string;
  private loadedExtensions: Map<string, any> = new Map();

  constructor() {
    this.sandboxRoot = path.join(app.getPath('userData'), 'extensions');
    this.ensureSandboxDir();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Check if extension system is enabled
    ipcMain.handle('extensions:isEnabled', () => {
      return extensionStore.get('enabled');
    });

    // Get all installed extensions
    ipcMain.handle('extensions:getAll', () => {
      return this.getAllExtensions();
    });

    // Get extension status
    ipcMain.handle('extensions:getStatus', (_, extensionId: string) => {
      return this.getExtensionStatus(extensionId);
    });

    // Enable extension system (requires user action)
    ipcMain.handle('extensions:enableSystem', () => {
      return this.enableExtensionSystem();
    });

    // Disable extension system
    ipcMain.handle('extensions:disableSystem', () => {
      extensionStore.set('enabled', false);
      this.unloadAllExtensions();
      return true;
    });

    // Enable specific extension
    ipcMain.handle('extensions:enable', (_, extensionId: string) => {
      return this.enableExtension(extensionId);
    });

    // Disable specific extension
    ipcMain.handle('extensions:disable', (_, extensionId: string) => {
      return this.disableExtension(extensionId);
    });

    // Grant permissions to extension
    ipcMain.handle('extensions:grantPermissions', (_, extensionId: string, permissions: ExtensionPermission[]) => {
      return this.grantPermissions(extensionId, permissions);
    });

    // Revoke permissions from extension
    ipcMain.handle('extensions:revokePermissions', (_, extensionId: string) => {
      return this.revokePermissions(extensionId);
    });

    // Uninstall extension
    ipcMain.handle('extensions:uninstall', (_, extensionId: string) => {
      return this.uninstallExtension(extensionId);
    });

    log.info('[ExtensionFramework] IPC handlers registered');
  }

  // -------------------------------------------------------------------------
  // EXTENSION SYSTEM CONTROL
  // -------------------------------------------------------------------------

  /**
   * Enable the extension system (opt-in)
   */
  enableExtensionSystem(): boolean {
    log.info('[ExtensionFramework] Extension system enabled');
    extensionStore.set('enabled', true);
    return true;
  }

  /**
   * Check if a permission is allowed for extensions
   */
  isPermissionAllowed(permission: string): boolean {
    for (const forbidden of FORBIDDEN_PERMISSIONS) {
      if (forbidden.endsWith('*')) {
        const prefix = forbidden.slice(0, -1);
        if (permission.startsWith(prefix)) {
          return false;
        }
      } else if (permission === forbidden) {
        return false;
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // EXTENSION MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Get all installed extensions
   */
  getAllExtensions(): ExtensionStatus[] {
    const extensions = extensionStore.get('extensions');
    const granted = extensionStore.get('grantedPermissions');

    return Object.values(extensions).map(ext => ({
      id: ext.manifest.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      enabled: ext.enabled,
      verified: ext.verified,
      permissions: ext.manifest.permissions,
      permissionsGranted: (granted[ext.manifest.id] ?? []).length > 0,
    }));
  }

  /**
   * Get status of a specific extension
   */
  getExtensionStatus(extensionId: string): ExtensionStatus | null {
    const extensions = extensionStore.get('extensions');
    const ext = extensions[extensionId];
    if (!ext) return null;

    const granted = extensionStore.get('grantedPermissions');

    return {
      id: ext.manifest.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      enabled: ext.enabled,
      verified: ext.verified,
      permissions: ext.manifest.permissions,
      permissionsGranted: (granted[ext.manifest.id] ?? []).length > 0,
    };
  }

  /**
   * Enable an extension
   */
  enableExtension(extensionId: string): boolean {
    if (!extensionStore.get('enabled')) {
      log.warn('[ExtensionFramework] Cannot enable extension - system disabled');
      return false;
    }

    const extensions = extensionStore.get('extensions');
    if (!extensions[extensionId]) {
      return false;
    }

    extensions[extensionId].enabled = true;
    extensionStore.set('extensions', extensions);

    log.info(`[ExtensionFramework] Extension enabled: ${extensionId}`);
    return true;
  }

  /**
   * Disable an extension
   */
  disableExtension(extensionId: string): boolean {
    const extensions = extensionStore.get('extensions');
    if (!extensions[extensionId]) {
      return false;
    }

    extensions[extensionId].enabled = false;
    extensionStore.set('extensions', extensions);

    // Unload if loaded
    this.loadedExtensions.delete(extensionId);

    log.info(`[ExtensionFramework] Extension disabled: ${extensionId}`);
    return true;
  }

  /**
   * Grant permissions to an extension
   */
  grantPermissions(extensionId: string, permissions: ExtensionPermission[]): boolean {
    const extensions = extensionStore.get('extensions');
    if (!extensions[extensionId]) {
      return false;
    }

    // Filter out forbidden permissions
    const allowedPermissions = permissions.filter(p => this.isPermissionAllowed(p));
    
    // Only grant permissions that the extension requested
    const requestedPermissions = extensions[extensionId].manifest.permissions;
    const finalPermissions = allowedPermissions.filter(p => requestedPermissions.includes(p));

    const granted = extensionStore.get('grantedPermissions');
    granted[extensionId] = finalPermissions;
    extensionStore.set('grantedPermissions', granted);

    log.info(`[ExtensionFramework] Permissions granted to ${extensionId}:`, finalPermissions);
    return true;
  }

  /**
   * Revoke all permissions from an extension
   */
  revokePermissions(extensionId: string): boolean {
    const granted = extensionStore.get('grantedPermissions');
    delete granted[extensionId];
    extensionStore.set('grantedPermissions', granted);

    log.info(`[ExtensionFramework] Permissions revoked from: ${extensionId}`);
    return true;
  }

  /**
   * Uninstall an extension
   */
  async uninstallExtension(extensionId: string): Promise<boolean> {
    try {
      // Disable first
      this.disableExtension(extensionId);

      // Revoke permissions
      this.revokePermissions(extensionId);

      // Remove from store
      const extensions = extensionStore.get('extensions');
      const ext = extensions[extensionId];
      delete extensions[extensionId];
      extensionStore.set('extensions', extensions);

      // Remove sandbox directory
      if (ext?.sandboxPath && fs.existsSync(ext.sandboxPath)) {
        fs.rmSync(ext.sandboxPath, { recursive: true, force: true });
      }

      log.info(`[ExtensionFramework] Extension uninstalled: ${extensionId}`);
      return true;
    } catch (error) {
      log.error(`[ExtensionFramework] Failed to uninstall extension:`, error);
      return false;
    }
  }

  /**
   * Check if extension has a specific permission
   */
  hasPermission(extensionId: string, permission: ExtensionPermission): boolean {
    const granted = extensionStore.get('grantedPermissions');
    return (granted[extensionId] ?? []).includes(permission);
  }

  // -------------------------------------------------------------------------
  // INTERNAL
  // -------------------------------------------------------------------------

  private ensureSandboxDir(): void {
    if (!fs.existsSync(this.sandboxRoot)) {
      fs.mkdirSync(this.sandboxRoot, { recursive: true });
    }
  }

  private unloadAllExtensions(): void {
    this.loadedExtensions.clear();
    log.info('[ExtensionFramework] All extensions unloaded');
  }
}

// Export singleton instance
export const extensionFramework = new ExtensionFrameworkClass();
