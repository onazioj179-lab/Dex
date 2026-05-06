// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { app, BrowserWindow, shell } from 'electron';
import * as log from 'electron-log';

type PluginHooks = {
  name: string;
  version: string;
  description: string;
  author: string;
  onLoad?: (api: any) => void;
  onUnload?: () => void;
  onActivityEvent?: (event: any) => void;
  onFocusSessionStart?: (session: any) => void;
  onFocusSessionEnd?: (session: any) => void;
  onSummaryGenerated?: (summary: any) => void;
};

type LoadedPlugin = {
  id: string;
  filePath: string;
  enabled: boolean;
  hooks: PluginHooks;
  commandHandlers: Record<string, (payload?: any) => any>;
};

export interface PluginViewModel {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  loadError?: string;
}

export interface RewindPluginDeps {
  getRecentActivity: (limit: number) => any[];
  getMainWindow: () => BrowserWindow | null;
}

class RewindPluginManager {
  private pluginsDir: string;
  private settingsFile: string;
  private dataFile: string;
  private deps: RewindPluginDeps | null = null;
  private plugins = new Map<string, LoadedPlugin>();
  private loadErrors = new Map<string, string>();
  private enabledState: Record<string, boolean> = {};
  private pluginData: Record<string, any> = {};

  constructor() {
    const rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.pluginsDir = path.join(rewindDir, 'plugins');
    this.settingsFile = path.join(rewindDir, 'plugin-settings.json');
    this.dataFile = path.join(rewindDir, 'plugin-data.json');
    this.ensureFolders();
    this.loadState();
  }

  initialize(deps: RewindPluginDeps): void {
    this.deps = deps;
    this.loadAll();
  }

  shutdown(): void {
    for (const plugin of this.plugins.values()) {
      try { plugin.hooks.onUnload?.(); } catch (e) { log.warn('[DEX]', e); }
    }
    this.plugins.clear();
  }

  loadAll(): void {
    this.shutdown();
    this.plugins.clear();
    this.loadErrors.clear();

    const files = fs.readdirSync(this.pluginsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(this.pluginsDir, file);
      const id = path.basename(file, '.js');
      try {
        const loaded = this.loadPluginFile(id, filePath);
        this.plugins.set(id, loaded);
      } catch (err) {
        const message = (err as Error).message || 'Failed to load';
        this.loadErrors.set(id, message);
        log.warn(`[RewindPlugin] Failed loading ${id}: ${message}`);
      }
    }
  }

  reloadAll(): void {
    this.loadAll();
  }

  openPluginsFolder(): void {
    shell.openPath(this.pluginsDir).catch((e: unknown) => { log.warn('[DEX]', e); });
  }

  setEnabled(id: string, enabled: boolean): boolean {
    this.enabledState[id] = enabled;
    this.saveState();

    const existing = this.plugins.get(id);
    if (existing) {
      existing.enabled = enabled;
      if (!enabled) {
        try { existing.hooks.onUnload?.(); } catch (e) { log.warn('[DEX]', e); }
      } else {
        try {
          existing.hooks.onLoad?.(this.buildApi(id, existing));
        } catch (err) {
          this.loadErrors.set(id, (err as Error).message || 'onLoad failed');
          existing.enabled = false;
          this.enabledState[id] = false;
          this.saveState();
          return false;
        }
      }
    }

    return true;
  }

  getPlugins(): PluginViewModel[] {
    const loaded = Array.from(this.plugins.entries()).map(([id, plugin]) => ({
      id,
      name: plugin.hooks.name,
      version: plugin.hooks.version,
      description: plugin.hooks.description,
      author: plugin.hooks.author,
      enabled: plugin.enabled,
      loadError: this.loadErrors.get(id),
    }));

    for (const [id, message] of this.loadErrors.entries()) {
      if (!loaded.some(p => p.id === id)) {
        loaded.push({
          id,
          name: id,
          version: '0.0.0',
          description: 'Failed to load plugin',
          author: 'Unknown',
          enabled: false,
          loadError: message,
        });
      }
    }

    return loaded.sort((a, b) => a.name.localeCompare(b.name));
  }

  getAllPluginCommands(): Array<{ pluginId: string; name: string }> {
    const commands: Array<{ pluginId: string; name: string }> = [];
    for (const [id, plugin] of this.plugins.entries()) {
      if (!plugin.enabled) continue;
      for (const name of Object.keys(plugin.commandHandlers)) {
        commands.push({ pluginId: id, name });
      }
    }
    return commands;
  }

