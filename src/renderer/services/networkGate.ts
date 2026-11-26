// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings › Network mode for everything DEX's own page requests: fetch (UKI
// providers, search, weather), XMLHttpRequest, WebSocket, EventSource and
// sendBeacon. Native requests apply the same rule in src-tauri/src/net_gate.rs.
//
//   full       - no restriction
//   local-only - this PC and the local network
//   disabled   - this PC only (local AI, the dev server, DEX's own protocols)

import { useNetworkStore, type NetworkMode } from '../store/networkStore';

export type Reach = 'pc' | 'lan' | 'internet';

function v4Reach(host: string): Reach | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 0) return 'pc';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224) return 'lan';
  return 'internet';
}

/** How far a host reaches. A dotted public name counts as the internet. */
export function reachOfHost(hostname: string): Reach {
  const h = hostname.trim().replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const v4 = v4Reach(h);
  if (v4) return v4;
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return 'pc';
    // URL() writes IPv4-mapped addresses as ::ffff:7f00:1.
    if (/^::ffff:7f/.test(h)) return 'pc';
    return /^(f[cd]|fe[89ab])/.test(h) ? 'lan' : 'internet';
  }
  if (h === 'localhost' || h.endsWith('.localhost')) return 'pc';
  if (h.endsWith('.local') || (h && !h.includes('.'))) return 'lan';
  return 'internet';
}

export function modeAllows(mode: NetworkMode, reach: Reach): boolean {
  if (mode === 'full') return true;
  return mode === 'local-only' ? reach !== 'internet' : reach === 'pc';
}

/** May DEX request this URL in the given mode? data:, blob: and DEX's own schemes pass. */
export function urlAllowed(url: string, mode: NetworkMode = useNetworkStore.getState().mode): boolean {
  if (mode === 'full') return true;
  let parsed: URL;
  try {
    parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'http://tauri.localhost/');
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'ws:', 'wss:', 'ftp:'].includes(parsed.protocol)) return true;
  // DEX's own page is always reachable, wherever it is served from.
  if (typeof location !== 'undefined' && parsed.host === location.host) return true;
  return modeAllows(mode, reachOfHost(parsed.hostname));
}

export function networkRefusal(mode: NetworkMode = useNetworkStore.getState().mode): string {
  return mode === 'local-only'
    ? 'DEX is limited to the local network (Settings › Network).'
    : 'DEX is offline (Settings › Network).';
}

type GateWindow = Pick<typeof window, 'fetch' | 'XMLHttpRequest' | 'WebSocket' | 'navigator'> & { EventSource?: typeof EventSource };

const urlOf = (input: unknown): string =>
  typeof input === 'string' ? input
    : input instanceof URL ? input.href
      : String((input as { url?: unknown } | null)?.url ?? '');

const installed = new WeakSet<object>();

/** Wrap the page's request entry points. Returns an uninstaller (used by tests). */
export function installNetworkGate(win: GateWindow = window): () => void {
  if (installed.has(win)) return () => undefined;
  installed.add(win);
  const undo: (() => void)[] = [() => installed.delete(win)];

  const realFetch = win.fetch;
  if (realFetch) {
    win.fetch = function gatedFetch(input: RequestInfo | URL, init?: RequestInit) {
      // The same failure callers already handle when the machine is offline.
      if (!urlAllowed(urlOf(input))) return Promise.reject(new TypeError(networkRefusal()));
      return realFetch.call(win, input, init);
    } as typeof fetch;
    undo.push(() => { win.fetch = realFetch; });
  }

  const xhr = win.XMLHttpRequest?.prototype;
  if (xhr?.open) {
    const open = xhr.open;
    xhr.open = function gatedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      if (!urlAllowed(urlOf(url))) throw new TypeError(networkRefusal());
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof xhr.open;
    undo.push(() => { xhr.open = open; });
  }

  for (const key of ['WebSocket', 'EventSource'] as const) {
    const Real = win[key] as unknown as (new (url: string | URL, arg?: unknown) => object) | undefined;
    if (!Real) continue;
    const Gated = new Proxy(Real, {
      construct(target, args: [string | URL, unknown?], newTarget) {
        if (!urlAllowed(urlOf(args[0]))) throw new TypeError(networkRefusal());
        return Reflect.construct(target, args, newTarget);
      },
    });
    (win as unknown as Record<string, unknown>)[key] = Gated;
    undo.push(() => { (win as unknown as Record<string, unknown>)[key] = Real; });
  }

  const nav = win.navigator;
  if (nav?.sendBeacon) {
    const beacon = nav.sendBeacon;
    nav.sendBeacon = (url: string | URL, data?: BodyInit | null) => urlAllowed(urlOf(url)) && beacon.call(nav, url, data);
    undo.push(() => { nav.sendBeacon = beacon; });
  }

  return () => { for (const fn of undo.reverse()) fn(); };
}
