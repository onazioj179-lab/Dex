// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI TTS (Text-to-Speech)
// Web Speech API speechSynthesis wrapper
// ===========================================================================

import { EventEmitter } from 'events';

/**
 * UkiTTS wraps the browser's speechSynthesis API.
 * In Electron, speechSynthesis is available in the renderer process.
 * For the main process, we send TTS requests to the renderer via IPC.
 */

class UkiTTSEngine extends EventEmitter {
  private static _instance: UkiTTSEngine;
  private speaking = false;
  private rate = 1.0;
  private pitch = 1.0;
  private volume = 0.8;
  private voiceName = '';

  private constructor() {
    super();
    this.setMaxListeners(10);
  }

  static getInstance(): UkiTTSEngine {
    if (!UkiTTSEngine._instance) UkiTTSEngine._instance = new UkiTTSEngine();
    return UkiTTSEngine._instance;
  }

  configure(opts: { rate?: number; pitch?: number; volume?: number; voice?: string }): void {
    if (opts.rate !== undefined) this.rate = Math.max(0.5, Math.min(2, opts.rate));
    if (opts.pitch !== undefined) this.pitch = Math.max(0.5, Math.min(2, opts.pitch));
    if (opts.volume !== undefined) this.volume = Math.max(0, Math.min(1, opts.volume));
    if (opts.voice !== undefined) this.voiceName = opts.voice;
  }

  /**
   * Speak text. Renderer-only (uses window.speechSynthesis).
   */
  speak(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      // Main process context — emit for IPC bridge to handle
      this.emit('speakRequest', text);
      return;
    }

    // Cancel any in-progress speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    // Pick voice
    if (this.voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.name === this.voiceName || v.name.includes(this.voiceName));
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => { this.speaking = true; };
    utterance.onend = () => {
      this.speaking = false;
      this.emit('ended');
    };
    utterance.onerror = () => {
      this.speaking = false;
      this.emit('ended');
    };

    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
    this.emit('ended');
  }

  get isSpeaking(): boolean { return this.speaking; }

  /** Get available voices (renderer only). */
  getVoices(): Array<{ name: string; lang: string }> {
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang }));
  }
}

// Main-process stub so UkiEngine can import without crashing
class UkiTTSStub extends EventEmitter {
  private static _instance: UkiTTSStub;
  private mainWindow: any = null;
  private speaking = false;
  private fallbackEndTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    super();
    this.on('ended', () => {
      this.speaking = false;
      if (this.fallbackEndTimer) {
        clearTimeout(this.fallbackEndTimer);
        this.fallbackEndTimer = null;
      }
    });
  }

  static getInstance(): UkiTTSStub {
    if (!UkiTTSStub._instance) UkiTTSStub._instance = new UkiTTSStub();
    return UkiTTSStub._instance;
  }

  setWindow(win: any): void { this.mainWindow = win; }

  speak(text: string): void {
    // Send to renderer for actual speech
    try {
      this.mainWindow?.webContents?.send('uki:tts:speak', text);
    } catch { /* no window */ }
    this.speaking = true;
    if (this.fallbackEndTimer) {
      clearTimeout(this.fallbackEndTimer);
      this.fallbackEndTimer = null;
    }
    // Renderer should emit uki:tts:ended on real completion.
    // Keep a conservative fallback so the state cannot get stuck forever.
    const words = text.split(/\s+/).length;
    const durationMs = Math.max(4000, words * 260);
    this.fallbackEndTimer = setTimeout(() => {
      if (this.speaking) {
        this.emit('ended');
      }
    }, durationMs);
  }

  stop(): void {
    try {
      this.mainWindow?.webContents?.send('uki:tts:stop');
    } catch (e) { console.warn('[UkiTTS] stop send failed:', e); }
    this.speaking = false;
    if (this.fallbackEndTimer) {
      clearTimeout(this.fallbackEndTimer);
      this.fallbackEndTimer = null;
    }
    this.emit('ended');
  }

  get isSpeaking(): boolean { return this.speaking; }
}

export const UkiTTS = UkiTTSStub;
export { UkiTTSEngine };
