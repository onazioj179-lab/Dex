// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Power Management System
// ==========================================================================
// Feature 28: Battery Detection and Power Source Awareness
// Feature 29: Idle States (Active / Idle / DeepIdle)
// Feature 30: Display Sleep Awareness
// Feature 31: Suspend/Resume Handling
// Feature 32: Charge-State Pre-Computation Scheduling
// ==========================================================================

import * as os from 'os';
import * as log from 'electron-log';
import { powerMonitor, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Feature 28: Battery Detection
// ---------------------------------------------------------------------------

export type PowerSource = 'ac' | 'battery' | 'unknown';

export interface BatteryState {
  source: PowerSource;
  level: number;           // 0-100
  charging: boolean;
  timeToEmpty: number;     // seconds, -1 if unknown
  timeToFull: number;      // seconds, -1 if unknown
  lastUpdated: number;
}

class BatteryMonitor {
  private state: BatteryState = {
    source: 'unknown',
    charging: false,
    level: 100,
    timeToEmpty: -1,
    timeToFull: -1,
    lastUpdated: 0,
  };
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(state: BatteryState) => void> = [];

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.updateBatteryState();
    }, 30_000); // Every 30 seconds

    // Initial check
    this.updateBatteryState();

    // Listen for power events
    try {
      powerMonitor.on('on-ac', () => {
        this.state.source = 'ac';
        this.state.charging = true;
        this.notifyListeners();
      });
      powerMonitor.on('on-battery', () => {
        this.state.source = 'battery';
        this.state.charging = false;
        this.notifyListeners();
      });
    } catch { /* ok if not ready */ }

    log.info('[Battery] Feature 28: Battery monitor initialized');
  }

  private async updateBatteryState(): Promise<void> {
    try {
      const si = require('systeminformation');
      const battery = await si.battery();

      this.state = {
        source: battery.hasBattery ? (battery.acConnected ? 'ac' : 'battery') : 'ac',
        level: Math.round(battery.percent || 100),
        charging: battery.isCharging || false,
        timeToEmpty: battery.timeRemaining != null ? battery.timeRemaining * 60 : -1,
        timeToFull: -1,
        lastUpdated: Date.now(),
      };

      this.notifyListeners();
    } catch {
      // systeminformation may not provide battery info on desktops
      this.state.source = 'ac';
      this.state.level = 100;
      this.state.lastUpdated = Date.now();
    }
  }

  onBatteryChange(listener: (state: BatteryState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try { listener(this.state); } catch { /* ok */ }
    }
  }

  getState(): BatteryState {
    return { ...this.state };
  }

  isOnBattery(): boolean {
    return this.state.source === 'battery';
  }

  isCriticalBattery(): boolean {
    return this.state.source === 'battery' && this.state.level < 10;
  }

  isLowBattery(): boolean {
    return this.state.source === 'battery' && this.state.level < 25;
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners = [];
  }
}

// ---------------------------------------------------------------------------
// Feature 29: Idle States
// ---------------------------------------------------------------------------

export type IdleTier = 'active' | 'idle' | 'deep-idle';

const IDLE_THRESHOLD_MS = 2 * 60 * 1000;       // 2 minutes
const DEEP_IDLE_THRESHOLD_MS = 10 * 60 * 1000;  // 10 minutes

interface IdleStateInfo {
  tier: IdleTier;
  secondsIdle: number;
  enteredAt: number;
  pollReductionFactor: number;
}

