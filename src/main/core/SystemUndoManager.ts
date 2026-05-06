// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 4: System-Level Undo & Safety (SCOPED)
// ===========================================================================
// Introduce SCOPED System Undo.
// Undo file operations done in Dex. Preview undo effects.
// Time-based checkpoints. Safe restore after mistakes.
// No silent irreversible actions. Clear rollback paths.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, dialog } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type OperationType = 
  | 'file-create'
  | 'file-delete'
  | 'file-rename'
  | 'file-move'
  | 'file-modify'
  | 'folder-create'
  | 'folder-delete'
  | 'folder-rename'
  | 'setting-change'
  | 'automation-run'
  | 'intent-change';

export interface OperationRecord {
  id: string;
  type: OperationType;
  timestamp: number;
  description: string;
  
  // What was affected
  target: {
    path?: string;
    type: 'file' | 'folder' | 'setting' | 'automation' | 'intent';
    name: string;
  };
  
  // Data needed for undo
  undoData: {
    previousPath?: string;
    previousContent?: string;  // For file modifications (stored if small)
    backupPath?: string;       // Path to backup file (for large files)
    previousValue?: any;       // For settings
    wasNewlyCreated?: boolean;
  };
  
  // State
  canUndo: boolean;
  undoExpires?: number;        // Time after which undo is no longer available
  undoneAt?: number;
  undoError?: string;
  
  // Context
  intentId?: string;
  automationId?: string;
  scope: 'user' | 'automation' | 'system';
}

export interface Checkpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  operationIds: string[];      // Operations since last checkpoint
  automatic: boolean;
  
  // State snapshot
  snapshot?: {
    openFiles: string[];
    activeIntentId?: string;
    windowState?: any;
  };
}

export interface UndoPreview {
  operationId: string;
  operation: OperationRecord;
  effects: Array<{
    type: 'restore' | 'delete' | 'revert';
    target: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
  }>;
  warnings: string[];
  canProceed: boolean;
  blockedReason?: string;
}

export interface RollbackPlan {
  checkpointId: string;
  checkpoint: Checkpoint;
  operationsToUndo: OperationRecord[];
  estimatedTime: number;
  risks: string[];
  preview: UndoPreview[];
}

// ===========================================================================
// SYSTEM UNDO MANAGER
// ===========================================================================

class SystemUndoManagerClass extends EventEmitter {
  private operations: Map<string, OperationRecord> = new Map();
  private checkpoints: Map<string, Checkpoint> = new Map();
  private backupPath: string;
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Limits
  private readonly MAX_OPERATIONS = 1000;
  private readonly MAX_CHECKPOINTS = 50;
  private readonly MAX_BACKUP_SIZE_MB = 10;
  private readonly UNDO_EXPIRY_HOURS = 24;
  private readonly AUTO_CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes

