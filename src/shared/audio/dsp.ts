// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audio DSP primitives - wave Q.
 *
 * Pure Float32Array helpers for Imosion's next audio core. These modules do
 * not touch AudioContext, DOM, files, IPC, or native code; callers provide
 * sample-rate, buffers, and deterministic parameters.
 */

// DEX v3.10.0 wave Q - audio DSP core

export type SampleBlock = Float32Array | readonly number[];

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function dbToGain(db: number): number {
  if (db <= -120) return 0;
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return -120;
  return 20 * Math.log10(gain);
}

export function midiToFrequency(note: number, tuningHz: number = 440): number {
  return tuningHz * 2 ** ((note - 69) / 12);
}

export function frequencyToMidi(frequencyHz: number, tuningHz: number = 440): number {
  if (frequencyHz <= 0 || tuningHz <= 0) return 0;
  return 69 + 12 * Math.log2(frequencyHz / tuningHz);
}

export function copyBlock(input: SampleBlock): Float32Array {
  return input instanceof Float32Array ? new Float32Array(input) : Float32Array.from(input);
}

export function peakAbs(input: SampleBlock): number {
  let peak = 0;
  for (let i = 0; i < input.length; i += 1) peak = Math.max(peak, Math.abs(input[i]));
  return peak;
}

export function normalisePeak(input: SampleBlock, targetDb: number = -1): Float32Array {
  const peak = peakAbs(input);
  if (peak === 0) return copyBlock(input);
  const gain = dbToGain(targetDb) / peak;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] * gain;
  return out;
}

// -------- fades and panning -------------------------------------------------

export type FadeCurve = 'linear' | 'log' | 'exp' | 's-curve';
export type PanLaw = 'linear' | '-3db' | '-4.5db' | '-6db';

export function fadeShape(position: number, curve: FadeCurve = 'linear'): number {
  const x = clamp(position, 0, 1);
  switch (curve) {
    case 'log':
      return Math.log10(1 + 9 * x);
    case 'exp':
      return (Math.exp(3 * x) - 1) / (Math.exp(3) - 1);
    case 's-curve':
      return x * x * (3 - 2 * x);
    default:
      return x;
  }
}

export function applyFade(
  input: SampleBlock,
  fadeInSamples: number,
  fadeOutSamples: number,
  curve: FadeCurve = 's-curve'
): Float32Array {
  const out = copyBlock(input);
  const fadeIn = Math.max(0, Math.floor(fadeInSamples));
  const fadeOut = Math.max(0, Math.floor(fadeOutSamples));
  for (let i = 0; i < out.length; i += 1) {
    let gain = 1;
    if (fadeIn > 0 && i < fadeIn) gain *= fadeShape(i / fadeIn, curve);
    if (fadeOut > 0 && i >= out.length - fadeOut) {
      gain *= fadeShape((out.length - 1 - i) / fadeOut, curve);
    }
    out[i] *= gain;
  }
  return out;
}

export function equalPowerCrossfade(a: SampleBlock, b: SampleBlock, position: number): Float32Array {
  const length = Math.min(a.length, b.length);
  const x = clamp(position, 0, 1);
  const gainA = Math.cos((x * Math.PI) / 2);
  const gainB = Math.sin((x * Math.PI) / 2);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = a[i] * gainA + b[i] * gainB;
  return out;
}

export interface PanGains {
  left: number;
  right: number;
}

export function panGains(pan: number, law: PanLaw = '-3db'): PanGains {
  const x = clamp(pan, -1, 1);
  if (law === 'linear') return { left: (1 - x) / 2, right: (1 + x) / 2 };
  if (law === '-6db') return { left: 1 - (x + 1) / 2, right: (x + 1) / 2 };
  const angle = ((x + 1) * Math.PI) / 4;
  const base = { left: Math.cos(angle), right: Math.sin(angle) };
  if (law === '-4.5db') {
    const centerScale = dbToGain(-1.5);
    return { left: base.left * centerScale, right: base.right * centerScale };
  }
  return base;
}

export function panMono(input: SampleBlock, pan: number, law: PanLaw = '-3db'): { left: Float32Array; right: Float32Array } {
  const gains = panGains(pan, law);
  const left = new Float32Array(input.length);
  const right = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    left[i] = input[i] * gains.left;
    right[i] = input[i] * gains.right;
  }
  return { left, right };
}

export function midSideEncode(left: SampleBlock, right: SampleBlock): { mid: Float32Array; side: Float32Array } {
  const length = Math.min(left.length, right.length);
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  const scale = 1 / Math.SQRT2;
  for (let i = 0; i < length; i += 1) {
    mid[i] = (left[i] + right[i]) * scale;
    side[i] = (left[i] - right[i]) * scale;
  }
  return { mid, side };
}

