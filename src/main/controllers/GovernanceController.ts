// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Governance Controller
 * ===========================================================================
 * 
 * System-wide Governance & Trust Lock:
 * 1. Global automation controls (enable/disable all)
 * 2. Per-automation override controls
 * 3. Learning governance (on/off, data retention)
 * 4. System health monitoring
 * 5. Trust dashboard data provider
 * 
 * PRINCIPLES:
 * - User is always in control
 * - Everything has an off switch
 * - No hidden processes
 * - Fail closed, not open
 * - Transparency over convenience
 */

import log from 'electron-log';
import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// Types
// ===========================================================================

export interface GovernanceStatus {
  // Global controls
  systemEnabled: boolean;
  automationEnabled: boolean;
  learningEnabled: boolean;
  pipelineEnabled: boolean;
  audioEnabled: boolean;
  
  // Health
  systemHealth: 'healthy' | 'degraded' | 'critical';
  lastHealthCheck: number;
  
  // Stats
  activeAutomations: number;
  pendingApprovals: number;
  learningDataPoints: number;
  storageUsedMB: number;
  storageLimitMB: number;
}

export interface AutomationPermission {
  automationId: string;
  name: string;
  enabled: boolean;
  requireApproval: boolean;
  allowedActions: string[];
  blockedPaths: string[];
  lastRun: number | null;
  runCount: number;
}

export interface LearningGovernance {
  enabled: boolean;
  collectPatterns: boolean;
  collectTiming: boolean;
  collectContext: boolean;
  retentionDays: number;
  allowSuggestions: boolean;
  maxDataPoints: number;
  lastPurge: number | null;
}

export interface SystemLimit {
  id: string;
  name: string;
  type: 'storage' | 'automation' | 'processing' | 'learning';
  currentValue: number;
  maxValue: number;
  unit: string;
  enforcementAction: 'warn' | 'block' | 'cleanup';
}

export interface TrustAuditEntry {
  id: string;
  timestamp: number;
  category: 'automation' | 'learning' | 'storage' | 'permission' | 'system';
  action: string;
  details: string;
  result: 'allowed' | 'blocked' | 'failed' | 'pending';
  userId: string | null;
}

export interface GovernanceConfig {
  // Master controls
  systemEnabled: boolean;
  automationEnabled: boolean;
  learningEnabled: boolean;
  
  // Limits
  limits: SystemLimit[];
  
  // Learning
  learning: LearningGovernance;
  
  // Automation permissions
  automationPermissions: Map<string, AutomationPermission>;
  
  // Audit
  auditEnabled: boolean;
  auditRetentionDays: number;
}

// ===========================================================================
// Governance Controller
// ===========================================================================

class GovernanceController {
  private mainWindow: BrowserWindow | null = null;
  private dataDir: string;
  private configFile: string;
  private auditFile: string;
  
  private config: GovernanceConfig;
  private auditLog: TrustAuditEntry[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: number = 0;
  private currentHealth: GovernanceStatus['systemHealth'] = 'healthy';

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'governance');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.auditFile = path.join(this.dataDir, 'audit.json');
    
    this.config = this.getDefaultConfig();
    
