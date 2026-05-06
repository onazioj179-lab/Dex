// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Core Module Exports
// Phase 15-16: Optimization & Security Systems
// Phase 47: Safe Mode & Startup Protection
// Phase 1 (Patch): Stability Systems (Immediate Patch Cycle)
// ULTRA-LOW RESOURCE MODE
// ===========================================================================

// ===========================================================================
// Phase 1 Stability Systems (Immediate Patch Cycle)
// Makes Dex boringly reliable. No crashes. No data loss. No surprises.
// ===========================================================================

export {
  phase1Integration,
  initializePhase1,
  shutdownPhase1,
  getPhase1Status,
  getPhase1Report,
  isPhase1Healthy,
  stabilityCore,
  permissionGuard,
  automationStabilityGuard,
  memoryLeakPrevention,
  searchCorrectnessManager,
  type Phase1Status,
  type Phase1Report,
} from './Phase1Integration';

export {
  type StabilityEventType,
  type StabilityEvent,
  type StabilityConfig,
  type StabilityStats,
} from './StabilityCore';

export {
  type PermissionState,
  type FeatureDependency,
  type PermissionGuardConfig,
} from './PermissionGuard';

export {
  initializeAutomationStability,
  type AutomationLock,
  type ExecutionContext,
  type AutomationStabilityConfig,
  type TriggerEvent,
} from './AutomationStabilityGuard';

export {
  initializeMemoryLeakPrevention,
  type LeakDetectionResult,
  type ResourceTracker,
  type MemorySnapshot,
  type LeakPreventionConfig,
} from './MemoryLeakPrevention';

export {
  initializeSearchCorrectness,
  type SearchCacheEntry,
  type SearchResultWithMeta,
  type SearchIndexState,
  type SearchCorrectnessConfig,
  type SearchQuality,
} from './SearchCorrectness';

// ===========================================================================

// Safe Mode & Startup Protection (Phase 47)
export { safeMode, type SafeModeState, type StartupStage } from './SafeMode';
export { startupManager, type StartupConfig } from './StartupManager';

//  Resource Governor (ULTRA-LOW MODE)
export {
  resourceGovernor,
  HARD_LIMITS,
  type ResourcePressure,
  type ThrottleLevel,
  type ResourceSnapshot,
  type SubsystemBudget,
} from './ResourceGovernor';

// Xenon - Background Resource Optimizer
export { xenon, initializeXenon, shutdownXenon } from './Xenon';

// Memory Management
export { 
  memoryManager, 
  BoundedCache, 
  WeakCache, 
  BufferPool, 
  bufferPool,
  type CacheOptions,
  type MemoryStats,
  type MemoryManagerOptions,
} from './MemoryManager';

// Background Tasks
export {
  backgroundTasks,
  scheduleIdleWork,
  processBatch,
  type BackgroundTask,
  type TaskPriority,
} from './BackgroundTasks';

// Execution Optimization
export {
  ipcBatcher,
  renderBatcher,
  StateCoalescer,
  hotPathProfiler,
  deterministicExecutor,
  DeterministicExecutor,
} from './ExecutionOptimizer';

// Search & Indexing
export {
  searchIndexer,
  type SearchableItem,
  type SearchResult,
} from './SearchIndexer';

// Python Execution
export {
  pythonExecutor,
  pythonOps,
  type PythonExecutionOptions,
  type PythonExecutionResult,
} from './PythonExecutor';

// Error Recovery
export {
  errorRecovery,
  ErrorCodes,
  validateNotNull,
  validateString,
  validateNumber,
  validateArray,
  safeExecute,
  safeExecuteSync,
  type DexError,
  type ErrorSeverity,
  type RecoveryAction,
} from './ErrorRecovery';

// Encryption
export {
  encryptionService,
  type EncryptionConfig,
  type EncryptedData,
} from './EncryptionService';

// ===========================================================================
// Phase 17-18: Security Lockdown & Long-Term Trust
// ===========================================================================

// Security Audit
export {
  securityAudit,
  type AuditEntry,
  type AuditCategory,
  type AuditSeverity,
  type SecurityFinding,
  type SecurityReport,
} from './SecurityAudit';

// Permission Lockdown
export {
  permissionLockdown,
  PERMISSION_MAP,
  type PermissionDefinition,
  type PermissionState as LockdownPermissionState,
  type RestrictedModeConfig,
} from './PermissionLockdown';

// Architecture Contract
export {
  architectureContract,
  SCHEMA_VERSION,
  MIN_SUPPORTED_VERSION,
  DATA_FORMAT_VERSION,
  FROZEN_SCHEMAS,
  IPC_CONTRACTS,
  type SchemaDefinition,
  type SchemaField,
  type MigrationDefinition,
  type CompatibilityResult,
  type IPCContract,
} from './ArchitectureContract';

// Data Integrity
export {
  dataIntegrity,
  type IntegrityStatus,
  type WriteTransaction,
  type RecoveryResult,
} from './DataIntegrity';

// Human Errors
export {
  humanErrors,
  type HumanError,
  type HumanErrorType,
} from './HumanErrors';

