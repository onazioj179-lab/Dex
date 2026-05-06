// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Analytics Controller - Advanced Metrics & Insights
// Track execution performance, usage patterns, and ROI
// ===========================================================================

import { ipcMain } from 'electron';
import Store from 'electron-store';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ExecutionRecord {
  id: string;
  type: 'workflow' | 'operation' | 'action' | 'script' | 'trigger';
  name: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  success: boolean;
  error?: string;
  resourceUsage?: ResourceUsage;
}

interface ResourceUsage {
  memoryBefore: number;
  memoryAfter: number;
  cpuPeak?: number;
}

interface DailyStats {
  date: string; // YYYY-MM-DD
  executions: number;
  successes: number;
  failures: number;
  totalDuration: number;
  byType: Record<string, number>;
  byHour: number[]; // 24 elements for each hour
}

interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  timeSaved: number;
  topWorkflows: Array<{ name: string; count: number }>;
  topOperations: Array<{ name: string; count: number }>;
  peakHour: number;
  trend: 'up' | 'down' | 'stable';
}

interface AnalyticsConfig {
  enabled: boolean;
  retentionDays: number;
  estimatedManualTime: Record<string, number>; // type -> seconds
}

interface Recommendation {
  id: string;
  type: 'optimization' | 'reliability' | 'usage' | 'performance';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionable?: string;
  data?: unknown;
}

interface UsageHeatmap {
  hourly: number[]; // 24 elements
  daily: number[]; // 7 elements (Sun-Sat)
  matrix: number[][]; // 7x24 matrix
}

// -----------------------------------------------------------------------------
// Analytics Manager
// -----------------------------------------------------------------------------

class AnalyticsManager {
  private store: Store;
  private recordStore: Store;
  private dailyStore: Store;

  constructor() {
    this.store = new Store({ name: 'dex-analytics-config' });
    this.recordStore = new Store({ name: 'dex-analytics-records' });
    this.dailyStore = new Store({ name: 'dex-analytics-daily' });
  }

  // Get configuration
  getConfig(): AnalyticsConfig {
    return {
      enabled: this.store.get('enabled', true) as boolean,
      retentionDays: this.store.get('retentionDays', 90) as number,
      estimatedManualTime: this.store.get('estimatedManualTime', {
        workflow: 300, // 5 minutes
        operation: 60, // 1 minute
        action: 30, // 30 seconds
        script: 120, // 2 minutes
        trigger: 10, // 10 seconds
      }) as Record<string, number>,
    };
  }

  // Record execution
  recordExecution(record: Omit<ExecutionRecord, 'id'>): ExecutionRecord {
    const config = this.getConfig();
    if (!config.enabled) return { id: '', ...record };

    const fullRecord: ExecutionRecord = {
      ...record,
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    // Store record
    const records = this.recordStore.get('records', []) as ExecutionRecord[];
    records.push(fullRecord);
    
    // Keep only recent records
    const cutoff = Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000);
    const filtered = records.filter(r => r.startedAt > cutoff);
    this.recordStore.set('records', filtered);

    // Update daily stats
    this.updateDailyStats(fullRecord);

    return fullRecord;
  }

