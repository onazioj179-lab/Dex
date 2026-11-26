// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Platform -- Network Mode Store
// Mirrors the main-process NetworkGuard mode (full | local-only | disabled)
// so the renderer can show the current state and offer a global toggle.
// ===========================================================================
import { create } from 'zustand';

export type NetworkMode = 'full' | 'local-only' | 'disabled';

export const NETWORK_MODE_LABELS: Record<NetworkMode, string> = {
  'full': 'Full Network',
  'local-only': 'Local Only',
  'disabled': 'Offline',
};

export const NETWORK_MODE_DESCRIPTIONS: Record<NetworkMode, string> = {
  'full': 'DEX can reach the internet and your local network.',
  'local-only': 'This computer and your local network only. UKI cloud providers, updates, maps and websites are blocked.',
  'disabled': 'Nothing leaves this computer. Local AI and files keep working.',
};

/** Mirror of the native setting, so the rule applies from the first request. */
const MODE_KEY = 'dex-network-mode';
const isMode = (m: unknown): m is NetworkMode => m === 'full' || m === 'local-only' || m === 'disabled';
function storedMode(): NetworkMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return isMode(m) ? m : 'full';
  } catch { return 'full'; }
}
function rememberMode(mode: NetworkMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
}

interface NetworkStoreState {
  mode: NetworkMode;
  loaded: boolean;
  blockedAttempts: number;
  online: boolean;
  /** Pull current mode from the main process. */
  refresh: () => Promise<void>;
  /** Persist a new mode through the main process and update locally. */
  setMode: (mode: NetworkMode) => Promise<void>;
  /** Cycle full -> local-only -> disabled -> full. */
  cycleMode: () => Promise<void>;
}

const bridge = (): { invoke: (ch: string, ...args: unknown[]) => Promise<unknown> } | null => {
  const w = (typeof window !== 'undefined' ? (window as unknown as { dex?: { invoke?: (ch: string, ...args: unknown[]) => Promise<unknown> } }) : null);
  return w?.dex?.invoke ? { invoke: w.dex.invoke.bind(w.dex) } : null;
};

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  mode: storedMode(),
  loaded: false,
  blockedAttempts: 0,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,

  refresh: async () => {
    const b = bridge();
    if (!b) {
      set({ loaded: true });
      return;
    }
    try {
      const [config, summary] = await Promise.all([
        b.invoke('network:config') as Promise<{ mode?: NetworkMode } | null>,
        b.invoke('network:summary').catch(() => null) as Promise<{ blockedAttempts?: number; status?: string } | null>,
      ]);
      const mode: NetworkMode = isMode(config?.mode) ? config.mode : get().mode;
      rememberMode(mode);
      set({
        mode,
        loaded: true,
        blockedAttempts: summary?.blockedAttempts ?? 0,
        online: summary?.status !== 'offline' && (typeof navigator === 'undefined' || navigator.onLine),
      });
    } catch {
      set({ loaded: true });
    }
  },

  setMode: async (mode) => {
    const b = bridge();
    set({ mode });
    rememberMode(mode);
    if (b) {
      try {
        await b.invoke('network:setMode', mode);
      } catch {
        // Roll back on error
        await get().refresh();
      }
    }
  },

  cycleMode: async () => {
    const order: NetworkMode[] = ['full', 'local-only', 'disabled'];
    const next = order[(order.indexOf(get().mode) + 1) % order.length];
    await get().setMode(next);
  },
}));

// Another DEX window changed the mode: same-origin webviews share localStorage.
if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', (e) => {
    if (e.key === MODE_KEY) useNetworkStore.setState({ mode: storedMode() });
  });
}
