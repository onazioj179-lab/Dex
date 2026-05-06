// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Resource Governor
// ADAPTIVE PERFORMANCE MODE (Hardware Tier Detection)
// ===========================================================================
// Detects hardware at boot and picks low/mid/high tier automatically.
// Low-end (≤4 cores or ≤4GB): Conservative — 1GB RAM, 70% CPU, 30fps
// Mid (≤8 cores, ≤8GB):       Balanced    — 2GB RAM, 90% CPU, 60fps
// High (>8 cores or >8GB):    Full power  — 4GB RAM, 100% CPU, 120fps
// ===========================================================================

import log from 'electron-log';
import os from 'os';
import { app, BrowserWindow, ipcMain } from 'electron';

// ===========================================================================
// HARDWARE TIER DETECTION — Adapts DEX to the machine it runs on
// ===========================================================================

export type HardwareTier = 'low' | 'mid' | 'high';

export interface HardwareProfile {
  tier: HardwareTier;
  cpuCores: number;
  totalRAMMB: number;
  cpuModel: string;
}

function detectHardwareTier(): HardwareProfile {
  const cpuCores = os.cpus().length;
  const totalRAMMB = Math.round(os.totalmem() / 1024 / 1024);
  const cpuModel = os.cpus()[0]?.model ?? 'Unknown';

  // Low-end: <=4 cores OR <=4GB RAM (Chromebooks, budget laptops, old hardware)
  // Mid:     <=8 cores AND <=8GB RAM
  // High:    >8 cores OR >8GB RAM
  let tier: HardwareTier;
  if (cpuCores <= 4 || totalRAMMB <= 4096) {
    tier = 'low';
  } else if (cpuCores <= 8 && totalRAMMB <= 8192) {
    tier = 'mid';
  } else {
    tier = 'high';
  }

  return { tier, cpuCores, totalRAMMB, cpuModel };
}

// Detect once at import time (before any subsystem starts)
export const hardwareProfile = detectHardwareTier();

// ===========================================================================
// TIER-AWARE LIMITS
// ===========================================================================

function limitsForTier(tier: HardwareTier) {
  switch (tier) {
    case 'low':
      return {
        MAX_TOTAL_MEMORY_MB: 1024,
        MAX_HEAP_MEMORY_MB: 512,
        MAX_RENDERER_MEMORY_MB: 384,
        BUDGET_UI: 192, BUDGET_WORKFLOWS: 96, BUDGET_STORAGE: 96,
        BUDGET_INDEXING: 48, BUDGET_CACHE: 64, BUDGET_PYTHON: 128, BUDGET_RESERVE: 64,
        MAX_IDLE_CPU_PERCENT: 30,
        MAX_ACTIVE_CPU_PERCENT: 70,
        GPU_IDLE_TARGET: 0, GPU_MINIMAL_THRESHOLD: 30, GPU_BURST_ALLOWED: false,
        TARGET_FRAME_TIME_MS: 16.67, MAX_FRAME_TIME_MS: 33.33, MAX_PAINT_TIME_MS: 8,
        MAX_EVENT_LOOP_LAG_MS: 32,
        MAX_OPERATION_DURATION_MS: 8000,
        MAX_BACKGROUND_TASK_MS: 2000,
        MAX_TASK_QUEUE_SIZE: 20,
        MAX_PENDING_OPERATIONS: 4,
        MEMORY_CHECK_INTERVAL_MS: 60000,
        IDLE_DETECTION_MS: 3000,
        GC_FORCE_INTERVAL_MS: 300000,
      } as const;
    case 'mid':
      return {
        MAX_TOTAL_MEMORY_MB: 2048,
        MAX_HEAP_MEMORY_MB: 1024,
        MAX_RENDERER_MEMORY_MB: 512,
        BUDGET_UI: 256, BUDGET_WORKFLOWS: 128, BUDGET_STORAGE: 128,
        BUDGET_INDEXING: 64, BUDGET_CACHE: 128, BUDGET_PYTHON: 256, BUDGET_RESERVE: 96,
        MAX_IDLE_CPU_PERCENT: 60,
        MAX_ACTIVE_CPU_PERCENT: 90,
        GPU_IDLE_TARGET: 5, GPU_MINIMAL_THRESHOLD: 60, GPU_BURST_ALLOWED: true,
        TARGET_FRAME_TIME_MS: 16.67, MAX_FRAME_TIME_MS: 16.67, MAX_PAINT_TIME_MS: 6,
        MAX_EVENT_LOOP_LAG_MS: 16,
        MAX_OPERATION_DURATION_MS: 5000,
        MAX_BACKGROUND_TASK_MS: 1000,
        MAX_TASK_QUEUE_SIZE: 35,
        MAX_PENDING_OPERATIONS: 6,
        MEMORY_CHECK_INTERVAL_MS: 120000,
        IDLE_DETECTION_MS: 5000,
        GC_FORCE_INTERVAL_MS: 600000,
      } as const;
    case 'high':
    default:
      return {
        MAX_TOTAL_MEMORY_MB: 4096,
        MAX_HEAP_MEMORY_MB: 2048,
        MAX_RENDERER_MEMORY_MB: 1024,
        BUDGET_UI: 512, BUDGET_WORKFLOWS: 256, BUDGET_STORAGE: 256,
        BUDGET_INDEXING: 128, BUDGET_CACHE: 256, BUDGET_PYTHON: 512, BUDGET_RESERVE: 128,
        MAX_IDLE_CPU_PERCENT: 90,
        MAX_ACTIVE_CPU_PERCENT: 100,
        GPU_IDLE_TARGET: 10, GPU_MINIMAL_THRESHOLD: 80, GPU_BURST_ALLOWED: true,
        TARGET_FRAME_TIME_MS: 8.33, MAX_FRAME_TIME_MS: 16.67, MAX_PAINT_TIME_MS: 4,
        MAX_EVENT_LOOP_LAG_MS: 16,
        MAX_OPERATION_DURATION_MS: 5000,
        MAX_BACKGROUND_TASK_MS: 1000,
        MAX_TASK_QUEUE_SIZE: 50,
        MAX_PENDING_OPERATIONS: 10,
        MEMORY_CHECK_INTERVAL_MS: 180000,
        IDLE_DETECTION_MS: 5000,
        GC_FORCE_INTERVAL_MS: 600000,
      } as const;
  }
}

