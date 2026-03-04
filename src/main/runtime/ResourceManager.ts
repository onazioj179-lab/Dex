// ═══════════════════════════════════════════════════════════════════════════
// DEX - Resource Manager
// Phase 28: Backend Architecture Refinement
// CPU and memory self-limits, background task throttling, pressure handling
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { powerMonitor } from 'electron';
import log from 'electron-log';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ResourcePressure = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type PowerState = 'ac' | 'battery' | 'low-battery' | 'charging';
export type SystemState = 'active' | 'idle' | 'suspended';

export interface ResourceLimits {
  maxHeapMB: number;
  maxConcurrentTasks: number;
  maxBackgroundTasks: number;
  cpuThrottleThreshold: number;  // 0-100
  memoryThrottleThreshold: number; // 0-100
}

export interface ResourceUsage {
  timestamp: number;
  cpu: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
  eventLoopLag: number;
  activeHandles: number;
}

export interface ResourceBudget {
  name: string;
  allocated: number;
  used: number;
  unit: string;
}

export interface ThrottleState {
  isThrottled: boolean;
  reason?: string;
  level: number; // 0-1, 1 = full throttle
  since?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ResourceManagerClass extends EventEmitter {
  // State
  private powerState: PowerState = 'ac';
  private systemState: SystemState = 'active';
  private pressure: ResourcePressure = 'none';
  private throttleState: ThrottleState = { isThrottled: false, level: 0 };
  
  // Usage tracking
  private usageHistory: ResourceUsage[] = [];
  private maxHistorySize = 60; // 1 minute at 1s intervals
  private lastEventLoopTime = Date.now();
  
  // Limits - MAXIMUM PERFORMANCE for instant loading
  private limits: ResourceLimits = {
    maxHeapMB: 2048,
    maxConcurrentTasks: 16,
    maxBackgroundTasks: 8,
    cpuThrottleThreshold: 95,
    memoryThrottleThreshold: 95,
  };

  // Budgets by subsystem
  private budgets: Map<string, ResourceBudget> = new Map();
  
  // Intervals
  private monitorInterval: NodeJS.Timeout | null = null;
  private eventLoopInterval: NodeJS.Timeout | null = null;
  
  // Configuration - MAXIMUM PERFORMANCE for instant loading
  private config = {
    monitorIntervalMs: 30000,     // Check every 30s - less overhead
    eventLoopCheckMs: 15000,      // Event loop every 15s
    idleThresholdMs: 30000,
    pressureCheckCount: 10,
    cleanupThresholdMB: 2048,
  };

  // Last activity timestamp
  private lastActivity = Date.now();

  constructor() {
    super();
    this.setMaxListeners(50);
    this.setupPowerMonitoring();
    this.initializeBudgets();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.monitorInterval) return;
    
    // Start resource monitoring
    this.monitorInterval = setInterval(() => {
      this.collectUsage();
      this.evaluatePressure();
      this.checkIdleState();
    }, this.config.monitorIntervalMs);

    // Start event loop lag monitoring
    this.eventLoopInterval = setInterval(() => {
      this.measureEventLoopLag();
    }, this.config.eventLoopCheckMs);

    log.info('[ResourceManager] Started');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.eventLoopInterval) {
      clearInterval(this.eventLoopInterval);
      this.eventLoopInterval = null;
    }

    log.info('[ResourceManager] Stopped');
    this.emit('stopped');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUDGET MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  private initializeBudgets(): void {
    this.budgets.set('workflow', { name: 'Workflow Engine', allocated: 128, used: 0, unit: 'MB' });
    this.budgets.set('action', { name: 'Action Engine', allocated: 64, used: 0, unit: 'MB' });
    this.budgets.set('python', { name: 'Python Executor', allocated: 256, used: 0, unit: 'MB' });
    this.budgets.set('cache', { name: 'Data Cache', allocated: 128, used: 0, unit: 'MB' });
    this.budgets.set('search', { name: 'Search Index', allocated: 64, used: 0, unit: 'MB' });
  }

  /**
   * Request resource allocation for a subsystem
   */
  requestBudget(subsystem: string, amount: number): boolean {
    const budget = this.budgets.get(subsystem);
    if (!budget) {
      log.warn(`[ResourceManager] Unknown subsystem: ${subsystem}`);
      return false;
    }

    if (budget.used + amount > budget.allocated) {
      log.warn(`[ResourceManager] Budget exceeded for ${subsystem}: ${budget.used + amount}/${budget.allocated}`);
      this.emit('budgetExceeded', { subsystem, requested: amount, available: budget.allocated - budget.used });
      return false;
    }

    budget.used += amount;
    return true;
  }

  /**
   * Release resource allocation
   */
  releaseBudget(subsystem: string, amount: number): void {
    const budget = this.budgets.get(subsystem);
    if (budget) {
      budget.used = Math.max(0, budget.used - amount);
    }
  }

