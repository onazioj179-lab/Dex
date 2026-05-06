// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Audio Analysis Utilities 🎵
 * 
 * WebAudio-based utilities for VINX and AXL creative apps.
 * Provides waveform generation, spectrum analysis, and audio processing helpers.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WaveformData {
  peaks: Float32Array;
  duration: number;
  sampleRate: number;
  channelCount: number;
}

export interface SpectrumData {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  timestamp: number;
}

export interface AudioLevels {
  peak: number;        // 0-1 peak level
  rms: number;         // 0-1 RMS level
  db: number;          // dB level
  clipping: boolean;   // True if clipping detected
}

export interface BeatInfo {
  tempo: number;       // BPM
  beats: number[];     // Beat positions in seconds
  confidence: number;  // 0-1 confidence
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO CONTEXT SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function closeAudioContext(): void {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVEFORM GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate waveform peaks from an audio buffer
 * @param buffer Audio buffer to analyze
 * @param samplesPerPeak Number of samples to average per peak
 */
export function generateWaveform(
  buffer: AudioBuffer,
  samplesPerPeak: number = 256
): WaveformData {
  const channelData = buffer.getChannelData(0);
  const peakCount = Math.ceil(channelData.length / samplesPerPeak);
  const peaks = new Float32Array(peakCount);

  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);
    
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }

  return {
    peaks,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
  };
}

/**
 * Generate waveform from audio file
 */
export async function generateWaveformFromFile(
  file: File | Blob,
  samplesPerPeak: number = 256
): Promise<WaveformData> {
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  return generateWaveform(audioBuffer, samplesPerPeak);
}

/**
 * Draw waveform to canvas
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  waveform: WaveformData,
  options: {
    color?: string;
    backgroundColor?: string;
    lineWidth?: number;
    style?: 'bars' | 'line' | 'mirror';
  } = {}
): void {
  const {
    color = '#4A9EFF',
    backgroundColor = 'transparent',
    lineWidth = 1,
    style = 'bars',
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const { peaks } = waveform;
  const peakWidth = width / peaks.length;
  const centerY = height / 2;

  // Clear
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  if (style === 'bars') {
    for (let i = 0; i < peaks.length; i++) {
      const x = i * peakWidth;
      const barHeight = peaks[i] * height * 0.9;
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(peakWidth - 1, 1), barHeight);
    }
  } else if (style === 'line') {
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < peaks.length; i++) {
      const x = i * peakWidth;
      const y = centerY - peaks[i] * centerY * 0.9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (style === 'mirror') {
    for (let i = 0; i < peaks.length; i++) {
      const x = i * peakWidth;
      const barHeight = peaks[i] * centerY * 0.9;
      ctx.fillRect(x, centerY - barHeight, Math.max(peakWidth - 1, 1), barHeight * 2);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECTRUM ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a real-time spectrum analyzer
 */
export function createSpectrumAnalyzer(
  source: AudioNode,
  options: { fftSize?: number; smoothing?: number } = {}
): {
  analyser: AnalyserNode;
  getFrequencyData: () => SpectrumData;
  getByteFrequencyData: () => Uint8Array;
  destroy: () => void;
} {
  const { fftSize = 2048, smoothing = 0.8 } = options;
  const ctx = source.context as AudioContext;
  
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = smoothing;
  
  source.connect(analyser);
  
  const frequencies = new Float32Array(analyser.frequencyBinCount);
  const byteData = new Uint8Array(analyser.frequencyBinCount);
  const binWidth = ctx.sampleRate / fftSize;
  
  // Pre-compute frequency values for each bin
  const frequencyValues = new Float32Array(analyser.frequencyBinCount);
  for (let i = 0; i < frequencyValues.length; i++) {
    frequencyValues[i] = i * binWidth;
  }

  return {
    analyser,
    getFrequencyData: () => {
      analyser.getFloatFrequencyData(frequencies);
      return {
        frequencies: frequencyValues,
        magnitudes: frequencies,
        timestamp: performance.now(),
      };
    },
    getByteFrequencyData: () => {
      analyser.getByteFrequencyData(byteData);
      return byteData;
    },
    destroy: () => {
      source.disconnect(analyser);
    },
  };
}

/**
 * Draw spectrum to canvas
 */
