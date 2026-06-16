// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Electron->Tauri IPC compatibility shim (GOAL-6A migration).
 *
 * The renderer talks to the backend through `window.dex.<namespace>.<method>()`
 * and `window.electron.invoke(channel, ...args)` — both of which are thin
 * wrappers over Electron's `ipcRenderer.invoke('<namespace>:<method>', ...args)`
 * (see src/main/preload.ts). Under Tauri none of that exists, so this installs a
 * drop-in `window.dex` / `window.electron` that route EVERY call through a single
 * native command, `dex_ipc(channel, args)`, implemented in src-tauri.
 *
 * A Proxy derives the channel from the access path
 * (`window.dex.power.getStats(x)` -> `dex_ipc('power:getStats', [x])`), so the
 * whole ~2,400-handler surface is bridged generically. Channels not yet ported
 * to Rust resolve to `null` — the renderer already tolerates that (it's the same
 * degraded mode as the browser preview), so the UI boots instead of crashing.
 * Handlers are then ported one subsystem at a time on the Rust side.
 */

import { canHandleLocally, handleLocally, NATIVE_PENDING } from './rendererShims';

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type UnlistenFn = () => void;
type TauriListen = (event: string, handler: (e: { payload: unknown }) => void) => Promise<UnlistenFn>;

function tauriInvoke(): TauriInvoke | null {
  const t = (globalThis as { __TAURI__?: { core?: { invoke?: TauriInvoke }; invoke?: TauriInvoke } }).__TAURI__;
  return t?.core?.invoke ?? t?.invoke ?? null;
}

function tauriListen(): TauriListen | null {
  const t = (globalThis as { __TAURI__?: { event?: { listen?: TauriListen } } }).__TAURI__;
  return t?.event?.listen ?? null;
}

/**
 * Generic push-event bridge — the Tauri side of the Electron preload's
 * `dex.on(channel, cb)` / `dex.off(channel, cb)`. Rust pushes with
 * `native_ops::emit_event(app, channel, payload)` (one payload value per event);
 * the callback receives that payload directly, matching the preload wrappers
 * which strip Electron's IPC event argument before invoking the callback.
 */
const pushListeners = new Map<string, Map<(...args: unknown[]) => void, Promise<UnlistenFn>>>();

function dexOn(channel: string, callback: (...args: unknown[]) => void): void {
  const listen = tauriListen();
  if (!listen || typeof channel !== 'string' || typeof callback !== 'function') return;
  let perChannel = pushListeners.get(channel);
  if (!perChannel) {
    perChannel = new Map();
    pushListeners.set(channel, perChannel);
  }
  if (perChannel.has(callback)) return; // ipcRenderer.on semantics: one wrapper per cb
  perChannel.set(
    callback,
    listen(channel, (e) => callback(e.payload)).catch((err) => {
      console.warn(`[dex-ipc] subscribe ${channel} failed:`, err);
      return () => {};
    })
  );
}

function dexOff(channel: string, callback: (...args: unknown[]) => void): void {
  const perChannel = pushListeners.get(channel);
  const unlisten = perChannel?.get(callback);
  if (!perChannel || !unlisten) return;
  perChannel.delete(callback);
  unlisten.then((f) => f()).catch(() => {});
}

/** True when the renderer is running inside the Tauri shell. */
export function isTauri(): boolean {
  return tauriInvoke() !== null;
}

/**
 * Migration telemetry: which channels get hit at runtime and how often they
 * degrade to `null` (unported on the Rust side). This is the data that orders
 * the port backlog — port what real usage actually touches, not guesses. Read it
 * live from devtools via `window.__dexDegradeReport()`.
 */
const degradeLog = new Map<string, { calls: number; nulls: number }>();
function recordChannel(channel: string, degraded: boolean): void {
  const e = degradeLog.get(channel) ?? { calls: 0, nulls: 0 };
  e.calls += 1;
  if (degraded) e.nulls += 1;
  degradeLog.set(channel, e);
}

/** Known native-pending gaps, keyed by channel, for honest report annotation. */
const NATIVE_PENDING_BY_CHANNEL = new Map(NATIVE_PENDING.map((e) => [e.channel, e.needs]));

/**
 * Snapshot of channel usage, most-degraded first. Feeds the migration priority.
 * Each degraded channel is tagged: `pending` (with the native capability it
 * needs) when it's a known, catalogued gap in `rendererShims.NATIVE_PENDING`, or
 * `unaccounted` when something degraded that we did NOT expect — that tag is the
 * signal that the catalogue (or a shim) is missing and the report is no longer
 * honest. Slice 5 drives this toward empty: a channel leaves the degraded set
 * either by gaining a renderer shim (rendererShims.ts) or a native handler.
 */
