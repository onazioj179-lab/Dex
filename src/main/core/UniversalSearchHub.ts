// ═══════════════════════════════════════════════════════════════════════════
// DEX - Universal Search Hub
// One search box finds everything: files, apps, notes, media, actions
// Instant results, permission-based, no fake indexing
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow, app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SearchCategory = 
  | 'file'
  | 'folder'
  | 'app'
  | 'note'
  | 'action'
  | 'media'
  | 'code'
  | 'recent'
  | 'command';

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  path?: string;
  icon?: string;
  score: number;
  action: SearchAction;
  metadata?: Record<string, unknown>;
}

export interface SearchAction {
  type: 'open' | 'navigate' | 'execute' | 'preview' | 'reveal';
  target: string;
  args?: unknown[];
}

export interface SearchProvider {
  name: string;
  category: SearchCategory;
  priority: number;
  search: (query: string, limit: number) => Promise<SearchResult[]>;
}

export interface SearchConfig {
  maxResults: number;
  debounceMs: number;
  minQueryLength: number;
  enabledCategories: SearchCategory[];
  recentLimit: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: SearchConfig = {
  maxResults: 50,
  debounceMs: 50,
  minQueryLength: 1,
  enabledCategories: ['file', 'folder', 'app', 'note', 'action', 'media', 'code', 'recent', 'command'],
  recentLimit: 10
};

// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

const COMMANDS: Array<{ id: string; name: string; keywords: string[]; action: SearchAction }> = [
  { id: 'cmd-new-note', name: 'New Note', keywords: ['create', 'add', 'note'], action: { type: 'execute', target: 'note:create' } },
  { id: 'cmd-new-folder', name: 'New Folder', keywords: ['create', 'add', 'folder', 'directory'], action: { type: 'execute', target: 'folder:create' } },
  { id: 'cmd-settings', name: 'Open Settings', keywords: ['preferences', 'config', 'options'], action: { type: 'navigate', target: 'settings' } },
  { id: 'cmd-actions', name: 'Go to Actions', keywords: ['automation', 'tasks'], action: { type: 'navigate', target: 'actions' } },
  { id: 'cmd-files', name: 'Go to Files', keywords: ['browse', 'explorer'], action: { type: 'navigate', target: 'files' } },
  { id: 'cmd-notes', name: 'Go to Notes', keywords: ['documents'], action: { type: 'navigate', target: 'notes' } },
  { id: 'cmd-media', name: 'Go to Media', keywords: ['audio', 'video', 'images'], action: { type: 'navigate', target: 'media' } },
  { id: 'cmd-recent', name: 'Recent Files', keywords: ['history', 'last'], action: { type: 'navigate', target: 'recent' } },
  { id: 'cmd-reload', name: 'Reload Window', keywords: ['refresh', 'restart'], action: { type: 'execute', target: 'window:reload' } },
  { id: 'cmd-devtools', name: 'Toggle DevTools', keywords: ['developer', 'debug', 'console'], action: { type: 'execute', target: 'devtools:toggle' } },
  { id: 'cmd-minimize', name: 'Minimize Window', keywords: ['hide'], action: { type: 'execute', target: 'window:minimize' } },
  { id: 'cmd-fullscreen', name: 'Toggle Fullscreen', keywords: ['maximize'], action: { type: 'execute', target: 'window:fullscreen' } },
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL SEARCH HUB
// ═══════════════════════════════════════════════════════════════════════════

class UniversalSearchHubClass extends EventEmitter {
  private providers: Map<string, SearchProvider> = new Map();
  private recentSearches: string[] = [];
  private recentResults: SearchResult[] = [];
  private config: SearchConfig;
  private searchCounter = 0;
  private lastQuery = '';
  private lastResults: SearchResult[] = [];

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.registerBuiltInProviders();
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Main search handler
    ipcMain.handle('search:query', async (_event, query: string, options?: Partial<SearchConfig>) => {
      return this.search(query, options);
    });

    // Execute search result action
    ipcMain.handle('search:execute', async (_event, result: SearchResult) => {
      return this.executeAction(result);
    });

    // Get recent searches
    ipcMain.handle('search:recent', () => {
      return this.getRecentSearches();
    });

    // Get recent results
    ipcMain.handle('search:recentResults', () => {
      return this.recentResults.slice(0, this.config.recentLimit);
    });

    // Clear search history
    ipcMain.handle('search:clearHistory', () => {
      this.recentSearches = [];
      this.recentResults = [];
      return { success: true };
    });

    // Update config
    ipcMain.handle('search:setConfig', (_event, config: Partial<SearchConfig>) => {
      this.config = { ...this.config, ...config };
      return { success: true };
    });

    // Get config
    ipcMain.handle('search:getConfig', () => {
      return { ...this.config };
    });

    // Register external provider
    ipcMain.handle('search:registerProvider', (_event, provider: SearchProvider) => {
      this.registerProvider(provider);
      return { success: true };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUILT-IN PROVIDERS
  // ─────────────────────────────────────────────────────────────────────────

  private registerBuiltInProviders(): void {
    // Commands provider (instant, no async needed)
    this.registerProvider({
      name: 'commands',
      category: 'command',
      priority: 100,
      search: async (query: string, limit: number) => {
        return this.searchCommands(query, limit);
      }
    });

    // Recent items provider
    this.registerProvider({
      name: 'recent',
      category: 'recent',
      priority: 90,
      search: async (query: string, limit: number) => {
        return this.searchRecent(query, limit);
      }
    });

    log.info('[UniversalSearch] Built-in providers registered');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROVIDER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
    log.debug(`[UniversalSearch] Provider registered: ${provider.name}`);
  }

  unregisterProvider(name: string): boolean {
    return this.providers.delete(name);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN SEARCH
  // ─────────────────────────────────────────────────────────────────────────

  async search(query: string, options?: Partial<SearchConfig>): Promise<SearchResult[]> {
    const searchId = ++this.searchCounter;
    const config = { ...this.config, ...options };
    const normalizedQuery = query.trim().toLowerCase();

    // Quick return for empty query
    if (normalizedQuery.length < config.minQueryLength) {
      return this.getQuickAccess();
    }

    // Check cache for same query
    if (normalizedQuery === this.lastQuery && this.lastResults.length > 0) {
      return this.lastResults;
    }

    const startTime = Date.now();
    const results: SearchResult[] = [];
    const enabledCategories = new Set(config.enabledCategories);

    // Get providers sorted by priority
    const sortedProviders = Array.from(this.providers.values())
      .filter(p => enabledCategories.has(p.category))
      .sort((a, b) => b.priority - a.priority);

    // Search all providers in parallel
    const providerResults = await Promise.all(
      sortedProviders.map(async (provider) => {
        try {
          const providerLimit = Math.ceil(config.maxResults / sortedProviders.length);
          return await provider.search(normalizedQuery, providerLimit);
        } catch (error) {
          log.warn(`[UniversalSearch] Provider ${provider.name} failed:`, error);
          return [];
        }
      })
    );

    // Merge results
    for (const providerResult of providerResults) {
      results.push(...providerResult);
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Limit results
    const finalResults = results.slice(0, config.maxResults);

    // Cache results
    this.lastQuery = normalizedQuery;
    this.lastResults = finalResults;

    // Track search
    this.trackSearch(query);

    const duration = Date.now() - startTime;
    log.debug(`[UniversalSearch] Search #${searchId} "${query}" returned ${finalResults.length} results in ${duration}ms`);

    return finalResults;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUILT-IN SEARCHES
  // ─────────────────────────────────────────────────────────────────────────

  private searchCommands(query: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    for (const cmd of COMMANDS) {
      const nameMatch = cmd.name.toLowerCase().includes(q);
      const keywordMatch = cmd.keywords.some(k => k.includes(q));
      
      if (nameMatch || keywordMatch) {
        const score = nameMatch ? 100 : 80;
        results.push({
          id: cmd.id,
          category: 'command',
          title: cmd.name,
          subtitle: 'Command',
          icon: 'terminal',
          score: score - results.length, // Maintain order
          action: cmd.action
        });
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  private searchRecent(query: string, limit: number): SearchResult[] {
    const q = query.toLowerCase();
    
    return this.recentResults
      .filter(r => r.title.toLowerCase().includes(q) || r.subtitle?.toLowerCase().includes(q))
      .slice(0, limit)
      .map((r, i) => ({ ...r, score: 70 - i }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUICK ACCESS (Empty Query)
  // ─────────────────────────────────────────────────────────────────────────

  private getQuickAccess(): SearchResult[] {
    const results: SearchResult[] = [];

    // Recent results
    results.push(...this.recentResults.slice(0, 5).map((r, i) => ({
      ...r,
      score: 100 - i,
      subtitle: `Recent • ${r.subtitle || ''}`
    })));

    // Quick commands
    const quickCommands = COMMANDS.slice(0, 5);
    for (const cmd of quickCommands) {
      results.push({
        id: cmd.id,
        category: 'command',
        title: cmd.name,
        subtitle: 'Quick Action',
        icon: 'zap',
        score: 50 - results.length,
        action: cmd.action
      });
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION EXECUTION
  // ─────────────────────────────────────────────────────────────────────────

  async executeAction(result: SearchResult): Promise<{ success: boolean; error?: string }> {
    try {
      // Track as recent result
      this.trackResult(result);

      const { action } = result;

      switch (action.type) {
        case 'open':
          await this.openPath(action.target);
          break;

        case 'navigate':
          this.broadcastNavigation(action.target);
          break;

        case 'execute':
          await this.executeCommand(action.target, action.args);
          break;

        case 'preview':
          this.broadcastPreview(action.target);
          break;

        case 'reveal':
          await shell.showItemInFolder(action.target);
          break;
      }

      this.emit('action:executed', result);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Action failed';
      log.error(`[UniversalSearch] Action failed:`, error);
      return { success: false, error: errorMessage };
    }
  }

  private async openPath(targetPath: string): Promise<void> {
    await shell.openPath(targetPath);
  }

  private async executeCommand(command: string, args?: unknown[]): Promise<void> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    switch (command) {
      case 'window:reload':
        window.reload();
        break;
      case 'window:minimize':
        window.minimize();
        break;
      case 'window:fullscreen':
        window.setFullScreen(!window.isFullScreen());
        break;
      case 'devtools:toggle':
        if (window.webContents.isDevToolsOpened()) {
          window.webContents.closeDevTools();
        } else {
          window.webContents.openDevTools();
        }
        break;
      default:
        // Send to renderer for handling
        window.webContents.send('search:command', command, args);
    }
  }

  private broadcastNavigation(target: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('search:navigate', target);
      }
    }
  }

  private broadcastPreview(target: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('search:preview', target);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  private trackSearch(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Remove if already exists
    const idx = this.recentSearches.indexOf(trimmed);
    if (idx > -1) {
      this.recentSearches.splice(idx, 1);
    }

    // Add to front
    this.recentSearches.unshift(trimmed);

    // Limit size
    if (this.recentSearches.length > 20) {
      this.recentSearches.pop();
    }
  }

  private trackResult(result: SearchResult): void {
    // Remove if already exists
    const idx = this.recentResults.findIndex(r => r.id === result.id);
    if (idx > -1) {
      this.recentResults.splice(idx, 1);
    }

    // Add to front
    this.recentResults.unshift(result);

    // Limit size
    if (this.recentResults.length > 50) {
      this.recentResults.pop();
    }
  }

  getRecentSearches(): string[] {
    return [...this.recentSearches];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCORING UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  static calculateScore(query: string, text: string, boost: number = 0): number {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    
    let score = 0;

    // Exact match
    if (t === q) {
      score = 100;
    }
    // Starts with query
    else if (t.startsWith(q)) {
      score = 90;
    }
    // Contains query
    else if (t.includes(q)) {
      score = 70;
    }
    // Fuzzy match
    else {
      const fuzzyScore = this.fuzzyMatch(q, t);
      score = fuzzyScore * 50;
    }

    return Math.min(100, score + boost);
  }

  private static fuzzyMatch(query: string, text: string): number {
    let qi = 0;
    let ti = 0;
    let matches = 0;

    while (qi < query.length && ti < text.length) {
      if (query[qi] === text[ti]) {
        matches++;
        qi++;
      }
      ti++;
    }

    return qi === query.length ? matches / text.length : 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const UniversalSearchHub = new UniversalSearchHubClass();
export default UniversalSearchHub;
