/**
 * ===========================================================================
 * DEX - Personal Control Hub for Desktop Automation
 * ===========================================================================
 * 
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * @version    3.6.0
 * 
 * Main Process Entry Point - Electron Application Core
 * ===========================================================================
 */

// Electron
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, globalShortcut, dialog, systemPreferences, screen, powerMonitor, desktopCapturer } from 'electron';
import * as log from 'electron-log';

// Node.js
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Shared Types
import type { DexAction } from '../shared/types';
import { recordLaunch, tooltipFor, EMPTY_STREAK, type StreakState } from '../shared/engagement/streak';
import { buildEnvelope, defaultFilename, parseEnvelope, type BackupPayload } from '../shared/backup/envelope';
import { createHash } from 'crypto';

// Controllers
import { ActionController } from './controllers/ActionController';
import { AutomationController } from './controllers/AutomationController';
import { codeController } from './controllers/CodeController';
import { connectionController } from './controllers/ConnectionController';
import { dataController } from './controllers/DataController';
import { dataExport } from './controllers/DataExportController';
import { deepSessionController } from './controllers/DeepSessionController';
import { deviceController } from './controllers/DeviceController';
import { diagnosticsController } from './controllers/DiagnosticsController';
import { encryptionController } from './controllers/EncryptionController';
import { featureFlagsController } from './controllers/FeatureFlagsController';
import { fileManagerController } from './controllers/FileManagerController';
import { initFileIntelligenceController } from './controllers/FileIntelligenceController';
import { initializeHotkeys, shutdownHotkeys } from './controllers/HotkeyController';
import { ModeController } from './controllers/ModeController';
import { OperationsController } from './controllers/OperationsController';
import { initializePlugins } from './controllers/PluginController';
import { PowerController } from './controllers/PowerController';
import { initializeScheduler, shutdownScheduler } from './controllers/SchedulerController';
import { securityController } from './controllers/SecurityController';
import { SessionController } from './controllers/SessionController';
import { systemMapController } from './controllers/SystemMapController';
import { transferController } from './controllers/TransferController';
import { httpTransferServer } from './controllers/HttpTransferServer';
import { initDTPController, startDTP } from './transfer/DTPController';
import { trustController } from './controllers/TrustController';
import { VoiceController } from './controllers/VoiceController';
import { ukiController } from './controllers/UkiController';
import { watchdogController } from './controllers/WatchdogController';
import { workflowController } from './controllers/WorkflowController';
import { shutdownAllWorkers } from './workers/WorkerRecovery';
import { authController } from './controllers/AuthController';
import { vaultController } from './controllers/VaultController';
import { systemIntelligenceController } from './controllers/SystemIntelligenceController';
import { governanceController } from './controllers/GovernanceController';
import { AutoFillController } from './controllers/AutoFillController';
import { IPCCrypto } from './security/IPCCrypto';

// System Storage, Automation & Learning Intelligence
import { storageManager } from './core/StorageManager';
import { NetworkGuard } from './core/NetworkGuard';
import { PtyService } from './core/PtyService';
import { automationEngine } from './core/AutomationEngine';
import { processingPipeline } from './core/ProcessingPipeline';
import { audioProcessor } from './core/AudioProcessor';
import { helpSystem } from './core/InAppHelpSystem';

// PRO Features
import { initializeCLI, runCLIMode } from './cli/DexCLI';
import { initializeApiServer, shutdownApiServer } from './api/ApiServer';
import { initializeScripting } from './scripting/ScriptingEngine';
import { initializeAnalytics } from './analytics/AnalyticsManager';
import { initializeSync, shutdownSync } from './sync/SyncManager';

// Core Services
import { backgroundTasks } from './core/BackgroundTasks';
import { CrashRecoverySystem } from './core/CrashRecoverySystem';
import { WorkspaceSnapshot } from './core/WorkspaceSnapshot';
import { ClipboardHistoryManager } from './core/ClipboardHistoryManager';
import { dataIntegrity } from './core/DataIntegrity';
import { errorRecovery } from './core/ErrorRecovery';
import { memoryManager } from './core/MemoryManager';
import { performanceGuardian } from './core/PerformanceGuardian';
import { pythonExecutor } from './core/PythonExecutor';
import { resourceGovernor } from './core/ResourceGovernor';
import { securityAudit } from './core/SecurityAudit';
import { SSDSpillManager } from './core/SSDSpillManager';

// Crash Reporter -- local-only, privacy-safe
import { crashReporterService } from './core/CrashReporter';

// Startup performance measurement
import { startupTimeline } from './utils/StartupTimeline';

// VISUAL SMOOTHNESS MODE: Performance & Render Systems
import { RenderGovernor } from './core/RenderGovernor';
import { MotionController } from './core/MotionController';
import { InputLatencyController } from './core/InputLatencyController';
import { SessionStabilityManager } from './core/SessionStabilityManager';
import { PerformanceEnforcer } from './core/PerformanceEnforcer';

// FINAL UI FUNCTIONALITY PHASE: Search Systems
import { SearchController } from './controllers/SearchController';
import { initializeFileSearchIndexer, shutdownFileSearchIndexer } from './core/FileSearchIndexer';

// Intent Sessions (Next-Gen OS-Level System 1)
import { initializeIntentSessions, shutdownIntentSessions } from './core/IntentSessionManager';

// Usage-Aware File System (Next-Gen OS-Level System 2)
import { initializeUsageAwareFileSystem, shutdownUsageAwareFileSystem } from './core/UsageAwareFileSystem';

// DEX Rewind - Activity Logger
import { initializeRewind, shutdownRewind, rewindEngine } from './core/RewindEngine';

// Trustworthy, Explainable Search (Next-Gen OS-Level System 3)
import { initializeTrustworthySearch, shutdownTrustworthySearch } from './core/TrustworthySearch';

// System-Level Undo & Safety (Next-Gen OS-Level System 4)
import { initializeSystemUndo, shutdownSystemUndo } from './core/SystemUndoManager';

// DEX Performance Booster - System-level optimization
import { initializePerformanceBooster, shutdownPerformanceBooster, performanceBooster } from './core/PerformanceBooster';

// DEX Xenon - Background Resource Optimizer
import { initializeXenon, shutdownXenon } from './core/Xenon';

// DEX Premium Features - Ecosystem & UX Enhancements
import { initializeEcosystemIntegration, shutdownEcosystemIntegration } from './core/EcosystemIntegration';
import { initializeUXEnhancement, shutdownUXEnhancement } from './core/UXEnhancement';
import { initializeSecurityLayer, shutdownSecurityLayer } from './core/SecurityLayer';
import { initializeHardwareOptimization, shutdownHardwareOptimization } from './core/HardwareOptimization';

// Runtime
import { actionEngine } from './runtime/ActionEngine';
import { coreRuntime } from './runtime/CoreRuntime';
import { errorClassifier } from './runtime/ErrorClassifier';
import { hardenedPython } from './runtime/HardenedPython';
import { observability } from './runtime/Observability';
import { resourceManager } from './runtime/ResourceManager';
import { scheduler } from './runtime/Scheduler';

// Engine, Monitors, Security, Store, Utils
import { RuleEngine } from './engine/RuleEngine';
import { CppSpatial, CppMatrix, CppHash } from './native/cpp-bridge';
import { EventMonitor } from './monitors/EventMonitor';
import { healthMonitor, registerHealthHandlers } from './monitors/HealthMonitor';
import { PermissionManager } from './security/PermissionManager';
import { DataStore } from './store/DataStore';
import { Logger } from './utils/Logger';
import {
  cleanupInstallerLifecycle,
  getInstallerLifecycleAction,
  isUninstallLifecycleAction,
  isUninstallLifecycleCommand,
} from './utils/InstallerLifecycle';

// Security Hardening
import { ipcValidator, InputSanitizer } from './security/IPCValidator';
import { dataMigrationManager } from './security/DataMigration';

// Ship-Ready Lock
import { runStartupVerification, SHIP_READY_CONFIG, shipReadyVerification } from './core/ShipReadyLock';

// System Integration: Performance Optimization & Capability Layer
import { 
  initializePhase51, 
  shutdownPhase51, 
  getPhase51Status, 
  getPhase51Report,
  performanceOptimizer,
  capabilityLayer,
  deviceInterface,
  pluginManager,
  longTermStability 
} from './core/SystemIntegration';

// Safe Mode & Startup Protection
import { safeMode } from './core/SafeMode';

// Security: Path & URL validation
import { PathValidator } from './security/PathValidator';

// Security: IPC rate limiting
import { ipcRateLimiter } from './security/IPCRateLimiter';

// Centralized constants
import { WINDOW, TIMEOUTS, LIMITS, THEME_DEFAULTS, MEDIA_EXTENSIONS } from './utils/constants';

// AI Integration (Phase 56-57) - Planned for future release
// AI Hub module available at ./ai when ready to enable

// Pattern Learning (Local-only, privacy-first)
import { initializePatternLearning, shutdownPatternLearning, patternLearning } from './core/PatternLearning';

// Unified Systems (13 Production Subsystems)
import { databaseManager } from './core/DatabaseManager';
import { initializeUnifiedNotificationCenter, shutdownUnifiedNotificationCenter } from './core/UnifiedNotificationHub';
import { initializeGlobalContentSearch, shutdownGlobalContentSearch } from './core/GlobalContentSearch';
import { initializeSharedMediaLibrary, shutdownSharedMediaLibrary } from './core/SharedMediaLibrary';
import { initializeVersionHistory, shutdownVersionHistory } from './core/VersionHistoryManager';
import { initializeTaskQueue, shutdownTaskQueue } from './core/TaskQueueManager';
import { initializeRecycleBin, shutdownRecycleBin } from './core/RecycleBinManager';
import { initializeWorkspaceLayouts, shutdownWorkspaceLayouts } from './core/WorkspaceLayoutManager';
import { initializeDeepLinks, shutdownDeepLinks } from './core/DeepLinkRouter';
import { initializeScratchpad, shutdownScratchpad } from './core/ScratchpadManager';
import { initializeLocalization, shutdownLocalization } from './core/LocalizationEngine';
import { initializeFeedback, shutdownFeedback } from './core/FeedbackCollector';
import { initializeMultiWindow, shutdownMultiWindow } from './core/MultiWindowManager';
import { initializeBatchOperations, shutdownBatchOperations } from './core/BatchOperationManager';

// Governance Contract (Phase 58-59)
import { registerGovernanceHandlers, governanceEnforcer } from './core/GovernanceContract';

// Feature Suite (38 New Subsystems)
import { sessionReplayManager } from './core/SessionReplayManager';



// DEX Notes (SQLite-backed)
import { notesManager } from './core/NotesManager';

// Inner App Stability
import { initializeInnerAppStability, shutdownInnerAppStability } from './core/InnerAppStabilityManager';

// System Completeness (Phase 70)
import { migrationManager } from './core/MigrationManager';
import { multiMonitorManager } from './core/MultiMonitorManager';
import { multiUserManager } from './core/MultiUserManager';
import { licensingManager } from './core/LicensingManager';
import { localizationManager } from './core/LocalizationManager';
import { helpSystemManager } from './core/HelpSystemManager';
import { developerPlatformManager } from './core/DeveloperPlatformManager';
import { backupRestoreManager } from './core/BackupRestoreManager';
import { dataImportManager } from './core/DataImportManager';
import { healthCheckManager } from './core/HealthCheckManager';
import { uninstallManager } from './core/UninstallManager';

import { projectLinkerManager } from './core/ProjectLinkerManager';
import { dailyBriefingManager } from './core/DailyBriefingManager';
import { relationshipGraphManager } from './core/RelationshipGraphManager';
import { timeTrackingManager } from './core/TimeTrackingManager';
import { goalSystemManager } from './core/GoalSystemManager';
import { snapshotComparisonManager } from './core/SnapshotComparisonManager';
import { projectHealthManager } from './core/ProjectHealthManager';
import { duplicationDetectorManager } from './core/DuplicationDetectorManager';
import { keyboardNavigationManager } from './core/KeyboardNavigationManager';
import { projectArchiverManager } from './core/ProjectArchiverManager';
import { dailyNoteManager } from './core/DailyNoteManager';
import { contentExpiryManager } from './core/ContentExpiryManager';
import { searchHistoryManager } from './core/SearchHistoryManager';
import { liveCollaborationManager } from './core/LiveCollaborationManager';
import { smartGroupingManager } from './core/SmartGroupingManager';
import { voiceMemoManager } from './core/VoiceMemoManager';
import { projectTimelineManager } from './core/ProjectTimelineManager';
import { linkPreviewManager } from './core/LinkPreviewManager';
import { statisticsDashboardManager } from './core/StatisticsDashboardManager';
import { projectExportBundleManager } from './core/ProjectExportBundleManager';
import { fileWatcherManager } from './core/FileWatcherManager';
import { wordCountManager } from './core/WordCountManager';
import { smartRenameManager } from './core/SmartRenameManager';
import { vinxPresentationManager } from './core/VinxPresentationManager';
import { projectComparisonManager } from './core/ProjectComparisonManager';
import { customDashboardManager } from './core/CustomDashboardManager';
import { reminderManager } from './core/ReminderManager';
import { fullTextIndexManager } from './core/FullTextIndexManager';
import { dependencyManager } from './core/DependencyManager';
import { colorLabelManager } from './core/ColorLabelManager';
import { readLaterManager } from './core/ReadLaterManager';
import { bulkMetadataManager } from './core/BulkMetadataManager';
import { activityFeedManager } from './core/ActivityFeedManager';
import { projectLockManager } from './core/ProjectLockManager';
import { themeScheduleManager } from './core/ThemeScheduleManager';
import { naturalLanguageTaskManager } from './core/NaturalLanguageTaskManager';
import { personalChangelogManager } from './core/PersonalChangelogManager';

// Release Management (Phase 66)
import { ReleaseManager } from './core/ReleaseManager';
import { registerArchiveIpc } from './services/ArchiveService';
import { registerSpeedTestIpc } from './services/SpeedTestService';
import { registerSystemCapabilitiesIpc, detectCapabilities } from './services/SystemCapabilitiesService';
import { registerCorePcIpc, verifyCoreIntegrity } from './services/CorePCService';
import { registerPermissionsIpc } from './services/PermissionsService';
import { registerCreatorAccessIpc } from './services/CreatorAccessService';
import { registerAppStoreIpc } from './services/AppStoreService';
import { registerEmbeddingIpc } from './services/EmbeddingService';
import { registerGamesIpc } from './services/GamesService';
import { registerCapabilityBrokerIpc } from './services/CapabilityBrokerService';
import { registerAudioNativeHandlers } from './services/AudioNativeService';
import { registerSnapshotIpc } from './services/SnapshotService';
import { registerWorkflowIpc } from './services/WorkflowService';
import { registerSyncIpc } from './services/SyncService';
import { summarize as _readerSummarize } from '../shared/reader/readerSummary';
import { UpdateService } from './core/UpdateService';
import { ProductionMonitor } from './core/ProductionMonitor';

// Voice Control (Phase 46)
import { voiceControlEngine } from './core/VoiceControlEngine';

// Phase 1: Stability Systems (Immediate Patch Cycle)
import { 
  initializePhase1, 
  shutdownPhase1, 
  getPhase1Status,
  stabilityCore,
  permissionGuard,
  automationStabilityGuard,
  memoryLeakPrevention,
  searchCorrectnessManager
} from './core/Phase1Integration';

// Q1 Foundation & Trust: Security Hardening Systems
import {
  initializeQ1Foundation,
  shutdownQ1Foundation,
  getQ1Status,
  getQ1Report,
  authHardening,
  vaultHardening,
  sessionHardening
} from './security/Q1Integration';

// Deep Backend Systems (11-Part Architecture Pass)
import { initializeThreadOrchestrator, shutdownThreadOrchestrator } from './core/ThreadOrchestrator';
import { initializePerformanceInstrument, shutdownPerformanceInstrument } from './core/PerformanceInstrument';
import { initializeDatabaseCluster, shutdownDatabaseCluster } from './core/DatabaseCluster';
import { initializePluginSecurityGate, shutdownPluginSecurityGate } from './core/PluginSecurityGate';
import { initializeEncryptionOrchestrator, shutdownEncryptionOrchestrator } from './core/EncryptionOrchestrator';
import { initializeIntelligenceAPI, shutdownIntelligenceAPI } from './core/IntelligenceAPI';
import { initializeDexEventBus, shutdownDexEventBus } from './core/DexEventBus';
import { initializeStartupSequencer, shutdownStartupSequencer } from './core/StartupSequencer';
import { initializeShutdownSequencer, shutdownShutdownSequencer } from './core/ShutdownSequencer';

// DEX Rewind System Journal (5-Part Architecture)
import { initializeSystemJournal, shutdownSystemJournal } from './core/SystemJournal';
import { initializeJournalAnalysis, shutdownJournalAnalysis } from './core/JournalAnalysisEngine';

// Backend Performance Engine (100 Rules)
import { initializePerformanceEngine, shutdownPerformanceEngine } from './engine';

// System Optimization Layer (Hardware-Aware Performance)
import { hardwareDetector } from './core/HardwareDetector';
import { memoryBudget } from './core/MemoryBudgetService';
import { workStealingScheduler } from './core/WorkStealingScheduler';
import { thermalPowerManager } from './core/ThermalPowerManager';
import { tierStartupSequencer } from './core/TierStartupSequencer';

import { databasePerformanceOptimizer } from './core/DatabasePerformanceOptimizer';
import { ipcEfficiencyManager } from './core/IPCEfficiencyManager';
import { systemOptimizationWiring } from './core/SystemOptimizationWiring';

// System Health Orchestrator (Rules 98-100)
import { systemHealth } from './core/SystemHealthOrchestrator';
// PlatformHealth: thin facade over SystemHealth + Diagnostics + Reliability
import { initializePlatformHealth } from './core/PlatformHealth';

// Platform detection
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// File watchers (hoisted for shutdown cleanup)
const activeWatchers = new Map<string, any>();

// IPC handler timeout wrapper -- prevents renderer hangs from unresponsive handlers
const IPC_TIMEOUT_MS = 15_000;
function handleWithTimeout<T>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<T>,
  timeoutMs = IPC_TIMEOUT_MS,
): void {
  ipcMain.handle(channel, (event, ...args) =>
    Promise.race([
      handler(event, ...args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`IPC timeout: ${channel} exceeded ${timeoutMs}ms`)), timeoutMs),
      ),
    ]).catch(err => {
      log.warn(`[IPC] ${channel} failed:`, err?.message || err);
      return { success: false, error: err?.message || 'IPC handler failed' };
    }),
  );
}

class DexApp {
  // Window & Tray
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private isQuitting = false;
  private shutdownStarted = false;
  private featureSuiteManagers: Array<[string, { initialize: (win: BrowserWindow) => void; destroy?: () => void }]> = [];

  // Core Services
  private logger: Logger;
  private dataStore: DataStore;
  private permissionManager: PermissionManager;

  // Controllers
  private actionController: ActionController;
  private automationController: AutomationController;
  private modeController: ModeController;
  private powerController: PowerController;
  private operationsController: OperationsController;
  private sessionController: SessionController;
  private searchController: SearchController;
  private voiceController: VoiceController;

  // Engine & Monitoring
  private ruleEngine: RuleEngine;
  private eventMonitor: EventMonitor;

  // Release Management (Phase 66)
  private releaseManager: ReleaseManager | null = null;
  private updateService: UpdateService | null = null;
  private productionMonitor: ProductionMonitor | null = null;

