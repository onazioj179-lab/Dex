// =============================================================================
// DEX - Phase 52: Advanced Plugin System Architecture
// Enhanced sandbox enforcement, permission system, resource budgeting
// =============================================================================

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as vm from 'vm';

// =============================================================================
// ENHANCED PERMISSION SYSTEM
// =============================================================================

export enum PermissionLevel {
  NONE = 0,
  RESTRICTED = 1,
  STANDARD = 2,
  ELEVATED = 3,
  TRUSTED = 4,
}

export interface PermissionGrant {
  permission: string;
  level: PermissionLevel;
  grantedAt: number;
  grantedBy: 'user' | 'system' | 'admin';
  expiresAt?: number;
  scope?: string[];  // Limited paths, domains, etc.
  conditions?: PermissionConditions;
}

export interface PermissionConditions {
  requireUserPresent?: boolean;
  maxUsagePerHour?: number;
  allowedTimeWindows?: Array<{ start: string; end: string }>;
  requireConfirmation?: boolean;
  auditLogging?: boolean;
}

export interface PermissionRequest {
  pluginId: string;
  permission: string;
  reason: string;
  requestedLevel: PermissionLevel;
  requestedScope?: string[];
  timestamp: number;
}

// Permission enforcement with detailed audit trail
export class PermissionEnforcer extends EventEmitter {
  private grants: Map<string, Map<string, PermissionGrant>> = new Map();
  private usageCounters: Map<string, Map<string, number>> = new Map();
  private auditLog: PermissionAuditEntry[] = [];
  private readonly maxAuditEntries = 10000;

  constructor() {
    super();
  }

  // Grant permission to a plugin
  grantPermission(
    pluginId: string,
    permission: string,
    level: PermissionLevel,
    grantedBy: 'user' | 'system' | 'admin',
    options?: {
      expiresIn?: number;
      scope?: string[];
      conditions?: PermissionConditions;
    }
  ): PermissionGrant {
    if (!this.grants.has(pluginId)) {
      this.grants.set(pluginId, new Map());
    }

    const grant: PermissionGrant = {
      permission,
      level,
      grantedAt: Date.now(),
      grantedBy,
      expiresAt: options?.expiresIn ? Date.now() + options.expiresIn : undefined,
      scope: options?.scope,
      conditions: options?.conditions,
    };

    this.grants.get(pluginId)!.set(permission, grant);

    this.logAudit({
      type: 'grant',
      pluginId,
      permission,
      level,
      grantedBy,
      timestamp: Date.now(),
    });

    this.emit('permission:granted', { pluginId, permission, grant });
    return grant;
  }

  // Revoke permission from a plugin
  revokePermission(pluginId: string, permission: string, reason: string): void {
    const pluginGrants = this.grants.get(pluginId);
    if (!pluginGrants) return;

    const grant = pluginGrants.get(permission);
    if (!grant) return;

    pluginGrants.delete(permission);

    this.logAudit({
      type: 'revoke',
      pluginId,
      permission,
      level: grant.level,
      reason,
      timestamp: Date.now(),
    });

    this.emit('permission:revoked', { pluginId, permission, reason });
  }

  // Check if plugin has permission (with all conditions)
  async checkPermission(
    pluginId: string,
    permission: string,
    requiredLevel: PermissionLevel = PermissionLevel.STANDARD,
    resource?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const pluginGrants = this.grants.get(pluginId);
    if (!pluginGrants) {
      return { allowed: false, reason: 'No permissions granted' };
    }

    const grant = pluginGrants.get(permission);
    if (!grant) {
      return { allowed: false, reason: `Permission '${permission}' not granted` };
    }

    // Check expiration
    if (grant.expiresAt && grant.expiresAt < Date.now()) {
      pluginGrants.delete(permission);
      return { allowed: false, reason: 'Permission expired' };
    }

    // Check level
    if (grant.level < requiredLevel) {
      return { allowed: false, reason: `Insufficient permission level: ${grant.level} < ${requiredLevel}` };
    }

    // Check scope
    if (grant.scope && resource) {
      const inScope = grant.scope.some(s => 
        resource.startsWith(s) || new RegExp(s).test(resource)
      );
      if (!inScope) {
        return { allowed: false, reason: 'Resource not in permitted scope' };
      }
    }

    // Check conditions
    if (grant.conditions) {
      const conditionResult = await this.checkConditions(pluginId, permission, grant.conditions);
      if (!conditionResult.allowed) {
        return conditionResult;
      }
    }

    // Log usage if audit logging enabled
    if (grant.conditions?.auditLogging) {
      this.logAudit({
        type: 'use',
        pluginId,
        permission,
        level: grant.level,
        resource,
        timestamp: Date.now(),
      });
    }

    return { allowed: true };
  }

