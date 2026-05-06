// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Built-in Text & Code Editor
// Full-featured text/code editing with syntax highlighting, multi-file support
// Keyboard-driven, minimal UI, session persistence
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';
import * as crypto from 'crypto';

// ===========================================================================
// TYPES
// ===========================================================================

export type EditorTheme = 'dark' | 'light' | 'system';
export type IndentStyle = 'spaces' | 'tabs';
export type LineEnding = 'lf' | 'crlf' | 'auto';

export interface EditorPosition {
  line: number;
  column: number;
}

export interface EditorSelection {
  start: EditorPosition;
  end: EditorPosition;
}

export interface EditorDocument {
  id: string;
  path?: string;
  filename: string;
  content: string;
  originalContent: string;
  language: string;
  encoding: string;
  lineEnding: LineEnding;
  isModified: boolean;
  isReadOnly: boolean;
  cursorPosition: EditorPosition;
  selections: EditorSelection[];
  scrollPosition: { x: number; y: number };
  foldedLines: number[];
  bookmarks: number[];
  history: DocumentHistory;
  createdAt: number;
  lastSavedAt?: number;
  wordWrap: boolean;
}

export interface DocumentHistory {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  savedAt?: number;
}

export interface HistoryEntry {
  timestamp: number;
  changes: TextChange[];
  cursorBefore: EditorPosition;
  cursorAfter: EditorPosition;
}

export interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  range: { start: EditorPosition; end: EditorPosition };
  text: string;
  replacedText?: string;
}

export interface SearchResult {
  line: number;
  column: number;
  length: number;
  text: string;
  preview: string;
}

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  searchScope?: 'document' | 'selection' | 'all-open';
}

export interface ReplaceOptions extends SearchOptions {
  replacement: string;
}

export interface LanguageConfig {
  id: string;
  name: string;
  extensions: string[];
  lineComment?: string;
  blockComment?: { start: string; end: string };
  autoClosingPairs: Array<{ open: string; close: string }>;
  indentRules?: {
    increaseIndentPattern?: string;
    decreaseIndentPattern?: string;
  };
}

export interface EditorConfig {
  theme: EditorTheme;
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  indentStyle: IndentStyle;
  lineNumbers: boolean;
  minimap: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveDelay: number; // milliseconds
  formatOnSave: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  highlightActiveLine: boolean;
  matchBrackets: boolean;
  autoCloseBrackets: boolean;
  autoIndent: boolean;
  showInvisibles: boolean;
  smoothScrolling: boolean;
  cursorStyle: 'line' | 'block' | 'underline';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  defaultEncoding: string;
  defaultLineEnding: LineEnding;
}

export interface EditorSession {
  documents: EditorDocument[];
  activeDocumentId: string | null;
  layout: 'single' | 'split-vertical' | 'split-horizontal';
  recentFiles: string[];
}

export interface EditorStats {
  openDocuments: number;
  totalLines: number;
  totalCharacters: number;
  modifiedDocuments: number;
  languageBreakdown: Record<string, number>;
}

// ===========================================================================
// LANGUAGE DEFINITIONS
// ===========================================================================

const LANGUAGES: LanguageConfig[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<', close: '>' },
    ],
  },
  {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyw', '.pyi'],
    lineComment: '#',
    blockComment: { start: '"""', end: '"""' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  },
  {
    id: 'html',
    name: 'HTML',
    extensions: ['.html', '.htm', '.xhtml'],
    blockComment: { start: '<!--', end: '-->' },
    autoClosingPairs: [
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  },
  {
    id: 'css',
    name: 'CSS',
    extensions: ['.css'],
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  },
  {
    id: 'json',
    name: 'JSON',
    extensions: ['.json', '.jsonc'],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
    ],
  },
  {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['.md', '.markdown', '.mdown'],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '`', close: '`' },
      { open: '*', close: '*' },
      { open: '_', close: '_' },
    ],
  },
  {
    id: 'yaml',
    name: 'YAML',
    extensions: ['.yml', '.yaml'],
    lineComment: '#',
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '<', close: '>' },
    ],
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
  },
  {
    id: 'java',
    name: 'Java',
    extensions: ['.java'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '<', close: '>' },
    ],
  },
  {
    id: 'csharp',
    name: 'C#',
    extensions: ['.cs'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '<', close: '>' },
    ],
  },
  {
    id: 'cpp',
    name: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '<', close: '>' },
    ],
  },
  {
    id: 'sql',
    name: 'SQL',
    extensions: ['.sql'],
    lineComment: '--',
    blockComment: { start: '/*', end: '*/' },
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
  },
  {
    id: 'shell',
    name: 'Shell',
    extensions: ['.sh', '.bash', '.zsh'],
    lineComment: '#',
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
  },
  {
    id: 'plaintext',
    name: 'Plain Text',
    extensions: ['.txt', '.text'],
    autoClosingPairs: [],
  },
];

// ===========================================================================
// TEXT CODE EDITOR
// ===========================================================================

class TextCodeEditorClass extends EventEmitter {
  private documents: Map<string, EditorDocument> = new Map();
  private activeDocumentId: string | null = null;
  private config: EditorConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private recentFiles: string[] = [];

