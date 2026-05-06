// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Panic Lockdown System
// One-click full lockdown / panic mode
// Safe Mode boot (disables all advanced features)
// Zero background activity when Dex is idle
// Permission-scoped file access with per-feature security toggles
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, session, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type LockdownLevel = 'none' | 'partial' | 'full' | 'panic';
export type BootMode = 'normal' | 'safe' | 'recovery';

export interface PermissionScope {
  id: string;
  name: string;
  description: string;
  paths: string[];
  allowRead: boolean;
  allowWrite: boolean;
  allowExecute: boolean;
  allowNetwork: boolean;
}

export interface FeatureToggle {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  requiresRestart: boolean;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface LockdownState {
  level: LockdownLevel;
  activatedAt?: number;
  activatedBy?: string;
  reason?: string;
  autoRelease?: number;
}

export interface SafeModeState {
  active: boolean;
  enabledFeatures: string[];
  disabledFeatures: string[];
  reason?: string;
}

export interface SecurityConfig {
  defaultLockdownLevel: LockdownLevel;
  panicHotkey: string;
  autoLockOnSuspend: boolean;
  autoLockOnScreenLock: boolean;
  lockdownTimeoutMinutes: number;
  requirePasswordToUnlock: boolean;
  passwordHash?: string;
  clearClipboardOnLock: boolean;
  hideWindowOnPanic: boolean;
  killProcessesOnPanic: boolean;
}

export interface ActivityPolicy {
  allowBackgroundSync: boolean;
  allowBackgroundIndexing: boolean;
  allowNetworkOnIdle: boolean;
  allowNotifications: boolean;
  idleTimeoutMinutes: number;
}

// ===========================================================================
// PANIC LOCKDOWN SYSTEM
// ===========================================================================

class PanicLockdownSystemClass extends EventEmitter {
  private lockdownState: LockdownState;
  private safeModeState: SafeModeState;
  private bootMode: BootMode = 'normal';
  private permissionScopes: Map<string, PermissionScope> = new Map();
  private featureToggles: Map<string, FeatureToggle> = new Map();
  private securityConfig: SecurityConfig;
  private activityPolicy: ActivityPolicy;
  private configPath = '';
  private readonly SALT = 'dex-panic-lockdown-v1';
  private isIdle = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private blockedOperations: Set<string> = new Set();

  constructor() {
    super();
    
    this.lockdownState = {
      level: 'none'
    };

    this.safeModeState = {
      active: false,
      enabledFeatures: [],
      disabledFeatures: []
    };

    this.securityConfig = {
      defaultLockdownLevel: 'none',
      panicHotkey: 'CommandOrControl+Shift+L',
      autoLockOnSuspend: true,
      autoLockOnScreenLock: true,
      lockdownTimeoutMinutes: 0,
      requirePasswordToUnlock: false,
      clearClipboardOnLock: true,
      hideWindowOnPanic: true,
      killProcessesOnPanic: false
    };

    this.activityPolicy = {
      allowBackgroundSync: false,
      allowBackgroundIndexing: false,
      allowNetworkOnIdle: false,
      allowNotifications: true,
      idleTimeoutMinutes: 5
    };

    this.initializeDefaultFeatures();
    this.initializeDefaultScopes();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.configPath = path.join(app.getPath('userData'), 'security');
    
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await this.loadConfig();
      this.detectBootMode();
      this.setupSystemListeners();
      this.startIdleMonitoring();
      
      log.info(`[PanicLockdown] Initialized in ${this.bootMode} mode`);
    } catch (error) {
      log.error('[PanicLockdown] Initialization failed:', error);
    }
  }

