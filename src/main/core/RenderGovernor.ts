// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Render Governor
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ===========================================================================
// High-Refresh (120Hz) Strategy + GPU-Minimal Rendering
// ===========================================================================
// HARD TARGETS:
// - Perfect smoothness on 120Hz displays
// - No wasted frames at idle
// - Zero stutter during scrolling, typing, navigation
// - GPU at zero when UI is static
// - Input-to-pixel latency < 8ms
// ===========================================================================

import log from 'electron-log';
import { BrowserWindow, ipcMain, screen } from 'electron';

// ===========================================================================
// RENDER TARGETS - 120Hz ProMotion-Class
// ===========================================================================

export const RENDER_TARGETS = {
  // Frame timing (ms)
  TARGET_FRAME_TIME_60HZ: 16.67,
  TARGET_FRAME_TIME_120HZ: 8.33,
  TARGET_FRAME_TIME_144HZ: 6.94,
  
  // Input latency (ms)
  MAX_INPUT_TO_PIXEL_MS: 8,            // Sub-frame latency target
  MAX_TYPING_LATENCY_MS: 16,           // Instant typing feel
  MAX_SCROLL_LATENCY_MS: 8,            // Smooth 120Hz scrolling
  
  // Render budgets
  MAX_PAINT_TIME_MS: 4,                // Half a 120Hz frame for painting
  MAX_LAYOUT_TIME_MS: 2,               // Minimal layout recalculation
  MAX_STYLE_TIME_MS: 1,                // Style recalculation budget
  
  // Motion discipline
  MAX_ANIMATION_DURATION_MS: 180,      // Short, purposeful animations
  MIN_ANIMATION_DURATION_MS: 50,       // Below this = instant
  FADE_DURATION_MS: 120,               // Standard fade
  SLIDE_DURATION_MS: 150,              // Standard slide
  
  // Idle detection
  RENDER_IDLE_THRESHOLD_MS: 100,       // No activity = no rendering
  INPUT_IDLE_THRESHOLD_MS: 50,         // Pause between inputs
  
  // Display scaling
  MAX_SUPPORTED_DPR: 3,                // 4K / UHD support
  PREFERRED_DPR: 2,                    // Retina standard
} as const;

// ===========================================================================
// TYPES
// ===========================================================================

export type DisplayMode = '60hz' | '120hz' | '144hz' | 'variable';
export type RenderState = 'idle' | 'active' | 'animating' | 'scrolling';
export type GPUState = 'sleeping' | 'minimal' | 'active';

export interface FrameMetrics {
  timestamp: number;
  frameTime: number;
  paintTime: number;
  layoutTime: number;
  styleTime: number;
  inputLatency: number;
  jank: boolean;
}

export interface RenderSnapshot {
  timestamp: number;
  displayMode: DisplayMode;
  targetFrameTime: number;
  renderState: RenderState;
  gpuState: GPUState;
  framesDropped: number;
  avgFrameTime: number;
  avgInputLatency: number;
  isVSynced: boolean;
  dpr: number;
}

export interface DisplayInfo {
  refreshRate: number;
  width: number;
  height: number;
  scaleFactor: number;
  isHDR: boolean;
}

// ===========================================================================
// RENDER GOVERNOR - High-Refresh Orchestration
// ===========================================================================

class RenderGovernorClass {
  private isRunning = false;
  private windows: Map<number, BrowserWindow> = new Map();
  
  // State
  private displayMode: DisplayMode = '60hz';
  private renderState: RenderState = 'idle';
  private gpuState: GPUState = 'sleeping';
  private targetFrameTime: number = RENDER_TARGETS.TARGET_FRAME_TIME_60HZ;
  
  // Metrics
  private frameHistory: FrameMetrics[] = [];
  private framesDropped = 0;
  private lastFrameTime = 0;
  private lastInputTime = 0;
  
  // Display info
  private primaryDisplay: DisplayInfo | null = null;
  
  // Callbacks
  private stateChangeCallbacks: Set<(state: RenderState) => void> = new Set();
  
  constructor() {
    this.detectDisplayCapabilities();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    log.info(' [RenderGovernor] Starting - 120Hz ProMotion-class target');
    log.info(` [RenderGovernor] Display: ${this.displayMode}, DPR: ${this.primaryDisplay?.scaleFactor || 1}`);
    
    this.setupIPCHandlers();
    this.setupDisplayMonitoring();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    log.info(' [RenderGovernor] Stopped');
  }