class IdleStateManager {
  private currentTier: IdleTier = 'active';
  private lastInteraction = Date.now();
  private tierEnteredAt = Date.now();
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(tier: IdleTier, prev: IdleTier) => void> = [];

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.updateIdleState();
    }, 5000); // Check every 5 seconds
    log.info('[IdleState] Feature 29: Idle state manager initialized');
  }

  recordInteraction(): void {
    this.lastInteraction = Date.now();
    if (this.currentTier !== 'active') {
      this.transitionTo('active');
    }
  }

  private updateIdleState(): void {
    try {
      const systemIdle = powerMonitor.getSystemIdleTime();
      const idleMs = systemIdle * 1000;

      let newTier: IdleTier;
      if (idleMs >= DEEP_IDLE_THRESHOLD_MS) {
        newTier = 'deep-idle';
      } else if (idleMs >= IDLE_THRESHOLD_MS) {
        newTier = 'idle';
      } else {
        newTier = 'active';
      }

      if (newTier !== this.currentTier) {
        this.transitionTo(newTier);
      }
    } catch {
      // Fallback to manual tracking
      const manualIdleMs = Date.now() - this.lastInteraction;
      let newTier: IdleTier;
      if (manualIdleMs >= DEEP_IDLE_THRESHOLD_MS) {
        newTier = 'deep-idle';
      } else if (manualIdleMs >= IDLE_THRESHOLD_MS) {
        newTier = 'idle';
      } else {
        newTier = 'active';
      }

      if (newTier !== this.currentTier) {
        this.transitionTo(newTier);
      }
    }
  }

  private transitionTo(newTier: IdleTier): void {
    const prev = this.currentTier;
    this.currentTier = newTier;
    this.tierEnteredAt = Date.now();

    const pollFactors: Record<IdleTier, number> = {
      'active': 1,
      'idle': 0.5,
      'deep-idle': 0.1,
    };

    log.info(`[IdleState] Tier changed: ${prev} -> ${newTier}`);

    for (const listener of this.listeners) {
      try { listener(newTier, prev); } catch { /* ok */ }
    }

    // Emit event to bus
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'app-focus',
        source: 'idle-state',
        payload: { tier: newTier, previousTier: prev },
        timestamp: Date.now(),
        id: `idle-${Date.now()}`,
      });
    } catch { /* ok */ }
  }

  onTierChange(listener: (tier: IdleTier, prev: IdleTier) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getState(): IdleStateInfo {
    const pollFactors: Record<IdleTier, number> = { 'active': 1, 'idle': 0.5, 'deep-idle': 0.1 };
    return {
      tier: this.currentTier,
      secondsIdle: Math.round((Date.now() - this.lastInteraction) / 1000),
      enteredAt: this.tierEnteredAt,
      pollReductionFactor: pollFactors[this.currentTier],
    };
  }

  getTier(): IdleTier {
    return this.currentTier;
  }

  getPollFactor(): number {
    const factors: Record<IdleTier, number> = { 'active': 1, 'idle': 0.5, 'deep-idle': 0.1 };
    return factors[this.currentTier];
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners = [];
  }
}

// ---------------------------------------------------------------------------
// Feature 30: Display Sleep Awareness
// ---------------------------------------------------------------------------

class DisplaySleepAwareness {
  private displayAsleep = false;
  private lastSleepAt = 0;
  private lastWakeAt = 0;
  private sleepCount = 0;

  initialize(): void {
    try {
      powerMonitor.on('suspend', () => {
        this.onDisplaySleep();
      });

      powerMonitor.on('resume', () => {
        this.onDisplayWake();
      });

      // Some platforms also have these
      powerMonitor.on('lock-screen', () => {
        this.onDisplaySleep();
      });

      powerMonitor.on('unlock-screen', () => {
        this.onDisplayWake();
      });
    } catch { /* ok if not ready */ }

    log.info('[DisplaySleep] Feature 30: Display sleep awareness initialized');
  }

