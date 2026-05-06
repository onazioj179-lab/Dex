// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Performance Budget Manager
// Phase 69: Hard-Lock Performance Ceilings
// Budget as contract, not goal - exceeding budget means rejection
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type BudgetDomain = 
  | 'cpu'
  | 'memory'
  | 'disk'
  | 'network'
  | 'render'
  | 'media'
  | 'editor'
  | 'search'
  | 'background';

export interface Budget {
  domain: BudgetDomain;
  limit: number;
  unit: string;
  current: number;
  reserved: number;
  warning: number; // Percentage of limit
  critical: number; // Percentage of limit
}

export interface BudgetRequest {
  domain: BudgetDomain;
  amount: number;
  operation: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  duration?: number; // Expected duration in ms
}

export interface BudgetResponse {
  approved: boolean;
  allocated: number;
  reservationId?: string;
  reason?: string;
  waitTime?: number; // Suggested wait time if rejected
}

export interface BudgetViolation {
  domain: BudgetDomain;
  operation: string;
  requested: number;
  available: number;
  limit: number;
  timestamp: number;
}

// ===========================================================================
// DEFAULT BUDGETS - HARD LIMITS
// ===========================================================================

const DEFAULT_BUDGETS: Record<BudgetDomain, Omit<Budget, 'current' | 'reserved'>> = {
  cpu: {
    domain: 'cpu',
    limit: 95, // Max 95% CPU - full power
    unit: 'percent',
    warning: 80,
    critical: 90
  },
  memory: {
    domain: 'memory',
    limit: 4096 * 1024 * 1024, // 4GB - generous allocation
    unit: 'bytes',
    warning: 80,
    critical: 95
  },
  disk: {
    domain: 'disk',
    limit: 50 * 1024 * 1024, // 50MB/s IO
    unit: 'bytes/s',
    warning: 60,
    critical: 80
  },
  network: {
    domain: 'network',
    limit: 10 * 1024 * 1024, // 10MB/s
    unit: 'bytes/s',
    warning: 70,
    critical: 90
  },
  render: {
    domain: 'render',
    limit: 16, // 16ms frame budget (60fps)
    unit: 'ms',
    warning: 75,
    critical: 90
  },
  media: {
    domain: 'media',
    limit: 5, // Max 5 concurrent media operations
    unit: 'operations',
    warning: 60,
    critical: 80
  },
  editor: {
    domain: 'editor',
    limit: 100, // 100ms response budget
    unit: 'ms',
    warning: 50,
    critical: 80
  },
  search: {
    domain: 'search',
    limit: 200, // 200ms search budget
    unit: 'ms',
    warning: 50,
    critical: 80
  },
  background: {
    domain: 'background',
    limit: 50, // Max 50 concurrent background tasks
    unit: 'tasks',
    warning: 60,
    critical: 80
  }
};

// ===========================================================================
// PERFORMANCE BUDGET MANAGER
// ===========================================================================

class PerformanceBudgetManagerClass extends EventEmitter {
  private budgets: Map<BudgetDomain, Budget> = new Map();
  private reservations: Map<string, { domain: BudgetDomain; amount: number; expires: number }> = new Map();
  private violations: BudgetViolation[] = [];
  private reservationCounter = 0;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeBudgets();
    this.setupIPC();
    this.startMonitoring();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private initializeBudgets(): void {
    for (const [domain, config] of Object.entries(DEFAULT_BUDGETS)) {
      this.budgets.set(domain as BudgetDomain, {
        ...config,
        current: 0,
        reserved: 0
      });
    }
  }

