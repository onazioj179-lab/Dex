// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Wake Word Detector
// Lightweight "Hey UKI" keyword detection via energy + frequency analysis
// ===========================================================================

import { EventEmitter } from 'events';

/**
 * Wake word detection using audio energy + spectral analysis.
 * Runs in the renderer process alongside AudioCapture.
 *
 * Detection pipeline:
 * 1. Energy gate: RMS must exceed threshold (filters silence/background noise)
 * 2. Spectral analysis: checks for formant patterns consistent with
 *    the vowels in "Hey UKI" — /eɪ/ (high F1/F2) then /uː/ then /iː/
 * 3. Duration check: speech burst must be 450ms–1.5s (typical for 2-word phrase)
 * 4. Cooldown: 2s between triggers to prevent rapid-fire
 *
 * This is a heuristic approach. For production,
 * consider Porcupine or a small ONNX keyword-spotting model.
 */

const COOLDOWN_MS = 2000;
const ENERGY_THRESHOLD = 0.04;
const MIN_SPEECH_FRAMES = 3;    // ~450ms minimum speech
const MAX_SPEECH_FRAMES = 10;   // ~1.5s maximum for a wake phrase
const ANALYSE_INTERVAL_MS = 150;

// Frequency band indices for 8kHz sample rate, fftSize=256 → binWidth = 8000/256 = 31.25 Hz
// Band 0: 0-500 Hz (low/fundamental), Band 1: 500-1500 Hz (F1 region), Band 2: 1500-3500 Hz (F2/sibilant region)
const BAND_EDGES = [0, 16, 48, 112]; // bin indices: 0, 500Hz, 1500Hz, 3500Hz

class UkiWakeWordDetector extends EventEmitter {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private lastTrigger = 0;
  private speechFrames = 0;
  private silenceFrames = 0;
  private enabled = false;

  // Spectral history for pattern matching during a speech burst
  private spectralHistory: { rms: number; bands: number[] }[] = [];

  async start(): Promise<boolean> {
    if (this.active) return true;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 8000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      this.audioCtx = new AudioContext({ sampleRate: 8000 });
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      this.source.connect(this.analyser);

      this.active = true;
      this.enabled = true;
      this.speechFrames = 0;
      this.silenceFrames = 0;
      this.spectralHistory = [];

      // Check every ~150ms
      this.intervalId = setInterval(() => this.analyze(), ANALYSE_INTERVAL_MS);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.active = false;
    this.enabled = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.source) { try { this.source.disconnect(); } catch { /* already disconnected */ } this.source = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch { /* already closed */ } this.audioCtx = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.analyser = null;
    this.spectralHistory = [];
  }

  get isActive(): boolean { return this.active; }

  private analyze(): void {
    if (!this.active || !this.analyser || !this.enabled) return;

    const timeBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(timeBuf);

    // Compute RMS energy
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sum / timeBuf.length);

    if (rms > ENERGY_THRESHOLD) {
      this.speechFrames++;
      this.silenceFrames = 0;

      // Compute frequency band energies for spectral shape
      const freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(freqBuf);
      const bands = this.computeBandEnergies(freqBuf);
      this.spectralHistory.push({ rms, bands });
    } else {
      if (this.speechFrames >= MIN_SPEECH_FRAMES && this.speechFrames <= MAX_SPEECH_FRAMES) {
        // Speech burst ended — check if it matches wake word pattern
        const now = Date.now();
        if (now - this.lastTrigger > COOLDOWN_MS && this.matchesWakeWordPattern()) {
          this.lastTrigger = now;
          this.emit('wakeword');
        }
      }
      this.speechFrames = 0;
      this.silenceFrames++;
      this.spectralHistory = [];
    }
  }

  /**
   * Compute energy in 3 frequency bands from the FFT magnitude spectrum.
   * Returns [lowBand, midBand, highBand] normalized energies.
   */
  private computeBandEnergies(freqData: Float32Array): number[] {
    const bands: number[] = [];
    for (let b = 0; b < BAND_EDGES.length - 1; b++) {
      let bandSum = 0;
      const start = BAND_EDGES[b];
      const end = BAND_EDGES[b + 1];
      for (let i = start; i < end && i < freqData.length; i++) {
        // freqData is in dB; convert to linear power
        const linear = Math.pow(10, freqData[i] / 20);
        bandSum += linear * linear;
      }
      bands.push(bandSum / (end - start));
    }
    // Normalize: make bands relative to total
    const total = bands.reduce((a, b) => a + b, 0) || 1;
    return bands.map(b => b / total);
  }

  /**
   * Simple spectral pattern matcher for "Hey UKI":
   * - "Hey" (/heɪ/): strong mid-frequency energy (F1 ~600Hz, F2 ~2000Hz)
   * - "UKI" (/uːkiː/): starts with low F2 (back vowel /u/), shifts to high F2 (front vowel /i/)
   *
   * We check that the spectral shape shifts during the utterance:
   * 1. First half should have elevated mid+high bands (the "Hey" vowel)
   * 2. Second half should show a shift from low-mid to high (U→I transition)
   * 3. Overall energy should be relatively consistent (not a random bump)
   */
  private matchesWakeWordPattern(): boolean {
    if (this.spectralHistory.length < MIN_SPEECH_FRAMES) return false;

    const half = Math.floor(this.spectralHistory.length / 2);
    const firstHalf = this.spectralHistory.slice(0, half);
    const secondHalf = this.spectralHistory.slice(half);

    // Average band ratios for each half
    const avgBands = (frames: typeof this.spectralHistory) => {
      const avg = [0, 0, 0];
      for (const f of frames) {
        avg[0] += f.bands[0];
        avg[1] += f.bands[1];
        avg[2] += f.bands[2];
      }
      return avg.map(v => v / frames.length);
    };

    const first = avgBands(firstHalf);
    const second = avgBands(secondHalf);

    // Criterion 1: First half should have significant mid/high energy (the open vowel "Hey")
    // Mid + High band should account for > 30% of energy
    const firstMidHigh = first[1] + first[2];
    if (firstMidHigh < 0.30) return false;

    // Criterion 2: There should be a spectral shift between halves
    // The high band ratio should change by at least 5% (U→I formant transition)
    const highBandShift = Math.abs(second[2] - first[2]);
    if (highBandShift < 0.05) return false;

    // Criterion 3: Energy should be reasonably consistent (not just a sharp click)
    const energies = this.spectralHistory.map(f => f.rms);
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    const maxEnergy = Math.max(...energies);
    // Max should be within 4x of average (not a single spike)
    if (maxEnergy > avgEnergy * 4) return false;

    return true;
  }
}

export const ukiWakeWord = new UkiWakeWordDetector();
