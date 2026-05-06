// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Plugin System (Enhanced Extension Framework)
// User-installable plugins with sandboxed execution
// =============================================================================

import { ipcMain, app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Node fs adapter compatible with PluginPublisher.FsLike
function makeNodeFsLike() {
  return {
    join: (...parts: string[]) => path.join(...parts),
    exists: async (p: string) => fs.existsSync(p),
    readFile: async (p: string) => fs.promises.readFile(p),
    writeFile: async (p: string, data: Uint8Array | string) => fs.promises.writeFile(p, data),
    readDir: async (p: string) => fs.promises.readdir(p),
    stat: async (p: string) => {
      const s = await fs.promises.stat(p);
      return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size };
    },
    mkdirP: async (p: string) => { await fs.promises.mkdir(p, { recursive: true }); },
  };
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  icon?: string;
  
  // Entry points
  main?: string;           // Main process entry
  renderer?: string;       // Renderer process entry (panel/view)
  
  // Capabilities
  permissions: PluginPermission[];
  
  // UI contributions
  contributes?: {
    commands?: PluginCommand[];
    panels?: PluginPanel[];
    actions?: PluginAction[];
    widgets?: PluginWidget[];
    triggers?: PluginTrigger[];
    settings?: PluginSetting[];
  };
  
  // Requirements
  engines?: {
    dex?: string;          // Minimum Dex version
    node?: string;         // Node version
  };
  
  // Dependencies
  dependencies?: Record<string, string>;
}

export type PluginPermission =
  | 'operations:read'
  | 'operations:write'
  | 'operations:execute'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:execute'
  | 'notes:read'
  | 'notes:write'
  | 'files:read'
  | 'files:write'
  | 'network:http'
  | 'network:websocket'
  | 'system:info'
  | 'notifications:send'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'storage:local';

export interface PluginCommand {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  when?: string;           // Condition expression
}

export interface PluginPanel {
  id: string;
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel' | 'modal';
}

export interface PluginAction {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  inputs?: PluginActionInput[];
  outputs?: PluginActionOutput[];
}

export interface PluginActionInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'select';
  label: string;
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
}

export interface PluginActionOutput {
  name: string;
  type: string;
  description?: string;
}

export interface PluginWidget {
  id: string;
  name: string;
  description: string;
  defaultSize: 'small' | 'medium' | 'large';
}

export interface PluginTrigger {
  id: string;
  name: string;
  description: string;
  configSchema?: Record<string, any>;
}

export interface PluginSetting {
  id: string;
  title: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: any;
  options?: { value: string; label: string }[];
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  verified: boolean;
  installedAt: number;
  updatedAt: number;
  settings: Record<string, any>;
  state: PluginState;
}

export type PluginState = 'installed' | 'loading' | 'active' | 'error' | 'disabled';

export interface PluginError {
  pluginId: string;
  error: string;
  timestamp: number;
  stack?: string;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

const pluginStore = new Store<{
  plugins: Record<string, InstalledPlugin>;
  settings: {
    enabled: boolean;
    autoUpdate: boolean;
    allowUnverified: boolean;
    sandboxMode: 'strict' | 'moderate' | 'permissive';
  };
  errors: PluginError[];
}>({
  name: 'dex-plugins',
  defaults: {
    plugins: {},
    settings: {
      enabled: true,
      autoUpdate: false,
      allowUnverified: false,
      sandboxMode: 'strict',
    },
    errors: [],
  },
});

// -----------------------------------------------------------------------------
// Plugin Manager
// -----------------------------------------------------------------------------

class PluginManager {
  private pluginInstances: Map<string, any> = new Map();
  private pluginContexts: Map<string, PluginContext> = new Map();
  private mainWindow: BrowserWindow | null = null;

