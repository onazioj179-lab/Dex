// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Safe Mode Manager
// Ensures app ALWAYS opens, even when things go wrong
// ===========================================================================

import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface SafeModeState {
  enabled: boolean;
  reason: string;
  lastCrash: number | null;
  crashCount: number;
  lastSuccessfulBoot: number | null;
}

export interface StartupStage {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  error?: string;
}

class SafeModeManager {
  private stateFile: string;
  private state: SafeModeState;
  private stages: Map<string, StartupStage> = new Map();
  private startupTimeout = 30000; // 30 seconds max startup
  private stageTimeout = 10000; // 10 seconds per stage
  private startupTimer: NodeJS.Timeout | null = null;
  
  // Stages that run in safe mode
  private safeModeStages = [
    'process-launch',
    'config-load',
    'window-create',
    'ui-render'
  ];
  
  // All stages for normal mode
  private allStages = [
    'process-launch',
    'config-load',
    'permission-check',
    'core-runtime-init',
    'window-create',
    'ui-render',
    'subsystems-init',
    'idle-state'
  ];

  constructor() {
    const userDataPath = app.getPath('userData');
    this.stateFile = path.join(userDataPath, 'safe-mode-state.json');
    this.state = this.loadState();
    
    // Check if we should enter safe mode
    this.checkForSafeMode();
  }

  private loadState(): SafeModeState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      log.error('[SafeMode] Failed to load state:', err);
    }
    
    return {
      enabled: false,
      reason: '',
      lastCrash: null,
      crashCount: 0,
      lastSuccessfulBoot: null
    };
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      log.error('[SafeMode] Failed to save state:', err);
    }
  }

  private checkForSafeMode(): void {
    // Auto-enable safe mode if:
    // 1. Crashed 3+ times recently
    // 2. Last crash was within 5 minutes
    // 3. Never had a successful boot
    
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    if (this.state.crashCount >= 3) {
      this.enableSafeMode('Multiple crashes detected');
    } else if (this.state.lastCrash && this.state.lastCrash > fiveMinutesAgo) {
      this.state.crashCount++;
      this.saveState();
      if (this.state.crashCount >= 2) {
        this.enableSafeMode('Recent crash detected');
      }
    }
  }

  enableSafeMode(reason: string): void {
    log.info(`[SafeMode] ENABLED: ${reason}`);
    this.state.enabled = true;
    this.state.reason = reason;
    this.saveState();
  }

  disableSafeMode(): void {
    log.info('[SafeMode] Disabled');
    this.state.enabled = false;
    this.state.reason = '';
    this.state.crashCount = 0;
    this.saveState();
  }

  isSafeModeEnabled(): boolean {
    return this.state.enabled;
  }

  getSafeModeReason(): string {
    return this.state.reason;
  }

  // Record that startup began (potential crash marker)
  markStartupBegin(): void {
    this.state.lastCrash = Date.now(); // Assume crash until proven otherwise
    this.saveState();
    
    // Start overall timeout
    this.startupTimer = setTimeout(() => {
      log.error('[SafeMode] Startup timeout exceeded!');
      this.enableSafeMode('Startup timeout');
    }, this.startupTimeout);
  }

  // Record successful startup
  markStartupSuccess(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    
    this.state.lastCrash = null;
    this.state.crashCount = 0;
    this.state.lastSuccessfulBoot = Date.now();
    this.saveState();
    
    log.info('[SafeMode] Startup successful!');
  }

  // Stage tracking
  beginStage(name: string): void {
    log.info(`[Startup] BEGIN: ${name}`);
    this.stages.set(name, {
      name,
      status: 'running',
      startTime: Date.now()
    });
  }

  completeStage(name: string): void {
    const stage = this.stages.get(name);
    if (stage) {
      stage.status = 'success';
      stage.endTime = Date.now();
      const duration = stage.endTime - (stage.startTime || 0);
      log.info(`[Startup] COMPLETE: ${name} (${duration}ms)`);
    }
  }

  failStage(name: string, error: string): void {
    const stage = this.stages.get(name);
    if (stage) {
      stage.status = 'failed';
      stage.endTime = Date.now();
      stage.error = error;
      log.error(`[Startup] FAILED: ${name} - ${error}`);
    }
  }

  skipStage(name: string, reason: string): void {
    log.info(`[Startup] SKIPPED: ${name} - ${reason}`);
    this.stages.set(name, {
      name,
      status: 'skipped',
      error: reason
    });
  }

  getStages(): StartupStage[] {
    return Array.from(this.stages.values());
  }

  getRequiredStages(): string[] {
    return this.state.enabled ? this.safeModeStages : this.allStages;
  }

  // Generate startup report
  getStartupReport(): string {
    const lines: string[] = [
      '=== DEX STARTUP REPORT ===',
      `Safe Mode: ${this.state.enabled ? 'ENABLED' : 'disabled'}`,
      this.state.reason ? `Reason: ${this.state.reason}` : '',
      `Crash Count: ${this.state.crashCount}`,
      '',
      '=== STAGES ==='
    ];
    
    for (const stage of this.stages.values()) {
      const duration = stage.endTime && stage.startTime 
        ? `${stage.endTime - stage.startTime}ms` 
        : '-';
      const icon = stage.status === 'success' ? '[OK]' 
        : stage.status === 'failed' ? '[FAIL]'
        : stage.status === 'skipped' ? '[SKIP]'
        : '[...]';
      lines.push(`${icon} ${stage.name}: ${duration}`);
      if (stage.error) {
        lines.push(`    Error: ${stage.error}`);
      }
    }
    
    return lines.filter(l => l).join('\n');
  }

  // Reset everything for fresh start
  reset(): void {
    this.state = {
      enabled: false,
      reason: '',
      lastCrash: null,
      crashCount: 0,
      lastSuccessfulBoot: null
    };
    this.saveState();
    this.stages.clear();
    log.info('[SafeMode] State reset');
  }
}

export const safeMode = new SafeModeManager();
