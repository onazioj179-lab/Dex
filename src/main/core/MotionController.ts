// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Motion Controller (Main Process)
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ===========================================================================
// Motion Discipline: Smooth, Not Flashy
// ===========================================================================
// RULES:
// - Short fades 180ms
// - Small positional transitions only
// - No continuous animations
// - No bounce, elastic, or physics effects
// - Disable under load or reduced-motion
// ===========================================================================

import log from 'electron-log';
import { ipcMain, BrowserWindow, nativeTheme } from 'electron';

// ===========================================================================
// MOTION DISCIPLINE CONSTANTS
// ===========================================================================

export const MOTION_DISCIPLINE = {
  // Duration limits (ms)
  MAX_FADE_DURATION: 180,
  MAX_SLIDE_DURATION: 180,
  MAX_SCALE_DURATION: 150,
  MIN_ANIMATION_DURATION: 50,
  
  // Allowed motion types
  ALLOWED_MOTION: [
    'fade',
    'slide',
    'scale-subtle',  // max 5% scale change
    'focus-ring',
  ] as const,
  
  // Disallowed motion
  FORBIDDEN_MOTION: [
    'bounce',
    'elastic',
    'spring',
    'physics',
    'continuous',
    'particle',
    'chain',
    'nested',
  ] as const,
  
  // Easing - Only compositor-friendly
  EASING: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',     // Smooth decelerate
    enter: 'cubic-bezier(0, 0, 0.2, 1)',        // Fade in
    exit: 'cubic-bezier(0.4, 0, 1, 1)',          // Fade out
    instant: 'linear',                           // Instant transitions
  },
  
  // Thresholds
  REDUCED_MOTION_CPU_THRESHOLD: 50,  // Disable at 50% CPU
  REDUCED_MOTION_MEMORY_THRESHOLD_MB: 1800, // Disable at 1.8GB
} as const;

// ===========================================================================
// TYPES
// ===========================================================================

export type MotionState = 'full' | 'reduced' | 'disabled';
export type MotionType = typeof MOTION_DISCIPLINE.ALLOWED_MOTION[number];

export interface MotionConfig {
  state: MotionState;
  prefersReducedMotion: boolean;
  systemReducedMotion: boolean;
  performanceReducedMotion: boolean;
  maxDuration: number;
  easing: string;
}

export interface AnimationRequest {
  type: MotionType;
  durationMs: number;
  element?: string;
}

export interface AnimationApproval {
  approved: boolean;
  adjustedDuration: number;
  easing: string;
  reason?: string;
}

// ===========================================================================
// MOTION CONTROLLER
// ===========================================================================

class MotionControllerClass {
  private isRunning = false;
  private windows: Map<number, BrowserWindow> = new Map();
  
  // State
  private motionState: MotionState = 'full';
  private prefersReducedMotion = false;
  private performanceReducedMotion = false;
  
  // Metrics
  private activeAnimations = 0;
  private animationsBlocked = 0;
  
  constructor() {}

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    log.info(' [MotionController] Starting - Motion Discipline Mode');
    
