// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Notification & Activity Center
// Quiet activity stream: file operations, errors, completed tasks
// No popups by default, collapsible, read-only, clear timestamps
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, Notification as ElectronNotification } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type NotificationType = 
  | 'info' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'progress';

export type NotificationCategory = 
  | 'file'       // File operations
  | 'system'     // System events
  | 'action'     // Action completions
  | 'error'      // Errors
  | 'sync'       // Sync operations
  | 'media'      // Media operations
  | 'task'       // Task reminders
  | 'general';   // General notifications

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationAction {
  id: string;
  label: string;
  action: string;      // Command to execute
  args?: unknown[];
}

export interface DexNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  detail?: string;
  icon?: string;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
  persistent: boolean;  // Survives restart
  actions?: NotificationAction[];
  progress?: {          // For progress notifications
    current: number;
    total: number;
    percentage: number;
  };
  source?: {            // What generated this
    module: string;
    operation?: string;
  };
  relatedPath?: string; // Related file/folder path
  expiresAt?: number;   // Auto-expire timestamp
}

export interface NotificationFilter {
  types?: NotificationType[];
  categories?: NotificationCategory[];
  priorities?: NotificationPriority[];
  read?: boolean;
  dateFrom?: number;
  dateTo?: number;
  search?: string;
}

export interface NotificationConfig {
  maxNotifications: number;
  persistentHistoryLimit: number;
  showSystemNotifications: boolean;  // OS-level notifications
  soundEnabled: boolean;
  autoExpireMinutes: number;        // 0 = never
  defaultPriority: NotificationPriority;
  quietHoursStart?: number;         // Hour (0-23)
  quietHoursEnd?: number;
  blockedCategories: NotificationCategory[];
  groupSimilar: boolean;
}

export interface NotificationGroup {
  key: string;
  notifications: DexNotification[];
  count: number;
  latestTimestamp: number;
  category: NotificationCategory;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byCategory: Record<NotificationCategory, number>;
  byPriority: Record<NotificationPriority, number>;
}

// ===========================================================================
// NOTIFICATION CENTER
// ===========================================================================