  private setupIPC(): void {
    // Request budget allocation
    ipcMain.handle('budget:request', (_event, request: BudgetRequest) => {
      return this.requestBudget(request);
    });

    // Release budget reservation
    ipcMain.handle('budget:release', (_event, reservationId: string) => {
      return this.releaseReservation(reservationId);
    });

    // Get budget status
    ipcMain.handle('budget:status', (_event, domain?: BudgetDomain) => {
      return domain ? this.getBudgetStatus(domain) : this.getAllBudgetStatus();
    });

    // Get violations
    ipcMain.handle('budget:violations', () => {
      return this.getViolations();
    });

    // Check if operation is within budget
    ipcMain.handle('budget:check', (_event, domain: BudgetDomain, amount: number) => {
      return this.checkBudget(domain, amount);
    });

    // Update budget limit (admin only)
    ipcMain.handle('budget:setLimit', (_event, domain: BudgetDomain, limit: number) => {
      return this.setLimit(domain, limit);
    });

    // Report actual usage
    ipcMain.handle('budget:report', (_event, domain: BudgetDomain, usage: number) => {
      return this.reportUsage(domain, usage);
    });
  }

  // -------------------------------------------------------------------------
  // BUDGET MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Request budget allocation
   * This is the main entry point for any operation that needs resources
   */
  requestBudget(request: BudgetRequest): BudgetResponse {
    const budget = this.budgets.get(request.domain);
    if (!budget) {
      return { approved: false, allocated: 0, reason: `Unknown domain: ${request.domain}` };
    }

    const available = budget.limit - budget.current - budget.reserved;
    
    // Check if request exceeds limit
    if (request.amount > budget.limit) {
      this.recordViolation(request.domain, request.operation, request.amount, available, budget.limit);
      return {
        approved: false,
        allocated: 0,
        reason: `Request exceeds maximum budget (${request.amount} > ${budget.limit})`
      };
    }

    // Check if request exceeds available
    if (request.amount > available) {
      // For critical priority, allow slight overrun
      if (request.priority === 'critical' && request.amount <= budget.limit - budget.current) {
        // Approve but note the overrun
        log.warn(`[Budget] Critical operation approved with reservation overrun: ${request.operation}`);
      } else {
        this.recordViolation(request.domain, request.operation, request.amount, available, budget.limit);
        return {
          approved: false,
          allocated: 0,
          reason: `Insufficient budget (requested: ${request.amount}, available: ${available})`,
          waitTime: this.estimateWaitTime(request.domain, request.amount)
        };
      }
    }

    // Allocate budget
    const reservationId = `res-${Date.now()}-${++this.reservationCounter}`;
    const duration = request.duration || 30000; // Default 30s

    this.reservations.set(reservationId, {
      domain: request.domain,
      amount: request.amount,
      expires: Date.now() + duration
    });

    budget.reserved += request.amount;
    this.budgets.set(request.domain, budget);

    log.debug(`[Budget] Allocated ${request.amount} ${budget.unit} for ${request.operation} (${reservationId})`);

    return {
      approved: true,
      allocated: request.amount,
      reservationId
    };
  }

  /**
   * Release a budget reservation
   */
  releaseReservation(reservationId: string): boolean {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return false;

    const budget = this.budgets.get(reservation.domain);
    if (budget) {
      budget.reserved = Math.max(0, budget.reserved - reservation.amount);
      this.budgets.set(reservation.domain, budget);
    }

    this.reservations.delete(reservationId);
    log.debug(`[Budget] Released reservation ${reservationId}`);
    return true;
  }

  /**
   * Check if an amount is within budget (without allocating)
   */
  checkBudget(domain: BudgetDomain, amount: number): { withinBudget: boolean; available: number; utilization: number } {
    const budget = this.budgets.get(domain);
    if (!budget) {
      return { withinBudget: false, available: 0, utilization: 100 };
    }

    const available = budget.limit - budget.current - budget.reserved;
    const utilization = ((budget.current + budget.reserved) / budget.limit) * 100;

    return {
      withinBudget: amount <= available,
      available,
      utilization
    };
  }

  /**
   * Report actual resource usage
   */
  reportUsage(domain: BudgetDomain, usage: number): void {
    const budget = this.budgets.get(domain);
    if (!budget) return;

    budget.current = usage;
    this.budgets.set(domain, budget);

    // Check thresholds
    const utilization = (usage / budget.limit) * 100;
    
    if (utilization >= budget.critical) {
      this.emit('budget:critical', { domain, utilization, usage, limit: budget.limit });
      this.broadcastBudgetAlert(domain, 'critical', utilization);
    } else if (utilization >= budget.warning) {
      this.emit('budget:warning', { domain, utilization, usage, limit: budget.limit });
    }
  }