  /**
   * Get current budgets
   */
  getBudgets(): ResourceBudget[] {
    return Array.from(this.budgets.values());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // THROTTLING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get current throttle level (0-1)
   */
  getThrottleLevel(): number {
    return this.throttleState.level;
  }

  /**
   * Check if system should yield
   */
  shouldYield(): boolean {
    return this.throttleState.level > 0.5;
  }

  /**
   * Get recommended concurrency based on pressure
   */
  getRecommendedConcurrency(): number {
    const base = this.limits.maxConcurrentTasks;
    
    switch (this.pressure) {
      case 'critical': return 1;
      case 'high': return Math.max(1, Math.floor(base * 0.25));
      case 'medium': return Math.max(1, Math.floor(base * 0.5));
      case 'low': return Math.max(1, Math.floor(base * 0.75));
      default: return base;
    }
  }

  /**
   * Get recommended background concurrency
   */
  getBackgroundConcurrency(): number {
    if (this.powerState === 'low-battery') return 0;
    if (this.powerState === 'battery') return 1;
    
    switch (this.pressure) {
      case 'critical': return 0;
      case 'high': return 0;
      case 'medium': return 1;
      default: return this.limits.maxBackgroundTasks;
    }
  }

  private updateThrottle(): void {
    const previousState = { ...this.throttleState };
    
    // Calculate throttle level based on pressure
    let level = 0;
    let reason: string | undefined;
    
    switch (this.pressure) {
      case 'critical':
        level = 1.0;
        reason = 'Critical resource pressure';
        break;
      case 'high':
        level = 0.75;
        reason = 'High resource pressure';
        break;
      case 'medium':
        level = 0.5;
        reason = 'Moderate resource pressure';
        break;
      case 'low':
        level = 0.25;
        reason = 'Low resource pressure';
        break;
      default:
        level = 0;
    }

    // Increase throttle on battery
    if (this.powerState === 'battery') {
      level = Math.min(1, level + 0.25);
      reason = reason ? `${reason} (on battery)` : 'On battery power';
    } else if (this.powerState === 'low-battery') {
      level = 1.0;
      reason = 'Low battery';
    }

    this.throttleState = {
      isThrottled: level > 0,
      level,
      reason,
      since: level > 0 && !previousState.isThrottled ? Date.now() : previousState.since,
    };

    if (previousState.level !== level) {
      log.info(`[ResourceManager] Throttle: ${(level * 100).toFixed(0)}%${reason ? ` (${reason})` : ''}`);
      this.emit('throttleChanged', this.throttleState);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // USAGE COLLECTION
  // ─────────────────────────────────────────────────────────────────────────

  private collectUsage(): void {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    
    const usage: ResourceUsage = {
      timestamp: Date.now(),
      cpu: this.getCpuUsage(),
      memory: {
        heapUsed: memoryUsage.heapUsed / (1024 * 1024),
        heapTotal: memoryUsage.heapTotal / (1024 * 1024),
        external: memoryUsage.external / (1024 * 1024),
        rss: memoryUsage.rss / (1024 * 1024),
        percentUsed: (memoryUsage.heapUsed / totalMemory) * 100,
      },
      eventLoopLag: this.getEventLoopLag(),
      activeHandles: (process as any)._getActiveHandles?.()?.length ?? 0,
    };

    this.usageHistory.push(usage);
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory.shift();
    }

    this.emit('usageCollected', usage);
  }

  private getCpuUsage(): number {
    const usage = process.cpuUsage();
    // Rough approximation - returns percentage
    const total = usage.user + usage.system;
    return Math.min(100, total / 1000000); // Convert microseconds
  }

  private measureEventLoopLag(): void {
    const now = Date.now();
    const expected = this.config.eventLoopCheckMs;
    const actual = now - this.lastEventLoopTime;
    this.lastEventLoopTime = now;
    
    // Store lag (actual - expected should be ~0)
    const lag = Math.max(0, actual - expected);
    // Only log significant lag (>500ms) to reduce noise
    if (lag > 500) {
      log.warn(`[ResourceManager] Significant event loop lag: ${lag}ms`);
    }
  }

  private getEventLoopLag(): number {
    // Simple approximation using timer accuracy
    const now = Date.now();
    const expected = this.config.eventLoopCheckMs;
    const actual = now - this.lastEventLoopTime;
    return Math.max(0, actual - expected);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRESSURE EVALUATION
  // ─────────────────────────────────────────────────────────────────────────

  private evaluatePressure(): void {
    if (this.usageHistory.length < this.config.pressureCheckCount) return;
    
    const recent = this.usageHistory.slice(-this.config.pressureCheckCount);
    const avgMemory = recent.reduce((sum, u) => sum + u.memory.heapUsed, 0) / recent.length;
    const avgCpu = recent.reduce((sum, u) => sum + u.cpu, 0) / recent.length;
    const avgLag = recent.reduce((sum, u) => sum + u.eventLoopLag, 0) / recent.length;
    
    let newPressure: ResourcePressure = 'none';
    
    // Check memory pressure
    const memoryPercent = (avgMemory / this.limits.maxHeapMB) * 100;
    if (memoryPercent > 95) {
      newPressure = 'critical';
    } else if (memoryPercent > this.limits.memoryThrottleThreshold) {
      newPressure = this.maxPressure(newPressure, 'high');
    } else if (memoryPercent > 60) {
      newPressure = this.maxPressure(newPressure, 'medium');
    } else if (memoryPercent > 40) {
      newPressure = this.maxPressure(newPressure, 'low');
    }

    // Check CPU pressure
    if (avgCpu > 90) {
      newPressure = this.maxPressure(newPressure, 'high');
    } else if (avgCpu > this.limits.cpuThrottleThreshold) {
      newPressure = this.maxPressure(newPressure, 'medium');
    }

    // Check event loop lag
    if (avgLag > 200) {
      newPressure = this.maxPressure(newPressure, 'critical');
    } else if (avgLag > 100) {
      newPressure = this.maxPressure(newPressure, 'high');
    } else if (avgLag > 50) {
      newPressure = this.maxPressure(newPressure, 'medium');
    }

    // Update pressure state
    if (newPressure !== this.pressure) {
      const oldPressure = this.pressure;
      this.pressure = newPressure;
      
      log.info(`[ResourceManager] Pressure: ${oldPressure} → ${newPressure}`);
      this.emit('pressureChanged', { oldPressure, newPressure });
      
      // Trigger cleanup on high pressure
      if (this.pressureLevel(newPressure) >= this.pressureLevel('high')) {
        this.requestCleanup();
      }
    }

    // Update throttle state
    this.updateThrottle();
  }

  private maxPressure(a: ResourcePressure, b: ResourcePressure): ResourcePressure {
    return this.pressureLevel(a) >= this.pressureLevel(b) ? a : b;
  }

  private pressureLevel(pressure: ResourcePressure): number {
    const levels: Record<ResourcePressure, number> = {
      'none': 0, 'low': 1, 'medium': 2, 'high': 3, 'critical': 4
    };
    return levels[pressure];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IDLE STATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record user/system activity
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
    if (this.systemState === 'idle') {
      this.systemState = 'active';
      this.emit('systemActive');
    }
  }

  private checkIdleState(): void {
    const timeSinceActivity = Date.now() - this.lastActivity;
    
    if (this.systemState === 'active' && timeSinceActivity > this.config.idleThresholdMs) {
      this.systemState = 'idle';
      log.info('[ResourceManager] System idle');
      this.emit('systemIdle');
    }
  }

  isIdle(): boolean {
    return this.systemState === 'idle';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────

  private requestCleanup(): void {
    log.info('[ResourceManager] Requesting cleanup');
    this.emit('cleanupRequested');
    
    // Trigger GC if available
    if (global.gc) {
      log.info('[ResourceManager] Triggering garbage collection');
      global.gc();
    }
  }

  /**
   * Force immediate cleanup
   */
  forceCleanup(): void {
    log.info('[ResourceManager] Forcing cleanup');
    
    // Clear caches
    this.emit('forceCleanup');
    
    // Clear usage history
    this.usageHistory = this.usageHistory.slice(-5);
    
    // Reset budgets
    for (const budget of this.budgets.values()) {
      budget.used = 0;
    }
    
    // Trigger GC
    if (global.gc) {
      global.gc();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POWER MONITORING
  // ─────────────────────────────────────────────────────────────────────────

  private setupPowerMonitoring(): void {
    powerMonitor.on('on-ac', () => {
      this.powerState = 'ac';
      log.info('[ResourceManager] Power: AC');
      this.emit('powerStateChanged', this.powerState);
      this.updateThrottle();
    });

    powerMonitor.on('on-battery', () => {
      this.powerState = 'battery';
      log.info('[ResourceManager] Power: Battery');
      this.emit('powerStateChanged', this.powerState);
      this.updateThrottle();
    });

    powerMonitor.on('suspend', () => {
      this.systemState = 'suspended';
      log.info('[ResourceManager] System suspending');
      this.emit('systemSuspend');
    });

    powerMonitor.on('resume', () => {
      this.systemState = 'active';
      this.lastActivity = Date.now();
      log.info('[ResourceManager] System resumed');
      this.emit('systemResume');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────────────────

  getStatus(): {
    pressure: ResourcePressure;
    powerState: PowerState;
    systemState: SystemState;
    throttle: ThrottleState;
    limits: ResourceLimits;
    currentUsage: ResourceUsage | null;
  } {
    return {
      pressure: this.pressure,
      powerState: this.powerState,
      systemState: this.systemState,
      throttle: { ...this.throttleState },
      limits: { ...this.limits },
      currentUsage: this.usageHistory[this.usageHistory.length - 1] ?? null,
    };
  }

  getUsageHistory(): ResourceUsage[] {
    return [...this.usageHistory];
  }

  setLimits(limits: Partial<ResourceLimits>): void {
    this.limits = { ...this.limits, ...limits };
    log.info('[ResourceManager] Limits updated', this.limits);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const resourceManager = new ResourceManagerClass();
export default resourceManager;
