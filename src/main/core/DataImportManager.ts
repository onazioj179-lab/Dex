// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import log from 'electron-log';

type ImportSource =
  | 'apple_notes'
  | 'obsidian'
  | 'notion'
  | 'todoist'
  | 'markdown'
  | 'plain_text';

interface ImportSourceInfo {
  id: ImportSource;
  name: string;
  description: string;
  accepts: string[];
  extensions: string[];
}

interface ImportItem {
  id: string;
  title: string;
  content: string;
  type: 'note' | 'task';
  tags: string[];
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
  selected: boolean;
}

interface ImportPreview {
  source: ImportSource;
  items: ImportItem[];
  totalCount: number;
  warnings: string[];
}

interface ImportResult {
  importedNotes: number;
  importedTasks: number;
  skipped: number;
  errors: string[];
}

const IMPORT_SOURCES: ImportSourceInfo[] = [
  {
    id: 'apple_notes',
    name: 'Apple Notes',
    description: 'Import from Apple Notes export (HTML files)',
    accepts: ['text/html'],
    extensions: ['.html', '.htm']
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Import a folder of Obsidian markdown vault files',
    accepts: ['text/markdown'],
    extensions: ['.md']
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Import a Notion export folder (markdown and CSV)',
    accepts: ['text/markdown', 'text/csv'],
    extensions: ['.md', '.csv']
  },
  {
    id: 'todoist',
    name: 'Todoist',
    description: 'Import tasks from a Todoist CSV export',
    accepts: ['text/csv'],
    extensions: ['.csv']
  },
  {
    id: 'markdown',
    name: 'Markdown Files',
    description: 'Import one or more markdown files as notes',
    accepts: ['text/markdown'],
    extensions: ['.md', '.markdown', '.mdown']
  },
  {
    id: 'plain_text',
    name: 'Plain Text',
    description: 'Import plain text files as notes',
    accepts: ['text/plain'],
    extensions: ['.txt']
  }
];

function generateId(): string {
  return crypto.randomUUID();
}

function stripHtml(html: string): string {
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, _l, c) => {
    return '\n' + c.replace(/<[^>]+>/g, '') + '\n';
  });
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function extractTitleFromContent(content: string, fallbackName: string): string {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.startsWith('#')) {
    return firstLine.replace(/^#+\s*/, '');
  }
  if (firstLine.length > 0 && firstLine.length < 200) {
    return firstLine;
  }
  return fallbackName;
}

function parseObsidianTags(content: string): string[] {
  const tagRegex = /#([a-zA-Z0-9_/-]+)/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1];
    if (!tag.match(/^\d+$/)) {
      tags.push(tag);
    }
  }
  return [...new Set(tags)];
}

function parseObsidianFrontmatter(content: string): { metadata: Record<string, any>; body: string } {
  if (!content.startsWith('---')) {
    return { metadata: {}, body: content };
  }
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { metadata: {}, body: content };
  }
  const frontmatter = content.substring(3, endIndex).trim();
  const metadata: Record<string, any> = {};
  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }
  const body = content.substring(endIndex + 3).trim();
  return { metadata, body };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseAppleNotesHtml(html: string, filename: string): ImportItem {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.(html|htm)$/i, '');
  const content = stripHtml(html);
  return {
    id: generateId(),
    title,
    content,
    type: 'note',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { source: 'apple_notes' },
    selected: true
  };
}

function parseObsidianFile(content: string, filename: string): ImportItem {
  const { metadata, body } = parseObsidianFrontmatter(content);
  const tags = parseObsidianTags(body);
  const title = metadata.title || extractTitleFromContent(body, filename.replace(/\.md$/i, ''));
  return {
    id: generateId(),
    title,
    content: body,
    type: 'note',
    tags,
    created_at: metadata.created || new Date().toISOString(),
    updated_at: metadata.updated || new Date().toISOString(),
    metadata: { source: 'obsidian', ...metadata },
    selected: true
  };
}

function parseNotionExport(content: string, filename: string): ImportItem {
  const { metadata, body } = parseObsidianFrontmatter(content);
  const title = extractTitleFromContent(body, filename.replace(/\.md$/i, ''));
  return {
    id: generateId(),
    title,
    content: body,
    type: 'note',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { source: 'notion', ...metadata },
    selected: true
  };
}

function parseTodoistCsv(csvContent: string): ImportItem[] {
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const contentIdx = headers.indexOf('content');
  const descIdx = headers.indexOf('description');
  const priorityIdx = headers.indexOf('priority');
  const dueDateIdx = headers.indexOf('due date');
  const labelsIdx = headers.indexOf('labels');

  const items: ImportItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length === 0) continue;
    const title = contentIdx >= 0 ? fields[contentIdx] : fields[0];
    if (!title || title.trim().length === 0) continue;
    const description = descIdx >= 0 ? fields[descIdx] : '';
    const priority = priorityIdx >= 0 ? fields[priorityIdx] : '';
    const dueDate = dueDateIdx >= 0 ? fields[dueDateIdx] : '';
    const labels = labelsIdx >= 0 ? fields[labelsIdx].split(',').map(l => l.trim()).filter(Boolean) : [];

    items.push({
      id: generateId(),
      title: title.trim(),
      content: description,
      type: 'task',
      tags: labels,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { source: 'todoist', priority, dueDate },
      selected: true
    });
  }
  return items;
}