  private onDisplaySleep(): void {
    if (this.displayAsleep) return;

    this.displayAsleep = true;
    this.lastSleepAt = Date.now();
    this.sleepCount++;

    log.info('[DisplaySleep] Display went to sleep');

    // Reduce GPU work, pause animations
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'system-warning',
        source: 'display-sleep',
        payload: { asleep: true },
        timestamp: Date.now(),
        id: `display-sleep-${Date.now()}`,
      });
    } catch { /* ok */ }
  }

  private onDisplayWake(): void {
    if (!this.displayAsleep) return;

    this.displayAsleep = false;
    this.lastWakeAt = Date.now();
    const sleepDuration = this.lastWakeAt - this.lastSleepAt;

    log.info(`[DisplaySleep] Display woke after ${Math.round(sleepDuration / 1000)}s`);

    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'app-focus',
        source: 'display-wake',
        payload: { asleep: false, sleepDurationMs: sleepDuration },
        timestamp: Date.now(),
        id: `display-wake-${Date.now()}`,
      });
    } catch { /* ok */ }
  }

  isDisplayAsleep(): boolean {
    return this.displayAsleep;
  }

  getSleepStats(): { sleepCount: number; lastSleepAt: number; lastWakeAt: number } {
    return {
      sleepCount: this.sleepCount,
      lastSleepAt: this.lastSleepAt,
      lastWakeAt: this.lastWakeAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 31: Suspend/Resume Handling
// ---------------------------------------------------------------------------

interface SuspendResumeEvent {
  type: 'suspend' | 'resume';
  timestamp: number;
  sleepDurationMs: number;
}

class SuspendResumeHandler {
  private events: SuspendResumeEvent[] = [];
  private lastSuspendAt = 0;
  private pendingSuspend = false;
  private resumeCallbacks: Array<(sleepDurationMs: number) => void> = [];
  private suspendCallbacks: Array<() => void> = [];

  initialize(): void {
    try {
      powerMonitor.on('suspend', () => {
        this.onSuspend();
      });

      powerMonitor.on('resume', () => {
        this.onResume();
      });

      powerMonitor.on('shutdown', () => {
        this.onSuspend(); // Treat shutdown as suspend
      });
    } catch { /* ok */ }

    log.info('[SuspendResume] Feature 31: Suspend/resume handler initialized');
  }

  private onSuspend(): void {
    this.pendingSuspend = true;
    this.lastSuspendAt = Date.now();

    this.events.push({ type: 'suspend', timestamp: this.lastSuspendAt, sleepDurationMs: 0 });
    if (this.events.length > 100) this.events = this.events.slice(-50);

    log.info('[SuspendResume] System suspending');

    // Flush all pending writes
    for (const cb of this.suspendCallbacks) {
      try { cb(); } catch { /* ok */ }
    }

    // Emit event
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'system-warning',
        source: 'suspend-resume',
        payload: { type: 'suspend' },
        timestamp: Date.now(),
        id: `suspend-${Date.now()}`,
      });
    } catch { /* ok */ }
  }

  private onResume(): void {
    const sleepDuration = this.pendingSuspend ? Date.now() - this.lastSuspendAt : 0;
    this.pendingSuspend = false;

    this.events.push({ type: 'resume', timestamp: Date.now(), sleepDurationMs: sleepDuration });
    if (this.events.length > 100) this.events = this.events.slice(-50);

    log.info(`[SuspendResume] System resumed after ${Math.round(sleepDuration / 1000)}s`);

    // Notify resume callbacks
    for (const cb of this.resumeCallbacks) {
      try { cb(sleepDuration); } catch { /* ok */ }
    }

    // Refresh system state
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'app-ready',
        source: 'suspend-resume',
        payload: { type: 'resume', sleepDurationMs: sleepDuration },
        timestamp: Date.now(),
        id: `resume-${Date.now()}`,
      });
    } catch { /* ok */ }
  }

  onSuspendEvent(callback: () => void): () => void {
    this.suspendCallbacks.push(callback);
    return () => {
      this.suspendCallbacks = this.suspendCallbacks.filter(c => c !== callback);
    };
  }

  onResumeEvent(callback: (sleepDurationMs: number) => void): () => void {
    this.resumeCallbacks.push(callback);
    return () => {
      this.resumeCallbacks = this.resumeCallbacks.filter(c => c !== callback);
    };
  }

  getRecentEvents(): SuspendResumeEvent[] {
    return [...this.events];
  }

  isSuspended(): boolean {
    return this.pendingSuspend;
  }
}

// ---------------------------------------------------------------------------
// Feature 32: Charge-State Pre-Computation
// ---------------------------------------------------------------------------

interface PreComputeTask {
  id: string;
  name: string;
  fn: () => Promise<void>;
  estimatedDurationMs: number;
  acOnly: boolean;
  lastRunAt: number;
  intervalMs: number;
}

