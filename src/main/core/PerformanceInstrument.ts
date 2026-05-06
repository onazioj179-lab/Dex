// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Performance Instrument
// ==========================================================================
// Rules 43-45: Performance Monitoring
// 43. Every operation on critical/fast paths timed via performance.now()
// 44. Budget violations logged to dedicated performance.log
// 45. Sampling mode: 1-in-10 for hot paths to reduce overhead
// Also provides data for the Performance tab in Status dashboard.
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getBudget, getBudgetMs, OperationBudget } from '../utils/performanceBudgets';

interface Violation {
  operation: string;
  tier: string;
  budgetMs: number;
  actualMs: number;
  timestamp: number;
  context?: string;
}

// Rule 45: Sampling configuration
interface SamplingConfig {
  enabled: boolean;
  rate: number;   // 1 in N calls sampled
  hotPaths: Set<string>;
}

class PerformanceInstrument {
  private violations: Violation[] = [];
  private logPath: string = '';
  private logStream: fs.WriteStream | null = null;
  private sessionSlowest: Violation[] = [];
  private initialized = false;

  // Rule 45: Sampling state
  private sampling: SamplingConfig = {
    enabled: true,
    rate: 10,  // 1-in-10 for hot paths
    hotPaths: new Set([
      'ipc-roundtrip',
      'render-frame',
      'event-dispatch',
      'cache-lookup',
      'kv-read',
      'kv-write',
    ]),
  };
  private sampleCounters = new Map<string, number>();

  // Aggregate metrics (Rule 43 extension)
  private operationCounts = new Map<string, number>();
  private operationTotalMs = new Map<string, number>();
  private operationMaxMs = new Map<string, number>();

