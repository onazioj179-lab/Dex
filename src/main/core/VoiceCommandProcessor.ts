// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Voice Command Processor
// Phase 46: Parse and execute voice commands safely
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow, shell } from 'electron';
import { voiceControlEngine } from './VoiceControlEngine';
import { voiceScopeManager, VoiceScope } from './VoiceScopeManager';

// ===========================================================================
// TYPES
// ===========================================================================

export type CommandCategory = 
  | 'navigation'
  | 'search'
  | 'action'
  | 'media'
  | 'transfer'
  | 'system'
  | 'app-control'
  | 'unknown';

export type CommandRisk = 'safe' | 'moderate' | 'destructive';

export interface ParsedCommand {
  id: string;
  category: CommandCategory;
  intent: string;
  parameters: Record<string, unknown>;
  confidence: number;
  risk: CommandRisk;
  requiresConfirmation: boolean;
  scope: VoiceScope;
  rawTranscript: string;
}

export interface CommandResult {
  success: boolean;
  executed: boolean;
  message: string;
  error: string | null;
  data: unknown | null;
}

export interface CommandPattern {
  pattern: RegExp;
  category: CommandCategory;
  intent: string;
  risk: CommandRisk;
  scope: VoiceScope;
  extractor: (match: RegExpMatchArray) => Record<string, unknown>;
}

// ===========================================================================
// COMMAND PATTERNS
// ===========================================================================

