// ═══════════════════════════════════════════════════════════════════════════
// DEX - App Launcher & Switcher
// OS-Level app discovery, launching, and switching
// Recent apps, favorites, keyboard-driven, zero-latency
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { app, ipcMain, shell, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AppCategory = 
  | 'productivity'
  | 'development'
  | 'media'
  | 'communication'
  | 'utilities'
  | 'system'
  | 'games'
  | 'other';

export interface InstalledApp {
  id: string;
  name: string;
  displayName: string;
  path: string;
  icon?: string;
  iconPath?: string;
  category: AppCategory;
  description?: string;
  version?: string;
  lastUsed?: number;
  useCount: number;
  favorite: boolean;
  hidden: boolean;
}

export interface RunningApp {
  pid: number;
  name: string;
  title?: string;
  memory?: number;
  cpu?: number;
  startTime?: number;
}

export interface AppLaunchResult {
  success: boolean;
  pid?: number;
  error?: string;
}

export interface AppSearchResult {
  app: InstalledApp;
  score: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

export interface LauncherConfig {
  scanOnStartup: boolean;
  showHiddenApps: boolean;
  maxRecentApps: number;
  maxSearchResults: number;
  customPaths: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// APP LAUNCHER & SWITCHER
// ═══════════════════════════════════════════════════════════════════════════

class AppLauncherSwitcherClass extends EventEmitter {
  private apps: Map<string, InstalledApp> = new Map();
  private runningApps: Map<number, RunningApp> = new Map();
  private config: LauncherConfig;
  private dataPath = '';
  private isScanning = false;
  private lastScanTime = 0;
  private mainWindow: BrowserWindow | null = null;

  // Platform-specific app paths
  private readonly WINDOWS_PATHS = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];

  private readonly MAC_PATHS = [
    '/Applications',
    '/System/Applications',
    path.join(app.getPath('home'), 'Applications'),
  ];

  private readonly LINUX_PATHS = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    path.join(app.getPath('home'), '.local/share/applications'),
  ];

  // App category detection
  private readonly CATEGORY_KEYWORDS: Record<AppCategory, string[]> = {
    productivity: ['office', 'word', 'excel', 'sheets', 'docs', 'notion', 'obsidian', 'todoist', 'calendar'],
    development: ['code', 'studio', 'ide', 'terminal', 'git', 'docker', 'node', 'python', 'java'],
    media: ['spotify', 'music', 'video', 'vlc', 'player', 'photo', 'image', 'netflix', 'youtube'],
    communication: ['slack', 'discord', 'teams', 'zoom', 'mail', 'outlook', 'telegram', 'whatsapp'],
    utilities: ['calculator', 'notepad', 'settings', 'control', 'finder', 'explorer', 'file'],
    system: ['task manager', 'activity monitor', 'system', 'preferences', 'security'],
    games: ['game', 'steam', 'epic', 'battle.net', 'riot'],
    other: [],
  };

  constructor() {
    super();
    this.config = {
      scanOnStartup: true,
      showHiddenApps: false,
      maxRecentApps: 20,
      maxSearchResults: 50,
      customPaths: [],
    };
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'launcher');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadApps();
      await this.loadConfig();
      
      if (this.config.scanOnStartup || this.apps.size === 0) {
        await this.scanApps();
      }
      
      log.info(`[AppLauncher] Initialized with ${this.apps.size} apps`);
    } catch (error) {
      log.error('[AppLauncher] Initialization failed:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Get all apps
    ipcMain.handle('launcher:apps', () => this.getAllApps());
    
    // Search apps
    ipcMain.handle('launcher:search', (_event, query: string) => this.searchApps(query));
    
    // Get recent apps
    ipcMain.handle('launcher:recent', () => this.getRecentApps());
    
    // Get favorite apps
    ipcMain.handle('launcher:favorites', () => this.getFavoriteApps());
    
    // Get apps by category
    ipcMain.handle('launcher:byCategory', (_event, category: AppCategory) => {
      return this.getAppsByCategory(category);
    });

    // Launch app
    ipcMain.handle('launcher:launch', async (_event, appId: string, args?: string[]) => {
      return this.launchApp(appId, args);
    });

    // Launch by path
    ipcMain.handle('launcher:launchPath', async (_event, appPath: string, args?: string[]) => {
      return this.launchByPath(appPath, args);
    });

    // Toggle favorite
    ipcMain.handle('launcher:favorite', (_event, appId: string, favorite: boolean) => {
      return this.setFavorite(appId, favorite);
    });

    // Toggle hidden
    ipcMain.handle('launcher:hide', (_event, appId: string, hidden: boolean) => {
      return this.setHidden(appId, hidden);
    });

    // Rescan apps
    ipcMain.handle('launcher:scan', async () => this.scanApps());

    // Get running apps
    ipcMain.handle('launcher:running', async () => this.getRunningApps());

    // Switch to running app
    ipcMain.handle('launcher:switchTo', async (_event, pid: number) => {
      return this.switchToApp(pid);
    });

    // Close running app
    ipcMain.handle('launcher:close', async (_event, pid: number, force?: boolean) => {
      return this.closeApp(pid, force);
    });

    // Config
    ipcMain.handle('launcher:config', () => this.config);
    ipcMain.handle('launcher:setConfig', async (_event, config: Partial<LauncherConfig>) => {
      return this.setConfig(config);
    });

    // Quick launch (by name or partial match)
    ipcMain.handle('launcher:quick', async (_event, query: string) => {
      return this.quickLaunch(query);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APP DISCOVERY
  // ─────────────────────────────────────────────────────────────────────────

  async scanApps(): Promise<{ found: number; duration: number }> {
    if (this.isScanning) {
      return { found: this.apps.size, duration: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    const existingApps = new Map(this.apps);

    try {
      const platform = process.platform;
      
      if (platform === 'win32') {
        await this.scanWindowsApps();
      } else if (platform === 'darwin') {
        await this.scanMacApps();
      } else {
        await this.scanLinuxApps();
      }

      // Preserve user data for existing apps
      for (const [id, app] of this.apps) {
        const existing = existingApps.get(id);
        if (existing) {
          app.lastUsed = existing.lastUsed;
          app.useCount = existing.useCount;
          app.favorite = existing.favorite;
          app.hidden = existing.hidden;
        }
      }

      this.lastScanTime = Date.now();
      await this.saveApps();
      
      const duration = Date.now() - startTime;
      this.emit('scan:complete', { found: this.apps.size, duration });
      
      return { found: this.apps.size, duration };
    } finally {
      this.isScanning = false;
    }
  }

  private async scanWindowsApps(): Promise<void> {
    const allPaths = [...this.WINDOWS_PATHS, ...this.config.customPaths];

    for (const basePath of allPaths) {
      if (!fsSync.existsSync(basePath)) continue;

      try {
        await this.scanDirectory(basePath, '.exe');
        await this.scanDirectory(basePath, '.lnk');
      } catch {
        // Continue with other paths
      }
    }

    // Also scan Start Menu shortcuts
    const startMenuPaths = [
      path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    ];

    for (const menuPath of startMenuPaths) {
      if (fsSync.existsSync(menuPath)) {
        await this.scanShortcuts(menuPath);
      }
    }
  }

  private async scanMacApps(): Promise<void> {
    const allPaths = [...this.MAC_PATHS, ...this.config.customPaths];

    for (const basePath of allPaths) {
      if (!fsSync.existsSync(basePath)) continue;

      try {
        const entries = await fs.readdir(basePath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.endsWith('.app')) {
            const appPath = path.join(basePath, entry.name);
            const appName = entry.name.replace('.app', '');
            
            this.addApp({
              id: this.generateAppId(appName),
              name: appName,
              displayName: appName,
              path: appPath,
              category: this.detectCategory(appName),
              useCount: 0,
              favorite: false,
              hidden: false,
            });
          }
        }
      } catch {
        // Continue with other paths
      }
    }
  }

  private async scanLinuxApps(): Promise<void> {
    const allPaths = [...this.LINUX_PATHS, ...this.config.customPaths];

    for (const basePath of allPaths) {
      if (!fsSync.existsSync(basePath)) continue;

      try {
        const entries = await fs.readdir(basePath);
        
        for (const entry of entries) {
          if (entry.endsWith('.desktop')) {
            const desktopPath = path.join(basePath, entry);
            await this.parseDesktopFile(desktopPath);
          }
        }
      } catch {
        // Continue with other paths
      }
    }
  }

  private async scanDirectory(basePath: string, ext: string): Promise<void> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          // Recurse into subdirectories (limited depth)
          const depth = basePath.split(path.sep).length;
          if (depth < 10) {
            await this.scanDirectory(fullPath, ext);
          }
        } else if (entry.name.toLowerCase().endsWith(ext)) {
          const appName = entry.name.replace(new RegExp(`\\${ext}$`, 'i'), '');
          
          // Skip common non-app executables
          if (this.isSystemExecutable(appName)) continue;
          
          this.addApp({
            id: this.generateAppId(appName),
            name: appName,
            displayName: this.formatDisplayName(appName),
            path: fullPath,
            category: this.detectCategory(appName),
            useCount: 0,
            favorite: false,
            hidden: false,
          });
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  private async scanShortcuts(basePath: string): Promise<void> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          await this.scanShortcuts(fullPath);
        } else if (entry.name.endsWith('.lnk')) {
          const appName = entry.name.replace('.lnk', '');
          
          this.addApp({
            id: this.generateAppId(appName),
            name: appName,
            displayName: appName,
            path: fullPath,
            category: this.detectCategory(appName),
            useCount: 0,
            favorite: false,
            hidden: false,
          });
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  private async parseDesktopFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      let name = '';
      let exec = '';
      let icon = '';
      let noDisplay = false;

      for (const line of lines) {
        if (line.startsWith('Name=')) {
          name = line.substring(5).trim();
        } else if (line.startsWith('Exec=')) {
          exec = line.substring(5).trim().split(' ')[0];
        } else if (line.startsWith('Icon=')) {
          icon = line.substring(5).trim();
        } else if (line.startsWith('NoDisplay=true')) {
          noDisplay = true;
        }
      }

      if (name && exec && !noDisplay) {
        this.addApp({
          id: this.generateAppId(name),
          name: exec,
          displayName: name,
          path: exec,
          iconPath: icon,
          category: this.detectCategory(name),
          useCount: 0,
          favorite: false,
          hidden: false,
        });
      }
    } catch {
      // Skip unparseable desktop files
    }
  }

  private addApp(app: InstalledApp): void {
    // Don't overwrite existing apps (preserves user data)
    if (!this.apps.has(app.id)) {
      this.apps.set(app.id, app);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APP LISTING & SEARCH
  // ─────────────────────────────────────────────────────────────────────────

  getAllApps(): InstalledApp[] {
    return Array.from(this.apps.values())
      .filter(app => !app.hidden || this.config.showHiddenApps)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getRecentApps(): InstalledApp[] {
    return Array.from(this.apps.values())
      .filter(app => app.lastUsed && (!app.hidden || this.config.showHiddenApps))
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, this.config.maxRecentApps);
  }

  getFavoriteApps(): InstalledApp[] {
    return Array.from(this.apps.values())
      .filter(app => app.favorite && (!app.hidden || this.config.showHiddenApps))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getAppsByCategory(category: AppCategory): InstalledApp[] {
    return Array.from(this.apps.values())
      .filter(app => app.category === category && (!app.hidden || this.config.showHiddenApps))
      .sort((a, b) => b.useCount - a.useCount);
  }

  searchApps(query: string): AppSearchResult[] {
    if (!query.trim()) {
      return this.getRecentApps().map(app => ({
        app,
        score: 100,
        matchType: 'exact' as const,
      }));
    }

    const queryLower = query.toLowerCase();
    const results: AppSearchResult[] = [];

    for (const app of this.apps.values()) {
      if (app.hidden && !this.config.showHiddenApps) continue;

      const nameLower = app.displayName.toLowerCase();
      let score = 0;
      let matchType: AppSearchResult['matchType'] = 'fuzzy';

      // Exact match
      if (nameLower === queryLower) {
        score = 100;
        matchType = 'exact';
      }
      // Prefix match
      else if (nameLower.startsWith(queryLower)) {
        score = 80 + (queryLower.length / nameLower.length) * 20;
        matchType = 'prefix';
      }
      // Contains match
      else if (nameLower.includes(queryLower)) {
        score = 50 + (queryLower.length / nameLower.length) * 30;
        matchType = 'contains';
      }
      // Fuzzy match (initials)
      else {
        const initials = app.displayName
          .split(/[\s\-_]+/)
          .map(w => w[0]?.toLowerCase())
          .join('');
        
        if (initials.startsWith(queryLower)) {
          score = 40;
          matchType = 'fuzzy';
        }
      }

      if (score > 0) {
        // Boost score based on usage
        score += Math.min(app.useCount * 2, 20);
        // Boost favorites
        if (app.favorite) score += 15;
        // Boost recent
        if (app.lastUsed && Date.now() - app.lastUsed < 24 * 60 * 60 * 1000) {
          score += 10;
        }

        results.push({ app, score, matchType });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSearchResults);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APP LAUNCHING
  // ─────────────────────────────────────────────────────────────────────────

  async launchApp(appId: string, args?: string[]): Promise<AppLaunchResult> {
    const app = this.apps.get(appId);
    if (!app) {
      return { success: false, error: 'App not found' };
    }

    return this.launchByPath(app.path, args, app);
  }

  async launchByPath(appPath: string, args?: string[], trackedApp?: InstalledApp): Promise<AppLaunchResult> {
    const platform = process.platform;

    try {
      let pid: number | undefined;

      if (platform === 'win32') {
        if (appPath.endsWith('.lnk') || appPath.endsWith('.url')) {
          // Launch shortcut
          await shell.openPath(appPath);
        } else {
          // Launch executable
          const child = spawn(appPath, args || [], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          pid = child.pid;
        }
      } else if (platform === 'darwin') {
        if (appPath.endsWith('.app')) {
          const argStr = args?.length ? `--args ${args.join(' ')}` : '';
          await execAsync(`open "${appPath}" ${argStr}`);
        } else {
          const child = spawn(appPath, args || [], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          pid = child.pid;
        }
      } else {
        // Linux
        const child = spawn(appPath, args || [], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        pid = child.pid;
      }

      // Update usage stats
      if (trackedApp) {
        trackedApp.lastUsed = Date.now();
        trackedApp.useCount++;
        await this.saveApps();
      }

      this.emit('app:launched', { path: appPath, pid });
      return { success: true, pid };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[AppLauncher] Failed to launch ${appPath}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async quickLaunch(query: string): Promise<AppLaunchResult> {
    const results = this.searchApps(query);
    if (results.length > 0) {
      return this.launchApp(results[0].app.id);
    }
    return { success: false, error: 'No matching app found' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RUNNING APPS
  // ─────────────────────────────────────────────────────────────────────────

  async getRunningApps(): Promise<RunningApp[]> {
    const platform = process.platform;
    const apps: RunningApp[] = [];

    try {
      if (platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FO CSV /NH');
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          const parts = line.split('","');
          if (parts.length >= 5) {
            const name = parts[0].replace(/"/g, '');
            const pid = parseInt(parts[1]);
            const memory = parseInt(parts[4].replace(/[^\d]/g, '')) * 1024;
            
            if (!isNaN(pid)) {
              apps.push({ pid, name, memory });
            }
          }
        }
      } else if (platform === 'darwin') {
        const { stdout } = await execAsync('ps -eo pid,comm,rss');
        const lines = stdout.trim().split('\n').slice(1);
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const pid = parseInt(parts[0]);
            const name = parts[1];
            const memory = parseInt(parts[2]) * 1024;
            
            if (!isNaN(pid)) {
              apps.push({ pid, name, memory });
            }
          }
        }
      } else {
        const { stdout } = await execAsync('ps -eo pid,comm,rss --no-headers');
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const pid = parseInt(parts[0]);
            const name = parts[1];
            const memory = parseInt(parts[2]) * 1024;
            
            if (!isNaN(pid)) {
              apps.push({ pid, name, memory });
            }
          }
        }
      }
    } catch (error) {
      log.error('[AppLauncher] Failed to get running apps:', error);
    }

    // Filter to user-facing apps only
    return apps.filter(app => !this.isSystemProcess(app.name));
  }

  async switchToApp(pid: number): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        // Use PowerShell to bring window to front
        await execAsync(`powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate(${pid})"`);
      } else if (platform === 'darwin') {
        // Get app name from pid and activate
        const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
        const appName = stdout.trim();
        await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
      } else {
        // Linux - use wmctrl if available
        await execAsync(`wmctrl -ia $(wmctrl -lp | grep ${pid} | cut -d' ' -f1)`);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async closeApp(pid: number, force = false): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        const forceFlag = force ? '/F' : '';
        await execAsync(`taskkill /PID ${pid} ${forceFlag}`);
      } else {
        const signal = force ? 'SIGKILL' : 'SIGTERM';
        process.kill(pid, signal);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APP MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  setFavorite(appId: string, favorite: boolean): { success: boolean } {
    const app = this.apps.get(appId);
    if (app) {
      app.favorite = favorite;
      this.saveApps();
      this.emit('app:updated', app);
      return { success: true };
    }
    return { success: false };
  }

  setHidden(appId: string, hidden: boolean): { success: boolean } {
    const app = this.apps.get(appId);
    if (app) {
      app.hidden = hidden;
      this.saveApps();
      this.emit('app:updated', app);
      return { success: true };
    }
    return { success: false };
  }

  async setConfig(config: Partial<LauncherConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  private generateAppId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private formatDisplayName(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private detectCategory(name: string): AppCategory {
    const nameLower = name.toLowerCase();
    
    for (const [category, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => nameLower.includes(kw))) {
        return category as AppCategory;
      }
    }
    
    return 'other';
  }

  private isSystemExecutable(name: string): boolean {
    const systemNames = [
      'uninstall', 'setup', 'install', 'update', 'updater',
      'helper', 'crash', 'reporter', 'service', 'daemon',
    ];
    const nameLower = name.toLowerCase();
    return systemNames.some(sys => nameLower.includes(sys));
  }

  private isSystemProcess(name: string): boolean {
    const systemProcesses = [
      'system', 'svchost', 'csrss', 'wininit', 'services',
      'smss', 'lsass', 'winlogon', 'dwm', 'conhost',
      'kernel_task', 'launchd', 'WindowServer',
      'systemd', 'init', 'kworker',
    ];
    return systemProcesses.includes(name.toLowerCase());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  private async loadApps(): Promise<void> {
    try {
      const appsFile = path.join(this.dataPath, 'apps.json');
      const data = await fs.readFile(appsFile, 'utf-8');
      const apps = JSON.parse(data) as InstalledApp[];
      
      for (const app of apps) {
        this.apps.set(app.id, app);
      }
    } catch {
      // No saved apps
    }
  }

  private async saveApps(): Promise<void> {
    try {
      const appsFile = path.join(this.dataPath, 'apps.json');
      const apps = Array.from(this.apps.values());
      await fs.writeFile(appsFile, JSON.stringify(apps, null, 2));
    } catch (error) {
      log.error('[AppLauncher] Failed to save apps:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configFile = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configFile = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[AppLauncher] Failed to save config:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHUTDOWN
  // ─────────────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.saveApps();
    await this.saveConfig();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const AppLauncherSwitcher = new AppLauncherSwitcherClass();
export default AppLauncherSwitcher;
