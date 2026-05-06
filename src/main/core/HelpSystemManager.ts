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
import Database from 'better-sqlite3';

interface HelpArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  parentId: string | null;
  appId: string | null;
  sortOrder: number;
  tags: string[];
}

interface HelpSearchResult {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  category: string;
}

interface FeatureDiscovery {
  id: string;
  feature_name: string;
  description: string;
  help_article_id: string | null;
  target_selector: string;
  shown_at: number | null;
}

interface ShortcutEntry {
  id: string;
  appId: string;
  section: string;
  action: string;
  defaultKeys: string;
  customKeys: string | null;
}

interface ContextMapping {
  appId: string;
  panelId?: string;
  articleId: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  deepLink: string;
  completed: boolean;
  completedAt: number | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS help_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  parent_id TEXT,
  app_id TEXT,
  sort_order INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]'
);

CREATE VIRTUAL TABLE IF NOT EXISTS help_fts USING fts5(
  id, title, content, category,
  content=help_articles,
  content_rowid=rowid,
  tokenize='porter ascii'
);

CREATE TRIGGER IF NOT EXISTS help_ai AFTER INSERT ON help_articles BEGIN
  INSERT INTO help_fts(rowid, id, title, content, category)
  VALUES (new.rowid, new.id, new.title, new.content, new.category);
END;

CREATE TRIGGER IF NOT EXISTS help_ad AFTER DELETE ON help_articles BEGIN
  INSERT INTO help_fts(help_fts, rowid, id, title, content, category)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.category);
END;

CREATE TRIGGER IF NOT EXISTS help_au AFTER UPDATE ON help_articles BEGIN
  INSERT INTO help_fts(help_fts, rowid, id, title, content, category)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.category);
  INSERT INTO help_fts(rowid, id, title, content, category)
  VALUES (new.rowid, new.id, new.title, new.content, new.category);
END;

CREATE TABLE IF NOT EXISTS feature_discovery (
  id TEXT PRIMARY KEY,
  feature_name TEXT NOT NULL,
  description TEXT NOT NULL,
  help_article_id TEXT,
  target_selector TEXT DEFAULT '',
  shown_at INTEGER
);

CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  section TEXT DEFAULT 'general',
  action TEXT NOT NULL,
  default_keys TEXT NOT NULL,
  custom_keys TEXT
);

CREATE TABLE IF NOT EXISTS help_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  helpful INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS context_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  panel_id TEXT,
  article_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS getting_started_checklist (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deep_link TEXT DEFAULT '',
  completed INTEGER DEFAULT 0,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  release_date INTEGER NOT NULL,
  category TEXT DEFAULT 'improvement',
  description TEXT NOT NULL,
  help_article_id TEXT
);

CREATE TABLE IF NOT EXISTS whats_new_shown (
  version TEXT PRIMARY KEY,
  shown_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category);
