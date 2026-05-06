// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Shutdown Sequencer
// ==========================================================================
// Rules 29-36 (shutdown side):
// 29. Orderly shutdown with data integrity guarantees
// 30. Parallel execution for independent shutdown steps
// 31. Integrity hashes computed for critical data
// 33. Stop session heartbeat
// 36. Master key zeroing, WAL checkpoint, clean exit
// Steps:
//   1. Stop accepting new IPC
//   2. Stop session heartbeat
//   3. Cancel pending background tasks
//   4. Serialize all app state to DatabaseCluster
//   5. Flush all write buffers (rewind, analytics, etc.)
//   6. Compute integrity hashes for critical data
//   7. Clear encryption keys (memory zeroing)
//   8. Close all databases (WAL checkpoint first)
//   9. Terminate worker threads
//  10. Destroy tray and windows
// ==========================================================================

import * as log from 'electron-log';
import { ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShutdownStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed-out';

interface ShutdownStep {
  name: string;
  order: number;
  critical: boolean;
  timeoutMs: number;
  parallel: boolean;           // Rule 30: can run in parallel with same-order steps
  fn: () => void | Promise<void>;
  status: ShutdownStepStatus;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Shutdown Sequencer
// ---------------------------------------------------------------------------

class ShutdownSequencer {
  private steps: ShutdownStep[] = [];
  private totalStartTime = 0;
  private totalEndTime = 0;
  private shutdownStarted = false;
  private shutdownComplete = false;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.registerIPC();
    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Step registration (lower order = runs first)
  // ---------------------------------------------------------------------------

  addStep(
    name: string,
    order: number,
    critical: boolean,
    timeoutMs: number,
    fn: () => void | Promise<void>,
    parallel: boolean = false
  ): void {
    this.steps.push({
      name,
      order,
      critical,
      timeoutMs,
      parallel,
      fn,
      status: 'pending',
      durationMs: 0,
    });
    // Keep sorted by order
    this.steps.sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  async runAll(): Promise<{ success: boolean; totalMs: number; failedSteps: string[] }> {
    if (this.shutdownStarted) {
      log.warn('[ShutdownSequencer] Shutdown already in progress');
      return { success: false, totalMs: 0, failedSteps: [] };
    }

    this.shutdownStarted = true;
    this.totalStartTime = performance.now();
    const failedSteps: string[] = [];

    log.info(`[ShutdownSequencer] Starting shutdown sequence: ${this.steps.length} steps`);

    // Rule 30: Group steps by order for parallel execution
    const orderGroups = new Map<number, ShutdownStep[]>();
    for (const step of this.steps) {
      if (!orderGroups.has(step.order)) {
        orderGroups.set(step.order, []);
      }
      orderGroups.get(step.order)!.push(step);
    }

    const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => a - b);

    for (const order of sortedOrders) {
      const group = orderGroups.get(order)!;
      const parallelSteps = group.filter(s => s.parallel);
      const serialSteps = group.filter(s => !s.parallel);

      // Run serial steps first
      for (const step of serialSteps) {
        await this.runSingleStep(step, failedSteps);
      }

      // Then run parallel steps concurrently
      if (parallelSteps.length > 0) {
        await Promise.allSettled(
          parallelSteps.map(step => this.runSingleStep(step, failedSteps))
        );
      }
    }

    this.totalEndTime = performance.now();
    this.shutdownComplete = true;
    const totalMs = this.totalEndTime - this.totalStartTime;

    log.info(`[ShutdownSequencer] Shutdown complete: ${totalMs.toFixed(1)}ms (${failedSteps.length} failures)`);

    return {
      success: failedSteps.length === 0,
      totalMs,
      failedSteps,
    };
  }

  private async runSingleStep(step: ShutdownStep, failedSteps: string[]): Promise<void> {
    const stepStart = performance.now();
    step.status = 'running';

    try {
      await this.runWithTimeout(step.fn, step.timeoutMs, step.name);
      step.status = 'completed';
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        step.status = 'timed-out';
        step.error = `Timed out after ${step.timeoutMs}ms`;
        log.warn(`[ShutdownSequencer] Step timed out: ${step.name} (${step.timeoutMs}ms)`);
      } else {
        step.status = 'failed';
        step.error = err?.message ?? String(err);
        log.warn(`[ShutdownSequencer] Step failed: ${step.name}:`, err);
      }
      failedSteps.push(step.name);
    }

    step.durationMs = performance.now() - stepStart;
  }

  private async runWithTimeout(fn: () => void | Promise<void>, timeoutMs: number, name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error('TIMEOUT'));
        }
      }, timeoutMs);

      Promise.resolve(fn())
        .then(() => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve();
          }
        })
        .catch((err) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getReport(): {
    totalMs: number;
    started: boolean;
    complete: boolean;
    steps: Array<{
      name: string;
      order: number;
      status: ShutdownStepStatus;
      durationMs: number;
      critical: boolean;
      error?: string;
    }>;
  } {
    return {
      totalMs: this.totalEndTime - this.totalStartTime,
      started: this.shutdownStarted,
      complete: this.shutdownComplete,
      steps: this.steps.map(s => ({
        name: s.name,
        order: s.order,
        status: s.status,
        durationMs: s.durationMs,
        critical: s.critical,
        error: s.error,
      })),
    };
  }

  isShutdownStarted(): boolean {
    return this.shutdownStarted;
  }

  isShutdownComplete(): boolean {
    return this.shutdownComplete;
  }

  // ---------------------------------------------------------------------------
  // IPC
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('shutdown-sequencer:report', () => {
      return this.getReport();
    });

    ipcMain.handle('shutdown-sequencer:status', () => {
      return {
        started: this.shutdownStarted,
        complete: this.shutdownComplete,
        stepCount: this.steps.length,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.steps = [];
    this.initialized = false;
  }
}

export const shutdownSequencer = new ShutdownSequencer();

export function initializeShutdownSequencer(): void {
  shutdownSequencer.initialize();
}

export function shutdownShutdownSequencer(): void {
  shutdownSequencer.shutdown();
}
