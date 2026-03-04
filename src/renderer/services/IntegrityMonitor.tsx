/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX — System Integrity Monitor
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Internal system checks ensuring OS-grade reliability:
 * - App state validation
 * - Lifecycle correctness
 * - Resource cleanup verification
 * - Memory leak detection
 * 
 * Failures are logged locally and visible in diagnostics.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';
import { useLifecycleManager, AppProcess } from './LifecycleManager';
import { usePerformanceMonitor } from './PerformanceMonitor';
import { getSystemServicesStatus, useSystemEvents } from './SystemServices';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Integrity check types */
export type CheckType = 
  | 'state_consistency'
  | 'lifecycle_correctness'
  | 'resource_cleanup'
  | 'memory_leak'
  | 'zombie_process'
  | 'service_health'
  | 'navigation_integrity'
  | 'permission_consistency';

/** Check result */
export interface IntegrityCheckResult {
  id: string;
  type: CheckType;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
  duration: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

/** Check definition */
export interface IntegrityCheck {
  type: CheckType;
  name: string;
  description: string;
  run: () => IntegrityCheckResult;
  interval: number; // How often to run (ms), 0 = manual only
}

/** Diagnostic report */
export interface DiagnosticReport {
  id: string;
  generatedAt: number;
  systemInfo: {
    platform: string;
    userAgent: string;
    language: string;
    online: boolean;
    memoryMB: number;
  };
  processCount: number;
  activeProcesses: Array<{
    instanceId: string;
    appId: string;
    state: string;
    memoryMB: number;
    uptime: number;
  }>;
  serviceStatus: Record<string, string>;
  checkResults: IntegrityCheckResult[];
  recentErrors: Array<{
    type: string;
    message: string;
    timestamp: number;
  }>;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRITY CHECKS
// ═══════════════════════════════════════════════════════════════════════════

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createCheckResult = (
  type: CheckType,
  passed: boolean,
  message: string,
  severity: IntegrityCheckResult['severity'] = 'info',
  details?: Record<string, unknown>,
  duration: number = 0
): IntegrityCheckResult => ({
  id: generateId(),
  type,
  passed,
  message,
  details,
  timestamp: Date.now(),
  duration,
  severity,
});

/** Check state consistency across all processes */
const checkStateConsistency = (): IntegrityCheckResult => {
  const start = performance.now();
  const { processes, foregroundProcessId, backgroundProcessIds, suspendedProcessIds } = 
    useLifecycleManager.getState();

  const issues: string[] = [];

  // Check foreground process
  if (foregroundProcessId) {
    const fg = processes.get(foregroundProcessId);
    if (!fg) {
      issues.push(`Foreground process ${foregroundProcessId} not found in registry`);
    } else if (fg.lifecycleState !== 'foreground') {
      issues.push(`Foreground process has state "${fg.lifecycleState}" instead of "foreground"`);
    }
  }

  // Check background processes
  backgroundProcessIds.forEach(id => {
    const p = processes.get(id);
    if (!p) {
      issues.push(`Background process ${id} not found in registry`);
    } else if (p.lifecycleState !== 'background') {
      issues.push(`Background process ${id} has state "${p.lifecycleState}"`);
    }
  });

  // Check suspended processes
  suspendedProcessIds.forEach(id => {
    const p = processes.get(id);
    if (!p) {
      issues.push(`Suspended process ${id} not found in registry`);
    } else if (p.lifecycleState !== 'suspended') {
      issues.push(`Suspended process ${id} has state "${p.lifecycleState}"`);
    }
  });

  // Check for orphaned processes
  processes.forEach((p, id) => {
    if (p.lifecycleState === 'foreground' && id !== foregroundProcessId) {
      issues.push(`Process ${id} claims foreground but is not registered as such`);
    }
    if (p.lifecycleState === 'background' && !backgroundProcessIds.has(id)) {
      issues.push(`Process ${id} claims background but is not in background set`);
    }
    if (p.lifecycleState === 'suspended' && !suspendedProcessIds.has(id)) {
      issues.push(`Process ${id} claims suspended but is not in suspended set`);
    }
  });

  const duration = performance.now() - start;

  if (issues.length === 0) {
    return createCheckResult('state_consistency', true, 'All process states are consistent', 'info', undefined, duration);
  } else {
    return createCheckResult(
      'state_consistency',
      false,
      `Found ${issues.length} state inconsistencies`,
      'warning',
      { issues },
      duration
    );
  }
};

/** Check lifecycle correctness */
const checkLifecycleCorrectness = (): IntegrityCheckResult => {
  const start = performance.now();
  const { processes, transitions } = useLifecycleManager.getState();
  const issues: string[] = [];

  // Check for invalid state combinations
  processes.forEach((p, id) => {
    // Terminated processes should be removed
    if (p.lifecycleState === 'terminated') {
      issues.push(`Terminated process ${id} still in registry`);
    }

    // Launched processes should have launchedAt
    if (p.lifecycleState !== 'initial' && !p.launchedAt) {
      issues.push(`Process ${id} in state "${p.lifecycleState}" but missing launchedAt`);
    }

    // Suspended processes should have suspendedAt
    if (p.lifecycleState === 'suspended' && !p.suspendedAt) {
      issues.push(`Suspended process ${id} missing suspendedAt`);
    }

    // Active processes shouldn't have resourceBudgetId null (after initial)
    if (p.lifecycleState === 'foreground' && !p.resourceBudgetId) {
      issues.push(`Active process ${id} missing resource budget`);
    }
  });

  // Check for duplicate transitions (same transition happening multiple times)
  const recentTransitions = transitions.slice(-20);
  const seen = new Set<string>();
  recentTransitions.forEach(t => {
    const key = `${t.instanceId}:${t.fromState}:${t.toState}:${Math.floor(t.timestamp / 1000)}`;
    if (seen.has(key)) {
      issues.push(`Duplicate transition for ${t.instanceId}: ${t.fromState} arrow-right ${t.toState}`);
    }
    seen.add(key);
  });

  const duration = performance.now() - start;

  if (issues.length === 0) {
    return createCheckResult('lifecycle_correctness', true, 'Lifecycle states are correct', 'info', undefined, duration);
  } else {
    return createCheckResult(
      'lifecycle_correctness',
      false,
      `Found ${issues.length} lifecycle issues`,
      'warning',
      { issues },
      duration
    );
  }
};

/** Check for zombie processes */
const checkZombieProcesses = (): IntegrityCheckResult => {
  const start = performance.now();
  const { processes } = useLifecycleManager.getState();
  const zombies: string[] = [];
  const now = Date.now();

  processes.forEach((p, id) => {
    // Process inactive for more than 30 minutes in background
    if (p.lifecycleState === 'background' && now - p.lastActiveAt > 30 * 60 * 1000) {
      zombies.push(`${id} (inactive ${Math.round((now - p.lastActiveAt) / 60000)}min)`);
    }

    // Process suspended for more than 2 hours
    if (p.lifecycleState === 'suspended' && p.suspendedAt && now - p.suspendedAt > 2 * 60 * 60 * 1000) {
      zombies.push(`${id} (suspended ${Math.round((now - p.suspendedAt) / 3600000)}hr)`);
    }

    // Process with too many crashes
    if (p.crashCount >= 5) {
      zombies.push(`${id} (crashed ${p.crashCount} times)`);
    }
  });

  const duration = performance.now() - start;

  if (zombies.length === 0) {
    return createCheckResult('zombie_process', true, 'No zombie processes detected', 'info', undefined, duration);
  } else {
    return createCheckResult(
      'zombie_process',
      false,
      `Found ${zombies.length} potential zombie processes`,
      'warning',
      { zombies },
      duration
    );
  }
};

/** Check memory for potential leaks */
const checkMemoryLeaks = (): IntegrityCheckResult => {
  const start = performance.now();
  const { metricsHistory, appMetrics } = usePerformanceMonitor.getState();
  const issues: string[] = [];

  // Check for consistently rising memory in system
  if (metricsHistory.length >= 10) {
    const recent = metricsHistory.slice(-10);
    const first = recent[0].memoryMB;
    const last = recent[recent.length - 1].memoryMB;
    
    if (last > first * 1.5) {
      issues.push(`System memory increased ${Math.round((last - first) / first * 100)}% over ${metricsHistory.length} samples`);
    }
  }

  // Check individual apps
  appMetrics.forEach((metrics, id) => {
    if (metrics.history.length >= 10) {
      const recent = metrics.history.slice(-10);
      const first = recent[0].memory;
      const last = recent[recent.length - 1].memory;
      
      if (last > first * 1.5) {
        issues.push(`App ${id} memory increased ${Math.round((last - first) / first * 100)}%`);
      }
    }
  });

  const duration = performance.now() - start;

  if (issues.length === 0) {
    return createCheckResult('memory_leak', true, 'No memory leaks detected', 'info', undefined, duration);
  } else {
    return createCheckResult(
      'memory_leak',
      false,
      `Potential memory leaks detected`,
      'warning',
      { issues },
      duration
    );
  }
};

/** Check service health */
const checkServiceHealth = (): IntegrityCheckResult => {
  const start = performance.now();
  const status = getSystemServicesStatus();
  const issues: string[] = [];

  Object.entries(status).forEach(([service, state]) => {
    if (state === 'error') {
      issues.push(`${service} service is in error state`);
    } else if (state === 'offline') {
      issues.push(`${service} service is offline`);
    } else if (state === 'degraded') {
      issues.push(`${service} service is degraded`);
    }
  });

  const duration = performance.now() - start;

  if (issues.length === 0) {
    return createCheckResult('service_health', true, 'All services healthy', 'info', { status }, duration);
  } else {
    return createCheckResult(
      'service_health',
      false,
      `${issues.length} services have issues`,
      status.overall === 'error' ? 'critical' : 'warning',
      { issues, status },
      duration
    );
  }
};

/** Check navigation integrity */
const checkNavigationIntegrity = (): IntegrityCheckResult => {
  const start = performance.now();
  const { processes } = useLifecycleManager.getState();
  const issues: string[] = [];

  processes.forEach((p, id) => {
    // Navigation index should be valid
    if (p.navigationIndex < 0 || p.navigationIndex >= p.navigationStack.length) {
      issues.push(`Process ${id} has invalid navigation index ${p.navigationIndex}`);
    }

    // Current route should match stack at index
    if (p.navigationStack[p.navigationIndex] !== p.currentRoute) {
      issues.push(`Process ${id} currentRoute mismatch with navigation stack`);
    }

    // Stack shouldn't be empty
    if (p.navigationStack.length === 0) {
      issues.push(`Process ${id} has empty navigation stack`);
    }
  });

  const duration = performance.now() - start;

  if (issues.length === 0) {
    return createCheckResult('navigation_integrity', true, 'Navigation state is valid', 'info', undefined, duration);
  } else {
    return createCheckResult(
      'navigation_integrity',
      false,
      `Found ${issues.length} navigation issues`,
      'error',
      { issues },
      duration
    );
  }
};

// All integrity checks
const INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    type: 'state_consistency',
    name: 'State Consistency',
    description: 'Verifies process states match their registered locations',
    run: checkStateConsistency,
    interval: 30000, // Every 30 seconds
  },
  {
    type: 'lifecycle_correctness',
    name: 'Lifecycle Correctness',
    description: 'Validates lifecycle state machine rules',
    run: checkLifecycleCorrectness,
    interval: 60000, // Every minute
  },
  {
    type: 'zombie_process',
    name: 'Zombie Process Detection',
    description: 'Identifies stale or crashed processes',
    run: checkZombieProcesses,
    interval: 120000, // Every 2 minutes
  },
  {
    type: 'memory_leak',
    name: 'Memory Leak Detection',
    description: 'Monitors for unusual memory growth',
    run: checkMemoryLeaks,
    interval: 60000, // Every minute
  },
  {
    type: 'service_health',
    name: 'Service Health',
    description: 'Checks all system services are operational',
    run: checkServiceHealth,
    interval: 30000, // Every 30 seconds
  },
  {
    type: 'navigation_integrity',
    name: 'Navigation Integrity',
    description: 'Validates navigation state consistency',
    run: checkNavigationIntegrity,
    interval: 60000, // Every minute
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRITY MONITOR STORE
// ═══════════════════════════════════════════════════════════════════════════

interface IntegrityMonitorState {
  // Check results
  lastResults: Map<CheckType, IntegrityCheckResult>;
  allResults: IntegrityCheckResult[];
  
  // Monitoring state
  isMonitoring: boolean;
  checkIntervals: Map<CheckType, NodeJS.Timeout>;
  
  // Summary
  failedChecks: number;
  warningCount: number;
  errorCount: number;
  lastFullCheckAt: number | null;
  
  // Actions
  startMonitoring: () => void;
  stopMonitoring: () => void;
  runCheck: (type: CheckType) => IntegrityCheckResult;
  runAllChecks: () => IntegrityCheckResult[];
  generateDiagnosticReport: () => DiagnosticReport;
  getCheckResult: (type: CheckType) => IntegrityCheckResult | undefined;
  getOverallHealth: () => 'healthy' | 'warning' | 'error' | 'critical';
  clearResults: () => void;
}

export const useIntegrityMonitor = create<IntegrityMonitorState>((set, get) => ({
  lastResults: new Map(),
  allResults: [],
  isMonitoring: false,
  checkIntervals: new Map(),
  failedChecks: 0,
  warningCount: 0,
  errorCount: 0,
  lastFullCheckAt: null,

  startMonitoring: () => {
    if (get().isMonitoring) return;

    const intervals = new Map<CheckType, NodeJS.Timeout>();

    INTEGRITY_CHECKS.forEach(check => {
      if (check.interval > 0) {
        // Run immediately
        get().runCheck(check.type);
        
        // Then schedule
        const interval = setInterval(() => {
          get().runCheck(check.type);
        }, check.interval);
        intervals.set(check.type, interval);
      }
    });

    set({ isMonitoring: true, checkIntervals: intervals });
  },

  stopMonitoring: () => {
    const state = get();
    state.checkIntervals.forEach(interval => clearInterval(interval));
    set({ isMonitoring: false, checkIntervals: new Map() });
  },

  runCheck: (type) => {
    const check = INTEGRITY_CHECKS.find(c => c.type === type);
    if (!check) {
      return createCheckResult(type, false, 'Check not found', 'error');
    }

    const result = check.run();

    set(state => {
      const newLastResults = new Map(state.lastResults);
      newLastResults.set(type, result);

      // Update counts
      let warnings = 0;
      let errors = 0;
      let failed = 0;

      newLastResults.forEach(r => {
        if (!r.passed) failed++;
        if (r.severity === 'warning') warnings++;
        if (r.severity === 'error' || r.severity === 'critical') errors++;
      });

      return {
        lastResults: newLastResults,
        allResults: [...state.allResults.slice(-99), result],
        failedChecks: failed,
        warningCount: warnings,
        errorCount: errors,
      };
    });

    // Emit event for failures
    if (!result.passed && (result.severity === 'error' || result.severity === 'critical')) {
      useSystemEvents.getState().emit({
        type: 'error',
        data: { checkType: type, message: result.message, details: result.details },
        severity: result.severity,
      });
    }

    return result;
  },

  runAllChecks: () => {
    const results = INTEGRITY_CHECKS.map(check => get().runCheck(check.type));
    set({ lastFullCheckAt: Date.now() });
    return results;
  },

  generateDiagnosticReport: () => {
    // Run all checks first
    get().runAllChecks();

    const { processes } = useLifecycleManager.getState();
    const { currentMetrics } = usePerformanceMonitor.getState();
    const { lastResults } = get();
    const serviceStatus = getSystemServicesStatus();
    const events = useSystemEvents.getState().getEvents({ severity: ['error', 'critical'] });

    const now = Date.now();
    const activeProcesses = Array.from(processes.values())
      .filter(p => p.lifecycleState !== 'terminated')
      .map(p => ({
        instanceId: p.instanceId.slice(-12),
        appId: p.appId,
        state: p.lifecycleState,
        memoryMB: 0, // Would come from performance monitor
        uptime: p.launchedAt ? Math.round((now - p.launchedAt) / 1000) : 0,
      }));

    // Generate recommendations
    const recommendations: string[] = [];
    lastResults.forEach((result, type) => {
      if (!result.passed) {
        switch (type) {
          case 'zombie_process':
            recommendations.push('Consider closing unused background applications');
            break;
          case 'memory_leak':
            recommendations.push('Restart applications with high memory growth');
            break;
          case 'service_health':
            recommendations.push('Check network connectivity and system resources');
            break;
        }
      }
    });

    const report: DiagnosticReport = {
      id: generateId(),
      generatedAt: now,
      systemInfo: {
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        language: typeof navigator !== 'undefined' ? navigator.language : 'en',
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        memoryMB: currentMetrics?.memoryMB || 0,
      },
      processCount: activeProcesses.length,
      activeProcesses,
      serviceStatus: Object.fromEntries(
        Object.entries(serviceStatus).map(([k, v]) => [k, v])
      ),
      checkResults: Array.from(lastResults.values()),
      recentErrors: events.slice(-10).map(e => ({
        type: e.type,
        message: String(e.data.message || e.data.error || 'Unknown'),
        timestamp: e.timestamp,
      })),
      recommendations,
    };

    return report;
  },

  getCheckResult: (type) => {
    return get().lastResults.get(type);
  },

  getOverallHealth: () => {
    const state = get();
    if (state.errorCount > 0) return 'critical';
    if (state.warningCount > 2) return 'error';
    if (state.warningCount > 0 || state.failedChecks > 0) return 'warning';
    return 'healthy';
  },

  clearResults: () => {
    set({
      lastResults: new Map(),
      allResults: [],
      failedChecks: 0,
      warningCount: 0,
      errorCount: 0,
    });
  },
}));

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/** Get overall system integrity health */
export const useIntegrityHealth = () => {
  return useIntegrityMonitor(state => state.getOverallHealth());
};

/** Get specific check result */
export const useCheckResult = (type: CheckType) => {
  return useIntegrityMonitor(state => state.lastResults.get(type));
};

/** Get all failed checks */
export const useFailedChecks = () => {
  return useIntegrityMonitor(state => 
    Array.from(state.lastResults.values()).filter(r => !r.passed)
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRITY PANEL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';

export const IntegrityPanel: React.FC = () => {
  const health = useIntegrityHealth();
  const failedChecks = useFailedChecks();
  const { runAllChecks, generateDiagnosticReport } = useIntegrityMonitor.getState();

  const healthColor = {
    healthy: '#34c759',
    warning: '#ff9500',
    error: '#ff3b30',
    critical: '#ff3b30',
  }[health];

  const handleRunChecks = () => {
    runAllChecks();
  };

  const handleGenerateReport = () => {
    const report = generateDiagnosticReport();
    // Store for debugging - accessible via window.__DEX_DIAGNOSTIC_REPORT__
    if (typeof window !== 'undefined') {
      (window as any).__DEX_DIAGNOSTIC_REPORT__ = report;
    }
  };

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <div style={{ ...panelStyles.healthDot, background: healthColor }} />
        <span style={panelStyles.title}>System Integrity</span>
        <span style={panelStyles.status}>{health}</span>
      </div>

      {failedChecks.length > 0 && (
        <div style={panelStyles.issues}>
          {failedChecks.map(check => (
            <div 
              key={check.id}
              style={{
                ...panelStyles.issue,
                borderColor: check.severity === 'critical' ? '#ff3b30' : '#ff9500',
              }}
            >
              <span style={panelStyles.checkName}>{check.type.replace('_', ' ')}</span>
              <span style={panelStyles.checkMessage}>{check.message}</span>
            </div>
          ))}
        </div>
      )}

      <div style={panelStyles.actions}>
        <button style={panelStyles.button} onClick={handleRunChecks}>
          Run Checks
        </button>
        <button style={panelStyles.button} onClick={handleGenerateReport}>
          Generate Report
        </button>
      </div>
    </div>
  );
};

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: 12,
    background: 'var(--color-bg-surface)',
    borderRadius: 8,
    border: '1px solid var(--color-border-subtle)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    flex: 1,
  },
  status: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
  },
  issues: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 12,
  },
  issue: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 8px',
    borderRadius: 4,
    background: 'var(--color-bg-inset)',
    borderLeft: '2px solid',
  },
  checkName: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'capitalize',
  },
  checkMessage: {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  button: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--color-border-default)',
    background: 'var(--color-bg-surface)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
};
