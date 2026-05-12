// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// AudioNativeService — IPC handlers for Rust-backed audio processing
//   Channels:
//     audio:get-metadata          -> AudioMetadata
//     audio:waveform-peaks        -> WaveformData (WAV only, fast)
//     audio:waveform-any-format   -> WaveformPeaksFlat (any format via Symphonia)
//     audio:measure-loudness      -> LoudnessResult (ITU-R BS.1770-4)
//     audio:normalize             -> NormalizeResult
//     audio:clear-waveform-cache  -> number (evicted count)
//     vinx:import-media           -> VideoMetadata | AudioMetadata (probe any file)
//     vinx:export-progress-set    -> void
//     vinx:export-progress-get    -> ExportProgressSnapshot
// =============================================================================

import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { getNativeModule } from '../native/index';

// Allowed extensions for media probe (no arbitrary file access)
const AUDIO_EXTS = new Set([
  'wav', 'wave', 'mp3', 'ogg', 'oga', 'flac', 'aac', 'm4a',
  'aiff', 'aif', 'wma', 'opus',
]);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv']);
const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);

function validateMediaPath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path');
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const ext = path.extname(resolved).replace('.', '').toLowerCase();
  if (!MEDIA_EXTS.has(ext)) {
    throw new Error(`Unsupported media type: .${ext}`);
  }
  return resolved;
}

export function registerAudioNativeHandlers(): void {
  const native = getNativeModule();
  if (!native) {
    log.warn('[AudioNativeService] Rust native module unavailable — audio IPC handlers not registered');
    return;
  }

  // ── Audio metadata ───────────────────────────────────────────────────────
  ipcMain.handle('audio:get-metadata', async (_e, filePath: unknown) => {
    const resolved = validateMediaPath(filePath);
    return native.getAudioMetadata(resolved);
  });

  // ── Waveform peaks (WAV, fast path) ─────────────────────────────────────
  ipcMain.handle('audio:waveform-peaks', async (_e, filePath: unknown, numBins: unknown) => {
    const resolved = validateMediaPath(filePath);
    const bins = typeof numBins === 'number' && numBins > 0 ? Math.min(numBins, 4096) : 512;
    return native.extractWaveformPeaksAsync(resolved, bins);
  });

  // ── Waveform peaks (any format via Symphonia) ────────────────────────────
  ipcMain.handle('audio:waveform-any-format', async (_e, filePath: unknown, numBins: unknown) => {
    const resolved = validateMediaPath(filePath);
    const bins = typeof numBins === 'number' && numBins > 0 ? Math.min(numBins, 4096) : 512;
    return native.decodeWaveformAnyFormatAsync(resolved, bins);
  });

  // ── LUFS loudness measurement ────────────────────────────────────────────
  ipcMain.handle('audio:measure-loudness', async (_e, filePath: unknown) => {
    const resolved = validateMediaPath(filePath);
    const ext = path.extname(resolved).replace('.', '').toLowerCase();
    if (!AUDIO_EXTS.has(ext)) {
      throw new Error('Loudness measurement requires an audio file');
    }
    return native.measureLoudnessAsync(resolved);
  });

  // ── Normalize audio ──────────────────────────────────────────────────────
  ipcMain.handle('audio:normalize', async (
    _e,
    inputPath: unknown,
    outputPath: unknown,
    targetDb: unknown,
  ) => {
    const resolvedIn = validateMediaPath(inputPath);
    if (typeof outputPath !== 'string' || outputPath.length === 0) {
      throw new Error('Invalid output path');
    }
    const resolvedOut = path.resolve(outputPath as string);
    const db = typeof targetDb === 'number' ? targetDb : -1.0;
    return native.normalizeAudioAsync(resolvedIn, resolvedOut, db);
  });

  // ── Clear waveform cache ─────────────────────────────────────────────────
  ipcMain.handle('audio:clear-waveform-cache', () => {
    return native.clearWaveformCache();
  });

  // ── VINX: probe any media file (audio or video) ─────────────────────────
  ipcMain.handle('vinx:import-media', async (_e, filePath: unknown) => {
    const resolved = validateMediaPath(filePath);
    const ext = path.extname(resolved).replace('.', '').toLowerCase();

    if (VIDEO_EXTS.has(ext)) {
      const meta = native.getVideoMetadata(resolved);
      return { type: 'video', ...meta };
    }
    const meta = native.getAudioMetadata(resolved);
    return { type: 'audio', ...meta };
  });

  // ── Export progress (used by background render queue) ───────────────────
  ipcMain.handle('vinx:export-progress-set', (_e, progress: unknown, fps: unknown) => {
    const p = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
    const f = typeof fps === 'number' ? Math.max(0, fps) : 0;
    native.setExportProgress(p, f);
  });

  ipcMain.handle('vinx:export-progress-get', () => {
    return native.getExportProgress();
  });

  log.info('[AudioNativeService] IPC handlers registered');
}
