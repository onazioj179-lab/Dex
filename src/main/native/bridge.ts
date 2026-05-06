// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Native Bridge -- Connects Rust native module to existing IPC handlers
// Drop-in replacement for Python psutil + JS systeminformation calls
// ===========================================================================

import { getNativeModule, isNativeAvailable } from './index';
import type {
  SystemStats,
  DiskInfo,
  NetworkInfo,
  ProcessInfo,
  CloseProcessResult,
  PowerStatus,
  PowerResult,
  FileEntry,
  ScanResult,
  DirectorySize,
  HealthStatus,
  Suggestion,
  ImageMetadata,
  ThumbnailResult,
  BatchResizeResult,
  AudioMetadata,
  WaveformData,
  NormalizeResult,
  VideoMetadata,
  MediaProbeResult,
  ColorInfo,
  BatchHashResult,
  ProjectStats,
} from './types';
import log from 'electron-log';

// -------------------------------------------------------------------------
// Native-First API -- Uses Rust when available, falls back to JS
// -------------------------------------------------------------------------

/**
 * System monitoring bridge.
 * Replaces: systeminformation + Python psutil subprocess
 */
export const NativeSystem = {
  getStats(): SystemStats | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getSystemStats();
    } catch (e) {
      log.error('[NativeBridge] getStats failed:', e);
      return null;
    }
  },

  getDisks(): DiskInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getDiskInfo();
    } catch (e) {
      log.error('[NativeBridge] getDisks failed:', e);
      return [];
    }
  },

  getNetworks(): NetworkInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getNetworkInfo();
    } catch (e) {
      log.error('[NativeBridge] getNetworks failed:', e);
      return [];
    }
  },
};

/**
 * Process management bridge.
 * Replaces: ps-list + psutil.process_iter()
 */
export const NativeProcesses = {
  list(limit?: number): ProcessInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getProcesses(limit);
    } catch (e) {
      log.error('[NativeBridge] process list failed:', e);
      return [];
    }
  },

  close(pid: number, force?: boolean): CloseProcessResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, message: 'Native module not available' };
    try {
      return mod.closeProcess(pid, force);
    } catch (e) {
      log.error('[NativeBridge] close process failed:', e);
      return { success: false, message: String(e) };
    }
  },

  /** Close process(es) by name. AV-safe alternative to taskkill. */
  closeByName(processName: string, force?: boolean): CloseProcessResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, message: 'Native module not available' };
    try {
      return mod.closeProcessByName(processName, force);
    } catch (e) {
      log.error('[NativeBridge] close process by name failed:', e);
      return { success: false, message: String(e) };
    }
  },

  freeMemory(): CloseProcessResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, message: 'Native module not available' };
    try {
      return mod.freeMemory();
    } catch (e) {
      log.error('[NativeBridge] free memory failed:', e);
      return { success: false, message: String(e) };
    }
  },
};

/**
 * Power management bridge.
 * Replaces: Python PowerManager + PowerController shell commands
 */
export const NativePower = {
  getStatus(): PowerStatus | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getPowerStatus();
    } catch (e) {
      log.error('[NativeBridge] power status failed:', e);
      return null;
    }
  },

  setProfile(profile: string): PowerResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, profile, changes: [], error: 'Native module not available' };
    try {
      return mod.setPowerProfile(profile);
    } catch (e) {
      log.error('[NativeBridge] set profile failed:', e);
      return { success: false, profile, changes: [], error: String(e) };
    }
  },

  getProfiles() {
    const mod = getNativeModule();
    if (!mod) return [];
    return mod.getPowerProfiles();
  },
};

/**
 * File scanning bridge.
 * Replaces: sync readdirSync recursive scans
 */
export const NativeFiles = {
  scan(
    rootPath: string,
    extensions: string[] = [],
    maxDepth?: number,
    limit?: number,
    includeDirs?: boolean,
  ): ScanResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.scanDirectory(rootPath, extensions, maxDepth, limit, includeDirs);
    } catch (e) {
      log.error('[NativeBridge] scan failed:', e);
      return null;
    }
  },

  directorySize(dirPath: string): DirectorySize | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getDirectorySize(dirPath);
    } catch (e) {
      log.error('[NativeBridge] directory size failed:', e);
      return null;
    }
  },

  scanMedia(scanType: string, customPaths?: string[], limit?: number): ScanResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.scanMediaFiles(scanType, customPaths, limit);
    } catch (e) {
      log.error('[NativeBridge] media scan failed:', e);
      return null;
    }
  },
};

/**
 * Health and learning bridge.
 * Replaces: Python Watchdog + LearningEngine
 */
export const NativeHealth = {
  heartbeat(): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.heartbeat();
    } catch {
      // Silent -- health monitoring is non-critical
    }
  },

  recordError(msg: string): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.recordError(msg);
    } catch {
      // Silent
    }
  },

  getHealth(): HealthStatus | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getHealth();
    } catch (e) {
      log.error('[NativeBridge] health check failed:', e);
      return null;
    }
  },

  recordActivity(type: string, name: string): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.recordActivity(type, name);
    } catch {
      // Silent
    }
  },

  getSuggestions(): Suggestion[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getSuggestions();
    } catch {
      return [];
    }
  },
};

/**
 * Image processing bridge.
 * Provides: thumbnail generation, metadata extraction, batch resize via Rust `image` crate.
 */