  /**
   * Set a new limit for a domain
   */
  setLimit(domain: BudgetDomain, limit: number): boolean {
    const budget = this.budgets.get(domain);
    if (!budget) return false;

    // Prevent setting limit below current usage
    if (limit < budget.current) {
      log.warn(`[Budget] Cannot set limit below current usage: ${limit} < ${budget.current}`);
      return false;
    }

    budget.limit = limit;
    this.budgets.set(domain, budget);
    log.info(`[Budget] Updated ${domain} limit to ${limit}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // STATUS & MONITORING
  // -------------------------------------------------------------------------

  getBudgetStatus(domain: BudgetDomain): Budget | null {
    return this.budgets.get(domain) || null;
  }

  getAllBudgetStatus(): Record<BudgetDomain, Budget> {
    const status: Record<string, Budget> = {};
    for (const [domain, budget] of this.budgets) {
      status[domain] = { ...budget };
    }
    return status as Record<BudgetDomain, Budget>;
  }

  getViolations(): BudgetViolation[] {
    return [...this.violations];
  }

  private recordViolation(
    domain: BudgetDomain,
    operation: string,
    requested: number,
    available: number,
    limit: number
  ): void {
    const violation: BudgetViolation = {
      domain,
      operation,
      requested,
      available,
      limit,
      timestamp: Date.now()
    };

    this.violations.push(violation);
    
    // Keep only last 100 violations
    if (this.violations.length > 100) {
      this.violations.shift();
    }

    this.emit('budget:violation', violation);
    log.warn(`[Budget] Violation in ${domain}: ${operation} requested ${requested}, only ${available} available`);
  }

  private estimateWaitTime(domain: BudgetDomain, amount: number): number {
    // Simple estimation based on typical usage patterns
    const budget = this.budgets.get(domain);
    if (!budget) return 5000;

    // Estimate based on how much we need vs current utilization
    const needed = amount - (budget.limit - budget.current - budget.reserved);
    const releaseRate = budget.limit * 0.1; // Assume 10% release per second
    
    return Math.max(1000, Math.ceil((needed / releaseRate) * 1000));
  }

  private broadcastBudgetAlert(domain: BudgetDomain, level: 'warning' | 'critical', utilization: number): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('budget:alert', { domain, level, utilization });
      }
    }
  }

  // -------------------------------------------------------------------------
  // MONITORING LOOP
  // -------------------------------------------------------------------------

  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      this.cleanupExpiredReservations();
      this.collectSystemMetrics();
    }, 5000); // Every 5 seconds
  }

  private cleanupExpiredReservations(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, reservation] of this.reservations) {
      if (reservation.expires < now) {
        this.releaseReservation(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug(`[Budget] Cleaned up ${cleaned} expired reservations`);
    }
  }

  private collectSystemMetrics(): void {
    // Collect actual system metrics
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;

    this.reportUsage('memory', heapUsed);

    // CPU would require sampling over time
    // For now, we rely on external reporting
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  /**
   * Execute an operation only if within budget
   */
  async executeWithBudget<T>(
    request: BudgetRequest,
    operation: () => Promise<T>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const response = this.requestBudget(request);
    
    if (!response.approved) {
      return { success: false, error: response.reason };
    }

    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      if (response.reservationId) {
        this.releaseReservation(response.reservationId);
      }
    }
  }

  /**
   * Get a budget-aware wrapper for frequent operations
   */
  createBudgetedOperation<T extends unknown[], R>(
    domain: BudgetDomain,
    operationName: string,
    cost: number,
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const response = this.requestBudget({
        domain,
        amount: cost,
        operation: operationName,
        priority: 'normal'
      });

      if (!response.approved) {
        throw new Error(`Operation ${operationName} rejected: ${response.reason}`);
      }

      try {
        return await fn(...args);
      } finally {
        if (response.reservationId) {
          this.releaseReservation(response.reservationId);
        }
      }
    };
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const PerformanceBudgetManager = new PerformanceBudgetManagerClass();
export default PerformanceBudgetManager;
