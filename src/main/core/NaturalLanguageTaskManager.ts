// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Natural Language Task Creator Manager (Feature 37)
// Parse natural language input to create tasks with dates, tags, priority.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface ParsedTask {
  title: string;
  dueDate: string | null;
  tags: string[];
  priority: string;
  app: string;
  assignee: string;
  notes: string;
}

// Date pattern keywords
const DATE_PATTERNS: Array<{ pattern: RegExp; resolve: () => string }> = [
  { pattern: /\b(?:today)\b/i, resolve: () => new Date().toISOString().split('T')[0] },
  { pattern: /\b(?:tomorrow)\b/i, resolve: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; } },
  { pattern: /\b(?:next\s+week)\b/i, resolve: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; } },
  { pattern: /\b(?:next\s+month)\b/i, resolve: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]; } },
  { pattern: /\b(?:next\s+monday)\b/i, resolve: () => nextDayOfWeek(1) },
  { pattern: /\b(?:next\s+tuesday)\b/i, resolve: () => nextDayOfWeek(2) },
  { pattern: /\b(?:next\s+wednesday)\b/i, resolve: () => nextDayOfWeek(3) },
  { pattern: /\b(?:next\s+thursday)\b/i, resolve: () => nextDayOfWeek(4) },
  { pattern: /\b(?:next\s+friday)\b/i, resolve: () => nextDayOfWeek(5) },
  { pattern: /\b(?:next\s+saturday)\b/i, resolve: () => nextDayOfWeek(6) },
  { pattern: /\b(?:next\s+sunday)\b/i, resolve: () => nextDayOfWeek(0) },
  { pattern: /\bin\s+(\d+)\s+days?\b/i, resolve: () => '' }, // handled in code
  { pattern: /\bin\s+(\d+)\s+weeks?\b/i, resolve: () => '' },
  { pattern: /\bon\s+(\d{4}-\d{2}-\d{2})\b/, resolve: () => '' },
  { pattern: /\bon\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, resolve: () => '' },
];

function nextDayOfWeek(day: number): string {
  const now = new Date();
  const current = now.getDay();
  let diff = day - current;
  if (diff <= 0) diff += 7;
  now.setDate(now.getDate() + diff);
  return now.toISOString().split('T')[0];
}

const PRIORITY_KEYWORDS: Record<string, string> = {
  'urgent': 'high',
  'important': 'high',
  'critical': 'high',
  'asap': 'high',
  'high priority': 'high',
  'low priority': 'low',
  'whenever': 'low',
  'not urgent': 'low',
  'eventually': 'low',
};

class NaturalLanguageTaskManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[NLTask] Natural language task creator initialized');
  }

  parse(input: string): ParsedTask {
    let text = input.trim();
    const result: ParsedTask = {
      title: '',
      dueDate: null,
      tags: [],
      priority: 'normal',
      app: '',
      assignee: '',
      notes: '',
    };

    // Extract tags (words prefixed with #)
    const tagMatches = text.match(/#(\w[\w-]*)/g);
    if (tagMatches) {
      result.tags = tagMatches.map(t => t.substring(1));
      text = text.replace(/#\w[\w-]*/g, '').trim();
    }

    // Extract app specification (prefixed with @)
    const appMatch = text.match(/@(\w[\w-]*)/);
    if (appMatch) {
      result.app = appMatch[1];
      text = text.replace(/@\w[\w-]*/, '').trim();
    }

    // Extract priority
    for (const [keyword, level] of Object.entries(PRIORITY_KEYWORDS)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        result.priority = level;
        text = text.replace(regex, '').trim();
        break;
      }
    }

    // Also support !high !low !normal syntax
    const bangPriority = text.match(/!(\w+)/);
    if (bangPriority) {
      const p = bangPriority[1].toLowerCase();
      if (['high', 'normal', 'low'].includes(p)) {
        result.priority = p;
        text = text.replace(/!\w+/, '').trim();
      }
    }

    // Extract dates
    // "today", "tomorrow", "next week", etc.
    for (const dp of DATE_PATTERNS) {
      const match = text.match(dp.pattern);
      if (match) {
        if (dp.pattern.source.includes('in\\s+(\\d+)\\s+days')) {
          const daysMatch = text.match(/\bin\s+(\d+)\s+days?\b/i);
          if (daysMatch) {
            const days = parseInt(daysMatch[1], 10);
            const d = new Date();
            d.setDate(d.getDate() + days);
            result.dueDate = d.toISOString().split('T')[0];
            text = text.replace(/\bin\s+\d+\s+days?\b/i, '').trim();
          }
        } else if (dp.pattern.source.includes('in\\s+(\\d+)\\s+weeks')) {
          const weeksMatch = text.match(/\bin\s+(\d+)\s+weeks?\b/i);
          if (weeksMatch) {
            const weeks = parseInt(weeksMatch[1], 10);
            const d = new Date();
            d.setDate(d.getDate() + weeks * 7);
            result.dueDate = d.toISOString().split('T')[0];
            text = text.replace(/\bin\s+\d+\s+weeks?\b/i, '').trim();
          }
        } else if (dp.pattern.source.includes('on\\s+(\\d{4}')) {
          const dateMatch = text.match(/\bon\s+(\d{4}-\d{2}-\d{2})\b/);
          if (dateMatch) {
            result.dueDate = dateMatch[1];
            text = text.replace(/\bon\s+\d{4}-\d{2}-\d{2}\b/, '').trim();
          }
        } else if (dp.pattern.source.includes('on\\s+(\\d{1,2})')) {
          const slashMatch = text.match(/\bon\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
          if (slashMatch) {
            const month = parseInt(slashMatch[1], 10);
            const day = parseInt(slashMatch[2], 10);
            let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : new Date().getFullYear();
            if (year < 100) year += 2000;
            result.dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            text = text.replace(/\bon\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, '').trim();
          }
        } else {
          result.dueDate = dp.resolve();
          text = text.replace(dp.pattern, '').trim();
        }
        break;
      }
    }

    // Extract "due" prefix
    const dueMatch = text.match(/\bdue\s+(today|tomorrow|next\s+\w+)\b/i);
    if (dueMatch && !result.dueDate) {
      const word = dueMatch[1].toLowerCase();
      if (word === 'today') {
        result.dueDate = new Date().toISOString().split('T')[0];
      } else if (word === 'tomorrow') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        result.dueDate = d.toISOString().split('T')[0];
      }
      text = text.replace(/\bdue\s+\w+(?:\s+\w+)?\b/i, '').trim();
    }

    // Clean up remaining text as title
    result.title = text.replace(/\s{2,}/g, ' ').trim();

    return result;
  }

  createTask(input: string): ParsedTask {
    const parsed = this.parse(input);

    // Store the task via settings (the app modules handle their own task storage)
    const db = databaseManager.getDatabase();
    if (db) {
      try {
        db.prepare(
          `INSERT INTO nl_task_history (input, parsed_title, parsed_date, parsed_tags, parsed_priority, parsed_app)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(input, parsed.title, parsed.dueDate || '', JSON.stringify(parsed.tags), parsed.priority, parsed.app);
      } catch (_e) { /* table may not exist yet */ }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('nl-task:created', parsed);
    }

    return parsed;
  }

  getHistory(limit: number = 50): any[] {
    const db = databaseManager.getDatabase();
    if (!db) return [];
    try {
      return db.prepare(
        'SELECT * FROM nl_task_history ORDER BY created_at DESC LIMIT ?'
      ).all(limit);
    } catch (_e) {
      return [];
    }
  }

  private registerIPC(): void {
    ipcMain.handle('nl-task:parse', async (_event, input: string) => {
      return this.parse(input);
    });

    ipcMain.handle('nl-task:create', async (_event, input: string) => {
      return this.createTask(input);
    });

    ipcMain.handle('nl-task:history', async (_event, limit?: number) => {
      return this.getHistory(limit);
    });
  }
}

export const naturalLanguageTaskManager = new NaturalLanguageTaskManager();
