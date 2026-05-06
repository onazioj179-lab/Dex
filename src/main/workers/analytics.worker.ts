// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Worker -- Analytics Computation Thread
// ==========================================================================
// All analytics processing runs here, never on main or renderer threads.
// ==========================================================================

import { parentPort } from 'worker_threads';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

interface SessionMetrics {
  appUsage: Record<string, number>;
  totalActiveMs: number;
  totalIdleMs: number;
  keystrokeCount: number;
  navigationCount: number;
  peakHour: number;
}

let currentSession: SessionMetrics = {
  appUsage: {},
  totalActiveMs: 0,
  totalIdleMs: 0,
  keystrokeCount: 0,
  navigationCount: 0,
  peakHour: -1,
};

const hourlyActivity: number[] = new Array(24).fill(0);
const dailySummaries: Array<{ date: string; metrics: SessionMetrics }> = [];

function addAppUsage(app: string, durationMs: number): void {
  currentSession.appUsage[app] = (currentSession.appUsage[app] || 0) + durationMs;
  currentSession.totalActiveMs += durationMs;
  const hour = new Date().getHours();
  hourlyActivity[hour] += durationMs;
}

function recordIdle(durationMs: number): void {
  currentSession.totalIdleMs += durationMs;
}

function recordKeystroke(count: number): void {
  currentSession.keystrokeCount += count;
}

function recordNavigation(): void {
  currentSession.navigationCount++;
}

function computePeakHour(): number {
  let maxMs = 0;
  let peak = 0;
  for (let h = 0; h < 24; h++) {
    if (hourlyActivity[h] > maxMs) { maxMs = hourlyActivity[h]; peak = h; }
  }
  return peak;
}

function computeProductivity(): {
  activePercent: number;
  topApps: Array<{ app: string; minutes: number }>;
  peakHour: number;
  keystrokeRate: number;
} {
  const total = currentSession.totalActiveMs + currentSession.totalIdleMs;
  const activePercent = total > 0 ? Math.round((currentSession.totalActiveMs / total) * 100) : 0;
  const topApps = Object.entries(currentSession.appUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([app, ms]) => ({ app, minutes: Math.round(ms / 60000) }));
  const sessionMinutes = currentSession.totalActiveMs / 60000;
  const keystrokeRate = sessionMinutes > 0 ? Math.round(currentSession.keystrokeCount / sessionMinutes) : 0;
  return { activePercent, topApps, peakHour: computePeakHour(), keystrokeRate };
}

function closeSession(): SessionMetrics {
  currentSession.peakHour = computePeakHour();
  const snapshot = { ...currentSession };
  dailySummaries.push({
    date: new Date().toISOString().slice(0, 10),
    metrics: snapshot,
  });
  if (dailySummaries.length > 90) dailySummaries.splice(0, dailySummaries.length - 90);
  currentSession = {
    appUsage: {},
    totalActiveMs: 0,
    totalIdleMs: 0,
    keystrokeCount: 0,
    navigationCount: 0,
    peakHour: -1,
  };
  hourlyActivity.fill(0);
  return snapshot;
}

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
      case 'add-app-usage':
        addAppUsage(msg.payload.app, msg.payload.durationMs);
        respond(msg, { ok: true });
        break;
      case 'record-idle':
        recordIdle(msg.payload.durationMs);
        respond(msg, { ok: true });
        break;
      case 'record-keystroke':
        recordKeystroke(msg.payload.count || 1);
        respond(msg, { ok: true });
        break;
      case 'record-navigation':
        recordNavigation();
        respond(msg, { ok: true });
        break;
      case 'compute-productivity':
        respond(msg, computeProductivity());
        break;
      case 'get-session':
        respond(msg, currentSession);
        break;
      case 'close-session':
        respond(msg, closeSession());
        break;
      case 'get-daily-summaries':
        respond(msg, { summaries: dailySummaries.slice(-30) });
        break;
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
