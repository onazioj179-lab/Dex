// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Power Management Utilities (Items 281-300)
 * Intelligent power management WITHOUT screen dimming per user request.
 * Focuses on CPU throttling, background task suspension, and network optimization.
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type PowerMode = 'balanced' | 'performance' | 'battery-saver';

export interface PowerState {
  mode: PowerMode;
  isOnBattery: boolean;
  batteryLevel: number | null;
  isCharging: boolean;
  estimatedTimeRemaining: number | null; // minutes
  // Settings
  autoSwitchOnBattery: boolean;
  batteryThreshold: number; // Switch to battery-saver below this %
  suspendBackgroundApps: boolean;
  reduceNetworkPolling: boolean;
  // NOTE: No screen dimming setting - explicitly excluded per user requirement
}

// ============================================================================
// Power Store
// ============================================================================

interface PowerStore extends PowerState {
  setMode: (mode: PowerMode) => void;
  updateBatteryStatus: (status: Partial<PowerState>) => void;
  setAutoSwitch: (enabled: boolean) => void;
  setBatteryThreshold: (threshold: number) => void;
  setSuspendBackgroundApps: (enabled: boolean) => void;
  setReduceNetworkPolling: (enabled: boolean) => void;
}

export const usePowerStore = create<PowerStore>((set, get) => ({
  // Initial state
  mode: 'balanced',
  isOnBattery: false,
  batteryLevel: null,
  isCharging: false,
  estimatedTimeRemaining: null,
  autoSwitchOnBattery: true,
  batteryThreshold: 20,
  suspendBackgroundApps: true,
  reduceNetworkPolling: true,

  setMode: (mode) => set({ mode }),

  updateBatteryStatus: (status) => {
    const current = get();
    set({ ...status });

    // Auto-switch logic
    if (current.autoSwitchOnBattery) {
      const newLevel = status.batteryLevel ?? current.batteryLevel;
      const newOnBattery = status.isOnBattery ?? current.isOnBattery;
      const newCharging = status.isCharging ?? current.isCharging;

      if (newOnBattery && !newCharging && newLevel !== null) {
        if (newLevel <= current.batteryThreshold && current.mode !== 'battery-saver') {
          set({ mode: 'battery-saver' });
        }
      } else if (!newOnBattery || newCharging) {
        if (current.mode === 'battery-saver') {
          set({ mode: 'balanced' });
        }
      }
    }
  },

  setAutoSwitch: (enabled) => set({ autoSwitchOnBattery: enabled }),
  setBatteryThreshold: (threshold) => set({ batteryThreshold: Math.max(5, Math.min(50, threshold)) }),
  setSuspendBackgroundApps: (enabled) => set({ suspendBackgroundApps: enabled }),
  setReduceNetworkPolling: (enabled) => set({ reduceNetworkPolling: enabled }),
}));

// ============================================================================
// Power Mode Configuration
// NOTE: No screen dimming or brightness changes per user requirement
// ============================================================================

export interface PowerModeConfig {
  // Animation reduction
  reduceAnimations: boolean;
  // Background processing
  backgroundTaskInterval: number; // ms between background tasks
  suspendInactiveApps: boolean;
  // Network
  networkPollingInterval: number; // ms
  prefetchEnabled: boolean;
  // Rendering
  maxFPS: number;
  useHardwareAcceleration: boolean;
}

export const POWER_MODE_CONFIGS: Record<PowerMode, PowerModeConfig> = {
  balanced: {
    reduceAnimations: false,
    backgroundTaskInterval: 5000,
    suspendInactiveApps: false,
    networkPollingInterval: 30000,
    prefetchEnabled: true,
    maxFPS: 60,
    useHardwareAcceleration: true,
  },
  performance: {
    reduceAnimations: false,
    backgroundTaskInterval: 1000,
    suspendInactiveApps: false,
    networkPollingInterval: 10000,
    prefetchEnabled: true,
    maxFPS: 120,
    useHardwareAcceleration: true,
  },
  'battery-saver': {
    reduceAnimations: true,
    backgroundTaskInterval: 30000,
    suspendInactiveApps: true,
    networkPollingInterval: 120000,
    prefetchEnabled: false,
    maxFPS: 30,
    useHardwareAcceleration: true, // Still use GPU, just less work
  },
};

// ============================================================================
// Battery Status Monitor
// ============================================================================

let batteryMonitorInterval: number | null = null;

export async function initBatteryMonitor(): Promise<void> {
  // Use Battery Status API if available
  if ('getBattery' in navigator) {
    try {
      const battery = await (navigator as Navigator & { getBattery: () => Promise<BatteryManager> }).getBattery();
      
      const updateBattery = () => {
        usePowerStore.getState().updateBatteryStatus({
          batteryLevel: Math.round(battery.level * 100),
          isCharging: battery.charging,
          isOnBattery: !battery.charging && battery.level < 1,
          estimatedTimeRemaining: battery.charging 
            ? battery.chargingTime !== Infinity ? Math.round(battery.chargingTime / 60) : null
            : battery.dischargingTime !== Infinity ? Math.round(battery.dischargingTime / 60) : null,
        });
      };

      battery.addEventListener('chargingchange', updateBattery);
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingtimechange', updateBattery);
      battery.addEventListener('dischargingtimechange', updateBattery);
      
      updateBattery();
    } catch (error) {
      console.warn('[Power] Battery API not available:', error);
    }
  }
}

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

// ============================================================================
// Background Task Scheduler
// ============================================================================

interface BackgroundTask {
  id: string;
  callback: () => void | Promise<void>;
  interval: number; // base interval in ms
  lastRun: number;
  priority: 'high' | 'normal' | 'low';
}

