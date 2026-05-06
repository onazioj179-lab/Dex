// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 5: Human-Centered Automation (READABLE, PREVIEWABLE)
// ===========================================================================
// Automation must be: Readable. Previewable. Confirmable. Stoppable.
// Plain-language automation rules. Dry-run by default.
// Human-readable execution timeline. Pause/stop mid-execution.
// No automation runs without user awareness.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app, dialog, Notification } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type TriggerType = 
  | 'manual'           // User explicitly runs
  | 'file-change'      // File modification detected
  | 'time-schedule'    // Scheduled time
  | 'intent-start'     // Intent session started
  | 'intent-end'       // Intent session ended
  | 'app-launch'       // App starts
  | 'condition-met';   // Custom condition

export type ActionType =
  | 'organize-files'
  | 'rename-files'
  | 'move-files'
  | 'backup-files'
  | 'run-script'
  | 'send-notification'
  | 'create-checkpoint'
  | 'open-app'
  | 'custom';

export interface AutomationTrigger {
  type: TriggerType;
  description: string;  // Human-readable: "When a new file is added to Downloads"
  
  // Type-specific config
  config: {
    watchPath?: string;
    pattern?: string;     // File pattern
    schedule?: string;    // Cron-like schedule
    condition?: string;   // Custom condition
    intentId?: string;
  };
}

export interface AutomationAction {
  id: string;
  type: ActionType;
  description: string;  // Human-readable: "Move to Documents/Work folder"
  
  // Type-specific config
  config: {
    sourcePath?: string;
    destinationPath?: string;
    pattern?: string;
    script?: string;
    appPath?: string;
    notificationTitle?: string;
    notificationBody?: string;
    custom?: Record<string, any>;
  };
  
  // Safety
  requiresConfirmation: boolean;
  maxFilesAffected?: number;  // Safety limit
  dryRunOnly?: boolean;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;  // Full plain-language description
  
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  
  // What triggers this
  trigger: AutomationTrigger;
  
  // What happens (in order)
  actions: AutomationAction[];
  
  // Safety settings
  settings: {
    dryRunByDefault: boolean;
    requirePreview: boolean;
    notifyOnRun: boolean;
    notifyOnComplete: boolean;
    maxRunsPerHour: number;
    pauseOnError: boolean;
  };
  
  // Stats
  stats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastError?: string;
  };
}

export interface ExecutionStep {
  actionId: string;
  action: AutomationAction;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  
  // What will/did happen
  preview: {
    affectedFiles: string[];
    changes: Array<{
      type: 'create' | 'move' | 'rename' | 'delete' | 'modify';
      from?: string;
      to?: string;
      description: string;
    }>;
  };
  
  result?: {
    success: boolean;
    error?: string;
    filesAffected: number;
  };
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  
  status: 'previewing' | 'awaiting-confirmation' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  
  startedAt: number;
  completedAt?: number;
  
  isDryRun: boolean;
  steps: ExecutionStep[];
  currentStepIndex: number;
  
  // User interaction
  userConfirmed: boolean;
  pausedBy?: 'user' | 'error';
  cancelReason?: string;
  
  // Summary
  summary?: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    filesAffected: number;
  };
}

export interface AutomationPreview {
  ruleId: string;
  ruleName: string;
  description: string;
  
  steps: Array<{
    action: AutomationAction;
    preview: ExecutionStep['preview'];
  }>;
  
  warnings: string[];
  risks: Array<{
    level: 'low' | 'medium' | 'high';
    description: string;
  }>;
  
  estimatedTime: number;
  canProceed: boolean;
  blockedReason?: string;
}

// ===========================================================================
// HUMAN-CENTERED AUTOMATION ENGINE
// ===========================================================================

