// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
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
  'full': 'All allowed domains permitted. Updates, telemetry, and marketplace work normally.',
  'local-only': 'Only LAN/loopback connections. External servers are blocked.',
  'disabled': 'All network requests blocked. Updates, marketplace, and telemetry paused.',
};

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
  // electron.invoke is exposed via preload; tests run in jsdom without it.
  const w = (typeof window !== 'undefined' ? (window as unknown as { electron?: { invoke?: (ch: string, ...args: unknown[]) => Promise<unknown> } }) : null);
  return w?.electron?.invoke ? { invoke: w.electron.invoke.bind(w.electron) } : null;
};

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  mode: 'full',
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
      const mode = (config?.mode ?? 'full') as NetworkMode;
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