  private async checkConditions(
    pluginId: string,
    permission: string,
    conditions: PermissionConditions
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check usage limits
    if (conditions.maxUsagePerHour) {
      const key = `${pluginId}:${permission}`;
      const hourAgo = Date.now() - 3600000;
      
      if (!this.usageCounters.has(pluginId)) {
        this.usageCounters.set(pluginId, new Map());
      }
      
      const counters = this.usageCounters.get(pluginId)!;
      const currentUsage = counters.get(permission) || 0;
      
      if (currentUsage >= conditions.maxUsagePerHour) {
        return { allowed: false, reason: 'Hourly usage limit exceeded' };
      }
      
      counters.set(permission, currentUsage + 1);
    }

    // Check time windows
    if (conditions.allowedTimeWindows) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const inWindow = conditions.allowedTimeWindows.some(window => 
        timeStr >= window.start && timeStr <= window.end
      );
      
      if (!inWindow) {
        return { allowed: false, reason: 'Outside allowed time window' };
      }
    }

    return { allowed: true };
  }

  private logAudit(entry: PermissionAuditEntry): void {
    this.auditLog.push(entry);
    
    // Trim if needed
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries);
    }
  }

  getAuditLog(pluginId?: string): PermissionAuditEntry[] {
    if (pluginId) {
      return this.auditLog.filter(e => e.pluginId === pluginId);
    }
    return [...this.auditLog];
  }

  getPluginPermissions(pluginId: string): PermissionGrant[] {
    const pluginGrants = this.grants.get(pluginId);
    if (!pluginGrants) return [];
    return Array.from(pluginGrants.values());
  }
}

interface PermissionAuditEntry {
  type: 'grant' | 'revoke' | 'use' | 'deny';
  pluginId: string;
  permission: string;
  level: PermissionLevel;
  grantedBy?: 'user' | 'system' | 'admin';
  reason?: string;
  resource?: string;
  timestamp: number;
}

// =============================================================================
// RESOURCE BUDGET SYSTEM
// =============================================================================

export interface ResourceBudget {
  memory: {
    limitMB: number;
    usedMB: number;
    peakMB: number;
  };
  cpu: {
    limitPercent: number;
    currentPercent: number;
    totalSeconds: number;
  };
  disk: {
    limitMB: number;
    usedMB: number;
    writesMB: number;
    readsMB: number;
  };
  network: {
    limitKBps: number;
    currentKBps: number;
    totalUploadMB: number;
    totalDownloadMB: number;
  };
  operations: {
    apiCalls: number;
    fileOperations: number;
    networkRequests: number;
  };
}

export interface ResourceViolation {
  pluginId: string;
  resource: keyof ResourceBudget;
  limit: number;
  actual: number;
  timestamp: number;
  action: 'warn' | 'throttle' | 'suspend';
}

