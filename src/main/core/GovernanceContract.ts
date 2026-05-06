// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Governance Contract
// Phase 58 + 59: AI + Plugin Boundaries & Post-Launch Evolution Rules
// IMMUTABLE ARCHITECTURAL CONTRACTS - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
// ===========================================================================

import log from 'electron-log';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------------
// CORE LAWS (ABSOLUTE - NEVER CHANGE)
// -----------------------------------------------------------------------------

export const CORE_LAWS = {
  // AI + Plugin Separation (Phase 58)
  AI_CANNOT_CONTROL_PLUGINS: true,
  PLUGINS_CANNOT_CONTROL_AI: true,
  DEX_CORE_IS_ONLY_AUTHORITY: true,
  USER_APPROVAL_ALWAYS_REQUIRED: true,
  
  // Execution Model
  AI_SUGGESTIONS_ONLY: true,          // AI outputs are suggestions, never actions
  NO_DIRECT_AI_TO_ACTION: true,       // AI cannot execute anything directly
  MEDIATED_INTERACTION_REQUIRED: true, // All AI+plugin interaction through Dex
  
  // Permission Model
  LEAST_PRIVILEGE_ALWAYS: true,
  PERMISSIONS_INTERSECTED_NOT_UNIONED: true,
  NO_PRIVILEGE_ESCALATION: true,
  
  // Performance Model
  AI_LATENCY_ISOLATED: true,
  PLUGIN_LATENCY_ISOLATED: true,
  CORE_ALWAYS_RESPONSIVE: true,
  
  // Post-Launch (Phase 59)
  NO_SILENT_CHANGES: true,
  NO_FORCED_UPDATES: true,
  NO_FEATURE_CREEP: true,
  NO_BEHAVIORAL_DRIFT: true,
} as const;

// -----------------------------------------------------------------------------
// PERFORMANCE CONTRACT (PERMANENT)
// -----------------------------------------------------------------------------

export const PERFORMANCE_CONTRACT = {
  // CPU/GPU Guarantees
  MAX_IDLE_CPU_PERCENT: 2,
  MAX_ACTIVE_CPU_PERCENT: 25,
  
  // Memory Guarantees
  MAX_BASE_MEMORY_MB: 150,
  MAX_TOTAL_MEMORY_MB: 512,
  MAX_MEMORY_GROWTH_PER_HOUR_MB: 10,
  
  // Startup Guarantees
  MAX_COLD_START_MS: 5000,
  MAX_WARM_START_MS: 2000,
  
  // Response Guarantees
  MAX_UI_RESPONSE_MS: 100,
  MAX_SEARCH_RESPONSE_MS: 200,
  MAX_AI_TIMEOUT_MS: 30000,
  MAX_PLUGIN_TIMEOUT_MS: 10000,
  
  // Background Work
  NO_BACKGROUND_WORK_WITHOUT_CONSENT: true,
  NO_ALWAYS_ON_SERVICES: true,
} as const;

// -----------------------------------------------------------------------------
// AI BOUNDARIES (LOCKED)
// -----------------------------------------------------------------------------

export const AI_BOUNDARIES = {
  // Capabilities
  CAN_SUGGEST: true,
  CAN_EXPLAIN: true,
  CAN_TRANSFORM_TEXT: true,
  CAN_GENERATE_DRAFTS: true,
  
  // Restrictions (LOCKED)
  CANNOT_EXECUTE: true,
  CANNOT_MODIFY_FILES_DIRECTLY: true,
  CANNOT_INVOKE_PLUGINS: true,
  CANNOT_EXPAND_PERMISSIONS: true,
  CANNOT_RUN_IN_BACKGROUND: true,
  CANNOT_ACCESS_SYSTEM_APIS: true,
  CANNOT_SEND_DATA_WITHOUT_CONSENT: true,
  
  // Data Restrictions
  MAX_CONTEXT_TOKENS: 4000,
  NO_RAW_FILE_DUMPS: true,
  NO_SENSITIVE_DATA_DEFAULT: true,
  USER_EDITS_CONTEXT_BEFORE_SEND: true,
} as const;

