// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Voice Control Engine
// Phase 46: Opt-in voice control with permission-based execution
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow, systemPreferences } from 'electron';
import { EventEmitter } from 'events';

// ===========================================================================
// TYPES
// ===========================================================================

export type ActivationMethod = 'push-to-talk' | 'keyboard-shortcut' | 'wake-word';
export type VoiceState = 'disabled' | 'idle' | 'listening' | 'processing' | 'executing';
export type FeedbackMode = 'visual' | 'spoken' | 'silent';

export interface VoiceControlConfig {
  enabled: boolean;
  activationMethod: ActivationMethod;
  keyboardShortcut: string;
  wakeWord: string;
  wakeWordEnabled: boolean;
  feedbackMode: FeedbackMode;
  confirmDestructiveActions: boolean;
  confirmAllActions: boolean;
  localProcessingOnly: boolean;
  autoDisableAfterMs: number;
  maxListeningDurationMs: number;
}

export interface VoiceSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  state: VoiceState;
  transcript: string | null;
  command: string | null;
  executed: boolean;
  cancelled: boolean;
  error: string | null;
}

export interface VoiceLogEntry {
  id: string;
  timestamp: number;
  transcript: string;
  command: string;
  scope: string;
  executed: boolean;
  confirmed: boolean;
  error: string | null;
}

export interface MicrophoneStatus {
  available: boolean;
  permissionGranted: boolean;
  active: boolean;
  deviceName: string | null;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const DEFAULT_CONFIG: VoiceControlConfig = {
  enabled: false, // OFF by default
  activationMethod: 'push-to-talk',
  keyboardShortcut: 'CommandOrControl+Shift+V',
  wakeWord: 'Hey Dex',
  wakeWordEnabled: false, // OFF by default
  feedbackMode: 'visual',
  confirmDestructiveActions: true,
  confirmAllActions: false,
  localProcessingOnly: true, // Prefer local processing
  autoDisableAfterMs: 30000, // Auto-stop after 30s of silence
  maxListeningDurationMs: 60000, // Max 60s listening session
};

// ===========================================================================
// STORE
// ===========================================================================

const voiceStore = new Store<{
  config: VoiceControlConfig;
  logs: VoiceLogEntry[];
  sessions: VoiceSession[];
  totalCommandsExecuted: number;
  lastUsed: number | null;
}>({
  name: 'voice-control',
  defaults: {
    config: DEFAULT_CONFIG,
    logs: [],
    sessions: [],
    totalCommandsExecuted: 0,
    lastUsed: null,
  },
});

// ===========================================================================
// VOICE CONTROL ENGINE
// ===========================================================================

class VoiceControlEngine extends EventEmitter {
  private static instance: VoiceControlEngine;
  private initialized = false;
  private state: VoiceState = 'disabled';
  private currentSession: VoiceSession | null = null;
  private listeningTimeout: NodeJS.Timeout | null = null;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private microphoneStream: any = null;
  private recognitionEngine: any = null;

  private constructor() {
    super();
  }

  static getInstance(): VoiceControlEngine {
    if (!VoiceControlEngine.instance) {
      VoiceControlEngine.instance = new VoiceControlEngine();
    }
    return VoiceControlEngine.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();
    
    // Only initialize voice engine if enabled
    const config = voiceStore.get('config');
    if (config.enabled) {
      await this.initializeEngine();
    }

    this.initialized = true;
    log.info('[VoiceControl] Initialized (disabled by default)');
  }

  private setupIPC(): void {
    // Config
    ipcMain.handle('voice:getConfig', () => this.getConfig());
    ipcMain.handle('voice:updateConfig', (_, updates) => this.updateConfig(updates));
    ipcMain.handle('voice:enable', () => this.enable());
    ipcMain.handle('voice:disable', () => this.disable());

    // Control
    ipcMain.handle('voice:getState', () => this.getState());
    ipcMain.handle('voice:startListening', () => this.startListening());
    ipcMain.handle('voice:stopListening', () => this.stopListening());
    ipcMain.handle('voice:cancelCommand', () => this.cancelCommand());

    // Microphone
    ipcMain.handle('voice:getMicrophoneStatus', () => this.getMicrophoneStatus());
    ipcMain.handle('voice:requestMicrophonePermission', () => this.requestMicrophonePermission());

    // Logs
    ipcMain.handle('voice:getLogs', (_, limit) => this.getLogs(limit));
    ipcMain.handle('voice:clearLogs', () => this.clearLogs());
    ipcMain.handle('voice:getStats', () => this.getStats());

    // Session
    ipcMain.handle('voice:getCurrentSession', () => this.getCurrentSession());
  }

