// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Xenon -- Background Resource Optimizer
// Backend-only. Zero configuration. Learns patterns locally.
// Makes 8GB feel like 12GB by shifting resources to active apps.
// ===========================================================================

import { BrowserWindow, ipcMain, powerMonitor } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import os from 'os';
import { NativeSystem, NativeProcesses } from '../native/bridge';
import { resourceGovernor, type ThrottleLevel } from './ResourceGovernor';

// ===========================================================================
// CREATIVE APP PROFILES -- resource hints per app type
// ===========================================================================

const CREATIVE_APPS = new Set([
  'imosion', 'flux', 'prism', 'video-editor', 'vinx', 'forge', 'axl',
]);
const HEAVY_RENDER_APPS = new Set(['imosion', 'flux', 'prism', 'video-editor', 'vinx', 'axl']);

// Apps that use WebGL/Canvas heavily get higher GPU priority
const GPU_INTENSIVE_APPS = new Set(['prism', 'flux', 'video-editor', 'imosion', 'axl']);

// ===========================================================================
// TYPES
// ===========================================================================

type AppPriority = 'foreground' | 'active' | 'background' | 'idle' | 'suspended';

interface XenonAppState {
  appId: string;
  priority: AppPriority;
  lastActive: number;
  cpuWeight: number;   // 0-1 throttle coefficient
  memoryMB: number;
  windowId: number | null;
}

interface XenonSystemSample {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
}

interface XenonPatternEntry {
  appId: string;
  hourlyUsage: number[];  // 24 slots, minutes per hour
  avgSessionMs: number;
  sessionCount: number;
  coOccurrence: Record<string, number>; // appId -> count opened together
  lastUpdated: number;
}

interface XenonPatterns {
  entries: Record<string, XenonPatternEntry>;
  firstSeen: number;
  dayCount: number;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

// State transition thresholds (ms since last active)
const ACTIVE_THRESHOLD    = 5_000;     // 5s   foreground -> active
const BACKGROUND_THRESHOLD = 30_000;   // 30s  active -> background
const IDLE_THRESHOLD      = 120_000;   // 2min background -> idle
const SUSPEND_THRESHOLD   = 600_000;   // 10min idle -> suspended

// Throttle coefficients per priority
const THROTTLE_MAP: Record<AppPriority, number> = {
  foreground: 1.0,
  active:     0.8,
  background: 0.4,
  idle:       0.1,
  suspended:  0.0,
};

// FPS caps per priority
const FPS_MAP: Record<AppPriority, number> = {
  foreground: 120,
  active:     60,
  background: 30,
  idle:       10,
  suspended:  1,
};

// Memory pressure thresholds (fraction of total)
const MEMORY_MODERATE = 0.80;
const MEMORY_AGGRESSIVE = 0.90;

// Sampling
const SAMPLE_INTERVAL_MS = 30_000;  // 30s (reduced from 10s to lower IPC+CPU overhead)
const MAX_SAMPLES = 60;             // 10min rolling window

// Pattern learning
const PATTERN_ROLLING_DAYS = 30;
const PATTERN_MATURE_DAYS = 7;

// ===========================================================================
// XENON ENGINE
// ===========================================================================

class XenonEngine {
  private isRunning = false;
  private sampleTimer: NodeJS.Timeout | null = null;
  private priorityTimer: NodeJS.Timeout | null = null;

  // App tracking
  private apps: Map<string, XenonAppState> = new Map();
  private foregroundAppId: string | null = null;

  // System metrics rolling window
  private samples: XenonSystemSample[] = [];

  // Pattern learning store
  private patternStore: Store<{ patterns: XenonPatterns }>;

  // Resource governor integration
  private governorUnsubscribe: (() => void) | null = null;
  private externalPressureMultiplier = 1.0;

  // Battery state
  private onBattery = false;

