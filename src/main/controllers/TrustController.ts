// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Trust Controller
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// IPC handlers for Trust & Transparency Panel
// ===========================================================================

import { ipcMain, app } from 'electron';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import { securityAudit, SecurityReport } from '../core/SecurityAudit';
import { permissionLockdown, PERMISSION_MAP, PermissionDefinition } from '../core/PermissionLockdown';
import { architectureContract } from '../core/ArchitectureContract';
import { dataIntegrity, IntegrityStatus } from '../core/DataIntegrity';
import { performanceGuardian, PerformanceReport } from '../core/PerformanceGuardian';
import { humanErrors } from '../core/HumanErrors';
import { encryptionService } from '../core/EncryptionService';
import { backgroundTasks } from '../core/BackgroundTasks';

// ===========================================================================
// TYPES
// ===========================================================================

export interface TrustStatus {
  // Encryption
  encryption: {
    enabled: boolean;
    keySource: 'password' | 'system' | 'none';
    encryptedCategories: string[];
    lastKeyRotation: number | null;
  };

  // Permissions
  permissions: {
    total: number;
    enabled: number;
    highRisk: number;
    restrictedMode: boolean;
  };

  // Background activity
  activity: {
    backgroundTasksRunning: number;
    pendingTasks: number;
    lastActivity: number | null;
    isIdle: boolean;
  };

  // System actions
  recentActions: Array<{
    timestamp: number;
    action: string;
    success: boolean;
  }>;

  // Data location
  dataLocations: {
    userData: string;
    logs: string;
    backups: string;
  };

  // Health
  health: {
    overall: 'excellent' | 'good' | 'degraded' | 'critical';
    dataIntegrity: boolean;
    performanceHealth: string;
    lastSecurityAudit: number | null;
  };
}

export interface FullTransparencyReport {
  generatedAt: number;
  appVersion: string;
  trust: TrustStatus;
  security: SecurityReport;
  performance: PerformanceReport;
  permissions: Record<string, PermissionDefinition & { enabled: boolean }>;
  dataIntegrity: IntegrityStatus[];
  architecture: {
    schemaVersion: number;
    dataFormatVersion: number;
    migrationHistory: Array<{ from: number; to: number; timestamp: number }>;
  };
}

// ===========================================================================
// TRUST CONTROLLER CLASS
// ===========================================================================

class TrustControllerClass {
  private lastActivityTimestamp: number = Date.now();
  private recentActions: Array<{ timestamp: number; action: string; success: boolean }> = [];
  private maxRecentActions = 20;

