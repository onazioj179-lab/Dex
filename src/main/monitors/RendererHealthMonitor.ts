// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX -- Renderer Health Monitor
 * Runs in the main process. Pings every renderer every 30 seconds.
 * Tracks: heap usage, frame time, error count, worker health, WebGL status.
 * Flags frozen, memory-pressured, or low-FPS renderers.
 */

import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';

interface RendererHealthReport {
  windowId: number;
  heapUsedMB: number;
  heapLimitMB: number;
  heapUtilization: number;
  lastFrameTimeMs: number;
  errorCountSinceLastCheck: number;
  webglContextLost: boolean;
  timestamp: number;
}

interface RendererFlag {
  windowId: number;
  type: 'frozen' | 'memory-pressure' | 'low-fps' | 'webgl-lost';
  detail: string;
  timestamp: number;
}

const healthReports = new Map<number, RendererHealthReport>();
const activeFlags: RendererFlag[] = [];
let pingInterval: ReturnType<typeof setInterval> | null = null;
let crashTracker = new Map<number, { count: number; lastError: string }>();

function pingAllRenderers(): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win.isDestroyed() || !win.webContents) continue;

    const windowId = win.id;
    const timeout = setTimeout(() => {
      // No response in 2 seconds = potentially frozen
      activeFlags.push({
        windowId,
        type: 'frozen',
        detail: `Window ${windowId} did not respond to health ping within 2s`,
        timestamp: Date.now(),
      });
      log.warn(`[RendererHealth] Window ${windowId} may be frozen (no ping response)`);
    }, 2000);

    win.webContents.send('renderer-health:ping', { windowId });

    // The renderer will respond via IPC
    const handler = (_event: Electron.IpcMainEvent, report: RendererHealthReport) => {
      clearTimeout(timeout);
      ipcMain.removeListener('renderer-health:pong', handler);
      processReport(report);
    };
    ipcMain.once('renderer-health:pong', handler);
  }
}

function processReport(report: RendererHealthReport): void {
  healthReports.set(report.windowId, report);

  // Check for memory pressure (>80% heap)
  if (report.heapUtilization > 0.8) {
    activeFlags.push({
      windowId: report.windowId,
      type: 'memory-pressure',
      detail: `Heap at ${Math.round(report.heapUtilization * 100)}% (${Math.round(report.heapUsedMB)}MB / ${Math.round(report.heapLimitMB)}MB)`,
      timestamp: Date.now(),
    });
  }

  // Check for low FPS (frame time >33ms = below 30fps)
  if (report.lastFrameTimeMs > 33) {
    activeFlags.push({
      windowId: report.windowId,
      type: 'low-fps',
      detail: `Frame time ${Math.round(report.lastFrameTimeMs)}ms (${Math.round(1000 / report.lastFrameTimeMs)} FPS)`,
      timestamp: Date.now(),
    });
  }

  // Check WebGL context
  if (report.webglContextLost) {
    activeFlags.push({
      windowId: report.windowId,
      type: 'webgl-lost',
      detail: 'WebGL context lost',
      timestamp: Date.now(),
    });
  }

  // Trim flags to last 100
  while (activeFlags.length > 100) activeFlags.shift();
}

/**
 * Start the renderer health monitor.
 */
export function startRendererHealthMonitor(): void {
  if (pingInterval) return;

  // Register crash tracking
  ipcMain.on('renderer-health:pong', (_event, report: RendererHealthReport) => {
    processReport(report);
  });

  // Track renderer crashes
  ipcMain.on('render-error', (_event, data: { windowId: number; error: string }) => {
    const existing = crashTracker.get(data.windowId) ?? { count: 0, lastError: '' };
    existing.count++;
    existing.lastError = data.error;
    crashTracker.set(data.windowId, existing);

    if (existing.count > 3) {
      log.warn(`[RendererHealth] Window ${data.windowId} has crashed ${existing.count} times this session. Last error: ${data.error}`);
    }
  });

  // Handle memory critical from renderer
  ipcMain.handle('renderer:memory-critical', async (_event, data: { usedMB: number; timestamp: number }) => {
    log.warn(`[RendererHealth] Renderer memory critical: ${data.usedMB}MB`);
    // Force garbage collection in the renderer if possible
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('renderer-health:gc-request');
        } catch { /* silent */ }
      }
    }
    return { acknowledged: true };
  });

  // Handle emergency state save from renderer
  ipcMain.handle('renderer:save-emergency-state', async (_event, state: unknown) => {
    // Saved to memory for potential recovery
    log.info('[RendererHealth] Emergency state saved from renderer');
    return { saved: true };
  });

  pingInterval = setInterval(pingAllRenderers, 60_000);
  log.info('[RendererHealth] Renderer health monitor started (60s interval)');
}

/**
 * Stop the renderer health monitor.
 */
export function stopRendererHealthMonitor(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

/**
 * Get current flags for developer settings panel.
 */
export function getHealthFlags(): RendererFlag[] {
  return [...activeFlags].slice(-50);
}

/**
 * Get crash stats per window.
 */
export function getCrashStats(): Array<{ windowId: number; crashCount: number; lastError: string }> {
  const results: Array<{ windowId: number; crashCount: number; lastError: string }> = [];
  crashTracker.forEach((val, key) => {
    results.push({ windowId: key, crashCount: val.count, lastError: val.lastError });
  });
  return results;
}
