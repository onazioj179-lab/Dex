// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Search Controller
// Phase 7 + FINAL UI FUNCTIONALITY PHASE: Universal Search
// Instant, Fuzzy, Command-Style + Scoped Computer Search
// ===========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';
import { getFileSearchIndexer } from '../core/FileSearchIndexer';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  type: 'action' | 'operation' | 'workflow' | 'note' | 'voice' | 'timer' | 'task' | 'media' | 'idea' | 'setting' | 'session' | 'file' | 'folder' | 'page';
  title: string;
  subtitle?: string;
  description?: string;
  icon: string;
  score: number;
  scope: 'dex' | 'computer';
  path?: string;
  metadata?: Record<string, any>;
  action?: {
    type: 'execute' | 'navigate' | 'open' | 'create';
    target: string;
    data?: Record<string, any>;
  };
}

export interface SearchIndex {
  id: string;
  type: SearchResult['type'];
  title: string;
  titleLower: string;
  keywords: string[];
  content?: string;
  contentLower?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  types?: SearchResult['type'][];
  limit?: number;
  fuzzyThreshold?: number;
  includeContent?: boolean;
  scopes?: {
    dex?: boolean;
    computer?: boolean;
  };
}

export interface CommandDefinition {
  keywords: string[];
  type: SearchResult['type'];
  action: string;
  description: string;
  parser?: (query: string) => Record<string, any> | null;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const COMMANDS: CommandDefinition[] = [
  {
    keywords: ['start', 'run', 'execute', 'do'],
    type: 'operation',
    action: 'execute',
    description: 'Run an operation or workflow',
  },
  {
    keywords: ['note', 'notes', 'write', 'jot'],
    type: 'note',
    action: 'navigate',
    description: 'Go to notes or create a note',
  },
  {
    keywords: ['timer', 'time', 'countdown'],
    type: 'timer',
    action: 'create',
    description: 'Create a timer',
    parser: (query: string) => {
      const match = query.match(/(\d+)/);
      if (match) {
        return { duration: parseInt(match[1], 10) * 60 };
      }
      return null;
    },
  },
  {
    keywords: ['voice', 'record', 'audio'],
    type: 'voice',
    action: 'navigate',
    description: 'Go to voice notes',
  },
  {
    keywords: ['media', 'files', 'images', 'storage'],
    type: 'media',
    action: 'navigate',
    description: 'Open media storage',
  },
  {
    keywords: ['idea', 'ideas', 'draft', 'create'],
    type: 'idea',
    action: 'navigate',
    description: 'Open ideas workspace',
  },
  {
    keywords: ['task', 'tasks', 'running', 'apps'],
    type: 'task',
    action: 'navigate',
    description: 'View running tasks',
  },
  {
    keywords: ['setting', 'settings', 'config', 'preferences'],
    type: 'setting',
    action: 'navigate',
    description: 'Open settings',
  },
  {
    keywords: ['boost', 'performance', 'fast'],
    type: 'operation',
    action: 'execute',
    description: 'Boost performance',
  },
  {
    keywords: ['clean', 'cleanup', 'clear', 'free'],
    type: 'operation',
    action: 'execute',
    description: 'Clean up system',
  },
  {
    keywords: ['power', 'battery', 'energy'],
    type: 'operation',
    action: 'navigate',
    description: 'Power settings',
  },
];

const DEFAULT_OPTIONS: SearchOptions = {
  limit: 10,
  fuzzyThreshold: 0.3,
  includeContent: true,
};

// ===========================================================================
// Search Controller
// ===========================================================================

export class SearchController {
  private dataStore: DataStore;
  private logger: Logger;
  private index: SearchIndex[] = [];
  private indexDirty: boolean = true;
  private lastIndexTime: number = 0;
  private indexDebounceMs: number = 5000;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      await this.rebuildIndex();
      this.logger.info('Search Controller initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Search Controller');
    }
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const scopes = opts.scopes || { dex: true, computer: false };
    