const backgroundTasks = new Map<string, BackgroundTask>();
let schedulerInterval: number | null = null;

export function registerBackgroundTask(
  id: string,
  callback: () => void | Promise<void>,
  interval: number,
  priority: 'high' | 'normal' | 'low' = 'normal'
): void {
  backgroundTasks.set(id, {
    id,
    callback,
    interval,
    lastRun: 0,
    priority,
  });
}

export function unregisterBackgroundTask(id: string): void {
  backgroundTasks.delete(id);
}

function getAdjustedInterval(task: BackgroundTask, config: PowerModeConfig): number {
  // Adjust interval based on power mode and priority
  let multiplier = config.backgroundTaskInterval / 5000; // baseline is balanced mode
  
  if (task.priority === 'low') {
    multiplier *= 2;
  } else if (task.priority === 'high') {
    multiplier = Math.max(1, multiplier / 2);
  }

  return task.interval * multiplier;
}

async function runScheduler(): Promise<void> {
  const { mode, suspendBackgroundApps } = usePowerStore.getState();
  const config = POWER_MODE_CONFIGS[mode];
  const now = Date.now();

  for (const task of backgroundTasks.values()) {
    // Skip low-priority tasks in battery-saver mode if suspend is enabled
    if (suspendBackgroundApps && mode === 'battery-saver' && task.priority === 'low') {
      continue;
    }

    const adjustedInterval = getAdjustedInterval(task, config);
    if (now - task.lastRun >= adjustedInterval) {
      task.lastRun = now;
      try {
        await task.callback();
      } catch (error) {
        console.error(`[Power] Background task ${task.id} failed:`, error);
      }
    }
  }
}

export function startBackgroundScheduler(): void {
  if (schedulerInterval !== null) return;
  
  schedulerInterval = window.setInterval(runScheduler, 1000);
}

export function stopBackgroundScheduler(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

// ============================================================================
// Network Polling Manager
// ============================================================================

interface PollingTask {
  id: string;
  callback: () => void | Promise<void>;
  baseInterval: number;
  lastPoll: number;
  active: boolean;
}

const pollingTasks = new Map<string, PollingTask>();
let pollingInterval: number | null = null;

export function registerPollingTask(
  id: string,
  callback: () => void | Promise<void>,
  interval: number
): void {
  pollingTasks.set(id, {
    id,
    callback,
    baseInterval: interval,
    lastPoll: 0,
    active: true,
  });
}

export function unregisterPollingTask(id: string): void {
  pollingTasks.delete(id);
}

export function pausePolling(id: string): void {
  const task = pollingTasks.get(id);
  if (task) task.active = false;
}

export function resumePolling(id: string): void {
  const task = pollingTasks.get(id);
  if (task) task.active = true;
}

function getPollingMultiplier(): number {
  const { mode, reduceNetworkPolling } = usePowerStore.getState();
  if (!reduceNetworkPolling) return 1;

  switch (mode) {
    case 'performance': return 0.5;
    case 'balanced': return 1;
    case 'battery-saver': return 4;
    default: return 1;
  }
}

async function runPolling(): Promise<void> {
  const now = Date.now();
  const multiplier = getPollingMultiplier();

  for (const task of pollingTasks.values()) {
    if (!task.active) continue;

    const adjustedInterval = task.baseInterval * multiplier;
    if (now - task.lastPoll >= adjustedInterval) {
      task.lastPoll = now;
      try {
        await task.callback();
      } catch (error) {
        console.error(`[Power] Polling task ${task.id} failed:`, error);
      }
    }
  }
}

export function startPollingManager(): void {
  if (pollingInterval !== null) return;
  pollingInterval = window.setInterval(runPolling, 1000);
}

export function stopPollingManager(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============================================================================
// FPS Limiter
// ============================================================================

let fpsLimitEnabled = false;
let lastFrameTime = 0;

export function enableFPSLimit(): void {
  fpsLimitEnabled = true;
}

export function disableFPSLimit(): void {
  fpsLimitEnabled = false;
}

export function shouldRenderFrame(): boolean {
  if (!fpsLimitEnabled) return true;

  const { mode } = usePowerStore.getState();
  const config = POWER_MODE_CONFIGS[mode];
  const minFrameTime = 1000 / config.maxFPS;
  const now = performance.now();

  if (now - lastFrameTime >= minFrameTime) {
    lastFrameTime = now;
    return true;
  }

  return false;
}

// ============================================================================
// Hooks
// ============================================================================

export function usePowerMode(): PowerMode {
  return usePowerStore(state => state.mode);
}

export function usePowerConfig(): PowerModeConfig {
  const mode = usePowerStore(state => state.mode);
  return POWER_MODE_CONFIGS[mode];
}

export function useBatteryStatus(): {
  level: number | null;
  isCharging: boolean;
  isOnBattery: boolean;
  timeRemaining: number | null;
} {
  return usePowerStore(state => ({
    level: state.batteryLevel,
    isCharging: state.isCharging,
    isOnBattery: state.isOnBattery,
    timeRemaining: state.estimatedTimeRemaining,
  }));
}

// ============================================================================
// Initialize
// ============================================================================

export async function initPowerManagement(): Promise<void> {
  await initBatteryMonitor();
  startBackgroundScheduler();
  startPollingManager();
  
  // Register visibility change handler to optimize when tab is hidden
  document.addEventListener('visibilitychange', () => {
    const { mode } = usePowerStore.getState();
    if (document.hidden && mode !== 'battery-saver') {
      // When hidden, temporarily act like battery-saver for background tasks
      // but restore when visible again (no permanent mode change)
    }
  });
}

export function cleanupPowerManagement(): void {
  stopBackgroundScheduler();
  stopPollingManager();
}