CREATE INDEX IF NOT EXISTS idx_help_articles_app_id ON help_articles(app_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_app_id ON keyboard_shortcuts(app_id);
CREATE INDEX IF NOT EXISTS idx_context_mappings_app_id ON context_mappings(app_id);
CREATE INDEX IF NOT EXISTS idx_changelog_version ON changelog_entries(version);
`;

const BUNDLED_HELP_ARTICLES: HelpArticle[] = [
  { id: 'getting-started', title: 'Getting Started with DEX', content: '# Getting Started with DEX\n\nDEX is your complete desktop productivity environment. This guide will walk you through the key features and help you get the most out of DEX.\n\n## The DEX Workspace\n\nThe DEX workspace is organized around inner apps. Each inner app is a focused productivity tool that works independently and integrates with other apps through a shared data layer.\n\n## Navigation\n\n- Use the sidebar to switch between inner apps\n- Use Ctrl+K (Cmd+K on macOS) to open the command palette\n- Use Alt+Left and Alt+Right to navigate between recently used apps\n\n## Your First Steps\n\n1. Create your first note in DEX Notes\n2. Add tasks in the Tasks app\n3. Import files into the Media Library\n4. Explore the Command Palette\n5. Set up your first automation\n\n## Getting Help\n\nPress F1 at any time to open contextual help for the current view.', category: 'general', parentId: null, appId: null, sortOrder: 0, tags: ['start', 'intro', 'navigation'] },
  { id: 'notes-overview', title: 'DEX Notes Overview', content: '# DEX Notes\n\nDEX Notes is a professional note-taking and document editing system.\n\n## Creating Notes\n\nClick the New Note button or press Ctrl+N to create a new note.\n\n## Formatting\n\nUse the formatting toolbar to apply bold, italic, underline, and other formatting. Keyboard shortcuts:\n- Ctrl+B: Bold\n- Ctrl+I: Italic\n- Ctrl+U: Underline\n\n## Folders\n\nOrganize notes into folders and subfolders. Drag notes between folders to reorganize.\n\n## Tags\n\nAdd tags to notes for cross-folder organization. Tags appear in the tag browser.\n\n## Search\n\nFull-text search finds content across all notes instantly.\n\n## Attachments\n\nAttach files to any note. Attachments are stored alongside your note data.\n\n## Templates\n\nSave and use templates to create notes with predefined structure and content.', category: 'inner-apps', parentId: null, appId: 'notes', sortOrder: 1, tags: ['notes', 'editor', 'formatting'] },
  { id: 'tasks-overview', title: 'Tasks and Kanban', content: '# Tasks\n\nThe Tasks app helps you track and manage your work.\n\n## Creating Tasks\n\nCreate tasks with titles, descriptions, due dates, priorities, and tags.\n\n## Kanban View\n\nView your tasks on a Kanban board with customizable columns. Drag tasks between columns to update their status.\n\n## List View\n\nA traditional list view with sorting and filtering options.\n\n## Keyboard Shortcuts\n\n- Ctrl+Enter: Create new task\n- Ctrl+D: Set due date\n- Ctrl+P: Set priority', category: 'inner-apps', parentId: null, appId: 'tasks', sortOrder: 2, tags: ['tasks', 'kanban', 'productivity'] },
  { id: 'media-library', title: 'Media Library', content: '# Media Library\n\nStore and organize all your media files in one place.\n\n## Importing\n\nDrag files into the media library or use the import button to add files.\n\n## Organization\n\nOrganize files with folders, tags, and custom metadata.\n\n## Preview\n\nPreview images, audio, and video directly in DEX.\n\n## Search\n\nSearch files by name, type, tags, or metadata.', category: 'inner-apps', parentId: null, appId: 'media', sortOrder: 3, tags: ['media', 'files', 'library'] },
  { id: 'vinx-overview', title: 'Vinx Audio Editor', content: '# Vinx Audio Editor\n\nVinx is a multi-track audio editor integrated into DEX.\n\n## Timeline\n\nThe timeline shows all audio tracks. Use two-finger pinch to zoom in or out.\n\n## Recording\n\nRecord audio directly into a track using your microphone.\n\n## Editing\n\nCut, copy, paste, and trim audio clips with precision.\n\n## Effects\n\nApply effects to tracks including EQ, compression, reverb, and more.\n\n## Export\n\nExport your project in multiple audio formats.', category: 'inner-apps', parentId: null, appId: 'vinx', sortOrder: 4, tags: ['audio', 'vinx', 'editing'] },

  { id: 'automation-overview', title: 'Automation Rules', content: '# Automation\n\nAutomate repetitive tasks with event-driven rules.\n\n## Creating Rules\n\nRules have three parts: a trigger event, optional conditions, and actions to perform.\n\n## Triggers\n\nTriggers include: time-based schedules, file changes, application events, and custom triggers.\n\n## Actions\n\nActions include: create notes, move files, send notifications, run scripts, and more.\n\n## Rule Management\n\nEnable, disable, or delete rules from the automation panel.', category: 'inner-apps', parentId: null, appId: 'automation', sortOrder: 6, tags: ['automation', 'rules', 'triggers'] },
  { id: 'settings-overview', title: 'DEX Settings', content: '# DEX Settings\n\nConfigure every aspect of DEX from the settings panel.\n\n## General\n\nLanguage, theme, startup behavior, and default apps.\n\n## Privacy\n\nTelemetry, crash reporting, and data collection settings.\n\n## License\n\nActivate or manage your DEX license.\n\n## Backup and Restore\n\nConfigure automatic backups and restore from previous backups.\n\n## Accessibility\n\nKeyboard shortcuts, screen reader support, contrast settings, and motion preferences.\n\n## Advanced\n\nDeveloper mode, health check, and system diagnostics.', category: 'settings', parentId: null, appId: null, sortOrder: 7, tags: ['settings', 'configuration', 'preferences'] },
  { id: 'shortcuts-overview', title: 'Keyboard Shortcuts', content: '# Keyboard Shortcuts\n\nDEX supports extensive keyboard shortcuts for every feature.\n\n## Global Shortcuts\n\n- Ctrl+K / Cmd+K: Command palette\n- Ctrl+N: New item in current app\n- Ctrl+S: Save\n- Ctrl+Z: Undo\n- Ctrl+Y: Redo\n- F1: Help\n- Ctrl+Shift+/: Shortcuts reference\n- Alt+Left: Previous app\n- Alt+Right: Next app\n\n## Customization\n\nCustomize any shortcut from Settings > Accessibility > Keyboard Shortcuts.', category: 'general', parentId: null, appId: null, sortOrder: 8, tags: ['shortcuts', 'keyboard', 'hotkeys'] },
  { id: 'backup-overview', title: 'Backup and Restore', content: '# Backup and Restore\n\nDEX automatically backs up your data to protect against data loss.\n\n## Automatic Backups\n\nBy default, DEX creates a backup every day. Configure frequency in Settings > Backup.\n\n## Manual Backups\n\nCreate a backup at any time from Settings > Backup > Create Backup Now.\n\n## Restoring\n\nRestore from any backup. DEX creates a safety backup before each restore.\n\n## Selective Restore\n\nChoose which databases to restore: Notes, Tasks, Media Library, Settings, or all.', category: 'settings', parentId: null, appId: null, sortOrder: 9, tags: ['backup', 'restore', 'data'] },
  { id: 'security-overview', title: 'Security and Privacy', content: '# Security and Privacy\n\nDEX takes your privacy seriously.\n\n## Encryption\n\nAll databases are encrypted using your master key stored in the OS keychain.\n\n## Vault\n\nStore sensitive notes and files in the encrypted vault.\n\n## Telemetry\n\nTelemetry is opt-in only. You control what data is shared.\n\n## Data Location\n\nAll your data is stored locally on your machine. DEX never uploads your content.', category: 'settings', parentId: null, appId: null, sortOrder: 10, tags: ['security', 'privacy', 'encryption'] },
  { id: 'accessibility-overview', title: 'Accessibility Features', content: '# Accessibility\n\nDEX is built to be accessible to everyone.\n\n## Screen Readers\n\nFull screen reader support with ARIA labels throughout.\n\n## Keyboard Navigation\n\nEvery feature is accessible via keyboard.\n\n## High Contrast\n\nAll text meets WCAG 2.1 AA contrast requirements.\n\n## Reduced Motion\n\nRespects the OS reduce motion preference.\n\n## Touch and Stylus\n\nFull support for touch devices and stylus input with palm rejection.', category: 'general', parentId: null, appId: null, sortOrder: 11, tags: ['accessibility', 'a11y', 'screen-reader'] },
  { id: 'developer-overview', title: 'Developer Platform', content: '# Developer Platform\n\nBuild extensions, plugins, themes, and full inner apps for DEX.\n\n## Getting Started\n\nInstall the DEX SDK from npm: npm install dex-sdk\n\n## Extensions\n\nExtensions can add full inner apps, plugins, or themes to DEX.\n\n## API\n\nThe DEX Public API gives extensions access to notes, tasks, media, events, and more.\n\n## Developer Console\n\nAccess the developer console from Settings > Advanced > Developer Mode.\n\n## Sandbox\n\nTest extensions in a sandbox environment that isolates them from your real data.', category: 'developer', parentId: null, appId: null, sortOrder: 12, tags: ['developer', 'extensions', 'api', 'sdk'] },
  { id: 'import-overview', title: 'Importing Data', content: '# Importing Data\n\nMigrate your data from other apps into DEX.\n\n## Supported Sources\n\n- Apple Notes (HTML or plain text export)\n- Obsidian (Markdown vault with wikilinks)\n- Notion (Markdown and CSV export)\n- Todoist (CSV export)\n- Any Markdown folder\n- Plain text folder\n\n## Import Process\n\n1. Select your source app\n2. Choose the exported file or folder\n3. Preview what will be imported\n4. Configure import options\n5. Run the import\n\nImported content goes into a dedicated import folder, never mixed with existing data.', category: 'general', parentId: null, appId: null, sortOrder: 13, tags: ['import', 'migration', 'data'] }
];

const BUNDLED_SHORTCUTS: ShortcutEntry[] = [
  { id: 'global-command-palette', appId: 'global', section: 'Navigation', action: 'Open command palette', defaultKeys: 'Ctrl+K', customKeys: null },
  { id: 'global-new-item', appId: 'global', section: 'Navigation', action: 'New item', defaultKeys: 'Ctrl+N', customKeys: null },
  { id: 'global-save', appId: 'global', section: 'Navigation', action: 'Save', defaultKeys: 'Ctrl+S', customKeys: null },
  { id: 'global-undo', appId: 'global', section: 'Editing', action: 'Undo', defaultKeys: 'Ctrl+Z', customKeys: null },
  { id: 'global-redo', appId: 'global', section: 'Editing', action: 'Redo', defaultKeys: 'Ctrl+Y', customKeys: null },
  { id: 'global-help', appId: 'global', section: 'Navigation', action: 'Help', defaultKeys: 'F1', customKeys: null },
  { id: 'global-shortcuts', appId: 'global', section: 'Navigation', action: 'Shortcuts reference', defaultKeys: 'Ctrl+Shift+/', customKeys: null },
  { id: 'global-prev-app', appId: 'global', section: 'Navigation', action: 'Previous app', defaultKeys: 'Alt+Left', customKeys: null },
  { id: 'global-next-app', appId: 'global', section: 'Navigation', action: 'Next app', defaultKeys: 'Alt+Right', customKeys: null },
  { id: 'global-search', appId: 'global', section: 'Navigation', action: 'Global search', defaultKeys: 'Ctrl+Shift+F', customKeys: null },
  { id: 'global-close-panel', appId: 'global', section: 'Navigation', action: 'Close panel', defaultKeys: 'Escape', customKeys: null },
  { id: 'notes-bold', appId: 'notes', section: 'Formatting', action: 'Bold', defaultKeys: 'Ctrl+B', customKeys: null },
  { id: 'notes-italic', appId: 'notes', section: 'Formatting', action: 'Italic', defaultKeys: 'Ctrl+I', customKeys: null },
  { id: 'notes-underline', appId: 'notes', section: 'Formatting', action: 'Underline', defaultKeys: 'Ctrl+U', customKeys: null },
  { id: 'notes-strikethrough', appId: 'notes', section: 'Formatting', action: 'Strikethrough', defaultKeys: 'Ctrl+Shift+S', customKeys: null },
  { id: 'notes-find', appId: 'notes', section: 'Editing', action: 'Find', defaultKeys: 'Ctrl+F', customKeys: null },
  { id: 'notes-new-note', appId: 'notes', section: 'Notes', action: 'New note', defaultKeys: 'Ctrl+N', customKeys: null },
  { id: 'notes-toggle-sidebar', appId: 'notes', section: 'View', action: 'Toggle sidebar', defaultKeys: 'Ctrl+\\', customKeys: null },
  { id: 'notes-focus-mode', appId: 'notes', section: 'View', action: 'Focus mode', defaultKeys: 'Ctrl+Shift+F', customKeys: null },
  { id: 'notes-daily-note', appId: 'notes', section: 'Notes', action: 'Daily note', defaultKeys: 'Ctrl+D', customKeys: null },
  { id: 'tasks-new-task', appId: 'tasks', section: 'Tasks', action: 'New task', defaultKeys: 'Ctrl+Enter', customKeys: null },
  { id: 'tasks-due-date', appId: 'tasks', section: 'Tasks', action: 'Set due date', defaultKeys: 'Ctrl+D', customKeys: null },
  { id: 'tasks-priority', appId: 'tasks', section: 'Tasks', action: 'Set priority', defaultKeys: 'Ctrl+P', customKeys: null },
  { id: 'vinx-play-pause', appId: 'vinx', section: 'Playback', action: 'Play/Pause', defaultKeys: 'Space', customKeys: null },
  { id: 'vinx-zoom-in', appId: 'vinx', section: 'View', action: 'Zoom in', defaultKeys: 'Ctrl+=', customKeys: null },
  { id: 'vinx-zoom-out', appId: 'vinx', section: 'View', action: 'Zoom out', defaultKeys: 'Ctrl+-', customKeys: null },
];

const BUNDLED_CONTEXT_MAPPINGS: ContextMapping[] = [
  { appId: 'notes', articleId: 'notes-overview' },
  { appId: 'notes', panelId: 'editor', articleId: 'notes-overview' },
  { appId: 'tasks', articleId: 'tasks-overview' },
  { appId: 'media', articleId: 'media-library' },
  { appId: 'vinx', articleId: 'vinx-overview' },
  { appId: 'automation', articleId: 'automation-overview' },
  { appId: 'settings', articleId: 'settings-overview' },
  { appId: 'settings', panelId: 'backup', articleId: 'backup-overview' },
  { appId: 'settings', panelId: 'security', articleId: 'security-overview' },
  { appId: 'settings', panelId: 'accessibility', articleId: 'accessibility-overview' },
  { appId: 'developer', articleId: 'developer-overview' }
];

const BUNDLED_CHECKLIST: ChecklistItem[] = [
  { id: 'create-note', title: 'Create your first note', description: 'Open DEX Notes and create a note', deepLink: 'dex://notes/new', completed: false, completedAt: null },
  { id: 'create-task', title: 'Create your first task', description: 'Open Tasks and add your first task', deepLink: 'dex://tasks/new', completed: false, completedAt: null },
  { id: 'import-file', title: 'Import a file into the media library', description: 'Add a file to your media library', deepLink: 'dex://media/import', completed: false, completedAt: null },
  { id: 'command-palette', title: 'Try the command palette with Ctrl+K', description: 'Open the command palette and explore available commands', deepLink: 'dex://command-palette', completed: false, completedAt: null },
  { id: 'automation-rule', title: 'Set up your first automation rule', description: 'Create an automation that works for you', deepLink: 'dex://automation/new', completed: false, completedAt: null },

  { id: 'explore-app', title: 'Explore an inner app you have not tried yet', description: 'Open any app from the app wall you have not used', deepLink: 'dex://launchpad', completed: false, completedAt: null }
];

const BUNDLED_DISCOVERY: FeatureDiscovery[] = [
  { id: 'discovery-command-palette', feature_name: 'Command Palette', description: 'Press Ctrl+K to quickly search and run any command.', help_article_id: 'shortcuts-overview', target_selector: '[data-feature="command-palette"]', shown_at: null },
  { id: 'discovery-sidebar', feature_name: 'App Sidebar', description: 'Switch between inner apps from the sidebar.', help_article_id: 'getting-started', target_selector: '.dex-sidebar', shown_at: null },
  { id: 'discovery-notes-folders', feature_name: 'Note Folders', description: 'Organize your notes into folders and subfolders.', help_article_id: 'notes-overview', target_selector: '[data-feature="note-folders"]', shown_at: null },
  { id: 'discovery-kanban', feature_name: 'Kanban Board', description: 'Drag tasks between columns to update their status.', help_article_id: 'tasks-overview', target_selector: '[data-feature="kanban"]', shown_at: null },
  { id: 'discovery-media-import', feature_name: 'Media Import', description: 'Drag files here or click import to add media.', help_article_id: 'media-library', target_selector: '[data-feature="media-import"]', shown_at: null },
  { id: 'discovery-automation', feature_name: 'Automation Rules', description: 'Create rules that automatically perform actions based on events.', help_article_id: 'automation-overview', target_selector: '[data-feature="automation"]', shown_at: null },
  { id: 'discovery-search', feature_name: 'Global Search', description: 'Search across all your content from one place.', help_article_id: 'getting-started', target_selector: '[data-feature="global-search"]', shown_at: null }
];

export class HelpSystemManager extends EventEmitter {
  private db: Database.Database | null = null;
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    try {
      this.mainWindow = mainWindow || null;
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'help.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(SCHEMA_SQL);

      this.seedBundledContent();
      this.setupIPC();

      this.initialized = true;
      log.info('[HelpSystemManager] Initialized');
    } catch (err) {
      log.error('[HelpSystemManager] Initialization failed:', err);
    }
  }

  private seedBundledContent(): void {
    if (!this.db) return;

    const existingCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM help_articles').get() as any)?.cnt || 0;
    if (existingCount === 0) {
      const insertArticle = this.db.prepare(`
        INSERT OR REPLACE INTO help_articles (id, title, content, category, parent_id, app_id, sort_order, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMany = this.db.transaction(() => {
        for (const a of BUNDLED_HELP_ARTICLES) {
          insertArticle.run(a.id, a.title, a.content, a.category, a.parentId, a.appId, a.sortOrder, JSON.stringify(a.tags));
        }
      });
      insertMany();
    }

    const shortcutCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM keyboard_shortcuts').get() as any)?.cnt || 0;
    if (shortcutCount === 0) {
      const insertShortcut = this.db.prepare(`
        INSERT OR REPLACE INTO keyboard_shortcuts (id, app_id, section, action, default_keys, custom_keys)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertShortcuts = this.db.transaction(() => {
        for (const s of BUNDLED_SHORTCUTS) {
          insertShortcut.run(s.id, s.appId, s.section, s.action, s.defaultKeys, s.customKeys);
        }
      });
      insertShortcuts();
    }

    const discoveryCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM feature_discovery').get() as any)?.cnt || 0;
    if (discoveryCount === 0) {
      const insertDiscovery = this.db.prepare(`
        INSERT OR REPLACE INTO feature_discovery (id, feature_name, description, help_article_id, target_selector, shown_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertDiscoveries = this.db.transaction(() => {
        for (const d of BUNDLED_DISCOVERY) {
          insertDiscovery.run(d.id, d.feature_name, d.description, d.help_article_id, d.target_selector, d.shown_at);
        }
      });
      insertDiscoveries();
    }

    const checklistCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM getting_started_checklist').get() as any)?.cnt || 0;
    if (checklistCount === 0) {
      const insertChecklist = this.db.prepare(`
        INSERT OR REPLACE INTO getting_started_checklist (id, title, description, deep_link, completed, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertChecklists = this.db.transaction(() => {
        for (const c of BUNDLED_CHECKLIST) {
          insertChecklist.run(c.id, c.title, c.description, c.deepLink, c.completed ? 1 : 0, c.completedAt);
        }
      });
      insertChecklists();
    }

    const contextCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM context_mappings').get() as any)?.cnt || 0;
    if (contextCount === 0) {
      const insertContext = this.db.prepare('INSERT INTO context_mappings (app_id, panel_id, article_id) VALUES (?, ?, ?)');
      const insertContexts = this.db.transaction(() => {
        for (const c of BUNDLED_CONTEXT_MAPPINGS) {
          insertContext.run(c.appId, c.panelId || null, c.articleId);
        }
      });
      insertContexts();
    }
  }

  private setupIPC(): void {
    ipcMain.handle('help:search', (_e, query: string) => {
      if (!this.db || !query.trim()) return [];
      try {
        const rows = this.db.prepare(`
          SELECT h.id, h.title, h.category,
            snippet(help_fts, 2, '<mark>', '</mark>', '...', 40) as snippet,
            rank
          FROM help_fts f
          JOIN help_articles h ON h.id = f.id
          WHERE help_fts MATCH ?
          ORDER BY rank
          LIMIT 20
        `).all(query + '*') as any[];
        return rows.map(r => ({ id: r.id, title: r.title, snippet: r.snippet, rank: r.rank, category: r.category }));
      } catch (_err) {
        return [];
      }
    });

    ipcMain.handle('help:get-article', (_e, id: string) => {
      if (!this.db) return null;
      const row = this.db.prepare('SELECT * FROM help_articles WHERE id = ?').get(id) as any;
      if (!row) return null;
      return {
        id: row.id, title: row.title, content: row.content, category: row.category,
        parentId: row.parent_id, appId: row.app_id, sortOrder: row.sort_order,
        tags: JSON.parse(row.tags || '[]')
      };
    });

    ipcMain.handle('help:list-articles', (_e, category?: string) => {
      if (!this.db) return [];
      let rows;
      if (category) {
        rows = this.db.prepare('SELECT id, title, category, parent_id, app_id, sort_order FROM help_articles WHERE category = ? ORDER BY sort_order').all(category) as any[];
      } else {
        rows = this.db.prepare('SELECT id, title, category, parent_id, app_id, sort_order FROM help_articles ORDER BY sort_order').all() as any[];
      }
      return rows.map(r => ({ id: r.id, title: r.title, category: r.category, parentId: r.parent_id, appId: r.app_id, sortOrder: r.sort_order }));
    });

    ipcMain.handle('help:get-contextual-article', (_e, appId: string, panelId?: string) => {
      if (!this.db) return null;
      let mapping;
      if (panelId) {
        mapping = this.db.prepare('SELECT article_id FROM context_mappings WHERE app_id = ? AND panel_id = ?').get(appId, panelId) as any;
      }
      if (!mapping) {
        mapping = this.db.prepare('SELECT article_id FROM context_mappings WHERE app_id = ? AND panel_id IS NULL').get(appId) as any;
      }
      if (!mapping) return null;
      return this.db.prepare('SELECT * FROM help_articles WHERE id = ?').get(mapping.article_id);
    });

    ipcMain.handle('help:submit-feedback', (_e, articleId: string, helpful: boolean) => {
      if (!this.db) return;
      this.db.prepare('INSERT INTO help_feedback (article_id, helpful, created_at) VALUES (?, ?, ?)').run(articleId, helpful ? 1 : 0, Date.now());
    });

    ipcMain.handle('help:get-shortcuts', (_e, appId?: string) => {
      if (!this.db) return [];
      let rows;
      if (appId) {
        rows = this.db.prepare('SELECT * FROM keyboard_shortcuts WHERE app_id = ? ORDER BY section, action').all(appId) as any[];
      } else {
        rows = this.db.prepare('SELECT * FROM keyboard_shortcuts ORDER BY app_id, section, action').all() as any[];
      }
      return rows.map(r => ({
        id: r.id, appId: r.app_id, section: r.section, action: r.action,
        defaultKeys: r.default_keys, customKeys: r.custom_keys
      }));
    });

    ipcMain.handle('help:set-custom-shortcut', (_e, shortcutId: string, keys: string | null) => {
      if (!this.db) return;
      this.db.prepare('UPDATE keyboard_shortcuts SET custom_keys = ? WHERE id = ?').run(keys, shortcutId);
    });

    ipcMain.handle('help:get-discovery-tooltips', () => {
      if (!this.db) return [];
      return this.db.prepare('SELECT * FROM feature_discovery WHERE shown_at IS NULL').all();
    });

    ipcMain.handle('help:mark-discovery-shown', (_e, id: string) => {
      if (!this.db) return;
      this.db.prepare('UPDATE feature_discovery SET shown_at = ? WHERE id = ?').run(Date.now(), id);
    });

    ipcMain.handle('help:reset-discovery', () => {
      if (!this.db) return;
      this.db.prepare('UPDATE feature_discovery SET shown_at = NULL').run();
    });

    ipcMain.handle('help:get-checklist', () => {
      if (!this.db) return [];
      return this.db.prepare('SELECT * FROM getting_started_checklist ORDER BY rowid').all();
    });

    ipcMain.handle('help:complete-checklist-item', (_e, id: string) => {
      if (!this.db) return;
      this.db.prepare('UPDATE getting_started_checklist SET completed = 1, completed_at = ? WHERE id = ?').run(Date.now(), id);
    });

    ipcMain.handle('help:is-checklist-complete', () => {
      if (!this.db) return true;
      const row = this.db.prepare('SELECT COUNT(*) as cnt FROM getting_started_checklist WHERE completed = 0').get() as any;
      return (row?.cnt || 0) === 0;
    });

    ipcMain.handle('help:get-changelog', () => {
      if (!this.db) return [];
      return this.db.prepare('SELECT * FROM changelog_entries ORDER BY release_date DESC').all();
    });

    ipcMain.handle('help:was-whats-new-shown', (_e, version: string) => {
      if (!this.db) return true;
      const row = this.db.prepare('SELECT * FROM whats_new_shown WHERE version = ?').get(version) as any;
      return !!row;
    });

    ipcMain.handle('help:mark-whats-new-shown', (_e, version: string) => {
      if (!this.db) return;
      this.db.prepare('INSERT OR REPLACE INTO whats_new_shown (version, shown_at) VALUES (?, ?)').run(version, Date.now());
    });
  }

  destroy(): void {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[HelpSystemManager] Destroyed');
  }
}

export const helpSystemManager = new HelpSystemManager();