// ===========================================================================
// MAXIMUM LIMITS - Full Performance
// ===========================================================================

export const HARD_LIMITS = limitsForTier(hardwareProfile.tier);

// ===========================================================================
// TYPES
// ===========================================================================

export type ResourcePressure = 'nominal' | 'elevated' | 'high' | 'critical';
export type ThrottleLevel = 'none' | 'light' | 'moderate' | 'aggressive' | 'emergency';
export type GPUActivityLevel = 'sleeping' | 'minimal' | 'active' | 'burst';

export interface ResourceSnapshot {
  timestamp: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  cpu: {
    user: number;
    system: number;
    percentEstimate: number;
  };
  gpu: {
    activityLevel: GPUActivityLevel;
    isRendering: boolean;
    lastRenderTime: number;
  };
  pressure: ResourcePressure;
  throttleLevel: ThrottleLevel;
  isIdle: boolean;
}

export interface SubsystemBudget {
  name: string;
  budgetMB: number;
  currentMB: number;
  violations: number;
}

interface ThrottleConfig {
  deferBackgroundTasks: boolean;
  reduceCacheSize: boolean;
  pauseIndexing: boolean;
  forceGC: boolean;
  limitConcurrency: number;
}

// ===========================================================================
// RESOURCE GOVERNOR - Enforces hard limits
// ===========================================================================

class ResourceGovernorClass {
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastSnapshot: ResourceSnapshot | null = null;
  private lastUserActivity = Date.now();
  private lastCpuUsage = process.cpuUsage();
  private lastCpuCheck = Date.now();
  private consecutiveHighPressure = 0;
  private subsystems: Map<string, SubsystemBudget> = new Map();
  private throttleCallbacks: Set<(level: ThrottleLevel) => void> = new Set();

  // Current state
  private currentPressure: ResourcePressure = 'nominal';
  private currentThrottle: ThrottleLevel = 'none';
  
  // GPU tracking
  private gpuActivity: GPUActivityLevel = 'sleeping';
  private isRendering = false;
  private lastRenderTime = 0;
  private renderCallbacks: Set<(isRendering: boolean) => void> = new Set();

