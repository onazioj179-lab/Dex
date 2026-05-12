// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Plugin System
// Third-party extension support with sandboxing and APIs
// =============================================================================

import log from 'electron-log';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: PluginAuthor;
  license: string;
  homepage?: string;
  repository?: string;
  main: string;
  renderer?: string;
  contributes: PluginContributions;
  activationEvents: string[];
  engines: EngineRequirements;
  dependencies: Record<string, string>;
  permissions: PluginPermission[];
  signature?: string;
  status: PluginStatus;
  installPath?: string;
  installedAt?: Date;
  updatedAt?: Date;
}

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginContributions {
  commands?: CommandContribution[];
  menus?: MenuContribution[];
  keybindings?: KeybindingContribution[];
  views?: ViewContribution[];
  themes?: ThemeContribution[];
  languages?: LanguageContribution[];
  settings?: SettingContribution[];
  tasks?: TaskContribution[];
  snippets?: SnippetContribution[];
}

export interface CommandContribution {
  command: string;
  title: string;
  category?: string;
  icon?: string;
}

export interface MenuContribution {
  command: string;
  group: string;
  when?: string;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  linux?: string;
  when?: string;
}

export interface ViewContribution {
  id: string;
  name: string;
  location: ViewLocation;
  icon?: string;
}

export type ViewLocation = 'sidebar' | 'panel' | 'editor' | 'statusbar' | 'modal';

export interface ThemeContribution {
  id: string;
  label: string;
  type: 'light' | 'dark';
  path: string;
}

export interface LanguageContribution {
  id: string;
  extensions: string[];
  aliases: string[];
  configuration?: string;
}

export interface SettingContribution {
  id: string;
  title: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default: unknown;
  description: string;
  enum?: unknown[];
}

export interface TaskContribution {
  type: string;
  label: string;
  command: string;
}

export interface SnippetContribution {
  language: string;
  path: string;
}

export interface EngineRequirements {
  dex: string;
  node?: string;
}

export type PluginPermission = 
  | 'filesystem'
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network'
  | 'network:local'
  | 'clipboard'
  | 'notifications'
  | 'system'
  | 'shell'
  | 'storage'
  | 'automation';

export type PluginStatus = 
  | 'installed'
  | 'active'
  | 'inactive'
  | 'disabled'
  | 'error'
  | 'updating';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string | PluginAuthor;
  license: string;
  main: string;
  renderer?: string;
  contributes?: PluginContributions;
  activationEvents?: string[];
  engines?: EngineRequirements;
  dependencies?: Record<string, string>;
  permissions?: PluginPermission[];
}

// =============================================================================
// PLUGIN API
// =============================================================================

export interface PluginAPI {
  // Core
  version: string;
  
  // Commands
  commands: {
    register(id: string, handler: (...args: unknown[]) => unknown): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
    getCommands(): string[];
  };
  
  // UI
  ui: {
    showMessage(message: string, type?: 'info' | 'warning' | 'error'): void;
    showInputBox(options: InputBoxOptions): Promise<string | undefined>;
    showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined>;
    createStatusBarItem(options: StatusBarItemOptions): StatusBarItem;
    createWebviewPanel(id: string, title: string, options?: WebviewOptions): WebviewPanel;
  };
  
  // Workspace
  workspace: {
    getConfiguration(section?: string): Configuration;
    onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => void): Disposable;
    getWorkspaceFolders(): WorkspaceFolder[];
  };
  
  // Storage
  storage: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): string[];
  };
  
  // Events
  events: {
    on(event: string, listener: (...args: unknown[]) => void): Disposable;
    emit(event: string, ...args: unknown[]): void;
  };
  
  // Utilities
  utils: {
    createDisposable(dispose: () => void): Disposable;
    generateId(): string;
  };
}

export interface InputBoxOptions {
  title?: string;
  placeholder?: string;
  value?: string;
  password?: boolean;
  validate?: (value: string) => string | undefined;
}

export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

export interface QuickPickOptions {
  title?: string;
  placeholder?: string;
  canSelectMany?: boolean;
}

export interface StatusBarItemOptions {
  id: string;
  alignment: 'left' | 'right';
  priority?: number;
}