  initialize(): void {
    if (this.initialized) return;
    try {
      const userData = app.getPath('userData');
      const logDir = path.join(userData, 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      this.logPath = path.join(logDir, 'performance.log');

      // Rule 44: Rotate log if >5MB
      try {
        const stat = fs.statSync(this.logPath);
        if (stat.size > 5 * 1024 * 1024) {
          const rotated = this.logPath + '.1';
          try { fs.unlinkSync(rotated); } catch { /* ok */ }
          fs.renameSync(this.logPath, rotated);
        }
      } catch { /* file doesn't exist yet */ }

      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
      this.logStream.write(`\n--- Session started ${new Date().toISOString()} ---\n`);
    } catch {
      // Log directory unavailable; instrument silently continues
    }
    this.initialized = true;
  }

  // Rule 45: Should we sample this operation?
  private shouldSample(operationName: string): boolean {
    if (!this.sampling.enabled) return true;
    if (!this.sampling.hotPaths.has(operationName)) return true; // always measure non-hot paths

    const count = (this.sampleCounters.get(operationName) ?? 0) + 1;
    this.sampleCounters.set(operationName, count);
    return count % this.sampling.rate === 0;
  }

  // Measure a synchronous operation and log if it exceeds its budget
  measure<T>(operationName: string, fn: () => T, context?: string): T {
    if (!this.shouldSample(operationName)) return fn();
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    this.record(operationName, duration, context);
    return result;
  }

  // Measure an async operation
  async measureAsync<T>(operationName: string, fn: () => Promise<T>, context?: string): Promise<T> {
    if (!this.shouldSample(operationName)) return fn();
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    this.record(operationName, duration, context);
    return result;
  }

  // Manual start/end pair for operations that span callbacks
  startMark(operationName: string): (context?: string) => void {
    const start = performance.now();
    return (context?: string) => {
      const duration = performance.now() - start;
      this.record(operationName, duration, context);
    };
  }

  // Rule 43: Record operation metrics + check budget
  private record(operationName: string, actualMs: number, context?: string): void {
    // Aggregate tracking
    this.operationCounts.set(operationName, (this.operationCounts.get(operationName) ?? 0) + 1);
    this.operationTotalMs.set(operationName, (this.operationTotalMs.get(operationName) ?? 0) + actualMs);
    const prevMax = this.operationMaxMs.get(operationName) ?? 0;
    if (actualMs > prevMax) this.operationMaxMs.set(operationName, actualMs);

    this.check(operationName, actualMs, context);
  }

  private check(operationName: string, actualMs: number, context?: string): void {
    const budget = getBudget(operationName);
    if (!budget) return;
    if (actualMs <= budget.budgetMs) return;

    const violation: Violation = {
      operation: operationName,
      tier: budget.tier,
      budgetMs: budget.budgetMs,
      actualMs: Math.round(actualMs * 100) / 100,
      timestamp: Date.now(),
      context,
    };

    this.violations.push(violation);
    if (this.violations.length > 5000) this.violations.splice(0, this.violations.length - 5000);

    // Track session slowest 10
    this.sessionSlowest.push(violation);
    this.sessionSlowest.sort((a, b) => b.actualMs - a.actualMs);
    if (this.sessionSlowest.length > 10) this.sessionSlowest.length = 10;

    // Rule 44: Write to performance log (non-blocking)
    if (this.logStream) {
      const line = `[${new Date(violation.timestamp).toISOString()}] VIOLATION ${violation.operation} ` +
        `budget=${violation.budgetMs}ms actual=${violation.actualMs}ms tier=${violation.tier}` +
        (violation.context ? ` ctx=${violation.context}` : '') + '\n';
      this.logStream.write(line);
    }
  }

  // Get the slowest 10 operations from the current session
  getSlowest10(): Violation[] {
    return [...this.sessionSlowest];
  }

  // Get all violations from this session
  getAllViolations(): Violation[] {
    return [...this.violations];
  }

  // Get violation count by tier
  getViolationCounts(): Record<string, number> {
    const counts: Record<string, number> = { critical: 0, fast: 0, standard: 0, background: 0 };
    for (const v of this.violations) {
      counts[v.tier] = (counts[v.tier] || 0) + 1;
    }
    return counts;
  }

  // Rule 43: Get aggregate operation metrics
  getOperationMetrics(): Array<{ name: string; count: number; avgMs: number; maxMs: number }> {
    const metrics: Array<{ name: string; count: number; avgMs: number; maxMs: number }> = [];
    for (const [name, count] of this.operationCounts) {
      const totalMs = this.operationTotalMs.get(name) ?? 0;
      const maxMs = this.operationMaxMs.get(name) ?? 0;
      metrics.push({
        name,
        count,
        avgMs: Math.round((totalMs / count) * 100) / 100,
        maxMs: Math.round(maxMs * 100) / 100,
      });
    }
    return metrics.sort((a, b) => b.maxMs - a.maxMs);
  }

  // Get a summary for the Status dashboard Performance tab
  getDashboardData(): {
    slowest10: Violation[];
    totalViolations: number;
    countsByTier: Record<string, number>;
    sessionUptime: number;
    operationMetrics: Array<{ name: string; count: number; avgMs: number; maxMs: number }>;
  } {
    return {
      slowest10: this.getSlowest10(),
      totalViolations: this.violations.length,
      countsByTier: this.getViolationCounts(),
      sessionUptime: process.uptime() * 1000,
      operationMetrics: this.getOperationMetrics().slice(0, 20),
    };
  }

  // Rule 45: Configure sampling
  setSamplingRate(rate: number): void {
    this.sampling.rate = Math.max(1, rate);
  }

  addHotPath(name: string): void {
    this.sampling.hotPaths.add(name);
  }

  shutdown(): void {
    if (this.logStream) {
      this.logStream.write(`--- Session ended ${new Date().toISOString()} ---\n`);
      this.logStream.end();
      this.logStream = null;
    }
  }
}

export const performanceInstrument = new PerformanceInstrument();

export function initializePerformanceInstrument(): void {
  performanceInstrument.initialize();
}

export function shutdownPerformanceInstrument(): void {
  performanceInstrument.shutdown();
}
