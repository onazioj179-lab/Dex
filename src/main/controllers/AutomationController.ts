// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Automation Controller (Phase 27)
// Backend handler for block-based automations
// ===========================================================================

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';
import { NativeProcesses, isNativeAvailable } from '../native/bridge';

const execAsync = promisify(exec);

// Types (mirror from renderer for backend use)
interface Block {
  id: string;
  type: string;
  config: Record<string, any>;
  enabled: boolean;
  order: number;
}

interface Automation {
  id: string;
  name: string;
  description: string;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
  isEnabled?: boolean;
  isRunning?: boolean;
  lastRunAt?: number;
  runCount?: number;
  metadata?: {
    isFavorite?: boolean;
    tags?: string[];
  };
}

interface BlockResult {
  blockId: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
  timestamp: number;
}

interface ExecutionResult {
  automationId: string;
  success: boolean;
  results: BlockResult[];
  startedAt: number;
  completedAt: number;
  error?: string;
}

export class AutomationController {
  private dataStore: DataStore;
  private logger: Logger;
  private runningAutomations: Map<string, { cancelled: boolean }> = new Map();

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get all automations
    ipcMain.handle('automation:getAll', async () => {
      try { return this.getAutomations(); } catch (e) { this.logger.error('[AutomationController] getAll error', e); return []; }
    });

    // Get single automation
    ipcMain.handle('automation:get', async (_, id: string) => {
      try { return this.getAutomation(id); } catch (e) { this.logger.error('[AutomationController] get error', e); return null; }
    });

    // Save automation
    ipcMain.handle('automation:save', async (_, automation: Automation) => {
      try { return this.saveAutomation(automation); } catch (e) { this.logger.error('[AutomationController] save error', e); return { success: false, error: String(e) }; }
    });

    // Delete automation
    ipcMain.handle('automation:delete', async (_, id: string) => {
      try { return this.deleteAutomation(id); } catch (e) { this.logger.error('[AutomationController] delete error', e); return { success: false, error: String(e) }; }
    });

    // Execute automation
    ipcMain.handle('automation:execute', async (event, id: string) => {
      try { const window = BrowserWindow.fromWebContents(event.sender); return this.executeAutomation(id, window); } catch (e) { this.logger.error('[AutomationController] execute error', e); return { success: false, error: String(e) }; }
    });

    // Cancel running automation
    ipcMain.handle('automation:cancel', async (_, id: string) => {
      try { return this.cancelAutomation(id); } catch (e) { this.logger.error('[AutomationController] cancel error', e); return { success: false, error: String(e) }; }
    });

    // Toggle favorite
    ipcMain.handle('automation:toggleFavorite', async (_, id: string) => {
      try { return this.toggleFavorite(id); } catch (e) { this.logger.error('[AutomationController] toggleFavorite error', e); return { success: false, error: String(e) }; }
    });

    // Duplicate automation
    ipcMain.handle('automation:duplicate', async (_, id: string) => {
      try { return this.duplicateAutomation(id); } catch (e) { this.logger.error('[AutomationController] duplicate error', e); return { success: false, error: String(e) }; }
    });