  private async initializeEngine(): Promise<void> {
    // Voice engine loads on demand
    // In a real implementation, this would initialize:
    // - Speech recognition (Web Speech API or local engine)
    // - Audio input handling
    // - Wake word detection (if enabled)
    
    this.state = 'idle';
    this.notifyStateChange();
  }

  async shutdown(): Promise<void> {
    await this.stopListening();
    this.state = 'disabled';
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // ENABLE/DISABLE
  // -------------------------------------------------------------------------

  async enable(): Promise<boolean> {
    const config = voiceStore.get('config');
    
    // Check microphone permission first
    const micStatus = await this.getMicrophoneStatus();
    if (!micStatus.available) {
      return false;
    }

    if (!micStatus.permissionGranted) {
      const granted = await this.requestMicrophonePermission();
      if (!granted) {
        return false;
      }
    }

    config.enabled = true;
    voiceStore.set('config', config);

    await this.initializeEngine();
    
    log.info('[VoiceControl] Enabled');
    return true;
  }

  async disable(): Promise<boolean> {
    await this.stopListening();
    
    const config = voiceStore.get('config');
    config.enabled = false;
    voiceStore.set('config', config);

    this.state = 'disabled';
    this.notifyStateChange();

    // Unload engine to save resources
    this.recognitionEngine = null;
    this.microphoneStream = null;

    log.info('[VoiceControl] Disabled');
    return true;
  }

  isEnabled(): boolean {
    return voiceStore.get('config').enabled;
  }

  // -------------------------------------------------------------------------
  // LISTENING CONTROL
  // -------------------------------------------------------------------------

  async startListening(): Promise<boolean> {
    const config = voiceStore.get('config');
    
    if (!config.enabled) {
      log.info('[VoiceControl] Cannot start - voice control disabled');
      return false;
    }

    if (this.state === 'listening' || this.state === 'processing') {
      return true; // Already listening
    }

    // Create new session
    this.currentSession = {
      id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      endedAt: null,
      state: 'listening',
      transcript: null,
      command: null,
      executed: false,
      cancelled: false,
      error: null,
    };

    this.state = 'listening';
    this.notifyStateChange();
    this.notifyMicrophoneActive(true);

    // Set up timeouts
    this.setupTimeouts(config);

    log.info('[VoiceControl] Started listening');
    return true;
  }

  async stopListening(): Promise<boolean> {
    if (this.state !== 'listening' && this.state !== 'processing') {
      return true;
    }

    this.clearTimeouts();

    if (this.currentSession) {
      this.currentSession.endedAt = Date.now();
      this.currentSession.state = 'idle';
      this.saveSession(this.currentSession);
      this.currentSession = null;
    }

    this.state = 'idle';
    this.notifyStateChange();
    this.notifyMicrophoneActive(false);

    log.info('[VoiceControl] Stopped listening');
    return true;
  }

  async cancelCommand(): Promise<boolean> {
    if (this.currentSession) {
      this.currentSession.cancelled = true;
      this.currentSession.endedAt = Date.now();
      this.saveSession(this.currentSession);
    }

    await this.stopListening();
    log.info('[VoiceControl] Command cancelled');
    return true;
  }

  private setupTimeouts(config: VoiceControlConfig): void {
    // Max listening duration
    this.listeningTimeout = setTimeout(() => {
      log.info('[VoiceControl] Max listening duration reached');
      this.stopListening();
    }, config.maxListeningDurationMs);

    // Auto-disable after silence
    this.resetSilenceTimeout(config);
  }

  private resetSilenceTimeout(config: VoiceControlConfig): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    this.silenceTimeout = setTimeout(() => {
      log.info('[VoiceControl] Silence timeout - stopping');
      this.stopListening();
    }, config.autoDisableAfterMs);
  }

  private clearTimeouts(): void {
    if (this.listeningTimeout) {
      clearTimeout(this.listeningTimeout);
      this.listeningTimeout = null;
    }
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  // -------------------------------------------------------------------------
  // TRANSCRIPT HANDLING
  // -------------------------------------------------------------------------

  async processTranscript(transcript: string): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.transcript = transcript;
    this.state = 'processing';
    this.notifyStateChange();

    // Emit transcript for command processing
    this.emit('transcript', transcript, this.currentSession.id);
    this.notifyTranscript(transcript);
  }

