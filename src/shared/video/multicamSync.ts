// =============================================================================
// DEX Platform — Wave 2.2 VINX: multicam audio sync
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Multicam audio sync — aligns N angles by cross-correlating their audio
 * tracks against a reference. Returns per-angle offset in samples.
 *
 * Implementation: peak normalized cross-correlation over a window. For long
 * clips, we downsample to ~4 kHz (sync precision still ~0.25 ms) before
 * correlating to keep CPU bounded.
 */

export interface AudioAngle {
  id: string;
  pcm: Float32Array; // mono, any sample rate
  sampleRate: number;
}

export interface SyncResult {
  /** angle id -> offset in seconds relative to reference. Positive means starts later. */
  offsets: Map<string, number>;
  /** Confidence per angle (0..1, normalized correlation peak). */
  confidence: Map<string, number>;
  /** Reference angle id used. */
  reference: string;
}

const TARGET_SR = 4000;
const MAX_LAG_SECONDS = 30;

export function syncAngles(angles: AudioAngle[]): SyncResult {
  if (angles.length === 0) throw new Error('syncAngles: no angles');
  const reference = angles[0]!;
  const refDS = downmixAndDownsample(reference.pcm, reference.sampleRate);
  const offsets = new Map<string, number>();
  const conf = new Map<string, number>();
  offsets.set(reference.id, 0);
  conf.set(reference.id, 1);

  for (let i = 1; i < angles.length; i++) {
    const a = angles[i]!;
    const aDS = downmixAndDownsample(a.pcm, a.sampleRate);
    const { lag, score } = bestLag(refDS, aDS, Math.floor(MAX_LAG_SECONDS * TARGET_SR));
    // lag positive means `a` is delayed relative to ref => offset is +lag/SR
    offsets.set(a.id, lag / TARGET_SR);
    conf.set(a.id, score);
  }
  return { offsets, confidence: conf, reference: reference.id };
}

function downmixAndDownsample(pcm: Float32Array, sr: number): Float32Array {
  if (sr === TARGET_SR) return pcm;
  const ratio = sr / TARGET_SR;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  // Box-filter decimation (cheap; good enough for sync).
  const window = Math.max(1, Math.floor(ratio));
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    let sum = 0;
    for (let j = 0; j < window && start + j < pcm.length; j++) sum += pcm[start + j]!;
    out[i] = sum / window;
  }
  return out;
}

interface LagResult { lag: number; score: number }

function bestLag(ref: Float32Array, sig: Float32Array, maxLag: number): LagResult {
  // Compute energies
  const refEnergy = energy(ref);
  const sigEnergy = energy(sig);
  if (refEnergy === 0 || sigEnergy === 0) return { lag: 0, score: 0 };
  const norm = Math.sqrt(refEnergy * sigEnergy);

  let bestLag = 0;
  let bestCorr = -Infinity;
  // Coarse-then-fine. Coarse step = max(1, maxLag/512).
  const step = Math.max(1, Math.floor(maxLag / 512));
  for (let lag = -maxLag; lag <= maxLag; lag += step) {
    const c = corrAt(ref, sig, lag);
    if (c > bestCorr) { bestCorr = c; bestLag = lag; }
  }
  // Refine: search +/- step around bestLag at sample resolution
  const lo = Math.max(-maxLag, bestLag - step);
  const hi = Math.min(maxLag, bestLag + step);
  for (let lag = lo; lag <= hi; lag++) {
    const c = corrAt(ref, sig, lag);
    if (c > bestCorr) { bestCorr = c; bestLag = lag; }
  }
  return { lag: bestLag, score: clamp01(bestCorr / norm) };
}

function corrAt(ref: Float32Array, sig: Float32Array, lag: number): number {
  // shift sig by `lag`; positive lag means sig is delayed (ref[i] vs sig[i-lag])
  const start = Math.max(0, lag);
  const end = Math.min(ref.length, sig.length + lag);
  let sum = 0;
  for (let i = start; i < end; i++) sum += ref[i]! * sig[i - lag]!;
  return sum;
}

function energy(x: Float32Array): number {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i]! * x[i]!;
  return e;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
