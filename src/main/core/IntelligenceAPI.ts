// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Intelligence API
// ==========================================================================
// Main-process facade providing sub-1ms cached lookups for adaptive
// intelligence predictions. Backs the learning-engine worker thread with
// in-memory caches updated every 5 minutes. All renderer IPC calls hit
// the cache, never the worker, for predictable latency.
// ==========================================================================

import * as log from 'electron-log';
import { ipcMain, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PredictionCache {
  predictedNextApp: string;
  optimalPreloadApps: string[];
  predictedPluginCommands: string[];
  optimalSaveIntervalMs: number;
  suggestedActions: SuggestedAction[];
  contextHints: ContextHint[];
  updatedAt: number;
}

interface SuggestedAction {
  action: string;
  confidence: number;
  context: string;
}

interface ContextHint {
  type: string;
  value: string;
  relevance: number;
}

interface AppUsageRecord {
  appId: string;
  timestamp: number;
  durationMs: number;
}

interface EditPatternRecord {
  fileType: string;
  editCount: number;
  avgIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Intelligence caches (in-memory, refreshed from worker data)
// ---------------------------------------------------------------------------

const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SAVE_INTERVAL_MS = 3000;
const MAX_HISTORY_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Intelligence API
// ---------------------------------------------------------------------------

class IntelligenceAPI {
  private cache: PredictionCache = {
    predictedNextApp: '',
    optimalPreloadApps: [],
    predictedPluginCommands: [],
    optimalSaveIntervalMs: DEFAULT_SAVE_INTERVAL_MS,
    suggestedActions: [],
    contextHints: [],
    updatedAt: 0,
  };

  private appUsageHistory: AppUsageRecord[] = [];
  private appTransitions = new Map<string, Map<string, number>>();
  private hourlyAppUsage: Array<Map<string, number>> = [];
  private editPatterns = new Map<string, EditPatternRecord>();
  private pluginCallFrequency = new Map<string, number>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  initialize(win: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = win;

    // Initialize hourly buckets (24 hours)
    for (let i = 0; i < 24; i++) {
      this.hourlyAppUsage.push(new Map());
    }

    this.refreshCache();
    this.refreshTimer = setInterval(() => this.refreshCache(), CACHE_REFRESH_INTERVAL_MS);
    this.registerIPC();
    this.initialized = true;
    log.info('[IntelligenceAPI] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Data recording (called from controllers and subsystems)
  // ---------------------------------------------------------------------------

  recordAppUsage(appId: string, durationMs: number): void {
    const now = Date.now();
    this.appUsageHistory.push({ appId, timestamp: now, durationMs });

    // Trim history
    if (this.appUsageHistory.length > MAX_HISTORY_ENTRIES) {
      this.appUsageHistory = this.appUsageHistory.slice(-MAX_HISTORY_ENTRIES);
    }

    // Record transition from previous app
    if (this.appUsageHistory.length >= 2) {
      const prev = this.appUsageHistory[this.appUsageHistory.length - 2].appId;
      if (prev !== appId) {
        let transitions = this.appTransitions.get(prev);
        if (!transitions) {
          transitions = new Map();
          this.appTransitions.set(prev, transitions);
        }
        transitions.set(appId, (transitions.get(appId) ?? 0) + 1);
      }
    }

    // Record hourly usage
    const hour = new Date(now).getHours();
    const hourMap = this.hourlyAppUsage[hour];
    hourMap.set(appId, (hourMap.get(appId) ?? 0) + 1);
  }

  recordEditPattern(fileType: string, editCount: number, avgIntervalMs: number): void {
    this.editPatterns.set(fileType, { fileType, editCount, avgIntervalMs });
  }

  recordPluginCall(command: string): void {
    this.pluginCallFrequency.set(command, (this.pluginCallFrequency.get(command) ?? 0) + 1);
  }

  // ---------------------------------------------------------------------------
  // Prediction computation (runs on refresh, results cached for fast reads)
  // ---------------------------------------------------------------------------

  private refreshCache(): void {
    const start = performance.now();

    const nextApp = this.predictNextApp();
    const preloadApps = this.computeOptimalPreloadApps();
    const pluginCommands = this.computePredictedPluginCommands();
    const saveInterval = this.computeOptimalSaveInterval();
    const suggestedActions = this.computeSuggestedActions();
    const contextHints = this.computeContextHints();

    this.cache = {
      predictedNextApp: nextApp,
      optimalPreloadApps: preloadApps,
      predictedPluginCommands: pluginCommands,
      optimalSaveIntervalMs: saveInterval,
      suggestedActions,
      contextHints,
      updatedAt: Date.now(),
    };

    const elapsed = performance.now() - start;
    if (elapsed > 50) {
      log.warn(`[IntelligenceAPI] Cache refresh took ${elapsed.toFixed(1)}ms`);
    }
  }

  private predictNextApp(): string {
    if (this.appUsageHistory.length === 0) return '';
    const currentApp = this.appUsageHistory[this.appUsageHistory.length - 1].appId;
    const transitions = this.appTransitions.get(currentApp);
    if (!transitions || transitions.size === 0) return '';

    let bestApp = '';
    let bestCount = 0;
    for (const [app, count] of transitions) {
      if (count > bestCount) {
        bestCount = count;
        bestApp = app;
      }
    }

    // Also factor in time-of-day correlation
    const hour = new Date().getHours();
    const hourMap = this.hourlyAppUsage[hour];
    if (hourMap.size > 0) {
      let hourBestApp = '';
      let hourBestCount = 0;
      for (const [app, count] of hourMap) {
        if (count > hourBestCount && app !== currentApp) {
          hourBestCount = count;
          hourBestApp = app;
        }
      }
      // If the hourly prediction is strong, blend it
      if (hourBestApp && hourBestCount > bestCount * 0.5) {
        return hourBestApp;
      }
    }

    return bestApp;
  }

  private computeOptimalPreloadApps(): string[] {
    // Top 3 most likely next apps based on transition frequency
    const frequency = new Map<string, number>();
    for (const [, transitions] of this.appTransitions) {
      for (const [app, count] of transitions) {
        frequency.set(app, (frequency.get(app) ?? 0) + count);
      }
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([app]) => app);
  }

  private computePredictedPluginCommands(): string[] {
    return Array.from(this.pluginCallFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cmd]) => cmd);
  }

  private computeOptimalSaveInterval(): number {
    if (this.editPatterns.size === 0) return DEFAULT_SAVE_INTERVAL_MS;

    let totalInterval = 0;
    let count = 0;
    for (const [, pattern] of this.editPatterns) {
      if (pattern.avgIntervalMs > 0) {
        totalInterval += pattern.avgIntervalMs;
        count++;
      }
    }

    if (count === 0) return DEFAULT_SAVE_INTERVAL_MS;

    // Save interval is half the average edit interval, clamped between 1s and 10s
    const avgInterval = totalInterval / count;
    return Math.max(1000, Math.min(10000, Math.floor(avgInterval * 0.5)));
  }

  private computeSuggestedActions(): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const hour = new Date().getHours();
    const hourMap = this.hourlyAppUsage[hour];

    if (hourMap.size > 0) {
      const topApps = Array.from(hourMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [appId, count] of topApps) {
        const total = Array.from(hourMap.values()).reduce((s, v) => s + v, 0);
        const confidence = total > 0 ? count / total : 0;
        if (confidence > 0.2) {
          actions.push({
            action: `open-app:${appId}`,
            confidence,
            context: `Frequently used at ${hour}:00`,
          });
        }
      }
    }

    return actions;
  }

  private computeContextHints(): ContextHint[] {
    const hints: ContextHint[] = [];

    // Current focus pattern
    if (this.appUsageHistory.length > 0) {
      const recent = this.appUsageHistory.slice(-10);
      const uniqueApps = new Set(recent.map(r => r.appId));
      if (uniqueApps.size <= 2) {
        hints.push({ type: 'focus-mode', value: 'deep-work', relevance: 0.8 });
      } else if (uniqueApps.size >= 5) {
        hints.push({ type: 'focus-mode', value: 'multitasking', relevance: 0.7 });
      }
    }

    // Active editing
    const activeEdits = Array.from(this.editPatterns.values()).filter(p => p.editCount > 10);
    if (activeEdits.length > 0) {
      hints.push({
        type: 'activity',
        value: 'active-editing',
        relevance: Math.min(1, activeEdits.length * 0.3),
      });
    }

    return hints;
  }

  // ---------------------------------------------------------------------------
  // Read API (sub-1ms, reads from in-memory cache)
  // ---------------------------------------------------------------------------

  predictNextAction(): string {
    return this.cache.predictedNextApp;
  }

  getOptimalPreloadApps(): string[] {
    return this.cache.optimalPreloadApps;
  }

  getPredictedPluginCommands(): string[] {
    return this.cache.predictedPluginCommands;
  }

  getOptimalSaveInterval(): number {
    return this.cache.optimalSaveIntervalMs;
  }

  getSuggestedActions(): SuggestedAction[] {
    return this.cache.suggestedActions;
  }

  getContextHints(): ContextHint[] {
    return this.cache.contextHints;
  }

  getFullCache(): PredictionCache {
    return { ...this.cache };
  }

  // ---------------------------------------------------------------------------
  // IPC handlers
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('intelligence:predict-next', () => {
      return this.predictNextAction();
    });

    ipcMain.handle('intelligence:preload-apps', () => {
      return this.getOptimalPreloadApps();
    });

    ipcMain.handle('intelligence:plugin-commands', () => {
      return this.getPredictedPluginCommands();
    });

    ipcMain.handle('intelligence:save-interval', () => {
      return this.getOptimalSaveInterval();
    });

    ipcMain.handle('intelligence:suggested-actions', () => {
      return this.getSuggestedActions();
    });

    ipcMain.handle('intelligence:context-hints', () => {
      return this.getContextHints();
    });

    ipcMain.handle('intelligence:full-cache', () => {
      return this.getFullCache();
    });

    ipcMain.handle('intelligence:record-app-usage', (_e, appId: string, durationMs: number) => {
      this.recordAppUsage(appId, durationMs);
      return true;
    });

    ipcMain.handle('intelligence:record-edit-pattern', (_e, fileType: string, editCount: number, avgIntervalMs: number) => {
      this.recordEditPattern(fileType, editCount, avgIntervalMs);
      return true;
    });

    ipcMain.handle('intelligence:record-plugin-call', (_e, command: string) => {
      this.recordPluginCall(command);
      return true;
    });

    ipcMain.handle('intelligence:refresh', () => {
      this.refreshCache();
      return this.getFullCache();
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.appUsageHistory = [];
    this.appTransitions.clear();
    this.editPatterns.clear();
    this.pluginCallFrequency.clear();
    this.initialized = false;
    log.info('[IntelligenceAPI] Shutdown complete');
  }
}

export const intelligenceAPI = new IntelligenceAPI();

export function initializeIntelligenceAPI(win: BrowserWindow): void {
  intelligenceAPI.initialize(win);
}

export function shutdownIntelligenceAPI(): void {
  intelligenceAPI.shutdown();
}
