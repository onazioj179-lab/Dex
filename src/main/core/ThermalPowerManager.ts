// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Thermal and Power Manager
// ==========================================================================
// Monitors CPU temperature and battery state. Emits thermal and power
// events that all systems subscribe to. Applies graduated throttling:
// cool -> warm -> hot -> critical with progressive recovery.
// Manages GPU power preference, timer resolution, and battery responses.
// ==========================================================================

import { EventEmitter } from 'events';
import { BrowserWindow, powerMonitor, ipcMain } from 'electron';
import * as log from 'electron-log';
import {
  hardwareDetector,
  ThermalState,
  PowerState,
} from './HardwareDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThermalEvent {
  state: ThermalState;
  temperatureC: number;
  baselineC: number;
  cpuPercent: number;
  timestamp: number;
}

export interface PowerEvent {
  state: PowerState;
  batteryPercent: number;
  isCharging: boolean;
  isDesktop: boolean;
  timestamp: number;
}

export interface ThermalPowerSnapshot {
  thermal: ThermalEvent;
  power: PowerEvent;
  gpuPowerMode: 'low-power' | 'high-performance';
  backgroundWorkerReduction: number;
  gameFrameCap: number;
  gameResolutionStep: number;
  animationScale: number;
  writeCoalesceMs: number;
}

export type ThermalHandler = (event: ThermalEvent) => void;
export type PowerHandler = (event: PowerEvent) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THERMAL_CHECK_INTERVAL_MS = 5_000;
const THERMAL_RECOVERY_STEP_MS = 5_000;
const THERMAL_RECOVERY_STEPS = 6;

// ---------------------------------------------------------------------------
// Thermal Power Manager
// ---------------------------------------------------------------------------

