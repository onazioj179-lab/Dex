// ═══════════════════════════════════════════════════════════════════════════
// DEX Scripting Engine - JavaScript/TypeScript DSL for Custom Automation
// Sandboxed execution with full Dex API access
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, BrowserWindow, app, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as http from 'http';
import * as https from 'https';
import * as log from 'electron-log';
import Store from 'electron-store';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Script {
  id: string;
  name: string;
  description?: string;
  code: string;
  trigger?: ScriptTrigger;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRun?: number;
  runCount: number;
  avgDuration?: number;
}

interface ScriptTrigger {
  type: 'manual' | 'schedule' | 'event' | 'hotkey';
  config: Record<string, unknown>;
}

interface ScriptContext {
  // System APIs
  system: SystemApi;
  // Workflow APIs
  workflows: WorkflowApi;
  // Operations APIs
  operations: OperationApi;
  // Notification APIs
  notify: (message: string, options?: NotifyOptions) => Promise<void>;
  // File APIs
  files: FileApi;
  // Storage APIs
  storage: StorageApi;
  // HTTP APIs
  http: HttpApi;
  // Utils
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

interface SystemApi {
  getBattery: () => Promise<{ level: number; charging: boolean }>;
  getMemory: () => Promise<{ used: number; total: number; percent: number }>;
  getCpu: () => Promise<{ usage: number }>;
  getPlatform: () => string;
  getUptime: () => number;
  runCommand: (command: string) => Promise<{ stdout: string; stderr: string; code: number }>;
}

interface WorkflowApi {
  list: () => Promise<Array<{ id: string; name: string }>>;
  run: (id: string) => Promise<{ success: boolean }>;
  get: (id: string) => Promise<unknown>;
}

interface OperationApi {
  list: () => Promise<Array<{ id: string; name: string }>>;
  run: (id: string) => Promise<{ success: boolean }>;
}

interface NotifyOptions {
  title?: string;
  silent?: boolean;
}

interface FileApi {
  read: (filePath: string) => Promise<string>;
  write: (filePath: string, content: string) => Promise<void>;
  exists: (filePath: string) => Promise<boolean>;
  list: (dirPath: string) => Promise<string[]>;
}

interface StorageApi {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
}

interface HttpApi {
  get: (url: string, options?: HttpOptions) => Promise<HttpResponse>;
  post: (url: string, body: unknown, options?: HttpOptions) => Promise<HttpResponse>;
}

interface HttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

interface ScriptResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  logs: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripting Engine
// ─────────────────────────────────────────────────────────────────────────────

class ScriptingEngine {
  private store: Store;
  private scriptStore: Store;
  private mainWindow: BrowserWindow | null = null;
  private runningScripts: Map<string, AbortController> = new Map();

  constructor() {
    this.store = new Store({ name: 'dex-scripting-config' });
    this.scriptStore = new Store({ name: 'dex-scripts' });
  }

  // Initialize
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  // Get all scripts
  getScripts(): Script[] {
    return this.scriptStore.get('scripts', []) as Script[];
  }

  // Get script by ID
  getScript(id: string): Script | null {
    const scripts = this.getScripts();
    return scripts.find(s => s.id === id) || null;
  }

