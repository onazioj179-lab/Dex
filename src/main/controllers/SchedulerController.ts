// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Smart Scheduling Controller
// Intelligent triggers: time, location, app-aware, calendar-based
// =============================================================================

import { ipcMain, app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type TriggerType = 
  | 'time'           // At specific time
  | 'time-range'     // During time range
  | 'interval'       // Every X minutes/hours
  | 'app-launch'     // When app launches
  | 'app-close'      // When app closes
  | 'app-focus'      // When app gains focus
  | 'network'        // Network state change
  | 'battery'        // Battery level/state
  | 'idle'           // System idle for X time
  | 'startup'        // System startup
  | 'shutdown'       // Before shutdown
  | 'calendar'       // Calendar event
  | 'file-change'    // File/folder modified
  | 'usb'            // USB device connected/disconnected
  | 'display'        // Display connected/disconnected
  | 'custom';        // Custom condition

export type TriggerConditionOperator = 
  | 'equals' 
  | 'not-equals' 
  | 'greater-than' 
  | 'less-than' 
  | 'contains' 
  | 'starts-with' 
  | 'ends-with'
  | 'matches-regex';

export interface TriggerCondition {
  field: string;
  type?: 'cpu-below' | 'memory-below' | 'battery-above' | 'on-ac-power' | 'idle-time' | 'network-available';
  operator: TriggerConditionOperator;
  value: string | number | boolean;
}

export interface ScheduledTrigger {
  id: string;
  name: string;
  description?: string;
  type: TriggerType;
  enabled: boolean;
  
  // Trigger configuration
  config: TriggerConfig;
  
  // Actions to execute
  actions: TriggerAction[];
  
  // Additional conditions (all must be true)
  conditions: TriggerCondition[];
  
  // Cooldown between executions (ms)
  cooldown: number;
  
  // Execution limits
  maxExecutions?: number;
  executionCount: number;
  
  // Time restrictions
  activeHours?: { start: string; end: string };
  activeDays?: number[]; // 0-6 (Sunday-Saturday)
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  lastTriggered?: number;
  nextScheduled?: number;
}

export interface TriggerConfig {
  // Time-based
  time?: string;              // HH:MM format
  timeEnd?: string;           // For time-range
  interval?: number;          // Minutes
  cron?: string;              // Cron expression
  
  // App-based
  appName?: string;
  processName?: string;
  
  // Battery-based
  batteryLevel?: number;
  batteryState?: 'charging' | 'discharging' | 'full';
  
  // Network-based
  networkState?: 'connected' | 'disconnected';
  networkType?: 'wifi' | 'ethernet' | 'cellular';
  ssid?: string;
  
  // Idle-based
  idleTime?: number;          // Seconds
  
  // File-based
  watchPath?: string;
  watchEvents?: ('create' | 'modify' | 'delete')[];
  
  // Calendar-based
  calendarId?: string;
  eventFilter?: string;
  minutesBefore?: number;
  
  // USB-based
  vendorId?: string;
  productId?: string;
  deviceName?: string;
  
  // Custom
  customScript?: string;
}

export interface TriggerAction {
  id: string;
  type: 'workflow' | 'operation' | 'mode' | 'command' | 'notification' | 'script' | 'open-app' | 'open-url' | 'run-workflow' | 'send-notification' | 'run-script' | 'change-mode' | 'toggle-feature';
  target: string;
  params?: Record<string, any>;
  delay?: number;             // Delay before execution (ms)
}

export interface TriggerExecutionLog {
  id: string;
  triggerId: string;
  triggerName: string;
  timestamp: number;
  success: boolean;
  duration: number;
  error?: string;
  actionsExecuted: number;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

const schedulerStore = new Store<{
  triggers: Record<string, ScheduledTrigger>;
  executionLog: TriggerExecutionLog[];
  settings: {
    enabled: boolean;
    maxLogEntries: number;
    defaultCooldown: number;
  };
}>({
  name: 'dex-scheduler',
  defaults: {
    triggers: {},
    executionLog: [],
    settings: {
      enabled: true,
      maxLogEntries: 1000,
      defaultCooldown: 60000, // 1 minute
    },
  },
});

// -----------------------------------------------------------------------------
// Scheduler State
// -----------------------------------------------------------------------------

class SmartScheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private watchers: Map<string, any> = new Map();
  private lastCheckTime: number = Date.now();
  private checkInterval: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Function> = new Map();

  // Initialize scheduler
  initialize() {
    log.info('[Scheduler] Initializing smart scheduler...');
    
    // Start periodic check (15s interval for better performance - was 5s)
    this.checkInterval = setInterval(() => this.checkTriggers(), 15000);
    
    // Setup IPC handlers
    this.setupIpcHandlers();
    
    // Load and activate triggers
    this.activateAllTriggers();
    
    log.info('[Scheduler] Smart scheduler initialized');
  }

  // Shutdown scheduler
  shutdown() {
    log.info('[Scheduler] Shutting down...');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    
    // Close all watchers
    this.watchers.forEach(watcher => {
      if (watcher.close) watcher.close();
    });
    this.watchers.clear();
  }

  // Setup IPC handlers
  private setupIpcHandlers() {
    ipcMain.handle('scheduler:get-triggers', () => {
      return Object.values(schedulerStore.get('triggers'));
    });

    ipcMain.handle('scheduler:get-trigger', (_, id: string) => {
      return schedulerStore.get(`triggers.${id}`);
    });

    ipcMain.handle('scheduler:create-trigger', (_, trigger: Omit<ScheduledTrigger, 'id' | 'createdAt' | 'updatedAt' | 'executionCount'>) => {
      return this.createTrigger(trigger);
    });

    ipcMain.handle('scheduler:update-trigger', (_, id: string, updates: Partial<ScheduledTrigger>) => {
      return this.updateTrigger(id, updates);
    });

    ipcMain.handle('scheduler:delete-trigger', (_, id: string) => {
      return this.deleteTrigger(id);
    });

    ipcMain.handle('scheduler:toggle-trigger', (_, id: string, enabled: boolean) => {
      return this.toggleTrigger(id, enabled);
    });

    ipcMain.handle('scheduler:execute-trigger', (_, id: string) => {
      return this.executeTrigger(id);
    });

    ipcMain.handle('scheduler:get-execution-log', (_, triggerId?: string) => {
      const logs = schedulerStore.get('executionLog');
      return triggerId ? logs.filter(l => l.triggerId === triggerId) : logs;
    });

    ipcMain.handle('scheduler:get-settings', () => {
      return schedulerStore.get('settings');
    });

    ipcMain.handle('scheduler:update-settings', (_, settings: Partial<typeof schedulerStore.store.settings>) => {
      schedulerStore.set('settings', { ...schedulerStore.get('settings'), ...settings });
      return schedulerStore.get('settings');
    });
  }

  // Create trigger
  createTrigger(trigger: Omit<ScheduledTrigger, 'id' | 'createdAt' | 'updatedAt' | 'executionCount'>): ScheduledTrigger {
    const id = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const newTrigger: ScheduledTrigger = {
      ...trigger,
      id,
      createdAt: now,
      updatedAt: now,
      executionCount: 0,
    };
    
    schedulerStore.set(`triggers.${id}`, newTrigger);
    
    if (newTrigger.enabled) {
      this.activateTrigger(newTrigger);
    }
    
    log.info(`[Scheduler] Created trigger: ${newTrigger.name}`);
    return newTrigger;
  }

  // Update trigger
  updateTrigger(id: string, updates: Partial<ScheduledTrigger>): ScheduledTrigger | null {
    const trigger = schedulerStore.get(`triggers.${id}`) as ScheduledTrigger | undefined;
    if (!trigger) return null;
    
    // Deactivate old trigger
    this.deactivateTrigger(id);
    
    const updatedTrigger: ScheduledTrigger = {
      ...trigger,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now(),
    };
    
    schedulerStore.set(`triggers.${id}`, updatedTrigger);
    
    if (updatedTrigger.enabled) {
      this.activateTrigger(updatedTrigger);
    }
    
    log.info(`[Scheduler] Updated trigger: ${updatedTrigger.name}`);
    return updatedTrigger;
  }

  // Delete trigger
  deleteTrigger(id: string): boolean {
    const trigger = schedulerStore.get(`triggers.${id}`);
    if (!trigger) return false;
    
    this.deactivateTrigger(id);
    
    const triggers = schedulerStore.get('triggers');
    delete triggers[id];
    schedulerStore.set('triggers', triggers);
    
    log.info(`[Scheduler] Deleted trigger: ${id}`);
    return true;
  }

  // Toggle trigger
  toggleTrigger(id: string, enabled: boolean): ScheduledTrigger | null {
    return this.updateTrigger(id, { enabled });
  }

  // Activate all triggers
  private activateAllTriggers() {
    const triggers = Object.values(schedulerStore.get('triggers')) as ScheduledTrigger[];
    triggers.filter(t => t.enabled).forEach(t => this.activateTrigger(t));
    log.info(`[Scheduler] Activated ${triggers.filter(t => t.enabled).length} triggers`);
  }

  // Activate single trigger
  private activateTrigger(trigger: ScheduledTrigger) {
    switch (trigger.type) {
      case 'time':
        this.scheduleTimeBasedTrigger(trigger);
        break;
      case 'interval':
        this.scheduleIntervalTrigger(trigger);
        break;
      case 'app-launch':
      case 'app-close':
      case 'app-focus':
        this.setupAppWatcher(trigger);
        break;
      case 'idle':
        this.setupIdleWatcher(trigger);
        break;
      case 'file-change':
        this.setupFileWatcher(trigger);
        break;
      // Add more trigger types as needed
    }
  }

  // Deactivate trigger
  private deactivateTrigger(id: string) {
    // Clear timer
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    
    // Close watcher
    const watcher = this.watchers.get(id);
    if (watcher) {
      if (watcher.close) watcher.close();
      this.watchers.delete(id);
    }
  }

  // Schedule time-based trigger
  private scheduleTimeBasedTrigger(trigger: ScheduledTrigger) {
    if (!trigger.config.time) return;
    
    const [hours, minutes] = trigger.config.time.split(':').map(Number);
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(hours, minutes, 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const delay = targetTime.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      this.executeTrigger(trigger.id);
      // Reschedule for next day
      this.scheduleTimeBasedTrigger(trigger);
    }, delay);
    
    this.timers.set(trigger.id, timer);
    
    // Update next scheduled time
    schedulerStore.set(`triggers.${trigger.id}.nextScheduled`, targetTime.getTime());
  }

  // Schedule interval trigger
  private scheduleIntervalTrigger(trigger: ScheduledTrigger) {
    if (!trigger.config.interval) return;
    
    const intervalMs = trigger.config.interval * 60 * 1000;
    
    const timer = setInterval(() => {
      this.executeTrigger(trigger.id);
    }, intervalMs);
    
    this.timers.set(trigger.id, timer);
  }

  // Setup app watcher
  private setupAppWatcher(trigger: ScheduledTrigger) {
    // This would integrate with system APIs to watch for app events
    // Implementation depends on platform (Windows/macOS/Linux)
    log.info(`[Scheduler] App watcher setup for: ${trigger.config.appName}`);
  }

  // Setup idle watcher
  private setupIdleWatcher(trigger: ScheduledTrigger) {
    // Uses electron's powerMonitor
    const { powerMonitor } = require('electron');
    
    const checkIdle = () => {
      const idleTime = powerMonitor.getSystemIdleTime();
      if (trigger.config.idleTime && idleTime >= trigger.config.idleTime) {
        this.executeTrigger(trigger.id);
      }
    };
    
    const interval = setInterval(checkIdle, 10000);
    this.timers.set(`${trigger.id}-idle`, interval);
  }

  // Setup file watcher
  private setupFileWatcher(trigger: ScheduledTrigger) {
    if (!trigger.config.watchPath) return;
    
    const fs = require('fs');
    const watcher = fs.watch(trigger.config.watchPath, (eventType: string) => {
      if (trigger.config.watchEvents?.includes(eventType as any)) {
        this.executeTrigger(trigger.id);
      }
    });
    
    this.watchers.set(trigger.id, watcher);
  }

  // Check triggers (called every second)
  private checkTriggers() {
    const now = Date.now();
    const triggers = Object.values(schedulerStore.get('triggers')) as ScheduledTrigger[];
    
    // Check time-range triggers
    triggers
      .filter(t => t.enabled && t.type === 'time-range')
      .forEach(trigger => {
        if (this.isInTimeRange(trigger)) {
          this.executeTrigger(trigger.id);
        }
      });
    
    this.lastCheckTime = now;
  }

  // Check if current time is in trigger's time range
  private isInTimeRange(trigger: ScheduledTrigger): boolean {
    if (!trigger.config.time || !trigger.config.timeEnd) return false;
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = trigger.config.time.split(':').map(Number);
    const [endH, endM] = trigger.config.timeEnd.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Execute trigger
  async executeTrigger(id: string): Promise<boolean> {
    const trigger = schedulerStore.get(`triggers.${id}`) as ScheduledTrigger | undefined;
    if (!trigger || !trigger.enabled) return false;
    
    // Check cooldown
    if (trigger.lastTriggered && Date.now() - trigger.lastTriggered < trigger.cooldown) {
      return false;
    }
    
    // Check max executions
    if (trigger.maxExecutions && trigger.executionCount >= trigger.maxExecutions) {
      return false;
    }
    
    // Check conditions
    if (!this.checkConditions(trigger)) {
      return false;
    }
    
    // Check active hours
    if (!this.isWithinActiveHours(trigger)) {
      return false;
    }
    
    // Check active days
    if (!this.isActiveDay(trigger)) {
      return false;
    }
    
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    let actionsExecuted = 0;
    
    try {
      // Execute actions
      for (const action of trigger.actions) {
        if (action.delay) {
          await new Promise(resolve => setTimeout(resolve, action.delay));
        }
        
        await this.executeAction(action);
        actionsExecuted++;
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      log.error(`[Scheduler] Trigger execution failed: ${error}`);
    }
    
    const duration = Date.now() - startTime;
    
    // Update trigger stats
    schedulerStore.set(`triggers.${id}.lastTriggered`, Date.now());
    schedulerStore.set(`triggers.${id}.executionCount`, trigger.executionCount + 1);
    
    // Log execution
    this.logExecution({
      id: `log-${Date.now()}`,
      triggerId: id,
      triggerName: trigger.name,
      timestamp: Date.now(),
      success,
      duration,
      error,
      actionsExecuted,
    });
    
    log.info(`[Scheduler] Executed trigger: ${trigger.name} (${success ? 'success' : 'failed'})`);
    return success;
  }

  // Execute single action
  private async executeAction(action: TriggerAction): Promise<void> {
    log.info(`[Scheduler] Executing action: ${action.type} -> ${action.target}`);
    
    const { BrowserWindow, shell, app } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows()[0];

    switch (action.type) {
      case 'open-app':
        // Open external application
        if (action.target) {
          await shell.openPath(action.target);
        }
        break;

      case 'open-url':
        // Open URL in browser or internal browser
        if (action.target) {
          if (action.params?.internal && mainWindow) {
            mainWindow.webContents.send('browser:navigate', action.target);
          } else {
            try {
              const parsed = new URL(action.target);
              if (['http:', 'https:'].includes(parsed.protocol)) {
                await shell.openExternal(action.target);
              }
            } catch {
              // Invalid URL — skip
            }
          }
        }
        break;

      case 'run-workflow':
        // Execute a DEX workflow
        if (mainWindow && action.target) {
          mainWindow.webContents.send('workflow:execute', { id: action.target, params: action.params });
        }
        break;

      case 'send-notification':
        // Show system notification
        const { Notification } = require('electron');
        new Notification({
          title: action.params?.title || 'DEX Scheduled Task',
          body: action.target || 'Scheduled action executed',
          icon: action.params?.icon
        }).show();
        break;

      case 'run-script':
        // Security: Scheduler scripts are disabled for safety
        // Arbitrary shell execution from scheduled actions is a critical risk vector
        log.warn(`[Scheduler] Blocked run-script action: ${(action.target || '').substring(0, 80)}`);
        break;

      case 'change-mode':
        // Change DEX mode (work, gaming, etc.)
        if (mainWindow && action.target) {
          mainWindow.webContents.send('mode:change', action.target);
        }
        break;

      case 'toggle-feature':
        // Toggle a feature flag
        if (mainWindow && action.target) {
          mainWindow.webContents.send('feature:toggle', { feature: action.target, value: action.params?.value });
        }
        break;

      default:
        // Send generic action to renderer
        if (mainWindow) {
          mainWindow.webContents.send('scheduler:action', action);
        }
    }
  }

  // Check additional conditions
  private checkConditions(trigger: ScheduledTrigger): boolean {
    if (!trigger.conditions || trigger.conditions.length === 0) return true;
    
    const os = require('os');
    const { powerMonitor } = require('electron');
    
    return trigger.conditions.every(condition => {
      const numericValue = typeof condition.value === 'number' ? condition.value : Number(condition.value);
      
      switch (condition.type) {
        case 'cpu-below':
          // Check if CPU usage is below threshold
          const cpus = os.cpus();
          const avgLoad = cpus.reduce((sum: number, cpu: any) => {
            const total = Object.values(cpu.times).reduce((a: number, b: any) => a + b, 0) as number;
            return sum + ((total - cpu.times.idle) / total);
          }, 0) / cpus.length;
          return avgLoad * 100 < (numericValue || 50);

        case 'memory-below':
          // Check if memory usage is below threshold
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const memUsage = ((totalMem - freeMem) / totalMem) * 100;
          return memUsage < (numericValue || 80);

        case 'battery-above':
          // Check if battery is above threshold (if on battery)
          const batteryLevel = (powerMonitor as any).getBatteryLevel?.() ?? 1;
          return batteryLevel * 100 >= (numericValue || 20);

        case 'on-ac-power':
          // Check if plugged in
          return !powerMonitor.isOnBatteryPower();

        case 'idle-time':
          // Check if system has been idle for specified seconds
          const idleTime = powerMonitor.getSystemIdleTime();
          return idleTime >= (numericValue || 60);

        case 'network-available':
          // Check network connectivity
          return require('os').networkInterfaces() !== undefined;

        default:
          return true;
      }
    });
  }

  // Check if within active hours
  private isWithinActiveHours(trigger: ScheduledTrigger): boolean {
    if (!trigger.activeHours) return true;
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = trigger.activeHours.start.split(':').map(Number);
    const [endH, endM] = trigger.activeHours.end.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Check if active day
  private isActiveDay(trigger: ScheduledTrigger): boolean {
    if (!trigger.activeDays || trigger.activeDays.length === 0) return true;
    return trigger.activeDays.includes(new Date().getDay());
  }

  // Log execution
  private logExecution(entry: TriggerExecutionLog) {
    const logs = schedulerStore.get('executionLog');
    const settings = schedulerStore.get('settings');
    
    logs.unshift(entry);
    
    // Trim logs if needed
    if (logs.length > settings.maxLogEntries) {
      logs.length = settings.maxLogEntries;
    }
    
    schedulerStore.set('executionLog', logs);
  }
}

// -----------------------------------------------------------------------------
// Export singleton
// -----------------------------------------------------------------------------

export const smartScheduler = new SmartScheduler();

// Initialize on module load
export function initializeScheduler() {
  smartScheduler.initialize();
}

export function shutdownScheduler() {
  smartScheduler.shutdown();
}