  // Rust native process scan  
  private nativeScanTimer: NodeJS.Timeout | null = null;
  private systemProcessLoad = 0; // % CPU used by non-DEX processes

  // CPU sampling fallback (os.cpus delta)
  private lastCpuTimes: { idle: number; total: number } | null = null;

  constructor() {
    this.patternStore = new Store<{ patterns: XenonPatterns }>({
      name: 'xenon-patterns',
      defaults: {
        patterns: {
          entries: {},
          firstSeen: Date.now(),
          dayCount: 0,
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // LIFECYCLE
  // -----------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const totalMB = Math.round(os.totalmem() / (1024 * 1024));
    const cpuCount = os.cpus().length;
    log.info(`[Xenon] Starting -- ${totalMB}MB RAM, ${cpuCount} cores`);

    this.setupIPC();
    this.setupWindowTracking();
    this.setupPowerTracking();
    this.integrateResourceGovernor();

    // Start sampling loop
    this.sampleTimer = setInterval(() => this.sampleSystem(), SAMPLE_INTERVAL_MS);

    // Start priority evaluation loop (every 5s)
    this.priorityTimer = setInterval(() => this.evaluatePriorities(), 5_000);

    // Rust native process scan (every 30s -- lightweight via napi-rs)
    this.nativeScanTimer = setInterval(() => this.nativeProcessScan(), 30_000);

    // Initial sample
    this.sampleSystem();
    this.nativeProcessScan();

    log.info('[Xenon] Running');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.sampleTimer) { clearInterval(this.sampleTimer); this.sampleTimer = null; }
    if (this.priorityTimer) { clearInterval(this.priorityTimer); this.priorityTimer = null; }
    if (this.nativeScanTimer) { clearInterval(this.nativeScanTimer); this.nativeScanTimer = null; }
    if (this.governorUnsubscribe) { this.governorUnsubscribe(); this.governorUnsubscribe = null; }

    // Remove IPC handlers so start() can re-register them
    try {
      ipcMain.removeHandler('xenon:getStatus');
      ipcMain.removeHandler('xenon:getPatterns');
      ipcMain.removeHandler('xenon:reportActiveApp');
    } catch { /* handlers may not have been registered */ }

    this.persistPatterns();
    log.info('[Xenon] Stopped');
  }

  // -----------------------------------------------------------------------
  // IPC HANDLERS
  // -----------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('xenon:getStatus', () => this.getStatus());
    ipcMain.handle('xenon:getPatterns', () => this.getPatterns());
    ipcMain.handle('xenon:reportActiveApp', (_event, appId: string) => {
      if (typeof appId === 'string' && appId.length > 0 && appId.length < 128) {
        this.reportActiveApp(appId);
      }
    });
  }

  // -----------------------------------------------------------------------
  // WINDOW / FOCUS TRACKING
  // -----------------------------------------------------------------------

  private setupWindowTracking(): void {
    // Track focus changes on all existing and future windows
    const trackWindow = (win: BrowserWindow) => {
      const onFocus = () => { this.onWindowFocus(win.id); };
      const onBlur = () => { this.onWindowBlur(win.id); };
      win.on('focus', onFocus);
      win.on('blur', onBlur);
      win.once('closed', () => {
        // Clean up app states referencing this window
        for (const [, state] of this.apps) {
          if (state.windowId === win.id) {
            state.windowId = null;
          }
        }
      });
    };

    for (const win of BrowserWindow.getAllWindows()) {
      trackWindow(win);
    }

    // Handle new windows
    // Use app event instead for new windows
    require('electron').app.on('browser-window-created', (_event: any, win: BrowserWindow) => {
      trackWindow(win);
    });
  }

  private onWindowFocus(windowId: number): void {
    // Promote all apps associated with this window to at least 'active'
    for (const [, state] of this.apps) {
      if (state.windowId === windowId) {
        state.lastActive = Date.now();
      }
    }
  }

  private onWindowBlur(windowId: number): void {
    // Natural demotion will happen via evaluatePriorities timer
    // No immediate action needed -- avoids flicker on brief unfocus
  }

  // -----------------------------------------------------------------------
  // POWER TRACKING
  // -----------------------------------------------------------------------

  private setupPowerTracking(): void {
    this.onBattery = powerMonitor.isOnBatteryPower?.() ?? false;

    powerMonitor.on('on-ac', () => {
      this.onBattery = false;
      this.externalPressureMultiplier = 1.0;
      log.info('[Xenon] On AC power -- normal thresholds');
      this.broadcastPowerState();
    });

    powerMonitor.on('on-battery', () => {
      this.onBattery = true;
      this.externalPressureMultiplier = Math.max(this.externalPressureMultiplier, 2.0);
      log.info('[Xenon] On battery -- aggressive conservation');
      this.broadcastPowerState();
    });
  }

  private broadcastPowerState(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('xenon:power', { onBattery: this.onBattery });
      }
    }
  }

