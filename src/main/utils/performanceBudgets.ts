// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Operation Performance Budgets
// ==========================================================================
// Defines every named operation and its allowed execution time.
// Used by PerformanceInstrument to detect and log violations.
// ==========================================================================

export type BudgetTier = 'critical' | 'fast' | 'standard' | 'background';

export interface OperationBudget {
  name: string;
  tier: BudgetTier;
  budgetMs: number;
}

// Critical path: target under 0.1ms
const CRITICAL_OPERATIONS: OperationBudget[] = [
  { name: 'shortcut-detect', tier: 'critical', budgetMs: 0.1 },
  { name: 'shortcut-route', tier: 'critical', budgetMs: 0.1 },
  { name: 'ipc-dispatch-renderer-to-main', tier: 'critical', budgetMs: 0.1 },
  { name: 'db-read-single-row-pk', tier: 'critical', budgetMs: 0.1 },
  { name: 'clipboard-read', tier: 'critical', budgetMs: 0.1 },
  { name: 'active-window-title-read', tier: 'critical', budgetMs: 0.1 },
  { name: 'plugin-event-dispatch', tier: 'critical', budgetMs: 0.1 },
];

// Fast: target under 1ms
const FAST_OPERATIONS: OperationBudget[] = [
  { name: 'db-read-100-rows', tier: 'fast', budgetMs: 1 },
  { name: 'file-stat-single', tier: 'fast', budgetMs: 1 },
  { name: 'json-parse-under-10kb', tier: 'fast', budgetMs: 1 },
  { name: 'theme-css-var-update', tier: 'fast', budgetMs: 1 },
  { name: 'dropdown-open-render', tier: 'fast', budgetMs: 1 },
  { name: 'context-menu-open-render', tier: 'fast', budgetMs: 1 },
  { name: 'app-navigation-state-restore', tier: 'fast', budgetMs: 1 },
  { name: 'intelligence-api-lookup', tier: 'fast', budgetMs: 1 },
  { name: 'event-bus-route', tier: 'fast', budgetMs: 1 },
  { name: 'motion-request', tier: 'fast', budgetMs: 1 },
];

// Standard: target under 16ms (60fps frame)
const STANDARD_OPERATIONS: OperationBudget[] = [
  { name: 'db-read-1000-rows', tier: 'standard', budgetMs: 16 },
  { name: 'full-view-render', tier: 'standard', budgetMs: 16 },
  { name: 'timeline-reflow', tier: 'standard', budgetMs: 16 },
  { name: 'search-results-render-50', tier: 'standard', budgetMs: 16 },
  { name: 'notification-display', tier: 'standard', budgetMs: 16 },
  { name: 'keystroke-to-screen', tier: 'standard', budgetMs: 16 },
  { name: 'auto-height-calc', tier: 'standard', budgetMs: 16 },
  { name: 'search-filter-under-1000', tier: 'standard', budgetMs: 16 },
];

// Background: no UI budget, run on worker threads
const BACKGROUND_OPERATIONS: OperationBudget[] = [
  { name: 'file-transfer', tier: 'background', budgetMs: Infinity },
  { name: 'db-write', tier: 'background', budgetMs: Infinity },
  { name: 'analytics-compute', tier: 'background', budgetMs: Infinity },
  { name: 'learning-analysis', tier: 'background', budgetMs: Infinity },
  { name: 'thumbnail-generate', tier: 'background', budgetMs: Infinity },
  { name: 'encryption-operation', tier: 'background', budgetMs: Infinity },
  { name: 'hash-compute', tier: 'background', budgetMs: Infinity },
  { name: 'plugin-handler-execute', tier: 'background', budgetMs: 50 },
];

export const ALL_BUDGETS: OperationBudget[] = [
  ...CRITICAL_OPERATIONS,
  ...FAST_OPERATIONS,
  ...STANDARD_OPERATIONS,
  ...BACKGROUND_OPERATIONS,
];

const budgetMap = new Map<string, OperationBudget>();
for (const b of ALL_BUDGETS) {
  budgetMap.set(b.name, b);
}

export function getBudget(operationName: string): OperationBudget | undefined {
  return budgetMap.get(operationName);
}

export function getBudgetMs(operationName: string): number {
  return budgetMap.get(operationName)?.budgetMs ?? 16;
}

export function isCriticalPath(operationName: string): boolean {
  const b = budgetMap.get(operationName);
  return b?.tier === 'critical';
}

export function isFastPath(operationName: string): boolean {
  const b = budgetMap.get(operationName);
  return b?.tier === 'critical' || b?.tier === 'fast';
}
