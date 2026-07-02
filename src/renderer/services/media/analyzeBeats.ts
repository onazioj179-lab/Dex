// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Smart Tempo entry point — one call that routes beat/tempo/onset analysis to
 * the best available engine:
 *
 *   • Native (Rust `dex-audio`) when the source is a real filesystem path AND the
 *     desktop bridge is present. The whole clip is decoded + analysed in Rust
 *     (`audio:analyzeBeats`), so no megabytes of PCM are decoded in JS and shipped
 *     around, and it applies an octave correction the JS path lacks.
 *   • Renderer (Web Audio decode + the shared `beatDetect` engine) for blob/http/
 *     data URLs — the only option the browser can serve. Not a fake: it is the
 *     same real DSP, just running on the decoded PCM.
 *
 * Both return the same shape, so call sites stay engine-agnostic; `engine` tells
 * you which path ran (useful for diagnostics, never for faking success).
 */

import { detectTempo, detectOnsets, type BeatOptions } from '../../../shared/media/beatDetect';
import { planSilenceRemoval } from '../../../shared/media/silenceDetect';
import { decodeAudioToMono } from './decodeAudio';

export interface BeatResult {
  /** Estimated tempo in BPM (0 when indeterminate). */
  bpm: number;
  /** Autocorrelation confidence in [0, 1]. */
  confidence: number;
  /** Beat onset times in seconds. */
  onsets: number[];
  /** Which engine produced this result. */
  engine: 'native' | 'renderer';
}

/**
 * A source is natively analysable only when it is a real OS path, not a URL the
 * renderer must fetch/decode itself. blob:/data:/http(s):/file: all need the Web
 * Audio path; a bare `C:\…` / `/Users/…` string goes to the native engine.
 */
function isFilesystemPath(src: string): boolean {
  if (!src) return false;
  if (/^(blob:|data:|https?:|file:)/i.test(src)) return false;
  return /[\\/]/.test(src);
}

interface Bridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

function bridge(): Bridge | null {
  const w = window as unknown as { dex?: Bridge; electron?: Bridge };
  const b = w.dex ?? w.electron;
  return b && typeof b.invoke === 'function' ? b : null;
}

/**
 * Analyse `source` for tempo + beat onsets. Resolves `null` only when the audio
 * cannot be obtained at all (renderer decode failed and no native path) — the
 * caller treats that as an honest "skip", never a faked result.
 */
export async function analyzeBeats(source: string, opts: BeatOptions = {}): Promise<BeatResult | null> {
  const b = bridge();
  if (b && isFilesystemPath(source)) {
    try {
      const res = (await b.invoke('audio:analyzeBeats', source, {
        hop: opts.hop,
        minBpm: opts.minBpm,
        maxBpm: opts.maxBpm,
        sensitivity: opts.sensitivity,
      })) as { success?: boolean; bpm?: number; confidence?: number; onsets?: number[] } | null;
      if (res && res.success && typeof res.bpm === 'number') {
        return {
          bpm: res.bpm,
          confidence: typeof res.confidence === 'number' ? res.confidence : 0,
          onsets: Array.isArray(res.onsets) ? res.onsets : [],
          engine: 'native',
        };
      }
      // Native returned a failure envelope (e.g. unreadable path) — fall through
      // and let the renderer try to decode the same source.
    } catch {
      /* native bridge threw — fall back to the renderer decode below */
    }
  }

  const decoded = await decodeAudioToMono(source);
  if (!decoded) return null;
  const { bpm, confidence } = detectTempo(decoded.pcm, decoded.sampleRate, opts);
  const onsets = detectOnsets(decoded.pcm, decoded.sampleRate, opts);
  return { bpm, confidence, onsets, engine: 'renderer' };
}

export interface KeyResult {
  /** Tonic name, e.g. "C" / "F#" ('' when indeterminate). */
  key: string;
  /** "major" | "minor" ('' when indeterminate). */
  scale: string;
  /** Profile-correlation confidence in [0, 1]. */
  confidence: number;
}

/**
 * Detect the musical key/scale of `source`. Native-only: key finding needs a
 * chromagram the renderer has no engine for, so this resolves `null` for blob/
 * URL sources (there is no fake fallback) and returns a real result only when
 * `source` is a filesystem path and the native engine is present.
 */
export async function analyzeKey(source: string): Promise<KeyResult | null> {
  const b = bridge();
  if (!b || !isFilesystemPath(source)) return null;
  try {
    const res = (await b.invoke('audio:detectKey', source)) as
      | { success?: boolean; key?: string; scale?: string; confidence?: number }
      | null;
    if (res && res.success && typeof res.key === 'string' && res.key) {
      return {
        key: res.key,
        scale: typeof res.scale === 'string' ? res.scale : '',
        confidence: typeof res.confidence === 'number' ? res.confidence : 0,
      };
    }
  } catch {
    /* native bridge threw — no renderer fallback for key detection */
  }
  return null;
}

export interface LoudnessResult {
  /** Integrated loudness in LUFS (BS.1770). */
  lufs: number;
  /** Sample peak in dBFS. */
  peakDbfs: number;
}

/**
 * Measure integrated loudness (LUFS) + sample peak of `source`. Native-only —
 * the BS.1770 meter lives in Rust and there is no renderer equivalent, so this
 * resolves `null` for blob/URL sources rather than faking a figure.
 */
export async function analyzeLoudness(source: string): Promise<LoudnessResult | null> {
  const b = bridge();
  if (!b || !isFilesystemPath(source)) return null;
  try {
    const res = (await b.invoke('audio:loudness', source)) as
      | { success?: boolean; lufs?: number; peakDbfs?: number }
      | null;
    if (res && res.success && typeof res.lufs === 'number') {
      return { lufs: res.lufs, peakDbfs: typeof res.peakDbfs === 'number' ? res.peakDbfs : 0 };
    }
  } catch {
    /* native bridge threw — no renderer fallback for loudness */
  }
  return null;
}

export interface SilenceSummary {
  /** Number of silent gaps that would be trimmed. */
  gaps: number;
  removedSec: number;
  keptSec: number;
  originalSec: number;
  /** Which engine produced this. */
  engine: 'native' | 'renderer';
}

/**
 * Summarise trimmable silence in `source`. Uses the native engine for real file
 * paths and the shared Web-Audio decode + TS silence engine for blob/URL sources
 * — both real DSP, neither faked.
 */
export async function analyzeSilence(source: string): Promise<SilenceSummary | null> {
  const b = bridge();
  if (b && isFilesystemPath(source)) {
    try {
      const res = (await b.invoke('audio:analyzeSilence', source, {})) as
        | { success?: boolean; remove?: unknown[]; removedSec?: number; keptSec?: number; originalSec?: number }
        | null;
      if (res && res.success && Array.isArray(res.remove)) {
        return {
          gaps: res.remove.length,
          removedSec: res.removedSec ?? 0,
          keptSec: res.keptSec ?? 0,
          originalSec: res.originalSec ?? 0,
          engine: 'native',
        };
      }
    } catch {
      /* fall through to the renderer decode below */
    }
  }
  const decoded = await decodeAudioToMono(source);
  if (!decoded) return null;
  const plan = planSilenceRemoval(decoded.pcm, decoded.sampleRate);
  return {
    gaps: plan.remove.length,
    removedSec: plan.removedSec,
    keptSec: plan.keptSec,
    originalSec: plan.originalSec,
    engine: 'renderer',
  };
}