export class ResourceBudgetManager extends EventEmitter {
  private budgets: Map<string, ResourceBudget> = new Map();
  private violations: ResourceViolation[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 1000;

  constructor() {
    super();
  }

  // Initialize budget for a plugin
  initializeBudget(
    pluginId: string,
    limits: {
      memoryMB: number;
      cpuPercent: number;
      diskMB: number;
      networkKBps: number;
    }
  ): void {
    const budget: ResourceBudget = {
      memory: {
        limitMB: limits.memoryMB,
        usedMB: 0,
        peakMB: 0,
      },
      cpu: {
        limitPercent: limits.cpuPercent,
        currentPercent: 0,
        totalSeconds: 0,
      },
      disk: {
        limitMB: limits.diskMB,
        usedMB: 0,
        writesMB: 0,
        readsMB: 0,
      },
      network: {
        limitKBps: limits.networkKBps,
        currentKBps: 0,
        totalUploadMB: 0,
        totalDownloadMB: 0,
      },
      operations: {
        apiCalls: 0,
        fileOperations: 0,
        networkRequests: 0,
      },
    };

    this.budgets.set(pluginId, budget);
  }

  // Start monitoring
  startMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkAllBudgets();
    }, this.CHECK_INTERVAL_MS);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Record resource usage
  recordUsage(
    pluginId: string,
    resource: keyof ResourceBudget,
    metrics: Partial<ResourceBudget[typeof resource]>
  ): void {
    const budget = this.budgets.get(pluginId);
    if (!budget) return;

    const resourceBudget = budget[resource] as Record<string, number>;
    for (const [key, value] of Object.entries(metrics)) {
      if (key in resourceBudget && typeof value === 'number') {
        resourceBudget[key] = value;
      }
    }

    // Update peak memory
    if (resource === 'memory' && budget.memory.usedMB > budget.memory.peakMB) {
      budget.memory.peakMB = budget.memory.usedMB;
    }
  }

  // Check if operation is within budget
  checkBudget(
    pluginId: string,
    resource: keyof ResourceBudget,
    amount: number
  ): { allowed: boolean; remaining: number } {
    const budget = this.budgets.get(pluginId);
    if (!budget) {
      return { allowed: false, remaining: 0 };
    }

    let current: number;
    let limit: number;

    switch (resource) {
      case 'memory':
        current = budget.memory.usedMB;
        limit = budget.memory.limitMB;
        break;
      case 'cpu':
        current = budget.cpu.currentPercent;
        limit = budget.cpu.limitPercent;
        break;
      case 'disk':
        current = budget.disk.usedMB;
        limit = budget.disk.limitMB;
        break;
      case 'network':
        current = budget.network.currentKBps;
        limit = budget.network.limitKBps;
        break;
      default:
        return { allowed: true, remaining: Infinity };
    }

    const remaining = limit - current;
    const allowed = remaining >= amount;

    return { allowed, remaining };
  }

  private checkAllBudgets(): void {
    for (const [pluginId, budget] of this.budgets) {
      // Memory check
      if (budget.memory.usedMB > budget.memory.limitMB) {
        this.recordViolation(pluginId, 'memory', budget.memory.limitMB, budget.memory.usedMB);
      }

      // CPU check
      if (budget.cpu.currentPercent > budget.cpu.limitPercent) {
        this.recordViolation(pluginId, 'cpu', budget.cpu.limitPercent, budget.cpu.currentPercent);
      }

      // Network check
      if (budget.network.currentKBps > budget.network.limitKBps) {
        this.recordViolation(pluginId, 'network', budget.network.limitKBps, budget.network.currentKBps);
      }
    }
  }

  private recordViolation(
    pluginId: string,
    resource: keyof ResourceBudget,
    limit: number,
    actual: number
  ): void {
    const severity = actual / limit;
    let action: 'warn' | 'throttle' | 'suspend';

    if (severity < 1.5) {
      action = 'warn';
    } else if (severity < 2) {
      action = 'throttle';
    } else {
      action = 'suspend';
    }

    const violation: ResourceViolation = {
      pluginId,
      resource,
      limit,
      actual,
      timestamp: Date.now(),
      action,
    };

    this.violations.push(violation);
    this.emit('violation', violation);

    // Keep violations list bounded
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-1000);
    }
  }

  getBudget(pluginId: string): ResourceBudget | undefined {
    return this.budgets.get(pluginId);
  }

  getViolations(pluginId?: string): ResourceViolation[] {
    if (pluginId) {
      return this.violations.filter(v => v.pluginId === pluginId);
    }
    return [...this.violations];
  }

  removeBudget(pluginId: string): void {
    this.budgets.delete(pluginId);
  }
}

// =============================================================================
// ENHANCED SANDBOX RUNTIME
// =============================================================================

export interface SandboxConfig {
  memoryLimitMB: number;
  cpuLimitPercent: number;
  timeoutMs: number;
  allowedGlobals: string[];
  blockedPatterns: RegExp[];
}

export interface SandboxExecution {
  id: string;
  pluginId: string;
  code: string;
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: string;
  resourceUsage: {
    memoryMB: number;
    cpuMs: number;
  };
}

export class EnhancedSandbox extends EventEmitter {
  private executions: Map<string, SandboxExecution> = new Map();
  private activeContexts: Map<string, vm.Context> = new Map();
  
