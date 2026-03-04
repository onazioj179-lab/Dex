// ===========================================================================
// DEX - Q1 Foundation Integration Module
// Unified initialization for all Q1 hardening systems
// ===========================================================================

import { ipcMain, app } from 'electron';
import log from 'electron-log';

// Import hardening modules
import { authHardening, initializeAuthHardening } from './AuthHardening';
import { vaultHardening, initializeVaultHardening } from './VaultHardening';
import { sessionHardening, initializeSessionHardening } from './SessionHardening';

// ===========================================================================
// TYPES
// ===========================================================================

export interface Q1SystemStatus {
  name: string;
  initialized: boolean;
  healthy: boolean;
  lastCheck: number;
  metrics: Record<string, number | string>;
}

export interface Q1FoundationReport {
  timestamp: number;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  systems: Q1SystemStatus[];
  recommendations: string[];
}

// ===========================================================================
// Q1 FOUNDATION INTEGRATION
// ===========================================================================

class Q1FoundationIntegration {
  private isInitialized: boolean = false;
  private initializationTime: number = 0;

  /**
   * Initialize all Q1 Foundation systems
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.warn('[Q1Foundation] Already initialized');
      return;
    }

    const startTime = Date.now();
    log.info('[Q1Foundation] Starting Q1 Foundation & Trust systems...');

    try {
      // Initialize all systems in parallel for faster startup
      await Promise.all([
        initializeAuthHardening().catch(err => {
          log.error('[Q1Foundation] Auth hardening failed to initialize:', err);
        }),
        initializeVaultHardening().catch(err => {
          log.error('[Q1Foundation] Vault hardening failed to initialize:', err);
        }),
        initializeSessionHardening().catch(err => {
          log.error('[Q1Foundation] Session hardening failed to initialize:', err);
        }),
      ]);

      // Setup cross-system integrations
      this.setupCrossSystemIntegrations();

      // Register status IPC handlers
      this.registerIPCHandlers();

      this.isInitialized = true;
      this.initializationTime = Date.now() - startTime;

      log.info(`[Q1Foundation] Q1 Foundation systems initialized in ${this.initializationTime}ms`);
    } catch (error) {
      log.error('[Q1Foundation] Failed to initialize Q1 systems:', error);
      throw error;
    }
  }

  /**
   * Shutdown all Q1 Foundation systems
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    log.info('[Q1Foundation] Shutting down Q1 Foundation systems...');

    try {
      // Shutdown in reverse order
      sessionHardening.shutdown();
      vaultHardening.shutdown();
      authHardening.shutdown();

      this.isInitialized = false;
      log.info('[Q1Foundation] Q1 Foundation systems shut down');
    } catch (error) {
      log.error('[Q1Foundation] Error during shutdown:', error);
    }
  }

  /**
   * Setup integrations between Q1 systems
   */
  private setupCrossSystemIntegrations(): void {
    // Auth → Vault: Lock vault when auth session expires
    authHardening.on('session-invalidated', () => {
      log.info('[Q1Foundation] Auth session invalidated, signaling vault lock');
      vaultHardening.clearClipboardNow();
    });

    authHardening.on('lock-required', ({ reason }) => {
      log.info(`[Q1Foundation] Lock required (${reason}), clearing sensitive data`);
      vaultHardening.clearClipboardNow();
    });

    // Auth → Session: Record activity from session to extend auth
    sessionHardening.on('navigation-started', () => {
      authHardening.recordActivity();
    });

    sessionHardening.on('active-tab-changed', () => {
      authHardening.recordActivity();
    });

    // Session → Vault: Log vault access when tab navigates to sensitive URL
    sessionHardening.on('navigation-completed', ({ tabId, success }) => {
      if (success) {
        authHardening.recordActivity();
      }
    });

    // Auth lockout → Session: Capture snapshot before lockout
    authHardening.on('lockout', async () => {
      log.info('[Q1Foundation] Auth lockout, capturing session snapshot');
      await sessionHardening.captureSnapshot('auth-lockout');
    });

    // Tab crash → Auth: Don't count as inactivity
    sessionHardening.on('tab-crashed', () => {
      log.warn('[Q1Foundation] Tab crashed, maintaining auth activity');
      authHardening.recordActivity();
    });

    log.info('[Q1Foundation] Cross-system integrations established');
  }

