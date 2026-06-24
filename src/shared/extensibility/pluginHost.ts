// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Out-of-process plugin-host model (DEX_FEATURE_BACKLOG 10 · extensibility).
 *
 * The cross-industry pattern for safely hosting THIRD-PARTY creative plugins is
 * out-of-process isolation: Apple Audio Unit v3 loads each plugin as an App
 * Extension in its OWN process (so a crash or hang can't take down the host), and
 * the CLAP standard splits the plugin API by thread (audio-thread `process` /
 * param events vs main-thread activate/state/GUI) with explicit opaque state
 * save/load. DEX should host inner-app extensions the same way: a separate,
 * capability-scoped process per plugin, a typed IPC contract, thread-correct calls,
 * crash containment with restart+quarantine, and versioned/checksummed state.
 *
 * This is the pure POLICY for that contract — no IPC transport, no process spawn;
 * the host driver wires it to real worker/utility processes. Composes with the
 * runtime capability model (`AppCapability`) and mirrors the container crash-loop
 * guard so plugins follow the same isolation rules as inner apps.
 */

import type { AppCapability } from '../runtime/appContainer';

export type PluginKind = 'audio' | 'visual' | 'data';

/** Which thread a host→plugin call must run on (CLAP threading model). */
export type ThreadAffinity = 'main' | 'audio' | 'any';

export interface PluginManifest {
  id: string;
  kind: PluginKind;
  /** Capabilities the plugin declares; anything else is denied. */
  capabilities: ReadonlyArray<AppCapability>;
  /** Trusted = first-party/signed system plugin (may run in-process). */
  trusted?: boolean;
  /** Vendor/manufacturer id — drives per-manufacturer isolation grouping. */
  vendor?: string;
  /** Extension ids the plugin implements (CLAP get_extension negotiation). */
  extensions?: ReadonlyArray<string>;
}

/** The host→plugin operations, classified by CLAP-style thread affinity. */
export type PluginOp =
  | 'process'      // audio render — audio thread, realtime, no allocation
  | 'paramValue'   // parameter event — audio thread
  | 'activate'     // prepare to process — main thread
  | 'deactivate'   // teardown — main thread
  | 'loadState'    // restore opaque state — main thread
  | 'saveState'    // serialise opaque state — main thread
  | 'getExtension' // query an extension — any thread
  | 'guiCreate';   // create the editor view — main thread

const OP_AFFINITY: Record<PluginOp, ThreadAffinity> = {
  process: 'audio',
  paramValue: 'audio',
  activate: 'main',
  deactivate: 'main',
  loadState: 'main',
  saveState: 'main',
  getExtension: 'any',
  guiCreate: 'main',
};

export function opThreadAffinity(op: PluginOp): ThreadAffinity {
  return OP_AFFINITY[op];
}

/**
 * Whether an op may run on `thread`. An `any`-affinity op runs on either; an
 * audio-thread op MUST NOT run on the main thread and vice-versa — calling
 * `process` off the audio thread (or `loadState` on it) is the classic plugin bug
 * this rule prevents.
 */
export function isCallAllowedOnThread(op: PluginOp, thread: 'main' | 'audio'): boolean {
  const aff = OP_AFFINITY[op];
  return aff === 'any' || aff === thread;
}

/**
 * Out-of-process isolation: every UNTRUSTED plugin runs in its own process so a
 * crash/hang is contained. Only a trusted (first-party/signed) plugin may be
 * loaded in-process for performance.
 */
export function requiresSeparateProcess(manifest: PluginManifest): boolean {
  return !manifest.trusted;
}

/** Whether a plugin may use a capability — declared-only, fail-closed. */
export function pluginCapabilityAllowed(manifest: PluginManifest, cap: AppCapability): boolean {
  return manifest.capabilities.includes(cap);
}

/**
 * String-keyed extension negotiation (CLAP `get_extension`): returns whether the
 * plugin implements `extId`, the basis for capability-scoped feature discovery.
 * Forbidden before init — callers pass the lifecycle state; a not-yet-initialized
 * plugin always returns false.
 */
export function negotiateExtension(manifest: PluginManifest, extId: string, initialized = true): boolean {
  if (!initialized) return false;
  return (manifest.extensions ?? []).includes(extId);
}

// ---- Isolation granularity (Bitwig) -----------------------------------------

/**
 * Host-configurable isolation granularity — trades memory/IPC cost for crash
 * isolation. Naive per-plugin out-of-process does NOT scale to large low-latency
 * sessions (Ardour: context-switch cost can blow the realtime budget), so the host
 * picks a granularity and plugins sharing a group key share ONE sandbox process.
 */
export type IsolationGranularity =
  | 'in-engine'        // in the host process (trusted only) — fastest, no isolation
  | 'together'         // all sandboxed plugins share one process
  | 'per-manufacturer' // one process per vendor
  | 'per-plugin'       // one process per plugin type
  | 'individual';      // one process per instance — strongest, costliest

/**
 * The process-group key for a plugin instance: instances with the SAME key share
 * a process. `null` means "in the host process" (only valid for `in-engine`, which
 * a host should restrict to trusted plugins).
 */
export function isolationGroupKey(
  manifest: PluginManifest,
  granularity: IsolationGranularity,
  instanceId = manifest.id,
): string | null {
  switch (granularity) {
    case 'in-engine': return null;
    case 'together': return 'shared';
    case 'per-manufacturer': return `vendor:${manifest.vendor ?? 'unknown'}`;
    case 'per-plugin': return `plugin:${manifest.id}`;
    case 'individual': return `instance:${instanceId}`;
  }
}

// ---- Lifecycle preconditions (CLAP active-state ordering) -------------------

/** Plugin lifecycle states, in order. */
export type PluginLifecycle = 'created' | 'initialized' | 'active' | 'processing' | 'destroyed';

/**
 * Whether an op is valid in the current lifecycle state (CLAP's active-state
 * preconditions, beyond just the thread):
 *   - init only on a freshly created plugin
 *   - activate only when initialized & !active
 *   - process only when active/processing
 *   - deactivate only when active/processing
 *   - destroy only when not active (deactivate first) and not already destroyed
 *   - state save/load and getExtension require an initialized, non-destroyed plugin
 */
export function canInvokeInState(op: PluginOp, state: PluginLifecycle): boolean {
  if (state === 'destroyed') return false;
  switch (op) {
    case 'activate': return state === 'initialized';
    case 'process':
    case 'paramValue': return state === 'active' || state === 'processing';
    case 'deactivate': return state === 'active' || state === 'processing';
    case 'guiCreate':
    case 'loadState':
    case 'saveState':
    case 'getExtension': return state !== 'created';
    default: return false;
  }
}

/** Full gate: an op must satisfy BOTH the thread and the lifecycle precondition. */
export function canInvoke(op: PluginOp, thread: 'main' | 'audio', state: PluginLifecycle): boolean {
  return isCallAllowedOnThread(op, thread) && canInvokeInState(op, state);
}

// ---- Crash containment (mirrors the container crash-loop guard) -------------

export interface PluginRuntime {
  id: string;
  crashes: number;
  quarantined: boolean;
}

export interface CrashOptions {
  /** Quarantine the plugin after this many crashes (default 3). */
  maxCrashes?: number;
}

export function newPluginRuntime(id: string): PluginRuntime {
  return { id, crashes: 0, quarantined: false };
}

/** Record a plugin crash; quarantine once it exceeds the crash budget. */
export function onCrash(rt: PluginRuntime, opts: CrashOptions = {}): PluginRuntime {
  const max = opts.maxCrashes ?? 3;
  const crashes = rt.crashes + 1;
  return { ...rt, crashes, quarantined: crashes >= max };
}

/** Restart a crashed plugin unless it has been quarantined. */
export function shouldRestart(rt: PluginRuntime): boolean {
  return !rt.quarantined;
}

// ---- Opaque state (CLAP state / AUv3 fullState) -----------------------------

export interface PluginState {
  pluginId: string;
  version: number;
  /** Opaque, plugin-defined blob (base64 / JSON string). */
  blob: string;
  checksum: string;
}

/** Integrity gate before restoring state into a plugin (refuse a tampered blob). */
export function validateState(state: PluginState, computeChecksum: (blob: string) => string): boolean {
  return computeChecksum(state.blob) === state.checksum;
}

// ---- IPC contract -----------------------------------------------------------

export type PluginMessageKind = 'op' | 'event' | 'state' | 'log';

export interface PluginMessage {
  kind: PluginMessageKind;
  /** For `op` messages, the operation being requested. */
  op?: PluginOp;
}

export interface PluginMessageDecision { allow: boolean; reason: string }

const KNOWN_KINDS: ReadonlySet<PluginMessageKind> = new Set(['op', 'event', 'state', 'log']);

/**
 * Validate a host↔plugin IPC message against the contract: the kind must be known
 * (fail-closed), and an `op` message must name a real operation runnable on the
 * sending thread.
 */
export function validatePluginMessage(msg: PluginMessage, thread: 'main' | 'audio'): PluginMessageDecision {
  if (!KNOWN_KINDS.has(msg.kind)) {
    return { allow: false, reason: `unknown message kind "${msg.kind}"` };
  }
  if (msg.kind === 'op') {
    if (!msg.op || !(msg.op in OP_AFFINITY)) {
      return { allow: false, reason: 'op message without a valid operation' };
    }
    if (!isCallAllowedOnThread(msg.op, thread)) {
      return { allow: false, reason: `op "${msg.op}" not allowed on the ${thread} thread` };
    }
  }
  return { allow: true, reason: 'ok' };
}
