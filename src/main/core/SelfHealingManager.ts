// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Self-Healing Manager
// Phase 44: Automatic state recovery, corruption detection, safe rollback
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// TYPES
// ===========================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'recovering';

export interface StateCheckpoint {
  id: string;
  timestamp: number;
  hash: string;
  size: number;
  valid: boolean;
}

export interface CorruptionReport {
  id: string;
  detectedAt: number;
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  autoRecovered: boolean;
  recoveryAction: string | null;
}

export interface SelfHealingConfig {
  enabled: boolean;
  checkIntervalMs: number;
  maxCheckpoints: number;
  autoRecover: boolean;
  notifyOnRecovery: boolean;
}

export interface HealthReport {
  status: HealthStatus;
  lastCheck: number;
  checksPerformed: number;
  corruptionsDetected: number;
  autoRecoveries: number;
  currentIssues: CorruptionReport[];
}

// ===========================================================================
// STORE
// ===========================================================================

const healingStore = new Store<{
  config: SelfHealingConfig;
  checkpoints: StateCheckpoint[];
  corruptionHistory: CorruptionReport[];
  lastHealthCheck: number;
  consecutiveFailures: number;
}>({
  name: 'self-healing',
  defaults: {
    config: {
      enabled: true,
      checkIntervalMs: 5 * 60 * 1000,   // 5 minutes
      maxCheckpoints: 5,
      autoRecover: true,
      notifyOnRecovery: true,
    },
    checkpoints: [],
    corruptionHistory: [],
    lastHealthCheck: 0,
    consecutiveFailures: 0,
  },
});

// ===========================================================================
// SELF-HEALING MANAGER
// ===========================================================================

class SelfHealingManager {
  private static instance: SelfHealingManager;
  private initialized = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private stateValidators: Map<string, () => Promise<boolean>> = new Map();
  private recoveryActions: Map<string, () => Promise<boolean>> = new Map();

  private constructor() {}