  constructor() {
    this.initializeSubsystemBudgets();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private initializeSubsystemBudgets(): void {
    this.subsystems.set('ui', { name: 'UI', budgetMB: HARD_LIMITS.BUDGET_UI, currentMB: 0, violations: 0 });
    this.subsystems.set('workflows', { name: 'Workflows', budgetMB: HARD_LIMITS.BUDGET_WORKFLOWS, currentMB: 0, violations: 0 });
    this.subsystems.set('storage', { name: 'Storage', budgetMB: HARD_LIMITS.BUDGET_STORAGE, currentMB: 0, violations: 0 });
    this.subsystems.set('indexing', { name: 'Indexing', budgetMB: HARD_LIMITS.BUDGET_INDEXING, currentMB: 0, violations: 0 });
    this.subsystems.set('cache', { name: 'Cache', budgetMB: HARD_LIMITS.BUDGET_CACHE, currentMB: 0, violations: 0 });
    this.subsystems.set('python', { name: 'Python', budgetMB: HARD_LIMITS.BUDGET_PYTHON, currentMB: 0, violations: 0 });
  }

  // -------------------------------------------------------------------------
  // START / STOP
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    log.info(` [ResourceGovernor] Starting - Hardware tier: ${hardwareProfile.tier.toUpperCase()} (${hardwareProfile.cpuCores} cores, ${hardwareProfile.totalRAMMB}MB RAM, ${hardwareProfile.cpuModel})`);
    log.info(` [ResourceGovernor] Limits: ${HARD_LIMITS.MAX_TOTAL_MEMORY_MB}MB RAM, ${HARD_LIMITS.MAX_ACTIVE_CPU_PERCENT}% CPU, ${HARD_LIMITS.GPU_MINIMAL_THRESHOLD}% GPU`);

    // Single monitoring interval - minimal polling
    this.monitorInterval = setInterval(() => {
      this.checkResources();
    }, HARD_LIMITS.MEMORY_CHECK_INTERVAL_MS);

    // Initial check
    this.checkResources();
    
    // Setup IPC handlers for GPU tracking
    this.setupIPCHandlers();

    // Setup low-memory handler
    app.on('render-process-gone', (_event, _webContents, details) => {
      if (details.reason === 'oom') {
        log.error('[CRITICAL] [ResourceGovernor] Renderer OOM - forcing emergency cleanup');
        this.emergencyCleanup();
      }
    });
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    log.info(' [ResourceGovernor] Stopped');
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS (GPU & Render Tracking)
  // -------------------------------------------------------------------------

  private setupIPCHandlers(): void {
    // Renderer reports render activity
    ipcMain.on('gpu:renderStart', () => {
      this.setRenderState(true);
    });
    
    ipcMain.on('gpu:renderEnd', () => {
      this.setRenderState(false);
    });
    
    // Renderer reports GPU activity level
    ipcMain.on('gpu:activityLevel', (_event, level: GPUActivityLevel) => {
      this.gpuActivity = level;
    });
    
    // Get GPU state
    ipcMain.handle('gpu:getState', () => ({
      activityLevel: this.gpuActivity,
      isRendering: this.isRendering,
      lastRenderTime: this.lastRenderTime,
      shouldRender: this.shouldRender(),
    }));
    
    // Check if rendering is allowed
    ipcMain.handle('gpu:shouldRender', () => this.shouldRender());

    // Hardware tier query — renderer can adapt UI accordingly
    ipcMain.handle('resource-governor:getHardwareProfile', () => hardwareProfile);
    ipcMain.handle('resource-governor:getThrottleLevel', () => this.currentThrottle);
  }

  private setRenderState(rendering: boolean): void {
    const wasRendering = this.isRendering;
    this.isRendering = rendering;
    
    if (rendering) {
      this.lastRenderTime = Date.now();
      this.gpuActivity = 'active';
    } else if (!rendering && wasRendering) {
      // GPU goes to minimal after rendering, then sleeping after idle
      this.gpuActivity = 'minimal';
      setTimeout(() => {
        if (!this.isRendering && (Date.now() - this.lastRenderTime) > HARD_LIMITS.IDLE_DETECTION_MS) {
          this.gpuActivity = 'sleeping';
        }
      }, HARD_LIMITS.IDLE_DETECTION_MS);
    }
    
    // Notify listeners
    this.renderCallbacks.forEach(cb => cb(rendering));
  }

  // -------------------------------------------------------------------------
  // RESOURCE CHECKING
  // -------------------------------------------------------------------------

  private checkResources(): void {
    const snapshot = this.takeSnapshot();
    this.lastSnapshot = snapshot;

    // Determine pressure level
    const pressure = this.calculatePressure(snapshot);
    const pressureChanged = pressure !== this.currentPressure;
    this.currentPressure = pressure;

    // Track consecutive high pressure
    if (pressure === 'high' || pressure === 'critical') {
      this.consecutiveHighPressure++;
    } else {
      this.consecutiveHighPressure = 0;
    }

    // Determine throttle level
    const throttle = this.calculateThrottleLevel(pressure, snapshot);
    const throttleChanged = throttle !== this.currentThrottle;
    this.currentThrottle = throttle;

    // Log changes
    if (pressureChanged) {
      const emoji = pressure === 'critical' ? '[CRITICAL]' : pressure === 'high' ? '[HIGH]' : pressure === 'elevated' ? '[ELEVATED]' : '[LOW]';
      log.info(`${emoji} [ResourceGovernor] Pressure: ${pressure} | Memory: ${snapshot.memory.rssMB}MB | CPU: ${snapshot.cpu.percentEstimate.toFixed(1)}%`);
    }

    // Notify throttle changes
    if (throttleChanged) {
      log.info(` [ResourceGovernor] Throttle level: ${throttle}`);
      this.notifyThrottleChange(throttle);
    }

    // Take action based on pressure
    this.enforceResourceLimits(pressure, snapshot);
  }

  private takeSnapshot(): ResourceSnapshot {
    const mem = process.memoryUsage();
    const cpu = this.getCpuPercent();
    const isIdle = (Date.now() - this.lastUserActivity) > HARD_LIMITS.IDLE_DETECTION_MS;

    return {
      timestamp: Date.now(),
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
        percentEstimate: cpu.percent,
      },
      gpu: {
        activityLevel: this.gpuActivity,
        isRendering: this.isRendering,
        lastRenderTime: this.lastRenderTime,
      },
      pressure: this.currentPressure,
      throttleLevel: this.currentThrottle,
      isIdle,
    };
  }

