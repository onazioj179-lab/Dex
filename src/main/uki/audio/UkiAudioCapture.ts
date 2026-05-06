// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Audio Capture
// Renderer-side mic capture with VAD, streams to main process via IPC
// ===========================================================================

/**
 * AudioCapture runs in the RENDERER process.
 * It handles getUserMedia, Voice Activity Detection, and sends
 * audio level + silence events to the UKI store / main process.
 */

export interface AudioCaptureCallbacks {
  onAudioLevel: (level: number) => void;
  onSilence: () => void;
  onError: (err: string) => void;
}

const SILENCE_THRESHOLD = 0.015;
const SILENCE_FRAMES = 45; // ~3s at ~15fps analysis rate

class UkiAudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;
  private silentFrames = 0;
  private active = false;
  private callbacks: AudioCaptureCallbacks | null = null;

  async start(callbacks: AudioCaptureCallbacks): Promise<boolean> {
    if (this.active) return true;
    this.callbacks = callbacks;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioCtx = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      this.source.connect(this.analyser);

      this.silentFrames = 0;
      this.active = true;
      this.tick();
      return true;
    } catch (err: any) {
      callbacks.onError(err?.message || 'Microphone access denied');
      return false;
    }
  }

  stop(): void {
    this.active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.source) { try { this.source.disconnect(); } catch { /* already disconnected */ } this.source = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch { /* already closed */ } this.audioCtx = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.analyser = null;
    this.callbacks = null;
  }

  get isActive(): boolean { return this.active; }

  private tick = (): void => {
    if (!this.active || !this.analyser || !this.callbacks) return;

    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);

    // RMS energy
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    this.callbacks.onAudioLevel(rms);

    if (rms < SILENCE_THRESHOLD) {
      this.silentFrames++;
      if (this.silentFrames >= SILENCE_FRAMES) {
        this.callbacks.onSilence();
        this.silentFrames = 0; // reset so it doesn't fire repeatedly
      }
    } else {
      this.silentFrames = 0;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}

export const ukiAudioCapture = new UkiAudioCapture();
