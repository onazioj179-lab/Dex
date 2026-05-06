// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Startup Sequencer
// ==========================================================================
// Rules 29-36: Startup / Shutdown Architecture
// 29. Deterministic 3-phase startup (A/B/C) - existing
// 30. Parallel execution within Phase C for non-critical steps
// 31. Integrity checks run in parallel with Phase A services
// 32. Pre-load last active app hint in Phase A
// 33. Session heartbeat every 30s
// 34. Startup timing budgets: 800ms Tier 1, 2000ms Tier 3
// 35. Session heartbeat writes to rewind DB
// 36. Graceful degradation on step failure
// ==========================================================================

import * as log from 'electron-log';
import * as crypto from 'crypto';
import { ipcMain, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface StartupStep {
  name: string;
  phase: 'A' | 'B' | 'C';
  critical: boolean;
  parallel: boolean;         // Rule 30: can run in parallel within phase
  fn: () => void | Promise<void>;
  status: StepStatus;
  durationMs: number;
  error?: string;
}

interface PhaseTimings {
  phase: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  steps: number;
  failed: number;
}

// Rule 34: Phase budgets per tier
const PHASE_BUDGETS: Record<number, Record<string, number>> = {
  1: { A: 300, B: 300, C: 200, total: 800 },
  2: { A: 500, B: 500, C: 500, total: 1500 },
  3: { A: 800, B: 700, C: 500, total: 2000 },
};

// ---------------------------------------------------------------------------
// Startup Sequencer
// ---------------------------------------------------------------------------

class StartupSequencer {
  private steps: StartupStep[] = [];
  private phaseTimings: PhaseTimings[] = [];
  private totalStartTime = 0;
  private totalEndTime = 0;
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  // Rule 33: Session heartbeat
  private sessionId: string = '';
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sessionStartTime = 0;
  private capabilityTier = 2;

  // Rule 32: Last active app hint
  private lastActiveApp: string = '';

  initialize(): void {
    if (this.initialized) return;
    this.sessionId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.sessionStartTime = Date.now();
    this.registerIPC();
    this.initialized = true;
  }

  setCapabilityTier(tier: number): void {
    this.capabilityTier = tier;
  }

  // Rule 32: Set last active app for pre-loading
  setLastActiveApp(appId: string): void {
    this.lastActiveApp = appId;
  }

  getLastActiveApp(): string {
    return this.lastActiveApp;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ---------------------------------------------------------------------------
  // Step registration -- Rule 30: parallel flag
  // ---------------------------------------------------------------------------

  addStep(name: string, phase: 'A' | 'B' | 'C', critical: boolean, fn: () => void | Promise<void>, parallel: boolean = false): void {
    this.steps.push({
      name,
      phase,
      critical,
      parallel,
      fn,
      status: 'pending',
      durationMs: 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Execution -- Rule 30: parallel within phase for non-critical
  // ---------------------------------------------------------------------------

  async runPhase(phase: 'A' | 'B' | 'C'): Promise<{ success: boolean; durationMs: number; failedSteps: string[] }> {
    const phaseSteps = this.steps.filter(s => s.phase === phase);
    const phaseStart = performance.now();
    const failedSteps: string[] = [];

    log.info(`[StartupSequencer] Phase ${phase}: ${phaseSteps.length} steps`);

    // Separate serial (critical) and parallel (non-critical) steps
    const serialSteps = phaseSteps.filter(s => s.critical || !s.parallel);
    const parallelSteps = phaseSteps.filter(s => !s.critical && s.parallel);

    // Run serial steps first
    for (const step of serialSteps) {
      await this.runStep(step, failedSteps);

      // Rule 34: check budget
      const elapsed = performance.now() - phaseStart;
      const budget = PHASE_BUDGETS[this.capabilityTier]?.[phase] ?? 1000;
      if (elapsed > budget) {
        log.warn(`[StartupSequencer] Phase ${phase} exceeded budget: ${elapsed.toFixed(0)}ms > ${budget}ms`);
      }
    }

    // Rule 30: Run parallel steps concurrently
    if (parallelSteps.length > 0) {
      log.info(`[StartupSequencer] Phase ${phase}: Running ${parallelSteps.length} steps in parallel`);
      await Promise.allSettled(
        parallelSteps.map(step => this.runStep(step, failedSteps))
      );
    }

    const phaseDuration = performance.now() - phaseStart;
    this.phaseTimings.push({
      phase,
      startTime: phaseStart,
      endTime: performance.now(),
      durationMs: phaseDuration,
      steps: phaseSteps.length,
      failed: failedSteps.length,
    });

    const allCriticalOk = phaseSteps.filter(s => s.critical).every(s => s.status === 'completed');
    log.info(`[StartupSequencer] Phase ${phase} complete: ${phaseDuration.toFixed(1)}ms (${failedSteps.length} failures)`);

    return {
      success: allCriticalOk,
      durationMs: phaseDuration,
      failedSteps,
    };
  }

  private async runStep(step: StartupStep, failedSteps: string[]): Promise<void> {
    const stepStart = performance.now();
    step.status = 'running';

    try {
      await Promise.resolve(step.fn());
      step.status = 'completed';
    } catch (err: any) {
      step.status = 'failed';
      step.error = err?.message ?? String(err);
      failedSteps.push(step.name);

      if (step.critical) {
        log.error(`[StartupSequencer] CRITICAL step failed: ${step.name}`, err);
      } else {
        log.warn(`[StartupSequencer] Non-critical step failed: ${step.name}`, err);
      }
    }

    step.durationMs = performance.now() - stepStart;

    if (step.durationMs > 500) {
      log.warn(`[StartupSequencer] Slow step: ${step.name} took ${step.durationMs.toFixed(1)}ms`);
    }
  }

  async runAll(): Promise<{ success: boolean; totalMs: number }> {
    this.totalStartTime = performance.now();

    const phaseA = await this.runPhase('A');
    if (!phaseA.success) {
      log.error('[StartupSequencer] Phase A critical failure; aborting');
      return { success: false, totalMs: performance.now() - this.totalStartTime };
    }

    const phaseB = await this.runPhase('B');
    if (!phaseB.success) {
      log.error('[StartupSequencer] Phase B critical failure; aborting');
      return { success: false, totalMs: performance.now() - this.totalStartTime };
    }

    // Phase C: failures are non-blocking
    await this.runPhase('C');

    this.totalEndTime = performance.now();
    const totalMs = this.totalEndTime - this.totalStartTime;

    // Rule 34: Check total budget
    const budget = PHASE_BUDGETS[this.capabilityTier]?.total ?? 2000;
    if (totalMs > budget) {
      log.warn(`[StartupSequencer] Total startup ${totalMs.toFixed(0)}ms exceeded budget ${budget}ms for tier ${this.capabilityTier}`);
    }

    log.info(`[StartupSequencer] All phases complete: ${totalMs.toFixed(1)}ms total`);

    // Rule 33: Start session heartbeat
    this.startHeartbeat();

    return { success: true, totalMs };
  }

  // ---------------------------------------------------------------------------
  // Rule 33 & 35: Session heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.writeHeartbeat();
    }, 30000); // Every 30 seconds
    // Write initial heartbeat
    this.writeHeartbeat();
  }

  private writeHeartbeat(): void {
    try {
      // Rule 35: Write to rewind DB via DatabaseCluster
      const { databaseCluster } = require('./DatabaseCluster');
      const uptimeMs = Date.now() - this.sessionStartTime;
      databaseCluster.kvSet(`heartbeat:${this.sessionId}`, JSON.stringify({
        sessionId: this.sessionId,
        uptimeMs,
        timestamp: Date.now(),
        tier: this.capabilityTier,
      }));
    } catch {
      // Heartbeat must never throw
    }
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getReport(): {
    totalMs: number;
    phases: PhaseTimings[];
    steps: Array<{ name: string; phase: string; status: StepStatus; durationMs: number; critical: boolean; error?: string }>;
    slowestSteps: Array<{ name: string; durationMs: number }>;
    sessionId: string;
    tier: number;
  } {
    const stepReport = this.steps.map(s => ({
      name: s.name,
      phase: s.phase,
      status: s.status,
      durationMs: s.durationMs,
      critical: s.critical,
      error: s.error,
    }));

    const slowest = [...this.steps]
      .filter(s => s.status === 'completed' || s.status === 'failed')
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)
      .map(s => ({ name: s.name, durationMs: s.durationMs }));

    return {
      totalMs: this.totalEndTime - this.totalStartTime,
      phases: this.phaseTimings,
      steps: stepReport,
      slowestSteps: slowest,
      sessionId: this.sessionId,
      tier: this.capabilityTier,
    };
  }

  getPhaseTimings(): PhaseTimings[] {
    return this.phaseTimings;
  }

  getTotalDuration(): number {
    return this.totalEndTime - this.totalStartTime;
  }

  isComplete(): boolean {
    return this.steps.length > 0 && this.steps.every(s => s.status !== 'pending' && s.status !== 'running');
  }

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  // ---------------------------------------------------------------------------
  // IPC
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('startup-sequencer:report', () => {
      return this.getReport();
    });

    ipcMain.handle('startup-sequencer:phase-timings', () => {
      return this.getPhaseTimings();
    });

    ipcMain.handle('startup-sequencer:total-duration', () => {
      return this.getTotalDuration();
    });

    ipcMain.handle('startup-sequencer:is-complete', () => {
      return this.isComplete();
    });

    ipcMain.handle('startup-sequencer:session-id', () => {
      return this.sessionId;
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.stopHeartbeat();
    this.steps = [];
    this.phaseTimings = [];
    this.initialized = false;
    log.info('[StartupSequencer] Shutdown complete');
  }
}

export const startupSequencer = new StartupSequencer();

export function initializeStartupSequencer(): void {
  startupSequencer.initialize();
}

export function shutdownStartupSequencer(): void {
  startupSequencer.shutdown();
}
