// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Renderer — Native Rust Bridge
// Thin wrapper for calling Rust native module functions from renderer via IPC.
// All calls go through the preload-gated invoke() channel.
// ===========================================================================

const api = () => (window as any).dex ?? (window as any).electronAPI;

const invoke = (channel: string, ...args: unknown[]): Promise<any> => {
  const a = api();
  if (!a?.invoke) return Promise.resolve(null);
  return a.invoke(channel, ...args);
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export const isNativeAvailable = (): Promise<boolean> => invoke('native:available');

// ---------------------------------------------------------------------------
// System Monitoring (Rust sysinfo crate)
// ---------------------------------------------------------------------------
export const getSystemStats = (): Promise<any> => invoke('native:system-stats');
export const getDiskInfo = (): Promise<any[]> => invoke('native:disk-info');
export const getNetworkInfo = (): Promise<any[]> => invoke('native:network-info');

// ---------------------------------------------------------------------------
// Process Management
// ---------------------------------------------------------------------------
export const getProcessList = (limit?: number): Promise<any[]> => invoke('native:process-list', limit);
export const closeProcess = (pid: number, force?: boolean): Promise<any> => invoke('native:process-close', pid, force);
export const freeMemory = (): Promise<any> => invoke('native:free-memory');

// ---------------------------------------------------------------------------
// Power Management
// ---------------------------------------------------------------------------
export const getPowerStatus = (): Promise<any> => invoke('native:power-status');
export const getPowerProfiles = (): Promise<any[]> => invoke('native:power-profiles');
export const setPowerProfile = (profile: string): Promise<any> => invoke('native:power-set-profile', profile);

// ---------------------------------------------------------------------------
// File Scanning (Rust jwalk crate — fast parallel directory walking)
// ---------------------------------------------------------------------------
export const scanDirectory = (
  rootPath: string,
  extensions?: string[],
  maxDepth?: number,
  limit?: number,
  includeDirs?: boolean,
): Promise<any> => invoke('native:file-scan', rootPath, extensions, maxDepth, limit, includeDirs);

export const getDirectorySize = (dirPath: string): Promise<any> => invoke('native:directory-size', dirPath);
export const scanMedia = (scanType: string, customPaths?: string[], limit?: number): Promise<any> =>
  invoke('native:media-scan', scanType, customPaths, limit);

// ---------------------------------------------------------------------------
// Health Monitoring
// ---------------------------------------------------------------------------
export const getHealthStatus = (): Promise<any> => invoke('native:health-status');
export const heartbeat = (): Promise<boolean> => invoke('native:health-heartbeat');
export const getHealthSuggestions = (): Promise<any[]> => invoke('native:health-suggestions');

// ---------------------------------------------------------------------------
// Image Processing (Rust image crate)
// ---------------------------------------------------------------------------
export const getImageMetadata = (filePath: string): Promise<any> => invoke('native:image-metadata', filePath);
export const generateThumbnail = (
  inputPath: string, outputPath: string, maxWidth: number, maxHeight: number,
): Promise<any> => invoke('native:image-thumbnail', inputPath, outputPath, maxWidth, maxHeight);
export const batchResizeImages = (
  inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string,
): Promise<any> => invoke('native:image-batch-resize', inputPaths, outputDir, maxWidth, maxHeight, format);

// ---------------------------------------------------------------------------
// Audio Processing (Rust hound crate)
// ---------------------------------------------------------------------------
export const getAudioMetadata = (filePath: string): Promise<any> => invoke('native:audio-metadata', filePath);
export const extractWaveformPeaks = (filePath: string, numBins: number): Promise<any> =>
  invoke('native:audio-waveform', filePath, numBins);
export const normalizeAudio = (
  inputPath: string, outputPath: string, targetDb?: number,
): Promise<any> => invoke('native:audio-normalize', inputPath, outputPath, targetDb);

// ---------------------------------------------------------------------------
// Video Metadata
// ---------------------------------------------------------------------------
export const getVideoMetadata = (filePath: string): Promise<any> => invoke('native:video-metadata', filePath);
export const probeMedia = (filePath: string): Promise<any> => invoke('native:media-probe', filePath);

// ---------------------------------------------------------------------------
// Creative Utilities (color, hashing, project analysis)
// ---------------------------------------------------------------------------
export const parseColor = (hex: string): Promise<any> => invoke('native:parse-color', hex);
export const hslToHex = (h: number, s: number, l: number): Promise<string | null> =>
  invoke('native:hsl-to-hex', h, s, l);
export const generatePalette = (hex: string, mode: string): Promise<string[] | null> =>
  invoke('native:generate-palette', hex, mode);
export const contrastRatio = (hex1: string, hex2: string): Promise<number | null> =>
  invoke('native:contrast-ratio', hex1, hex2);
export const hashFile = (filePath: string): Promise<string | null> =>
  invoke('native:hash-file', filePath);
export const batchHashFiles = (filePaths: string[]): Promise<any[] | null> =>
  invoke('native:batch-hash', filePaths);
export const analyzeProjectDir = (dirPath: string): Promise<any> =>
  invoke('native:analyze-project', dirPath);

// ---------------------------------------------------------------------------
// Native Core (dex-core Rust addon — physics, search, scheduler)
// ---------------------------------------------------------------------------
export const isCoreAvailable = (): Promise<boolean> => invoke('native-core:available');
export const fuzzySearch = (query: string, candidates: string[], limit: number): Promise<string[]> =>
  invoke('native-core:search-fuzzy', query, candidates, limit);
export const getMemoryPressure = (): Promise<string> => invoke('native-core:memory-pressure');
export const getPlatformInfo = (): Promise<string> => invoke('native-core:platform-info');
export const getSchedulerCores = (): Promise<number> => invoke('native-core:scheduler-cores');
