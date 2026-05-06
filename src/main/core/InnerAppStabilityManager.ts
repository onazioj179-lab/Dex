// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// InnerAppStabilityManager
// ==========================================================================
// Validates tool states, runs deterministic effect pipelines, and wraps
// atomic operations across all inner apps. Provides background health
// monitoring with a 30-second interval check cycle.
// ==========================================================================

import { BrowserWindow, ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppHealthState {
  appId: string;
  lastCheck: number;
  healthy: boolean;
  errorCount: number;
  lastError: string;
  consecutiveFailures: number;
  operationsCompleted: number;
  operationsFailed: number;
  avgResponseMs: number;
  responseHistory: number[];
}

interface StabilityRule {
  appId: string;
  ruleName: string;
  check: (state: AppHealthState) => StabilityViolation | null;
  autoFix: ((appId: string) => void) | null;
}

interface StabilityViolation {
  appId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  autoFixable: boolean;
}

interface OperationContext {
  appId: string;
  operationId: string;
  startTime: number;
  timeout: number;
  rollback: (() => void) | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const MAX_RESPONSE_HISTORY = 20;
const ERROR_THRESHOLD = 5;
const RESPONSE_TIME_THRESHOLD_MS = 5000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Monitored Apps
// ---------------------------------------------------------------------------

const MONITORED_APPS = [
  'home', 'files', 'browser', 'settings', 'transfers', 'notes',
  'tasks', 'power', 'workflows', 'gallery', 'audio', 'videoeditor',
  'imosion', 'prism', 'flux', 'forge', 'calculator', 'calendar',
  'passwordgenerator', 'rewind', 'kanban', 'achievements',
];

// ---------------------------------------------------------------------------
// InnerAppStabilityManager
// ---------------------------------------------------------------------------

class InnerAppStabilityManager {
  private mainWindow: BrowserWindow | null = null;
  private healthStates: Map<string, AppHealthState> = new Map();
  private rules: StabilityRule[] = [];
  private violations: StabilityViolation[] = [];
  private activeOperations: Map<string, OperationContext> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;
  private operationIdCounter: number = 0;

  initialize(mainWindow: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = mainWindow;
    this.initialized = true;

    // Initialize health states for all monitored apps
    for (const appId of MONITORED_APPS) {
      this.healthStates.set(appId, {
        appId,
        lastCheck: Date.now(),
        healthy: true,
        errorCount: 0,
        lastError: '',
        consecutiveFailures: 0,
        operationsCompleted: 0,
        operationsFailed: 0,
        avgResponseMs: 0,
        responseHistory: [],
      });
    }

    // Register default stability rules
    this.registerDefaultRules();

    // Register IPC handlers
    this.registerIPC();

    // Start background health monitoring
    this.startHealthMonitor();
  }

  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.activeOperations.clear();
    this.initialized = false;
  }

  // -- IPC Registration --------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('stability:get-health', (_e, appId: string) => {
      if (typeof appId !== 'string') return null;
      return this.healthStates.get(appId) ?? null;
    });

    ipcMain.handle('stability:get-all-health', () => {
      const result: Record<string, AppHealthState> = {};
      for (const [id, state] of this.healthStates) {
        result[id] = { ...state };
      }
      return result;
    });

    ipcMain.handle('stability:get-violations', (_e, appId?: string) => {
      if (typeof appId === 'string') {
        return this.violations.filter(v => v.appId === appId);
      }
      return [...this.violations];
    });

    ipcMain.handle('stability:report-error', (_e, appId: string, errorMessage: string) => {
      if (typeof appId !== 'string' || typeof errorMessage !== 'string') return;
      this.recordError(appId, errorMessage);
    });

    ipcMain.handle('stability:report-success', (_e, appId: string, responseMs: number) => {
      if (typeof appId !== 'string' || typeof responseMs !== 'number') return;
      this.recordSuccess(appId, responseMs);
    });

    ipcMain.handle('stability:begin-operation', (_e, appId: string, timeoutMs?: number) => {
      if (typeof appId !== 'string') return null;
      return this.beginOperation(appId, timeoutMs);
    });

    ipcMain.handle('stability:complete-operation', (_e, operationId: string, success: boolean) => {
      if (typeof operationId !== 'string') return;
      this.completeOperation(operationId, success);
    });

    ipcMain.handle('stability:clear-violations', (_e, appId?: string) => {
      if (typeof appId === 'string') {
        this.violations = this.violations.filter(v => v.appId !== appId);
      } else {
        this.violations = [];
      }
    });

    ipcMain.handle('stability:reset-app', (_e, appId: string) => {
      if (typeof appId !== 'string') return;
      this.resetAppHealth(appId);
    });
  }

  // -- Health Tracking ---------------------------------------------

  private recordError(appId: string, errorMessage: string): void {
    const state = this.healthStates.get(appId);
    if (!state) return;

    state.errorCount++;
    state.consecutiveFailures++;
    state.operationsFailed++;
    state.lastError = errorMessage.slice(0, 500);
    state.lastCheck = Date.now();

    if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      state.healthy = false;
    }
  }

  private recordSuccess(appId: string, responseMs: number): void {
    const state = this.healthStates.get(appId);
    if (!state) return;

    state.consecutiveFailures = 0;
    state.operationsCompleted++;
    state.lastCheck = Date.now();

    state.responseHistory.push(responseMs);
    if (state.responseHistory.length > MAX_RESPONSE_HISTORY) {
      state.responseHistory.shift();
    }

    state.avgResponseMs = state.responseHistory.reduce((a, b) => a + b, 0) / state.responseHistory.length;

    // Restore health if response times are good
    if (state.avgResponseMs < RESPONSE_TIME_THRESHOLD_MS && state.consecutiveFailures === 0) {
      state.healthy = true;
    }
  }

  // -- Atomic Operations -------------------------------------------

  private beginOperation(appId: string, timeoutMs: number = 10000): string {
    const operationId = `op_${appId}_${++this.operationIdCounter}`;
    this.activeOperations.set(operationId, {
      appId,
      operationId,
      startTime: Date.now(),
      timeout: timeoutMs,
      rollback: null,
    });
    return operationId;
  }

  private completeOperation(operationId: string, success: boolean): void {
    const op = this.activeOperations.get(operationId);
    if (!op) return;

    const elapsed = Date.now() - op.startTime;
    this.activeOperations.delete(operationId);

    if (success) {
      this.recordSuccess(op.appId, elapsed);
    } else {
      this.recordError(op.appId, `Operation ${operationId} failed after ${elapsed}ms`);
    }
  }

  // -- Stability Rules ---------------------------------------------

  private registerDefaultRules(): void {
    // Rule: High error rate
    this.rules.push({
      appId: '*',
      ruleName: 'high-error-rate',
      check: (state) => {
        if (state.errorCount >= ERROR_THRESHOLD) {
          return {
            appId: state.appId,
            ruleName: 'high-error-rate',
            severity: state.errorCount >= ERROR_THRESHOLD * 2 ? 'critical' : 'high',
            message: `App ${state.appId} has ${state.errorCount} errors`,
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Rule: Slow response times
    this.rules.push({
      appId: '*',
      ruleName: 'slow-response',
      check: (state) => {
        if (state.avgResponseMs > RESPONSE_TIME_THRESHOLD_MS && state.responseHistory.length >= 5) {
          return {
            appId: state.appId,
            ruleName: 'slow-response',
            severity: 'medium',
            message: `App ${state.appId} average response ${Math.round(state.avgResponseMs)}ms exceeds threshold`,
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Rule: Consecutive failures
    this.rules.push({
      appId: '*',
      ruleName: 'consecutive-failures',
      check: (state) => {
        if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
          return {
            appId: state.appId,
            ruleName: 'consecutive-failures',
            severity: 'critical',
            message: `App ${state.appId} has ${state.consecutiveFailures} consecutive failures`,
            timestamp: Date.now(),
            autoFixable: true,
          };
        }
        return null;
      },
      autoFix: (appId: string) => {
        this.resetAppHealth(appId);
      },
    });

    // Rule: Stale health data
    this.rules.push({
      appId: '*',
      ruleName: 'stale-health',
      check: (state) => {
        const staleMs = Date.now() - state.lastCheck;
        if (staleMs > HEALTH_CHECK_INTERVAL_MS * 5 && state.operationsCompleted > 0) {
          return {
            appId: state.appId,
            ruleName: 'stale-health',
            severity: 'low',
            message: `App ${state.appId} health data is ${Math.round(staleMs / 1000)}s old`,
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Rule: Operation timeout detection
    this.rules.push({
      appId: '*',
      ruleName: 'operation-timeout',
      check: (_state) => {
        for (const [, op] of this.activeOperations) {
          if (op.appId === _state.appId) {
            const elapsed = Date.now() - op.startTime;
            if (elapsed > op.timeout) {
              return {
                appId: op.appId,
                ruleName: 'operation-timeout',
                severity: 'high',
                message: `Operation ${op.operationId} timed out after ${elapsed}ms`,
                timestamp: Date.now(),
                autoFixable: true,
              };
            }
          }
        }
        return null;
      },
      autoFix: (appId: string) => {
        // Clean up timed out operations for this app
        for (const [opId, op] of this.activeOperations) {
          if (op.appId === appId) {
            const elapsed = Date.now() - op.startTime;
            if (elapsed > op.timeout) {
              this.activeOperations.delete(opId);
              this.recordError(appId, `Operation ${opId} force-terminated due to timeout`);
            }
          }
        }
      },
    });

    // App-specific rules

    // Vinx (Video Editor): Warn if rendering operations are slow
    this.rules.push({
      appId: 'videoeditor',
      ruleName: 'vinx-render-latency',
      check: (state) => {
        if (state.avgResponseMs > 3000 && state.responseHistory.length >= 3) {
          return {
            appId: 'videoeditor',
            ruleName: 'vinx-render-latency',
            severity: 'medium',
            message: 'Vinx render operations are slow - consider reducing preview quality',
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Forge: Code compilation timeout
    this.rules.push({
      appId: 'forge',
      ruleName: 'forge-compile-timeout',
      check: (state) => {
        if (state.operationsFailed > 3 && state.lastError.includes('timeout')) {
          return {
            appId: 'forge',
            ruleName: 'forge-compile-timeout',
            severity: 'medium',
            message: 'Forge compilation operations timing out frequently',
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Flux: Database query performance
    this.rules.push({
      appId: 'flux',
      ruleName: 'flux-query-performance',
      check: (state) => {
        if (state.avgResponseMs > 2000 && state.operationsCompleted > 10) {
          return {
            appId: 'flux',
            ruleName: 'flux-query-performance',
            severity: 'low',
            message: 'Flux data queries are slow',
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });

    // Kanban: Board state consistency
    this.rules.push({
      appId: 'kanban',
      ruleName: 'kanban-state-integrity',
      check: (state) => {
        if (state.errorCount > 2 && state.lastError.includes('state')) {
          return {
            appId: 'kanban',
            ruleName: 'kanban-state-integrity',
            severity: 'high',
            message: 'Kanban board state may be inconsistent',
            timestamp: Date.now(),
            autoFixable: true,
          };
        }
        return null;
      },
      autoFix: (appId: string) => {
        this.resetAppHealth(appId);
        this.notifyRenderer('stability:app-reset', appId);
      },
    });

    // Imosion: Image processing memory
    this.rules.push({
      appId: 'imosion',
      ruleName: 'imosion-memory-pressure',
      check: (state) => {
        if (state.operationsFailed > 5 && state.lastError.includes('memory')) {
          return {
            appId: 'imosion',
            ruleName: 'imosion-memory-pressure',
            severity: 'high',
            message: 'Imosion may be under memory pressure from large images',
            timestamp: Date.now(),
            autoFixable: false,
          };
        }
        return null;
      },
      autoFix: null,
    });


  }

  // -- Health Monitor ----------------------------------------------

  private startHealthMonitor(): void {
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private runHealthChecks(): void {
    const newViolations: StabilityViolation[] = [];

    for (const [, state] of this.healthStates) {
      for (const rule of this.rules) {
        if (rule.appId !== '*' && rule.appId !== state.appId) continue;

        const violation = rule.check(state);
        if (violation) {
          newViolations.push(violation);

          // Auto-fix if available
          if (violation.autoFixable && rule.autoFix) {
            rule.autoFix(state.appId);
          }
        }
      }
    }

    // Keep only recent violations (last 200)
    this.violations.push(...newViolations);
    if (this.violations.length > 200) {
      this.violations = this.violations.slice(-200);
    }

    // Notify renderer of health update
    if (newViolations.length > 0) {
      this.notifyRenderer('stability:violations-detected', newViolations);
    }

    // Check and clean up timed-out operations
    const now = Date.now();
    for (const [opId, op] of this.activeOperations) {
      if (now - op.startTime > op.timeout * 2) {
        this.activeOperations.delete(opId);
        this.recordError(op.appId, `Operation ${opId} abandoned after ${now - op.startTime}ms`);
      }
    }
  }

  // -- Reset -------------------------------------------------------

  private resetAppHealth(appId: string): void {
    const state = this.healthStates.get(appId);
    if (!state) return;

    state.healthy = true;
    state.errorCount = 0;
    state.consecutiveFailures = 0;
    state.lastError = '';
    state.lastCheck = Date.now();
  }

  // -- Notification ------------------------------------------------

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton & Exports
// ---------------------------------------------------------------------------

const innerAppStabilityManager = new InnerAppStabilityManager();

export function initializeInnerAppStability(mainWindow: BrowserWindow): void {
  innerAppStabilityManager.initialize(mainWindow);
}

export function shutdownInnerAppStability(): void {
  innerAppStabilityManager.shutdown();
}

export { innerAppStabilityManager };
