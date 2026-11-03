// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Context — lightweight live snapshot of the desktop.
 *
 * No subscriptions, no timers. Callers (UkiOverlay, prompt builders, command
 * router) call `snapshot()` at the moment they need it. This keeps the file
 * dependency-light: anything that wants context just imports this module.
 *
 * Data sources are looked up dynamically so this module stays free of static
 * imports from heavy stores (avoids circular imports).
 */

import { SCHEMA_VERSION, type UkiContextSnapshotRecord } from './schemas';
import { useRecentFiles } from '../store/useRecentFiles';

/** Names of the most recently opened files (newest first), best-effort. */
function readRecentFileNames(limit = 5): string[] {
  try {
    return useRecentFiles.getState().recentFiles.slice(0, limit).map((f) => f.name);
  } catch {
    return [];
  }
}

interface RunningAppsLike {
  getState: () => {
    currentAppId?: string;
    runningApps?: ReadonlyArray<{ id: string }>;
    sessionHistory?: ReadonlyArray<string>;
  };
}

let _runningApps: RunningAppsLike | null = null;

/** Optional one-time wiring so callers don't pay an import cost on every snapshot. */
export function bindRunningAppsStore(store: RunningAppsLike): void {
  _runningApps = store;
}

function readRunningAppsState() {
  if (_runningApps) return _runningApps.getState();
  // Best-effort dynamic lookup if not bound.
  try {
    const w = (typeof window !== 'undefined' ? (window as unknown as { __dexRunningApps?: RunningAppsLike }) : undefined);
    return w?.__dexRunningApps?.getState?.() ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Active Project Space (DEX 5.6 Workspace Intelligence)
// ---------------------------------------------------------------------------

interface StageStoreLike {
  getState: () => {
    activeStageId?: string;
    stages?: ReadonlyArray<{ id: string; name: string; kind?: string }>;
  };
}

let _stageStore: StageStoreLike | null = null;

/** Optional one-time wiring (mirrors bindRunningAppsStore). */
export function bindStageStore(store: StageStoreLike): void {
  _stageStore = store;
}

/** Identity of a Project Space, used for UKI prompt grounding. */
export interface ActiveWorkspace {
  id: string;
  name: string;
  /** Semantic kind (development/design/audio/...); 'general' when unset. */
  kind: string;
}

/**
 * The active Project Space, or undefined if the store isn't available yet. Reads
 * the bound store (or the global handle) lazily so this module stays free of a
 * static stageStore import (avoids a circular dependency through the shell).
 */
export function getActiveWorkspace(): ActiveWorkspace | undefined {
  try {
    const st = _stageStore?.getState?.()
      ?? (typeof window !== 'undefined'
        ? (window as unknown as { __dexStageStore?: StageStoreLike }).__dexStageStore?.getState?.()
        : undefined);
    if (!st || !st.stages) return undefined;
    const active = st.stages.find((s) => s.id === st.activeStageId);
    if (!active) return undefined;
    return { id: active.id, name: active.name, kind: active.kind || 'general' };
  } catch {
    return undefined;
  }
}

export function snapshot(extras: Partial<UkiContextSnapshotRecord> = {}): UkiContextSnapshotRecord {
  const ra = readRunningAppsState();
  return {
    schemaVersion: SCHEMA_VERSION,
    ts: Date.now(),
    foregroundAppId: ra.currentAppId,
    openAppIds: ra.runningApps?.map((a) => a.id) ?? [],
    // Populate the long-reserved workspaceId from the active Project Space so
    // persisted context records can be grouped/recalled by workspace.
    workspaceId: getActiveWorkspace()?.id,
    recentFiles: readRecentFileNames(),
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Device / hardware info (DEX 5.7) — so UKI can answer "what's my CPU / how much
// RAM do I have / what OS am I on" and reason about the machine it runs on.
// Fetched once via the native bridge (`os:getSystemInfo`) and cached; the
// synchronous liveContext() reads the cached value so prompt-building stays
// non-blocking. Resolves to null under the web shell (no native bridge).
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  /** 'win32' | 'darwin' | 'linux' */
  platform?: string;
  osVersion?: string;
  arch?: string;
  hostname?: string;
  cpuModel?: string;
  cpuCores?: number;
  /** Total physical memory, in bytes. */
  totalMemoryBytes?: number;
}

let _deviceInfo: DeviceInfo | null = null;
let _devicePromise: Promise<DeviceInfo | null> | null = null;

function bridgeInvoke<T = unknown>(channel: string): Promise<T | null> {
  try {
    const ipc = typeof window !== 'undefined' ? (window as unknown as { dex?: { invoke?: (c: string) => Promise<T> } }).dex : undefined;
    if (ipc?.invoke) return ipc.invoke(channel).catch(() => null);
  } catch { /* ignore */ }
  return Promise.resolve(null);
}

/**
 * Fetch + cache the device hardware snapshot once (idempotent). Safe to call on
 * UKI mount; resolves null under the web shell. Subsequent calls return the
 * cached value (or the in-flight promise).
 */
export async function ensureDeviceInfo(): Promise<DeviceInfo | null> {
  if (_deviceInfo) return _deviceInfo;
  if (_devicePromise) return _devicePromise;
  _devicePromise = (async () => {
    const info = await bridgeInvoke<Record<string, unknown>>('os:getSystemInfo');
    if (info && typeof info === 'object') {
      _deviceInfo = {
        platform: info.platform as string | undefined,
        osVersion: info.osVersion as string | undefined,
        arch: info.arch as string | undefined,
        hostname: info.hostname as string | undefined,
        cpuModel: info.cpuModel as string | undefined,
        cpuCores: info.cpuCores as number | undefined,
        totalMemoryBytes: info.totalMemory as number | undefined,
      };
    }
    return _deviceInfo;
  })();
  return _devicePromise;
}

/** The cached device info, or undefined if not fetched yet (synchronous). */
export function getDeviceInfo(): DeviceInfo | undefined {
  return _deviceInfo ?? undefined;
}

export interface LiveContext {
  foregroundAppId?: string;
  openAppIds: readonly string[];
  sessionHistory: readonly string[];
  /** Names of the most recently opened files (newest first) — recent activity. */
  recentFiles: readonly string[];
  /** The active Project Space (DEX 5.6), if one is set. */
  activeWorkspace?: ActiveWorkspace;
  online: boolean;
  localTime: string;
  /** Cached hardware/OS info (DEX 5.7), if `ensureDeviceInfo()` has resolved. */
  device?: DeviceInfo;
}

export function liveContext(): LiveContext {
  const ra = readRunningAppsState();
  return {
    foregroundAppId: ra.currentAppId,
    openAppIds: ra.runningApps?.map((a) => a.id) ?? [],
    sessionHistory: ra.sessionHistory ?? [],
    recentFiles: readRecentFileNames(),
    activeWorkspace: getActiveWorkspace(),
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    localTime: new Date().toLocaleString(),
    device: getDeviceInfo(),
  };
}