  private defaultConfig: SandboxConfig = {
    memoryLimitMB: 50,
    cpuLimitPercent: 5,
    timeoutMs: 5000,
    allowedGlobals: ['console', 'setTimeout', 'clearTimeout', 'Promise', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set'],
    blockedPatterns: [
      /require\s*\(/,
      /import\s+/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\./,
      /global\./,
      /__dirname/,
      /__filename/,
      /child_process/,
      /fs\./,
      /net\./,
      /http\./,
    ],
  };

  constructor() {
    super();
  }

  // Create isolated context for plugin
  createContext(
    pluginId: string,
    api: Record<string, unknown>,
    config?: Partial<SandboxConfig>
  ): vm.Context {
    const mergedConfig = { ...this.defaultConfig, ...config };

    // Build safe global object
    const safeGlobals: Record<string, unknown> = {};
    for (const globalName of mergedConfig.allowedGlobals) {
      if (globalName in global) {
        safeGlobals[globalName] = (global as Record<string, unknown>)[globalName];
      }
    }

    // Create sandboxed console
    safeGlobals.console = {
      log: (...args: unknown[]) => this.emit('log', { pluginId, level: 'log', args }),
      warn: (...args: unknown[]) => this.emit('log', { pluginId, level: 'warn', args }),
      error: (...args: unknown[]) => this.emit('log', { pluginId, level: 'error', args }),
      info: (...args: unknown[]) => this.emit('log', { pluginId, level: 'info', args }),
    };

    // Add plugin API
    safeGlobals.dex = api;

    // Create context
    const context = vm.createContext(safeGlobals, {
      name: `plugin-${pluginId}`,
      codeGeneration: {
        strings: false,  // Disable eval()
        wasm: false,     // Disable WebAssembly
      },
    });

    this.activeContexts.set(pluginId, context);
    return context;
  }

  // Execute code in sandbox
  async execute(
    pluginId: string,
    code: string,
    config?: Partial<SandboxConfig>
  ): Promise<SandboxExecution> {
    const executionId = crypto.randomUUID();
    const mergedConfig = { ...this.defaultConfig, ...config };
    
    // Validate code against blocked patterns
    for (const pattern of mergedConfig.blockedPatterns) {
      if (pattern.test(code)) {
        const execution: SandboxExecution = {
          id: executionId,
          pluginId,
          code,
          startTime: Date.now(),
          endTime: Date.now(),
          error: `Blocked pattern detected: ${pattern.toString()}`,
          resourceUsage: { memoryMB: 0, cpuMs: 0 },
        };
        this.executions.set(executionId, execution);
        return execution;
      }
    }

    const context = this.activeContexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context for plugin: ${pluginId}`);
    }

    const execution: SandboxExecution = {
      id: executionId,
      pluginId,
      code,
      startTime: Date.now(),
      resourceUsage: { memoryMB: 0, cpuMs: 0 },
    };

    this.executions.set(executionId, execution);
    const startCpu = process.cpuUsage();
    const startMem = process.memoryUsage().heapUsed;

    try {
      // Create script
      const script = new vm.Script(code, {
        filename: `plugin-${pluginId}-${executionId}.js`,
      });

      // Execute with timeout
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Execution timeout'));
        }, mergedConfig.timeoutMs);

        try {
          const syncResult = script.runInContext(context, {
            timeout: mergedConfig.timeoutMs,
            breakOnSigint: true,
          });
          clearTimeout(timeout);
          resolve(syncResult);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      execution.result = result;
    } catch (err) {
      execution.error = err instanceof Error ? err.message : String(err);
    }

    // Calculate resource usage
    const endCpu = process.cpuUsage(startCpu);
    const endMem = process.memoryUsage().heapUsed;

    execution.endTime = Date.now();
    execution.resourceUsage = {
      memoryMB: Math.max(0, (endMem - startMem) / (1024 * 1024)),
      cpuMs: (endCpu.user + endCpu.system) / 1000,
    };

    this.emit('execution', execution);
    return execution;
  }

  // Destroy plugin context
  destroyContext(pluginId: string): void {
    const context = this.activeContexts.get(pluginId);
    if (context) {
      // Clear all references
      for (const key of Object.keys(context)) {
        delete context[key];
      }
      this.activeContexts.delete(pluginId);
    }
  }

  getExecution(executionId: string): SandboxExecution | undefined {
    return this.executions.get(executionId);
  }

  getPluginExecutions(pluginId: string): SandboxExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.pluginId === pluginId);
  }
}

// =============================================================================
// PLUGIN API DESIGN
// =============================================================================

export interface PluginAPIv2 {
  // Core
  version: string;
  pluginId: string;
  
  // Lifecycle
  lifecycle: {
    onActivate: (callback: () => Promise<void>) => void;
    onDeactivate: (callback: () => Promise<void>) => void;
    onSuspend: (callback: () => Promise<void>) => void;
    onResume: (callback: () => Promise<void>) => void;
  };
  
  // Storage (sandboxed)
  storage: {
    local: KVStore;
    sync: KVStore;
    secrets: SecretStore;
  };
  
  // Commands
  commands: {
    register: (id: string, handler: CommandHandler) => Disposable;
    execute: (id: string, ...args: unknown[]) => Promise<unknown>;
  };
  
  // UI
  ui: {
    showNotification: (options: NotificationOptions) => Promise<void>;
    showProgress: (options: ProgressOptions) => ProgressReporter;
    createPanel: (options: PanelOptions) => Panel;
    registerMenuItem: (options: MenuItemOptions) => Disposable;
  };
  
  // Events
  events: {
    on: <T>(event: string, handler: (data: T) => void) => Disposable;
    emit: (event: string, data: unknown) => void;
  };
  
  // Permissions
  permissions: {
    request: (permissions: string[]) => Promise<PermissionGrant[]>;
    check: (permission: string) => Promise<boolean>;
    onRevoked: (callback: (permission: string) => void) => Disposable;
  };
  
  // Resources
  resources: {
    getBudget: () => ResourceBudget;
    onLimitWarning: (callback: (resource: string, usage: number) => void) => Disposable;
  };
}

interface KVStore {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
  clear: () => Promise<void>;
}

interface SecretStore {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

interface CommandHandler {
  (...args: unknown[]): unknown | Promise<unknown>;
}

interface Disposable {
  dispose: () => void;
}

interface NotificationOptions {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actions?: Array<{ id: string; label: string }>;
  timeout?: number;
}

interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location: 'notification' | 'statusbar' | 'window';
}

interface ProgressReporter {
  report: (progress: { message?: string; increment?: number }) => void;
  cancel: () => void;
  done: () => void;
}

interface PanelOptions {
  id: string;
  title: string;
  icon?: string;
  location: 'sidebar' | 'bottom' | 'editor';
}

interface Panel {
  id: string;
  render: (content: string) => void;
  onMessage: (handler: (message: unknown) => void) => Disposable;
  postMessage: (message: unknown) => void;
  dispose: () => void;
}

interface MenuItemOptions {
  id: string;
  label: string;
  icon?: string;
  location: 'toolbar' | 'contextmenu' | 'mainmenu';
  command: string;
}

// =============================================================================
// PHASE 52 INTEGRATION
// =============================================================================

export interface Phase52Status {
  permissionEnforcer: {
    totalGrants: number;
    activePlugins: number;
    violations24h: number;
  };
  resourceBudgets: {
    totalPlugins: number;
    totalMemoryMB: number;
    totalCpuPercent: number;
    violations: number;
  };
  sandbox: {
    activeContexts: number;
    totalExecutions: number;
    averageExecutionMs: number;
  };
}

// Initialize Phase 52 systems
export function initializePhase52(): {
  permissionEnforcer: PermissionEnforcer;
  resourceBudgets: ResourceBudgetManager;
  sandbox: EnhancedSandbox;
  getStatus: () => Phase52Status;
} {
  const permissionEnforcer = new PermissionEnforcer();
  const resourceBudgets = new ResourceBudgetManager();
  const sandbox = new EnhancedSandbox();

  // Start resource monitoring
  resourceBudgets.startMonitoring();

  // Handle violations
  resourceBudgets.on('violation', (violation: ResourceViolation) => {
    console.warn(`[Phase52] Resource violation:`, violation);
    
    if (violation.action === 'suspend') {
      // Auto-revoke permissions if severely over budget
      permissionEnforcer.revokePermission(
        violation.pluginId,
        '*',
        `Resource violation: ${violation.resource} exceeded ${violation.actual}/${violation.limit}`
      );
    }
  });

  const getStatus = (): Phase52Status => {
    const auditLog = permissionEnforcer.getAuditLog();
    const violations = resourceBudgets.getViolations();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    return {
      permissionEnforcer: {
        totalGrants: auditLog.filter(e => e.type === 'grant').length,
        activePlugins: new Set(auditLog.map(e => e.pluginId)).size,
        violations24h: auditLog.filter(e => 
          e.type === 'deny' && (now - e.timestamp) < day
        ).length,
      },
      resourceBudgets: {
        totalPlugins: resourceBudgets['budgets'].size,
        totalMemoryMB: Array.from(resourceBudgets['budgets'].values())
          .reduce((sum, b) => sum + b.memory.usedMB, 0),
        totalCpuPercent: Array.from(resourceBudgets['budgets'].values())
          .reduce((sum, b) => sum + b.cpu.currentPercent, 0),
        violations: violations.length,
      },
      sandbox: {
        activeContexts: sandbox['activeContexts'].size,
        totalExecutions: sandbox['executions'].size,
        averageExecutionMs: sandbox['executions'].size > 0
          ? Array.from(sandbox['executions'].values())
              .filter(e => e.endTime)
              .reduce((sum, e) => sum + ((e.endTime || 0) - e.startTime), 0) / 
            sandbox['executions'].size
          : 0,
      },
    };
  };

  console.log('[Phase52] Advanced Plugin Architecture initialized');

  return {
    permissionEnforcer,
    resourceBudgets,
    sandbox,
    getStatus,
  };
}
