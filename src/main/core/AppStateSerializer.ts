// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- App State Serializer
// ==========================================================================
// Rules 56-60: App State Management
// 56. All app state serialized to DatabaseCluster on save/switch/quit
// 57. State versioned with monotonic counter (conflict-free)
// 58. State diff computation -- only write changed fields
// 59. State snapshots for undo/rewind (stored in dex-rewind)
// 60. State restored on launch from last known good state
// ==========================================================================

import * as log from 'electron-log';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppState {
  appId: string;
  version: number;
  data: Record<string, any>;
  checksum: string;
  savedAt: number;
}

interface StateDiff {
  appId: string;
  fromVersion: number;
  toVersion: number;
  changes: Array<{ key: string; oldValue: any; newValue: any }>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// App State Serializer
// ---------------------------------------------------------------------------

class AppStateSerializer {
  // In-memory current state per app
  private states = new Map<string, AppState>();
  // Rule 57: Monotonic version counter per app
  private versions = new Map<string, number>();
  // Rule 58: Previous state snapshot for diff
  private previousStates = new Map<string, Record<string, any>>();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    log.info('[AppStateSerializer] Initialized (Rules 56-60)');
  }

  // ---------------------------------------------------------------------------
  // Rule 56: Save state to DB
  // ---------------------------------------------------------------------------

  saveState(appId: string, data: Record<string, any>): { version: number; diffSize: number } {
    // Rule 57: Increment version
    const prevVersion = this.versions.get(appId) ?? 0;
    const newVersion = prevVersion + 1;
    this.versions.set(appId, newVersion);

    // Rule 58: Compute diff
    const prevData = this.previousStates.get(appId) ?? {};
    const diff = this.computeDiff(appId, prevVersion, newVersion, prevData, data);

    // Checksum for integrity
    const checksum = crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .slice(0, 16);

    const state: AppState = {
      appId,
      version: newVersion,
      data,
      checksum,
      savedAt: Date.now(),
    };

    this.states.set(appId, state);
    this.previousStates.set(appId, { ...data });

    // Persist to DatabaseCluster
    try {
      const { databaseCluster } = require('./DatabaseCluster');
      databaseCluster.writeStmt('core:app-state-set', appId, JSON.stringify(data), Date.now(), 1);

      // Rule 59: Store diff snapshot in rewind DB
      if (diff.changes.length > 0) {
        databaseCluster.writeStmt('rewind:save-snapshot',
          Date.now(),
          'app-state-diff',
          JSON.stringify(diff),
          Buffer.byteLength(JSON.stringify(diff), 'utf8')
        );
      }
    } catch (err) {
      log.warn(`[AppStateSerializer] Failed to persist state for ${appId}:`, err);
    }

    return { version: newVersion, diffSize: diff.changes.length };
  }

  // Rule 58: Compute diff between old and new state
  private computeDiff(
    appId: string,
    fromVersion: number,
    toVersion: number,
    oldData: Record<string, any>,
    newData: Record<string, any>
  ): StateDiff {
    const changes: Array<{ key: string; oldValue: any; newValue: any }> = [];

    // Check for modified/added keys
    for (const key of Object.keys(newData)) {
      const oldVal = oldData[key];
      const newVal = newData[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ key, oldValue: oldVal, newValue: newVal });
      }
    }

    // Check for removed keys
    for (const key of Object.keys(oldData)) {
      if (!(key in newData)) {
        changes.push({ key, oldValue: oldData[key], newValue: undefined });
      }
    }

    return {
      appId,
      fromVersion,
      toVersion,
      changes,
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Rule 60: Restore state from DB
  // ---------------------------------------------------------------------------

  restoreState(appId: string): Record<string, any> | null {
    // Check in-memory first
    const cached = this.states.get(appId);
    if (cached) return cached.data;

    // Load from DatabaseCluster
    try {
      const { databaseCluster } = require('./DatabaseCluster');
      const row = databaseCluster.runStmt('core:app-state-get', appId);
      if (row && row.state_json) {
        const data = JSON.parse(row.state_json);
        this.states.set(appId, {
          appId,
          version: 1,
          data,
          checksum: '',
          savedAt: Date.now(),
        });
        this.previousStates.set(appId, { ...data });
        return data;
      }
    } catch (err) {
      log.warn(`[AppStateSerializer] Failed to restore state for ${appId}:`, err);
    }

    return null;
  }

  // Rule 56: Save all states on quit/switch
  saveAllStates(): void {
    for (const [appId, state] of this.states) {
      this.saveState(appId, state.data);
    }
    log.info(`[AppStateSerializer] Saved ${this.states.size} app states`);
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getState(appId: string): AppState | undefined {
    return this.states.get(appId);
  }

  getVersion(appId: string): number {
    return this.versions.get(appId) ?? 0;
  }

  getAllAppIds(): string[] {
    return Array.from(this.states.keys());
  }

  getStats(): { apps: number; totalVersions: number } {
    let totalVersions = 0;
    for (const v of this.versions.values()) totalVersions += v;
    return { apps: this.states.size, totalVersions };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.saveAllStates();
    this.states.clear();
    this.previousStates.clear();
    this.versions.clear();
    this.initialized = false;
    log.info('[AppStateSerializer] Shutdown');
  }
}

export const appStateSerializer = new AppStateSerializer();

export function initializeAppStateSerializer(): void {
  appStateSerializer.initialize();
}

export function shutdownAppStateSerializer(): void {
  appStateSerializer.shutdown();
}
