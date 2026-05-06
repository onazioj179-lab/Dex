// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Performance Enforcer
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ===========================================================================
// Measurement & Guarantees: Continuous enforcement of performance targets
// ===========================================================================
// Any change that:
// - Increases baseline usage
// - Introduces jitter
// - Breaks smoothness
// IS REJECTED.
// ===========================================================================

import log from 'electron-log';
import { ipcMain, BrowserWindow, app } from 'electron';

// ===========================================================================
// PERFORMANCE GUARANTEES - NON-NEGOTIABLE
// ===========================================================================

export const GUARANTEES = {
  // Memory (hard ceilings)
  MAX_MEMORY_MB: 2048,                 // 2 GB absolute max
  MEMORY_GROWTH_MB_PER_HOUR: 10,       // Max acceptable drift
  
  // CPU (idle floor)
  MAX_IDLE_CPU_PERCENT: 0.5,           // Near zero at idle
  MAX_ACTIVE_CPU_PERCENT: 25,          // Reasonable during use
  
  // GPU (idle floor)
  MAX_IDLE_GPU_ACTIVITY: 0,            // Zero at idle
  
  // Frame timing (smoothness)
  TARGET_FRAME_TIME_MS: 8.33,          // 120Hz
  MAX_FRAME_TIME_MS: 16.67,            // 60Hz fallback
  MAX_FRAME_VARIANCE: 2,               // Max 2x variance
  MAX_JANK_FRAMES_PER_MINUTE: 3,       // Near-zero jank
  
  // Input latency (responsiveness)
  MAX_TYPING_LATENCY_MS: 16,
  MAX_SCROLL_LATENCY_MS: 8,
  MAX_CLICK_LATENCY_MS: 16,
  
  // Long-session stability
  MAX_PERFORMANCE_DEGRADATION_PERCENT: 10,
  SESSION_STABILITY_HOURS: 24,         // Must maintain for 24+ hours
} as const;

// ===========================================================================
// TYPES
// ===========================================================================

export type GuaranteeStatus = 'passing' | 'warning' | 'failing';
export type EnforcementAction = 'none' | 'throttle' | 'reduce-motion' | 'emergency';

export interface GuaranteeCheck {
  name: string;
  status: GuaranteeStatus;
  current: number;
  target: number;
  unit: string;
  message?: string;
}

export interface EnforcementSnapshot {
  timestamp: number;
  overallStatus: GuaranteeStatus;
  checks: GuaranteeCheck[];
  action: EnforcementAction;
  consecutiveFailures: number;
  uptimeHours: number;
}

export interface PerformanceBaseline {
  memoryMB: number;
  cpuPercent: number;
  avgFrameTime: number;
  avgInputLatency: number;
  timestamp: number;
}

// ===========================================================================
// PERFORMANCE ENFORCER
// ===========================================================================

class PerformanceEnforcerClass {
  private isRunning = false;
  private windows: Map<number, BrowserWindow> = new Map();
  
  // Baseline tracking
  private baseline: PerformanceBaseline | null = null;
  private baselineEstablished = false;
  
  // Current metrics
  private currentMemoryMB = 0;
  private currentCpuPercent = 0;
  private currentFrameTime = 0;
  private currentInputLatency = 0;
  private jankFramesThisMinute = 0;
  private isIdle = true;
  
  // State
  private consecutiveFailures = 0;
  private currentAction: EnforcementAction = 'none';
  private lastCheck: GuaranteeCheck[] = [];
  
  // Intervals
  private enforceInterval: NodeJS.Timeout | null = null;
  private jankResetInterval: NodeJS.Timeout | null = null;
  
  // Start time
  private startTime = Date.now();

  constructor() {}

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();
    
    log.info(' [PerformanceEnforcer] Starting - Guarantees enforcement mode');
    log.info(` [PerformanceEnforcer] Targets: ${GUARANTEES.MAX_MEMORY_MB}MB RAM, ${GUARANTEES.TARGET_FRAME_TIME_MS}ms frames`);
    
    this.setupIPCHandlers();
    this.startEnforcement();
    
