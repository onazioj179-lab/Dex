// ===========================================================================
// DEX - Phase 1 Stability Integration
// Immediate Patch Cycle - Complete Integration Module
// Makes Dex boringly reliable. No crashes. No data loss. No surprises.
// ===========================================================================

import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// Phase 1 Core Systems
import { stabilityCore, registerStabilityHandlers } from './StabilityCore';
import { permissionGuard } from './PermissionGuard';
import { automationStabilityGuard, initializeAutomationStability } from './AutomationStabilityGuard';
import { memoryLeakPrevention, initializeMemoryLeakPrevention } from './MemoryLeakPrevention';
import { searchCorrectnessManager, initializeSearchCorrectness } from './SearchCorrectness';

// ===========================================================================
// TYPES
// ===========================================================================

export interface Phase1Status {
  initialized: boolean;
  systems: {
    stabilityCore: boolean;
    permissionGuard: boolean;
    automationStability: boolean;
    memoryLeakPrevention: boolean;
    searchCorrectness: boolean;
  };
  health: 'excellent' | 'good' | 'degraded' | 'critical';
  startupTime: number;
  uptime: number;
}

export interface Phase1Report {
  generatedAt: number;
  status: Phase1Status;
  stabilityStats: ReturnType<typeof stabilityCore.getStats>;
  memoryStats: ReturnType<typeof memoryLeakPrevention.getCurrentStats>;
  automationStats: ReturnType<typeof automationStabilityGuard.getStats>;
  searchMetrics: ReturnType<typeof searchCorrectnessManager.getQualityMetrics>;
  recommendations: string[];
}

// ===========================================================================
// PHASE 1 INTEGRATION CLASS
// ===========================================================================

class Phase1IntegrationClass {
  private isInitialized: boolean = false;
  private startupTime: number = 0;
  private initStartTime: number = 0;

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  /**
   * Initialize all Phase 1 stability systems
   * MUST be called early in app startup, before window creation
   */
  async initialize(dataStore: any): Promise<void> {
    if (this.isInitialized) {
      log.warn('[Phase1] Already initialized');
      return;
    }

    this.initStartTime = Date.now();
    log.info('[Phase1] ========================================');
    log.info('[Phase1] PHASE 1 STABILITY SYSTEMS INITIALIZING');
    log.info('[Phase1] ========================================');

    try {
      // 1. Initialize Stability Core FIRST (catches all errors)
      log.info('[Phase1] [1/5] Initializing Stability Core...');
      await stabilityCore.initialize();
      registerStabilityHandlers();
      log.info('[Phase1] [1/5] Stability Core ready');

      // 2. Initialize Permission Guard
      log.info('[Phase1] [2/5] Initializing Permission Guard...');
      await permissionGuard.initialize(dataStore);
      log.info('[Phase1] [2/5] Permission Guard ready');

      // 3. Initialize Automation Stability Guard
      log.info('[Phase1] [3/5] Initializing Automation Stability...');
      await initializeAutomationStability();
      log.info('[Phase1] [3/5] Automation Stability ready');

      // 4. Initialize Memory Leak Prevention
      log.info('[Phase1] [4/5] Initializing Memory Leak Prevention...');
      await initializeMemoryLeakPrevention();
      log.info('[Phase1] [4/5] Memory Leak Prevention ready');

      // 5. Initialize Search Correctness
      log.info('[Phase1] [5/5] Initializing Search Correctness...');
      await initializeSearchCorrectness();
      log.info('[Phase1] [5/5] Search Correctness ready');

      // Setup cross-system integrations
      this.setupIntegrations();

      // Register IPC handlers
      this.registerIPCHandlers();

      this.isInitialized = true;
      this.startupTime = Date.now() - this.initStartTime;

      log.info('[Phase1] ========================================');
      log.info(`[Phase1] ALL SYSTEMS INITIALIZED (${this.startupTime}ms)`);
      log.info('[Phase1] ========================================');

    } catch (error) {
      log.error('[Phase1] CRITICAL: Initialization failed:', error);
      // Don't throw - let app continue with degraded functionality
      this.isInitialized = true; // Mark as initialized to prevent retry loops
    }
  }

  /**
   * Shutdown all Phase 1 systems gracefully
   */
  async shutdown(): Promise<void> {
    log.info('[Phase1] Shutting down Phase 1 systems...');

    try {
      stabilityCore.shutdown();
      permissionGuard.shutdown();
      automationStabilityGuard.shutdown();
      memoryLeakPrevention.shutdown();
      searchCorrectnessManager.shutdown();
    } catch (error) {
      log.error('[Phase1] Error during shutdown:', error);
    }

    log.info('[Phase1] Phase 1 systems shut down');
  }

  // -------------------------------------------------------------------------
  // CROSS-SYSTEM INTEGRATIONS
  // -------------------------------------------------------------------------

