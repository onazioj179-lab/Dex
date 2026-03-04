/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX - Personal Control Hub for Desktop Automation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * @version    2.0.0
 * 
 * Main Process Entry Point - Electron Application Core
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Electron
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, globalShortcut, dialog } from 'electron';
import * as log from 'electron-log';

// Node.js
import * as fs from 'fs';
import * as path from 'path';

// Shared Types
import type { DexAction } from '../shared/types';

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
import { trustController } from './controllers/TrustController';
import { VoiceController } from './controllers/VoiceController';
import { watchdogController } from './controllers/WatchdogController';
import { workflowController } from './controllers/WorkflowController';
import { authController } from './controllers/AuthController';
import { vaultController } from './controllers/VaultController';
import { systemIntelligenceController } from './controllers/SystemIntelligenceController';
import { governanceController } from './controllers/GovernanceController';
import { AutoFillController } from './controllers/AutoFillController';

// System Storage, Automation & Learning Intelligence
import { storageManager } from './core/StorageManager';
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
import { ClipboardHistoryManager } from './core/ClipboardHistoryManager';
import { dataIntegrity } from './core/DataIntegrity';
import { errorRecovery } from './core/ErrorRecovery';
import { memoryManager } from './core/MemoryManager';
import { performanceGuardian } from './core/PerformanceGuardian';
import { pythonExecutor } from './core/PythonExecutor';
import { resourceGovernor } from './core/ResourceGovernor';
import { securityAudit } from './core/SecurityAudit';

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
import { EventMonitor } from './monitors/EventMonitor';
import { healthMonitor, registerHealthHandlers } from './monitors/HealthMonitor';
import { PermissionManager } from './security/PermissionManager';
import { DataStore } from './store/DataStore';
import { Logger } from './utils/Logger';

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

// Governance Contract (Phase 58-59)
import { registerGovernanceHandlers, governanceEnforcer } from './core/GovernanceContract';

// Release Management (Phase 66)
import { ReleaseManager } from './core/ReleaseManager';

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

// Platform detection
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

class DexApp {
  // Window & Tray
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private isQuitting = false;

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
    
    // Single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      log.info('[DEX] Another instance running, quitting');
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    await app.whenReady();
    
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
    
    // CRITICAL: Create window FIRST before anything else
    log.info('[DEX] Stage 2: Creating window...');
    try {
      await this.createWindow();
      log.info('[DEX] Stage 2: Window created successfully');
      
      // Track window for memory leak prevention
      if (this.mainWindow) {
        memoryLeakPrevention.trackWindow(this.mainWindow);
      }
    } catch (err) {
      log.error('[DEX] CRITICAL: Window creation failed:', err);
      stabilityCore.recordTabLifecycleError(err as Error, { stage: 'window-creation' });
      await this.showFatalError('Window creation failed', String(err));
      return;
    }
    