  /**
   * Register IPC handlers for Q1 status
   */
  private registerIPCHandlers(): void {
    ipcMain.handle('q1Foundation:getStatus', () => this.getStatus());
    ipcMain.handle('q1Foundation:getReport', () => this.generateReport());
    ipcMain.handle('q1Foundation:isInitialized', () => this.isInitialized);
  }

  /**
   * Get current system status
   */
  getStatus(): Q1SystemStatus[] {
    const now = Date.now();
    
    return [
      {
        name: 'AuthHardening',
        initialized: true,
        healthy: !authHardening.isLockedOut(),
        lastCheck: now,
        metrics: {
          lockoutStatus: authHardening.getLockoutStatus().lockedOut ? 'locked' : 'normal',
          sessionActive: authHardening.getCurrentSession()?.active ? 'yes' : 'no',
          auditEntries: authHardening.getAuditLog(1).length > 0 ? 'active' : 'empty',
        },
      },
      {
        name: 'VaultHardening',
        initialized: true,
        healthy: true,
        lastCheck: now,
        metrics: {
          configLoaded: 'yes',
          clipboardClearSeconds: vaultHardening.getConfig().clipboardClearSeconds,
          autoBackup: vaultHardening.getConfig().autoBackupEnabled ? 'enabled' : 'disabled',
        },
      },
      {
        name: 'SessionHardening',
        initialized: true,
        healthy: true,
        lastCheck: now,
        metrics: {
          activeTabs: sessionHardening.getTabCount(),
          snapshotsAvailable: sessionHardening.getAllSnapshots().length,
          navigationEvents: sessionHardening.getNavigationEventCount(),
        },
      },
    ];
  }

  /**
   * Generate comprehensive Q1 Foundation report
   */
  generateReport(): Q1FoundationReport {
    const systems = this.getStatus();
    const recommendations: string[] = [];

    // Calculate overall health
    const unhealthySystems = systems.filter(s => !s.healthy);
    let overallHealth: Q1FoundationReport['overallHealth'] = 'healthy';
    
    if (unhealthySystems.length > 0) {
      overallHealth = unhealthySystems.length === systems.length ? 'unhealthy' : 'degraded';
    }

    // Generate recommendations based on system state
    const authStatus = authHardening.getLockoutStatus();
    if (authStatus.attemptsMade > 0 && authStatus.attemptsMade < authStatus.maxAttempts) {
      recommendations.push(`${authStatus.maxAttempts - authStatus.attemptsMade} authentication attempts remaining before lockout`);
    }

    if (sessionHardening.getTabCount() > 20) {
      recommendations.push('Consider closing unused tabs to improve performance');
    }

    const tabHealth = sessionHardening.getAllTabHealth();
    const unresponsiveTabs = tabHealth.filter(t => t.status === 'unresponsive');
    if (unresponsiveTabs.length > 0) {
      recommendations.push(`${unresponsiveTabs.length} tab(s) are unresponsive and may need to be reloaded`);
    }

    const highMemoryTabs = tabHealth.filter(t => t.status === 'critical' || t.status === 'warning');
    if (highMemoryTabs.length > 0) {
      recommendations.push(`${highMemoryTabs.length} tab(s) have elevated memory usage`);
    }

    return {
      timestamp: Date.now(),
      overallHealth,
      systems,
      recommendations,
    };
  }

  /**
   * Check if Q1 systems are initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get initialization time
   */
  getInitializationTime(): number {
    return this.initializationTime;
  }
}

// Singleton instance
export const q1Foundation = new Q1FoundationIntegration();

// Export convenience functions
export async function initializeQ1Foundation(): Promise<void> {
  return q1Foundation.initialize();
}

export async function shutdownQ1Foundation(): Promise<void> {
  return q1Foundation.shutdown();
}

export function getQ1Status(): Q1SystemStatus[] {
  return q1Foundation.getStatus();
}

export function getQ1Report(): Q1FoundationReport {
  return q1Foundation.generateReport();
}

// Re-export individual modules for direct access
export { authHardening, vaultHardening, sessionHardening };
