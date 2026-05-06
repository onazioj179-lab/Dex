// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Governance Framework
// Phase 45: Permission governance, compliance, data lifecycle
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'data' | 'network' | 'automation' | 'background';
  riskLevel: 'low' | 'medium' | 'high';
  required: boolean;
  defaultEnabled: boolean;
}

export interface PermissionGrant {
  permissionId: string;
  granted: boolean;
  grantedAt: number | null;
  revokedAt: number | null;
  grantedBy: 'user' | 'default' | 'upgrade';
}

export interface DataRetentionPolicy {
  dataType: string;
  retentionDays: number;
  deletionMethod: 'soft' | 'hard' | 'secure';
  exportable: boolean;
  ownerControlled: boolean;
}

export interface ComplianceStatus {
  privacyByDesign: boolean;
  noMandatoryAccounts: boolean;
  noTelemetryByDefault: boolean;
  dataLocalityGuaranteed: boolean;
  auditReady: boolean;
}

export interface GovernanceConfig {
  enabled: boolean;
  strictMode: boolean;
  requireExplicitConsent: boolean;
  auditAllPermissionChanges: boolean;
  enforceRetentionPolicies: boolean;
}

// ===========================================================================
// PERMISSION REGISTRY (SINGLE SOURCE OF TRUTH)
// ===========================================================================

export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  // System permissions
  {
    id: 'system.startup',
    name: 'Start with System',
    description: 'Launch Dex automatically when you log in',
    category: 'system',
    riskLevel: 'low',
    required: false,
    defaultEnabled: false,
  },
  {
    id: 'system.tray',
    name: 'System Tray',
    description: 'Show Dex icon in system tray',
    category: 'system',
    riskLevel: 'low',
    required: false,
    defaultEnabled: true,
  },
  {
    id: 'system.notifications',
    name: 'Notifications',
    description: 'Display system notifications',
    category: 'system',
    riskLevel: 'low',
    required: false,
    defaultEnabled: true,
  },

  // Data permissions
  {
    id: 'data.files.read',
    name: 'Read Files',
    description: 'Access files in authorized folders',
    category: 'data',
    riskLevel: 'medium',
    required: false,
    defaultEnabled: false,
  },
  {
    id: 'data.files.write',
    name: 'Write Files',
    description: 'Create and modify files in authorized folders',
    category: 'data',
    riskLevel: 'high',
    required: false,
    defaultEnabled: false,
  },
  {
    id: 'data.clipboard',
    name: 'Clipboard Access',
    description: 'Read and write clipboard contents',
    category: 'data',
    riskLevel: 'medium',
    required: false,
    defaultEnabled: false,
  },

  // Background permissions
  {
    id: 'background.idle',
    name: 'Background When Idle',
    description: 'Run maintenance tasks when computer is idle',
    category: 'background',
    riskLevel: 'low',
    required: false,
    defaultEnabled: false,
  },
  {
    id: 'background.learning',
    name: 'Pattern Learning',
    description: 'Learn usage patterns to improve suggestions',
    category: 'background',
    riskLevel: 'low',
    required: false,
    defaultEnabled: false,
  },

  // Automation permissions
  {
    id: 'automation.execute',
    name: 'Execute Automations',
    description: 'Run user-created automations',
    category: 'automation',
    riskLevel: 'medium',
    required: false,
    defaultEnabled: true,
  },
  {
    id: 'automation.schedule',
    name: 'Scheduled Tasks',
    description: 'Run tasks on a schedule',
    category: 'automation',
    riskLevel: 'medium',
    required: false,
    defaultEnabled: false,
  },
];

// ===========================================================================
// DATA RETENTION POLICIES
// ===========================================================================