  private getCpuPercent(): { user: number; system: number; percent: number } {
    const now = Date.now();
    const elapsed = now - this.lastCpuCheck;
    const cpu = process.cpuUsage(this.lastCpuUsage);
    
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = now;

    // Calculate percentage (microseconds to percent)
    const totalMicros = cpu.user + cpu.system;
    const elapsedMicros = elapsed * 1000;
    const percent = (totalMicros / elapsedMicros) * 100;

    return {
      user: cpu.user,
      system: cpu.system,
      percent: Math.min(100, Math.max(0, percent)),
    };
  }

  private calculatePressure(snapshot: ResourceSnapshot): ResourcePressure {
    const memPercent = (snapshot.memory.rssMB / HARD_LIMITS.MAX_TOTAL_MEMORY_MB) * 100;
    const heapPercent = (snapshot.memory.heapUsedMB / HARD_LIMITS.MAX_HEAP_MEMORY_MB) * 100;
    const cpuLimit = snapshot.isIdle ? HARD_LIMITS.MAX_IDLE_CPU_PERCENT : HARD_LIMITS.MAX_ACTIVE_CPU_PERCENT;
    const cpuPercent = (snapshot.cpu.percentEstimate / cpuLimit) * 100;

    // Critical: Only when truly at the edge (98%+ of hard limits)
    if (memPercent >= 98 || heapPercent >= 98 || cpuPercent >= 300) {
      return 'critical';
    }

    // High: Very close to limits (95%)
    if (memPercent >= 95 || heapPercent >= 95 || cpuPercent >= 250) {
      return 'high';
    }

    // Elevated: Above 85%
    if (memPercent >= 85 || heapPercent >= 85 || cpuPercent >= 200) {
      return 'elevated';
    }

    return 'nominal';
  }

  private calculateThrottleLevel(pressure: ResourcePressure, snapshot: ResourceSnapshot): ThrottleLevel {
    // Emergency: Critical pressure for too long
    if (pressure === 'critical' && this.consecutiveHighPressure >= 3) {
      return 'emergency';
    }

    // Aggressive: Critical or persistent high pressure
    if (pressure === 'critical' || (pressure === 'high' && this.consecutiveHighPressure >= 2)) {
      return 'aggressive';
    }

    // Moderate: High pressure
    if (pressure === 'high') {
      return 'moderate';
    }

    // Light: Elevated pressure
    if (pressure === 'elevated') {
      return 'light';
    }

    return 'none';
  }

  // -------------------------------------------------------------------------
  // ENFORCEMENT
  // -------------------------------------------------------------------------