// Performance Guardian
export {
  performanceGuardian,
  type PerformanceBudget,
  type PerformanceSnapshot,
  type PerformanceAlert,
  type PerformanceReport,
} from './PerformanceGuardian';

// Extension Framework (Future-Safe)
export {
  extensionFramework,
  FORBIDDEN_PERMISSIONS,
  type ExtensionManifest,
  type ExtensionPermission,
  type InstalledExtension,
  type ExtensionStatus,
} from './ExtensionFramework';

// ===========================================================================
// PHASE 19-20: FILE MANAGEMENT, WORKFLOWS, AUTOMATION
// ===========================================================================

// File Manager
export {
  fileManager,
  type FileInfo,
  type FileOperation,
  type RenameRule,
  type BatchRenamePreview,
  type SortCriteria,
  type ScopeConfig,
} from './FileManager';

// Document Creator
export {
  documentCreator,
  type DocumentType,
  type DocumentTemplate,
  type DocumentRequest,
  type DocumentResult,
  type TableData,
} from './DocumentCreator';

// Task Queue
export {
  taskQueue,
  TaskChainBuilder,
  type TaskDefinition,
  type TaskResult,
  type QueuedTask,
  type TaskExecutor,
  type QueueStatus,
  type TaskStatus,
  type TaskPriority as QueueTaskPriority,
} from './TaskQueue';

// External Connectors
export {
  externalConnectors,
  type ConnectorType,
  type ConnectorStatus,
  type AccessLevel,
  type ConnectorConfig,
  type ConnectorInfo,
  type ConnectorFile,
  type ConnectorOperation,
} from './ExternalConnectors';

// Browser Bridge
export {
  browserBridge,
  type BridgeStatus,
  type BrowserConnection,
  type WebAction,
  type PageContent,
  type PairingRequest,
} from './BrowserBridge';

// Workflow Graph
export {
  WorkflowGraph,
  WorkflowBuilder,
  PRESET_WORKFLOWS,
  type NodeType,
  type NodeStatus,
  type WorkflowInput,
  type WorkflowOutput,
  type WorkflowNode,
  type WorkflowEdge,
  type Workflow,
  type WorkflowExecution,
  type ExecutionLogEntry,
} from './WorkflowGraph';

// Workflow Engine
export {
  workflowEngine,
  type ExecutionOptions,
  type NodeExecutor,
  type ExecutionContext as WorkflowExecutionContext,
} from './WorkflowEngine';

// ===========================================================================
// PHASE 41-42: CUSTOMIZATION, THEMING & OPTIMIZATION
// ===========================================================================

// Dashboard Widget System
export {
  dashboardWidgetSystem,
  type WidgetType,
  type WidgetPosition,
  type WidgetConfig,
  type DashboardLayout,
  type QuickButton,
  type WidgetTemplate,
} from './DashboardWidgetSystem';

// Theme System
export {
  themeSystem,
  type ThemeMode,
  type ThemeConfig,
  type ThemeTokens,
} from './ThemeSystem';

// Media Workspace
export {
  mediaWorkspace,
  type MediaType,
  type MediaInfo,
  type MediaMetadata,
  type PreviewOptions,
  type MediaPreviewResult,
} from './MediaWorkspace';

// Usage Learning Engine
export {
  usageLearningEngine,
  type UsagePattern,
  type FeatureUsageData,
  type LearningConfig,
  type PredictionResult,
} from './UsageLearningEngine';

// Power Efficiency Manager
export {
  powerEfficiencyManager,
  type EfficiencyMode,
  type PowerStatus,
  type EfficiencyConfig,
  type ResourceLimits,
} from './PowerEfficiencyManager';

// Background Mode Controller
export {
  backgroundModeController,
  type BackgroundState,
  type BackgroundConfig,
  type BackgroundStatus,
  type ScheduledTask,
} from './BackgroundModeController';

// System Advisory Service
export {
  systemAdvisoryService,
  type AdvisoryType,
  type AdvisoryPriority,
  type Advisory,
  type AdvisoryConfig,
} from './SystemAdvisoryService';
// ===========================================================================
// PHASE 43-45: MATURITY, GOVERNANCE & OPERATIONAL HARDENING
// ===========================================================================

// Pattern Detection Engine
export {
  patternDetectionEngine,
  type PatternType,
  type PatternDetectionConfig,
  type DetectedPattern,
  type TimePattern,
  type WorkflowSequence,
  type PatternSummary,
} from './PatternDetectionEngine';

// Workflow Intelligence
export {
  workflowIntelligence,
  type SuggestionType,
  type WorkflowSuggestion,
  type WorkflowIntelligenceConfig,
  type CommandRanking,
  type ParameterHistory,
} from './WorkflowIntelligence';

// Self-Healing Manager
export {
  selfHealingManager,
  type HealthStatus,
  type StateCheckpoint,
  type CorruptionReport,
  type SelfHealingConfig,
  type HealthReport,
} from './SelfHealingManager';

// Longevity Guardian
export {
  longevityGuardian,
  type LongevityConfig,
  type ResourceBaseline,
  type DriftReport,
  type LongevityStats,
  type OrphanedTask,
} from './LongevityGuardian';

