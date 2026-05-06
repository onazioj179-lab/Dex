// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Knowledge Domain
// Handles knowledge queries (usage stats, activity, task counts)
// ===========================================================================

import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';

// Simple in-process usage tracking (supplements learning-engine worker)
const usageLog: { app: string; ts: number }[] = [];

function getUsageLogPath(): string {
  return path.join(app.getPath('userData'), 'uki-usage.json');
}

function loadUsageLog(): void {
  try {
    const p = getUsageLogPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(data)) {
        usageLog.push(...data.slice(-5000));
      }
    }
  } catch { /* ignore */ }
}

function saveUsageLog(): void {
  try {
    fs.writeFileSync(getUsageLogPath(), JSON.stringify(usageLog.slice(-5000)));
  } catch { /* ignore */ }
}

// Called externally when apps are launched
export function recordAppUsage(appName: string): void {
  usageLog.push({ app: appName, ts: Date.now() });
  if (usageLog.length > 5000) usageLog.splice(0, usageLog.length - 5000);
  saveUsageLog();
}

// Load on import
loadUsageLog();

function getActivitySummary(period?: string): string {
  const now = Date.now();
  let cutoff = now - 7 * 24 * 60 * 60 * 1000; // Default: last 7 days
  let periodLabel = 'this week';

  if (period === 'today' || period === 'day') {
    cutoff = now - 24 * 60 * 60 * 1000;
    periodLabel = 'today';
  } else if (period === 'month') {
    cutoff = now - 30 * 24 * 60 * 60 * 1000;
    periodLabel = 'this month';
  }

  const recent = usageLog.filter(e => e.ts >= cutoff);
  if (recent.length === 0) {
    return `No activity recorded ${periodLabel}. Use some apps and I'll track it!`;
  }

  const counts: Record<string, number> = {};
  for (const e of recent) {
    counts[e.app] = (counts[e.app] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top3 = sorted.slice(0, 3).map(([name, count]) => `${name} (${count} times)`).join(', ');
  return `${periodLabel}, you've used ${sorted.length} apps a total of ${recent.length} times. Most used: ${top3}.`;
}

function getFavoriteApp(): string {
  if (usageLog.length === 0) return 'No usage data yet. Start using apps and I\'ll track your favorites!';

  const counts: Record<string, number> = {};
  for (const e of usageLog) {
    counts[e.app] = (counts[e.app] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [fav, count] = sorted[0];
  return `Your favorite app is ${fav} — you've used it ${count} times! ${sorted.length > 1 ? `Runner-up: ${sorted[1][0]} with ${sorted[1][1]} uses.` : ''}`;
}

function getUsageStats(): string {
  if (usageLog.length === 0) return 'No usage statistics available yet.';

  const uniqueApps = new Set(usageLog.map(e => e.app)).size;
  const oldest = usageLog[0]?.ts ? Math.ceil((Date.now() - usageLog[0].ts) / (24 * 60 * 60 * 1000)) : 0;
  const avgPerDay = oldest > 0 ? Math.round(usageLog.length / oldest) : usageLog.length;

  return `You've launched apps ${usageLog.length} times across ${uniqueApps} different apps over ${oldest} days. That's about ${avgPerDay} app launches per day.`;
}

function getWorkPattern(): string {
  if (usageLog.length < 10) return 'Need more usage data to detect patterns. Keep using DEX!';

  const hourBuckets = new Array(24).fill(0);
  for (const e of usageLog) {
    hourBuckets[new Date(e.ts).getHours()]++;
  }

  let peakHour = 0;
  for (let i = 1; i < 24; i++) {
    if (hourBuckets[i] > hourBuckets[peakHour]) peakHour = i;
  }

  const morning = hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0);
  const afternoon = hourBuckets.slice(12, 18).reduce((a, b) => a + b, 0);
  const evening = hourBuckets.slice(18, 24).reduce((a, b) => a + b, 0);
  const total = Math.max(morning + afternoon + evening, 1);

  const style = morning > afternoon && morning > evening ? 'morning person'
    : afternoon > morning && afternoon > evening ? 'afternoon worker'
    : 'night owl';

  const peakLabel = peakHour < 12 ? `${peakHour}:00 AM` : peakHour === 12 ? '12:00 PM' : `${peakHour - 12}:00 PM`;
  return `You're a ${style}! Peak activity is around ${peakLabel}. Morning: ${Math.round(morning / total * 100)}%, Afternoon: ${Math.round(afternoon / total * 100)}%, Evening: ${Math.round(evening / total * 100)}%.`;
}

function getSystemSummary(): string {
  const os = require('os');
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
  const uptime = Math.floor(os.uptime() / 3600);
  const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';

  return `Running on ${platform} with ${cpus.length} CPU cores (${cpus[0]?.model?.trim() || 'unknown'}), ${totalMem} GB RAM (${freeMem} GB free). System uptime: ${uptime} hours.`;
}

function getTaskCount(win: BrowserWindow): Promise<string> {
  return new Promise((resolve) => {
    const channel = `uki:knowledge:task-count-reply-${Date.now()}`;
    const timeout = setTimeout(() => {
      resolve(getActiveWindowCount(win));
    }, 1500);
    try {
      const { ipcMain } = require('electron');
      ipcMain.once(channel, (_: unknown, count: number) => {
        clearTimeout(timeout);
        if (typeof count === 'number' && count >= 0) {
          resolve(count === 0
            ? 'You have no active tasks right now. Time to start something!'
            : `You have ${count} active task${count === 1 ? '' : 's'} running.`);
        } else {
          resolve(getActiveWindowCount(win));
        }
      });
      win.webContents.send('uki:knowledge', { action: 'task-count', replyChannel: channel });
    } catch {
      clearTimeout(timeout);
      resolve(getActiveWindowCount(win));
    }
  });
}

function getActiveWindowCount(win: BrowserWindow): string {
  const windows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.isVisible());
  return `You have ${windows.length} active window${windows.length === 1 ? '' : 's'} open.`;
}

export async function handle(intent: UkiIntent, win: BrowserWindow): Promise<UkiResult> {
  switch (intent.action) {
    case 'activity-query': {
      const summary = getActivitySummary(intent.entities?.period as string | undefined);
      win.webContents.send('uki:knowledge', { action: 'activity-query', period: intent.entities?.period });
      return { success: true, response: summary };
    }

    case 'task-count': {
      const taskInfo = await getTaskCount(win);
      return { success: true, response: taskInfo };
    }

    case 'favorite-app': {
      const fav = getFavoriteApp();
      win.webContents.send('uki:knowledge', { action: 'favorite-app' });
      return { success: true, response: fav };
    }

    case 'usage-stats': {
      const stats = getUsageStats();
      win.webContents.send('uki:knowledge', { action: 'usage-stats' });
      return { success: true, response: stats };
    }

    case 'work-pattern': {
      return { success: true, response: getWorkPattern() };
    }

    case 'system-info': {
      return { success: true, response: getSystemSummary() };
    }

    default:
      return { success: false, response: 'I\'m not sure how to answer that.' };
  }
}
