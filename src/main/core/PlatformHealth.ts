// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX -- PlatformHealth Facade
// ===========================================================================
// Thin additive facade that merges the three pre-existing health subsystems
// into a single snapshot + a single IPC channel:
//
//   - SystemHealthOrchestrator (subsystem checks, degradation, self-healing)
//   - DiagnosticsEngine        (perf samples, slowdown count)
//   - ReliabilityMonitor       (long-session memory trend, leak candidates)
//
// All three remain authoritative for their existing IPC channels. This module
// only adds `system:platformHealth` for callers that want one combined view
// without subscribing to three distinct channels.
//
// Non-breaking: nothing is removed, no contracts change.
// ===========================================================================

import { ipcMain } from 'electron';
import * as log from 'electron-log';
import { systemHealth } from './SystemHealthOrchestrator';
import { performanceSampler } from './DiagnosticsEngine';
import { ReliabilityMonitor } from './ReliabilityMonitor';

export interface PlatformHealthSnapshot {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'critical' | 'recovering' | 'unknown';
  uptimeSec: number;
  system: {
    memoryMB: { used: number; total: number; percent: number };
    cpuPercent: number;
    activeRecoveries: string[];
    disabledFeatures: string[];
    subsystemCount: number;
    criticalCount: number;
  };
  performance: {
    avgEventLoopLagMs: number;
    avgHeapMB: number;
    avgCpuPercent: number;
    slowdowns: number;
  };
  reliability: {
    memoryTrend: 'stable' | 'growing' | 'declining' | 'unknown';
    memoryGrowthRate: number;
    eventLoopLatency: number;
    errorRate: number;
    crashCount: number;
    score: number;
    leakCandidates: number;
  };
}

let initialized = false;

function getSnapshot(): PlatformHealthSnapshot {
  let sysReport: any = null;
  let perfAverages: any = null;
  let perfSlowdowns = 0;
  let stab: any = null;
  let leaks = 0;

  try { sysReport = systemHealth.getHealthReport(); } catch (err) {
    log.warn('[PlatformHealth] systemHealth.getHealthReport failed', err);
  }
  try { perfAverages = performanceSampler.getAverages(); } catch (err) {
    log.warn('[PlatformHealth] performanceSampler.getAverages failed', err);
  }
  try { perfSlowdowns = performanceSampler.getSlowdownCount(); } catch { /* noop */ }
  try { stab = ReliabilityMonitor.getStabilityMetrics(); } catch (err) {
    log.warn('[PlatformHealth] ReliabilityMonitor.getStabilityMetrics failed', err);
  }
  try {
    const candidates = (ReliabilityMonitor as any).leakCandidates;
    if (Array.isArray(candidates)) leaks = candidates.length;
  } catch { /* noop */ }

  const subs = sysReport?.subsystems || [];
  const criticalCount = subs.filter((s: any) => s?.status === 'critical').length;

  return {
    timestamp: Date.now(),
    overall: sysReport?.overall || 'unknown',
    uptimeSec: Math.round((sysReport?.uptime || 0) / 1000),
    system: {
      memoryMB: sysReport?.memoryMB || { used: 0, total: 0, percent: 0 },
      cpuPercent: sysReport?.cpuPercent || 0,
      activeRecoveries: sysReport?.activeRecoveries || [],
      disabledFeatures: sysReport?.disabledFeatures || [],
      subsystemCount: subs.length,
      criticalCount,
    },
    performance: {
      avgEventLoopLagMs: Math.round(perfAverages?.eventLoopLag || 0),
      avgHeapMB: Math.round(((perfAverages?.heapUsed || 0) / (1024 * 1024)) * 10) / 10,
      avgCpuPercent: Math.round((perfAverages?.cpuPercent || 0) * 10) / 10,
      slowdowns: perfSlowdowns,
    },
    reliability: {
      memoryTrend: stab?.memoryTrend || 'unknown',
      memoryGrowthRate: stab?.memoryGrowthRate || 0,
      eventLoopLatency: stab?.eventLoopLatency || 0,
      errorRate: stab?.errorRate || 0,
      crashCount: stab?.crashCount || 0,
      score: stab?.score ?? 100,
      leakCandidates: leaks,
    },
  };
}

export function initializePlatformHealth(): void {
  if (initialized) return;
  initialized = true;

  ipcMain.handle('system:platformHealth', () => {
    try {
      return getSnapshot();
    } catch (err: any) {
      log.error('[PlatformHealth] snapshot failed', err);
      return { error: err?.message || 'snapshot failed', timestamp: Date.now() };
    }
  });

  log.info('[PlatformHealth] Facade initialized (system:platformHealth IPC)');
}

export const platformHealth = { getSnapshot };
