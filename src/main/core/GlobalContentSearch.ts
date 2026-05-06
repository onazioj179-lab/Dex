// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Global Content Search Engine
// Searches across all DEX content sources in parallel.
// Results grouped by source, returned within 300ms of debounce.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { databaseManager } from './DatabaseManager';

export interface SearchResult {
  source: string;
  title: string;
  description: string;
  timestamp: number | null;
  deepLink: string;
  relevance: number;
}

export interface SearchResultGroup {
  source: string;
  results: SearchResult[];
  totalCount: number;
}

interface SearchSource {
  name: string;
  search: (query: string) => Promise<SearchResult[]>;
}

class GlobalContentSearchEngine {
  private mainWindow: BrowserWindow | null = null;
  private sources: SearchSource[] = [];
  private lastQuery = '';
  private searchTimeout: NodeJS.Timeout | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.buildSources();
    this.registerIPC();
    log.info('[GlobalSearch] Global content search engine initialized');
  }

  private buildSources(): void {
    this.sources = [
      { name: 'Notes', search: (q) => this.searchNotes(q) },
      { name: 'Tasks', search: (q) => this.searchTasks(q) },
      { name: 'Rewind Journal', search: (q) => this.searchRewindJournal(q) },
      { name: 'Vinx Projects', search: (q) => this.searchVinxProjects(q) },
      { name: 'Automation Rules', search: (q) => this.searchAutomationRules(q) },
      { name: 'Media Library', search: (q) => this.searchMediaLibrary(q) },
      { name: 'Apps', search: (q) => this.searchApps(q) },
      { name: 'Notifications', search: (q) => this.searchNotifications(q) },
      { name: 'Recycle Bin', search: (q) => this.searchRecycleBin(q) },
    ];
  }

  async search(query: string): Promise<SearchResultGroup[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const startTime = Date.now();

    const results = await Promise.allSettled(
      this.sources.map(async (source) => {
        try {
          const sourceResults = await source.search(normalizedQuery);
          return { source: source.name, results: sourceResults };
        } catch (err) {
          log.warn(`[GlobalSearch] Search failed for source ${source.name}:`, err);
          return { source: source.name, results: [] };
        }
      })
    );

    const groups: SearchResultGroup[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.results.length > 0) {
        const sorted = result.value.results.sort((a, b) => b.relevance - a.relevance);
        groups.push({
          source: result.value.source,
          results: sorted,
          totalCount: sorted.length,
        });
      }
    }

    groups.sort((a, b) => {
      const maxA = a.results[0]?.relevance || 0;
      const maxB = b.results[0]?.relevance || 0;
      return maxB - maxA;
    });

    const elapsed = Date.now() - startTime;
    log.info(`[GlobalSearch] Query "${query}" returned ${groups.reduce((n, g) => n + g.totalCount, 0)} results in ${elapsed}ms`);

    return groups;
  }

  private calculateRelevance(query: string, text: string): number {
    const lower = text.toLowerCase();
    if (lower === query) return 100;
    if (lower.startsWith(query)) return 90;
    const words = query.split(/\s+/);
    let matched = 0;
    for (const w of words) {
      if (lower.includes(w)) matched++;
    }
    if (matched === words.length) return 80;
    if (matched > 0) return 40 + (matched / words.length) * 40;
    return 0;
  }

  private async searchNotes(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const notes = await this.mainWindow.webContents.executeJavaScript(
          `(function() {
            try {
              const raw = localStorage.getItem('dex-notes');
              if (!raw) return [];
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
            } catch { return []; }
          })()`
        );
        for (const note of notes) {
          const title = note.title || note.name || '';
          const content = note.content || note.body || note.text || '';
          const combined = `${title} ${content}`;
          const rel = this.calculateRelevance(query, combined);
          if (rel > 0) {
            results.push({
              source: 'Notes',
              title: title || 'Untitled Note',
              description: (content || '').substring(0, 120),
              timestamp: note.updatedAt || note.createdAt || note.timestamp || null,
              deepLink: `dex://notes/note/${note.id || ''}`,
              relevance: rel,
            });
          }
        }
      }
    } catch (err) {
      log.warn('[GlobalSearch] Notes search error:', err);
    }
    return results;
  }

  private async searchTasks(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const tasks = await this.mainWindow.webContents.executeJavaScript(
          `(function() {
            try {
              const raw = localStorage.getItem('dex-tasks');
              if (!raw) return [];
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
            } catch { return []; }
          })()`
        );
        for (const task of tasks) {
          const title = task.title || task.name || '';
          const desc = task.description || '';
          const combined = `${title} ${desc}`;
          const rel = this.calculateRelevance(query, combined);
          if (rel > 0) {
            results.push({
              source: 'Tasks',
              title: title || 'Untitled Task',
              description: desc.substring(0, 120),
              timestamp: task.dueDate || task.createdAt || null,
              deepLink: `dex://tasks/task/${task.id || ''}`,
              relevance: rel,
            });
          }
        }
      }
    } catch (err) {
      log.warn('[GlobalSearch] Tasks search error:', err);
    }
    return results;
  }

  private async searchRewindJournal(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      const { app } = require('electron');
      const journalDir = path.join(app.getPath('userData'), 'rewind');
      if (!fs.existsSync(journalDir)) return results;

      const files = fs.readdirSync(journalDir).filter(f => f.endsWith('.json')).slice(-30);
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(journalDir, file), 'utf8');
          const dayData = JSON.parse(raw);
          const entries = dayData.entries || dayData || [];
          if (!Array.isArray(entries)) continue;
          for (const entry of entries.slice(-200)) {
            const content = entry.content || entry.appName || '';
            const rel = this.calculateRelevance(query, content);
            if (rel > 0) {
              results.push({
                source: 'Rewind Journal',
                title: entry.appName || 'Activity',
                description: content.substring(0, 120),
                timestamp: entry.timestamp || null,
                deepLink: `dex://rewind/journal/${entry.id || ''}`,
                relevance: rel,
              });
            }
          }
        } catch {
          continue;
        }
      }
    } catch (err) {
      log.warn('[GlobalSearch] Rewind search error:', err);
    }
    return results;
  }

  private async searchVinxProjects(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const projects = await this.mainWindow.webContents.executeJavaScript(
          `(function() {
            try {
              const raw = localStorage.getItem('vinx-projects');
              if (!raw) return [];
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
            } catch { return []; }
          })()`
        );
        for (const proj of projects) {
          const name = proj.name || proj.title || '';
          const rel = this.calculateRelevance(query, name);
          if (rel > 0) {
            results.push({
              source: 'Vinx Projects',
              title: name || 'Untitled Project',
              description: `Video project - ${proj.duration ? (proj.duration / 1000).toFixed(0) + 's' : 'unknown duration'}`,
              timestamp: proj.updatedAt || proj.createdAt || null,
              deepLink: `dex://vinx/project/${proj.id || ''}`,
              relevance: rel,
            });
          }
        }
      }
    } catch (err) {
      log.warn('[GlobalSearch] Vinx search error:', err);
    }
    return results;
  }

  private async searchAutomationRules(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const rules = await this.mainWindow.webContents.executeJavaScript(
          `(function() {
            try {
              const raw = localStorage.getItem('dex-rules');
              if (!raw) return [];
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
            } catch { return []; }
          })()`
        );
        for (const rule of rules) {
          const name = rule.name || rule.title || '';
          const rel = this.calculateRelevance(query, name);
          if (rel > 0) {
            results.push({
              source: 'Automation Rules',
              title: name || 'Untitled Rule',
              description: rule.description || `Automation rule - ${rule.enabled ? 'Active' : 'Inactive'}`,
              timestamp: rule.createdAt || null,
              deepLink: `dex://automation/rule/${rule.id || ''}`,
              relevance: rel,
            });
          }
        }
      }
    } catch (err) {
      log.warn('[GlobalSearch] Automation search error:', err);
    }
    return results;
  }

  private async searchMediaLibrary(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const db = databaseManager.getDatabase();
    if (!db) return results;
    try {
      const rows = db.prepare(
        'SELECT * FROM media_library WHERE filename LIKE ? LIMIT 50'
      ).all(`%${query}%`);
      for (const row of rows) {
        results.push({
          source: 'Media Library',
          title: row.filename,
          description: `${row.type} - ${(row.size / 1024 / 1024).toFixed(1)} MB`,
          timestamp: row.timestamp,
          deepLink: `dex://media/file/${row.id}`,
          relevance: this.calculateRelevance(query, row.filename),
        });
      }
    } catch (err) {
      log.warn('[GlobalSearch] Media library search error:', err);
    }
    return results;
  }

  private async searchApps(query: string): Promise<SearchResult[]> {
    const apps = [
      { id: 'home', name: 'Home', desc: 'Desktop home screen with widgets' },
      { id: 'files', name: 'Files', desc: 'File manager and browser' },
      { id: 'browser', name: 'Browser', desc: 'Built-in web browser' },
      { id: 'settings', name: 'Settings', desc: 'DEX settings and preferences' },
      { id: 'transfers', name: 'Transfers', desc: 'File transfer manager' },
      { id: 'dashboard', name: 'Dashboard', desc: 'System dashboard and analytics' },
      { id: 'notes', name: 'Notes', desc: 'Note taking and text editor' },
      { id: 'tasks', name: 'Tasks', desc: 'Task and to-do list manager' },
      { id: 'power', name: 'Power', desc: 'Power management and automation' },
      { id: 'workflows', name: 'Workflows', desc: 'Workflow designer and runner' },
      { id: 'gallery', name: 'Gallery', desc: 'Image gallery and viewer' },
      { id: 'audio', name: 'Audio', desc: 'Audio player and editor' },
      { id: 'video', name: 'Video', desc: 'Video player' },
      { id: 'videoeditor', name: 'Vinx', desc: 'Professional video editor' },
      { id: 'imosion', name: 'Imosion', desc: 'Motion graphics and animation' },
      { id: 'prism', name: 'Prism', desc: 'Photo editor and filters' },
      { id: 'flux', name: 'Flux', desc: 'Design and layout tool' },
      { id: 'forge', name: 'Forge', desc: 'Code editor and IDE' },
      { id: 'calculator', name: 'Calculator', desc: 'Calculator and unit converter' },
      { id: 'calendar', name: 'Calendar', desc: 'Calendar and event planner' },
      { id: 'passwordgenerator', name: 'Password Generator', desc: 'Secure password generator' },
      { id: 'rewind', name: 'Rewind', desc: 'Activity timeline and journal' },
      { id: 'kanban', name: 'Kanban', desc: 'Kanban board project management' },
      { id: 'achievements', name: 'Achievements', desc: 'Achievements and gamification' },
    ];

    const results: SearchResult[] = [];
    for (const a of apps) {
      const combined = `${a.name} ${a.desc}`;
      const rel = this.calculateRelevance(query, combined);
      if (rel > 0) {
        results.push({
          source: 'Apps',
          title: a.name,
          description: a.desc,
          timestamp: null,
          deepLink: `dex://app/${a.id}`,
          relevance: rel,
        });
      }
    }
    return results;
  }

  private async searchNotifications(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const db = databaseManager.getDatabase();
    if (!db) return results;
    try {
      const rows = db.prepare(
        'SELECT * FROM notifications WHERE title LIKE ? OR body LIKE ? ORDER BY timestamp DESC LIMIT 30'
      ).all(`%${query}%`, `%${query}%`);
      for (const row of rows) {
        results.push({
          source: 'Notifications',
          title: row.title,
          description: row.body.substring(0, 120),
          timestamp: row.timestamp,
          deepLink: '',
          relevance: this.calculateRelevance(query, `${row.title} ${row.body}`),
        });
      }
    } catch (err) {
      log.warn('[GlobalSearch] Notification search error:', err);
    }
    return results;
  }

  private async searchRecycleBin(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const db = databaseManager.getDatabase();
    if (!db) return results;
    try {
      const rows = db.prepare(
        'SELECT * FROM recycle_bin WHERE item_name LIKE ? ORDER BY deleted_at DESC LIMIT 30'
      ).all(`%${query}%`);
      for (const row of rows) {
        results.push({
          source: 'Recycle Bin',
          title: row.item_name,
          description: `Deleted ${row.item_type} from ${row.app}`,
          timestamp: row.deleted_at,
          deepLink: '',
          relevance: this.calculateRelevance(query, row.item_name),
        });
      }
    } catch (err) {
      log.warn('[GlobalSearch] Recycle bin search error:', err);
    }
    return results;
  }

  private registerIPC(): void {
    ipcMain.handle('global-search:query', async (_event, query: string) => {
      return this.search(query);
    });

    ipcMain.handle('global-search:sources', () => {
      return this.sources.map(s => s.name);
    });
  }

  shutdown(): void {
    log.info('[GlobalSearch] Shutdown');
  }
}

export const globalContentSearch = new GlobalContentSearchEngine();

export function initializeGlobalContentSearch(mainWindow: BrowserWindow): void {
  globalContentSearch.initialize(mainWindow);
}

export function shutdownGlobalContentSearch(): void {
  globalContentSearch.shutdown();
}
