// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - State Repair System
// System 6 Feature 3: State Repair System
// Auto-detects and fixes corrupted state/config without user intervention
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type StateFile = {
  path: string;
  name: string;
  schema: StateSchema;
  backup: boolean;
  critical: boolean;
};

export type StateSchema = {
  type: 'object' | 'array';
  requiredFields?: string[];
  defaults?: Record<string, unknown>;
  validate?: (data: unknown) => boolean;
};

export type CorruptionType = 
  | 'missing-file'
  | 'invalid-json'
  | 'missing-fields'
  | 'invalid-values'
  | 'file-locked'
  | 'permission-denied';

export interface CorruptionReport {
  id: string;
  timestamp: number;
  file: string;
  type: CorruptionType;
  details: string;
  repaired: boolean;
  action: string;
}

export interface RepairAction {
  file: string;
  action: 'restore-backup' | 'apply-defaults' | 'migrate' | 'recreate';
  before?: unknown;
  after?: unknown;
  success: boolean;
}

export interface StateHealth {
  healthy: boolean;
  filesChecked: number;
  corruptionFound: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  lastCheck: number;
}

export interface RepairConfig {
  enabled: boolean;
  autoRepair: boolean;
  checkOnStartup: boolean;
  checkInterval: number; // Hours
  maxBackups: number;
  backupOnChange: boolean;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: RepairConfig = {
  enabled: true,
  autoRepair: true,
  checkOnStartup: true,
  checkInterval: 24,
  maxBackups: 5,
  backupOnChange: true,
};

// ===========================================================================
// KNOWN STATE FILES
// ===========================================================================

const KNOWN_STATE_FILES: StateFile[] = [
  {
    path: 'dex-permissions.json',
    name: 'Permissions',
    schema: {
      type: 'object',
      requiredFields: ['states', 'restrictedMode'],
      defaults: {
        states: {},
        restrictedMode: { enabled: false, allowedPermissions: [] },
      },
    },
    backup: true,
    critical: true,
  },
  {
    path: 'dex-encryption.json',
    name: 'Encryption Settings',
    schema: {
      type: 'object',
      requiredFields: ['config'],
      defaults: {
        config: {
          enabled: false,
          keySource: 'system',
          initialized: false,
        },
      },
    },
    backup: true,
    critical: true,
  },
  {
    path: 'dex-performance.json',
    name: 'Performance Budgets',
    schema: {
      type: 'object',
      requiredFields: ['budgets'],
      defaults: {
        budgets: {},
        alerts: [],
        snapshots: [],
      },
    },
    backup: false,
    critical: false,
  },
  {
    path: 'notes/notes-index.json',
    name: 'Notes Index',
    schema: {
      type: 'object',
      requiredFields: ['notes'],
      defaults: {
        notes: [],
        folders: [],
        config: {},
      },
    },
    backup: true,
    critical: false,
  },
  {
    path: 'tasks/tasks.json',
    name: 'Tasks',
    schema: {
      type: 'object',
      requiredFields: ['tasks'],
      defaults: {
        tasks: [],
        lists: [],
        reminders: [],
      },
    },
    backup: true,
    critical: false,
  },
];

// ===========================================================================
// STATE REPAIR SYSTEM
// ===========================================================================

class StateRepairSystemClass extends EventEmitter {
  private config: RepairConfig;
  private knownFiles: Map<string, StateFile> = new Map();
  private reports: CorruptionReport[] = [];
  private repairActions: RepairAction[] = [];
  private dataPath = '';
  private backupPath = '';
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    
    // Register known files
    for (const file of KNOWN_STATE_FILES) {
      this.knownFiles.set(file.path, file);
    }
    
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.dataPath = app.getPath('userData');
    this.backupPath = path.join(this.dataPath, 'backups', 'state');