function parseMarkdownFile(content: string, filename: string): ImportItem {
  const title = extractTitleFromContent(content, filename.replace(/\.(md|markdown|mdown)$/i, ''));
  return {
    id: generateId(),
    title,
    content,
    type: 'note',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { source: 'markdown' },
    selected: true
  };
}

function parsePlainTextFile(content: string, filename: string): ImportItem {
  const title = extractTitleFromContent(content, filename.replace(/\.txt$/i, ''));
  return {
    id: generateId(),
    title,
    content,
    type: 'note',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { source: 'plain_text' },
    selected: true
  };
}

function collectFilesFromDir(dirPath: string, extensions: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesFromDir(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

export class DataImportManager {
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    this.mainWindow = mainWindow || null;
    this.setupIPC();
    this.initialized = true;
    log.info('[DataImportManager] Initialized');
  }

  getSources(): ImportSourceInfo[] {
    return [...IMPORT_SOURCES];
  }

  async selectFiles(source: ImportSource): Promise<string[]> {
    const sourceInfo = IMPORT_SOURCES.find(s => s.id === source);
    if (!sourceInfo) return [];

    if (source === 'obsidian' || source === 'notion') {
      const result = await dialog.showOpenDialog(this.mainWindow || BrowserWindow.getFocusedWindow()!, {
        properties: ['openDirectory'],
        title: `Select ${sourceInfo.name} folder`
      });
      if (result.canceled || result.filePaths.length === 0) return [];
      return collectFilesFromDir(result.filePaths[0], sourceInfo.extensions);
    }

    const result = await dialog.showOpenDialog(this.mainWindow || BrowserWindow.getFocusedWindow()!, {
      properties: ['openFile', 'multiSelections'],
      title: `Select ${sourceInfo.name} files`,
      filters: [{ name: sourceInfo.name, extensions: sourceInfo.extensions.map(e => e.substring(1)) }]
    });
    if (result.canceled) return [];
    return result.filePaths;
  }

  async preview(source: ImportSource, filePaths: string[]): Promise<ImportPreview> {
    const items: ImportItem[] = [];
    const warnings: string[] = [];

    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const filename = path.basename(filePath);

        switch (source) {
          case 'apple_notes':
            items.push(parseAppleNotesHtml(content, filename));
            break;
          case 'obsidian':
            items.push(parseObsidianFile(content, filename));
            break;
          case 'notion':
            if (filename.endsWith('.csv')) {
              warnings.push(`Skipped CSV file: ${filename} (only markdown files are imported from Notion exports)`);
            } else {
              items.push(parseNotionExport(content, filename));
            }
            break;
          case 'todoist':
            items.push(...parseTodoistCsv(content));
            break;
          case 'markdown':
            items.push(parseMarkdownFile(content, filename));
            break;
          case 'plain_text':
            items.push(parsePlainTextFile(content, filename));
            break;
        }
      } catch (err: any) {
        warnings.push(`Failed to parse ${path.basename(filePath)}: ${err.message}`);
      }
    }

    return {
      source,
      items,
      totalCount: items.length,
      warnings
    };
  }

  async executeImport(items: ImportItem[]): Promise<ImportResult> {
    let importedNotes = 0;
    let importedTasks = 0;
    let skipped = 0;
    const errors: string[] = [];

    const selectedItems = items.filter(item => item.selected);

    for (const item of selectedItems) {
      try {
        if (item.type === 'note') {
          const noteId = item.id;
          const noteData = {
            id: noteId,
            title: item.title,
            content: item.content,
            tags: item.tags,
            created_at: item.created_at,
            updated_at: item.updated_at,
            source: item.metadata.source
          };

          if (this.mainWindow) {
            this.mainWindow.webContents.send('import:note-created', noteData);
          }
          importedNotes++;
        } else if (item.type === 'task') {
          const taskData = {
            id: item.id,
            title: item.title,
            description: item.content,
            tags: item.tags,
            dueDate: item.metadata.dueDate || null,
            priority: item.metadata.priority || 'medium',
            source: item.metadata.source
          };

          if (this.mainWindow) {
            this.mainWindow.webContents.send('import:task-created', taskData);
          }
          importedTasks++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`Failed to import "${item.title}": ${err.message}`);
      }
    }

    const totalSkipped = items.length - selectedItems.length + skipped;

    log.info(
      `[DataImportManager] Import complete. Notes: ${importedNotes}, Tasks: ${importedTasks}, Skipped: ${totalSkipped}, Errors: ${errors.length}`
    );

    return { importedNotes, importedTasks, skipped: totalSkipped, errors };
  }

  private setupIPC(): void {
    ipcMain.handle('import:get-sources', () => this.getSources());
    ipcMain.handle('import:select-files', (_e, source: ImportSource) => {
      return this.selectFiles(source);
    });
    ipcMain.handle('import:preview', (_e, source: ImportSource, filePaths: string[]) => {
      return this.preview(source, filePaths);
    });
    ipcMain.handle('import:execute', (_e, items: ImportItem[]) => {
      return this.executeImport(items);
    });
  }

  destroy(): void {
    this.mainWindow = null;
    this.initialized = false;
    log.info('[DataImportManager] Destroyed');
  }
}

export const dataImportManager = new DataImportManager();
