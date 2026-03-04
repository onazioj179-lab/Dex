// ═══════════════════════════════════════════════════════════════════════════
// DEX - Resource Governor
// MAXIMUM PERFORMANCE MODE
// ═══════════════════════════════════════════════════════════════════════════
// TARGETS:
// - RAM: up to 8 GB when needed, full power
// - CPU: 95% power for maximum performance
// - GPU: 80% power during app operations
// - Maximum performance during use
// - 120Hz smooth interaction support
// ═══════════════════════════════════════════════════════════════════════════

import log from 'electron-log';
import { app, BrowserWindow, ipcMain } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// MAXIMUM LIMITS - Full Performance
// ═══════════════════════════════════════════════════════════════════════════

export const HARD_LIMITS = {
  // Memory limits (bytes) - 4GB mode
  MAX_TOTAL_MEMORY_MB: 4096,           // 4 GB maximum for all apps
  MAX_HEAP_MEMORY_MB: 2048,            // 2 GB heap limit
  MAX_RENDERER_MEMORY_MB: 1024,        // 1 GB per renderer
  
  // Subsystem memory budgets (MB)
  BUDGET_UI: 512,
  BUDGET_WORKFLOWS: 256,
  BUDGET_STORAGE: 256,
  BUDGET_INDEXING: 128,
  BUDGET_CACHE: 256,
  BUDGET_PYTHON: 512,
  BUDGET_RESERVE: 128,
  
  // CPU limits - FULL POWER
  MAX_IDLE_CPU_PERCENT: 90,            // Allow heavy background processing
  MAX_ACTIVE_CPU_PERCENT: 100,         // Maximum power when needed
  
  // GPU limits - FULL POWER
  GPU_IDLE_TARGET: 10,                 // Some GPU at idle for smooth UI
  GPU_MINIMAL_THRESHOLD: 80,           // Maximum GPU for instant rendering
  GPU_BURST_ALLOWED: true,             // Burst allowed during transitions
  
  // Frame timing (120Hz support)
  TARGET_FRAME_TIME_MS: 8.33,          // 120Hz target
  MAX_FRAME_TIME_MS: 16.67,            // 60Hz fallback
  MAX_PAINT_TIME_MS: 4,                // Half frame for painting
  
  // Timing limits (ms)
  MAX_EVENT_LOOP_LAG_MS: 16,           // 60fps responsiveness
  MAX_OPERATION_DURATION_MS: 5000,     // 5 second max for any operation
  MAX_BACKGROUND_TASK_MS: 1000,        // 1 second max for background work
  
  // Queue limits
  MAX_TASK_QUEUE_SIZE: 50,
  MAX_PENDING_OPERATIONS: 10,
  
  // Intervals (ms) - Event-driven preferred, but some monitoring needed
  MEMORY_CHECK_INTERVAL_MS: 180000,    // Check memory every 3 minutes (reduced overhead)
  IDLE_DETECTION_MS: 5000,             // 5 seconds to consider idle
  GC_FORCE_INTERVAL_MS: 600000,        // Force GC every 10 minutes if needed
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE GOVERNOR - Enforces hard limits
// ═══════════════════════════════════════════════════════════════════════════

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

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  private initializeSubsystemBudgets(): void {
    this.subsystems.set('ui', { name: 'UI', budgetMB: HARD_LIMITS.BUDGET_UI, currentMB: 0, violations: 0 });
    this.subsystems.set('workflows', { name: 'Workflows', budgetMB: HARD_LIMITS.BUDGET_WORKFLOWS, currentMB: 0, violations: 0 });
    this.subsystems.set('storage', { name: 'Storage', budgetMB: HARD_LIMITS.BUDGET_STORAGE, currentMB: 0, violations: 0 });
    this.subsystems.set('indexing', { name: 'Indexing', budgetMB: HARD_LIMITS.BUDGET_INDEXING, currentMB: 0, violations: 0 });
    this.subsystems.set('cache', { name: 'Cache', budgetMB: HARD_LIMITS.BUDGET_CACHE, currentMB: 0, violations: 0 });
    this.subsystems.set('python', { name: 'Python', budgetMB: HARD_LIMITS.BUDGET_PYTHON, currentMB: 0, violations: 0 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // START / STOP
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    log.info(' [ResourceGovernor] Starting - PERFORMANCE MODE (4GB RAM, 100% CPU, 80% GPU)');
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

  // ─────────────────────────────────────────────────────────────────────────
  // IPC HANDLERS (GPU & Render Tracking)
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // RESOURCE CHECKING
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // CACHE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // USER ACTIVITY TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  recordUserActivity(): void {
    this.lastUserActivity = Date.now();
  }

  isIdle(): boolean {
    return (Date.now() - this.lastUserActivity) > HARD_LIMITS.IDLE_DETECTION_MS;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // THROTTLE NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // SUBSYSTEM BUDGET TRACKING
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // BUDGET CHECKS
  // ─────────────────────────────────────────────────────────────────────────

  canAllocate(requestedMB: number): boolean {
    if (!this.lastSnapshot) return true;
    const projectedMB = this.lastSnapshot.memory.rssMB + requestedMB;
    return projectedMB < HARD_LIMITS.MAX_TOTAL_MEMORY_MB * 0.9; // 90% threshold
  }

  getBudgetRemaining(): number {
    if (!this.lastSnapshot) return HARD_LIMITS.MAX_TOTAL_MEMORY_MB;
    return Math.max(0, HARD_LIMITS.MAX_TOTAL_MEMORY_MB - this.lastSnapshot.memory.rssMB);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GPU MANAGEMENT (Visual Smoothness Mode)
  // ─────────────────────────────────────────────────────────────────────────

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
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const resourceGovernor = new ResourceGovernorClass();