export function dexDegradeReport(): Array<{
  channel: string;
  calls: number;
  nulls: number;
  status?: 'pending' | 'unaccounted';
  needs?: string;
}> {
  return [...degradeLog.entries()]
    .map(([channel, v]) => {
      const out: { channel: string; calls: number; nulls: number; status?: 'pending' | 'unaccounted'; needs?: string } = {
        channel,
        ...v,
      };
      if (v.nulls > 0) {
        const needs = NATIVE_PENDING_BY_CHANNEL.get(channel);
        if (needs) {
          out.status = 'pending';
          out.needs = needs;
        } else {
          out.status = 'unaccounted';
        }
      }
      return out;
    })
    .sort((a, b) => b.nulls - a.nulls || b.calls - a.calls);
}

/** Route one IPC channel call to the native `dex_ipc` dispatcher. */
function dexIpc(channel: string, args: unknown[]): Promise<unknown> {
  // Some channels never needed the backend — they compute values the renderer
  // already owns (display config, reduced-motion, WebAuthn) or are pure
  // telemetry sinks. Serve those locally so they answer truthfully AND stay out
  // of the degrade report instead of hitting the null-returning native arm.
  // (See rendererShims.ts; NATIVE_PENDING there catalogues what stays degraded.)
  if (canHandleLocally(channel)) {
    return handleLocally(channel, args).then((res) => {
      recordChannel(channel, res === null || res === undefined);
      return res;
    });
  }
  const invoke = tauriInvoke();
  if (!invoke) return Promise.resolve(null);
  return invoke('dex_ipc', { channel, args })
    .then((res) => {
      recordChannel(channel, res === null || res === undefined);
      return res;
    })
    .catch((err) => {
      // Never let a backend gap throw into the UI during the migration.
      console.warn(`[dex-ipc] ${channel} failed:`, err);
      recordChannel(channel, true);
      return null;
    });
}

/** Static platform info (Electron exposed this synchronously as `dex.platform`). */
function platformInfo() {
  const ua = navigator.userAgent;
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isLinux = /Linux/i.test(ua) && !isWindows;
  return {
    isMac,
    isWindows,
    isLinux,
    os: isWindows ? 'win32' : isMac ? 'darwin' : 'linux',
    homeDir: '',
  };
}

/**
 * A callable Proxy that accumulates a `a:b:c` channel path as you access
 * properties, and fires `dex_ipc(path, args)` when finally invoked.
 */
function namespaceProxy(prefix: string): unknown {
  const target = function noop() {};
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      // Avoid hijacking await/thenable introspection on the proxy.
      if (prop === 'then') return undefined;
      return namespaceProxy(prefix ? `${prefix}:${prop}` : prop);
    },
    apply(_t, _thisArg, args: unknown[]) {
      // Namespaced event-subscription methods (dex.x.onY(cb)) map irregularly to
      // their push channels under Electron, so they stay no-op unsubscribes here.
      // Live pushes go through the generic `dex.on(channel, cb)` bridge above —
      // callers that do `const off = dex.x.onY(cb); ...; off()` won't break.
      const leaf = prefix.slice(prefix.lastIndexOf(':') + 1);
      if ((leaf.startsWith('on') || leaf.startsWith('off')) && typeof args[0] === 'function') {
        return () => {};
      }
      return dexIpc(prefix, args);
    },
  });
}

let installed = false;

/**
 * Install the `window.dex` + `window.electron` compatibility layer. No-op unless
 * running under Tauri (so the Electron build is completely unaffected). Call this
 * once, as early as possible, before the app reads `window.dex`.
 */
export function installTauriCompat(): void {
  if (installed || !isTauri()) return;
  installed = true;

  const root = new Proxy(function noop() {}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      // Generic invoke: dex.invoke(channel, ...args) -> dex_ipc(channel, args)
      if (prop === 'invoke') return (channel: string, ...args: unknown[]) => dexIpc(channel, args);
      // Generic push subscriptions (preload's dex.on/dex.off) -> Tauri events.
      if (prop === 'on') return dexOn;
      if (prop === 'off') return dexOff;
      // Synchronous data accessor exposed by the Electron preload.
      if (prop === 'platform') return platformInfo();
      if (prop === 'then') return undefined;
      return namespaceProxy(prop);
    },
  });

  const w = globalThis as Record<string, unknown>;
  w.dex = root;
  // Several call sites use window.electron.invoke/on/off(channel, ...) directly.
  w.electron = {
    invoke: (channel: string, ...args: unknown[]) => dexIpc(channel, args),
    on: dexOn,
    off: dexOff,
  };
  // Expose the migration telemetry for live inspection from devtools.
  w.__dexDegradeReport = dexDegradeReport;
  console.info('[dex] Tauri IPC compatibility layer installed (degraded backend; channels port incrementally). Run __dexDegradeReport() to see what to port next.');
}
