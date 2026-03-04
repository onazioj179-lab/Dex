// ===========================================================================
// DEX - NEXT-GEN OS-LEVEL INTEGRATION
// ===========================================================================
// Integrates all 12 Next-Gen OS-Level systems into a unified architecture.
// This is the orchestration layer that ensures all systems work together.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app } from 'electron';
import log from 'electron-log';

// Import all 12 systems
import {
  intentSessionManager,
  initializeIntentSessions,
  shutdownIntentSessions,
} from './IntentSessionManager';

import {
  usageAwareFileSystem,
  initializeUsageAwareFileSystem,
  shutdownUsageAwareFileSystem,
} from './UsageAwareFileSystem';

import {
  trustworthySearch,
  initializeTrustworthySearch,
  shutdownTrustworthySearch,
} from './TrustworthySearch';

import {
  systemUndoManager,
  initializeSystemUndo,
  shutdownSystemUndo,
} from './SystemUndoManager';

import {
  humanCenteredAutomation,
  initializeHumanCenteredAutomation,
  shutdownHumanCenteredAutomation,
} from '../automation/HumanCenteredAutomation';

import {
  localLearningEngine,
  initializeLocalLearning,
  shutdownLocalLearning,
} from './LocalLearningEngine';

import {
  sessionContinuityManager,
  initializeSessionContinuity,
  shutdownSessionContinuity,
} from './SessionContinuityManager';

import {
  securityContinuumManager,
  initializeSecurityContinuum,
  shutdownSecurityContinuum,
} from '../security/SecurityContinuumManager';

import {
  identityVaultManager,
  initializeIdentityVault,
  shutdownIdentityVault,
} from '../security/IdentityVaultManager';

import {
  mediaWorkManager,
  initializeMediaWork,
  shutdownMediaWork,
} from './MediaWorkManager';

import {
  idleDisciplineManager,
  initializeIdleDiscipline,
  shutdownIdleDiscipline,
} from './IdleDisciplineManager';

import {
  mentalModelManager,
  initializeMentalModel,
  shutdownMentalModel,
} from './MentalModelManager';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SystemStatus {
  id: string;
  name: string;
  initialized: boolean;
  error?: string;
}

export interface NextGenConfig {
  // System 1: Intent Sessions
  intentSessions: {
    enabled: boolean;
  };
  
  // System 2: File System
  fileSystem: {
    enabled: boolean;
    trackingEnabled: boolean;
  };
  
  // System 3: Search
  search: {
    enabled: boolean;
    maxResults: number;
  };
  
  // System 4: Undo
  undo: {
    enabled: boolean;
    maxOperations: number;
  };
  
  // System 5: Automation
  automation: {
    enabled: boolean;
    requireConfirmation: boolean;
  };
  
  // System 6: Learning
  learning: {
    enabled: boolean;
    retentionDays: number;
  };
  
  // System 7: Session Continuity
  sessionContinuity: {
    enabled: boolean;
    autoSaveInterval: number;
  };
  
  // System 8: Security
  security: {
    enabled: boolean;
    autoLockOnSwitch: boolean;
  };
  
  // System 9: Identity Vault
  vault: {
    enabled: boolean;
    clipboardClearTimeout: number;
  };
  
  // System 10: Media
  media: {
    enabled: boolean;
    screenshotFormat: 'png' | 'jpg';
  };
  
  // System 11: Idle Discipline
  idleDiscipline: {
    enabled: boolean;
    lightIdleTimeout: number;
    aggressiveIdleTimeout: number;
  };
  
  // System 12: Mental Model
  mentalModel: {
    enabled: boolean;
    trackChanges: boolean;
  };
}

// ===========================================================================
// NEXT-GEN INTEGRATION MANAGER
// ===========================================================================

class NextGenIntegrationClass extends EventEmitter {
  private systemStatuses: Map<string, SystemStatus> = new Map();
  private isInitialized: boolean = false;
  private initializationOrder: string[] = [
    'mental-model',       // First: Mental model for visibility
    'intent-sessions',    // Second: Foundation for all context
    'file-system',        // Third: File tracking
    'search',             // Fourth: Depends on file system
    'undo',               // Fifth: Safety net
    'learning',           // Sixth: Pattern detection
    'session-continuity', // Seventh: State persistence
    'security',           // Eighth: Security layer
    'vault',              // Ninth: Depends on security
    'automation',         // Tenth: Depends on intent, learning
    'media',              // Eleventh: Media capture
    'idle-discipline',    // Last: Performance management
  ];

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info('[NextGen] Starting Next-Gen OS-Level systems initialization...');
    const startTime = Date.now();

    // Initialize systems in order
    for (const systemId of this.initializationOrder) {
      await this.initializeSystem(systemId);
    }

    // Wire up cross-system integrations
    this.setupIntegrations();
    
