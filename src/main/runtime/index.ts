// ═══════════════════════════════════════════════════════════════════════════
// DEX - Runtime Module Index
// Phase 28: Backend Architecture Refinement
// Exports all runtime components
// ═══════════════════════════════════════════════════════════════════════════

export { coreRuntime, type AppState, type ShutdownReason, type SessionInfo } from './CoreRuntime';
export { actionEngine, type Action, type ActionResult, type ActionState } from './ActionEngine';
export { resourceManager, type ResourcePressure, type ResourceUsage } from './ResourceManager';
export { scheduler, type ScheduledTask, type TaskHandle, type TaskPriority } from './Scheduler';
export { errorClassifier, type ClassifiedError, type ErrorCategory, type RecoveryStrategy } from './ErrorClassifier';
export { hardenedPython, type PythonExecutionRequest, type PythonExecutionResult } from './HardenedPython';
export { observability, type Metric, type TimelineEvent, type PerformanceSnapshot } from './Observability';
