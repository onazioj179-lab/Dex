// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Reminder Manager (Feature 28)
// Scheduled reminders with repeat logic and notification integration.
// ==========================================================================

import { ipcMain, BrowserWindow, Notification } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface Reminder {
  id: number;
  app: string;
  title: string;
  body: string;
  item_type: string;
  item_id: string;
  remind_at: string;
  repeat: string;
  completed: number;
  snoozed_until: string | null;
  created_at: string;
}

const REPEAT_OPTIONS = ['none', 'daily', 'weekly', 'monthly'] as const;

class ReminderManager {
  private mainWindow: BrowserWindow | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    this.startChecking();
    log.info('[Reminder] Reminder manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        item_type TEXT NOT NULL DEFAULT '',
        item_id TEXT NOT NULL DEFAULT '',
        remind_at TEXT NOT NULL,
        repeat TEXT NOT NULL DEFAULT 'none',
        completed INTEGER NOT NULL DEFAULT 0,
        snoozed_until TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
      CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(completed);
    `);
  }

  private startChecking(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      this.processReminders();
    }, 30000); // check every 30 seconds
    // also run immediately
    setTimeout(() => this.processReminders(), 2000);
  }

  private processReminders(): void {
    const db = this.getDb();
    if (!db) return;

    const now = new Date().toISOString();
    const due = db.prepare(
      `SELECT * FROM reminders WHERE completed = 0 AND remind_at <= ?
       AND (snoozed_until IS NULL OR snoozed_until <= ?)
       ORDER BY remind_at ASC LIMIT 20`
    ).all(now, now) as Reminder[];

    for (const reminder of due) {
      this.fireReminder(reminder);
    }
  }

  private fireReminder(reminder: Reminder): void {
    const db = this.getDb();

    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: reminder.title,
          body: reminder.body || 'Reminder due',
          silent: false,
        });
        notif.show();
      }
    } catch (_e) { /* notification may fail in some environments */ }

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('reminder:fired', reminder);
    }

    dexEventBus.emit('reminder-fired', 'reminder-manager', { id: reminder.id, title: reminder.title });

    // Send to notification center
    try {
      if (db) {
        db.prepare(
          `INSERT INTO notifications (type, title, message, source, priority, created_at, read)
           VALUES ('reminder', ?, ?, 'reminder-manager', 'normal', datetime('now'), 0)`
        ).run(reminder.title, reminder.body || 'Reminder is due');
      }
    } catch (_e) { /* notifications table may not exist */ }

    // Handle repeat
    if (reminder.repeat === 'none' || !reminder.repeat) {
      if (db) {
        db.prepare('UPDATE reminders SET completed = 1 WHERE id = ?').run(reminder.id);
      }
    } else {
      const nextTime = this.computeNextRemindAt(reminder.remind_at, reminder.repeat);
      if (db) {
        db.prepare('UPDATE reminders SET remind_at = ?, snoozed_until = NULL WHERE id = ?').run(nextTime, reminder.id);
      }
    }

    log.info(`[Reminder] Fired reminder: ${reminder.title}`);
  }

  private computeNextRemindAt(current: string, repeat: string): string {
    const d = new Date(current);
    switch (repeat) {
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      default:
        d.setDate(d.getDate() + 1);
    }
    return d.toISOString();
  }

  create(params: {
    app?: string;
    title: string;
    body?: string;
    itemType?: string;
    itemId?: string;
    remindAt: string;
    repeat?: string;
  }): Reminder | null {
    const db = this.getDb();
    if (!db) return null;

    const trimmedTitle = params.title.trim();
    if (!trimmedTitle) return null;

    const repeat = REPEAT_OPTIONS.includes(params.repeat as any) ? params.repeat : 'none';

    const result = db.prepare(
      `INSERT INTO reminders (app, title, body, item_type, item_id, remind_at, repeat)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.app || '',
      trimmedTitle,
      params.body || '',
      params.itemType || '',
      params.itemId || '',
      params.remindAt,
      repeat,
    );

    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid) as Reminder;
  }

  snooze(id: number, minutes: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const until = new Date(Date.now() + minutes * 60000).toISOString();
    db.prepare('UPDATE reminders SET snoozed_until = ? WHERE id = ?').run(until, id);
    return true;
  }

  complete(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('UPDATE reminders SET completed = 1 WHERE id = ?').run(id);
    return true;
  }

  remove(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    return true;
  }

  getAll(includeCompleted: boolean = false): Reminder[] {
    const db = this.getDb();
    if (!db) return [];
    if (includeCompleted) {
      return db.prepare('SELECT * FROM reminders ORDER BY remind_at ASC').all() as Reminder[];
    }
    return db.prepare('SELECT * FROM reminders WHERE completed = 0 ORDER BY remind_at ASC').all() as Reminder[];
  }

  getUpcoming(hours: number = 24): Reminder[] {
    const db = this.getDb();
    if (!db) return [];
    const cutoff = new Date(Date.now() + hours * 3600000).toISOString();
    return db.prepare(
      `SELECT * FROM reminders WHERE completed = 0 AND remind_at <= ? ORDER BY remind_at ASC`
    ).all(cutoff) as Reminder[];
  }

  private registerIPC(): void {
    ipcMain.handle('reminder:create', async (_event, params: any) => {
      return this.create(params);
    });

    ipcMain.handle('reminder:snooze', async (_event, id: number, minutes: number) => {
      return this.snooze(id, minutes);
    });

    ipcMain.handle('reminder:complete', async (_event, id: number) => {
      return this.complete(id);
    });

    ipcMain.handle('reminder:remove', async (_event, id: number) => {
      return this.remove(id);
    });

    ipcMain.handle('reminder:getAll', async (_event, includeCompleted?: boolean) => {
      return this.getAll(includeCompleted);
    });

    ipcMain.handle('reminder:getUpcoming', async (_event, hours?: number) => {
      return this.getUpcoming(hours);
    });
  }
}

export const reminderManager = new ReminderManager();