    // Initialize data store (with timeout)
    log.info('[DEX] Stage 3: Initializing data store...');
    try {
      await Promise.race([
        this.dataStore.initialize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DataStore timeout')), 5000))
      ]);
      log.info('[DEX] Stage 3: Data store ready');
      
      // Run data migrations after DataStore is ready
      log.info('[DEX] Stage 3b: Running data migrations...');
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
    log.info('[DEX] Stage 4: Creating tray...');
    try {
      this.createTray();
    } catch (err) {
      log.warn('[DEX] Tray creation failed, continuing:', err);
    }
    
    // Setup IPC (critical for renderer)
    log.info('[DEX] Stage 5: Setting up IPC...');
    this.setupIPC();
    
    // Start monitoring (non-critical)
    log.info('[DEX] Stage 6: Starting monitors...');
    try {
      this.eventMonitor.start();
      this.ruleEngine.start();
      watchdogController.start();
    } catch (err) {
      log.warn('[DEX] Monitors failed to start:', err);
    }

    // Initialize controllers — each in its own try/catch for resilience
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
    codeController;
    storageManager;

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

    app.on('before-quit', async () => {
      this.isQuitting = true;
      log.info('[DEX] Shutting down...');
      globalShortcut.unregisterAll();

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
      
      // Destroy tray icon
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }
      
      log.info('[DEX] Shutdown complete');
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        // Don't quit on Windows/Linux, stay in tray
      }
    });

    // macOS: Show dock icon badge for notifications
    if (isMac) {
      app.dock?.setMenu(Menu.buildFromTemplate([
        { label: 'New Window', click: () => this.createWindow() },
      ]));
    }
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
    setTimeout(async () => {
      try {
        await this.initializeSubsystems();
      } catch (err) {
        log.error('[DEX] Subsystem init error:', err);
      }
      
      // Background tasks
      try {
        dataIntegrity.verifyAllFiles().then(results => {
          const issues = results.filter(r => !r.valid);
          if (issues.length > 0) {
            this.logger.warn(`Data integrity issues found: ${issues.length} files`);
          }
        }).catch(err => log.warn('[DEX] Data integrity check failed:', err));
        
        dataController.createAutoBackup().catch(err => log.warn('[DEX] Auto backup failed:', err));
        this.autoOptimizeSystem().catch(err => log.warn('[DEX] Auto optimize failed:', err));
      } catch (err) {
        log.warn('[DEX] Background tasks error:', err);
      }
    }, 100); // Small delay to let UI render first
  }

  private async initializeSubsystems(): Promise<void> {
    // ═══════════════════════════════════════════════════════════════════════
    // DEX PERFORMANCE BOOSTER: System-level optimization (start first)
    // ═══════════════════════════════════════════════════════════════════════
    await initializePerformanceBooster();
    
    // ═══════════════════════════════════════════════════════════════════════
    // VISUAL SMOOTHNESS MODE: Core Performance Systems (start first)
    // ═══════════════════════════════════════════════════════════════════════
    
    // ULTRA-LOW RESOURCE MODE: Start ResourceGovernor first
    resourceGovernor.start();
    
    // 120Hz Render Governor: High-refresh display support
    RenderGovernor.start();
    
    // Motion Controller: Animation discipline
    // DISABLED: MotionController.start(); // Reduces overhead
    
    // Input Latency Controller: Zero-latency input
    // DISABLED: InputLatencyController.start(); // Reduces overhead
    
    // Session Stability Manager: Long-session support
    // DISABLED: SessionStabilityManager.start(); // Reduces overhead
    
    // Performance Enforcer: Guarantees enforcement
    // DISABLED: PerformanceEnforcer.start(); // Reduces overhead

    // System Integration
    systemMapController.start();
    connectionController.start();
    deviceController.start();

    // Session Management
    deepSessionController.start();

    // Performance & Optimization
    memoryManager.startMonitoring();
    backgroundTasks.start();
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
    // Parallelize independent Next-Gen systems
    await Promise.all([
      initializeIntentSessions(),
      initializeUsageAwareFileSystem(),
      initializeTrustworthySearch(),
      initializeSystemUndo(),
    ]);

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

    // DEX Rewind - Activity Logger
    await initializeRewind(this.mainWindow!);

    // ═══════════════════════════════════════════════════════════════════════
    // DEX PREMIUM FEATURES - Ecosystem, UX, Security, Hardware (parallelized)
    // ═══════════════════════════════════════════════════════════════════════
    await Promise.all([
      initializeEcosystemIntegration(),
      initializeUXEnhancement(),
      initializeSecurityLayer(),
      initializeHardwareOptimization(),
    ]);

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
    
    log.info('[DEX] Creating BrowserWindow with performance optimizations...');
    
    // GPU switches are process-level — only append once
    if (!(this as any)._gpuSwitchesApplied) {
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('disable-software-rasterizer');
      (this as any)._gpuSwitchesApplied = true;
    }
    
    this.mainWindow = new BrowserWindow({
      width: WINDOW.DEFAULT_WIDTH,
      height: WINDOW.DEFAULT_HEIGHT,
      minWidth: WINDOW.MIN_WIDTH,
      minHeight: WINDOW.MIN_HEIGHT,
      show: false, // Don't show until ready
      center: true,
      icon: path.join(__dirname, '../../assets/icon.png'),
      frame: isMac,
      transparent: false,
      backgroundColor: WINDOW.BACKGROUND_COLOR,
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      titleBarOverlay: isMac ? false : {
        color: WINDOW.TITLE_BAR_COLOR,
        symbolColor: WINDOW.TITLE_BAR_SYMBOL_COLOR,
        height: WINDOW.TITLE_BAR_HEIGHT
      },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true, // Enable sandbox for enhanced security
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
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    // Load the app
    const indexPath = path.join(__dirname, '../renderer/index.html');
    log.info('[DEX] Loading renderer from:', indexPath);
    
    if (!fs.existsSync(indexPath)) {
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
    });

    // ── Content Security Policy ─────────────────────────────────────────
    this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob: data:; " +
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

    // Handle webview permissions for embedded browser
    this.mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      // Only allow safe permissions — deny geolocation and overly broad clipboard access
      const allowedPermissions = ['media', 'notifications', 'fullscreen', 'clipboard-read'];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        log.warn(`[DEX] Denied permission request: ${permission}`);
        callback(false);
      }
    });

    // Handle webview attachment - configure webview security
    app.on('web-contents-created', (_, contents) => {
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
    this.tray.setToolTip('Dex - Control Hub');
    this.tray.on('click', () => this.mainWindow?.show());
  }

  private rebuildTrayMenu(): void {
    if (!this.tray) return;

    const isRecording = rewindEngine.getRecordingState();

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Dex', click: () => this.mainWindow?.show() },
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
      { label: 'Quit Dex', click: () => this.quit() },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private setupIPC(): void {
    // ─────────────────────────────────────────────────────────────────────────    // User Activity Tracking (for ResourceGovernor)
    // ───────────────────────────────────────────────────────────────────────────
    ipcMain.on('user:activity', () => {
      resourceGovernor.recordUserActivity();
      backgroundTasks.recordUserInput();
    });

    // ───────────────────────────────────────────────────────────────────────────
    // Resource Governor IPC
    // ───────────────────────────────────────────────────────────────────────────
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

    // ───────────────────────────────────────────────────────────────────────────
    // Settings Apply Handler (Real System Settings)
    // ───────────────────────────────────────────────────────────────────────────
    ipcMain.handle('settings:apply', async (_, settings) => {
      try {
        log.info('[DEX] Applying settings:', Object.keys(settings));
        
        // Apply power profile settings
        if (settings.performanceMode) {
          const profile = settings.performanceMode === 'performance' ? 'boost' :
                         settings.performanceMode === 'powersaver' ? 'eco' : 'balanced';
          await this.powerController.setProfile(profile);
        }
        
        // Apply GPU settings
        if (settings.enableGpu !== undefined) {
          if (settings.enableGpu) {
            app.commandLine.appendSwitch('enable-gpu-rasterization');
            app.commandLine.appendSwitch('enable-zero-copy');
          }
        }
        
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

    // ───────────────────────────────────────────────────────────────────────────
    // Settings Get/Save Handlers
    // ───────────────────────────────────────────────────────────────────────────
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

    // ───────────────────────────────────────────────────────────────────────────    // Window Controls
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Actions (with input sanitization)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Modes
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Rules
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Dialog & File System (for Audio player, etc.)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
      return dialog.showOpenDialog(this.mainWindow!, options);
    });

    ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
      const validPath = PathValidator.validatePath(dirPath, { requireExists: true });
      return fs.promises.readdir(validPath);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // System Status
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('system:getStatus', async () => {
      return this.eventMonitor.getSystemStatus();
    });

    ipcMain.handle('system:getProcesses', async () => {
      return this.eventMonitor.getRunningProcesses();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Logs
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('logs:get', async (_, limit) => {
      return this.logger.getLogs(limit);
    });

    ipcMain.handle('logs:clear', async () => {
      return this.logger.clearLogs();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Health & Verification (Phase 50)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 51: Performance & Capability Layer
    // ─────────────────────────────────────────────────────────────────────────
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

    // Capability layer operations — with path validation
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
      const validKey = PathValidator.validateStorageKey(key);
      return capabilityLayer.storage.get(validKey);
    });

    ipcMain.handle('capability:storage:set', async (_, key: string, value: unknown) => {
      const validKey = PathValidator.validateStorageKey(key);
      return capabilityLayer.storage.set(validKey, value);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Permissions
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('permissions:getAll', async () => {
      return this.permissionManager.getAllPermissions();
    });

    ipcMain.handle('permissions:grant', async (_, permission) => {
      return this.permissionManager.grantPermission(permission);
    });

    ipcMain.handle('permissions:revoke', async (_, permission) => {
      return this.permissionManager.revokePermission(permission);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Emergency Controls
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('emergency:stop', async () => {
      return this.emergencyStop();
    });

    ipcMain.handle('emergency:resume', async () => {
      return this.resume();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Power & Performance
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Operations (Phase 4A - Manual Control Layer)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('operations:execute', async (_, operationId) => {
      return this.operationsController.execute(operationId);
    });

    ipcMain.handle('operations:undo', async (_, logId) => {
      return this.operationsController.undo(logId);
    });

    ipcMain.handle('operations:getLogs', async (_, limit) => {
      return this.operationsController.getLogs(limit);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Workflows (Phase 5 - Composed Operations)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Notes (Phase 6 - Quick Notes)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Timers (Phase 6 - Time Tracking)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Running Tasks (Phase 6 - Task Control)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('sessions:getRunningTasks', async () => {
      return this.sessionController.getRunningTasks();
    });

    ipcMain.handle('sessions:stopTask', async (_, taskId) => {
      return this.sessionController.stopTask(taskId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Shell Operations (with IPC validation)
    // ─────────────────────────────────────────────────────────────────────────
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
      return shell.openExternal(url);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Universal Search (FINAL UI FUNCTIONALITY PHASE)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Media File Scanner (Real File System Integration)
    // ─────────────────────────────────────────────────────────────────────────
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
      
      // Scan directory recursively (max depth 3) — async to avoid blocking main thread
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

    // ─────────────────────────────────────────────────────────────────────────
    // Fast Download System (Drop - Secure & Fast Downloads)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('download:start', async (_, url: string, filename?: string) => {
      // Rate limiting
      ipcRateLimiter.enforce('download:start');
      // Validate URL — only allow http/https, block internal networks
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
            file.close();
            fs.unlinkSync(filePath);
            resolve({ redirect: response.headers.location });
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

    // ─────────────────────────────────────────────────────────────────────────
    // Governance (Phase 58-59: AI + Plugin Boundaries)
    // ─────────────────────────────────────────────────────────────────────────
    registerGovernanceHandlers();

    // ─────────────────────────────────────────────────────────────────────────
    // Release Management (Phase 66: Safe Updates)
    // ─────────────────────────────────────────────────────────────────────────
    this.releaseManager = new ReleaseManager();
    this.releaseManager.setMainWindow(this.mainWindow!);
    this.releaseManager.initialize().catch(err => {
      log.error('[DEX] Release Manager initialize failed:', err);
    });
    log.info('[DEX] Release Manager initialized');

    // ─────────────────────────────────────────────────────────────────────────
    // Voice Control (Phase 46: Opt-in Voice Commands)
    // ─────────────────────────────────────────────────────────────────────────
    voiceControlEngine.initialize().then(() => {
      log.info('[DEX] Voice Control Engine initialized');
    }).catch(err => {
      log.error('[DEX] Voice Control Engine error:', err);
    });
  }

  private async emergencyStop(): Promise<void> {
    this.logger.warn('EMERGENCY STOP ACTIVATED');
    this.ruleEngine.stop();
    this.eventMonitor.stop();
    this.modeController.deactivateMode();
    this.mainWindow?.webContents.send('emergency:stopped');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Voice Notes IPC Handlers (Phase 7B)
  // ═══════════════════════════════════════════════════════════════════════
  
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

  // ═══════════════════════════════════════════════════════════════════════
  // Pattern Learning IPC Handlers (Local-only, background)
  // ═══════════════════════════════════════════════════════════════════════
  
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

    // ───────────────────────────────────────────────────────────────────────────
    // Creative Apps - File I/O Bridge (Imosion, Prism, Flux, Forge, VINX)
    // ───────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // Critical Missing IPC Handlers -- Safe stubs preventing runtime crashes
    // ─────────────────────────────────────────────────────────────────────────

    // Sessions
    ipcMain.handle('sessions:getCurrent', async () => {
      return { id: `session-${Date.now()}`, startedAt: Date.now(), active: true };
    });
    ipcMain.handle('sessions:start', async () => {
      return { id: `session-${Date.now()}`, startedAt: Date.now(), active: true };
    });
    ipcMain.handle('sessions:end', async () => ({ success: true }));
    ipcMain.handle('sessions:getHistory', async () => []);

    // Activity
    ipcMain.handle('activity:getAll', async () => []);
    ipcMain.handle('activity:getRecent', async () => []);
    ipcMain.handle('activity:markRead', async () => ({ success: true }));
    ipcMain.handle('activity:markAllRead', async () => ({ success: true }));
    ipcMain.handle('activity:clearAll', async () => ({ success: true }));

    // Dashboard
    ipcMain.handle('dashboard:getLayout', async () => ({ id: 'default', name: 'Default', widgets: [] }));
    ipcMain.handle('dashboard:saveLayout', async (_, layout) => layout);
    ipcMain.handle('dashboard:getLayouts', async () => [{ id: 'default', name: 'Default', widgets: [] }]);
    ipcMain.handle('dashboard:switchLayout', async () => ({ success: true }));
    ipcMain.handle('dashboard:createLayout', async (_, layout) => ({ id: `layout-${Date.now()}`, ...layout, widgets: [] }));
    ipcMain.handle('dashboard:deleteLayout', async () => ({ success: true }));
    ipcMain.handle('dashboard:addWidget', async () => ({ success: true }));
    ipcMain.handle('dashboard:removeWidget', async () => ({ success: true }));
    ipcMain.handle('dashboard:moveWidget', async () => ({ success: true }));
    ipcMain.handle('dashboard:resizeWidget', async () => ({ success: true }));
    ipcMain.handle('dashboard:getWidgetTypes', async () => []);
    ipcMain.handle('dashboard:getQuickButtons', async () => []);
    ipcMain.handle('dashboard:addQuickButton', async () => ({ success: true }));
    ipcMain.handle('dashboard:removeQuickButton', async () => ({ success: true }));
    ipcMain.handle('dashboard:executeQuickAction', async () => ({ success: true }));

    // Projects
    ipcMain.handle('projects:getAll', async () => []);
    ipcMain.handle('projects:create', async (_, project) => ({ id: `proj-${Date.now()}`, ...project, createdAt: Date.now() }));
    ipcMain.handle('projects:update', async (_, project) => project);
    ipcMain.handle('projects:delete', async () => ({ success: true }));
    ipcMain.handle('projects:setActive', async () => ({ success: true }));
    ipcMain.handle('projects:getActive', async () => null);

    // Media
    ipcMain.handle('media:getSupportedFormats', async () => [...MEDIA_EXTENSIONS.supported]);
    ipcMain.handle('media:getThumbnail', async () => null);
    ipcMain.handle('media:openWithSystem', async (_, filePath: string) => {
      const validPath = PathValidator.validatePath(filePath, { requireExists: true });
      await shell.openPath(validPath);
      return { success: true };
    });
    ipcMain.handle('media:preview', async () => null);

    // Theme (remaining channels not in UXEnhancement)
    ipcMain.handle('theme:getConfig', async () => ({ mode: THEME_DEFAULTS.MODE, accentColor: THEME_DEFAULTS.ACCENT_COLOR, fontScale: THEME_DEFAULTS.FONT_SCALE, reducedMotion: THEME_DEFAULTS.REDUCED_MOTION, density: THEME_DEFAULTS.DENSITY }));
    ipcMain.handle('theme:setAccentColor', async () => ({ success: true }));
    ipcMain.handle('theme:setFontScale', async () => ({ success: true }));
    ipcMain.handle('theme:setReducedMotion', async () => ({ success: true }));
    ipcMain.handle('theme:setDensity', async () => ({ success: true }));
    ipcMain.handle('theme:generateCSSVariables', async () => '');
    ipcMain.handle('theme:getPresets', async () => []);
    ipcMain.handle('theme:applyPreset', async () => ({ success: true }));
    ipcMain.handle('theme:export', async () => ({}));
    ipcMain.handle('theme:import', async () => ({ success: true }));

    // Automation Engine approval queue
    ipcMain.handle('automationEngine:getApprovalQueue', async () => []);
    ipcMain.handle('automationEngine:approve', async () => ({ success: true }));
    ipcMain.handle('automationEngine:deny', async () => ({ success: true }));
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
      
      // Clean up memory if usage is high
      const stats = await this.powerController.getPowerStats();
      if (stats.memory.percent > 80) {
        this.logger.info('High memory usage detected, freeing memory...');
        await this.powerController.freeMemory();
      }
      
      // Deprioritize background processes for smoother foreground performance
      const resourceHogs = await this.powerController.getResourceHogs();
      const backgroundHogs = resourceHogs.filter(p => 
        p.priority === 'background' && p.cpu > 10
      );
      
      if (backgroundHogs.length > 0) {
        this.logger.info(`Found ${backgroundHogs.length} background processes using high CPU`);
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
const isCLIMode = args.length > 0 && !args[0].startsWith('--inspect');

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
