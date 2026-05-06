// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Configuration
// Persistent settings for UKI voice assistant
// ===========================================================================

import Store from 'electron-store';

export interface UkiConfigData {
  enabled: boolean;
  /** ASR provider: 'webspeech' (default) | 'whisper-local' | 'whisper-api' */
  asrProvider: 'webspeech' | 'whisper-local' | 'whisper-api';
  /** TTS rate (0.5 - 2.0) */
  ttsRate: number;
  /** TTS pitch (0.5 - 2.0) */
  ttsPitch: number;
  /** TTS volume (0 - 1) */
  ttsVolume: number;
  /** Preferred TTS voice name (platform-dependent) */
  ttsVoice: string;
  /** Keyboard shortcut to activate */
  shortcut: string;
  /** Wake word enabled */
  wakeWordEnabled: boolean;
  /** Custom wake phrase */
  wakePhrase: string;
  /** Personality: formal or casual */
  personality: 'formal' | 'casual';
  /** Max silence before auto-stop (ms) */
  silenceTimeoutMs: number;
  /** Max listening duration (ms) */
  maxListenMs: number;
  /** Confirm destructive actions */
  confirmDestructive: boolean;
  /** Show transcript bubble */
  showTranscript: boolean;

  // --- Memory & Context ---
  /** Max context cache on disk in GB (1-32, default 3) */
  contextCacheSizeGB: number;
  /** Days to keep memory records (1-365, default 30) */
  contextRetentionDays: number;
  /** Recall mode: 'auto' | 'explicit' | 'hybrid' */
  recallMode: 'auto' | 'explicit' | 'hybrid';
  /** Auto-cleanup enabled */
  autoCleanupEnabled: boolean;
  /** Cleanup interval in hours (1-168, default 24) */
  cleanupIntervalHours: number;
  /** Enable memory recording */
  memoryEnabled: boolean;
}

const DEFAULT_CONFIG: UkiConfigData = {
  enabled: true,
  asrProvider: 'webspeech',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVolume: 0.8,
  ttsVoice: '',
  shortcut: 'CommandOrControl+Space',
  wakeWordEnabled: false,
  wakePhrase: 'Hey UKI',
  personality: 'casual',
  silenceTimeoutMs: 3000,
  maxListenMs: 30000,
  confirmDestructive: true,
  showTranscript: true,
  contextCacheSizeGB: 3,
  contextRetentionDays: 30,
  recallMode: 'hybrid',
  autoCleanupEnabled: true,
  cleanupIntervalHours: 24,
  memoryEnabled: true,
};

class UkiConfig {
  private static instance: UkiConfig;
  private store: Store<{ ukiConfig: UkiConfigData }>;
  private config: UkiConfigData;

  private constructor() {
    this.store = new Store<{ ukiConfig: UkiConfigData }>({
      name: 'uki-config',
      defaults: { ukiConfig: DEFAULT_CONFIG },
      encryptionKey: 'dex-uki-config-v1',
    });
    this.config = this.store.get('ukiConfig', DEFAULT_CONFIG);
  }

  static getInstance(): UkiConfig {
    if (!UkiConfig.instance) {
      UkiConfig.instance = new UkiConfig();
    }
    return UkiConfig.instance;
  }

  get(): UkiConfigData {
    return { ...this.config };
  }

  update(partial: Partial<UkiConfigData>): UkiConfigData {
    // Validate bounds on numeric fields
    const safe: Partial<UkiConfigData> = {};
    if (partial.enabled !== undefined && typeof partial.enabled === 'boolean') safe.enabled = partial.enabled;
    if (partial.asrProvider !== undefined && ['webspeech', 'whisper-local', 'whisper-api'].includes(partial.asrProvider)) safe.asrProvider = partial.asrProvider;
    if (partial.ttsRate !== undefined && typeof partial.ttsRate === 'number') safe.ttsRate = Math.max(0.5, Math.min(2, partial.ttsRate));
    if (partial.ttsPitch !== undefined && typeof partial.ttsPitch === 'number') safe.ttsPitch = Math.max(0.5, Math.min(2, partial.ttsPitch));
    if (partial.ttsVolume !== undefined && typeof partial.ttsVolume === 'number') safe.ttsVolume = Math.max(0, Math.min(1, partial.ttsVolume));
    if (partial.ttsVoice !== undefined && typeof partial.ttsVoice === 'string') safe.ttsVoice = partial.ttsVoice.slice(0, 200);
    if (partial.shortcut !== undefined && typeof partial.shortcut === 'string') safe.shortcut = partial.shortcut.slice(0, 100);
    if (partial.wakeWordEnabled !== undefined && typeof partial.wakeWordEnabled === 'boolean') safe.wakeWordEnabled = partial.wakeWordEnabled;
    if (partial.wakePhrase !== undefined && typeof partial.wakePhrase === 'string') safe.wakePhrase = partial.wakePhrase.slice(0, 50);
    if (partial.personality !== undefined && ['formal', 'casual'].includes(partial.personality)) safe.personality = partial.personality;
    if (partial.silenceTimeoutMs !== undefined && typeof partial.silenceTimeoutMs === 'number') safe.silenceTimeoutMs = Math.max(1000, Math.min(30000, partial.silenceTimeoutMs));
    if (partial.maxListenMs !== undefined && typeof partial.maxListenMs === 'number') safe.maxListenMs = Math.max(5000, Math.min(120000, partial.maxListenMs));
    if (partial.confirmDestructive !== undefined && typeof partial.confirmDestructive === 'boolean') safe.confirmDestructive = partial.confirmDestructive;
    if (partial.showTranscript !== undefined && typeof partial.showTranscript === 'boolean') safe.showTranscript = partial.showTranscript;
    if (partial.contextCacheSizeGB !== undefined && typeof partial.contextCacheSizeGB === 'number') safe.contextCacheSizeGB = Math.max(1, Math.min(32, partial.contextCacheSizeGB));
    if (partial.contextRetentionDays !== undefined && typeof partial.contextRetentionDays === 'number') safe.contextRetentionDays = Math.max(1, Math.min(365, partial.contextRetentionDays));
    if (partial.recallMode !== undefined && ['auto', 'explicit', 'hybrid'].includes(partial.recallMode)) safe.recallMode = partial.recallMode;
    if (partial.autoCleanupEnabled !== undefined && typeof partial.autoCleanupEnabled === 'boolean') safe.autoCleanupEnabled = partial.autoCleanupEnabled;
    if (partial.cleanupIntervalHours !== undefined && typeof partial.cleanupIntervalHours === 'number') safe.cleanupIntervalHours = Math.max(1, Math.min(168, partial.cleanupIntervalHours));
    if (partial.memoryEnabled !== undefined && typeof partial.memoryEnabled === 'boolean') safe.memoryEnabled = partial.memoryEnabled;
    this.config = { ...this.config, ...safe };
    this.store.set('ukiConfig', this.config);
    return this.get();
  }

  reset(): UkiConfigData {
    this.config = { ...DEFAULT_CONFIG };
    this.store.set('ukiConfig', this.config);
    return this.get();
  }
}

export const ukiConfig = UkiConfig.getInstance();
export { UkiConfig };