export const NativeImage = {
  getMetadata(filePath: string): ImageMetadata | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getImageMetadata(filePath);
    } catch (e) {
      log.error('[NativeBridge] image metadata failed:', e);
      return null;
    }
  },

  generateThumbnail(inputPath: string, outputPath: string, maxWidth: number, maxHeight: number): ThumbnailResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.generateThumbnail(inputPath, outputPath, maxWidth, maxHeight);
    } catch (e) {
      log.error('[NativeBridge] thumbnail failed:', e);
      return null;
    }
  },

  batchResize(inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string): BatchResizeResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.batchResizeImages(inputPaths, outputDir, maxWidth, maxHeight, format);
    } catch (e) {
      log.error('[NativeBridge] batch resize failed:', e);
      return null;
    }
  },

  async batchResizeAsync(inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string): Promise<BatchResizeResult | null> {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return await mod.batchResizeImagesAsync(inputPaths, outputDir, maxWidth, maxHeight, format);
    } catch (e) {
      log.error('[NativeBridge] async batch resize failed:', e);
      return null;
    }
  },

  async generateThumbnailAsync(inputPath: string, outputPath: string, maxWidth: number, maxHeight: number): Promise<ThumbnailResult | null> {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return await mod.generateThumbnailAsync(inputPath, outputPath, maxWidth, maxHeight);
    } catch (e) {
      log.error('[NativeBridge] async thumbnail failed:', e);
      return null;
    }
  },

  getPixels(filePath: string, maxWidth?: number, maxHeight?: number): Buffer | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getImagePixels(filePath, maxWidth, maxHeight);
    } catch (e) {
      log.error('[NativeBridge] get pixels failed:', e);
      return null;
    }
  },
};

/**
 * Audio processing bridge.
 * Provides: metadata, waveform peaks, normalization via Rust `hound` crate.
 */
export const NativeAudio = {
  getMetadata(filePath: string): AudioMetadata | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getAudioMetadata(filePath);
    } catch (e) {
      log.error('[NativeBridge] audio metadata failed:', e);
      return null;
    }
  },

  extractWaveformPeaks(filePath: string, numBins: number): WaveformData | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.extractWaveformPeaks(filePath, numBins);
    } catch (e) {
      log.error('[NativeBridge] waveform peaks failed:', e);
      return null;
    }
  },

  normalize(inputPath: string, outputPath: string, targetDb?: number): NormalizeResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.normalizeAudio(inputPath, outputPath, targetDb);
    } catch (e) {
      log.error('[NativeBridge] normalize failed:', e);
      return null;
    }
  },

  async extractWaveformPeaksAsync(filePath: string, numBins: number): Promise<WaveformData | null> {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return await mod.extractWaveformPeaksAsync(filePath, numBins);
    } catch (e) {
      log.error('[NativeBridge] async waveform peaks failed:', e);
      return null;
    }
  },

  async normalizeAsync(inputPath: string, outputPath: string, targetDb?: number): Promise<NormalizeResult | null> {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return await mod.normalizeAudioAsync(inputPath, outputPath, targetDb);
    } catch (e) {
      log.error('[NativeBridge] async normalize failed:', e);
      return null;
    }
  },

  clearWaveformCache(): number {
    const mod = getNativeModule();
    if (!mod) return 0;
    try {
      return mod.clearWaveformCache();
    } catch {
      return 0;
    }
  },
};

/**
 * Video metadata bridge.
 * Provides: MP4/MOV container parsing, codec detection, media probing.
 */
export const NativeVideo = {
  getMetadata(filePath: string): VideoMetadata | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getVideoMetadata(filePath);
    } catch (e) {
      log.error('[NativeBridge] video metadata failed:', e);
      return null;
    }
  },

  probe(filePath: string): MediaProbeResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.probeMediaFile(filePath);
    } catch (e) {
      log.error('[NativeBridge] media probe failed:', e);
      return null;
    }
  },
};

// -------------------------------------------------------------------------
// Creative Utilities Bridge
// Provides: color conversion, file hashing, project analysis for all apps.
// -------------------------------------------------------------------------

export const NativeCreative = {
  parseColor(hex: string): ColorInfo | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.parseColor(hex);
    } catch (e) {
      log.error('[NativeBridge] parseColor failed:', e);
      return null;
    }
  },

  hslToHex(h: number, s: number, l: number): string | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.hslToHex(h, s, l);
    } catch (e) {
      log.error('[NativeBridge] hslToHex failed:', e);
      return null;
    }
  },

  generatePalette(hex: string, mode: string): string[] | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.generatePalette(hex, mode);
    } catch (e) {
      log.error('[NativeBridge] generatePalette failed:', e);
      return null;
    }
  },

  contrastRatio(hex1: string, hex2: string): number | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.contrastRatio(hex1, hex2);
    } catch (e) {
      log.error('[NativeBridge] contrastRatio failed:', e);
      return null;
    }
  },

  hashFile(filePath: string): string | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.hashFile(filePath);
    } catch (e) {
      log.error('[NativeBridge] hashFile failed:', e);
      return null;
    }
  },

  batchHashFiles(filePaths: string[]): BatchHashResult[] | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.batchHashFiles(filePaths);
    } catch (e) {
      log.error('[NativeBridge] batchHashFiles failed:', e);
      return null;
    }
  },

  analyzeProjectDir(dirPath: string): ProjectStats | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.analyzeProjectDir(dirPath);
    } catch (e) {
      log.error('[NativeBridge] analyzeProjectDir failed:', e);
      return null;
    }
  },
};

// -------------------------------------------------------------------------
// Status
// -------------------------------------------------------------------------

export { isNativeAvailable };

/**
 * Log native module status at startup.
 */
export function logNativeStatus(): void {
  if (isNativeAvailable()) {
    log.info('[Native] Rust native module ACTIVE -- Python subprocess eliminated');
    log.info('[Native] Modules: system monitoring, process management, file scanning, power control, health, image processing, audio processing, video metadata');
  } else {
    log.info('[Native] Rust native module NOT available -- using JS/Python fallbacks');
    log.info('[Native] Build native module: cd native && npm install && npm run build');
  }
}