export function midSideDecode(mid: SampleBlock, side: SampleBlock): { left: Float32Array; right: Float32Array } {
  const length = Math.min(mid.length, side.length);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const scale = 1 / Math.SQRT2;
  for (let i = 0; i < length; i += 1) {
    left[i] = (mid[i] + side[i]) * scale;
    right[i] = (mid[i] - side[i]) * scale;
  }
  return { left, right };
}

// -------- RBJ biquad filters -----------------------------------------------

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'low-shelf' | 'high-shelf';

export interface BiquadParams {
  type: BiquadType;
  sampleRate: number;
  frequencyHz: number;
  q?: number;
  gainDb?: number;
}

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export function newBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

function normaliseBiquad(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefficients {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function computeBiquadCoefficients(params: BiquadParams): BiquadCoefficients {
  const sampleRate = Math.max(1, params.sampleRate);
  const frequency = clamp(params.frequencyHz, 1, sampleRate / 2 - 1);
  const q = Math.max(0.0001, params.q ?? Math.SQRT1_2);
  const gain = dbToGain(params.gainDb ?? 0);
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);
  const a = Math.sqrt(gain);

  switch (params.type) {
    case 'lowpass':
      return normaliseBiquad((1 - cosW0) / 2, 1 - cosW0, (1 - cosW0) / 2, 1 + alpha, -2 * cosW0, 1 - alpha);
    case 'highpass':
      return normaliseBiquad((1 + cosW0) / 2, -(1 + cosW0), (1 + cosW0) / 2, 1 + alpha, -2 * cosW0, 1 - alpha);
    case 'bandpass':
      return normaliseBiquad(alpha, 0, -alpha, 1 + alpha, -2 * cosW0, 1 - alpha);
    case 'notch':
      return normaliseBiquad(1, -2 * cosW0, 1, 1 + alpha, -2 * cosW0, 1 - alpha);
    case 'peaking':
      return normaliseBiquad(1 + alpha * gain, -2 * cosW0, 1 - alpha * gain, 1 + alpha / gain, -2 * cosW0, 1 - alpha / gain);
    case 'low-shelf': {
      const twoSqrtAAlpha = 2 * a * alpha;
      return normaliseBiquad(
        gain * ((gain + 1) - (gain - 1) * cosW0 + twoSqrtAAlpha),
        2 * gain * ((gain - 1) - (gain + 1) * cosW0),
        gain * ((gain + 1) - (gain - 1) * cosW0 - twoSqrtAAlpha),
        (gain + 1) + (gain - 1) * cosW0 + twoSqrtAAlpha,
        -2 * ((gain - 1) + (gain + 1) * cosW0),
        (gain + 1) + (gain - 1) * cosW0 - twoSqrtAAlpha
      );
    }
    case 'high-shelf': {
      const twoSqrtAAlpha = 2 * a * alpha;
      return normaliseBiquad(
        gain * ((gain + 1) + (gain - 1) * cosW0 + twoSqrtAAlpha),
        -2 * gain * ((gain - 1) + (gain + 1) * cosW0),
        gain * ((gain + 1) + (gain - 1) * cosW0 - twoSqrtAAlpha),
        (gain + 1) - (gain - 1) * cosW0 + twoSqrtAAlpha,
        2 * ((gain - 1) - (gain + 1) * cosW0),
        (gain + 1) - (gain - 1) * cosW0 - twoSqrtAAlpha
      );
    }
    default:
      return normaliseBiquad(1, 0, 0, 1, 0, 0);
  }
}

export function processBiquad(
  input: SampleBlock,
  coefficients: BiquadCoefficients,
  initialState: BiquadState = newBiquadState()
): { output: Float32Array; state: BiquadState } {
  const output = new Float32Array(input.length);
  let { x1, x2, y1, y2 } = initialState;
  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i];
    const y0 = coefficients.b0 * x0 + coefficients.b1 * x1 + coefficients.b2 * x2 - coefficients.a1 * y1 - coefficients.a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return { output, state: { x1, x2, y1, y2 } };
}

// -------- state variable filter --------------------------------------------

export type StateVariableMode = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface StateVariableParams {
  sampleRate: number;
  frequencyHz: number;
  resonance?: number;
  mode: StateVariableMode;
}

export interface StateVariableState {
  low: number;
  band: number;
}

export function newStateVariableState(): StateVariableState {
  return { low: 0, band: 0 };
}