export function drawSpectrum(
  canvas: HTMLCanvasElement,
  data: Uint8Array,
  options: {
    barColor?: string | ((index: number, value: number) => string);
    backgroundColor?: string;
    barWidth?: number;
    barGap?: number;
    mirror?: boolean;
    gradient?: CanvasGradient | null;
  } = {}
): void {
  const {
    barColor = '#4A9EFF',
    backgroundColor = 'transparent',
    barWidth = 2,
    barGap = 1,
    mirror = false,
    gradient = null,
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const centerY = height / 2;
  const effectiveWidth = barWidth + barGap;
  const barCount = Math.min(data.length, Math.floor(width / effectiveWidth));

  // Clear
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < barCount; i++) {
    const value = data[Math.floor(i * data.length / barCount)] / 255;
    const barHeight = value * (mirror ? centerY : height) * 0.9;
    const x = i * effectiveWidth;

    if (gradient) {
      ctx.fillStyle = gradient;
    } else if (typeof barColor === 'function') {
      ctx.fillStyle = barColor(i, value);
    } else {
      ctx.fillStyle = barColor;
    }

    if (mirror) {
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
    } else {
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO LEVEL METERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate audio levels from time domain data
 */
export function calculateLevels(data: Float32Array): AudioLevels {
  let peak = 0;
  let sumSquares = 0;
  let clipping = false;

  for (let i = 0; i < data.length; i++) {
    const sample = data[i];
    const abs = Math.abs(sample);
    
    if (abs > peak) peak = abs;
    if (abs >= 0.999) clipping = true;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / data.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

  return { peak, rms, db, clipping };
}

/**
 * Create a level meter that continuously monitors audio
 */
export function createLevelMeter(
  source: AudioNode
): {
  getLevels: () => AudioLevels;
  destroy: () => void;
} {
  const ctx = source.context as AudioContext;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  
  source.connect(analyser);
  
  const timeData = new Float32Array(analyser.fftSize);

  return {
    getLevels: () => {
      analyser.getFloatTimeDomainData(timeData);
      return calculateLevels(timeData);
    },
    destroy: () => {
      source.disconnect(analyser);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a simple compressor
 */
export function createCompressor(
  ctx: AudioContext,
  options: {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  } = {}
): DynamicsCompressorNode {
  const {
    threshold = -24,
    knee = 30,
    ratio = 12,
    attack = 0.003,
    release = 0.25,
  } = options;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = threshold;
  compressor.knee.value = knee;
  compressor.ratio.value = ratio;
  compressor.attack.value = attack;
  compressor.release.value = release;

  return compressor;
}

/**
 * Create a parametric EQ band
 */
export function createEQBand(
  ctx: AudioContext,
  options: {
    type?: BiquadFilterType;
    frequency?: number;
    gain?: number;
    Q?: number;
  } = {}
): BiquadFilterNode {
  const {
    type = 'peaking',
    frequency = 1000,
    gain = 0,
    Q = 1,
  } = options;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.gain.value = gain;
  filter.Q.value = Q;

  return filter;
}

/**
 * Create a reverb effect using convolution
 */
export async function createReverb(
  ctx: AudioContext,
  options: {
    decay?: number;
    preDelay?: number;
    wet?: number;
  } = {}
): Promise<{
  input: GainNode;
  output: GainNode;
  setWet: (value: number) => void;
  destroy: () => void;
}> {
  const { decay = 2, preDelay = 0.01, wet = 0.3 } = options;

  // Create impulse response
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * decay;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * decay / 3));
    }
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;

  const input = ctx.createGain();
  const output = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const preDelayNode = ctx.createDelay(1);
  preDelayNode.delayTime.value = preDelay;

  dryGain.gain.value = 1 - wet;
  wetGain.gain.value = wet;

  // Routing: input -> dry -> output
  //                -> preDelay -> convolver -> wet -> output
  input.connect(dryGain).connect(output);
  input.connect(preDelayNode).connect(convolver).connect(wetGain).connect(output);

  return {
    input,
    output,
    setWet: (value: number) => {
      dryGain.gain.value = 1 - value;
      wetGain.gain.value = value;
    },
    destroy: () => {
      input.disconnect();
      convolver.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      preDelayNode.disconnect();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert decibels to linear amplitude
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear amplitude to decibels
 */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}

/**
 * Format time as MM:SS.ms
 */
export function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Format time as HH:MM:SS for longer content
 */
export function formatAudioTimeLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Create a smooth gain fade
 */
export function fadeGain(
  gainNode: GainNode,
  targetValue: number,
  duration: number
): void {
  const ctx = gainNode.context;
  gainNode.gain.setTargetAtTime(targetValue, ctx.currentTime, duration / 3);
}

/**
 * Get frequency for a musical note
 * A4 = 440Hz, octave = 12 semitones
 */
export function noteToFrequency(note: number, octave: number = 4): number {
  // A4 = note 9 in octave 4 = 440Hz
  const semitones = (octave - 4) * 12 + (note - 9);
  return 440 * Math.pow(2, semitones / 12);
}

/**
 * Note names for display
 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Get note name from MIDI note number
 */
export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}
