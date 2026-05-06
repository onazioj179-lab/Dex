// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Automation Engine
 * ===========================================================================
 * 
 * Real, end-to-end automation system for:
 * - File triggers (manual or approved events)
 * - Data processing steps
 * - Conditional logic (if/else)
 * - Output steps (save, notify, export)
 * 
 * PRINCIPLES:
 * - User-created automations only
 * - No hidden background execution
 * - Preview every step before running
 * - Manual trigger by default
 * - Full undo/rollback where possible
 */

import log from 'electron-log';
import { ipcMain, app, BrowserWindow, shell, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// Types
// ===========================================================================

export type TriggerType = 
  | 'manual'              // User-initiated
  | 'file_created'        // New file in watched folder
  | 'file_modified'       // File changed
  | 'schedule'            // Time-based (with approval)
  | 'event';              // App event

export type StepType =
  | 'filter'              // Conditional check
  | 'transform'           // Data transformation
  | 'move'                // Move file
  | 'copy'                // Copy file
  | 'rename'              // Rename file
  | 'tag'                 // Add tags/metadata
  | 'extract'             // Extract text content
  | 'summarize'           // AI summarization (BYO API)
  | 'transcribe'          // Audio transcription
  | 'notify'              // Send notification
  | 'save'                // Save to location
  | 'archive'             // Archive/compress
  | 'custom';             // Custom script

export interface AutomationStep {
  id: string;
  type: StepType;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  order: number;
}

export interface AutomationTrigger {
  type: TriggerType;
  config: {
    watchPath?: string;           // For file triggers
    patterns?: string[];          // File patterns (*.pdf, etc.)
    schedule?: string;            // Cron-like schedule
    eventType?: string;           // For event triggers
  };
  requiresApproval: boolean;      // Always true for non-manual
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  scope: {
    folders: string[];            // Allowed folders
    fileTypes: string[];          // Allowed file types
  };
  createdAt: number;
  updatedAt: number;
  lastRun: number | null;
  runCount: number;
  tags: string[];
}

export interface ExecutionLog {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: number;
  completedAt: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: {
    stepId: string;
    stepName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: any;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  }[];
  input: any;
  output: any;
  error?: string;
  canUndo: boolean;
  undoData?: any;
}

export interface ExecutionPreview {
  automationId: string;
  steps: {
    stepId: string;
    stepName: string;
    description: string;
    willExecute: boolean;
    warning?: string;
  }[];
  estimatedDuration: number;
  affectedFiles: string[];
  requiresApproval: boolean;
}

export interface AutomationEngineConfig {
  enabled: boolean;                // Global enable/disable
  maxConcurrent: number;           // Max concurrent executions
  defaultTimeout: number;          // Step timeout in seconds
  requirePreview: boolean;         // Always show preview
  autoApproveManual: boolean;      // Auto-approve manual triggers
}

// ===========================================================================
// Automation Engine
// ===========================================================================

class AutomationEngine {
  private mainWindow: BrowserWindow | null = null;
  private dataDir: string;
  private automationsFile: string;
  private logsFile: string;
  private configFile: string;
  
  private automations: Map<string, Automation> = new Map();
  private executionLogs: ExecutionLog[] = [];
  private runningExecutions: Map<string, ExecutionLog> = new Map();
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  
  private config: AutomationEngineConfig = {
    enabled: true,
    maxConcurrent: 3,
    defaultTimeout: 60,
    requirePreview: true,
    autoApproveManual: true,
  };

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'automations');
    this.automationsFile = path.join(this.dataDir, 'automations.json');
    this.logsFile = path.join(this.dataDir, 'logs.json');
    this.configFile = path.join(this.dataDir, 'config.json');
    
    this.initialize();
    this.registerIPCHandlers();
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
        this.config = { ...this.config, ...JSON.parse(data) };
      }
      
      // Load automations
      if (fs.existsSync(this.automationsFile)) {
        const data = fs.readFileSync(this.automationsFile, 'utf-8');
        const list: Automation[] = JSON.parse(data);
        list.forEach(a => this.automations.set(a.id, a));
      }
      
      // Load recent logs
      if (fs.existsSync(this.logsFile)) {
        const data = fs.readFileSync(this.logsFile, 'utf-8');
        this.executionLogs = JSON.parse(data);
        // Keep only last 100 logs
        if (this.executionLogs.length > 100) {
          this.executionLogs = this.executionLogs.slice(-100);
          this.saveLogs();
        }
      }
      
      // Start file watchers for enabled automations
      if (this.config.enabled) {
        this.startFileWatchers();
      }
      
      log.info('[AutomationEngine] Initialized:', {
        automations: this.automations.size,
        enabled: this.config.enabled,
      });
    } catch (err) {
      log.error('[AutomationEngine] Initialization error:', err);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ===========================================================================
  // Automation CRUD
  // ===========================================================================

  async createAutomation(data: Partial<Automation>): Promise<Automation> {
    const automation: Automation = {
      id: crypto.randomUUID(),
      name: data.name || 'New Automation',
      description: data.description || '',
      enabled: false,                   // Always start disabled
      trigger: data.trigger || { type: 'manual', config: {}, requiresApproval: false },
      steps: data.steps || [],
      scope: data.scope || { folders: [], fileTypes: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRun: null,
      runCount: 0,
      tags: data.tags || [],
    };
    
    // Ensure non-manual triggers require approval
    if (automation.trigger.type !== 'manual') {
      automation.trigger.requiresApproval = true;
    }
    
    this.automations.set(automation.id, automation);
    await this.saveAutomations();
    this.emitChange();
    
    return automation;
  }

  async updateAutomation(id: string, updates: Partial<Automation>): Promise<Automation | null> {
    const automation = this.automations.get(id);
    if (!automation) return null;
    
    const updated = {
      ...automation,
      ...updates,
      updatedAt: Date.now(),
    };
    
    // Ensure non-manual triggers require approval
    if (updated.trigger.type !== 'manual') {
      updated.trigger.requiresApproval = true;
    }
    
    this.automations.set(id, updated);
    await this.saveAutomations();
    
    // Update file watcher if needed
    if (updates.enabled !== undefined || updates.trigger) {
      this.updateFileWatcher(id);
    }
    
    this.emitChange();
    return updated;
  }

  async deleteAutomation(id: string): Promise<boolean> {
    this.stopFileWatcher(id);
    this.automations.delete(id);
    await this.saveAutomations();
    this.emitChange();
    return true;
  }

  async duplicateAutomation(id: string): Promise<Automation | null> {
    const original = this.automations.get(id);
    if (!original) return null;
    
    return this.createAutomation({
      ...original,
      name: `${original.name} (Copy)`,
      enabled: false,
    });
  }

  getAutomation(id: string): Automation | null {
    return this.automations.get(id) || null;
  }

  getAllAutomations(): Automation[] {
    return Array.from(this.automations.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ===========================================================================
  // Execution Preview
  // ===========================================================================

  async previewExecution(
    automationId: string,
    input: any
  ): Promise<ExecutionPreview | null> {
    const automation = this.automations.get(automationId);
    if (!automation) return null;
    
    const preview: ExecutionPreview = {
      automationId,
      steps: [],
      estimatedDuration: 0,
      affectedFiles: [],
      requiresApproval: automation.trigger.requiresApproval,
    };
    
    // Preview each step
    for (const step of automation.steps.sort((a, b) => a.order - b.order)) {
      const stepPreview = await this.previewStep(step, input);
      preview.steps.push(stepPreview);
      preview.estimatedDuration += this.estimateStepDuration(step);
      
      if (stepPreview.description.includes('file')) {
        // Track affected files
        if (input?.path) preview.affectedFiles.push(input.path);
      }
    }
    
    return preview;
  }

  private async previewStep(step: AutomationStep, input: any): Promise<{
    stepId: string;
    stepName: string;
    description: string;
    willExecute: boolean;
    warning?: string;
  }> {
    const descriptions: Record<StepType, (config: any, input: any) => string> = {
      filter: (c, i) => `Check if ${c.field} ${c.operator} ${c.value}`,
      transform: (c, i) => `Transform data using ${c.transform}`,
      move: (c, i) => `Move file to ${c.destination}`,
      copy: (c, i) => `Copy file to ${c.destination}`,
      rename: (c, i) => `Rename file using pattern: ${c.pattern}`,
      tag: (c, i) => `Add tags: ${c.tags?.join(', ')}`,
      extract: (c, i) => `Extract text content from file`,
      summarize: (c, i) => `Summarize content using AI`,
      transcribe: (c, i) => `Transcribe audio content`,
      notify: (c, i) => `Send notification: ${c.title}`,
      save: (c, i) => `Save output to ${c.path}`,
      archive: (c, i) => `Archive file to ${c.destination}`,
      custom: (c, i) => `Run custom script: ${c.scriptName}`,
    };
    
    let warning: string | undefined;
    
    // Check for potential issues
    if (step.type === 'move' || step.type === 'copy') {
      if (!step.config.destination) {
        warning = 'No destination specified';
      }
    }
    
    if (step.type === 'summarize' && !this.hasAIProvider()) {
      warning = 'No AI provider configured';
    }
    
    return {
      stepId: step.id,
      stepName: step.name,
      description: descriptions[step.type]?.(step.config, input) || 'Unknown step',
      willExecute: step.enabled && !warning,
      warning,
    };
  }

  private estimateStepDuration(step: AutomationStep): number {
    const estimates: Record<StepType, number> = {
      filter: 100,
      transform: 200,
      move: 500,
      copy: 1000,
      rename: 300,
      tag: 100,
      extract: 2000,
      summarize: 5000,
      transcribe: 10000,
      notify: 100,
      save: 500,
      archive: 2000,
      custom: 3000,
    };
    return estimates[step.type] || 1000;
  }

  private hasAIProvider(): boolean {
    // Check if AI provider is configured via environment or settings
    try {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasGemini = !!process.env.GOOGLE_AI_KEY;
      return hasOpenAI || hasAnthropic || hasGemini;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Execution
  // ===========================================================================

  async execute(
    automationId: string,
    input: any,
    options?: { skipPreview?: boolean; approved?: boolean }
  ): Promise<ExecutionLog> {
    const automation = this.automations.get(automationId);
    if (!automation) {
      throw new Error('Automation not found');
    }
    
    if (!this.config.enabled) {
      throw new Error('Automation engine is disabled');
    }
    
    if (!automation.enabled) {
      throw new Error('Automation is disabled');
    }
    
    // Check concurrent execution limit
    if (this.runningExecutions.size >= this.config.maxConcurrent) {
      throw new Error('Maximum concurrent executions reached');
    }
    
    // Create execution log
    const log: ExecutionLog = {
      id: crypto.randomUUID(),
      automationId,
      automationName: automation.name,
      startedAt: Date.now(),
      completedAt: null,
      status: 'running',
      steps: automation.steps.map(s => ({
        stepId: s.id,
        stepName: s.name,
        status: 'pending' as const,
      })),
      input,
      output: null,
      canUndo: false,
      undoData: {},
    };
    
    this.runningExecutions.set(log.id, log);
    this.emitExecutionStart(log);
    
    try {
      let currentData = input;
      const undoStack: any[] = [];
      
      // Execute steps in order
      for (const step of automation.steps.sort((a, b) => a.order - b.order)) {
        if (!step.enabled) {
          this.updateStepStatus(log, step.id, 'skipped');
          continue;
        }
        
        this.updateStepStatus(log, step.id, 'running');
        
        try {
          const result = await this.executeStep(step, currentData, undoStack);
          
          // Filter step can stop execution
          if (step.type === 'filter' && !result.passed) {
            this.updateStepStatus(log, step.id, 'skipped', { reason: 'Filter condition not met' });
            break;
          }
          
          currentData = result.output || currentData;
          this.updateStepStatus(log, step.id, 'completed', result);
        } catch (stepErr: any) {
          this.updateStepStatus(log, step.id, 'failed', { error: stepErr.message });
          throw stepErr;
        }
      }
      
      // Success
      log.status = 'completed';
      log.completedAt = Date.now();
      log.output = currentData;
      log.canUndo = undoStack.length > 0;
      log.undoData = { stack: undoStack };
      
      // Update automation stats
      automation.lastRun = Date.now();
      automation.runCount++;
      await this.saveAutomations();
      
    } catch (err: any) {
      log.status = 'failed';
      log.completedAt = Date.now();
      log.error = err.message;
    }
    
    this.runningExecutions.delete(log.id);
    this.executionLogs.push(log);
    await this.saveLogs();
    
    this.emitExecutionComplete(log);
    
    return log;
  }

  private async executeStep(
    step: AutomationStep,
    input: any,
    undoStack: any[]
  ): Promise<{ output?: any; passed?: boolean }> {
    const startTime = Date.now();
    
    switch (step.type) {
      case 'filter':
        return this.executeFilter(step.config, input);
        
      case 'move':
        return this.executeMove(step.config, input, undoStack);
        
      case 'copy':
        return this.executeCopy(step.config, input);
        
      case 'rename':
        return this.executeRename(step.config, input, undoStack);
        
      case 'tag':
        return this.executeTag(step.config, input);
        
      case 'extract':
        return this.executeExtract(step.config, input);
        
      case 'notify':
        return this.executeNotify(step.config, input);
        
      case 'save':
        return this.executeSave(step.config, input);
        
      case 'archive':
        return this.executeArchive(step.config, input);
        
      default:
        return { output: input };
    }
  }

  // Step implementations
  private async executeFilter(config: any, input: any): Promise<{ passed: boolean }> {
    const { field, operator, value } = config;
    const fieldValue = input[field];
    
    let passed = false;
    switch (operator) {
      case 'equals': passed = fieldValue === value; break;
      case 'contains': passed = String(fieldValue).includes(value); break;
      case 'startsWith': passed = String(fieldValue).startsWith(value); break;
      case 'endsWith': passed = String(fieldValue).endsWith(value); break;
      case 'matches': passed = new RegExp(value).test(String(fieldValue)); break;
      case 'gt': passed = Number(fieldValue) > Number(value); break;
      case 'lt': passed = Number(fieldValue) < Number(value); break;
    }
    
    return { passed };
  }

  private async executeMove(config: any, input: any, undoStack: any[]): Promise<{ output: any }> {
    const sourcePath = input.path || config.source;
    const destDir = config.destination;
    const destPath = path.join(destDir, path.basename(sourcePath));
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Store undo data
    undoStack.push({
      type: 'move',
      from: destPath,
      to: sourcePath,
    });
    
    fs.renameSync(sourcePath, destPath);
    
    return { output: { ...input, path: destPath, originalPath: sourcePath } };
  }

  private async executeCopy(config: any, input: any): Promise<{ output: any }> {
    const sourcePath = input.path || config.source;
    const destDir = config.destination;
    const destPath = path.join(destDir, path.basename(sourcePath));
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(sourcePath, destPath);
    
    return { output: { ...input, copyPath: destPath } };
  }

  private async executeRename(config: any, input: any, undoStack: any[]): Promise<{ output: any }> {
    const sourcePath = input.path;
    const dir = path.dirname(sourcePath);
    const ext = path.extname(sourcePath);
    const baseName = path.basename(sourcePath, ext);
    
    // Apply pattern
    let newName = config.pattern
      .replace('{name}', baseName)
      .replace('{ext}', ext)
      .replace('{date}', new Date().toISOString().split('T')[0])
      .replace('{time}', Date.now().toString());
    
    const newPath = path.join(dir, newName);
    
    undoStack.push({
      type: 'rename',
      from: newPath,
      to: sourcePath,
    });
    
    fs.renameSync(sourcePath, newPath);
    
    return { output: { ...input, path: newPath, originalPath: sourcePath } };
  }

  private async executeTag(config: any, input: any): Promise<{ output: any }> {
    // Add tags to input metadata
    return {
      output: {
        ...input,
        tags: [...(input.tags || []), ...(config.tags || [])],
      },
    };
  }

  private async executeExtract(config: any, input: any): Promise<{ output: any }> {
    const filePath = input.path;
    const ext = path.extname(filePath).toLowerCase();
    
    let content = '';
    
    if (['.txt', '.md', '.json', '.csv', '.xml'].includes(ext)) {
      content = fs.readFileSync(filePath, 'utf-8');
    } else {
      // For other files, just note that extraction would need additional tools
      content = `[Content extraction for ${ext} files requires additional processing]`;
    }
    
    return { output: { ...input, extractedContent: content } };
  }

  private async executeNotify(config: any, input: any): Promise<{ output: any }> {
    const notification = new Notification({
      title: config.title || 'Automation Complete',
      body: config.body || `Processed: ${input.path || 'data'}`,
    });
    notification.show();
    
    return { output: input };
  }

  private async executeSave(config: any, input: any): Promise<{ output: any }> {
    const outputPath = config.path;
    const data = config.field ? input[config.field] : input;
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    return { output: { ...input, savedTo: outputPath } };
  }

  private async executeArchive(config: any, input: any): Promise<{ output: any }> {
    // Simple implementation - in real world would use archiver
    const sourcePath = input.path;
    const destPath = config.destination || `${sourcePath}.archived`;
    
    fs.copyFileSync(sourcePath, destPath);
    
    return { output: { ...input, archivedTo: destPath } };
  }

  // ===========================================================================
  // Undo
  // ===========================================================================

  async undoExecution(logId: string): Promise<boolean> {
    const entry = this.executionLogs.find(l => l.id === logId);
    if (!entry || !entry.canUndo || !entry.undoData?.stack) {
      return false;
    }
    
    try {
      // Execute undo operations in reverse order
      const stack = [...entry.undoData.stack].reverse();
      
      for (const op of stack) {
        switch (op.type) {
          case 'move':
          case 'rename':
            if (fs.existsSync(op.from)) {
              fs.renameSync(op.from, op.to);
            }
            break;
        }
      }
      
      entry.canUndo = false;
      await this.saveLogs();
      
      return true;
    } catch (err) {
      log.error('[AutomationEngine] Undo error:', err);
      return false;
    }
  }

  // ===========================================================================
  // File Watchers
  // ===========================================================================

  private startFileWatchers(): void {
    for (const automation of this.automations.values()) {
      if (automation.enabled && automation.trigger.type === 'file_created') {
        this.startFileWatcher(automation);
      }
    }
  }

  private startFileWatcher(automation: Automation): void {
    const watchPath = automation.trigger.config.watchPath;
    if (!watchPath || !fs.existsSync(watchPath)) return;
    
    try {
      const watcher = fs.watch(watchPath, async (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          const fullPath = path.join(watchPath, filename);
          
          // Check if file matches patterns
          if (automation.trigger.config.patterns?.length) {
            const matches = automation.trigger.config.patterns.some(pattern => {
              const regex = new RegExp(pattern.replace('*', '.*'));
              return regex.test(filename);
            });
            if (!matches) return;
          }
          
          // Queue for approval (always requires approval for file triggers)
          this.queueForApproval(automation, { path: fullPath, filename });
        }
      });
      
      this.fileWatchers.set(automation.id, watcher);
    } catch (err) {
      log.error('[AutomationEngine] Watch error:', err);
    }
  }

  private stopFileWatcher(automationId: string): void {
    const watcher = this.fileWatchers.get(automationId);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(automationId);
    }
  }

  private updateFileWatcher(automationId: string): void {
    this.stopFileWatcher(automationId);
    
    const automation = this.automations.get(automationId);
    if (automation?.enabled && automation.trigger.type === 'file_created') {
      this.startFileWatcher(automation);
    }
  }

  private queueForApproval(automation: Automation, input: any): void {
    // Emit event for UI to show approval dialog
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('automation:approvalRequired', {
        automationId: automation.id,
        automationName: automation.name,
        input,
        timestamp: Date.now(),
      });
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private updateStepStatus(
    log: ExecutionLog,
    stepId: string,
    status: ExecutionLog['steps'][0]['status'],
    result?: any
  ): void {
    const step = log.steps.find(s => s.stepId === stepId);
    if (step) {
      step.status = status;
      if (status === 'running') {
        step.startedAt = Date.now();
      } else if (status === 'completed' || status === 'failed') {
        step.completedAt = Date.now();
        step.result = result;
      }
      if (result?.error) {
        step.error = result.error;
      }
    }
    
    this.emitExecutionUpdate(log);
  }

  private async saveAutomations(): Promise<void> {
    const list = Array.from(this.automations.values());
    fs.writeFileSync(this.automationsFile, JSON.stringify(list, null, 2));
  }

  private async saveLogs(): Promise<void> {
    fs.writeFileSync(this.logsFile, JSON.stringify(this.executionLogs, null, 2));
  }

  private emitChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('automation:changed');
    }
  }

  private emitExecutionStart(log: ExecutionLog): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('automation:executionStarted', log);
    }
  }

  private emitExecutionUpdate(log: ExecutionLog): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('automation:executionUpdated', log);
    }
  }

  private emitExecutionComplete(log: ExecutionLog): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('automation:executionCompleted', log);
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  getConfig(): AutomationEngineConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<AutomationEngineConfig>): Promise<boolean> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...updates };
    
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    
    // Handle enable/disable
    if (wasEnabled && !this.config.enabled) {
      // Stop all watchers
      for (const id of this.fileWatchers.keys()) {
        this.stopFileWatcher(id);
      }
    } else if (!wasEnabled && this.config.enabled) {
      this.startFileWatchers();
    }
    
    this.emitChange();
    return true;
  }

  // ===========================================================================
  // Logs
  // ===========================================================================

  getExecutionLogs(automationId?: string, limit?: number): ExecutionLog[] {
    let logs = this.executionLogs;
    
    if (automationId) {
      logs = logs.filter(l => l.automationId === automationId);
    }
    
    logs = logs.sort((a, b) => b.startedAt - a.startedAt);
    
    if (limit) {
      logs = logs.slice(0, limit);
    }
    
    return logs;
  }

  getRunningExecutions(): ExecutionLog[] {
    return Array.from(this.runningExecutions.values());
  }

  async cancelExecution(logId: string): Promise<boolean> {
    const log = this.runningExecutions.get(logId);
    if (!log) return false;
    
    log.status = 'cancelled';
    log.completedAt = Date.now();
    
    this.runningExecutions.delete(logId);
    this.executionLogs.push(log);
    await this.saveLogs();
    
    this.emitExecutionComplete(log);
    return true;
  }

  // ===========================================================================
  // IPC Handlers (uses 'automationEngine:' prefix to avoid conflict with AutomationController)
  // ===========================================================================

  private registerIPCHandlers(): void {
    ipcMain.handle('automationEngine:getConfig', () => this.getConfig());
    ipcMain.handle('automationEngine:updateConfig', (_, updates) => this.updateConfig(updates));
    
    ipcMain.handle('automationEngine:getAll', () => this.getAllAutomations());
    ipcMain.handle('automationEngine:get', (_, id) => this.getAutomation(id));
    ipcMain.handle('automationEngine:create', (_, data) => this.createAutomation(data));
    ipcMain.handle('automationEngine:update', (_, id, updates) => this.updateAutomation(id, updates));
    ipcMain.handle('automationEngine:delete', (_, id) => this.deleteAutomation(id));
    ipcMain.handle('automationEngine:duplicate', (_, id) => this.duplicateAutomation(id));
    
    ipcMain.handle('automationEngine:preview', (_, id, input) => this.previewExecution(id, input));
    ipcMain.handle('automationEngine:execute', (_, id, input, options) => this.execute(id, input, options));
    ipcMain.handle('automationEngine:cancel', (_, logId) => this.cancelExecution(logId));
    ipcMain.handle('automationEngine:undo', (_, logId) => this.undoExecution(logId));
    
    ipcMain.handle('automationEngine:getLogs', (_, automationId, limit) => 
      this.getExecutionLogs(automationId, limit)
    );
    ipcMain.handle('automationEngine:getRunning', () => this.getRunningExecutions());
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const automationEngine = new AutomationEngine();
export default automationEngine;