export function processStateVariableFilter(
  input: SampleBlock,
  params: StateVariableParams,
  initialState: StateVariableState = newStateVariableState()
): { output: Float32Array; state: StateVariableState } {
  const output = new Float32Array(input.length);
  const sampleRate = Math.max(1, params.sampleRate);
  const f = 2 * Math.sin(Math.PI * clamp(params.frequencyHz, 1, sampleRate / 2 - 1) / sampleRate);
  const resonance = clamp(params.resonance ?? 0.1, 0, 0.99);
  const q = 1 - resonance;
  let low = initialState.low;
  let band = initialState.band;
  for (let i = 0; i < input.length; i += 1) {
    low += f * band;
    const high = input[i] - low - q * band;
    band += f * high;
    const notch = high + low;
    output[i] = params.mode === 'lowpass' ? low : params.mode === 'highpass' ? high : params.mode === 'bandpass' ? band : notch;
  }
  return { output, state: { low, band } };
}

// -------- dynamics ----------------------------------------------------------

export interface EnvelopeFollowerParams {
  sampleRate: number;
  attackMs: number;
  releaseMs: number;
}

export function envelopeFollower(input: SampleBlock, params: EnvelopeFollowerParams): Float32Array {
  const sampleRate = Math.max(1, params.sampleRate);
  const attack = Math.exp(-1 / (sampleRate * Math.max(0.001, params.attackMs) / 1000));
  const release = Math.exp(-1 / (sampleRate * Math.max(0.001, params.releaseMs) / 1000));
  const out = new Float32Array(input.length);
  let env = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = Math.abs(input[i]);
    const coeff = x > env ? attack : release;
    env = coeff * env + (1 - coeff) * x;
    out[i] = env;
  }
  return out;
}

export interface CompressorParams extends EnvelopeFollowerParams {
  thresholdDb: number;
  ratio: number;
  kneeDb?: number;
  makeupDb?: number;
}

export function compressorGainDb(inputLevelDb: number, params: Pick<CompressorParams, 'thresholdDb' | 'ratio' | 'kneeDb'>): number {
  const ratio = Math.max(1, params.ratio);
  const knee = Math.max(0, params.kneeDb ?? 0);
  const over = inputLevelDb - params.thresholdDb;
  if (knee > 0 && Math.abs(over) <= knee / 2) {
    const x = over + knee / 2;
    const compressed = (1 / ratio - 1) * (x * x) / (2 * knee);
    return compressed;
  }
  if (over <= 0) return 0;
  return over / ratio - over;
}

export function applyCompressor(input: SampleBlock, params: CompressorParams): Float32Array {
  const envelope = envelopeFollower(input, params);
  const out = new Float32Array(input.length);
  const makeup = dbToGain(params.makeupDb ?? 0);
  for (let i = 0; i < input.length; i += 1) {
    const levelDb = gainToDb(envelope[i]);
    out[i] = input[i] * dbToGain(compressorGainDb(levelDb, params)) * makeup;
  }
  return out;
}

export interface GateParams {
  thresholdDb: number;
  floorDb?: number;
}

export function gateGain(inputLevelDb: number, params: GateParams): number {
  return inputLevelDb < params.thresholdDb ? dbToGain(params.floorDb ?? -80) : 1;
}

export function applyNoiseGate(input: SampleBlock, params: GateParams): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] * gateGain(gainToDb(Math.abs(input[i])), params);
  return out;
}

export function applyLimiter(input: SampleBlock, ceilingDb: number = -0.1): Float32Array {
  const ceiling = dbToGain(ceilingDb);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = clamp(input[i], -ceiling, ceiling);
  return out;
}

export function waveshape(input: SampleBlock, drive: number = 1, curve: 'tanh' | 'soft' | 'hard' = 'tanh'): Float32Array {
  const out = new Float32Array(input.length);
  const safeDrive = Math.max(0.001, drive);
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i] * safeDrive;
    if (curve === 'hard') out[i] = clamp(x, -1, 1);
    else if (curve === 'soft') out[i] = x / (1 + Math.abs(x));
    else out[i] = Math.tanh(x);
  }
  return out;
}

export function bitCrush(input: SampleBlock, bitDepth: number, holdSamples: number = 1): Float32Array {
  const levels = Math.max(2, 2 ** Math.floor(bitDepth));
  const hold = Math.max(1, Math.floor(holdSamples));
  const out = new Float32Array(input.length);
  let held = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (i % hold === 0) held = Math.round(((clamp(input[i], -1, 1) + 1) / 2) * (levels - 1)) / (levels - 1) * 2 - 1;
    out[i] = held;
  }
  return out;
}

// -------- delays and modulation --------------------------------------------