export interface StatusBarItem {
  text: string;
  tooltip?: string;
  command?: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface WebviewOptions {
  enableScripts?: boolean;
  retainContextWhenHidden?: boolean;
  localResourceRoots?: string[];
}

export interface WebviewPanel {
  title: string;
  webview: {
    html: string;
    postMessage(message: unknown): void;
    onDidReceiveMessage(listener: (message: unknown) => void): Disposable;
  };
  dispose(): void;
  onDidDispose(listener: () => void): Disposable;
}

export interface Configuration {
  get<T>(key: string, defaultValue?: T): T;
  has(key: string): boolean;
  update(key: string, value: unknown): Promise<void>;
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
  index: number;
}

export interface Disposable {
  dispose(): void;
}

// =============================================================================
// PLUGIN CONTEXT
// =============================================================================

export interface PluginContext {
  plugin: Plugin;
  api: PluginAPI;
  extensionPath: string;
  storagePath: string;
  subscriptions: Disposable[];
}

export type PluginActivator = (context: PluginContext) => void | Promise<void>;
export type PluginDeactivator = () => void | Promise<void>;

// =============================================================================
// PLUGIN ENGINE
// =============================================================================

export class PluginEngine extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private activePlugins: Map<string, { context: PluginContext; deactivate?: PluginDeactivator }> = new Map();
  private commands: Map<string, (...args: unknown[]) => unknown> = new Map();
  private storage: Map<string, Map<string, unknown>> = new Map();
  private registry: PluginRegistry;
  
  constructor() {
    super();
    this.registry = new PluginRegistry();
  }
  
  // ==========================================================================
  // INSTALLATION
  // ==========================================================================
  