  async setCommandResult(
    sessionId: string,
    command: string,
    executed: boolean,
    error: string | null
  ): Promise<void> {
    if (this.currentSession?.id === sessionId) {
      this.currentSession.command = command;
      this.currentSession.executed = executed;
      this.currentSession.error = error;
      this.currentSession.state = executed ? 'executing' : 'idle';
      
      // Log the command
      this.logCommand(this.currentSession);

      if (executed) {
        const total = voiceStore.get('totalCommandsExecuted');
        voiceStore.set('totalCommandsExecuted', total + 1);
        voiceStore.set('lastUsed', Date.now());
      }
    }

    // Return to idle after execution
    this.state = 'idle';
    this.notifyStateChange();
    await this.stopListening();
  }

  // -------------------------------------------------------------------------
  // MICROPHONE
  // -------------------------------------------------------------------------

  async getMicrophoneStatus(): Promise<MicrophoneStatus> {
    let permissionGranted = false;

    // Check OS microphone permission (macOS)
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      permissionGranted = status === 'granted';
    } else {
      // On Windows/Linux, permission is typically granted via browser API
      permissionGranted = true; // Assume available, will fail on actual access if not
    }

    return {
      available: true, // Assume mic hardware exists
      permissionGranted,
      active: this.state === 'listening',
      deviceName: null, // Would be populated with actual device name
    };
  }

  async requestMicrophonePermission(): Promise<boolean> {
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      return granted;
    }
    
    // On Windows/Linux, permission is handled differently
    return true;
  }

  // -------------------------------------------------------------------------
  // STATE & NOTIFICATIONS
  // -------------------------------------------------------------------------

  getState(): VoiceState {
    return this.state;
  }

  getCurrentSession(): VoiceSession | null {
    return this.currentSession;
  }

  private notifyStateChange(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:stateChanged', this.state);
      }
    }
  }

  private notifyMicrophoneActive(active: boolean): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:microphoneActive', active);
      }
    }
  }

  private notifyTranscript(transcript: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:transcript', transcript);
      }
    }
  }

  // -------------------------------------------------------------------------
  // LOGGING
  // -------------------------------------------------------------------------

  private logCommand(session: VoiceSession): void {
    if (!session.transcript) return;

    const log: VoiceLogEntry = {
      id: session.id,
      timestamp: Date.now(),
      transcript: session.transcript,
      command: session.command || 'unknown',
      scope: 'dex', // Would be populated by command processor
      executed: session.executed,
      confirmed: true, // Would track if confirmation was needed
      error: session.error,
    };

    const logs = voiceStore.get('logs');
    logs.push(log);
    
    // Keep last 500 logs
    if (logs.length > 500) {
      logs.splice(0, logs.length - 500);
    }
    
    voiceStore.set('logs', logs);
  }

  private saveSession(session: VoiceSession): void {
    const sessions = voiceStore.get('sessions');
    sessions.push(session);
    
    // Keep last 100 sessions
    if (sessions.length > 100) {
      sessions.splice(0, sessions.length - 100);
    }
    
    voiceStore.set('sessions', sessions);
  }

  getLogs(limit: number = 50): VoiceLogEntry[] {
    return voiceStore.get('logs').slice(-limit);
  }

  async clearLogs(): Promise<boolean> {
    voiceStore.set('logs', []);
    voiceStore.set('sessions', []);
    return true;
  }

  getStats(): {
    totalCommands: number;
    lastUsed: number | null;
    sessionsToday: number;
  } {
    const sessions = voiceStore.get('sessions');
    const today = new Date().setHours(0, 0, 0, 0);
    const sessionsToday = sessions.filter(s => s.startedAt >= today).length;

    return {
      totalCommands: voiceStore.get('totalCommandsExecuted'),
      lastUsed: voiceStore.get('lastUsed'),
      sessionsToday,
    };
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------

  getConfig(): VoiceControlConfig {
    return voiceStore.get('config');
  }

  async updateConfig(updates: Partial<VoiceControlConfig>): Promise<VoiceControlConfig> {
    const config = voiceStore.get('config');
    const updated = { ...config, ...updates };
    
    // Validate
    if (updated.maxListeningDurationMs < 5000) {
      updated.maxListeningDurationMs = 5000;
    }
    if (updated.maxListeningDurationMs > 120000) {
      updated.maxListeningDurationMs = 120000;
    }

    voiceStore.set('config', updated);

    // Handle enable/disable changes
    if (updates.enabled !== undefined) {
      if (updates.enabled && !config.enabled) {
        await this.enable();
      } else if (!updates.enabled && config.enabled) {
        await this.disable();
      }
    }

    return updated;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const voiceControlEngine = VoiceControlEngine.getInstance();
export default voiceControlEngine;