  // -----------------------------------------------------------------------
  // RESOURCE GOVERNOR INTEGRATION
  // -----------------------------------------------------------------------

  private integrateResourceGovernor(): void {
    try {
      this.governorUnsubscribe = resourceGovernor.onThrottleChange((level: ThrottleLevel) => {
        switch (level) {
          case 'none':      this.externalPressureMultiplier = 1.0; break;
          case 'light':     this.externalPressureMultiplier = 1.2; break;
          case 'moderate':  this.externalPressureMultiplier = 1.5; break;
          case 'aggressive': this.externalPressureMultiplier = 2.0; break;
          case 'emergency': this.externalPressureMultiplier = 3.0; break;
        }
        log.info(`[Xenon] ResourceGovernor throttle: ${level} (multiplier: ${this.externalPressureMultiplier})`);
        this.evaluatePriorities(); // Re-evaluate immediately
      });
    } catch (err) {
      log.warn('[Xenon] Could not subscribe to ResourceGovernor:', err);
    }
  }

  // -----------------------------------------------------------------------
  // RUST NATIVE PROCESS SCAN
  // -----------------------------------------------------------------------

  private nativeProcessScan(): void {
    try {
      const processes = NativeProcesses.list(50);
      if (processes.length === 0) return;

      // Calculate how much CPU non-DEX (system/background) processes consume
      let systemCpu = 0;
      for (const proc of processes) {
        if (proc.category === 'system' || proc.category === 'background') {
          systemCpu += proc.cpuPercent;
        }
      }
      this.systemProcessLoad = Math.min(100, systemCpu);

      // If external processes are eating >50% CPU, tighten throttling on idle DEX apps
      if (this.systemProcessLoad > 50) {
        const extraPressure = 1 + (this.systemProcessLoad - 50) / 50; // 1.0-2.0
        this.externalPressureMultiplier = Math.max(this.externalPressureMultiplier, extraPressure);
        this.evaluatePriorities();
      }

      // Try to free memory via Rust if under heavy pressure
      const latestSample = this.samples[this.samples.length - 1];
      if (latestSample && latestSample.memoryPercent > 90) {
        NativeProcesses.freeMemory();
        log.info('[Xenon] Rust freeMemory() called -- memory pressure >90%');
      }
    } catch (err) {
      // Native bridge may not be available -- no-op
    }
  }

  // -----------------------------------------------------------------------
  // SYSTEM SAMPLING
  // -----------------------------------------------------------------------