  async installFromFile(filePath: string): Promise<Plugin> {
    this.emit('install-started', { path: filePath });
    
    try {
      // Parse manifest
      const manifest = await this.parseManifest(filePath);
      
      // Validate
      this.validateManifest(manifest);
      
      // Check permissions
      await this.requestPermissions(manifest.permissions || []);
      
      // Create plugin
      const plugin = this.createPlugin(manifest, filePath);
      
      // Install
      this.plugins.set(plugin.id, plugin);
      
      this.emit('installed', { plugin });
      return plugin;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { type: 'install', error: errorMessage });
      throw error;
    }
  }
  
  async installFromRegistry(pluginId: string, version?: string): Promise<Plugin> {
    this.emit('install-started', { id: pluginId, version });
    
    try {
      const registryPlugin = await this.registry.getPlugin(pluginId, version);
      if (!registryPlugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }
      
      // Download and install
      const downloadPath = await this.registry.download(registryPlugin);
      return await this.installFromFile(downloadPath);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { type: 'install', error: errorMessage });
      throw error;
    }
  }
  
  async uninstall(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    // Deactivate first
    await this.deactivate(pluginId);
    
    // Remove
    this.plugins.delete(pluginId);
    this.storage.delete(pluginId);
    
    this.emit('uninstalled', { pluginId });
  }
  
  private async parseManifest(filePath: string): Promise<PluginManifest> {
    // In production, read and parse package.json from plugin
    return {
      name: 'example-plugin',
      version: '1.0.0',
      description: 'Example plugin',
      author: 'Author',
      license: 'MIT',
      main: './dist/main.js'
    };
  }
  
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name) throw new Error('Plugin name is required');
    if (!manifest.version) throw new Error('Plugin version is required');
    if (!manifest.main) throw new Error('Plugin main entry is required');
  }
  
  private async requestPermissions(permissions: PluginPermission[]): Promise<void> {
    // In production, show permission dialog
    this.emit('permissions-requested', { permissions });
  }
  
  private createPlugin(manifest: PluginManifest, installPath: string): Plugin {
    const author = typeof manifest.author === 'string' 
      ? { name: manifest.author } 
      : manifest.author;
    
    return {
      id: this.generatePluginId(manifest.name),
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author,
      license: manifest.license,
      main: manifest.main,
      renderer: manifest.renderer,
      contributes: manifest.contributes || {},
      activationEvents: manifest.activationEvents || ['*'],
      engines: manifest.engines || { dex: '*' },
      dependencies: manifest.dependencies || {},
      permissions: manifest.permissions || [],
      status: 'installed',
      installPath,
      installedAt: new Date()
    };
  }
  
  private generatePluginId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }
  
  // ==========================================================================
  // ACTIVATION
  // ==========================================================================
  
  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    
    if (this.activePlugins.has(pluginId)) return;
    
    this.emit('activating', { pluginId });
    
    try {
      // Create context
      const context = this.createContext(plugin);
      
      // Load and run activator
      // In production, actually load the plugin module
      const activator: PluginActivator = async (ctx) => {
        log.info(`Plugin ${ctx.plugin.name} activated`);
      };
      
      await activator(context);
      
      plugin.status = 'active';
      this.activePlugins.set(pluginId, { context });
      
      this.emit('activated', { pluginId });
      
    } catch (error) {
      plugin.status = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { type: 'activation', pluginId, error: errorMessage });
      throw error;
    }
  }
  
  async deactivate(pluginId: string): Promise<void> {
    const active = this.activePlugins.get(pluginId);
    if (!active) return;
    
    this.emit('deactivating', { pluginId });
    
    try {
      // Run deactivator
      if (active.deactivate) {
        await active.deactivate();
      }
      
      // Dispose subscriptions
      for (const disposable of active.context.subscriptions) {
        disposable.dispose();
      }
      
      // Update status
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        plugin.status = 'inactive';
      }
      
      this.activePlugins.delete(pluginId);
      
      this.emit('deactivated', { pluginId });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { type: 'deactivation', pluginId, error: errorMessage });
      throw error;
    }
  }
  
  private createContext(plugin: Plugin): PluginContext {
    const api = this.createAPI(plugin.id);
    
    return {
      plugin,
      api,
      extensionPath: plugin.installPath || '',
      storagePath: `./plugin-data/${plugin.id}`,
      subscriptions: []
    };
  }
  
  private createAPI(pluginId: string): PluginAPI {
    return {
      version: '1.0.0',
      
      commands: {
        register: (id: string, handler: (...args: unknown[]) => unknown) => {
          const fullId = `${pluginId}.${id}`;
          this.commands.set(fullId, handler);
        },
        execute: async (id: string, ...args: unknown[]) => {
          const handler = this.commands.get(id);
          if (!handler) throw new Error(`Command ${id} not found`);
          return handler(...args);
        },
        getCommands: () => Array.from(this.commands.keys())
      },
      
      ui: {
        showMessage: (message: string, type = 'info') => {
          this.emit('ui-message', { pluginId, message, type });
        },
        showInputBox: async (options: InputBoxOptions) => {
          return new Promise(resolve => {
            this.emit('ui-input', { pluginId, options, resolve });
          });
        },
        showQuickPick: async (items: QuickPickItem[], options?: QuickPickOptions) => {
          return new Promise(resolve => {
            this.emit('ui-quickpick', { pluginId, items, options, resolve });
          });
        },
        createStatusBarItem: (options: StatusBarItemOptions) => {
          const item: StatusBarItem = {
            text: '',
            show: () => this.emit('statusbar-show', { pluginId, id: options.id }),
            hide: () => this.emit('statusbar-hide', { pluginId, id: options.id }),
            dispose: () => this.emit('statusbar-dispose', { pluginId, id: options.id })
          };
          return item;
        },
        createWebviewPanel: (id: string, title: string, options?: WebviewOptions) => {
          const panel: WebviewPanel = {
            title,
            webview: {
              html: '',
              postMessage: (msg) => this.emit('webview-message', { pluginId, id, message: msg }),
              onDidReceiveMessage: (listener) => {
                const handler = (e: { id: string; message: unknown }) => {
                  if (e.id === id) listener(e.message);
                };
                this.on('webview-receive', handler);
                return { dispose: () => this.off('webview-receive', handler) };
              }
            },
            dispose: () => this.emit('webview-dispose', { pluginId, id }),
            onDidDispose: (listener) => {
              this.once(`webview-disposed-${id}`, listener);
              return { dispose: () => {} };
            }
          };
          this.emit('webview-create', { pluginId, id, title, options });
          return panel;
        }
      },
      
      workspace: {
        getConfiguration: (section?: string) => ({
          get: <T>(key: string, defaultValue?: T) => defaultValue as T,
          has: (key: string) => false,
          update: async (key: string, value: unknown) => {}
        }),
        onDidChangeConfiguration: (listener) => {
          this.on('config-change', listener);
          return { dispose: () => this.off('config-change', listener) };
        },
        getWorkspaceFolders: () => []
      },
      
      storage: {
        get: <T>(key: string) => {
          const store = this.storage.get(pluginId);
          return store?.get(key) as T | undefined;
        },
        set: async <T>(key: string, value: T) => {
          let store = this.storage.get(pluginId);
          if (!store) {
            store = new Map();
            this.storage.set(pluginId, store);
          }
          store.set(key, value);
        },
        delete: async (key: string) => {
          this.storage.get(pluginId)?.delete(key);
        },
        keys: () => {
          const store = this.storage.get(pluginId);
          return store ? Array.from(store.keys()) : [];
        }
      },
      
      events: {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          const prefixedEvent = `plugin:${pluginId}:${event}`;
          this.on(prefixedEvent, listener);
          return { dispose: () => this.off(prefixedEvent, listener) };
        },
        emit: (event: string, ...args: unknown[]) => {
          this.emit(`plugin:${pluginId}:${event}`, ...args);
        }
      },
      
      utils: {
        createDisposable: (dispose: () => void) => ({ dispose }),
        generateId: () => crypto.randomBytes(8).toString('hex')
      }
    };
  }
  
  // ==========================================================================
  // PLUGIN MANAGEMENT
  // ==========================================================================
  
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  getActivePlugins(): Plugin[] {
    return Array.from(this.activePlugins.keys())
      .map(id => this.plugins.get(id))
      .filter((p): p is Plugin => p !== undefined);
  }
  
  isActive(pluginId: string): boolean {
    return this.activePlugins.has(pluginId);
  }
  
  async enable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    plugin.status = 'installed';
    await this.activate(pluginId);
  }
  
  async disable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    await this.deactivate(pluginId);
    plugin.status = 'disabled';
  }
  
  // ==========================================================================
  // COMMANDS
  // ==========================================================================

  /** Default per-command execution envelope. Plugins that need longer can
   *  pass a custom timeout via executeCommandWithOptions. */
  private static readonly DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
  private static readonly MAX_COMMAND_TIMEOUT_MS = 120_000;
  private commandFailures = new Map<string, { count: number; lastErrorMs: number }>();

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    return this.executeCommandWithOptions(commandId, { args });
  }

  /**
   * Bounded command execution: hard timeout + per-command failure accounting.
   * Sync throws, async rejections, and timeouts all funnel through the same
   * error path so a single misbehaving plugin command cannot wedge the host.
   */
  async executeCommandWithOptions(
    commandId: string,
    opts: { args?: unknown[]; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const handler = this.commands.get(commandId);
    if (!handler) throw new Error(`Command ${commandId} not found`);

    const args = opts.args ?? [];
    const timeoutMs = Math.min(
      opts.timeoutMs ?? PluginEngine.DEFAULT_COMMAND_TIMEOUT_MS,
      PluginEngine.MAX_COMMAND_TIMEOUT_MS,
    );

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Plugin command "${commandId}" exceeded ${timeoutMs}ms envelope`)),
        timeoutMs,
      );
    });

    try {
      // Wrap the handler call so synchronous throws turn into rejections.
      const handlerPromise = (async () => handler(...args))();
      const result = await Promise.race([handlerPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      const rec = this.commandFailures.get(commandId) ?? { count: 0, lastErrorMs: 0 };
      rec.count++;
      rec.lastErrorMs = Date.now();
      this.commandFailures.set(commandId, rec);
      this.emit('error', {
        type: 'command',
        commandId,
        error: err instanceof Error ? err.message : String(err),
        failures: rec.count,
      });
      throw err;
    }
  }

  /** Snapshot of per-command failure counters for diagnostics. */
  getCommandFailureStats(): Record<string, { count: number; lastErrorMs: number }> {
    const out: Record<string, { count: number; lastErrorMs: number }> = {};
    for (const [k, v] of this.commandFailures) out[k] = { ...v };
    return out;
  }

  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

// =============================================================================
// PLUGIN REGISTRY
// =============================================================================

export interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  versions: string[];
  description: string;
  author: PluginAuthor;
  downloads: number;
  rating: number;
  tags: string[];
  downloadUrl: string;
}

export class PluginRegistry {
  private baseUrl: string = 'https://plugins.dex-app.com';
  
  async search(query: string, options?: { page?: number; limit?: number }): Promise<RegistryPlugin[]> {
    // In production, fetch from registry API
    return [];
  }
  
  async getPlugin(id: string, version?: string): Promise<RegistryPlugin | null> {
    // In production, fetch from registry API
    return null;
  }
  
  async download(plugin: RegistryPlugin): Promise<string> {
    // In production, download plugin package
    return '';
  }
  
  async getPopular(limit: number = 10): Promise<RegistryPlugin[]> {
    return [];
  }
  
  async getRecent(limit: number = 10): Promise<RegistryPlugin[]> {
    return [];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createPluginEngine = () => new PluginEngine();

export default { PluginEngine, PluginRegistry, createPluginEngine };
