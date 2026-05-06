// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { app, ipcMain, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DEX_API_VERSION = '1.0.0';

interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  minDEXVersion: string;
  minAPIVersion?: string;
  permissions: string[];
  entryPoint: string;
  icon: string;
  description: string;
  category: 'Create' | 'Manage' | 'Automate' | 'System';
  type: 'inner-app' | 'plugin' | 'theme';
  author?: string;
  homepage?: string;
}

interface LoadedExtension {
  manifest: ExtensionManifest;
  directory: string;
  loaded: boolean;
  enabled: boolean;
  error?: string;
}

interface ThemeDefinition {
  id: string;
  name: string;
  properties: Record<string, string>;
}

interface APIMethod {
  name: string;
  introduced: string;
  deprecated?: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string }>;
  returnType: string;
}

interface DevConsoleEntry {
  timestamp: number;
  type: 'event' | 'ipc' | 'log';
  level?: string;
  module?: string;
  eventType?: string;
  channel?: string;
  sender?: string;
  receiver?: string;
  payload: any;
}

const VALID_PERMISSIONS = new Set([
  'storage:read', 'storage:write',
  'files:read', 'files:write',
  'notes:read', 'notes:write',
  'tasks:read', 'tasks:write',
  'media:read', 'media:write',
  'settings:read', 'settings:write',
  'events:subscribe', 'events:emit',
  'network:fetch', 'network:websocket',
  'clipboard:read', 'clipboard:write',
  'notifications:send',
  'ui:panel', 'ui:modal', 'ui:toolbar',
  'system:info'
]);

const API_METHODS: APIMethod[] = [
  { name: 'dex.storage.get', introduced: '1.0.0', description: 'Read a value from extension storage', parameters: [{ name: 'key', type: 'string', description: 'Storage key' }], returnType: 'Promise<any>' },
  { name: 'dex.storage.set', introduced: '1.0.0', description: 'Write a value to extension storage', parameters: [{ name: 'key', type: 'string', description: 'Storage key' }, { name: 'value', type: 'any', description: 'Value to store' }], returnType: 'Promise<void>' },
  { name: 'dex.storage.delete', introduced: '1.0.0', description: 'Delete a value from extension storage', parameters: [{ name: 'key', type: 'string', description: 'Storage key' }], returnType: 'Promise<void>' },
  { name: 'dex.storage.list', introduced: '1.0.0', description: 'List all keys in extension storage', parameters: [], returnType: 'Promise<string[]>' },
  { name: 'dex.events.on', introduced: '1.0.0', description: 'Subscribe to an event on the event bus', parameters: [{ name: 'event', type: 'string', description: 'Event name' }, { name: 'callback', type: 'Function', description: 'Event handler' }], returnType: '() => void' },
  { name: 'dex.events.emit', introduced: '1.0.0', description: 'Emit an event on the event bus', parameters: [{ name: 'event', type: 'string', description: 'Event name' }, { name: 'data', type: 'any', description: 'Event data' }], returnType: 'void' },
  { name: 'dex.notes.list', introduced: '1.0.0', description: 'List all notes', parameters: [{ name: 'folderId', type: 'string?', description: 'Optional folder filter' }], returnType: 'Promise<NoteListItem[]>' },
  { name: 'dex.notes.get', introduced: '1.0.0', description: 'Get a note by ID', parameters: [{ name: 'id', type: 'string', description: 'Note ID' }], returnType: 'Promise<Note>' },
  { name: 'dex.notes.create', introduced: '1.0.0', description: 'Create a new note', parameters: [{ name: 'options', type: 'CreateNoteOptions', description: 'Note creation options' }], returnType: 'Promise<Note>' },
  { name: 'dex.tasks.list', introduced: '1.0.0', description: 'List all tasks', parameters: [{ name: 'filter', type: 'TaskFilter?', description: 'Optional task filter' }], returnType: 'Promise<Task[]>' },
  { name: 'dex.tasks.create', introduced: '1.0.0', description: 'Create a new task', parameters: [{ name: 'options', type: 'CreateTaskOptions', description: 'Task creation options' }], returnType: 'Promise<Task>' },
  { name: 'dex.ui.showNotification', introduced: '1.0.0', description: 'Show a notification to the user', parameters: [{ name: 'message', type: 'string', description: 'Notification content' }, { name: 'type', type: 'string', description: 'info, warning, or error' }], returnType: 'void' },
  { name: 'dex.ui.showPanel', introduced: '1.0.0', description: 'Open a panel in the DEX workspace', parameters: [{ name: 'options', type: 'PanelOptions', description: 'Panel configuration' }], returnType: 'Promise<Panel>' },
  { name: 'dex.system.getVersion', introduced: '1.0.0', description: 'Get the current DEX version', parameters: [], returnType: 'string' },
  { name: 'dex.system.getAPIVersion', introduced: '1.0.0', description: 'Get the current API version', parameters: [], returnType: 'string' },
  { name: 'dex.system.getPlatform', introduced: '1.0.0', description: 'Get the current platform', parameters: [], returnType: 'string' },
  { name: 'dex.clipboard.read', introduced: '1.0.0', description: 'Read clipboard content', parameters: [], returnType: 'Promise<string>' },
  { name: 'dex.clipboard.write', introduced: '1.0.0', description: 'Write to clipboard', parameters: [{ name: 'text', type: 'string', description: 'Text to write' }], returnType: 'Promise<void>' },
  { name: 'dex.files.read', introduced: '1.0.0', description: 'Read a file from the sandbox', parameters: [{ name: 'path', type: 'string', description: 'Relative file path' }], returnType: 'Promise<Buffer>' },
  { name: 'dex.files.write', introduced: '1.0.0', description: 'Write a file to the sandbox', parameters: [{ name: 'path', type: 'string', description: 'Relative file path' }, { name: 'data', type: 'Buffer|string', description: 'File content' }], returnType: 'Promise<void>' },
  { name: 'dex.network.fetch', introduced: '1.0.0', description: 'Make an HTTP request', parameters: [{ name: 'url', type: 'string', description: 'URL to fetch' }, { name: 'options', type: 'FetchOptions?', description: 'Optional fetch options' }], returnType: 'Promise<Response>' }
];

