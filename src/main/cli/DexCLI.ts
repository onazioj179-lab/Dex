// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX CLI - Command Line Interface for Headless Automation
// Run workflows, operations, and actions from terminal
// ===========================================================================

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CLICommand {
  name: string;
  description: string;
  usage: string;
  options?: CLIOption[];
  handler: (args: string[], options: Record<string, string | boolean>) => Promise<CLIResult>;
}

interface CLIOption {
  flag: string;
  alias?: string;
  description: string;
  hasValue?: boolean;
}

interface CLIResult {
  success: boolean;
  output: string;
  data?: unknown;
  exitCode: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  enabled: boolean;
}

interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface OperationDefinition {
  id: string;
  name: string;
  description?: string;
  script?: string;
  enabled: boolean;
}

interface ActionDefinition {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// CLI Manager
// -----------------------------------------------------------------------------

class DexCLI {
  private commands: Map<string, CLICommand> = new Map();
  private store: Store;
  private isHeadless: boolean = false;

  constructor() {
    this.store = new Store({ name: 'dex-cli' });
    this.registerCommands();
  }

  // Check if running in CLI mode
  static isCLIMode(): boolean {
    const args = process.argv.slice(2);
    return args.length > 0 && !args[0].startsWith('--inspect');
  }

  // Parse command line arguments
  parseArgs(argv: string[]): { command: string; args: string[]; options: Record<string, string | boolean> } {
    const args = argv.slice(2);
    const options: Record<string, string | boolean> = {};
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const eqIndex = key.indexOf('=');
        
        if (eqIndex !== -1) {
          options[key.slice(0, eqIndex)] = key.slice(eqIndex + 1);
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options[key] = args[++i];
        } else {
          options[key] = true;
        }
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options[key] = args[++i];
        } else {
          options[key] = true;
        }
      } else {
        positional.push(arg);
      }
    }

    return {
      command: positional[0] || 'help',
      args: positional.slice(1),
      options,
    };
  }

  // Register all CLI commands
  private registerCommands(): void {
    // Help command
    this.commands.set('help', {
      name: 'help',
      description: 'Show help information',
      usage: 'dex help [command]',
      handler: async (args) => this.showHelp(args[0]),
    });

    // Version command
    this.commands.set('version', {
      name: 'version',
      description: 'Show Dex version',
      usage: 'dex version',
      handler: async () => ({
        success: true,
        output: `Dex v${app.getVersion()}`,
        exitCode: 0,
      }),
    });

    // List command
    this.commands.set('list', {
      name: 'list',
      description: 'List workflows, operations, or actions',
      usage: 'dex list <type> [--format json|table]',
      options: [
        { flag: 'format', alias: 'f', description: 'Output format (json, table)', hasValue: true },
      ],
      handler: async (args, options) => this.listItems(args[0], options),
    });

    // Run command
    this.commands.set('run', {
      name: 'run',
      description: 'Run a workflow or operation',
      usage: 'dex run <type> <name> [--dry-run] [--wait]',
      options: [
        { flag: 'dry-run', alias: 'd', description: 'Simulate without executing' },
        { flag: 'wait', alias: 'w', description: 'Wait for completion' },
        { flag: 'timeout', alias: 't', description: 'Timeout in seconds', hasValue: true },
      ],
      handler: async (args, options) => this.runItem(args[0], args[1], options),
    });

    // Status command
    this.commands.set('status', {
      name: 'status',
      description: 'Show system status',
      usage: 'dex status [--watch]',
      options: [
        { flag: 'watch', description: 'Continuously watch status' },
      ],
      handler: async (_, options) => this.showStatus(options),
    });

    // Trigger command
    this.commands.set('trigger', {
      name: 'trigger',
      description: 'Trigger a scheduled task immediately',
      usage: 'dex trigger <name>',
      handler: async (args) => this.triggerScheduled(args[0]),
    });

    // Export command
    this.commands.set('export', {
      name: 'export',
      description: 'Export workflows/operations to file',
      usage: 'dex export <type> [--output file.json]',
      options: [
        { flag: 'output', alias: 'o', description: 'Output file path', hasValue: true },
      ],
      handler: async (args, options) => this.exportItems(args[0], options),
    });

    // Import command
    this.commands.set('import', {
      name: 'import',
      description: 'Import workflows/operations from file',
      usage: 'dex import <file.json> [--merge]',
      options: [
        { flag: 'merge', alias: 'm', description: 'Merge with existing items' },
      ],
      handler: async (args, options) => this.importItems(args[0], options),
    });

    // Execute command (raw action)
    this.commands.set('exec', {
      name: 'exec',
      description: 'Execute a raw action',
      usage: 'dex exec <action-type> [--config json]',
      options: [
        { flag: 'config', alias: 'c', description: 'Action configuration JSON', hasValue: true },
      ],
      handler: async (args, options) => this.executeAction(args[0], options),
    });

    // Config command
    this.commands.set('config', {
      name: 'config',
      description: 'Get or set configuration',
      usage: 'dex config <key> [value]',
      handler: async (args) => this.handleConfig(args[0], args[1]),
    });
  }

  // Execute CLI command
  async execute(argv: string[]): Promise<CLIResult> {
    const { command, args, options } = this.parseArgs(argv);

    const cmd = this.commands.get(command);
    if (!cmd) {
      return {
        success: false,
        output: `Unknown command: ${command}\nRun 'dex help' for available commands.`,
        exitCode: 1,
      };
    }

    try {
      return await cmd.handler(args, options);
    } catch (error) {
      return {
        success: false,
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: 1,
      };
    }
  }

  // Show help
  private async showHelp(command?: string): Promise<CLIResult> {
    if (command) {
      const cmd = this.commands.get(command);
      if (!cmd) {
        return { success: false, output: `Unknown command: ${command}`, exitCode: 1 };
      }

      let output = `\n${cmd.name} - ${cmd.description}\n\nUsage: ${cmd.usage}\n`;
      
      if (cmd.options?.length) {
        output += '\nOptions:\n';
        for (const opt of cmd.options) {
          const alias = opt.alias ? `-${opt.alias}, ` : '    ';
          output += `  ${alias}--${opt.flag.padEnd(12)} ${opt.description}\n`;
        }
      }

      return { success: true, output, exitCode: 0 };
    }

    let output = `
Dex CLI - Desktop Automation from Terminal

Usage: dex <command> [options]

Commands:
`;

    for (const [name, cmd] of this.commands) {
      output += `  ${name.padEnd(12)} ${cmd.description}\n`;
    }

    output += `
Run 'dex help <command>' for detailed information about a command.
`;

    return { success: true, output, exitCode: 0 };
  }

  // List items
  private async listItems(type: string, options: Record<string, string | boolean>): Promise<CLIResult> {
    const format = options.format || 'table';
    let items: unknown[] = [];
    let headers: string[] = [];

    const workflowStore = new Store({ name: 'dex-workflows' });
    const operationStore = new Store({ name: 'dex-operations' });
    const actionStore = new Store({ name: 'dex-actions' });

    switch (type) {
      case 'workflows':
        items = workflowStore.get('workflows', []) as WorkflowDefinition[];
        headers = ['ID', 'Name', 'Steps', 'Enabled'];
        break;
      case 'operations':
        items = operationStore.get('operations', []) as OperationDefinition[];
        headers = ['ID', 'Name', 'Enabled'];
        break;
      case 'actions':
        items = actionStore.get('actions', []) as ActionDefinition[];
        headers = ['ID', 'Name', 'Type'];
        break;
      default:
        return {
          success: false,
          output: `Unknown type: ${type}. Use: workflows, operations, actions`,
          exitCode: 1,
        };
    }

    if (format === 'json') {
      return {
        success: true,
        output: JSON.stringify(items, null, 2),
        data: items,
        exitCode: 0,
      };
    }

    // Table format
    if (items.length === 0) {
      return { success: true, output: `No ${type} found.`, exitCode: 0 };
    }

    let output = '\n' + headers.map(h => h.padEnd(20)).join('') + '\n';
    output += '-'.repeat(headers.length * 20) + '\n';

    for (const item of items as Record<string, unknown>[]) {
      const row = headers.map(h => {
        const key = h.toLowerCase();
        const val = item[key];
        if (key === 'steps' && Array.isArray(val)) return String(val.length);
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        return String(val || '-').slice(0, 18);
      });
      output += row.map(v => v.padEnd(20)).join('') + '\n';
    }

    return { success: true, output, data: items, exitCode: 0 };
  }

  // Run workflow or operation
  private async runItem(
    type: string,
    name: string,
    options: Record<string, string | boolean>
  ): Promise<CLIResult> {
    const isDryRun = options['dry-run'] || options.d;
    const shouldWait = options.wait || options.w;
    const timeout = parseInt(String(options.timeout || options.t || '60'), 10) * 1000;

    if (!name) {
      return { success: false, output: 'Please specify a name to run.', exitCode: 1 };
    }

    const workflowStore = new Store({ name: 'dex-workflows' });
    const operationStore = new Store({ name: 'dex-operations' });

    let item: WorkflowDefinition | OperationDefinition | null = null;

    if (type === 'workflow') {
      const workflows = workflowStore.get('workflows', []) as WorkflowDefinition[];
      item = workflows.find(w => w.name === name || w.id === name) || null;
    } else if (type === 'operation') {
      const operations = operationStore.get('operations', []) as OperationDefinition[];
      item = operations.find(o => o.name === name || o.id === name) || null;
    } else {
      return { success: false, output: `Unknown type: ${type}. Use: workflow, operation`, exitCode: 1 };
    }

    if (!item) {
      return { success: false, output: `${type} not found: ${name}`, exitCode: 1 };
    }

    if (isDryRun) {
      return {
        success: true,
        output: `[DRY RUN] Would execute ${type}: ${item.name}\n${JSON.stringify(item, null, 2)}`,
        exitCode: 0,
      };
    }

    // Execute via IPC
    return new Promise((resolve) => {
      const executionId = `cli-${Date.now()}`;
      
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          output: `Execution timed out after ${timeout / 1000}s`,
          exitCode: 124,
        });
      }, timeout);

      // Listen for completion
      const handler = (_: unknown, result: { id: string; success: boolean; output?: string }) => {
        if (result.id === executionId) {
          clearTimeout(timeoutId);
          ipcMain.removeListener('cli:execution-complete', handler);
          resolve({
            success: result.success,
            output: result.output || `${type} ${result.success ? 'completed' : 'failed'}`,
            exitCode: result.success ? 0 : 1,
          });
        }
      };

      if (shouldWait) {
        ipcMain.on('cli:execution-complete', handler);
      }

      // Emit execution request
      ipcMain.emit(`cli:run-${type}`, null, { id: executionId, item });

      if (!shouldWait) {
        clearTimeout(timeoutId);
        resolve({
          success: true,
          output: `${type} '${item.name}' started (execution ID: ${executionId})`,
          exitCode: 0,
        });
      }
    });
  }

  // Show status
  private async showStatus(options: Record<string, string | boolean>): Promise<CLIResult> {
    const status = {
      version: app.getVersion(),
      platform: process.platform,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };

    const output = `
Dex Status
----------------------------------
Version:    ${status.version}
Platform:   ${status.platform}
Uptime:     ${Math.floor(status.uptime / 60)}m ${Math.floor(status.uptime % 60)}s
Memory:     ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB / ${Math.round(status.memory.heapTotal / 1024 / 1024)}MB
----------------------------------
`;

    return { success: true, output, data: status, exitCode: 0 };
  }

  // Trigger scheduled task
  private async triggerScheduled(name: string): Promise<CLIResult> {
    if (!name) {
      return { success: false, output: 'Please specify a trigger name.', exitCode: 1 };
    }

    const schedulerStore = new Store({ name: 'dex-scheduler' });
    const triggers = schedulerStore.get('triggers', []) as Array<{ id: string; name: string }>;
    const trigger = triggers.find(t => t.name === name || t.id === name);

    if (!trigger) {
      return { success: false, output: `Trigger not found: ${name}`, exitCode: 1 };
    }

    ipcMain.emit('cli:trigger-scheduled', null, { triggerId: trigger.id });

    return {
      success: true,
      output: `Triggered: ${trigger.name}`,
      exitCode: 0,
    };
  }

  // Export items
  private async exportItems(type: string, options: Record<string, string | boolean>): Promise<CLIResult> {
    const outputPath = String(options.output || options.o || `dex-${type}-export.json`);

    const workflowStore = new Store({ name: 'dex-workflows' });
    const operationStore = new Store({ name: 'dex-operations' });
    
    let data: unknown;

    switch (type) {
      case 'workflows':
        data = workflowStore.get('workflows', []);
        break;
      case 'operations':
        data = operationStore.get('operations', []);
        break;
      case 'all':
        data = {
          workflows: workflowStore.get('workflows', []),
          operations: operationStore.get('operations', []),
          exportedAt: new Date().toISOString(),
          version: app.getVersion(),
        };
        break;
      default:
        return { success: false, output: `Unknown type: ${type}`, exitCode: 1 };
    }

    const fullPath = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
    try {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    } catch (err) {
      return { success: false, output: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`, exitCode: 1 };
    }

    return {
      success: true,
      output: `Exported ${type} to: ${fullPath}`,
      exitCode: 0,
    };
  }

  // Import items
  private async importItems(filePath: string, options: Record<string, string | boolean>): Promise<CLIResult> {
    if (!filePath) {
      return { success: false, output: 'Please specify a file to import.', exitCode: 1 };
    }

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `File not found: ${fullPath}`, exitCode: 1 };
    }

    const shouldMerge = options.merge || options.m;
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (err) {
      return { success: false, output: `Failed to read/parse file: ${err instanceof Error ? err.message : String(err)}`, exitCode: 1 };
    }

    const workflowStore = new Store({ name: 'dex-workflows' });
    const operationStore = new Store({ name: 'dex-operations' });

    let imported = 0;

    if (data.workflows) {
      const existing = shouldMerge ? (workflowStore.get('workflows', []) as unknown[]) : [];
      workflowStore.set('workflows', [...existing, ...data.workflows]);
      imported += data.workflows.length;
    }

    if (data.operations) {
      const existing = shouldMerge ? (operationStore.get('operations', []) as unknown[]) : [];
      operationStore.set('operations', [...existing, ...data.operations]);
      imported += data.operations.length;
    }

    return {
      success: true,
      output: `Imported ${imported} items from: ${fullPath}`,
      exitCode: 0,
    };
  }

  // Execute raw action
  private async executeAction(actionType: string, options: Record<string, string | boolean>): Promise<CLIResult> {
    if (!actionType) {
      return { success: false, output: 'Please specify an action type.', exitCode: 1 };
    }

    let config: Record<string, unknown> = {};
    
    if (options.config || options.c) {
      try {
        config = JSON.parse(String(options.config || options.c));
      } catch {
        return { success: false, output: 'Invalid JSON config', exitCode: 1 };
      }
    }

    return new Promise((resolve) => {
      const executionId = `cli-action-${Date.now()}`;
      
      ipcMain.emit('cli:execute-action', null, {
        id: executionId,
        type: actionType,
        config,
      });

      // For simplicity, assume immediate execution
      resolve({
        success: true,
        output: `Action '${actionType}' executed`,
        exitCode: 0,
      });
    });
  }

  // Handle config
  private async handleConfig(key?: string, value?: string): Promise<CLIResult> {
    if (!key) {
      const allConfig = this.store.store;
      return {
        success: true,
        output: JSON.stringify(allConfig, null, 2),
        exitCode: 0,
      };
    }

    if (value === undefined) {
      const val = this.store.get(key);
      return {
        success: true,
        output: val !== undefined ? String(val) : `Key not found: ${key}`,
        exitCode: val !== undefined ? 0 : 1,
      };
    }

    this.store.set(key, value);
    return {
      success: true,
      output: `Set ${key} = ${value}`,
      exitCode: 0,
    };
  }

  // Set headless mode
  setHeadless(headless: boolean): void {
    this.isHeadless = headless;
  }

  isHeadlessMode(): boolean {
    return this.isHeadless;
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const dexCLI = new DexCLI();

export function initializeCLI(): void {
  // Register CLI IPC handlers
  ipcMain.handle('cli:execute', async (_, command: string) => {
    const result = await dexCLI.execute(['dex', ...command.split(' ')]);
    return result;
  });

  ipcMain.handle('cli:is-headless', () => dexCLI.isHeadlessMode());
}

export async function runCLIMode(args?: string[]): Promise<number> {
  dexCLI.setHeadless(true);
  const argv = args ? ['node', 'dex', ...args] : process.argv;
  const result = await dexCLI.execute(argv);
  process.stdout.write(result.output + '\n');
  return result.exitCode;
}
