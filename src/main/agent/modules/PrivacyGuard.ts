// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Privacy Guard Module - Data Protection and Explainable AI
// Local processing, permissions, and transparent reasoning
// =============================================================================

import { ipcMain, BrowserWindow, dialog } from 'electron';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PrivacyConfig {
  mode: PrivacyMode;
  localProcessingOnly: boolean;
  dataRetentionDays: number;
  encryptLocalData: boolean;
  shareAnalytics: boolean;
  allowCloudBackup: boolean;
  requireConfirmation: ConfirmationLevel;
  auditLogging: boolean;
}

export type PrivacyMode = 'strict' | 'balanced' | 'permissive';
export type ConfirmationLevel = 'all' | 'sensitive' | 'none';

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
  granted: boolean;
  grantedAt?: number;
  expiresAt?: number;
  scope?: string[];
}

export type PermissionCategory = 
  | 'data_access'
  | 'network'
  | 'automation'
  | 'system'
  | 'integration'
  | 'learning';

export interface DataAccessLog {
  id: string;
  timestamp: number;
  component: string;
  action: string;
  dataType: string;
  purpose: string;
  approved: boolean;
  details?: Record<string, unknown>;
}

export interface ReasoningStep {
  step: number;
  description: string;
  input?: string;
  output?: string;
  confidence?: number;
  source?: string;
}

export interface ExplainableAction {
  id: string;
  action: string;
  reasoning: ReasoningStep[];
  sources: string[];
  confidence: number;
  alternatives?: Array<{ action: string; reason: string }>;
  userApproved?: boolean;
}

export interface DataExport {
  exportedAt: number;
  version: string;
  data: {
    settings: Record<string, unknown>;
    conversations: unknown[];
    preferences: Record<string, unknown>;
    automations: unknown[];
    history: unknown[];
  };
  checksum: string;
}

export interface PrivacyReport {
  generatedAt: number;
  period: { start: number; end: number };
  summary: {
    totalDataAccesses: number;
    networkRequests: number;
    automationsRun: number;
    dataShared: number;
  };
  accessByCategory: Record<string, number>;
  topDataTypes: Array<{ type: string; count: number }>;
  recommendations: string[];
}

// -----------------------------------------------------------------------------
// Privacy Guard Manager
// -----------------------------------------------------------------------------

class PrivacyGuardManager extends EventEmitter {
  private store: Store;
  private mainWindow: BrowserWindow | null = null;
  private config: PrivacyConfig;
  private permissions: Map<string, Permission> = new Map();
  private accessLog: DataAccessLog[] = [];
  private pendingApprovals: Map<string, ExplainableAction> = new Map();
  private encryptionKey: Buffer | null = null;
  private auditCleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();

    this.store = new Store({
      name: 'dex-privacy-guard',
      defaults: {
        config: {
          mode: 'balanced',
          localProcessingOnly: true,
          dataRetentionDays: 90,
          encryptLocalData: false,
          shareAnalytics: false,
          allowCloudBackup: false,
          requireConfirmation: 'sensitive',
          auditLogging: true,
        },
        permissions: [],
        accessLog: [],
      },
    }) as unknown as Store;