const COMMAND_PATTERNS: CommandPattern[] = [
  // --- Navigation Commands ------------------------------------------------
  {
    pattern: /^(go to|open|show|navigate to)\s+(notes?|actions?|workflows?|settings?|dashboard|files?|transfers?|scheduler|power|search)$/i,
    category: 'navigation',
    intent: 'navigate',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ page: match[2].toLowerCase() }),
  },
  {
    pattern: /^(go )?back$/i,
    category: 'navigation',
    intent: 'go-back',
    risk: 'safe',
    scope: 'dex-only',
    extractor: () => ({}),
  },
  {
    pattern: /^(go )?home$/i,
    category: 'navigation',
    intent: 'go-home',
    risk: 'safe',
    scope: 'dex-only',
    extractor: () => ({}),
  },

  // --- Search Commands ----------------------------------------------------
  {
    pattern: /^(search|find|look for)\s+(.+)$/i,
    category: 'search',
    intent: 'search',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ query: match[2] }),
  },
  {
    pattern: /^(search|find)\s+(files?|documents?|images?|videos?)\s+(for|named|called)?\s*(.+)$/i,
    category: 'search',
    intent: 'search-files',
    risk: 'safe',
    scope: 'file-access',
    extractor: (match) => ({ type: match[2], query: match[4] }),
  },
  {
    pattern: /^find\s+(last|recent)\s+(file|document|image|video)s?$/i,
    category: 'search',
    intent: 'find-recent',
    risk: 'safe',
    scope: 'file-access',
    extractor: (match) => ({ type: match[2] }),
  },

  // --- Action Commands ----------------------------------------------------
  {
    pattern: /^(start|run|execute)\s+workflow\s+(.+)$/i,
    category: 'action',
    intent: 'run-workflow',
    risk: 'moderate',
    scope: 'dex-only',
    extractor: (match) => ({ workflowName: match[2] }),
  },
  {
    pattern: /^(create|new)\s+(note|action|workflow|timer)$/i,
    category: 'action',
    intent: 'create',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ itemType: match[2] }),
  },
  {
    pattern: /^rename\s+(this|these|selected)\s+(files?|documents?)(\s+to\s+(.+))?$/i,
    category: 'action',
    intent: 'rename-files',
    risk: 'moderate',
    scope: 'file-access',
    extractor: (match) => ({ newName: match[4] || null }),
  },
  {
    pattern: /^(delete|remove)\s+(this|these|selected)\s+(files?|documents?)$/i,
    category: 'action',
    intent: 'delete-files',
    risk: 'destructive',
    scope: 'file-access',
    extractor: () => ({}),
  },
  {
    pattern: /^(move|copy)\s+(this|these|selected)\s+(files?|documents?)\s+to\s+(.+)$/i,
    category: 'action',
    intent: 'move-files',
    risk: 'moderate',
    scope: 'file-access',
    extractor: (match) => ({ operation: match[1], destination: match[4] }),
  },

  // --- Media Commands -----------------------------------------------------
  {
    pattern: /^(play|start)\s+(this|the)?\s*(video|audio|music|media)?$/i,
    category: 'media',
    intent: 'play',
    risk: 'safe',
    scope: 'media-control',
    extractor: () => ({}),
  },
  {
    pattern: /^(pause|stop)(\s+(this|the)?\s*(video|audio|music|media)?)?$/i,
    category: 'media',
    intent: 'pause',
    risk: 'safe',
    scope: 'media-control',
    extractor: () => ({}),
  },
  {
    pattern: /^(next|skip|forward)$/i,
    category: 'media',
    intent: 'next',
    risk: 'safe',
    scope: 'media-control',
    extractor: () => ({}),
  },
  {
    pattern: /^(previous|back|rewind)$/i,
    category: 'media',
    intent: 'previous',
    risk: 'safe',
    scope: 'media-control',
    extractor: () => ({}),
  },
  {
    pattern: /^(mute|unmute)$/i,
    category: 'media',
    intent: 'toggle-mute',
    risk: 'safe',
    scope: 'media-control',
    extractor: (match) => ({ mute: match[1].toLowerCase() === 'mute' }),
  },
  {
    pattern: /^volume\s+(up|down)(\s+(\d+))?$/i,
    category: 'media',
    intent: 'volume',
    risk: 'safe',
    scope: 'media-control',
    extractor: (match) => ({ direction: match[1], amount: match[3] ? parseInt(match[3]) : 10 }),
  },

  // --- Transfer Commands --------------------------------------------------
  {
    pattern: /^send\s+(this|these|selected)\s+(files?|documents?)\s+to\s+(.+)$/i,
    category: 'transfer',
    intent: 'send-files',
    risk: 'moderate',
    scope: 'transfer',
    extractor: (match) => ({ destination: match[3] }),
  },
  {
    pattern: /^(start|begin|initiate)\s+transfer\s+to\s+(.+)$/i,
    category: 'transfer',
    intent: 'start-transfer',
    risk: 'moderate',
    scope: 'transfer',
    extractor: (match) => ({ destination: match[2] }),
  },

  // --- App Control Commands -----------------------------------------------
  {
    pattern: /^(open|launch|start)\s+(.+)\s+(app|application)$/i,
    category: 'app-control',
    intent: 'open-app',
    risk: 'moderate',
    scope: 'app-control',
    extractor: (match) => ({ appName: match[2] }),
  },
  {
    pattern: /^(close|quit|exit)\s+(.+)\s*(app|application)?$/i,
    category: 'app-control',
    intent: 'close-app',
    risk: 'moderate',
    scope: 'app-control',
    extractor: (match) => ({ appName: match[2] }),
  },
  {
    pattern: /^(minimize|maximize)\s+(dex|window)$/i,
    category: 'app-control',
    intent: 'window-control',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ action: match[1] }),
  },

  // --- System Commands (Limited) ------------------------------------------
  {
    pattern: /^(create|new)\s+(document|file|folder)\s+(named|called)?\s*(.+)$/i,
    category: 'system',
    intent: 'create-file',
    risk: 'moderate',
    scope: 'file-access',
    extractor: (match) => ({ type: match[2], name: match[4] }),
  },
  {
    pattern: /^open\s+(folder|directory)\s+(.+)$/i,
    category: 'system',
    intent: 'open-folder',
    risk: 'safe',
    scope: 'file-access',
    extractor: (match) => ({ path: match[2] }),
  },

  // --- Dex Control Commands -----------------------------------------------
  {
    pattern: /^(close|hide)\s+(this\s+)?(panel|tab|window)$/i,
    category: 'navigation',
    intent: 'close-panel',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ target: match[3] }),
  },
  {
    pattern: /^(start|begin)\s+(timer|pomodoro)(\s+for\s+(\d+)\s*(minutes?|mins?)?)?$/i,
    category: 'action',
    intent: 'start-timer',
    risk: 'safe',
    scope: 'dex-only',
    extractor: (match) => ({ duration: match[4] ? parseInt(match[4]) : 25 }),
  },
  {
    pattern: /^(stop|cancel)\s+(timer|pomodoro)$/i,
    category: 'action',
    intent: 'stop-timer',
    risk: 'safe',
    scope: 'dex-only',
    extractor: () => ({}),
  },
];

