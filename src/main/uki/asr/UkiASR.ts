// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI ASR (Automatic Speech Recognition)
// WebSpeech API primary, whisper.cpp / Whisper API fallback
// ===========================================================================

import { EventEmitter } from 'events';

export interface ASRResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

/**
 * UkiASR wraps the browser's webkitSpeechRecognition API.
 * Runs in the RENDERER process (SpeechRecognition is a Web API).
 * Sends results to the main process via IPC for the pipeline.
 *
 * For main-process usage, the renderer bridges results through
 * window.electron.invoke('uki:transcript', text).
 */
class UkiASREngine extends EventEmitter {
  private static _instance: UkiASREngine;
  private recognition: any = null;
  private listening = false;

  private constructor() {
    super();
    this.setMaxListeners(10);
  }

  static getInstance(): UkiASREngine {
    if (!UkiASREngine._instance) {
      UkiASREngine._instance = new UkiASREngine();
    }
    return UkiASREngine._instance;
  }

  /** Check if WebSpeech API is available in this environment. */
  isAvailable(): boolean {
    return typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }

  /**
   * Start recognition. Renderer-only.
   * Returns false if unavailable.
   */
  start(lang = 'en-US'): boolean {
    if (this.listening) return true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.emit('error', 'SpeechRecognition not available');
      return false;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = lang;
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const result: ASRResult = {
          text: r[0].transcript.trim(),
          confidence: r[0].confidence || 0.9,
          isFinal: r.isFinal,
        };
        this.emit(r.isFinal ? 'result' : 'partial', result);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        this.emit('error', event.error);
      }
    };

    this.recognition.onend = () => {
      this.listening = false;
      this.emit('ended');
    };

    try {
      this.recognition.start();
      this.listening = true;
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    if (!this.listening || !this.recognition) return;
    try { this.recognition.stop(); } catch (e) { console.warn('[UkiASR] stop failed:', e); }
    this.listening = false;
  }

  abort(): void {
    if (!this.recognition) return;
    try { this.recognition.abort(); } catch (e) { console.warn('[UkiASR] abort failed:', e); }
    this.listening = false;
  }

  get isListening(): boolean { return this.listening; }
}

// Main-process stub — just re-exports the class so UkiEngine can import it
// Actual recognition runs in renderer and bridges via IPC
export class UkiASR {
  private static _instance: UkiASR;
  static getInstance(): UkiASR {
    if (!UkiASR._instance) UkiASR._instance = new UkiASR();
    return UkiASR._instance;
  }
}

export { UkiASREngine };
