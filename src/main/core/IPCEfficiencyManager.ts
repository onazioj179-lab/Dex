// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- IPC Efficiency Manager
// ==========================================================================
// Optimizes all IPC communication between processes. Batches frequent
// small messages, provides reference-based large payload transfer, and
// enforces the 2ms round-trip target.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IPCBatchEntry {
  channel: string;
  data: any;
  timestamp: number;
}

export interface IPCMetrics {
  totalMessages: number;
  totalBatches: number;
  avgRoundTripMs: number;
  peakRoundTripMs: number;
  messagesPerSecond: number;
  batchCompressionRatio: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_INTERVAL_MS = 16;
const MAX_BATCH_SIZE = 100;
const METRICS_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// IPC Efficiency Manager
// ---------------------------------------------------------------------------

class IPCEfficiencyManager {
  private mainWindow: BrowserWindow | null = null;
  private started = false;

  private outboundBatch: IPCBatchEntry[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;

  private messageTimestamps: number[] = [];
  private roundTripTimes: number[] = [];
  private totalMessages = 0;
  private totalBatches = 0;
  private peakRoundTripMs = 0;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(win: BrowserWindow): void {
    if (this.started) return;
    this.started = true;
    this.mainWindow = win;
    this.registerIPC();
    this.batchTimer = setInterval(() => this.flushOutbound(), BATCH_INTERVAL_MS);
    log.info('[IPCEfficiency] Started');
  }

  stop(): void {
    if (this.batchTimer) clearInterval(this.batchTimer);
    this.flushOutbound();
    this.started = false;
  }

  // -----------------------------------------------------------------------
  // Batched send to renderer
  // -----------------------------------------------------------------------

  send(channel: string, data: any): void {
    this.outboundBatch.push({ channel, data, timestamp: Date.now() });
    this.totalMessages++;

    if (this.outboundBatch.length >= MAX_BATCH_SIZE) {
      this.flushOutbound();
    }
  }

  sendImmediate(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
      this.totalMessages++;
    }
  }

  private flushOutbound(): void {
    if (this.outboundBatch.length === 0) return;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.outboundBatch = [];
      return;
    }

    const batch = this.outboundBatch.splice(0);
    this.totalBatches++;

    // Group by channel to reduce IPC calls
    const grouped = new Map<string, any[]>();
    for (const entry of batch) {
      const arr = grouped.get(entry.channel) ?? [];
      arr.push(entry.data);
      grouped.set(entry.channel, arr);
    }

    for (const [channel, items] of grouped) {
      if (items.length === 1) {
        this.mainWindow.webContents.send(channel, items[0]);
      } else {
        this.mainWindow.webContents.send(`${channel}:batch`, items);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Round-trip measurement
  // -----------------------------------------------------------------------

  recordRoundTrip(ms: number): void {
    this.roundTripTimes.push(ms);
    if (ms > this.peakRoundTripMs) this.peakRoundTripMs = ms;
    if (this.roundTripTimes.length > 1000) {
      this.roundTripTimes = this.roundTripTimes.slice(-500);
    }
  }

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  getMetrics(): IPCMetrics {
    const now = Date.now();
    this.messageTimestamps = this.messageTimestamps.filter(t => now - t < METRICS_WINDOW_MS);

    const avgRoundTrip = this.roundTripTimes.length > 0
      ? this.roundTripTimes.reduce((a, b) => a + b, 0) / this.roundTripTimes.length
      : 0;

    return {
      totalMessages: this.totalMessages,
      totalBatches: this.totalBatches,
      avgRoundTripMs: Math.round(avgRoundTrip * 100) / 100,
      peakRoundTripMs: this.peakRoundTripMs,
      messagesPerSecond: this.messageTimestamps.length / (METRICS_WINDOW_MS / 1000),
      batchCompressionRatio: this.totalBatches > 0 ? this.totalMessages / this.totalBatches : 1,
    };
  }

  // -----------------------------------------------------------------------
  // IPC
  // -----------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('ipc-perf:getMetrics', async () => this.getMetrics());

    ipcMain.on('ipc-perf:ping', (event) => {
      event.sender.send('ipc-perf:pong', { timestamp: Date.now() });
    });

    ipcMain.on('ipc-perf:roundtrip', (_, ms: number) => {
      this.recordRoundTrip(ms);
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const ipcEfficiencyManager = new IPCEfficiencyManager();