    // Establish baseline after 5 minutes
    setTimeout(() => {
      this.establishBaseline();
    }, 300000);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.enforceInterval) {
      clearInterval(this.enforceInterval);
      this.enforceInterval = null;
    }
    if (this.jankResetInterval) {
      clearInterval(this.jankResetInterval);
      this.jankResetInterval = null;
    }
    
    log.info(' [PerformanceEnforcer] Stopped');
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPCHandlers(): void {
    // Receive metrics from renderer
    ipcMain.on('enforce:metrics', (_event, metrics: {
      frameTime?: number;
      inputLatency?: number;
      isIdle?: boolean;
    }) => {
      if (metrics.frameTime !== undefined) {
        this.recordFrameTime(metrics.frameTime);
      }
      if (metrics.inputLatency !== undefined) {
        this.recordInputLatency(metrics.inputLatency);
      }
      if (metrics.isIdle !== undefined) {
        this.isIdle = metrics.isIdle;
      }
    });
    
    // Get current snapshot
    ipcMain.handle('enforce:getSnapshot', () => this.getSnapshot());
    
    // Get guarantees
    ipcMain.handle('enforce:getGuarantees', () => GUARANTEES);
    
    // Get baseline
    ipcMain.handle('enforce:getBaseline', () => this.baseline);
    
    // Force check
    ipcMain.handle('enforce:check', () => {
      this.performCheck();
      return this.getSnapshot();
    });
  }

  // -------------------------------------------------------------------------
  // METRICS RECORDING
  // -------------------------------------------------------------------------

  private recordFrameTime(frameTime: number): void {
    this.currentFrameTime = frameTime;
    
    // Count jank frames (> 2x target)
    if (frameTime > GUARANTEES.TARGET_FRAME_TIME_MS * 2) {
      this.jankFramesThisMinute++;
    }
  }

  private recordInputLatency(latency: number): void {
    this.currentInputLatency = latency;
  }

  updateMemory(memoryMB: number): void {
    this.currentMemoryMB = memoryMB;
  }

  updateCPU(cpuPercent: number): void {
    this.currentCpuPercent = cpuPercent;
  }

  // -------------------------------------------------------------------------
  // BASELINE ESTABLISHMENT
  // -------------------------------------------------------------------------

  private establishBaseline(): void {
    if (this.baselineEstablished) return;
    
    this.baseline = {
      memoryMB: this.currentMemoryMB,
      cpuPercent: this.currentCpuPercent,
      avgFrameTime: this.currentFrameTime,
      avgInputLatency: this.currentInputLatency,
      timestamp: Date.now(),
    };
    
    this.baselineEstablished = true;
    log.info(` [PerformanceEnforcer] Baseline established: ${this.baseline.memoryMB}MB, ${this.baseline.avgFrameTime.toFixed(1)}ms frames`);
  }

  // -------------------------------------------------------------------------
  // ENFORCEMENT
  // -------------------------------------------------------------------------

  private startEnforcement(): void {
    // Check guarantees every 30 seconds
    this.enforceInterval = setInterval(() => {
      this.performCheck();
    }, 30000);
    
    // Reset jank counter every minute
    this.jankResetInterval = setInterval(() => {
      this.jankFramesThisMinute = 0;
    }, 60000);
  }

  private performCheck(): void {
    const checks: GuaranteeCheck[] = [];
    
    // Memory check
    checks.push(this.checkMemory());
    
    // CPU check
    checks.push(this.checkCPU());
    
    // Frame time check
    checks.push(this.checkFrameTime());
    
    // Input latency check
    checks.push(this.checkInputLatency());
    
    // Jank check
    checks.push(this.checkJank());
    
    // Degradation check (if baseline exists)
    if (this.baselineEstablished) {
      checks.push(this.checkDegradation());
    }
    
    this.lastCheck = checks;
    
    // Determine overall status
    const failingChecks = checks.filter(c => c.status === 'failing');
    const warningChecks = checks.filter(c => c.status === 'warning');
    
    let overallStatus: GuaranteeStatus = 'passing';
    if (failingChecks.length > 0) {
      overallStatus = 'failing';
      this.consecutiveFailures++;
    } else if (warningChecks.length > 0) {
      overallStatus = 'warning';
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures = 0;
    }
    
    // Determine enforcement action
    this.currentAction = this.determineAction(overallStatus, failingChecks);
    
    // Log failures
    if (failingChecks.length > 0) {
      const names = failingChecks.map(c => c.name).join(', ');
      log.warn(` [PerformanceEnforcer] Guarantees failing: ${names}`);
    }
    
    // Take action
    this.executeAction(this.currentAction);
  }

  // -------------------------------------------------------------------------
  // INDIVIDUAL CHECKS
  // -------------------------------------------------------------------------

  private checkMemory(): GuaranteeCheck {
    const current = this.currentMemoryMB;
    const target = GUARANTEES.MAX_MEMORY_MB;
    
    let status: GuaranteeStatus = 'passing';
    if (current > target) {
      status = 'failing';
    } else if (current > target * 0.9) {
      status = 'warning';
    }
    
    return {
      name: 'Memory',
      status,
      current,
      target,
      unit: 'MB',
      message: status === 'failing' ? `${current}MB exceeds ${target}MB limit` : undefined,
    };
  }

  private checkCPU(): GuaranteeCheck {
    const current = this.currentCpuPercent;
    const target = this.isIdle ? GUARANTEES.MAX_IDLE_CPU_PERCENT : GUARANTEES.MAX_ACTIVE_CPU_PERCENT;
    
    let status: GuaranteeStatus = 'passing';
    if (current > target * 2) {
      status = 'failing';
    } else if (current > target) {
      status = 'warning';
    }
    
    return {
      name: this.isIdle ? 'Idle CPU' : 'Active CPU',
      status,
      current,
      target,
      unit: '%',
      message: status === 'failing' ? `${current.toFixed(1)}% exceeds ${target}% limit` : undefined,
    };
  }

  private checkFrameTime(): GuaranteeCheck {
    const current = this.currentFrameTime;
    const target = GUARANTEES.TARGET_FRAME_TIME_MS;
    
    let status: GuaranteeStatus = 'passing';
    if (current > GUARANTEES.MAX_FRAME_TIME_MS) {
      status = 'failing';
    } else if (current > target) {
      status = 'warning';
    }
    
    return {
      name: 'Frame Time',
      status,
      current,
      target,
      unit: 'ms',
      message: status === 'failing' ? `${current.toFixed(1)}ms exceeds 60Hz threshold` : undefined,
    };
  }

  private checkInputLatency(): GuaranteeCheck {
    const current = this.currentInputLatency;
    const target = GUARANTEES.MAX_TYPING_LATENCY_MS;
    
    let status: GuaranteeStatus = 'passing';
    if (current > target * 2) {
      status = 'failing';
    } else if (current > target) {
      status = 'warning';
    }
    
    return {
      name: 'Input Latency',
      status,
      current,
      target,
      unit: 'ms',
      message: status === 'failing' ? `${current.toFixed(1)}ms exceeds ${target}ms limit` : undefined,
    };
  }

  private checkJank(): GuaranteeCheck {
    const current = this.jankFramesThisMinute;
    const target = GUARANTEES.MAX_JANK_FRAMES_PER_MINUTE;
    
    let status: GuaranteeStatus = 'passing';
    if (current > target * 3) {
      status = 'failing';
    } else if (current > target) {
      status = 'warning';
    }
    
    return {
      name: 'Jank Frames',
      status,
      current,
      target,
      unit: '/min',
      message: status === 'failing' ? `${current} jank frames in last minute` : undefined,
    };
  }

  private checkDegradation(): GuaranteeCheck {
    if (!this.baseline) {
      return { name: 'Degradation', status: 'passing', current: 0, target: 0, unit: '%' };
    }
    
    const memoryDegradation = ((this.currentMemoryMB - this.baseline.memoryMB) / this.baseline.memoryMB) * 100;
    const frameDegradation = ((this.currentFrameTime - this.baseline.avgFrameTime) / this.baseline.avgFrameTime) * 100;
    
    const maxDegradation = Math.max(memoryDegradation, frameDegradation);
    const target = GUARANTEES.MAX_PERFORMANCE_DEGRADATION_PERCENT;
    
    let status: GuaranteeStatus = 'passing';
    if (maxDegradation > target * 2) {
      status = 'failing';
    } else if (maxDegradation > target) {
      status = 'warning';
    }
    
    return {
      name: 'Degradation',
      status,
      current: maxDegradation,
      target,
      unit: '%',
      message: status === 'failing' ? `Performance degraded ${maxDegradation.toFixed(1)}% from baseline` : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // ACTION DETERMINATION
  // -------------------------------------------------------------------------

  private determineAction(status: GuaranteeStatus, failingChecks: GuaranteeCheck[]): EnforcementAction {
    if (status === 'passing') return 'none';
    
    // Emergency: consecutive failures or memory critical
    if (this.consecutiveFailures >= 5 || 
        failingChecks.some(c => c.name === 'Memory' && c.current > GUARANTEES.MAX_MEMORY_MB * 1.1)) {
      return 'emergency';
    }
    
    // Reduce motion: frame time or jank issues
    if (failingChecks.some(c => c.name === 'Frame Time' || c.name === 'Jank Frames')) {
      return 'reduce-motion';
    }
    
    // Throttle: CPU or latency issues
    return 'throttle';
  }

  private executeAction(action: EnforcementAction): void {
    // Broadcast action to windows
    this.windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('enforce:action', action);
      }
    });
    
    // Log significant actions
    if (action !== 'none') {
      log.info(` [PerformanceEnforcer] Enforcement action: ${action}`);
    }
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  getSnapshot(): EnforcementSnapshot {
    const failingCount = this.lastCheck.filter(c => c.status === 'failing').length;
    const warningCount = this.lastCheck.filter(c => c.status === 'warning').length;
    
    let overallStatus: GuaranteeStatus = 'passing';
    if (failingCount > 0) overallStatus = 'failing';
    else if (warningCount > 0) overallStatus = 'warning';
    
    return {
      timestamp: Date.now(),
      overallStatus,
      checks: this.lastCheck,
      action: this.currentAction,
      consecutiveFailures: this.consecutiveFailures,
      uptimeHours: (Date.now() - this.startTime) / 3600000,
    };
  }

  registerWindow(window: BrowserWindow): void {
    this.windows.set(window.id, window);
    
    window.on('closed', () => {
      this.windows.delete(window.id);
    });
    
    // Send guarantees to renderer
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('enforce:guarantees', GUARANTEES);
    });
  }

  isGuaranteeMet(): boolean {
    return this.consecutiveFailures === 0;
  }

  getGuarantees(): typeof GUARANTEES {
    return GUARANTEES;
  }

  getUptimeHours(): number {
    return (Date.now() - this.startTime) / 3600000;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const PerformanceEnforcer = new PerformanceEnforcerClass();
export default PerformanceEnforcer;
