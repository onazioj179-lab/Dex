// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audio analysis primitives - wave Q.
 *
 * Deterministic, small-input-friendly analysis helpers for meters, pitch,
 * tempo, chords, and delivery checks. Heavy FFT/WASM paths can swap in later
 * behind the same data shapes.
 */

// DEX v3.10.0 wave Q - audio analysis core

import { SampleBlock, clamp, dbToGain, frequencyToMidi, gainToDb, midiToFrequency, peakAbs } from './dsp';

export function rms(input: SampleBlock): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

export function rmsDb(input: SampleBlock): number {
  return gainToDb(rms(input));
}

export function truePeak(input: SampleBlock): number {
  let peak = peakAbs(input);
  for (let i = 1; i < input.length; i += 1) {
    peak = Math.max(peak, Math.abs((input[i - 1] + input[i]) / 2));
  }
  return peak;
}

export function integratedLufs(input: SampleBlock): number {
  if (input.length === 0) return -Infinity;
  return -0.691 + 10 * Math.log10(Math.max(1e-12, rms(input) ** 2));
}

export function loudnessMatchGainDb(input: SampleBlock, targetLufs: number): number {
  const current = integratedLufs(input);
  if (!Number.isFinite(current)) return 0;
  return targetLufs - current;
}

export function zeroCrossingRate(input: SampleBlock): number {
  if (input.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < input.length; i += 1) {
    if ((input[i - 1] >= 0 && input[i] < 0) || (input[i - 1] < 0 && input[i] >= 0)) crossings += 1;
  }
  return crossings / (input.length - 1);
}

export interface SpectrumBin {
  frequencyHz: number;
  magnitude: number;
}

export function dftMagnitude(input: SampleBlock, sampleRate: number, binCount: number = Math.floor(input.length / 2)): SpectrumBin[] {
  const bins: SpectrumBin[] = [];
  const length = input.length;
  if (length === 0) return bins;
  const safeBins = Math.max(1, Math.min(Math.floor(length / 2), Math.floor(binCount)));
  for (let k = 0; k <= safeBins; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < length; n += 1) {
      const angle = (-2 * Math.PI * k * n) / length;
      re += input[n] * Math.cos(angle);
      im += input[n] * Math.sin(angle);
    }
    bins.push({ frequencyHz: (k * sampleRate) / length, magnitude: Math.sqrt(re * re + im * im) / length });
  }
  return bins;
}

export function spectralCentroid(bins: readonly SpectrumBin[]): number {
  let weighted = 0;
  let total = 0;
  for (const bin of bins) {
    weighted += bin.frequencyHz * bin.magnitude;
    total += bin.magnitude;
  }
  return total === 0 ? 0 : weighted / total;
}

export function dominantFrequency(bins: readonly SpectrumBin[]): number {
  let best = { frequencyHz: 0, magnitude: -Infinity };
  for (const bin of bins) if (bin.magnitude > best.magnitude) best = bin;
  return best.frequencyHz;
}

export interface Onset {
  sampleIndex: number;
  strength: number;
}

export function detectOnsets(input: SampleBlock, windowSize: number = 1024, threshold: number = 1.5): Onset[] {
  const safeWindow = Math.max(8, Math.floor(windowSize));
  const onsets: Onset[] = [];
  let previous = 0;
  for (let offset = 0; offset + safeWindow <= input.length; offset += safeWindow) {
    let energy = 0;
    for (let i = offset; i < offset + safeWindow; i += 1) energy += input[i] * input[i];
    energy /= safeWindow;
    if (previous > 0 && energy / previous >= threshold) onsets.push({ sampleIndex: offset, strength: energy / previous });
    previous = Math.max(1e-12, energy);
  }
  return onsets;
}

export function estimateTempo(onsets: readonly Onset[], sampleRate: number): number {
  if (onsets.length < 2 || sampleRate <= 0) return 0;
  const bpms: number[] = [];
  for (let i = 1; i < onsets.length; i += 1) {
    const deltaSamples = onsets[i].sampleIndex - onsets[i - 1].sampleIndex;
    if (deltaSamples <= 0) continue;
    let bpm = 60 / (deltaSamples / sampleRate);
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    bpms.push(bpm);
  }
  if (bpms.length === 0) return 0;
  bpms.sort((a, b) => a - b);
  return bpms[Math.floor(bpms.length / 2)];
}

export interface YinResult {
  frequencyHz: number;
  probability: number;
}