    if (!query || query.trim().length === 0) {
      // Return suggested items for empty query
      return this.getSuggestedItems(opts.limit || 10);
    }

    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);

    // Check for command-style queries
    const commandResults = this.matchCommands(queryLower, queryWords);

    // Ensure index is fresh
    if (this.indexDirty || Date.now() - this.lastIndexTime > this.indexDebounceMs) {
      await this.rebuildIndex();
    }

    // Search Dex internal data
    const dexResults: SearchResult[] = [];
    
    if (scopes.dex !== false) {
      for (const item of this.index) {
        // Filter by type if specified
        if (opts.types && !opts.types.includes(item.type)) continue;

        const score = this.calculateScore(item, queryLower, queryWords, opts);
        
        if (score > 0) {
          dexResults.push(this.indexToResult(item, score));
        }
      }
    }

    // Search computer files (if enabled)
    const fileResults: SearchResult[] = [];
    
    if (scopes.computer === true) {
      const fileIndexer = getFileSearchIndexer();
      if (fileIndexer) {
        const fileSearchResults = fileIndexer.search(query, { limit: opts.limit || 10 });
        for (const result of fileSearchResults) {
          fileResults.push({
            id: result.id,
            type: result.type,
            title: result.title,
            subtitle: result.subtitle,
            icon: result.type === 'folder' ? 'folder' : 'file',
            score: result.score,
            scope: 'computer',
            path: result.path,
            action: result.action,
          });
        }
      }
    }

    // Combine all results
    const combined = [...commandResults, ...dexResults, ...fileResults];

    // Sort by score and deduplicate
    const seen = new Set<string>();
    const unique = combined
      .sort((a, b) => b.score - a.score)
      .filter(r => {
        const key = `${r.type}:${r.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, opts.limit);

    return unique;
  }

  private matchCommands(queryLower: string, queryWords: string[]): SearchResult[] {
    const results: SearchResult[] = [];
    const firstWord = queryWords[0];
    const restQuery = queryWords.slice(1).join(' ');

    for (const cmd of COMMANDS) {
      // Check if query starts with a command keyword
      const matchedKeyword = cmd.keywords.find(k => 
        firstWord === k || queryLower.startsWith(k + ' ')
      );

      if (matchedKeyword) {
        let actionData: Record<string, any> = {};
        
        // Try to parse additional data from query
        if (cmd.parser && restQuery) {
          const parsed = cmd.parser(restQuery);
          if (parsed) {
            actionData = parsed;
          }
        }

        results.push({
          id: `cmd-${cmd.type}-${cmd.action}`,
          type: cmd.type,
          title: cmd.description,
          subtitle: restQuery ? `"${restQuery}"` : undefined,
          icon: this.getIconForType(cmd.type),
          score: 1.0,
          scope: 'dex',
          action: {
            type: cmd.action as any,
            target: cmd.type,
            data: { query: restQuery, ...actionData },
          },
        });
      }
    }

    return results;
  }

  private calculateScore(
    item: SearchIndex,
    queryLower: string,
    queryWords: string[],
    options: SearchOptions
  ): number {
    let score = 0;

    // Exact title match
    if (item.titleLower === queryLower) {
      score += 1.0;
    }
    // Title starts with query
    else if (item.titleLower.startsWith(queryLower)) {
      score += 0.9;
    }
    // Title contains query
    else if (item.titleLower.includes(queryLower)) {
      score += 0.7;
    }

    // Check each word
    for (const word of queryWords) {
      if (item.titleLower.includes(word)) {
        score += 0.3;
      }
      
      // Check keywords
      if (item.keywords.some(k => k.includes(word))) {
        score += 0.2;
      }

      // Check content
      if (options.includeContent && item.contentLower?.includes(word)) {
        score += 0.15;
      }
    }

    // Fuzzy matching for title
    if (score === 0 && options.fuzzyThreshold) {
      const fuzzyScore = this.fuzzyMatch(item.titleLower, queryLower);
      if (fuzzyScore > (1 - options.fuzzyThreshold)) {
        score = fuzzyScore * 0.5;
      }
    }

    // Boost recent items slightly
    const ageHours = (Date.now() - item.timestamp) / (1000 * 60 * 60);
    if (ageHours < 24) {
      score *= 1.1;
    }

    return Math.min(score, 1);
  }

  private fuzzyMatch(str1: string, str2: string): number {
    // Simple Levenshtein-based similarity
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Quick check for containment
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    // Character overlap ratio
    const chars1 = new Set(str1);
    const chars2 = new Set(str2);
    let overlap = 0;
    for (const c of chars1) {
      if (chars2.has(c)) overlap++;
    }

    return overlap / Math.max(chars1.size, chars2.size);
  }

  private indexToResult(item: SearchIndex, score: number): SearchResult {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: item.metadata?.subtitle,
      description: item.content?.slice(0, 100),
      icon: this.getIconForType(item.type),
      score,
      scope: 'dex',
      metadata: item.metadata,
      action: {
        type: item.type === 'setting' ? 'navigate' : 'open',
        target: item.type,
        data: { id: item.id },
      },
    };
  }

  private getIconForType(type: SearchResult['type']): string {
    const iconMap: Record<string, string> = {
      action: 'actions',
      operation: 'operations',
      workflow: 'workflows',
      note: 'notes',
      voice: 'mic',
      timer: 'timer',
      task: 'tasks',
      media: 'media',
      idea: 'ideas',
      setting: 'settings',
      session: 'session',
      file: 'file',
      folder: 'folder',
      page: 'page',
    };
    return iconMap[type] || 'search';
  }

  private async getRecentItems(limit: number): Promise<SearchResult[]> {
    // Return most recently used items
    return this.index
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(item => this.indexToResult(item, 0.5));
  }

  private getSuggestedItems(limit: number): SearchResult[] {
    // Return a mix of useful pages and recent items
    const suggestions: SearchResult[] = [];
    
    // Add key navigation pages
    const keyPages = ['dashboard', 'notes', 'workflows', 'settings', 'tasks', 'timers'];
    const pageItems = this.index.filter(item => 
      item.type === 'page' && keyPages.some(p => item.id.includes(p))
    );
    
    for (const item of pageItems.slice(0, 4)) {
      suggestions.push(this.indexToResult(item, 0.8));
    }
    
    // Add recent items
    const recentItems = this.index
      .filter(item => item.type !== 'page')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit - suggestions.length);
    
    for (const item of recentItems) {
      suggestions.push(this.indexToResult(item, 0.5));
    }
    
    return suggestions.slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  async rebuildIndex(): Promise<void> {
    try {
      const newIndex: SearchIndex[] = [];

      // Index operations
      await this.indexOperations(newIndex);

      // Index workflows
      await this.indexWorkflows(newIndex);

      // Index notes
      await this.indexNotes(newIndex);

      // Index timers
      await this.indexTimers(newIndex);

      // Index voice notes
      await this.indexVoiceNotes(newIndex);

      // Index media
      await this.indexMedia(newIndex);

      // Index ideas
      await this.indexIdeas(newIndex);

      // Index actions
      await this.indexActions(newIndex);

      // Add static items (settings, navigation)
      this.indexStaticItems(newIndex);

      this.index = newIndex;
      this.indexDirty = false;
      this.lastIndexTime = Date.now();

      this.logger.info(`Search index rebuilt: ${newIndex.length} items`);
    } catch (error) {
      this.logger.error('Failed to rebuild search index');
    }
  }

  private async indexOperations(index: SearchIndex[]): Promise<void> {
    // Add built-in operations
    const operations = [
      { id: 'cleanup', name: 'Clean Workspace', desc: 'Close unused apps and free memory' },
      { id: 'boost', name: 'Quick Boost', desc: 'Temporarily boost performance' },
      { id: 'balance', name: 'Balance System', desc: 'Optimize for balanced performance' },
      { id: 'eco', name: 'Eco Mode', desc: 'Save battery and reduce resource usage' },
      { id: 'reset-profile', name: 'Reset Profile', desc: 'Return to default power settings' },
      { id: 'free-memory', name: 'Free Memory', desc: 'Release unused memory' },
      { id: 'close-background', name: 'Close Background Apps', desc: 'Close resource-heavy background apps' },
    ];

    for (const op of operations) {
      index.push({
        id: op.id,
        type: 'operation',
        title: op.name,
        titleLower: op.name.toLowerCase(),
        keywords: op.name.toLowerCase().split(' ').concat(op.desc.toLowerCase().split(' ')),
        content: op.desc,
        contentLower: op.desc.toLowerCase(),
        timestamp: Date.now(),
        metadata: { subtitle: op.desc },
      });
    }
  }

  private async indexWorkflows(index: SearchIndex[]): Promise<void> {
    try {
      const workflows = await this.dataStore.get<any[]>('workflows') || [];
      for (const wf of workflows) {
        index.push({
          id: wf.id,
          type: 'workflow',
          title: wf.name,
          titleLower: wf.name.toLowerCase(),
          keywords: [
            ...wf.name.toLowerCase().split(' '),
            ...(wf.description?.toLowerCase().split(' ') || []),
            wf.category?.toLowerCase(),
          ].filter(Boolean),
          content: wf.description,
          contentLower: wf.description?.toLowerCase(),
          timestamp: wf.updatedAt || wf.createdAt || Date.now(),
          metadata: { 
            subtitle: wf.description,
            stepsCount: wf.steps?.length || 0,
            pinned: wf.pinned,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexNotes(index: SearchIndex[]): Promise<void> {
    try {
      const session = await this.dataStore.get<any>('currentSession');
      const notes = session?.notes || [];
      for (const note of notes) {
        index.push({
          id: note.id,
          type: 'note',
          title: note.content?.slice(0, 50) || 'Untitled Note',
          titleLower: (note.content?.slice(0, 50) || '').toLowerCase(),
          keywords: note.content?.toLowerCase().split(/\s+/).slice(0, 20) || [],
          content: note.content,
          contentLower: note.content?.toLowerCase(),
          timestamp: note.updatedAt || note.createdAt || Date.now(),
          metadata: { 
            category: note.category,
            pinned: note.pinned,
          },
        });
      }

      // Also index standalone notes
      const standaloneNotes = await this.dataStore.get<any[]>('notes') || [];
      for (const note of standaloneNotes) {
        index.push({
          id: note.id,
          type: 'note',
          title: note.title || note.content?.slice(0, 50) || 'Untitled Note',
          titleLower: (note.title || note.content?.slice(0, 50) || '').toLowerCase(),
          keywords: [
            ...(note.title?.toLowerCase().split(/\s+/) || []),
            ...(note.content?.toLowerCase().split(/\s+/).slice(0, 20) || []),
          ],
          content: note.content,
          contentLower: note.content?.toLowerCase(),
          timestamp: note.updatedAt || note.createdAt || Date.now(),
          metadata: { 
            category: note.category,
            pinned: note.pinned,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexTimers(index: SearchIndex[]): Promise<void> {
    try {
      const session = await this.dataStore.get<any>('currentSession');
      const timers = session?.timers || [];
      for (const timer of timers) {
        index.push({
          id: timer.id,
          type: 'timer',
          title: timer.name,
          titleLower: timer.name.toLowerCase(),
          keywords: timer.name.toLowerCase().split(' '),
          timestamp: timer.startedAt || Date.now(),
          metadata: { 
            duration: timer.duration,
            status: timer.status,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexVoiceNotes(index: SearchIndex[]): Promise<void> {
    try {
      const voiceNotes = await this.dataStore.get<any[]>('voiceNotes') || [];
      for (const voice of voiceNotes) {
        index.push({
          id: voice.id,
          type: 'voice',
          title: voice.title || `Voice ${new Date(voice.createdAt).toLocaleDateString()}`,
          titleLower: (voice.title || '').toLowerCase(),
          keywords: [
            ...(voice.title?.toLowerCase().split(' ') || []),
            'voice',
            'audio',
            'recording',
          ],
          content: voice.transcription,
          contentLower: voice.transcription?.toLowerCase(),
          timestamp: voice.createdAt || Date.now(),
          metadata: { 
            duration: voice.duration,
            hasTranscription: !!voice.transcription,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexMedia(index: SearchIndex[]): Promise<void> {
    try {
      const mediaFiles = await this.dataStore.get<any[]>('mediaFiles') || [];
      for (const file of mediaFiles) {
        index.push({
          id: file.id,
          type: 'media',
          title: file.name,
          titleLower: file.name.toLowerCase(),
          keywords: [
            ...file.name.toLowerCase().split(/[\s._-]+/),
            file.type,
            ...(file.tags || []),
          ],
          timestamp: file.createdAt || Date.now(),
          metadata: { 
            fileType: file.type,
            size: file.size,
            path: file.path,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexIdeas(index: SearchIndex[]): Promise<void> {
    try {
      const ideas = await this.dataStore.get<any[]>('ideas') || [];
      for (const idea of ideas) {
        index.push({
          id: idea.id,
          type: 'idea',
          title: idea.title || idea.content?.slice(0, 50) || 'Untitled Idea',
          titleLower: (idea.title || idea.content?.slice(0, 50) || '').toLowerCase(),
          keywords: [
            ...(idea.title?.toLowerCase().split(' ') || []),
            ...(idea.content?.toLowerCase().split(/\s+/).slice(0, 20) || []),
            ...(idea.tags || []),
          ],
          content: idea.content,
          contentLower: idea.content?.toLowerCase(),
          timestamp: idea.updatedAt || idea.createdAt || Date.now(),
          metadata: { 
            status: idea.status,
            tags: idea.tags,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private async indexActions(index: SearchIndex[]): Promise<void> {
    try {
      const actions = this.dataStore.getActions() || [];
      for (const action of actions) {
        index.push({
          id: action.id,
          type: 'action',
          title: action.name,
          titleLower: action.name.toLowerCase(),
          keywords: [
            ...action.name.toLowerCase().split(' '),
            action.type,
          ],
          timestamp: action.createdAt || Date.now(),
          metadata: { 
            actionType: action.type,
            target: action.target,
          },
        });
      }
    } catch (error) {
      // Ignore
    }
  }

  private indexStaticItems(index: SearchIndex[]): void {
    // Navigation items - ALL PAGES
    const navItems = [
      { id: 'nav-dashboard', title: 'Dashboard', keywords: ['home', 'main', 'overview', 'start'] },
      { id: 'nav-operations', title: 'Operations', keywords: ['ops', 'commands', 'control', 'quick'] },
      { id: 'nav-workflows', title: 'Workflows', keywords: ['automation', 'composed', 'builder', 'sequence'] },
      { id: 'nav-actions', title: 'Actions', keywords: ['buttons', 'custom', 'triggers', 'shortcuts'] },
      { id: 'nav-tasks', title: 'Running Tasks', keywords: ['processes', 'active', 'running', 'background'] },
      { id: 'nav-notes', title: 'Notes', keywords: ['text', 'write', 'jot', 'memo'] },
      { id: 'nav-media', title: 'Media Storage', keywords: ['files', 'images', 'documents', 'storage'] },
      { id: 'nav-timers', title: 'Timers', keywords: ['countdown', 'pomodoro', 'clock', 'stopwatch'] },
      { id: 'nav-power', title: 'Power & Performance', keywords: ['battery', 'cpu', 'memory', 'boost'] },
      { id: 'nav-settings', title: 'Settings', keywords: ['preferences', 'config', 'options', 'setup'] },
      { id: 'nav-hotkeys', title: 'Hotkeys', keywords: ['keyboard', 'shortcuts', 'keys', 'bindings'] },
      { id: 'nav-scheduler', title: 'Scheduler', keywords: ['schedule', 'cron', 'timing', 'automatic'] },
      { id: 'nav-scripts', title: 'Scripts', keywords: ['code', 'automation', 'javascript', 'typescript'] },
      { id: 'nav-plugins', title: 'Plugins', keywords: ['extensions', 'addons', 'modules'] },
      { id: 'nav-transfers', title: 'Transfers', keywords: ['sync', 'copy', 'move', 'share'] },
      { id: 'nav-analytics', title: 'Analytics', keywords: ['stats', 'usage', 'insights', 'data'] },
      { id: 'nav-systemmap', title: 'System Map', keywords: ['connections', 'devices', 'network', 'topology'] },
      { id: 'nav-missionboard', title: 'Mission Board', keywords: ['goals', 'objectives', 'tasks', 'projects'] },
      { id: 'nav-blackboxlog', title: 'Activity Log', keywords: ['history', 'events', 'blackbox', 'log'] },
      { id: 'nav-systemintegrity', title: 'System Integrity', keywords: ['health', 'security', 'diagnostics'] },
      // Phase 7B: Voice Notes
      { id: 'nav-voice', title: 'Voice Notes', keywords: ['voice', 'recording', 'audio', 'mic', 'dictation'] },
      // Security page
      { id: 'nav-security', title: 'Security', keywords: ['security', 'privacy', 'encryption', 'protection', 'safe'] },
      // Clipboard History
      { id: 'nav-clipboard', title: 'Clipboard History', keywords: ['clipboard', 'copy', 'paste', 'history', 'copied'] },
      // Additional pages
      { id: 'nav-gallery', title: 'Gallery', keywords: ['gallery', 'images', 'photos', 'pictures'] },
      { id: 'nav-audio', title: 'Audio', keywords: ['audio', 'music', 'sound', 'mp3'] },
      { id: 'nav-video', title: 'Video', keywords: ['video', 'movies', 'clips', 'mp4'] },
      { id: 'nav-files', title: 'Files', keywords: ['files', 'documents', 'browse', 'explorer'] },
      { id: 'nav-code', title: 'Code', keywords: ['code', 'programming', 'editor', 'snippets'] },
      { id: 'nav-sync', title: 'Sync', keywords: ['sync', 'cloud', 'backup', 'synchronize'] },
    ];

    for (const item of navItems) {
      index.push({
        id: item.id,
        type: 'page',
        title: item.title,
        titleLower: item.title.toLowerCase(),
        keywords: [...item.title.toLowerCase().split(' '), ...item.keywords],
        timestamp: Date.now(),
        metadata: { 
          isNavigation: true,
          target: item.id.replace('nav-', ''),
        },
      });
    }

    // Quick Actions - most useful commands
    const quickActions = [
      { id: 'quick-search-files', title: 'Search Files', keywords: ['find', 'locate', 'computer'], desc: 'Search your computer files' },
      { id: 'quick-new-note', title: 'New Note', keywords: ['create', 'write', 'add'], desc: 'Create a new note' },
      { id: 'quick-new-timer', title: 'New Timer', keywords: ['countdown', 'start'], desc: 'Start a new timer' },
      { id: 'quick-new-workflow', title: 'New Workflow', keywords: ['automation', 'create'], desc: 'Create a new workflow' },
      { id: 'quick-boost', title: 'Boost Performance', keywords: ['fast', 'speed', 'optimize'], desc: 'Temporarily boost system performance' },
      { id: 'quick-cleanup', title: 'Clean Up System', keywords: ['free', 'memory', 'clear'], desc: 'Free up memory and resources' },
    ];

    for (const action of quickActions) {
      index.push({
        id: action.id,
        type: 'operation',
        title: action.title,
        titleLower: action.title.toLowerCase(),
        keywords: [...action.title.toLowerCase().split(' '), ...action.keywords],
        content: action.desc,
        contentLower: action.desc.toLowerCase(),
        timestamp: Date.now(),
        metadata: { 
          subtitle: action.desc,
          isQuickAction: true,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Index Management
  // -------------------------------------------------------------------------

  markDirty(): void {
    this.indexDirty = true;
  }

  addToIndex(item: SearchIndex): void {
    // Remove existing item with same ID
    this.index = this.index.filter(i => i.id !== item.id);
    this.index.push(item);
  }

  removeFromIndex(id: string): void {
    this.index = this.index.filter(i => i.id !== id);
  }

  getIndexStats(): { totalItems: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const item of this.index) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }
    return {
      totalItems: this.index.length,
      byType,
    };
  }
}