// Governance Framework
export {
  governanceFramework,
  type PermissionDefinition as GovernancePermissionDef,
  type PermissionGrant,
  type DataRetentionPolicy,
  type GovernanceConfig,
  type ComplianceStatus,
} from './GovernanceFramework';

// Performance Contract
export {
  performanceContract,
  type PerformanceGuarantee,
  type PerformanceViolation,
  type PerformanceSnapshot as ContractSnapshot,
  type ContractConfig,
} from './PerformanceContract';

// Failure Containment
export {
  failureContainment,
  type FaultDomain,
  type FaultSeverity,
  type Fault,
  type DomainStatus,
  type FailureContainmentConfig,
  type SafeModeConfig,
} from './FailureContainment';

// PHASE 46: Voice Control (Opt-In)
export {
  voiceControlEngine,
  type ActivationMethod,
  type VoiceState,
  type VoiceControlConfig,
  type VoiceSession,
  type VoiceLogEntry,
  type MicrophoneStatus,
} from './VoiceControlEngine';

export {
  voiceCommandProcessor,
  type CommandCategory,
  type CommandRisk,
  type ParsedCommand,
  type CommandResult,
  type CommandPattern,
} from './VoiceCommandProcessor';

export {
  voiceScopeManager,
  VOICE_SCOPES,
  type VoiceScope,
  type ConfirmationLevel,
  type ScopeDefinition,
  type VoiceScopeConfig,
  type VoiceScopeStatus,
} from './VoiceScopeManager';

export {
  voiceFeedbackSystem,
  type FeedbackType,
  type FeedbackConfig,
  type FeedbackMessage,
} from './VoiceFeedbackSystem';

// ===========================================================================
// PHASE 69: SYSTEM INTELLIGENCE, ACCURACY & FINAL CONSOLIDATION
// ===========================================================================

// Single Source of Truth State Layer
export {
  StateAccuracyLayer,
  type StateDomain,
  type StateEntry,
  type StateSnapshot,
  type StateTransaction,
} from './StateAccuracyLayer';

// Optimistic UI Updates
export {
  OptimisticUpdateManager,
  type OperationType,
  type OptimisticOperation,
  type OperationResult,
} from './OptimisticUpdateManager';

// Context Intelligence (Non-AI Pattern Awareness)
export {
  ContextIntelligenceService,
  type UsageRecord,
  type UsageStats,
  type ContextHint,
} from './ContextIntelligenceService';

// Error Guardrails & Undo
export {
  ErrorGuardrails,
  type ActionSeverity,
  type UndoableAction,
  type ActionPreview,
  type GuardrailConfig,
} from './ErrorGuardrails';

// Performance Budget Manager (Hard Limits)
export {
  PerformanceBudgetManager,
  type BudgetDomain,
  type Budget,
  type BudgetRequest,
  type BudgetResponse,
  type BudgetViolation,
} from './PerformanceBudgetManager';

// Long-Session Reliability Monitor
export {
  ReliabilityMonitor,
  type MemorySnapshot as ReliabilityMemorySnapshot,
  type StabilityMetrics,
  type LeakCandidate,
  type HealthCheck,
} from './ReliabilityMonitor';

// Visual Consistency Lock (Final Design Tokens)
export {
  VisualConsistencyLock,
  type DesignToken,
  type TokenCategory,
  type VisualRule,
  type ConsistencyViolation,
} from './VisualConsistencyLock';

// Behavior Predictability (Deterministic Contracts)
export {
  BehaviorPredictabilityLayer,
  type BehaviorContract,
  type BehaviorExecution,
  type DeterminismViolation,
} from './BehaviorPredictabilityLayer';

// Failure Path Finalization (Graceful Errors)
export {
  FailurePathHandler,
  type ErrorDefinition,
  type FailureContext,
  type FailureRecord,
  type RecoveryResult as FailureRecoveryResult,
  type RecoveryStrategy,
} from './FailurePathHandler';

// ===========================================================================
// USER-REQUESTED, HIGH-VALUE FEATURES (DONE RIGHT)
// ===========================================================================

// Universal Search Hub - One search box finds everything
export {
  UniversalSearchHub,
  type SearchCategory,
  type SearchResult as UniversalSearchResult,
  type SearchProvider,
  type SearchAction,
  type SearchConfig,
} from './UniversalSearchHub';

// Instant File Preview - View files without external apps
export {
  InstantFilePreview,
  type PreviewType,
  type PreviewResult as FilePreviewResult,
  type PreviewMetadata,
} from './InstantFilePreview';

// Large File Reader - GB-scale files with chunked reads
export {
  LargeFileReader,
  type ChunkRequest,
  type ChunkResult,
  type FileSession,
  type LargeFileConfig,
} from './LargeFileReader';

// Background Activity Monitor - Transparency for all operations
export {
  BackgroundActivityMonitor,
  type ActivityType,
  type ActivityStatus,
  type Activity,
  type ActivitySummary,
} from './BackgroundActivityMonitor';