  private enforceResourceLimits(pressure: ResourcePressure, snapshot: ResourceSnapshot): void {
    const config = this.getThrottleConfig(this.currentThrottle);

    // Force GC if needed
    if (config.forceGC && global.gc) {
      log.info(' [ResourceGovernor] Forcing garbage collection');
      global.gc();
    }

    // Critical pressure actions
    if (pressure === 'critical') {
      this.criticalPressureResponse(snapshot);
    }

    // High pressure actions
    if (pressure === 'high' || pressure === 'critical') {
      this.highPressureResponse(snapshot);
    }
  }

  private getThrottleConfig(level: ThrottleLevel): ThrottleConfig {
    switch (level) {
      case 'emergency':
        return { deferBackgroundTasks: true, reduceCacheSize: true, pauseIndexing: true, forceGC: true, limitConcurrency: 1 };
      case 'aggressive':
        return { deferBackgroundTasks: true, reduceCacheSize: true, pauseIndexing: true, forceGC: true, limitConcurrency: 1 };
      case 'moderate':
        return { deferBackgroundTasks: true, reduceCacheSize: true, pauseIndexing: true, forceGC: false, limitConcurrency: 2 };
      case 'light':
        return { deferBackgroundTasks: true, reduceCacheSize: false, pauseIndexing: false, forceGC: false, limitConcurrency: 3 };
      default:
        return { deferBackgroundTasks: false, reduceCacheSize: false, pauseIndexing: false, forceGC: false, limitConcurrency: 4 };
    }
  }

