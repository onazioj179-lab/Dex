// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Voice Feedback System
// Phase 46: Visual and optional audio feedback for voice commands
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain, BrowserWindow } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export type FeedbackType = 
  | 'listening-start'
  | 'listening-stop'
  | 'transcript'
  | 'command-recognized'
  | 'command-executed'
  | 'command-failed'
  | 'confirmation-required'
  | 'permission-denied'
  | 'error';

export type FeedbackMode = 'visual' | 'spoken' | 'silent';

export interface FeedbackConfig {
  mode: FeedbackMode;
  showMicIndicator: boolean;
  showTranscript: boolean;
  showCommandPreview: boolean;
  playSuccessSound: boolean;
  playErrorSound: boolean;
  speakConfirmations: boolean;
  speakErrors: boolean;
  volume: number; // 0-100
}

export interface FeedbackMessage {
  type: FeedbackType;
  message: string;
  details?: string;
  timestamp: number;
  spoken: boolean;
}

// ===========================================================================
// SPOKEN RESPONSES (SHORT & FACTUAL)
// ===========================================================================

const SPOKEN_RESPONSES: Record<FeedbackType, string[]> = {
  'listening-start': ['Listening'],
  'listening-stop': ['Done'],
  'transcript': [], // Don't speak transcript back
  'command-recognized': ['Got it'],
  'command-executed': ['Done', 'Okay'],
  'command-failed': ['Failed'],
  'confirmation-required': ['Confirm?'],
  'permission-denied': ['Not allowed'],
  'error': ['Error'],
};

// ===========================================================================
// STORE
// ===========================================================================

const feedbackStore = new Store<{
  config: FeedbackConfig;
  history: FeedbackMessage[];
}>({
  name: 'voice-feedback',
  defaults: {
    config: {
      mode: 'visual', // Default to visual only
      showMicIndicator: true,
      showTranscript: true,
      showCommandPreview: true,
      playSuccessSound: false,
      playErrorSound: true,
      speakConfirmations: false,
      speakErrors: false,
      volume: 50,
    },
    history: [],
  },
});

// ===========================================================================
// VOICE FEEDBACK SYSTEM
// ===========================================================================

class VoiceFeedbackSystem {
  private static instance: VoiceFeedbackSystem;
  private initialized = false;
  private speechSynthesis: any = null;

  private constructor() {}