  private sampleSystem(): void {
    const sample: XenonSystemSample = {
      timestamp: Date.now(),
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsedMB: 0,
      memoryTotalMB: 0,
    };

    // Try native bridge first (Rust -- fast, accurate)
    const nativeStats = NativeSystem.getStats();
    if (nativeStats) {
      sample.cpuPercent = nativeStats.cpuPercent;
      sample.memoryPercent = nativeStats.memoryPercent;
      sample.memoryUsedMB = Math.round(nativeStats.memoryUsed / (1024 * 1024));
      sample.memoryTotalMB = Math.round(nativeStats.memoryTotal / (1024 * 1024));
    } else {
      // Fallback to Node os module
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      sample.memoryTotalMB = Math.round(totalMem / (1024 * 1024));
      sample.memoryUsedMB = Math.round(usedMem / (1024 * 1024));
      sample.memoryPercent = (usedMem / totalMem) * 100;

      // CPU fallback via os.cpus() delta
      const cpus = os.cpus();
      let idle = 0, total = 0;
      for (const cpu of cpus) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      }
      if (this.lastCpuTimes) {
        const idleDelta = idle - this.lastCpuTimes.idle;
        const totalDelta = total - this.lastCpuTimes.total;
        sample.cpuPercent = totalDelta > 0 ? ((1 - idleDelta / totalDelta) * 100) : 0;
      }
      this.lastCpuTimes = { idle, total };
    }

    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    // Check memory pressure
    const memFraction = sample.memoryPercent / 100;
    if (memFraction >= MEMORY_AGGRESSIVE) {
      this.relieveMemoryPressure('aggressive');
    } else if (memFraction >= MEMORY_MODERATE) {
      this.relieveMemoryPressure('moderate');
    }

