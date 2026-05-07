// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave B v4.0.1 - Audio DSP mastering core.
// Biquad filters, ADSR, LUFS, true-peak, compressor, limiter, BPM, key, MIDI.
// Pure functions; no AudioContext / DOM / IPC.

const TWO_PI = Math.PI * 2;

// ---------- Biquad (RBJ cookbook) ----------

export type BiquadType =
  | 'lowpass' | 'highpass' | 'bandpass' | 'notch'
  | 'peaking' | 'lowshelf' | 'highshelf';

export interface BiquadCoeffs { b0: number; b1: number; b2: number; a1: number; a2: number }

export function biquadCoefficients(
  type: BiquadType, sampleRate: number, frequency: number, q: number, gainDb: number = 0,
): BiquadCoeffs {
  if (sampleRate <= 0) throw new Error('sampleRate must be > 0');
  if (frequency <= 0 || frequency >= sampleRate / 2) throw new Error('frequency out of range');
  if (q <= 0) throw new Error('q must be > 0');
  const A = Math.pow(10, gainDb / 40);
  const w0 = (TWO_PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; break;
    case 'highpass':
      b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; break;
    case 'notch':
      b0 = 1; b1 = -2 * cosW0; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const beta = (Math.sqrt(A) / q) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2);
      b0 = A * (A + 1 - (A - 1) * cosW0 + beta * sinW0);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - beta * sinW0);
      a0 = A + 1 + (A - 1) * cosW0 + beta * sinW0;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - beta * sinW0; break;
    }
    case 'highshelf': {
      const beta = (Math.sqrt(A) / q) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2);
      b0 = A * (A + 1 + (A - 1) * cosW0 + beta * sinW0);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - beta * sinW0);
      a0 = A + 1 - (A - 1) * cosW0 + beta * sinW0;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - beta * sinW0; break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function processBiquad(
  input: Float32Array | number[], coeffs: BiquadCoeffs,
  state?: { z1: number; z2: number },
): { output: Float32Array; state: { z1: number; z2: number } } {
  let z1 = state?.z1 ?? 0;
  let z2 = state?.z2 ?? 0;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = coeffs.b0 * x + z1;
    z1 = coeffs.b1 * x - coeffs.a1 * y + z2;
    z2 = coeffs.b2 * x - coeffs.a2 * y;
    out[i] = y;
  }
  return { output: out, state: { z1, z2 } };
}

// ---------- ADSR ----------

export interface ADSRParams { attackMs: number; decayMs: number; sustain: number; releaseMs: number }

export function adsrLevelAt(
  params: ADSRParams, msFromOn: number, msFromOff: number | null,
): number {
  const A = Math.max(0, params.attackMs);
  const D = Math.max(0, params.decayMs);
  const R = Math.max(0, params.releaseMs);
  const S = Math.max(0, Math.min(1, params.sustain));
  if (msFromOff !== null) {
    if (R === 0 || msFromOff >= R) return 0;
    const lvlAtOff = adsrLevelAt(params, msFromOn, null);
    return lvlAtOff * (1 - msFromOff / R);
  }
  if (msFromOn < 0) return 0;
  if (msFromOn < A) return A === 0 ? 1 : msFromOn / A;
  if (msFromOn < A + D) {
    if (D === 0) return S;
    return 1 + (S - 1) * ((msFromOn - A) / D);
  }
  return S;
}

// ---------- LUFS / true-peak ----------

export function loudnessLUFS(channels: Float32Array[], sampleRate: number): number {
  if (channels.length === 0 || channels[0].length === 0) return -Infinity;
  const hs = biquadCoefficients('highshelf', sampleRate, 1500, 0.707, 4);
  const hp = biquadCoefficients('highpass', sampleRate, 38, 0.5);
  let sumSq = 0; let count = 0;
  for (const ch of channels) {
    const a = processBiquad(ch, hs);
    const b = processBiquad(a.output, hp);
    for (let i = 0; i < b.output.length; i++) { sumSq += b.output[i] ** 2; count++; }
  }
  const meanSq = sumSq / count;
  if (meanSq <= 0) return -Infinity;
  return -0.691 + 10 * Math.log10(meanSq);
}

export function truePeakDb(samples: Float32Array, oversample: number = 4): number {
  if (samples.length === 0) return -Infinity;
  let peak = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]; const b = samples[i + 1];
    if (Math.abs(a) > peak) peak = Math.abs(a);
    for (let s = 1; s < oversample; s++) {
      const t = s / oversample;
      const v = Math.abs(a * (1 - t) + b * t);
      if (v > peak) peak = v;
    }
  }
  return peak === 0 ? -Infinity : 20 * Math.log10(peak);
}

// ---------- Compressor / limiter ----------

export interface CompressorParams {
  thresholdDb: number; ratio: number; attackMs: number;
  releaseMs: number; kneeDb: number; makeupDb: number;
}