// Activity History Tracker - See what happened, undo safely
export {
  ActivityHistoryTracker,
  type HistoryEventType,
  type HistoryEvent,
  type HistoryFilter,
  type HistoryStats,
} from './ActivityHistoryTracker';

// True Idle Mode - Near-zero resources when idle
export {
  TrueIdleMode,
  type IdleState,
  type IdleConfig,
  type IdleStatus,
  type ManagedTimer,
} from './TrueIdleMode';

// Keyboard Command System - Everything reachable by keyboard
export {
  KeyboardCommandSystem,
  type KeyScope,
  type KeyBinding,
  type KeyBindingGroup,
  type KeyConfig,
} from './KeyboardCommandSystem';

// Batch Action Previewer - Safe batch operations with preview
export {
  BatchActionPreviewer,
  type BatchActionType,
  type BatchStatus,
  type BatchItem,
  type BatchPreview,
  type BatchProgress,
  type RenamePattern,
  type OrganizeOptions,
} from './BatchActionPreviewer';

// ===========================================================================
// ADVANCED POWER + SECURITY MILESTONE
// ===========================================================================

// Workspace Snapshot - Full workspace snapshot and restore
export {
  WorkspaceSnapshot,
  type WindowState,
  type TabState,
  type PanelState,
  type WorkspaceState,
  type Snapshot,
  type SnapshotConfig,
} from './WorkspaceSnapshot';

// Global Undo History - Undo across files, actions, workflows
export {
  GlobalUndoHistory,
  type UndoActionType,
  type UndoEntry,
  type UndoGroup,
  type UndoConfig,
  type UndoFilter,
} from './GlobalUndoHistory';

// Context Quick Actions - Context-based quick actions
export {
  ContextQuickActions,
  type ContextType,
  type ActionCategory,
  type QuickAction,
  type ActionContext,
  type ContextItem,
} from './ContextQuickActions';

// Folder Rules Engine - Folder-level rules with preview
export {
  FolderRulesEngine,
  type RuleTrigger,
  type RuleCondition,
  type RuleAction,
  type FolderRule,
  type RulePreview,
  type RuleExecutionResult,
} from './FolderRulesEngine';

// File Change Timeline - Version tracking with diff preview
export {
  FileChangeTimeline,
  type ChangeType,
  type FileChange,
  type FileVersion,
  type DiffLine,
  type DiffResult,
  type FolderDiffResult,
} from './FileChangeTimeline';

// Smart Duplicate Detector - Safe duplicate detection
export {
  SmartDuplicateDetector,
  type DuplicateType,
  type DuplicateFile,
  type DuplicateGroup,
  type ScanResult,
  type ScanConfig,
} from './SmartDuplicateDetector';

// Secure Vault System - Encrypted folder isolation
export {
  SecureVaultSystem,
  type VaultStatus,
  type VaultFile,
  type Vault,
  type VaultConfig,
  type IntegrityCheck,
} from './SecureVaultSystem';

// Panic Lockdown System - One-click full lockdown
export {
  PanicLockdownSystem,
  type LockdownLevel,
  type BootMode,
  type PermissionScope,
  type FeatureToggle,
  type LockdownState,
  type SafeModeState as LockdownSafeModeState,
  type SecurityConfig,
  type ActivityPolicy,
} from './PanicLockdownSystem';

// ===========================================================================
// OS-LEVEL FEATURES (SYSTEM 2 & 3)
// Stay inside DEX for daily work
// ===========================================================================

// Clipboard History Manager - Full clipboard history with search
export {
  ClipboardHistoryManager,
  type ClipboardItemType,
  type ClipboardItem,
  type ClipboardConfig,
  type ClipboardFilter,
  type ClipboardStats,
} from './ClipboardHistoryManager';

// App Launcher & Switcher - Spotlight-like app launching
export {
  AppLauncherSwitcher,
  type AppCategory,
  type InstalledApp,
  type RunningApp,
  type AppLaunchResult,
  type AppSearchResult,
  type LauncherConfig,
} from './AppLauncherSwitcher';

// Split View System - Multi-pane layouts
export {
  SplitViewSystem,
  type SplitDirection,
  type PanePosition,
  type Pane,
  type SplitNode,
  type Layout,
  type SplitViewConfig,
  type PaneState,
} from './SplitViewSystem';

// Notes System - Built-in notes with folders & attachments
export {
  NotesSystem,
  type NoteType,
  type NoteStatus,
  type Note,
  type NoteFolder,
  type NoteAttachment,
  type ChecklistItem,
  type NoteVersion,
  type NotesConfig,
  type NoteFilter,
  type NotesStats,
} from './NotesSystem';

// Task & Reminder System - OS-level task management
export {
  TaskReminderSystem,
  type TaskPriority as ReminderTaskPriority,
  type TaskStatus as ReminderTaskStatus,
  type RecurrenceType,
  type Task,
  type Subtask,
  type Reminder,
  type RecurrenceRule,
  type TaskList,
  type TaskFilter,
  type TasksConfig,
  type TaskStats,
} from './TaskReminderSystem';

