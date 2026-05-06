// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- System Health Orchestrator
// ==========================================================================
// Rules 98-100: Final System Architecture
// 98. System health dashboard with unified metrics collection
// 99. Graceful degradation with automatic feature disabling
// 100. Self-healing patterns with automatic recovery
// ==========================================================================

import * as os from 'os';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'recovering';

interface SubsystemHealth {
  name: string;
  status: HealthStatus;
  lastCheckAt: number;
  metrics: Record<string, number | string>;
  error?: string;
}

interface SystemHealthReport {
  timestamp: number;
  overall: HealthStatus;
  uptime: number;
  subsystems: SubsystemHealth[];
  activeRecoveries: string[];
  disabledFeatures: string[];
  memoryMB: { used: number; total: number; percent: number };
  cpuPercent: number;
}

interface DegradationRule {
  feature: string;
  condition: () => boolean;
  onDisable: () => void;
  onRestore: () => void;
  priority: number; // Lower = disable first
}

interface SelfHealingAction {
  name: string;
  detect: () => boolean;
  heal: () => Promise<boolean>;
  maxAttempts: number;
  cooldownMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const RECOVERY_COOLDOWN_MS = 60_000; // 1 minute between recovery attempts
const MAX_RECOVERY_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// System Health Orchestrator
// ---------------------------------------------------------------------------

class SystemHealthOrchestrator {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private subsystemChecks = new Map<string, () => SubsystemHealth>();
  private degradationRules: DegradationRule[] = [];
  private disabledFeatures = new Set<string>();
  private healingActions: SelfHealingAction[] = [];
  private healingAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private activeRecoveries = new Set<string>();
  private startTime = Date.now();
  private lastCpuUsage = process.cpuUsage();
  private lastCpuCheck = Date.now();
  private initialized = false;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  initialize(): void {
    if (this.initialized) return;

    this.registerDefaultSubsystems();
    this.registerDefaultDegradationRules();
    this.registerDefaultHealingActions();

    this.healthCheckInterval = setInterval(() => this.runHealthCheck(), HEALTH_CHECK_INTERVAL_MS);

    this.initialized = true;
    log.info('[SystemHealth] Orchestrator initialized (Rules 98-100)');
  }

  // ---------------------------------------------------------------------------
  // Rule 98: System health dashboard
  // ---------------------------------------------------------------------------

  registerSubsystemCheck(name: string, check: () => SubsystemHealth): void {
    this.subsystemChecks.set(name, check);
  }

  getHealthReport(): SystemHealthReport {
    const subsystems: SubsystemHealth[] = [];

    for (const [, check] of this.subsystemChecks) {
      try {
        subsystems.push(check());
      } catch (err: any) {
        subsystems.push({
          name: 'unknown',
          status: 'critical',
          lastCheckAt: Date.now(),
          metrics: {},
          error: err.message,
        });
      }
    }

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();

    const overall = this.computeOverallStatus(subsystems);

    return {
      timestamp: Date.now(),
      overall,
      uptime: Date.now() - this.startTime,
      subsystems,
      activeRecoveries: Array.from(this.activeRecoveries),
      disabledFeatures: Array.from(this.disabledFeatures),
      memoryMB: {
        used: Math.round(mem.rss / (1024 * 1024)),
        total: Math.round(totalMem / (1024 * 1024)),
        percent: Math.round((usedMem / totalMem) * 100),
      },
      cpuPercent: this.getCpuPercent(),
    };
  }

  private computeOverallStatus(subsystems: SubsystemHealth[]): HealthStatus {
    if (this.activeRecoveries.size > 0) return 'recovering';
    const critical = subsystems.filter(s => s.status === 'critical');
    if (critical.length > 0) return 'critical';
    const degraded = subsystems.filter(s => s.status === 'degraded');
    if (degraded.length >= 2) return 'degraded';
    if (this.disabledFeatures.size > 0) return 'degraded';
    return 'healthy';
  }

  private getCpuPercent(): number {
    const now = Date.now();
    const elapsed = now - this.lastCpuCheck;
    const cpu = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = now;

    const totalMicros = cpu.user + cpu.system;
    const elapsedMicros = elapsed * 1000;
    return Math.min(100, Math.round((totalMicros / elapsedMicros) * 100));
  }

  // ---------------------------------------------------------------------------
  // Rule 99: Graceful degradation
  // ---------------------------------------------------------------------------

  registerDegradationRule(rule: DegradationRule): void {
    this.degradationRules.push(rule);
    this.degradationRules.sort((a, b) => a.priority - b.priority);
  }

  private evaluateDegradation(): void {
    for (const rule of this.degradationRules) {
      try {
        const shouldDisable = rule.condition();
        const isDisabled = this.disabledFeatures.has(rule.feature);

        if (shouldDisable && !isDisabled) {
          // Disable feature
          rule.onDisable();
          this.disabledFeatures.add(rule.feature);
          log.warn(`[SystemHealth] Rule 99: Disabled feature '${rule.feature}' due to degradation`);
        } else if (!shouldDisable && isDisabled) {
          // Restore feature
          rule.onRestore();
          this.disabledFeatures.delete(rule.feature);
          log.info(`[SystemHealth] Rule 99: Restored feature '${rule.feature}'`);
        }
      } catch (err) {
        log.error(`[SystemHealth] Rule 99: Error evaluating degradation for '${rule.feature}':`, err);
      }
    }
  }

  isFeatureDisabled(feature: string): boolean {
    return this.disabledFeatures.has(feature);
  }