    try {
      await fs.mkdir(this.backupPath, { recursive: true });
      await this.loadConfig();

      if (this.config.checkOnStartup) {
        await this.checkAllFiles();
      }

      if (this.config.checkInterval > 0) {
        this.startPeriodicChecks();
      }

      log.info('[StateRepair] Initialized');
    } catch (error) {
      log.error('[StateRepair] Initialization failed:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    const configFile = path.join(this.dataPath, 'state-repair-config.json');
    
    try {
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    const configFile = path.join(this.dataPath, 'state-repair-config.json');
    await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Check all files
    ipcMain.handle('stateRepair:checkAll', async () => {
      return this.checkAllFiles();
    });

    // Check specific file
    ipcMain.handle('stateRepair:check', async (_event, filePath: string) => {
      return this.checkFile(filePath);
    });

    // Repair file
    ipcMain.handle('stateRepair:repair', async (_event, filePath: string) => {
      return this.repairFile(filePath);
    });

    // Get health status
    ipcMain.handle('stateRepair:health', () => {
      return this.getHealth();
    });

    // Get corruption reports
    ipcMain.handle('stateRepair:reports', (_event, limit?: number) => {
      return this.reports.slice(-(limit || 20));
    });

    // Get repair actions
    ipcMain.handle('stateRepair:actions', (_event, limit?: number) => {
      return this.repairActions.slice(-(limit || 20));
    });

    // Create backup
    ipcMain.handle('stateRepair:backup', async (_event, filePath: string) => {
      return this.createBackup(filePath);
    });

    // List backups
    ipcMain.handle('stateRepair:backups', async (_event, filePath: string) => {
      return this.listBackups(filePath);
    });

    // Restore from backup
    ipcMain.handle('stateRepair:restore', async (_event, filePath: string, backupId: string) => {
      return this.restoreBackup(filePath, backupId);
    });

    // Register custom file
    ipcMain.handle('stateRepair:register', (_event, file: StateFile) => {
      return this.registerFile(file);
    });

    // Get config
    ipcMain.handle('stateRepair:config', () => {
      return this.config;
    });

    // Update config
    ipcMain.handle('stateRepair:setConfig', async (_event, updates: Partial<RepairConfig>) => {
      return this.updateConfig(updates);
    });
  }

  // -------------------------------------------------------------------------
  // FILE CHECKING
  // -------------------------------------------------------------------------

  async checkAllFiles(): Promise<StateHealth> {
    let corruptionFound = 0;
    let repairsAttempted = 0;
    let repairsSucceeded = 0;

    for (const [relativePath, fileSpec] of this.knownFiles) {
      const fullPath = path.join(this.dataPath, relativePath);
      
      const report = await this.checkFile(relativePath);
      
      if (report) {
        corruptionFound++;
        this.reports.push(report);

        if (this.config.autoRepair) {
          repairsAttempted++;
          const result = await this.repairFile(relativePath);
          if (result.success) {
            repairsSucceeded++;
            report.repaired = true;
          }
        }
      }
    }

    const health: StateHealth = {
      healthy: corruptionFound === 0 || repairsSucceeded === corruptionFound,
      filesChecked: this.knownFiles.size,
      corruptionFound,
      repairsAttempted,
      repairsSucceeded,
      lastCheck: Date.now(),
    };

    this.emit('check:complete', health);
    return health;
  }

  async checkFile(relativePath: string): Promise<CorruptionReport | null> {
    const fullPath = path.join(this.dataPath, relativePath);
    const fileSpec = this.knownFiles.get(relativePath);

    // File not registered
    if (!fileSpec) {
      return null;
    }

    // Check if file exists
    if (!fsSync.existsSync(fullPath)) {
      if (fileSpec.critical) {
        return {
          id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          file: relativePath,
          type: 'missing-file',
          details: 'Critical file is missing',
          repaired: false,
          action: 'Will recreate with defaults',
        };
      }
      return null; // Non-critical files don't need to exist
    }

    // Try to read and parse
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      let data: unknown;

      try {
        data = JSON.parse(content);
      } catch {
        return {
          id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          file: relativePath,
          type: 'invalid-json',
          details: 'File contains invalid JSON',
          repaired: false,
          action: 'Will restore from backup or recreate',
        };
      }

      // Check schema
      const schemaIssue = this.validateSchema(data, fileSpec.schema);
      if (schemaIssue) {
        return {
          id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          file: relativePath,
          type: schemaIssue.type,
          details: schemaIssue.details,
          repaired: false,
          action: 'Will apply defaults for missing fields',
        };
      }

      return null; // File is healthy
    } catch (error) {
      const isPermissionError = (error as NodeJS.ErrnoException).code === 'EACCES';
      
      return {
        id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        file: relativePath,
        type: isPermissionError ? 'permission-denied' : 'file-locked',
        details: String(error),
        repaired: false,
        action: 'Manual intervention required',
      };
    }
  }

  private validateSchema(data: unknown, schema: StateSchema): { type: CorruptionType; details: string } | null {
    if (schema.type === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data))) {
      return { type: 'invalid-values', details: 'Expected object but got different type' };
    }

