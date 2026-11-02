// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- Services Index
 * ===========================================================================
 * 
 * Central export for all system services.
 * ===========================================================================
 */

// System Services
export {
  // Types
  type ServiceStatus,
  type ResourceBudget,
  type FileOperation,
  type NetworkRequest,
  type MediaSession,
  type SearchResult,
  type PermissionRequest,
  type SystemEvent,
  
  // Service stores
  useFileService,
  useNetworkService,
  useMediaService,
  useSearchService,
  useSessionService,
  usePermissionService,
  usePowerService,
  useSystemEvents,
  
  // Utilities
  getSystemServicesStatus,
  type SystemServicesStatus,
} from './SystemServices';

// Lifecycle Manager
export {
  // Types
  type LifecycleState,
  type FunctionalState,
  type AppProcess,
  type LifecycleTransition,
  type MemoryPressure,
  
  // Store
  useLifecycleManager,
  
  // Hooks
  useForegroundProcess,
  useActiveProcesses,
  useProcess,
  useMemoryPressure,
} from './LifecycleManager';

// Error Boundary & Isolation
export {
  // Components
  AppErrorBoundary,
  ProcessIsolation,
  
  // Types
  type CrashReport,
  
  // Utilities
  submitCrashReport,
  getCrashReports,
  clearCrashReports,
} from './ErrorBoundary';

// Performance Monitor
export {
  // Types
  type PerformanceMetrics,
  type AppResourceMetrics,
  type PerformanceAlert,
  
  // Store
  usePerformanceMonitor,
  
  // Hooks
  useSystemMetrics,
  useAppResourceMetrics,
  useSystemHealth,
  usePerformanceAlerts,
  useResourceBudget,
  
  // Components
  PerformancePanel,
} from './PerformanceMonitor';

// Integrity Monitor
export {
  // Types
  type CheckType,
  type IntegrityCheckResult,
  type IntegrityCheck,
  type DiagnosticReport,
  
  // Store
  useIntegrityMonitor,
  
  // Hooks
  useIntegrityHealth,
  useCheckResult,
  useFailedChecks,
  
  // Components
  IntegrityPanel,
} from './IntegrityMonitor';

// Pattern Learning (Local-only, background)
export {
  usePatternLearning,
  useAppTracking,
  type Suggestion,
  type FrequentItem,
} from './usePatternLearning';

// Engagement System
export {
  loadEngagement,
  saveEngagement,
  recordSessionStart,
  recordAppUsage,
  incrementStat,
  checkAchievements,
  getTipOfDay,
  getTotalPoints,
  getUserRank,
  ACHIEVEMENTS,
  TIPS,
  type Achievement,
  type UserStats,
  type EngagementState,
} from './engagement';

// Daily Challenges System
export {
  loadChallenges,
  saveChallenges,
  rollNewDay,
  recordChallengeProgress,
  getChallengeLevel,
  CHALLENGE_POOL,
  type Challenge,
  type ChallengeCondition,
  type DailyChallengeState,
  type ActiveChallenge,
} from './dailyChallenges';

// Performance Optimization (Hardware-Aware)
export {
  usePerformanceOptimization,
  safeGetContext2D,
  safeGetWebGLContext,
  registerContextLossHandlers,
  createManagedRAF,
  startInputActivityReporting,
} from './PerformanceOptimization';