class ChargeStatePreComputer {
  private tasks: PreComputeTask[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private running = false;

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkAndRun();
    }, 60_000); // Check every minute
    log.info('[ChargePreCompute] Feature 32: Charge-state pre-computation initialized');
  }

  registerTask(task: Omit<PreComputeTask, 'lastRunAt'>): void {
    this.tasks.push({ ...task, lastRunAt: 0 });
  }

  private async checkAndRun(): Promise<void> {
    if (this.running) return;

    const battery = powerManager.getBatteryState();
    const isCharging = battery.charging || battery.source === 'ac';
    const now = Date.now();

    for (const task of this.tasks) {
      if (task.acOnly && !isCharging) continue;
      if (now - task.lastRunAt < task.intervalMs) continue;

      this.running = true;
      try {
        const started = Date.now();
        await task.fn();
        task.lastRunAt = Date.now();
        const elapsed = Date.now() - started;
        log.info(`[ChargePreCompute] Ran '${task.name}' in ${elapsed}ms`);
      } catch (err) {
        log.warn(`[ChargePreCompute] Task '${task.name}' failed:`, err);
      }
      this.running = false;
    }
  }

  getRegisteredTasks(): Array<{ name: string; lastRunAt: number; acOnly: boolean }> {
    return this.tasks.map(t => ({
      name: t.name,
      lastRunAt: t.lastRunAt,
      acOnly: t.acOnly,
    }));
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Main Power Manager
// ---------------------------------------------------------------------------

class PowerManager {
  private battery = new BatteryMonitor();
  private idleState = new IdleStateManager();
  private displaySleep = new DisplaySleepAwareness();
  private suspendResume = new SuspendResumeHandler();
  private chargePreCompute = new ChargeStatePreComputer();

  initialize(): void {
    this.battery.initialize();
    this.idleState.initialize();
    this.displaySleep.initialize();
    this.suspendResume.initialize();
    this.chargePreCompute.initialize();

    // React to battery changes
    this.battery.onBatteryChange((state) => {
      if (state.source === 'battery' && state.level < 10) {
        log.warn('[PowerManager] Critical battery - reducing background work');
        try {
          const { processScheduler } = require('./ProcessScheduler');
          processScheduler.boostQoS('background', 0.25);
        } catch { /* ok */ }
      }
    });

    log.info('[PowerManager] Features 28-32: Power management system initialized');
  }

  getBatteryState(): BatteryState {
    return this.battery.getState();
  }

  getIdleTier(): IdleTier {
    return this.idleState.getTier();
  }

  getIdleState(): IdleStateInfo {
    return this.idleState.getState();
  }

  isDisplayAsleep(): boolean {
    return this.displaySleep.isDisplayAsleep();
  }

  isSuspended(): boolean {
    return this.suspendResume.isSuspended();
  }

  recordUserInteraction(): void {
    this.idleState.recordInteraction();
  }

  onIdleTierChange(listener: (tier: IdleTier, prev: IdleTier) => void): () => void {
    return this.idleState.onTierChange(listener);
  }

  onSuspend(callback: () => void): () => void {
    return this.suspendResume.onSuspendEvent(callback);
  }

  onResume(callback: (sleepDurationMs: number) => void): () => void {
    return this.suspendResume.onResumeEvent(callback);
  }

  registerPreComputeTask(task: Omit<PreComputeTask, 'lastRunAt'>): void {
    this.chargePreCompute.registerTask(task);
  }

  getStats(): {
    battery: BatteryState;
    idle: IdleStateInfo;
    displayAsleep: boolean;
    suspended: boolean;
    preComputeTasks: number;
  } {
    return {
      battery: this.getBatteryState(),
      idle: this.getIdleState(),
      displayAsleep: this.isDisplayAsleep(),
      suspended: this.isSuspended(),
      preComputeTasks: this.chargePreCompute.getRegisteredTasks().length,
    };
  }

  shutdown(): void {
    this.battery.shutdown();
    this.idleState.shutdown();
    this.chargePreCompute.shutdown();
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const powerManager = new PowerManager();

export function initializePowerManager(): void {
  powerManager.initialize();
}

export function shutdownPowerManager(): void {
  powerManager.shutdown();
}