// Audio Player System - Apple Music-level audio player
export {
  AudioPlayerSystem,
  type PlaybackState,
  type RepeatMode,
  type ShuffleMode,
  type AudioMetadata,
  type AudioTrack,
  type Playlist as AudioPlaylist,
  type SmartPlaylistRule,
  type PlaybackPosition as AudioPlaybackPosition,
  type AudioEqualizerPreset,
  type AudioConfig,
  type QueueState,
  type PlayerStats,
} from './AudioPlayerSystem';

// Video Player System - Apple TV-level video player
export {
  VideoPlayerSystem,
  type VideoPlaybackState,
  type VideoRepeatMode,
  type SubtitleTrack,
  type AudioTrackInfo,
  type VideoMetadata,
  type VideoFile,
  type VideoPlaylist,
  type PlaybackPosition as VideoPlaybackPosition,
  type VideoConfig,
  type VideoQueueState,
  type VideoStats,
} from './VideoPlayerSystem';

// Unified Media Timeline - Cross-media timeline
export {
  UnifiedMediaTimeline,
  type MediaType as TimelineMediaType,
  type TimelineView,
  type SortOrder,
  type MediaItem,
  type MediaCollection,
  type SmartCollectionRule as TimelineSmartRule,
  type TimelineEvent,
  type TimelineRange,
  type MediaFilter,
  type TimelineConfig,
  type MediaStats,
} from './UnifiedMediaTimeline';

// Text & Code Editor - Built-in editor for all file types
export {
  TextCodeEditor,
  type EditorTheme,
  type IndentStyle,
  type LineEnding,
  type EditorPosition,
  type EditorSelection,
  type EditorDocument,
  type SearchResult as EditorSearchResult,
  type SearchOptions,
  type ReplaceOptions,
  type LanguageConfig,
  type EditorConfig,
  type EditorStats,
} from './TextCodeEditor';

// File Tagging & Labeling System - Non-destructive metadata
export {
  FileTaggingSystem,
  getLabelColor,
  getAllLabelColors,
  type LabelColor,
  type Tag,
  type FileMetadata,
  type TagFilter,
  type TagStats,
  type TaggingConfig,
} from './FileTaggingSystem';

// Notification & Activity Center - Quiet activity stream
export {
  NotificationCenter,
  type NotificationType,
  type NotificationCategory,
  type NotificationPriority,
  type NotificationAction,
  type DexNotification,
  type NotificationFilter,
  type NotificationConfig,
  type NotificationGroup,
  type NotificationStats,
} from './NotificationCenter';

// ===========================================================================
// SYSTEM 3 -- MEDIA & CREATION CORE
// ===========================================================================

// Universal Media Engine - Single engine for all media types
export {
  UniversalMediaEngine,
  type MediaEngineType,
  type EngineState,
  type DecodeMode,
  type MediaSource,
  type StreamChunk,
  type EngineCapabilities,
  type PlaybackOptions,
  type RenderRequest,
  type RenderResult,
  type EngineStats,
  type EngineConfig,
  type FormatSupport,
} from './UniversalMediaEngine';

// Floating Media Controls - Context-aware overlay
export {
  FloatingMediaControls,
  type MediaContextType,
  type ControlsPosition,
  type ControlsVisibility,
  type MediaPlaybackState,
  type TrackInfo,
  type ControlsState,
  type ControlAction,
  type ControlsConfig,
  type ControlsLayout,
} from './FloatingMediaControls';

// Gallery Viewer - Premium image gallery with virtualization
export {
  GalleryViewer,
  type GalleryViewMode,
  type SortField,
  type SortDirection,
  type GalleryImage,
  type ImageMetadata,
  type GalleryFolder,
  type GallerySelection,
  type GalleryFilter,
  type GallerySort,
  type VirtualizedRange,
  type GalleryStats,
  type GalleryConfig,
} from './GalleryViewer';

// Gallery Editor - Non-destructive light editing
export {
  GalleryEditor,
  type EditOperation,
  type FlipDirection,
  type RotationAngle,
  type CropRegion,
  type ImageAdjustments,
  type ImageTransform,
  type ResizeOptions,
  type EditState,
  type EditHistoryEntry,
  type PreviewResult,
  type SaveOptions,
  type SaveResult,
  type EditorConfig as GalleryEditorConfig,
  type MetadataUpdate,
} from './GalleryEditor';

// Media Organization - Tagging, grouping, project linking
export {
  MediaOrganization,
  TAG_COLORS,
  type MediaOrgType,
  type GroupType,
  type MediaTag,
  type MediaGroup,
  type ProjectLink,
  type OrganizedMedia,
  type MediaFilter as MediaOrgFilter,
  type OrganizationStats,
  type OrganizationConfig,
} from './MediaOrganization';

// ===========================================================================
// SYSTEM 5: Security Hardening & Trust Foundation
// "Make Dex safe enough to trust as OS-level tool"
// ===========================================================================

// Encrypted Local Logs - Local-only encrypted logging with search
export {
  EncryptedLocalLogs,
  type LogLevel,
  type LogEntry,
  type LogFilter,
  type LogConfig,
} from './EncryptedLocalLogs';

