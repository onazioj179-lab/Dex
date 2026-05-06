// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Process Guard
// ==========================================================================
// Rules 46-50: Process & Resource Management
// 46. Single-instance lock (already in main.ts via app.requestSingleInstanceLock)
// 47. Child process (Python) lifecycle managed with max restart policy
// 48. Zombie process detection and cleanup
// 49. Crashed worker auto-restart (delegated to ThreadOrchestrator Rule 4)
// 50. Resource budget per subsystem enforced by ResourceGovernor
// ==========================================================================

import * as log from 'electron-log';
import { ChildProcess, spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagedProcess {
  name: string;
  process: ChildProcess | null;
  command: string;
  args: string[];
  restartCount: number;
  maxRestarts: number;
  restartWindowMs: number;
  restartTimestamps: number[];
  lastExitCode: number | null;
  started: boolean;
  pid: number | null;
}

// ---------------------------------------------------------------------------
// Process Guard
// ---------------------------------------------------------------------------

class ProcessGuard {
  private processes = new Map<string, ManagedProcess>();
  private zombieCheckInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    // Rule 48: Check for zombie processes every 30s
    this.zombieCheckInterval = setInterval(() => this.checkForZombies(), 30000);

    this.initialized = true;
    log.info('[ProcessGuard] Initialized (Rules 46-50)');
  }

  // ---------------------------------------------------------------------------
  // Rule 47: Managed child process lifecycle
  // ---------------------------------------------------------------------------

  registerProcess(
    name: string,
    command: string,
    args: string[],
    maxRestarts: number = 3,
    restartWindowMs: number = 300000
  ): void {
    this.processes.set(name, {
      name,
      process: null,
      command,
      args,
      restartCount: 0,
      maxRestarts,
      restartWindowMs,
      restartTimestamps: [],
      lastExitCode: null,
      started: false,
      pid: null,
    });
  }

  startProcess(name: string): boolean {
    const managed = this.processes.get(name);
    if (!managed) return false;
    if (managed.started) return true;

    try {
      const proc = spawn(managed.command, managed.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      managed.process = proc;
      managed.started = true;
      managed.pid = proc.pid ?? null;

      proc.on('exit', (code) => {
        managed.lastExitCode = code;
        managed.started = false;
        managed.pid = null;
        log.info(`[ProcessGuard] Process ${name} exited with code ${code}`);

        // Rule 47: Auto-restart if within limits
        if (code !== 0) {
          this.autoRestart(name);
        }
      });

      proc.on('error', (err) => {
        log.warn(`[ProcessGuard] Process ${name} error:`, err.message);
        managed.started = false;
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) log.debug(`[ProcessGuard:${name}:stderr] ${msg.slice(0, 200)}`);
      });

      log.info(`[ProcessGuard] Started process ${name} (PID: ${managed.pid})`);
      return true;
    } catch (err: any) {
      log.error(`[ProcessGuard] Failed to start ${name}:`, err.message);
      return false;
    }
  }

  private autoRestart(name: string): void {
    const managed = this.processes.get(name);
    if (!managed) return;

    const now = Date.now();
    // Prune old restart timestamps
    managed.restartTimestamps = managed.restartTimestamps.filter(
      ts => now - ts < managed.restartWindowMs
    );

    if (managed.restartTimestamps.length >= managed.maxRestarts) {
      log.error(`[ProcessGuard] Process ${name} exceeded max restarts (${managed.maxRestarts}/${managed.restartWindowMs / 60000}min)`);
      return;
    }

    managed.restartCount++;
    managed.restartTimestamps.push(now);
    log.info(`[ProcessGuard] Auto-restarting ${name} (attempt ${managed.restartCount})`);
    this.startProcess(name);
  }

  stopProcess(name: string): void {
    const managed = this.processes.get(name);
    if (!managed || !managed.process) return;

    try {
      managed.process.kill('SIGTERM');
      // Give it 5s then force kill
      setTimeout(() => {
        if (managed.started && managed.process) {
          log.warn(`[ProcessGuard] Force killing ${name}`);
          managed.process.kill('SIGKILL');
        }
      }, 5000);
    } catch {
      // Process already dead
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 48: Zombie detection
  // ---------------------------------------------------------------------------

  private checkForZombies(): void {
    for (const [name, managed] of this.processes) {
      if (managed.started && managed.process) {
        // Check if process is actually alive by checking if kill(0) succeeds
        try {
          if (managed.process.pid) {
            process.kill(managed.process.pid, 0);
          }
        } catch {
          // Process doesn't exist anymore -- zombie detected
          log.warn(`[ProcessGuard] Rule 48: Zombie detected for ${name} (PID: ${managed.pid})`);
          managed.started = false;
          managed.process = null;
          managed.pid = null;
          this.autoRestart(name);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getProcessStatus(): Record<string, {
    running: boolean;
    pid: number | null;
    restartCount: number;
    lastExitCode: number | null;
  }> {
    const status: Record<string, any> = {};
    for (const [name, managed] of this.processes) {
      status[name] = {
        running: managed.started,
        pid: managed.pid,
        restartCount: managed.restartCount,
        lastExitCode: managed.lastExitCode,
      };
    }
    return status;
  }

  isRunning(name: string): boolean {
    return this.processes.get(name)?.started ?? false;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async stopAll(): Promise<void> {
    for (const name of this.processes.keys()) {
      this.stopProcess(name);
    }
    // Wait a moment for graceful exits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  shutdown(): void {
    if (this.zombieCheckInterval) {
      clearInterval(this.zombieCheckInterval);
      this.zombieCheckInterval = null;
    }
    // Force kill all remaining
    for (const [, managed] of this.processes) {
      if (managed.process) {
        try { managed.process.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }
    this.processes.clear();
    this.initialized = false;
    log.info('[ProcessGuard] Shutdown');
  }
}

export const processGuard = new ProcessGuard();

export function initializeProcessGuard(): void {
  processGuard.initialize();
}

export function shutdownProcessGuard(): void {
  processGuard.shutdown();
}