  // -------------------------------------------------------------------------
  // DISPLAY DETECTION
  // -------------------------------------------------------------------------

  private detectDisplayCapabilities(): void {
    try {
      const primary = screen.getPrimaryDisplay();
      
      this.primaryDisplay = {
        refreshRate: primary.displayFrequency || 60,
        width: primary.size.width,
        height: primary.size.height,
        scaleFactor: Math.min(primary.scaleFactor, RENDER_TARGETS.MAX_SUPPORTED_DPR),
        isHDR: false, // Electron doesn't expose HDR info directly
      };
      
      // Determine display mode
      if (primary.displayFrequency >= 144) {
        this.displayMode = '144hz';
        this.targetFrameTime = RENDER_TARGETS.TARGET_FRAME_TIME_144HZ;
      } else if (primary.displayFrequency >= 120) {
        this.displayMode = '120hz';
        this.targetFrameTime = RENDER_TARGETS.TARGET_FRAME_TIME_120HZ;
      } else {
        this.displayMode = '60hz';
        this.targetFrameTime = RENDER_TARGETS.TARGET_FRAME_TIME_60HZ;
      }
      
      log.info(` [RenderGovernor] Detected ${primary.displayFrequency}Hz @ ${primary.size.width}x${primary.size.height} (${primary.scaleFactor}x)`);
    } catch (err) {
      log.warn(' [RenderGovernor] Could not detect display, defaulting to 60Hz');
      this.displayMode = '60hz';
      this.targetFrameTime = RENDER_TARGETS.TARGET_FRAME_TIME_60HZ;
    }
  }

  private setupDisplayMonitoring(): void {
    // Re-detect on display change (external monitor connect/disconnect)
    screen.on('display-added', () => this.detectDisplayCapabilities());
    screen.on('display-removed', () => this.detectDisplayCapabilities());
    screen.on('display-metrics-changed', () => this.detectDisplayCapabilities());
  }

  // -------------------------------------------------------------------------
  // IPC HANDLERS
  // -------------------------------------------------------------------------

  private setupIPCHandlers(): void {
    // Get render configuration for renderer
    ipcMain.handle('render:getConfig', () => ({
      displayMode: this.displayMode,
      targetFrameTime: this.targetFrameTime,
      maxInputLatency: RENDER_TARGETS.MAX_INPUT_TO_PIXEL_MS,
      maxAnimationDuration: RENDER_TARGETS.MAX_ANIMATION_DURATION_MS,
      dpr: this.primaryDisplay?.scaleFactor || 1,
      is4K: (this.primaryDisplay?.width || 0) >= 3840,
      is120Hz: this.displayMode === '120hz' || this.displayMode === '144hz',
    }));
    
    // Report frame metrics from renderer
    ipcMain.on('render:frameMetrics', (_event, metrics: FrameMetrics) => {
      this.recordFrameMetrics(metrics);
    });
    
    // Report render state changes
    ipcMain.on('render:stateChange', (_event, state: RenderState) => {
      this.setRenderState(state);
    });
    
    // Report input events (for latency tracking)
    ipcMain.on('render:inputEvent', () => {
      this.lastInputTime = Date.now();
      if (this.renderState === 'idle') {
        this.setRenderState('active');
      }
    });
    
    // Get current snapshot
    ipcMain.handle('render:getSnapshot', () => this.getSnapshot());
  }

  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------------------

  private setRenderState(state: RenderState): void {
    if (this.renderState === state) return;
    
    const prevState = this.renderState;
    this.renderState = state;
    
    // Update GPU state based on render state
    switch (state) {
      case 'idle':
        this.gpuState = 'sleeping';
        break;
      case 'active':
        this.gpuState = 'minimal';
        break;
      case 'animating':
      case 'scrolling':
        this.gpuState = 'active';
        break;
    }
    
    // Notify windows
    this.broadcastToWindows('render:stateChanged', { 
      previous: prevState, 
      current: state,
      gpuState: this.gpuState 
    });
    
    // Notify callbacks
    this.stateChangeCallbacks.forEach(cb => cb(state));
  }