    this.detectSystemMotionPreference();
    this.setupIPCHandlers();
    this.updateMotionState();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    log.info(' [MotionController] Stopped');
  }

  // -------------------------------------------------------------------------
  // SYSTEM PREFERENCE DETECTION
  // -------------------------------------------------------------------------

  private detectSystemMotionPreference(): void {
    // Electron's nativeTheme can detect reduced motion on some platforms
    // but we also check via renderer
    this.prefersReducedMotion = nativeTheme.shouldUseHighContrastColors || false;
    
    nativeTheme.on('updated', () => {
      this.prefersReducedMotion = nativeTheme.shouldUseHighContrastColors || false;
      this.updateMotionState();
    });
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPCHandlers(): void {
    // Get motion configuration
    ipcMain.handle('motion:getConfig', () => this.getConfig());
    
    // Request animation approval
    ipcMain.handle('motion:requestAnimation', (_event, request: AnimationRequest) => {
      return this.approveAnimation(request);
    });
    
    // Report animation start/end
    ipcMain.on('motion:animationStart', () => {
      this.activeAnimations++;
    });
    
    ipcMain.on('motion:animationEnd', () => {
      this.activeAnimations = Math.max(0, this.activeAnimations - 1);
    });
    
    // Report reduced motion preference from renderer
    ipcMain.on('motion:prefersReduced', (_event, prefers: boolean) => {
      this.prefersReducedMotion = prefers;
      this.updateMotionState();
    });
    
    // Get current state
    ipcMain.handle('motion:getState', () => ({
      state: this.motionState,
      activeAnimations: this.activeAnimations,
      animationsBlocked: this.animationsBlocked,
    }));
  }

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  private updateMotionState(): void {
    let newState: MotionState = 'full';
    
    // Check system preference first (highest priority)
    if (this.prefersReducedMotion) {
      newState = 'disabled';
    }
    // Then check performance
    else if (this.performanceReducedMotion) {
      newState = 'reduced';
    }
    
    if (this.motionState !== newState) {
      const prevState = this.motionState;
      this.motionState = newState;
      
      log.info(` [MotionController] Motion state: ${prevState} ${newState}`);
      this.broadcastMotionState();
    }
  }

  private broadcastMotionState(): void {
    const config = this.getConfig();
    this.windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('motion:stateChanged', config);
      }
    });
  }

  // -------------------------------------------------------------------------
  // ANIMATION APPROVAL
  // -------------------------------------------------------------------------

  private approveAnimation(request: AnimationRequest): AnimationApproval {
    // Check if motion is disabled
    if (this.motionState === 'disabled') {
      this.animationsBlocked++;
      return {
        approved: false,
        adjustedDuration: 0,
        easing: MOTION_DISCIPLINE.EASING.instant,
        reason: 'Motion disabled (reduced-motion preference)',
      };
    }
    
    // Check if motion type is allowed
    if (!MOTION_DISCIPLINE.ALLOWED_MOTION.includes(request.type)) {
      this.animationsBlocked++;
      return {
        approved: false,
        adjustedDuration: 0,
        easing: MOTION_DISCIPLINE.EASING.instant,
        reason: `Motion type "${request.type}" is not allowed`,
      };
    }
    
    // Calculate adjusted duration
    let adjustedDuration = request.durationMs;
    
    // Apply motion discipline limits
    switch (request.type) {
      case 'fade':
        adjustedDuration = Math.min(adjustedDuration, MOTION_DISCIPLINE.MAX_FADE_DURATION);
        break;
      case 'slide':
        adjustedDuration = Math.min(adjustedDuration, MOTION_DISCIPLINE.MAX_SLIDE_DURATION);
        break;
      case 'scale-subtle':
        adjustedDuration = Math.min(adjustedDuration, MOTION_DISCIPLINE.MAX_SCALE_DURATION);
        break;
      case 'focus-ring':
        adjustedDuration = Math.min(adjustedDuration, 100);
        break;
    }
    
    // Apply minimum duration
    adjustedDuration = Math.max(adjustedDuration, MOTION_DISCIPLINE.MIN_ANIMATION_DURATION);
    
    // Reduce further in reduced mode
    if (this.motionState === 'reduced') {
      adjustedDuration = Math.floor(adjustedDuration * 0.5);
    }
    
    // Select easing
    let easing: string = MOTION_DISCIPLINE.EASING.standard;
    if (request.type === 'fade') {
      easing = MOTION_DISCIPLINE.EASING.enter;
    }
    
    return {
      approved: true,
      adjustedDuration,
      easing,
    };
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  getConfig(): MotionConfig {
    return {
      state: this.motionState,
      prefersReducedMotion: this.prefersReducedMotion,
      systemReducedMotion: this.prefersReducedMotion,
      performanceReducedMotion: this.performanceReducedMotion,
      maxDuration: this.motionState === 'disabled' ? 0 :
                   this.motionState === 'reduced' ? 90 :
                   MOTION_DISCIPLINE.MAX_FADE_DURATION,
      easing: this.motionState === 'disabled' ? MOTION_DISCIPLINE.EASING.instant :
              MOTION_DISCIPLINE.EASING.standard,
    };
  }

  registerWindow(window: BrowserWindow): void {
    this.windows.set(window.id, window);
    
    window.on('closed', () => {
      this.windows.delete(window.id);
    });
    
    // Send initial config
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('motion:config', this.getConfig());
    });
  }

  // Called by ResourceGovernor when performance degrades
  setPerformanceReducedMotion(reduced: boolean): void {
    if (this.performanceReducedMotion !== reduced) {
      this.performanceReducedMotion = reduced;
      this.updateMotionState();
    }
  }

  getActiveAnimationCount(): number {
    return this.activeAnimations;
  }

  getMotionState(): MotionState {
    return this.motionState;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const MotionController = new MotionControllerClass();
export default MotionController;