    this.logger.info('[AutomationController] Handlers registered');
  }

  // -------------------------------------------------------------------------
  // CRUD Operations
  // -------------------------------------------------------------------------

  private getAutomations(): Automation[] {
    const data = (this.dataStore as unknown as { store: { get(key: string): any } }).store.get('automations') || [];
    return data;
  }

  private getAutomation(id: string): Automation | null {
    const automations = this.getAutomations();
    return automations.find(a => a.id === id) || null;
  }

  private saveAutomation(automation: Automation): Automation {
    const automations = this.getAutomations();
    const now = Date.now();
    
    const existingIndex = automations.findIndex(a => a.id === automation.id);
    
    if (existingIndex >= 0) {
      // Update existing
      automations[existingIndex] = {
        ...automations[existingIndex],
        ...automation,
        updatedAt: now,
      };
    } else {
      // Create new
      automation.createdAt = automation.createdAt || now;
      automation.updatedAt = now;
      automations.push(automation);
    }
    
    (this.dataStore as unknown as { store: { set(key: string, value: unknown): void } }).store.set('automations', automations);
    this.logger.info(`[AutomationController] Saved automation: ${automation.name}`);
    
    return existingIndex >= 0 ? automations[existingIndex] : automation;
  }

  private deleteAutomation(id: string): boolean {
    const automations = this.getAutomations();
    const filtered = automations.filter(a => a.id !== id);
    (this.dataStore as unknown as { store: { set(key: string, value: unknown): void } }).store.set('automations', filtered);
    this.logger.info(`[AutomationController] Deleted automation: ${id}`);
    return true;
  }

  private toggleFavorite(id: string): Automation | null {
    const automation = this.getAutomation(id);
    if (!automation) return null;
    
    automation.metadata = automation.metadata || {};
    automation.metadata.isFavorite = !automation.metadata.isFavorite;
    
    return this.saveAutomation(automation);
  }

  private duplicateAutomation(id: string): Automation | null {
    const original = this.getAutomation(id);
    if (!original) return null;
    
    const duplicate: Automation = {
      ...original,
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRunAt: undefined,
      runCount: 0,
      isRunning: false,
      metadata: {
        ...original.metadata,
        isFavorite: false,
      },
    };
    
    return this.saveAutomation(duplicate);
  }

  // -------------------------------------------------------------------------
  // Execution Engine
  // -------------------------------------------------------------------------

  private async executeAutomation(id: string, window: BrowserWindow | null): Promise<ExecutionResult> {
    const automation = this.getAutomation(id);
    if (!automation) {
      return {
        automationId: id,
        success: false,
        results: [],
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: 'Automation not found',
      };
    }

    const startedAt = Date.now();
    const results: BlockResult[] = [];
    const context = { cancelled: false };
    this.runningAutomations.set(id, context);

    this.logger.info(`[AutomationController] Executing: ${automation.name}`);

    // Emit start event
    window?.webContents.send('automation:started', { automationId: id });

    try {
      const enabledBlocks = automation.blocks.filter(b => b.enabled).sort((a, b) => a.order - b.order);

      for (const block of enabledBlocks) {
        // Check if cancelled
        if (context.cancelled) {
          results.push({
            blockId: block.id,
            status: 'skipped',
            message: 'Cancelled',
            timestamp: Date.now(),
          });
          continue;
        }

        // Emit progress
        window?.webContents.send('automation:progress', {
          automationId: id,
          blockId: block.id,
          status: 'running',
        });

        try {
          const result = await this.executeBlock(block, window);
          results.push({
            blockId: block.id,
            status: result.success ? 'success' : 'failed',
            message: result.message,
            timestamp: Date.now(),
          });

          // Emit block complete
          window?.webContents.send('automation:progress', {
            automationId: id,
            blockId: block.id,
            status: result.success ? 'success' : 'failed',
            message: result.message,
          });

          // Stop on failure for certain blocks
          if (!result.success && block.type !== 'confirm') {
            // Continue on non-critical failures
          }
        } catch (err: any) {
          results.push({
            blockId: block.id,
            status: 'failed',
            message: err.message,
            timestamp: Date.now(),
          });

          window?.webContents.send('automation:progress', {
            automationId: id,
            blockId: block.id,
            status: 'failed',
            message: err.message,
          });
        }
      }

      // Update automation stats
      automation.lastRunAt = Date.now();
      automation.runCount = (automation.runCount || 0) + 1;
      automation.isRunning = false;
      this.saveAutomation(automation);

      const completedAt = Date.now();
      const success = results.every(r => r.status === 'success' || r.status === 'skipped');

      this.logger.success(`[AutomationController] Completed: ${automation.name} (${completedAt - startedAt}ms)`);

      // Emit complete
      window?.webContents.send('automation:completed', {
        automationId: id,
        success,
        results,
      });

      return {
        automationId: id,
        success,
        results,
        startedAt,
        completedAt,
      };
    } catch (error: any) {
      this.logger.error(`[AutomationController] Failed: ${automation.name}`, error);

      window?.webContents.send('automation:completed', {
        automationId: id,
        success: false,
        error: error.message,
      });

      return {
        automationId: id,
        success: false,
        results,
        startedAt,
        completedAt: Date.now(),
        error: error.message,
      };
    } finally {
      this.runningAutomations.delete(id);
    }
  }

  private cancelAutomation(id: string): boolean {
    const context = this.runningAutomations.get(id);
    if (context) {
      context.cancelled = true;
      this.logger.warn(`[AutomationController] Cancelled: ${id}`);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Block Executors
  // -------------------------------------------------------------------------

  private async executeBlock(block: Block, window: BrowserWindow | null): Promise<{ success: boolean; message: string; data?: any }> {
    const { type, config } = block;

    switch (type) {
      case 'open-app':
        return this.executeOpenApp(config);
      
      case 'close-app':
        return this.executeCloseApp(config);
      
      case 'delay':
        return this.executeDelay(config);
      
      case 'confirm':
        return this.executeConfirm(config, window);
      
      case 'start-timer':
        return this.executeStartTimer(config, window);
      
      case 'run-command':
        return this.executeRunCommand(config);
      
      case 'move-files':
        return this.executeMoveFiles(config, window);
      
      case 'rename-files':
        return this.executeRenameFiles(config, window);
      
      case 'create-document':
        return this.executeCreateDocument(config);
      
      case 'stop':
        return { success: true, message: config.message || 'Stopped' };
      
      case 'select-file':
      case 'select-folder':
      case 'text-input':
      case 'variable':
        // Input blocks are handled at runtime - for now just pass through
        return { success: true, message: 'Input collected' };
      
      case 'group':
        return { success: true, message: 'Group executed' };
      
      case 'send-file': {
        const filePath = config?.path || config?.file;
        const destination = config?.destination || config?.to;
        if (!filePath) return { success: false, message: 'No file path specified for send-file' };
        if (!destination) return { success: false, message: 'No destination specified for send-file' };
        try {
          await fs.promises.copyFile(filePath, destination);
          return { success: true, message: `File sent to ${destination}` };
        } catch (err) {
          return { success: false, message: `File send failed: ${err}` };
        }
      }
      
      default:
        return { success: false, message: `Unknown block type: ${type}` };
    }
  }

  private async executeOpenApp(config: { app?: string; args?: string }): Promise<{ success: boolean; message: string }> {
    const app = config.app;
    if (!app) {
      return { success: false, message: 'No app specified' };
    }

    const platform = process.platform;
    let command: string;

    // Common app mappings for Windows
    const appMappings: Record<string, string> = {
      'notepad': 'notepad.exe',
      'calculator': 'calc.exe',
      'file explorer': 'explorer.exe',
      'command prompt': 'cmd.exe',
      'powershell': 'powershell.exe',
      'task manager': 'taskmgr.exe',
      'settings': 'ms-settings:',
      'microsoft edge': 'msedge.exe',
      'chrome': 'chrome.exe',
      'firefox': 'firefox.exe',
      'vscode': 'code',
      'visual studio code': 'code',
    };

    const appTarget = appMappings[app.toLowerCase()] || app;

    if (platform === 'win32') {
      if (appTarget.startsWith('ms-')) {
        command = `start ${appTarget}`;
      } else {
        command = `start "" "${appTarget}"`;
      }
    } else if (platform === 'darwin') {
      command = `open -a "${appTarget}"`;
    } else {
      command = appTarget;
    }

    if (config.args) {
      command += ` ${config.args}`;
    }

    try {
      await execAsync(command);
      return { success: true, message: `Opened ${app}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  private async executeCloseApp(config: { app?: string; force?: boolean }): Promise<{ success: boolean; message: string }> {
    const app = config.app;
    if (!app) {
      return { success: false, message: 'No app specified' };
    }

    const platform = process.platform;
    const force = !!config.force;

    // Extract process name from app
    let processName = app;
    if (!processName.endsWith('.exe') && platform === 'win32') {
      processName = `${app}.exe`;
    }

    // Use native module (AV-safe) on Windows when available
    if (platform === 'win32' && isNativeAvailable()) {
      const result = NativeProcesses.closeByName(processName, force);
      return { success: result.success, message: result.message };
    }

    // Fallback for macOS/Linux or when native unavailable
    let command: string;
    if (platform === 'darwin') {
      command = force ? `pkill -9 -x "${app}"` : `pkill -x "${app}"`;
    } else {
      command = force ? `pkill -9 "${app}"` : `pkill "${app}"`;
    }

    try {
      await execAsync(command);
      return { success: true, message: `Closed ${app}` };
    } catch (err: any) {
      // Process might not be running
      if (err.message.includes('not found') || err.code === 128) {
        return { success: true, message: `${app} was not running` };
      }
      return { success: false, message: err.message };
    }
  }

  private async executeDelay(config: { seconds?: number }): Promise<{ success: boolean; message: string }> {
    const seconds = config.seconds || 1;
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    return { success: true, message: `Waited ${seconds}s` };
  }

  private async executeConfirm(config: { message?: string }, window: BrowserWindow | null): Promise<{ success: boolean; message: string }> {
    if (!window) {
      return { success: true, message: 'No window - skipped confirmation' };
    }

    const result = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['Continue', 'Cancel'],
      defaultId: 0,
      title: 'Automation Confirmation',
      message: config.message || 'Continue with automation?',
    });

    if (result.response === 0) {
      return { success: true, message: 'Confirmed' };
    } else {
      return { success: false, message: 'User cancelled' };
    }
  }

  private async executeStartTimer(config: { duration?: number; label?: string }, window: BrowserWindow | null): Promise<{ success: boolean; message: string }> {
    const duration = config.duration || 25;
    const label = config.label || 'Timer';
    
    // Send event to renderer to start timer
    window?.webContents.send('timer:create', {
      name: label,
      duration: duration * 60, // Convert minutes to seconds
      autoStart: true,
    });

    return { success: true, message: `Started ${duration}min timer: ${label}` };
  }

  private async executeRunCommand(config: { command?: string }): Promise<{ success: boolean; message: string; data?: any }> {
    const command = config.command;
    if (!command) {
      return { success: false, message: 'No command specified' };
    }

    try {
      const { stdout, stderr } = await execAsync(command);
      return { 
        success: true, 
        message: 'Command executed',
        data: { stdout, stderr }
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  private async executeMoveFiles(config: { source?: string; destination?: string }, window: BrowserWindow | null): Promise<{ success: boolean; message: string }> {
    const { source, destination } = config;
    
    if (!source || !destination) {
      return { success: false, message: 'Source and destination required' };
    }

    try {
      // Check if source exists
      if (!fs.existsSync(source)) {
        return { success: false, message: `Source not found: ${source}` };
      }

      // Create destination if it doesn't exist
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }

      const fileName = path.basename(source);
      const destPath = path.join(destination, fileName);
      
      fs.renameSync(source, destPath);
      
      return { success: true, message: `Moved to ${destination}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  private async executeRenameFiles(config: { source?: string; pattern?: string; newName?: string }, window: BrowserWindow | null): Promise<{ success: boolean; message: string }> {
    const { source, newName } = config;
    
    if (!source || !newName) {
      return { success: false, message: 'Source and new name required' };
    }

    try {
      if (!fs.existsSync(source)) {
        return { success: false, message: `File not found: ${source}` };
      }

      const dir = path.dirname(source);
      const ext = path.extname(source);
      const newPath = path.join(dir, newName + ext);
      
      fs.renameSync(source, newPath);
      
      return { success: true, message: `Renamed to ${newName}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  private async executeCreateDocument(config: { type?: string; name?: string; content?: string }): Promise<{ success: boolean; message: string }> {
    const { type = 'txt', name = 'Untitled', content = '' } = config;
    
    try {
      const documentsPath = process.env.USERPROFILE 
        ? path.join(process.env.USERPROFILE, 'Documents')
        : process.env.HOME 
          ? path.join(process.env.HOME, 'Documents')
          : '.';

      const ext = type === 'note' ? 'txt' : type;
      const filePath = path.join(documentsPath, `${name}.${ext}`);
      
      fs.writeFileSync(filePath, content);
      
      return { success: true, message: `Created ${name}.${ext}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