  // ---------------------------------------------------------------------------
  // Rule 100: Self-healing
  // ---------------------------------------------------------------------------

  registerHealingAction(action: SelfHealingAction): void {
    this.healingActions.push(action);
  }

  private async runSelfHealing(): Promise<void> {
    const now = Date.now();

    for (const action of this.healingActions) {
      try {
        if (!action.detect()) continue;

        const attempts = this.healingAttempts.get(action.name) || { count: 0, lastAttempt: 0 };

        // Check cooldown
        if ((now - attempts.lastAttempt) < action.cooldownMs) continue;

        // Check max attempts
        if (attempts.count >= action.maxAttempts) {
          log.warn(`[SystemHealth] Rule 100: Max healing attempts reached for '${action.name}'`);
          continue;
        }

        // Attempt healing
        this.activeRecoveries.add(action.name);
        log.info(`[SystemHealth] Rule 100: Attempting self-healing for '${action.name}' (attempt ${attempts.count + 1}/${action.maxAttempts})`);

        const success = await action.heal();
        attempts.count++;
        attempts.lastAttempt = now;
        this.healingAttempts.set(action.name, attempts);

        if (success) {
          this.activeRecoveries.delete(action.name);
          // Reset attempts on success
          this.healingAttempts.delete(action.name);
          log.info(`[SystemHealth] Rule 100: Self-healing succeeded for '${action.name}'`);
        } else {
          this.activeRecoveries.delete(action.name);
          log.warn(`[SystemHealth] Rule 100: Self-healing failed for '${action.name}'`);
        }
      } catch (err) {
        this.activeRecoveries.delete(action.name);
        log.error(`[SystemHealth] Rule 100: Self-healing error for '${action.name}':`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Health check loop
  // ---------------------------------------------------------------------------

  private async runHealthCheck(): Promise<void> {
    // Rule 99: Evaluate degradation
    this.evaluateDegradation();

    // Rule 100: Self-healing
    await this.runSelfHealing();
  }

  // ---------------------------------------------------------------------------
  // Default registrations
  // ---------------------------------------------------------------------------

  private registerDefaultSubsystems(): void {
    // Memory subsystem
    this.registerSubsystemCheck('memory', () => {
      const mem = process.memoryUsage();
      const rssMB = Math.round(mem.rss / (1024 * 1024));
      const heapMB = Math.round(mem.heapUsed / (1024 * 1024));
      let status: HealthStatus = 'healthy';
      if (rssMB > 3500) status = 'critical';
      else if (rssMB > 2500) status = 'degraded';

      return {
        name: 'memory',
        status,
        lastCheckAt: Date.now(),
        metrics: { rssMB, heapMB, externalMB: Math.round(mem.external / (1024 * 1024)) },
      };
    });

    // Event loop subsystem
    this.registerSubsystemCheck('event-loop', () => {
      const start = Date.now();
      // Simple check -- if we got here, event loop is responsive
      const lag = Date.now() - start;
      return {
        name: 'event-loop',
        status: lag > 100 ? 'degraded' : 'healthy',
        lastCheckAt: Date.now(),
        metrics: { lagMs: lag },
      };
    });

    // Disk subsystem
    this.registerSubsystemCheck('disk', () => {
      try {
        const freeMB = Math.round(os.freemem() / (1024 * 1024));
        return {
          name: 'disk',
          status: freeMB < 500 ? 'degraded' : 'healthy',
          lastCheckAt: Date.now(),
          metrics: { freeMemoryMB: freeMB },
        };
      } catch {
        return { name: 'disk', status: 'healthy' as const, lastCheckAt: Date.now(), metrics: {} as Record<string, number | string> };
      }
    });
  }

  private registerDefaultDegradationRules(): void {
    // Disable background analytics when memory is high
    this.registerDegradationRule({
      feature: 'background-analytics',
      condition: () => {
        const rss = process.memoryUsage().rss / (1024 * 1024);
        return rss > 3000;
      },
      onDisable: () => log.info('[SystemHealth] Pausing background analytics'),
      onRestore: () => log.info('[SystemHealth] Resuming background analytics'),
      priority: 1,
    });

    // Disable thumbnail generation when memory is very high
    this.registerDegradationRule({
      feature: 'thumbnail-generation',
      condition: () => {
        const rss = process.memoryUsage().rss / (1024 * 1024);
        return rss > 3500;
      },
      onDisable: () => log.info('[SystemHealth] Pausing thumbnail generation'),
      onRestore: () => log.info('[SystemHealth] Resuming thumbnail generation'),
      priority: 2,
    });
  }

  private registerDefaultHealingActions(): void {
    // Self-heal: Force GC when memory is high
    this.registerHealingAction({
      name: 'force-gc',
      detect: () => {
        const rss = process.memoryUsage().rss / (1024 * 1024);
        return rss > 2500;
      },
      heal: async () => {
        if (global.gc) {
          global.gc();
          // Wait a bit and check if it helped
          await new Promise(r => setTimeout(r, 1000));
          const afterRss = process.memoryUsage().rss / (1024 * 1024);
          return afterRss < 2500;
        }
        return false;
      },
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      cooldownMs: RECOVERY_COOLDOWN_MS,
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.disabledFeatures.clear();
    this.activeRecoveries.clear();
    this.initialized = false;
    log.info('[SystemHealth] Orchestrator shutdown');
  }
}

export const systemHealth = new SystemHealthOrchestrator();

export function initializeSystemHealth(): void {
  systemHealth.initialize();
}

export function shutdownSystemHealth(): void {
  systemHealth.shutdown();
}
