// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX - Plugin System: Sandboxed extension runtime
// Sandboxed plugin architecture with strict resource budgets
// =============================================================================

import log from 'electron-log';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

// =============================================================================
// PLUGIN TYPES
// =============================================================================

export enum PluginState {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  ACTIVE = 'active',
  DISABLED = 'disabled',
  ERROR = 'error',
  SUSPENDED = 'suspended',
}

export enum PluginPermission {
  // File system
  READ_FILES = 'read_files',
  WRITE_FILES = 'write_files',
  DELETE_FILES = 'delete_files',
  
  // Network
  NETWORK_LOCAL = 'network_local',
  NETWORK_INTERNET = 'network_internet',
  
  // System
  SYSTEM_INFO = 'system_info',
  NOTIFICATIONS = 'notifications',
  CLIPBOARD = 'clipboard',
  
  // Dex APIs
  DEX_WORKFLOWS = 'dex_workflows',
  DEX_MEDIA = 'dex_media',
  DEX_SEARCH = 'dex_search',
  DEX_VOICE = 'dex_voice',
  
  // UI
  UI_PANEL = 'ui_panel',
  UI_TOOLBAR = 'ui_toolbar',
  UI_COMMAND = 'ui_command',
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  homepage?: string;
  repository?: string;
  license: string;
  
  // Entry point
  main: string;
  
  // Permissions required
  permissions: PluginPermission[];
  
  // Resource limits
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxDiskMB: number;
    networkRateLimit: number; // KB/s
  };
  
  // UI contributions
  contributes?: {
    commands?: PluginCommand[];
    panels?: PluginPanel[];
    settings?: PluginSetting[];
  };
  
  // Dependencies
  dexVersion: string;
  dependencies?: Record<string, string>;
}

export interface PluginCommand {
  id: string;
  title: string;
  icon?: string;
  keybinding?: string;
}

export interface PluginPanel {
  id: string;
  title: string;
  icon?: string;
  location: 'sidebar' | 'bottom' | 'modal';
}

export interface PluginSetting {
  id: string;
  title: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: unknown;
  options?: Array<{ value: unknown; label: string }>;
}

export interface Plugin {
  manifest: PluginManifest;
  state: PluginState;
  installPath: string;
  installedAt: number;
  lastActivity: number;
  errorCount: number;
  lastError?: string;
  resourceUsage: {
    memoryMB: number;
    cpuPercent: number;
    diskMB: number;
    networkKBps: number;
  };
}

// =============================================================================
// PLUGIN SANDBOX
// =============================================================================

interface SandboxedPlugin {
  id: string;
  api: PluginAPI;
  cleanup: () => void;
}

interface PluginAPI {
  // Logging
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  
  // Storage
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  
  // Events
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  
  // Commands
  registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => void;
  unregisterCommand: (id: string) => void;
  executeCommand: (id: string, ...args: unknown[]) => Promise<unknown>;
}

class PluginSandbox {
  private sandboxedPlugins: Map<string, SandboxedPlugin> = new Map();
  private pluginStorage: Map<string, Map<string, unknown>> = new Map();
  private pluginCommands: Map<string, Map<string, (...args: unknown[]) => unknown>> = new Map();
  private pluginEvents: Map<string, EventEmitter> = new Map();
  
  constructor() {}
  
