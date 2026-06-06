// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Beat / tempo detection (ROADMAP-600 #233 tempo detect, #241 beat detect).
 * A real DSP engine: an onset-strength envelope (positive energy flux per hop)
 * peak-picked for beat times, and autocorrelated over a plausible BPM band for
 * tempo. No ML, no external library. Pure + deterministic over PCM, so it's
 * fully unit-testable; the app decodes a clip to PCM and feeds it in.
 */

// DEX v6.0 — media: beat/tempo detection

export interface BeatOptions {
  /** Hop size in samples for the envelope. Default 512. */
  hop?: number;
  /** Tempo search band. Defaults 60..200 BPM. */
  minBpm?: number;
  maxBpm?: number;
  /** Onset peak sensitivity (threshold = mean + k*std). Default 1.0. */
  sensitivity?: number;
}

interface Envelope { env: Float32Array; hopTime: number; }

/** RMS-per-hop, then positive first-difference = onset strength. */
function buildEnvelope(samples: ArrayLike<number>, sampleRate: number, hop: number): Envelope {
  const frames = Math.floor(samples.length / hop);
  const rms = new Float32Array(Math.max(0, frames));
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) { const s = samples[base + i]; e += s * s; }
    rms[f] = Math.sqrt(e / hop);
  }
  const env = new Float32Array(rms.length);
  for (let f = 1; f < rms.length; f++) { const d = rms[f] - rms[f - 1]; env[f] = d > 0 ? d : 0; }
  return { env, hopTime: hop / sampleRate };
}

function meanOf(a: Float32Array): number {
  if (a.length === 0) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/** Estimate tempo (BPM) by autocorrelating the onset envelope. */
export function detectTempo(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: BeatOptions = {},
): { bpm: number; confidence: number } {
  const hop = opts.hop ?? 512;
  const minBpm = opts.minBpm ?? 60;
  const maxBpm = opts.maxBpm ?? 200;
  if (!samples || samples.length === 0 || sampleRate <= 0) return { bpm: 0, confidence: 0 };

  const { env, hopTime } = buildEnvelope(samples, sampleRate, hop);
  if (env.length < 4) return { bpm: 0, confidence: 0 };

  const mean = meanOf(env);
  const e = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) e[i] = env[i] - mean;

  const minLag = Math.max(1, Math.floor((60 / maxBpm) / hopTime));
  const maxLag = Math.min(env.length - 1, Math.ceil((60 / minBpm) / hopTime));
  if (maxLag <= minLag) return { bpm: 0, confidence: 0 };

  let r0 = 0;
  for (let i = 0; i < e.length; i++) r0 += e[i] * e[i];

  let bestLag = minLag;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < e.length; i++) s += e[i] * e[i - lag];
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }

  const bpm = 60 / (bestLag * hopTime);
  const confidence = r0 > 0 ? Math.max(0, Math.min(1, bestVal / r0)) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.round(confidence * 100) / 100 };
}

/** Peak-pick onset times (seconds) from the envelope. */
export function detectOnsets(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: BeatOptions = {},
): number[] {
  const hop = opts.hop ?? 512;
  if (!samples || samples.length === 0 || sampleRate <= 0) return [];
  const { env, hopTime } = buildEnvelope(samples, sampleRate, hop);
  if (env.length < 3) return [];

  const mean = meanOf(env);
  let varc = 0;
  for (let i = 0; i < env.length; i++) { const d = env[i] - mean; varc += d * d; }
  const std = Math.sqrt(varc / env.length);
  const thr = mean + (opts.sensitivity ?? 1.0) * std;

  const onsets: number[] = [];
  for (let f = 1; f < env.length - 1; f++) {
    if (env[f] > thr && env[f] >= env[f - 1] && env[f] > env[f + 1]) onsets.push(f * hopTime);
  }
  return onsets;
}
