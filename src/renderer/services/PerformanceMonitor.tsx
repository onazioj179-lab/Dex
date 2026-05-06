// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- Performance Monitor & Resource Budgets
 * ===========================================================================
 * 
 * Performance discipline for all sub-apps.
 * Each app has CPU, memory, I/O budgets enforced by the system.
 * 
 * Rules:
 * - Budgets enforced by system
 * - Exceeding budget triggers throttling or suspension
 * - No polling - event-driven only
 * - Dex must scale with many sub-apps open
 * ===========================================================================
 */

import { create } from 'zustand';
import { useSystemEvents, usePowerService } from './SystemServices';
import { useLifecycleManager } from './LifecycleManager';

// ===========================================================================
// TYPES
// ===========================================================================

/** Performance metrics snapshot */
export interface PerformanceMetrics {
  timestamp: number;
  
  // CPU
  cpuPercent: number;
  cpuTrend: 'stable' | 'rising' | 'falling';
  
  // Memory
  memoryMB: number;
  memoryPercent: number;
  memoryTrend: 'stable' | 'rising' | 'falling';
  heapUsedMB: number;
  heapTotalMB: number;
  
  // DOM
  domNodes: number;
  domListeners: number;
  
  // Frame rate
  fps: number;
  frameDrops: number;
  
  // Network
  activeRequests: number;
  bytesReceived: number;
  bytesSent: number;
}

/** Per-app resource metrics */
export interface AppResourceMetrics {
  instanceId: string;
  appId: string;
  
  // Usage
  cpuPercent: number;
  memoryMB: number;
  networkKBps: number;
  ioOps: number;
  
  // Budget status
  cpuBudget: number;
  memoryBudget: number;
  cpuUsagePercent: number;  // % of budget used
  memoryUsagePercent: number;
  
  // Violations
  violations: number;
  throttled: boolean;
  lastViolationAt: number | null;
  
  // History (last 60 samples)
  history: Array<{
    timestamp: number;
    cpu: number;
    memory: number;
  }>;
}

/** Performance alert */
export interface PerformanceAlert {
  id: string;
  type: 'cpu' | 'memory' | 'fps' | 'io' | 'network';
  severity: 'warning' | 'critical';
  instanceId?: string;
  appId?: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

// ===========================================================================
// PERFORMANCE MONITOR STORE
// ===========================================================================

interface PerformanceMonitorState {
  // Global metrics
  currentMetrics: PerformanceMetrics | null;
  metricsHistory: PerformanceMetrics[];
  
  // Per-app metrics
  appMetrics: Map<string, AppResourceMetrics>;
  
  // Alerts
  alerts: PerformanceAlert[];
  unacknowledgedCount: number;
  
  // Thresholds
  thresholds: {
    cpu: { warning: number; critical: number };
    memory: { warning: number; critical: number };
    fps: { warning: number; critical: number };
    appCpu: { warning: number; critical: number };
    appMemory: { warning: number; critical: number };
  };
  
  // Monitoring state
  isMonitoring: boolean;
  sampleInterval: number;
  lastSampleAt: number | null;
  
  // Actions
  startMonitoring: () => void;
  stopMonitoring: () => void;
  collectMetrics: () => void;
  
  updateAppMetrics: (instanceId: string, metrics: Partial<AppResourceMetrics>) => void;
  clearAppMetrics: (instanceId: string) => void;
  
  checkThresholds: () => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlerts: () => void;
  