// Clean Uninstall System - Complete removal with data export
export {
  CleanUninstallSystem,
  type TrackedFile,
  type UninstallResult,
  type UninstallConfig,
} from './CleanUninstallSystem';

// Privacy Shield - Network privacy, telemetry blocking, data flow rules
export {
  PrivacyShield,
  type DataFlowRule,
  type PrivacyConfig,
} from './PrivacyShield';

// Network Guard - Network mode control and connection tracking
export {
  NetworkGuard,
  type NetworkMode,
  type NetworkPolicy,
  type NetworkConfig,
} from './NetworkGuard';

// Security Self-Test - Integrity checks and periodic testing
export {
  SecuritySelfTest,
  type SecurityTest,
  type TestResult,
  type SelfTestConfig,
} from './SecuritySelfTest';

// ===========================================================================
// SYSTEM 6: Reliability, Stability, Final Lock
// "Make Dex run for days/weeks/years without degradation"
// ===========================================================================

// Crash Recovery System - Silent crash handling and auto-recovery
export {
  CrashRecoverySystem,
  type CrashType,
  type SessionState,
  type RecoveryConfig,
} from './CrashRecoverySystem';

// State Repair System - State validation, auto-repair, backups
export {
  StateRepairSystem,
  type StateFile,
  type RepairAction,
  type RepairConfig,
} from './StateRepairSystem';

// Battery Aware Operation - Power-aware throttling and operation control
export {
  batteryAwareOperation,
  type PowerProfile,
  type ProfileRestrictions,
  type BatteryStatus,
  type BatteryConfig,
} from './BatteryAwareOperation';

// Update Stability Mode - Safe updates with rollback capability
export {
  updateStabilityMode,
  type UpdatePhase,
  type UpdateManifest,
  type BackupManifest,
  type UpdateHistory,
  type UpdateConfig,
} from './UpdateStabilityMode';

// Maintenance Mode Lock - THE FINAL LOCK - Maintenance-first mode
export {
  maintenanceModeLock,
  type MaintenanceLevel,
  type MaintenanceWindow,
  type FeatureGate,
  type HealthMetrics,
  type ChangeRecord,
} from './MaintenanceModeLock';

// ===========================================================================
// END OF CORE SYSTEMS
// NO FURTHER CORE SYSTEMS AFTER SYSTEM 6
// Dex enters maintenance-first mode
// ===========================================================================

// ===========================================================================
// OS-LEVEL FEATURE LAYER  (70 features)
// Lightweight operating environment beneath every inner app
// ===========================================================================

// Features 1-4: Memory Compression, Pressure Monitor, App Nap, Buffer Pool
export {
  sharedBufferPool,
  memoryCompression,
  memoryPressureMonitor,
  appNapManager,
  initializeMemoryCompression,
  shutdownMemoryCompression,
  initializeMemoryPressureMonitor,
  shutdownMemoryPressureMonitor,
  initializeAppNap,
  shutdownAppNap,
  type MemoryPressureLevel,
} from './MemoryCompression';

// Features 5-10: QoS Scheduler, CPU Monitor, Thermal, Suspension, Boost, Work-Stealing
export {
  processScheduler,
  initializeProcessScheduler,
  shutdownProcessScheduler,
  type QoSClass,
  type ScheduledWork,
  type CpuSnapshot,
  type ThermalState,
} from './ProcessScheduler';

// Features 11-18: Atomic Writes, Clone, Watch, Snapshots, Hotfile, Media Cache, Chunked, Dedup
export {
  fileWatchCoordinator,
  snapshotManager,
  hotfilePreLoader,
  mediaBufferCache,
  contentDeduplicator,
  atomicWriteFile,
  atomicWriteFileSync,
  cloneFile,
  readFileChunked,
  initializeStorageEngine,
  shutdownStorageEngine,
} from './StorageEngine';

// Features 19-27: Key Vault, Integrity, Sandbox, DB Encryption, IPC Validation, Signed Exports, Capabilities, Audit, Refs
export {
  secureKeyVault,
  runtimeIntegrity,
  pluginSandbox,
  databaseEncryption,
  ipcValidation,
  signedExports,
  capabilityAccess,
  auditLog,
  referenceValidator,
  safeDeref,
  safeAccess,
  safeArrayAccess,
  validateRef,
  isValidRef,
  initializeSecurityKernel,
  shutdownSecurityKernel,
  type PluginCapability,
  type AuditLogEntry,
} from './SecurityKernel';

// Features 28-32: Battery, Idle States, Display Sleep, Suspend/Resume, Charge-State Pre-Compute
export {
  powerManager,
  initializePowerManager,
  shutdownPowerManager,
  type PowerSource,
  type BatteryState,
  type IdleTier,
} from './PowerManagement';

// Features 33-35: Network QoS, Background Transfers, Local Discovery
export {
  networkQoS,
  backgroundTransfers,
  serviceDiscovery,
  initializeNetworkManager,
  shutdownNetworkManager,
  type NetworkPriority,
  type PersistentTransfer,
} from './NetworkManager';