    if (schema.type === 'array' && !Array.isArray(data)) {
      return { type: 'invalid-values', details: 'Expected array but got different type' };
    }

    if (schema.requiredFields && typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const missingFields = schema.requiredFields.filter(f => !(f in obj));
      
      if (missingFields.length > 0) {
        return { 
          type: 'missing-fields', 
          details: `Missing required fields: ${missingFields.join(', ')}` 
        };
      }
    }

    if (schema.validate && !schema.validate(data)) {
      return { type: 'invalid-values', details: 'Custom validation failed' };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // REPAIR
  // -------------------------------------------------------------------------

  async repairFile(relativePath: string): Promise<RepairAction> {
    const fullPath = path.join(this.dataPath, relativePath);
    const fileSpec = this.knownFiles.get(relativePath);

    if (!fileSpec) {
      return {
        file: relativePath,
        action: 'recreate',
        success: false,
      };
    }

    const action: RepairAction = {
      file: relativePath,
      action: 'recreate',
      success: false,
    };

    try {
      // Try to load existing data
      let existingData: unknown = null;
      if (fsSync.existsSync(fullPath)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          existingData = JSON.parse(content);
          action.before = existingData;
        } catch {
          // Can't read existing data
        }
      }

      // Try to restore from backup first
      if (fileSpec.backup) {
        const backups = await this.listBackups(relativePath);
        
        if (backups.length > 0) {
          const restored = await this.restoreBackup(relativePath, backups[0].id);
          if (restored.success) {
            action.action = 'restore-backup';
            action.success = true;
            action.after = restored.data;
            this.repairActions.push(action);
            
            log.info(`[StateRepair] Restored ${relativePath} from backup`);
            this.emit('repair:success', action);
            return action;
          }
        }
      }

      // Apply defaults
      let repairedData: unknown;
      
      if (existingData && typeof existingData === 'object') {
        // Merge with defaults
        repairedData = this.mergeWithDefaults(existingData, fileSpec.schema.defaults || {});
        action.action = 'apply-defaults';
      } else {
        // Recreate from defaults
        repairedData = fileSpec.schema.defaults || {};
        action.action = 'recreate';
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write repaired data
      await fs.writeFile(fullPath, JSON.stringify(repairedData, null, 2));
      
      action.after = repairedData;
      action.success = true;
      this.repairActions.push(action);

      log.info(`[StateRepair] Repaired ${relativePath} (${action.action})`);
      this.emit('repair:success', action);

    } catch (error) {
      log.error(`[StateRepair] Failed to repair ${relativePath}:`, error);
      action.success = false;
      this.emit('repair:failed', action);
    }

    return action;
  }

  private mergeWithDefaults(data: unknown, defaults: Record<string, unknown>): unknown {
    if (typeof data !== 'object' || data === null) {
      return defaults;
    }

    const result = { ...defaults };
    const obj = data as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // BACKUPS
  // -------------------------------------------------------------------------

  async createBackup(relativePath: string): Promise<{ success: boolean; backupId?: string }> {
    const fullPath = path.join(this.dataPath, relativePath);
    
    if (!fsSync.existsSync(fullPath)) {
      return { success: false };
    }

    const backupId = `backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const backupDir = path.join(this.backupPath, relativePath.replace(/[\/\\]/g, '_'));
    const backupFile = path.join(backupDir, `${backupId}.json`);

    try {
      await fs.mkdir(backupDir, { recursive: true });
      await fs.copyFile(fullPath, backupFile);

      // Enforce max backups
      await this.pruneBackups(relativePath);

      log.debug(`[StateRepair] Created backup: ${backupId}`);
      return { success: true, backupId };
    } catch (error) {
      log.error('[StateRepair] Failed to create backup:', error);
      return { success: false };
    }
  }

  async listBackups(relativePath: string): Promise<Array<{ id: string; timestamp: number; size: number }>> {
    const backupDir = path.join(this.backupPath, relativePath.replace(/[\/\\]/g, '_'));
    
    if (!fsSync.existsSync(backupDir)) {
      return [];
    }

    try {
      const files = await fs.readdir(backupDir);
      const backups: Array<{ id: string; timestamp: number; size: number }> = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(backupDir, file);
        const stat = await fs.stat(filePath);
        const id = file.replace('.json', '');

        // Extract timestamp from ID
        const match = id.match(/backup-(\d+)-/);
        const timestamp = match ? parseInt(match[1]) : stat.mtimeMs;

        backups.push({
          id,
          timestamp,
          size: stat.size,
        });
      }

      // Sort by timestamp (newest first)
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  async restoreBackup(relativePath: string, backupId: string): Promise<{ success: boolean; data?: unknown }> {
    const fullPath = path.join(this.dataPath, relativePath);
    const backupDir = path.join(this.backupPath, relativePath.replace(/[\/\\]/g, '_'));
    const backupFile = path.join(backupDir, `${backupId}.json`);

    if (!fsSync.existsSync(backupFile)) {
      return { success: false };
    }

    try {
      // Backup current file first (if exists)
      if (fsSync.existsSync(fullPath)) {
        await this.createBackup(relativePath);
      }

      // Read backup
      const content = await fs.readFile(backupFile, 'utf-8');
      const data = JSON.parse(content);

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Restore
      await fs.copyFile(backupFile, fullPath);

      log.info(`[StateRepair] Restored from backup: ${backupId}`);
      return { success: true, data };
    } catch (error) {
      log.error('[StateRepair] Failed to restore backup:', error);
      return { success: false };
    }
  }

  private async pruneBackups(relativePath: string): Promise<void> {
    const backups = await this.listBackups(relativePath);
    
    if (backups.length <= this.config.maxBackups) return;

    const backupDir = path.join(this.backupPath, relativePath.replace(/[\/\\]/g, '_'));
    const toDelete = backups.slice(this.config.maxBackups);

    for (const backup of toDelete) {
      try {
        await fs.unlink(path.join(backupDir, `${backup.id}.json`));
      } catch {
        // Ignore errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // FILE REGISTRATION
  // -------------------------------------------------------------------------

  registerFile(file: StateFile): { success: boolean } {
    this.knownFiles.set(file.path, file);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // PERIODIC CHECKS
  // -------------------------------------------------------------------------

  private startPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    const intervalMs = this.config.checkInterval * 60 * 60 * 1000;
    
    this.checkInterval = setInterval(() => {
      this.checkAllFiles();
    }, intervalMs);
  }

  // -------------------------------------------------------------------------
  // GETTERS
  // -------------------------------------------------------------------------

  getHealth(): StateHealth {
    const recentReports = this.reports.filter(r => r.timestamp > Date.now() - 24 * 60 * 60 * 1000);
    const recentRepairs = this.repairActions.filter(a => a.file && this.reports.some(r => r.file === a.file));

    return {
      healthy: recentReports.every(r => r.repaired),
      filesChecked: this.knownFiles.size,
      corruptionFound: recentReports.length,
      repairsAttempted: recentRepairs.length,
      repairsSucceeded: recentRepairs.filter(a => a.success).length,
      lastCheck: this.reports.length > 0 ? this.reports[this.reports.length - 1].timestamp : 0,
    };
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async updateConfig(updates: Partial<RepairConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();

    if ('checkInterval' in updates) {
      if (updates.checkInterval && updates.checkInterval > 0) {
        this.startPeriodicChecks();
      } else if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const StateRepairSystem = new StateRepairSystemClass();