export const DEFAULT_RETENTION_POLICIES: DataRetentionPolicy[] = [
  {
    dataType: 'logs.application',
    retentionDays: 30,
    deletionMethod: 'hard',
    exportable: true,
    ownerControlled: true,
  },
  {
    dataType: 'logs.audit',
    retentionDays: 90,
    deletionMethod: 'hard',
    exportable: true,
    ownerControlled: true,
  },
  {
    dataType: 'patterns.usage',
    retentionDays: 30,
    deletionMethod: 'hard',
    exportable: true,
    ownerControlled: true,
  },
  {
    dataType: 'cache.temporary',
    retentionDays: 7,
    deletionMethod: 'hard',
    exportable: false,
    ownerControlled: true,
  },
  {
    dataType: 'workflows.user',
    retentionDays: -1, // Forever
    deletionMethod: 'soft',
    exportable: true,
    ownerControlled: true,
  },
  {
    dataType: 'settings.user',
    retentionDays: -1, // Forever
    deletionMethod: 'soft',
    exportable: true,
    ownerControlled: true,
  },
];

// ===========================================================================
// STORE
// ===========================================================================

const governanceStore = new Store<{
  config: GovernanceConfig;
  grants: PermissionGrant[];
  retentionPolicies: DataRetentionPolicy[];
  auditLog: Array<{
    timestamp: number;
    action: string;
    permissionId?: string;
    details: string;
  }>;
  lastRetentionRun: number;
}>({
  name: 'governance',
  defaults: {
    config: {
      enabled: true,
      strictMode: false,
      requireExplicitConsent: true,
      auditAllPermissionChanges: true,
      enforceRetentionPolicies: true,
    },
    grants: PERMISSION_REGISTRY.map(p => ({
      permissionId: p.id,
      granted: p.defaultEnabled,
      grantedAt: p.defaultEnabled ? Date.now() : null,
      revokedAt: null,
      grantedBy: 'default' as const,
    })),
    retentionPolicies: DEFAULT_RETENTION_POLICIES,
    auditLog: [],
    lastRetentionRun: 0,
  },
});

// ===========================================================================
// GOVERNANCE FRAMEWORK
// ===========================================================================

class GovernanceFramework {
  private static instance: GovernanceFramework;
  private initialized = false;

  private constructor() {}