// Features 36-39: Adaptive Refresh, Compositing, Render Batching, Offscreen Pre-Render
export {
  adaptiveRefresh,
  compositingLayers,
  renderBatcher as renderingBatcher,
  offscreenPreRenderer,
  initializeRenderingEngine,
  shutdownRenderingEngine,
  type DisplayInfo,
} from './RenderingEngine';

// Features 40-41: Audio Device Monitor, Shared Audio Context
export {
  audioDeviceMonitor,
  sharedAudioContext,
  initializeAudioManager,
  shutdownAudioManager,
  type AudioDevice,
} from './AudioManager';

// Features 42-45: IPC Contracts, Worker Lifecycle, Distributed Events, Guaranteed Delivery
export {
  ipcContracts,
  workerLifecycle,
  distributedEvents,
  guaranteedDelivery,
  initializeIPCKernel,
  shutdownIPCKernel,
  type IPCCapability,
  type IPCContract as IPCKernelContract,
  type WorkerState,
  type DeliveryStatus,
} from './IPCKernel';

// Features 46-50: Classifier, Predictive Pre-Warm, Search Ranker, Proactive Prep, Usage Patterns
export {
  bayesClassifier,
  predictivePreWarmer,
  searchRanker,
  proactivePrep,
  usagePreLoader,
  initializeIntelligenceEngine,
  shutdownIntelligenceEngine,
  type RankedResult,
} from './IntelligenceEngine';

// Features 51-54: Crash Capture, Circular Log, Perf Sampling, Diagnostic Packaging
export {
  crashCapture,
  circularLogBuffer,
  performanceSampler,
  diagnosticPackager,
  initializeDiagnosticsEngine,
  shutdownDiagnosticsEngine,
  type CrashSnapshot,
  type LogBufferEntry,
} from './DiagnosticsEngine';

// Features 55-58: Staged Updates, Rollback, Silent Download, Module Patching
export {
  stagedUpdater,
  rollbackManager,
  silentDownloader,
  modulePatcher,
  initializeUpdateManager,
  shutdownUpdateManager,
  type UpdateStage,
  type RollbackPoint,
  type BackgroundDownload,
  type ModulePatch,
} from './UpdateManager';

// Features 59-60: Spell Check, Autocorrect
export {
  spellCheck,
  autocorrect,
  initializeTextServices,
  shutdownTextServices,
  type SpellCheckResult,
  type AutocorrectRule,
} from './TextServices';

// Features 61-62: Accessibility Events, Semantic UI Tree
export {
  accessibilityEvents,
  semanticUITree,
  initializeAccessibilityManager,
  shutdownAccessibilityManager,
  type AccessibilityEventType,
  type AccessibilityEvent,
  type UITreeNode,
  type UITreeSnapshot,
} from './AccessibilityManager';

// Features 63-70: Plugin Verify Cache, Assets, Tasks, Watchdog, Conflicts, Pre-Fetch, Credentials, Sessions
export {
  pluginVerificationCache,
  onDemandAssetLoader,
  backgroundTaskFramework,
  extensionWatchdog,
  conflictResolver,
  predictiveAssetPreFetcher,
  credentialStorage,
  sessionMigrator,
  initializeMiscSystems,
  shutdownMiscSystems,
  type PluginVerificationEntry,
  type AssetDescriptor,
  type BackgroundTask as MiscBackgroundTask,
  type TaskPriority as MiscTaskPriority,
  type ExtensionHealth,
  type ConflictStrategy,
  type ConflictRecord,
  type StoredCredential,
  type SessionState as MiscSessionState,
} from './MiscSystems';

// ===========================================================================
// END OF OS-LEVEL FEATURE LAYER
// ===========================================================================

// ===========================================================================
// BACKEND PERFORMANCE AND OPTIMIZATION LAYER (100 techniques)
// ===========================================================================

// --- Part 1: Performance Primitives (Techniques 10-14, 70-80) ---
export {
  ObjectPool,
  ipcMessagePool,
  eventObjectPool,
  logEntryPool,
  taskObjectPool,
  perfSamplePool,
  dbRowPool,
  TypedArrays,
  encodeIPCBinary,
  decodeIPCBinary,
  encodeEventBinary,
  decodeEventBinary,
  registerHandler,
  getHandler,
  invokeHandler,
  WeakRefCache,
  thumbnailPreviewCache,
  screenshotCache,
  analyticsResultCache,
  pluginDataCache,
  FLAG,
  hasFlag,
  setFlag,
  clearFlag,
  toggleFlag,
  setCapabilityTier,
  isFeatureAvailable,
  memoize,
  memoizedExtensionType,
  memoizedShortcutFormat,
  stringIntern,
  initializeFullObject,
  enforceHiddenClass,
  coerceToInt,
  coerceToFloat,
  coerceToString,
  coerceToBool,
  intDiv,
  intMod,
  intMin,
  intMax,
  intClamp,
  cachedLength,
  SOA,
  ActivityLogSOA,
  PerfSampleSOA,
  SearchScoreSOA,
  FixedPointTimeline,
  initializePerformancePrimitives,
  shutdownPerformancePrimitives,
} from './PerformancePrimitives';