class HumanCenteredAutomationClass extends EventEmitter {
  private rules: Map<string, AutomationRule> = new Map();
  private executions: Map<string, AutomationExecution> = new Map();
  private static readonly MAX_EXECUTIONS = 200;
  private activeExecution: AutomationExecution | null = null;
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Rate limiting
  private ruleRunCounts: Map<string, number[]> = new Map();

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'automation');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    await this.loadRules();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[Automation] Human-centered automation engine initialized');
  }

  shutdown(): void {
    // Stop any active execution
    if (this.activeExecution) {
      this.cancelExecution(this.activeExecution.id, 'System shutdown');
    }
    this.saveRules();
    this.removeAllListeners();
    log.info('[Automation] Automation engine shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private async loadRules(): Promise<void> {
    try {
      const rulesPath = path.join(this.dataPath, 'rules.json');
      if (fs.existsSync(rulesPath)) {
        const data = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        for (const rule of data.rules || []) {
          this.rules.set(rule.id, rule);
        }
      }
      log.info(`[Automation] Loaded ${this.rules.size} automation rules`);
    } catch (error) {
      log.error('[Automation] Failed to load rules:', error);
    }
  }

  private saveRules(): void {
    try {
      const rulesPath = path.join(this.dataPath, 'rules.json');
      fs.writeFileSync(rulesPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        rules: Array.from(this.rules.values()),
      }, null, 2));
    } catch (error) {
      log.error('[Automation] Failed to save rules:', error);
    }
  }

  // -------------------------------------------------------------------------
  // RULE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Create a new automation rule
   */
  createRule(params: {
    name: string;
    description: string;
    trigger: AutomationTrigger;
    actions: Omit<AutomationAction, 'id'>[];
    settings?: Partial<AutomationRule['settings']>;
  }): AutomationRule {
    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      enabled: false,  // Start disabled - user must enable
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trigger: params.trigger,
      actions: params.actions.map(a => ({
        ...a,
        id: crypto.randomUUID(),
      })),
      settings: {
        dryRunByDefault: true,
        requirePreview: true,
        notifyOnRun: true,
        notifyOnComplete: true,
        maxRunsPerHour: 10,
        pauseOnError: true,
        ...params.settings,
      },
      stats: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
      },
    };

    this.rules.set(rule.id, rule);
    this.saveRules();

    this.emit('rule-created', rule);
    log.info(`[Automation] Rule created: ${rule.name}`);

    return rule;
  }

  /**
   * Update an automation rule
   */
  updateRule(ruleId: string, updates: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>): AutomationRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const updated: AutomationRule = {
      ...rule,
      ...updates,
      updatedAt: Date.now(),
    };

    this.rules.set(ruleId, updated);
    this.saveRules();

    this.emit('rule-updated', updated);
    return updated;
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    rule.updatedAt = Date.now();
    this.saveRules();

    this.emit('rule-enabled-changed', { ruleId, enabled });
    return true;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    if (!this.rules.has(ruleId)) return false;
    
    this.rules.delete(ruleId);
    this.saveRules();

    this.emit('rule-deleted', ruleId);
    return true;
  }

  /**
   * Get human-readable explanation of a rule
   */
  explainRule(ruleId: string): string | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    let explanation = `**${rule.name}**\n\n`;
    explanation += `${rule.description}\n\n`;
    explanation += `**When:** ${rule.trigger.description}\n\n`;
    explanation += `**Then:**\n`;
    
    rule.actions.forEach((action, index) => {
      explanation += `${index + 1}. ${action.description}`;
      if (action.requiresConfirmation) {
        explanation += ' _(requires confirmation)_';
      }
      explanation += '\n';
    });

    explanation += `\n**Safety:** `;
    if (rule.settings.dryRunByDefault) {
      explanation += 'Dry-run first. ';
    }
    if (rule.settings.requirePreview) {
      explanation += 'Preview required. ';
    }
    if (rule.settings.notifyOnRun) {
      explanation += 'Notifies on start. ';
    }

    return explanation;
  }

  // -------------------------------------------------------------------------
  // EXECUTION PREVIEW
  // -------------------------------------------------------------------------

  /**
   * Generate preview of what automation will do (BEFORE running)
   */
  async generatePreview(ruleId: string): Promise<AutomationPreview | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const steps: AutomationPreview['steps'] = [];
    const warnings: string[] = [];
    const risks: AutomationPreview['risks'] = [];

    for (const action of rule.actions) {
      const actionPreview = await this.previewAction(action);
      steps.push({
        action,
        preview: actionPreview,
      });

      // Assess risks
      if (actionPreview.affectedFiles.length > 100) {
        risks.push({
          level: 'high',
          description: `${action.description} will affect ${actionPreview.affectedFiles.length} files`,
        });
      } else if (actionPreview.affectedFiles.length > 20) {
        risks.push({
          level: 'medium',
          description: `${action.description} will affect ${actionPreview.affectedFiles.length} files`,
        });
      }

      // Check for destructive actions
      const hasDeletes = actionPreview.changes.some(c => c.type === 'delete');
      if (hasDeletes) {
        risks.push({
          level: 'high',
          description: 'This automation includes file deletions',
        });
      }
    }

    // Check rate limiting
    if (this.isRateLimited(ruleId)) {
      warnings.push('This rule has been run many times recently. Consider waiting.');
    }

    const canProceed = risks.filter(r => r.level === 'high').length === 0 || rule.settings.dryRunByDefault;

    return {
      ruleId,
      ruleName: rule.name,
      description: rule.description,
      steps,
      warnings,
      risks,
      estimatedTime: steps.reduce((sum, s) => sum + s.preview.affectedFiles.length * 50, 0),
      canProceed,
      blockedReason: canProceed ? undefined : 'High-risk actions detected. Review carefully.',
    };
  }

  private async previewAction(action: AutomationAction): Promise<ExecutionStep['preview']> {
    const preview: ExecutionStep['preview'] = {
      affectedFiles: [],
      changes: [],
    };

    switch (action.type) {
      case 'organize-files':
      case 'move-files':
        if (action.config.sourcePath && action.config.destinationPath) {
          const files = this.findMatchingFiles(action.config.sourcePath, action.config.pattern);
          preview.affectedFiles = files;
          
          for (const file of files) {
            const destPath = path.join(
              action.config.destinationPath,
              path.basename(file)
            );
            preview.changes.push({
              type: 'move',
              from: file,
              to: destPath,
              description: `Move ${path.basename(file)} to ${action.config.destinationPath}`,
            });
          }
        }
        break;

      case 'rename-files':
        if (action.config.sourcePath && action.config.pattern) {
          const files = this.findMatchingFiles(action.config.sourcePath, action.config.pattern);
          preview.affectedFiles = files;
          // Rename preview would depend on rename pattern
        }
        break;

      case 'backup-files':
        if (action.config.sourcePath && action.config.destinationPath) {
          const files = this.findMatchingFiles(action.config.sourcePath, action.config.pattern);
          preview.affectedFiles = files;
          
          for (const file of files) {
            preview.changes.push({
              type: 'create',
              to: path.join(action.config.destinationPath, path.basename(file)),
              description: `Create backup of ${path.basename(file)}`,
            });
          }
        }
        break;

      case 'send-notification':
        preview.changes.push({
          type: 'create',
          description: `Show notification: "${action.config.notificationTitle}"`,
        });
        break;

      case 'create-checkpoint':
        preview.changes.push({
          type: 'create',
          description: 'Create system checkpoint',
        });
        break;
    }

    return preview;
  }

  private findMatchingFiles(dir: string, pattern?: string): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) return files;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name);
          if (!pattern || this.matchPattern(entry.name, pattern)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      log.warn(`[Automation] Failed to read directory ${dir}:`, error);
    }

    return files;
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob-like matching
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i'
    );
    return regex.test(filename);
  }

  // -------------------------------------------------------------------------
  // EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Start automation execution (with preview and confirmation flow)
   */
  async startExecution(ruleId: string, isDryRun?: boolean): Promise<AutomationExecution | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    // Check rate limiting
    if (this.isRateLimited(ruleId)) {
      log.warn(`[Automation] Rule ${rule.name} is rate limited`);
      return null;
    }

    // Use rule's dryRun setting if not specified
    const dryRun = isDryRun ?? rule.settings.dryRunByDefault;

    const execution: AutomationExecution = {
      id: crypto.randomUUID(),
      ruleId,
      ruleName: rule.name,
      status: 'previewing',
      startedAt: Date.now(),
      isDryRun: dryRun,
      steps: [],
      currentStepIndex: 0,
      userConfirmed: false,
    };

    // Generate steps with previews
    for (const action of rule.actions) {
      const preview = await this.previewAction(action);
      execution.steps.push({
        actionId: action.id,
        action,
        status: 'pending',
        preview,
      });
    }

    this.executions.set(execution.id, execution);
    // Evict oldest completed executions when map grows too large
    if (this.executions.size > HumanCenteredAutomationClass.MAX_EXECUTIONS) {
      const completed = [...this.executions.entries()]
        .filter(([, e]) => e.status === 'completed' || e.status === 'cancelled' || e.status === 'failed')
        .sort((a, b) => (a[1].completedAt ?? a[1].startedAt) - (b[1].completedAt ?? b[1].startedAt));
      const toRemove = completed.slice(0, this.executions.size - HumanCenteredAutomationClass.MAX_EXECUTIONS);
      for (const [id] of toRemove) this.executions.delete(id);
    }
    this.activeExecution = execution;

    // Notify user
    if (rule.settings.notifyOnRun) {
      new Notification({
        title: 'Automation Starting',
        body: `${rule.name} is ready to run. ${dryRun ? '(Dry Run)' : ''}`,
      }).show();
    }

    // If preview is required, wait for confirmation
    if (rule.settings.requirePreview) {
      execution.status = 'awaiting-confirmation';
      this.emit('execution-awaiting-confirmation', execution);
    } else {
      // Auto-confirm if preview not required
      execution.userConfirmed = true;
      this.continueExecution(execution.id);
    }

    this.emit('execution-started', execution);
    return execution;
  }

  /**
   * User confirms and continues execution
   */
  async confirmExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'awaiting-confirmation') {
      return false;
    }

    execution.userConfirmed = true;
    return this.continueExecution(executionId);
  }

  /**
   * Continue/resume execution
   */
  private async continueExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution) return false;

    execution.status = 'running';

    while (execution.currentStepIndex < execution.steps.length) {
      const step = execution.steps[execution.currentStepIndex];
      
      // Check if paused or cancelled
      if (execution.status !== 'running') {
        break;
      }

      step.status = 'running';
      step.startedAt = Date.now();
      
      this.emit('step-started', { executionId, stepIndex: execution.currentStepIndex, step });

      try {
        let stepResult: { success: boolean; filesAffected: number; error?: string };
        
        if (execution.isDryRun) {
          // Dry run - just simulate
          await this.simulateStep(step);
          stepResult = {
            success: true,
            filesAffected: step.preview.affectedFiles.length,
          };
        } else {
          // Real execution
          const result = await this.executeStep(step);
          stepResult = result || {
            success: false,
            filesAffected: 0,
            error: 'No result returned from step execution'
          };
        }
        
        step.result = stepResult;
        step.status = stepResult.success ? 'completed' : 'failed';
      } catch (error) {
        step.status = 'failed';
        step.result = {
          success: false,
          error: String(error),
          filesAffected: 0,
        };

        const rule = this.rules.get(execution.ruleId);
        if (rule?.settings.pauseOnError) {
          execution.status = 'paused';
          execution.pausedBy = 'error';
          this.emit('execution-paused', { executionId, reason: 'error', error: String(error) });
          break;
        }
      }

      step.completedAt = Date.now();
      this.emit('step-completed', { executionId, stepIndex: execution.currentStepIndex, step });
      
      execution.currentStepIndex++;
    }

    // Check if all steps completed
    if (execution.currentStepIndex >= execution.steps.length) {
      this.completeExecution(executionId);
    }

    return true;
  }

  private async simulateStep(step: ExecutionStep): Promise<void> {
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, 100));
    log.debug(`[Automation] Simulated: ${step.action.description}`);
  }

  private async executeStep(step: ExecutionStep): Promise<ExecutionStep['result']> {
    const action = step.action;
    let filesAffected = 0;

    try {
      switch (action.type) {
        case 'move-files':
        case 'organize-files':
          for (const change of step.preview.changes) {
            if (change.type === 'move' && change.from && change.to) {
              const destDir = path.dirname(change.to);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }
              fs.renameSync(change.from, change.to);
              filesAffected++;
            }
          }
          break;

        case 'backup-files':
          for (const change of step.preview.changes) {
            if (change.type === 'create' && change.to) {
              const sourceFile = step.preview.affectedFiles.find(
                f => path.basename(f) === path.basename(change.to!)
              );
              if (sourceFile && fs.existsSync(sourceFile)) {
                const destDir = path.dirname(change.to);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(sourceFile, change.to);
                filesAffected++;
              }
            }
          }
          break;

        case 'send-notification':
          new Notification({
            title: action.config.notificationTitle || 'Dex Automation',
            body: action.config.notificationBody || '',
          }).show();
          break;

        case 'create-checkpoint':
          this.emit('checkpoint-requested', { 
            name: `Automation: ${action.description}`,
            automationId: step.actionId,
          });
          break;
      }

      return {
        success: true,
        filesAffected,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        filesAffected,
      };
    }
  }

  private completeExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.status = 'completed';
    execution.completedAt = Date.now();
    execution.summary = {
      totalSteps: execution.steps.length,
      completedSteps: execution.steps.filter(s => s.status === 'completed').length,
      failedSteps: execution.steps.filter(s => s.status === 'failed').length,
      skippedSteps: execution.steps.filter(s => s.status === 'skipped').length,
      filesAffected: execution.steps.reduce(
        (sum, s) => sum + (s.result?.filesAffected || 0), 0
      ),
    };

    // Update rule stats
    const rule = this.rules.get(execution.ruleId);
    if (rule) {
      rule.stats.totalRuns++;
      if (execution.summary.failedSteps === 0) {
        rule.stats.successfulRuns++;
      } else {
        rule.stats.failedRuns++;
      }
      rule.lastRunAt = execution.completedAt;
      this.saveRules();
    }

    // Record run for rate limiting
    this.recordRun(execution.ruleId);

    // Notify user
    if (rule?.settings.notifyOnComplete) {
      new Notification({
        title: 'Automation Complete',
        body: `${execution.ruleName}: ${execution.summary.filesAffected} files affected`,
      }).show();
    }

    this.activeExecution = null;
    this.emit('execution-completed', execution);
    log.info(`[Automation] Completed: ${execution.ruleName}`);
  }

  /**
   * Pause execution
   */
  pauseExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'paused';
    execution.pausedBy = 'user';
    this.emit('execution-paused', { executionId, reason: 'user' });
    return true;
  }

  /**
   * Resume paused execution
   */
  async resumeExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'paused') {
      return false;
    }

    this.emit('execution-resumed', executionId);
    return this.continueExecution(executionId);
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string, reason?: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) return false;

    // Mark remaining steps as skipped
    for (let i = execution.currentStepIndex; i < execution.steps.length; i++) {
      if (execution.steps[i].status === 'pending') {
        execution.steps[i].status = 'skipped';
      }
    }

    execution.status = 'cancelled';
    execution.cancelReason = reason;
    execution.completedAt = Date.now();
    
    if (this.activeExecution?.id === executionId) {
      this.activeExecution = null;
    }

    this.emit('execution-cancelled', { executionId, reason });
    log.info(`[Automation] Cancelled: ${execution.ruleName} - ${reason}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // RATE LIMITING
  // -------------------------------------------------------------------------

  private isRateLimited(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return true;

    const runs = this.ruleRunCounts.get(ruleId) || [];
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentRuns = runs.filter(t => t > oneHourAgo);

    return recentRuns.length >= rule.settings.maxRunsPerHour;
  }

  private recordRun(ruleId: string): void {
    const runs = this.ruleRunCounts.get(ruleId) || [];
    runs.push(Date.now());
    
    // Keep only last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.ruleRunCounts.set(
      ruleId,
      runs.filter(t => t > oneHourAgo)
    );
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getAllRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  getRule(ruleId: string): AutomationRule | null {
    return this.rules.get(ruleId) || null;
  }

  getEnabledRules(): AutomationRule[] {
    return Array.from(this.rules.values()).filter(r => r.enabled);
  }

  getExecution(executionId: string): AutomationExecution | null {
    return this.executions.get(executionId) || null;
  }

  getActiveExecution(): AutomationExecution | null {
    return this.activeExecution;
  }

  getRecentExecutions(limit: number = 20): AutomationExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Rule management
    ipcMain.handle('automation:createRule', (_, params) => this.createRule(params));
    ipcMain.handle('automation:updateRule', (_, ruleId, updates) => this.updateRule(ruleId, updates));
    ipcMain.handle('automation:deleteRule', (_, ruleId) => this.deleteRule(ruleId));
    ipcMain.handle('automation:setEnabled', (_, ruleId, enabled) => this.setRuleEnabled(ruleId, enabled));
    ipcMain.handle('automation:explainRule', (_, ruleId) => this.explainRule(ruleId));

    // Preview
    ipcMain.handle('automation:generatePreview', (_, ruleId) => this.generatePreview(ruleId));

    // Execution
    ipcMain.handle('automation:start', async (_, ruleId, isDryRun) => this.startExecution(ruleId, isDryRun));
    ipcMain.handle('automation:confirm', (_, executionId) => this.confirmExecution(executionId));
    ipcMain.handle('automation:pause', (_, executionId) => this.pauseExecution(executionId));
    ipcMain.handle('automation:resume', (_, executionId) => this.resumeExecution(executionId));
    ipcMain.handle('automation:cancel', (_, executionId, reason) => this.cancelExecution(executionId, reason));

    // Queries
    ipcMain.handle('automation:getAllRules', () => this.getAllRules());
    ipcMain.handle('automation:getRule', (_, ruleId) => this.getRule(ruleId));
    ipcMain.handle('automation:getEnabledRules', () => this.getEnabledRules());
    ipcMain.handle('automation:getExecution', (_, executionId) => this.getExecution(executionId));
    ipcMain.handle('automation:getActiveExecution', () => this.getActiveExecution());
    ipcMain.handle('automation:getRecentExecutions', (_, limit) => this.getRecentExecutions(limit));
  }
}

// Singleton instance
export const humanCenteredAutomation = new HumanCenteredAutomationClass();

export async function initializeHumanCenteredAutomation(): Promise<void> {
  return humanCenteredAutomation.initialize();
}

export function shutdownHumanCenteredAutomation(): void {
  humanCenteredAutomation.shutdown();
}