    this.config = this.store.get('config') as PrivacyConfig;
    this.loadData();
    this.initializeDefaultPermissions();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPCHandlers();
    this.startAuditCleanup();
    this.emit('initialized');
  }

  private loadData(): void {
    const permissions = this.store.get('permissions', []) as Permission[];
    permissions.forEach(p => this.permissions.set(p.id, p));

    // Load recent access log (last 7 days for performance)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.accessLog = (this.store.get('accessLog', []) as DataAccessLog[])
      .filter(log => log.timestamp > cutoff);
  }

  private saveData(): void {
    this.store.set('permissions', Array.from(this.permissions.values()));
    this.store.set('accessLog', this.accessLog);
    this.store.set('config', this.config);
  }

  private initializeDefaultPermissions(): void {
    const defaultPermissions: Omit<Permission, 'granted' | 'grantedAt'>[] = [
      {
        id: 'data.read.local',
        name: 'Read Local Data',
        description: 'Access files and data stored locally',
        category: 'data_access',
      },
      {
        id: 'data.write.local',
        name: 'Write Local Data',
        description: 'Save and modify local files and data',
        category: 'data_access',
      },
      {
        id: 'network.local',
        name: 'Local Network Access',
        description: 'Communicate with devices on your local network',
        category: 'network',
      },
      {
        id: 'network.internet',
        name: 'Internet Access',
        description: 'Make requests to external servers',
        category: 'network',
      },
      {
        id: 'automation.execute',
        name: 'Execute Automations',
        description: 'Run workflows and automated actions',
        category: 'automation',
      },
      {
        id: 'automation.schedule',
        name: 'Schedule Actions',
        description: 'Set up scheduled and recurring tasks',
        category: 'automation',
      },
      {
        id: 'system.apps',
        name: 'Launch Applications',
        description: 'Open and control other applications',
        category: 'system',
      },
      {
        id: 'system.clipboard',
        name: 'Access Clipboard',
        description: 'Read and write to system clipboard',
        category: 'system',
      },
      {
        id: 'integration.email',
        name: 'Email Integration',
        description: 'Access and manage email accounts',
        category: 'integration',
      },
      {
        id: 'integration.calendar',
        name: 'Calendar Integration',
        description: 'Access and manage calendar events',
        category: 'integration',
      },
      {
        id: 'integration.smart_home',
        name: 'Smart Home Control',
        description: 'Control smart home devices',
        category: 'integration',
      },
      {
        id: 'learning.patterns',
        name: 'Learn Usage Patterns',
        description: 'Observe and learn from your usage patterns',
        category: 'learning',
      },
      {
        id: 'learning.preferences',
        name: 'Remember Preferences',
        description: 'Store and recall your preferences',
        category: 'learning',
      },
    ];

    for (const perm of defaultPermissions) {
      if (!this.permissions.has(perm.id)) {
        this.permissions.set(perm.id, {
          ...perm,
          granted: this.getDefaultGrantState(perm.category),
        });
      }
    }

    this.saveData();
  }

  private getDefaultGrantState(category: PermissionCategory): boolean {
    // Default grants based on privacy mode
    switch (this.config.mode) {
      case 'strict':
        return category === 'data_access';
      case 'balanced':
        return ['data_access', 'automation', 'learning'].includes(category);
      case 'permissive':
        return true;
      default:
        return false;
    }
  }

  private registerIPCHandlers(): void {
    // Configuration
    ipcMain.handle('privacy:get-config', async () => this.config);
    ipcMain.handle('privacy:update-config', async (_, updates: Partial<PrivacyConfig>) => 
      this.updateConfig(updates));
    ipcMain.handle('privacy:set-mode', async (_, mode: PrivacyMode) => this.setPrivacyMode(mode));

    // Permissions
    ipcMain.handle('privacy:get-permissions', async () => this.getPermissions());
    ipcMain.handle('privacy:get-permission', async (_, id: string) => this.getPermission(id));
    ipcMain.handle('privacy:grant-permission', async (_, id: string, expiry?: number) => 
      this.grantPermission(id, expiry));
    ipcMain.handle('privacy:revoke-permission', async (_, id: string) => this.revokePermission(id));
    ipcMain.handle('privacy:check-permission', async (_, id: string) => this.checkPermission(id));

    // Access log
    ipcMain.handle('privacy:get-access-log', async (_, options?: {
      component?: string;
      dataType?: string;
      limit?: number;
    }) => this.getAccessLog(options));
    ipcMain.handle('privacy:clear-access-log', async () => this.clearAccessLog());

    // Explainable AI
    ipcMain.handle('privacy:explain-action', async (_, actionId: string) => 
      this.getActionExplanation(actionId));
    ipcMain.handle('privacy:get-pending-approvals', async () => this.getPendingApprovals());
    ipcMain.handle('privacy:approve-action', async (_, id: string) => this.approveAction(id));
    ipcMain.handle('privacy:reject-action', async (_, id: string) => this.rejectAction(id));

    // Data management
    ipcMain.handle('privacy:export-data', async () => this.exportAllData());
    ipcMain.handle('privacy:import-data', async (_, data: DataExport) => this.importData(data));
    ipcMain.handle('privacy:delete-all-data', async () => this.deleteAllData());
    ipcMain.handle('privacy:get-data-summary', async () => this.getDataSummary());

    // Reports
    ipcMain.handle('privacy:generate-report', async (_, period?: { start: number; end: number }) => 
      this.generatePrivacyReport(period));

    // Encryption
    ipcMain.handle('privacy:enable-encryption', async (_, password: string) => 
      this.enableEncryption(password));
    ipcMain.handle('privacy:disable-encryption', async (_, password: string) => 
      this.disableEncryption(password));
    ipcMain.handle('privacy:is-encrypted', async () => this.config.encryptLocalData);
  }

  // ---------------------------------------------------------------------------
  // Permission Management
  // ---------------------------------------------------------------------------

  getPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  getPermission(id: string): Permission | undefined {
    return this.permissions.get(id);
  }

  grantPermission(id: string, expiresIn?: number): boolean {
    const permission = this.permissions.get(id);
    if (!permission) return false;

    permission.granted = true;
    permission.grantedAt = Date.now();
    
    if (expiresIn) {
      permission.expiresAt = Date.now() + expiresIn;
    } else {
      delete permission.expiresAt;
    }

    this.saveData();
    this.logAccess({
      component: 'PrivacyGuard',
      action: 'grant_permission',
      dataType: 'permission',
      purpose: `Granted permission: ${permission.name}`,
      approved: true,
    });

    this.emit('permission:granted', permission);
    return true;
  }

  revokePermission(id: string): boolean {
    const permission = this.permissions.get(id);
    if (!permission) return false;

    permission.granted = false;
    delete permission.grantedAt;
    delete permission.expiresAt;

    this.saveData();
    this.logAccess({
      component: 'PrivacyGuard',
      action: 'revoke_permission',
      dataType: 'permission',
      purpose: `Revoked permission: ${permission.name}`,
      approved: true,
    });

    this.emit('permission:revoked', permission);
    return true;
  }

  checkPermission(id: string): boolean {
    const permission = this.permissions.get(id);
    if (!permission) return false;

    // Check if permission is granted
    if (!permission.granted) return false;

    // Check if permission has expired
    if (permission.expiresAt && Date.now() > permission.expiresAt) {
      permission.granted = false;
      this.saveData();
      return false;
    }

    return true;
  }

  async requestPermission(
    id: string,
    reason: string
  ): Promise<boolean> {
    if (this.checkPermission(id)) {
      return true;
    }

    const permission = this.permissions.get(id);
    if (!permission) return false;

    if (this.config.requireConfirmation === 'none') {
      return this.grantPermission(id);
    }

    // Show permission dialog
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'question',
      title: 'Permission Required',
      message: `"${permission.name}" permission requested`,
      detail: `${reason}\n\n${permission.description}`,
      buttons: ['Allow', 'Allow for 1 hour', 'Deny'],
      defaultId: 0,
      cancelId: 2,
    });

    if (result.response === 0) {
      return this.grantPermission(id);
    } else if (result.response === 1) {
      return this.grantPermission(id, 60 * 60 * 1000); // 1 hour
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Access Logging
  // ---------------------------------------------------------------------------

  logAccess(log: Omit<DataAccessLog, 'id' | 'timestamp'>): void {
    if (!this.config.auditLogging) return;

    const entry: DataAccessLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      ...log,
    };

    this.accessLog.push(entry);

    // Trim old logs
    const cutoff = Date.now() - this.config.dataRetentionDays * 24 * 60 * 60 * 1000;
    this.accessLog = this.accessLog.filter(l => l.timestamp > cutoff);

    this.saveData();
    this.emit('access:logged', entry);
  }

  getAccessLog(options?: {
    component?: string;
    dataType?: string;
    limit?: number;
  }): DataAccessLog[] {
    let logs = [...this.accessLog];

    if (options?.component) {
      logs = logs.filter(l => l.component === options.component);
    }

    if (options?.dataType) {
      logs = logs.filter(l => l.dataType === options.dataType);
    }

    // Sort by timestamp, newest first
    logs.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  clearAccessLog(): void {
    this.accessLog = [];
    this.saveData();
    this.emit('access:cleared');
  }

  private startAuditCleanup(): void {
    // Clean up old logs daily
    this.auditCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.config.dataRetentionDays * 24 * 60 * 60 * 1000;
      const beforeCount = this.accessLog.length;
      this.accessLog = this.accessLog.filter(l => l.timestamp > cutoff);
      
      if (this.accessLog.length < beforeCount) {
        this.saveData();
      }
    }, 24 * 60 * 60 * 1000);
  }

  // ---------------------------------------------------------------------------
  // Explainable AI
  // ---------------------------------------------------------------------------

  createExplainableAction(
    action: string,
    reasoning: ReasoningStep[],
    sources: string[],
    confidence: number,
    alternatives?: Array<{ action: string; reason: string }>
  ): ExplainableAction {
    const explainable: ExplainableAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action,
      reasoning,
      sources,
      confidence,
      alternatives,
    };

    // Check if confirmation is required
    const requiresApproval = 
      this.config.requireConfirmation === 'all' ||
      (this.config.requireConfirmation === 'sensitive' && confidence < 0.8);

    if (requiresApproval) {
      this.pendingApprovals.set(explainable.id, explainable);
      this.mainWindow?.webContents.send('privacy:approval-required', explainable);
    }

    return explainable;
  }

  getActionExplanation(actionId: string): ExplainableAction | undefined {
    return this.pendingApprovals.get(actionId);
  }

  getPendingApprovals(): ExplainableAction[] {
    return Array.from(this.pendingApprovals.values());
  }

  approveAction(id: string): boolean {
    const action = this.pendingApprovals.get(id);
    if (!action) return false;

    action.userApproved = true;
    this.pendingApprovals.delete(id);

    this.logAccess({
      component: 'PrivacyGuard',
      action: 'approve_action',
      dataType: 'ai_action',
      purpose: `Approved AI action: ${action.action}`,
      approved: true,
      details: { actionId: id, confidence: action.confidence },
    });

    this.emit('action:approved', action);
    return true;
  }

  rejectAction(id: string): boolean {
    const action = this.pendingApprovals.get(id);
    if (!action) return false;

    action.userApproved = false;
    this.pendingApprovals.delete(id);

    this.logAccess({
      component: 'PrivacyGuard',
      action: 'reject_action',
      dataType: 'ai_action',
      purpose: `Rejected AI action: ${action.action}`,
      approved: false,
      details: { actionId: id },
    });

    this.emit('action:rejected', action);
    return true;
  }

  formatExplanation(action: ExplainableAction): string {
    const lines: string[] = [
      `Action: ${action.action}`,
      `Confidence: ${(action.confidence * 100).toFixed(0)}%`,
      '',
      'Reasoning:',
    ];

    for (const step of action.reasoning) {
      lines.push(`  ${step.step}. ${step.description}`);
      if (step.source) {
        lines.push(`     Source: ${step.source}`);
      }
    }

    if (action.sources.length > 0) {
      lines.push('', 'Sources:', ...action.sources.map(s => `  - ${s}`));
    }

    if (action.alternatives && action.alternatives.length > 0) {
      lines.push('', 'Alternatives considered:');
      for (const alt of action.alternatives) {
        lines.push(`  - ${alt.action}: ${alt.reason}`);
      }
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Data Management
  // ---------------------------------------------------------------------------

  async exportAllData(): Promise<DataExport> {
    const stores = [
      'dex-data',
      'dex-agent-config',
      'dex-agent-context',
      'dex-home-automation',
      'dex-computer-tasks',
    ];

    const data: Record<string, unknown> = {};

    for (const storeName of stores) {
      try {
        const store = new Store({ name: storeName });
        data[storeName] = store.store;
      } catch {
        // Store might not exist
      }
    }

    const conversationsData = (data['dex-agent-context'] as Record<string, unknown>)?.conversations;
    const preferencesData = (data['dex-agent-context'] as Record<string, unknown>)?.userPreferences;
    
    const exportData: DataExport = {
      exportedAt: Date.now(),
      version: '1.0.0',
      data: {
        settings: (data['dex-data'] as Record<string, unknown>) || { _init: true },
        conversations: Array.isArray(conversationsData) ? conversationsData : [],
        preferences: (preferencesData as Record<string, unknown>) || { _init: true },
        automations: [],
        history: this.accessLog as unknown[],
      },
      checksum: '',
    };

    // Generate checksum
    const dataString = JSON.stringify(exportData.data);
    exportData.checksum = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    this.logAccess({
      component: 'PrivacyGuard',
      action: 'export_data',
      dataType: 'all',
      purpose: 'User requested data export',
      approved: true,
    });

    return exportData;
  }

  async importData(data: DataExport): Promise<{ success: boolean; message: string }> {
    // Verify checksum
    const dataString = JSON.stringify(data.data);
    const checksum = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    if (checksum !== data.checksum) {
      return { success: false, message: 'Data integrity check failed' };
    }

    // Show confirmation dialog
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'warning',
      title: 'Import Data',
      message: 'Import will overwrite existing data',
      detail: 'This action cannot be undone. Are you sure you want to continue?',
      buttons: ['Cancel', 'Import'],
      defaultId: 0,
    });

    if (result.response !== 1) {
      return { success: false, message: 'Import cancelled' };
    }

    try {
      // Import settings
      if (data.data.settings) {
        const settingsStore = new Store({ name: 'dex-data' });
        Object.entries(data.data.settings).forEach(([key, value]) => {
          settingsStore.set(key, value);
        });
      }

      // Import conversations and preferences
      if (data.data.conversations || data.data.preferences) {
        const contextStore = new Store({ name: 'dex-agent-context' });
        if (data.data.conversations) {
          contextStore.set('conversations', data.data.conversations);
        }
        if (data.data.preferences) {
          contextStore.set('userPreferences', data.data.preferences);
        }
      }

      this.logAccess({
        component: 'PrivacyGuard',
        action: 'import_data',
        dataType: 'all',
        purpose: 'User imported data',
        approved: true,
      });

      return { success: true, message: 'Data imported successfully' };
    } catch (error) {
      return { success: false, message: `Import failed: ${error}` };
    }
  }

  async deleteAllData(): Promise<{ success: boolean; message: string }> {
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'warning',
      title: 'Delete All Data',
      message: 'This will permanently delete all your data',
      detail: 'This includes conversations, preferences, automations, and all learned patterns. This action cannot be undone.',
      buttons: ['Cancel', 'Delete Everything'],
      defaultId: 0,
    });

    if (result.response !== 1) {
      return { success: false, message: 'Deletion cancelled' };
    }

    // Second confirmation
    const confirm = await dialog.showMessageBox(this.mainWindow!, {
      type: 'warning',
      title: 'Confirm Deletion',
      message: 'Are you absolutely sure?',
      detail: 'Type "DELETE" to confirm.',
      buttons: ['Cancel', 'I understand, delete everything'],
      defaultId: 0,
    });

    if (confirm.response !== 1) {
      return { success: false, message: 'Deletion cancelled' };
    }

    try {
      const stores = [
        'dex-agent-config',
        'dex-agent-context',
        'dex-home-automation',
        'dex-computer-tasks',
      ];

      for (const storeName of stores) {
        try {
          const store = new Store({ name: storeName });
          store.clear();
        } catch {
          // Ignore
        }
      }

      // Clear local data
      this.accessLog = [];
      this.pendingApprovals.clear();
      this.saveData();

      this.emit('data:deleted');
      return { success: true, message: 'All data has been deleted' };
    } catch (error) {
      return { success: false, message: `Deletion failed: ${error}` };
    }
  }

  getDataSummary(): {
    categories: Array<{ name: string; size: string; items: number }>;
    totalSize: string;
    oldestData: number;
    newestData: number;
  } {
    const categories: Array<{ name: string; size: string; items: number }> = [];
    let totalBytes = 0;
    let oldestData = Date.now();
    let newestData = 0;

    // Calculate sizes (approximation)
    const conversationStore = new Store({ name: 'dex-agent-context' });
    const conversations = conversationStore.get('conversations', {}) as Record<string, unknown>;
    const convSize = JSON.stringify(conversations).length;
    totalBytes += convSize;
    categories.push({
      name: 'Conversations',
      size: this.formatBytes(convSize),
      items: Object.keys(conversations).length,
    });

    const homeStore = new Store({ name: 'dex-home-automation' });
    const homeData = homeStore.store;
    const homeSize = JSON.stringify(homeData).length;
    totalBytes += homeSize;
    categories.push({
      name: 'Home Automation',
      size: this.formatBytes(homeSize),
      items: ((homeData as Record<string, unknown[]>).devices || []).length,
    });

    const accessLogSize = JSON.stringify(this.accessLog).length;
    totalBytes += accessLogSize;
    categories.push({
      name: 'Activity Log',
      size: this.formatBytes(accessLogSize),
      items: this.accessLog.length,
    });

    // Find oldest and newest data
    for (const log of this.accessLog) {
      if (log.timestamp < oldestData) oldestData = log.timestamp;
      if (log.timestamp > newestData) newestData = log.timestamp;
    }

    return {
      categories,
      totalSize: this.formatBytes(totalBytes),
      oldestData,
      newestData,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ---------------------------------------------------------------------------
  // Privacy Reports
  // ---------------------------------------------------------------------------

  generatePrivacyReport(period?: { start: number; end: number }): PrivacyReport {
    const now = Date.now();
    const start = period?.start || now - 7 * 24 * 60 * 60 * 1000;
    const end = period?.end || now;

    const relevantLogs = this.accessLog.filter(
      log => log.timestamp >= start && log.timestamp <= end
    );

    // Calculate summary
    const summary = {
      totalDataAccesses: relevantLogs.length,
      networkRequests: relevantLogs.filter(l => l.component.includes('network') || l.action.includes('network')).length,
      automationsRun: relevantLogs.filter(l => l.dataType === 'automation' || l.action.includes('execute')).length,
      dataShared: relevantLogs.filter(l => l.action.includes('share') || l.action.includes('export')).length,
    };

    // Access by category
    const accessByCategory: Record<string, number> = {};
    for (const log of relevantLogs) {
      const category = log.component;
      accessByCategory[category] = (accessByCategory[category] || 0) + 1;
    }

    // Top data types
    const dataTypeCounts: Record<string, number> = {};
    for (const log of relevantLogs) {
      dataTypeCounts[log.dataType] = (dataTypeCounts[log.dataType] || 0) + 1;
    }
    const topDataTypes = Object.entries(dataTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // Generate recommendations
    const recommendations: string[] = [];

    if (summary.networkRequests > 100) {
      recommendations.push('Consider enabling strict privacy mode to reduce network requests');
    }

    if (!this.config.encryptLocalData) {
      recommendations.push('Enable local data encryption for additional security');
    }

    if (this.config.dataRetentionDays > 30) {
      recommendations.push('Consider reducing data retention period to minimize stored data');
    }

    const deniedCount = relevantLogs.filter(l => !l.approved).length;
    if (deniedCount > 0) {
      recommendations.push(`${deniedCount} access requests were denied - review permissions if needed`);
    }

    return {
      generatedAt: Date.now(),
      period: { start, end },
      summary,
      accessByCategory,
      topDataTypes,
      recommendations,
    };
  }

  // ---------------------------------------------------------------------------
  // Encryption
  // ---------------------------------------------------------------------------

  async enableEncryption(password: string): Promise<{ success: boolean; message: string }> {
    if (this.config.encryptLocalData) {
      return { success: false, message: 'Encryption is already enabled' };
    }

    try {
      // Derive key from password
      const salt = crypto.randomBytes(16);
      this.encryptionKey = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');

      // Store salt (not the key)
      this.store.set('encryptionSalt', salt.toString('hex'));
      this.config.encryptLocalData = true;
      this.saveData();

      return { success: true, message: 'Encryption enabled successfully' };
    } catch (error) {
      return { success: false, message: `Failed to enable encryption: ${error}` };
    }
  }

  async disableEncryption(password: string): Promise<{ success: boolean; message: string }> {
    if (!this.config.encryptLocalData) {
      return { success: false, message: 'Encryption is not enabled' };
    }

    try {
      // Verify password
      const salt = Buffer.from(this.store.get('encryptionSalt', '') as string, 'hex');
      const key = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');

      if (!this.encryptionKey || !key.equals(this.encryptionKey)) {
        return { success: false, message: 'Invalid password' };
      }

      this.encryptionKey = null;
      this.store.delete('encryptionSalt');
      this.config.encryptLocalData = false;
      this.saveData();

      return { success: true, message: 'Encryption disabled successfully' };
    } catch (error) {
      return { success: false, message: `Failed to disable encryption: ${error}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(updates: Partial<PrivacyConfig>): PrivacyConfig {
    this.config = { ...this.config, ...updates };
    this.saveData();

    this.logAccess({
      component: 'PrivacyGuard',
      action: 'update_config',
      dataType: 'config',
      purpose: 'Privacy settings updated',
      approved: true,
      details: updates,
    });

    this.emit('config:updated', this.config);
    return this.config;
  }

  setPrivacyMode(mode: PrivacyMode): void {
    this.config.mode = mode;

    // Update default permissions based on mode
    for (const permission of this.permissions.values()) {
      permission.granted = this.getDefaultGrantState(permission.category);
    }

    this.saveData();

    this.logAccess({
      component: 'PrivacyGuard',
      action: 'set_mode',
      dataType: 'config',
      purpose: `Privacy mode changed to: ${mode}`,
      approved: true,
    });

    this.emit('mode:changed', mode);
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  shutdown(): void {
    // Clear audit cleanup interval
    if (this.auditCleanupInterval) {
      clearInterval(this.auditCleanupInterval);
      this.auditCleanupInterval = null;
    }
    this.saveData();
    this.emit('shutdown');
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const privacyGuard = new PrivacyGuardManager();

export function initializePrivacyGuard(mainWindow: BrowserWindow): void {
  privacyGuard.initialize(mainWindow);
}

export function shutdownPrivacyGuard(): void {
  privacyGuard.shutdown();
}
