// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Floating Media Controls
// Context-aware, translucent pill-style overlay for active media
// Auto-hides, never blocks content, adapts to audio vs video
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, screen } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaContextType = 'audio' | 'video' | 'gallery' | 'none';
export type ControlsPosition = 'bottom' | 'top' | 'left' | 'right' | 'floating';
export type ControlsVisibility = 'visible' | 'hidden' | 'fading';

export interface MediaPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  buffered?: number;
}

export interface TrackInfo {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration: number;
}

export interface ControlsState {
  context: MediaContextType;
  visibility: ControlsVisibility;
  position: ControlsPosition;
  playback: MediaPlaybackState;
  track?: TrackInfo;
  hasNext: boolean;
  hasPrevious: boolean;
  isFullscreen: boolean;
  isPiP: boolean;
  showWaveform: boolean;
  showSubtitles: boolean;
  subtitleTrack?: string;
  audioTrack?: string;
}

export interface ControlAction {
  type: 
    | 'play' | 'pause' | 'stop' | 'toggle'
    | 'next' | 'previous'
    | 'seek' | 'seekForward' | 'seekBackward'
    | 'volume' | 'mute' | 'unmute' | 'toggleMute'
    | 'fullscreen' | 'exitFullscreen' | 'toggleFullscreen'
    | 'pip' | 'exitPip' | 'togglePip'
    | 'playbackRate'
    | 'subtitles' | 'audioTrack'
    | 'showControls' | 'hideControls';
  value?: number | string | boolean;
}

export interface ControlsConfig {
  defaultPosition: ControlsPosition;
  autoHideDelay: number; // ms
  showOnHover: boolean;
  showOnKeyPress: boolean;
  opacity: number; // 0-1
  scale: number; // 0.5-2
  blurBackground: boolean;
  vibrancy: boolean;
  showProgress: boolean;
  showWaveform: boolean;
  seekIncrement: number; // seconds
  volumeStep: number; // 0-1
  rememberPosition: boolean;
  pinnedMode: boolean;
}

export interface ControlsLayout {
  showPlayPause: boolean;
  showPrevNext: boolean;
  showSeekBar: boolean;
  showVolume: boolean;
  showTime: boolean;
  showTrackInfo: boolean;
  showFullscreen: boolean;
  showPiP: boolean;
  showPlaybackRate: boolean;
  showSubtitles: boolean;
  showAudioTrack: boolean;
  showArtwork: boolean;
}

// ===========================================================================
// FLOATING MEDIA CONTROLS
// ===========================================================================

class FloatingMediaControlsClass extends EventEmitter {
  private state: ControlsState;
  private config: ControlsConfig;
  private audioLayout: ControlsLayout;
  private videoLayout: ControlsLayout;
  private mainWindow: BrowserWindow | null = null;
  private dataPath = '';
  private hideTimer: NodeJS.Timeout | null = null;
  private fadeTimer: NodeJS.Timeout | null = null;
  private isMouseOver = false;
  private lastInteractionTime = 0;

  constructor() {
    super();
    
    // Default state - no active media
    this.state = {
      context: 'none',
      visibility: 'hidden',
      position: 'bottom',
      playback: {
        isPlaying: false,
        isPaused: false,
        isMuted: false,
        currentTime: 0,
        duration: 0,
        volume: 1.0,
        playbackRate: 1.0,
      },
      hasNext: false,
      hasPrevious: false,
      isFullscreen: false,
      isPiP: false,
      showWaveform: false,
      showSubtitles: false,
    };
    
    this.config = {
      defaultPosition: 'bottom',
      autoHideDelay: 3000,
      showOnHover: true,
      showOnKeyPress: true,
      opacity: 0.95,
      scale: 1.0,
      blurBackground: true,
      vibrancy: true,
      showProgress: true,
      showWaveform: false,
      seekIncrement: 10,
      volumeStep: 0.1,
      rememberPosition: true,
      pinnedMode: false,
    };
    
    // Audio controls - minimal, music-focused
    this.audioLayout = {
      showPlayPause: true,
      showPrevNext: true,
      showSeekBar: true,
      showVolume: true,
      showTime: true,
      showTrackInfo: true,
      showFullscreen: false,
      showPiP: false,
      showPlaybackRate: false,
      showSubtitles: false,
      showAudioTrack: false,
      showArtwork: true,
    };
    
    // Video controls - cinematic, full-featured
    this.videoLayout = {
      showPlayPause: true,
      showPrevNext: true,
      showSeekBar: true,
      showVolume: true,
      showTime: true,
      showTrackInfo: false,
      showFullscreen: true,
      showPiP: true,
      showPlaybackRate: true,
      showSubtitles: true,
      showAudioTrack: true,
      showArtwork: false,
    };
    
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'media-controls');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadConfig();
      