  private criticalPressureResponse(snapshot: ResourceSnapshot): void {
    log.warn('[CRITICAL] [ResourceGovernor] CRITICAL PRESSURE - Taking emergency action');

    // Clear all non-essential caches
    this.clearNonEssentialCaches();

    // Request renderer to reduce memory
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('resource-governor:reduce-memory');
      }
    });
  }

  private highPressureResponse(snapshot: ResourceSnapshot): void {
    log.warn('[HIGH] [ResourceGovernor] High pressure - Reducing resource usage');

    // Prune caches
    this.pruneCaches();
  }

  private emergencyCleanup(): void {
    log.error('[EMERGENCY] [ResourceGovernor] EMERGENCY CLEANUP');

    // Force GC multiple times
    if (global.gc) {
      global.gc();
      setTimeout(() => global.gc?.(), 100);
      setTimeout(() => global.gc?.(), 500);
    }

    // Clear all caches
    this.clearAllCaches();

    // Notify all subsystems
    this.notifyThrottleChange('emergency');
  }

  // -------------------------------------------------------------------------
  // CACHE MANAGEMENT
  // -------------------------------------------------------------------------

  private clearNonEssentialCaches(): void {
    // This will be connected to MemoryManager
    try {
      const { memoryManager } = require('./MemoryManager');
      memoryManager.pruneAll();
    } catch (e) {
      log.debug('[ResourceGovernor] Could not prune caches:', e);
    }
  }

  private pruneCaches(): void {
    try {
      const { memoryManager } = require('./MemoryManager');
      memoryManager.pruneOld();
    } catch (e) {
      log.debug('[ResourceGovernor] Could not prune old caches:', e);
    }
  }

  private clearAllCaches(): void {
    try {
      const { memoryManager } = require('./MemoryManager');
      memoryManager.clearAll();
    } catch (e) {
      log.debug('[ResourceGovernor] Could not clear caches:', e);
    }
  }

  // -------------------------------------------------------------------------
  // USER ACTIVITY TRACKING
  // -------------------------------------------------------------------------

  recordUserActivity(): void {
    this.lastUserActivity = Date.now();
  }

  isIdle(): boolean {
    return (Date.now() - this.lastUserActivity) > HARD_LIMITS.IDLE_DETECTION_MS;
  }

  // -------------------------------------------------------------------------
  // THROTTLE NOTIFICATIONS
  // -------------------------------------------------------------------------

  onThrottleChange(callback: (level: ThrottleLevel) => void): () => void {
    this.throttleCallbacks.add(callback);
    return () => this.throttleCallbacks.delete(callback);
  }

  private notifyThrottleChange(level: ThrottleLevel): void {
    for (const callback of this.throttleCallbacks) {
      try {
        callback(level);
      } catch (e) {
        log.error('[ResourceGovernor] Throttle callback error:', e);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SUBSYSTEM BUDGET TRACKING
  // -------------------------------------------------------------------------

  reportSubsystemUsage(subsystem: string, memoryMB: number): void {
    const budget = this.subsystems.get(subsystem);
    if (!budget) return;

    budget.currentMB = memoryMB;
    if (memoryMB > budget.budgetMB) {
      budget.violations++;
      log.warn(` [ResourceGovernor] Subsystem '${subsystem}' exceeded budget: ${memoryMB}MB > ${budget.budgetMB}MB`);
    }
  }

  getSubsystemBudgets(): SubsystemBudget[] {
    return Array.from(this.subsystems.values());
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getSnapshot(): ResourceSnapshot | null {
    return this.lastSnapshot;
  }

  getPressure(): ResourcePressure {
    return this.currentPressure;
  }

  getThrottleLevel(): ThrottleLevel {
    return this.currentThrottle;
  }

  shouldDeferWork(): boolean {
    return this.currentThrottle !== 'none';
  }

  getMaxConcurrency(): number {
    return this.getThrottleConfig(this.currentThrottle).limitConcurrency;
  }

  // -------------------------------------------------------------------------
  // BUDGET CHECKS
  // -------------------------------------------------------------------------

  canAllocate(requestedMB: number): boolean {
    if (!this.lastSnapshot) return true;
    const projectedMB = this.lastSnapshot.memory.rssMB + requestedMB;
    return projectedMB < HARD_LIMITS.MAX_TOTAL_MEMORY_MB * 0.9; // 90% threshold
  }

  getBudgetRemaining(): number {
    if (!this.lastSnapshot) return HARD_LIMITS.MAX_TOTAL_MEMORY_MB;
    return Math.max(0, HARD_LIMITS.MAX_TOTAL_MEMORY_MB - this.lastSnapshot.memory.rssMB);
  }

  // -------------------------------------------------------------------------
  // GPU MANAGEMENT (Visual Smoothness Mode)
  // -------------------------------------------------------------------------

  shouldRender(): boolean {
    // Don't render during critical resource pressure
    if (this.currentPressure === 'critical') return false;
    
    // Always allow rendering if there's user activity
    if (!this.isIdle()) return true;
    
    // Don't render if already idle (GPU should sleep)
    return this.isRendering;
  }

  getGPUState(): GPUActivityLevel {
    return this.gpuActivity;
  }

  isGPUSleeping(): boolean {
    return this.gpuActivity === 'sleeping';
  }

  onRenderStateChange(callback: (isRendering: boolean) => void): () => void {
    this.renderCallbacks.add(callback);
    return () => this.renderCallbacks.delete(callback);
  }

  // Allow burst GPU activity during transitions
  allowGPUBurst(): boolean {
    return HARD_LIMITS.GPU_BURST_ALLOWED && 
           this.currentPressure !== 'critical' &&
           this.currentPressure !== 'high';
  }

  getTargetFrameTime(): number {
    // Return target based on current state
    if (this.currentThrottle === 'aggressive' || this.currentThrottle === 'emergency') {
      return HARD_LIMITS.MAX_FRAME_TIME_MS; // 60Hz when throttled
    }
    return HARD_LIMITS.TARGET_FRAME_TIME_MS; // 120Hz normally
  }

  // -------------------------------------------------------------------------
  // USER-CONFIGURABLE RAM LIMIT
  // -------------------------------------------------------------------------

  /** Apply a user-specified max RAM in GB (0 = auto-detect, min 0.5GB). Scales subsystem budgets proportionally. */
  applyUserMaxRam(maxGigabytes: number): void {
    if (maxGigabytes <= 0) {
      // Auto mode: already using hardware-detected tier
      log.info('[ResourceGovernor] RAM limit set to auto (tier: ' + hardwareProfile.tier + ', ' + HARD_LIMITS.MAX_TOTAL_MEMORY_MB + 'MB)');
      return;
    }
    const capMB = Math.max(512, Math.round(maxGigabytes * 1024));
    const baseLimits = limitsForTier(hardwareProfile.tier);
    const scale = capMB / baseLimits.MAX_TOTAL_MEMORY_MB;

    // Scale subsystem budgets proportionally
    for (const [key, budget] of this.subsystems.entries()) {
      const baseKey = 'BUDGET_' + key.toUpperCase();
      const baseVal = (baseLimits as any)[baseKey] || budget.budgetMB;
      budget.budgetMB = Math.max(32, Math.round(baseVal * scale));
    }

    log.info(`[ResourceGovernor] User RAM limit applied: ${capMB}MB (scale: ${scale.toFixed(2)}x)`);
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const resourceGovernor = new ResourceGovernorClass();
