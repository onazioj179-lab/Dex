// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// Xenon Renderer Store — Receives kernel push events, exposes reactive state
// Eliminates all renderer-side polling for system metrics.
// ===========================================================================

import { create } from 'zustand';

interface XenonState {
  // System metrics (pushed from main process)
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;

  // Throttle & pressure
  throttleLevel: 'none' | 'light' | 'moderate' | 'aggressive' | 'emergency';
  memoryPressure: 'normal' | 'moderate' | 'aggressive';

  // Power
  onBattery: boolean;
  batteryPercent: number;

  // GPU tier
  gpuTier: 'low' | 'mid' | 'high' | 'ultra';

  // Subsystem states
  activeSubsystems: number;
  totalSubsystems: number;

  // Last update
  lastUpdate: number;

  // Actions
  updateMetrics: (metrics: Partial<XenonState>) => void;
}

export const useXenonStore = create<XenonState>((set) => ({
  cpuPercent: 0,
  memoryPercent: 0,
  memoryUsedMB: 0,
  memoryTotalMB: 0,
  throttleLevel: 'none',
  memoryPressure: 'normal',
  onBattery: false,
  batteryPercent: 100,
  gpuTier: 'mid',
  activeSubsystems: 0,
  totalSubsystems: 0,
  lastUpdate: 0,
  updateMetrics: (metrics) => set((state) => ({ ...state, ...metrics, lastUpdate: Date.now() })),
}));

// --------------------------------------------------
// IPC listener — receives pushed data from Xenon main process
// --------------------------------------------------
let initialized = false;
let cleanupFns: (() => void)[] = [];

export function initXenonListener(): () => void {
  // If re-initialized (e.g., HMR), cleanup old listeners first
  if (initialized) {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  }
  initialized = true;

  const electron = (window as any).electron;
  if (!electron?.on) return () => {};

  const listen = (channel: string, handler: (...args: any[]) => void) => {
    electron.on(channel, handler);
    cleanupFns.push(() => electron.off?.(channel, handler));
  };

  // Note: preload's electron.on() strips the IPC event arg — callbacks receive data directly
  listen('xenon:systemSample', (data: any) => {
    if (!data) return;
    useXenonStore.getState().updateMetrics({
      cpuPercent: data.cpuPercent ?? 0,
      memoryPercent: data.memoryPercent ?? 0,
      memoryUsedMB: data.memoryUsedMB ?? 0,
      memoryTotalMB: data.memoryTotalMB ?? 0,
    });
  });

  listen('xenon:throttle', (data: any) => {
    if (!data) return;
    useXenonStore.getState().updateMetrics({
      throttleLevel: data.level ?? 'none',
    });
  });

  listen('xenon:memoryPressure', (data: any) => {
    // Xenon sends raw severity string, not an object
    const level = typeof data === 'string' ? data : data?.level;
    if (!level) return;
    useXenonStore.getState().updateMetrics({
      memoryPressure: level as any,
    });
  });

  listen('xenon:power', (data: any) => {
    if (!data) return;
    useXenonStore.getState().updateMetrics({
      onBattery: data.onBattery ?? false,
      batteryPercent: data.batteryPercent ?? 100,
    });
  });

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    initialized = false;
  };
}
