// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Background Performance Manager
// Phase 9: Internal Optimization & Background Efficiency
// ===========================================================================
// This module manages Dex's own resource usage, NOT the system.
// It operates silently, yielding under pressure, batching work,
// and maintaining near-zero CPU usage when idle.
// ===========================================================================

export type DexStatus = 'idle' | 'active' | 'busy' | 'yielding';

interface PerformanceState {
  status: DexStatus;
  cpuUsage: number;
  memoryUsage: number;
  lastActivity: number;
  backgroundTasksQueued: number;
  backgroundTasksRunning: number;
  isYielding: boolean;
  optimizationEnabled: boolean;
}

interface BackgroundTask {
  id: string;
  name: string;
  priority: 'low' | 'normal' | 'high';
  execute: () => Promise<void>;
  addedAt: number;
  /** Age-boosted effective priority score (lower = runs first) */
  effectivePriority?: number;
}

type StateListener = (state: PerformanceState) => void;

class PerformanceManager {
  private state: PerformanceState = {
    status: 'idle',
    cpuUsage: 0,
    memoryUsage: 0,
    lastActivity: Date.now(),
    backgroundTasksQueued: 0,
    backgroundTasksRunning: 0,
    isYielding: false,
    optimizationEnabled: true,
  };

  private taskQueue: BackgroundTask[] = [];
  private runningTasks = 0;
  private maxConcurrentTasks = 2;
  private listeners: Set<StateListener> = new Set();
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  // Configuration
  private config = {
    idleThresholdMs: 5000,        // Consider idle after 5s of no activity
    yieldThresholdCpu: 70,        // Yield when system CPU > 70%
    maxMemoryMB: 150,             // Target max memory for Dex
    batchDelayMs: 100,            // Delay between batch processing
    monitorIntervalMs: 10000,     // Check system pressure every 10s
    taskTimeoutMs: 30000,         // Abort tasks that run longer than 30s
    staleTaskAgeMs: 120000,       // Drop tasks older than 2 min if never started
    agingIntervalMs: 15000,       // Re-sort queue with aging every 15s
  };

  private agingTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startMonitoring();
    // Periodically age low-priority tasks so they eventually run
    this.agingTimer = setInterval(() => this.ageQueuedTasks(), this.config.agingIntervalMs);
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  getState(): PerformanceState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setOptimizationEnabled(enabled: boolean): void {
    this.state.optimizationEnabled = enabled;
    this.notifyListeners();
  }

  // Record user activity to reset idle timer
  recordActivity(): void {
    this.state.lastActivity = Date.now();
    this.state.status = 'active';
    this.resetIdleTimer();
    this.notifyListeners();
  }

  // Queue a background task (will be batched and processed during idle)
  queueBackgroundTask(
    id: string,
    name: string,
    execute: () => Promise<void>,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): void {
    // Don't queue duplicates
    if (this.taskQueue.find(t => t.id === id)) return;

    this.taskQueue.push({ id, name, priority, execute, addedAt: Date.now() });
    this.sortQueue();
    this.state.backgroundTasksQueued = this.taskQueue.length;
    this.notifyListeners();
    this.processQueueIfIdle();
  }

  // Cancel a queued task
  cancelTask(id: string): void {
    this.taskQueue = this.taskQueue.filter(t => t.id !== id);
    this.state.backgroundTasksQueued = this.taskQueue.length;
    this.notifyListeners();
  }

  // Force process queue (use sparingly)
  async forceProcessQueue(): Promise<void> {
    await this.processQueue();
  }