  constructor() {
    super();
    this.config = {
      theme: 'dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      tabSize: 2,
      indentStyle: 'spaces',
      lineNumbers: true,
      minimap: false,
      wordWrap: false,
      autoSave: true,
      autoSaveDelay: 1000,
      formatOnSave: false,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
      highlightActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      autoIndent: true,
      showInvisibles: false,
      smoothScrolling: true,
      cursorStyle: 'line',
      cursorBlinking: 'blink',
      defaultEncoding: 'utf-8',
      defaultLineEnding: 'auto',
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'editor');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadConfig();
      await this.loadSession();
      
      log.info(`[Editor] Initialized with ${this.documents.size} open documents`);
    } catch (error) {
      log.error('[Editor] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Document operations
    ipcMain.handle('editor:newDocument', async (_event, language?: string) => {
      return this.newDocument(language);
    });

    ipcMain.handle('editor:openFile', async (_event, filePath: string) => {
      return this.openFile(filePath);
    });

    ipcMain.handle('editor:openDialog', async () => {
      return this.openFileDialog();
    });

    ipcMain.handle('editor:save', async (_event, documentId: string) => {
      return this.save(documentId);
    });

    ipcMain.handle('editor:saveAs', async (_event, documentId: string, filePath?: string) => {
      return this.saveAs(documentId, filePath);
    });

    ipcMain.handle('editor:saveAll', async () => {
      return this.saveAll();
    });

    ipcMain.handle('editor:close', async (_event, documentId: string) => {
      return this.closeDocument(documentId);
    });

    ipcMain.handle('editor:closeAll', async () => {
      return this.closeAll();
    });

    // Content operations
    ipcMain.handle('editor:getDocument', (_event, documentId: string) => {
      return this.getDocument(documentId);
    });

    ipcMain.handle('editor:getDocuments', () => {
      return this.getDocuments();
    });

    ipcMain.handle('editor:setContent', async (_event, documentId: string, content: string) => {
      return this.setContent(documentId, content);
    });

    ipcMain.handle('editor:insertText', async (_event, documentId: string, text: string, position: EditorPosition) => {
      return this.insertText(documentId, text, position);
    });

    ipcMain.handle('editor:deleteText', async (_event, documentId: string, range: EditorSelection) => {
      return this.deleteText(documentId, range);
    });

    ipcMain.handle('editor:replaceText', async (_event, documentId: string, range: EditorSelection, text: string) => {
      return this.replaceText(documentId, range, text);
    });

    // History
    ipcMain.handle('editor:undo', async (_event, documentId: string) => {
      return this.undo(documentId);
    });

    ipcMain.handle('editor:redo', async (_event, documentId: string) => {
      return this.redo(documentId);
    });

    ipcMain.handle('editor:canUndo', (_event, documentId: string) => {
      return this.canUndo(documentId);
    });

    ipcMain.handle('editor:canRedo', (_event, documentId: string) => {
      return this.canRedo(documentId);
    });

    // Active document
    ipcMain.handle('editor:setActive', async (_event, documentId: string) => {
      return this.setActiveDocument(documentId);
    });

    ipcMain.handle('editor:getActive', () => {
      return this.getActiveDocument();
    });

    // Cursor & selection
    ipcMain.handle('editor:setCursor', async (_event, documentId: string, position: EditorPosition) => {
      return this.setCursorPosition(documentId, position);
    });

    ipcMain.handle('editor:setSelection', async (_event, documentId: string, selections: EditorSelection[]) => {
      return this.setSelections(documentId, selections);
    });

    ipcMain.handle('editor:selectAll', async (_event, documentId: string) => {
      return this.selectAll(documentId);
    });

    // Search & replace
    ipcMain.handle('editor:search', async (_event, documentId: string, options: SearchOptions) => {
      return this.search(documentId, options);
    });

    ipcMain.handle('editor:searchAll', async (_event, options: SearchOptions) => {
      return this.searchAll(options);
    });

    ipcMain.handle('editor:replace', async (_event, documentId: string, options: ReplaceOptions) => {
      return this.replace(documentId, options);
    });

    ipcMain.handle('editor:replaceAll', async (_event, documentId: string, options: ReplaceOptions) => {
      return this.replaceAll(documentId, options);
    });

    // Go to
    ipcMain.handle('editor:goToLine', async (_event, documentId: string, line: number) => {
      return this.goToLine(documentId, line);
    });

    ipcMain.handle('editor:goToPosition', async (_event, documentId: string, position: EditorPosition) => {
      return this.goToPosition(documentId, position);
    });

    // Language
    ipcMain.handle('editor:setLanguage', async (_event, documentId: string, language: string) => {
      return this.setLanguage(documentId, language);
    });

    ipcMain.handle('editor:getLanguages', () => {
      return this.getLanguages();
    });

    ipcMain.handle('editor:detectLanguage', (_event, filePath: string) => {
      return this.detectLanguage(filePath);
    });

    // Formatting
    ipcMain.handle('editor:format', async (_event, documentId: string) => {
      return this.formatDocument(documentId);
    });

    ipcMain.handle('editor:indent', async (_event, documentId: string) => {
      return this.indentSelection(documentId);
    });

    ipcMain.handle('editor:outdent', async (_event, documentId: string) => {
      return this.outdentSelection(documentId);
    });

    ipcMain.handle('editor:toggleComment', async (_event, documentId: string) => {
      return this.toggleComment(documentId);
    });

    // Folding
    ipcMain.handle('editor:foldLine', async (_event, documentId: string, line: number) => {
      return this.foldLine(documentId, line);
    });

    ipcMain.handle('editor:unfoldLine', async (_event, documentId: string, line: number) => {
      return this.unfoldLine(documentId, line);
    });

    ipcMain.handle('editor:foldAll', async (_event, documentId: string) => {
      return this.foldAll(documentId);
    });

    ipcMain.handle('editor:unfoldAll', async (_event, documentId: string) => {
      return this.unfoldAll(documentId);
    });

    // Bookmarks
    ipcMain.handle('editor:toggleBookmark', async (_event, documentId: string, line: number) => {
      return this.toggleBookmark(documentId, line);
    });

    ipcMain.handle('editor:getBookmarks', (_event, documentId: string) => {
      return this.getBookmarks(documentId);
    });

    ipcMain.handle('editor:nextBookmark', async (_event, documentId: string) => {
      return this.nextBookmark(documentId);
    });

    ipcMain.handle('editor:prevBookmark', async (_event, documentId: string) => {
      return this.prevBookmark(documentId);
    });

    // Word wrap
    ipcMain.handle('editor:toggleWordWrap', async (_event, documentId: string) => {
      return this.toggleWordWrap(documentId);
    });

    // Encoding & line ending
    ipcMain.handle('editor:setEncoding', async (_event, documentId: string, encoding: string) => {
      return this.setEncoding(documentId, encoding);
    });

    ipcMain.handle('editor:setLineEnding', async (_event, documentId: string, lineEnding: LineEnding) => {
      return this.setLineEnding(documentId, lineEnding);
    });

    // Statistics
    ipcMain.handle('editor:getStats', () => this.getStats());
    ipcMain.handle('editor:getDocumentStats', (_event, documentId: string) => {
      return this.getDocumentStats(documentId);
    });

    // Recent files
    ipcMain.handle('editor:getRecentFiles', () => this.recentFiles);
    ipcMain.handle('editor:clearRecentFiles', async () => {
      this.recentFiles = [];
      await this.saveSession();
      return { success: true };
    });

    // Config
    ipcMain.handle('editor:config', () => this.config);
    ipcMain.handle('editor:setConfig', async (_event, config: Partial<EditorConfig>) => {
      return this.setConfig(config);
    });

    // Sync from renderer
    ipcMain.on('editor:contentChange', (_event, documentId: string, content: string, changes: TextChange[]) => {
      this.handleContentChange(documentId, content, changes);
    });

    ipcMain.on('editor:cursorChange', (_event, documentId: string, position: EditorPosition) => {
      this.handleCursorChange(documentId, position);
    });

    ipcMain.on('editor:selectionChange', (_event, documentId: string, selections: EditorSelection[]) => {
      this.handleSelectionChange(documentId, selections);
    });

    ipcMain.on('editor:scrollChange', (_event, documentId: string, scroll: { x: number; y: number }) => {
      this.handleScrollChange(documentId, scroll);
    });
  }

  // -------------------------------------------------------------------------
  // DOCUMENT OPERATIONS
  // -------------------------------------------------------------------------

  newDocument(language = 'plaintext'): EditorDocument {
    const id = `doc-${++this.idCounter}-${Date.now()}`;

    const doc: EditorDocument = {
      id,
      filename: 'Untitled',
      content: '',
      originalContent: '',
      language,
      encoding: this.config.defaultEncoding,
      lineEnding: this.config.defaultLineEnding,
      isModified: false,
      isReadOnly: false,
      cursorPosition: { line: 1, column: 1 },
      selections: [],
      scrollPosition: { x: 0, y: 0 },
      foldedLines: [],
      bookmarks: [],
      history: { undoStack: [], redoStack: [] },
      createdAt: Date.now(),
      wordWrap: this.config.wordWrap,
    };

    this.documents.set(id, doc);
    this.setActiveDocument(id);

    this.emit('document:created', doc);
    this.notifyRenderer('editor:documentCreated', doc);

    return doc;
  }

  async openFile(filePath: string): Promise<EditorDocument | null> {
    try {
      // Check if already open
      const existing = Array.from(this.documents.values()).find(d => d.path === filePath);
      if (existing) {
        this.setActiveDocument(existing.id);
        return existing;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      const language = this.detectLanguage(filePath);
      const lineEnding = this.detectLineEnding(content);

      const id = `doc-${++this.idCounter}-${Date.now()}`;

      const doc: EditorDocument = {
        id,
        path: filePath,
        filename: path.basename(filePath),
        content,
        originalContent: content,
        language,
        encoding: 'utf-8',
        lineEnding,
        isModified: false,
        isReadOnly: false, // Could check file permissions
        cursorPosition: { line: 1, column: 1 },
        selections: [],
        scrollPosition: { x: 0, y: 0 },
        foldedLines: [],
        bookmarks: [],
        history: { undoStack: [], redoStack: [] },
        createdAt: stats.birthtime.getTime(),
        lastSavedAt: stats.mtime.getTime(),
        wordWrap: this.config.wordWrap,
      };

      this.documents.set(id, doc);
      this.setActiveDocument(id);
      this.addToRecentFiles(filePath);

      this.emit('document:opened', doc);
      this.notifyRenderer('editor:documentOpened', doc);

      return doc;
    } catch (error) {
      log.error(`[Editor] Failed to open file ${filePath}:`, error);
      return null;
    }
  }

  async openFileDialog(): Promise<string[]> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'JavaScript', extensions: ['js', 'mjs', 'cjs'] },
        { name: 'TypeScript', extensions: ['ts', 'tsx'] },
        { name: 'Python', extensions: ['py'] },
        { name: 'Text', extensions: ['txt', 'md'] },
      ],
    });

    if (!result.canceled) {
      for (const filePath of result.filePaths) {
        await this.openFile(filePath);
      }
      return result.filePaths;
    }

    return [];
  }

  async save(documentId: string): Promise<{ success: boolean; path?: string }> {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    if (!doc.path) {
      return this.saveAs(documentId);
    }

    try {
      let content = doc.content;

      // Apply save settings
      if (this.config.trimTrailingWhitespace) {
        content = this.trimTrailingWhitespace(content);
      }
      if (this.config.insertFinalNewline && !content.endsWith('\n')) {
        content += '\n';
      }

      // Normalize line endings
      content = this.normalizeLineEndings(content, doc.lineEnding);

      await fs.writeFile(doc.path, content, doc.encoding as BufferEncoding);
      
      doc.content = content;
      doc.originalContent = content;
      doc.isModified = false;
      doc.lastSavedAt = Date.now();
      doc.history.savedAt = Date.now();

      this.emit('document:saved', doc);
      this.notifyRenderer('editor:documentSaved', { id: documentId, path: doc.path });

      return { success: true, path: doc.path };
    } catch (error) {
      log.error(`[Editor] Failed to save ${doc.path}:`, error);
      return { success: false };
    }
  }

  async saveAs(documentId: string, filePath?: string): Promise<{ success: boolean; path?: string }> {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    if (!filePath) {
      const result = await dialog.showSaveDialog({
        defaultPath: doc.filename,
        filters: [
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      filePath = result.filePath;
    }

    doc.path = filePath;
    doc.filename = path.basename(filePath);
    doc.language = this.detectLanguage(filePath);

    return this.save(documentId);
  }

  async saveAll(): Promise<{ saved: number; failed: number }> {
    let saved = 0;
    let failed = 0;

    for (const doc of this.documents.values()) {
      if (doc.isModified) {
        const result = await this.save(doc.id);
        if (result.success) saved++;
        else failed++;
      }
    }

    return { saved, failed };
  }

  async closeDocument(documentId: string): Promise<{ success: boolean; cancelled?: boolean }> {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    if (doc.isModified) {
      const response = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Do you want to save changes to ${doc.filename}?`,
      });

      if (response.response === 0) {
        const result = await this.save(documentId);
        if (!result.success) return { success: false };
      } else if (response.response === 2) {
        return { success: false, cancelled: true };
      }
    }

    // Clear auto-save timer
    const timer = this.autoSaveTimers.get(documentId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(documentId);
    }

    this.documents.delete(documentId);

    // Set new active document
    if (this.activeDocumentId === documentId) {
      const remaining = Array.from(this.documents.keys());
      this.activeDocumentId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }

    this.emit('document:closed', documentId);
    this.notifyRenderer('editor:documentClosed', documentId);

    return { success: true };
  }

  async closeAll(): Promise<{ success: boolean; cancelled?: boolean }> {
    for (const doc of Array.from(this.documents.values())) {
      const result = await this.closeDocument(doc.id);
      if (result.cancelled) {
        return { success: false, cancelled: true };
      }
    }
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // CONTENT OPERATIONS
  // -------------------------------------------------------------------------

  getDocument(documentId: string): EditorDocument | null {
    return this.documents.get(documentId) || null;
  }

  getDocuments(): EditorDocument[] {
    return Array.from(this.documents.values());
  }

  setContent(documentId: string, content: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    this.addHistoryEntry(doc, [{
      type: 'replace',
      range: {
        start: { line: 1, column: 1 },
        end: this.getEndPosition(doc.content),
      },
      text: content,
      replacedText: doc.content,
    }]);

    doc.content = content;
    doc.isModified = content !== doc.originalContent;

    this.scheduleAutoSave(documentId);
    this.emit('document:changed', doc);

    return { success: true };
  }

  insertText(documentId: string, text: string, position: EditorPosition): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const lines = doc.content.split('\n');
    const lineIndex = position.line - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) return { success: false };

    const line = lines[lineIndex];
    const colIndex = position.column - 1;
    
    lines[lineIndex] = line.slice(0, colIndex) + text + line.slice(colIndex);
    
    const newContent = lines.join('\n');

    this.addHistoryEntry(doc, [{
      type: 'insert',
      range: { start: position, end: position },
      text,
    }]);

    doc.content = newContent;
    doc.isModified = true;

    this.scheduleAutoSave(documentId);
    this.emit('document:changed', doc);

    return { success: true };
  }

  deleteText(documentId: string, range: EditorSelection): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const deletedText = this.getTextInRange(doc.content, range);
    const newContent = this.deleteRange(doc.content, range);

    this.addHistoryEntry(doc, [{
      type: 'delete',
      range,
      text: deletedText,
    }]);

    doc.content = newContent;
    doc.isModified = true;

    this.scheduleAutoSave(documentId);
    this.emit('document:changed', doc);

    return { success: true };
  }

  replaceText(documentId: string, range: EditorSelection, text: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const replacedText = this.getTextInRange(doc.content, range);
    const newContent = this.replaceRange(doc.content, range, text);

    this.addHistoryEntry(doc, [{
      type: 'replace',
      range,
      text,
      replacedText,
    }]);

    doc.content = newContent;
    doc.isModified = true;

    this.scheduleAutoSave(documentId);
    this.emit('document:changed', doc);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // HISTORY (UNDO/REDO)
  // -------------------------------------------------------------------------

  private addHistoryEntry(doc: EditorDocument, changes: TextChange[]): void {
    const entry: HistoryEntry = {
      timestamp: Date.now(),
      changes,
      cursorBefore: { ...doc.cursorPosition },
      cursorAfter: { ...doc.cursorPosition },
    };

    doc.history.undoStack.push(entry);
    doc.history.redoStack = []; // Clear redo on new change

    // Limit history size
    if (doc.history.undoStack.length > 1000) {
      doc.history.undoStack.shift();
    }
  }

  undo(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.history.undoStack.length === 0) {
      return { success: false };
    }

    const entry = doc.history.undoStack.pop()!;
    doc.history.redoStack.push(entry);

    // Reverse the changes
    for (const change of entry.changes.reverse()) {
      if (change.type === 'insert') {
        const endPos = this.calculateEndPosition(change.range.start, change.text);
        doc.content = this.deleteRange(doc.content, {
          start: change.range.start,
          end: endPos,
        });
      } else if (change.type === 'delete') {
        doc.content = this.insertAt(doc.content, change.range.start, change.text);
      } else if (change.type === 'replace' && change.replacedText !== undefined) {
        const endPos = this.calculateEndPosition(change.range.start, change.text);
        doc.content = this.replaceRange(doc.content, {
          start: change.range.start,
          end: endPos,
        }, change.replacedText);
      }
    }

    doc.cursorPosition = entry.cursorBefore;
    doc.isModified = doc.content !== doc.originalContent;

    this.notifyRenderer('editor:contentChanged', { id: documentId, content: doc.content });
    this.emit('document:changed', doc);

    return { success: true };
  }

  redo(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.history.redoStack.length === 0) {
      return { success: false };
    }

    const entry = doc.history.redoStack.pop()!;
    doc.history.undoStack.push(entry);

    // Apply the changes
    for (const change of entry.changes) {
      if (change.type === 'insert') {
        doc.content = this.insertAt(doc.content, change.range.start, change.text);
      } else if (change.type === 'delete') {
        doc.content = this.deleteRange(doc.content, change.range);
      } else if (change.type === 'replace') {
        doc.content = this.replaceRange(doc.content, change.range, change.text);
      }
    }

    doc.cursorPosition = entry.cursorAfter;
    doc.isModified = doc.content !== doc.originalContent;

    this.notifyRenderer('editor:contentChanged', { id: documentId, content: doc.content });
    this.emit('document:changed', doc);

    return { success: true };
  }

  canUndo(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    return doc ? doc.history.undoStack.length > 0 : false;
  }

  canRedo(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    return doc ? doc.history.redoStack.length > 0 : false;
  }

  // -------------------------------------------------------------------------
  // ACTIVE DOCUMENT
  // -------------------------------------------------------------------------

  setActiveDocument(documentId: string): { success: boolean } {
    if (!this.documents.has(documentId)) return { success: false };

    this.activeDocumentId = documentId;
    this.emit('document:activated', documentId);
    this.notifyRenderer('editor:activeChanged', documentId);

    return { success: true };
  }

  getActiveDocument(): EditorDocument | null {
    if (!this.activeDocumentId) return null;
    return this.documents.get(this.activeDocumentId) || null;
  }

  // -------------------------------------------------------------------------
  // CURSOR & SELECTION
  // -------------------------------------------------------------------------

  setCursorPosition(documentId: string, position: EditorPosition): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.cursorPosition = position;
    return { success: true };
  }

  setSelections(documentId: string, selections: EditorSelection[]): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.selections = selections;
    return { success: true };
  }

  selectAll(documentId: string): { success: boolean; selection?: EditorSelection } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    const selection: EditorSelection = {
      start: { line: 1, column: 1 },
      end: this.getEndPosition(doc.content),
    };

    doc.selections = [selection];
    this.notifyRenderer('editor:selectionChanged', { id: documentId, selections: [selection] });

    return { success: true, selection };
  }

  // -------------------------------------------------------------------------
  // SEARCH & REPLACE
  // -------------------------------------------------------------------------

  search(documentId: string, options: SearchOptions): SearchResult[] {
    const doc = this.documents.get(documentId);
    if (!doc) return [];

    return this.findMatches(doc.content, options);
  }

  searchAll(options: SearchOptions): { documentId: string; results: SearchResult[] }[] {
    const results: { documentId: string; results: SearchResult[] }[] = [];

    for (const doc of this.documents.values()) {
      const matches = this.findMatches(doc.content, options);
      if (matches.length > 0) {
        results.push({ documentId: doc.id, results: matches });
      }
    }

    return results;
  }

  private findMatches(content: string, options: SearchOptions): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = content.split('\n');
    
    let pattern: RegExp;
    
    if (options.regex) {
      try {
        pattern = new RegExp(options.query, options.caseSensitive ? 'g' : 'gi');
      } catch {
        return [];
      }
    } else {
      let query = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (options.wholeWord) {
        query = `\\b${query}\\b`;
      }
      pattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    }

    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = pattern.exec(lines[i])) !== null) {
        results.push({
          line: i + 1,
          column: match.index + 1,
          length: match[0].length,
          text: match[0],
          preview: lines[i].trim().slice(0, 100),
        });
      }
    }

    return results;
  }

  replace(documentId: string, options: ReplaceOptions): { success: boolean; replaced: number } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false, replaced: 0 };

    const results = this.findMatches(doc.content, options);
    if (results.length === 0) return { success: true, replaced: 0 };

    // Replace first match
    const match = results[0];
    const range: EditorSelection = {
      start: { line: match.line, column: match.column },
      end: { line: match.line, column: match.column + match.length },
    };

    this.replaceText(documentId, range, options.replacement);

    return { success: true, replaced: 1 };
  }

  replaceAll(documentId: string, options: ReplaceOptions): { success: boolean; replaced: number } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false, replaced: 0 };

    let pattern: RegExp;
    
    if (options.regex) {
      try {
        pattern = new RegExp(options.query, options.caseSensitive ? 'g' : 'gi');
      } catch {
        return { success: false, replaced: 0 };
      }
    } else {
      let query = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (options.wholeWord) {
        query = `\\b${query}\\b`;
      }
      pattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    }

    const newContent = doc.content.replace(pattern, options.replacement);
    const matchCount = (doc.content.match(pattern) || []).length;

    if (matchCount > 0) {
      this.setContent(documentId, newContent);
    }

    return { success: true, replaced: matchCount };
  }

  // -------------------------------------------------------------------------
  // GO TO
  // -------------------------------------------------------------------------

  goToLine(documentId: string, line: number): { success: boolean } {
    return this.goToPosition(documentId, { line, column: 1 });
  }

  goToPosition(documentId: string, position: EditorPosition): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.cursorPosition = position;
    doc.selections = [];

    this.notifyRenderer('editor:goTo', { id: documentId, position });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // LANGUAGE
  // -------------------------------------------------------------------------

  setLanguage(documentId: string, language: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.language = language;
    this.notifyRenderer('editor:languageChanged', { id: documentId, language });

    return { success: true };
  }

  getLanguages(): LanguageConfig[] {
    return LANGUAGES;
  }

  detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    for (const lang of LANGUAGES) {
      if (lang.extensions.includes(ext)) {
        return lang.id;
      }
    }

    return 'plaintext';
  }

  // -------------------------------------------------------------------------
  // FORMATTING
  // -------------------------------------------------------------------------

  formatDocument(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    // Basic formatting - could integrate with prettier, etc.
    let content = doc.content;

    // Trim trailing whitespace
    content = this.trimTrailingWhitespace(content);

    // Normalize indentation
    content = this.normalizeIndentation(content, doc.language);

    if (content !== doc.content) {
      this.setContent(documentId, content);
    }

    return { success: true };
  }

  indentSelection(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const indent = this.config.indentStyle === 'tabs' 
      ? '\t' 
      : ' '.repeat(this.config.tabSize);

    // Indent selected lines or current line
    const lines = doc.content.split('\n');
    const startLine = doc.selections.length > 0 
      ? Math.min(...doc.selections.map(s => s.start.line))
      : doc.cursorPosition.line;
    const endLine = doc.selections.length > 0 
      ? Math.max(...doc.selections.map(s => s.end.line))
      : doc.cursorPosition.line;

    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      lines[i] = indent + lines[i];
    }

    this.setContent(documentId, lines.join('\n'));
    return { success: true };
  }

  outdentSelection(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const tabSize = this.config.tabSize;
    const lines = doc.content.split('\n');
    const startLine = doc.selections.length > 0 
      ? Math.min(...doc.selections.map(s => s.start.line))
      : doc.cursorPosition.line;
    const endLine = doc.selections.length > 0 
      ? Math.max(...doc.selections.map(s => s.end.line))
      : doc.cursorPosition.line;

    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      if (lines[i].startsWith('\t')) {
        lines[i] = lines[i].slice(1);
      } else {
        const spaces = lines[i].match(/^ +/);
        if (spaces) {
          const removeCount = Math.min(spaces[0].length, tabSize);
          lines[i] = lines[i].slice(removeCount);
        }
      }
    }

    this.setContent(documentId, lines.join('\n'));
    return { success: true };
  }

  toggleComment(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.isReadOnly) return { success: false };

    const langConfig = LANGUAGES.find(l => l.id === doc.language);
    if (!langConfig?.lineComment) return { success: false };

    const comment = langConfig.lineComment + ' ';
    const lines = doc.content.split('\n');
    const startLine = doc.selections.length > 0 
      ? Math.min(...doc.selections.map(s => s.start.line))
      : doc.cursorPosition.line;
    const endLine = doc.selections.length > 0 
      ? Math.max(...doc.selections.map(s => s.end.line))
      : doc.cursorPosition.line;

    // Check if all lines are commented
    const allCommented = lines.slice(startLine - 1, endLine).every(line => {
      const trimmed = line.trim();
      return trimmed.startsWith(langConfig.lineComment!);
    });

    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      if (allCommented) {
        // Remove comment
        lines[i] = lines[i].replace(new RegExp(`^(\\s*)${langConfig.lineComment}\\s?`), '$1');
      } else {
        // Add comment
        const match = lines[i].match(/^(\s*)/);
        const indent = match ? match[1] : '';
        lines[i] = indent + comment + lines[i].slice(indent.length);
      }
    }

    this.setContent(documentId, lines.join('\n'));
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // FOLDING
  // -------------------------------------------------------------------------

  foldLine(documentId: string, line: number): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    if (!doc.foldedLines.includes(line)) {
      doc.foldedLines.push(line);
      doc.foldedLines.sort((a, b) => a - b);
    }

    this.notifyRenderer('editor:foldChanged', { id: documentId, foldedLines: doc.foldedLines });
    return { success: true };
  }

  unfoldLine(documentId: string, line: number): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.foldedLines = doc.foldedLines.filter(l => l !== line);

    this.notifyRenderer('editor:foldChanged', { id: documentId, foldedLines: doc.foldedLines });
    return { success: true };
  }

  foldAll(documentId: string): { success: boolean } {
    // Would need to implement code folding detection
    return { success: true };
  }

  unfoldAll(documentId: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.foldedLines = [];
    this.notifyRenderer('editor:foldChanged', { id: documentId, foldedLines: [] });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // BOOKMARKS
  // -------------------------------------------------------------------------

  toggleBookmark(documentId: string, line: number): { success: boolean; bookmarked: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false, bookmarked: false };

    const index = doc.bookmarks.indexOf(line);
    if (index >= 0) {
      doc.bookmarks.splice(index, 1);
      return { success: true, bookmarked: false };
    } else {
      doc.bookmarks.push(line);
      doc.bookmarks.sort((a, b) => a - b);
      return { success: true, bookmarked: true };
    }
  }

  getBookmarks(documentId: string): number[] {
    const doc = this.documents.get(documentId);
    return doc ? doc.bookmarks : [];
  }

  nextBookmark(documentId: string): { success: boolean; line?: number } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.bookmarks.length === 0) return { success: false };

    const currentLine = doc.cursorPosition.line;
    const nextBookmark = doc.bookmarks.find(b => b > currentLine) || doc.bookmarks[0];

    this.goToLine(documentId, nextBookmark);
    return { success: true, line: nextBookmark };
  }

  prevBookmark(documentId: string): { success: boolean; line?: number } {
    const doc = this.documents.get(documentId);
    if (!doc || doc.bookmarks.length === 0) return { success: false };

    const currentLine = doc.cursorPosition.line;
    const prevBookmark = [...doc.bookmarks].reverse().find(b => b < currentLine) 
      || doc.bookmarks[doc.bookmarks.length - 1];

    this.goToLine(documentId, prevBookmark);
    return { success: true, line: prevBookmark };
  }

  // -------------------------------------------------------------------------
  // WORD WRAP & ENCODING
  // -------------------------------------------------------------------------

  toggleWordWrap(documentId: string): { success: boolean; enabled: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false, enabled: false };

    doc.wordWrap = !doc.wordWrap;
    this.notifyRenderer('editor:wordWrapChanged', { id: documentId, enabled: doc.wordWrap });

    return { success: true, enabled: doc.wordWrap };
  }

  setEncoding(documentId: string, encoding: string): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.encoding = encoding;
    return { success: true };
  }

  setLineEnding(documentId: string, lineEnding: LineEnding): { success: boolean } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };

    doc.lineEnding = lineEnding;
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  getStats(): EditorStats {
    const docs = Array.from(this.documents.values());
    const languageBreakdown: Record<string, number> = {};

    let totalLines = 0;
    let totalCharacters = 0;
    let modifiedCount = 0;

    for (const doc of docs) {
      totalLines += doc.content.split('\n').length;
      totalCharacters += doc.content.length;
      if (doc.isModified) modifiedCount++;
      languageBreakdown[doc.language] = (languageBreakdown[doc.language] || 0) + 1;
    }

    return {
      openDocuments: docs.length,
      totalLines,
      totalCharacters,
      modifiedDocuments: modifiedCount,
      languageBreakdown,
    };
  }

  getDocumentStats(documentId: string): {
    lines: number;
    words: number;
    characters: number;
    selected: number;
  } | null {
    const doc = this.documents.get(documentId);
    if (!doc) return null;

    const lines = doc.content.split('\n').length;
    const words = doc.content.split(/\s+/).filter(w => w.length > 0).length;
    const characters = doc.content.length;
    
    let selected = 0;
    for (const sel of doc.selections) {
      selected += this.getTextInRange(doc.content, sel).length;
    }

    return { lines, words, characters, selected };
  }

  // -------------------------------------------------------------------------
  // SYNC HANDLERS
  // -------------------------------------------------------------------------

  private handleContentChange(documentId: string, content: string, changes: TextChange[]): void {
    const doc = this.documents.get(documentId);
    if (!doc) return;

    if (changes.length > 0) {
      this.addHistoryEntry(doc, changes);
    }

    doc.content = content;
    doc.isModified = content !== doc.originalContent;

    this.scheduleAutoSave(documentId);
    this.emit('document:changed', doc);
  }

  private handleCursorChange(documentId: string, position: EditorPosition): void {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.cursorPosition = position;
    }
  }

  private handleSelectionChange(documentId: string, selections: EditorSelection[]): void {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.selections = selections;
    }
  }

  private handleScrollChange(documentId: string, scroll: { x: number; y: number }): void {
    const doc = this.documents.get(documentId);
    if (doc) {
      doc.scrollPosition = scroll;
    }
  }

  // -------------------------------------------------------------------------
  // AUTO SAVE
  // -------------------------------------------------------------------------

  private scheduleAutoSave(documentId: string): void {
    if (!this.config.autoSave) return;

    const doc = this.documents.get(documentId);
    if (!doc?.path) return;

    // Clear existing timer
    const existingTimer = this.autoSaveTimers.get(documentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new save
    const timer = setTimeout(() => {
      this.save(documentId);
      this.autoSaveTimers.delete(documentId);
    }, this.config.autoSaveDelay);

    this.autoSaveTimers.set(documentId, timer);
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private getEndPosition(content: string): EditorPosition {
    const lines = content.split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  private getTextInRange(content: string, range: EditorSelection): string {
    const lines = content.split('\n');
    
    if (range.start.line === range.end.line) {
      return lines[range.start.line - 1].slice(range.start.column - 1, range.end.column - 1);
    }

    const result: string[] = [];
    result.push(lines[range.start.line - 1].slice(range.start.column - 1));
    
    for (let i = range.start.line; i < range.end.line - 1; i++) {
      result.push(lines[i]);
    }
    
    result.push(lines[range.end.line - 1].slice(0, range.end.column - 1));

    return result.join('\n');
  }

  private deleteRange(content: string, range: EditorSelection): string {
    const lines = content.split('\n');
    
    const before = lines.slice(0, range.start.line - 1);
    const startLine = lines[range.start.line - 1].slice(0, range.start.column - 1);
    const endLine = lines[range.end.line - 1].slice(range.end.column - 1);
    const after = lines.slice(range.end.line);

    return [...before, startLine + endLine, ...after].join('\n');
  }

  private replaceRange(content: string, range: EditorSelection, text: string): string {
    const lines = content.split('\n');
    
    const before = lines.slice(0, range.start.line - 1);
    const startLine = lines[range.start.line - 1].slice(0, range.start.column - 1);
    const endLine = lines[range.end.line - 1].slice(range.end.column - 1);
    const after = lines.slice(range.end.line);

    return [...before, startLine + text + endLine, ...after].join('\n');
  }

  private insertAt(content: string, position: EditorPosition, text: string): string {
    const lines = content.split('\n');
    const line = lines[position.line - 1];
    lines[position.line - 1] = line.slice(0, position.column - 1) + text + line.slice(position.column - 1);
    return lines.join('\n');
  }

  private calculateEndPosition(start: EditorPosition, text: string): EditorPosition {
    const lines = text.split('\n');
    
    if (lines.length === 1) {
      return { line: start.line, column: start.column + text.length };
    }

    return {
      line: start.line + lines.length - 1,
      column: lines[lines.length - 1].length + 1,
    };
  }

  private trimTrailingWhitespace(content: string): string {
    return content.split('\n').map(line => line.trimEnd()).join('\n');
  }

  private normalizeLineEndings(content: string, lineEnding: LineEnding): string {
    // First normalize to LF
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    if (lineEnding === 'crlf') {
      return content.replace(/\n/g, '\r\n');
    }
    
    return content;
  }

  private detectLineEnding(content: string): LineEnding {
    const crlf = (content.match(/\r\n/g) || []).length;
    const lf = (content.match(/(?<!\r)\n/g) || []).length;
    
    return crlf > lf ? 'crlf' : 'lf';
  }

  private normalizeIndentation(content: string, language: string): string {
    // Basic indentation normalization
    return content;
  }

  private addToRecentFiles(filePath: string): void {
    this.recentFiles = this.recentFiles.filter(f => f !== filePath);
    this.recentFiles.unshift(filePath);
    this.recentFiles = this.recentFiles.slice(0, 20);
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async setConfig(config: Partial<EditorConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    this.notifyRenderer('editor:configChanged', this.config);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[Editor] Failed to save config:', error);
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const sessionPath = path.join(this.dataPath, 'session.json');
      const data = await fs.readFile(sessionPath, 'utf-8');
      const session = JSON.parse(data) as { recentFiles: string[] };
      this.recentFiles = session.recentFiles || [];
    } catch {
      // No session
    }
  }

  private async saveSession(): Promise<void> {
    try {
      const sessionPath = path.join(this.dataPath, 'session.json');
      await fs.writeFile(sessionPath, JSON.stringify({
        recentFiles: this.recentFiles,
      }, null, 2));
    } catch (error) {
      log.error('[Editor] Failed to save session:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Clear all auto-save timers
    for (const timer of this.autoSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.autoSaveTimers.clear();

    await this.saveConfig();
    await this.saveSession();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const TextCodeEditor = new TextCodeEditorClass();
export default TextCodeEditor;
