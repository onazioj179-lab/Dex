// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Feature Suite Stores
// Zustand stores still used by the shell: file colour labels and the
// scheduled light/dark theme. (35 unused stores were removed in Part 7.)
// ==========================================================================

import { create } from 'zustand';
import { applyTheme } from '../utils/theme';

// ==========================================================================
// IPC Helper
// ==========================================================================
const invoke = async (channel: string, ...args: any[]): Promise<any> => {
  try {
    return await (window as any).dex?.invoke(channel, ...args);
  } catch (err) {
    console.warn(`[FeatureStore] IPC invoke failed for ${channel}:`, err);
    return null;
  }
};


// ==========================================================================
// 31. COLOR LABELS STORE
// ==========================================================================
interface ColorLabelsState {
  labels: any[];
  palette: any[];
  loading: boolean;
  loadLabels: (app?: string) => Promise<void>;
  loadPalette: () => Promise<void>;
  setLabel: (app: string, itemType: string, itemId: string, itemName: string, color: string, label?: string) => Promise<any>;
  removeLabel: (app: string, itemType: string, itemId: string) => Promise<void>;
  getLabel: (app: string, itemType: string, itemId: string) => Promise<any>;
  getByColor: (app: string, color: string) => Promise<any[]>;
  getStats: (app?: string) => Promise<any[]>;
  bulkSet: (app: string, itemType: string, itemIds: string[], color: string, label?: string) => Promise<number>;
}

export const useColorLabelsStore = create<ColorLabelsState>((set) => ({
  labels: [],
  palette: [],
  loading: false,
  loadLabels: async (app) => {
    set({ loading: true });
    const data = app ? await invoke('color-labels:getByApp', app) : await invoke('color-labels:getAll');
    set({ labels: data || [], loading: false });
  },
  loadPalette: async () => {
    const data = await invoke('color-labels:getPalette');
    set({ palette: data || [] });
  },
  setLabel: async (app, itemType, itemId, itemName, color, label) => {
    return await invoke('color-labels:set', app, itemType, itemId, itemName, color, label);
  },
  removeLabel: async (app, itemType, itemId) => {
    await invoke('color-labels:remove', app, itemType, itemId);
    set((s) => ({ labels: s.labels.filter((l) => !(l.app === app && l.item_type === itemType && l.item_id === itemId)) }));
  },
  getLabel: async (app, itemType, itemId) => {
    return await invoke('color-labels:get', app, itemType, itemId);
  },
  getByColor: async (app, color) => {
    return (await invoke('color-labels:getByColor', app, color)) || [];
  },
  getStats: async (app) => {
    return (await invoke('color-labels:getStats', app)) || [];
  },
  bulkSet: async (app, itemType, itemIds, color, label) => {
    return (await invoke('color-labels:bulkSet', app, itemType, itemIds, color, label)) || 0;
  },
}));


// ==========================================================================
// 36. THEME SCHEDULE STORE
// ==========================================================================
/** Minutes since local midnight for "HH:MM" (NaN when unparseable). */
function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  if (!m) return NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Resolve the theme the schedule says should be active now, or null when the
 * schedule should NOT override (mode 'system', or unparseable). Pure — `nowMin`
 * is minutes since local midnight (defaults to the current local time). This is
 * the live application the Electron ThemeScheduleManager did via nativeTheme; the
 * Tauri port keeps the DB/sun-math native and resolves+applies here (local time
 * is trivial in JS, avoiding a native timezone dependency).
 */
export function resolveScheduledTheme(
  info: any,
  nowMin: number = new Date().getHours() * 60 + new Date().getMinutes(),
): 'light' | 'dark' | null {
  const sched = info?.schedule;
  if (!sched) return null;
  const mode = sched.mode as string;
  if (mode === 'manual-light') return 'light';
  if (mode === 'manual-dark') return 'dark';
  const lightWindow = (startMin: number, endMin: number): 'light' | 'dark' => {
    if (isNaN(startMin) || isNaN(endMin)) return 'dark';
    if (startMin <= endMin) return nowMin >= startMin && nowMin < endMin ? 'light' : 'dark';
    // wrapped window (light spans midnight) — dark only inside [end, start).
    return nowMin >= startMin || nowMin < endMin ? 'light' : 'dark';
  };
  if (mode === 'scheduled') {
    return lightWindow(hhmmToMinutes(sched.lightStart), hhmmToMinutes(sched.darkStart));
  }
  if (mode === 'solar' && info.sunTimes) {
    return lightWindow(hhmmToMinutes(info.sunTimes.sunrise), hhmmToMinutes(info.sunTimes.sunset));
  }
  return null; // 'system' / unknown — leave the user's/OS theme alone
}

/** Resolve + apply the scheduled theme; no-op when the schedule shouldn't override. */
function applyScheduledTheme(info: any): void {
  const theme = resolveScheduledTheme(info);
  if (theme) applyTheme(theme);
}

interface ThemeScheduleState {
  info: any | null;
  loading: boolean;
  loadInfo: () => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  setTimes: (lightStart: string, darkStart: string) => Promise<void>;
  setLocation: (latitude: number, longitude: number) => Promise<void>;
  /** Re-resolve from the current schedule and apply (used by the boot interval). */
  applyNow: () => void;
}

export const useThemeScheduleStore = create<ThemeScheduleState>((set, get) => ({
  info: null,
  loading: false,
  loadInfo: async () => {
    set({ loading: true });
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data, loading: false });
    applyScheduledTheme(data);
  },
  setMode: async (mode) => {
    await invoke('theme-schedule:setMode', mode);
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data });
    applyScheduledTheme(data);
  },
  setTimes: async (lightStart, darkStart) => {
    await invoke('theme-schedule:setTimes', lightStart, darkStart);
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data });
    applyScheduledTheme(data);
  },
  setLocation: async (latitude, longitude) => {
    await invoke('theme-schedule:setLocation', latitude, longitude);
    const data = await invoke('theme-schedule:getInfo');
    set({ info: data });
    applyScheduledTheme(data);
  },
  applyNow: () => { const info = get().info; if (info) applyScheduledTheme(info); },
}));
