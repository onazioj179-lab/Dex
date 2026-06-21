// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audio playback + capture service (ROADMAP-600 §3.S #551–#552). Wraps the
 * Web Audio API so DEX audio surfaces (Imosion, the Audio page) get real
 * playback **out** (AudioContext → GainNode → AnalyserNode → destination) and
 * microphone capture **in** (MediaRecorder → Blob). Volume uses the shared
 * `dbToGain` curve so levels match the DSP core.
 *
 * This is the thin renderer adapter over the pure `shared/audio` primitives.
 */

import { dbToGain } from '../../../shared/audio/dsp';
import { createMeterState, updateMeter, type MeterState } from '../../../shared/audio/levelMeter';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';

export interface PlaybackState {
  status: PlaybackStatus;
  durationSec: number;
  positionSec: number;
  volumeDb: number;
}

type Listener = (state: PlaybackState) => void;

function clampOffset(sec: number, durationSec: number): number {
  if (!Number.isFinite(sec)) return 0;
  return Math.min(Math.max(0, sec), durationSec);
}

export class AudioPlaybackService {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private startedAt = 0; // ctx.currentTime when playback (re)started
  private offset = 0;     // seconds into the buffer at last start
  private volumeDb = 0;
  private status: PlaybackStatus = 'idle';
  private readonly listeners = new Set<Listener>();

  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private meterState: MeterState = createMeterState();
  private loopRegion: { start: number; end: number } | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.applyVolume();
    }
    return this.ctx;
  }

  /** Decode audio from a URL or ArrayBuffer. Returns duration in seconds. */
  async load(src: ArrayBuffer | string): Promise<number> {
    const ctx = this.ensureContext();
    this.setStatus('loading');
    const data = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : src.slice(0);
    this.buffer = await ctx.decodeAudioData(data);
    this.offset = 0;
    this.setStatus('stopped');
    return this.buffer.duration;
  }

  /**
   * Start (or restart) playback, optionally from a given second. When
   * `fadeInSec` is given the master gain ramps up from silence so the onset
   * isn't abrupt — mirrors the fade-out crossfade callers apply on the way out.
   */
  play(fromSec?: number, fadeInSec = 0): void {
    const ctx = this.ensureContext();
    if (!this.buffer || !this.gain) return;
    if (this.status === 'playing') this.stopSource();
    if (fromSec !== undefined) this.offset = clampOffset(fromSec, this.buffer.duration);

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    if (this.loopRegion) {
      source.loop = true;
      source.loopStart = this.loopRegion.start;
      source.loopEnd = this.loopRegion.end;
    }
    source.onended = () => {
      if (this.status === 'playing') { this.offset = 0; this.setStatus('stopped'); }
    };
    source.start(0, this.offset);
    this.source = source;
    this.startedAt = ctx.currentTime;
    if (ctx.state === 'suspended') void ctx.resume();
    if (fadeInSec > 0) this.fadeInGain(fadeInSec);
    this.setStatus('playing');
  }

  /**
   * Ramp the master gain from near-silence up to the current volume over
   * `seconds`. Exponential ramps can't target or start from 0, so we seed an
   * epsilon and finish with the real target gain.
   */
  private fadeInGain(seconds: number): void {
    if (!this.gain || !this.ctx) return;
    const target = Math.max(0.0001, dbToGain(this.volumeDb));
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.gain.exponentialRampToValueAtTime(target, now + seconds);
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.offset = this.positionSec();
    this.stopSource();
    this.setStatus('paused');
  }

  resume(): void {
    if (this.status === 'paused') this.play(this.offset);
  }

  stop(): void {
    this.offset = 0;
    this.stopSource();
    this.setStatus('stopped');
  }

  seek(sec: number): void {
    if (!this.buffer) return;
    const wasPlaying = this.status === 'playing';
    this.offset = clampOffset(sec, this.buffer.duration);
    if (wasPlaying) this.play(this.offset);
    else this.emit();
  }

  setVolumeDb(db: number): void {
    this.volumeDb = db;
    this.applyVolume();
    this.emit();
  }

  /** Set volume from a 0..1 fraction (UI sliders / system volume). */
  setVolume01(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.setVolumeDb(f <= 0 ? -120 : 20 * Math.log10(f));
  }

  /** Loop a region (seconds). Applies on the next/current source — ROADMAP #559. */
  setLoop(startSec: number, endSec: number): void {
    if (endSec > startSec) {
      this.loopRegion = { start: Math.max(0, startSec), end: endSec };
      if (this.source) {
        this.source.loop = true;
        this.source.loopStart = this.loopRegion.start;
        this.source.loopEnd = this.loopRegion.end;
      }
    }
  }

  clearLoop(): void {
    this.loopRegion = null;
    if (this.source) this.source.loop = false;
  }

  isLooping(): boolean {
    return this.loopRegion !== null;
  }

  /** Peak level in [0,1] from the analyser — drive a level meter with this. */
  peakLevel(): number {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i]));
    return peak;
  }

  /** Full meter state (peak/RMS/LUFS/true-peak + clip + hold) — ROADMAP #555. */
  meter(): MeterState {
    if (!this.analyser) return this.meterState;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    this.meterState = updateMeter(this.meterState, buf);
    return this.meterState;
  }

  positionSec(): number {
    if (!this.ctx || !this.buffer || this.status !== 'playing') return this.offset;
    return Math.min(this.buffer.duration, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  getState(): PlaybackState {
    return {
      status: this.status,
      durationSec: this.buffer?.duration ?? 0,
      positionSec: this.positionSec(),
      volumeDb: this.volumeDb,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => { this.listeners.delete(fn); };
  }

  // -------- capture ("in") --------------------------------------------------

  /** Begin recording from the default microphone. */
  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recChunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) this.recChunks.push(e.data); };
    recorder.start();
    this.recorder = recorder;
  }

  /** Stop recording and resolve the captured audio Blob (caller persists it). */
  async stopRecording(): Promise<Blob> {
    return new Promise<Blob>((resolve) => {
      const recorder = this.recorder;
      if (!recorder) { resolve(new Blob([], { type: 'audio/webm' })); return; }
      recorder.onstop = () => {
        const blob = new Blob(this.recChunks, { type: recorder.mimeType || 'audio/webm' });
        recorder.stream.getTracks().forEach((t) => t.stop());
        this.recorder = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  dispose(): void {
    this.stopSource();
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
    this.gain = null;
    this.analyser = null;
    this.listeners.clear();
  }

  private applyVolume(): void {
    if (this.gain && this.ctx) {
      this.gain.gain.setValueAtTime(dbToGain(this.volumeDb), this.ctx.currentTime);
    }
  }

  private stopSource(): void {
    if (this.source) {
      try { this.source.onended = null; this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  private setStatus(status: PlaybackStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }
}

// ---------------------------------------------------------------------------
// App-wide singleton — the shared master playback service surfaces adopt.
// ---------------------------------------------------------------------------

let _instance: AudioPlaybackService | null = null;

export function getAudioPlaybackService(): AudioPlaybackService {
  if (!_instance) _instance = new AudioPlaybackService();
  return _instance;
}
