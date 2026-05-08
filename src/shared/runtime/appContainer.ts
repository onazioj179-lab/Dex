// =============================================================================
// DEX Platform — Track A1: AppContainer state model
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure, host-agnostic lifecycle + capability + IPC-quota model for a single
 * sandboxed app inside DEX. The main-process driver wires this to a real
 * `utilityProcess` + `BrowserWindow`; this module owns the rules so they
 * stay testable and identical across hosts.
 */

export type AppLifecycleState =
  | 'cold'      // not loaded
  | 'warm'      // process spawned, code loaded, no UI yet
  | 'hot'       // foreground, full budget
  | 'suspended' // backgrounded, frozen frame loop
  | 'zombie';   // crashed; awaiting respawn

export type AppCapability =
  | 'files.read' | 'files.write'
  | 'network'   | 'network.local'
  | 'clipboard' | 'capture'
  | 'audio.in'  | 'audio.out'
  | 'gpu'       | 'gpu.compute'
  | 'storage'   | 'notify'
  | 'background' | 'autostart';

export interface AppContainerSpec {
  appId: string;
  /** Capabilities granted at install/runtime. Must match package manifest. */
  granted: ReadonlyArray<AppCapability>;
  /** Hard ceilings; governor enforces softer caps within these. */
  budgets: {
    cpuPct: number;       // 0..100
    gpuMemMb: number;
    ramMb: number;
    ipcMsgsPerSec: number;
    ipcBytesPerSec: number;
  };
}

export interface ContainerSnapshot {
  appId: string;
  state: AppLifecycleState;
  pid?: number;
  startedAt?: number;
  lastFrameAt?: number;
  crashes: number;
  ipcUsed: { msgs: number; bytes: number; windowStart: number };
}

const VALID_TRANSITIONS: Record<AppLifecycleState, ReadonlyArray<AppLifecycleState>> = {
  cold:      ['warm'],
  warm:      ['hot', 'suspended', 'zombie', 'cold'],
  hot:       ['suspended', 'zombie', 'cold'],
  suspended: ['hot', 'cold', 'zombie'],
  zombie:    ['warm', 'cold'],
};

export function canTransition(from: AppLifecycleState, to: AppLifecycleState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function transition(snap: ContainerSnapshot, to: AppLifecycleState, now: number): ContainerSnapshot {
  if (!canTransition(snap.state, to)) {
    throw new Error(`invalid lifecycle transition ${snap.state} -> ${to}`);
  }
  const next: ContainerSnapshot = { ...snap, state: to };
  if (to === 'warm' && snap.state === 'cold') next.startedAt = now;
  if (to === 'zombie') next.crashes = snap.crashes + 1;
  if (to === 'hot') next.lastFrameAt = now;
  return next;
}

export function newSnapshot(appId: string, now: number): ContainerSnapshot {
  return {
    appId,
    state: 'cold',
    crashes: 0,
    ipcUsed: { msgs: 0, bytes: 0, windowStart: now },
  };
}

/**
 * Sliding 1-second window quota check. Returns the action the host should
 * take. `defer` = host should buffer the message; `block` = drop and warn.
 */
export function checkIpcQuota(
  snap: ContainerSnapshot,
  spec: AppContainerSpec,
  bytes: number,
  now: number
): { allow: boolean; backpressure: 'none' | 'defer' | 'block'; nextSnap: ContainerSnapshot } {
  const WINDOW_MS = 1000;
  let used = snap.ipcUsed;
  if (now - used.windowStart >= WINDOW_MS) {
    used = { msgs: 0, bytes: 0, windowStart: now };
  }
  const projMsgs = used.msgs + 1;
  const projBytes = used.bytes + bytes;
  const overMsgs = projMsgs > spec.budgets.ipcMsgsPerSec;
  const overBytes = projBytes > spec.budgets.ipcBytesPerSec;
  if (overMsgs || overBytes) {
    // 2x ceiling = hard block, otherwise defer for a tick
    const hard = projMsgs > spec.budgets.ipcMsgsPerSec * 2
      || projBytes > spec.budgets.ipcBytesPerSec * 2;
    return {
      allow: false,
      backpressure: hard ? 'block' : 'defer',
      nextSnap: { ...snap, ipcUsed: used },
    };
  }
  return {
    allow: true,
    backpressure: 'none',
    nextSnap: { ...snap, ipcUsed: { ...used, msgs: projMsgs, bytes: projBytes } },
  };
}

/** Crash-loop guard: respawn unless the app crashed N times in a short window. */
export function shouldRespawn(snap: ContainerSnapshot, opts?: { maxCrashes?: number }): boolean {
  const cap = opts?.maxCrashes ?? 5;
  return snap.crashes < cap;
}