export function processCompressor(
  input: Float32Array, params: CompressorParams, sampleRate: number,
): Float32Array {
  const out = new Float32Array(input.length);
  const aCoef = Math.exp(-1 / Math.max(1, (params.attackMs / 1000) * sampleRate));
  const rCoef = Math.exp(-1 / Math.max(1, (params.releaseMs / 1000) * sampleRate));
  const makeup = Math.pow(10, params.makeupDb / 20);
  let env = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const absX = Math.abs(x);
    env = absX > env ? aCoef * env + (1 - aCoef) * absX : rCoef * env + (1 - rCoef) * absX;
    const envDb = env > 0 ? 20 * Math.log10(env) : -200;
    const overshoot = envDb - params.thresholdDb;
    let gainDb = 0;
    if (overshoot > params.kneeDb / 2) {
      gainDb = -overshoot * (1 - 1 / params.ratio);
    } else if (overshoot > -params.kneeDb / 2 && params.kneeDb > 0) {
      const x2 = overshoot + params.kneeDb / 2;
      gainDb = -((1 - 1 / params.ratio) * x2 * x2) / (2 * params.kneeDb);
    }
    out[i] = x * Math.pow(10, gainDb / 20) * makeup;
  }
  return out;
}

export function processLimiter(
  input: Float32Array, ceilingDb: number, releaseMs: number, sampleRate: number,
): Float32Array {
  const ceiling = Math.pow(10, ceilingDb / 20);
  const rCoef = Math.exp(-1 / Math.max(1, (releaseMs / 1000) * sampleRate));
  const out = new Float32Array(input.length);
  let gain = 1;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const absX = Math.abs(x);
    const peak = absX * gain;
    if (peak > ceiling) gain = ceiling / Math.max(1e-12, absX);
    else gain = Math.min(1, gain + (1 - gain) * (1 - rCoef));
    out[i] = x * gain;
  }
  return out;
}

// ---------- BPM detection ----------

export function detectBpm(samples: Float32Array, sampleRate: number, minBpm = 60, maxBpm = 200): number {
  if (samples.length < sampleRate / 2) return 0;
  const hop = 256;
  const env = new Float32Array(Math.floor(samples.length / hop));
  for (let i = 0; i < env.length; i++) {
    let s = 0;
    for (let j = 0; j < hop; j++) { const v = samples[i * hop + j] || 0; s += v * v; }
    env[i] = s / hop;
  }
  const sr2 = sampleRate / hop;
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * sr2));
  const maxLag = Math.min(env.length - 1, Math.floor((60 / minBpm) * sr2));
  let bestLag = minLag; let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < env.length - lag; i++) s += env[i] * env[i + lag];
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }
  return Math.round((60 * sr2) / bestLag);
}

// ---------- Pan law ----------

export type PanLaw = 'linear' | '-3dB' | '-4.5dB' | '-6dB';

export function panGains(pan: number, law: PanLaw): { left: number; right: number } {
  const t = (Math.max(-1, Math.min(1, pan)) + 1) / 2;
  switch (law) {
    case 'linear': return { left: 1 - t, right: t };
    case '-3dB': return { left: Math.cos(t * Math.PI / 2), right: Math.sin(t * Math.PI / 2) };
    case '-4.5dB': return { left: Math.pow(1 - t, 0.75), right: Math.pow(t, 0.75) };
    case '-6dB': return { left: 1 - t, right: t };
  }
}

// ---------- Key detection (Krumhansl) ----------

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function detectKey(chroma: number[]): { key: string; mode: 'major' | 'minor'; score: number } {
  if (chroma.length !== 12) throw new Error('chroma must be length 12');
  const mean = chroma.reduce((a, b) => a + b, 0) / 12;
  const c = chroma.map(v => v - mean);
  let best = { key: 'C', mode: 'major' as 'major' | 'minor', score: -Infinity };
  for (let r = 0; r < 12; r++) {
    let maj = 0, min = 0;
    for (let i = 0; i < 12; i++) {
      maj += c[(i + r) % 12] * MAJOR_PROFILE[i];
      min += c[(i + r) % 12] * MINOR_PROFILE[i];
    }
    if (maj > best.score) best = { key: NOTE_NAMES[r], mode: 'major', score: maj };
    if (min > best.score) best = { key: NOTE_NAMES[r], mode: 'minor', score: min };
  }
  return best;
}

export function chromaFromMagnitudes(mags: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  const n = mags.length * 2;
  for (let k = 1; k < mags.length; k++) {
    const freq = (k * sampleRate) / n;
    if (freq < 27.5 || freq > 4186) continue;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const note = ((Math.round(midi) % 12) + 12) % 12;
    chroma[note] += mags[k];
  }
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;
  return chroma;
}

// ---------- MIDI / quantize ----------

export function quantizeBeat(beat: number, gridDivisor: number, strength: number = 1): number {
  const snapped = Math.round(beat * gridDivisor) / gridDivisor;
  return beat + (snapped - beat) * Math.max(0, Math.min(1, strength));
}

export function applyHumanize(beat: number, amountBeats: number, seed: number): number {
  const x = (seed * 1103515245 + 12345) & 0x7fffffff;
  return beat + ((x / 0x7fffffff) * 2 - 1) * amountBeats;
}

// ---------- Loudness targets ----------

export const PLATFORM_LUFS_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  spotify: -14, apple: -16, youtube: -14, tidal: -14, amazon: -14,
  broadcast_eu: -23, broadcast_us: -24, podcast: -16, cinema: -27,
});

export function loudnessGainToTarget(currentLufs: number, targetLufs: number): number {
  if (!isFinite(currentLufs)) return 0;
  return targetLufs - currentLufs;
}