  createSandbox(plugin: Plugin): PluginAPI {
    const pluginId = plugin.manifest.id;
    
    // Initialize storage
    if (!this.pluginStorage.has(pluginId)) {
      this.pluginStorage.set(pluginId, new Map());
    }
    
    // Initialize commands
    if (!this.pluginCommands.has(pluginId)) {
      this.pluginCommands.set(pluginId, new Map());
    }
    
    // Initialize events
    if (!this.pluginEvents.has(pluginId)) {
      this.pluginEvents.set(pluginId, new EventEmitter());
    }
    
    const storage = this.pluginStorage.get(pluginId)!;
    const commands = this.pluginCommands.get(pluginId)!;
    const events = this.pluginEvents.get(pluginId)!;
    
    // Create sandboxed API
    const api: PluginAPI = {
      // Logging (prefixed with plugin ID)
      log: (message: string) => {
        log.info(`[Plugin:${pluginId}] ${message}`);
      },
      warn: (message: string) => {
        log.warn(`[Plugin:${pluginId}] ${message}`);
      },
      error: (message: string) => {
        log.error(`[Plugin:${pluginId}] ${message}`);
      },
      
      // Storage (isolated per plugin)
      storage: {
        get: async <T>(key: string): Promise<T | undefined> => {
          return storage.get(key) as T | undefined;
        },
        set: async (key: string, value: unknown): Promise<void> => {
          // Check storage limits
          const currentSize = this.calculateStorageSize(storage);
          const newSize = JSON.stringify(value).length;
          const maxSize = plugin.manifest.resourceLimits.maxDiskMB * 1024 * 1024;
          
          if (currentSize + newSize > maxSize) {
            throw new Error('Storage limit exceeded');
          }
          
          storage.set(key, value);
          await this.persistPluginStorage(pluginId);
        },
        delete: async (key: string): Promise<void> => {
          storage.delete(key);
          await this.persistPluginStorage(pluginId);
        },
      },
      
      // Events (isolated per plugin)
      on: (event: string, callback: (...args: unknown[]) => void) => {
        events.on(event, callback);
      },
      off: (event: string, callback: (...args: unknown[]) => void) => {
        events.off(event, callback);
      },
      emit: (event: string, ...args: unknown[]) => {
        events.emit(event, ...args);
      },
      
      // Commands (registered globally but namespaced)
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
        const fullId = `${pluginId}.${id}`;
        commands.set(fullId, handler);
      },
      unregisterCommand: (id: string) => {
        const fullId = `${pluginId}.${id}`;
        commands.delete(fullId);
      },
      executeCommand: async (id: string, ...args: unknown[]): Promise<unknown> => {
        // Can only execute own commands or public commands
        const fullId = id.includes('.') ? id : `${pluginId}.${id}`;
        const handler = commands.get(fullId);
        
        if (!handler) {
          throw new Error(`Command not found: ${id}`);
        }
        
        return handler(...args);
      },
    };
    
    return api;
  }
  
  private calculateStorageSize(storage: Map<string, unknown>): number {
    let size = 0;
    for (const value of storage.values()) {
      size += JSON.stringify(value).length;
    }
    return size;
  }
  
  private async persistPluginStorage(pluginId: string): Promise<void> {
    const storage = this.pluginStorage.get(pluginId);
    if (!storage) return;
    
    const storagePath = path.join(
      app.getPath('userData'),
      'plugins',
      pluginId,
      'storage.json'
    );
    
    const storageDir = path.dirname(storagePath);
    await fs.promises.mkdir(storageDir, { recursive: true });
    
    const data: Record<string, unknown> = {};
    for (const [key, value] of storage) {
      data[key] = value;
    }
    
    await fs.promises.writeFile(storagePath, JSON.stringify(data, null, 2));
  }
  
  async loadPluginStorage(pluginId: string): Promise<void> {
    const storagePath = path.join(
      app.getPath('userData'),
      'plugins',
      pluginId,
      'storage.json'
    );
    
    try {
      const data = await fs.promises.readFile(storagePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, unknown>;
      
      const storage = new Map<string, unknown>();
      for (const [key, value] of Object.entries(parsed)) {
        storage.set(key, value);
      }
      
      this.pluginStorage.set(pluginId, storage);
    } catch {
      // No existing storage
      this.pluginStorage.set(pluginId, new Map());
    }
  }
  
  destroySandbox(pluginId: string): void {
    this.pluginCommands.get(pluginId)?.clear();
    this.pluginEvents.get(pluginId)?.removeAllListeners();
    this.sandboxedPlugins.delete(pluginId);
  }
}

// =============================================================================
// PLUGIN MANAGER
// =============================================================================