export function detectPitchYin(input: SampleBlock, sampleRate: number, minHz: number = 50, maxHz: number = 1200): YinResult {
  if (input.length < 4 || sampleRate <= 0) return { frequencyHz: 0, probability: 0 };
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(input.length - 1, Math.ceil(sampleRate / minHz));
  const diff = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let sum = 0;
    for (let i = 0; i < input.length - tau; i += 1) {
      const d = input[i] - input[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  let running = 0;
  let bestTau = 0;
  let bestValue = Infinity;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    running += diff[tau];
    const cmnd = running === 0 ? 1 : (diff[tau] * tau) / running;
    if (cmnd < bestValue) {
      bestValue = cmnd;
      bestTau = tau;
    }
    if (tau > minTau && cmnd < 0.1) {
      bestTau = tau;
      bestValue = cmnd;
      break;
    }
  }
  if (bestTau === 0) return { frequencyHz: 0, probability: 0 };
  return { frequencyHz: sampleRate / bestTau, probability: clamp(1 - bestValue, 0, 1) };
}

export function chromaFromFrequencies(peaks: readonly { frequencyHz: number; magnitude: number }[], tuningHz: number = 440): number[] {
  const chroma = new Array<number>(12).fill(0);
  for (const peak of peaks) {
    if (peak.frequencyHz <= 0 || peak.magnitude <= 0) continue;
    const midi = Math.round(frequencyToMidi(peak.frequencyHz, tuningHz));
    chroma[((midi % 12) + 12) % 12] += peak.magnitude;
  }
  const max = Math.max(1e-12, ...chroma);
  return chroma.map((value) => value / max);
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function rotatedScore(chroma: readonly number[], profile: readonly number[], root: number): number {
  let score = 0;
  for (let i = 0; i < 12; i += 1) score += (chroma[(i + root) % 12] ?? 0) * profile[i];
  return score;
}

export interface KeyEstimate {
  key: string;
  mode: 'major' | 'minor';
  confidence: number;
}

export function estimateKey(chroma: readonly number[]): KeyEstimate {
  let best: { root: number; mode: 'major' | 'minor'; score: number } = { root: 0, mode: 'major', score: -Infinity };
  let second = -Infinity;
  for (let root = 0; root < 12; root += 1) {
    for (const mode of ['major', 'minor'] as const) {
      const score = rotatedScore(chroma, mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE, root);
      if (score > best.score) {
        second = best.score;
        best = { root, mode, score };
      } else {
        second = Math.max(second, score);
      }
    }
  }
  return { key: NOTE_NAMES[best.root], mode: best.mode, confidence: clamp((best.score - second) / Math.max(1, best.score), 0, 1) };
}

export interface ChordEstimate {
  root: string;
  quality: 'major' | 'minor' | 'diminished' | 'sus4' | 'power';
  score: number;
}

const CHORDS: Record<ChordEstimate['quality'], number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  sus4: [0, 5, 7],
  power: [0, 7],
};

export function detectChord(chroma: readonly number[]): ChordEstimate {
  let best: ChordEstimate = { root: 'C', quality: 'major', score: -Infinity };
  for (let root = 0; root < 12; root += 1) {
    for (const [quality, intervals] of Object.entries(CHORDS) as [ChordEstimate['quality'], number[]][]) {
      const hit = intervals.reduce((sum, interval) => sum + (chroma[(root + interval) % 12] ?? 0), 0);
      const miss = chroma.reduce((sum, value, index) => (intervals.includes((index - root + 12) % 12) ? sum : sum + value), 0);
      const score = hit - miss * 0.25;
      if (score > best.score) best = { root: NOTE_NAMES[root], quality, score };
    }
  }
  return best;
}

export type ScaleName = 'major' | 'natural-minor' | 'minor-pentatonic' | 'chromatic';

const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function snapMidiToScale(note: number, root: number, scale: ScaleName): number {
  const allowed = SCALES[scale];
  const octave = Math.floor((note - root) / 12);
  let best = note;
  let bestDistance = Infinity;
  for (let oct = octave - 1; oct <= octave + 1; oct += 1) {
    for (const interval of allowed) {
      const candidate = root + oct * 12 + interval;
      const distance = Math.abs(candidate - note);
      if (distance < bestDistance || (distance === bestDistance && candidate > best)) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

export function snapFrequencyToScale(frequencyHz: number, rootMidi: number, scale: ScaleName, tuningHz: number = 440): number {
  return midiToFrequency(snapMidiToScale(Math.round(frequencyToMidi(frequencyHz, tuningHz)), rootMidi, scale), tuningHz);
}

export interface DeliveryTarget {
  id: string;
  targetLufs: number;
  truePeakCeilingDb: number;
}

export const DELIVERY_TARGETS: Record<string, DeliveryTarget> = {
  spotify: { id: 'spotify', targetLufs: -14, truePeakCeilingDb: -1 },
  appleMusic: { id: 'appleMusic', targetLufs: -16, truePeakCeilingDb: -1 },
  broadcast: { id: 'broadcast', targetLufs: -23, truePeakCeilingDb: -2 },
  youtube: { id: 'youtube', targetLufs: -14, truePeakCeilingDb: -1 },
};

export interface DeliveryCheck {
  target: DeliveryTarget;
  lufs: number;
  truePeakDb: number;
  gainToTargetDb: number;
  passesPeak: boolean;
}

export function checkDelivery(input: SampleBlock, target: DeliveryTarget): DeliveryCheck {
  const lufs = integratedLufs(input);
  const truePeakDb = gainToDb(truePeak(input));
  return {
    target,
    lufs,
    truePeakDb,
    gainToTargetDb: Number.isFinite(lufs) ? target.targetLufs - lufs : 0,
    passesPeak: truePeakDb <= target.truePeakCeilingDb + 1e-9 || dbToGain(truePeakDb) === 0,
  };
}
