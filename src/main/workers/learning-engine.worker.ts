// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Learning Engine Thread
// ==========================================================================
// All pattern analysis runs here. Pre-computes predictions and caches
// them so the intelligence API is a sub-millisecond lookup.
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// ------------------------------------------------------------------
// Pattern storage
// ------------------------------------------------------------------
interface AppUsage { app: string; timestamp: number; duration: number }
interface EditPattern { app: string; avgLength: number; peakHour: number; editsPerDay: number }
interface PluginCall { pluginId: string; command: string; timestamp: number; app: string }
interface TaskStat { category: string; created: number; completed: number; avgCompletionMs: number }

const appUsageHistory: AppUsage[] = [];
const editPatterns = new Map<string, EditPattern>();
const pluginCalls: PluginCall[] = [];
const taskStats = new Map<string, TaskStat>();

// ------------------------------------------------------------------
// Prediction cache -- fast lookup from main process
// ------------------------------------------------------------------
interface PredictionCache {
  predictedNextApp: string | null;
  optimalPreloadApps: string[];
  predictedPluginCommands: string[];
  suggestedContent: Record<string, string[]>;
  optimalSaveIntervalMs: Record<string, number>;
  lastRefresh: number;
}

let cache: PredictionCache = {
  predictedNextApp: null,
  optimalPreloadApps: [],
  predictedPluginCommands: [],
  suggestedContent: {},
  optimalSaveIntervalMs: {},
  lastRefresh: 0,
};

// ------------------------------------------------------------------
// Analysis functions
// ------------------------------------------------------------------
function computePredictedNextApp(currentApp: string): string | null {
  const transitions = new Map<string, number>();
  for (let i = 1; i < appUsageHistory.length; i++) {
    if (appUsageHistory[i - 1].app === currentApp) {
      const next = appUsageHistory[i].app;
      transitions.set(next, (transitions.get(next) || 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [app, count] of transitions) {
    if (count > bestCount) { best = app; bestCount = count; }
  }
  return best;
}

function computePreloadApps(): string[] {
  const fiveMinMs = 5 * 60 * 1000;
  const sessionStarts = new Map<string, number>();
  for (const u of appUsageHistory) {
    if (u.timestamp < fiveMinMs) continue;
    const relativeMs = u.timestamp % (24 * 3600 * 1000);
    if (relativeMs < fiveMinMs) {
      sessionStarts.set(u.app, (sessionStarts.get(u.app) || 0) + 1);
    }
  }
  return Array.from(sessionStarts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(e => e[0]);
}

function computePluginPredictions(): string[] {
  const freq = new Map<string, number>();
  const hour = new Date().getHours();
  for (const c of pluginCalls) {
    const callHour = new Date(c.timestamp).getHours();
    if (Math.abs(callHour - hour) <= 2) {
      const key = `${c.pluginId}:${c.command}`;
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(e => e[0]);
}

function computeOptimalSaveInterval(app: string): number {
  const pattern = editPatterns.get(app);
  if (!pattern) return 3000;
  if (pattern.editsPerDay > 50) return 2000;
  if (pattern.editsPerDay > 20) return 3000;
  return 5000;
}

function refreshCache(currentApp?: string): void {
  cache = {
    predictedNextApp: currentApp ? computePredictedNextApp(currentApp) : cache.predictedNextApp,
    optimalPreloadApps: computePreloadApps(),
    predictedPluginCommands: computePluginPredictions(),
    suggestedContent: cache.suggestedContent,
    optimalSaveIntervalMs: {},
    lastRefresh: Date.now(),
  };
  const apps = new Set(appUsageHistory.map(u => u.app));
  for (const app of apps) {
    cache.optimalSaveIntervalMs[app] = computeOptimalSaveInterval(app);
  }
}

// Auto-refresh every 5 minutes
const refreshInterval = setInterval(() => refreshCache(), 5 * 60 * 1000);

// Clean shutdown -- clear interval when worker is terminated
process.on('exit', () => clearInterval(refreshInterval));

// ------------------------------------------------------------------
// Message handler
// ------------------------------------------------------------------
function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

parentPort?.on('message', (msg: ThreadMessage) => {
  try {
    switch (msg.type) {
      case 'record-app-usage':
        appUsageHistory.push(msg.payload as AppUsage);
        if (appUsageHistory.length > 10000) appUsageHistory.splice(0, appUsageHistory.length - 10000);
        respond(msg, { ok: true });
        break;

      case 'record-edit-pattern': {
        const ep = msg.payload as EditPattern;
        editPatterns.set(ep.app, ep);
        respond(msg, { ok: true });
        break;
      }

      case 'record-plugin-call':
        pluginCalls.push(msg.payload as PluginCall);
        if (pluginCalls.length > 5000) pluginCalls.splice(0, pluginCalls.length - 5000);
        respond(msg, { ok: true });
        break;

      case 'record-task-stat': {
        const ts = msg.payload as TaskStat;
        taskStats.set(ts.category, ts);
        respond(msg, { ok: true });
        break;
      }

      case 'refresh-cache':
        refreshCache(msg.payload?.currentApp);
        respond(msg, { ok: true });
        break;

      case 'get-cache':
        respond(msg, cache);
        break;

      case 'predict-next-action':
        respond(msg, {
          predictedNextApp: cache.predictedNextApp,
          predictedPluginCommands: cache.predictedPluginCommands,
        });
        break;

      case 'get-optimal-save-interval':
        respond(msg, {
          intervalMs: cache.optimalSaveIntervalMs[msg.payload?.app] || 3000,
        });
        break;

      case 'get-preload-apps':
        respond(msg, { apps: cache.optimalPreloadApps });
        break;

      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
