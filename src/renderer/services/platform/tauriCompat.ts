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

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function tauriInvoke(): TauriInvoke | null {
  const t = (globalThis as { __TAURI__?: { core?: { invoke?: TauriInvoke }; invoke?: TauriInvoke } }).__TAURI__;
  return t?.core?.invoke ?? t?.invoke ?? null;
}

/** True when the renderer is running inside the Tauri shell. */
export function isTauri(): boolean {
  return tauriInvoke() !== null;
}

/** Route one IPC channel call to the native `dex_ipc` dispatcher. */
function dexIpc(channel: string, args: unknown[]): Promise<unknown> {
  const invoke = tauriInvoke();
  if (!invoke) return Promise.resolve(null);
  return invoke('dex_ipc', { channel, args }).catch((err) => {
    // Never let a backend gap throw into the UI during the migration.
    console.warn(`[dex-ipc] ${channel} failed:`, err);
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
      // Event-subscription methods (onState/onInstalled/...) take a callback and
      // return an unsubscribe fn. No native events fire yet under the bridge, so
      // return a no-op unsubscribe instead of serializing a function over IPC —
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
      // Synchronous data accessor exposed by the Electron preload.
      if (prop === 'platform') return platformInfo();
      if (prop === 'then') return undefined;
      return namespaceProxy(prop);
    },
  });

  const w = globalThis as Record<string, unknown>;
  w.dex = root;
  // Several call sites use window.electron.invoke(channel, payload) directly.
  w.electron = { invoke: (channel: string, ...args: unknown[]) => dexIpc(channel, args) };
  console.info('[dex] Tauri IPC compatibility layer installed (degraded backend; channels port incrementally).');
}
