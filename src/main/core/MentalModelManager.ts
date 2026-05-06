// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - SYSTEM 12: Mental Model Consistency (UNIFIED)
// ===========================================================================
// The user's mental model of Dex must be accurate. Dex should not have
// "hidden states" or confusing behaviors. Every system behaves predictably.
// If something changes, the user knows why. Expose internals clearly.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SystemState {
  id: string;
  name: string;
  description: string;
  
  // Current state
  status: 'active' | 'idle' | 'paused' | 'error' | 'disabled';
  statusReason?: string;
  
  // Key metrics
  metrics: Record<string, {
    value: number | string | boolean;
    label: string;
    unit?: string;
  }>;
  
  // Recent activity
  lastActivity?: {
    timestamp: number;
    description: string;
  };
  
  // Relationships
  dependencies: string[];
  dependents: string[];
  
  // User control
  canDisable: boolean;
  canReset: boolean;
}

export interface StateChange {
  id: string;
  timestamp: number;
  
  // What changed
  systemId: string;
  systemName: string;
  changeType: 'status' | 'metric' | 'config' | 'data';
  
  // Change details
  description: string;
  previousValue?: any;
  newValue?: any;
  
  // Why it changed
  trigger: 'user' | 'automation' | 'schedule' | 'system' | 'error';
  triggerDetail?: string;
  
  // Impact
  impact: 'none' | 'low' | 'medium' | 'high';
  affectedSystems: string[];
}

export interface Explanation {
  question: string;
  answer: string;
  context?: string;
  relatedSystems: string[];
  learnMore?: string;
}

export interface BehaviorRule {
  id: string;
  name: string;
  description: string;
  
  // When this applies
  condition: string;
  
  // What happens
  behavior: string;
  
  // User expectations
  userVisible: boolean;
  userControllable: boolean;
}

export interface ConsistencyCheck {
  id: string;
  timestamp: number;
  
  // What was checked
  area: string;
  description: string;
  
  // Result
  passed: boolean;
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    description: string;
    resolution?: string;
  }>;
}

// ===========================================================================
// MENTAL MODEL MANAGER
// ===========================================================================

class MentalModelManagerClass extends EventEmitter {
  private systems: Map<string, SystemState> = new Map();
  private stateChanges: StateChange[] = [];
  private behaviorRules: Map<string, BehaviorRule> = new Map();
  private dataPath: string;
  private isInitialized: boolean = false;
  
  // Change history limits
  private readonly MAX_STATE_CHANGES = 500;
  private readonly MAX_CHANGES_PER_SYSTEM = 50;

  constructor() {
    super();
    this.dataPath = path.join(app.getPath('userData'), 'mental-model');
    this.setMaxListeners(20);
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ensureDirectories();
    this.registerCoreSystems();
    this.registerBehaviorRules();
    this.registerIPCHandlers();

    this.isInitialized = true;
    log.info('[MentalModel] Mental model manager initialized');
  }