  static getInstance(): SelfHealingManager {
    if (!SelfHealingManager.instance) {
      SelfHealingManager.instance = new SelfHealingManager();
    }
    return SelfHealingManager.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.registerDefaultValidators();
    this.registerDefaultRecoveryActions();

    const config = healingStore.get('config');
    if (config.enabled) {
      this.startHealthChecks();
    }

    // Create initial checkpoint
    await this.createCheckpoint();

    this.initialized = true;
    log.info('[SelfHealingManager] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('healing:getConfig', () => this.getConfig());
    ipcMain.handle('healing:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('healing:getHealth', () => this.getHealthReport());
    ipcMain.handle('healing:runCheck', () => this.runHealthCheck());
    ipcMain.handle('healing:getCheckpoints', () => this.getCheckpoints());
    ipcMain.handle('healing:rollback', (_, checkpointId) => this.rollbackToCheckpoint(checkpointId));
    ipcMain.handle('healing:getCorruptionHistory', () => this.getCorruptionHistory());
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    await this.createCheckpoint();
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // VALIDATORS & RECOVERY ACTIONS
  // -------------------------------------------------------------------------

  private registerDefaultValidators(): void {
    // Validate settings store
    this.stateValidators.set('settings', async () => {
      try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (!fs.existsSync(settingsPath)) return true; // No file is valid
        const content = fs.readFileSync(settingsPath, 'utf-8');
        JSON.parse(content);
        return true;
      } catch {
        return false;
      }
    });

    // Validate workflows store
    this.stateValidators.set('workflows', async () => {
      try {
        const workflowsPath = path.join(app.getPath('userData'), 'workflows.json');
        if (!fs.existsSync(workflowsPath)) return true;
        const content = fs.readFileSync(workflowsPath, 'utf-8');
        const data = JSON.parse(content);
        return Array.isArray(data.workflows || data);
      } catch {
        return false;
      }
    });

    // Validate memory usage
    this.stateValidators.set('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      return heapUsedMB < 1024; // Under 1GB
    });
  }

  private registerDefaultRecoveryActions(): void {
    // Recovery for corrupted settings
    this.recoveryActions.set('settings', async () => {
      try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        const backupPath = settingsPath + '.backup';
        
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, settingsPath);
          return true;
        }
        
        // No backup, create fresh
        fs.writeFileSync(settingsPath, JSON.stringify({}));
        return true;
      } catch {
        return false;
      }
    });

    // Recovery for memory issues
    this.recoveryActions.set('memory', async () => {
      if (global.gc) {
        global.gc();
        return true;
      }
      return false;
    });
  }

  registerValidator(component: string, validator: () => Promise<boolean>): void {
    this.stateValidators.set(component, validator);
  }

  registerRecoveryAction(component: string, action: () => Promise<boolean>): void {
    this.recoveryActions.set(component, action);
  }

  // -------------------------------------------------------------------------
  // HEALTH CHECKS
  // -------------------------------------------------------------------------

  private startHealthChecks(): void {
    const config = healingStore.get('config');
    
    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheck().catch(err => {
        log.error('[SelfHealingManager] Health check failed:', err);
      });
    }, config.checkIntervalMs);
  }

  async runHealthCheck(): Promise<HealthReport> {
    const config = healingStore.get('config');
    const issues: CorruptionReport[] = [];
    let status: HealthStatus = 'healthy';

    // Run all validators
    for (const [component, validator] of this.stateValidators) {
      try {
        const isValid = await validator();
        
        if (!isValid) {
          const report: CorruptionReport = {
            id: `corruption_${Date.now()}_${component}`,
            detectedAt: Date.now(),
            component,
            severity: this.getSeverity(component),
            description: `State validation failed for ${component}`,
            autoRecovered: false,
            recoveryAction: null,
          };

          // Attempt auto-recovery if enabled
          if (config.autoRecover) {
            const recovered = await this.attemptRecovery(component);
            report.autoRecovered = recovered;
            report.recoveryAction = recovered ? 'auto-recovery' : null;
          }

          if (!report.autoRecovered) {
            issues.push(report);
            status = this.getWorstStatus(status, report.severity);
          }

          // Log corruption
          const history = healingStore.get('corruptionHistory');
          history.push(report);
          if (history.length > 100) history.splice(0, history.length - 100);
          healingStore.set('corruptionHistory', history);
        }
      } catch (error) {
        log.error(`[SelfHealingManager] Validator ${component} threw:`, error);
      }
    }

    // Update consecutive failures
    if (issues.length > 0) {
      healingStore.set('consecutiveFailures', healingStore.get('consecutiveFailures') + 1);
    } else {
      healingStore.set('consecutiveFailures', 0);
    }

    healingStore.set('lastHealthCheck', Date.now());

    const history = healingStore.get('corruptionHistory');

    return {
      status,
      lastCheck: Date.now(),
      checksPerformed: history.length,
      corruptionsDetected: history.length,
      autoRecoveries: history.filter(c => c.autoRecovered).length,
      currentIssues: issues,
    };
  }

  private getSeverity(component: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalComponents = ['encryption', 'auth'];
    const highComponents = ['settings', 'workflows', 'automations'];
    const mediumComponents = ['memory', 'cache'];

    if (criticalComponents.includes(component)) return 'critical';
    if (highComponents.includes(component)) return 'high';
    if (mediumComponents.includes(component)) return 'medium';
    return 'low';
  }

  private getWorstStatus(current: HealthStatus, severity: string): HealthStatus {
    const statusOrder: HealthStatus[] = ['healthy', 'degraded', 'critical', 'recovering'];
    const severityToStatus: Record<string, HealthStatus> = {
      low: 'degraded',
      medium: 'degraded',
      high: 'critical',
      critical: 'critical',
    };

    const newStatus = severityToStatus[severity] || 'degraded';
    const currentIndex = statusOrder.indexOf(current);
    const newIndex = statusOrder.indexOf(newStatus);

    return newIndex > currentIndex ? newStatus : current;
  }

  private async attemptRecovery(component: string): Promise<boolean> {
    const action = this.recoveryActions.get(component);
    if (!action) return false;

    try {
      log.info(`[SelfHealingManager] Attempting recovery for ${component}`);
      const success = await action();
      
      if (success) {
        log.info(`[SelfHealingManager] Recovery successful for ${component}`);
      }
      
      return success;
    } catch (error) {
      log.error(`[SelfHealingManager] Recovery failed for ${component}:`, error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // CHECKPOINTS
  // -------------------------------------------------------------------------

  async createCheckpoint(): Promise<StateCheckpoint | null> {
    try {
      const config = healingStore.get('config');
      const userDataPath = app.getPath('userData');
      const checkpointDir = path.join(userDataPath, 'checkpoints');

      // Ensure checkpoint directory exists
      if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
      }

      const checkpointId = `checkpoint_${Date.now()}`;
      const checkpointPath = path.join(checkpointDir, checkpointId);

      // Create checkpoint directory
      fs.mkdirSync(checkpointPath, { recursive: true });

      // Copy critical stores
      const storesToBackup = ['settings.json', 'workflows.json', 'automations.json'];
      let totalSize = 0;
      const hashData: string[] = [];

      for (const store of storesToBackup) {
        const sourcePath = path.join(userDataPath, store);
        if (fs.existsSync(sourcePath)) {
          const destPath = path.join(checkpointPath, store);
          fs.copyFileSync(sourcePath, destPath);
          const stats = fs.statSync(destPath);
          totalSize += stats.size;
          hashData.push(fs.readFileSync(destPath, 'utf-8'));
        }
      }

      // Create checkpoint metadata
      const checkpoint: StateCheckpoint = {
        id: checkpointId,
        timestamp: Date.now(),
        hash: crypto.createHash('sha256').update(hashData.join('')).digest('hex'),
        size: totalSize,
        valid: true,
      };

      // Store checkpoint reference
      const checkpoints = healingStore.get('checkpoints');
      checkpoints.push(checkpoint);

      // Maintain max checkpoints
      while (checkpoints.length > config.maxCheckpoints) {
        const oldest = checkpoints.shift();
        if (oldest) {
          const oldPath = path.join(checkpointDir, oldest.id);
          if (fs.existsSync(oldPath)) {
            fs.rmSync(oldPath, { recursive: true, force: true });
          }
        }
      }

      healingStore.set('checkpoints', checkpoints);
      log.info(`[SelfHealingManager] Checkpoint created: ${checkpointId}`);

      return checkpoint;
    } catch (error) {
      log.error('[SelfHealingManager] Checkpoint creation failed:', error);
      return null;
    }
  }

  getCheckpoints(): StateCheckpoint[] {
    return healingStore.get('checkpoints');
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const checkpoints = healingStore.get('checkpoints');
      const checkpoint = checkpoints.find(c => c.id === checkpointId);

      if (!checkpoint) {
        log.error(`[SelfHealingManager] Checkpoint not found: ${checkpointId}`);
        return false;
      }

      const userDataPath = app.getPath('userData');
      const checkpointPath = path.join(userDataPath, 'checkpoints', checkpointId);

      if (!fs.existsSync(checkpointPath)) {
        log.error(`[SelfHealingManager] Checkpoint directory not found: ${checkpointPath}`);
        return false;
      }

      // Restore files
      const files = fs.readdirSync(checkpointPath);
      for (const file of files) {
        const sourcePath = path.join(checkpointPath, file);
        const destPath = path.join(userDataPath, file);

        // Backup current before restoring
        if (fs.existsSync(destPath)) {
          fs.copyFileSync(destPath, destPath + '.pre-rollback');
        }

        fs.copyFileSync(sourcePath, destPath);
      }

      log.info(`[SelfHealingManager] Rolled back to checkpoint: ${checkpointId}`);
      return true;
    } catch (error) {
      log.error('[SelfHealingManager] Rollback failed:', error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): SelfHealingConfig {
    return healingStore.get('config');
  }

  async updateConfig(updates: Partial<SelfHealingConfig>): Promise<SelfHealingConfig> {
    const config = healingStore.get('config');
    const updated = { ...config, ...updates };
    healingStore.set('config', updated);

    // Restart health checks if interval changed
    if (updates.checkIntervalMs && this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      if (updated.enabled) {
        this.startHealthChecks();
      }
    }

    return updated;
  }

  getHealthReport(): HealthReport {
    const history = healingStore.get('corruptionHistory');
    const recentIssues = history.filter(c => 
      Date.now() - c.detectedAt < 24 * 60 * 60 * 1000 && !c.autoRecovered
    );

    let status: HealthStatus = 'healthy';
    for (const issue of recentIssues) {
      status = this.getWorstStatus(status, issue.severity);
    }

    return {
      status,
      lastCheck: healingStore.get('lastHealthCheck'),
      checksPerformed: history.length,
      corruptionsDetected: history.length,
      autoRecoveries: history.filter(c => c.autoRecovered).length,
      currentIssues: recentIssues,
    };
  }

  getCorruptionHistory(limit: number = 50): CorruptionReport[] {
    return healingStore.get('corruptionHistory').slice(-limit);
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const selfHealingManager = SelfHealingManager.getInstance();
export default selfHealingManager;