// -----------------------------------------------------------------------------
// PLUGIN BOUNDARIES (LOCKED)
// -----------------------------------------------------------------------------

export const PLUGIN_BOUNDARIES = {
  // Capabilities
  CAN_EXTEND_UI: true,
  CAN_PROCESS_DATA: true,
  CAN_INTEGRATE_SERVICES: true,
  
  // Restrictions (LOCKED)
  CANNOT_CONTROL_AI: true,
  CANNOT_SEND_TO_AI_WITHOUT_CONSENT: true,
  CANNOT_SELF_UPGRADE_PRIVILEGES: true,
  CANNOT_ACCESS_OTHER_PLUGINS_DATA: true,
  CANNOT_RUN_SILENTLY: true,
  CANNOT_BYPASS_PERMISSIONS: true,
  
  // Resource Limits
  MAX_MEMORY_MB: 50,
  MAX_CPU_PERCENT: 10,
  MAX_EXECUTION_MS: 10000,
  MAX_CONCURRENT_OPS: 5,
} as const;

// -----------------------------------------------------------------------------
// DATA FLOW RULES
// -----------------------------------------------------------------------------

export const DATA_FLOW_RULES = {
  // Allowed Flows
  USER_TO_AI: true,
  USER_TO_PLUGIN: true,
  DEX_CORE_TO_AI: true,
  DEX_CORE_TO_PLUGIN: true,
  
  // Disallowed Flows (LOCKED)
  AI_TO_PLUGIN_DIRECT: false,
  PLUGIN_TO_AI_DIRECT: false,
  PLUGIN_TO_PLUGIN_DIRECT: false,
  RAW_FILES_TO_AI: false,
  PLUGIN_TELEMETRY_TO_AI: false,
  AI_CODE_AUTO_EXECUTE: false,
} as const;

// -----------------------------------------------------------------------------
// EVOLUTION RULES (POST-LAUNCH)
// -----------------------------------------------------------------------------

export const EVOLUTION_RULES = {
  // Allowed Change Types
  SECURITY_PATCHES: true,
  BUG_FIXES: true,
  PERFORMANCE_IMPROVEMENTS: true,
  OPTIONAL_PLUGINS: true,
  OPT_IN_FEATURES: true,
  
  // Disallowed
  SILENT_CHANGES: false,
  FORCED_UPDATES: false,
  FEATURE_CREEP_IN_CORE: false,
  BEHAVIORAL_DRIFT: false,
  CLOUD_LOCK_IN: false,
  MANDATORY_ACCOUNTS: false,
  DEFAULT_TELEMETRY: false,
  
  // UI Freeze
  CORE_LAYOUT_FROZEN: true,
  NAVIGATION_MODEL_FROZEN: true,
  INTERACTION_PATTERNS_FROZEN: true,
  VISUAL_LANGUAGE_FROZEN: true,
} as const;

// -----------------------------------------------------------------------------
// FORBIDDEN FOREVER
// -----------------------------------------------------------------------------

export const FORBIDDEN_FOREVER = [
  'Autonomous AI agents',
  'Self-running plugin systems',
  'AI-written plugins auto-executed',
  'Hidden data sharing paths',
  'Smart mode bypassing rules',
  'Background AI calls',
  'Silent plugin activity',
  'AI expanding plugin permissions',
  'Plugins expanding AI context',
  'Direct AI to action paths',
  'Mandatory cloud services',
  'Forced account creation',
  'Default telemetry/tracking',
  'Monetization-driven features',
  'Trend-chasing features',
] as const;

// -----------------------------------------------------------------------------
// Governance Enforcer
// -----------------------------------------------------------------------------

export interface ViolationReport {
  type: 'ai' | 'plugin' | 'core' | 'data';
  rule: string;
  description: string;
  severity: 'warning' | 'violation' | 'critical';
  timestamp: number;
  source?: string;
}

export interface ExecutionRequest {
  source: 'ai' | 'plugin' | 'user' | 'core';
  action: string;
  target?: string;
  data?: unknown;
  permissions?: string[];
}