  shutdown(): void {
    this.saveData();
    this.removeAllListeners();
    log.info('[MentalModel] Mental model manager shut down');
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private registerCoreSystems(): void {
    // Register all core systems for visibility
    this.registerSystem({
      id: 'intent-sessions',
      name: 'Intent Sessions',
      description: 'Manages your work contexts and what you\'re trying to accomplish',
      status: 'active',
      metrics: {
        activeSessions: { value: 0, label: 'Active Sessions' },
        totalSessions: { value: 0, label: 'Total Sessions' },
      },
      dependencies: [],
      dependents: ['search', 'automation', 'learning'],
      canDisable: false,
      canReset: true,
    });

    this.registerSystem({
      id: 'file-system',
      name: 'Usage-Aware File System',
      description: 'Tracks how you use files to provide smart suggestions',
      status: 'active',
      metrics: {
        trackedFiles: { value: 0, label: 'Tracked Files' },
        relationships: { value: 0, label: 'File Relationships' },
      },
      dependencies: [],
      dependents: ['search', 'suggestions'],
      canDisable: true,
      canReset: true,
    });

    this.registerSystem({
      id: 'search',
      name: 'Trustworthy Search',
      description: 'Finds files and content with explainable ranking',
      status: 'active',
      metrics: {
        indexedItems: { value: 0, label: 'Indexed Items' },
        searchHistory: { value: 0, label: 'Search History' },
      },
      dependencies: ['file-system', 'intent-sessions'],
      dependents: [],
      canDisable: false,
      canReset: true,
    });

    this.registerSystem({
      id: 'undo',
      name: 'System Undo',
      description: 'Tracks operations so you can undo mistakes',
      status: 'active',
      metrics: {
        undoableOps: { value: 0, label: 'Undoable Operations' },
        checkpoints: { value: 0, label: 'Checkpoints' },
      },
      dependencies: [],
      dependents: [],
      canDisable: false,
      canReset: true,
    });

    this.registerSystem({
      id: 'automation',
      name: 'Human-Centered Automation',
      description: 'Runs automations with your approval and oversight',
      status: 'active',
      metrics: {
        activeRules: { value: 0, label: 'Active Rules' },
        totalRuns: { value: 0, label: 'Total Runs' },
      },
      dependencies: ['intent-sessions'],
      dependents: [],
      canDisable: true,
      canReset: true,
    });

    this.registerSystem({
      id: 'learning',
      name: 'Local Learning',
      description: 'Learns your patterns locally--never sent to cloud',
      status: 'active',
      metrics: {
        patterns: { value: 0, label: 'Learned Patterns' },
        enabled: { value: true, label: 'Learning Enabled' },
      },
      dependencies: ['intent-sessions'],
      dependents: ['suggestions'],
      canDisable: true,
      canReset: true,
    });

    this.registerSystem({
      id: 'session-continuity',
      name: 'Session Continuity',
      description: 'Saves and restores your complete workspace state',
      status: 'active',
      metrics: {
        snapshots: { value: 0, label: 'Saved Snapshots' },
        unsavedChanges: { value: 0, label: 'Unsaved Changes Tracked' },
      },
      dependencies: [],
      dependents: [],
      canDisable: true,
      canReset: true,
    });

    this.registerSystem({
      id: 'security',
      name: 'Security Continuum',
      description: 'Manages trust levels and access to sensitive data',
      status: 'active',
      metrics: {
        trustLevel: { value: 'public', label: 'Current Trust Level' },
        activeLocks: { value: 0, label: 'Active Locks' },
      },
      dependencies: [],
      dependents: ['vault'],
      canDisable: false,
      canReset: false,
    });

    this.registerSystem({
      id: 'vault',
      name: 'Identity Vault',
      description: 'Securely stores passwords and credentials locally',
      status: 'idle',
      statusReason: 'Vault locked',
      metrics: {
        credentials: { value: 0, label: 'Stored Credentials' },
        isUnlocked: { value: false, label: 'Vault Unlocked' },
      },
      dependencies: ['security'],
      dependents: [],
      canDisable: false,
      canReset: false,
    });

    this.registerSystem({
      id: 'media',
      name: 'Media as Work',
      description: 'Captures and organizes screenshots and recordings',
      status: 'active',
      metrics: {
        artifacts: { value: 0, label: 'Media Artifacts' },
        recording: { value: false, label: 'Currently Recording' },
      },
      dependencies: ['intent-sessions'],
      dependents: [],
      canDisable: true,
      canReset: true,
    });

    this.registerSystem({
      id: 'health',
      name: 'Idle Discipline',
      description: 'Monitors performance and saves resources when idle',
      status: 'active',
      metrics: {
        idleMode: { value: 'active', label: 'Current Mode' },
        memoryUsage: { value: '0 MB', label: 'Memory Usage' },
      },
      dependencies: [],
      dependents: [],
      canDisable: false,
      canReset: false,
    });
  }

  private registerBehaviorRules(): void {
    // Document predictable behaviors
    this.addBehaviorRule({
      name: 'Files are never moved automatically',
      description: 'Dex will suggest file organization but never move files without your explicit action',
      condition: 'Always',
      behavior: 'File suggestions are shown; user must confirm any moves',
      userVisible: true,
      userControllable: false,
    });

    this.addBehaviorRule({
      name: 'Automations require confirmation',
      description: 'Automations show a preview before running and require your confirmation',
      condition: 'When automation is triggered',
      behavior: 'Preview shown, user confirms or cancels',
      userVisible: true,
      userControllable: true,
    });

    this.addBehaviorRule({
      name: 'Search results are deterministic',
      description: 'The same search query will always produce the same results in the same order',
      condition: 'When searching',
      behavior: 'Results ordered by explainable score',
      userVisible: true,
      userControllable: false,
    });

    this.addBehaviorRule({
      name: 'Learning stays local',
      description: 'All learned patterns stay on your device--nothing is sent to any server',
      condition: 'Always',
      behavior: 'Data stored locally only',
      userVisible: true,
      userControllable: true,
    });

    this.addBehaviorRule({
      name: 'Auto-lock on intent switch',
      description: 'Sensitive data is re-locked when you switch between intents',
      condition: 'When switching intents with security enabled',
      behavior: 'Trust level lowered, sensitive locks reapplied',
      userVisible: true,
      userControllable: true,
    });

    this.addBehaviorRule({
      name: 'Clipboard auto-clear',
      description: 'Copied passwords are automatically cleared from clipboard after 60 seconds',
      condition: 'When copying sensitive data',
      behavior: 'Clipboard cleared after timeout',
      userVisible: true,
      userControllable: true,
    });

    this.addBehaviorRule({
      name: 'Idle mode activation',
      description: 'After 5 minutes of inactivity, Dex reduces resource usage',
      condition: 'No user activity for 5 minutes',
      behavior: 'Non-essential services paused, memory reclaimed',
      userVisible: true,
      userControllable: true,
    });

    this.addBehaviorRule({
      name: 'Session auto-save',
      description: 'Your workspace state is saved every 5 minutes',
      condition: 'Every 5 minutes while active',
      behavior: 'Session snapshot created',
      userVisible: true,
      userControllable: true,
    });
  }

  private saveData(): void {
    try {
      const changesPath = path.join(this.dataPath, 'state-changes.json');
      fs.writeFileSync(changesPath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        changes: this.stateChanges.slice(-this.MAX_STATE_CHANGES),
      }, null, 2));
    } catch (error) {
      log.error('[MentalModel] Failed to save data:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SYSTEM REGISTRATION
  // -------------------------------------------------------------------------

  /**
   * Register a system for visibility
   */
  registerSystem(system: SystemState): void {
    this.systems.set(system.id, system);
    this.emit('system-registered', system);
  }

  /**
   * Update system state
   */
  updateSystemState(
    systemId: string,
    updates: Partial<SystemState>,
    trigger: StateChange['trigger'] = 'system',
    triggerDetail?: string
  ): void {
    const system = this.systems.get(systemId);
    if (!system) return;

    const previousStatus = system.status;
    const previousMetrics = { ...system.metrics };

    // Apply updates
    Object.assign(system, updates);

    // Record state change
    if (updates.status && updates.status !== previousStatus) {
      this.recordStateChange({
        systemId,
        systemName: system.name,
        changeType: 'status',
        description: `Status changed from ${previousStatus} to ${updates.status}`,
        previousValue: previousStatus,
        newValue: updates.status,
        trigger,
        triggerDetail,
        impact: this.assessImpact(system, 'status'),
        affectedSystems: system.dependents,
      });
    }

    if (updates.metrics) {
      for (const [key, metric] of Object.entries(updates.metrics)) {
        const previous = previousMetrics[key];
        if (!previous || previous.value !== metric.value) {
          this.recordStateChange({
            systemId,
            systemName: system.name,
            changeType: 'metric',
            description: `${metric.label} changed`,
            previousValue: previous?.value,
            newValue: metric.value,
            trigger,
            triggerDetail,
            impact: 'low',
            affectedSystems: [],
          });
        }
      }
    }

    this.emit('system-updated', system);
  }

  private assessImpact(system: SystemState, changeType: string): StateChange['impact'] {
    if (system.dependents.length > 3) return 'high';
    if (system.dependents.length > 0) return 'medium';
    if (changeType === 'status') return 'medium';
    return 'low';
  }

  private recordStateChange(params: Omit<StateChange, 'id' | 'timestamp'>): void {
    const change: StateChange = {
      ...params,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.stateChanges.push(change);

    // Trim old changes
    if (this.stateChanges.length > this.MAX_STATE_CHANGES) {
      this.stateChanges = this.stateChanges.slice(-this.MAX_STATE_CHANGES);
    }

    this.emit('state-changed', change);
  }

  // -------------------------------------------------------------------------
  // BEHAVIOR RULES
  // -------------------------------------------------------------------------

  private addBehaviorRule(rule: Omit<BehaviorRule, 'id'>): void {
    const fullRule: BehaviorRule = {
      ...rule,
      id: crypto.randomUUID(),
    };
    this.behaviorRules.set(fullRule.id, fullRule);
  }

  /**
   * Get all behavior rules
   */
  getBehaviorRules(): BehaviorRule[] {
    return Array.from(this.behaviorRules.values());
  }

  // -------------------------------------------------------------------------
  // EXPLANATIONS
  // -------------------------------------------------------------------------

  /**
   * Generate explanation for a question
   */
  generateExplanation(question: string): Explanation | null {
    const q = question.toLowerCase();

    // Why is X happening?
    if (q.includes('why') && q.includes('idle')) {
      return {
        question,
        answer: 'Dex enters idle mode after 5 minutes of no activity to save system resources. This reduces CPU and memory usage while you\'re away.',
        context: 'Idle mode helps keep your system fast and battery-efficient.',
        relatedSystems: ['health'],
        learnMore: 'You can adjust idle timing in Settings > Performance.',
      };
    }

    if (q.includes('why') && (q.includes('locked') || q.includes('lock'))) {
      return {
        question,
        answer: 'Sensitive data was locked because you switched to a different intent, which may have different security requirements.',
        context: 'Auto-locking protects your data when you change contexts.',
        relatedSystems: ['security', 'intent-sessions'],
        learnMore: 'You can disable auto-lock per intent in Intent Settings.',
      };
    }

    if (q.includes('search') && q.includes('order')) {
      return {
        question,
        answer: 'Search results are ranked by a deterministic score based on: exact match (100 points), title match (80), content match (50), recency (20), and frequency (15). You can see the breakdown for each result.',
        context: 'Deterministic search means the same query always gives the same results.',
        relatedSystems: ['search'],
        learnMore: 'Click "Explain" on any search result to see its score breakdown.',
      };
    }

    if (q.includes('learn') && (q.includes('pattern') || q.includes('data'))) {
      return {
        question,
        answer: 'Dex learns your patterns by observing file access, search queries, and work hours. ALL this data stays on your device. You can view, delete, or reset any learned patterns.',
        context: 'Local learning improves suggestions while protecting your privacy.',
        relatedSystems: ['learning'],
        learnMore: 'View learned patterns in Settings > Learning > View Patterns.',
      };
    }

    if (q.includes('automation') && q.includes('safe')) {
      return {
        question,
        answer: 'Automations are safe because: (1) They show a preview before running, (2) You must confirm each run, (3) They use dry-run mode by default, (4) You can pause or stop at any time.',
        context: 'Human-centered automation means you\'re always in control.',
        relatedSystems: ['automation'],
        learnMore: 'See all active automations in Automation > Manage Rules.',
      };
    }

    // Default: can't answer
    return null;
  }

  // -------------------------------------------------------------------------
  // CONSISTENCY CHECKS
  // -------------------------------------------------------------------------

  /**
   * Run consistency check
   */
  runConsistencyCheck(): ConsistencyCheck {
    const issues: ConsistencyCheck['issues'] = [];

    // Check system dependencies
    for (const system of this.systems.values()) {
      for (const depId of system.dependencies) {
        const dep = this.systems.get(depId);
        if (!dep) {
          issues.push({
            severity: 'error',
            description: `${system.name} depends on unknown system: ${depId}`,
          });
        } else if (dep.status === 'error' || dep.status === 'disabled') {
          issues.push({
            severity: 'warning',
            description: `${system.name} depends on ${dep.name} which is ${dep.status}`,
            resolution: `Check ${dep.name} status`,
          });
        }
      }
    }

    // Check for conflicting states
    const security = this.systems.get('security');
    const vault = this.systems.get('vault');
    
    if (vault?.status === 'active' && security?.metrics.trustLevel?.value === 'public') {
      issues.push({
        severity: 'warning',
        description: 'Vault appears unlocked but trust level is public',
        resolution: 'Re-authenticate to resolve',
      });
    }

    // Check learning vs patterns
    const learning = this.systems.get('learning');
    if (learning?.metrics.enabled?.value === false && 
        (learning?.metrics.patterns?.value as number) > 0) {
      issues.push({
        severity: 'info',
        description: 'Learning is disabled but patterns exist',
        resolution: 'Patterns won\'t update while learning is disabled',
      });
    }

    const check: ConsistencyCheck = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      area: 'Full system',
      description: 'Comprehensive consistency check',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };

    this.emit('consistency-check-completed', check);
    return check;
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get all systems
   */
  getAllSystems(): SystemState[] {
    return Array.from(this.systems.values());
  }

  /**
   * Get system by ID
   */
  getSystem(systemId: string): SystemState | null {
    return this.systems.get(systemId) || null;
  }

  /**
   * Get recent state changes
   */
  getStateChanges(options?: {
    systemId?: string;
    limit?: number;
    since?: number;
  }): StateChange[] {
    let changes = [...this.stateChanges];

    if (options?.systemId) {
      changes = changes.filter(c => c.systemId === options.systemId);
    }

    if (options?.since !== undefined) {
      changes = changes.filter(c => c.timestamp > options.since!);
    }

    changes.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      changes = changes.slice(0, options.limit);
    }

    return changes;
  }

  /**
   * Get system overview (for dashboard)
   */
  getSystemOverview(): {
    totalSystems: number;
    activeSystems: number;
    idleSystems: number;
    errorSystems: number;
    disabledSystems: number;
    recentChanges: number;
    lastCheck?: ConsistencyCheck;
  } {
    const systems = Array.from(this.systems.values());
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return {
      totalSystems: systems.length,
      activeSystems: systems.filter(s => s.status === 'active').length,
      idleSystems: systems.filter(s => s.status === 'idle').length,
      errorSystems: systems.filter(s => s.status === 'error').length,
      disabledSystems: systems.filter(s => s.status === 'disabled').length,
      recentChanges: this.stateChanges.filter(c => c.timestamp > oneDayAgo).length,
    };
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private registerIPCHandlers(): void {
    // Systems
    ipcMain.handle('mental:getAllSystems', () => this.getAllSystems());
    ipcMain.handle('mental:getSystem', (_, systemId) => this.getSystem(systemId));
    ipcMain.handle('mental:getSystemOverview', () => this.getSystemOverview());

    // State changes
    ipcMain.handle('mental:getStateChanges', (_, options) => this.getStateChanges(options));

    // Behavior rules
    ipcMain.handle('mental:getBehaviorRules', () => this.getBehaviorRules());

    // Explanations
    ipcMain.handle('mental:explain', (_, question) => this.generateExplanation(question));

    // Consistency
    ipcMain.handle('mental:runConsistencyCheck', () => this.runConsistencyCheck());

    // System updates (for other systems to report their state)
    ipcMain.handle('mental:updateSystem', (_, systemId, updates, trigger, detail) => {
      this.updateSystemState(systemId, updates, trigger, detail);
      return true;
    });
  }
}

// Singleton instance
export const mentalModelManager = new MentalModelManagerClass();

export async function initializeMentalModel(): Promise<void> {
  return mentalModelManager.initialize();
}

export function shutdownMentalModel(): void {
  mentalModelManager.shutdown();
}