  constructor() {
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get trust status
    ipcMain.handle('trust:getStatus', async () => {
      return this.getStatus();
    });

    // Get full transparency report
    ipcMain.handle('trust:getFullReport', async () => {
      return this.getFullReport();
    });

    // Get permission map
    ipcMain.handle('trust:getPermissions', async () => {
      return permissionLockdown.getPermissionMap();
    });

    // Grant permission
    ipcMain.handle('trust:grantPermission', async (_, permission: string) => {
      return permissionLockdown.grant(permission as any);
    });

    // Revoke permission
    ipcMain.handle('trust:revokePermission', async (_, permission: string) => {
      return permissionLockdown.revoke(permission as any);
    });

    // Enable restricted mode
    ipcMain.handle('trust:enableRestrictedMode', async (_, allowedPermissions?: string[]) => {
      permissionLockdown.enableRestrictedMode(allowedPermissions as any);
      return true;
    });

    // Disable restricted mode
    ipcMain.handle('trust:disableRestrictedMode', async () => {
      permissionLockdown.disableRestrictedMode();
      return true;
    });

    // Run security audit
    ipcMain.handle('trust:runSecurityAudit', async () => {
      return await securityAudit.performFullAudit();
    });

    // Get recent audit entries
    ipcMain.handle('trust:getAuditLog', async (_, count?: number, category?: string) => {
      return securityAudit.getRecentEntries(count ?? 100, category as any);
    });

    // Verify data integrity
    ipcMain.handle('trust:verifyIntegrity', async () => {
      return await dataIntegrity.verifyAllFiles();
    });

    // Get performance report
    ipcMain.handle('trust:getPerformance', async () => {
      return performanceGuardian.getReport();
    });

    // Get data locations
    ipcMain.handle('trust:getDataLocations', async () => {
      return this.getDataLocations();
    });

    // Get human-friendly error
    ipcMain.handle('trust:getHumanError', async (_, code: string) => {
      return humanErrors.get(code);
    });

    // Get architecture info
    ipcMain.handle('trust:getArchitecture', async () => {
      return {
        version: architectureContract.getVersionInfo(),
        schemas: architectureContract.getSchemas(),
        ipcContracts: architectureContract.getIPCContracts(),
      };
    });

    log.info('[TrustController] IPC handlers registered');
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  /**
   * Get trust status for UI
   */
  getStatus(): TrustStatus {
    const encryptionConfig = encryptionService.getConfig();
    const permStats = permissionLockdown.getStatistics();
    const taskStats = backgroundTasks.getStatus();
    const perfStatus = performanceGuardian.getStatus();
    const locations = this.getDataLocations();

    return {
      encryption: {
        enabled: encryptionConfig.enabled,
        keySource: encryptionConfig.enabled ? encryptionConfig.keySource : 'none',
        encryptedCategories: this.getEncryptedCategories(encryptionConfig),
        lastKeyRotation: encryptionConfig.lastKeyRotation ?? null,
      },

      permissions: {
        total: permStats.total,
        enabled: permStats.enabled,
        highRisk: permStats.highRisk,
        restrictedMode: permissionLockdown.isRestrictedMode(),
      },

      activity: {
        backgroundTasksRunning: taskStats.running,
        pendingTasks: taskStats.queued,
        lastActivity: this.lastActivityTimestamp,
        isIdle: taskStats.running === 0,
      },

      recentActions: this.recentActions.slice(-10),

      dataLocations: locations,

      health: {
        overall: perfStatus.health,
        dataIntegrity: true, // Will be updated by integrity checks
        performanceHealth: perfStatus.health,
        lastSecurityAudit: null, // Will be updated after audits
      },
    };
  }

  /**
   * Get full transparency report
   */
  async getFullReport(): Promise<FullTransparencyReport> {
    const trust = this.getStatus();
    const security = await securityAudit.performFullAudit();
    const performance = performanceGuardian.getReport();
    const permissions = permissionLockdown.getPermissionMap();
    const integrity = await dataIntegrity.verifyAllFiles();
    const architecture = architectureContract.getVersionInfo();
    const migrationHistory = architectureContract.getMigrationHistory();

    return {
      generatedAt: Date.now(),
      appVersion: app.getVersion(),
      trust,
      security,
      performance,
      permissions,
      dataIntegrity: integrity,
      architecture: {
        schemaVersion: architecture.schemaVersion,
        dataFormatVersion: architecture.dataFormatVersion,
        migrationHistory,
      },
    };
  }

  // -------------------------------------------------------------------------
  // ACTIVITY TRACKING
  // -------------------------------------------------------------------------

  /**
   * Record a system action for transparency
   */
  recordAction(action: string, success: boolean): void {
    this.lastActivityTimestamp = Date.now();
    
    this.recentActions.push({
      timestamp: Date.now(),
      action,
      success,
    });

    // Trim old actions
    if (this.recentActions.length > this.maxRecentActions) {
      this.recentActions.shift();
    }

    // Also log to security audit
    securityAudit.log('system', action, '', {
      severity: success ? 'info' : 'low',
      success,
    });
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private getDataLocations(): { userData: string; logs: string; backups: string } {
    const userData = app.getPath('userData');
    return {
      userData,
      logs: path.join(userData, 'logs'),
      backups: path.join(userData, 'backups'),
    };
  }

  private getEncryptedCategories(config: any): string[] {
    const categories: string[] = [];
    if (config.encryptNotes) categories.push('Notes');
    if (config.encryptMedia) categories.push('Media');
    if (config.encryptSessions) categories.push('Sessions');
    if (config.encryptOperations) categories.push('Operations');
    return categories;
  }
}

// Export singleton instance
export const trustController = new TrustControllerClass();
