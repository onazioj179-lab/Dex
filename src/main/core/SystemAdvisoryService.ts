// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - System Advisory Service
// Phase 42: Suggestions only, never enforce - quiet, dismissible, disableable
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type AdvisoryType = 
  | 'performance'
  | 'memory'
  | 'battery'
  | 'storage'
  | 'maintenance'
  | 'usage-pattern'
  | 'feature-tip';

export type AdvisoryPriority = 'low' | 'medium' | 'high';

export interface Advisory {
  id: string;
  type: AdvisoryType;
  priority: AdvisoryPriority;
  title: string;
  message: string;
  suggestion?: string;
  actionId?: string;
  actionLabel?: string;
  createdAt: number;
  expiresAt: number | null;
  dismissedAt: number | null;
  autoApply: boolean;
  data?: Record<string, unknown>;
}

export interface AdvisoryConfig {
  enabled: boolean;
  showPerformance: boolean;
  showMemory: boolean;
  showBattery: boolean;
  showStorage: boolean;
  showMaintenance: boolean;
  showUsagePatterns: boolean;
  showFeatureTips: boolean;
  maxActiveAdvisories: number;
  quietHoursStart: number | null; // Hour (0-23) or null for no quiet hours
  quietHoursEnd: number | null;
  minPriority: AdvisoryPriority;
}

export interface AdvisoryStats {
  totalShown: number;
  totalDismissed: number;
  totalActedOn: number;
  typeBreakdown: Record<AdvisoryType, number>;
}

// ===========================================================================
// STORE
// ===========================================================================

const advisoryStore = new Store<{
  config: AdvisoryConfig;
  activeAdvisories: Advisory[];
  dismissedIds: string[];
  stats: AdvisoryStats;
}>({
  name: 'system-advisory',
  defaults: {
    config: {
      enabled: true,
      showPerformance: true,
      showMemory: true,
      showBattery: true,
      showStorage: true,
      showMaintenance: true,
      showUsagePatterns: false, // Conservative default
      showFeatureTips: true,
      maxActiveAdvisories: 3,
      quietHoursStart: null,
      quietHoursEnd: null,
      minPriority: 'low',
    },
    activeAdvisories: [],
    dismissedIds: [],
    stats: {
      totalShown: 0,
      totalDismissed: 0,
      totalActedOn: 0,
      typeBreakdown: {
        performance: 0,
        memory: 0,
        battery: 0,
        storage: 0,
        maintenance: 0,
        'usage-pattern': 0,
        'feature-tip': 0,
      },
    },
  },
});

// ===========================================================================
// SYSTEM ADVISORY SERVICE
// ===========================================================================

class SystemAdvisoryService {
  private static instance: SystemAdvisoryService;
  private initialized = false;
  private actionHandlers: Map<string, () => Promise<void>> = new Map();
  private advisoryListeners: Set<(advisory: Advisory) => void> = new Set();

  private constructor() {}