// --- Part 2: Advanced Data Structures (Techniques 40-49) ---
export {
  Trie,
  BloomFilter,
  dbKeyExistenceFilter,
  urlVisitedFilter,
  duplicateEventFilter,
  pluginBlacklistFilter,
  SkipList,
  RadixTree,
  LRUCache,
  queryResultCache,
  thumbnailCache,
  rewindSnapshotCache,
  ipcResponseCache,
  routeHandlerCache,
  FibonacciHeap,
  SuffixAutomaton,
  LockFreeQueue,
  RingBuffer,
  logRingBuffer,
  eventRingBuffer,
  perfRingBuffer,
  InvertedIndex,
  CompactBitset,
  initializeAdvancedDataStructures,
  shutdownAdvancedDataStructures,
} from './AdvancedDataStructures';

// --- Part 3: Compression Codecs (Techniques 50-56) ---
export {
  lz4Compress,
  lz4Decompress,
  computeDelta,
  applyDelta,
  deltaEncode,
  deltaDecode,
  deltaEncodeInt32,
  deltaDecodeInt32,
  rleEncode,
  rleDecode,
  rleEncodeInt32,
  rleDecodeInt32,
  compressIPCPayload,
  decompressIPCPayload,
  compressIPCPayloadAsync,
  decompressIPCPayloadAsync,
  DictionaryCompressor,
  eventTypeDictionary,
  appNameDictionary,
  filePathDictionary,
  logSourceDictionary,
  initializeCompressionCodecs,
  shutdownCompressionCodecs,
} from './CompressionCodecs';

// --- Part 4: Worker Accelerator (Techniques 5-9, 57-58) ---
export {
  SharedArrayBufferPool,
  sabPool,
  AtomicsHelper,
  SPSCQueue,
  DisruptorRingBuffer,
  WorkerThreadPool,
  workerPoolRegistry,
  initializeWorkerAccelerator,
  shutdownWorkerAccelerator,
} from './WorkerAccelerator';

// --- Part 5: Module Accelerator (Techniques 1-4, 15-21, 27-31) ---
export {
  LazyInit,
  AsyncLazyInit,
  lazyRegistry,
  asyncLazyRegistry,
  registerLazy,
  registerAsyncLazy,
  getLazy,
  getAsyncLazy,
  dynamicImports,
  V8CodeCache,
  takeHeapSnapshot,
  getHeapStatistics,
  getHeapSpaceStatistics,
  StatementParamPool,
  stmtParamPool,
  PARAM_TEMPLATES,
  SQLiteOptimization,
  ReadBatcher,
  inMemoryConfig,
  TickOptimizer,
  StreamConfig,
  createOptimizedReadStream,
  createOptimizedWriteStream,
  pipelineAsync,
  createBatchTransform,
  initializeModuleAccelerator,
  shutdownModuleAccelerator,
} from './ModuleAccelerator';

// --- Part 6: IO Accelerator (Techniques 22-26, 32-39, 60-69) ---
export {
  messageChannelManager,
  broadcastChannels,
  BufferTransfer,
  sha256,
  sha256Buffer,
  FilePermissions,
  LinkHelpers,
  structuredDeepCopy,
  advisoryMemoryLock,
  advisoryMemoryUnlock,
  ProcessPriority,
  getCPUTemperature,
  frameBatchedDispatcher,
  SocketOptimizer,
  PlatformSyscalls,
  PlatformDispatch,
  setThreadAffinityHint,
  initializeIOAccelerator,
  shutdownIOAccelerator,
} from './IOAccelerator';

// --- Part 7: Timing Profiler (Techniques 81-85, 90) ---
export {
  hrtimeNow,
  hrtimeElapsedMs,
  hrtimeElapsedUs,
  hrtimeElapsedNs,
  timingBuffer,
  TIMING_LABELS,
  ScopeTimer,
  scopeTimer,
  timedAsync,
  trampoline,
  trampolineSum,
  performanceBudgets,
  eventLoopMonitor,
  gcTracker,
  hotPathTracker,
  startupTracker,
  computePerformanceScore,
  runReleaseProfileCheck,
  initializeTimingProfiler,
  shutdownTimingProfiler,
} from './TimingProfiler';

// --- Part 8: App Performance Integration (Cross-app wiring) ---
export {
  vinxPerf,
  imosionPerf,
  forgePerf,
  prismPerf,
  fluxPerf,
  rewindPerf,
  tasksPerf,
  notesPerf,
  mediaLibPerf,
  analyticsPerf,
  securityPerf,
  pluginPerf,
  browserPerf,
  filesPerf,
  calendarPerf,
  workflowsPerf,
  kanbanPerf,
  achievementsPerf,
  audioAppPerf,
  eventBusPerf,
  startupPerf,
  databasePerf,
  initializeAppPerformanceIntegration,
  shutdownAppPerformanceIntegration,
} from './AppPerformanceIntegration';

// ===========================================================================
// END OF BACKEND PERFORMANCE AND OPTIMIZATION LAYER
// ===========================================================================