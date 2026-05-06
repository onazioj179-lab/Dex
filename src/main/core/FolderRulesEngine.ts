// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Folder Rules Engine
// Folder-level rules engine (light, preview-based automation)
// Safe experimentation / sandbox mode (preview apply rollback)
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type RuleTrigger = 'manual' | 'on_add' | 'on_modify' | 'scheduled';
export type RuleActionType = 'move' | 'copy' | 'rename' | 'organize' | 'tag' | 'delete' | 'convert' | 'custom';

export interface RuleCondition {
  field: 'name' | 'extension' | 'size' | 'created' | 'modified' | 'path';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'gt' | 'lt' | 'between';
  value: string | number | [number, number];
  caseSensitive?: boolean;
}

export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
}

export interface FolderRule {
  id: string;
  name: string;
  description?: string;
  folderPath: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  conditionLogic: 'and' | 'or';
  actions: RuleAction[];
  createdAt: number;
  lastRun?: number;
  runCount: number;
}

export interface RulePreviewItem {
  sourcePath: string;
  targetPath?: string;
  action: string;
  willOverwrite: boolean;
  error?: string;
}

export interface RulePreview {
  ruleId: string;
  ruleName: string;
  items: RulePreviewItem[];
  stats: {
    total: number;
    willProcess: number;
    willSkip: number;
    willOverwrite: number;
    errors: number;
  };
}

export interface RuleExecutionResult {
  ruleId: string;
  success: boolean;
  processed: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  undoId?: string;
}

// ===========================================================================
// FOLDER RULES ENGINE
// ===========================================================================

class FolderRulesEngineClass extends EventEmitter {
  private rules: Map<string, FolderRule> = new Map();
  private rulesPath = '';
  private ruleIdCounter = 0;

  constructor() {
    super();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.rulesPath = path.join(app.getPath('userData'), 'folder-rules.json');
    await this.loadRules();
    log.info(`[FolderRules] Initialized with ${this.rules.size} rules`);
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Create rule
    ipcMain.handle('folderrules:create', async (_event, rule: Omit<FolderRule, 'id' | 'createdAt' | 'runCount'>) => {
      return this.createRule(rule);
    });

    // Update rule
    ipcMain.handle('folderrules:update', async (_event, id: string, updates: Partial<FolderRule>) => {
      return this.updateRule(id, updates);
    });

    // Delete rule
    ipcMain.handle('folderrules:delete', async (_event, id: string) => {
      return this.deleteRule(id);
    });

    // Get rule
    ipcMain.handle('folderrules:get', (_event, id: string) => {
      return this.getRule(id);
    });

    // List rules
    ipcMain.handle('folderrules:list', (_event, folderPath?: string) => {
      return this.listRules(folderPath);
    });

    // Preview rule execution
    ipcMain.handle('folderrules:preview', async (_event, ruleId: string) => {
      return this.previewRule(ruleId);
    });

    // Execute rule
    ipcMain.handle('folderrules:execute', async (_event, ruleId: string, dryRun?: boolean) => {
      return this.executeRule(ruleId, dryRun);
    });

    // Test conditions on files
    ipcMain.handle('folderrules:testConditions', async (_event, conditions: RuleCondition[], filePath: string) => {
      return this.testConditions(conditions, filePath);
    });

    // Get rules for folder
    ipcMain.handle('folderrules:forFolder', (_event, folderPath: string) => {
      return this.getRulesForFolder(folderPath);
    });
  }

  // -------------------------------------------------------------------------
  // RULE MANAGEMENT
  // -------------------------------------------------------------------------

  async createRule(ruleData: Omit<FolderRule, 'id' | 'createdAt' | 'runCount'>): Promise<FolderRule> {
    const rule: FolderRule = {
      ...ruleData,
      id: this.generateId(),
      createdAt: Date.now(),
      runCount: 0
    };

    this.rules.set(rule.id, rule);
    await this.saveRules();
    
    this.emit('rule:created', rule);
    return rule;
  }

  async updateRule(id: string, updates: Partial<FolderRule>): Promise<FolderRule | null> {
    const rule = this.rules.get(id);
    if (!rule) return null;

    const updated = { ...rule, ...updates, id: rule.id }; // Prevent ID change
    this.rules.set(id, updated);
    await this.saveRules();
    
    this.emit('rule:updated', updated);
    return updated;
  }

  async deleteRule(id: string): Promise<{ success: boolean }> {
    const deleted = this.rules.delete(id);
    if (deleted) {
      await this.saveRules();
      this.emit('rule:deleted', id);
    }
    return { success: deleted };
  }

  getRule(id: string): FolderRule | null {
    return this.rules.get(id) || null;
  }

  listRules(folderPath?: string): FolderRule[] {
    const rules = Array.from(this.rules.values());
    
    if (folderPath) {
      return rules.filter(r => r.folderPath === folderPath || folderPath.startsWith(r.folderPath));
    }
    
    return rules.sort((a, b) => b.createdAt - a.createdAt);
  }