  static getInstance(): VoiceFeedbackSystem {
    if (!VoiceFeedbackSystem.instance) {
      VoiceFeedbackSystem.instance = new VoiceFeedbackSystem();
    }
    return VoiceFeedbackSystem.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupIPC();

    this.initialized = true;
    log.info('[VoiceFeedback] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('voiceFeedback:getConfig', () => this.getConfig());
    ipcMain.handle('voiceFeedback:updateConfig', (_, updates) => this.updateConfig(updates));
    ipcMain.handle('voiceFeedback:getHistory', (_, limit) => this.getHistory(limit));
    ipcMain.handle('voiceFeedback:clearHistory', () => this.clearHistory());
    ipcMain.handle('voiceFeedback:send', (_, type, message, details) => 
      this.sendFeedback(type, message, details)
    );
  }

  // -------------------------------------------------------------------------
  // FEEDBACK DELIVERY
  // -------------------------------------------------------------------------

  async sendFeedback(
    type: FeedbackType,
    message: string,
    details?: string
  ): Promise<void> {
    const config = feedbackStore.get('config');
    
    // Create feedback message
    const feedback: FeedbackMessage = {
      type,
      message,
      details,
      timestamp: Date.now(),
      spoken: false,
    };

    // Store in history
    this.recordFeedback(feedback);

    // Visual feedback (always sent to renderer)
    if (config.mode !== 'silent') {
      this.sendVisualFeedback(feedback, config);
    }

    // Spoken feedback (if enabled)
    if (config.mode === 'spoken' && this.shouldSpeak(type, config)) {
      const spoken = this.getSpokenResponse(type);
      if (spoken) {
        feedback.spoken = true;
        this.speak(spoken, config.volume);
      }
    }

    // Sound effects
    if (type === 'command-executed' && config.playSuccessSound) {
      this.playSound('success');
    } else if ((type === 'command-failed' || type === 'error') && config.playErrorSound) {
      this.playSound('error');
    }
  }

  private sendVisualFeedback(feedback: FeedbackMessage, config: FeedbackConfig): void {
    const windows = BrowserWindow.getAllWindows();
    
    const visualData = {
      type: feedback.type,
      message: feedback.message,
      details: feedback.details,
      showMicIndicator: config.showMicIndicator && 
        (feedback.type === 'listening-start' || feedback.type === 'listening-stop'),
      showTranscript: config.showTranscript && feedback.type === 'transcript',
      showCommandPreview: config.showCommandPreview && 
        feedback.type === 'command-recognized',
    };

    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voiceFeedback:visual', visualData);
      }
    }
  }

  private shouldSpeak(type: FeedbackType, config: FeedbackConfig): boolean {
    switch (type) {
      case 'command-executed':
        return config.speakConfirmations;
      case 'command-failed':
      case 'error':
      case 'permission-denied':
        return config.speakErrors;
      case 'confirmation-required':
        return config.speakConfirmations;
      default:
        return false;
    }
  }

  private getSpokenResponse(type: FeedbackType): string | null {
    const responses = SPOKEN_RESPONSES[type];
    if (!responses || responses.length === 0) return null;
    
    // Pick a random short response
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // -------------------------------------------------------------------------
  // TEXT-TO-SPEECH
  // -------------------------------------------------------------------------

  private speak(text: string, volume: number): void {
    // In Electron, we send to renderer for Web Speech API
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voiceFeedback:speak', {
          text,
          volume: volume / 100,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // SOUND EFFECTS
  // -------------------------------------------------------------------------

  private playSound(sound: 'success' | 'error' | 'start' | 'stop'): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('voiceFeedback:playSound', { sound });
      }
    }
  }

  // -------------------------------------------------------------------------
  // QUICK FEEDBACK METHODS
  // -------------------------------------------------------------------------

  listeningStarted(): void {
    this.sendFeedback('listening-start', 'Listening...');
  }

  listeningStopped(): void {
    this.sendFeedback('listening-stop', 'Stopped listening');
  }

  transcriptReceived(transcript: string): void {
    this.sendFeedback('transcript', transcript);
  }

  commandRecognized(command: string): void {
    this.sendFeedback('command-recognized', command, 'Command recognized');
  }

  commandExecuted(command: string, result: string): void {
    this.sendFeedback('command-executed', result, `Executed: ${command}`);
  }

  commandFailed(command: string, error: string): void {
    this.sendFeedback('command-failed', error, `Failed: ${command}`);
  }

  confirmationRequired(command: string, risk: string): void {
    this.sendFeedback('confirmation-required', `Confirm ${command}?`, `Risk: ${risk}`);
  }

  permissionDenied(scope: string): void {
    this.sendFeedback('permission-denied', `Permission required: ${scope}`);
  }

  error(message: string): void {
    this.sendFeedback('error', message);
  }

  // -------------------------------------------------------------------------
  // HISTORY
  // -------------------------------------------------------------------------

  private recordFeedback(feedback: FeedbackMessage): void {
    const history = feedbackStore.get('history');
    history.push(feedback);
    
    // Keep last 100 feedback messages
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    feedbackStore.set('history', history);
  }

  getHistory(limit: number = 20): FeedbackMessage[] {
    return feedbackStore.get('history').slice(-limit);
  }

  async clearHistory(): Promise<boolean> {
    feedbackStore.set('history', []);
    return true;
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------

  getConfig(): FeedbackConfig {
    return feedbackStore.get('config');
  }

  async updateConfig(updates: Partial<FeedbackConfig>): Promise<FeedbackConfig> {
    const config = feedbackStore.get('config');
    const updated = { ...config, ...updates };
    
    // Validate volume
    if (updated.volume < 0) updated.volume = 0;
    if (updated.volume > 100) updated.volume = 100;
    
    feedbackStore.set('config', updated);
    return updated;
  }

  setMode(mode: FeedbackMode): void {
    const config = feedbackStore.get('config');
    config.mode = mode;
    feedbackStore.set('config', config);
  }

  getMode(): FeedbackMode {
    return feedbackStore.get('config').mode;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const voiceFeedbackSystem = VoiceFeedbackSystem.getInstance();
export default voiceFeedbackSystem;