  runPluginCommand(pluginId: string, name: string, payload?: any): { success: boolean; error?: string; result?: any } {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.enabled) {
      return { success: false, error: 'Plugin unavailable' };
    }
    const handler = plugin.commandHandlers[name];
    if (!handler) {
      return { success: false, error: 'Command not found' };
    }
    try {
      const result = handler(payload);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Command failed' };
    }
  }

  emitActivity(event: any): void {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      try { plugin.hooks.onActivityEvent?.(event); } catch (e) { log.warn('[DEX]', e); }
    }
  }

  emitFocusStart(session: any): void {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      try { plugin.hooks.onFocusSessionStart?.(session); } catch (e) { log.warn('[DEX]', e); }
    }
  }

  emitFocusEnd(session: any): void {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      try { plugin.hooks.onFocusSessionEnd?.(session); } catch (e) { log.warn('[DEX]', e); }
    }
  }

  emitSummary(summary: any): void {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      try { plugin.hooks.onSummaryGenerated?.(summary); } catch (e) { log.warn('[DEX]', e); }
    }
  }

  private loadPluginFile(id: string, filePath: string): LoadedPlugin {
    const source = fs.readFileSync(filePath, 'utf-8');
    const moduleObj: { exports: any } = { exports: {} };

    const sandboxRequire = (moduleName: string) => {
      const blocked = ['http', 'https', 'net', 'tls', 'dgram', 'electron', 'child_process'];
      if (blocked.includes(moduleName)) {
        throw new Error(`Module ${moduleName} is not allowed in plugins`);
      }
      if (moduleName.startsWith('.')) {
        throw new Error('Relative imports are not allowed in plugins');
      }
      throw new Error(`Module ${moduleName} is not available`);
    };

    const context = vm.createContext({
      module: moduleObj,
      exports: moduleObj.exports,
      require: sandboxRequire,
      console: {
        log: (...args: any[]) => log.info('[Plugin]', ...args),
        warn: (...args: any[]) => log.warn('[Plugin]', ...args),
        error: (...args: any[]) => log.error('[Plugin]', ...args),
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      Date,
      Math,
      JSON,
      process: { env: {} },
      fetch: undefined,
      XMLHttpRequest: undefined,
      WebSocket: undefined,
    });

    const wrapped = `(function(){ ${source}\n})();`;
    vm.runInContext(wrapped, context, { timeout: 1500, filename: filePath });

    const hooks = moduleObj.exports as PluginHooks;
    if (!hooks || typeof hooks !== 'object') {
      throw new Error('Plugin must export an object');
    }
    for (const field of ['name', 'version', 'description', 'author']) {
      if (typeof (hooks as any)[field] !== 'string' || !(hooks as any)[field]) {
        throw new Error(`Missing required field ${field}`);
      }
    }

    const loaded: LoadedPlugin = {
      id,
      filePath,
      enabled: this.enabledState[id] !== false,
      hooks,
      commandHandlers: {},
    };

    if (loaded.enabled) {
      hooks.onLoad?.(this.buildApi(id, loaded));
    }

    return loaded;
  }

  private buildApi(pluginId: string, plugin: LoadedPlugin) {
    return {
      log: (message: string) => {
        if (typeof message !== 'string') return;
        log.info(`[Plugin:${pluginId}] ${message}`);
      },
      notify: (title: string, body: string) => {
        const mainWindow = this.deps?.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('rewind:plugin-notify', {
          title: String(title || 'Plugin'),
          body: String(body || ''),
          pluginId,
          timestamp: Date.now(),
        });
      },
      getRecentActivity: (limit: number) => {
        const size = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
        return this.deps?.getRecentActivity(size) || [];
      },
      savePluginData: (key: string, value: any) => {
        if (typeof key !== 'string' || !key.trim()) return;
        this.pluginData[`${pluginId}:${key}`] = value;
        this.saveState();
      },
      getPluginData: (key: string) => {
        if (typeof key !== 'string' || !key.trim()) return null;
        return this.pluginData[`${pluginId}:${key}`] ?? null;
      },
      onCommand: (name: string, handler: (payload?: any) => any) => {
        if (typeof name !== 'string' || !name.trim()) return;
        if (typeof handler !== 'function') return;
        plugin.commandHandlers[name.trim()] = handler;
      },
    };
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.settingsFile)) {
        this.enabledState = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8')) || {};
      }
      if (fs.existsSync(this.dataFile)) {
        this.pluginData = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8')) || {};
      }
    } catch {
      this.enabledState = {};
      this.pluginData = {};
    }
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.enabledState, null, 2), 'utf-8');
      fs.writeFileSync(this.dataFile, JSON.stringify(this.pluginData, null, 2), 'utf-8');
    } catch (err) { log.warn('[RewindPluginManager] Failed to save state:', err); }
  }

  private ensureFolders(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
  }
}

export const rewindPluginManager = new RewindPluginManager();