    // Push sample to renderer (eliminates renderer polling)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('xenon:systemSample', sample);
      }
    }
  }

  // -----------------------------------------------------------------------
  // PRIORITY ENGINE (core algorithm)
  // -----------------------------------------------------------------------

  reportActiveApp(appId: string): void {
    const now = Date.now();
    let state = this.apps.get(appId);

    if (!state) {
      state = {
        appId,
        priority: 'foreground',
        lastActive: now,
        cpuWeight: 1.0,
        memoryMB: 0,
        windowId: this.getActiveWindowId(),
      };
      this.apps.set(appId, state);
    } else {
      state.lastActive = now;
      state.windowId = this.getActiveWindowId();
    }

    // If switching from a different foreground app, record co-occurrence
    if (this.foregroundAppId && this.foregroundAppId !== appId) {
      this.recordCoOccurrence(this.foregroundAppId, appId);
    }

    this.foregroundAppId = appId;
    this.recordPatternUsage(appId);

    // Immediately re-evaluate priorities
    this.evaluatePriorities();
  }

  private evaluatePriorities(): void {
    const now = Date.now();

    for (const [appId, state] of this.apps) {
      const elapsed = now - state.lastActive;
      let newPriority: AppPriority;

      if (appId === this.foregroundAppId && elapsed < ACTIVE_THRESHOLD) {
        newPriority = 'foreground';
      } else if (elapsed < ACTIVE_THRESHOLD) {
        newPriority = 'active';
      } else if (elapsed < BACKGROUND_THRESHOLD) {
        newPriority = 'background';
      } else if (elapsed < IDLE_THRESHOLD) {
        newPriority = 'idle';
      } else {
        // Before suspending, check if pattern prediction says this app is likely needed soon
        const predicted = this.predictedApps();
        newPriority = predicted.has(appId) ? 'idle' : 'suspended';
      }

      const oldPriority = state.priority;
      state.priority = newPriority;

      // Apply throttle coefficient, scaled by external pressure
      let coefficient = THROTTLE_MAP[newPriority];
      if (this.externalPressureMultiplier > 1.0 && newPriority !== 'foreground') {
        coefficient = Math.max(0, coefficient / this.externalPressureMultiplier);
      }
      state.cpuWeight = coefficient;

      // Apply Electron-level throttling if priority changed
      if (oldPriority !== newPriority) {
        this.applyThrottle(state);
        if (oldPriority === 'foreground' || newPriority === 'foreground') {
          log.info(`[Xenon] ${appId}: ${oldPriority} -> ${newPriority} (weight: ${coefficient.toFixed(2)})`);
        }
      }
    }

    // Pre-warm predicted apps that aren't tracked yet
    if (this.isPatternMature()) {
      const predicted = this.predictedApps();
      for (const appId of predicted) {
        if (!this.apps.has(appId)) {
          // Send hint to renderer that this app may be opened soon
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send('xenon:preWarm', { appId });
            }
          }
        }
      }
    }
  }

  // Predict which apps are likely to be opened based on time-of-day and co-occurrence
  private predictedApps(): Set<string> {
    const predicted = new Set<string>();
    if (!this.isPatternMature()) return predicted;

    const patterns = this.patternStore.get('patterns');
    const hour = new Date().getHours();

    // Find apps frequently used at this hour
    for (const [appId, entry] of Object.entries(patterns.entries)) {
      const hourlyAvg = entry.hourlyUsage[hour] / Math.max(1, patterns.dayCount);
      if (hourlyAvg > 0.3) { // used >30% of days at this hour
        predicted.add(appId);
      }
    }

    // Add co-occurring apps for the current foreground app
    if (this.foregroundAppId) {
      const fgEntry = patterns.entries[this.foregroundAppId];
      if (fgEntry) {
        const sorted = Object.entries(fgEntry.coOccurrence)
          .sort((a, b) => b[1] - a[1]);
        // Top 2 co-occurring apps
        for (const [appId] of sorted.slice(0, 2)) {
          if (fgEntry.coOccurrence[appId] >= 3) { // at least 3 co-occurrences
            predicted.add(appId);
          }
        }
      }
    }

    return predicted;
  }

  private applyThrottle(state: XenonAppState): void {
    if (state.windowId == null) return;

    try {
      const win = BrowserWindow.fromId(state.windowId);
      if (!win || win.isDestroyed()) return;
      const wc = win.webContents;

      const isCreative = CREATIVE_APPS.has(state.appId);
      const isGPUHeavy = GPU_INTENSIVE_APPS.has(state.appId);

      // Background throttling via Electron API
      // Creative apps in background get lighter throttling to preserve render state
      const shouldThrottle = state.priority !== 'foreground' && state.priority !== 'active'
        && !(isCreative && state.priority === 'background');
      wc.setBackgroundThrottling(shouldThrottle);

      // FPS cap -- creative/GPU-heavy apps get higher FPS even when backgrounded
      let fps = FPS_MAP[state.priority];
      if (isGPUHeavy && state.priority === 'foreground') {
        fps = 120; // Max framerate for active creative rendering
      } else if (isCreative && state.priority === 'background') {
        fps = Math.max(fps, 30); // Keep canvas alive
      } else if (isCreative && state.priority === 'active') {
        fps = Math.max(fps, 60); // Smooth for recently-used creative apps
      }
      wc.setFrameRate(fps);

      // Send throttle info to renderer so it can reduce requestAnimationFrame, pause audio, etc.
      if (!wc.isDestroyed()) {
        wc.send('xenon:throttle', {
          appId: state.appId,
          priority: state.priority,
          cpuWeight: state.cpuWeight,
          fps,
          isCreative,
          isGPUHeavy,
        });
      }
    } catch (err) {
      // Window may have been closed
    }
  }

  // -----------------------------------------------------------------------
  // MEMORY PRESSURE RELIEF
  // -----------------------------------------------------------------------

  private relieveMemoryPressure(severity: 'moderate' | 'aggressive'): void {
    log.info(`[Xenon] Memory pressure: ${severity}`);

    // Notify all renderers
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('xenon:memoryPressure', severity);
      }
    }

    if (severity === 'aggressive') {
      // Force-suspend all idle/background apps
      for (const [, state] of this.apps) {
        if (state.priority === 'idle' || state.priority === 'background') {
          state.priority = 'suspended';
          state.cpuWeight = 0;
          this.applyThrottle(state);
        }
      }

      // Trigger V8 GC on idle renderers
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          const appState = this.findAppByWindow(win.id);
          if (!appState || appState.priority !== 'foreground') {
            try {
              win.webContents.send('xenon:forceGC');
            } catch (_) { /* ignore */ }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // PATTERN LEARNING (local-only, never transmitted)
  // -----------------------------------------------------------------------

  private recordPatternUsage(appId: string): void {
    const patterns = this.patternStore.get('patterns');
    const hour = new Date().getHours();

    let entry = patterns.entries[appId];
    if (!entry) {
      entry = {
        appId,
        hourlyUsage: new Array(24).fill(0),
        avgSessionMs: 0,
        sessionCount: 0,
        coOccurrence: {},
        lastUpdated: Date.now(),
      };
      patterns.entries[appId] = entry;
    }

    entry.hourlyUsage[hour] = (entry.hourlyUsage[hour] || 0) + 1;
    entry.sessionCount++;
    entry.lastUpdated = Date.now();

    // Evict entries older than rolling window
    const cutoff = Date.now() - (PATTERN_ROLLING_DAYS * 24 * 60 * 60 * 1000);
    for (const [id, e] of Object.entries(patterns.entries)) {
      if (e.lastUpdated < cutoff) {
        delete patterns.entries[id];
      }
    }

    patterns.dayCount = Math.floor((Date.now() - patterns.firstSeen) / (24 * 60 * 60 * 1000));
    this.patternStore.set('patterns', patterns);
  }

  private recordCoOccurrence(fromApp: string, toApp: string): void {
    const patterns = this.patternStore.get('patterns');
    const entry = patterns.entries[fromApp];
    if (entry) {
      entry.coOccurrence[toApp] = (entry.coOccurrence[toApp] || 0) + 1;
      this.patternStore.set('patterns', patterns);
    }
  }

  private persistPatterns(): void {
    // Already persisted on each write via electron-store -- no-op
  }

  // -----------------------------------------------------------------------
  // STATUS / QUERIES
  // -----------------------------------------------------------------------

  getStatus(): object {
    const appStates: Record<string, { priority: AppPriority; cpuWeight: number; lastActive: number }> = {};
    for (const [appId, state] of this.apps) {
      appStates[appId] = {
        priority: state.priority,
        cpuWeight: state.cpuWeight,
        lastActive: state.lastActive,
      };
    }

    const latestSample = this.samples[this.samples.length - 1] || null;

    return {
      running: this.isRunning,
      foregroundApp: this.foregroundAppId,
      appCount: this.apps.size,
      apps: appStates,
      memoryPercent: latestSample?.memoryPercent ?? 0,
      cpuPercent: latestSample?.cpuPercent ?? 0,
      sampleCount: this.samples.length,
      onBattery: this.onBattery,
      pressureMultiplier: this.externalPressureMultiplier,
      systemProcessLoad: this.systemProcessLoad,
      nativeBridgeActive: (() => { try { return NativeSystem.getStats() !== null; } catch { return false; } })(),
      patternMature: this.isPatternMature(),
      predictedApps: Array.from(this.predictedApps()),
    };
  }

  getPatterns(): object {
    return this.patternStore.get('patterns');
  }

  private isPatternMature(): boolean {
    const patterns = this.patternStore.get('patterns');
    return patterns.dayCount >= PATTERN_MATURE_DAYS;
  }

  // -----------------------------------------------------------------------
  // HELPERS
  // -----------------------------------------------------------------------

  private getActiveWindowId(): number | null {
    const focused = BrowserWindow.getFocusedWindow();
    return focused ? focused.id : null;
  }

  private findAppByWindow(windowId: number): XenonAppState | null {
    for (const [, state] of this.apps) {
      if (state.windowId === windowId) return state;
    }
    return null;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const xenon = new XenonEngine();

export function initializeXenon(): void {
  xenon.start();
}

export function shutdownXenon(): void {
  xenon.stop();
}