export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private sandbox = new PluginSandbox();
  private readonly pluginsDir: string;
  
  constructor() {
    super();
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins');
    this.ensurePluginsDir();
  }
  
  private async ensurePluginsDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.pluginsDir, { recursive: true });
    } catch {
      // Directory exists
    }
  }
  
  // Install a plugin from a directory or archive
  async installPlugin(sourcePath: string): Promise<Plugin> {
    // Read manifest
    const manifestPath = path.join(sourcePath, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid plugin: manifest.json not found');
    }
    
    const manifestData = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData) as PluginManifest;
    
    // Validate manifest
    this.validateManifest(manifest);
    
    // Check for existing plugin
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already installed`);
    }
    
    // Copy to plugins directory
    const installPath = path.join(this.pluginsDir, manifest.id);
    await this.copyDirectory(sourcePath, installPath);
    
    // Create plugin entry
    const plugin: Plugin = {
      manifest,
      state: PluginState.UNLOADED,
      installPath,
      installedAt: Date.now(),
      lastActivity: Date.now(),
      errorCount: 0,
      resourceUsage: {
        memoryMB: 0,
        cpuPercent: 0,
        diskMB: 0,
        networkKBps: 0,
      },
    };
    
    this.plugins.set(manifest.id, plugin);
    this.emit('plugin:installed', plugin);
    
    return plugin;
  }
  
  private validateManifest(manifest: PluginManifest): void {
    const required = ['id', 'name', 'version', 'author', 'main', 'permissions', 'resourceLimits', 'dexVersion'];
    
    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Invalid manifest: missing ${field}`);
      }
    }
    
    // Validate ID format
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Invalid plugin ID: must be lowercase alphanumeric with hyphens');
    }
    
    // Validate version
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error('Invalid version: must be semver (x.y.z)');
    }
    
    // Validate resource limits
    const { maxMemoryMB, maxCpuPercent, maxDiskMB, networkRateLimit } = manifest.resourceLimits;
    
    if (maxMemoryMB > 100) {
      throw new Error('Plugin memory limit cannot exceed 100MB');
    }
    
    if (maxCpuPercent > 10) {
      throw new Error('Plugin CPU limit cannot exceed 10%');
    }
    
    if (maxDiskMB > 50) {
      throw new Error('Plugin disk limit cannot exceed 50MB');
    }
    
    if (networkRateLimit > 1000) {
      throw new Error('Plugin network limit cannot exceed 1000 KB/s');
    }
  }
  
  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });
    
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
  
  // Uninstall a plugin
  async uninstallPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }
    
    // Deactivate first
    if (plugin.state === PluginState.ACTIVE) {
      await this.deactivatePlugin(pluginId);
    }
    
    // Remove files
    try {
      await fs.promises.rm(plugin.installPath, { recursive: true, force: true });
    } catch (err) {
      log.error('[PluginManager] Failed to remove plugin files:', err);
    }
    
    this.plugins.delete(pluginId);
    this.emit('plugin:uninstalled', { id: pluginId });
  }
  
  // Activate a plugin
  async activatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }
    
    if (plugin.state === PluginState.ACTIVE) {
      return; // Already active
    }
    
    plugin.state = PluginState.LOADING;
    
    try {
      // Load storage
      await this.sandbox.loadPluginStorage(pluginId);
      
      // Create sandboxed API
      const api = this.sandbox.createSandbox(plugin);
      
      // In a real implementation, this would load and execute the plugin code
      // in a sandboxed context (e.g., using vm2 or a separate process)
      
      plugin.state = PluginState.ACTIVE;
      plugin.lastActivity = Date.now();
      
      this.emit('plugin:activated', plugin);
    } catch (err) {
      plugin.state = PluginState.ERROR;
      plugin.errorCount++;
      plugin.lastError = String(err);
      
      this.emit('plugin:error', { plugin, error: err });
      throw err;
    }
  }
  
  // Deactivate a plugin
  async deactivatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }
    
    if (plugin.state !== PluginState.ACTIVE) {
      return; // Not active
    }
    
    // Destroy sandbox
    this.sandbox.destroySandbox(pluginId);
    
    plugin.state = PluginState.DISABLED;
    plugin.lastActivity = Date.now();
    
    this.emit('plugin:deactivated', plugin);
  }
  
  // Suspend a plugin (exceeded resource limits)
  suspendPlugin(pluginId: string, reason: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    plugin.state = PluginState.SUSPENDED;
    plugin.lastError = `Suspended: ${reason}`;
    
    this.sandbox.destroySandbox(pluginId);
    
    this.emit('plugin:suspended', { plugin, reason });
  }
  
  // Get all plugins
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  // Get a specific plugin
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  // Get active plugins
  getActivePlugins(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(p => p.state === PluginState.ACTIVE);
  }
  
  // Load installed plugins on startup
  async loadInstalledPlugins(): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.pluginsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const pluginPath = path.join(this.pluginsDir, entry.name);
        const manifestPath = path.join(pluginPath, 'manifest.json');
        
        try {
          if (fs.existsSync(manifestPath)) {
            const manifestData = await fs.promises.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestData) as PluginManifest;
            
            const plugin: Plugin = {
              manifest,
              state: PluginState.UNLOADED,
              installPath: pluginPath,
              installedAt: 0, // Unknown
              lastActivity: Date.now(),
              errorCount: 0,
              resourceUsage: {
                memoryMB: 0,
                cpuPercent: 0,
                diskMB: 0,
                networkKBps: 0,
              },
            };
            
            this.plugins.set(manifest.id, plugin);
          }
        } catch (err) {
          log.error(`[PluginManager] Failed to load plugin from ${pluginPath}:`, err);
        }
      }
    } catch {
      // No plugins directory
    }
  }
  
  // Get plugin statistics
  getStats(): {
    total: number;
    active: number;
    disabled: number;
    errored: number;
    totalMemoryMB: number;
    totalCpuPercent: number;
  } {
    const plugins = Array.from(this.plugins.values());
    
    return {
      total: plugins.length,
      active: plugins.filter(p => p.state === PluginState.ACTIVE).length,
      disabled: plugins.filter(p => p.state === PluginState.DISABLED).length,
      errored: plugins.filter(p => p.state === PluginState.ERROR).length,
      totalMemoryMB: plugins.reduce((sum, p) => sum + p.resourceUsage.memoryMB, 0),
      totalCpuPercent: plugins.reduce((sum, p) => sum + p.resourceUsage.cpuPercent, 0),
    };
  }

  // Permission approval gate — checks user-approved permissions before activation
  private approvedPermissions: Map<string, PluginPermission[]> = new Map();

  async requestPermissions(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    const requested = plugin.manifest.permissions;
    if (!requested?.length) return true; // No permissions needed

    // Already approved?
    const approved = this.approvedPermissions.get(pluginId);
    if (approved && requested.every(p => approved.includes(p))) return true;

    // Show permission dialog
    const { dialog } = require('electron');
    const permLabels = requested.map(p => `  • ${p}`).join('\n');
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Deny', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      title: `Plugin Permissions — ${plugin.manifest.name}`,
      message: `"${plugin.manifest.name}" by ${plugin.manifest.author} requests these permissions:\n\n${permLabels}\n\nAllow this plugin?`,
    });

    if (response === 1) {
      this.approvedPermissions.set(pluginId, [...requested]);
      return true;
    }
    return false;
  }

  // Activate with permission check
  async activatePluginSafe(pluginId: string): Promise<void> {
    const allowed = await this.requestPermissions(pluginId);
    if (!allowed) {
      throw new Error('Plugin permissions denied by user');
    }
    return this.activatePlugin(pluginId);
  }

  // Register IPC handlers for renderer access
  setupIPC(): void {
    const { ipcMain } = require('electron');

    ipcMain.handle('plugins:list', () => {
      return this.getPlugins().map(p => ({
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        author: p.manifest.author,
        state: p.state,
        permissions: p.manifest.permissions,
        errorCount: p.errorCount,
        lastError: p.lastError,
      }));
    });

    ipcMain.handle('plugins:activate', async (_e: Electron.IpcMainInvokeEvent, pluginId: string) => {
      await this.activatePluginSafe(pluginId);
      return true;
    });

    ipcMain.handle('plugins:deactivate', async (_e: Electron.IpcMainInvokeEvent, pluginId: string) => {
      await this.deactivatePlugin(pluginId);
      return true;
    });

    ipcMain.handle('plugins:uninstall', async (_e: Electron.IpcMainInvokeEvent, pluginId: string) => {
      await this.uninstallPlugin(pluginId);
      return true;
    });

    ipcMain.handle('plugins:stats', () => this.getStats());

    ipcMain.handle('plugins:install', async (_e: Electron.IpcMainInvokeEvent, sourcePath: string) => {
      const plugin = await this.installPlugin(sourcePath);
      return { id: plugin.manifest.id, name: plugin.manifest.name };
    });

    log.info('[PluginManager] IPC handlers registered');
  }
}

// Singleton instance
export const pluginManager = new PluginManager();