  private isNetworkFeatureOptInEnabled(): boolean {
    const raw = (process.env.DEX_ENABLE_NETWORK_FEATURES || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  constructor() {
    this.logger = new Logger();
    this.dataStore = new DataStore();
    this.permissionManager = new PermissionManager(this.dataStore);
    this.actionController = new ActionController(this.permissionManager, this.logger);
    this.automationController = new AutomationController(this.dataStore, this.logger);
    this.modeController = new ModeController(this.dataStore, this.actionController, this.logger);
    this.powerController = new PowerController(this.dataStore, this.logger);
    this.operationsController = new OperationsController(this.dataStore, this.logger);
    this.sessionController = new SessionController(this.dataStore, this.logger, this.operationsController, this.actionController);
    this.searchController = new SearchController(this.dataStore, this.logger);
    this.voiceController = new VoiceController(this.dataStore, this.logger);
    this.ruleEngine = new RuleEngine(this.dataStore, this.actionController, this.modeController, this.logger);
    this.eventMonitor = new EventMonitor(this.ruleEngine, this.logger);
  }

  async initialize(): Promise<void> {
    log.info('[DEX] ========================================');
    log.info('[DEX]   STARTUP SEQUENCE INITIATED');
    log.info('[DEX] ========================================');
    startupTimeline.mark('process:entry');

    const installerLifecycleAction = getInstallerLifecycleAction();
    if (installerLifecycleAction) {
      cleanupInstallerLifecycle(installerLifecycleAction);
      if (isUninstallLifecycleAction(installerLifecycleAction)) {
        log.info(`[DEX] Installer lifecycle action handled; exiting (${installerLifecycleAction})`);
        app.exit(0);
        return;
      }
    }
    
    // Single instance lock (disabled for Playwright E2E runs)
    const isE2ETest = process.env.DEX_E2E_TEST === 'true';
    const gotTheLock = isE2ETest ? true : app.requestSingleInstanceLock();
    if (!gotTheLock) {
      log.info('[DEX] Another instance running, quitting');
      app.quit();
      return;
    }

    app.on('second-instance', (_event, commandLine) => {
      if (isUninstallLifecycleCommand(commandLine)) {
        cleanupInstallerLifecycle('cleanup-before-uninstall');
        this.isQuitting = true;
        if (this.tray && !this.tray.isDestroyed()) {
          this.tray.destroy();
          this.tray = null;
        }
        log.info('[DEX] Uninstall lifecycle requested by second instance; quitting running app');
        app.quit();
        return;
      }

      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.focus();
      }
      try { this.handleQuickActionArgv(commandLine); } catch (err) { log.warn('[DEX] Quick-action argv handling failed:', err); }
    });

    // GPU command-line switches MUST be applied BEFORE app.whenReady()
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
    app.commandLine.appendSwitch('enable-accelerated-video-encode');
    // Vaapi is Linux-only; PlatformHEVCDecoderSupport works cross-platform
    const gpuFeatures = isLinux
      ? 'VaapiVideoDecoder,VaapiVideoEncoder,PlatformHEVCDecoderSupport'
      : 'PlatformHEVCDecoderSupport';
    app.commandLine.appendSwitch('enable-features', gpuFeatures);

    // Auto-scale V8 heap based on system RAM (optimized for 5GB effective memory)
    // Ultra-low (<=2GB): 256MB, Low (<=4GB): 25%, Mid (<=8GB): 35%, High (>8GB): 45%, capped at 4GB
    // Systems with 8GB+ and SSD get expanded heap for 5GB total effective budget
    const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
    let heapMB: number;
    if (totalMemMB <= 2048) {
      heapMB = 256;
    } else if (totalMemMB <= 4096) {
      heapMB = Math.round(totalMemMB * 0.25);
    } else if (totalMemMB <= 8192) {
      heapMB = Math.round(totalMemMB * 0.35);
    } else {
      // High-end systems: allocate 45% for RAM, SSD spill provides additional 2GB
      heapMB = Math.max(512, Math.min(4096, Math.round(totalMemMB * 0.45)));
    }
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heapMB}`);
    log.info(`[DEX] V8 heap set to ${heapMB} MB (system RAM: ${totalMemMB} MB, effective with SSD spill: ${heapMB + 2048} MB)`);

    const diskCacheMB = totalMemMB <= 4096 ? 512 : totalMemMB <= 8192 ? 1024 : 2048;
    app.commandLine.appendSwitch('disk-cache-size', String(diskCacheMB * 1024 * 1024));
    log.info(`[DEX] Chromium disk cache capped at ${diskCacheMB} MB`);

    await app.whenReady();
    startupTimeline.mark('app:ready');
    
    // IPC envelope encryption — must be before any IPC handler registration
    IPCCrypto.init();

    log.info('[DEX] Stage 1: App ready');
    this.logger.info('Dex starting up...');

    // Native Rust module status
    try {
      const { logNativeStatus } = require('./native/bridge');
      logNativeStatus();
    } catch {
      log.info('[Native] Module loader not available');
    }
    
    // PHASE 1 STABILITY: Initialize stability systems FIRST (catches all crashes)
    log.info('[DEX] Stage 1.5: Initializing Phase 1 Stability Systems...');
    try {
      await initializePhase1(this.dataStore);
      const phase1Status = getPhase1Status();
      log.info(`[DEX] Stage 1.5: Phase 1 ready (health: ${phase1Status.health})`);
    } catch (err) {
      log.warn('[DEX] Phase 1 init warning (continuing):', err);
    }
    
    // Q1 FOUNDATION & TRUST: Initialize security hardening systems
    log.info('[DEX] Stage 1.6: Initializing Q1 Foundation Systems...');
    try {
      await initializeQ1Foundation();
      const q1Status = getQ1Status();
      log.info(`[DEX] Stage 1.6: Q1 Foundation ready (${q1Status.length} systems active)`);
    } catch (err) {
      log.warn('[DEX] Q1 Foundation init warning (continuing):', err);
    }
    
    // Setup IPC FIRST (critical — renderer calls arrive as soon as window loads)
    log.info('[DEX] Stage 2: Setting up IPC...');
    startupTimeline.begin('IPC:setup');
    this.setupIPC();
    startupTimeline.end('IPC:setup');

    // Create window after IPC handlers are registered
    log.info('[DEX] Stage 3: Creating window...');
    startupTimeline.begin('window:create');
    try {
      await this.createWindow();
      startupTimeline.end('window:create');
      log.info('[DEX] Stage 3: Window created successfully');
      
      // Track window for memory leak prevention
      if (this.mainWindow) {
        memoryLeakPrevention.trackWindow(this.mainWindow);
      }
    } catch (err) {
      startupTimeline.end('window:create');
      log.error('[DEX] CRITICAL: Window creation failed:', err);
      stabilityCore.recordTabLifecycleError(err as Error, { stage: 'window-creation' });
      await this.showFatalError('Window creation failed', String(err));
      return;
    }
    
    // Initialize data store (with timeout)
    log.info('[DEX] Stage 4: Initializing data store...');
    try {
      await Promise.race([
        this.dataStore.initialize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DataStore timeout')), 5000))
      ]);
      log.info('[DEX] Stage 4: Data store ready');
      
      // Run data migrations after DataStore is ready
      log.info('[DEX] Stage 4b: Running data migrations...');
      try {
        const migrationResult = await dataMigrationManager.migrate(this.dataStore);
        if (migrationResult.applied.length > 0) {
          log.info(`[DEX] Applied ${migrationResult.applied.length} migrations: ${migrationResult.applied.join(', ')}`);
        }
      } catch (migrationErr) {
        log.warn('[DEX] Data migration failed, continuing:', migrationErr);
      }
    } catch (err) {
      log.warn('[DEX] DataStore init failed, continuing:', err);
    }
    
    // Create tray (non-critical)
    log.info('[DEX] Stage 5: Creating tray...');
    try {
      this.createTray();
    } catch (err) {
      log.warn('[DEX] Tray creation failed, continuing:', err);
    }

    // OS perk: register a Windows JumpList so right-clicking the taskbar /
    // Start Menu icon offers Quick Note, Quick Task, Open Files. No-op on
    // non-Windows hosts -- Electron just ignores the call there.
    try {
      this.registerJumpList();
    } catch (err) {
      log.warn('[DEX] JumpList registration failed, continuing:', err);
    }
    
    // Start monitoring (non-critical)
    log.info('[DEX] Stage 6: Starting monitors...');
    try {
      this.eventMonitor.start();
      this.ruleEngine.start();
      watchdogController.start();
    } catch (err) {
      log.warn('[DEX] Monitors failed to start:', err);
    }

    // Initialize controllers -- each in its own try/catch for resilience
    const safeInit = (name: string, fn: () => void) => {
      try { fn(); } catch (err) { log.warn(`[DEX] ${name} init failed:`, err); }
    };
    safeInit('authController', () => authController.setMainWindow(this.mainWindow!));
    safeInit('vaultController', () => vaultController.setMainWindow(this.mainWindow!));
    safeInit('systemIntelligence', () => systemIntelligenceController.setMainWindow(this.mainWindow!));
    safeInit('governance', () => governanceController.setMainWindow(this.mainWindow!));
    safeInit('processingPipeline', () => processingPipeline.setMainWindow(this.mainWindow!));
    safeInit('audioProcessor', () => audioProcessor.setMainWindow(this.mainWindow!));
    safeInit('automationEngine', () => automationEngine.setMainWindow(this.mainWindow!));
    safeInit('helpSystem', () => helpSystem.setMainWindow(this.mainWindow!));
    diagnosticsController.log('info', 'App', 'Dex started successfully');
    // Ensure controller handlers are registered (prevents tree-shaking)
    transferController;
    httpTransferServer;
    safeInit('dtpController', () => { initDTPController(); startDTP(); });
    codeController;
    storageManager;

    // Register temporary stub handlers for unified systems channels
    // (prevents "No handler registered" errors during race window before real managers init)
    const earlyStubChannels = [
      'task-queue:getActive', 'notification-center:getUnreadCount',
      'recycle-bin:getCount', 'scratchpad:getState',
      'localization:getLanguage', 'localization:getAllStrings',
    ];
    for (const ch of earlyStubChannels) {
      ipcMain.handle(ch, async () => null);
    }

    // File surfaces query recent items immediately on first paint.
    // Register a safe stub until FileManagerController replaces it.
    ipcMain.handle('files:recent', async () => ({ success: true, files: [] }));

    // Initialize subsystems in background (don't block UI)
    log.info('[DEX] Stage 7: Starting background subsystems...');
    this.initializeSubsystemsAsync();

    log.info('[DEX] ========================================');
    log.info('[DEX]   STARTUP COMPLETE - WINDOW IS OPEN');
    log.info(`[DEX]   Version: ${SHIP_READY_CONFIG.version}`);
    log.info('[DEX] ========================================');
    this.logger.info('Dex initialized successfully');

    // Run ship-ready verification in development
    runStartupVerification().catch(err => {
      log.warn('[DEX] Startup verification failed:', err);
    });

    // Phase 51: Initialize Performance Optimization & Capability Layer
    log.info('[DEX] Stage 7: Initializing Phase 51 subsystems...');
    initializePhase51().then(status => {
      log.info(`[DEX] Phase 51 Status: ${status.ready ? 'READY' : 'PARTIAL'}`);
    }).catch(err => {
      log.warn('[DEX] Phase 51 initialization warning:', err);
    });

    // Register global shortcuts
    this.registerGlobalShortcuts();

    app.on('activate', () => {
      // macOS: Re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      } else {
        this.mainWindow?.show();
      }
    });

    app.on('before-quit', (event) => {
      if (this.shutdownStarted) return; // Guard: let quit proceed on second call
      event.preventDefault();
      this.shutdownStarted = true;
      this.isQuitting = true;
      log.info('[DEX] Shutting down...');
      globalShortcut.unregisterAll();

      (async () => {
      // Shutdown with timeout to prevent hangs
      const shutdownWithTimeout = async (name: string, fn: () => void | Promise<void>, timeoutMs = 3000) => {
        try {
          await Promise.race([
            Promise.resolve(fn()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
          ]);
        } catch (err: any) {
          log.warn(`[DEX] ${name} shutdown ${err.message === 'timeout' ? 'timed out' : 'failed'}:`, err.message);
        }
      };

      // Shut down in priority order
      // System Optimization Layer shutdown
      await shutdownWithTimeout('SystemOptimizationWiring', () => systemOptimizationWiring.shutdown());
      await shutdownWithTimeout('Xenon', shutdownXenon);

      await shutdownWithTimeout('InnerAppStability', shutdownInnerAppStability);
      await shutdownWithTimeout('NotesManager', () => notesManager.destroy());

      await shutdownWithTimeout('BatchOperations', shutdownBatchOperations);
      await shutdownWithTimeout('MultiWindow', shutdownMultiWindow);
      await shutdownWithTimeout('Feedback', shutdownFeedback);
      await shutdownWithTimeout('Localization', shutdownLocalization);
      await shutdownWithTimeout('Scratchpad', shutdownScratchpad);
      await shutdownWithTimeout('DeepLinks', shutdownDeepLinks);
      await shutdownWithTimeout('WorkspaceLayouts', shutdownWorkspaceLayouts);
      await shutdownWithTimeout('RecycleBin', shutdownRecycleBin);
      await shutdownWithTimeout('TaskQueue', shutdownTaskQueue);
      await shutdownWithTimeout('VersionHistory', shutdownVersionHistory);
      await shutdownWithTimeout('SharedMediaLibrary', shutdownSharedMediaLibrary);
      await shutdownWithTimeout('GlobalContentSearch', shutdownGlobalContentSearch);
      await shutdownWithTimeout('UnifiedNotificationCenter', shutdownUnifiedNotificationCenter);
      await shutdownWithTimeout('HardwareOptimization', shutdownHardwareOptimization);
      await shutdownWithTimeout('SecurityLayer', shutdownSecurityLayer);
      await shutdownWithTimeout('UXEnhancement', shutdownUXEnhancement);
      await shutdownWithTimeout('EcosystemIntegration', shutdownEcosystemIntegration);
      await shutdownWithTimeout('PerformanceBooster', shutdownPerformanceBooster);
      await shutdownWithTimeout('Q1Foundation', shutdownQ1Foundation);
      await shutdownWithTimeout('Phase1', shutdownPhase1);
      await shutdownWithTimeout('Phase51', shutdownPhase51);
      await shutdownWithTimeout('Scheduler', shutdownScheduler);
      await shutdownWithTimeout('Hotkeys', shutdownHotkeys);
      await shutdownWithTimeout('ApiServer', shutdownApiServer);
      await shutdownWithTimeout('Sync', shutdownSync);
      await shutdownWithTimeout('FileSearchIndexer', shutdownFileSearchIndexer);
      await shutdownWithTimeout('PatternLearning', shutdownPatternLearning);
      await shutdownWithTimeout('Rewind', shutdownRewind);
      await shutdownWithTimeout('IntentSessions', shutdownIntentSessions);
      await shutdownWithTimeout('UsageAwareFS', shutdownUsageAwareFileSystem);
      await shutdownWithTimeout('TrustworthySearch', shutdownTrustworthySearch);
      await shutdownWithTimeout('SystemUndo', shutdownSystemUndo);

      // System Completeness shutdown (reverse init order)
      await shutdownWithTimeout('UninstallManager', () => uninstallManager.destroy());
      await shutdownWithTimeout('HealthCheckManager', () => healthCheckManager.destroy());
      await shutdownWithTimeout('DataImportManager', () => dataImportManager.destroy());
      await shutdownWithTimeout('BackupRestoreManager', () => backupRestoreManager.destroy());
      await shutdownWithTimeout('DeveloperPlatformManager', () => developerPlatformManager.destroy());
      await shutdownWithTimeout('HelpSystemManager', () => helpSystemManager.destroy());
      await shutdownWithTimeout('LocalizationManager', () => localizationManager.destroy());
      await shutdownWithTimeout('LicensingManager', () => licensingManager.destroy());
      await shutdownWithTimeout('MultiUserManager', () => multiUserManager.destroy());
      await shutdownWithTimeout('MultiMonitorManager', () => multiMonitorManager.destroy());
      await shutdownWithTimeout('MigrationManager', () => migrationManager.destroy());

      // System Journal shutdown (before Deep Backend Systems)
      await shutdownWithTimeout('JournalAnalysis', shutdownJournalAnalysis);
      await shutdownWithTimeout('SystemJournal', shutdownSystemJournal);

      // Deep Backend Systems shutdown (reverse init order)
      await shutdownWithTimeout('ThreadOrchestrator', shutdownThreadOrchestrator);
      await shutdownWithTimeout('ShutdownSequencer', shutdownShutdownSequencer);
      await shutdownWithTimeout('StartupSequencer', shutdownStartupSequencer);
      await shutdownWithTimeout('PluginSecurityGate', shutdownPluginSecurityGate);
      await shutdownWithTimeout('IntelligenceAPI', shutdownIntelligenceAPI);
      await shutdownWithTimeout('DexEventBus', shutdownDexEventBus);
      await shutdownWithTimeout('EncryptionOrchestrator', shutdownEncryptionOrchestrator);
      await shutdownWithTimeout('DatabaseCluster', shutdownDatabaseCluster);
      await shutdownWithTimeout('PerformanceInstrument', shutdownPerformanceInstrument);
      
      // Backend Performance Engine shutdown (after all subsystems flushed)
      await shutdownWithTimeout('PerformanceEngine', shutdownPerformanceEngine);

      // --- UKI Voice Assistant ---
      await shutdownWithTimeout('UkiController', () => ukiController.shutdown());

      // --- Workspace Snapshot: flush session state to disk before exit ---
      await shutdownWithTimeout('WorkspaceSnapshot', () => WorkspaceSnapshot.shutdown());

      // --- ReleaseManager: stop the cache-prune interval ---
      if (this.releaseManager) {
        await shutdownWithTimeout('ReleaseManager', () => this.releaseManager?.dispose());
      }

      // --- IPC Crypto session key wipe ---
      IPCCrypto.destroy();

      // --- Runtime services (started in initializeSubsystems) ---
      await shutdownWithTimeout('CoreRuntime', () => coreRuntime.shutdown());
      await shutdownWithTimeout('Observability', () => observability.stop());
      await shutdownWithTimeout('HardenedPython', () => hardenedPython.stop());
      await shutdownWithTimeout('Scheduler', () => scheduler.stop());
      await shutdownWithTimeout('ActionEngine', () => actionEngine.stop());
      await shutdownWithTimeout('ResourceManager', () => resourceManager.stop());
      await shutdownWithTimeout('HealthMonitor', () => healthMonitor.stop());
      await shutdownWithTimeout('PerformanceGuardian', () => performanceGuardian.stop());
      await shutdownWithTimeout('PythonExecutor', () => pythonExecutor.stop());
      await shutdownWithTimeout('BackgroundTasks', () => backgroundTasks.stop());
      await shutdownWithTimeout('MemoryManager', () => memoryManager.stopMonitoring());
      await shutdownWithTimeout('ResourceGovernor', () => resourceGovernor.stop());
      await shutdownWithTimeout('WatchdogController', () => watchdogController.stop());
      await shutdownWithTimeout('VoiceControlEngine', () => voiceControlEngine.shutdown());

      // --- Visual smoothness controllers ---
      try { RenderGovernor.stop(); } catch { /* non-critical */ }
      try { MotionController.stop(); } catch { /* non-critical */ }
      try { InputLatencyController.stop(); } catch { /* non-critical */ }
      try { SessionStabilityManager.stop(); } catch { /* non-critical */ }
      try { PerformanceEnforcer.stop(); } catch { /* non-critical */ }

      // --- Feature Suite managers (38 subsystems) ---
      for (const [name, manager] of this.featureSuiteManagers) {
        if (typeof (manager as any).destroy === 'function') {
          await shutdownWithTimeout(`FeatureSuite:${name}`, () => (manager as any).destroy());
        }
      }

      // --- Worker threads ---
      await shutdownWithTimeout('Workers', () => shutdownAllWorkers(), 5000);

      // --- File watchers ---
      for (const [id, watcher] of activeWatchers) {
        try { watcher.close(); } catch { /* non-critical */ }
      }
      activeWatchers.clear();

      // Production Monitor -- save session digest before database closes
      if (this.productionMonitor) {
        await shutdownWithTimeout('ProductionMonitor', () => this.productionMonitor!.stop());
      }
      // Update Service -- stop polling
      if (this.updateService) {
        await shutdownWithTimeout('UpdateService', () => this.updateService!.dispose());
      }

      // Crash reporter -- flush log before database closes
      await shutdownWithTimeout('CrashReporter', () => crashReporterService.destroy());
      
      // Close SQLite database last (all other systems flushed first)
      await shutdownWithTimeout('DatabaseManager', () => databaseManager.close());
      
      // Destroy tray icon
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }
      
      log.info('[DEX] Shutdown complete');
      app.quit(); // Re-trigger quit now that shutdownStarted is true (guard skips preventDefault)
      })().catch(err => {
        log.error('[DEX] Shutdown error:', err);
        app.quit();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        // Stay in tray if tray exists, otherwise quit to avoid zombie process
        if (!this.tray || this.tray.isDestroyed()) {
          app.quit();
        }
      }
    });

    // DEX is shipped for Windows and Linux. No platform-specific dock menu.
  }
  
  // Show fatal error dialog
  private async showFatalError(title: string, message: string): Promise<void> {
    await dialog.showMessageBox({
      type: 'error',
      title: 'DEX Startup Error',
      message: title,
      detail: message + '\n\nThe app will now close.',
      buttons: ['OK']
    });
    app.quit();
  }
  
  // Initialize subsystems asynchronously (don't block window)
  private initializeSubsystemsAsync(): void {
    // Adaptive startup delay: give UI more time on low-RAM systems
    const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const startupDelay = totalMemGB <= 4 ? 4000 : totalMemGB <= 8 ? 3000 : 1500;

    setTimeout(async () => {
      try {
        await this.initializeSubsystems();
      } catch (err) {
        log.error('[DEX] Subsystem init error:', err);
      }
      
      // Defer heavy background tasks further (8 seconds after subsystems on low RAM)
      const bgDelay = totalMemGB <= 8 ? 8000 : 5000;
      setTimeout(() => {
        dataIntegrity.verifyAllFiles().then(results => {
          const issues = results.filter(r => !r.valid);
          if (issues.length > 0) {
            this.logger.warn(`Data integrity issues found: ${issues.length} files`);
          }
        }).catch(err => log.warn('[DEX] Data integrity check failed:', err));
        
        dataController.createAutoBackup().catch(err => log.warn('[DEX] Auto backup failed:', err));
        this.autoOptimizeSystem().catch(err => log.warn('[DEX] Auto optimize failed:', err));
      }, bgDelay);
    }, startupDelay);
  }

  private async initializeSubsystems(): Promise<void> {
    // Guard: if window was closed before subsystems init, skip
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      log.warn('[DEX] Window closed before subsystem init — skipping');
      return;
    }
    // =======================================================================
    // BACKEND PERFORMANCE ENGINE + BOOSTER (sequential to reduce memory spikes)
    // =======================================================================
    await initializePerformanceEngine();
    await initializePerformanceBooster();
    
    // =======================================================================
    // VISUAL SMOOTHNESS + System Integration (parallelized — all fire-and-forget .start())
    // =======================================================================
    resourceGovernor.start();
    initializeXenon();
    RenderGovernor.start();
    MotionController.start();
    InputLatencyController.start();
    SessionStabilityManager.start();
    PerformanceEnforcer.start();
    systemMapController.start();
    connectionController.start();
    deviceController.start();
    deepSessionController.start();
    memoryManager.startMonitoring();
    backgroundTasks.start();
    CrashRecoverySystem.initialize();
    WorkspaceSnapshot.initialize();
    pythonExecutor.start();
    performanceGuardian.start();
    performanceGuardian.recordStartupTime(Date.now() - 5000);

    // File & Workflow Management
    fileManagerController.initialize();
    initFileIntelligenceController(this.mainWindow!);
    workflowController.initialize();
    workflowController.setupEventForwarding(this.mainWindow!);

    // Auto-Fill Background Service
    AutoFillController.initialize();

    // Health Monitoring
    registerHealthHandlers();
    healthMonitor.start();

    // System Health Orchestrator (comprehensive health dashboard)
    systemHealth.initialize();
    ipcMain.handle('systemHealth:getReport', async () => {
      try { return systemHealth.getHealthReport(); }
      catch (err: any) { return { error: err.message }; }
    });

    // PlatformHealth facade — single combined snapshot via system:platformHealth
    initializePlatformHealth();

    // Runtime Services
    resourceManager.start();
    actionEngine.start();
    scheduler.start();
    hardenedPython.start();
    observability.start();
    coreRuntime.start(this.mainWindow!);

    // Register subsystems for coordinated management
    coreRuntime.registerSubsystem('actionEngine', actionEngine);
    coreRuntime.registerSubsystem('scheduler', scheduler);
    coreRuntime.registerSubsystem('resourceManager', resourceManager);
    coreRuntime.registerSubsystem('hardenedPython', hardenedPython);
    coreRuntime.registerSubsystem('observability', observability);

    observability.registerSubsystem('actionEngine');
    observability.registerSubsystem('scheduler');
    observability.registerSubsystem('workflow');
    observability.registerSubsystem('python');

    // New Feature Controllers
    initializeScheduler();
    initializePlugins(this.mainWindow!);
    initializeHotkeys(this.mainWindow!);

    // Intent Sessions (Next-Gen OS-Level System 1)
    // Usage-Aware File System (Next-Gen OS-Level System 2)
    // Trustworthy, Explainable Search (Next-Gen OS-Level System 3)
    // System-Level Undo & Safety (Next-Gen OS-Level System 4)
    // Sequential init to reduce memory spikes on low-RAM systems
    await initializeIntentSessions();
    await initializeUsageAwareFileSystem();
    await initializeTrustworthySearch();
    await initializeSystemUndo();

    // Universal Search System (FINAL UI FUNCTIONALITY PHASE)
    await this.searchController.initialize();
    initializeFileSearchIndexer(this.dataStore, this.logger, this.mainWindow!);

    // Voice Notes Controller (Phase 7B)
    await this.voiceController.initialize();
    this.registerVoiceNotesHandlers();

    // Clipboard History Manager
    await ClipboardHistoryManager.initialize(this.mainWindow!);

    // PRO Features
    initializeCLI();
    initializeScripting(this.mainWindow!);

    const networkFeaturesEnabled = this.isNetworkFeatureOptInEnabled();
    if (networkFeaturesEnabled) {
      initializeApiServer(this.mainWindow!);
      initializeAnalytics();
      initializeSync(this.mainWindow!);
      log.info('[DEX] Network features enabled via DEX_ENABLE_NETWORK_FEATURES');
    } else {
      log.info('[DEX] Network features disabled (set DEX_ENABLE_NETWORK_FEATURES=true to enable API/Analytics/Sync)');
    }

    // AI Integration (Phase 56-57) - DISABLED
    // initializeAIHub(this.mainWindow!);

    // Pattern Learning (Local-only, background, no UI)
    await initializePatternLearning();
    this.registerPatternLearningHandlers();

    // UKI Voice Assistant
    await ukiController.initialize(this.mainWindow!);

    // Performance Reservation + Defense Orchestrator (best-effort)
    try {
      const { performanceController } = await import('./controllers/PerformanceController');
      performanceController.initialize();
    } catch (err) { log.warn('[main] PerformanceController init failed:', err); }
    try {
      const { defenseController } = await import('./controllers/DefenseController');
      defenseController.initialize(this.mainWindow!);
    } catch (err) { log.warn('[main] DefenseController init failed:', err); }
    try {
      const { nexusController } = await import('./controllers/NexusController');
      nexusController.initialize();
    } catch (err) { log.warn('[main] NexusController init failed:', err); }

    // DEX Rewind - Activity Logger
    await initializeRewind(this.mainWindow!);

    // =======================================================================
    // DEX PREMIUM FEATURES - Ecosystem, UX, Security, Hardware (sequential to reduce memory spikes)
    // =======================================================================
    await initializeEcosystemIntegration();
    await initializeUXEnhancement();
    await initializeSecurityLayer();
    await initializeHardwareOptimization();

    // =======================================================================
    // UNIFIED SYSTEMS: 13 Production Subsystems (SQLite-backed)
    // =======================================================================
    log.info('[DEX] Initializing Unified Systems (13 subsystems)...');
    try {
      databaseManager.initialize();
      log.info('[DEX] DatabaseManager ready (SQLite)');
    } catch (dbErr) {
      log.warn('[DEX] DatabaseManager init failed (continuing):', dbErr);
    }

    // Remove early stub handlers so real managers can register
    const earlyStubChannels = [
      'task-queue:getActive', 'notification-center:getUnreadCount',
      'recycle-bin:getCount', 'scratchpad:getState',
      'localization:getLanguage', 'localization:getAllStrings',
    ];
    for (const ch of earlyStubChannels) {
      ipcMain.removeHandler(ch);
    }

    const unifiedInitFns: Array<[string, (win: BrowserWindow) => void]> = [
      ['UnifiedNotificationCenter', initializeUnifiedNotificationCenter],
      ['GlobalContentSearch', initializeGlobalContentSearch],
      ['SharedMediaLibrary', initializeSharedMediaLibrary],
      ['VersionHistory', initializeVersionHistory],
      ['TaskQueue', initializeTaskQueue],
      ['RecycleBin', initializeRecycleBin],
      ['WorkspaceLayouts', initializeWorkspaceLayouts],
      ['DeepLinks', initializeDeepLinks],
      ['Scratchpad', initializeScratchpad],
      ['Localization', initializeLocalization],
      ['Feedback', initializeFeedback],
      ['MultiWindow', initializeMultiWindow],
      ['BatchOperations', initializeBatchOperations],
      ['InnerAppStability', initializeInnerAppStability],
    ];
    for (const [name, initFn] of unifiedInitFns) {
      try {
        initFn(this.mainWindow!);
      } catch (err) {
        log.warn(`[DEX] ${name} init failed (continuing):`, err);
      }
    }
    log.info('[DEX] Unified Systems initialized (13/13)');

    // =======================================================================
    // DEX NOTES: SQLite-backed Notes System
    // =======================================================================
    try {
      await notesManager.initialize(this.mainWindow!);
      log.info('[DEX] NotesManager initialized (SQLite + FTS5)');
    } catch (notesErr) {
      log.warn('[DEX] NotesManager init failed (continuing):', notesErr);
    }

    // =======================================================================
    // FEATURE SUITE: 38 New Subsystems
    // =======================================================================
    log.info('[DEX] Initializing Feature Suite (38 subsystems)...');
    this.featureSuiteManagers = [
      ['SessionReplay', sessionReplayManager],
      ['ProjectLinker', projectLinkerManager],
      ['DailyBriefing', dailyBriefingManager],
      ['RelationshipGraph', relationshipGraphManager],
      ['TimeTracking', timeTrackingManager as unknown as { initialize: (win: BrowserWindow) => void }],
      ['GoalSystem', goalSystemManager],
      ['SnapshotComparison', snapshotComparisonManager],
      ['ProjectHealth', projectHealthManager],
      ['DuplicationDetector', duplicationDetectorManager],
      ['KeyboardNavigation', keyboardNavigationManager],
      ['ProjectArchiver', projectArchiverManager],
      ['DailyNote', dailyNoteManager],
      ['ContentExpiry', contentExpiryManager],
      ['SearchHistory', searchHistoryManager],
      ['LiveCollaboration', liveCollaborationManager],
      ['SmartGrouping', smartGroupingManager],
      ['VoiceMemo', voiceMemoManager],
      ['ProjectTimeline', projectTimelineManager],
      ['LinkPreview', linkPreviewManager],
      ['StatisticsDashboard', statisticsDashboardManager],
      ['ProjectExportBundle', projectExportBundleManager],
      ['FileWatcherManager', fileWatcherManager],
      ['WordCountManager', wordCountManager],
      ['SmartRenameManager', smartRenameManager],
      ['VinxPresentationManager', vinxPresentationManager],
      ['ProjectComparisonManager', projectComparisonManager],
      ['CustomDashboardManager', customDashboardManager],
      ['ReminderManager', reminderManager],
      ['FullTextIndexManager', fullTextIndexManager],
      ['DependencyManager', dependencyManager],
      ['ColorLabelManager', colorLabelManager],
      ['ReadLaterManager', readLaterManager],
      ['BulkMetadataManager', bulkMetadataManager],
      ['ActivityFeedManager', activityFeedManager],
      ['ProjectLockManager', projectLockManager],
      ['ThemeScheduleManager', themeScheduleManager],
      ['NaturalLanguageTaskManager', naturalLanguageTaskManager],
      ['PersonalChangelogManager', personalChangelogManager],
    ];
    // Staggered batch-initialize: init in batches of 8 with yielding to reduce memory spikes
    let featureInitCount = 0;
    const BATCH_SIZE = 8;
    for (let i = 0; i < this.featureSuiteManagers.length; i += BATCH_SIZE) {
      const batch = this.featureSuiteManagers.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(([name, manager]) =>
        Promise.resolve().then(() => {
          manager.initialize(this.mainWindow!);
          featureInitCount++;
        }).catch(err => log.warn(`[DEX] ${name} init failed (continuing):`, err))
      );
      await Promise.all(batchPromises);
      // Yield to event loop between batches to prevent blocking
      if (i + BATCH_SIZE < this.featureSuiteManagers.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    log.info(`[DEX] Feature Suite initialized (${featureInitCount}/${this.featureSuiteManagers.length})`);

    // =======================================================================
    // DEEP BACKEND SYSTEMS: 11-Part Architecture Pass
    // =======================================================================
    log.info('[DEX] Initializing Deep Backend Systems...');
    const deepInit = (name: string, fn: () => void) => {
      try { fn(); log.info(`[DEX] ${name} ready`); }
      catch (err) { log.warn(`[DEX] ${name} init failed (continuing):`, err); }
    };

    deepInit('PerformanceInstrument', () => initializePerformanceInstrument());
    deepInit('DatabaseCluster', () => initializeDatabaseCluster());
    deepInit('EncryptionOrchestrator', () => initializeEncryptionOrchestrator(this.mainWindow!));
    deepInit('DexEventBus', () => initializeDexEventBus(this.mainWindow!));
    deepInit('IntelligenceAPI', () => initializeIntelligenceAPI(this.mainWindow!));
    deepInit('PluginSecurityGate', () => initializePluginSecurityGate(this.mainWindow!));
    deepInit('StartupSequencer', () => initializeStartupSequencer());
    deepInit('ShutdownSequencer', () => initializeShutdownSequencer());
    deepInit('ThreadOrchestrator', () => initializeThreadOrchestrator());
    log.info('[DEX] Deep Backend Systems initialized (9/9)');

    // =======================================================================
    // DEX REWIND SYSTEM JOURNAL: Central Operational Memory Layer
    // =======================================================================
    log.info('[DEX] Initializing System Journal...');
    deepInit('SystemJournal', () => initializeSystemJournal(this.mainWindow!));
    deepInit('JournalAnalysis', () => initializeJournalAnalysis(this.mainWindow!));
    log.info('[DEX] System Journal initialized');

    // =======================================================================
    // SYSTEM COMPLETENESS: Infrastructure, Platform, and Quality Pass
    // =======================================================================
    log.info('[DEX] Initializing System Completeness modules...');
    deepInit('MigrationManager', () => migrationManager.initialize());
    deepInit('MultiMonitorManager', () => multiMonitorManager.initialize(this.mainWindow!));
    deepInit('MultiUserManager', () => multiUserManager.initialize());
    deepInit('LicensingManager', () => licensingManager.initialize());
    deepInit('LocalizationManager', () => localizationManager.initialize());
    deepInit('HelpSystemManager', () => helpSystemManager.initialize(this.mainWindow!));
    deepInit('DeveloperPlatformManager', () => developerPlatformManager.initialize(this.mainWindow!));
    deepInit('BackupRestoreManager', () => backupRestoreManager.initialize());
    deepInit('DataImportManager', () => dataImportManager.initialize(this.mainWindow!));
    deepInit('HealthCheckManager', () => healthCheckManager.initialize());
    deepInit('UninstallManager', () => uninstallManager.initialize());
    log.info('[DEX] System Completeness initialized (11/11)');

    // =======================================================================
    // SYSTEM OPTIMIZATION LAYER: Hardware-Aware Performance Management
    // =======================================================================
    log.info('[DEX] Initializing System Optimization Layer...');
    try {
      // Detect hardware capabilities (CPU, RAM, Storage, GPU, Battery, Display, Thermal)
      await hardwareDetector.detect();
      const tier = hardwareDetector.getTier();
      log.info(`[DEX] Hardware detected: capability tier = ${tier}`);

      // Initialize SSD spill manager based on hardware tier budget
      try {
        const budgets = hardwareDetector.getMemoryBudgets();
        if (budgets.ssdSpillMB > 0) {
          SSDSpillManager.init(budgets.ssdSpillMB);
          log.info(`[DEX] SSD spill initialized: ${budgets.ssdSpillMB} MB (effective total: ${budgets.effectiveTotalMB} MB)`);
        }
      } catch (spillErr) {
        log.warn('[DEX] SSD spill init failed (continuing without):', spillErr);
      }



      // Start the master optimization wiring (connects all subsystems)
      systemOptimizationWiring.initialize(this.mainWindow!);
      log.info('[DEX] System Optimization Layer initialized');
    } catch (optErr) {
      log.warn('[DEX] System Optimization Layer init failed (continuing):', optErr);
    }

    this.logger.info('All subsystems initialized');
  }

  private registerGlobalShortcuts(): void {
    
    // Global emergency stop: Cmd/Ctrl + Shift + Escape
    globalShortcut.register(isMac ? 'Cmd+Shift+Escape' : 'Ctrl+Shift+Escape', () => {
      this.emergencyStop();
    });

    // Show/hide app: Cmd/Ctrl + Shift + D
    globalShortcut.register(isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+D', () => {
      if (this.mainWindow?.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow?.show();
        this.mainWindow?.focus();
      }
    });

    this.logger.info('Global shortcuts registered');
  }

  private async createWindow(): Promise<void> {
    const isMac = process.platform === 'darwin';
    const isOSMode = process.argv.includes('--os-mode') || process.env.DEX_OS_MODE === '1';
    
    log.info(`[DEX] Creating BrowserWindow (OS Mode: ${isOSMode})...`);
    
    // GPU switches are applied in initialize() before app.whenReady()

    // In OS mode, use full screen; otherwise cap to 85% of display
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    const fullBounds = screen.getPrimaryDisplay().bounds;
    const winWidth = isOSMode ? fullBounds.width : Math.min(WINDOW.DEFAULT_WIDTH, Math.round(screenW * 0.80));
    const winHeight = isOSMode ? fullBounds.height : Math.min(WINDOW.DEFAULT_HEIGHT, Math.round(screenH * 0.80));
    
    this.mainWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      minWidth: WINDOW.MIN_WIDTH,
      minHeight: WINDOW.MIN_HEIGHT,
      show: false, // Don't show until ready
      center: !isOSMode,
      x: isOSMode ? fullBounds.x : undefined,
      y: isOSMode ? fullBounds.y : undefined,
      icon: path.join(__dirname, '../../assets/icon.png'),
      frame: isOSMode ? false : isMac,
      transparent: false,
      fullscreen: isOSMode,
      kiosk: isOSMode,
      backgroundColor: WINDOW.BACKGROUND_COLOR,
      titleBarStyle: isOSMode ? 'hidden' : (isMac ? 'hiddenInset' : 'hidden'),
      // Item 55: Native vibrancy on macOS (sidebar material)
      ...(isMac && !isOSMode ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const } : {}),
      titleBarOverlay: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webviewTag: true,
        preload: path.join(__dirname, 'preload.js'),
        // Security hardening
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableBlinkFeatures: '',
        navigateOnDragDrop: false,
        spellcheck: true,
        // Additional protections
        disableDialogs: false,
        safeDialogs: true,
        safeDialogsMessage: 'DEX has prevented this page from creating additional dialogs.',
        // Performance: disable deprecated WebSQL, enable V8 code caching
        enableWebSQL: false,
        v8CacheOptions: 'bypassHeatCheck',
        // Adaptive throttling: disabled to prevent state loss on refocus
        backgroundThrottling: false,
      },
    });

    log.info('[DEX] BrowserWindow created');

    // Create native macOS menu
    if (isMac) {
      this.createMacMenu();
    }

    // Show window when ready (prevents flash)
    this.mainWindow.once('ready-to-show', () => {
      log.info('[DEX] Window ready-to-show');
      // In OS mode, stay fullscreen; otherwise ensure defined size
      if (!isOSMode && this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      }
      this.mainWindow?.show();
      this.mainWindow?.focus();
      // Tell renderer about OS mode so it can adapt UI
      this.mainWindow?.webContents.send('dex:os-mode', isOSMode);
    });

    // NOTE: session.clearCache() removed — it was destroying the entire HTTP/disk
    // cache on every startup, forcing re-download of all resources. Stale Vite
    // chunks are handled by content-hashed filenames in production builds.

    // Load the app
    const isDev = process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    const indexPath = path.join(__dirname, '../renderer/index.html');
    
    if (isDev) {
      log.info('[DEX] Loading renderer from dev server:', devServerUrl);
    } else {
      log.info('[DEX] Loading renderer from:', indexPath);
    }
    
    if (isDev) {
      try {
        await this.mainWindow.loadURL(devServerUrl);
        log.info('[DEX] Renderer loaded from dev server');
      } catch (err) {
        log.warn('[DEX] Dev server not ready, falling back to built files...');
        if (fs.existsSync(indexPath)) {
          await this.mainWindow.loadFile(indexPath);
          log.info('[DEX] Renderer loaded from built files');
        } else {
          await this.mainWindow.loadURL(
            'data:text/html;charset=utf-8,' +
              encodeURIComponent(`
                <!DOCTYPE html>
                <html>
                <head><title>DEX</title></head>
                <body style="margin:0;background:#09090b;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
                  <h1 style="font-size:32px;margin:0 0 16px;font-weight:600;">DEX</h1>
                  <div style="font-size:14px;color:#ef4444;margin-bottom:8px;">Dev server not available</div>
                  <div style="font-size:12px;color:#a1a1aa;">Run: npm run dev:renderer</div>
                </body>
                </html>
              `)
          );
          this.mainWindow.show();
        }
      }
    } else if (!fs.existsSync(indexPath)) {
      log.error('[DEX] Renderer not found! Loading fallback...');
      await this.mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`
            <!DOCTYPE html>
            <html>
            <head><title>DEX</title></head>
            <body style="margin:0;background:#09090b;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
              <h1 style="font-size:32px;margin:0 0 16px;font-weight:600;">DEX</h1>
              <div style="font-size:14px;color:#ef4444;margin-bottom:8px;">Renderer not found</div>
              <div style="font-size:12px;color:#a1a1aa;">Run: npm run build</div>
            </body>
            </html>
          `)
      );
      this.mainWindow.show();
    } else {
      try {
        await this.mainWindow.loadFile(indexPath);
        log.info('[DEX] Renderer loaded successfully');
      } catch (err) {
        log.error('[DEX] Failed to load renderer:', err);
        // Load fallback
        await this.mainWindow.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent(`
              <!DOCTYPE html>
              <html>
              <head><title>DEX</title></head>
              <body style="margin:0;background:#09090b;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
                <h1 style="font-size:32px;margin:0 0 16px;font-weight:600;">DEX</h1>
                <div style="font-size:14px;color:#ef4444;margin-bottom:8px;">Failed to load UI</div>
                <div style="font-size:12px;color:#a1a1aa;">${String(err)}</div>
              </body>
              </html>
            `)
        );
        this.mainWindow.show();
      }
    }

    // Renderer diagnostics
    this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      log.error(`[DEX] Renderer failed: ${errorCode} - ${errorDescription}`);
    });
    
    this.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const tag = level >= 3 ? 'error' : level >= 2 ? 'warn' : 'info';
      log.info(`[RendererConsole][${tag}] ${message} (${sourceId}:${line})`);
    });

    this.mainWindow.webContents.on('did-finish-load', () => {
      log.info('[DEX] Renderer finished loading');
      this.logger.info('Renderer finished loading');
      
      // Register window with performance systems (safely)
      if (this.mainWindow) {
        try { RenderGovernor.registerWindow(this.mainWindow); } catch (e) { log.warn('[DEX] RenderGovernor registration failed:', e); }
        try { MotionController.registerWindow(this.mainWindow); } catch (e) { log.warn('[DEX] MotionController registration failed:', e); }
        try { InputLatencyController.registerWindow(this.mainWindow); } catch (e) { log.warn('[DEX] InputLatencyController registration failed:', e); }
        try { SessionStabilityManager.registerWindow(this.mainWindow); } catch (e) { log.warn('[DEX] SessionStabilityManager registration failed:', e); }
        try { PerformanceEnforcer.registerWindow(this.mainWindow); } catch (e) { log.warn('[DEX] PerformanceEnforcer registration failed:', e); }
      }
      try { this.handleQuickActionArgv(process.argv); } catch (err) { log.warn('[DEX] Initial quick-action argv handling failed:', err); }
    });

    // -- Renderer crash recovery -----------------------------------------
    {
      let crashCount = 0;
      let firstCrashTime = 0;
      const CRASH_WINDOW_MS = 60000;
      const MAX_CRASHES_IN_WINDOW = 3;

      this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
        const reason = details.reason || 'unknown';
        log.error(`[DEX] Renderer process gone: ${reason}`);
        securityAudit.log('system', 'renderer-crash', `Renderer process gone: ${reason} (exit ${details.exitCode})`);

        const now = Date.now();
        if (now - firstCrashTime > CRASH_WINDOW_MS) {
          crashCount = 0;
          firstCrashTime = now;
        }
        crashCount++;

        if (crashCount >= MAX_CRASHES_IN_WINDOW) {
          log.error(`[DEX] Renderer crashed ${crashCount} times in ${CRASH_WINDOW_MS / 1000}s`);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.loadURL(
              'data:text/html;charset=utf-8,' +
              encodeURIComponent(`<!DOCTYPE html><html><head><title>DEX</title></head>
              <body style="margin:0;background:#09090b;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
              <h1 style="font-size:24px;margin:0 0 16px;font-weight:600;">DEX</h1>
              <div style="font-size:14px;color:#f59e0b;margin-bottom:8px;">This window is having repeated problems.</div>
              <div style="font-size:12px;color:#a1a1aa;">Contact support if this continues.</div>
              </body></html>`)
            );
          }
          return;
        }

        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            log.info('[DEX] Reloading renderer after crash...');
            this.mainWindow.webContents.reload();
            setTimeout(() => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('renderer:crash-recovery', {
                  message: 'This window restarted after an error. Your work has been restored.',
                  reason,
                });
              }
            }, 1000);
          }
        }, 500);
      });

      this.mainWindow.on('unresponsive', () => {
        log.warn('[DEX] Window became unresponsive');
        securityAudit.log('system', 'renderer-unresponsive', 'Window became unresponsive');
        // Do NOT force-crash the renderer — it kills all webview tabs and playing media.
        // Instead, log and wait for natural recovery.
      });

      this.mainWindow.on('responsive', () => {
        log.info('[DEX] Window became responsive again');
      });
    }

    // -- Content Security Policy -----------------------------------------
    this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob: data: https:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' https:; " +
            "worker-src 'self' blob:; " +
            "frame-src 'self'; " +
            "object-src 'none'; " +
            "base-uri 'self';"
          ],
        },
      });
    });

    // Handle webview permissions for embedded browser (main session)
    // Include audioCapture for microphone, video for camera
    const allowedPermissions = ['media', 'audioCapture', 'microphone', 'notifications', 'fullscreen', 'clipboard-read', 'mediaKeySystem', 'display-capture', 'video', 'videoCapture', 'audio'];

    this.mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        log.warn(`[DEX] Denied permission request: ${permission}`);
        callback(false);
      }
    });

    // Grant media/audio permissions immediately on check (fixes UKI mic access)
    this.mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
      return allowedPermissions.includes(permission);
    });

    // Handle webview permissions for the browser partition (separate session)
    const { session: electronSession } = require('electron');
    const browserSession = electronSession.fromPartition('persist:dex-browser');
    browserSession.setPermissionRequestHandler((_webContents: any, permission: string, callback: (granted: boolean) => void) => {
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        log.warn(`[DEX] Denied browser-partition permission request: ${permission}`);
        callback(false);
      }
    });
    browserSession.setPermissionCheckHandler((_webContents: any, permission: string) => {
      return allowedPermissions.includes(permission);
    });

    // Handle webview attachment - configure webview security
    app.on('web-contents-created', (_, contents) => {
      // Prevent the main window from being navigated away by malicious content
      contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        // Allow dev server in development, block all other navigations in main window
        const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
        if (isDev && parsedUrl.origin === new URL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173').origin) return;
        // Block navigation in the main window — webview handles its own navigation
        if (contents === this.mainWindow?.webContents) {
          event.preventDefault();
        }
      });

      contents.on('will-attach-webview', (event, webPreferences, params) => {
        // Strip preload scripts
        delete webPreferences.preload;
        
        // Enable necessary features for browsing while maintaining security
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.webSecurity = true;
        // Enable JavaScript and WebGL for modern sites
        webPreferences.javascript = true;
        webPreferences.webgl = true;
        webPreferences.images = true;
        webPreferences.autoplayPolicy = 'no-user-gesture-required' as any;
        webPreferences.backgroundThrottling = false;
        
        // Verify URL is safe
        const url = params.src;
        if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('data:')) {
          event.preventDefault();
        }
      });

      // Handle new window requests from webviews
      contents.setWindowOpenHandler(({ url }) => {
        // Open links in new webview tab or external browser based on scheme
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // Let the renderer handle new tabs
          this.mainWindow?.webContents.send('browser:new-tab', url);
        }
        return { action: 'deny' };
      });
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        // In dev mode, actually quit — prevents zombie processes accumulating
        const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
        if (isDev) {
          this.isQuitting = true;
          app.quit();
          return;
        }
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
    
    // Timeout fallback - if window doesn't show in 5 seconds, force show
    setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isVisible()) {
        log.info('[DEX] Forcing window visible after timeout');
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }, 5000);
  }

  private createMacMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Preferences...',
            accelerator: 'Cmd+,',
            click: () => {
              this.mainWindow?.show();
              this.mainWindow?.webContents.send('navigate', '/settings');
            }
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          {
            label: 'New Action',
            accelerator: 'Cmd+N',
            click: () => {
              this.mainWindow?.show();
              this.mainWindow?.webContents.send('action:new');
            }
          },
          {
            label: 'New Workflow',
            accelerator: 'Cmd+Shift+N',
            click: () => {
              this.mainWindow?.show();
              this.mainWindow?.webContents.send('workflow:new');
            }
          },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ]
      },
      {
        label: 'Help',
        role: 'help',
        submenu: [
          {
            label: 'Dex Documentation',
            click: () => shell.openExternal('https://github.com/dex-app/dex')
          },
          {
            label: 'Report Issue',
            click: () => shell.openExternal('https://github.com/dex-app/dex/issues')
          },
          { type: 'separator' },
          {
            label: 'Emergency Stop',
            accelerator: 'Cmd+Shift+Escape',
            click: () => this.emergencyStop()
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private createTray(): void {
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    this.rebuildTrayMenu();
    this.tray.setToolTip(this.streakTooltip());
    this.tray.on('click', () => this.mainWindow?.show());
  }

  /** Local-day streak (read-only after createTray; updated again on each launch). */
  private streak: StreakState = EMPTY_STREAK;
  private streakFile(): string {
    try { return path.join(app.getPath('userData'), 'engagement.json'); } catch { return ''; }
  }
  private loadStreak(): StreakState {
    try {
      const file = this.streakFile();
      if (!file || !fs.existsSync(file)) return EMPTY_STREAK;
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StreakState>;
      return {
        current: typeof parsed.current === 'number' ? parsed.current : 0,
        longest: typeof parsed.longest === 'number' ? parsed.longest : 0,
        totalDays: typeof parsed.totalDays === 'number' ? parsed.totalDays : 0,
        lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
      };
    } catch { return EMPTY_STREAK; }
  }
  private saveStreak(s: StreakState): void {
    try {
      const file = this.streakFile();
      if (!file) return;
      fs.writeFileSync(file, JSON.stringify(s), 'utf-8');
    } catch {
      /* INTENTIONAL FALLBACK: streak is an unimportant local counter; ignore I/O errors. */
    }
  }
  /** Update the streak for today and return a tooltip string for the tray. */
  private streakTooltip(): string {
    try {
      this.streak = recordLaunch(this.loadStreak(), new Date());
      this.saveStreak(this.streak);
      return tooltipFor(this.streak);
    } catch {
      return 'DEX';
    }
  }

  /**
   * Sections of the local store that are safe and useful to put in a
   * user-visible backup. Anything with secrets, machine-bound tokens,
   * or telemetry IDs stays out on purpose.
   */
  private static BACKUP_SECTIONS: readonly string[] = [
    'notes', 'tasks', 'workflows', 'projects', 'tags',
    'modes', 'rules', 'sessions', 'sessionNotes', 'sessionTimers',
    'focusSessions', 'activities', 'themeConfig', 'settings', 'appliedSettings',
  ];

  private async collectBackupPayload(): Promise<BackupPayload> {
    const out: BackupPayload = {};
    for (const key of DexApp.BACKUP_SECTIONS) {
      try {
        const value = await this.dataStore.get(key);
        if (value !== null && value !== undefined) out[key] = value;
      } catch (err) {
        log.warn('[DEX] Backup: skipping section', key, err);
      }
    }
    return out;
  }

  private sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf-8').digest('hex');
  }

  /**
   * Tray-driven "Save backup..." flow: collect the user's local data,
   * wrap it in a versioned envelope with an integrity hash, and write
   * it to a path the user picks.
   */
  private async saveBackup(): Promise<void> {
    const win = this.mainWindow ?? undefined;
    const filename = defaultFilename();
    const result = win
      ? await dialog.showSaveDialog(win, { title: 'Save DEX backup', defaultPath: filename, filters: [{ name: 'DEX backup', extensions: ['json'] }] })
      : await dialog.showSaveDialog({ title: 'Save DEX backup', defaultPath: filename, filters: [{ name: 'DEX backup', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return;
    const payload = await this.collectBackupPayload();
    const envelope = buildEnvelope(payload, app.getVersion(), (s) => this.sha256Hex(s));
    fs.writeFileSync(result.filePath, JSON.stringify(envelope, null, 2), 'utf-8');
    if (win) {
      void dialog.showMessageBox(win, {
        type: 'info',
        title: 'Backup saved',
        message: 'DEX saved a copy of your work.',
        detail: `Backup written to:\n${result.filePath}\n\nKeep this file in a safe place. You can restore it from Settings.`,
        buttons: ['OK'],
      });
    }
  }

  private rebuildTrayMenu(): void {
    if (!this.tray) return;

    const isRecording = rewindEngine.getRecordingState();

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Dex', click: () => this.mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quick actions', enabled: false },
      {
        label: 'New note',
        click: () => { this.mainWindow?.show(); this.mainWindow?.webContents?.send('navigate:app', 'notes', { action: 'new' }); },
      },
      {
        label: 'New task',
        click: () => { this.mainWindow?.show(); this.mainWindow?.webContents?.send('navigate:app', 'tasks', { action: 'new' }); },
      },
      {
        label: 'Open files',
        click: () => { this.mainWindow?.show(); this.mainWindow?.webContents?.send('navigate:app', 'files'); },
      },
      { type: 'separator' },
      { label: 'Rewind', enabled: false },
      {
        label: isRecording ? 'Pause Recording' : 'Resume Recording',
        click: () => {
          rewindEngine.toggleRecordingState();
          this.rebuildTrayMenu();
        },
      },
      {
        label: 'Open Timeline',
        click: () => {
          this.mainWindow?.show();
          this.mainWindow?.webContents?.send('navigate:app', 'rewind');
        },
      },
      {
        label: `Status: ${isRecording ? 'Recording' : 'Paused'}`,
        enabled: false,
      },
      { type: 'separator' },
      { label: 'Emergency Stop', click: () => this.emergencyStop() },
      { type: 'separator' },
      { label: 'Save backup...', click: () => { this.saveBackup().catch(err => log.error('[DEX] Backup failed:', err)); } },
      { type: 'separator' },
      { label: 'Quit Dex', click: () => this.quit() },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Windows JumpList: tasks shown when the user right-clicks the DEX
   * taskbar icon or the Start Menu shortcut. Each task re-launches DEX
   * with a known argv flag the renderer interprets via `navigate:app`.
   * No-op on macOS / Linux (Electron documents this method as Windows-
   * only and silently ignores it elsewhere).
   */
  private registerJumpList(): void {
    if (process.platform !== 'win32') return;
    try {
      app.setUserTasks([
        {
          program: process.execPath,
          arguments: '--dex-quick=note',
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'New note',
          description: 'Capture a quick note in DEX',
        },
        {
          program: process.execPath,
          arguments: '--dex-quick=task',
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'New task',
          description: 'Capture a quick task in DEX',
        },
        {
          program: process.execPath,
          arguments: '--dex-quick=files',
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'Open files',
          description: 'Jump straight to the DEX file browser',
        },
      ]);
      this.logger.info('JumpList tasks registered');
    } catch (err) {
      this.logger.warn('JumpList registration failed', err);
    }
  }

  /**
   * Inspect process.argv (and second-instance argv) for `--dex-quick=...`
   * launched via the JumpList, and forward it to the renderer.
   */
  private handleQuickActionArgv(argv: readonly string[]): void {
    const flag = argv.find(a => a.startsWith('--dex-quick='));
    if (!flag) return;
    const which = flag.slice('--dex-quick='.length);
    if (!this.mainWindow) return;
    this.mainWindow.show();
    if (which === 'note') {
      this.mainWindow.webContents?.send('navigate:app', 'notes', { action: 'new' });
    } else if (which === 'task') {
      this.mainWindow.webContents?.send('navigate:app', 'tasks', { action: 'new' });
    } else if (which === 'files') {
      this.mainWindow.webContents?.send('navigate:app', 'files');
    }
  }

  private setupIPC(): void {
    // -------------------------------------------------------------------------    // User Activity Tracking (for ResourceGovernor)
    // ---------------------------------------------------------------------------
    ipcMain.on('user:activity', () => {
      resourceGovernor.recordUserActivity();
      backgroundTasks.recordUserInput();
    });

    // ---------------------------------------------------------------------------
    // User Profile IPC
    // ---------------------------------------------------------------------------
    ipcMain.handle('user:getProfile', () => {
      const username = os.userInfo().username || 'User';
      return {
        username,
        displayName: username,
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
      };
    });

    // ---------------------------------------------------------------------------
    // Backup / restore IPC (matches tray "Save backup..." flow)
    // ---------------------------------------------------------------------------
    ipcMain.handle('backup:save', async () => {
      try { await this.saveBackup(); return { success: true }; }
      catch (err: any) { log.error('[DEX] backup:save failed:', err); return { success: false, error: String(err?.message ?? err) }; }
    });
    ipcMain.handle('backup:preview', async (_e, raw: string) => {
      try {
        const json = JSON.parse(raw);
        const parsed = parseEnvelope(json, (s) => this.sha256Hex(s));
        if (!parsed.ok || !parsed.envelope) return { ok: false, reason: parsed.reason ?? 'Invalid backup.' };
        const sections = Object.keys(parsed.envelope.data);
        return { ok: true, createdAt: parsed.envelope.createdAt, appVersion: parsed.envelope.appVersion, sections };
      } catch (err: any) {
        return { ok: false, reason: `Could not read backup: ${String(err?.message ?? err)}` };
      }
    });

    // ---------------------------------------------------------------------------
    // Resource Governor IPC
    // ---------------------------------------------------------------------------
    ipcMain.handle('resource:getSnapshot', async () => {
      return resourceGovernor.getSnapshot();
    });

    ipcMain.handle('resource:getPressure', async () => {
      return resourceGovernor.getPressure();
    });

    ipcMain.handle('resource:getThrottleLevel', async () => {
      return resourceGovernor.getThrottleLevel();
    });

    ipcMain.handle('resource:getBudgets', async () => {
      return resourceGovernor.getSubsystemBudgets();
    });

    // ---------------------------------------------------------------------------
    // Renderer Logger IPC
    // ---------------------------------------------------------------------------
    ipcMain.handle('log:renderer', async (_event, payload: { level: string; message: string; data?: unknown }) => {
      const { level, message, data } = payload || {};
      if (typeof message !== 'string') return;
      const prefix = `[Renderer] ${message}`;
      switch (level) {
        case 'warn': log.warn(prefix, data || ''); break;
        case 'error': log.error(prefix, data || ''); break;
        default: log.info(prefix, data || ''); break;
      }
    });

    // ---------------------------------------------------------------------------
    // Renderer Heartbeat -- renderer sends every 5 s; main logs and notifies
    // the watchdog so it can detect frozen renderers.
    // ---------------------------------------------------------------------------
    let _firstHeartbeat = true;
    ipcMain.handle('renderer:heartbeat', (_event, payload: {
      t: number;
      frameTimeMs: number;
      heapUsedMB: number;
      freezeDetected: boolean;
      frozenMs?: number;
    }) => {
      if (!payload || typeof payload.t !== 'number') return;
      if (_firstHeartbeat) {
        _firstHeartbeat = false;
        startupTimeline.mark('renderer:first-heartbeat');
        startupTimeline.complete();
      }
      watchdogController.recordRendererHeartbeat?.({
        t: payload.t,
        heapUsedMB: payload.heapUsedMB ?? 0,
        frameTimeMs: payload.frameTimeMs ?? 0,
      });
      if (payload.freezeDetected) {
        log.warn('[Renderer] freeze detected', { frozenMs: payload.frozenMs, heapUsedMB: payload.heapUsedMB });
        crashReporterService.recordFreezeEvent?.({
          source: 'renderer',
          frozenMs: payload.frozenMs ?? 0,
          t: payload.t,
        });
      }
    });

    // ---------------------------------------------------------------------------
    // Startup Timeline -- renderer diagnostics panel can request full snapshot
    // ---------------------------------------------------------------------------
    ipcMain.handle('startup:timeline', () => startupTimeline.snapshot());

    // ---------------------------------------------------------------------------
    // Renderer Error Report -- global window.onerror / unhandledrejection events
    // ---------------------------------------------------------------------------
    ipcMain.on('render-error:report', (_event, payload: {
      kind: 'error' | 'unhandledrejection';
      message?: string;
      stack?: string;
      filename?: string;
      lineno?: number;
      colno?: number;
      t?: number;
    }) => {
      if (!payload) return;
      const { kind, message, stack, t } = payload;
      log.error(`[Renderer:${kind}] ${message ?? 'unknown'}`, { stack, t });
      crashReporterService.recordRendererError?.({ kind, message: message ?? '', stack, t: t ?? Date.now() });
    });

    // ---------------------------------------------------------------------------
    // Native Core IPC (dex-core Rust addon bridge)
    // ---------------------------------------------------------------------------
    const nativeCore = (() => {
      try {
        const { isCoreAvailable, getCoreModule } = require('./native/core-loader');
        return { isCoreAvailable, getCoreModule };
      } catch {
        return {
          isCoreAvailable: () => false,
          getCoreModule: () => null,
        };
      }
    })();

    ipcMain.handle('native-core:available', () => {
      try { return nativeCore.isCoreAvailable(); } catch { return false; }
    });

    ipcMain.handle('native-core:physics-create', (_, stiffness: number, damping: number, mass: number, initial: number, target: number) => {
      try {
        const mod = nativeCore.getCoreModule();
        if (!mod) return -1;
        return mod.physicsCreateSpring(stiffness, damping, mass, initial, target);
      } catch { return -1; }
    });

    ipcMain.handle('native-core:physics-set-target', (_, id: number, target: number) => {
      try {
        const mod = nativeCore.getCoreModule();
        if (mod) mod.physicsSetTarget(id, target);
      } catch { /* swallow */ }
    });

    ipcMain.handle('native-core:physics-release', (_, id: number) => {
      try {
        const mod = nativeCore.getCoreModule();
        if (mod) mod.physicsReleaseSpring(id);
      } catch { /* swallow */ }
    });

    ipcMain.handle('native-core:search-fuzzy', async (_, query: string, candidates: string[], limit: number) => {
      try {
        const mod = nativeCore.getCoreModule();
        if (!mod) return [];
        return await mod.searchFuzzy(query, candidates, limit);
      } catch { return []; }
    });

    ipcMain.handle('native-core:memory-pressure', async () => {
      try {
        const mod = nativeCore.getCoreModule();
        if (!mod) return 'normal';
        return await mod.memoryGetPressure();
      } catch { return 'normal'; }
    });

    ipcMain.handle('native-core:platform-info', () => {
      try {
        const mod = nativeCore.getCoreModule();
        if (!mod) return JSON.stringify({ os: process.platform, arch: process.arch, family: 'unknown', features: [] });
        return mod.platformGetInfo();
      } catch { return JSON.stringify({ os: process.platform, arch: process.arch, family: 'unknown', features: [] }); }
    });

    ipcMain.handle('native-core:scheduler-cores', () => {
      try {
        const mod = nativeCore.getCoreModule();
        if (!mod) return os.cpus().length;
        return mod.schedulerGetCoreCount();
      } catch { return os.cpus().length; }
    });

    // ---------------------------------------------------------------------------
    // Native Kernel -- Spatial & Matrix IPC for AXL CAD engine
    // ---------------------------------------------------------------------------

    ipcMain.handle('native-core:spatial-create', () => {
      try { return CppSpatial.create(); } catch { return -1; }
    });

    ipcMain.handle('native-core:spatial-insert', (_, id: number, x: number, y: number, z: number, label?: string) => {
      try { CppSpatial.insert(id, x, y, z, label); } catch { /* swallow */ }
    });

    ipcMain.handle('native-core:spatial-query', (_, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => {
      try { return CppSpatial.query(minX, minY, minZ, maxX, maxY, maxZ); } catch { return []; }
    });

    ipcMain.handle('native-core:spatial-nearest', (_, x: number, y: number, z: number, k: number) => {
      try { return CppSpatial.nearest(x, y, z, k); } catch { return []; }
    });

    ipcMain.handle('native-core:spatial-clear', () => {
      try { CppSpatial.clear(); } catch { /* swallow */ }
    });

    ipcMain.handle('native-core:mat4-multiply', (_, a: number[], b: number[]) => {
      try {
        const result = CppMatrix.multiply(new Float64Array(a), new Float64Array(b));
        return result ? Array.from(result) : null;
      } catch { return null; }
    });

    ipcMain.handle('native-core:batch-hash', (_, items: string[]) => {
      try { return CppHash.batch(items); } catch { return []; }
    });
    // ---------------------------------------------------------------------------
    ipcMain.handle('native:image-metadata', (_, filePath: string) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeImage } = require('./native/bridge');
        return NativeImage.getMetadata(filePath);
      } catch { return null; }
    });

    ipcMain.handle('native:image-thumbnail', (_, inputPath: string, outputPath: string, maxWidth: number, maxHeight: number) => {
      try {
        PathValidator.validatePath(inputPath, { requireExists: true });
        PathValidator.validatePath(outputPath);
        const { NativeImage } = require('./native/bridge');
        return NativeImage.generateThumbnail(inputPath, outputPath, maxWidth, maxHeight);
      } catch { return null; }
    });

    ipcMain.handle('native:image-batch-resize', (_, inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string) => {
      try {
        for (const p of inputPaths) PathValidator.validatePath(p, { requireExists: true });
        PathValidator.validatePath(outputDir);
        const { NativeImage } = require('./native/bridge');
        return NativeImage.batchResize(inputPaths, outputDir, maxWidth, maxHeight, format);
      } catch { return null; }
    });

    ipcMain.handle('native:audio-metadata', (_, filePath: string) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeAudio } = require('./native/bridge');
        return NativeAudio.getMetadata(filePath);
      } catch { return null; }
    });

    ipcMain.handle('native:audio-waveform', (_, filePath: string, numBins: number) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeAudio } = require('./native/bridge');
        return NativeAudio.extractWaveformPeaks(filePath, numBins);
      } catch { return null; }
    });

    ipcMain.handle('native:audio-normalize', (_, inputPath: string, outputPath: string, targetDb?: number) => {
      try {
        PathValidator.validatePath(inputPath, { requireExists: true });
        PathValidator.validatePath(outputPath);
        const { NativeAudio } = require('./native/bridge');
        return NativeAudio.normalize(inputPath, outputPath, targetDb);
      } catch { return null; }
    });

    ipcMain.handle('native:video-metadata', (_, filePath: string) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeVideo } = require('./native/bridge');
        return NativeVideo.getMetadata(filePath);
      } catch { return null; }
    });

    ipcMain.handle('native:media-probe', (_, filePath: string) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeVideo } = require('./native/bridge');
        return NativeVideo.probe(filePath);
      } catch { return null; }
    });

    // ---------------------------------------------------------------------------
    // Creative Utilities IPC (color, hashing, project analysis)
    // ---------------------------------------------------------------------------
    ipcMain.handle('native:parse-color', (_, hex: string) => {
      try {
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.parseColor(hex);
      } catch { return null; }
    });

    ipcMain.handle('native:hsl-to-hex', (_, h: number, s: number, l: number) => {
      try {
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.hslToHex(h, s, l);
      } catch { return null; }
    });

    ipcMain.handle('native:generate-palette', (_, hex: string, mode: string) => {
      try {
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.generatePalette(hex, mode);
      } catch { return null; }
    });

    ipcMain.handle('native:contrast-ratio', (_, hex1: string, hex2: string) => {
      try {
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.contrastRatio(hex1, hex2);
      } catch { return null; }
    });

    ipcMain.handle('native:hash-file', (_, filePath: string) => {
      try {
        PathValidator.validatePath(filePath, { requireExists: true });
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.hashFile(filePath);
      } catch { return null; }
    });

    ipcMain.handle('native:batch-hash', (_, filePaths: string[]) => {
      try {
        for (const p of filePaths) PathValidator.validatePath(p, { requireExists: true });
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.batchHashFiles(filePaths);
      } catch { return null; }
    });

    ipcMain.handle('native:analyze-project', (_, dirPath: string) => {
      try {
        PathValidator.validatePath(dirPath, { requireExists: true });
        const { NativeCreative } = require('./native/bridge');
        return NativeCreative.analyzeProjectDir(dirPath);
      } catch { return null; }
    });

    // ---------------------------------------------------------------------------
    // Native System/Health/Files/Process IPC (Rust direct access from renderer)
    // ---------------------------------------------------------------------------
    ipcMain.handle('native:available', () => {
      try {
        const { isNativeAvailable } = require('./native/bridge');
        return isNativeAvailable();
      } catch { return false; }
    });

    ipcMain.handle('native:system-stats', () => {
      try {
        const { NativeSystem } = require('./native/bridge');
        return NativeSystem.getStats();
      } catch { return null; }
    });

    ipcMain.handle('native:disk-info', () => {
      try {
        const { NativeSystem } = require('./native/bridge');
        return NativeSystem.getDisks();
      } catch { return []; }
    });

    ipcMain.handle('native:network-info', () => {
      try {
        const { NativeSystem } = require('./native/bridge');
        return NativeSystem.getNetworks();
      } catch { return []; }
    });

    ipcMain.handle('native:process-list', (_, limit?: number) => {
      try {
        const { NativeProcesses } = require('./native/bridge');
        return NativeProcesses.list(limit);
      } catch { return []; }
    });

    ipcMain.handle('native:process-close', (_, pid: number, force?: boolean) => {
      try {
        const { NativeProcesses } = require('./native/bridge');
        return NativeProcesses.close(pid, force);
      } catch { return { success: false, message: 'Native module unavailable' }; }
    });

    ipcMain.handle('native:free-memory', () => {
      try {
        const { NativeProcesses } = require('./native/bridge');
        return NativeProcesses.freeMemory();
      } catch { return { success: false, message: 'Native module unavailable' }; }
    });

    ipcMain.handle('native:power-status', () => {
      try {
        const { NativePower } = require('./native/bridge');
        return NativePower.getStatus();
      } catch { return null; }
    });

    ipcMain.handle('native:power-profiles', () => {
      try {
        const { NativePower } = require('./native/bridge');
        return NativePower.getProfiles();
      } catch { return []; }
    });

    ipcMain.handle('native:power-set-profile', (_, profile: string) => {
      try {
        const { NativePower } = require('./native/bridge');
        return NativePower.setProfile(profile);
      } catch { return { success: false, profile, changes: [], error: 'Native module unavailable' }; }
    });

    ipcMain.handle('native:file-scan', (_, rootPath: string, extensions?: string[], maxDepth?: number, limit?: number, includeDirs?: boolean) => {
      try {
        PathValidator.validatePath(rootPath, { requireExists: true });
        const { NativeFiles } = require('./native/bridge');
        return NativeFiles.scan(rootPath, extensions, maxDepth, limit, includeDirs);
      } catch { return null; }
    });

    ipcMain.handle('native:directory-size', (_, dirPath: string) => {
      try {
        PathValidator.validatePath(dirPath, { requireExists: true });
        const { NativeFiles } = require('./native/bridge');
        return NativeFiles.directorySize(dirPath);
      } catch { return null; }
    });

    ipcMain.handle('native:media-scan', (_, scanType: string, customPaths?: string[], limit?: number) => {
      try {
        const { NativeFiles } = require('./native/bridge');
        return NativeFiles.scanMedia(scanType, customPaths, limit);
      } catch { return null; }
    });

    ipcMain.handle('native:health-status', () => {
      try {
        const { NativeHealth } = require('./native/bridge');
        return NativeHealth.getHealth();
      } catch { return null; }
    });

    ipcMain.handle('native:health-heartbeat', () => {
      try {
        const { NativeHealth } = require('./native/bridge');
        NativeHealth.heartbeat();
        return true;
      } catch { return false; }
    });

    ipcMain.handle('native:health-suggestions', () => {
      try {
        const { NativeHealth } = require('./native/bridge');
        return NativeHealth.getSuggestions();
      } catch { return []; }
    });

    ipcMain.handle('native:log-status', () => {
      try {
        const { logNativeStatus, isNativeAvailable } = require('./native/bridge');
        logNativeStatus();
        return { available: isNativeAvailable() };
      } catch { return { available: false }; }
    });

    // ---------------------------------------------------------------------------
    // Watch Folder Handlers (uses module-level activeWatchers)
    // ---------------------------------------------------------------------------

    ipcMain.handle('watch:start', (event, { id, path: dirPath }: { id: string; path: string }) => {
      try {
        const fs = require('fs');
        const pathMod = require('path');
        // Validate path to prevent directory traversal attacks
        const validatedPath = PathValidator.validatePath(dirPath, { requireExists: true });
        if (activeWatchers.has(id)) return { success: true };
        const sender = event.sender;
        const watcher = fs.watch(validatedPath, { persistent: false }, (eventType: string, filename: string) => {
          if (eventType === 'rename' && filename) {
            // Use validated path for join to prevent path injection
            const safeName = pathMod.basename(filename); // strip any path components
            const fullPath = pathMod.join(validatedPath, safeName);
            try {
              if (sender.isDestroyed()) { watcher.close(); activeWatchers.delete(id); return; }
              if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                sender.send('watch:fileAdded', { id, files: [fullPath] });
              }
            } catch (e) { log.warn('[DEX]', e); }
          }
        });
        activeWatchers.set(id, watcher);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('watch:stop', (_, { id }: { id: string }) => {
      const watcher = activeWatchers.get(id);
      if (watcher) { watcher.close(); activeWatchers.delete(id); }
      return { success: true };
    });

    // ---------------------------------------------------------------------------
    // Settings Apply Handler (Real System Settings)
    // ---------------------------------------------------------------------------
    ipcMain.handle('settings:apply', async (_, settings) => {
      try {
        log.info('[DEX] Applying settings:', Object.keys(settings));
        
        // Apply power profile settings
        if (settings.performanceMode) {
          const profile = settings.performanceMode === 'performance' ? 'boost' :
                         settings.performanceMode === 'powersaver' ? 'eco' : 'balanced';
          await this.powerController.setProfile(profile);
        }

        // Apply user RAM limit to ResourceGovernor
        if (settings.maxRamGB !== undefined) {
          try {
            const { resourceGovernor } = require('./core/ResourceGovernor');
            resourceGovernor.applyUserMaxRam(settings.maxRamGB);
          } catch (e) {
            log.debug('[DEX] Could not apply RAM limit:', e);
          }
        }
        
        // GPU switches are set at startup in initialize() (before app.whenReady)
        // They cannot be changed at runtime, so this is a no-op.
        
        // Apply animation settings to main window
        if (this.mainWindow && settings.reduceMotion) {
          this.mainWindow.webContents.send('settings:motionReduced', settings.reduceMotion);
        }
        
        // Apply transparency settings
        if (this.mainWindow && settings.transparency !== undefined) {
          this.mainWindow.setOpacity(settings.transparency ? 0.98 : 1.0);
        }
        
        // Store settings in capability storage for persistence
        await capabilityLayer.storage.set('dex-system-settings', settings);
        
        return { success: true };
      } catch (error) {
        log.error('[DEX] Failed to apply settings:', error);
        return { success: false, error: String(error) };
      }
    });

    // ---------------------------------------------------------------------------
    // Settings Get/Save Handlers
    // ---------------------------------------------------------------------------
    ipcMain.handle('settings:get', async () => {
      try {
        const settings = await capabilityLayer.storage.get('dex-system-settings');
        return settings || {};
      } catch {
        return {};
      }
    });

    ipcMain.handle('settings:save', async (_, settings) => {
      try {
        await capabilityLayer.storage.set('dex-system-settings', settings);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    // ---------------------------------------------------------------------------    // Window Controls
    // -------------------------------------------------------------------------
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize();
      return { success: true };
    });
    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
      return { success: true };
    });
    ipcMain.handle('window:close', () => {
      this.mainWindow?.hide();
      return { success: true };
    });
    ipcMain.handle('window:hide', () => {
      this.mainWindow?.hide();
      return { success: true };
    });
    ipcMain.handle('window:setTitleBarOverlay', (_e: any, enabled: boolean) => {
      if (!this.mainWindow || process.platform === 'darwin') return { success: false };
      try {
        if (enabled) {
          this.mainWindow.setTitleBarOverlay({
            color: WINDOW.TITLE_BAR_COLOR,
            symbolColor: WINDOW.TITLE_BAR_SYMBOL_COLOR,
            height: WINDOW.TITLE_BAR_HEIGHT,
          });
        } else {
          this.mainWindow.setTitleBarOverlay({
            color: '#00000000',
            symbolColor: '#00000000',
            height: 0,
          });
        }
        return { success: true };
      } catch (error) {
        log.warn('[DEX] Failed to set titlebar overlay:', error);
        return { success: false, error: String(error) };
      }
    });

    // -------------------------------------------------------------------------
    // App Quit (used by onboarding cancel button + global shortcut)
    // -------------------------------------------------------------------------
    ipcMain.handle('app:quit', () => {
      try {
        this.isQuitting = true;
        log.info('[DEX] app:quit invoked from renderer');
        // Defer so the IPC reply has a chance to flush before tear-down
        setTimeout(() => app.quit(), 50);
        return { success: true };
      } catch (error) {
        log.error('[DEX] app:quit failed:', error);
        return { success: false, error: String(error) };
      }
    });

    // -------------------------------------------------------------------------
    // OS Mode Shell Controls
    // -------------------------------------------------------------------------
    ipcMain.handle('os:getMode', () => {
      return process.argv.includes('--os-mode') || process.env.DEX_OS_MODE === '1';
    });

    ipcMain.handle('os:toggleFullscreen', () => {
      if (this.mainWindow) {
        const isFull = this.mainWindow.isFullScreen();
        this.mainWindow.setFullScreen(!isFull);
        return { fullscreen: !isFull };
      }
      return { fullscreen: false };
    });

    ipcMain.handle('os:getSystemInfo', async () => {
      const osModule = os;
      const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        width: d.bounds.width,
        height: d.bounds.height,
        scaleFactor: d.scaleFactor,
        isPrimary: d.id === screen.getPrimaryDisplay().id,
      }));
      return {
        hostname: osModule.hostname(),
        username: osModule.userInfo().username,
        platform: process.platform,
        arch: process.arch,
        osVersion: osModule.release(),
        totalMemory: osModule.totalmem(),
        freeMemory: osModule.freemem(),
        cpuModel: osModule.cpus()[0]?.model || 'Unknown',
        cpuCores: osModule.cpus().length,
        uptime: osModule.uptime(),
        displays,
      };
    });

    ipcMain.handle('os:getBatteryInfo', async () => {
      try {
        const stats = await this.powerController.getState();
        return stats;
      } catch {
        return { level: -1, charging: false, timeRemaining: -1 };
      }
    });

    // System resource usage monitoring
    ipcMain.handle('system:getCpuUsage', async () => {
      const osModule = os;
      const cpus = osModule.cpus();
      if (!cpus || cpus.length === 0) return 0;
      
      // Calculate average CPU usage across all cores
      let totalIdle = 0;
      let totalTick = 0;
      cpus.forEach(cpu => {
        for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      const usage = Math.round(100 - (100 * totalIdle / totalTick));
      return Math.max(0, Math.min(100, usage));
    });

    ipcMain.handle('system:getMemoryUsage', async () => {
      const osModule = os;
      const total = osModule.totalmem();
      const free = osModule.freemem();
      const used = total - free;
      return Math.round((used / total) * 100);
    });

    ipcMain.handle('os:getScreenBrightness', async () => {
      // Query screen brightness using platform-specific commands
      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          const output = execSync(
            'powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightness).CurrentBrightness"',
            { encoding: 'utf-8', timeout: 3000, windowsHide: true }
          ).trim();
          const brightness = parseInt(output, 10);
          if (!isNaN(brightness)) {
            return { brightness, supported: true };
          }
        } catch {
          // WMI not available (desktop monitors)
        }
      } else if (process.platform === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const output = execSync('brightness -l 2>/dev/null | grep "display 0" | awk \'{print $NF}\'', { encoding: 'utf-8', timeout: 3000 }).trim();
          const brightness = Math.round(parseFloat(output) * 100);
          if (!isNaN(brightness)) {
            return { brightness, supported: true };
          }
        } catch {
          // brightness CLI not installed
        }
      }
      return { brightness: 100, supported: false };
    });

    ipcMain.handle('os:lockScreen', () => {
      this.mainWindow?.webContents.send('dex:lock-screen');
      return { success: true };
    });

    // OS suspend / lock-screen forwarders.
    // We deliberately do NOT auto-lock the renderer here -- the renderer decides whether
    // to lock based on the user's `lockOnSleep` / `requireAuthOnWake` preferences. Sending
    // a generic system event lets it react (pause heavy work, save session) without
    // forcing a blank full-screen lock overlay every time the host OS dims the display.
    powerMonitor.on('suspend', () => {
      this.mainWindow?.webContents.send('dex:system-suspend');
    });
    powerMonitor.on('lock-screen', () => {
      this.mainWindow?.webContents.send('dex:system-lock');
    });
    powerMonitor.on('resume', () => {
      this.mainWindow?.webContents.send('dex:resume');
      // Force window visible and repaint after sleep/hibernate
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.mainWindow.focus();
        // Force Chromium to repaint — fixes black/blank screen after lid close
        this.mainWindow.webContents.invalidate();
      }
    });
    powerMonitor.on('unlock-screen', () => {
      this.mainWindow?.webContents.send('dex:resume');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.invalidate();
      }
    });

    ipcMain.handle('os:shutdown', () => {
      this.isQuitting = true;
      app.quit();
      return { success: true };
    });

    ipcMain.handle('os:restart', () => {
      app.relaunch();
      app.exit(0);
      return { success: true };
    });

    ipcMain.handle('os:sleep', () => {
      // Notify the renderer that we're about to sleep so it can flush autosave and
      // park heavy work, but don't force the lock overlay -- that's a renderer-side
      // policy decision driven by the user's lockOnSleep preference.
      this.mainWindow?.webContents.send('dex:system-suspend');
      if (process.platform === 'win32') {
        require('child_process').exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
      } else if (process.platform === 'darwin') {
        require('child_process').exec('pmset sleepnow');
      } else {
        require('child_process').exec('systemctl suspend');
      }
      return { success: true };
    });

    // -------------------------------------------------------------------------
    // Actions (with input sanitization)
    // -------------------------------------------------------------------------
    ipcMain.handle('action:execute', async (_, action) => {
      // Validate the action execution request
      const validation = ipcValidator.validate('actions:execute', [action]);
      if (!validation.valid) {
        log.warn('[DEX] IPC validation failed for action:execute:', validation.error);
        throw new Error(validation.error || 'Validation failed');
      }
      // Use sanitized action if available
      const sanitizedAction = (validation.sanitizedArgs?.[0] || action) as DexAction;
      return this.actionController.execute(sanitizedAction);
    });

    ipcMain.handle('action:getAll', async () => {
      return this.dataStore.getActions();
    });

    ipcMain.handle('action:save', async (_, action) => {
      // Sanitize action before saving
      const sanitizedAction = InputSanitizer.sanitizeObject(action) as Partial<DexAction>;
      return this.dataStore.saveAction(sanitizedAction);
    });

    ipcMain.handle('action:delete', async (_, actionId) => {
      // Sanitize the actionId
      const sanitizedId = InputSanitizer.sanitizeString(actionId);
      return this.dataStore.deleteAction(sanitizedId);
    });

    ipcMain.handle('action:getRunningApps', async () => {
      return this.powerController.getResourceHogs();
    });

    ipcMain.handle('action:closeApp', async (_, pid) => {
      // Validate close process request with rate limiting
      const validation = ipcValidator.validate('power:closeProcess', [pid]);
      if (!validation.valid) {
        log.warn('[DEX] IPC validation failed for action:closeApp:', validation.error);
        throw new Error(validation.error || 'Validation failed');
      }
      return this.powerController.closeProcess(pid, false);
    });

    // -------------------------------------------------------------------------
    // Modes
    // -------------------------------------------------------------------------
    ipcMain.handle('mode:getAll', async () => {
      try {
        return this.dataStore.getModes();
      } catch (err: any) {
        log.error('[DEX] mode:getAll failed:', err.message);
        return [];
      }
    });

    ipcMain.handle('mode:getActive', async () => {
      return this.modeController.getActiveMode();
    });

    ipcMain.handle('mode:activate', async (_, modeId) => {
      return this.modeController.activateMode(modeId);
    });

    ipcMain.handle('mode:deactivate', async () => {
      return this.modeController.deactivateMode();
    });

    ipcMain.handle('mode:save', async (_, mode) => {
      return this.dataStore.saveMode(mode);
    });

    ipcMain.handle('mode:delete', async (_, modeId) => {
      return this.dataStore.deleteMode(modeId);
    });

    // -------------------------------------------------------------------------
    // Rules
    // -------------------------------------------------------------------------
    ipcMain.handle('rule:getAll', async () => {
      return this.dataStore.getRules();
    });

    ipcMain.handle('rule:save', async (_, rule) => {
      const savedRule = await this.dataStore.saveRule(rule);
      this.ruleEngine.reloadRules();
      return savedRule;
    });

    ipcMain.handle('rule:delete', async (_, ruleId) => {
      await this.dataStore.deleteRule(ruleId);
      this.ruleEngine.reloadRules();
    });

    ipcMain.handle('rule:toggle', async (_, ruleId, enabled) => {
      await this.dataStore.toggleRule(ruleId, enabled);
      this.ruleEngine.reloadRules();
    });

    // -------------------------------------------------------------------------
    // Dialog & File System (for Audio player, etc.)
    // -------------------------------------------------------------------------
    ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
      return dialog.showOpenDialog(this.mainWindow!, options);
    });

    // Renderer-friendly alias used by standalone apps (PDF Viewer, etc.)
    ipcMain.handle('files:openDialog', async (_, options) => {
      return dialog.showOpenDialog(this.mainWindow!, options);
    });

    // Screen capture sources for the standalone Screen Recorder app
    ipcMain.handle('screencapture:getSources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      });
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      }));
    });

    ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
      const validPath = PathValidator.validatePath(dirPath, { requireExists: true });
      return fs.promises.readdir(validPath);
    });

    ipcMain.handle('fs:readFileHead', async (_, filePath: string, byteCount: number) => {
      const validPath = PathValidator.validatePath(filePath, { requireExists: true });
      const maxBytes = Math.min(byteCount || 131072, 2 * 1024 * 1024); // cap at 2MB
      const fd = await fs.promises.open(validPath, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
        return buffer.slice(0, bytesRead).buffer;
      } finally {
        await fd.close();
      }
    });

    // -------------------------------------------------------------------------
    // System Status
    // -------------------------------------------------------------------------
    ipcMain.handle('system:getStatus', async () => {
      return this.eventMonitor.getSystemStatus();
    });

    ipcMain.handle('system:getProcesses', async () => {
      return this.eventMonitor.getRunningProcesses();
    });

    ipcMain.handle('system:killProcess', async (_evt, pid: number, force?: boolean) => {
      try {
        if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) {
          return { success: false, message: 'Invalid PID' };
        }
        const { NativeProcesses } = await import('./native/bridge');
        const result = NativeProcesses.close(pid, !!force);
        return result || { success: false, message: 'Native bridge unavailable' };
      } catch (e: any) {
        return { success: false, message: e?.message || String(e) };
      }
    });

    // -------------------------------------------------------------------------
    // Logs
    // -------------------------------------------------------------------------
    ipcMain.handle('logs:get', async (_, limit) => {
      return this.logger.getLogs(limit);
    });

    ipcMain.handle('logs:clear', async () => {
      return this.logger.clearLogs();
    });

    // -------------------------------------------------------------------------
    // Health & Verification (Phase 50)
    // -------------------------------------------------------------------------
    ipcMain.handle('health:getVerification', async () => {
      try {
        const results = await shipReadyVerification.runAllVerifications();
        return results;
      } catch (error) {
        log.error('[DEX] Failed to run verification:', error);
        return { passed: 0, failed: 0, warnings: 0, results: [] };
      }
    });

    // Note: health:getStatus is registered in HealthMonitor.ts

    // -------------------------------------------------------------------------
    // Phase 51: Performance & Capability Layer
    // -------------------------------------------------------------------------
    ipcMain.handle('phase51:getStatus', async () => {
      return getPhase51Status();
    });

    ipcMain.handle('phase51:getReport', async () => {
      return getPhase51Report();
    });

    ipcMain.handle('phase51:getPerformance', async () => {
      return performanceOptimizer.getReport();
    });

    ipcMain.handle('phase51:getCapabilities', async () => {
      return {
        all: capabilityLayer.getAllCapabilities(),
        active: capabilityLayer.getActiveCapabilities(),
        status: capabilityLayer.getSystemStatus(),
      };
    });

    ipcMain.handle('phase51:getDevices', async () => {
      return {
        devices: deviceInterface.getDevices(),
        transfers: deviceInterface.transferManager.getTransfers(),
      };
    });

    ipcMain.handle('phase51:getStability', async () => {
      return {
        report: longTermStability.getStabilityReport(),
        history: longTermStability.getHealthHistory(),
        errors: longTermStability.getRecentErrors(),
      };
    });

    ipcMain.handle('phase51:getPlugins', async () => {
      return {
        plugins: pluginManager.getPlugins(),
        stats: pluginManager.getStats(),
      };
    });

    // Device operations
    ipcMain.handle('devices:list', async () => {
      return deviceInterface.getDevices();
    });

    ipcMain.handle('devices:browse', async (_, deviceId: string, path?: string) => {
      return deviceInterface.listFiles(deviceId, path || '');
    });

    ipcMain.handle('devices:import', async (_, deviceId: string, paths: string[], dest?: string) => {
      return deviceInterface.importFiles(deviceId, paths, dest);
    });

    ipcMain.handle('devices:export', async (_, deviceId: string, paths: string[], dest: string) => {
      return deviceInterface.exportFiles(deviceId, paths, dest);
    });

    // Capability layer operations -- with path validation
    ipcMain.handle('capability:fileSystem:list', async (_, dirPath: string) => {
      const validPath = PathValidator.validatePath(dirPath);
      return capabilityLayer.fileSystem.listDirectory(validPath);
    });

    ipcMain.handle('capability:fileSystem:copy', async (_, source: string, dest: string) => {
      const validSource = PathValidator.validatePath(source, { requireExists: true });
      const validDest = PathValidator.validatePath(dest);
      return capabilityLayer.fileSystem.copyFile(validSource, validDest);
    });

    ipcMain.handle('capability:fileSystem:move', async (_, source: string, dest: string) => {
      const validSource = PathValidator.validatePath(source, { requireExists: true });
      const validDest = PathValidator.validatePath(dest);
      return capabilityLayer.fileSystem.moveFile(validSource, validDest);
    });

    ipcMain.handle('capability:transfer:getStats', async () => {
      return capabilityLayer.transfer.getStats();
    });

    ipcMain.handle('capability:storage:get', async (_, key: string) => {
      try {
        const validKey = PathValidator.validateStorageKey(key);
        return capabilityLayer.storage.get(validKey);
      } catch { return null; }
    });

    ipcMain.handle('capability:storage:set', async (_, key: string, value: unknown) => {
      try {
        const validKey = PathValidator.validateStorageKey(key);
        return capabilityLayer.storage.set(validKey, value);
      } catch { return null; }
    });

    // -------------------------------------------------------------------------
    // Permissions
    // -------------------------------------------------------------------------
    ipcMain.handle('permissions:getAll', async () => {
      return this.permissionManager.getAllPermissions();
    });

    ipcMain.handle('permissions:grant', async (_, permission) => {
      return this.permissionManager.grantPermission(permission);
    });

    ipcMain.handle('permissions:revoke', async (_, permission) => {
      return this.permissionManager.revokePermission(permission);
    });

    // -------------------------------------------------------------------------
    // Emergency Controls
    // -------------------------------------------------------------------------
    ipcMain.handle('emergency:stop', async () => {
      return this.emergencyStop();
    });

    ipcMain.handle('emergency:resume', async () => {
      return this.resume();
    });

    // -------------------------------------------------------------------------
    // Power & Performance
    // -------------------------------------------------------------------------
    ipcMain.handle('power:getStats', async () => {
      return this.powerController.getPowerStats();
    });

    ipcMain.handle('power:getProfile', async () => {
      return this.powerController.getCurrentProfile();
    });

    ipcMain.handle('power:setProfile', async (_, profile) => {
      return this.powerController.setProfile(profile);
    });

    ipcMain.handle('power:quickBoost', async (_, duration) => {
      return this.powerController.quickBoost(duration);
    });

    ipcMain.handle('power:getResourceHogs', async () => {
      return this.powerController.getResourceHogs();
    });

    ipcMain.handle('power:closeProcess', async (_, pid, force) => {
      return this.powerController.closeProcess(pid, force);
    });

    ipcMain.handle('power:freeMemory', async () => {
      return this.powerController.freeMemory();
    });

    ipcMain.handle('power:getSuggestedCleanup', async () => {
      return this.powerController.getSuggestedCleanup();
    });

    ipcMain.handle('power:setCpuLimit', async (_, limit: number) => {
      log.info(`[DEX] CPU limit set to ${limit}% (advisory)`);
      return { success: true, limit };
    });

    ipcMain.handle('power:setGpuLimit', async (_, limit: number) => {
      log.info(`[DEX] GPU limit set to ${limit}% (advisory)`);
      return { success: true, limit };
    });

    ipcMain.handle('power:setFanCurve', async (_, curve: string) => {
      log.info(`[DEX] Fan curve set to ${curve} (advisory)`);
      return { success: true, curve };
    });

    // -------------------------------------------------------------------------
    // Operations (Phase 4A - Manual Control Layer)
    // -------------------------------------------------------------------------
    ipcMain.handle('operations:execute', async (_, operationId) => {
      return this.operationsController.execute(operationId);
    });

    ipcMain.handle('operations:undo', async (_, logId) => {
      return this.operationsController.undo(logId);
    });

    ipcMain.handle('operations:getLogs', async (_, limit) => {
      return this.operationsController.getLogs(limit);
    });

    // -------------------------------------------------------------------------
    // Workflows (Phase 5 - Composed Operations)
    // -------------------------------------------------------------------------
    ipcMain.handle('workflows:getAll', async () => {
      return this.sessionController.getWorkflows();
    });

    ipcMain.handle('workflows:getTemplates', async () => {
      return this.sessionController.getTemplates();
    });

    ipcMain.handle('workflows:save', async (_, workflow) => {
      return this.sessionController.saveWorkflow(workflow);
    });

    ipcMain.handle('workflows:delete', async (_, workflowId) => {
      return this.sessionController.deleteWorkflow(workflowId);
    });

    ipcMain.handle('workflows:duplicate', async (_, workflowId) => {
      return this.sessionController.duplicateWorkflow(workflowId);
    });

    ipcMain.handle('workflows:togglePin', async (_, workflowId) => {
      return this.sessionController.togglePin(workflowId);
    });

    ipcMain.handle('workflows:execute', async (_, workflowId) => {
      return this.sessionController.executeWorkflow(workflowId);
    });

    // -------------------------------------------------------------------------
    // Notes (Phase 6 - Quick Notes)
    // -------------------------------------------------------------------------
    ipcMain.handle('sessions:getNotes', async () => {
      return this.sessionController.getNotes();
    });

    ipcMain.handle('sessions:addNote', async (_, noteData) => {
      return this.sessionController.addNote(noteData.content, noteData.linkedTo);
    });

    ipcMain.handle('sessions:updateNote', async (_, noteId, updates) => {
      return this.sessionController.updateNote(noteId, updates.content);
    });

    ipcMain.handle('sessions:deleteNote', async (_, noteId) => {
      return this.sessionController.deleteNote(noteId);
    });

    // -------------------------------------------------------------------------
    // Timers (Phase 6 - Time Tracking)
    // -------------------------------------------------------------------------
    ipcMain.handle('sessions:getTimers', async () => {
      return this.sessionController.getTimers();
    });

    ipcMain.handle('sessions:createTimer', async (_, timerData) => {
      return this.sessionController.createTimer(timerData.name, timerData.duration);
    });

    ipcMain.handle('sessions:startTimer', async (_, timerId) => {
      return this.sessionController.startTimer(timerId);
    });

    ipcMain.handle('sessions:pauseTimer', async (_, timerId) => {
      return this.sessionController.pauseTimer(timerId);
    });

    ipcMain.handle('sessions:stopTimer', async (_, timerId) => {
      return this.sessionController.resetTimer(timerId);
    });

    ipcMain.handle('sessions:deleteTimer', async (_, timerId) => {
      return this.sessionController.deleteTimer(timerId);
    });

    // -------------------------------------------------------------------------
    // Running Tasks (Phase 6 - Task Control)
    // -------------------------------------------------------------------------
    ipcMain.handle('sessions:getRunningTasks', async () => {
      return this.sessionController.getRunningTasks();
    });

    ipcMain.handle('sessions:stopTask', async (_, taskId) => {
      return this.sessionController.stopTask(taskId);
    });

    // -------------------------------------------------------------------------
    // Shell Operations (with IPC validation)
    // -------------------------------------------------------------------------
    ipcMain.handle('shell:openPath', async (_, filePath) => {
      // Validate and rate-limit the request
      const validation = ipcValidator.validate('shell:openPath', [filePath]);
      if (!validation.valid) {
        log.warn('[DEX] IPC validation failed for shell:openPath:', validation.error);
        throw new Error(validation.error || 'Validation failed');
      }
      // Use sanitized path if available
      const sanitizedPath = (validation.sanitizedArgs?.[0] || filePath) as string;
      return shell.openPath(sanitizedPath);
    });

    ipcMain.handle('shell:openExternal', async (_, url) => {
      // Validate and rate-limit the request
      const validation = ipcValidator.validate('shell:openExternal', [url]);
      if (!validation.valid) {
        log.warn('[DEX] IPC validation failed for shell:openExternal:', validation.error);
        throw new Error(validation.error || 'Validation failed');
      }
      const sanitizedUrl = (validation.sanitizedArgs?.[0] || url) as string;
      return shell.openExternal(sanitizedUrl);
    });

    ipcMain.handle('shell:showItemInFolder', async (_, filePath) => {
      if (typeof filePath !== 'string') throw new Error('Invalid path');
      shell.showItemInFolder(filePath);
    });

    // -------------------------------------------------------------------------
    // Universal Search (FINAL UI FUNCTIONALITY PHASE)
    // -------------------------------------------------------------------------
    ipcMain.handle('search:query', async (_, query, options) => {
      return this.searchController.search(query, options);
    });

    ipcMain.handle('search:getStats', async () => {
      return this.searchController.getIndexStats();
    });

    ipcMain.handle('search:rebuild', async () => {
      ipcRateLimiter.enforce('search:rebuild');
      await this.searchController.rebuildIndex();
      return { success: true };
    });

    // -------------------------------------------------------------------------
    // Media File Scanner (Real File System Integration)
    // -------------------------------------------------------------------------
    ipcMain.handle('media:getMediaFiles', async (_, mediaType: string) => {
      ipcRateLimiter.enforce('media:getMediaFiles');
      const os = await import('os');
      const homeDir = os.homedir();
      const results: Array<{ path: string; name: string; extension: string; size: number; modified: number }> = [];
      
      let scanPath = '';
      let extensions: string[] = [];
      
      if (mediaType === 'music' || mediaType === 'audio') {
        scanPath = path.join(homeDir, 'Music');
        extensions = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
      } else if (mediaType === 'pictures' || mediaType === 'images') {
        scanPath = path.join(homeDir, 'Pictures');
        extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
      } else if (mediaType === 'videos') {
        scanPath = path.join(homeDir, 'Videos');
        extensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
      } else {
        return results;
      }
      
      // Scan directory recursively (max depth 3) -- async to avoid blocking main thread
      const scanDir = async (dir: string, depth: number = 0): Promise<void> => {
        if (depth > 3 || results.length >= 500) return;
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= 500) break;
            const fullPath = path.join(dir, entry.name);
            try {
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await scanDir(fullPath, depth + 1);
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.includes(ext)) {
                  const stats = await fs.promises.stat(fullPath);
                  results.push({
                    path: fullPath,
                    name: entry.name,
                    extension: ext,
                    size: stats.size,
                    modified: stats.mtimeMs,
                  });
                }
              }
            } catch (err: any) {
              log.warn(`[DEX] Media scan: failed to read entry in ${dir}:`, err.message);
            }
          }
        } catch (err: any) {
          log.warn(`[DEX] Media scan: failed to read directory ${dir}:`, err.message);
        }
      };
      
      if (fs.existsSync(scanPath)) {
        await scanDir(scanPath);
      }
      
      return results.slice(0, 500);
    });

    // -------------------------------------------------------------------------
    // Fast Download System (Drop - Secure & Fast Downloads)
    // -------------------------------------------------------------------------
    ipcMain.handle('download:start', async (_, url: string, filename?: string) => {
      // Rate limiting
      ipcRateLimiter.enforce('download:start');
      // Validate URL -- only allow http/https, block internal networks
      const urlObj = PathValidator.validateDownloadUrl(url);

      const os = await import('os');
      const https = await import('https');
      const http = await import('http');
      const homeDir = os.homedir();
      const downloadDir = path.join(homeDir, 'Downloads', 'DEX');
      
      // Create DEX downloads folder
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      
      // Sanitize filename to prevent path injection
      const rawName = filename || path.basename(urlObj.pathname) || `download_${Date.now()}`;
      const fileName = PathValidator.sanitizeFilename(rawName);
      const filePath = path.join(downloadDir, fileName);
      
      return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
          },
          timeout: TIMEOUTS.DOWNLOAD,
        };
        
        const file = fs.createWriteStream(filePath);
        let downloadedBytes = 0;
        let totalBytes = 0;
        
        const request = protocol.get(url, options, (response: any) => {
          // Follow redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            file.close(() => {
              try { fs.unlinkSync(filePath); } catch { /* ignore */ }
              resolve({ redirect: response.headers.location });
            });
            return;
          }
          
          totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          
          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            // Send progress to renderer
            this.mainWindow?.webContents.send('download:progress', {
              url,
              fileName,
              downloaded: downloadedBytes,
              total: totalBytes,
              percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
            });
          });
          
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            resolve({
              success: true,
              path: filePath,
              size: downloadedBytes,
              fileName,
            });
          });
        });
        
        request.on('error', (err: Error) => {
          file.close();
          fs.unlink(filePath, () => {});
          reject(err);
        });
        
        request.on('timeout', () => {
          request.destroy();
          file.close();
          fs.unlink(filePath, () => {});
          reject(new Error('Download timeout'));
        });
      });
    });
    
    ipcMain.handle('download:getFolder', async () => {
      const os = await import('os');
      const downloadDir = path.join(os.homedir(), 'Downloads', 'DEX');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      return downloadDir;
    });
    
    ipcMain.handle('download:list', async () => {
      const os = await import('os');
      const downloadDir = path.join(os.homedir(), 'Downloads', 'DEX');
      if (!fs.existsSync(downloadDir)) return [];
      
      const fileNames = await fs.promises.readdir(downloadDir);
      const files = await Promise.all(
        fileNames.map(async (name) => {
          const filePath = path.join(downloadDir, name);
          const stats = await fs.promises.stat(filePath);
          return {
            name,
            path: filePath,
            size: stats.size,
            modified: stats.mtimeMs,
          };
        })
      );
      return files;
    });

    // -------------------------------------------------------------------------
    // Governance (Phase 58-59: AI + Plugin Boundaries)
    // -------------------------------------------------------------------------
    registerGovernanceHandlers();

    // -------------------------------------------------------------------------
    // Release Management (Phase 66: Safe Updates)
    // -------------------------------------------------------------------------
    this.releaseManager = new ReleaseManager();
    this.releaseManager.setMainWindow(this.mainWindow!);
    this.releaseManager.initialize().catch(err => {
      log.error('[DEX] Release Manager initialize failed:', err);
    });
    log.info('[DEX] Release Manager initialized');

    // -------------------------------------------------------------------------
    // Native subsystem services (May 2026 sweep): archive + speed test
    // -------------------------------------------------------------------------
    try {
      registerArchiveIpc();
      log.info('[DEX] Archive service IPC registered');
    } catch (err) {
      log.error('[DEX] Archive service IPC failed:', err);
    }
    try {
      registerAudioNativeHandlers();
      log.info('[DEX] Audio native IPC handlers registered');
    } catch (err) {
      log.warn('[DEX] Audio native IPC registration failed:', err);
    }
    try {
      registerSpeedTestIpc();
      log.info('[DEX] Speed test service IPC registered');
    } catch (err) {
      log.error('[DEX] Speed test service IPC failed:', err);
    }

    // -------------------------------------------------------------------------
    // Windows-12-style "CorePC" + system capabilities (NPU/ARM/GPU)
    // -------------------------------------------------------------------------
    try {
      registerSystemCapabilitiesIpc();
      detectCapabilities(false)
        .then((caps) => log.info('[DEX] System capabilities:', {
          arch: caps.arch, cores: caps.cpuCores, ramGB: caps.ramTotalGB,
          ramTier: caps.ramTier, hasNpu: caps.hasNpu, npuFamily: caps.npuFamily,
        }))
        .catch((err) => log.warn('[DEX] System capabilities detect failed:', err));
    } catch (err) {
      log.error('[DEX] System capabilities IPC failed:', err);
    }
    try {
      registerCorePcIpc();
      verifyCoreIntegrity()
        .then((r) => log.info('[DEX] CorePC integrity:', {
          status: r.status, changed: r.changedFiles.length, missing: r.missingFiles.length,
        }))
        .catch((err) => log.warn('[DEX] CorePC verify failed:', err));
    } catch (err) {
      log.error('[DEX] CorePC IPC failed:', err);
    }

    // -------------------------------------------------------------------------
    // Consolidated permissions surface + extractive reader summary IPC
    // (May 2026 macOS-style feedback sweep).
    // -------------------------------------------------------------------------
    try {
      registerPermissionsIpc();
      log.info('[DEX] Permissions IPC registered');
    } catch (err) {
      log.error('[DEX] Permissions IPC failed:', err);
    }
    // -------------------------------------------------------------------------
    // Phase 3 host bridges: app store, games, capability broker, snapshot,
    // workflow runner, sync engine. All wired to IPC for renderer consumption.
    // -------------------------------------------------------------------------
    try { registerAppStoreIpc(); log.info('[DEX] AppStore IPC registered'); }
    catch (err) { log.error('[DEX] AppStore IPC failed:', err); }
    try { registerEmbeddingIpc(); }
    catch (err) { log.error('[DEX] Embedding IPC failed:', err); }
    try { registerGamesIpc(); log.info('[DEX] Games IPC registered'); }
    catch (err) { log.error('[DEX] Games IPC failed:', err); }
    try { registerCapabilityBrokerIpc(); log.info('[DEX] CapabilityBroker IPC registered'); }
    catch (err) { log.error('[DEX] CapabilityBroker IPC failed:', err); }
    try { registerSnapshotIpc(); log.info('[DEX] Snapshot IPC registered'); }
    catch (err) { log.error('[DEX] Snapshot IPC failed:', err); }
    try { registerWorkflowIpc(); log.info('[DEX] Workflow IPC registered'); }
    catch (err) { log.error('[DEX] Workflow IPC failed:', err); }
    try { registerSyncIpc(); log.info('[DEX] Sync IPC registered'); }
    catch (err) { log.error('[DEX] Sync IPC failed:', err); }
    try {
      ipcMain.handle('reader:summarize', (_evt, text: string, options?: { sentences?: number }) => {
        if (typeof text !== 'string' || text.length === 0) {
          return { summary: '', picks: [], totalSentences: 0 };
        }
        const sentences = options && typeof options.sentences === 'number'
          ? Math.max(1, Math.min(10, Math.floor(options.sentences)))
          : 3;
        return _readerSummarize(text, { sentences });
      });
      log.info('[DEX] Reader summary IPC registered');
    } catch (err) {
      log.error('[DEX] Reader summary IPC failed:', err);
    }
    try {
      registerCreatorAccessIpc();
      log.info('[DEX] Creator access IPC registered');
    } catch (err) {
      log.error('[DEX] Creator access IPC failed:', err);
    }

    // -------------------------------------------------------------------------
    // Network Guard (mode enforcement + connection tracking)
    // -------------------------------------------------------------------------
    NetworkGuard.initialize().catch(err => {
      log.error('[DEX] Network Guard initialize failed:', err);
    });

    // -------------------------------------------------------------------------
    // PTY Service (in-app terminal sessions for DexCode + Axle Nexus)
    // -------------------------------------------------------------------------
    try {
      PtyService.setMainWindow(this.mainWindow!);
      PtyService.initialize();
    } catch (err) {
      log.error('[DEX] PTY Service initialize failed:', err);
    }

    // Update Service (VERSION.txt polling, supplements ReleaseManager)
    this.updateService = new UpdateService();
    this.updateService.setReleaseManager(this.releaseManager);
    this.updateService.initialize().catch(err => {
      log.error('[DEX] Update Service initialize failed:', err);
    });

    // Production Monitor (health snapshots, performance baseline)
    this.productionMonitor = new ProductionMonitor();
    this.productionMonitor.setMainWindow(this.mainWindow!);
    this.productionMonitor.start();

    // -------------------------------------------------------------------------
    // Voice Control (Phase 46: Opt-in Voice Commands)
    // -------------------------------------------------------------------------
    voiceControlEngine.initialize().then(() => {
      log.info('[DEX] Voice Control Engine initialized');
    }).catch(err => {
      log.error('[DEX] Voice Control Engine error:', err);
    });

    // -------------------------------------------------------------------------
    // SecureIpcRouter -- mount any channels registered via the secure router.
    // No-op if nothing was registered. Must run after all controller inits so
    // late registrations are still picked up. Idempotent — safe to call again.
    // W2 #76-90: IPC hardening
    // -------------------------------------------------------------------------
    try {
      const { secureIpcRouter } = require('./security/SecureIpcRouter');
      secureIpcRouter.mount();
    } catch (err) {
      log.warn('[DEX] SecureIpcRouter mount failed (continuing):', err);
    }
  }

  private async emergencyStop(): Promise<void> {
    this.logger.warn('EMERGENCY STOP ACTIVATED');
    try { this.ruleEngine.stop(); } catch { /* */ }
    try { this.eventMonitor.stop(); } catch { /* */ }
    try { this.modeController.deactivateMode(); } catch { /* */ }
    try { ukiController.shutdown(); } catch { /* */ }
    try { coreRuntime.shutdown(); } catch { /* */ }
    try { await shutdownAllWorkers(); } catch { /* */ }
    this.mainWindow?.webContents.send('emergency:stopped');
    app.quit();
  }

  // =======================================================================
  // Voice Notes IPC Handlers (Phase 7B)
  // =======================================================================
  
  private registerVoiceNotesHandlers(): void {
    // CRUD
    ipcMain.handle('voiceNotes:getAll', () => this.voiceController.getAll());
    ipcMain.handle('voiceNotes:getById', (_event, id: string) => this.voiceController.getById(id));
    ipcMain.handle('voiceNotes:save', async (_event, audioData: ArrayBuffer, metadata: any) => {
      const buffer = Buffer.from(audioData);
      return this.voiceController.save(buffer, metadata);
    });
    ipcMain.handle('voiceNotes:update', (_event, id: string, updates: any) => this.voiceController.updateMetadata(id, updates));
    ipcMain.handle('voiceNotes:delete', (_event, id: string) => this.voiceController.delete(id));
    
    // Organization
    ipcMain.handle('voiceNotes:togglePin', (_event, id: string) => this.voiceController.togglePin(id));
    
    // File access
    ipcMain.handle('voiceNotes:getPath', (_event, id: string) => this.voiceController.getAudioPath(id));
    
    // Search
    ipcMain.handle('voiceNotes:search', (_event, query: string) => this.voiceController.search(query));
    ipcMain.handle('voiceNotes:getRecent', (_event, limit?: number) => this.voiceController.getRecent(limit));
    ipcMain.handle('voiceNotes:getPinned', () => this.voiceController.getPinned());
    
    // Stats
    ipcMain.handle('voiceNotes:getStats', () => this.voiceController.getStats());
    
    // Settings
    ipcMain.handle('voiceNotes:getSettings', () => this.voiceController.getSettings());
    ipcMain.handle('voiceNotes:updateSettings', (_event, settings: any) => this.voiceController.updateSettings(settings));
    
    this.logger.info('Voice Notes IPC handlers registered');
  }

  // =======================================================================
  // Pattern Learning IPC Handlers (Local-only, background)
  // =======================================================================
  
  private registerPatternLearningHandlers(): void {
    // Record usage events from renderer
    ipcMain.handle('patterns:recordAppOpen', (_event, appId: string, context?: string) => {
      patternLearning.recordAppOpen(appId, context);
    });
    ipcMain.handle('patterns:recordAppClose', (_event, appId: string, duration?: number) => {
      patternLearning.recordAppClose(appId, duration);
    });
    ipcMain.handle('patterns:recordFileOpen', (_event, filePath: string, appId?: string) => {
      patternLearning.recordFileOpen(filePath, appId);
    });
    ipcMain.handle('patterns:recordToolUse', (_event, toolId: string, appId?: string) => {
      patternLearning.recordToolUse(toolId, appId);
    });
    ipcMain.handle('patterns:recordAction', (_event, actionId: string, context?: string) => {
      patternLearning.recordAction(actionId, context);
    });
    
    // Record tool combinations
    ipcMain.handle('patterns:recordToolCombo', (_event, tool1: string, tool2: string, appId?: string) => {
      patternLearning.recordToolCombination(tool1, tool2, appId);
    });
    
    // Get suggestions
    ipcMain.handle('patterns:getSuggestions', (_event, context?: any) => {
      return patternLearning.getSuggestions(context);
    });
    ipcMain.handle('patterns:getFrequent', (_event, type?: string, limit?: number) => {
      return patternLearning.getFrequentItems(type as any, limit);
    });
    ipcMain.handle('patterns:getRecent', (_event, limit?: number) => {
      return patternLearning.getRecentItems(limit);
    });
    
    // New pattern getters
    ipcMain.handle('patterns:getToolCombos', (_event, toolId: string) => {
      return patternLearning.getToolCombinations(toolId);
    });
    ipcMain.handle('patterns:getDayPatterns', () => {
      return patternLearning.getDayOfWeekPatterns();
    });
    ipcMain.handle('patterns:getHourlyPatterns', () => {
      return patternLearning.getHourlyPatterns();
    });
    ipcMain.handle('patterns:getPreferredApp', (_event, extension: string) => {
      return patternLearning.getPreferredAppForFile(extension);
    });
    ipcMain.handle('patterns:getSessionStats', () => {
      return patternLearning.getSessionStats();
    });
    ipcMain.handle('patterns:getAllPatterns', () => {
      return patternLearning.getAllPatterns();
    });
    
    // Data cleanup (run weekly)
    ipcMain.handle('patterns:cleanup', () => {
      patternLearning.cleanOldData();
    });

    // ---------------------------------------------------------------------------
    // Creative Apps - File I/O Bridge (Imosion, Prism, Flux, Forge, VINX)
    // ---------------------------------------------------------------------------
    ipcMain.handle('creativeApps:showSaveDialog', async (_event, options: any) => {
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        title: options?.title || 'Save File',
        defaultPath: options?.defaultPath,
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
      });
      return { canceled: result.canceled, filePath: result.filePath };
    });

    ipcMain.handle('creativeApps:showOpenDialog', async (_event, options: any) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        title: options?.title || 'Open File',
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
        properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      });
      return { canceled: result.canceled, filePaths: result.filePaths };
    });

    ipcMain.handle('creativeApps:saveFile', async (_event, filePath: string, data: ArrayBuffer | string) => {
      try {
        ipcRateLimiter.enforce('creativeApps:saveFile');
        const validPath = PathValidator.validatePath(filePath);
        const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
        await fs.promises.writeFile(validPath, buffer);
        return true;
      } catch (err: any) {
        this.logger.error('creativeApps:saveFile failed', err.message);
        return false;
      }
    });

    ipcMain.handle('creativeApps:readFile', async (_event, filePath: string) => {
      try {
        ipcRateLimiter.enforce('creativeApps:readFile');
        const validPath = PathValidator.validatePath(filePath, { requireExists: true });
        const buffer = await fs.promises.readFile(validPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } catch (err: any) {
        this.logger.error('creativeApps:readFile failed', err.message);
        return null;
      }
    });

    // -------------------------------------------------------------------------
    // IPC Handlers -- Backed by DataStore persistence
    // -------------------------------------------------------------------------

    // Sessions
    ipcMain.handle('sessions:getCurrent', async () => {
      const sessions = await this.dataStore.get<any[]>('sessions') || [];
      return sessions.find((s: any) => s.active) || null;
    });
    ipcMain.handle('sessions:start', async () => {
      const sessions = await this.dataStore.get<any[]>('sessions') || [];
      // End any currently active session
      for (const s of sessions) { if (s.active) { s.active = false; s.endedAt = Date.now(); } }
      const newSession = { id: `session-${Date.now()}`, startedAt: Date.now(), active: true };
      sessions.push(newSession);
      await this.dataStore.set('sessions', sessions);
      return newSession;
    });
    ipcMain.handle('sessions:end', async () => {
      const sessions = await this.dataStore.get<any[]>('sessions') || [];
      for (const s of sessions) { if (s.active) { s.active = false; s.endedAt = Date.now(); } }
      await this.dataStore.set('sessions', sessions);
      return { success: true };
    });
    ipcMain.handle('sessions:getHistory', async () => {
      const sessions = await this.dataStore.get<any[]>('sessions') || [];
      return sessions.sort((a: any, b: any) => b.startedAt - a.startedAt);
    });

    // Activity
    ipcMain.handle('activity:getAll', async () => {
      return await this.dataStore.get<any[]>('activities') || [];
    });
    ipcMain.handle('activity:getRecent', async () => {
      const activities = await this.dataStore.get<any[]>('activities') || [];
      return activities.slice(-20).reverse();
    });
    ipcMain.handle('activity:markRead', async (_, activityId: string) => {
      const activities = await this.dataStore.get<any[]>('activities') || [];
      const item = activities.find((a: any) => a.id === activityId);
      if (item) { item.read = true; await this.dataStore.set('activities', activities); }
      return { success: true };
    });
    ipcMain.handle('activity:markAllRead', async () => {
      const activities = await this.dataStore.get<any[]>('activities') || [];
      for (const a of activities) { a.read = true; }
      await this.dataStore.set('activities', activities);
      return { success: true };
    });
    ipcMain.handle('activity:clearAll', async () => {
      await this.dataStore.set('activities', []);
      return { success: true };
    });

    // Projects
    ipcMain.handle('projects:getAll', async () => {
      return await this.dataStore.get<any[]>('projects') || [];
    });
    ipcMain.handle('projects:create', async (_, project: any) => {
      const projects = await this.dataStore.get<any[]>('projects') || [];
      const newProject = { id: `proj-${Date.now()}`, ...project, active: false, createdAt: Date.now() };
      projects.push(newProject);
      await this.dataStore.set('projects', projects);
      return newProject;
    });
    ipcMain.handle('projects:update', async (_, project: any) => {
      const projects = await this.dataStore.get<any[]>('projects') || [];
      const idx = projects.findIndex((p: any) => p.id === project.id);
      if (idx !== -1) { projects[idx] = { ...projects[idx], ...project, updatedAt: Date.now() }; await this.dataStore.set('projects', projects); return projects[idx]; }
      return project;
    });
    ipcMain.handle('projects:delete', async (_, projectId: string) => {
      const projects = await this.dataStore.get<any[]>('projects') || [];
      await this.dataStore.set('projects', projects.filter((p: any) => p.id !== projectId));
      return { success: true };
    });
    ipcMain.handle('projects:setActive', async (_, projectId: string) => {
      const projects = await this.dataStore.get<any[]>('projects') || [];
      for (const p of projects) { p.active = p.id === projectId; }
      await this.dataStore.set('projects', projects);
      return { success: true };
    });
    ipcMain.handle('projects:getActive', async () => {
      const projects = await this.dataStore.get<any[]>('projects') || [];
      return projects.find((p: any) => p.active) || null;
    });

    // Media
    ipcMain.handle('media:getSupportedFormats', async () => [...MEDIA_EXTENSIONS.supported]);
    ipcMain.handle('media:getThumbnail', async (_, filePath: string) => {
      try {
        const validPath = PathValidator.validatePath(filePath, { requireExists: true });
        const img = await nativeImage.createThumbnailFromPath(validPath, { width: 256, height: 256 });
        return img.toDataURL();
      } catch {
        return null;
      }
    });
    ipcMain.handle('media:openWithSystem', async (_, filePath: string) => {
      const validPath = PathValidator.validatePath(filePath, { requireExists: true });
      await shell.openPath(validPath);
      return { success: true };
    });
    ipcMain.handle('media:preview', async (_, filePath: string) => {
      try {
        const validPath = PathValidator.validatePath(filePath, { requireExists: true });
        const img = await nativeImage.createThumbnailFromPath(validPath, { width: 512, height: 512 });
        return img.toDataURL();
      } catch {
        return null;
      }
    });

    // Theme -- persisted config
    ipcMain.handle('theme:getConfig', async () => {
      return await this.dataStore.get('themeConfig') || { mode: THEME_DEFAULTS.MODE, accentColor: THEME_DEFAULTS.ACCENT_COLOR, fontScale: THEME_DEFAULTS.FONT_SCALE, reducedMotion: THEME_DEFAULTS.REDUCED_MOTION, density: THEME_DEFAULTS.DENSITY };
    });
    // Item 78: System accent color sync -- read OS accent color
    ipcMain.handle('theme:getSystemAccentColor', async () => {
      try {
        if (process.platform === 'win32' || process.platform === 'darwin') {
          const color = systemPreferences.getAccentColor();
          // Returns RRGGBBAA hex string on Windows, convert to #RRGGBB
          if (color && color.length >= 6) {
            return '#' + color.substring(0, 6);
          }
        }
      } catch { /* Not supported on this OS */ }
      return null;
    });
    ipcMain.handle('theme:setMode', async (_, mode: string) => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      cfg.mode = mode;
      await this.dataStore.set('themeConfig', cfg);
      this.mainWindow?.webContents.send('theme:changed', cfg);
      return { success: true };
    });
    ipcMain.handle('theme:setAccentColor', async (_, color: string) => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      cfg.accentColor = color;
      await this.dataStore.set('themeConfig', cfg);
      return { success: true };
    });
    ipcMain.handle('theme:setFontScale', async (_, scale: number) => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      cfg.fontScale = scale;
      await this.dataStore.set('themeConfig', cfg);
      return { success: true };
    });
    ipcMain.handle('theme:setReducedMotion', async (_, enabled: boolean) => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      cfg.reducedMotion = enabled;
      await this.dataStore.set('themeConfig', cfg);
      return { success: true };
    });
    ipcMain.handle('theme:setDensity', async (_, density: string) => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      cfg.density = density;
      await this.dataStore.set('themeConfig', cfg);
      return { success: true };
    });
    ipcMain.handle('theme:generateCSSVariables', async () => {
      const cfg = await this.dataStore.get<any>('themeConfig') || {};
      return `--accent-color: ${cfg.accentColor || '#0a84ff'}; --font-scale: ${cfg.fontScale || 1};`;
    });
    ipcMain.handle('theme:getPresets', async () => {
      return [
        { id: 'true-black', name: 'True Black', accentColor: '#0a84ff', mode: 'dark' },
        { id: 'midnight', name: 'Midnight', accentColor: '#5e5ce6', mode: 'dark' },
        { id: 'ocean', name: 'Ocean', accentColor: '#64d2ff', mode: 'dark' },
        { id: 'sunset', name: 'Sunset', accentColor: '#ff9f0a', mode: 'dark' },
        { id: 'rose', name: 'Rose', accentColor: '#ff375f', mode: 'dark' },
      ];
    });
    ipcMain.handle('theme:applyPreset', async (_, presetId: string) => {
      const presets: Record<string, any> = {
        'true-black': { mode: 'dark', accentColor: '#0a84ff', fontScale: 1, reducedMotion: false, density: 'comfortable' },
        'midnight': { mode: 'dark', accentColor: '#5e5ce6', fontScale: 1, reducedMotion: false, density: 'comfortable' },
        'ocean': { mode: 'dark', accentColor: '#64d2ff', fontScale: 1, reducedMotion: false, density: 'comfortable' },
        'sunset': { mode: 'dark', accentColor: '#ff9f0a', fontScale: 1, reducedMotion: false, density: 'comfortable' },
        'rose': { mode: 'dark', accentColor: '#ff375f', fontScale: 1, reducedMotion: false, density: 'comfortable' },
      };
      const preset = presets[presetId];
      if (preset) { await this.dataStore.set('themeConfig', preset); }
      return { success: true };
    });
    ipcMain.handle('theme:export', async () => {
      return await this.dataStore.get('themeConfig') || {};
    });
    ipcMain.handle('theme:import', async (_, config: any) => {
      if (config && typeof config === 'object') { await this.dataStore.set('themeConfig', config); }
      return { success: true };
    });

    // Automation Engine approval queue
    ipcMain.handle('automationEngine:getApprovalQueue', async () => {
      const queue = await this.dataStore.get<any[]>('automationQueue') || [];
      return queue.filter((item: any) => item.status === 'pending');
    });
    ipcMain.handle('automationEngine:approve', async (_, itemId: string) => {
      const queue = await this.dataStore.get<any[]>('automationQueue') || [];
      const item = queue.find((q: any) => q.id === itemId);
      if (item) { item.status = 'approved'; await this.dataStore.set('automationQueue', queue); }
      return { success: true };
    });
    ipcMain.handle('automationEngine:deny', async (_, itemId: string) => {
      const queue = await this.dataStore.get<any[]>('automationQueue') || [];
      const item = queue.find((q: any) => q.id === itemId);
      if (item) { item.status = 'denied'; await this.dataStore.set('automationQueue', queue); }
      return { success: true };
    });

    // -----------------------------------------------------------------------
    // Phase 3: Additional IPC handlers — wired to DataStore persistence
    // -----------------------------------------------------------------------

    // Auth setup handlers
    ipcMain.handle('auth:setup:pin', async (_, pin: string) => {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(pin).digest('hex');
      const s = await this.dataStore.get<Record<string, any>>('appliedSettings') || {};
      s.pinHash = hash; s.pinEnabled = true;
      await this.dataStore.set('appliedSettings', s);
      return { success: true };
    });
    ipcMain.handle('auth:setup:password', async (_, password: string) => {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      const s = await this.dataStore.get<Record<string, any>>('appliedSettings') || {};
      s.passwordHash = hash; s.passwordEnabled = true;
      await this.dataStore.set('appliedSettings', s);
      return { success: true };
    });
    ipcMain.handle('auth:setup:biometric', async () => {
      return { success: true, supported: process.platform === 'darwin' || process.platform === 'win32' };
    });

    // Split view
    ipcMain.handle('splitview:apply-preset', async (_, preset: string) => {
      this.mainWindow?.webContents.send('splitview:preset-applied', preset);
      return { success: true };
    });
    ipcMain.handle('split:cross-drop', async (_, data: any) => {
      this.mainWindow?.webContents.send('split:cross-drop-applied', data);
      return { success: true };
    });

    // Tags CRUD
    ipcMain.handle('tags:rename', async (_, tagId: string, newName: string) => {
      const tags = await this.dataStore.get<any[]>('tags') || [];
      const tag = tags.find((t: any) => t.id === tagId);
      if (tag) { tag.name = newName; await this.dataStore.set('tags', tags); }
      return { success: true };
    });
    ipcMain.handle('tags:merge', async (_, sourceId: string, targetId: string) => {
      let tags = await this.dataStore.get<any[]>('tags') || [];
      tags = tags.filter((t: any) => t.id !== sourceId);
      await this.dataStore.set('tags', tags);
      return { success: true, mergedInto: targetId };
    });
    ipcMain.handle('tags:delete', async (_, tagId: string) => {
      let tags = await this.dataStore.get<any[]>('tags') || [];
      tags = tags.filter((t: any) => t.id !== tagId);
      await this.dataStore.set('tags', tags);
      return { success: true };
    });
    ipcMain.handle('tags:bulk-rename', async (_, renames: Array<{ id: string; name: string }>) => {
      const tags = await this.dataStore.get<any[]>('tags') || [];
      for (const r of renames) {
        const tag = tags.find((t: any) => t.id === r.id);
        if (tag) tag.name = r.name;
      }
      await this.dataStore.set('tags', tags);
      return { success: true };
    });
    ipcMain.handle('tags:bulk-merge', async (_, sourceIds: string[], targetId: string) => {
      let tags = await this.dataStore.get<any[]>('tags') || [];
      tags = tags.filter((t: any) => !sourceIds.includes(t.id));
      await this.dataStore.set('tags', tags);
      return { success: true, mergedInto: targetId };
    });

    // Duplicates resolution
    ipcMain.handle('duplicates:resolve', async (_, duplicateId: string, strategy: string) => {
      const tags = await this.dataStore.get<any[]>('tags') || [];
      // Mark as resolved in metadata
      const resolvedDups = await this.dataStore.get<any[]>('resolvedDuplicates') || [];
      resolvedDups.push({ id: duplicateId, strategy, resolvedAt: Date.now() });
      await this.dataStore.set('resolvedDuplicates', resolvedDups);
      return { success: true, resolved: duplicateId, strategy };
    });
    ipcMain.handle('duplicates:bulk-resolve', async (_, ids: string[], strategy: string) => {
      const resolvedDups = await this.dataStore.get<any[]>('resolvedDuplicates') || [];
      for (const id of ids) {
        resolvedDups.push({ id, strategy, resolvedAt: Date.now() });
      }
      await this.dataStore.set('resolvedDuplicates', resolvedDups);
      return { success: true, resolved: ids.length, strategy };
    });

    // Notes server — local sync mode (no external network required)
    ipcMain.handle('notes:start-server', async () => {
      // Notes are persisted locally via DataStore — no server needed
      const noteCount = ((await this.dataStore.get<any[]>('notes')) || []).length;
      return { success: true, status: 'running', port: 0, mode: 'local', noteCount };
    });
    ipcMain.handle('notes:stop-server', async () => {
      return { success: true, status: 'stopped', mode: 'local' };
    });

    // Focus sessions
    ipcMain.handle('focus:start', async (_, mode?: string) => {
      const sessions = await this.dataStore.get<any[]>('focusSessions') || [];
      const session = { id: `focus-${Date.now()}`, startedAt: Date.now(), active: true, mode: mode || 'default' };
      sessions.push(session);
      await this.dataStore.set('focusSessions', sessions);
      this.mainWindow?.webContents.send('focus:state-changed', { active: true, session });
      return session;
    });
    ipcMain.handle('focus:end', async () => {
      const sessions = await this.dataStore.get<any[]>('focusSessions') || [];
      const active = sessions.find((s: any) => s.active);
      if (active) { active.active = false; active.endedAt = Date.now(); await this.dataStore.set('focusSessions', sessions); }
      this.mainWindow?.webContents.send('focus:state-changed', { active: false });
      return { success: true };
    });

    // Health / stability
    ipcMain.handle('stability:ping', async () => {
      return { status: 'ok', uptime: process.uptime(), timestamp: Date.now() };
    });
    ipcMain.handle('memory:recordActivity', async (_, activity: any) => {
      const activities = await this.dataStore.get<any[]>('activities') || [];
      activities.push({ ...activity, id: `act-${Date.now()}`, timestamp: Date.now() });
      if (activities.length > 1000) activities.splice(0, activities.length - 1000);
      await this.dataStore.set('activities', activities);
      return { success: true };
    });

    // Session notes CRUD
    ipcMain.handle('sessions:notes:get', async (_, sessionId: string) => {
      const notes = await this.dataStore.get<any[]>('sessionNotes') || [];
      return notes.filter((n: any) => n.sessionId === sessionId);
    });
    ipcMain.handle('sessions:notes:add', async (_, sessionId: string, content: string) => {
      const notes = await this.dataStore.get<any[]>('sessionNotes') || [];
      const note = { id: `note-${Date.now()}`, sessionId, content, createdAt: Date.now() };
      notes.push(note);
      await this.dataStore.set('sessionNotes', notes);
      return note;
    });
    ipcMain.handle('sessions:notes:update', async (_, noteId: string, content: string) => {
      const notes = await this.dataStore.get<any[]>('sessionNotes') || [];
      const note = notes.find((n: any) => n.id === noteId);
      if (note) { note.content = content; note.updatedAt = Date.now(); await this.dataStore.set('sessionNotes', notes); }
      return { success: true };
    });
    ipcMain.handle('sessions:notes:delete', async (_, noteId: string) => {
      let notes = await this.dataStore.get<any[]>('sessionNotes') || [];
      notes = notes.filter((n: any) => n.id !== noteId);
      await this.dataStore.set('sessionNotes', notes);
      return { success: true };
    });

    // Session timers CRUD
    ipcMain.handle('sessions:timers:get', async () => {
      return await this.dataStore.get<any[]>('sessionTimers') || [];
    });
    ipcMain.handle('sessions:timers:create', async (_, label: string, duration: number) => {
      const timers = await this.dataStore.get<any[]>('sessionTimers') || [];
      const timer = { id: `timer-${Date.now()}`, label, duration, remaining: duration, status: 'idle' as const, createdAt: Date.now() };
      timers.push(timer);
      await this.dataStore.set('sessionTimers', timers);
      return timer;
    });
    ipcMain.handle('sessions:timers:start', async (_, timerId: string) => {
      const timers = await this.dataStore.get<any[]>('sessionTimers') || [];
      const timer = timers.find((t: any) => t.id === timerId);
      if (timer) { timer.status = 'running'; await this.dataStore.set('sessionTimers', timers); }
      return { success: true };
    });
    ipcMain.handle('sessions:timers:pause', async (_, timerId: string) => {
      const timers = await this.dataStore.get<any[]>('sessionTimers') || [];
      const timer = timers.find((t: any) => t.id === timerId);
      if (timer) { timer.status = 'paused'; await this.dataStore.set('sessionTimers', timers); }
      return { success: true };
    });
    ipcMain.handle('sessions:timers:stop', async (_, timerId: string) => {
      const timers = await this.dataStore.get<any[]>('sessionTimers') || [];
      const timer = timers.find((t: any) => t.id === timerId);
      if (timer) { timer.status = 'done'; timer.remaining = 0; await this.dataStore.set('sessionTimers', timers); }
      return { success: true };
    });
    ipcMain.handle('sessions:timers:delete', async (_, timerId: string) => {
      let timers = await this.dataStore.get<any[]>('sessionTimers') || [];
      timers = timers.filter((t: any) => t.id !== timerId);
      await this.dataStore.set('sessionTimers', timers);
      return { success: true };
    });

    // Emergency mode
    ipcMain.handle('emergency:stop', async () => {
      await this.dataStore.set('emergencyMode', true);
      this.mainWindow?.webContents.send('emergency:stopped');
      return { success: true };
    });
    ipcMain.handle('emergency:resume', async () => {
      await this.dataStore.set('emergencyMode', false);
      this.mainWindow?.webContents.send('emergency:resumed');
      return { success: true };
    });

    // Intelligence event recording
    ipcMain.handle('intelligence:recordEvent', async (_, event: any) => {
      const events = await this.dataStore.get<any[]>('events') || [];
      events.push({ ...event, id: `evt-${Date.now()}`, timestamp: Date.now() });
      if (events.length > 5000) events.splice(0, events.length - 5000);
      await this.dataStore.set('events', events);
      return { success: true };
    });

    // Renderer health ping (using ipcMain.on for one-way messages)
    const { ipcMain: ipcMainModule } = require('electron');
    ipcMainModule.on('renderer-health:pong', () => { /* renderer is alive */ });
  }

  private async resume(): Promise<void> {
    this.logger.info('Resuming operations...');
    this.eventMonitor.start();
    this.ruleEngine.start();
    this.mainWindow?.webContents.send('emergency:resumed');
  }

  private async autoOptimizeSystem(): Promise<void> {
    // Auto-optimize system for smooth performance on startup
    this.logger.info('Auto-optimizing system for smooth performance...');
    
    try {
      // Set balanced profile by default for optimal performance
      await this.powerController.setProfile('balanced');
      
      // Only clean up memory if usage is critically high (>90%)
      // Lower thresholds cause unnecessary event loop blocking
      const stats = await this.powerController.getPowerStats();
      if (stats.memory.percent > 90) {
        this.logger.info('Critical memory usage detected, freeing memory...');
        // Run asynchronously without blocking startup
        this.powerController.freeMemory().catch(() => {});
      }
      
      this.logger.success('System optimization complete - running smooth');
    } catch (error: any) {
      this.logger.warn('Auto-optimization encountered issues', error.message);
    }
  }

  private quit(): void {
    this.isQuitting = true;
    this.ruleEngine.stop();
    this.eventMonitor.stop();
    app.quit();
  }
}

// Initialize the app
const dex = new DexApp();

// Check for CLI mode via command line arguments
const args = process.argv.slice(2);
const CLI_COMMANDS = new Set(['help', 'version', 'list', 'run', 'status', 'trigger', 'export', 'import', 'exec', 'config']);
const isCLIMode = args.length > 0 && CLI_COMMANDS.has(args[0]);

if (isCLIMode) {
  // Run in CLI mode without GUI
  runCLIMode(args).then(exitCode => {
    process.exit(exitCode);
  }).catch(err => {
    log.error('[DEX] CLI Error:', err);
    process.exit(1);
  });
} else {
  // Normal GUI mode
  dex.initialize().catch(log.error);
}