const CSS_CUSTOM_PROPERTIES = [
  '--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary', '--color-bg-elevated',
  '--color-bg-overlay', '--color-bg-input', '--color-bg-hover', '--color-bg-active',
  '--color-text-primary', '--color-text-secondary', '--color-text-tertiary', '--color-text-disabled',
  '--color-text-inverse', '--color-text-link',
  '--color-accent-primary', '--color-accent-secondary', '--color-accent-hover', '--color-accent-active',
  '--color-border-primary', '--color-border-secondary', '--color-border-focus',
  '--color-success', '--color-warning', '--color-error', '--color-info',
  '--color-success-bg', '--color-warning-bg', '--color-error-bg', '--color-info-bg',
  '--spacing-1', '--spacing-2', '--spacing-3', '--spacing-4', '--spacing-5', '--spacing-6', '--spacing-8',
  '--radius-sm', '--radius-md', '--radius-lg', '--radius-full',
  '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg', '--font-size-xl',
  '--font-weight-normal', '--font-weight-medium', '--font-weight-semibold', '--font-weight-bold',
  '--shadow-sm', '--shadow-md', '--shadow-lg',
  '--transition-fast', '--transition-normal', '--transition-slow',
  '--z-dropdown', '--z-modal', '--z-tooltip', '--z-notification'
];