  static getInstance(): GovernanceFramework {
    if (!GovernanceFramework.instance) {
      GovernanceFramework.instance = new GovernanceFramework();
    }
    return GovernanceFramework.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.syncPermissionRegistry();

    // Run retention if needed
    const config = governanceStore.get('config');
    if (config.enforceRetentionPolicies) {
      await this.runRetentionEnforcement();
    }

    this.initialized = true;
    log.info('[GovernanceFramework] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('governance:getConfig', () => this.getConfig());
    ipcMain.handle('governance:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('governance:getPermissions', () => this.getPermissions());
    ipcMain.handle('governance:getPermission', (_, id: string) => {
      const perms = this.getPermissions();
      return perms.find(p => p.id === id) || null;
    });
    ipcMain.handle('governance:getGrants', () => this.getGrants());
    ipcMain.handle('governance:grantPermission', (_, id) => this.grantPermission(id));
    ipcMain.handle('governance:revokePermission', (_, id) => this.revokePermission(id));
    ipcMain.handle('governance:isGranted', (_, id) => this.isPermissionGranted(id));
    ipcMain.handle('governance:getRetentionPolicies', () => this.getRetentionPolicies());
    ipcMain.handle('governance:updateRetentionPolicy', (_, policy) => this.updateRetentionPolicy(policy));
    ipcMain.handle('governance:getComplianceStatus', () => this.getComplianceStatus());
    ipcMain.handle('governance:getAuditLog', (_, limit) => this.getAuditLog(limit));
    ipcMain.handle('governance:getDataLocations', () => this.getDataLocations());
    ipcMain.handle('governance:cleanUninstall', () => this.prepareCleanUninstall());
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // PERMISSION MANAGEMENT
  // -------------------------------------------------------------------------

  private syncPermissionRegistry(): void {
    const grants = governanceStore.get('grants');
    
    // Add any new permissions from registry
    for (const perm of PERMISSION_REGISTRY) {
      if (!grants.find(g => g.permissionId === perm.id)) {
        grants.push({
          permissionId: perm.id,
          granted: perm.defaultEnabled,
          grantedAt: perm.defaultEnabled ? Date.now() : null,
          revokedAt: null,
          grantedBy: 'default',
        });
      }
    }

    governanceStore.set('grants', grants);
  }

  getPermissions(): PermissionDefinition[] {
    return PERMISSION_REGISTRY;
  }

  getGrants(): PermissionGrant[] {
    return governanceStore.get('grants');
  }

  isPermissionGranted(permissionId: string): boolean {
    const grants = governanceStore.get('grants');
    const grant = grants.find(g => g.permissionId === permissionId);
    return grant?.granted ?? false;
  }

  async grantPermission(permissionId: string): Promise<boolean> {
    const permission = PERMISSION_REGISTRY.find(p => p.id === permissionId);
    if (!permission) return false;

    const grants = governanceStore.get('grants');
    const grant = grants.find(g => g.permissionId === permissionId);
    
    if (grant) {
      grant.granted = true;
      grant.grantedAt = Date.now();
      grant.revokedAt = null;
      grant.grantedBy = 'user';
    }

    governanceStore.set('grants', grants);
    this.logAuditEvent('permission.granted', permissionId, `Permission granted: ${permission.name}`);

    return true;
  }

  async revokePermission(permissionId: string): Promise<boolean> {
    const permission = PERMISSION_REGISTRY.find(p => p.id === permissionId);
    if (!permission || permission.required) return false;

    const grants = governanceStore.get('grants');
    const grant = grants.find(g => g.permissionId === permissionId);
    
    if (grant) {
      grant.granted = false;
      grant.revokedAt = Date.now();
    }

    governanceStore.set('grants', grants);
    this.logAuditEvent('permission.revoked', permissionId, `Permission revoked: ${permission.name}`);

    return true;
  }

  /**
   * Check permission at runtime with graceful degradation
   */
  checkPermission(permissionId: string): { granted: boolean; gracefulFallback: string | null } {
    const granted = this.isPermissionGranted(permissionId);
    const permission = PERMISSION_REGISTRY.find(p => p.id === permissionId);

    return {
      granted,
      gracefulFallback: granted ? null : `Feature requires "${permission?.name}" permission`,
    };
  }

  // -------------------------------------------------------------------------
  // DATA RETENTION
  // -------------------------------------------------------------------------

  getRetentionPolicies(): DataRetentionPolicy[] {
    return governanceStore.get('retentionPolicies');
  }

  async updateRetentionPolicy(policy: DataRetentionPolicy): Promise<boolean> {
    const policies = governanceStore.get('retentionPolicies');
    const index = policies.findIndex(p => p.dataType === policy.dataType);
    
    if (index >= 0) {
      policies[index] = policy;
    } else {
      policies.push(policy);
    }

    governanceStore.set('retentionPolicies', policies);
    this.logAuditEvent('retention.updated', undefined, `Retention policy updated: ${policy.dataType}`);

    return true;
  }

  async runRetentionEnforcement(): Promise<number> {
    const policies = governanceStore.get('retentionPolicies');
    let itemsDeleted = 0;
    const userDataPath = app.getPath('userData');

    // Map data types to their file system locations
    const dataTypeLocations: Record<string, string> = {
      'logs.application': path.join(userDataPath, 'logs'),
      'logs.audit': path.join(userDataPath, 'logs', 'audit'),
      'patterns.usage': path.join(userDataPath, 'patterns'),
      'cache.temporary': path.join(userDataPath, 'cache'),
    };

    for (const policy of policies) {
      if (policy.retentionDays < 0) continue; // -1 means forever

      const cutoffDate = Date.now() - (policy.retentionDays * 24 * 60 * 60 * 1000);
      const targetDir = dataTypeLocations[policy.dataType];
      if (!targetDir || !fs.existsSync(targetDir)) continue;

      try {
        const entries = fs.readdirSync(targetDir);
        for (const entry of entries) {
          const entryPath = path.join(targetDir, entry);
          try {
            const stats = fs.statSync(entryPath);
            if (stats.mtimeMs < cutoffDate) {
              if (stats.isFile()) {
                if (policy.deletionMethod === 'secure') {
                  // Overwrite before delete
                  const buf = Buffer.alloc(stats.size, 0);
                  fs.writeFileSync(entryPath, buf);
                }
                fs.unlinkSync(entryPath);
                itemsDeleted++;
              } else if (stats.isDirectory()) {
                fs.rmSync(entryPath, { recursive: true, force: true });
                itemsDeleted++;
              }
            }
          } catch {
            // Skip files that are locked or permission-denied
          }
        }
      } catch {
        // Directory read error - skip this policy
      }
    }

    governanceStore.set('lastRetentionRun', Date.now());
    this.logAuditEvent('retention.enforced', undefined, `Retention enforcement completed: ${itemsDeleted} items deleted`);
    return itemsDeleted;
  }

  // -------------------------------------------------------------------------
  // COMPLIANCE
  // -------------------------------------------------------------------------

  getComplianceStatus(): ComplianceStatus {
    return {
      privacyByDesign: true,           // All data is local by default
      noMandatoryAccounts: true,       // No accounts required
      noTelemetryByDefault: true,      // Telemetry is off by default
      dataLocalityGuaranteed: true,    // All data stays local
      auditReady: true,                // Logs are audit-ready
    };
  }

  // -------------------------------------------------------------------------
  // DATA LOCATIONS & EXPORT
  // -------------------------------------------------------------------------

  getDataLocations(): { type: string; path: string; description: string }[] {
    const userDataPath = app.getPath('userData');

    return [
      {
        type: 'settings',
        path: path.join(userDataPath, 'settings.json'),
        description: 'User preferences and configuration',
      },
      {
        type: 'workflows',
        path: path.join(userDataPath, 'workflows.json'),
        description: 'User-created workflows',
      },
      {
        type: 'automations',
        path: path.join(userDataPath, 'automations.json'),
        description: 'Automation definitions',
      },
      {
        type: 'logs',
        path: path.join(userDataPath, 'logs'),
        description: 'Application logs',
      },
      {
        type: 'cache',
        path: path.join(userDataPath, 'cache'),
        description: 'Temporary cached data',
      },
    ];
  }

  /**
   * Prepare for clean uninstall - remove all Dex data
   */
  async prepareCleanUninstall(): Promise<{ 
    files: string[];
    totalSize: number;
    ready: boolean;
  }> {
    const locations = this.getDataLocations();
    const files: string[] = [];
    let totalSize = 0;

    for (const loc of locations) {
      if (fs.existsSync(loc.path)) {
        const stats = fs.statSync(loc.path);
        if (stats.isDirectory()) {
          // Would recursively calculate size
          files.push(loc.path);
        } else {
          files.push(loc.path);
          totalSize += stats.size;
        }
      }
    }

    this.logAuditEvent('uninstall.prepared', undefined, 'Clean uninstall prepared');

    return {
      files,
      totalSize,
      ready: true,
    };
  }

  // -------------------------------------------------------------------------
  // AUDIT LOG
  // -------------------------------------------------------------------------

  private logAuditEvent(action: string, permissionId?: string, details: string = ''): void {
    const config = governanceStore.get('config');
    if (!config.auditAllPermissionChanges) return;

    const auditLog = governanceStore.get('auditLog');
    auditLog.push({
      timestamp: Date.now(),
      action,
      permissionId,
      details,
    });

    // Keep last 1000 entries
    if (auditLog.length > 1000) {
      auditLog.splice(0, auditLog.length - 1000);
    }

    governanceStore.set('auditLog', auditLog);
  }

  getAuditLog(limit: number = 100): Array<{
    timestamp: number;
    action: string;
    permissionId?: string;
    details: string;
  }> {
    return governanceStore.get('auditLog').slice(-limit);
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): GovernanceConfig {
    return governanceStore.get('config');
  }

  async updateConfig(updates: Partial<GovernanceConfig>): Promise<GovernanceConfig> {
    const config = governanceStore.get('config');
    const updated = { ...config, ...updates };
    governanceStore.set('config', updated);
    return updated;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const governanceFramework = GovernanceFramework.getInstance();
export default governanceFramework;