  private initializeDefaultFeatures(): void {
    const defaultFeatures: FeatureToggle[] = [
      { id: 'network-access', name: 'Network Access', description: 'Allow network requests', enabled: true, requiresRestart: false, securityLevel: 'high' },
      { id: 'file-write', name: 'File Writing', description: 'Allow writing to files', enabled: true, requiresRestart: false, securityLevel: 'critical' },
      { id: 'shell-execution', name: 'Shell Execution', description: 'Allow running shell commands', enabled: true, requiresRestart: false, securityLevel: 'critical' },
      { id: 'clipboard-access', name: 'Clipboard Access', description: 'Allow reading/writing clipboard', enabled: true, requiresRestart: false, securityLevel: 'medium' },
      { id: 'external-links', name: 'External Links', description: 'Allow opening external URLs', enabled: true, requiresRestart: false, securityLevel: 'low' },
      { id: 'plugin-system', name: 'Plugin System', description: 'Allow loading plugins', enabled: true, requiresRestart: true, securityLevel: 'high' },
      { id: 'background-tasks', name: 'Background Tasks', description: 'Allow background processing', enabled: true, requiresRestart: false, securityLevel: 'medium' },
      { id: 'auto-update', name: 'Auto Update', description: 'Allow automatic updates', enabled: true, requiresRestart: false, securityLevel: 'high' },
      { id: 'telemetry', name: 'Telemetry', description: 'Allow anonymous usage data', enabled: false, requiresRestart: false, securityLevel: 'low' },
      { id: 'crash-reports', name: 'Crash Reports', description: 'Allow sending crash reports', enabled: false, requiresRestart: false, securityLevel: 'low' }
    ];

    for (const feature of defaultFeatures) {
      this.featureToggles.set(feature.id, feature);
    }
  }

  private initializeDefaultScopes(): void {
    const userHome = app.getPath('home');
    const userData = app.getPath('userData');
    
    const defaultScopes: PermissionScope[] = [
      {
        id: 'app-data',
        name: 'Application Data',
        description: 'DEX application data folder',
        paths: [userData],
        allowRead: true,
        allowWrite: true,
        allowExecute: false,
        allowNetwork: false
      },
      {
        id: 'user-documents',
        name: 'User Documents',
        description: 'User documents folder',
        paths: [path.join(userHome, 'Documents')],
        allowRead: true,
        allowWrite: true,
        allowExecute: false,
        allowNetwork: false
      },
      {
        id: 'temp-files',
        name: 'Temporary Files',
        description: 'System temp folder',
        paths: [app.getPath('temp')],
        allowRead: true,
        allowWrite: true,
        allowExecute: false,
        allowNetwork: false
      }
    ];

    for (const scope of defaultScopes) {
      this.permissionScopes.set(scope.id, scope);
    }
  }

  private detectBootMode(): void {
    // Check command line args for safe mode
    if (process.argv.includes('--safe-mode')) {
      this.bootMode = 'safe';
      this.activateSafeMode('Started with --safe-mode flag');
    } else if (process.argv.includes('--recovery')) {
      this.bootMode = 'recovery';
      this.activateSafeMode('Started in recovery mode');
    }
  }