export interface DelayTap {
  delaySamples: number;
  gain: number;
}

export function combDelay(input: SampleBlock, delaySamples: number, feedback: number = 0.35, wet: number = 0.5): Float32Array {
  const delay = Math.max(1, Math.floor(delaySamples));
  const fb = clamp(feedback, -0.99, 0.99);
  const wetGain = clamp(wet, 0, 1);
  const buffer = new Float32Array(input.length + delay + 1);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const delayed = buffer[i];
    const value = input[i] + delayed * fb;
    buffer[i + delay] += value;
    out[i] = input[i] * (1 - wetGain) + delayed * wetGain;
  }
  return out;
}

export function multiTapDelay(input: SampleBlock, taps: readonly DelayTap[], wet: number = 1): Float32Array {
  const out = copyBlock(input);
  const wetGain = clamp(wet, 0, 1);
  for (const tap of taps) {
    const delay = Math.max(0, Math.floor(tap.delaySamples));
    for (let i = delay; i < out.length; i += 1) out[i] += input[i - delay] * tap.gain * wetGain;
  }
  return out;
}

export function tempoSyncMs(bpm: number, beats: number): number {
  if (bpm <= 0) return 0;
  return (60_000 / bpm) * beats;
}

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square' | 'sample-hold';

export function lfoValue(shape: LfoShape, phase: number, randomValue: number = 0): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
    case 'saw':
      return p * 2 - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sample-hold':
      return clamp(randomValue, -1, 1);
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

export interface AdsrParams {
  sampleRate: number;
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  gateSamples: number;
  totalSamples: number;
}

export function renderAdsr(params: AdsrParams): Float32Array {
  const sampleRate = Math.max(1, params.sampleRate);
  const attack = Math.max(0, Math.round((params.attackMs / 1000) * sampleRate));
  const decay = Math.max(0, Math.round((params.decayMs / 1000) * sampleRate));
  const release = Math.max(0, Math.round((params.releaseMs / 1000) * sampleRate));
  const sustain = clamp(params.sustain, 0, 1);
  const gate = clamp(Math.floor(params.gateSamples), 0, params.totalSamples);
  const out = new Float32Array(Math.max(0, params.totalSamples));
  const releaseStartValue = gate > 0 ? out[Math.max(0, gate - 1)] || sustain : sustain;
  for (let i = 0; i < out.length; i += 1) {
    if (i < gate) {
      if (attack > 0 && i < attack) out[i] = i / attack;
      else if (decay > 0 && i < attack + decay) out[i] = 1 - (1 - sustain) * ((i - attack) / decay);
      else out[i] = sustain;
    } else if (release > 0 && i < gate + release) {
      out[i] = releaseStartValue * (1 - (i - gate) / release);
    } else {
      out[i] = 0;
    }
  }
  return out;
}

export interface ModulationRoute {
  source: string;
  destination: string;
  amount: number;
}

export function applyModulationMatrix(
  base: Record<string, number>,
  sources: Record<string, number>,
  routes: readonly ModulationRoute[]
): Record<string, number> {
  const next = { ...base };
  for (const route of routes) {
    next[route.destination] = (next[route.destination] ?? 0) + (sources[route.source] ?? 0) * route.amount;
  }
  return next;
}

// -------- routing and latency ----------------------------------------------

export interface TrackNode {
  id: string;
  pluginLatencies: readonly number[];
  sendsTo?: readonly string[];
}

export interface LatencyCompensation {
  maxLatencySamples: number;
  perTrackDelaySamples: Record<string, number>;
}

export function planLatencyCompensation(tracks: readonly TrackNode[]): LatencyCompensation {
  const totals: Record<string, number> = {};
  let maxLatencySamples = 0;
  for (const track of tracks) {
    const total = track.pluginLatencies.reduce((sum, n) => sum + Math.max(0, Math.floor(n)), 0);
    totals[track.id] = total;
    maxLatencySamples = Math.max(maxLatencySamples, total);
  }
  const perTrackDelaySamples: Record<string, number> = {};
  for (const track of tracks) perTrackDelaySamples[track.id] = maxLatencySamples - totals[track.id];
  return { maxLatencySamples, perTrackDelaySamples };
}

export interface StemNameInput {
  project: string;
  track: string;
  index: number;
  extension: string;
}

export function stemFileName(template: string, input: StemNameInput): string {
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'untitled';
  return template
    .replaceAll('{project}', safe(input.project))
    .replaceAll('{track}', safe(input.track))
    .replaceAll('{index}', String(input.index).padStart(2, '0'))
    .replaceAll('{ext}', safe(input.extension).replace(/^\./, ''));
}