  private setupIntegrations(): void {
    // Stability Core -> Memory Leak Prevention
    // When memory pressure is detected, trigger cleanup
    stabilityCore.on('memory-pressure', () => {
      memoryLeakPrevention.forceCleanup();
    });

    // Permission Guard -> Automation Stability
    // When permissions are revoked, hard stop affected automations
    permissionGuard.on('permission-revoked', ({ permission, affectedFeatures }) => {
      if (affectedFeatures.includes('automation-runner')) {
        const running = automationStabilityGuard.getRunningExecutions();
        for (const exec of running) {
          automationStabilityGuard.hardStop(exec.executionId, `Permission revoked: ${permission}`);
        }
      }
    });

    // Automation Stability -> Stability Core
    // Record automation failures in stability tracking
    automationStabilityGuard.on('execution-failed', ({ context, error }) => {
      stabilityCore.recordAutomationFailure(new Error(error), context.automationId);
    });

    // Memory Leak Prevention -> Stability Core
    // Notify stability core of memory issues
    memoryLeakPrevention.on('leak-detected', (result) => {
      if (result.severity === 'critical' || result.severity === 'high') {
        const error = new Error(`Memory leak detected: ${result.type} - ${result.recommendation}`);
        stabilityCore.recordMediaLifecycleError(error, { leakType: result.type });
      }
    });

    // Search Correctness -> Notify renderer of index updates
    searchCorrectnessManager.on('index-updated', ({ version, itemCount }) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('search:index-updated', { version, itemCount });
        }
      }
    });

    log.info('[Phase1] Cross-system integrations configured');
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('phase1:getStatus', () => this.getStatus());
    ipcMain.handle('phase1:getReport', () => this.generateReport());
    ipcMain.handle('phase1:forceCleanup', () => {
      memoryLeakPrevention.forceCleanup();
      searchCorrectnessManager.invalidateCache('manual-cleanup');
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // STATUS & REPORTING
  // -------------------------------------------------------------------------

  /**
   * Get current Phase 1 status
   */
  getStatus(): Phase1Status {
    const stabilityStats = stabilityCore.getStats();

    return {
      initialized: this.isInitialized,
      systems: {
        stabilityCore: this.isInitialized,
        permissionGuard: this.isInitialized,
        automationStability: this.isInitialized,
        memoryLeakPrevention: this.isInitialized,
        searchCorrectness: this.isInitialized,
      },
      health: stabilityStats.currentHealth,
      startupTime: this.startupTime,
      uptime: stabilityStats.uptimeMs,
    };
  }

  /**
   * Generate comprehensive Phase 1 report
   */
  generateReport(): Phase1Report {
    const status = this.getStatus();
    const stabilityStats = stabilityCore.getStats();
    const memoryStats = memoryLeakPrevention.getCurrentStats();
    const automationStats = automationStabilityGuard.getStats();
    const searchMetrics = searchCorrectnessManager.getQualityMetrics();

    const recommendations: string[] = [];

    // Generate recommendations based on stats
    if (stabilityStats.currentHealth === 'critical') {
      recommendations.push('System stability is critical. Consider restarting the application.');
    }

    if (memoryStats.heapUsedMB > 200) {
      recommendations.push('Memory usage is high. Close unused features or restart the app.');
    }

    const growthTrend = memoryLeakPrevention.getGrowthTrend();
    if (growthTrend.trend === 'growing' && growthTrend.hourlyGrowthMB > 30) {
      recommendations.push('Memory is growing rapidly. A memory leak may be present.');
    }

    if (automationStats.failedCount > automationStats.completedCount * 0.2) {
      recommendations.push('High automation failure rate. Check automation configurations.');
    }

    if (searchMetrics.avgQueryTimeMs > 500) {
      recommendations.push('Search is slow. Consider rebuilding the search index.');
    }

    return {
      generatedAt: Date.now(),
      status,
      stabilityStats,
      memoryStats,
      automationStats,
      searchMetrics,
      recommendations,
    };
  }

  /**
   * Check if system is healthy enough for operations
   */
  isHealthy(): boolean {
    const status = this.getStatus();
    return status.health !== 'critical';
  }

  /**
   * Get stability core for direct access
   */
  getStabilityCore() {
    return stabilityCore;
  }

  /**
   * Get permission guard for direct access
   */
  getPermissionGuard() {
    return permissionGuard;
  }

  /**
   * Get automation stability guard for direct access
   */
  getAutomationStabilityGuard() {
    return automationStabilityGuard;
  }

  /**
   * Get memory leak prevention for direct access
   */
  getMemoryLeakPrevention() {
    return memoryLeakPrevention;
  }

  /**
   * Get search correctness manager for direct access
   */
  getSearchCorrectnessManager() {
    return searchCorrectnessManager;
  }
}

// Singleton instance
export const phase1Integration = new Phase1IntegrationClass();

// ===========================================================================
// EXPORTS
// ===========================================================================

// Export individual systems for direct use
export { stabilityCore } from './StabilityCore';
export { permissionGuard } from './PermissionGuard';
export { automationStabilityGuard } from './AutomationStabilityGuard';
export { memoryLeakPrevention } from './MemoryLeakPrevention';
export { searchCorrectnessManager } from './SearchCorrectness';

// Export initialization function
export async function initializePhase1(dataStore: any): Promise<void> {
  return phase1Integration.initialize(dataStore);
}

// Export shutdown function
export async function shutdownPhase1(): Promise<void> {
  return phase1Integration.shutdown();
}

// Export status and report functions
export function getPhase1Status(): Phase1Status {
  return phase1Integration.getStatus();
}

export function getPhase1Report(): Phase1Report {
  return phase1Integration.generateReport();
}

// Export health check
export function isPhase1Healthy(): boolean {
  return phase1Integration.isHealthy();
}