  // Cleanup
  destroy(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.processingInterval) clearInterval(this.processingInterval);
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    if (this.agingTimer) clearInterval(this.agingTimer);
    this.listeners.clear();
  }

  /** Return current queue snapshot for diagnostics */
  getQueueSnapshot(): Array<{ id: string; name: string; priority: string; ageMs: number }> {
    const now = Date.now();
    return this.taskQueue.map(t => ({
      id: t.id,
      name: t.name,
      priority: t.priority,
      ageMs: now - t.addedAt,
    }));
  }

  // -------------------------------------------------------------------------
  // INTERNAL METHODS
  // -------------------------------------------------------------------------

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.state));
  }

  private startMonitoring(): void {
    // Monitor system pressure periodically
    this.monitorInterval = setInterval(() => {
      this.checkSystemPressure();
    }, this.config.monitorIntervalMs);

    // Start idle timer
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      this.enterIdleState();
    }, this.config.idleThresholdMs);
  }

  private enterIdleState(): void {
    this.state.status = 'idle';
    this.notifyListeners();
    this.processQueueIfIdle();
  }

  private async checkSystemPressure(): Promise<void> {
    if (!this.state.optimizationEnabled) return;

    try {
      // Check system stats via Dex API
      if (window.dex?.power?.getStats) {
        const stats = await window.dex.power.getStats();
        this.state.cpuUsage = stats.cpu?.usage || 0;
        this.state.memoryUsage = stats.memory?.percent || 0;

        // Yield under pressure
        if (this.state.cpuUsage > this.config.yieldThresholdCpu) {
          this.state.isYielding = true;
          this.state.status = 'yielding';
          // Under pressure: reduce concurrency
          this.maxConcurrentTasks = 1;
           // Notify the app layer so heavy components can shed load
           window.dispatchEvent(new CustomEvent('dex-memory-pressure', { detail: { cpu: this.state.cpuUsage, memory: this.state.memoryUsage } }));
        } else if (this.state.isYielding && this.state.cpuUsage < this.config.yieldThresholdCpu - 10) {
          // Resume when pressure drops (with hysteresis)
          this.state.isYielding = false;
          this.maxConcurrentTasks = 2;
          if (this.runningTasks === 0) {
            this.state.status = 'idle';
          }
        } else if (!this.state.isYielding && this.state.cpuUsage < 30) {
          // Low CPU — allow slightly higher concurrency
          this.maxConcurrentTasks = 3;
        } else {
          this.maxConcurrentTasks = 2;
        }

        this.notifyListeners();
      }
    } catch (err) {
      // Silent fail - don't disrupt user
    }
  }

  private sortQueue(): void {
    // Use effectivePriority if set (modified by aging), otherwise base priority
    const baseOrder = { high: 0, normal: 100, low: 200 };
    this.taskQueue.sort((a, b) => {
      const aScore = a.effectivePriority ?? baseOrder[a.priority];
      const bScore = b.effectivePriority ?? baseOrder[b.priority];
      if (aScore !== bScore) return aScore - bScore;
      return a.addedAt - b.addedAt;
    });
  }

  private ageQueuedTasks(): void {
    const now = Date.now();
    const baseOrder = { high: 0, normal: 100, low: 200 };
    let changed = false;

    // Drop stale tasks that have never started and are too old
    const before = this.taskQueue.length;
    this.taskQueue = this.taskQueue.filter(t => {
      const age = now - t.addedAt;
      if (age > this.config.staleTaskAgeMs && t.priority === 'low') {
        console.warn(`[PerformanceManager] Dropping stale task "${t.name}" (age: ${Math.round(age / 1000)}s)`);
        return false;
      }
      return true;
    });
    if (this.taskQueue.length !== before) changed = true;

    // Age remaining tasks: every 15s reduce their effective priority score
    for (const task of this.taskQueue) {
      const age = now - task.addedAt;
      const base = baseOrder[task.priority];
      // Reduce score by 10 per 15s of waiting, capped at near-high priority
      const bonus = Math.min(base, Math.floor(age / this.config.agingIntervalMs) * 10);
      task.effectivePriority = base - bonus;
      changed = true;
    }

    if (changed) {
      this.sortQueue();
      this.state.backgroundTasksQueued = this.taskQueue.length;
      this.notifyListeners();
    }
  }

  private async processQueueIfIdle(): Promise<void> {
    if (this.state.status === 'idle' && !this.state.isYielding) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (!this.state.optimizationEnabled) return;
    if (this.state.isYielding) return;
    if (this.taskQueue.length === 0) return;
    if (this.runningTasks >= this.maxConcurrentTasks) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    this.runningTasks++;
    this.state.backgroundTasksQueued = this.taskQueue.length;
    this.state.backgroundTasksRunning = this.runningTasks;
    this.state.status = 'busy';
    this.notifyListeners();

    try {
      // Enforce task timeout via Promise.race
      await Promise.race([
        task.execute(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`Task "${task.name}" timed out after ${this.config.taskTimeoutMs}ms`)), this.config.taskTimeoutMs)
        ),
      ]);
    } catch (err) {
      console.warn(`Background task "${task.name}" failed:`, err);
    } finally {
      this.runningTasks--;
      this.state.backgroundTasksRunning = this.runningTasks;
      
      if (this.runningTasks === 0 && this.taskQueue.length === 0) {
        this.state.status = 'idle';
      }
      this.notifyListeners();

      // Process next task with delay (to avoid blocking)
      if (this.taskQueue.length > 0) {
        setTimeout(() => this.processQueue(), this.config.batchDelayMs);
      }
    }
  }
}

// Singleton instance
export const performanceManager = new PerformanceManager();

// React hook for subscribing to performance state
export function usePerformanceState(): PerformanceState {
  const [state, setState] = React.useState<PerformanceState>(performanceManager.getState());

  React.useEffect(() => {
    return performanceManager.subscribe(setState);
  }, []);

  return state;
}

// Import React for the hook
import React from 'react';