  // Update daily statistics
  private updateDailyStats(record: ExecutionRecord): void {
    const date = new Date(record.startedAt).toISOString().split('T')[0];
    const hour = new Date(record.startedAt).getHours();
    
    const dailyData = this.dailyStore.get('data', {}) as Record<string, DailyStats>;
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        byType: {},
        byHour: new Array(24).fill(0),
      };
    }

    const stats = dailyData[date];
    stats.executions++;
    if (record.success) stats.successes++;
    else stats.failures++;
    if (record.duration) stats.totalDuration += record.duration;
    stats.byType[record.type] = (stats.byType[record.type] || 0) + 1;
    stats.byHour[hour]++;

    this.dailyStore.set('data', dailyData);
  }

  // Get execution records
  getRecords(options?: { 
    limit?: number; 
    type?: string; 
    since?: number;
    success?: boolean;
  }): ExecutionRecord[] {
    let records = this.recordStore.get('records', []) as ExecutionRecord[];

    if (options?.type) {
      records = records.filter(r => r.type === options.type);
    }
    if (options?.since !== undefined) {
      const sinceTime = options.since;
      records = records.filter(r => r.startedAt >= sinceTime);
    }
    if (options?.success !== undefined) {
      records = records.filter(r => r.success === options.success);
    }

    // Sort by most recent
    records.sort((a, b) => b.startedAt - a.startedAt);

    if (options?.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  // Get daily stats for date range
  getDailyStats(startDate: string, endDate: string): DailyStats[] {
    const dailyData = this.dailyStore.get('data', {}) as Record<string, DailyStats>;
    const stats: DailyStats[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      stats.push(dailyData[dateStr] || {
        date: dateStr,
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        byType: {},
        byHour: new Array(24).fill(0),
      });
    }

    return stats;
  }

  // Calculate summary statistics
  getSummaryStats(days: number = 30): {
    totalExecutions: number;
    successRate: number;
    avgDuration: number;
    timeSaved: number;
    byType: Record<string, { count: number; successRate: number; avgDuration: number }>;
    trend: number; // percentage change from previous period
  } {
    const config = this.getConfig();
    const now = Date.now();
    const periodStart = now - (days * 24 * 60 * 60 * 1000);
    const prevPeriodStart = periodStart - (days * 24 * 60 * 60 * 1000);

    const currentRecords = this.getRecords({ since: periodStart });
    const prevRecords = this.getRecords({ since: prevPeriodStart }).filter(
      r => r.startedAt < periodStart
    );

    const successCount = currentRecords.filter(r => r.success).length;
    const totalDuration = currentRecords.reduce((sum, r) => sum + (r.duration || 0), 0);

    // Calculate time saved
    let timeSaved = 0;
    for (const record of currentRecords) {
      if (record.success) {
        const manualTime = config.estimatedManualTime[record.type] || 60;
        const actualTime = (record.duration || 0) / 1000;
        timeSaved += Math.max(0, manualTime - actualTime);
      }
    }

    // Group by type
    const byType: Record<string, { count: number; successRate: number; avgDuration: number }> = {};
    const typeGroups: Record<string, ExecutionRecord[]> = {};
    
    for (const record of currentRecords) {
      if (!typeGroups[record.type]) typeGroups[record.type] = [];
      typeGroups[record.type].push(record);
    }

    for (const [type, records] of Object.entries(typeGroups)) {
      const successes = records.filter(r => r.success).length;
      const duration = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      byType[type] = {
        count: records.length,
        successRate: records.length > 0 ? (successes / records.length) * 100 : 0,
        avgDuration: records.length > 0 ? duration / records.length : 0,
      };
    }

    // Calculate trend
    const trend = prevRecords.length > 0
      ? ((currentRecords.length - prevRecords.length) / prevRecords.length) * 100
      : 0;

    return {
      totalExecutions: currentRecords.length,
      successRate: currentRecords.length > 0 ? (successCount / currentRecords.length) * 100 : 0,
      avgDuration: currentRecords.length > 0 ? totalDuration / currentRecords.length : 0,
      timeSaved,
      byType,
      trend: Math.round(trend),
    };
  }

  // Get weekly digest
  getWeeklyDigest(): WeeklyDigest {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const records = this.getRecords({ since: weekStart.getTime() }).filter(
      r => r.startedAt <= weekEnd.getTime()
    );

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevRecords = this.getRecords({ since: prevWeekStart.getTime() }).filter(
      r => r.startedAt < weekStart.getTime()
    );

    // Calculate metrics
    const successCount = records.filter(r => r.success).length;
    const totalDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0);

    // Time saved calculation
    const config = this.getConfig();
    let timeSaved = 0;
    for (const record of records) {
      if (record.success) {
        const manualTime = config.estimatedManualTime[record.type] || 60;
        timeSaved += manualTime;
      }
    }

    // Top workflows
    const workflowCounts: Record<string, number> = {};
    const operationCounts: Record<string, number> = {};
    const hourCounts: number[] = new Array(24).fill(0);

    for (const record of records) {
      if (record.type === 'workflow') {
        workflowCounts[record.name] = (workflowCounts[record.name] || 0) + 1;
      } else if (record.type === 'operation') {
        operationCounts[record.name] = (operationCounts[record.name] || 0) + 1;
      }
      const hour = new Date(record.startedAt).getHours();
      hourCounts[hour]++;
    }

    const topWorkflows = Object.entries(workflowCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topOperations = Object.entries(operationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Trend
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (records.length > prevRecords.length * 1.1) trend = 'up';
    else if (records.length < prevRecords.length * 0.9) trend = 'down';

    return {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      totalExecutions: records.length,
      successRate: records.length > 0 ? (successCount / records.length) * 100 : 0,
      avgDuration: records.length > 0 ? totalDuration / records.length : 0,
      timeSaved,
      topWorkflows,
      topOperations,
      peakHour,
      trend,
    };
  }

  // Get usage heatmap
  getUsageHeatmap(days: number = 30): UsageHeatmap {
    const records = this.getRecords({ since: Date.now() - (days * 24 * 60 * 60 * 1000) });

    const hourly = new Array(24).fill(0);
    const daily = new Array(7).fill(0);
    const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

    for (const record of records) {
      const date = new Date(record.startedAt);
      const hour = date.getHours();
      const day = date.getDay();

      hourly[hour]++;
      daily[day]++;
      matrix[day][hour]++;
    }

    return { hourly, daily, matrix };
  }

  // Generate recommendations
  getRecommendations(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const summary = this.getSummaryStats(30);
    const records = this.getRecords({ limit: 1000 });

    // Low success rate warning
    if (summary.successRate < 90 && summary.totalExecutions > 10) {
      recommendations.push({
        id: 'low-success-rate',
        type: 'reliability',
        priority: 'high',
        title: 'Low Success Rate Detected',
        description: `Your automation success rate is ${summary.successRate.toFixed(1)}%. Consider reviewing failing workflows.`,
        actionable: 'Review failed executions in the logs',
      });
    }

    // Identify frequently failing items
    const failureCounts: Record<string, number> = {};
    for (const record of records) {
      if (!record.success) {
        const key = `${record.type}:${record.name}`;
        failureCounts[key] = (failureCounts[key] || 0) + 1;
      }
    }

    const topFailures = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [key, count] of topFailures) {
      if (count >= 5) {
        const [type, name] = key.split(':');
        recommendations.push({
          id: `frequent-failure-${key}`,
          type: 'reliability',
          priority: 'medium',
          title: `Frequently Failing ${type}`,
          description: `"${name}" has failed ${count} times recently.`,
          actionable: `Review and fix ${name}`,
          data: { type, name, failureCount: count },
        });
      }
    }

    // Slow execution warning
    for (const [type, stats] of Object.entries(summary.byType)) {
      if (stats.avgDuration > 30000 && stats.count > 5) { // > 30 seconds
        recommendations.push({
          id: `slow-${type}`,
          type: 'performance',
          priority: 'low',
          title: `Slow ${type} Executions`,
          description: `Average ${type} execution time is ${(stats.avgDuration / 1000).toFixed(1)}s.`,
          actionable: 'Consider optimizing long-running automations',
        });
      }
    }

    // Unused potential
    if (summary.totalExecutions < 10 && summary.totalExecutions > 0) {
      recommendations.push({
        id: 'low-usage',
        type: 'usage',
        priority: 'low',
        title: 'Underutilized Automation',
        description: 'You have few automations running. Set up more triggers or schedules.',
        actionable: 'Visit Scheduler to add automated triggers',
      });
    }

    // Time savings highlight
    if (summary.timeSaved > 3600) { // > 1 hour
      recommendations.push({
        id: 'time-saved',
        type: 'usage',
        priority: 'low',
        title: 'Great Time Savings!',
        description: `You saved approximately ${(summary.timeSaved / 3600).toFixed(1)} hours this month.`,
      });
    }

    return recommendations;
  }

  // Get performance metrics for specific workflow/operation
  getItemMetrics(type: string, name: string): {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    lastRun?: number;
    recentTrend: number[];
  } {
    const records = this.getRecords({ type }).filter(r => r.name === name);
    
    if (records.length === 0) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        recentTrend: [],
      };
    }

    const durations = records.filter(r => r.duration).map(r => r.duration!);
    const successes = records.filter(r => r.success).length;

    // Get trend (last 7 days execution counts)
    const recentTrend: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = Date.now() - ((i + 1) * 24 * 60 * 60 * 1000);
      const dayEnd = Date.now() - (i * 24 * 60 * 60 * 1000);
      const count = records.filter(r => r.startedAt >= dayStart && r.startedAt < dayEnd).length;
      recentTrend.push(count);
    }

    return {
      totalRuns: records.length,
      successRate: (successes / records.length) * 100,
      avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      lastRun: records[0]?.startedAt,
      recentTrend,
    };
  }

  // Export analytics data
  exportData(): {
    records: ExecutionRecord[];
    dailyStats: Record<string, DailyStats>;
    summary: any;
    exportedAt: number;
  } {
    return {
      records: this.getRecords(),
      dailyStats: this.dailyStore.get('data', {}) as Record<string, DailyStats>,
      summary: this.getSummaryStats(90),
      exportedAt: Date.now(),
    };
  }

  // Clear old data
  cleanup(): number {
    const config = this.getConfig();
    const cutoff = Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000);
    
    const records = this.recordStore.get('records', []) as ExecutionRecord[];
    const filtered = records.filter(r => r.startedAt > cutoff);
    const removed = records.length - filtered.length;
    
    this.recordStore.set('records', filtered);

    // Clean daily stats
    const dailyData = this.dailyStore.get('data', {}) as Record<string, DailyStats>;
    const cutoffDate = new Date(cutoff).toISOString().split('T')[0];
    
    for (const date of Object.keys(dailyData)) {
      if (date < cutoffDate) {
        delete dailyData[date];
      }
    }
    
    this.dailyStore.set('data', dailyData);

    return removed;
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const analyticsManager = new AnalyticsManager();

