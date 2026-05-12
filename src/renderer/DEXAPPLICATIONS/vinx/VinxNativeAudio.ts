// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// VinxNativeAudio — renderer-side helpers for Rust-backed audio IPC channels.
// All calls go through window.dex.invoke which is wired via the preload bridge.
// =============================================================================

// Types mirrored from src/main/native/types.ts (renderer can't import main code)
export interface NativeWaveformData {
  peaksPositive: number[];
  peaksNegative: number[];
  rms: number[];
  numBins: number;
  durationSecs: number;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

export interface NativeWaveformFlat {
  /** Flat interleaved: [peak_pos_0, peak_neg_0, peak_pos_1, peak_neg_1, ...] */
  peaks: number[];
  numBins: number;
  durationSecs: number;
  sampleRate: number;
  durationMs: number;
}

export interface NativeLoudnessResult {
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRangeLu: number;
  shortTermLufsMax: number;
  durationMs: number;
}

export interface NativeAudioMetadata {
  durationSecs: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: string;
  fileSize: number;
  totalSamples: number;
}

export interface NativeMediaProbe {
  type: 'audio' | 'video';
  durationSecs: number;
  sampleRate?: number;
  channels?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  audioCodec?: string;
  fileSize?: number;
}

export interface ExportProgressSnapshot {
  progress: number;
  fps: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to access the IPC bridge
// ─────────────────────────────────────────────────────────────────────────────

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const w = window as unknown as { dex?: { invoke?: (...a: unknown[]) => Promise<unknown> } };
  if (!w.dex?.invoke) {
    return Promise.reject(new Error('dex IPC bridge not available'));
  }
  return w.dex.invoke(channel, ...args) as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Waveform peak extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract waveform peaks from any audio format (MP3, OGG, FLAC, AAC, WAV).
 * Returns interleaved flat array: [pos_0, neg_0, pos_1, neg_1, ...].
 * Backed by Symphonia — fully native, zero JS thread cost.
 */
export async function extractWaveformAnyFormat(
  filePath: string,
  numBins = 512,
): Promise<NativeWaveformFlat> {
  return invoke<NativeWaveformFlat>('audio:waveform-any-format', filePath, numBins);
}

/**
 * Extract waveform peaks from a WAV file (fast path via hound).
 * Use for WAV clips; use extractWaveformAnyFormat for compressed formats.
 */
export async function extractWaveformWav(
  filePath: string,
  numBins = 512,
): Promise<NativeWaveformData> {
  return invoke<NativeWaveformData>('audio:waveform-peaks', filePath, numBins);
}

/**
 * Convert a NativeWaveformFlat into two separate arrays for AudioWaveformCanvas.
 */
export function splitFlatWaveform(flat: NativeWaveformFlat): {
  peaksPositive: Float32Array;
  peaksNegative: Float32Array;
} {
  const n = flat.numBins;
  const pos = new Float32Array(n);
  const neg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i] = flat.peaks[i * 2] ?? 0;
    neg[i] = flat.peaks[i * 2 + 1] ?? 0;
  }
  return { peaksPositive: pos, peaksNegative: neg };
}

// ─────────────────────────────────────────────────────────────────────────────
// LUFS loudness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Measure integrated loudness (LUFS) using ITU-R BS.1770-4 K-weighting.
 * Only works on WAV files currently (Rust hound decoder).
 */
export async function measureLoudness(filePath: string): Promise<NativeLoudnessResult> {
  return invoke<NativeLoudnessResult>('audio:measure-loudness', filePath);
}

/** Format a LUFS value for display, e.g. "-14.2 LUFS" */
export function formatLufs(value: number): string {
  if (!isFinite(value) || value <= -70) return '-inf LUFS';
  return `${value.toFixed(1)} LUFS`;
}

/** Streaming target presets */
export const STREAMING_TARGETS = {
  spotify: -14,
  appleMusic: -16,
  youtube: -14,
  tidal: -14,
  broadcast: -23,
  podcast: -16,
  filmDialog: -27,
} as const;

/** Gain delta needed to hit a streaming target from the current integrated LUFS */
export function gainToTarget(currentLufs: number, targetLufs: number): number {
  if (!isFinite(currentLufs) || currentLufs <= -70) return 0;
  return targetLufs - currentLufs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Media probe (audio + video)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Probe any media file and return type + metadata.
 * Used by VINX media bin on drag-drop import.
 */
export async function probeMediaFile(filePath: string): Promise<NativeMediaProbe> {
  return invoke<NativeMediaProbe>('vinx:import-media', filePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export progress (shared with background render queue)
// ─────────────────────────────────────────────────────────────────────────────

export async function setNativeExportProgress(progress: number, fps: number): Promise<void> {
  return invoke<void>('vinx:export-progress-set', progress, fps);
}

export async function getNativeExportProgress(): Promise<ExportProgressSnapshot> {
  return invoke<ExportProgressSnapshot>('vinx:export-progress-get');
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio normalization
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizeResult {
  success: boolean;
  outputPath: string;
  peakBefore: number;
  peakAfter: number;
  gainAppliedDb: number;
  durationMs: number;
}

export async function normalizeAudio(
  inputPath: string,
  outputPath: string,
  targetDb = -1.0,
): Promise<NormalizeResult> {
  return invoke<NormalizeResult>('audio:normalize', inputPath, outputPath, targetDb);
}

export async function clearWaveformCache(): Promise<number> {
  return invoke<number>('audio:clear-waveform-cache');
}
