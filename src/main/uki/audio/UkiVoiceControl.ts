// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Voice Control Enhancements
// Advanced voice control features: continuous listening, command chaining,
// contextual commands, voice feedback, and adaptive recognition
// ===========================================================================

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceCommandResult {
  text: string;
  confidence: number;
  timestamp: number;
  context?: string;
}

export interface VoiceControlState {
  isListening: boolean;
  isSpeaking: boolean;
  lastCommand: string | null;
  lastCommandTime: number;
  contextStack: string[];
  pendingConfirmation: boolean;
}

export interface VoiceControlConfig {
  continuousListening: boolean;
  commandChaining: boolean;
  voiceFeedback: boolean;
  adaptiveThreshold: boolean;
  wakeWordEnabled: boolean;
  silenceTimeout: number;
  commandTimeout: number;
}

// ---------------------------------------------------------------------------
// Voice Control Manager
// ---------------------------------------------------------------------------

class UkiVoiceControlManager extends EventEmitter {
  private static _instance: UkiVoiceControlManager;
  private state: VoiceControlState = {
    isListening: false,
    isSpeaking: false,
    lastCommand: null,
    lastCommandTime: 0,
    contextStack: [],
    pendingConfirmation: false,
  };

  private config: VoiceControlConfig = {
    continuousListening: true,
    commandChaining: true,
    voiceFeedback: true,
    adaptiveThreshold: true,
    wakeWordEnabled: true,
    silenceTimeout: 3000,
    commandTimeout: 10000,
  };

  // Command chaining buffer
  private chainBuffer: string[] = [];
  private chainTimer: ReturnType<typeof setTimeout> | null = null;

  // Adaptive recognition
  private recognitionHistory: { text: string; success: boolean; timestamp: number }[] = [];
  private userVocabulary: Set<string> = new Set();

  private constructor() {
    super();
    this.setMaxListeners(20);
  }

