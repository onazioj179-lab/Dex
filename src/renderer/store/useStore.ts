// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { performanceManager } from '../utils/PerformanceManager';
import type { DexAction, DexMode, DexRule, LogEntry, SystemStatus, DexPermissions } from '../../shared/types';

// ===========================================================================
// THEME STORE - Light/Dark mode management
// ===========================================================================

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  // Async load from IPC backend on startup
  (window as any).electron?.invoke?.('capability:storage:get', 'dex-theme').then((saved: string | null) => {
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
      set({ theme: saved });
    }
  }).catch((e: unknown) => { console.warn('[DEX]', e); });

  return {
  theme: (localStorage.getItem('dex-theme') as Theme) || 'dark',
  
  setTheme: (theme) => {
    localStorage.setItem('dex-theme', theme);
    (window as any).electron?.invoke?.('capability:storage:set', 'dex-theme', theme).catch((e: unknown) => { console.warn('[DEX]', e); });
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dex-theme', newTheme);
    (window as any).electron?.invoke?.('capability:storage:set', 'dex-theme', newTheme).catch((e: unknown) => { console.warn('[DEX]', e); });
    document.documentElement.setAttribute('data-theme', newTheme);
    set({ theme: newTheme });
  },
  };
});

// Initialize theme on load - always default to dark if no saved theme
const initTheme = () => {
  try {
    const savedTheme = localStorage.getItem('dex-theme') as Theme;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Default to dark theme
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Fallback to dark theme if localStorage fails
    document.documentElement.setAttribute('data-theme', 'dark');
  }
};
initTheme();

// ===========================================================================
// MAIN DEX STORE
// ===========================================================================

interface DexState {
  // Data
  actions: DexAction[];
  modes: DexMode[];
  rules: DexRule[];
  logs: LogEntry[];
  systemStatus: SystemStatus | null;
  activeMode: DexMode | null;
  permissions: DexPermissions;
  
  // UI State
  emergencyStopped: boolean;
  loading: boolean;
  
  // Actions
  setActions: (actions: DexAction[]) => void;
  setModes: (modes: DexMode[]) => void;
  setRules: (rules: DexRule[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  setSystemStatus: (status: SystemStatus | null) => void;
  setActiveMode: (mode: DexMode | null) => void;
  setPermissions: (permissions: DexPermissions) => void;
  setEmergencyStopped: (stopped: boolean) => void;
  setLoading: (loading: boolean) => void;
  
  // Data loading - optimized
  loadData: () => Promise<void>;
  refreshActions: () => Promise<void>;
  refreshModes: () => Promise<void>;
  refreshRules: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
}

// Devtools middleware is disabled in production via enabled flag (line at end of store)
export const useStore = create<DexState>()(devtools((set) => ({
  // Initial state
  actions: [],
  modes: [],
  rules: [],
  logs: [],
  systemStatus: null,
  activeMode: null,
  permissions: { openApps: true, closeApps: true, runCommands: false, adjustVolume: true, fileSystem: false, network: false },
  emergencyStopped: false,
  loading: true,
  
  // Setters
  setActions: (actions) => set({ actions }),
  setModes: (modes) => set({ modes }),
  setRules: (rules) => set({ rules }),
  setLogs: (logs) => set({ logs }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setPermissions: (permissions) => set({ permissions }),
  setEmergencyStopped: (emergencyStopped) => set({ emergencyStopped }),
  setLoading: (loading) => set({ loading }),
  
  // Load all data - record activity for performance manager
  loadData: async () => {
    performanceManager.recordActivity();
    set({ loading: true });
    
    try {
      // Use Promise.allSettled for resilience
      const results = await Promise.allSettled([
        window.dex?.actions?.getAll?.(),
        window.dex?.modes?.getAll?.(),
        window.dex?.rules?.getAll?.(),
        window.dex?.logs?.get?.(50), // Reduced from 100 for efficiency
        window.dex?.system?.getStatus?.(),
        window.dex?.modes?.getActive?.(),
        window.dex?.permissions?.getAll?.(),
      ]);
      
      const [actions, modes, rules, logs, systemStatus, activeMode, permissionsData] = results.map(
        r => r.status === 'fulfilled' ? r.value : null
      );
      
      set({
        actions: actions || [],
        modes: modes || [],
        rules: rules || [],
        logs: logs || [],
        systemStatus: systemStatus || null,
        activeMode: activeMode || null,
        permissions: permissionsData || {},
        loading: false,
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      set({ loading: false });
    }
  },
  
  // Refresh individual data - record activity
  refreshActions: async () => {
    performanceManager.recordActivity();
    try {
      const actions = await window.dex?.actions?.getAll?.();
      if (actions) set({ actions });
    } catch (err) {
      console.error('Failed to refresh actions:', err);
    }
  },
  
  refreshModes: async () => {
    performanceManager.recordActivity();
    try {
      const [modes, activeMode] = await Promise.all([
        window.dex?.modes?.getAll?.(),
        window.dex?.modes?.getActive?.(),
      ]);
      set({ modes: modes || [], activeMode: activeMode || null });
    } catch (err) {
      console.error('Failed to refresh modes:', err);
    }
  },
  
  refreshRules: async () => {
    performanceManager.recordActivity();
    try {
      const rules = await window.dex?.rules?.getAll?.();
      if (rules) set({ rules });
    } catch (err) {
      console.error('Failed to refresh rules:', err);
    }
  },
  
  refreshLogs: async () => {
    // Queue log refresh as low-priority background task
    performanceManager.queueBackgroundTask(
      'refresh-logs',
      'Refresh logs',
      async () => {
        const logs = await window.dex?.logs?.get?.(50);
        if (logs) set({ logs });
      },
      'low'
    );
  },
  
  refreshSystemStatus: async () => {
    performanceManager.recordActivity();
    try {
      const systemStatus = await window.dex?.system?.getStatus?.();
      if (systemStatus) set({ systemStatus });
    } catch (err) {
      console.error('Failed to refresh system status:', err);
    }
  },
}), { name: 'DexStore', enabled: import.meta.env.DEV }));

// ---- Selectors ----
export const selectActions = (s: DexState) => s.actions;
export const selectModes = (s: DexState) => s.modes;
export const selectRules = (s: DexState) => s.rules;
export const selectLogs = (s: DexState) => s.logs;
export const selectSystemStatus = (s: DexState) => s.systemStatus;
export const selectActiveMode = (s: DexState) => s.activeMode;
export const selectPermissions = (s: DexState) => s.permissions;
export const selectIsLoading = (s: DexState) => s.loading;
export const selectEmergencyStopped = (s: DexState) => s.emergencyStopped;

// ---- Auto-refresh on window focus (stale-while-revalidate pattern) ----
// Refreshes system status and logs when the user returns to the window,
// but only if data is older than the staleness threshold.
const STALE_THRESHOLD_MS = 30_000; // 30 seconds
let _lastRefreshAt = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - _lastRefreshAt < STALE_THRESHOLD_MS) return;
    _lastRefreshAt = now;
    const store = useStore.getState();
    // Run low-cost refreshes — heavy ones stay background-queued
    store.refreshSystemStatus().catch(() => {});
    store.refreshLogs().catch(() => {});
  });
}