  // Create script
  createScript(script: Omit<Script, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Script {
    const newScript: Script = {
      ...script,
      id: `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
    };

    const scripts = this.getScripts();
    scripts.push(newScript);
    this.scriptStore.set('scripts', scripts);

    return newScript;
  }

  // Update script
  updateScript(id: string, updates: Partial<Script>): Script | null {
    const scripts = this.getScripts();
    const index = scripts.findIndex(s => s.id === id);
    
    if (index === -1) return null;

    scripts[index] = {
      ...scripts[index],
      ...updates,
      updatedAt: Date.now(),
    };

    this.scriptStore.set('scripts', scripts);
    return scripts[index];
  }

  // Delete script
  deleteScript(id: string): boolean {
    const scripts = this.getScripts();
    const filtered = scripts.filter(s => s.id !== id);
    
    if (filtered.length === scripts.length) return false;

    this.scriptStore.set('scripts', filtered);
    return true;
  }

  // Build script context
  private buildContext(scriptId: string): { context: ScriptContext; logs: string[] } {
    const logs: string[] = [];
    const scriptStorage = new Store({ name: `dex-script-storage-${scriptId}` });

    const context: ScriptContext = {
      // System APIs
      system: {
        getBattery: async () => {
          // Simplified battery check
          return { level: 100, charging: true };
        },
        getMemory: async () => {
          const mem = process.memoryUsage();
          const total = require('os').totalmem();
          const used = total - require('os').freemem();
          return {
            used,
            total,
            percent: Math.round((used / total) * 100),
          };
        },
        getCpu: async () => {
          const cpus = require('os').cpus();
          const load = cpus.reduce((acc: number, cpu: { times: { idle: number; user: number; sys: number } }) => {
            const total = cpu.times.idle + cpu.times.user + cpu.times.sys;
            return acc + ((total - cpu.times.idle) / total);
          }, 0) / cpus.length;
          return { usage: Math.round(load * 100) };
        },
        getPlatform: () => process.platform,
        getUptime: () => process.uptime(),
        runCommand: async (command: string) => {
          return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(command, { timeout: 30000 }, (error: Error | null, stdout: string, stderr: string) => {
              resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                code: error ? 1 : 0,
              });
            });
          });
        },
      },

      // Workflow APIs
      workflows: {
        list: async () => {
          const workflowStore = new Store({ name: 'dex-workflows' });
          const workflows = workflowStore.get('workflows', []) as Array<{ id: string; name: string }>;
          return workflows.map(w => ({ id: w.id, name: w.name }));
        },
        run: async (id: string) => {
          ipcMain.emit('script:run-workflow', null, { workflowId: id });
          return { success: true };
        },
        get: async (id: string) => {
          const workflowStore = new Store({ name: 'dex-workflows' });
          const workflows = workflowStore.get('workflows', []) as Array<{ id: string }>;
          return workflows.find(w => w.id === id) || null;
        },
      },

      // Operation APIs
      operations: {
        list: async () => {
          const operationStore = new Store({ name: 'dex-operations' });
          const operations = operationStore.get('operations', []) as Array<{ id: string; name: string }>;
          return operations.map(o => ({ id: o.id, name: o.name }));
        },
        run: async (id: string) => {
          ipcMain.emit('script:run-operation', null, { operationId: id });
          return { success: true };
        },
      },

      // Notification
      notify: async (message: string, options?: NotifyOptions) => {
        new Notification({
          title: options?.title || 'Dex Script',
          body: message,
          silent: options?.silent,
        }).show();
      },

      // File APIs (sandboxed to user data directory)
      files: {
        read: async (filePath: string) => {
          const safePath = this.sanitizePath(filePath);
          return fs.readFileSync(safePath, 'utf-8');
        },
        write: async (filePath: string, content: string) => {
          const safePath = this.sanitizePath(filePath);
          fs.writeFileSync(safePath, content, 'utf-8');
        },
        exists: async (filePath: string) => {
          const safePath = this.sanitizePath(filePath);
          return fs.existsSync(safePath);
        },
        list: async (dirPath: string) => {
          const safePath = this.sanitizePath(dirPath);
          return fs.readdirSync(safePath);
        },
      },

      // Storage APIs
      storage: {
        get: (key: string) => scriptStorage.get(key),
        set: (key: string, value: unknown) => scriptStorage.set(key, value),
        delete: (key: string) => scriptStorage.delete(key),
      },

      // HTTP APIs
      http: {
        get: async (url: string, options?: HttpOptions) => {
          return this.httpRequest('GET', url, undefined, options);
        },
        post: async (url: string, body: unknown, options?: HttpOptions) => {
          return this.httpRequest('POST', url, body, options);
        },
      },

      // Utils
      sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, Math.min(ms, 60000))),
      log: (message: string) => {
        const logEntry = `[${new Date().toISOString()}] ${message}`;
        logs.push(logEntry);
        console.log(`[Script] ${logEntry}`);
      },
    };

    return { context, logs };
  }

  // Sanitize file path (restrict to user data directory)
  private sanitizePath(filePath: string): string {
    const userDataPath = app.getPath('userData');
    const scriptsDir = path.join(userDataPath, 'script-files');
    
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // Resolve and ensure within sandbox
    const resolved = path.resolve(scriptsDir, filePath);
    if (!resolved.startsWith(scriptsDir)) {
      throw new Error('Access denied: Path outside sandbox');
    }

    return resolved;
  }

  // HTTP request helper
  private async httpRequest(
    method: string,
    url: string,
    body?: unknown,
    options?: HttpOptions
  ): Promise<HttpResponse> {
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const request = client.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        timeout: options?.timeout || 30000,
      }, (response: http.IncomingMessage) => {
        let data = '';
        response.on('data', (chunk: string) => { data += chunk; });
        response.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            status: response.statusCode || 0,
            data: parsed,
            headers: response.headers as Record<string, string>,
          });
        });
      });

      request.on('error', reject);
      request.on('timeout', () => reject(new Error('Request timeout')));

      if (body) {
        request.write(JSON.stringify(body));
      }
      request.end();
    });
  }

  // Execute script
  async execute(scriptId: string): Promise<ScriptResult> {
    const script = this.getScript(scriptId);
    if (!script) {
      return { success: false, error: 'Script not found', duration: 0, logs: [] };
    }

    if (!script.enabled) {
      return { success: false, error: 'Script is disabled', duration: 0, logs: [] };
    }

    const startTime = Date.now();
    const { context, logs } = this.buildContext(scriptId);

    // Create abort controller
    const abortController = new AbortController();
    this.runningScripts.set(scriptId, abortController);

    try {
      // Create sandbox with limited globals
      const sandbox = {
        ...context,
        console: {
          log: context.log,
          info: context.log,
          warn: context.log,
          error: context.log,
        },
        setTimeout: undefined,
        setInterval: undefined,
        fetch: undefined,
        require: undefined,
        process: undefined,
        __dirname: undefined,
        __filename: undefined,
      };

      // Wrap code in async function
      const wrappedCode = `
        (async function() {
          ${script.code}
        })()
      `;

      // Create VM context
      const vmContext = vm.createContext(sandbox);
      
      // Execute with timeout
      const result = await Promise.race([
        vm.runInContext(wrappedCode, vmContext, {
          timeout: 60000, // 60 second timeout
          displayErrors: true,
        }),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Script aborted'));
          });
        }),
      ]);

      const duration = Date.now() - startTime;

      // Update script stats
      this.updateScript(scriptId, {
        lastRun: Date.now(),
        runCount: script.runCount + 1,
        avgDuration: script.avgDuration 
          ? Math.round((script.avgDuration + duration) / 2)
          : duration,
      });

      return {
        success: true,
        output: result,
        duration,
        logs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        logs,
      };
    } finally {
      this.runningScripts.delete(scriptId);
    }
  }

  // Stop script
  stopScript(scriptId: string): boolean {
    const controller = this.runningScripts.get(scriptId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  // Execute code directly (for console/REPL)
  async executeCode(code: string): Promise<ScriptResult> {
    const tempScript = this.createScript({
      name: 'temp-execution',
      code,
      enabled: true,
    });

    try {
      const result = await this.execute(tempScript.id);
      return result;
    } finally {
      this.deleteScript(tempScript.id);
    }
  }

  // Get script templates
  getTemplates(): Array<{ name: string; description: string; code: string }> {
    return [
      {
        name: 'Battery Monitor',
        description: 'Switch mode based on battery level',
        code: `
const battery = await system.getBattery();
log(\`Battery: \${battery.level}%, Charging: \${battery.charging}\`);

if (battery.level < 20 && !battery.charging) {
  await notify('Low battery! Switching to eco mode');
  // Run eco mode workflow
}
`.trim(),
      },
      {
        name: 'Daily Backup',
        description: 'Run backup workflow and log result',
        code: `
log('Starting daily backup...');

const workflows = await workflows.list();
const backupWorkflow = workflows.find(w => w.name.includes('backup'));

if (backupWorkflow) {
  const result = await workflows.run(backupWorkflow.id);
  log(\`Backup \${result.success ? 'completed' : 'failed'}\`);
  await notify(\`Backup \${result.success ? 'completed' : 'failed'}\`);
}
`.trim(),
      },
      {
        name: 'Memory Cleanup',
        description: 'Monitor memory and trigger cleanup',
        code: `
const mem = await system.getMemory();
log(\`Memory usage: \${mem.percent}%\`);

if (mem.percent > 80) {
  log('High memory usage detected, running cleanup...');
  await operations.run('cleanup-memory');
  await notify('Memory cleanup completed');
}
`.trim(),
      },
      {
        name: 'HTTP Health Check',
        description: 'Check if a URL is responding',
        code: `
const url = 'https://api.github.com/zen';

try {
  const response = await http.get(url);
  log(\`Status: \${response.status}\`);
  log(\`Response: \${JSON.stringify(response.data)}\`);
  
  if (response.status !== 200) {
    await notify('Health check failed!', { title: 'Alert' });
  }
} catch (error) {
  await notify('Service unreachable!', { title: 'Alert' });
}
`.trim(),
      },
      {
        name: 'Persistent Counter',
        description: 'Store and increment a counter',
        code: `
// Get current count from persistent storage
let count = storage.get('runCount') || 0;
count++;

// Save updated count
storage.set('runCount', count);

log(\`This script has run \${count} times\`);
await notify(\`Run count: \${count}\`);
`.trim(),
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export const scriptingEngine = new ScriptingEngine();

export function initializeScripting(mainWindow: BrowserWindow): void {
  try {
    scriptingEngine.initialize(mainWindow);

    // IPC handlers
    ipcMain.handle('scripting:get-scripts', () => scriptingEngine.getScripts());
    ipcMain.handle('scripting:get-script', (_, id: string) => scriptingEngine.getScript(id));
    ipcMain.handle('scripting:create-script', (_, script) => scriptingEngine.createScript(script));
    ipcMain.handle('scripting:update-script', (_, id: string, updates) => scriptingEngine.updateScript(id, updates));
    ipcMain.handle('scripting:delete-script', (_, id: string) => scriptingEngine.deleteScript(id));
    ipcMain.handle('scripting:execute', (_, id: string) => scriptingEngine.execute(id));
    ipcMain.handle('scripting:execute-code', (_, code: string) => scriptingEngine.executeCode(code));
    ipcMain.handle('scripting:stop', (_, id: string) => scriptingEngine.stopScript(id));
    ipcMain.handle('scripting:get-templates', () => scriptingEngine.getTemplates());
    
    log.info('[ScriptingEngine] IPC handlers registered');
  } catch (error) {
    log.error('[ScriptingEngine] Failed to initialize:', error);
  }
}