  private autoCheckpointInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'undo');
    this.backupPath = path.join(this.dataPath, 'backups');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadData();
    this.registerIPCHandlers();
    this.startAutoCheckpoints();

    this.isInitialized = true;
    log.info('[SystemUndo] System undo manager initialized');
  }

  shutdown(): void {
    if (this.autoCheckpointInterval) {
      clearInterval(this.autoCheckpointInterval);
      this.autoCheckpointInterval = null;
    }
    this.saveData();
    this.removeAllListeners();
    log.info('[SystemUndo] System undo manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      const opsPath = path.join(this.dataPath, 'operations.json');
      if (fs.existsSync(opsPath)) {
        const data = JSON.parse(fs.readFileSync(opsPath, 'utf-8'));
        for (const op of data.operations || []) {
          this.operations.set(op.id, op);
        }
      }

      const checkPath = path.join(this.dataPath, 'checkpoints.json');
      if (fs.existsSync(checkPath)) {
        const data = JSON.parse(fs.readFileSync(checkPath, 'utf-8'));
        for (const cp of data.checkpoints || []) {
          this.checkpoints.set(cp.id, cp);
        }
      }

      log.info(`[SystemUndo] Loaded ${this.operations.size} operations, ${this.checkpoints.size} checkpoints`);
    } catch (error) {
      log.error('[SystemUndo] Failed to load data:', error);
    }
  }

  private saveData(): void {
    try {
      const opsPath = path.join(this.dataPath, 'operations.json');
      fs.writeFileSync(opsPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        operations: Array.from(this.operations.values()),
      }, null, 2));

      const checkPath = path.join(this.dataPath, 'checkpoints.json');
      fs.writeFileSync(checkPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        checkpoints: Array.from(this.checkpoints.values()),
      }, null, 2));
    } catch (error) {
      log.error('[SystemUndo] Failed to save data:', error);
    }
  }

  private startAutoCheckpoints(): void {
    // Create initial checkpoint
    this.createCheckpoint('Session Start', true);

    this.autoCheckpointInterval = setInterval(() => {
      this.createCheckpoint('Auto Checkpoint', true);
    }, this.AUTO_CHECKPOINT_INTERVAL_MS);
  }

  // -------------------------------------------------------------------------
  // OPERATION RECORDING
  // -------------------------------------------------------------------------

  /**
   * Record a file operation (MUST be called by all file operations in Dex)
   */
  async recordOperation(params: {
    type: OperationType;
    target: OperationRecord['target'];
    description: string;
    intentId?: string;
    automationId?: string;
    scope?: OperationRecord['scope'];
    previousContent?: string;
    previousPath?: string;
    previousValue?: any;
    wasNewlyCreated?: boolean;
  }): Promise<OperationRecord> {
    const now = Date.now();

    const operation: OperationRecord = {
      id: crypto.randomUUID(),
      type: params.type,
      timestamp: now,
      description: params.description,
      target: params.target,
      undoData: {
        previousPath: params.previousPath,
        previousValue: params.previousValue,
        wasNewlyCreated: params.wasNewlyCreated,
      },
      canUndo: true,
      undoExpires: now + (this.UNDO_EXPIRY_HOURS * 60 * 60 * 1000),
      intentId: params.intentId,
      automationId: params.automationId,
      scope: params.scope || 'user',
    };

    // Handle content backup
    if (params.previousContent !== undefined) {
      const contentSize = Buffer.byteLength(params.previousContent, 'utf-8');
      const maxSize = this.MAX_BACKUP_SIZE_MB * 1024 * 1024;

      if (contentSize <= maxSize) {
        operation.undoData.previousContent = params.previousContent;
      } else {
        // Save to backup file
        const backupFilePath = path.join(this.backupPath, `${operation.id}.backup`);
        fs.writeFileSync(backupFilePath, params.previousContent);
        operation.undoData.backupPath = backupFilePath;
      }
    }

    // For file deletions, always backup the file
    if (params.type === 'file-delete' && params.target.path && fs.existsSync(params.target.path)) {
      const stats = fs.statSync(params.target.path);
      if (stats.size <= this.MAX_BACKUP_SIZE_MB * 1024 * 1024) {
        const content = fs.readFileSync(params.target.path, 'utf-8');
        operation.undoData.previousContent = content;
      } else {
        const backupFilePath = path.join(this.backupPath, `${operation.id}.backup`);
        fs.copyFileSync(params.target.path, backupFilePath);
        operation.undoData.backupPath = backupFilePath;
      }
    }

    this.operations.set(operation.id, operation);
    this.cleanupOldOperations();
    
    this.emit('operation-recorded', operation);
    log.debug(`[SystemUndo] Recorded: ${params.type} - ${params.description}`);

    return operation;
  }

  private cleanupOldOperations(): void {
    const now = Date.now();
    const ops = Array.from(this.operations.values());

    // Remove expired operations
    for (const op of ops) {
      if (op.undoExpires && op.undoExpires < now) {
        this.removeOperation(op.id);
      }
    }

    // Keep only MAX_OPERATIONS
    if (this.operations.size > this.MAX_OPERATIONS) {
      const sorted = ops.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = sorted.slice(0, sorted.length - this.MAX_OPERATIONS);
      for (const op of toRemove) {
        this.removeOperation(op.id);
      }
    }
  }

  private removeOperation(operationId: string): void {
    const op = this.operations.get(operationId);
    if (op) {
      // Clean up backup file if exists
      if (op.undoData.backupPath && fs.existsSync(op.undoData.backupPath)) {
        fs.unlinkSync(op.undoData.backupPath);
      }
      this.operations.delete(operationId);
    }
  }

  // -------------------------------------------------------------------------
  // UNDO OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Generate undo preview WITHOUT performing undo
   */
  generateUndoPreview(operationId: string): UndoPreview | null {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return null;
    }

    const effects: UndoPreview['effects'] = [];
    const warnings: string[] = [];
    let canProceed = true;
    let blockedReason: string | undefined;

    // Check if undo is still available
    if (!operation.canUndo) {
      canProceed = false;
      blockedReason = 'This operation has already been undone';
    }

    if (operation.undoExpires && operation.undoExpires < Date.now()) {
      canProceed = false;
      blockedReason = 'Undo window has expired';
    }

    // Determine effects based on operation type
    switch (operation.type) {
      case 'file-create':
        effects.push({
          type: 'delete',
          target: operation.target.path || operation.target.name,
          description: `Delete newly created file: ${operation.target.name}`,
          risk: operation.undoData.wasNewlyCreated ? 'low' : 'medium',
        });
        break;

      case 'file-delete':
        if (operation.undoData.previousContent || operation.undoData.backupPath) {
          effects.push({
            type: 'restore',
            target: operation.target.path || operation.target.name,
            description: `Restore deleted file: ${operation.target.name}`,
            risk: 'low',
          });
        } else {
          canProceed = false;
          blockedReason = 'Cannot restore: backup not available';
        }
        break;

      case 'file-rename':
      case 'file-move':
        if (operation.undoData.previousPath) {
          effects.push({
            type: 'restore',
            target: operation.undoData.previousPath,
            description: `Move back to: ${operation.undoData.previousPath}`,
            risk: 'low',
          });
          
          // Check if current location still exists
          if (operation.target.path && !fs.existsSync(operation.target.path)) {
            warnings.push('File has been moved or deleted since this operation');
            canProceed = false;
            blockedReason = 'Cannot undo: file no longer exists at expected location';
          }
        }
        break;

      case 'file-modify':
        if (operation.undoData.previousContent || operation.undoData.backupPath) {
          effects.push({
            type: 'revert',
            target: operation.target.path || operation.target.name,
            description: `Revert to previous content`,
            risk: 'medium',
          });

          // Check if file has been modified since
          if (operation.target.path && fs.existsSync(operation.target.path)) {
            const currentContent = fs.readFileSync(operation.target.path, 'utf-8');
            // Just warn, don't block
            warnings.push('File may have been modified since this operation');
          }
        } else {
          canProceed = false;
          blockedReason = 'Cannot revert: previous content not available';
        }
        break;

      case 'setting-change':
        if (operation.undoData.previousValue !== undefined) {
          effects.push({
            type: 'revert',
            target: operation.target.name,
            description: `Revert setting to previous value`,
            risk: 'low',
          });
        }
        break;
    }

    return {
      operationId,
      operation,
      effects,
      warnings,
      canProceed,
      blockedReason,
    };
  }

  /**
   * Execute undo AFTER user confirms preview
   */
  async executeUndo(operationId: string): Promise<{ success: boolean; error?: string }> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { success: false, error: 'Operation not found' };
    }

    // Generate preview to check if undo is possible
    const preview = this.generateUndoPreview(operationId);
    if (!preview?.canProceed) {
      return { success: false, error: preview?.blockedReason || 'Cannot undo this operation' };
    }

    try {
      switch (operation.type) {
        case 'file-create':
          if (operation.target.path && fs.existsSync(operation.target.path)) {
            // Backup before deleting (in case user wants to redo)
            const content = fs.readFileSync(operation.target.path, 'utf-8');
            operation.undoData.previousContent = content;
            fs.unlinkSync(operation.target.path);
          }
          break;

        case 'file-delete':
          const contentToRestore = operation.undoData.previousContent || 
            (operation.undoData.backupPath ? fs.readFileSync(operation.undoData.backupPath, 'utf-8') : null);
          
          if (contentToRestore && operation.target.path) {
            // Ensure directory exists
            const dir = path.dirname(operation.target.path);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(operation.target.path, contentToRestore);
          }
          break;

        case 'file-rename':
        case 'file-move':
          if (operation.target.path && operation.undoData.previousPath) {
            // Ensure target directory exists
            const dir = path.dirname(operation.undoData.previousPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.renameSync(operation.target.path, operation.undoData.previousPath);
          }
          break;

        case 'file-modify':
          const previousContent = operation.undoData.previousContent ||
            (operation.undoData.backupPath ? fs.readFileSync(operation.undoData.backupPath, 'utf-8') : null);
          
          if (previousContent && operation.target.path) {
            // Save current content for potential redo
            const currentContent = fs.readFileSync(operation.target.path, 'utf-8');
            operation.undoData.previousContent = currentContent;
            
            fs.writeFileSync(operation.target.path, previousContent);
          }
          break;

        case 'setting-change':
          // Setting changes would be handled by the settings system
          this.emit('setting-undo-requested', {
            operationId,
            settingName: operation.target.name,
            previousValue: operation.undoData.previousValue,
          });
          break;
      }

      operation.canUndo = false;
      operation.undoneAt = Date.now();

      this.emit('operation-undone', operation);
      this.saveData();

      log.info(`[SystemUndo] Undone: ${operation.type} - ${operation.description}`);
      return { success: true };
    } catch (error) {
      operation.undoError = String(error);
      log.error(`[SystemUndo] Undo failed:`, error);
      return { success: false, error: String(error) };
    }
  }

  // -------------------------------------------------------------------------
  // CHECKPOINTS
  // -------------------------------------------------------------------------

  /**
   * Create a checkpoint
   */
  createCheckpoint(name: string, automatic: boolean = false, snapshot?: Checkpoint['snapshot']): Checkpoint {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      name,
      timestamp: Date.now(),
      operationIds: this.getOperationsSinceLastCheckpoint(),
      automatic,
      snapshot,
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.cleanupOldCheckpoints();

    this.emit('checkpoint-created', checkpoint);
    log.info(`[SystemUndo] Checkpoint created: ${name}`);

    return checkpoint;
  }

  private getOperationsSinceLastCheckpoint(): string[] {
    const checkpointList = Array.from(this.checkpoints.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const lastCheckpoint = checkpointList[0];
    const sinceTime = lastCheckpoint?.timestamp || 0;

    return Array.from(this.operations.values())
      .filter(op => op.timestamp > sinceTime)
      .map(op => op.id);
  }

  private cleanupOldCheckpoints(): void {
    if (this.checkpoints.size > this.MAX_CHECKPOINTS) {
      const sorted = Array.from(this.checkpoints.values())
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const toRemove = sorted
        .filter(cp => cp.automatic)  // Only remove automatic checkpoints
        .slice(0, sorted.length - this.MAX_CHECKPOINTS);
      
      for (const cp of toRemove) {
        this.checkpoints.delete(cp.id);
      }
    }
  }

  /**
   * Generate rollback plan for a checkpoint
   */
  generateRollbackPlan(checkpointId: string): RollbackPlan | null {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return null;
    }

    // Get all operations after this checkpoint
    const operationsToUndo = Array.from(this.operations.values())
      .filter(op => op.timestamp > checkpoint.timestamp && op.canUndo)
      .sort((a, b) => b.timestamp - a.timestamp);  // Reverse order for undo

    const previews = operationsToUndo
      .map(op => this.generateUndoPreview(op.id))
      .filter((p): p is UndoPreview => p !== null);

    const risks: string[] = [];
    
    if (operationsToUndo.length > 10) {
      risks.push(`Rolling back ${operationsToUndo.length} operations - this is a significant change`);
    }

    const hasAutomationOps = operationsToUndo.some(op => op.scope === 'automation');
    if (hasAutomationOps) {
      risks.push('Some operations were performed by automations - rollback may affect automation state');
    }

    const unbundlableOps = previews.filter(p => !p.canProceed);
    if (unbundlableOps.length > 0) {
      risks.push(`${unbundlableOps.length} operations cannot be undone - rollback will be partial`);
    }

    return {
      checkpointId,
      checkpoint,
      operationsToUndo,
      estimatedTime: operationsToUndo.length * 100,  // ~100ms per operation
      risks,
      preview: previews,
    };
  }

  /**
   * Execute rollback to checkpoint
   */
  async executeRollback(checkpointId: string): Promise<{ 
    success: boolean; 
    undoneCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const plan = this.generateRollbackPlan(checkpointId);
    if (!plan) {
      return { success: false, undoneCount: 0, failedCount: 0, errors: ['Checkpoint not found'] };
    }

    let undoneCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Execute undos in reverse chronological order
    for (const operation of plan.operationsToUndo) {
      const result = await this.executeUndo(operation.id);
      if (result.success) {
        undoneCount++;
      } else {
        failedCount++;
        errors.push(`${operation.description}: ${result.error}`);
      }
    }

    this.emit('rollback-completed', {
      checkpointId,
      undoneCount,
      failedCount,
    });

    return {
      success: failedCount === 0,
      undoneCount,
      failedCount,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get recent operations
   */
  getRecentOperations(limit: number = 50): OperationRecord[] {
    return Array.from(this.operations.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get undoable operations
   */
  getUndoableOperations(): OperationRecord[] {
    const now = Date.now();
    return Array.from(this.operations.values())
      .filter(op => op.canUndo && (!op.undoExpires || op.undoExpires > now))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get operations for an intent
   */
  getIntentOperations(intentId: string): OperationRecord[] {
    return Array.from(this.operations.values())
      .filter(op => op.intentId === intentId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get all checkpoints
   */
  getAllCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get operation by ID
   */
  getOperation(operationId: string): OperationRecord | null {
    return this.operations.get(operationId) || null;
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Recording (internal use)
    ipcMain.handle('undo:recordOperation', async (_, params) => 
      this.recordOperation(params));

    // Undo operations
    ipcMain.handle('undo:generatePreview', (_, operationId) => 
      this.generateUndoPreview(operationId));
    
    ipcMain.handle('undo:execute', async (_, operationId) => 
      this.executeUndo(operationId));

    // Checkpoints
    ipcMain.handle('undo:createCheckpoint', (_, name, snapshot) => 
      this.createCheckpoint(name, false, snapshot));
    
    ipcMain.handle('undo:generateRollbackPlan', (_, checkpointId) => 
      this.generateRollbackPlan(checkpointId));
    
    ipcMain.handle('undo:executeRollback', async (_, checkpointId) => 
      this.executeRollback(checkpointId));

    // Queries
    ipcMain.handle('undo:getRecentOperations', (_, limit) => 
      this.getRecentOperations(limit));
    
    ipcMain.handle('undo:getUndoableOperations', () => 
      this.getUndoableOperations());
    
    ipcMain.handle('undo:getIntentOperations', (_, intentId) => 
      this.getIntentOperations(intentId));
    
    ipcMain.handle('undo:getAllCheckpoints', () => 
      this.getAllCheckpoints());
    
    ipcMain.handle('undo:getOperation', (_, operationId) => 
      this.getOperation(operationId));
  }
}

// Singleton instance
export const systemUndoManager = new SystemUndoManagerClass();

export async function initializeSystemUndo(): Promise<void> {
  return systemUndoManager.initialize();
}

export function shutdownSystemUndo(): void {
  systemUndoManager.shutdown();
}