    // Register IPC handlers
    this.registerIPCHandlers();

    const duration = Date.now() - startTime;
    log.info(`[NextGen] All systems initialized in ${duration}ms`);

    this.isInitialized = true;
    this.emit('initialized');
  }

  private async initializeSystem(systemId: string): Promise<void> {
    const startTime = Date.now();
    let status: SystemStatus;

    try {
      switch (systemId) {
        case 'mental-model':
          await initializeMentalModel();
          status = { id: systemId, name: 'Mental Model', initialized: true };
          break;

        case 'intent-sessions':
          await initializeIntentSessions();
          status = { id: systemId, name: 'Intent Sessions', initialized: true };
          break;

        case 'file-system':
          await initializeUsageAwareFileSystem();
          status = { id: systemId, name: 'Usage-Aware File System', initialized: true };
          break;

        case 'search':
          await initializeTrustworthySearch();
          status = { id: systemId, name: 'Trustworthy Search', initialized: true };
          break;

        case 'undo':
          await initializeSystemUndo();
          status = { id: systemId, name: 'System Undo', initialized: true };
          break;

        case 'automation':
          await initializeHumanCenteredAutomation();
          status = { id: systemId, name: 'Human-Centered Automation', initialized: true };
          break;

        case 'learning':
          await initializeLocalLearning();
          status = { id: systemId, name: 'Local Learning', initialized: true };
          break;

        case 'session-continuity':
          await initializeSessionContinuity();
          status = { id: systemId, name: 'Session Continuity', initialized: true };
          break;

        case 'security':
          await initializeSecurityContinuum();
          status = { id: systemId, name: 'Security Continuum', initialized: true };
          break;

        case 'vault':
          await initializeIdentityVault();
          status = { id: systemId, name: 'Identity Vault', initialized: true };
          break;

        case 'media':
          await initializeMediaWork();
          status = { id: systemId, name: 'Media Work', initialized: true };
          break;

        case 'idle-discipline':
          await initializeIdleDiscipline();
          status = { id: systemId, name: 'Idle Discipline', initialized: true };
          break;

        default:
          throw new Error(`Unknown system: ${systemId}`);
      }

      const duration = Date.now() - startTime;
      log.info(`[NextGen] System "${status.name}" initialized in ${duration}ms`);

    } catch (error) {
      log.error(`[NextGen] Failed to initialize system "${systemId}":`, error);
      status = {
        id: systemId,
        name: systemId,
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.systemStatuses.set(systemId, status);
    this.emit('system-initialized', status);
  }

  // -------------------------------------------------------------------------
  // CROSS-SYSTEM INTEGRATIONS
  // -------------------------------------------------------------------------

  private setupIntegrations(): void {
    // Intent → Mental Model: Update mental model on intent changes
    intentSessionManager.on('intent-activated', (intent) => {
      mentalModelManager.updateSystemState('intent-sessions', {
        lastActivity: {
          timestamp: Date.now(),
          description: `Activated intent: ${intent.name}`,
        },
      }, 'user', 'Intent activated');
    });

    // Intent → Security: Lock on intent switch
    intentSessionManager.on('intent-switched', (from, to) => {
      securityContinuumManager.emit('intent-switched', from, to);
    });

    // File System → Search: Index file access patterns
    usageAwareFileSystem.on('file-accessed', (filePath) => {
      trustworthySearch.emit('file-accessed', filePath);
    });

    // Learning → Automation: Suggest rules from patterns
    localLearningEngine.on('pattern-detected', (pattern) => {
      humanCenteredAutomation.emit('pattern-available', pattern);
    });

    // Security → Vault: Lock vault when trust drops
    securityContinuumManager.on('trust-level-changed', (level) => {
      if (level === 'public' || level === 'basic') {
        identityVaultManager.emit('should-lock');
      }
      mentalModelManager.updateSystemState('security', {
        metrics: {
          trustLevel: { value: level, label: 'Current Trust Level' },
        },
      }, 'system', 'Trust level changed');
    });

    // Vault → Mental Model: Update vault status
    identityVaultManager.on('vault-unlocked', () => {
      mentalModelManager.updateSystemState('vault', {
        status: 'active',
        statusReason: undefined,
        metrics: {
          isUnlocked: { value: true, label: 'Vault Unlocked' },
        },
      }, 'user', 'Vault unlocked');
    });

    identityVaultManager.on('vault-locked', () => {
      mentalModelManager.updateSystemState('vault', {
        status: 'idle',
        statusReason: 'Vault locked',
        metrics: {
          isUnlocked: { value: false, label: 'Vault Unlocked' },
        },
      }, 'system', 'Vault locked');
    });

    // Idle → All Systems: Pause non-essential on idle
    idleDisciplineManager.on('idle-mode-changed', (mode) => {
      mentalModelManager.updateSystemState('health', {
        metrics: {
          idleMode: { value: mode, label: 'Current Mode' },
        },
      }, 'system', `Idle mode: ${mode}`);

      if (mode === 'aggressive-idle' || mode === 'deep-sleep') {
        // Pause learning analysis
        localLearningEngine.emit('pause-analysis');
        // Pause media background tasks
        mediaWorkManager.emit('pause-background');
      }
    });

    // Session Continuity → Intent: Include intent in session
    sessionContinuityManager.on('session-saving', (snapshot) => {
      const currentIntent = intentSessionManager.getActiveIntent();
      if (currentIntent) {
        snapshot.intentId = currentIntent.id;
      }
    });

    // Undo → Mental Model: Track undo operations
    systemUndoManager.on('operation-recorded', () => {
      mentalModelManager.updateSystemState('undo', {
        lastActivity: {
          timestamp: Date.now(),
          description: 'Operation recorded',
        },
      }, 'system');
    });

    // Automation → Undo: Record automation operations
    humanCenteredAutomation.on('execution-completed', (execution) => {
      systemUndoManager.emit('automation-completed', execution);
    });

    // Media → Intent: Attach media to current intent
    mediaWorkManager.on('artifact-captured', (artifact) => {
      const currentIntent = intentSessionManager.getActiveIntent();
      if (currentIntent) {
        intentSessionManager.emit('attach-artifact', currentIntent.id, artifact);
      }
    });

    log.info('[NextGen] Cross-system integrations configured');
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    log.info('[NextGen] Shutting down Next-Gen OS-Level systems...');

    // Shutdown in reverse order
    const reverseOrder = [...this.initializationOrder].reverse();

    for (const systemId of reverseOrder) {
      await this.shutdownSystem(systemId);
    }

    this.systemStatuses.clear();
    this.isInitialized = false;
    this.removeAllListeners();

    log.info('[NextGen] All systems shut down');
  }

  private async shutdownSystem(systemId: string): Promise<void> {
    try {
      switch (systemId) {
        case 'mental-model':
          shutdownMentalModel();
          break;
        case 'intent-sessions':
          shutdownIntentSessions();
          break;
        case 'file-system':
          shutdownUsageAwareFileSystem();
          break;
        case 'search':
          shutdownTrustworthySearch();
          break;
        case 'undo':
          shutdownSystemUndo();
          break;
        case 'automation':
          shutdownHumanCenteredAutomation();
          break;
        case 'learning':
          shutdownLocalLearning();
          break;
        case 'session-continuity':
          shutdownSessionContinuity();
          break;
        case 'security':
          shutdownSecurityContinuum();
          break;
        case 'vault':
          shutdownIdentityVault();
          break;
        case 'media':
          shutdownMediaWork();
          break;
        case 'idle-discipline':
          shutdownIdleDiscipline();
          break;
      }
      log.info(`[NextGen] System "${systemId}" shut down`);
    } catch (error) {
      log.error(`[NextGen] Error shutting down "${systemId}":`, error);
    }
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get all system statuses
   */
  getSystemStatuses(): SystemStatus[] {
    return Array.from(this.systemStatuses.values());
  }

  /**
   * Check if all systems are healthy
   */
  isHealthy(): boolean {
    for (const status of this.systemStatuses.values()) {
      if (!status.initialized || status.error) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get initialization status
   */
  getInitializationStatus(): {
    isInitialized: boolean;
    totalSystems: number;
    initializedSystems: number;
    failedSystems: number;
    systems: SystemStatus[];
  } {
    const systems = Array.from(this.systemStatuses.values());
    return {
      isInitialized: this.isInitialized,
      totalSystems: this.initializationOrder.length,
      initializedSystems: systems.filter(s => s.initialized).length,
      failedSystems: systems.filter(s => !s.initialized).length,
      systems,
    };
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    ipcMain.handle('nextgen:getStatus', () => this.getInitializationStatus());
    ipcMain.handle('nextgen:isHealthy', () => this.isHealthy());
    ipcMain.handle('nextgen:getSystems', () => this.getSystemStatuses());
  }
}

// Singleton instance
export const nextGenIntegration = new NextGenIntegrationClass();

export async function initializeNextGen(): Promise<void> {
  return nextGenIntegration.initialize();
}

export async function shutdownNextGen(): Promise<void> {
  return nextGenIntegration.shutdown();
}

// ===========================================================================
// CONVENIENT RE-EXPORTS
// ===========================================================================

export {
  intentSessionManager,
  usageAwareFileSystem,
  trustworthySearch,
  systemUndoManager,
  humanCenteredAutomation,
  localLearningEngine,
  sessionContinuityManager,
  securityContinuumManager,
  identityVaultManager,
  mediaWorkManager,
  idleDisciplineManager,
  mentalModelManager,
};
