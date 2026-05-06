// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Voice Command Controller
// Phase 46: Central voice command control orchestration
// ===========================================================================

import log from 'electron-log';
import { globalShortcut, BrowserWindow, ipcMain, app } from 'electron';
import { voiceControlEngine } from '../core/VoiceControlEngine';
import { voiceCommandProcessor } from '../core/VoiceCommandProcessor';
import { voiceScopeManager } from '../core/VoiceScopeManager';
import { voiceFeedbackSystem } from '../core/VoiceFeedbackSystem';

// ===========================================================================
// VOICE COMMAND CONTROLLER
// ===========================================================================

class VoiceCommandController {
  private static instance: VoiceCommandController;
  private initialized = false;
  private shortcutRegistered = false;

  private constructor() {}

  static getInstance(): VoiceCommandController {
    if (!VoiceCommandController.instance) {
      VoiceCommandController.instance = new VoiceCommandController();
    }
    return VoiceCommandController.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize all voice command subsystems
    await voiceScopeManager.initialize();
    await voiceFeedbackSystem.initialize();
    await voiceControlEngine.initialize();
    await voiceCommandProcessor.initialize();

    // Set up IPC handlers
    this.setupIPC();

    // Set up engine event handlers
    this.setupEngineListeners();

    // Register keyboard shortcut if voice is enabled
    const config = voiceControlEngine.getConfig();
    if (config.enabled) {
      this.registerShortcut(config.keyboardShortcut);
    }

    this.initialized = true;
    if (!app.isPackaged) log.info('[VoiceCommandController] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('voiceCmd:getFullStatus', () => this.getFullStatus());
    ipcMain.handle('voiceCmd:toggle', () => this.toggleListening());
  }

  private setupEngineListeners(): void {
    // Listen for state changes to update feedback
    voiceControlEngine.on('stateChanged', (state) => {
      if (state === 'listening') {
        voiceFeedbackSystem.listeningStarted();
      } else if (state === 'idle') {
        voiceFeedbackSystem.listeningStopped();
      }
    });

    // Listen for transcripts
    voiceControlEngine.on('transcript', (transcript: string) => {
      voiceFeedbackSystem.transcriptReceived(transcript);
    });
  }

  // -------------------------------------------------------------------------
  // KEYBOARD SHORTCUT
  // -------------------------------------------------------------------------

  private registerShortcut(shortcut: string): void {
    if (this.shortcutRegistered) {
      globalShortcut.unregisterAll();
    }

    try {
      const success = globalShortcut.register(shortcut, () => {
        this.toggleListening();
      });

      if (success) {
        this.shortcutRegistered = true;
        if (!app.isPackaged) log.info(`[VoiceCommandController] Shortcut registered: ${shortcut}`);
      } else {
        log.warn(`[VoiceCommandController] Failed to register shortcut: ${shortcut}`);
      }
    } catch (error) {
      log.error('[VoiceCommandController] Shortcut registration error:', error);
    }
  }

  private unregisterShortcut(): void {
    if (this.shortcutRegistered) {
      globalShortcut.unregisterAll();
      this.shortcutRegistered = false;
    }
  }

  // -------------------------------------------------------------------------
  // LISTENING CONTROL
  // -------------------------------------------------------------------------

  async toggleListening(): Promise<boolean> {
    const state = voiceControlEngine.getState();
    
    if (state === 'listening' || state === 'processing') {
      return voiceControlEngine.stopListening();
    } else if (state === 'idle') {
      return voiceControlEngine.startListening();
    }
    
    return false;
  }

  // -------------------------------------------------------------------------
  // CONFIG UPDATES
  // -------------------------------------------------------------------------

  async onConfigUpdated(): Promise<void> {
    const config = voiceControlEngine.getConfig();
    
    if (config.enabled) {
      this.registerShortcut(config.keyboardShortcut);
    } else {
      this.unregisterShortcut();
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.unregisterShortcut();
    await voiceControlEngine.shutdown();
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getFullStatus(): {
    enabled: boolean;
    state: string;
    microphoneActive: boolean;
    enabledScopes: string[];
    feedbackMode: string;
    stats: {
      totalCommands: number;
      lastUsed: number | null;
      sessionsToday: number;
    };
  } {
    const config = voiceControlEngine.getConfig();
    const state = voiceControlEngine.getState();
    const scopes = voiceScopeManager.getEnabledScopes();
    const feedbackConfig = voiceFeedbackSystem.getConfig();
    const stats = voiceControlEngine.getStats();

    return {
      enabled: config.enabled,
      state,
      microphoneActive: state === 'listening',
      enabledScopes: scopes,
      feedbackMode: feedbackConfig.mode,
      stats,
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const voiceCommandController = VoiceCommandController.getInstance();
export default voiceCommandController;
