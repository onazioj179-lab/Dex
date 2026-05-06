// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Unified Notification Center
// Single path for every notification in DEX. Stores in SQLite.
// Supports Do Not Disturb, per-app preferences, bell count.
// ==========================================================================

import { ipcMain, BrowserWindow, Notification as ElectronNotification } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface NotificationRecord {
  id: number;
  app: string;
  title: string;
  body: string;
  action: string | null;
  read: number;
  delivery: string;
  timestamp: number;
}

export interface NotificationPayload {
  app: string;
  title: string;
  body: string;
  action?: { type: string; target: string; data?: any };
  delivery?: 'all' | 'bell' | 'silent';
}

export type DeliveryMethod = 'all' | 'bell' | 'silent';

export interface AppNotificationPreference {
  app: string;
  enabled: boolean;
  delivery: DeliveryMethod;
}

class UnifiedNotificationCenter {
  private doNotDisturb = false;
  private dndStartTime = 0;
  private notificationsDuringDnd = 0;
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[NotificationCenter] Unified notification center initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  send(payload: NotificationPayload): number {
    const db = this.getDb();
    if (!db) return -1;

    const prefs = this.getAppPreference(payload.app);
    if (!prefs.enabled) {
      return -1;
    }

    const effectiveDelivery = payload.delivery || prefs.delivery || 'all';
    const actionJson = payload.action ? JSON.stringify(payload.action) : null;
    const now = Date.now();

    const result = db.prepare(
      'INSERT INTO notifications (app, title, body, action, read, delivery, timestamp) VALUES (?, ?, ?, ?, 0, ?, ?)'
    ).run(payload.app, payload.title, payload.body || '', actionJson, effectiveDelivery, now);

    const notifId = result.lastInsertRowid;

    this.broadcastUnreadCount();

    if (this.doNotDisturb) {
      this.notificationsDuringDnd++;
      return Number(notifId);
    }

    if (effectiveDelivery === 'all') {
      this.showDesktopNotification(payload.title, payload.body);
    }

    if (effectiveDelivery === 'all' || effectiveDelivery === 'bell') {
      this.broadcastNewNotification({
        id: Number(notifId),
        app: payload.app,
        title: payload.title,
        body: payload.body,
        action: actionJson,
        read: 0,
        delivery: effectiveDelivery,
        timestamp: now,
      });
    }

    return Number(notifId);
  }

  private showDesktopNotification(title: string, body: string): void {
    try {
      if (ElectronNotification.isSupported()) {
        const notif = new ElectronNotification({ title, body, silent: false });
        notif.show();
      }
    } catch (err) {
      log.warn('[NotificationCenter] Desktop notification failed:', err);
    }
  }

  private broadcastNewNotification(record: NotificationRecord): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification-center:new', record);
    }
  }

  private broadcastUnreadCount(): void {
    const count = this.getUnreadCount();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification-center:unread-count', count);
    }
  }

  getAll(limit = 200): NotificationRecord[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  getUnreadCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get();
    return row ? row.count : 0;
  }

  markRead(id: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
    this.broadcastUnreadCount();
  }

  markAllRead(): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    this.broadcastUnreadCount();
  }

  clearAll(): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('DELETE FROM notifications').run();
    this.broadcastUnreadCount();
  }

  deleteOne(id: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
    this.broadcastUnreadCount();
  }

  setDoNotDisturb(active: boolean): void {
    if (active && !this.doNotDisturb) {
      this.doNotDisturb = true;
      this.dndStartTime = Date.now();
      this.notificationsDuringDnd = 0;
    } else if (!active && this.doNotDisturb) {
      this.doNotDisturb = false;
      if (this.notificationsDuringDnd > 0) {
        this.send({
          app: 'system',
          title: 'Do Not Disturb ended',
          body: `${this.notificationsDuringDnd} notification${this.notificationsDuringDnd > 1 ? 's' : ''} arrived while Do Not Disturb was active.`,
          delivery: 'all',
        });
      }
      this.notificationsDuringDnd = 0;
      this.dndStartTime = 0;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification-center:dnd-changed', this.doNotDisturb);
    }
  }

  isDoNotDisturb(): boolean {
    return this.doNotDisturb;
  }

  getAppPreference(appName: string): AppNotificationPreference {
    const db = this.getDb();
    if (!db) return { app: appName, enabled: true, delivery: 'all' };
    const row = db.prepare('SELECT * FROM notification_preferences WHERE app = ?').get(appName);
    if (row) {
      return {
        app: row.app,
        enabled: row.enabled === 1,
        delivery: row.delivery as DeliveryMethod,
      };
    }
    return { app: appName, enabled: true, delivery: 'all' };
  }

  setAppPreference(appName: string, enabled: boolean, delivery: DeliveryMethod): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare(
      'INSERT INTO notification_preferences (app, enabled, delivery) VALUES (?, ?, ?) ON CONFLICT(app) DO UPDATE SET enabled = ?, delivery = ?'
    ).run(appName, enabled ? 1 : 0, delivery, enabled ? 1 : 0, delivery);
  }

  getAllPreferences(): AppNotificationPreference[] {
    const db = this.getDb();
    if (!db) return [];
    const rows = db.prepare('SELECT * FROM notification_preferences').all();
    return rows.map((row: any) => ({
      app: row.app,
      enabled: row.enabled === 1,
      delivery: row.delivery as DeliveryMethod,
    }));
  }

  private registerIPC(): void {
    ipcMain.handle('notification-center:send', (_event, payload: NotificationPayload) => {
      return this.send(payload);
    });

    ipcMain.handle('notification-center:getAll', (_event, limit?: number) => {
      return this.getAll(limit);
    });

    ipcMain.handle('notification-center:getUnreadCount', () => {
      return this.getUnreadCount();
    });

    ipcMain.handle('notification-center:markRead', (_event, id: number) => {
      this.markRead(id);
      return true;
    });

    ipcMain.handle('notification-center:markAllRead', () => {
      this.markAllRead();
      return true;
    });

    ipcMain.handle('notification-center:clearAll', () => {
      this.clearAll();
      return true;
    });

    ipcMain.handle('notification-center:delete', (_event, id: number) => {
      this.deleteOne(id);
      return true;
    });

    ipcMain.handle('notification-center:setDnd', (_event, active: boolean) => {
      this.setDoNotDisturb(active);
      return true;
    });

    ipcMain.handle('notification-center:isDnd', () => {
      return this.doNotDisturb;
    });

    ipcMain.handle('notification-center:getAppPreference', (_event, appName: string) => {
      return this.getAppPreference(appName);
    });

    ipcMain.handle('notification-center:setAppPreference', (_event, appName: string, enabled: boolean, delivery: DeliveryMethod) => {
      this.setAppPreference(appName, enabled, delivery);
      return true;
    });

    ipcMain.handle('notification-center:getAllPreferences', () => {
      return this.getAllPreferences();
    });
  }

  shutdown(): void {
    log.info('[NotificationCenter] Shutdown');
  }
}

export const unifiedNotificationCenter = new UnifiedNotificationCenter();

export function initializeUnifiedNotificationCenter(mainWindow: BrowserWindow): void {
  unifiedNotificationCenter.initialize(mainWindow);
}

export function shutdownUnifiedNotificationCenter(): void {
  unifiedNotificationCenter.shutdown();
}