export class DeveloperPlatformManager extends EventEmitter {
  private extensions: Map<string, LoadedExtension> = new Map();
  private themes: Map<string, ThemeDefinition> = new Map();
  private devConsoleBuffer: DevConsoleEntry[] = [];
  private devConsolePaused = false;
  private devConsoleMaxEntries = 5000;
  private sandboxMode = false;
  private sandboxDataDir = '';
  private extensionsDir = '';
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    try {
      this.mainWindow = mainWindow || null;
      const userDataPath = app.getPath('userData');
      this.extensionsDir = path.join(userDataPath, 'extensions');

      if (!fs.existsSync(this.extensionsDir)) {
        fs.mkdirSync(this.extensionsDir, { recursive: true });
      }

      this.loadAllExtensions();
      this.setupIPC();
      this.setupEventBusMonitor();

      this.initialized = true;
      log.info('[DeveloperPlatformManager] Initialized. Extensions loaded:', this.extensions.size);
    } catch (err) {
      log.error('[DeveloperPlatformManager] Initialization failed:', err);
    }
  }

  private loadAllExtensions(): void {
    if (!fs.existsSync(this.extensionsDir)) return;

    const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extDir = path.join(this.extensionsDir, entry.name);
      const manifestPath = path.join(extDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: ExtensionManifest = JSON.parse(raw);
        this.loadExtension(manifest, extDir);
      } catch (err) {
        log.warn('[DeveloperPlatformManager] Failed to load extension from', extDir, err);
      }
    }
  }

  private loadExtension(manifest: ExtensionManifest, directory: string): void {
    if (!manifest.id || !manifest.name || !manifest.version) {
      log.warn('[DeveloperPlatformManager] Invalid manifest: missing required fields');
      this.extensions.set(manifest.id || directory, {
        manifest, directory, loaded: false, enabled: false,
        error: 'Invalid manifest: missing required fields'
      });
      return;
    }

    const requiredAPI = manifest.minAPIVersion || '1.0.0';
    if (!this.satisfiesVersion(DEX_API_VERSION, requiredAPI)) {
      const msg = `Extension ${manifest.id} requires API version ${requiredAPI} but current is ${DEX_API_VERSION}`;
      log.warn('[DeveloperPlatformManager]', msg);
      this.devConsoleLog('log', 'DeveloperPlatform', msg, 'warning');
      this.extensions.set(manifest.id, {
        manifest, directory, loaded: false, enabled: false, error: msg
      });
      return;
    }

    for (const perm of manifest.permissions || []) {
      if (!VALID_PERMISSIONS.has(perm)) {
        log.warn('[DeveloperPlatformManager] Unknown permission:', perm, 'in extension', manifest.id);
      }
    }

    if (manifest.type === 'theme') {
      this.loadThemeExtension(manifest, directory);
    }

    this.extensions.set(manifest.id, {
      manifest, directory, loaded: true, enabled: true
    });

    log.info('[DeveloperPlatformManager] Loaded extension:', manifest.id, manifest.version);
  }

  private loadThemeExtension(manifest: ExtensionManifest, directory: string): void {
    const themePath = path.join(directory, manifest.entryPoint || 'theme.json');
    if (!fs.existsSync(themePath)) return;

    try {
      const raw = fs.readFileSync(themePath, 'utf-8');
      const themeData = JSON.parse(raw);
      const properties: Record<string, string> = {};

      for (const [key, value] of Object.entries(themeData)) {
        if (CSS_CUSTOM_PROPERTIES.includes(key) && typeof value === 'string') {
          properties[key] = value;
        }
      }

      this.themes.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        properties
      });
    } catch (err) {
      log.warn('[DeveloperPlatformManager] Failed to load theme:', manifest.id, err);
    }
  }

  private satisfiesVersion(current: string, required: string): boolean {
    const c = current.split('.').map(Number);
    const r = required.split('.').map(Number);
    if (c[0] > r[0]) return true;
    if (c[0] < r[0]) return false;
    if (c[1] > r[1]) return true;
    if (c[1] < r[1]) return false;
    return c[2] >= r[2];
  }

  private devConsoleLog(type: 'event' | 'ipc' | 'log', module: string, payload: any, level: string = 'info', extra?: Record<string, any>): void {
    if (this.devConsolePaused) return;
    const entry: DevConsoleEntry = {
      timestamp: Date.now(),
      type,
      level,
      module,
      payload,
      ...extra
    };
    this.devConsoleBuffer.push(entry);
    if (this.devConsoleBuffer.length > this.devConsoleMaxEntries) {
      this.devConsoleBuffer = this.devConsoleBuffer.slice(-Math.round(this.devConsoleMaxEntries * 0.8));
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('devplatform:console-entry', entry);
    }
  }

  private setupEventBusMonitor(): void {
    const origEmit = this.emit.bind(this);
    this.emit = (event: string, ...args: any[]) => {
      this.devConsoleLog('event', 'EventBus', { args }, 'info', { eventType: event });
      return origEmit(event, ...args);
    };
  }

  installExtension(packagePath: string): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(packagePath)) {
        return { success: false, error: 'Package file not found' };
      }

      const raw = fs.readFileSync(path.join(packagePath, 'manifest.json'), 'utf-8');
      const manifest: ExtensionManifest = JSON.parse(raw);

      if (!manifest.id || !manifest.name || !manifest.version) {
        return { success: false, error: 'Invalid manifest' };
      }

      const targetDir = path.join(this.extensionsDir, manifest.id);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true });
      }

      this.copyDirectorySync(packagePath, targetDir);
      this.loadExtension(manifest, targetDir);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  uninstallExtension(extensionId: string): boolean {
    const ext = this.extensions.get(extensionId);
    if (!ext) return false;

    try {
      if (fs.existsSync(ext.directory)) {
        fs.rmSync(ext.directory, { recursive: true });
      }
      this.extensions.delete(extensionId);
      this.themes.delete(extensionId);
      return true;
    } catch (err) {
      log.error('[DeveloperPlatformManager] Uninstall failed:', extensionId, err);
      return false;
    }
  }

  enableExtension(extensionId: string): boolean {
    const ext = this.extensions.get(extensionId);
    if (!ext) return false;
    ext.enabled = true;
    return true;
  }

  disableExtension(extensionId: string): boolean {
    const ext = this.extensions.get(extensionId);
    if (!ext) return false;
    ext.enabled = false;
    return true;
  }

  enterSandboxMode(): string {
    const tempDir = path.join(app.getPath('temp'), `dex-sandbox-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    this.sandboxMode = true;
    this.sandboxDataDir = tempDir;
    return tempDir;
  }

  exitSandboxMode(): void {
    if (this.sandboxMode && this.sandboxDataDir) {
      try {
        fs.rmSync(this.sandboxDataDir, { recursive: true });
      } catch (_e) { /* ignore */ }
    }
    this.sandboxMode = false;
    this.sandboxDataDir = '';
  }

  isSandboxMode(): boolean {
    return this.sandboxMode;
  }

  applyTheme(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme) return false;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('devplatform:apply-theme', theme.properties);
    }
    return true;
  }

  getAPIDocumentation(): APIMethod[] {
    return API_METHODS.map(m => ({ ...m }));
  }

  getAPIVersion(): string {
    return DEX_API_VERSION;
  }

  getCSSProperties(): string[] {
    return [...CSS_CUSTOM_PROPERTIES];
  }

  validateExtensionPackage(packageDir: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const manifestPath = path.join(packageDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      errors.push('manifest.json not found');
      return { valid: false, errors };
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      if (!manifest.id) errors.push('Missing id in manifest');
      if (!manifest.name) errors.push('Missing name in manifest');
      if (!manifest.version) errors.push('Missing version in manifest');
      if (!manifest.entryPoint) errors.push('Missing entryPoint in manifest');
      if (!manifest.icon) errors.push('Missing icon in manifest');
      if (!manifest.description) errors.push('Missing description in manifest');
      if (!manifest.category) errors.push('Missing category in manifest');

      if (manifest.id && !/^[a-zA-Z][a-zA-Z0-9._-]+$/.test(manifest.id)) {
        errors.push('Invalid extension ID format');
      }

      if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        errors.push('Version must be semantic (x.y.z)');
      }

      if (manifest.entryPoint && !fs.existsSync(path.join(packageDir, manifest.entryPoint))) {
        errors.push('Entry point file not found: ' + manifest.entryPoint);
      }

      if (manifest.icon && !fs.existsSync(path.join(packageDir, manifest.icon))) {
        errors.push('Icon file not found: ' + manifest.icon);
      }

      if (manifest.permissions) {
        for (const perm of manifest.permissions) {
          if (!VALID_PERMISSIONS.has(perm)) {
            errors.push('Unknown permission: ' + perm);
          }
        }
      }
    } catch (err: any) {
      errors.push('Invalid JSON in manifest: ' + err.message);
    }

    return { valid: errors.length === 0, errors };
  }

  private copyDirectorySync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private setupIPC(): void {
    ipcMain.handle('devplatform:get-extensions', () => {
      const result: any[] = [];
      for (const [, ext] of this.extensions) {
        result.push({
          manifest: ext.manifest,
          loaded: ext.loaded,
          enabled: ext.enabled,
          error: ext.error
        });
      }
      return result;
    });

    ipcMain.handle('devplatform:get-extension', (_e, id: string) => {
      const ext = this.extensions.get(id);
      if (!ext) return null;
      return { manifest: ext.manifest, loaded: ext.loaded, enabled: ext.enabled, error: ext.error };
    });

    ipcMain.handle('devplatform:install-extension', (_e, packagePath: string) => {
      return this.installExtension(packagePath);
    });

    ipcMain.handle('devplatform:uninstall-extension', (_e, id: string) => {
      return this.uninstallExtension(id);
    });

    ipcMain.handle('devplatform:enable-extension', (_e, id: string) => {
      return this.enableExtension(id);
    });

    ipcMain.handle('devplatform:disable-extension', (_e, id: string) => {
      return this.disableExtension(id);
    });

    ipcMain.handle('devplatform:validate-extension', (_e, packageDir: string) => {
      return this.validateExtensionPackage(packageDir);
    });

    ipcMain.handle('devplatform:get-themes', () => {
      const result: any[] = [];
      for (const [, theme] of this.themes) {
        result.push({ id: theme.id, name: theme.name, propertyCount: Object.keys(theme.properties).length });
      }
      return result;
    });

    ipcMain.handle('devplatform:apply-theme', (_e, themeId: string) => {
      return this.applyTheme(themeId);
    });

    ipcMain.handle('devplatform:get-api-docs', () => {
      return this.getAPIDocumentation();
    });

    ipcMain.handle('devplatform:get-api-version', () => {
      return this.getAPIVersion();
    });

    ipcMain.handle('devplatform:get-css-properties', () => {
      return this.getCSSProperties();
    });

    ipcMain.handle('devplatform:get-console-buffer', () => {
      return this.devConsoleBuffer.slice(-500);
    });

    ipcMain.handle('devplatform:clear-console', () => {
      this.devConsoleBuffer = [];
      return true;
    });

    ipcMain.handle('devplatform:pause-console', () => {
      this.devConsolePaused = true;
      return true;
    });

    ipcMain.handle('devplatform:resume-console', () => {
      this.devConsolePaused = false;
      return true;
    });

    ipcMain.handle('devplatform:enter-sandbox', () => {
      return this.enterSandboxMode();
    });

    ipcMain.handle('devplatform:exit-sandbox', () => {
      this.exitSandboxMode();
      return true;
    });

    ipcMain.handle('devplatform:is-sandbox', () => {
      return this.isSandboxMode();
    });
  }

  destroy(): void {
    if (this.sandboxMode) this.exitSandboxMode();
    this.extensions.clear();
    this.themes.clear();
    this.devConsoleBuffer = [];
    this.initialized = false;
    log.info('[DeveloperPlatformManager] Destroyed');
  }
}

export const developerPlatformManager = new DeveloperPlatformManager();
