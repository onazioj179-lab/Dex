// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Activity Feed Manager (Feature 34)
// Centralized activity feed that listens to the event bus and stores entries.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface ActivityEntry {
  id: number;
  event_type: string;
  source: string;
  app: string;
  title: string;
  details: string;
  created_at: string;
}

class ActivityFeedManager {
  private mainWindow: BrowserWindow | null = null;
  private maxEntries: number = 5000;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    this.subscribeToEvents();
    this.cleanOldEntries();
    log.info('[ActivityFeed] Activity feed manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '',
        app TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON activity_feed(event_type);
      CREATE INDEX IF NOT EXISTS idx_activity_feed_app ON activity_feed(app);
      CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at);
    `);
  }

  private subscribeToEvents(): void {
    // Listen to all event bus events and record them
    const eventTypes = [
      'project-created', 'project-updated', 'project-deleted',
      'task-completed', 'task-created',
      'media-added', 'media-removed',
      'version-saved', 'version-restored',
      'item-renamed', 'color-label-changed',
      'dependency-added', 'reminder-fired',
      'bulk-operation-completed',
      'note-created', 'note-updated',
    ];

    dexEventBus.subscribe('activity-feed', eventTypes as any, (event: any) => {
      this.recordActivity(
        event.type,
        event.source || '',
        event.payload?.app || '',
        this.generateTitle(event.type, event.payload),
        event.payload || {},
      );
    });
  }

  private generateTitle(eventType: string, data: any): string {
    const name = data?.name || data?.title || data?.projectName || data?.itemName || '';
    const app = data?.app || '';

    switch (eventType) {
      case 'project-created':
        return `Project created${name ? ': ' + name : ''}${app ? ' in ' + app : ''}`;
      case 'project-updated':
        return `Project updated${name ? ': ' + name : ''}${app ? ' in ' + app : ''}`;
      case 'project-deleted':
        return `Project deleted${name ? ': ' + name : ''}`;
      case 'task-completed':
        return `Task completed${name ? ': ' + name : ''}`;
      case 'task-created':
        return `Task created${name ? ': ' + name : ''}`;
      case 'media-added':
        return `Media added${name ? ': ' + name : ''}`;
      case 'version-saved':
        return `Version saved${name ? ' for ' + name : ''}`;
      case 'version-restored':
        return `Version restored${name ? ' for ' + name : ''}`;
      case 'item-renamed':
        return `Renamed "${data?.oldName || ''}" to "${data?.newName || ''}"`;
      case 'color-label-changed':
        return `Color label set to ${data?.color || 'unknown'}`;
      case 'dependency-added':
        return `Dependency added: ${data?.sourceId || ''} -> ${data?.targetId || ''}`;
      case 'reminder-fired':
        return `Reminder: ${data?.title || ''}`;
      case 'bulk-operation-completed':
        return `Bulk ${data?.operation || 'operation'}: ${data?.count || 0} items`;
      default:
        return `${eventType}${name ? ': ' + name : ''}`;
    }
  }

  recordActivity(eventType: string, source: string, app: string, title: string, details: any): void {
    const db = this.getDb();
    if (!db) return;

    db.prepare(
      `INSERT INTO activity_feed (event_type, source, app, title, details)
       VALUES (?, ?, ?, ?, ?)`
    ).run(eventType, source, app, title, JSON.stringify(details));

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('activity-feed:new', {
        event_type: eventType,
        source,
        app,
        title,
        created_at: new Date().toISOString(),
      });
    }
  }

  getFeed(options?: { app?: string; eventType?: string; limit?: number; offset?: number }): ActivityEntry[] {
    const db = this.getDb();
    if (!db) return [];

    const limit = Math.min(options?.limit || 100, 500);
    const offset = options?.offset || 0;

    let sql = 'SELECT * FROM activity_feed WHERE 1=1';
    const params: any[] = [];

    if (options?.app) {
      sql += ' AND app = ?';
      params.push(options.app);
    }
    if (options?.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(sql).all(...params) as ActivityEntry[];
  }

  getTodayActivity(): ActivityEntry[] {
    const db = this.getDb();
    if (!db) return [];
    const today = new Date().toISOString().split('T')[0];
    return db.prepare(
      'SELECT * FROM activity_feed WHERE date(created_at) = ? ORDER BY created_at DESC LIMIT 200'
    ).all(today) as ActivityEntry[];
  }

  getActivityStats(): { today: number; thisWeek: number; total: number; byType: Record<string, number> } {
    const db = this.getDb();
    if (!db) return { today: 0, thisWeek: 0, total: 0, byType: {} };

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const todayCount = (db.prepare('SELECT COUNT(*) as cnt FROM activity_feed WHERE date(created_at) = ?').get(today) as { cnt: number } | undefined)?.cnt || 0;
    const weekCount = (db.prepare('SELECT COUNT(*) as cnt FROM activity_feed WHERE date(created_at) >= ?').get(weekAgo) as { cnt: number } | undefined)?.cnt || 0;
    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM activity_feed').get() as { cnt: number } | undefined)?.cnt || 0;

    const byType = db.prepare(
      'SELECT event_type, COUNT(*) as cnt FROM activity_feed GROUP BY event_type ORDER BY cnt DESC'
    ).all() as { event_type: string; cnt: number }[];

    return {
      today: todayCount,
      thisWeek: weekCount,
      total: totalCount,
      byType: Object.fromEntries(byType.map(r => [r.event_type, r.cnt])),
    };
  }

  clearFeed(): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('DELETE FROM activity_feed').run();
  }

  private cleanOldEntries(): void {
    const db = this.getDb();
    if (!db) return;
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM activity_feed').get() as { cnt: number } | undefined)?.cnt || 0;
    if (count > this.maxEntries) {
      const excess = count - this.maxEntries;
      db.prepare(
        'DELETE FROM activity_feed WHERE id IN (SELECT id FROM activity_feed ORDER BY created_at ASC LIMIT ?)'
      ).run(excess);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('activity-feed:get', async (_event, options?: any) => {
      return this.getFeed(options);
    });

    ipcMain.handle('activity-feed:getToday', async () => {
      return this.getTodayActivity();
    });

    ipcMain.handle('activity-feed:stats', async () => {
      return this.getActivityStats();
    });

    ipcMain.handle('activity-feed:clear', async () => {
      this.clearFeed();
    });

    ipcMain.handle('activity-feed:record', async (_event, eventType: string, source: string, app: string, title: string, details?: any) => {
      this.recordActivity(eventType, source, app, title, details || {});
    });
  }
}

export const activityFeedManager = new ActivityFeedManager();