  // -------------------------------------------------------------------------
  // FRAME METRICS
  // -------------------------------------------------------------------------

  private recordFrameMetrics(metrics: FrameMetrics): void {
    // Track frame history (last 120 frames = 1 second at 120Hz)
    this.frameHistory.push(metrics);
    if (this.frameHistory.length > 120) {
      this.frameHistory.shift();
    }
    
    // Detect dropped frames
    if (metrics.jank || metrics.frameTime > this.targetFrameTime * 2) {
      this.framesDropped++;
      
      // Log significant jank
      if (metrics.frameTime > this.targetFrameTime * 4) {
        log.debug(` [RenderGovernor] Jank detected: ${metrics.frameTime.toFixed(1)}ms frame`);
      }
    }
    
    this.lastFrameTime = metrics.frameTime;
    
    // Auto-transition to idle if no activity
    if (Date.now() - this.lastInputTime > RENDER_TARGETS.RENDER_IDLE_THRESHOLD_MS) {
      if (this.renderState === 'active') {
        this.setRenderState('idle');
      }
    }
  }

  // -------------------------------------------------------------------------
  // WINDOW MANAGEMENT
  // -------------------------------------------------------------------------

  registerWindow(window: BrowserWindow): void {
    this.windows.set(window.id, window);
    
    // Configure window for optimal rendering
    this.configureWindowForPerformance(window);
    
    window.on('closed', () => {
      this.windows.delete(window.id);
    });
    
    log.debug(` [RenderGovernor] Registered window ${window.id}`);
  }

  private configureWindowForPerformance(window: BrowserWindow): void {
    // Send initial config to renderer
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('render:config', {
        displayMode: this.displayMode,
        targetFrameTime: this.targetFrameTime,
        dpr: this.primaryDisplay?.scaleFactor || 1,
        is4K: (this.primaryDisplay?.width || 0) >= 3840,
      });
    });
  }

  private broadcastToWindows(channel: string, data: unknown): void {
    this.windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  getSnapshot(): RenderSnapshot {
    const avgFrameTime = this.frameHistory.length > 0
      ? this.frameHistory.reduce((sum, f) => sum + f.frameTime, 0) / this.frameHistory.length
      : 0;
    
    const avgInputLatency = this.frameHistory.length > 0
      ? this.frameHistory.reduce((sum, f) => sum + f.inputLatency, 0) / this.frameHistory.length
      : 0;
    
    return {
      timestamp: Date.now(),
      displayMode: this.displayMode,
      targetFrameTime: this.targetFrameTime,
      renderState: this.renderState,
      gpuState: this.gpuState,
      framesDropped: this.framesDropped,
      avgFrameTime,
      avgInputLatency,
      isVSynced: true, // Electron uses vsync by default
      dpr: this.primaryDisplay?.scaleFactor || 1,
    };
  }

  getDisplayInfo(): DisplayInfo | null {
    return this.primaryDisplay;
  }

  getTargetFrameTime(): number {
    return this.targetFrameTime;
  }

  is120HzCapable(): boolean {
    return this.displayMode === '120hz' || this.displayMode === '144hz';
  }

  is4KDisplay(): boolean {
    return (this.primaryDisplay?.width || 0) >= 3840;
  }

  onStateChange(callback: (state: RenderState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // RENDER HINTS (for subsystems)
  // -------------------------------------------------------------------------

  shouldRender(): boolean {
    return this.renderState !== 'idle';
  }

  shouldAnimateAtFullRate(): boolean {
    return this.gpuState === 'active' && 
           (this.renderState === 'animating' || this.renderState === 'scrolling');
  }

  getRecommendedAnimationDuration(baseMs: number): number {
    // Reduce animation duration on high refresh displays (feels snappier)
    if (this.displayMode === '144hz') {
      return Math.max(RENDER_TARGETS.MIN_ANIMATION_DURATION_MS, baseMs * 0.7);
    }
    if (this.displayMode === '120hz') {
      return Math.max(RENDER_TARGETS.MIN_ANIMATION_DURATION_MS, baseMs * 0.8);
    }
    return Math.min(baseMs, RENDER_TARGETS.MAX_ANIMATION_DURATION_MS);
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const RenderGovernor = new RenderGovernorClass();
export default RenderGovernor;