  static getInstance(): SystemAdvisoryService {
    if (!SystemAdvisoryService.instance) {
      SystemAdvisoryService.instance = new SystemAdvisoryService();
    }
    return SystemAdvisoryService.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Clean up expired advisories
    this.cleanExpiredAdvisories();

    // Register default action handlers
    this.registerDefaultHandlers();

    // Set up IPC handlers
    this.setupIPC();

    this.initialized = true;
    log.info('[SystemAdvisoryService] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('advisory:getActive', () => this.getActiveAdvisories());
    ipcMain.handle('advisory:dismiss', (_, id: string) => this.dismiss(id));
    ipcMain.handle('advisory:act', (_, id: string) => this.actOn(id));
    ipcMain.handle('advisory:getConfig', () => this.getConfig());
    ipcMain.handle('advisory:updateConfig', (_, config: Partial<AdvisoryConfig>) => 
      this.updateConfig(config));
  }

  private registerDefaultHandlers(): void {
    this.actionHandlers.set('clear-cache', async () => {
      log.info('[Advisory] Clearing cache...');
      // Would integrate with cache system
    });

    this.actionHandlers.set('compact-memory', async () => {
      if (global.gc) global.gc();
    });

    this.actionHandlers.set('run-maintenance', async () => {
      log.info('[Advisory] Running maintenance...');
      // Would integrate with maintenance system
    });
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // ADVISORY CREATION
  // -------------------------------------------------------------------------

  async suggest(options: {
    type: AdvisoryType;
    priority?: AdvisoryPriority;
    title: string;
    message: string;
    suggestion?: string;
    actionId?: string;
    actionLabel?: string;
    expiresInMs?: number;
    data?: Record<string, unknown>;
  }): Promise<Advisory | null> {
    const config = advisoryStore.get('config');

    // Check if advisories are enabled
    if (!config.enabled) return null;

    // Check type-specific settings
    if (!this.isTypeEnabled(options.type, config)) return null;

    // Check priority threshold
    const priority = options.priority || 'low';
    if (!this.meetsPriorityThreshold(priority, config.minPriority)) return null;

    // Check quiet hours
    if (this.isQuietHours(config)) return null;

    // Check max active advisories
    const activeAdvisories = advisoryStore.get('activeAdvisories');
    if (activeAdvisories.length >= config.maxActiveAdvisories) {
      // Remove lowest priority if this one is higher
      const lowest = this.findLowestPriority(activeAdvisories);
      if (lowest && this.comparePriority(priority, lowest.priority) > 0) {
        await this.dismiss(lowest.id);
      } else {
        return null;
      }
    }

    // Check if similar advisory was recently dismissed
    const dismissedIds = advisoryStore.get('dismissedIds');
    const advisoryKey = `${options.type}_${options.title}`;
    if (dismissedIds.includes(advisoryKey)) return null;

    // Create advisory
    const advisory: Advisory = {
      id: `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: options.type,
      priority,
      title: options.title,
      message: options.message,
      suggestion: options.suggestion,
      actionId: options.actionId,
      actionLabel: options.actionLabel,
      createdAt: Date.now(),
      expiresAt: options.expiresInMs ? Date.now() + options.expiresInMs : null,
      dismissedAt: null,
      autoApply: false,
      data: options.data,
    };

    // Add to active
    activeAdvisories.push(advisory);
    advisoryStore.set('activeAdvisories', activeAdvisories);

    // Update stats
    this.incrementStat('totalShown');
    this.incrementTypeStat(options.type);

    // Notify listeners
    this.advisoryListeners.forEach(cb => cb(advisory));

    // Send to renderer
    this.notifyRenderer(advisory);

    log.info(`[SystemAdvisoryService] Suggested: ${advisory.title}`);
    return advisory;
  }

  private isTypeEnabled(type: AdvisoryType, config: AdvisoryConfig): boolean {
    switch (type) {
      case 'performance': return config.showPerformance;
      case 'memory': return config.showMemory;
      case 'battery': return config.showBattery;
      case 'storage': return config.showStorage;
      case 'maintenance': return config.showMaintenance;
      case 'usage-pattern': return config.showUsagePatterns;
      case 'feature-tip': return config.showFeatureTips;
      default: return true;
    }
  }

  private meetsPriorityThreshold(priority: AdvisoryPriority, threshold: AdvisoryPriority): boolean {
    const order: AdvisoryPriority[] = ['low', 'medium', 'high'];
    return order.indexOf(priority) >= order.indexOf(threshold);
  }

  private comparePriority(a: AdvisoryPriority, b: AdvisoryPriority): number {
    const order: AdvisoryPriority[] = ['low', 'medium', 'high'];
    return order.indexOf(a) - order.indexOf(b);
  }

  private findLowestPriority(advisories: Advisory[]): Advisory | null {
    if (advisories.length === 0) return null;
    return advisories.reduce((lowest, current) => 
      this.comparePriority(current.priority, lowest.priority) < 0 ? current : lowest
    );
  }

  private isQuietHours(config: AdvisoryConfig): boolean {
    if (config.quietHoursStart === null || config.quietHoursEnd === null) {
      return false;
    }

    const hour = new Date().getHours();
    const start = config.quietHoursStart;
    const end = config.quietHoursEnd;

    if (start <= end) {
      return hour >= start && hour < end;
    } else {
      // Quiet hours span midnight
      return hour >= start || hour < end;
    }
  }

  // -------------------------------------------------------------------------
  // ADVISORY ACTIONS
  // -------------------------------------------------------------------------

  async dismiss(advisoryId: string): Promise<boolean> {
    const activeAdvisories = advisoryStore.get('activeAdvisories');
    const index = activeAdvisories.findIndex(a => a.id === advisoryId);
    
    if (index === -1) return false;

    const advisory = activeAdvisories[index];
    advisory.dismissedAt = Date.now();
    
    // Remove from active
    activeAdvisories.splice(index, 1);
    advisoryStore.set('activeAdvisories', activeAdvisories);

    // Add to dismissed (to prevent repeat)
    const dismissedIds = advisoryStore.get('dismissedIds');
    const key = `${advisory.type}_${advisory.title}`;
    if (!dismissedIds.includes(key)) {
      dismissedIds.push(key);
      // Keep only recent dismissals
      if (dismissedIds.length > 50) dismissedIds.splice(0, dismissedIds.length - 50);
      advisoryStore.set('dismissedIds', dismissedIds);
    }

    // Update stats
    this.incrementStat('totalDismissed');

    return true;
  }

  async actOn(advisoryId: string): Promise<boolean> {
    const activeAdvisories = advisoryStore.get('activeAdvisories');
    const advisory = activeAdvisories.find(a => a.id === advisoryId);
    
    if (!advisory || !advisory.actionId) return false;

    // Execute action
    const handler = this.actionHandlers.get(advisory.actionId);
    if (handler) {
      try {
        await handler();
        log.info(`[SystemAdvisoryService] Executed action: ${advisory.actionId}`);
      } catch (error) {
        log.error(`[SystemAdvisoryService] Action failed:`, error);
        return false;
      }
    }

    // Update stats
    this.incrementStat('totalActedOn');

    // Dismiss after action
    await this.dismiss(advisoryId);

    return true;
  }

  registerActionHandler(actionId: string, handler: () => Promise<void>): void {
    this.actionHandlers.set(actionId, handler);
  }

  // -------------------------------------------------------------------------
  // BUILT-IN ADVISORIES
  // -------------------------------------------------------------------------

  async checkMemory(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    if (usagePercent > 85) {
      await this.suggest({
        type: 'memory',
        priority: 'high',
        title: 'High Memory Usage',
        message: `Dex is using ${Math.round(heapUsedMB)}MB of memory (${Math.round(usagePercent)}%)`,
        suggestion: 'Consider closing unused features or restarting Dex',
        actionId: 'compact-memory',
        actionLabel: 'Compact Memory',
        expiresInMs: 30 * 60 * 1000, // 30 minutes
      });
    } else if (usagePercent > 70) {
      await this.suggest({
        type: 'memory',
        priority: 'medium',
        title: 'Memory Usage Notice',
        message: `Memory usage is elevated (${Math.round(usagePercent)}%)`,
        expiresInMs: 60 * 60 * 1000, // 1 hour
      });
    }
  }

  async suggestBatterySaver(): Promise<void> {
    await this.suggest({
      type: 'battery',
      priority: 'medium',
      title: 'Battery Optimization',
      message: 'You\'re on battery power',
      suggestion: 'Enable battery saver mode to extend battery life',
      actionId: 'enable-battery-saver',
      actionLabel: 'Enable',
    });
  }

  async suggestMaintenance(): Promise<void> {
    await this.suggest({
      type: 'maintenance',
      priority: 'low',
      title: 'Maintenance Available',
      message: 'Dex can run routine maintenance to improve performance',
      suggestion: 'This will clean temporary files and optimize storage',
      actionId: 'run-maintenance',
      actionLabel: 'Run Now',
      expiresInMs: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  async suggestFeatureTip(feature: string, description: string): Promise<void> {
    await this.suggest({
      type: 'feature-tip',
      priority: 'low',
      title: `Tip: ${feature}`,
      message: description,
      expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getActiveAdvisories(): Advisory[] {
    this.cleanExpiredAdvisories();
    return advisoryStore.get('activeAdvisories');
  }

  getAdvisoryById(id: string): Advisory | null {
    const advisories = advisoryStore.get('activeAdvisories');
    return advisories.find(a => a.id === id) || null;
  }

  private cleanExpiredAdvisories(): void {
    const activeAdvisories = advisoryStore.get('activeAdvisories');
    const now = Date.now();
    
    const filtered = activeAdvisories.filter(a => 
      a.expiresAt === null || a.expiresAt > now
    );

    if (filtered.length !== activeAdvisories.length) {
      advisoryStore.set('activeAdvisories', filtered);
    }
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): AdvisoryConfig {
    return advisoryStore.get('config');
  }

  async updateConfig(updates: Partial<AdvisoryConfig>): Promise<AdvisoryConfig> {
    const current = advisoryStore.get('config');
    const updated = { ...current, ...updates };
    advisoryStore.set('config', updated);
    return updated;
  }

  async disableAll(): Promise<void> {
    await this.updateConfig({ enabled: false });
    // Clear all active advisories
    advisoryStore.set('activeAdvisories', []);
  }

  async enableAll(): Promise<void> {
    await this.updateConfig({ enabled: true });
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  getStats(): AdvisoryStats {
    return advisoryStore.get('stats');
  }

  private incrementStat(key: 'totalShown' | 'totalDismissed' | 'totalActedOn'): void {
    const stats = advisoryStore.get('stats');
    stats[key]++;
    advisoryStore.set('stats', stats);
  }

  private incrementTypeStat(type: AdvisoryType): void {
    const stats = advisoryStore.get('stats');
    stats.typeBreakdown[type]++;
    advisoryStore.set('stats', stats);
  }

  // -------------------------------------------------------------------------
  // LISTENERS
  // -------------------------------------------------------------------------

  onAdvisory(callback: (advisory: Advisory) => void): () => void {
    this.advisoryListeners.add(callback);
    return () => this.advisoryListeners.delete(callback);
  }

  private notifyRenderer(advisory: Advisory): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('advisory:new', advisory);
      }
    });
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const systemAdvisoryService = SystemAdvisoryService.getInstance();
export default systemAdvisoryService;