class NotificationCenterClass extends EventEmitter {
  private notifications: Map<string, DexNotification> = new Map();
  private config: NotificationConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = {
      maxNotifications: 500,
      persistentHistoryLimit: 100,
      showSystemNotifications: false,  // No popups by default
      soundEnabled: false,
      autoExpireMinutes: 60,          // 1 hour default
      defaultPriority: 'normal',
      blockedCategories: [],
      groupSimilar: true,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'notifications');

    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadPersistentNotifications();
      this.startExpiryTimer();
      log.info(`[NotificationCenter] Initialized with ${this.notifications.size} notifications`);
    } catch (error) {
      log.error('[NotificationCenter] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // -- Create Notifications ----------------------------------------------
    ipcMain.handle('notifications:create', async (_event, data: {
      type: NotificationType;
      category?: NotificationCategory;
      priority?: NotificationPriority;
      title: string;
      message: string;
      detail?: string;
      actions?: NotificationAction[];
      persistent?: boolean;
      relatedPath?: string;
    }) => {
      return this.create(data);
    });

    ipcMain.handle('notifications:createProgress', async (_event, data: {
      title: string;
      message: string;
      category?: NotificationCategory;
      total: number;
    }) => {
      return this.createProgress(data.title, data.message, data.category, data.total);
    });

    ipcMain.handle('notifications:updateProgress', async (_event, id: string, current: number, message?: string) => {
      return this.updateProgress(id, current, message);
    });

    // -- Query Notifications -----------------------------------------------
    ipcMain.handle('notifications:list', (_event, filter?: NotificationFilter) => {
      return this.list(filter);
    });

    ipcMain.handle('notifications:get', (_event, id: string) => {
      return this.get(id);
    });

    ipcMain.handle('notifications:getUnread', () => {
      return this.getUnread();
    });

    ipcMain.handle('notifications:getUnreadCount', () => {
      return this.getUnreadCount();
    });

    ipcMain.handle('notifications:getGrouped', (_event, filter?: NotificationFilter) => {
      return this.getGrouped(filter);
    });

    ipcMain.handle('notifications:search', (_event, query: string) => {
      return this.search(query);
    });

    // -- Actions -----------------------------------------------------------
    ipcMain.handle('notifications:markRead', async (_event, id: string) => {
      return this.markRead(id);
    });

    ipcMain.handle('notifications:markAllRead', async () => {
      return this.markAllRead();
    });

    ipcMain.handle('notifications:dismiss', async (_event, id: string) => {
      return this.dismiss(id);
    });

    ipcMain.handle('notifications:dismissAll', async () => {
      return this.dismissAll();
    });

    ipcMain.handle('notifications:clear', async () => {
      return this.clear();
    });

    ipcMain.handle('notifications:clearCategory', async (_event, category: NotificationCategory) => {
      return this.clearCategory(category);
    });

    ipcMain.handle('notifications:executeAction', async (_event, notificationId: string, actionId: string) => {
      return this.executeAction(notificationId, actionId);
    });

    // -- Stats & Config ----------------------------------------------------
    ipcMain.handle('notifications:stats', () => this.getStats());
    ipcMain.handle('notifications:config', () => this.config);
    ipcMain.handle('notifications:setConfig', async (_event, config: Partial<NotificationConfig>) => {
      this.config = { ...this.config, ...config };
      await this.saveConfig();
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // CREATE NOTIFICATIONS
  // -------------------------------------------------------------------------

  create(data: {
    type: NotificationType;
    category?: NotificationCategory;
    priority?: NotificationPriority;
    title: string;
    message: string;
    detail?: string;
    icon?: string;
    actions?: NotificationAction[];
    persistent?: boolean;
    relatedPath?: string;
    source?: { module: string; operation?: string };
  }): DexNotification {
    const category = data.category || 'general';
    
    // Check if category is blocked
    if (this.config.blockedCategories.includes(category)) {
      throw new Error(`Category ${category} is blocked`);
    }

    // Check quiet hours
    if (this.isQuietHours() && data.priority !== 'urgent') {
      // Still create but don't show system notification
      data.persistent = false;
    }

    const id = `notif-${++this.idCounter}-${Date.now()}`;
    const priority = data.priority || this.config.defaultPriority;

    const notification: DexNotification = {
      id,
      type: data.type,
      category,
      priority,
      title: data.title,
      message: data.message,
      detail: data.detail,
      icon: data.icon,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
      persistent: data.persistent || false,
      actions: data.actions,
      source: data.source,
      relatedPath: data.relatedPath,
      expiresAt: this.config.autoExpireMinutes > 0 
        ? Date.now() + (this.config.autoExpireMinutes * 60 * 1000)
        : undefined,
    };

    this.notifications.set(id, notification);
    this.enforceLimit();

    // Show system notification if enabled
    if (this.config.showSystemNotifications && !this.isQuietHours()) {
      this.showSystemNotification(notification);
    }

    // Emit events
    this.emit('notification:created', notification);
    this.notifyRenderer('notifications:created', notification);

    // Save persistent notifications
    if (notification.persistent) {
      this.savePersistentNotifications();
    }

    return notification;
  }

  createProgress(
    title: string, 
    message: string, 
    category: NotificationCategory = 'general',
    total: number
  ): DexNotification {
    const notification = this.create({
      type: 'progress',
      category,
      title,
      message,
      priority: 'low',
    });

    notification.progress = {
      current: 0,
      total,
      percentage: 0,
    };

    this.notifyRenderer('notifications:updated', notification);
    return notification;
  }

  updateProgress(id: string, current: number, message?: string): { success: boolean } {
    const notification = this.notifications.get(id);
    if (!notification || !notification.progress) {
      return { success: false };
    }

    notification.progress.current = current;
    notification.progress.percentage = Math.round((current / notification.progress.total) * 100);
    
    if (message) {
      notification.message = message;
    }

    // Auto-complete progress
    if (notification.progress.percentage >= 100) {
      notification.type = 'success';
      notification.read = false;
    }

    this.notifyRenderer('notifications:updated', notification);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SHORTCUT METHODS
  // -------------------------------------------------------------------------

  info(title: string, message: string, category: NotificationCategory = 'general'): DexNotification {
    return this.create({ type: 'info', category, title, message });
  }

  success(title: string, message: string, category: NotificationCategory = 'general'): DexNotification {
    return this.create({ type: 'success', category, title, message });
  }

  warning(title: string, message: string, category: NotificationCategory = 'general'): DexNotification {
    return this.create({ type: 'warning', category, title, message, priority: 'high' });
  }

  error(title: string, message: string, detail?: string, category: NotificationCategory = 'error'): DexNotification {
    return this.create({ 
      type: 'error', 
      category, 
      title, 
      message, 
      detail,
      priority: 'high',
      persistent: true,
    });
  }

  // -------------------------------------------------------------------------
  // QUERY METHODS
  // -------------------------------------------------------------------------

  get(id: string): DexNotification | null {
    return this.notifications.get(id) || null;
  }

  list(filter?: NotificationFilter): DexNotification[] {
    let results = Array.from(this.notifications.values())
      .filter(n => !n.dismissed);

    if (filter) {
      if (filter.types && filter.types.length > 0) {
        results = results.filter(n => filter.types!.includes(n.type));
      }
      if (filter.categories && filter.categories.length > 0) {
        results = results.filter(n => filter.categories!.includes(n.category));
      }
      if (filter.priorities && filter.priorities.length > 0) {
        results = results.filter(n => filter.priorities!.includes(n.priority));
      }
      if (filter.read !== undefined) {
        results = results.filter(n => n.read === filter.read);
      }
      if (filter.dateFrom) {
        results = results.filter(n => n.timestamp >= filter.dateFrom!);
      }
      if (filter.dateTo) {
        results = results.filter(n => n.timestamp <= filter.dateTo!);
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        results = results.filter(n => 
          n.title.toLowerCase().includes(searchLower) ||
          n.message.toLowerCase().includes(searchLower) ||
          n.detail?.toLowerCase().includes(searchLower)
        );
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  getUnread(): DexNotification[] {
    return this.list({ read: false });
  }

  getUnreadCount(): number {
    return this.getUnread().length;
  }

  getGrouped(filter?: NotificationFilter): NotificationGroup[] {
    if (!this.config.groupSimilar) {
      return [];
    }

    const notifications = this.list(filter);
    const groups = new Map<string, NotificationGroup>();

    for (const notification of notifications) {
      // Group by category + source module
      const key = `${notification.category}-${notification.source?.module || 'unknown'}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          notifications: [],
          count: 0,
          latestTimestamp: 0,
          category: notification.category,
        });
      }

      const group = groups.get(key)!;
      group.notifications.push(notification);
      group.count++;
      if (notification.timestamp > group.latestTimestamp) {
        group.latestTimestamp = notification.timestamp;
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }

  search(query: string): DexNotification[] {
    return this.list({ search: query });
  }

  // -------------------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------------------

  markRead(id: string): { success: boolean } {
    const notification = this.notifications.get(id);
    if (!notification) return { success: false };

    notification.read = true;
    this.notifyRenderer('notifications:updated', notification);
    this.emit('notification:read', id);

    return { success: true };
  }

  markAllRead(): { count: number } {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (!notification.read) {
        notification.read = true;
        count++;
      }
    }

    this.notifyRenderer('notifications:allRead', { count });
    this.emit('notifications:allRead', count);

    return { count };
  }

  dismiss(id: string): { success: boolean } {
    const notification = this.notifications.get(id);
    if (!notification) return { success: false };

    notification.dismissed = true;
    this.notifyRenderer('notifications:dismissed', id);
    this.emit('notification:dismissed', id);

    // Remove non-persistent dismissed notifications
    if (!notification.persistent) {
      this.notifications.delete(id);
    }

    return { success: true };
  }

  dismissAll(): { count: number } {
    let count = 0;
    for (const [id, notification] of this.notifications) {
      if (!notification.dismissed) {
        notification.dismissed = true;
        count++;
        if (!notification.persistent) {
          this.notifications.delete(id);
        }
      }
    }

    this.notifyRenderer('notifications:allDismissed', { count });
    this.emit('notifications:allDismissed', count);

    return { count };
  }

  clear(): { count: number } {
    const count = this.notifications.size;
    this.notifications.clear();
    
    this.notifyRenderer('notifications:cleared', { count });
    this.emit('notifications:cleared', count);
    this.savePersistentNotifications();

    return { count };
  }

  clearCategory(category: NotificationCategory): { count: number } {
    let count = 0;
    for (const [id, notification] of this.notifications) {
      if (notification.category === category) {
        this.notifications.delete(id);
        count++;
      }
    }

    this.notifyRenderer('notifications:categoryCleared', { category, count });
    this.emit('notifications:categoryCleared', { category, count });

    return { count };
  }

  executeAction(notificationId: string, actionId: string): { success: boolean } {
    const notification = this.notifications.get(notificationId);
    if (!notification || !notification.actions) {
      return { success: false };
    }

    const action = notification.actions.find(a => a.id === actionId);
    if (!action) {
      return { success: false };
    }

    // Emit action for handling
    this.emit('notification:action', {
      notificationId,
      action: action.action,
      args: action.args,
    });

    // Mark as read after action
    this.markRead(notificationId);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): NotificationStats {
    const stats: NotificationStats = {
      total: 0,
      unread: 0,
      byType: { info: 0, success: 0, warning: 0, error: 0, progress: 0 },
      byCategory: { file: 0, system: 0, action: 0, error: 0, sync: 0, media: 0, task: 0, general: 0 },
      byPriority: { low: 0, normal: 0, high: 0, urgent: 0 },
    };

    for (const notification of this.notifications.values()) {
      if (notification.dismissed) continue;

      stats.total++;
      if (!notification.read) stats.unread++;
      stats.byType[notification.type]++;
      stats.byCategory[notification.category]++;
      stats.byPriority[notification.priority]++;
    }

    return stats;
  }

  // -------------------------------------------------------------------------
  // SYSTEM NOTIFICATIONS
  // -------------------------------------------------------------------------

  private showSystemNotification(notification: DexNotification): void {
    if (!ElectronNotification.isSupported()) return;

    const sysNotification = new ElectronNotification({
      title: notification.title,
      body: notification.message,
      silent: !this.config.soundEnabled,
    });

    sysNotification.on('click', () => {
      this.markRead(notification.id);
      // Focus main window
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    sysNotification.show();
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private isQuietHours(): boolean {
    if (this.config.quietHoursStart === undefined || this.config.quietHoursEnd === undefined) {
      return false;
    }

    const now = new Date();
    const hour = now.getHours();

    if (this.config.quietHoursStart < this.config.quietHoursEnd) {
      return hour >= this.config.quietHoursStart && hour < this.config.quietHoursEnd;
    } else {
      // Wraps around midnight
      return hour >= this.config.quietHoursStart || hour < this.config.quietHoursEnd;
    }
  }

  private enforceLimit(): void {
    const notifications = Array.from(this.notifications.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    while (notifications.length > this.config.maxNotifications) {
      const [id, notification] = notifications.shift()!;
      if (!notification.persistent) {
        this.notifications.delete(id);
      }
    }
  }

  private startExpiryTimer(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }

    // Check every minute
    this.expiryTimer = setInterval(() => {
      this.expireNotifications();
    }, 60000);
  }

  private expireNotifications(): void {
    const now = Date.now();
    let expired = 0;

    for (const [id, notification] of this.notifications) {
      if (notification.expiresAt && notification.expiresAt < now) {
        if (!notification.persistent) {
          this.notifications.delete(id);
          expired++;
        }
      }
    }

    if (expired > 0) {
      this.notifyRenderer('notifications:expired', { count: expired });
    }
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadPersistentNotifications(): Promise<void> {
    try {
      const filePath = path.join(this.dataPath, 'persistent.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const notifications = JSON.parse(data) as DexNotification[];

      for (const notification of notifications) {
        this.notifications.set(notification.id, notification);
        const idNum = parseInt(notification.id.split('-')[1], 10);
        if (idNum > this.idCounter) this.idCounter = idNum;
      }
    } catch {
      // No persistent notifications
    }

    // Load config
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async savePersistentNotifications(): Promise<void> {
    try {
      const persistent = Array.from(this.notifications.values())
        .filter(n => n.persistent && !n.dismissed)
        .slice(-this.config.persistentHistoryLimit);

      const filePath = path.join(this.dataPath, 'persistent.json');
      await fs.writeFile(filePath, JSON.stringify(persistent, null, 2));
    } catch (error) {
      log.error('[NotificationCenter] Failed to save persistent notifications:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[NotificationCenter] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
    await this.savePersistentNotifications();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const NotificationCenter = new NotificationCenterClass();
export default NotificationCenter;