  static getInstance(): UkiVoiceControlManager {
    if (!UkiVoiceControlManager._instance) {
      UkiVoiceControlManager._instance = new UkiVoiceControlManager();
    }
    return UkiVoiceControlManager._instance;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  configure(config: Partial<VoiceControlConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config-changed', this.config);
  }

  getConfig(): VoiceControlConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  getState(): VoiceControlState {
    return { ...this.state };
  }

  setListening(listening: boolean): void {
    this.state.isListening = listening;
    this.emit('listening-changed', listening);
  }

  setSpeaking(speaking: boolean): void {
    this.state.isSpeaking = speaking;
    this.emit('speaking-changed', speaking);
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  pushContext(context: string): void {
    this.state.contextStack.push(context);
    this.emit('context-changed', this.state.contextStack);
  }

  popContext(): string | undefined {
    const ctx = this.state.contextStack.pop();
    this.emit('context-changed', this.state.contextStack);
    return ctx;
  }

  getCurrentContext(): string | null {
    return this.state.contextStack[this.state.contextStack.length - 1] || null;
  }

  clearContext(): void {
    this.state.contextStack = [];
    this.emit('context-changed', this.state.contextStack);
  }

  // ---------------------------------------------------------------------------
  // Command Processing
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming voice command with context awareness
   */
  processCommand(text: string, confidence: number): VoiceCommandResult {
    const result: VoiceCommandResult = {
      text: text.trim().toLowerCase(),
      confidence,
      timestamp: Date.now(),
      context: this.getCurrentContext() || undefined,
    };

    this.state.lastCommand = result.text;
    this.state.lastCommandTime = result.timestamp;

    // Check for command chaining
    if (this.config.commandChaining && this.isChainableCommand(result.text)) {
      this.addToChain(result.text);
      return result;
    }

    // Check for context-specific commands
    if (this.state.contextStack.length > 0) {
      result.text = this.contextualizeCommand(result.text);
    }

    // Track for adaptive learning
    this.trackRecognition(result.text, true);

    // Emit processed command
    this.emit('command', result);

    return result;
  }

  /**
   * Check if command can be chained with others
   */
  private isChainableCommand(text: string): boolean {
    // Commands ending with "and" or "then" can be chained
    return /\b(?:and|then|also|next)\s*$/.test(text);
  }

  /**
   * Add command to chain buffer
   */
  private addToChain(text: string): void {
    // Remove chaining word
    const cleaned = text.replace(/\s*\b(?:and|then|also|next)\s*$/, '');
    this.chainBuffer.push(cleaned);

    // Reset chain timer
    if (this.chainTimer) clearTimeout(this.chainTimer);
    this.chainTimer = setTimeout(() => this.executeChain(), this.config.silenceTimeout);
  }

  /**
   * Execute all chained commands
   */
  private executeChain(): void {
    if (this.chainBuffer.length === 0) return;

    const commands = [...this.chainBuffer];
    this.chainBuffer = [];
    this.chainTimer = null;

    this.emit('chain-execute', commands);
  }

  /**
   * Add context-specific modifiers to command
   */
  private contextualizeCommand(text: string): string {
    const context = this.getCurrentContext();
    if (!context) return text;

    // Map context to command prefix/suffix
    const contextMappings: Record<string, (cmd: string) => string> = {
      'axl': (cmd) => cmd.includes('in axl') ? cmd : `${cmd} in axl`,
      'imosion': (cmd) => cmd.includes('in imosion') ? cmd : `${cmd} in imosion`,
      'videoeditor': (cmd) => cmd.includes('in vinx') ? cmd : `${cmd} in vinx`,
      'prism': (cmd) => cmd.includes('in prism') ? cmd : `${cmd} in prism`,
      'flux': (cmd) => cmd.includes('in flux') ? cmd : `${cmd} in flux`,
      'forge': (cmd) => cmd.includes('in forge') ? cmd : `${cmd} in forge`,
      'files': (cmd) => cmd.includes('file') ? cmd : `file ${cmd}`,
      'notes': (cmd) => cmd.includes('note') ? cmd : `note ${cmd}`,
    };

    const mapper = contextMappings[context];
    return mapper ? mapper(text) : text;
  }

  // ---------------------------------------------------------------------------
  // Adaptive Learning
  // ---------------------------------------------------------------------------

  /**
   * Track recognition results for adaptive learning
   */
  trackRecognition(text: string, success: boolean): void {
    this.recognitionHistory.push({
      text,
      success,
      timestamp: Date.now(),
    });

    // Keep last 100 results
    if (this.recognitionHistory.length > 100) {
      this.recognitionHistory.shift();
    }

    // Extract words for vocabulary
    if (success) {
      const words = text.split(/\s+/);
      words.forEach(w => this.userVocabulary.add(w.toLowerCase()));
    }
  }

  /**
   * Get suggested corrections based on user vocabulary
   */
  suggestCorrection(text: string): string | null {
    const words = text.split(/\s+/);
    const corrected: string[] = [];
    let changed = false;

    for (const word of words) {
      const lower = word.toLowerCase();
      
      // Check if word is in vocabulary
      if (this.userVocabulary.has(lower)) {
        corrected.push(word);
        continue;
      }

      // Find closest match in vocabulary
      let bestMatch = word;
      let bestDistance = Infinity;

      for (const vocabWord of this.userVocabulary) {
        const dist = this.levenshtein(lower, vocabWord);
        if (dist < bestDistance && dist <= 2) {
          bestDistance = dist;
          bestMatch = vocabWord;
          changed = true;
        }
      }

      corrected.push(bestMatch);
    }

    return changed ? corrected.join(' ') : null;
  }

  /**
   * Simple Levenshtein distance
   */
  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[b.length][a.length];
  }

  // ---------------------------------------------------------------------------
  // Voice Feedback
  // ---------------------------------------------------------------------------

  /**
   * Generate voice feedback message based on action
   */
  generateFeedback(action: string, success: boolean, details?: string): string {
    if (!this.config.voiceFeedback) return '';

    const successMessages: Record<string, string[]> = {
      'open': ['Opening', 'Launching', 'Starting'],
      'close': ['Closing', 'Shutting down'],
      'create': ['Creating', 'Making'],
      'save': ['Saved', 'Project saved'],
      'export': ['Exporting', 'Rendering'],
      'undo': ['Undone', 'Reverted'],
      'redo': ['Redone', 'Restored'],
      'play': ['Playing', 'Starting playback'],
      'pause': ['Paused', 'Stopping playback'],
      'default': ['Done', 'Got it', 'Okay'],
    };

    const errorMessages: Record<string, string[]> = {
      'not-found': ['I couldn\'t find that', 'Not found'],
      'not-available': ['That\'s not available right now'],
      'error': ['Something went wrong', 'There was an error'],
      'default': ['I couldn\'t do that', 'That didn\'t work'],
    };

    if (success) {
      const messages = successMessages[action] || successMessages['default'];
      const base = messages[Math.floor(Math.random() * messages.length)];
      return details ? `${base} ${details}` : base;
    } else {
      const messages = errorMessages[action] || errorMessages['default'];
      const base = messages[Math.floor(Math.random() * messages.length)];
      return details ? `${base}: ${details}` : base;
    }
  }

  // ---------------------------------------------------------------------------
  // Confirmation Handling
  // ---------------------------------------------------------------------------

  /**
   * Request confirmation for a command
   */
  requestConfirmation(prompt: string): void {
    this.state.pendingConfirmation = true;
    this.emit('confirmation-request', prompt);
  }

  /**
   * Handle confirmation response
   */
  handleConfirmation(confirmed: boolean): void {
    this.state.pendingConfirmation = false;
    this.emit('confirmation-response', confirmed);
  }

  /**
   * Check if waiting for confirmation
   */
  isPendingConfirmation(): boolean {
    return this.state.pendingConfirmation;
  }

  // ---------------------------------------------------------------------------
  // Quick Commands (shortcuts)
  // ---------------------------------------------------------------------------

  /**
   * Map of quick command aliases
   */
  private quickCommands: Record<string, string> = {
    // Single word shortcuts
    'help': 'what can you do',
    'back': 'go back',
    'home': 'go home',
    'louder': 'volume up',
    'quieter': 'volume down',
    'mute': 'toggle mute',
    'screenshot': 'take a screenshot',
    'lock': 'lock screen',
    
    // App shortcuts
    'edit': 'open video editor',
    'music': 'open imosion',
    'model': 'open axl',
    'photo': 'open prism',
    'motion': 'open flux',
    'encode': 'open forge',
    
    // Action shortcuts
    'record': 'start recording',
    'stop': 'stop playback',
    'play': 'start playback',
    'render': 'export project',
  };

  /**
   * Expand quick command to full command
   */
  expandQuickCommand(text: string): string {
    const lower = text.toLowerCase().trim();
    return this.quickCommands[lower] || text;
  }

  /**
   * Add custom quick command
   */
  addQuickCommand(alias: string, command: string): void {
    this.quickCommands[alias.toLowerCase()] = command;
  }

  /**
   * Remove quick command
   */
  removeQuickCommand(alias: string): void {
    delete this.quickCommands[alias.toLowerCase()];
  }

  /**
   * Get all quick commands
   */
  getQuickCommands(): Record<string, string> {
    return { ...this.quickCommands };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const UkiVoiceControl = UkiVoiceControlManager.getInstance();

export default UkiVoiceControlManager;