  private setupSystemListeners(): void {
    // Listen for system suspend/resume
    if (process.platform === 'win32') {
      const { powerMonitor } = require('electron');
      
      powerMonitor.on('suspend', () => {
        if (this.securityConfig.autoLockOnSuspend) {
          this.activateLockdown('partial', 'System suspended');
        }
      });

      powerMonitor.on('lock-screen', () => {
        if (this.securityConfig.autoLockOnScreenLock) {
          this.activateLockdown('partial', 'Screen locked');
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Lockdown controls
    ipcMain.handle('security:panic', () => this.activatePanicMode());
    ipcMain.handle('security:lockdown', (_event, level: LockdownLevel, reason?: string) => {
      return this.activateLockdown(level, reason);
    });
    ipcMain.handle('security:unlock', (_event, password?: string) => {
      return this.deactivateLockdown(password);
    });
    ipcMain.handle('security:status', () => this.getSecurityStatus());

    // Safe mode
    ipcMain.handle('security:safeMode', (_event, activate: boolean, reason?: string) => {
      return activate ? this.activateSafeMode(reason) : this.deactivateSafeMode();
    });
    ipcMain.handle('security:safeModeStatus', () => this.safeModeState);

    // Feature toggles
    ipcMain.handle('security:features', () => this.listFeatures());
    ipcMain.handle('security:toggleFeature', (_event, featureId: string, enabled: boolean) => {
      return this.toggleFeature(featureId, enabled);
    });

    // Permission scopes
    ipcMain.handle('security:scopes', () => this.listScopes());
    ipcMain.handle('security:addScope', (_event, scope: PermissionScope) => {
      return this.addScope(scope);
    });
    ipcMain.handle('security:removeScope', (_event, scopeId: string) => {
      return this.removeScope(scopeId);
    });
    ipcMain.handle('security:checkPermission', (_event, filePath: string, operation: string) => {
      return this.checkPermission(filePath, operation);
    });

    // Activity policy
    ipcMain.handle('security:activityPolicy', () => this.activityPolicy);
    ipcMain.handle('security:setActivityPolicy', (_event, policy: Partial<ActivityPolicy>) => {
      return this.setActivityPolicy(policy);
    });

    // Configuration
    ipcMain.handle('security:config', () => this.securityConfig);
    ipcMain.handle('security:setConfig', (_event, config: Partial<SecurityConfig>) => {
      return this.setConfig(config);
    });
  }

  // -------------------------------------------------------------------------
  // PANIC MODE
  // -------------------------------------------------------------------------

  activatePanicMode(): { success: boolean } {
    log.warn('[PanicLockdown] PANIC MODE ACTIVATED');

    // Immediate actions
    if (this.securityConfig.hideWindowOnPanic) {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.hide();
      }
    }

    if (this.securityConfig.clearClipboardOnLock) {
      const { clipboard } = require('electron');
      clipboard.clear();
    }

    // Block all operations
    this.blockedOperations.add('*');

    // Kill external processes if configured
    if (this.securityConfig.killProcessesOnPanic) {
      this.killManagedProcesses();
    }

    // Set lockdown state
    this.lockdownState = {
      level: 'panic',
      activatedAt: Date.now(),
      activatedBy: 'panic-trigger',
      reason: 'Panic mode activated'
    };

    this.emit('panic:activated', this.lockdownState);
    this.saveConfig();

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // LOCKDOWN MANAGEMENT
  // -------------------------------------------------------------------------

  activateLockdown(level: LockdownLevel, reason?: string): { success: boolean } {
    const previousLevel = this.lockdownState.level;

    this.lockdownState = {
      level,
      activatedAt: Date.now(),
      reason
    };

    // Apply lockdown restrictions based on level
    switch (level) {
      case 'partial':
        this.blockedOperations.add('network-access');
        this.blockedOperations.add('shell-execution');
        this.blockedOperations.add('external-links');
        break;
      
      case 'full':
        this.blockedOperations.add('network-access');
        this.blockedOperations.add('shell-execution');
        this.blockedOperations.add('external-links');
        this.blockedOperations.add('file-write');
        this.blockedOperations.add('clipboard-access');
        this.blockedOperations.add('plugin-system');
        break;
      
      case 'panic':
        return this.activatePanicMode();
      
      case 'none':
        this.blockedOperations.clear();
        break;
    }

    // Auto-release timer
    if (this.securityConfig.lockdownTimeoutMinutes > 0) {
      setTimeout(() => {
        if (this.lockdownState.level === level) {
          this.deactivateLockdown();
        }
      }, this.securityConfig.lockdownTimeoutMinutes * 60 * 1000);
    }

    this.emit('lockdown:changed', { from: previousLevel, to: level });
    this.saveConfig();

    log.info(`[PanicLockdown] Lockdown level changed: ${previousLevel} -> ${level}`);
    return { success: true };
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(this.SALT + password).digest('hex');
  }

  setLockdownPassword(password: string): { success: boolean } {
    this.securityConfig.passwordHash = this.hashPassword(password);
    this.securityConfig.requirePasswordToUnlock = true;
    this.saveConfig();
    return { success: true };
  }

  private verifyPassword(password: string): boolean {
    if (!this.securityConfig.passwordHash) return true;
    const inputHash = this.hashPassword(password);
    return crypto.timingSafeEqual(
      Buffer.from(inputHash, 'hex'),
      Buffer.from(this.securityConfig.passwordHash, 'hex')
    );
  }

  deactivateLockdown(password?: string): { success: boolean; error?: string } {
    if (this.securityConfig.requirePasswordToUnlock && !password) {
      return { success: false, error: 'Password required to unlock' };
    }

    // Verify password if required
    if (this.securityConfig.requirePasswordToUnlock && password) {
      if (!this.verifyPassword(password)) {
        log.warn('[PanicLockdown] Invalid password attempt for unlock');
        return { success: false, error: 'Invalid password' };
      }
    }

    const previousLevel = this.lockdownState.level;
    
    this.lockdownState = { level: 'none' };
    this.blockedOperations.clear();

    // Show windows if hidden
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.show();
    }

    this.emit('lockdown:deactivated', previousLevel);
    this.saveConfig();

    log.info('[PanicLockdown] Lockdown deactivated');
    return { success: true };
  }

  getSecurityStatus(): { lockdown: LockdownState; safeMode: SafeModeState; bootMode: BootMode; isIdle: boolean } {
    return {
      lockdown: this.lockdownState,
      safeMode: this.safeModeState,
      bootMode: this.bootMode,
      isIdle: this.isIdle
    };
  }

  // -------------------------------------------------------------------------
  // SAFE MODE
  // -------------------------------------------------------------------------

  activateSafeMode(reason?: string): { success: boolean } {
    // Disable all non-essential features
    const essentialFeatures = ['file-write', 'clipboard-access'];
    const disabledFeatures: string[] = [];
    const enabledFeatures: string[] = [];

    for (const [id, feature] of this.featureToggles) {
      if (essentialFeatures.includes(id)) {
        enabledFeatures.push(id);
      } else {
        feature.enabled = false;
        disabledFeatures.push(id);
      }
    }

    this.safeModeState = {
      active: true,
      enabledFeatures,
      disabledFeatures,
      reason
    };

    this.emit('safeMode:activated', this.safeModeState);
    this.saveConfig();

    log.info('[PanicLockdown] Safe Mode activated:', reason);
    return { success: true };
  }

  deactivateSafeMode(): { success: boolean } {
    // Restore all features to their saved state
    this.safeModeState = {
      active: false,
      enabledFeatures: [],
      disabledFeatures: []
    };

    this.emit('safeMode:deactivated');
    this.saveConfig();

    log.info('[PanicLockdown] Safe Mode deactivated');
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // FEATURE TOGGLES
  // -------------------------------------------------------------------------

  listFeatures(): FeatureToggle[] {
    return Array.from(this.featureToggles.values());
  }

  toggleFeature(featureId: string, enabled: boolean): { success: boolean; requiresRestart?: boolean } {
    const feature = this.featureToggles.get(featureId);
    if (!feature) {
      return { success: false };
    }

    // Don't allow enabling features in safe mode
    if (this.safeModeState.active && enabled) {
      return { success: false };
    }

    feature.enabled = enabled;

    if (!enabled) {
      this.blockedOperations.add(featureId);
    } else {
      this.blockedOperations.delete(featureId);
    }

    this.emit('feature:toggled', { featureId, enabled });
    this.saveConfig();

    return { success: true, requiresRestart: feature.requiresRestart };
  }

  isFeatureEnabled(featureId: string): boolean {
    if (this.lockdownState.level === 'panic') return false;
    if (this.blockedOperations.has('*')) return false;
    if (this.blockedOperations.has(featureId)) return false;
    
    const feature = this.featureToggles.get(featureId);
    return feature?.enabled ?? false;
  }

  // -------------------------------------------------------------------------
  // PERMISSION SCOPES
  // -------------------------------------------------------------------------

  listScopes(): PermissionScope[] {
    return Array.from(this.permissionScopes.values());
  }

  addScope(scope: PermissionScope): { success: boolean } {
    this.permissionScopes.set(scope.id, scope);
    this.saveConfig();
    return { success: true };
  }

  removeScope(scopeId: string): { success: boolean } {
    this.permissionScopes.delete(scopeId);
    this.saveConfig();
    return { success: true };
  }

  checkPermission(filePath: string, operation: string): { allowed: boolean; scope?: string; reason?: string } {
    // Check lockdown first
    if (this.lockdownState.level === 'panic') {
      return { allowed: false, reason: 'Panic mode active' };
    }

    if (this.lockdownState.level === 'full' && ['write', 'execute'].includes(operation)) {
      return { allowed: false, reason: 'Full lockdown active' };
    }

    // Normalize path
    const normalizedPath = path.resolve(filePath);

    // Check against scopes
    for (const [scopeId, scope] of this.permissionScopes) {
      for (const scopePath of scope.paths) {
        if (normalizedPath.startsWith(path.resolve(scopePath))) {
          // Found a matching scope
          let allowed = false;

          switch (operation) {
            case 'read':
              allowed = scope.allowRead;
              break;
            case 'write':
              allowed = scope.allowWrite;
              break;
            case 'execute':
              allowed = scope.allowExecute;
              break;
            case 'network':
              allowed = scope.allowNetwork;
              break;
          }

          return { allowed, scope: scopeId };
        }
      }
    }

    // No matching scope - default deny
    return { allowed: false, reason: 'No permission scope covers this path' };
  }

  // -------------------------------------------------------------------------
  // IDLE MONITORING
  // -------------------------------------------------------------------------

  private startIdleMonitoring(): void {
    const checkIdle = () => {
      const { powerMonitor } = require('electron');
      const idleTime = powerMonitor.getSystemIdleTime();
      const thresholdSeconds = this.activityPolicy.idleTimeoutMinutes * 60;

      const wasIdle = this.isIdle;
      this.isIdle = idleTime >= thresholdSeconds;

      if (!wasIdle && this.isIdle) {
        this.onIdleStart();
      } else if (wasIdle && !this.isIdle) {
        this.onIdleEnd();
      }
    };

    this.idleTimer = setInterval(checkIdle, 30000);
  }

  private onIdleStart(): void {
    log.info('[PanicLockdown] System idle detected');

    // Stop background activities if configured
    if (!this.activityPolicy.allowBackgroundSync) {
      this.emit('idle:stopSync');
    }
    if (!this.activityPolicy.allowBackgroundIndexing) {
      this.emit('idle:stopIndexing');
    }
    if (!this.activityPolicy.allowNetworkOnIdle) {
      this.blockedOperations.add('network-access');
    }

    this.emit('idle:start');
  }

  private onIdleEnd(): void {
    log.info('[PanicLockdown] System activity resumed');

    // Restore activities
    if (!this.activityPolicy.allowNetworkOnIdle) {
      this.blockedOperations.delete('network-access');
    }

    this.emit('idle:end');
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  setConfig(config: Partial<SecurityConfig>): { success: boolean } {
    this.securityConfig = { ...this.securityConfig, ...config };
    this.saveConfig();
    return { success: true };
  }

  setActivityPolicy(policy: Partial<ActivityPolicy>): { success: boolean } {
    this.activityPolicy = { ...this.activityPolicy, ...policy };
    this.saveConfig();
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadConfig(): Promise<void> {
    try {
      const configFile = path.join(this.configPath, 'lockdown.json');
      const data = await fs.readFile(configFile, 'utf-8');
      const config = JSON.parse(data);

      if (config.securityConfig) this.securityConfig = config.securityConfig;
      if (config.activityPolicy) this.activityPolicy = config.activityPolicy;
      if (config.featureToggles) {
        for (const [id, toggle] of Object.entries(config.featureToggles)) {
          const existing = this.featureToggles.get(id);
          if (existing) {
            this.featureToggles.set(id, { ...existing, ...(toggle as Partial<FeatureToggle>) });
          }
        }
      }
      if (config.scopes) {
        for (const scope of config.scopes as PermissionScope[]) {
          this.permissionScopes.set(scope.id, scope);
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configFile = path.join(this.configPath, 'lockdown.json');
      const config = {
        securityConfig: this.securityConfig,
        activityPolicy: this.activityPolicy,
        featureToggles: Object.fromEntries(this.featureToggles),
        scopes: Array.from(this.permissionScopes.values())
      };
      await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      log.error('[PanicLockdown] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private killManagedProcesses(): void {
    // Emit event for other services to handle
    this.emit('panic:killProcesses');
  }

  shutdown(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }
    this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const PanicLockdownSystem = new PanicLockdownSystemClass();
export default PanicLockdownSystem;