// ===========================================================================
// COMMAND PROCESSOR STORE
// ===========================================================================

const processorStore = new Store<{
  pendingConfirmation: ParsedCommand | null;
  recentCommands: string[];
}>({
  name: 'voice-command-processor',
  defaults: {
    pendingConfirmation: null,
    recentCommands: [],
  },
});

// ===========================================================================
// VOICE COMMAND PROCESSOR
// ===========================================================================

class VoiceCommandProcessor {
  private static instance: VoiceCommandProcessor;
  private initialized = false;
  private executors: Map<string, (params: Record<string, unknown>) => Promise<CommandResult>> = new Map();

  private constructor() {}

  static getInstance(): VoiceCommandProcessor {
    if (!VoiceCommandProcessor.instance) {
      VoiceCommandProcessor.instance = new VoiceCommandProcessor();
    }
    return VoiceCommandProcessor.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    this.registerDefaultExecutors();
    this.setupVoiceEngineListener();

    this.initialized = true;
    log.info('[VoiceCommandProcessor] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('voiceCommand:parse', (_, transcript) => this.parseCommand(transcript));
    ipcMain.handle('voiceCommand:execute', (_, command) => this.executeCommand(command));
    ipcMain.handle('voiceCommand:confirm', () => this.confirmPendingCommand());
    ipcMain.handle('voiceCommand:reject', () => this.rejectPendingCommand());
    ipcMain.handle('voiceCommand:getPending', () => this.getPendingCommand());
    ipcMain.handle('voiceCommand:getPatterns', () => this.getAvailablePatterns());
  }

  private setupVoiceEngineListener(): void {
    voiceControlEngine.on('transcript', async (transcript: string, sessionId: string) => {
      const command = this.parseCommand(transcript);
      
      if (command) {
        // Check scope permission
        const scopeAllowed = await voiceScopeManager.isScopeAllowed(command.scope);
        
        if (!scopeAllowed) {
          voiceControlEngine.setCommandResult(
            sessionId,
            command.intent,
            false,
            `Permission denied: ${command.scope} scope not enabled`
          );
          this.notifyCommandResult({
            success: false,
            executed: false,
            message: `Permission denied for ${command.scope} actions`,
            error: 'scope_not_allowed',
            data: null,
          });
          return;
        }

        // Check if confirmation is required
        const config = voiceControlEngine.getConfig();
        const needsConfirmation = 
          command.requiresConfirmation ||
          config.confirmAllActions ||
          (config.confirmDestructiveActions && command.risk === 'destructive');

        if (needsConfirmation) {
          processorStore.set('pendingConfirmation', command);
          this.notifyConfirmationRequired(command);
        } else {
          const result = await this.executeCommand(command);
          voiceControlEngine.setCommandResult(
            sessionId,
            command.intent,
            result.success,
            result.error
          );
          this.notifyCommandResult(result);
        }
      } else {
        voiceControlEngine.setCommandResult(
          sessionId,
          'unknown',
          false,
          'Command not recognized'
        );
        this.notifyCommandResult({
          success: false,
          executed: false,
          message: 'Command not recognized',
          error: 'unknown_command',
          data: null,
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // COMMAND PARSING
  // -------------------------------------------------------------------------

  parseCommand(transcript: string): ParsedCommand | null {
    const normalized = transcript.trim().toLowerCase();

    for (const pattern of COMMAND_PATTERNS) {
      const match = normalized.match(pattern.pattern);
      if (match) {
        const parameters = pattern.extractor(match);
        
        return {
          id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: pattern.category,
          intent: pattern.intent,
          parameters,
          confidence: 0.9, // Would be from speech recognition in real implementation
          risk: pattern.risk,
          requiresConfirmation: pattern.risk === 'destructive',
          scope: pattern.scope,
          rawTranscript: transcript,
        };
      }
    }

    // No pattern matched
    return null;
  }

  // -------------------------------------------------------------------------
  // COMMAND EXECUTION
  // -------------------------------------------------------------------------

  async executeCommand(command: ParsedCommand): Promise<CommandResult> {
    const executorKey = `${command.category}:${command.intent}`;
    const executor = this.executors.get(executorKey);

    if (!executor) {
      return {
        success: false,
        executed: false,
        message: `No executor found for ${executorKey}`,
        error: 'no_executor',
        data: null,
      };
    }

    try {
      // Track recent commands
      const recent = processorStore.get('recentCommands');
      recent.push(command.rawTranscript);
      if (recent.length > 20) recent.shift();
      processorStore.set('recentCommands', recent);

      return await executor(command.parameters);
    } catch (error) {
      return {
        success: false,
        executed: false,
        message: `Execution failed: ${error}`,
        error: String(error),
        data: null,
      };
    }
  }

  // -------------------------------------------------------------------------
  // CONFIRMATION HANDLING
  // -------------------------------------------------------------------------

  getPendingCommand(): ParsedCommand | null {
    return processorStore.get('pendingConfirmation');
  }

  async confirmPendingCommand(): Promise<CommandResult> {
    const pending = processorStore.get('pendingConfirmation');
    if (!pending) {
      return {
        success: false,
        executed: false,
        message: 'No pending command to confirm',
        error: 'no_pending',
        data: null,
      };
    }

    processorStore.set('pendingConfirmation', null);
    const result = await this.executeCommand(pending);
    this.notifyCommandResult(result);
    return result;
  }

  async rejectPendingCommand(): Promise<boolean> {
    const pending = processorStore.get('pendingConfirmation');
    if (pending) {
      processorStore.set('pendingConfirmation', null);
      this.notifyCommandResult({
        success: false,
        executed: false,
        message: 'Command cancelled by user',
        error: null,
        data: null,
      });
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // DEFAULT EXECUTORS
  // -------------------------------------------------------------------------

  private registerDefaultExecutors(): void {
    // Navigation executors
    this.executors.set('navigation:navigate', async (params) => {
      const page = params.page as string;
      this.sendToRenderer('voice:navigate', { page });
      return { success: true, executed: true, message: `Navigating to ${page}`, error: null, data: { page } };
    });

    this.executors.set('navigation:go-back', async () => {
      this.sendToRenderer('voice:navigate', { action: 'back' });
      return { success: true, executed: true, message: 'Going back', error: null, data: null };
    });

    this.executors.set('navigation:go-home', async () => {
      this.sendToRenderer('voice:navigate', { page: 'dashboard' });
      return { success: true, executed: true, message: 'Going home', error: null, data: null };
    });

    this.executors.set('navigation:close-panel', async (params) => {
      this.sendToRenderer('voice:close-panel', params);
      return { success: true, executed: true, message: 'Panel closed', error: null, data: null };
    });

    // Search executors
    this.executors.set('search:search', async (params) => {
      const query = params.query as string;
      this.sendToRenderer('voice:search', { query });
      return { success: true, executed: true, message: `Searching for "${query}"`, error: null, data: { query } };
    });

    this.executors.set('search:search-files', async (params) => {
      this.sendToRenderer('voice:search-files', params);
      return { success: true, executed: true, message: `Searching files`, error: null, data: params };
    });

    this.executors.set('search:find-recent', async (params) => {
      this.sendToRenderer('voice:find-recent', params);
      return { success: true, executed: true, message: `Finding recent ${params.type}`, error: null, data: params };
    });

    // Action executors
    this.executors.set('action:run-workflow', async (params) => {
      const name = params.workflowName as string;
      this.sendToRenderer('voice:run-workflow', { name });
      return { success: true, executed: true, message: `Starting workflow "${name}"`, error: null, data: params };
    });

    this.executors.set('action:create', async (params) => {
      const type = params.itemType as string;
      this.sendToRenderer('voice:create', { type });
      return { success: true, executed: true, message: `Creating new ${type}`, error: null, data: params };
    });

    this.executors.set('action:start-timer', async (params) => {
      const duration = params.duration as number;
      this.sendToRenderer('voice:start-timer', { duration });
      return { success: true, executed: true, message: `Starting ${duration} minute timer`, error: null, data: params };
    });

    this.executors.set('action:stop-timer', async () => {
      this.sendToRenderer('voice:stop-timer', {});
      return { success: true, executed: true, message: 'Timer stopped', error: null, data: null };
    });

    // File action executors
    this.executors.set('action:rename-files', async (params) => {
      this.sendToRenderer('voice:rename-files', params);
      return { success: true, executed: true, message: 'Renaming files', error: null, data: params };
    });

    this.executors.set('action:delete-files', async () => {
      this.sendToRenderer('voice:delete-files', {});
      return { success: true, executed: true, message: 'Files deleted', error: null, data: null };
    });

    this.executors.set('action:move-files', async (params) => {
      this.sendToRenderer('voice:move-files', params);
      return { success: true, executed: true, message: `Moving files to ${params.destination}`, error: null, data: params };
    });

    // Media executors
    this.executors.set('media:play', async () => {
      this.sendToRenderer('voice:media', { action: 'play' });
      return { success: true, executed: true, message: 'Playing', error: null, data: null };
    });

    this.executors.set('media:pause', async () => {
      this.sendToRenderer('voice:media', { action: 'pause' });
      return { success: true, executed: true, message: 'Paused', error: null, data: null };
    });

    this.executors.set('media:next', async () => {
      this.sendToRenderer('voice:media', { action: 'next' });
      return { success: true, executed: true, message: 'Next', error: null, data: null };
    });

    this.executors.set('media:previous', async () => {
      this.sendToRenderer('voice:media', { action: 'previous' });
      return { success: true, executed: true, message: 'Previous', error: null, data: null };
    });

    this.executors.set('media:toggle-mute', async (params) => {
      this.sendToRenderer('voice:media', { action: params.mute ? 'mute' : 'unmute' });
      return { success: true, executed: true, message: params.mute ? 'Muted' : 'Unmuted', error: null, data: null };
    });

    this.executors.set('media:volume', async (params) => {
      this.sendToRenderer('voice:media', { action: 'volume', ...params });
      return { success: true, executed: true, message: `Volume ${params.direction}`, error: null, data: params };
    });

    // Transfer executors
    this.executors.set('transfer:send-files', async (params) => {
      this.sendToRenderer('voice:send-files', params);
      return { success: true, executed: true, message: `Sending files to ${params.destination}`, error: null, data: params };
    });

    this.executors.set('transfer:start-transfer', async (params) => {
      this.sendToRenderer('voice:start-transfer', params);
      return { success: true, executed: true, message: `Starting transfer to ${params.destination}`, error: null, data: params };
    });

    // App control executors
    this.executors.set('app-control:open-app', async (params) => {
      const appName = params.appName as string;
      // Would use approved app list in real implementation
      this.sendToRenderer('voice:open-app', { appName });
      return { success: true, executed: true, message: `Opening ${appName}`, error: null, data: params };
    });

    this.executors.set('app-control:close-app', async (params) => {
      const appName = params.appName as string;
      this.sendToRenderer('voice:close-app', { appName });
      return { success: true, executed: true, message: `Closing ${appName}`, error: null, data: params };
    });

    this.executors.set('app-control:window-control', async (params) => {
      const action = params.action as string;
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          if (action === 'minimize') win.minimize();
          else if (action === 'maximize') win.maximize();
        }
      }
      return { success: true, executed: true, message: `Window ${action}d`, error: null, data: null };
    });

    // System executors
    this.executors.set('system:create-file', async (params) => {
      this.sendToRenderer('voice:create-file', params);
      return { success: true, executed: true, message: `Creating ${params.type} "${params.name}"`, error: null, data: params };
    });

    this.executors.set('system:open-folder', async (params) => {
      const path = params.path as string;
      // Would validate path is in allowed scope
      shell.openPath(path);
      return { success: true, executed: true, message: `Opening folder`, error: null, data: params };
    });
  }

  registerExecutor(
    category: CommandCategory,
    intent: string,
    executor: (params: Record<string, unknown>) => Promise<CommandResult>
  ): void {
    this.executors.set(`${category}:${intent}`, executor);
  }

  // -------------------------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------------------------

  private sendToRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  private notifyConfirmationRequired(command: ParsedCommand): void {
    this.sendToRenderer('voice:confirmationRequired', {
      command: command.intent,
      category: command.category,
      risk: command.risk,
      description: `Execute ${command.intent}?`,
      parameters: command.parameters,
    });
  }

  private notifyCommandResult(result: CommandResult): void {
    this.sendToRenderer('voice:commandResult', result);
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  getAvailablePatterns(): Array<{ category: string; intent: string; example: string }> {
    return COMMAND_PATTERNS.map(p => ({
      category: p.category,
      intent: p.intent,
      example: p.pattern.source.replace(/\^|\$|\(.*?\)/g, '').replace(/\\/g, ''),
    }));
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const voiceCommandProcessor = VoiceCommandProcessor.getInstance();
export default voiceCommandProcessor;