class GovernanceEnforcer extends EventEmitter {
  private violations: ViolationReport[] = [];
  private aiEnabled = false;  // AI is permanently disabled - local pattern learning only
  private pluginsEnabled = false;

  constructor() {
    super();
    log.info('[Governance] Contract enforcer initialized');
    log.info('[Governance] Core laws locked');
    log.info('[Governance] Performance contract active');
    log.info('[Governance] AI permanently disabled - privacy mode');
  }

  // -------------------------------------------------------------------------
  // Execution Validation
  // -------------------------------------------------------------------------

  validateExecution(request: ExecutionRequest): { allowed: boolean; reason?: string } {
    // Rule: AI cannot execute actions directly
    if (request.source === 'ai' && request.action !== 'suggest') {
      this.reportViolation({
        type: 'ai',
        rule: 'AI_SUGGESTIONS_ONLY',
        description: `AI attempted to execute: ${request.action}`,
        severity: 'violation',
        timestamp: Date.now(),
        source: 'ai',
      });
      return { allowed: false, reason: 'AI can only suggest, not execute' };
    }

    // Rule: Plugins cannot invoke AI directly
    if (request.source === 'plugin' && request.target === 'ai') {
      this.reportViolation({
        type: 'plugin',
        rule: 'PLUGINS_CANNOT_CONTROL_AI',
        description: `Plugin attempted to invoke AI directly`,
        severity: 'violation',
        timestamp: Date.now(),
        source: request.action,
      });
      return { allowed: false, reason: 'Plugins cannot control AI directly' };
    }

    // Rule: No direct AI to plugin communication
    if (request.source === 'ai' && request.target?.startsWith('plugin:')) {
      this.reportViolation({
        type: 'ai',
        rule: 'AI_CANNOT_CONTROL_PLUGINS',
        description: `AI attempted to invoke plugin: ${request.target}`,
        severity: 'critical',
        timestamp: Date.now(),
        source: 'ai',
      });
      return { allowed: false, reason: 'AI cannot control plugins' };
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Data Flow Validation
  // -------------------------------------------------------------------------

  validateDataFlow(from: string, to: string, dataType: string): { allowed: boolean; reason?: string } {
    // AI to Plugin direct: FORBIDDEN
    if (from === 'ai' && to.startsWith('plugin')) {
      return { allowed: false, reason: 'Direct AI to plugin data flow forbidden' };
    }

    // Plugin to AI direct: FORBIDDEN
    if (from.startsWith('plugin') && to === 'ai') {
      return { allowed: false, reason: 'Direct plugin to AI data flow forbidden' };
    }

    // Raw files to AI: FORBIDDEN by default
    if (to === 'ai' && dataType === 'raw_file') {
      return { allowed: false, reason: 'Raw file content to AI requires explicit consent' };
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Permission Validation
  // -------------------------------------------------------------------------

  validatePermissionChange(
    source: 'ai' | 'plugin',
    requestedPermissions: string[],
    currentPermissions: string[]
  ): { allowed: boolean; reason?: string } {
    // Check for privilege escalation
    const newPermissions = requestedPermissions.filter(p => !currentPermissions.includes(p));
    
    if (newPermissions.length > 0) {
      if (source === 'ai') {
        this.reportViolation({
          type: 'ai',
          rule: 'NO_PRIVILEGE_ESCALATION',
          description: `AI attempted to expand permissions: ${newPermissions.join(', ')}`,
          severity: 'critical',
          timestamp: Date.now(),
        });
        return { allowed: false, reason: 'AI cannot expand permissions' };
      }
      
      if (source === 'plugin') {
        this.reportViolation({
          type: 'plugin',
          rule: 'CANNOT_SELF_UPGRADE_PRIVILEGES',
          description: `Plugin attempted to self-upgrade: ${newPermissions.join(', ')}`,
          severity: 'critical',
          timestamp: Date.now(),
        });
        return { allowed: false, reason: 'Plugins cannot self-upgrade privileges' };
      }
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Resource Limits
  // -------------------------------------------------------------------------

  checkResourceLimits(source: 'ai' | 'plugin', metrics: {
    memoryMB?: number;
    cpuPercent?: number;
    executionMs?: number;
  }): { withinLimits: boolean; violations: string[] } {
    const violations: string[] = [];
    const limits = source === 'ai' ? 
      { memory: 100, cpu: 15, execution: PERFORMANCE_CONTRACT.MAX_AI_TIMEOUT_MS } :
      { memory: PLUGIN_BOUNDARIES.MAX_MEMORY_MB, cpu: PLUGIN_BOUNDARIES.MAX_CPU_PERCENT, execution: PLUGIN_BOUNDARIES.MAX_EXECUTION_MS };

    if (metrics.memoryMB && metrics.memoryMB > limits.memory) {
      violations.push(`Memory exceeded: ${metrics.memoryMB}MB > ${limits.memory}MB`);
    }
    if (metrics.cpuPercent && metrics.cpuPercent > limits.cpu) {
      violations.push(`CPU exceeded: ${metrics.cpuPercent}% > ${limits.cpu}%`);
    }
    if (metrics.executionMs && metrics.executionMs > limits.execution) {
      violations.push(`Execution time exceeded: ${metrics.executionMs}ms > ${limits.execution}ms`);
    }

    return { withinLimits: violations.length === 0, violations };
  }

  // -------------------------------------------------------------------------
  // Violation Reporting
  // -------------------------------------------------------------------------

  private reportViolation(report: ViolationReport): void {
    this.violations.push(report);
    this.emit('violation', report);
    
    // Keep only last 100 violations
    if (this.violations.length > 100) {
      this.violations = this.violations.slice(-100);
    }

    // Log critical violations
    if (report.severity === 'critical') {
      log.error(`[Governance] CRITICAL VIOLATION: ${report.rule} - ${report.description}`);
    } else {
      log.warn(`[Governance] ${report.severity.toUpperCase()}: ${report.rule}`);
    }
  }

  getViolations(): ViolationReport[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  setAIEnabled(enabled: boolean): void {
    // AI is permanently disabled in DEX - use local pattern learning instead
    this.aiEnabled = false;  // Always false - AI removed
    log.info(`[Governance] AI permanently disabled - privacy mode`);
  }

  setPluginsEnabled(enabled: boolean): void {
    this.pluginsEnabled = enabled;
    log.info(`[Governance] Plugins ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAIEnabled(): boolean {
    return this.aiEnabled;
  }

  isPluginsEnabled(): boolean {
    return this.pluginsEnabled;
  }

  // -------------------------------------------------------------------------
  // Contract Export
  // -------------------------------------------------------------------------

  getContracts(): {
    coreLaws: typeof CORE_LAWS;
    performance: typeof PERFORMANCE_CONTRACT;
    aiBoundaries: typeof AI_BOUNDARIES;
    pluginBoundaries: typeof PLUGIN_BOUNDARIES;
    dataFlow: typeof DATA_FLOW_RULES;
    evolution: typeof EVOLUTION_RULES;
    forbidden: typeof FORBIDDEN_FOREVER;
  } {
    return {
      coreLaws: CORE_LAWS,
      performance: PERFORMANCE_CONTRACT,
      aiBoundaries: AI_BOUNDARIES,
      pluginBoundaries: PLUGIN_BOUNDARIES,
      dataFlow: DATA_FLOW_RULES,
      evolution: EVOLUTION_RULES,
      forbidden: FORBIDDEN_FOREVER,
    };
  }
}

// Singleton instance
export const governanceEnforcer = new GovernanceEnforcer();

// -----------------------------------------------------------------------------
// Mediated Action Executor
// -----------------------------------------------------------------------------

export interface MediatedAction {
  id: string;
  source: 'ai' | 'plugin' | 'user';
  type: 'suggestion' | 'transform' | 'execute';
  description: string;
  preview?: string;
  data?: unknown;
  requiresApproval: boolean;
  approved: boolean;
  executedAt?: number;
}

class MediatedActionExecutor {
  private pendingActions: Map<string, MediatedAction> = new Map();
  private actionHistory: MediatedAction[] = [];

  /**
   * Queue an action for user approval
   */
  queueAction(action: Omit<MediatedAction, 'id' | 'approved'>): string {
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Validate through governance
    const validation = governanceEnforcer.validateExecution({
      source: action.source,
      action: action.type,
      data: action.data,
    });

    if (!validation.allowed) {
      throw new Error(`Action blocked by governance: ${validation.reason}`);
    }

    const mediatedAction: MediatedAction = {
      ...action,
      id,
      approved: false,
      requiresApproval: action.source !== 'user', // User actions don't need self-approval
    };

    this.pendingActions.set(id, mediatedAction);
    return id;
  }

  /**
   * Approve a pending action
   */
  approveAction(id: string): MediatedAction | null {
    const action = this.pendingActions.get(id);
    if (!action) return null;

    action.approved = true;
    action.executedAt = Date.now();
    
    this.pendingActions.delete(id);
    this.actionHistory.push(action);
    
    // Keep only last 100 actions
    if (this.actionHistory.length > 100) {
      this.actionHistory = this.actionHistory.slice(-100);
    }

    return action;
  }

  /**
   * Reject a pending action
   */
  rejectAction(id: string): boolean {
    return this.pendingActions.delete(id);
  }

  /**
   * Get pending actions
   */
  getPendingActions(): MediatedAction[] {
    return Array.from(this.pendingActions.values());
  }

  /**
   * Get action history
   */
  getActionHistory(): MediatedAction[] {
    return [...this.actionHistory];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }
}

export const mediatedExecutor = new MediatedActionExecutor();

// -----------------------------------------------------------------------------
// Export governance status for UI
// -----------------------------------------------------------------------------

export function getGovernanceStatus(): {
  aiEnabled: boolean;
  pluginsEnabled: boolean;
  violationCount: number;
  pendingActions: number;
  contractsActive: boolean;
} {
  return {
    aiEnabled: governanceEnforcer.isAIEnabled(),
    pluginsEnabled: governanceEnforcer.isPluginsEnabled(),
    violationCount: governanceEnforcer.getViolations().length,
    pendingActions: mediatedExecutor.getPendingActions().length,
    contractsActive: true,
  };
}

// -----------------------------------------------------------------------------
// IPC Handler Registration
// -----------------------------------------------------------------------------

import { ipcMain } from 'electron';

export function registerGovernanceHandlers(): void {
  // Get governance status
  ipcMain.handle('governance:getStatus', () => getGovernanceStatus());

  // Get all contracts
  ipcMain.handle('governance:getContracts', () => governanceEnforcer.getContracts());

  // Get violations
  ipcMain.handle('governance:getViolations', () => governanceEnforcer.getViolations());

  // Clear violations
  ipcMain.handle('governance:clearViolations', () => {
    governanceEnforcer.clearViolations();
    return true;
  });

  // Get pending actions
  ipcMain.handle('governance:getPendingActions', () => mediatedExecutor.getPendingActions());

  // Approve action
  ipcMain.handle('governance:approveAction', (_, actionId: string) => {
    const action = mediatedExecutor.approveAction(actionId);
    return action !== null;
  });

  // Reject action
  ipcMain.handle('governance:rejectAction', (_, actionId: string) => {
    return mediatedExecutor.rejectAction(actionId);
  });

  // Get action history
  ipcMain.handle('governance:getActionHistory', () => mediatedExecutor.getActionHistory());

  // Clear action history
  ipcMain.handle('governance:clearHistory', () => {
    mediatedExecutor.clearHistory();
    return true;
  });

  // Validate execution (for testing)
  ipcMain.handle('governance:validateExecution', (_, request: {
    source: 'ai' | 'plugin' | 'user' | 'core';
    action: string;
    target?: string;
    data?: unknown;
  }) => {
    return governanceEnforcer.validateExecution(request);
  });

  // Validate data flow (for testing)
  ipcMain.handle('governance:validateDataFlow', (_, from: string, to: string, dataType: string) => {
    return governanceEnforcer.validateDataFlow(from, to, dataType);
  });

  log.info('[Governance] IPC handlers registered');
}