    this.initialize();
    this.registerIPCHandlers();
  }

  private getDefaultConfig(): GovernanceConfig {
    return {
      systemEnabled: true,
      automationEnabled: true,
      learningEnabled: true,
      
      limits: [
        {
          id: 'storage',
          name: 'System Storage',
          type: 'storage',
          currentValue: 0,
          maxValue: 500, // MB
          unit: 'MB',
          enforcementAction: 'cleanup',
        },
        {
          id: 'concurrent_automations',
          name: 'Concurrent Automations',
          type: 'automation',
          currentValue: 0,
          maxValue: 5,
          unit: 'running',
          enforcementAction: 'block',
        },
        {
          id: 'daily_automation_runs',
          name: 'Daily Automation Runs',
          type: 'automation',
          currentValue: 0,
          maxValue: 100,
          unit: 'runs',
          enforcementAction: 'warn',
        },
        {
          id: 'learning_data',
          name: 'Learning Data Points',
          type: 'learning',
          currentValue: 0,
          maxValue: 10000,
          unit: 'points',
          enforcementAction: 'cleanup',
        },
      ],
      
      learning: {
        enabled: true,
        collectPatterns: true,
        collectTiming: true,
        collectContext: false,       // More privacy-sensitive
        retentionDays: 90,
        allowSuggestions: true,
        maxDataPoints: 10000,
        lastPurge: null,
      },
      
      automationPermissions: new Map(),
      
      auditEnabled: true,
      auditRetentionDays: 30,
    };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      
      // Load config
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        const loaded = JSON.parse(data);
        
        // Restore Map from array
        if (loaded.automationPermissions) {
          loaded.automationPermissions = new Map(
            Object.entries(loaded.automationPermissions)
          );
        }
        
        this.config = { ...this.config, ...loaded };
      }
      
      // Load audit log
      if (fs.existsSync(this.auditFile)) {
        const data = fs.readFileSync(this.auditFile, 'utf-8');
        this.auditLog = JSON.parse(data);
        
        // Prune old entries
        this.pruneAuditLog();
      }
      
      // Start health checks (every 5 minutes)
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, 5 * 60 * 1000);
      
      // Initial health check
      await this.performHealthCheck();
      
      if (!app.isPackaged) log.info('[GovernanceController] Initialized:', {
        systemEnabled: this.config.systemEnabled,
        automationEnabled: this.config.automationEnabled,
        learningEnabled: this.config.learningEnabled,
        auditEntries: this.auditLog.length,
      });
    } catch (err) {
      log.error('[GovernanceController] Initialization error:', err);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ===========================================================================
  // Global Controls
  // ===========================================================================

  async enableAll(): Promise<boolean> {
    this.config.systemEnabled = true;
    this.config.automationEnabled = true;
    this.config.learningEnabled = true;
    
    this.saveConfig();
    this.audit('system', 'enable_all', 'Enabled all system features', 'allowed');
    this.emitStatusUpdate();
    
    return true;
  }

  async disableAll(): Promise<boolean> {
    this.config.automationEnabled = false;
    this.config.learningEnabled = false;
    // Keep systemEnabled true so governance still works
    
    this.saveConfig();
    this.audit('system', 'disable_all', 'Disabled automations and learning', 'allowed');
    this.emitStatusUpdate();
    
    return true;
  }

  async setAutomationEnabled(enabled: boolean): Promise<boolean> {
    this.config.automationEnabled = enabled;
    this.saveConfig();
    this.audit('automation', enabled ? 'enabled' : 'disabled', 
      `Automation system ${enabled ? 'enabled' : 'disabled'}`, 'allowed');
    this.emitStatusUpdate();
    return true;
  }

  async setLearningEnabled(enabled: boolean): Promise<boolean> {
    this.config.learningEnabled = enabled;
    this.saveConfig();
    this.audit('learning', enabled ? 'enabled' : 'disabled', 
      `Learning system ${enabled ? 'enabled' : 'disabled'}`, 'allowed');
    this.emitStatusUpdate();
    return true;
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  async getStatus(): Promise<GovernanceStatus> {
    const storageLimit = this.config.limits.find(l => l.id === 'storage');
    
    return {
      systemEnabled: this.config.systemEnabled,
      automationEnabled: this.config.automationEnabled,
      learningEnabled: this.config.learningEnabled,
      pipelineEnabled: this.config.systemEnabled,
      audioEnabled: this.config.systemEnabled,
      
      systemHealth: this.currentHealth,
      lastHealthCheck: this.lastHealthCheck,
      
      activeAutomations: this.config.limits
        .find(l => l.id === 'concurrent_automations')?.currentValue || 0,
      pendingApprovals: 0, // Would integrate with AutomationEngine
      learningDataPoints: this.config.limits
        .find(l => l.id === 'learning_data')?.currentValue || 0,
      storageUsedMB: storageLimit?.currentValue || 0,
      storageLimitMB: storageLimit?.maxValue || 500,
    };
  }

  // ===========================================================================
  // Automation Permissions
  // ===========================================================================

  async getAutomationPermissions(): Promise<AutomationPermission[]> {
    return Array.from(this.config.automationPermissions.values());
  }

  async setAutomationPermission(
    automationId: string,
    permission: Partial<AutomationPermission>
  ): Promise<boolean> {
    const existing = this.config.automationPermissions.get(automationId);
    
    if (existing) {
      this.config.automationPermissions.set(automationId, {
        ...existing,
        ...permission,
      });
    } else {
      this.config.automationPermissions.set(automationId, {
        automationId,
        name: permission.name || 'Unknown',
        enabled: permission.enabled ?? true,
        requireApproval: permission.requireApproval ?? false,
        allowedActions: permission.allowedActions || [],
        blockedPaths: permission.blockedPaths || [],
        lastRun: null,
        runCount: 0,
        ...permission,
      });
    }
    
    this.saveConfig();
    this.audit('permission', 'updated', 
      `Updated permissions for automation ${automationId}`, 'allowed');
    
    return true;
  }

  async canRunAutomation(automationId: string): Promise<{
    allowed: boolean;
    reason?: string;
    requiresApproval?: boolean;
  }> {
    // Check global automation setting
    if (!this.config.automationEnabled) {
      this.audit('automation', 'blocked', 
        `Automation ${automationId} blocked: automations disabled`, 'blocked');
      return { allowed: false, reason: 'Automations are disabled' };
    }
    
    // Check limit
    const limit = this.config.limits.find(l => l.id === 'concurrent_automations');
    if (limit && limit.currentValue >= limit.maxValue) {
      this.audit('automation', 'blocked', 
        `Automation ${automationId} blocked: limit reached`, 'blocked');
      return { allowed: false, reason: 'Concurrent automation limit reached' };
    }
    
    // Check specific permission
    const permission = this.config.automationPermissions.get(automationId);
    if (permission && !permission.enabled) {
      this.audit('automation', 'blocked', 
        `Automation ${automationId} blocked: disabled by permission`, 'blocked');
      return { allowed: false, reason: 'Automation is disabled' };
    }
    
    // Check if approval required
    if (permission?.requireApproval) {
      return { 
        allowed: true, 
        requiresApproval: true,
        reason: 'Requires user approval',
      };
    }
    
    return { allowed: true };
  }

  async recordAutomationRun(automationId: string): Promise<void> {
    const permission = this.config.automationPermissions.get(automationId);
    if (permission) {
      permission.lastRun = Date.now();
      permission.runCount++;
      this.saveConfig();
    }
    
    // Update daily limit
    const dailyLimit = this.config.limits.find(l => l.id === 'daily_automation_runs');
    if (dailyLimit) {
      dailyLimit.currentValue++;
    }
    
    this.audit('automation', 'run', 
      `Automation ${automationId} executed`, 'allowed');
  }

  // ===========================================================================
  // Learning Governance
  // ===========================================================================

  getLearningConfig(): LearningGovernance {
    return { ...this.config.learning };
  }

  async updateLearningConfig(updates: Partial<LearningGovernance>): Promise<boolean> {
    this.config.learning = { ...this.config.learning, ...updates };
    this.saveConfig();
    this.audit('learning', 'config_updated', 
      `Learning configuration updated`, 'allowed');
    return true;
  }

  async canCollectData(dataType: 'patterns' | 'timing' | 'context'): Promise<boolean> {
    if (!this.config.learningEnabled) return false;
    if (!this.config.learning.enabled) return false;
    
    switch (dataType) {
      case 'patterns': return this.config.learning.collectPatterns;
      case 'timing': return this.config.learning.collectTiming;
      case 'context': return this.config.learning.collectContext;
      default: return false;
    }
  }

  async canShowSuggestions(): Promise<boolean> {
    return this.config.learningEnabled && 
           this.config.learning.enabled && 
           this.config.learning.allowSuggestions;
  }

  async clearLearningData(): Promise<boolean> {
    // This would integrate with SystemIntelligenceController
    // For now, just reset the limit counter
    const limit = this.config.limits.find(l => l.id === 'learning_data');
    if (limit) {
      limit.currentValue = 0;
    }
    
    this.config.learning.lastPurge = Date.now();
    this.saveConfig();
    
    this.audit('learning', 'data_cleared', 
      'All learning data cleared by user', 'allowed');
    
    return true;
  }

  // ===========================================================================
  // Limits
  // ===========================================================================

  getLimits(): SystemLimit[] {
    return this.config.limits.map(l => ({ ...l }));
  }

  async updateLimit(id: string, updates: Partial<SystemLimit>): Promise<boolean> {
    const limit = this.config.limits.find(l => l.id === id);
    if (!limit) return false;
    
    Object.assign(limit, updates);
    this.saveConfig();
    
    this.audit('system', 'limit_updated', 
      `System limit ${id} updated`, 'allowed');
    
    return true;
  }

  async checkLimit(limitId: string, increment: number = 0): Promise<{
    allowed: boolean;
    currentValue: number;
    maxValue: number;
    wouldExceed: boolean;
  }> {
    const limit = this.config.limits.find(l => l.id === limitId);
    if (!limit) {
      return { allowed: true, currentValue: 0, maxValue: Infinity, wouldExceed: false };
    }
    
    const newValue = limit.currentValue + increment;
    const wouldExceed = newValue > limit.maxValue;
    
    let allowed = true;
    if (wouldExceed && limit.enforcementAction === 'block') {
      allowed = false;
    }
    
    return {
      allowed,
      currentValue: limit.currentValue,
      maxValue: limit.maxValue,
      wouldExceed,
    };
  }

  async updateLimitValue(limitId: string, value: number): Promise<void> {
    const limit = this.config.limits.find(l => l.id === limitId);
    if (limit) {
      limit.currentValue = value;
      
      // Check if cleanup needed
      if (limit.currentValue > limit.maxValue && 
          limit.enforcementAction === 'cleanup') {
        this.emitStatusUpdate();
        this.audit('system', 'limit_exceeded', 
          `Limit ${limitId} exceeded, cleanup may be needed`, 'pending');
      }
    }
  }

  // ===========================================================================
  // Health Checks
  // ===========================================================================

  private async performHealthCheck(): Promise<void> {
    let health: GovernanceStatus['systemHealth'] = 'healthy';
    const issues: string[] = [];
    
    // Check storage
    const storageLimit = this.config.limits.find(l => l.id === 'storage');
    if (storageLimit) {
      const usage = storageLimit.currentValue / storageLimit.maxValue;
      if (usage > 0.9) {
        health = 'critical';
        issues.push('Storage nearly full');
      } else if (usage > 0.7) {
        if (health === 'healthy') health = 'degraded';
        issues.push('Storage usage high');
      }
    }
    
    // Check for too many failed automations
    const recentAudits = this.auditLog.filter(
      a => a.timestamp > Date.now() - 60 * 60 * 1000 && // Last hour
           a.category === 'automation' &&
           a.result === 'failed'
    );
    
    if (recentAudits.length > 10) {
      if (health === 'healthy') health = 'degraded';
      issues.push('Multiple automation failures');
    }
    
    this.currentHealth = health;
    this.lastHealthCheck = Date.now();
    
    if (health !== 'healthy') {
      log.warn('[GovernanceController] Health check issues:', issues);
    }
    
    this.emitStatusUpdate();
  }

  // ===========================================================================
  // Audit Log
  // ===========================================================================

  private audit(
    category: TrustAuditEntry['category'],
    action: string,
    details: string,
    result: TrustAuditEntry['result']
  ): void {
    if (!this.config.auditEnabled) return;
    
    const entry: TrustAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      category,
      action,
      details,
      result,
      userId: null,
    };
    
    this.auditLog.push(entry);
    this.saveAuditLog();
    
    // Emit to UI
    this.emitAuditEntry(entry);
  }

  getAuditLog(options?: {
    category?: TrustAuditEntry['category'];
    limit?: number;
    since?: number;
  }): TrustAuditEntry[] {
    let entries = [...this.auditLog];
    
    if (options?.category) {
      entries = entries.filter(e => e.category === options.category);
    }
    
    if (options?.since !== undefined) {
      const sinceTime = options.since;
      entries = entries.filter(e => e.timestamp >= sinceTime);
    }
    
    entries.sort((a, b) => b.timestamp - a.timestamp);
    
    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }
    
    return entries;
  }

  private pruneAuditLog(): void {
    const cutoff = Date.now() - this.config.auditRetentionDays * 24 * 60 * 60 * 1000;
    this.auditLog = this.auditLog.filter(e => e.timestamp >= cutoff);
    this.saveAuditLog();
  }

  // ===========================================================================
  // Trust Dashboard Data
  // ===========================================================================

  async getTrustDashboardData(): Promise<{
    status: GovernanceStatus;
    limits: SystemLimit[];
    learning: LearningGovernance;
    recentAudit: TrustAuditEntry[];
    permissions: AutomationPermission[];
  }> {
    return {
      status: await this.getStatus(),
      limits: this.getLimits(),
      learning: this.getLearningConfig(),
      recentAudit: this.getAuditLog({ limit: 50 }),
      permissions: await this.getAutomationPermissions(),
    };
  }

  // ===========================================================================
  // Emergency Controls
  // ===========================================================================

  async emergencyStop(): Promise<boolean> {
    // Immediately disable all automated features
    this.config.automationEnabled = false;
    this.config.learningEnabled = false;
    
    this.saveConfig();
    this.audit('system', 'emergency_stop', 
      'Emergency stop activated - all automation disabled', 'allowed');
    
    this.emitStatusUpdate();
    
    // Emit emergency event
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('governance:emergencyStop');
    }
    
    log.warn('[GovernanceController] EMERGENCY STOP ACTIVATED');
    
    return true;
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private saveConfig(): void {
    const toSave = {
      ...this.config,
      automationPermissions: Object.fromEntries(this.config.automationPermissions),
    };
    
    fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2));
  }

  private saveAuditLog(): void {
    fs.writeFileSync(this.auditFile, JSON.stringify(this.auditLog, null, 2));
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  private emitStatusUpdate(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.getStatus().then(status => {
        this.mainWindow?.webContents.send('governance:statusUpdated', status);
      });
    }
  }

  private emitAuditEntry(entry: TrustAuditEntry): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('governance:auditEntry', entry);
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // ===========================================================================
  // IPC Handlers
  // ===========================================================================

  private registerIPCHandlers(): void {
    // Status (using govCtrl: prefix to avoid conflict with GovernanceContract)
    ipcMain.handle('govCtrl:getStatus', () => this.getStatus());
    ipcMain.handle('govCtrl:getDashboardData', () => this.getTrustDashboardData());
    
    // Global controls
    ipcMain.handle('govCtrl:enableAll', () => this.enableAll());
    ipcMain.handle('govCtrl:disableAll', () => this.disableAll());
    ipcMain.handle('govCtrl:setAutomationEnabled', (_, enabled) => 
      this.setAutomationEnabled(enabled)
    );
    ipcMain.handle('govCtrl:setLearningEnabled', (_, enabled) => 
      this.setLearningEnabled(enabled)
    );
    ipcMain.handle('govCtrl:emergencyStop', () => this.emergencyStop());
    
    // Automation permissions
    ipcMain.handle('govCtrl:getAutomationPermissions', () => 
      this.getAutomationPermissions()
    );
    ipcMain.handle('govCtrl:setAutomationPermission', (_, id, permission) => 
      this.setAutomationPermission(id, permission)
    );
    ipcMain.handle('govCtrl:canRunAutomation', (_, id) => 
      this.canRunAutomation(id)
    );
    
    // Learning
    ipcMain.handle('govCtrl:getLearningConfig', () => this.getLearningConfig());
    ipcMain.handle('govCtrl:updateLearningConfig', (_, updates) => 
      this.updateLearningConfig(updates)
    );
    ipcMain.handle('govCtrl:clearLearningData', () => this.clearLearningData());
    
    // Limits
    ipcMain.handle('govCtrl:getLimits', () => this.getLimits());
    ipcMain.handle('govCtrl:updateLimit', (_, id, updates) => 
      this.updateLimit(id, updates)
    );
    ipcMain.handle('govCtrl:checkLimit', (_, id, increment) => 
      this.checkLimit(id, increment)
    );
    
    // Audit
    ipcMain.handle('govCtrl:getAuditLog', (_, options) => this.getAuditLog(options));
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const governanceController = new GovernanceController();
export default governanceController;
