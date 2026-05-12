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

export function snapshot(extras: Partial<UkiContextSnapshotRecord> = {}): UkiContextSnapshotRecord {
  const ra = readRunningAppsState();
  return {
    schemaVersion: SCHEMA_VERSION,
    ts: Date.now(),
    foregroundAppId: ra.currentAppId,
    openAppIds: ra.runningApps?.map((a) => a.id) ?? [],
    ...extras,
  };
}

export interface LiveContext {
  foregroundAppId?: string;
  openAppIds: readonly string[];
  sessionHistory: readonly string[];
  online: boolean;
  localTime: string;
}

export function liveContext(): LiveContext {
  const ra = readRunningAppsState();
  return {
    foregroundAppId: ra.currentAppId,
    openAppIds: ra.runningApps?.map((a) => a.id) ?? [],
    sessionHistory: ra.sessionHistory ?? [],
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    localTime: new Date().toLocaleString(),
  };
}
