// ═══════════════════════════════════════════════════════════════════════════
// DEX - Background Performance Manager
// Phase 9: Internal Optimization & Background Efficiency
// ═══════════════════════════════════════════════════════════════════════════
// This module manages Dex's own resource usage, NOT the system.
// It operates silently, yielding under pressure, batching work,
// and maintaining near-zero CPU usage when idle.
// ═══════════════════════════════════════════════════════════════════════════

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
  };

  constructor() {
    this.startMonitoring();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

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
    this.listeners.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL METHODS
  // ─────────────────────────────────────────────────────────────────────────

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
        } else if (this.state.isYielding && this.state.cpuUsage < this.config.yieldThresholdCpu - 10) {
          // Resume when pressure drops (with hysteresis)
          this.state.isYielding = false;
          if (this.runningTasks === 0) {
            this.state.status = 'idle';
          }
        }

        this.notifyListeners();
      }
    } catch (err) {
      // Silent fail - don't disrupt user
    }
  }

  private sortQueue(): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    this.taskQueue.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.addedAt - b.addedAt;
    });
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
      await task.execute();
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