export function initializeAnalytics(): void {
  // IPC handlers
  ipcMain.handle('analytics:record', (_, record) => analyticsManager.recordExecution(record));
  ipcMain.handle('analytics:get-records', (_, options) => analyticsManager.getRecords(options));
  ipcMain.handle('analytics:get-summary', (_, days) => analyticsManager.getSummaryStats(days));
  ipcMain.handle('analytics:get-daily', (_, start, end) => analyticsManager.getDailyStats(start, end));
  ipcMain.handle('analytics:get-weekly-digest', () => analyticsManager.getWeeklyDigest());
  ipcMain.handle('analytics:get-heatmap', (_, days) => analyticsManager.getUsageHeatmap(days));
  ipcMain.handle('analytics:get-recommendations', () => analyticsManager.getRecommendations());
  ipcMain.handle('analytics:get-item-metrics', (_, type, name) => analyticsManager.getItemMetrics(type, name));
  ipcMain.handle('analytics:export', () => analyticsManager.exportData());
  ipcMain.handle('analytics:cleanup', () => analyticsManager.cleanup());
  ipcMain.handle('analytics:get-config', () => analyticsManager.getConfig());

  // Run cleanup periodically (once per day)
  setInterval(() => {
    analyticsManager.cleanup();
  }, 24 * 60 * 60 * 1000);
}
