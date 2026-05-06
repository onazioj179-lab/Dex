/**
 * ===========================================================================
 * DEX -- Data Store
 * ===========================================================================
 *
 * Local-first data persistence using electron-store.
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

import Store from 'electron-store';
import * as log from 'electron-log';
import { DexAction, DexMode, DexRule, DexPermissions } from '../../shared/types';

interface StoreSchema {
  actions: DexAction[];
  modes: DexMode[];
  rules: DexRule[];
  notes: any[];
  tasks: any[];
  workflows: any[];
  operations: any[];
  timers: any[];
  permissions: DexPermissions;
  automations: any[];
  settings: {
    startOnBoot: boolean;
    minimizeToTray: boolean;
    theme: 'dark' | 'light';
  };
  logs: Array<{
    id: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    data?: any;
  }>;
  sessions: Array<{
    id: string;
    startedAt: number;
    endedAt?: number;
    active: boolean;
  }>;
  activities: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: number;
    read: boolean;
    data?: any;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    path?: string;
    active: boolean;
    createdAt: number;
    updatedAt?: number;
  }>;
  automationQueue: Array<{
    id: string;
    action: string;
    status: 'pending' | 'approved' | 'denied';
    createdAt: number;
    data?: any;
  }>;
  themeConfig: {
    mode: string;
    accentColor: string;
    fontScale: number;
    reducedMotion: boolean;
    density: string;
  };
  tags: Array<{
    id: string;
    name: string;
    color?: string;
    createdAt: number;
  }>;
  focusSessions: Array<{
    id: string;
    startedAt: number;
    endedAt?: number;
    active: boolean;
    mode?: string;
  }>;
  sessionNotes: Array<{
    id: string;
    sessionId: string;
    content: string;
    createdAt: number;
    updatedAt?: number;
  }>;
  sessionTimers: Array<{
    id: string;
    label: string;
    duration: number;
    remaining: number;
    status: 'idle' | 'running' | 'paused' | 'done';
    createdAt: number;
  }>;
  events: Array<{
    id: string;
    type: string;
    data?: any;
    timestamp: number;
  }>;
  emergencyMode: boolean;
  fileScopes: string[];
  appliedSettings: Record<string, any>;
  currentSession: any | null;
  archivedSessions: any[];
}

function generateId(): string {
  const bytes = require('crypto').randomBytes(8).toString('hex');
  return `${Date.now()}-${bytes}`;
}

export class DataStore {
  private static storeInstance: Store<StoreSchema> | null = null;
  private static sharedReadCache = new Map<string, { value: any; expires: number }>();
  private store: Store<StoreSchema>;
  
  // Item 151: Read coalescing — cache hot reads for 16ms (one frame) to avoid
  // redundant disk reads when multiple controllers query the same key in a tick
  private readCache = DataStore.sharedReadCache;
  private static READ_CACHE_TTL_MS = 16;

  constructor() {
    if (!DataStore.storeInstance) {
      DataStore.storeInstance = new Store<StoreSchema>({
        name: 'dex-data',
        defaults: {
          actions: this.getDefaultActions(),
          modes: this.getDefaultModes(),
          rules: [],
          notes: [],
          tasks: [],
          workflows: [],
          operations: [],
          timers: [],
          automations: [],
          permissions: {
            openApps: true,
            closeApps: false,
            runCommands: false,
            adjustVolume: true,
            fileSystem: false,
            network: false,
          },
          settings: {
            startOnBoot: false,
            minimizeToTray: true,
            theme: 'dark',
          },
          logs: [],
          sessions: [],
          activities: [],
          projects: [],
          automationQueue: [],
          themeConfig: {
            mode: 'dark',
            accentColor: '#0a84ff',
            fontScale: 1.0,
            reducedMotion: false,
            density: 'comfortable',
          },
          tags: [],
          focusSessions: [],
          sessionNotes: [],
          sessionTimers: [],
          events: [],
          emergencyMode: false,
          fileScopes: [],
          appliedSettings: {},
          currentSession: null,
          archivedSessions: [],
        },
      });
    }

    this.store = DataStore.storeInstance;
  }

  async initialize(): Promise<void> {
    // Migration logic can go here
    log.info('[DataStore] Initialized at:', this.store.path);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  getActions(): DexAction[] {
    return this.store.get('actions');
  }

  async saveAction(action: Partial<DexAction>): Promise<DexAction> {
    const actions = this.getActions();
    
    if (action.id) {
      // Update existing
      const index = actions.findIndex(a => a.id === action.id);
      if (index !== -1) {
        actions[index] = { ...actions[index], ...action } as DexAction;
      }
    } else {
      // Create new
      const newAction: DexAction = {
        id: generateId(),
        name: action.name || 'New Action',
        type: action.type || 'open-app',
        target: action.target || '',
        args: action.args || [],
        icon: action.icon || 'zap',
        color: action.color || '#6366f1',
        enabled: action.enabled !== false,
        createdAt: Date.now(),
      };
      actions.push(newAction);
      this.store.set('actions', actions);
      return newAction;
    }
    
    this.store.set('actions', actions);
    const saved = actions.find(a => a.id === action.id);
    if (!saved) {
      throw new Error(`Failed to find action with id ${action.id} after save`);
    }
    return saved;
  }

  async deleteAction(actionId: string): Promise<void> {
    const actions = this.getActions().filter(a => a.id !== actionId);
    this.store.set('actions', actions);
  }

  // -------------------------------------------------------------------------
  // Modes
  // -------------------------------------------------------------------------
  getModes(): DexMode[] {
    return this.store.get('modes');
  }

  async saveMode(mode: Partial<DexMode>): Promise<DexMode> {
    const modes = this.getModes();
    
    if (mode.id) {
      const index = modes.findIndex(m => m.id === mode.id);
      if (index !== -1) {
        modes[index] = { ...modes[index], ...mode } as DexMode;
      }
    } else {
      const newMode: DexMode = {
        id: generateId(),
        name: mode.name || 'New Mode',
        description: mode.description || '',
        icon: mode.icon || 'layout-grid',
        color: mode.color || '#6366f1',
        actions: mode.actions || [],
        enableRules: mode.enableRules || [],
        disableRules: mode.disableRules || [],
        schedule: mode.schedule,
        active: false,
        createdAt: Date.now(),
      };
      modes.push(newMode);
      this.store.set('modes', modes);
      return newMode;
    }
    
    this.store.set('modes', modes);
    return modes.find(m => m.id === mode.id)!;
  }

  async deleteMode(modeId: string): Promise<void> {
    const modes = this.getModes().filter(m => m.id !== modeId);
    this.store.set('modes', modes);
  }

  async setActiveMode(modeId: string | null): Promise<void> {
    const modes = this.getModes().map(m => ({
      ...m,
      active: m.id === modeId,
    }));
    this.store.set('modes', modes);
  }

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------
  getRules(): DexRule[] {
    return this.store.get('rules');
  }

  async saveRule(rule: Partial<DexRule>): Promise<DexRule> {
    const rules = this.getRules();
    
    if (rule.id) {
      const index = rules.findIndex(r => r.id === rule.id);
      if (index !== -1) {
        rules[index] = { ...rules[index], ...rule } as DexRule;
      }
    } else {
      const newRule: DexRule = {
        id: generateId(),
        name: rule.name || 'New Rule',
        description: rule.description || '',
        enabled: rule.enabled !== false,
        conditions: rule.conditions || [],
        actions: rule.actions || [],
        cooldown: rule.cooldown || 60000, // 1 minute default
        lastTriggered: null,
        triggerCount: 0,
        createdAt: Date.now(),
      };
      rules.push(newRule);
      this.store.set('rules', rules);
      return newRule;
    }
    
    this.store.set('rules', rules);
    return rules.find(r => r.id === rule.id)!;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const rules = this.getRules().filter(r => r.id !== ruleId);
    this.store.set('rules', rules);
  }

  async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
    const rules = this.getRules();
    const index = rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      rules[index].enabled = enabled;
      this.store.set('rules', rules);
    }
  }

  async updateRuleTrigger(ruleId: string): Promise<void> {
    const rules = this.getRules();
    const index = rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      rules[index].lastTriggered = Date.now();
      rules[index].triggerCount++;
      this.store.set('rules', rules);
    }
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  getPermissions(): DexPermissions {
    return this.store.get('permissions');
  }

  async setPermission(key: keyof DexPermissions, value: boolean): Promise<void> {
    const permissions = this.getPermissions();
    permissions[key] = value;
    this.store.set('permissions', permissions);
  }

  // -------------------------------------------------------------------------
  // Generic Get/Set (for controllers)
  // -------------------------------------------------------------------------
  async get<T = any>(key: string): Promise<T | null> {
    // Item 151: Coalesce reads within 16ms window
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expires > now) {
      return cached.value as T ?? null;
    }
    const value = this.store.get(key as keyof StoreSchema) as T ?? null;
    this.readCache.set(key, { value, expires: now + DataStore.READ_CACHE_TTL_MS });
    return value;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    // Invalidate read cache on write
    this.readCache.delete(key);
    this.store.set(key as keyof StoreSchema, value as any);
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------
  getLogs(limit: number = 100): any[] {
    const logs = this.store.get('logs');
    return logs.slice(-limit);
  }

  addLog(level: 'info' | 'warn' | 'error' | 'success', message: string, data?: any): void {
    const logs = this.store.get('logs');
    logs.push({
      id: generateId(),
      timestamp: Date.now(),
      level,
      message,
      data,
    });
    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    this.store.set('logs', logs);
  }

  clearLogs(): void {
    this.store.set('logs', []);
  }

  // -------------------------------------------------------------------------
  // Default Data
  // -------------------------------------------------------------------------
  private getDefaultActions(): DexAction[] {
    // Start fresh - let user create their first action
    return [];
  }

  private getDefaultModes(): DexMode[] {
    return [
      {
        id: 'mode-work',
        name: 'Work Mode',
        description: 'Focus on productivity',
        icon: 'briefcase',
        color: '#6366f1',
        actions: [],
        enableRules: [],
        disableRules: [],
        active: false,
        createdAt: Date.now(),
      },
      {
        id: 'mode-focus',
        name: 'Focus Mode',
        description: 'Deep work, no distractions',
        icon: 'target',
        color: '#f59e0b',
        actions: [],
        enableRules: [],
        disableRules: [],
        active: false,
        createdAt: Date.now(),
      },
      {
        id: 'mode-night',
        name: 'Night Mode',
        description: 'Wind down for the day',
        icon: 'moon',
        color: '#8b5cf6',
        actions: [],
        enableRules: [],
        disableRules: [],
        active: false,
        createdAt: Date.now(),
      },
    ];
  }
}