class ThermalPowerManager extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private thermalInterval: ReturnType<typeof setInterval> | null = null;
  private batteryInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;

  private currentThermal: ThermalEvent = {
    state: 'cool',
    temperatureC: 0,
    baselineC: 0,
    cpuPercent: 0,
    timestamp: Date.now(),
  };

  private currentPower: PowerEvent = {
    state: 'ac',
    batteryPercent: 100,
    isCharging: false,
    isDesktop: true,
    timestamp: Date.now(),
  };

  private gpuPowerMode: 'low-power' | 'high-performance' = 'low-power';
  private backgroundReduction = 0;
  private gameFrameCap = 0;
  private gameResolutionStep = 0;
  private animationScale = 1;
  private writeCoalesceMs = 100;
  private recovering = false;
  private recoveryStep = 0;

  private thermalHandlers: ThermalHandler[] = [];
  private powerHandlers: PowerHandler[] = [];

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(win: BrowserWindow): void {
    if (this.started) return;
    this.started = true;
    this.mainWindow = win;

    this.registerIPC();
    this.setupPowerMonitor();

    this.thermalInterval = setInterval(() => this.checkThermal(), THERMAL_CHECK_INTERVAL_MS);
    this.batteryInterval = setInterval(() => this.checkBattery(), 10_000);

    const profile = hardwareDetector.getProfile();
    if (profile) {
      this.currentPower = {
        state: profile.battery.powerState,
        batteryPercent: profile.battery.percent,
        isCharging: profile.battery.isCharging,
        isDesktop: !profile.battery.hasBattery,
        timestamp: Date.now(),
      };
      this.applyPowerState(this.currentPower.state);
    }

    log.info('[ThermalPower] Started');
  }

  stop(): void {
    if (this.thermalInterval) clearInterval(this.thermalInterval);
    if (this.batteryInterval) clearInterval(this.batteryInterval);
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    this.started = false;
    log.info('[ThermalPower] Stopped');
  }

  onThermalChange(handler: ThermalHandler): () => void {
    this.thermalHandlers.push(handler);
    return () => {
      this.thermalHandlers = this.thermalHandlers.filter(h => h !== handler);
    };
  }

  onPowerChange(handler: PowerHandler): () => void {
    this.powerHandlers.push(handler);
    return () => {
      this.powerHandlers = this.powerHandlers.filter(h => h !== handler);
    };
  }

  getSnapshot(): ThermalPowerSnapshot {
    return {
      thermal: { ...this.currentThermal },
      power: { ...this.currentPower },
      gpuPowerMode: this.gpuPowerMode,
      backgroundWorkerReduction: this.backgroundReduction,
      gameFrameCap: this.gameFrameCap,
      gameResolutionStep: this.gameResolutionStep,
      animationScale: this.animationScale,
      writeCoalesceMs: this.writeCoalesceMs,
    };
  }

  setGPUActive(active: boolean): void {
    this.gpuPowerMode = active ? 'high-performance' : 'low-power';
    this.broadcastToRenderer('dex:gpu-power-mode', { mode: this.gpuPowerMode });
  }

  // -----------------------------------------------------------------------
  // IPC
  // -----------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('thermal:getSnapshot', async () => this.getSnapshot());

    ipcMain.on('thermal:gpu-active', (_, active: boolean) => {
      this.setGPUActive(active);
    });

    ipcMain.on('thermal:report-cpu', (_, cpuPercent: number) => {
      this.currentThermal.cpuPercent = cpuPercent;
    });
  }

  // -----------------------------------------------------------------------
  // Power monitor
  // -----------------------------------------------------------------------

  private setupPowerMonitor(): void {
    powerMonitor.on('on-ac', () => {
      log.info('[ThermalPower] Switched to AC power');
      this.handleBatteryChange(true, this.currentPower.batteryPercent);
    });

    powerMonitor.on('on-battery', () => {
      log.info('[ThermalPower] Switched to battery');
      this.handleBatteryChange(false, this.currentPower.batteryPercent);
    });

    powerMonitor.on('suspend', () => {
      log.info('[ThermalPower] System suspending');
      this.broadcastToRenderer('dex:system-suspend', {});
    });

    powerMonitor.on('resume', () => {
      log.info('[ThermalPower] System resumed');
      this.broadcastToRenderer('dex:system-resume', {});
    });
  }

  // -----------------------------------------------------------------------
  // Thermal monitoring
  // -----------------------------------------------------------------------

  private async checkThermal(): Promise<void> {
    let temp = 0;
    let cpuPercent = this.currentThermal.cpuPercent;

    try {
      let si: any;
      try { si = require('systeminformation'); } catch { /* ignore */ }
      if (si) {
        const tempData = await si.cpuTemperature();
        if (tempData && tempData.main && tempData.main > 0) {
          temp = tempData.main;
        }

        const load = await si.currentLoad();
        if (load) {
          cpuPercent = Math.round(load.currentLoad);
        }
      }
    } catch { /* ignore */ }

    let state: ThermalState;
    if (temp > 0) {
      state = hardwareDetector.updateThermal(temp);
    } else {
      state = hardwareDetector.updateThermalFromCPU(cpuPercent);
    }

    const prev = this.currentThermal.state;
    this.currentThermal = {
      state,
      temperatureC: temp,
      baselineC: hardwareDetector.getProfile()?.thermal.baselineTemp ?? 0,
      cpuPercent,
      timestamp: Date.now(),
    };

    if (state !== prev) {
      log.info(`[ThermalPower] Thermal state: ${prev} -> ${state} (${temp}C, CPU ${cpuPercent}%)`);
      this.applyThermalState(state);
      this.emitThermal();

      if (this.recovering && (state === 'hot' || state === 'critical')) {
        this.stopRecovery();
      }
      if ((prev === 'hot' || prev === 'critical') && state === 'cool') {
        this.startRecovery();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Battery monitoring
  // -----------------------------------------------------------------------

  private async checkBattery(): Promise<void> {
    try {
      let si: any;
      try { si = require('systeminformation'); } catch { return; }
      const bat = await si.battery();
      if (!bat || !bat.hasBattery) return;
      this.handleBatteryChange(bat.isCharging, bat.percent);
    } catch { /* ignore */ }
  }

  private handleBatteryChange(isCharging: boolean, percent: number): void {
    const newState = hardwareDetector.updateBattery(isCharging, percent);
    const prev = this.currentPower.state;

    this.currentPower = {
      state: newState,
      batteryPercent: percent,
      isCharging,
      isDesktop: !hardwareDetector.getProfile()?.battery.hasBattery,
      timestamp: Date.now(),
    };

    if (newState !== prev) {
      log.info(`[ThermalPower] Power state: ${prev} -> ${newState} (${percent}%, charging=${isCharging})`);
      this.applyPowerState(newState);
      this.emitPower();
    }
  }

  // -----------------------------------------------------------------------
  // Thermal responses
  // -----------------------------------------------------------------------

  private applyThermalState(state: ThermalState): void {
    switch (state) {
      case 'cool':
        this.backgroundReduction = 0;
        this.gameFrameCap = 0;
        this.gameResolutionStep = 0;
        this.animationScale = 1;
        this.writeCoalesceMs = 100;
        break;

      case 'warm':
        this.backgroundReduction = 1;
        this.animationScale = 0.75;
        break;

      case 'hot':
        this.backgroundReduction = 999;
        this.gameFrameCap = 30;
        this.gameResolutionStep = 1;
        this.animationScale = 0.5;
        this.writeCoalesceMs = 500;
        break;

      case 'critical':
        this.backgroundReduction = 999;
        this.gameFrameCap = 20;
        this.gameResolutionStep = 2;
        this.animationScale = 0;
        this.writeCoalesceMs = 1000;
        this.broadcastToRenderer('dex:notification', {
          type: 'warning',
          message: 'DEX is running lighter because your computer is very warm.',
          once: true,
          key: 'thermal-critical',
        });
        break;
    }

    this.broadcastToRenderer('dex:thermal-state', {
      state,
      backgroundReduction: this.backgroundReduction,
      gameFrameCap: this.gameFrameCap,
      gameResolutionStep: this.gameResolutionStep,
      animationScale: this.animationScale,
      writeCoalesceMs: this.writeCoalesceMs,
    });
  }

  // -----------------------------------------------------------------------
  // Power responses
  // -----------------------------------------------------------------------

  private applyPowerState(state: PowerState): void {
    switch (state) {
      case 'ac':
        this.animationScale = Math.max(this.animationScale, 1);
        this.writeCoalesceMs = Math.min(this.writeCoalesceMs, 100);
        break;

      case 'battery-above-50':
        this.writeCoalesceMs = Math.max(this.writeCoalesceMs, 500);
        break;

      case 'battery-20-50':
        this.gameFrameCap = Math.max(this.gameFrameCap, 30);
        this.gameResolutionStep = Math.max(this.gameResolutionStep, 1);
        this.animationScale = Math.min(this.animationScale, 0.7);
        this.broadcastToRenderer('dex:notification', {
          type: 'info',
          message: 'Running on battery power. Some features reduced.',
          once: true,
          key: 'battery-mid',
        });
        break;

      case 'battery-below-20':
        this.gameFrameCap = Math.max(this.gameFrameCap, 20);
        this.gameResolutionStep = Math.max(this.gameResolutionStep, 2);
        this.animationScale = 0;
        this.broadcastToRenderer('dex:notification', {
          type: 'warning',
          message: 'Battery low. DEX has saved your work and reduced its power use.',
          once: true,
          key: 'battery-low',
        });
        this.broadcastToRenderer('dex:auto-save-all', {});
        break;

      case 'battery-below-5':
        this.gameFrameCap = Math.max(this.gameFrameCap, 20);
        this.gameResolutionStep = Math.max(this.gameResolutionStep, 2);
        this.animationScale = 0;
        this.broadcastToRenderer('dex:notification', {
          type: 'critical',
          message: 'Battery critically low. DEX has saved everything. Your work is safe.',
          once: true,
          key: 'battery-critical',
        });
        this.broadcastToRenderer('dex:auto-save-all', {});
        break;
    }

    this.broadcastToRenderer('dex:power-state', {
      state,
      batteryPercent: this.currentPower.batteryPercent,
      isCharging: this.currentPower.isCharging,
      animationScale: this.animationScale,
      gameFrameCap: this.gameFrameCap,
      gameResolutionStep: this.gameResolutionStep,
      writeCoalesceMs: this.writeCoalesceMs,
    });
  }

  // -----------------------------------------------------------------------
  // Gradual thermal recovery
  // -----------------------------------------------------------------------

  private startRecovery(): void {
    this.recovering = true;
    this.recoveryStep = 0;
    this.recoveryInterval = setInterval(() => {
      this.recoveryStep++;
      const progress = this.recoveryStep / THERMAL_RECOVERY_STEPS;

      this.backgroundReduction = Math.max(0, Math.round(this.backgroundReduction * (1 - progress)));
      this.animationScale = Math.min(1, this.animationScale + (1 / THERMAL_RECOVERY_STEPS));
      if (this.recoveryStep >= 3) {
        this.gameFrameCap = 0;
        this.gameResolutionStep = 0;
      }
      this.writeCoalesceMs = Math.max(100, Math.round(this.writeCoalesceMs * (1 - progress)));

      this.broadcastToRenderer('dex:thermal-recovery', {
        progress,
        step: this.recoveryStep,
        total: THERMAL_RECOVERY_STEPS,
      });

      if (this.recoveryStep >= THERMAL_RECOVERY_STEPS) {
        this.stopRecovery();
      }
    }, THERMAL_RECOVERY_STEP_MS);
  }

  private stopRecovery(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    this.recovering = false;
    this.recoveryStep = 0;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private emitThermal(): void {
    for (const handler of this.thermalHandlers) {
      try { handler(this.currentThermal); } catch (e) { log.warn('[ThermalPower] Handler error:', e); }
    }
  }

  private emitPower(): void {
    for (const handler of this.powerHandlers) {
      try { handler(this.currentPower); } catch (e) { log.warn('[ThermalPower] Handler error:', e); }
    }
  }

  private broadcastToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const thermalPowerManager = new ThermalPowerManager();