  // Initialize plugin system
  async initialize(mainWindow: BrowserWindow) {
    log.info('[Plugins] Initializing plugin system...');
    this.mainWindow = mainWindow;
    
    // Setup directories
    this.ensurePluginDirectories();
    
    // Setup IPC handlers
    this.setupIpcHandlers();
    
    // Load enabled plugins
    await this.loadAllPlugins();
    
    log.info('[Plugins] Plugin system initialized');
  }

  // Ensure plugin directories exist
  private ensurePluginDirectories() {
    const dirs = [
      this.getPluginsPath(),
      this.getPluginsPath('installed'),
      this.getPluginsPath('cache'),
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Get plugins path
  private getPluginsPath(...segments: string[]): string {
    return path.join(app.getPath('userData'), 'plugins', ...segments);
  }

  // Setup IPC handlers
  private setupIpcHandlers() {
    ipcMain.handle('plugins:list', () => this.listPlugins());
    ipcMain.handle('plugins:get', (_, id: string) => this.getPlugin(id));
    ipcMain.handle('plugins:install', (_, source: string) => this.installPlugin(source));
    ipcMain.handle('plugins:uninstall', (_, id: string) => this.uninstallPlugin(id));
    ipcMain.handle('plugins:enable', (_, id: string) => this.enablePlugin(id));
    ipcMain.handle('plugins:disable', (_, id: string) => this.disablePlugin(id));
    ipcMain.handle('plugins:reload', (_, id: string) => this.reloadPlugin(id));
    ipcMain.handle('plugins:get-settings', () => pluginStore.get('settings'));
    ipcMain.handle('plugins:update-settings', (_, settings) => {
      pluginStore.set('settings', { ...pluginStore.get('settings'), ...settings });
      return pluginStore.get('settings');
    });
    ipcMain.handle('plugins:execute-command', (_, pluginId: string, commandId: string, args?: any) => {
      return this.executeCommand(pluginId, commandId, args);
    });
    ipcMain.handle('plugins:get-actions', () => this.getAllActions());
    ipcMain.handle('plugins:execute-action', (_, pluginId: string, actionId: string, inputs: Record<string, any>) => {
      return this.executeAction(pluginId, actionId, inputs);
    });

    // ----- Marketplace (C2/C3): package / publish / browse / install ---------
    ipcMain.handle('plugins:package', async (_, srcDir: string) => {
      const { packagePlugin, envelopeToString } = await import('../plugins/PluginPublisher.js');
      const fsAdapter = makeNodeFsLike();
      const env = await packagePlugin(srcDir, fsAdapter, {});
      return { envelope: env, text: envelopeToString(env) };
    });
    ipcMain.handle('plugins:publish', async (_, envelope: any, registryUrl?: string) => {
      const { verifyEnvelope } = await import('../plugins/PluginPublisher.js');
      const verify = verifyEnvelope(envelope);
      if (!verify.ok) return { ok: false, reason: verify.reason, scanIssues: verify.scanIssues };
      // Append to local registry stub (no remote push by default)
      const registryPath = path.join(app.getPath('userData'), 'plugin-registry.json');
      const existing = (() => {
        try { return JSON.parse(fs.readFileSync(registryPath, 'utf-8')); }
        catch { return { entries: [] }; }
      })();
      existing.entries = (existing.entries || []).filter(
        (e: any) => !(e.manifest?.id === envelope.manifest?.id && e.published?.version === envelope.published?.version)
      );
      existing.entries.push(envelope);
      fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2), 'utf-8');
      return { ok: true, registryUrl: registryUrl ?? `file://${registryPath}` };
    });
    ipcMain.handle('plugins:browseRegistry', async () => {
      const stubPath = path.join(__dirname, '..', '..', '..', 'assets', 'config', 'dex-plugin-registry-stub.json');
      const userPath = path.join(app.getPath('userData'), 'plugin-registry.json');
      const merged: any[] = [];
      for (const p of [stubPath, userPath]) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (Array.isArray(data?.entries)) merged.push(...data.entries);
        } catch { /* missing is fine */ }
      }
      return merged;
    });
    ipcMain.handle('plugins:downloadAndInstall', async (_, source: string | any) => {
      const { parseEnvelope, verifyEnvelope } = await import('../plugins/PluginPublisher.js');
      let envelope: any;
      if (typeof source === 'string') {
        // URL: fetch JSON envelope
        const { net } = require('electron');
        const text = await new Promise<string>((resolve, reject) => {
          const req = net.request(source);
          const chunks: Buffer[] = [];
          req.on('response', (r: any) => {
            if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}`));
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          });
          req.on('error', reject);
          req.end();
        });
        envelope = parseEnvelope(text);
      } else {
        envelope = source;
      }
      const verify = verifyEnvelope(envelope);
      if (!verify.ok) throw new Error(`Envelope failed verification: ${verify.reason}`);
      // Materialize to temp dir then call installPlugin(localPath)
      const tmpDir = path.join(app.getPath('temp'), 'dex-plug-' + crypto.randomBytes(4).toString('hex'));
      fs.mkdirSync(tmpDir, { recursive: true });
      for (const [rel, b64] of Object.entries(envelope.files as Record<string, string>)) {
        const full = path.join(tmpDir, rel);
        if (path.relative(tmpDir, full).startsWith('..')) {
          throw new Error('Path traversal blocked: ' + rel);
        }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, Buffer.from(b64, 'base64'));
      }
      // Ensure manifest.json exists at root
      const manifestPath = path.join(tmpDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        fs.writeFileSync(manifestPath, JSON.stringify(envelope.manifest, null, 2), 'utf-8');
      }
      return this.installPlugin(tmpDir);
    });
  }

  // List all plugins
  listPlugins(): InstalledPlugin[] {
    return Object.values(pluginStore.get('plugins'));
  }

  // Get single plugin
  getPlugin(id: string): InstalledPlugin | undefined {
    return pluginStore.get(`plugins.${id}`);
  }

  // Install plugin from source (path, URL, or npm package)
  async installPlugin(source: string): Promise<InstalledPlugin> {
    log.info(`[Plugins] Installing plugin from: ${source}`);
    
    let manifestPath: string;
    let pluginPath: string;
    
    // Handle different source types
    if (source.startsWith('http://')) {
      throw new Error('Plugin downloads require HTTPS. Refusing insecure HTTP source.');
    }
    if (source.startsWith('https://')) {
      // Download plugin archive from URL
      const { net } = require('electron');
      const tmpDir = path.join(app.getPath('temp'), 'dex-plugin-' + crypto.randomBytes(4).toString('hex'));
      fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, 'plugin.zip');

      const res = await new Promise<Buffer>((resolve, reject) => {
        const req = net.request(source);
        const chunks: Buffer[] = [];
        req.on('response', (response: any) => {
          if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
      });

      fs.writeFileSync(zipPath, res);

      // Extract with built-in zlib if tar.gz, otherwise expect directory
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tmpDir, true);
      } catch {
        // If adm-zip unavailable, assume file is the manifest itself
        throw new Error('Plugin archive extraction requires adm-zip. Install it or use a local path.');
      }
      pluginPath = tmpDir;
      manifestPath = path.join(tmpDir, 'manifest.json');
    } else if (fs.existsSync(source)) {
      // Local path
      pluginPath = source;
      manifestPath = path.join(source, 'manifest.json');
    } else {
      throw new Error(`Invalid plugin source: ${source}`);
    }
    
    // Read and validate manifest
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Plugin manifest not found');
    }
    
    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    // Validate manifest
    this.validateManifest(manifest);
    
    // Check if already installed
    if (pluginStore.get(`plugins.${manifest.id}`)) {
      throw new Error(`Plugin ${manifest.id} is already installed`);
    }
    
    // Copy to plugins directory
    const installPath = this.getPluginsPath('installed', manifest.id);
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true });
    }
    fs.cpSync(pluginPath, installPath, { recursive: true });
    
    // Create plugin record
    const plugin: InstalledPlugin = {
      manifest,
      path: installPath,
      enabled: false,
      verified: false,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      settings: this.getDefaultSettings(manifest),
      state: 'installed',
    };
    
    // Save to store
    pluginStore.set(`plugins.${manifest.id}`, plugin);
    
    log.info(`[Plugins] Installed: ${manifest.name} v${manifest.version}`);
    return plugin;
  }

  // Uninstall plugin
  async uninstallPlugin(id: string): Promise<boolean> {
    const plugin = this.getPlugin(id);
    if (!plugin) return false;
    
    // Disable first
    await this.disablePlugin(id);
    
    // Remove files
    if (fs.existsSync(plugin.path)) {
      fs.rmSync(plugin.path, { recursive: true });
    }
    
    // Remove from store
    const plugins = pluginStore.get('plugins');
    delete plugins[id];
    pluginStore.set('plugins', plugins);
    
    log.info(`[Plugins] Uninstalled: ${id}`);
    return true;
  }

  // Enable plugin
  async enablePlugin(id: string): Promise<InstalledPlugin | null> {
    const plugin = this.getPlugin(id);
    if (!plugin) return null;
    
    try {
      // Load plugin
      await this.loadPlugin(plugin);
      
      // Update state
      pluginStore.set(`plugins.${id}.enabled`, true);
      pluginStore.set(`plugins.${id}.state`, 'active');
      
      log.info(`[Plugins] Enabled: ${id}`);
      return this.getPlugin(id) || null;
    } catch (error) {
      this.logError(id, error);
      pluginStore.set(`plugins.${id}.state`, 'error');
      throw error;
    }
  }

  // Disable plugin
  async disablePlugin(id: string): Promise<InstalledPlugin | null> {
    const plugin = this.getPlugin(id);
    if (!plugin) return null;
    
    // Unload plugin
    await this.unloadPlugin(id);
    
    // Update state
    pluginStore.set(`plugins.${id}.enabled`, false);
    pluginStore.set(`plugins.${id}.state`, 'disabled');
    
    log.info(`[Plugins] Disabled: ${id}`);
    return this.getPlugin(id) || null;
  }

  // Reload plugin
  async reloadPlugin(id: string): Promise<InstalledPlugin | null> {
    await this.disablePlugin(id);
    return this.enablePlugin(id);
  }

  // Load all enabled plugins
  private async loadAllPlugins() {
    const plugins = this.listPlugins().filter(p => p.enabled);
    
    for (const plugin of plugins) {
      try {
        await this.loadPlugin(plugin);
      } catch (error) {
        this.logError(plugin.manifest.id, error);
      }
    }
  }

  // Load single plugin
  private async loadPlugin(plugin: InstalledPlugin) {
    log.info(`[Plugins] Loading: ${plugin.manifest.name}`);
    
    pluginStore.set(`plugins.${plugin.manifest.id}.state`, 'loading');
    
    // Create sandbox context
    const context = this.createPluginContext(plugin);
    this.pluginContexts.set(plugin.manifest.id, context);
    
    // Load main process entry if exists
    if (plugin.manifest.main) {
      const mainPath = path.join(plugin.path, plugin.manifest.main);
      if (fs.existsSync(mainPath)) {
        // In production, this would use vm2 or similar for sandboxing
        const pluginModule = require(mainPath);
        
        if (pluginModule.activate) {
          await pluginModule.activate(context);
        }
        
        this.pluginInstances.set(plugin.manifest.id, pluginModule);
      }
    }
    
    pluginStore.set(`plugins.${plugin.manifest.id}.state`, 'active');
    log.info(`[Plugins] Loaded: ${plugin.manifest.name}`);
  }

  // Unload plugin
  private async unloadPlugin(id: string) {
    const instance = this.pluginInstances.get(id);
    
    if (instance?.deactivate) {
      await instance.deactivate();
    }
    
    this.pluginInstances.delete(id);
    this.pluginContexts.delete(id);
  }

  // Create plugin context (sandbox API)
  private createPluginContext(plugin: InstalledPlugin): PluginContext {
    const permissions = new Set(plugin.manifest.permissions);
    
    return {
      pluginId: plugin.manifest.id,
      pluginPath: plugin.path,
      
      // Logging
      log: {
        info: (msg: string) => log.info(`[Plugin:${plugin.manifest.id}] ${msg}`),
        warn: (msg: string) => log.warn(`[Plugin:${plugin.manifest.id}] ${msg}`),
        error: (msg: string) => log.error(`[Plugin:${plugin.manifest.id}] ${msg}`),
      },
      
      // Storage (always allowed)
      storage: this.createStorageAPI(plugin.manifest.id),
      
      // Operations (permission-gated)
      operations: permissions.has('operations:read') || permissions.has('operations:execute')
        ? this.createOperationsAPI(plugin.manifest.id, permissions)
        : undefined,
      
      // Workflows (permission-gated)
      workflows: permissions.has('workflows:read') || permissions.has('workflows:execute')
        ? this.createWorkflowsAPI(plugin.manifest.id, permissions)
        : undefined,
      
      // Notifications
      notifications: permissions.has('notifications:send')
        ? this.createNotificationsAPI(plugin.manifest.id)
        : undefined,
      
      // UI
      ui: this.createUIAPI(plugin.manifest.id),
      
      // Events
      events: this.createEventsAPI(plugin.manifest.id),
    };
  }

  // Storage API
  private createStorageAPI(pluginId: string) {
    const storageKey = `plugin-storage-${pluginId}`;
    const store = new Store({ name: storageKey });
    
    return {
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      delete: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
  }

  // Operations API
  private createOperationsAPI(pluginId: string, permissions: Set<string>) {
    return {
      list: permissions.has('operations:read')
        ? async () => {
            // Return list of operations
            return [];
          }
        : undefined,
      execute: permissions.has('operations:execute')
        ? async (operationId: string, params?: any) => {
            // Execute operation
            log.info(`[Plugin:${pluginId}] Execute operation: ${operationId}`);
          }
        : undefined,
    };
  }

  // Workflows API
  private createWorkflowsAPI(pluginId: string, permissions: Set<string>) {
    return {
      list: permissions.has('workflows:read')
        ? async () => []
        : undefined,
      execute: permissions.has('workflows:execute')
        ? async (workflowId: string, params?: any) => {
            log.info(`[Plugin:${pluginId}] Execute workflow: ${workflowId}`);
          }
        : undefined,
    };
  }

  // Notifications API
  private createNotificationsAPI(pluginId: string) {
    return {
      send: (title: string, body: string, options?: any) => {
        // Send notification
        log.info(`[Plugin:${pluginId}] Notification: ${title}`);
      },
    };
  }

  // UI API
  private createUIAPI(pluginId: string) {
    return {
      showMessage: (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
        this.mainWindow?.webContents.send('plugin:message', { pluginId, message, type });
      },
      showPanel: (panelId: string) => {
        this.mainWindow?.webContents.send('plugin:show-panel', { pluginId, panelId });
      },
    };
  }

  // Events API
  private createEventsAPI(pluginId: string) {
    const handlers = new Map<string, Function[]>();
    
    return {
      on: (event: string, handler: Function) => {
        if (!handlers.has(event)) {
          handlers.set(event, []);
        }
        handlers.get(event)!.push(handler);
      },
      off: (event: string, handler: Function) => {
        const eventHandlers = handlers.get(event);
        if (eventHandlers) {
          const index = eventHandlers.indexOf(handler);
          if (index > -1) {
            eventHandlers.splice(index, 1);
          }
        }
      },
      emit: (event: string, data: any) => {
        const eventHandlers = handlers.get(event);
        if (eventHandlers) {
          eventHandlers.forEach(h => h(data));
        }
      },
    };
  }

  // Execute command
  async executeCommand(pluginId: string, commandId: string, args?: any): Promise<any> {
    const instance = this.pluginInstances.get(pluginId);
    if (!instance?.commands?.[commandId]) {
      throw new Error(`Command not found: ${pluginId}:${commandId}`);
    }
    
    return instance.commands[commandId](args);
  }

  // Get all actions from all plugins
  getAllActions(): { pluginId: string; action: PluginAction }[] {
    const actions: { pluginId: string; action: PluginAction }[] = [];
    
    this.listPlugins()
      .filter(p => p.enabled && p.manifest.contributes?.actions)
      .forEach(p => {
        p.manifest.contributes!.actions!.forEach(action => {
          actions.push({ pluginId: p.manifest.id, action });
        });
      });
    
    return actions;
  }

  // Execute action
  async executeAction(pluginId: string, actionId: string, inputs: Record<string, any>): Promise<any> {
    const instance = this.pluginInstances.get(pluginId);
    if (!instance?.actions?.[actionId]) {
      throw new Error(`Action not found: ${pluginId}:${actionId}`);
    }
    
    return instance.actions[actionId](inputs);
  }

  // Validate manifest
  private validateManifest(manifest: PluginManifest) {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error('Invalid manifest: missing required fields');
    }
    
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Invalid manifest: id must be lowercase alphanumeric with hyphens');
    }
    
    // Validate permissions
    const validPermissions = new Set<string>([
      'operations:read', 'operations:write', 'operations:execute',
      'workflows:read', 'workflows:write', 'workflows:execute',
      'notes:read', 'notes:write',
      'files:read', 'files:write',
      'network:http', 'network:websocket',
      'system:info', 'notifications:send',
      'clipboard:read', 'clipboard:write',
      'storage:local',
    ]);
    
    for (const perm of manifest.permissions || []) {
      if (!validPermissions.has(perm)) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
  }

  // Get default settings from manifest
  private getDefaultSettings(manifest: PluginManifest): Record<string, any> {
    const settings: Record<string, any> = {};
    
    manifest.contributes?.settings?.forEach(setting => {
      if (setting.default !== undefined) {
        settings[setting.id] = setting.default;
      }
    });
    
    return settings;
  }

  // Log error
  private logError(pluginId: string, error: any) {
    const errorEntry: PluginError = {
      pluginId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      stack: error instanceof Error ? error.stack : undefined,
    };
    
    const errors = pluginStore.get('errors');
    errors.unshift(errorEntry);
    if (errors.length > 100) errors.length = 100;
    pluginStore.set('errors', errors);
    
    log.error(`[Plugin:${pluginId}] Error:`, error);
  }
}

// -----------------------------------------------------------------------------
// Plugin Context Type
// -----------------------------------------------------------------------------

interface PluginContext {
  pluginId: string;
  pluginPath: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  storage: {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    delete: (key: string) => void;
    clear: () => void;
  };
  operations?: {
    list?: () => Promise<any[]>;
    execute?: (operationId: string, params?: any) => Promise<void>;
  };
  workflows?: {
    list?: () => Promise<any[]>;
    execute?: (workflowId: string, params?: any) => Promise<void>;
  };
  notifications?: {
    send: (title: string, body: string, options?: any) => void;
  };
  ui: {
    showMessage: (message: string, type?: 'info' | 'warning' | 'error') => void;
    showPanel: (panelId: string) => void;
  };
  events: {
    on: (event: string, handler: Function) => void;
    off: (event: string, handler: Function) => void;
    emit: (event: string, data: any) => void;
  };
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const pluginManager = new PluginManager();

export async function initializePlugins(mainWindow: BrowserWindow) {
  await pluginManager.initialize(mainWindow);
}