      log.info('[FloatingControls] Initialized');
    } catch (error) {
      log.error('[FloatingControls] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // State management
    ipcMain.handle('controls:getState', () => this.getState());
    ipcMain.handle('controls:getLayout', () => this.getCurrentLayout());
    
    // Context switching
    ipcMain.handle('controls:setContext', (_event, context: MediaContextType) => {
      return this.setContext(context);
    });
    
    // Playback updates
    ipcMain.handle('controls:updatePlayback', (_event, playback: Partial<MediaPlaybackState>) => {
      return this.updatePlayback(playback);
    });
    
    ipcMain.handle('controls:setTrack', (_event, track: TrackInfo | null) => {
      return this.setTrack(track);
    });
    
    ipcMain.handle('controls:setQueue', (_event, hasNext: boolean, hasPrevious: boolean) => {
      return this.setQueueState(hasNext, hasPrevious);
    });

    // Actions
    ipcMain.handle('controls:action', async (_event, action: ControlAction) => {
      return this.handleAction(action);
    });

    // Visibility
    ipcMain.handle('controls:show', () => this.show());
    ipcMain.handle('controls:hide', () => this.hide());
    ipcMain.handle('controls:toggle', () => this.toggle());
    
    // Mouse interaction
    ipcMain.handle('controls:mouseEnter', () => this.onMouseEnter());
    ipcMain.handle('controls:mouseLeave', () => this.onMouseLeave());
    ipcMain.handle('controls:interaction', () => this.onInteraction());

    // Configuration
    ipcMain.handle('controls:getConfig', () => this.config);
    ipcMain.handle('controls:updateConfig', async (_event, updates: Partial<ControlsConfig>) => {
      return this.updateConfig(updates);
    });
    
    // Layout customization
    ipcMain.handle('controls:getAudioLayout', () => this.audioLayout);
    ipcMain.handle('controls:getVideoLayout', () => this.videoLayout);
    ipcMain.handle('controls:updateAudioLayout', async (_event, updates: Partial<ControlsLayout>) => {
      return this.updateAudioLayout(updates);
    });
    ipcMain.handle('controls:updateVideoLayout', async (_event, updates: Partial<ControlsLayout>) => {
      return this.updateVideoLayout(updates);
    });

    // Position
    ipcMain.handle('controls:setPosition', (_event, position: ControlsPosition) => {
      return this.setPosition(position);
    });

    // Fullscreen/PiP state
    ipcMain.handle('controls:setFullscreen', (_event, isFullscreen: boolean) => {
      return this.setFullscreen(isFullscreen);
    });
    ipcMain.handle('controls:setPiP', (_event, isPiP: boolean) => {
      return this.setPiP(isPiP);
    });
  }

  // -------------------------------------------------------------------------
  // CONTEXT MANAGEMENT
  // -------------------------------------------------------------------------

  setContext(context: MediaContextType): ControlsState {
    const previousContext = this.state.context;
    this.state.context = context;
    
    // Show controls when context changes to media
    if (context !== 'none' && previousContext === 'none') {
      this.show();
    }
    
    // Hide controls when no media
    if (context === 'none') {
      this.hide();
    }
    
    this.emit('contextChanged', context);
    this.notifyStateChange();
    
    log.info(`[FloatingControls] Context changed: ${previousContext} -> ${context}`);
    return this.state;
  }

  getContext(): MediaContextType {
    return this.state.context;
  }

  // -------------------------------------------------------------------------
  // PLAYBACK STATE
  // -------------------------------------------------------------------------

  updatePlayback(updates: Partial<MediaPlaybackState>): ControlsState {
    this.state.playback = { ...this.state.playback, ...updates };
    
    // Show controls when playback starts
    if (updates.isPlaying && !this.state.playback.isPaused) {
      this.showTemporarily();
    }
    
    this.emit('playbackUpdated', this.state.playback);
    this.notifyStateChange();
    
    return this.state;
  }

  setTrack(track: TrackInfo | null): ControlsState {
    this.state.track = track || undefined;
    
    // Show controls briefly when track changes
    if (track) {
      this.showTemporarily();
    }
    
    this.emit('trackChanged', track);
    this.notifyStateChange();
    
    return this.state;
  }

  setQueueState(hasNext: boolean, hasPrevious: boolean): ControlsState {
    this.state.hasNext = hasNext;
    this.state.hasPrevious = hasPrevious;
    
    this.notifyStateChange();
    return this.state;
  }

  // -------------------------------------------------------------------------
  // ACTION HANDLING
  // -------------------------------------------------------------------------

  async handleAction(action: ControlAction): Promise<{ success: boolean; action: string }> {
    this.onInteraction();
    
    switch (action.type) {
      case 'play':
        this.emit('action', 'play');
        break;
        
      case 'pause':
        this.emit('action', 'pause');
        break;
        
      case 'stop':
        this.emit('action', 'stop');
        break;
        
      case 'toggle':
        this.emit('action', this.state.playback.isPlaying ? 'pause' : 'play');
        break;
        
      case 'next':
        if (this.state.hasNext) {
          this.emit('action', 'next');
        }
        break;
        
      case 'previous':
        if (this.state.hasPrevious) {
          this.emit('action', 'previous');
        }
        break;
        
      case 'seek':
        if (typeof action.value === 'number') {
          this.emit('action', 'seek', action.value);
        }
        break;
        
      case 'seekForward':
        const forwardTime = this.state.playback.currentTime + this.config.seekIncrement;
        this.emit('action', 'seek', Math.min(forwardTime, this.state.playback.duration));
        break;
        
      case 'seekBackward':
        const backwardTime = this.state.playback.currentTime - this.config.seekIncrement;
        this.emit('action', 'seek', Math.max(0, backwardTime));
        break;
        
      case 'volume':
        if (typeof action.value === 'number') {
          this.emit('action', 'volume', Math.max(0, Math.min(1, action.value)));
        }
        break;
        
      case 'mute':
        this.emit('action', 'mute');
        break;
        
      case 'unmute':
        this.emit('action', 'unmute');
        break;
        
      case 'toggleMute':
        this.emit('action', this.state.playback.isMuted ? 'unmute' : 'mute');
        break;
        
      case 'fullscreen':
        this.emit('action', 'fullscreen');
        break;
        
      case 'exitFullscreen':
        this.emit('action', 'exitFullscreen');
        break;
        
      case 'toggleFullscreen':
        this.emit('action', this.state.isFullscreen ? 'exitFullscreen' : 'fullscreen');
        break;
        
      case 'pip':
        this.emit('action', 'pip');
        break;
        
      case 'exitPip':
        this.emit('action', 'exitPip');
        break;
        
      case 'togglePip':
        this.emit('action', this.state.isPiP ? 'exitPip' : 'pip');
        break;
        
      case 'playbackRate':
        if (typeof action.value === 'number') {
          this.emit('action', 'playbackRate', action.value);
        }
        break;
        
      case 'subtitles':
        this.emit('action', 'subtitles', action.value);
        break;
        
      case 'audioTrack':
        this.emit('action', 'audioTrack', action.value);
        break;
        
      case 'showControls':
        this.show();
        break;
        
      case 'hideControls':
        this.hide();
        break;
    }
    
    log.info(`[FloatingControls] Action: ${action.type}`);
    return { success: true, action: action.type };
  }

  // -------------------------------------------------------------------------
  // VISIBILITY MANAGEMENT
  // -------------------------------------------------------------------------

  show(): void {
    if (this.state.context === 'none') return;
    
    this.clearTimers();
    this.state.visibility = 'visible';
    this.notifyStateChange();
    this.emit('visibilityChanged', 'visible');
  }

  hide(): void {
    this.clearTimers();
    this.state.visibility = 'hidden';
    this.notifyStateChange();
    this.emit('visibilityChanged', 'hidden');
  }

  toggle(): void {
    if (this.state.visibility === 'visible') {
      this.hide();
    } else {
      this.show();
    }
  }

  showTemporarily(): void {
    if (this.state.context === 'none') return;
    if (this.config.pinnedMode) {
      this.show();
      return;
    }
    
    this.show();
    this.startAutoHideTimer();
  }

  private startAutoHideTimer(): void {
    this.clearTimers();
    
    if (!this.config.autoHideDelay || this.config.pinnedMode || this.isMouseOver) {
      return;
    }
    
    // Start fade
    this.fadeTimer = setTimeout(() => {
      this.state.visibility = 'fading';
      this.notifyStateChange();
      
      // Complete hide after fade
      this.hideTimer = setTimeout(() => {
        this.hide();
      }, 300); // 300ms fade duration
      
    }, this.config.autoHideDelay);
  }

  private clearTimers(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // MOUSE INTERACTION
  // -------------------------------------------------------------------------

  onMouseEnter(): void {
    this.isMouseOver = true;
    this.clearTimers();
    
    if (this.config.showOnHover) {
      this.show();
    }
  }

  onMouseLeave(): void {
    this.isMouseOver = false;
    
    if (this.state.playback.isPlaying && !this.config.pinnedMode) {
      this.startAutoHideTimer();
    }
  }

  onInteraction(): void {
    this.lastInteractionTime = Date.now();
    this.showTemporarily();
  }

  // -------------------------------------------------------------------------
  // POSITION & STATE
  // -------------------------------------------------------------------------

  setPosition(position: ControlsPosition): ControlsState {
    this.state.position = position;
    this.notifyStateChange();
    this.emit('positionChanged', position);
    return this.state;
  }

  setFullscreen(isFullscreen: boolean): ControlsState {
    this.state.isFullscreen = isFullscreen;
    
    // Always show controls briefly when entering/exiting fullscreen
    this.showTemporarily();
    
    this.notifyStateChange();
    this.emit('fullscreenChanged', isFullscreen);
    return this.state;
  }

  setPiP(isPiP: boolean): ControlsState {
    this.state.isPiP = isPiP;
    this.notifyStateChange();
    this.emit('pipChanged', isPiP);
    return this.state;
  }

  getState(): ControlsState {
    return { ...this.state };
  }

  getCurrentLayout(): ControlsLayout {
    switch (this.state.context) {
      case 'audio':
        return { ...this.audioLayout };
      case 'video':
        return { ...this.videoLayout };
      default:
        // Return minimal layout for other contexts
        return {
          showPlayPause: true,
          showPrevNext: false,
          showSeekBar: true,
          showVolume: true,
          showTime: true,
          showTrackInfo: false,
          showFullscreen: false,
          showPiP: false,
          showPlaybackRate: false,
          showSubtitles: false,
          showAudioTrack: false,
          showArtwork: false,
        };
    }
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const layoutPath = path.join(this.dataPath, 'layouts.json');
      
      // Load config
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const saved = JSON.parse(configData);
        this.config = { ...this.config, ...saved };
      } catch {
        // Use defaults
      }
      
      // Load layouts
      try {
        const layoutData = await fs.readFile(layoutPath, 'utf-8');
        const saved = JSON.parse(layoutData);
        if (saved.audio) this.audioLayout = { ...this.audioLayout, ...saved.audio };
        if (saved.video) this.videoLayout = { ...this.videoLayout, ...saved.video };
      } catch {
        // Use defaults
      }
    } catch (error) {
      log.error('[FloatingControls] Failed to load config:', error);
    }
  }

  async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const layoutPath = path.join(this.dataPath, 'layouts.json');
      
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
      await fs.writeFile(layoutPath, JSON.stringify({
        audio: this.audioLayout,
        video: this.videoLayout,
      }, null, 2));
    } catch (error) {
      log.error('[FloatingControls] Failed to save config:', error);
    }
  }

  async updateConfig(updates: Partial<ControlsConfig>): Promise<ControlsConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('configUpdated', this.config);
    return this.config;
  }

  async updateAudioLayout(updates: Partial<ControlsLayout>): Promise<ControlsLayout> {
    this.audioLayout = { ...this.audioLayout, ...updates };
    await this.saveConfig();
    this.notifyStateChange();
    return this.audioLayout;
  }

  async updateVideoLayout(updates: Partial<ControlsLayout>): Promise<ControlsLayout> {
    this.videoLayout = { ...this.videoLayout, ...updates };
    await this.saveConfig();
    this.notifyStateChange();
    return this.videoLayout;
  }

  // -------------------------------------------------------------------------
  // RENDERER NOTIFICATION
  // -------------------------------------------------------------------------

  private notifyStateChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('controls:stateChanged', this.state);
    }
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getProgressPercentage(): number {
    if (this.state.playback.duration === 0) return 0;
    return (this.state.playback.currentTime / this.state.playback.duration) * 100;
  }

  // -------------------------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // -------------------------------------------------------------------------

  handleKeyPress(key: string, modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean }): boolean {
    if (this.state.context === 'none') return false;
    
    switch (key) {
      case 'Space':
        this.handleAction({ type: 'toggle' });
        return true;
        
      case 'ArrowRight':
        if (modifiers.shift) {
          this.handleAction({ type: 'next' });
        } else {
          this.handleAction({ type: 'seekForward' });
        }
        return true;
        
      case 'ArrowLeft':
        if (modifiers.shift) {
          this.handleAction({ type: 'previous' });
        } else {
          this.handleAction({ type: 'seekBackward' });
        }
        return true;
        
      case 'ArrowUp':
        const newVolUp = Math.min(1, this.state.playback.volume + this.config.volumeStep);
        this.handleAction({ type: 'volume', value: newVolUp });
        return true;
        
      case 'ArrowDown':
        const newVolDown = Math.max(0, this.state.playback.volume - this.config.volumeStep);
        this.handleAction({ type: 'volume', value: newVolDown });
        return true;
        
      case 'KeyM':
        this.handleAction({ type: 'toggleMute' });
        return true;
        
      case 'KeyF':
        if (this.state.context === 'video') {
          this.handleAction({ type: 'toggleFullscreen' });
        }
        return true;
        
      case 'KeyP':
        if (modifiers.shift && this.state.context === 'video') {
          this.handleAction({ type: 'togglePip' });
        }
        return true;
        
      case 'Escape':
        if (this.state.isFullscreen) {
          this.handleAction({ type: 'exitFullscreen' });
        } else if (this.state.isPiP) {
          this.handleAction({ type: 'exitPip' });
        }
        return true;
    }
    
    return false;
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.clearTimers();
    await this.saveConfig();
    log.info('[FloatingControls] Shutdown complete');
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const FloatingMediaControls = new FloatingMediaControlsClass();
export default FloatingMediaControls;