  getRulesForFolder(folderPath: string): FolderRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.enabled && r.folderPath === folderPath);
  }

  // -------------------------------------------------------------------------
  // RULE EXECUTION
  // -------------------------------------------------------------------------

  async previewRule(ruleId: string): Promise<RulePreview | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const items: RulePreviewItem[] = [];
    
    try {
      const files = await this.getMatchingFiles(rule);
      
      for (const filePath of files) {
        const previewItem = await this.previewFileAction(rule, filePath);
        items.push(previewItem);
      }
    } catch (error) {
      log.error(`[FolderRules] Preview failed for ${ruleId}:`, error);
    }

    const stats = {
      total: items.length,
      willProcess: items.filter(i => !i.error && !i.willOverwrite).length,
      willSkip: items.filter(i => i.error).length,
      willOverwrite: items.filter(i => i.willOverwrite).length,
      errors: items.filter(i => i.error).length
    };

    return {
      ruleId,
      ruleName: rule.name,
      items,
      stats
    };
  }

  async executeRule(ruleId: string, dryRun = false): Promise<RuleExecutionResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return { ruleId, success: false, processed: 0, skipped: 0, errors: [{ path: '', error: 'Rule not found' }] };
    }

    const result: RuleExecutionResult = {
      ruleId,
      success: true,
      processed: 0,
      skipped: 0,
      errors: []
    };

    try {
      const files = await this.getMatchingFiles(rule);
      
      for (const filePath of files) {
        try {
          if (!dryRun) {
            await this.executeFileActions(rule, filePath);
          }
          result.processed++;
        } catch (error) {
          result.errors.push({
            path: filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Update rule stats
      if (!dryRun) {
        rule.lastRun = Date.now();
        rule.runCount++;
        await this.saveRules();
      }

      result.success = result.errors.length === 0;
      this.emit('rule:executed', { rule, result });
      
    } catch (error) {
      result.success = false;
      result.errors.push({
        path: rule.folderPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // FILE MATCHING
  // -------------------------------------------------------------------------

  private async getMatchingFiles(rule: FolderRule): Promise<string[]> {
    const matchingFiles: string[] = [];

    try {
      const entries = await fs.readdir(rule.folderPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) continue; // Only process files
        
        const filePath = path.join(rule.folderPath, entry.name);
        
        if (await this.matchesConditions(rule.conditions, rule.conditionLogic, filePath)) {
          matchingFiles.push(filePath);
        }
      }
    } catch (error) {
      log.error(`[FolderRules] Failed to read folder ${rule.folderPath}:`, error);
    }

    return matchingFiles;
  }

  private async matchesConditions(
    conditions: RuleCondition[],
    logic: 'and' | 'or',
    filePath: string
  ): Promise<boolean> {
    if (conditions.length === 0) return true;

    const results = await Promise.all(
      conditions.map(c => this.evaluateCondition(c, filePath))
    );

    return logic === 'and' 
      ? results.every(r => r)
      : results.some(r => r);
  }

  private async evaluateCondition(condition: RuleCondition, filePath: string): Promise<boolean> {
    try {
      let fieldValue: string | number;
      const stats = await fs.stat(filePath);

      switch (condition.field) {
        case 'name':
          fieldValue = path.basename(filePath, path.extname(filePath));
          break;
        case 'extension':
          fieldValue = path.extname(filePath).slice(1).toLowerCase();
          break;
        case 'size':
          fieldValue = stats.size;
          break;
        case 'created':
          fieldValue = stats.birthtimeMs;
          break;
        case 'modified':
          fieldValue = stats.mtimeMs;
          break;
        case 'path':
          fieldValue = filePath;
          break;
        default:
          return false;
      }

      return this.compareValues(fieldValue, condition.operator, condition.value, condition.caseSensitive);
    } catch {
      return false;
    }
  }

  private compareValues(
    fieldValue: string | number,
    operator: RuleCondition['operator'],
    conditionValue: string | number | [number, number],
    caseSensitive?: boolean
  ): boolean {
    // String operations
    if (typeof fieldValue === 'string') {
      const strField = caseSensitive ? fieldValue : fieldValue.toLowerCase();
      const strValue = caseSensitive 
        ? String(conditionValue) 
        : String(conditionValue).toLowerCase();

      switch (operator) {
        case 'equals':
          return strField === strValue;
        case 'contains':
          return strField.includes(strValue);
        case 'startsWith':
          return strField.startsWith(strValue);
        case 'endsWith':
          return strField.endsWith(strValue);
        case 'matches':
          try {
            const regex = new RegExp(String(conditionValue), caseSensitive ? '' : 'i');
            return regex.test(fieldValue);
          } catch {
            return false;
          }
        default:
          return false;
      }
    }

    // Number operations
    if (typeof fieldValue === 'number') {
      const numValue = typeof conditionValue === 'number' ? conditionValue : parseFloat(String(conditionValue));

      switch (operator) {
        case 'equals':
          return fieldValue === numValue;
        case 'gt':
          return fieldValue > numValue;
        case 'lt':
          return fieldValue < numValue;
        case 'between':
          if (Array.isArray(conditionValue)) {
            return fieldValue >= conditionValue[0] && fieldValue <= conditionValue[1];
          }
          return false;
        default:
          return false;
      }
    }

    return false;
  }

  async testConditions(conditions: RuleCondition[], filePath: string): Promise<{
    matches: boolean;
    results: Array<{ condition: RuleCondition; matches: boolean }>;
  }> {
    const results = await Promise.all(
      conditions.map(async c => ({
        condition: c,
        matches: await this.evaluateCondition(c, filePath)
      }))
    );

    return {
      matches: results.every(r => r.matches),
      results
    };
  }

  // -------------------------------------------------------------------------
  // ACTION EXECUTION
  // -------------------------------------------------------------------------

  private async previewFileAction(rule: FolderRule, filePath: string): Promise<RulePreviewItem> {
    const item: RulePreviewItem = {
      sourcePath: filePath,
      action: rule.actions.map(a => a.type).join(', '),
      willOverwrite: false
    };

    for (const action of rule.actions) {
      const targetPath = this.computeTargetPath(action, filePath);
      if (targetPath) {
        item.targetPath = targetPath;
        try {
          await fs.access(targetPath);
          item.willOverwrite = true;
        } catch { /* Target doesn't exist */ }
      }
    }

    return item;
  }

  private async executeFileActions(rule: FolderRule, filePath: string): Promise<void> {
    for (const action of rule.actions) {
      await this.executeAction(action, filePath);
    }
  }

  private async executeAction(action: RuleAction, filePath: string): Promise<void> {
    switch (action.type) {
      case 'move': {
        const targetDir = action.params.targetDir as string;
        const targetPath = path.join(targetDir, path.basename(filePath));
        await fs.mkdir(targetDir, { recursive: true });
        await fs.rename(filePath, targetPath);
        break;
      }

      case 'copy': {
        const targetDir = action.params.targetDir as string;
        const targetPath = path.join(targetDir, path.basename(filePath));
        await fs.mkdir(targetDir, { recursive: true });
        await fs.copyFile(filePath, targetPath);
        break;
      }

      case 'rename': {
        const pattern = action.params.pattern as string;
        const replacement = action.params.replacement as string;
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const newName = baseName.replace(new RegExp(pattern, 'g'), replacement);
        const newPath = path.join(dir, newName + ext);
        await fs.rename(filePath, newPath);
        break;
      }

      case 'organize': {
        const by = action.params.by as string;
        const targetBase = action.params.targetDir as string || path.dirname(filePath);
        const subFolder = await this.getOrganizeFolder(filePath, by);
        const targetPath = path.join(targetBase, subFolder, path.basename(filePath));
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.rename(filePath, targetPath);
        break;
      }

      case 'delete': {
        await fs.unlink(filePath);
        break;
      }

      // Other actions emit events for external handling
      default:
        this.emit('action:custom', { action, filePath });
    }
  }

  private computeTargetPath(action: RuleAction, filePath: string): string | undefined {
    switch (action.type) {
      case 'move':
      case 'copy':
        return path.join(action.params.targetDir as string, path.basename(filePath));
      case 'rename': {
        const pattern = action.params.pattern as string;
        const replacement = action.params.replacement as string;
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const newName = baseName.replace(new RegExp(pattern, 'g'), replacement);
        return path.join(dir, newName + ext);
      }
      default:
        return undefined;
    }
  }

  private async getOrganizeFolder(filePath: string, by: string): Promise<string> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    
    switch (by) {
      case 'type': {
        const types: Record<string, string[]> = {
          'Images': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
          'Documents': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
          'Videos': ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'],
          'Audio': ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'],
          'Archives': ['zip', 'rar', '7z', 'tar', 'gz'],
          'Code': ['js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs']
        };
        for (const [folder, exts] of Object.entries(types)) {
          if (exts.includes(ext)) return folder;
        }
        return 'Other';
      }

      case 'extension':
        return ext || 'no-extension';

      case 'date': {
        try {
          const stats = await fs.stat(filePath);
          const date = new Date(stats.mtimeMs);
          return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        } catch {
          return 'Unknown';
        }
      }

      default:
        return 'Other';
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(this.rulesPath, 'utf-8');
      const data = JSON.parse(content) as FolderRule[];
      
      for (const rule of data) {
        this.rules.set(rule.id, rule);
      }
    } catch {
      // No rules file yet
    }
  }

  private async saveRules(): Promise<void> {
    const rules = Array.from(this.rules.values());
    await fs.writeFile(this.rulesPath, JSON.stringify(rules, null, 2));
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `rule-${++this.ruleIdCounter}-${Date.now()}`;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const FolderRulesEngine = new FolderRulesEngineClass();
export default FolderRulesEngine;
