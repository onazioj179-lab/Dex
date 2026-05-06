// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { app } from 'electron';
import * as log from 'electron-log';

export interface RewindAnalyticsSnapshot {
  computedAt: number;
  productivity: any;
  appUsage: any;
  patterns: any;
  focusHistory: any;
}

class RewindAnalyticsEngine {
  private rewindDir: string;
  private cacheFile: string;
  private timer: NodeJS.Timeout | null = null;
  private computing = false;

  constructor() {
    this.rewindDir = path.join(app.getPath('userData'), 'rewind');
    this.cacheFile = path.join(this.rewindDir, 'analytics-cache.sqlite.json');
  }

  start(): void {
    this.computeNow();
    this.timer = setInterval(() => this.computeNow(), 60 * 60 * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async computeNow(): Promise<void> {
    if (this.computing) return;
    this.computing = true;

    try {
      const workerPath = path.join(__dirname, 'RewindAnalyticsWorker.js');
      const result = await new Promise<RewindAnalyticsSnapshot>((resolve, reject) => {
        const worker = new Worker(workerPath);
        worker.once('message', (msg) => {
          resolve(msg as RewindAnalyticsSnapshot);
          worker.terminate().catch((e: unknown) => { log.warn('[DEX]', e); });
        });
        worker.once('error', (err) => {
          reject(err);
          worker.terminate().catch((e: unknown) => { log.warn('[DEX]', e); });
        });
        worker.postMessage({ rewindDir: this.rewindDir });
      });

      fs.writeFileSync(this.cacheFile, JSON.stringify(result, null, 2), 'utf-8');
      log.info('[RewindAnalytics] Recomputed analytics snapshot');
    } catch (err) {
      log.warn('[RewindAnalytics] Compute error:', err);
    } finally {
      this.computing = false;
    }
  }

  getSnapshot(): RewindAnalyticsSnapshot {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return {
          computedAt: 0,
          productivity: {},
          appUsage: {},
          patterns: {},
          focusHistory: {},
        };
      }
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8')) as RewindAnalyticsSnapshot;
    } catch {
      return {
        computedAt: 0,
        productivity: {},
        appUsage: {},
        patterns: {},
        focusHistory: {},
      };
    }
  }
}

export const rewindAnalyticsEngine = new RewindAnalyticsEngine();