  getAppMetrics: (instanceId: string) => AppResourceMetrics | undefined;
  getSystemHealth: () => 'healthy' | 'degraded' | 'critical';
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const usePerformanceMonitor = create<PerformanceMonitorState>((set, get) => {
  let monitoringInterval: NodeJS.Timeout | null = null;
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let frameDropCount = 0;
  let frameSampleTimer: NodeJS.Timeout | null = null;
  let frameSampleRafId: number | null = null;

  // Intermittent frame sampling: run RAF for 500ms every 5s to measure FPS
  // without consuming GPU continuously
  const startFrameSampling = () => {
    if (frameSampleTimer) return;
    const doSample = () => {
      frameCount = 0;
      lastFrameTime = performance.now();
      frameDropCount = 0;
      let sampling = true;
      const countFrame = () => {
        frameCount++;
        const now = performance.now();
        const delta = now - lastFrameTime;
        if (delta > 50) frameDropCount++;
        if (sampling && get().isMonitoring) {
          frameSampleRafId = requestAnimationFrame(countFrame);
        }
      };
      frameSampleRafId = requestAnimationFrame(countFrame);
      // Stop sampling after 500ms
      setTimeout(() => { sampling = false; }, 500);
    };
    doSample();
    frameSampleTimer = setInterval(doSample, 5000);
  };

  const stopFrameSampling = () => {
    if (frameSampleTimer) { clearInterval(frameSampleTimer); frameSampleTimer = null; }
    if (frameSampleRafId) { cancelAnimationFrame(frameSampleRafId); frameSampleRafId = null; }
  };

  return {
    currentMetrics: null,
    metricsHistory: [],
    appMetrics: new Map(),
    alerts: [],
    unacknowledgedCount: 0,
    thresholds: {
      cpu: { warning: 70, critical: 90 },
      memory: { warning: 75, critical: 90 },
      fps: { warning: 45, critical: 30 },
      appCpu: { warning: 20, critical: 30 },
      appMemory: { warning: 200, critical: 300 },
    },
    isMonitoring: false,
    sampleInterval: 2000, // 2 seconds
    lastSampleAt: null,

    startMonitoring: () => {
      if (get().isMonitoring) return;
      
      set({ isMonitoring: true });
      
      // Start intermittent frame sampling (not continuous RAF)
      startFrameSampling();
      
      // Start periodic collection (every 5s instead of 2s)
      monitoringInterval = setInterval(() => {
        get().collectMetrics();
        get().checkThresholds();
      }, 5000);
      
      // Initial collection
      get().collectMetrics();
    },

    stopMonitoring: () => {
      set({ isMonitoring: false });
      stopFrameSampling();
      
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
    },

    collectMetrics: () => {
      const now = performance.now();
      const elapsedSeconds = (now - lastFrameTime) / 1000;
      const fps = elapsedSeconds > 0 ? Math.round(frameCount / elapsedSeconds) : 60;
      
      // Reset counters
      frameCount = 0;
      frameDropCount = 0;
      lastFrameTime = now;

      // Get memory info if available
      const memory = (performance as any).memory;
      const heapUsedMB = memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0;
      const heapTotalMB = memory ? Math.round(memory.totalJSHeapSize / 1024 / 1024) : 0;
      
      // Estimate total memory usage
      const memoryMB = heapUsedMB;
      const memoryPercent = heapTotalMB > 0 ? Math.round((heapUsedMB / heapTotalMB) * 100) : 0;

      // Count DOM nodes
      const domNodes = document.getElementsByTagName('*').length;
      const domListeners = 0; // Would need DevTools API

      // Get previous metrics for trend calculation
      const prev = get().currentMetrics;
      
      const metrics: PerformanceMetrics = {
        timestamp: Date.now(),
        cpuPercent: 0, // Would need OS API
        cpuTrend: 'stable',
        memoryMB,
        memoryPercent,
        memoryTrend: prev 
          ? memoryMB > prev.memoryMB + 5 ? 'rising' 
          : memoryMB < prev.memoryMB - 5 ? 'falling' 
          : 'stable'
          : 'stable',
        heapUsedMB,
        heapTotalMB,
        domNodes,
        domListeners,
        fps,
        frameDrops: frameDropCount,
        activeRequests: 0,
        bytesReceived: 0,
        bytesSent: 0,
      };

      set(state => ({
        currentMetrics: metrics,
        metricsHistory: [...state.metricsHistory.slice(-199), metrics],
        lastSampleAt: Date.now(),
      }));
    },

    updateAppMetrics: (instanceId, newMetrics) => {
      set(state => {
        const existing = state.appMetrics.get(instanceId);
        const metrics: AppResourceMetrics = existing || {
          instanceId,
          appId: newMetrics.appId || 'unknown',
          cpuPercent: 0,
          memoryMB: 0,
          networkKBps: 0,
          ioOps: 0,
          cpuBudget: 25,
          memoryBudget: 256,
          cpuUsagePercent: 0,
          memoryUsagePercent: 0,
          violations: 0,
          throttled: false,
          lastViolationAt: null,
          history: [],
        };

        // Update values
        if (newMetrics.cpuPercent !== undefined) metrics.cpuPercent = newMetrics.cpuPercent;
        if (newMetrics.memoryMB !== undefined) metrics.memoryMB = newMetrics.memoryMB;
        if (newMetrics.networkKBps !== undefined) metrics.networkKBps = newMetrics.networkKBps;
        if (newMetrics.ioOps !== undefined) metrics.ioOps = newMetrics.ioOps;

        // Calculate budget usage
        metrics.cpuUsagePercent = Math.round((metrics.cpuPercent / metrics.cpuBudget) * 100);
        metrics.memoryUsagePercent = Math.round((metrics.memoryMB / metrics.memoryBudget) * 100);

        // Check for violations
        if (metrics.cpuPercent > metrics.cpuBudget || metrics.memoryMB > metrics.memoryBudget) {
          metrics.violations++;
          metrics.lastViolationAt = Date.now();
          
          if (metrics.violations >= 3) {
            metrics.throttled = true;
            usePowerService.getState().recordCpu(instanceId, metrics.cpuPercent);
          }
        }

        // Add to history
        metrics.history = [
          ...metrics.history.slice(-59),
          { timestamp: Date.now(), cpu: metrics.cpuPercent, memory: metrics.memoryMB },
        ];

        const newAppMetrics = new Map(state.appMetrics);
        newAppMetrics.set(instanceId, metrics);

        return { appMetrics: newAppMetrics };
      });
    },

    clearAppMetrics: (instanceId) => {
      set(state => {
        const newAppMetrics = new Map(state.appMetrics);
        newAppMetrics.delete(instanceId);
        return { appMetrics: newAppMetrics };
      });
    },

    checkThresholds: () => {
      const state = get();
      const metrics = state.currentMetrics;
      if (!metrics) return;

      const newAlerts: PerformanceAlert[] = [];

      // Check global thresholds
      if (metrics.memoryPercent >= state.thresholds.memory.critical) {
        newAlerts.push({
          id: generateId(),
          type: 'memory',
          severity: 'critical',
          message: `System memory at ${metrics.memoryPercent}%`,
          value: metrics.memoryPercent,
          threshold: state.thresholds.memory.critical,
          timestamp: Date.now(),
          acknowledged: false,
        });
      } else if (metrics.memoryPercent >= state.thresholds.memory.warning) {
        newAlerts.push({
          id: generateId(),
          type: 'memory',
          severity: 'warning',
          message: `System memory at ${metrics.memoryPercent}%`,
          value: metrics.memoryPercent,
          threshold: state.thresholds.memory.warning,
          timestamp: Date.now(),
          acknowledged: false,
        });
      }

      if (metrics.fps <= state.thresholds.fps.critical) {
        newAlerts.push({
          id: generateId(),
          type: 'fps',
          severity: 'critical',
          message: `Frame rate dropped to ${metrics.fps} FPS`,
          value: metrics.fps,
          threshold: state.thresholds.fps.critical,
          timestamp: Date.now(),
          acknowledged: false,
        });
      } else if (metrics.fps <= state.thresholds.fps.warning) {
        newAlerts.push({
          id: generateId(),
          type: 'fps',
          severity: 'warning',
          message: `Frame rate at ${metrics.fps} FPS`,
          value: metrics.fps,
          threshold: state.thresholds.fps.warning,
          timestamp: Date.now(),
          acknowledged: false,
        });
      }

      // Check per-app thresholds
      state.appMetrics.forEach(appMetrics => {
        if (appMetrics.memoryMB >= state.thresholds.appMemory.critical) {
          newAlerts.push({
            id: generateId(),
            type: 'memory',
            severity: 'critical',
            instanceId: appMetrics.instanceId,
            appId: appMetrics.appId,
            message: `${appMetrics.appId} using ${appMetrics.memoryMB}MB memory`,
            value: appMetrics.memoryMB,
            threshold: state.thresholds.appMemory.critical,
            timestamp: Date.now(),
            acknowledged: false,
          });
        }
      });

      if (newAlerts.length > 0) {
        set(state => ({
          alerts: [...state.alerts.slice(-49), ...newAlerts],
          unacknowledgedCount: state.unacknowledgedCount + newAlerts.length,
        }));

        // Emit critical alerts as system events
        newAlerts
          .filter(a => a.severity === 'critical')
          .forEach(alert => {
            useSystemEvents.getState().emit({
              type: 'resource_violation',
              appId: alert.appId,
              instanceId: alert.instanceId,
              data: { type: alert.type, value: alert.value, threshold: alert.threshold },
              severity: 'critical',
            });
          });

        // Handle memory pressure
        if (newAlerts.some(a => a.type === 'memory' && a.severity === 'critical')) {
          useLifecycleManager.getState().setMemoryPressure('critical');
        }
      }
    },

    acknowledgeAlert: (alertId) => {
      set(state => ({
        alerts: state.alerts.map(a => 
          a.id === alertId ? { ...a, acknowledged: true } : a
        ),
        unacknowledgedCount: Math.max(0, state.unacknowledgedCount - 1),
      }));
    },

    clearAlerts: () => {
      set({ alerts: [], unacknowledgedCount: 0 });
    },

    getAppMetrics: (instanceId) => {
      return get().appMetrics.get(instanceId);
    },

    getSystemHealth: () => {
      const state = get();
      const metrics = state.currentMetrics;
      if (!metrics) return 'healthy';

      if (
        metrics.memoryPercent >= state.thresholds.memory.critical ||
        metrics.fps <= state.thresholds.fps.critical
      ) {
        return 'critical';
      }

      if (
        metrics.memoryPercent >= state.thresholds.memory.warning ||
        metrics.fps <= state.thresholds.fps.warning
      ) {
        return 'degraded';
      }

      return 'healthy';
    },
  };
});

// ===========================================================================
// HOOKS
// ===========================================================================

/** Get current system metrics */
export const useSystemMetrics = () => {
  return usePerformanceMonitor(state => state.currentMetrics);
};

/** Get metrics for a specific app */
export const useAppResourceMetrics = (instanceId: string) => {
  return usePerformanceMonitor(state => state.appMetrics.get(instanceId));
};

/** Get system health status */
export const useSystemHealth = () => {
  return usePerformanceMonitor(state => state.getSystemHealth());
};

/** Get unacknowledged alerts */
export const usePerformanceAlerts = () => {
  return usePerformanceMonitor(state => ({
    alerts: state.alerts.filter(a => !a.acknowledged),
    count: state.unacknowledgedCount,
  }));
};

// ===========================================================================
// RESOURCE BUDGET HOOK FOR APPS
// ===========================================================================

/**
 * Hook for apps to report their resource usage
 */
export const useResourceBudget = (instanceId: string, appId: string) => {
  const { updateAppMetrics } = usePerformanceMonitor.getState();
  const metrics = usePerformanceMonitor(state => state.appMetrics.get(instanceId));

  // Report memory usage
  const reportMemory = (mb: number) => {
    updateAppMetrics(instanceId, { appId, memoryMB: mb });
  };

  // Report CPU usage (estimated)
  const reportCpu = (percent: number) => {
    updateAppMetrics(instanceId, { appId, cpuPercent: percent });
  };

  // Report network activity
  const reportNetwork = (kbps: number) => {
    updateAppMetrics(instanceId, { appId, networkKBps: kbps });
  };

  // Report I/O operations
  const reportIO = (ops: number) => {
    updateAppMetrics(instanceId, { appId, ioOps: ops });
  };

  return {
    // Current state
    isThrottled: metrics?.throttled ?? false,
    violations: metrics?.violations ?? 0,
    cpuUsage: metrics?.cpuUsagePercent ?? 0,
    memoryUsage: metrics?.memoryUsagePercent ?? 0,
    
    // Budgets
    cpuBudget: metrics?.cpuBudget ?? 25,
    memoryBudget: metrics?.memoryBudget ?? 256,
    
    // Reporting
    reportMemory,
    reportCpu,
    reportNetwork,
    reportIO,
  };
};

// ===========================================================================
// PERFORMANCE PANEL COMPONENT
// ===========================================================================

import React from 'react';

interface PerformancePanelProps {
  compact?: boolean;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ compact = false }) => {
  const metrics = useSystemMetrics();
  const health = useSystemHealth();
  const { alerts, count } = usePerformanceAlerts();

  if (!metrics) {
    return (
      <div style={panelStyles.container}>
        <span style={panelStyles.text}>No metrics available</span>
      </div>
    );
  }

  const healthColor = {
    healthy: 'var(--color-success)',
    degraded: '#ff9500',
    critical: 'var(--color-error)',
  }[health];

  if (compact) {
    return (
      <div style={panelStyles.compact}>
        <div style={{ ...panelStyles.healthDot, background: healthColor }} />
        <span style={panelStyles.text}>{metrics.fps} FPS</span>
        <span style={panelStyles.text}>{metrics.memoryMB}MB</span>
        {count > 0 && (
          <span style={{ ...panelStyles.badge, background: 'var(--color-error)' }}>{count}</span>
        )}
      </div>
    );
  }

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <div style={{ ...panelStyles.healthDot, background: healthColor }} />
        <span style={panelStyles.title}>System Performance</span>
      </div>
      
      <div style={panelStyles.metrics}>
        <div style={panelStyles.metric}>
          <span style={panelStyles.label}>FPS</span>
          <span style={panelStyles.value}>{metrics.fps}</span>
        </div>
        <div style={panelStyles.metric}>
          <span style={panelStyles.label}>Memory</span>
          <span style={panelStyles.value}>{metrics.memoryMB}MB</span>
        </div>
        <div style={panelStyles.metric}>
          <span style={panelStyles.label}>DOM Nodes</span>
          <span style={panelStyles.value}>{metrics.domNodes}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={panelStyles.alerts}>
          {alerts.slice(0, 3).map(alert => (
            <div 
              key={alert.id} 
              style={{
                ...panelStyles.alert,
                borderColor: alert.severity === 'critical' ? 'var(--color-error)' : '#ff9500',
              }}
            >
              {alert.message}
            </div>
          ))}
        </div>
      )}
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
  compact: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    borderRadius: 4,
    background: 'var(--color-bg-inset)',
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
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    fontFamily: 'monospace',
  },
  text: {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-inverse)',
    padding: '2px 6px',
    borderRadius: 10,
  },
  alerts: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  alert: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    padding: '6px 8px',
    borderRadius: 4,
    background: 'var(--color-bg-inset)',
    borderLeft: '2px solid',
  },
};
