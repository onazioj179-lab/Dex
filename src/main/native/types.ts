// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Native -- TypeScript Type Definitions
// Auto-generated types matching Rust NAPI-RS struct exports
// ===========================================================================

// -------------------------------------------------------------------------
// System Monitoring
// -------------------------------------------------------------------------

export interface SystemStats {
  cpuPercent: number;
  cpuCount: number;
  cpuPerCore: number[];
  cpuFreqMhz: number;
  memoryTotal: number;
  memoryUsed: number;
  memoryPercent: number;
  memoryAvailable: number;
  swapTotal: number;
  swapUsed: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  batteryTimeLeft: number | null;
  uptime: number;
  platform: string;
  osVersion: string;
  hostname: string;
  kernelVersion: string;
}

export interface DiskInfo {
  mount: string;
  fsType: string;
  total: number;
  used: number;
  available: number;
  percent: number;
  name: string;
}

export interface NetworkInfo {
  name: string;
  rxBytes: number;
  txBytes: number;
  totalRx: number;
  totalTx: number;
}

// -------------------------------------------------------------------------
// Process Management
// -------------------------------------------------------------------------

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryMb: number;
  status: string;
  category: 'system' | 'user' | 'background' | 'safe_to_close';
}

export interface CloseProcessResult {
  success: boolean;
  message: string;
}

// -------------------------------------------------------------------------
// Power Management
// -------------------------------------------------------------------------

export interface PowerProfile {
  name: string;
  description: string;
  cpuLimit: number;
}

export interface PowerResult {
  success: boolean;
  profile: string;
  changes: string[];
  error: string | null;
}

export interface PowerStatus {
  profile: string;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  batteryTimeLeft: number | null;
}

// -------------------------------------------------------------------------
// File Scanning
// -------------------------------------------------------------------------

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified: number;
  isDirectory: boolean;
}

export interface ScanResult {
  files: FileEntry[];
  totalScanned: number;
  durationMs: number;
  truncated: boolean;
}

export interface DirectorySize {
  totalBytes: number;
  fileCount: number;
  dirCount: number;
}

// -------------------------------------------------------------------------
// Health Monitoring
// -------------------------------------------------------------------------

export interface HealthStatus {
  uptime: number;
  uptimeFormatted: string;
  errorCount: number;
  memoryMb: number;
  avgMemoryMb: number;
  memoryTrend: 'stable' | 'increasing' | 'decreasing';
  healthy: boolean;
}

export interface Suggestion {
  suggestionType: string;
  name: string;
  reason: string;
}

// -------------------------------------------------------------------------
// Image Processing
// -------------------------------------------------------------------------

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  colorType: string;
  fileSize: number;
  hasAlpha: boolean;
}

export interface ThumbnailResult {
  success: boolean;
  outputPath: string;
  width: number;
  height: number;
  durationMs: number;
}

export interface BatchResizeResult {
  total: number;
  succeeded: number;
  failed: number;
  outputs: string[];
  errors: string[];
  durationMs: number;
}

// -------------------------------------------------------------------------
// Audio Processing
// -------------------------------------------------------------------------

export interface AudioMetadata {
  durationSecs: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: string;
  fileSize: number;
  totalSamples: number;
}

export interface WaveformData {
  peaksPositive: number[];
  peaksNegative: number[];
  rms: number[];
  numBins: number;
  durationSecs: number;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

export interface NormalizeResult {
  success: boolean;
  outputPath: string;
  peakBefore: number;
  peakAfter: number;
  gainAppliedDb: number;
  durationMs: number;
}

export interface LoudnessResult {
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRangeLu: number;
  shortTermLufsMax: number;
  durationMs: number;
}

export interface WaveformPeaksFlat {
  /** Flat interleaved [peak_pos_0, peak_neg_0, peak_pos_1, peak_neg_1, ...] */
  peaks: number[];
  numBins: number;
  durationSecs: number;
  sampleRate: number;
  durationMs: number;
}

export interface ExportProgressSnapshot {
  progress: number;
  fps: number;
}

// -------------------------------------------------------------------------
// Video Metadata
// -------------------------------------------------------------------------

export interface VideoMetadata {
  durationSecs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec: string;
  audioChannels: number;
  audioSampleRate: number;
  bitrateKbps: number;
  fileSize: number;
  container: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface MediaProbeResult {
  mediaType: string;
  playable: boolean;
  width: number;
  height: number;
  durationSecs: number;
  codec: string;
  fileSize: number;
}

// -------------------------------------------------------------------------
// Creative Utilities Types
// -------------------------------------------------------------------------

export interface ColorInfo {
  hex: string;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
  luminance: number;
  isDark: boolean;
}

export interface BatchHashResult {
  path: string;
  hash: string;
  size: number;
}

export interface ProjectStats {
  totalFiles: number;
  totalSizeBytes: number;
  audioFiles: number;
  videoFiles: number;
  imageFiles: number;
  otherFiles: number;
  largestFilePath: string;
  largestFileSize: number;
}

// -------------------------------------------------------------------------
// Kernel Types
// -------------------------------------------------------------------------

export interface KernelSchedulerStats {
  workers: number;
  submitted: number;
  completed: number;
  stolen: number;
  queueLengths: number[];
}

export interface KernelMemoryStats {
  youngEntries: number;
  matureEntries: number;
  oldEntries: number;
  cacheHits: number;
  cacheMisses: number;
  evictions: number;
  slabAllocated: number;
  slabReused: number;
  pressureActive: boolean;
}

export interface KernelIOStats {
  reads: number;
  writes: number;
  bytesRead: number;
  bytesWritten: number;
  coalescedWrites: number;
  readCacheSize: number;
  pendingWrites: number;
}

export interface KernelIPCStats {
  messagesSent: number;
  messagesReceived: number;
  batchesFlushed: number;
  bytesCompressed: number;
  bytesUncompressed: number;
  compressionRatio: number;
  activeChannels: number;
}

export interface KernelCPUStats {
  stringsInterned: number;
  stringsDeduped: number;
  internTableSize: number;
  batchOperations: number;
  batchItemsProcessed: number;
  flagsSet: number;
  idRegistrySize: number;
}

export interface KernelStartupStats {
  modulesCached: number;
  cacheHits: number;
  cacheMisses: number;
  startupComplete: boolean;
  totalStartupUs: number;
  marks: string[];
}

export interface KernelPerfStats {
  frameP50Ms: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameAvgMs: number;
  ipcP50Ms: number;
  ipcP95Ms: number;
  ipcP99Ms: number;
  ioP50Ms: number;
  ioP95Ms: number;
  ioP99Ms: number;
  opsPerSec: number;
  effectiveFps: number;
  targetFps: number;
  droppedFrames: number;
  totalFrames: number;
  budgetExceeded: number;
}

// -------------------------------------------------------------------------
// Native Module Interface
// -------------------------------------------------------------------------

export interface DexNativeModule {
  // System
  getSystemStats(): SystemStats;
  getDiskInfo(): DiskInfo[];
  getNetworkInfo(): NetworkInfo[];

  // Processes
  getProcesses(limit?: number): ProcessInfo[];
  closeProcess(pid: number, force?: boolean): CloseProcessResult;
  closeProcessByName(processName: string, force?: boolean): CloseProcessResult;
  freeMemory(): CloseProcessResult;

  // Power
  getPowerProfiles(): PowerProfile[];
  setPowerProfile(profile: string): PowerResult;
  getPowerStatus(): PowerStatus;

  // Files
  scanDirectory(
    rootPath: string,
    extensions: string[],
    maxDepth?: number,
    limit?: number,
    includeDirs?: boolean,
  ): ScanResult;
  getDirectorySize(dirPath: string): DirectorySize;
  scanMediaFiles(
    scanType: string,
    customPaths?: string[],
    limit?: number,
  ): ScanResult;

  // Health
  heartbeat(): void;
  recordError(errorMessage: string): void;
  getHealth(): HealthStatus;

  // Learning
  recordActivity(activityType: string, name: string): void;
  getSuggestions(): Suggestion[];

  // Image Processing
  getImageMetadata(filePath: string): ImageMetadata;
  generateThumbnail(inputPath: string, outputPath: string, maxWidth: number, maxHeight: number): ThumbnailResult;
  batchResizeImages(inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string): BatchResizeResult;
  getImagePixels(filePath: string, maxWidth?: number, maxHeight?: number): Buffer;
  // Async image variants (non-blocking for Electron main thread)
  batchResizeImagesAsync(inputPaths: string[], outputDir: string, maxWidth: number, maxHeight: number, format?: string): Promise<BatchResizeResult>;
  generateThumbnailAsync(inputPath: string, outputPath: string, maxWidth: number, maxHeight: number): Promise<ThumbnailResult>;

  // Audio Processing
  getAudioMetadata(filePath: string): AudioMetadata;
  extractWaveformPeaks(filePath: string, numBins: number): WaveformData;
  normalizeAudio(inputPath: string, outputPath: string, targetDb?: number): NormalizeResult;
  // Async audio variants (non-blocking for Electron main thread)
  extractWaveformPeaksAsync(filePath: string, numBins: number): Promise<WaveformData>;
  normalizeAudioAsync(inputPath: string, outputPath: string, targetDb?: number): Promise<NormalizeResult>;
  clearWaveformCache(): number;
  // LUFS loudness measurement (ITU-R BS.1770-4)
  measureLoudness(filePath: string): LoudnessResult;
  measureLoudnessAsync(filePath: string): Promise<LoudnessResult>;
  // Multi-format waveform decode (MP3/OGG/FLAC/AAC via Symphonia)
  decodeWaveformAnyFormat(filePath: string, numBins: number): WaveformPeaksFlat;
  decodeWaveformAnyFormatAsync(filePath: string, numBins: number): Promise<WaveformPeaksFlat>;
  // Background export progress tracker
  setExportProgress(progress: number, fps: number): void;
  getExportProgress(): ExportProgressSnapshot;

  // Video Metadata
  getVideoMetadata(filePath: string): VideoMetadata;
  probeMediaFile(filePath: string): MediaProbeResult;

  // Creative Utilities
  parseColor(hex: string): ColorInfo;
  hslToHex(h: number, s: number, l: number): string;
  generatePalette(hex: string, mode: string): string[];
  contrastRatio(hex1: string, hex2: string): number;
  hashFile(filePath: string): string;
  batchHashFiles(filePaths: string[]): BatchHashResult[];
  analyzeProjectDir(dirPath: string): ProjectStats;

  // Kernel: Scheduler
  kernelInitScheduler(numWorkers?: number): number;
  kernelSubmitTask(priority: number, payload: string): number;
  kernelDequeueTask(workerId: number): string | null;
  kernelScheduleTimer(delayMs: number, payload: string): number;
  kernelAdvanceTimer(): string[];
  kernelSchedulerStats(): KernelSchedulerStats;

  // Kernel: Memory
  kernelInitMemory(youngCap?: number, matureCap?: number, oldCap?: number): boolean;
  kernelCacheGet(key: string): Buffer | null;
  kernelCacheSet(key: string, value: Buffer): void;
  kernelCacheTrim(percent: number): void;
  kernelCacheClear(): void;
  kernelSlabAcquire(): Buffer;
  kernelSlabRelease(slab: Buffer): void;
  kernelCheckMemoryPressure(): boolean;
  kernelMemoryStats(): KernelMemoryStats;

  // Kernel: IO
  kernelInitIo(writeBatchSize?: number, readCacheCap?: number): boolean;
  kernelReadFile(path: string): Promise<Buffer>;
  kernelReadFiles(paths: string[]): Promise<Buffer[]>;
  kernelWriteFile(path: string, data: Buffer): Promise<boolean>;
  kernelEnqueueWrite(path: string, offset: number, data: Buffer): void;
  kernelFlushWrites(path?: string): Promise<number>;
  kernelInvalidateReadCache(path: string): void;
  kernelIoStats(): KernelIOStats;

  // Kernel: IPC
  kernelInitIpc(maxBatch?: number, maxBytes?: number): boolean;
  kernelIpcSend(channel: string, payload: Buffer): Buffer | null;
  kernelIpcFlush(channel: string): Buffer;
  kernelIpcFlushAll(): string[];
  kernelIpcDecodeBatch(data: Buffer): Buffer[];
  kernelIpcEncodeBatch(messages: Buffer[]): Buffer;
  kernelCompress(data: Buffer, level?: number): Buffer;
  kernelDecompress(data: Buffer): Buffer;
  kernelIpcStats(): KernelIPCStats;

  // Kernel: CPU
  kernelInitCpu(): boolean;
  kernelInternString(s: string): number;
  kernelInternBulk(strings: string[]): number[];
  kernelResolveString(id: number): string | null;
  kernelRegisterId(name: string): number;
  kernelLookupId(name: string): number | null;
  kernelFlagSet(bit: number): void;
  kernelFlagClear(bit: number): void;
  kernelFlagTest(bit: number): boolean;
  kernelFlagPopcount(): number;
  kernelBatchHash(items: string[]): number[];
  kernelBatchSort(items: string[]): string[];
  kernelBatchDedupe(items: string[]): string[];
  kernelJsonParse(input: string): string;
  kernelHrtimeUs(): number;
  kernelPopcount32(x: number): number;
  kernelCpuStats(): KernelCPUStats;

  // Kernel: Startup
  kernelInitStartup(): boolean;
  kernelStartupMark(label: string): void;
  kernelStartupComplete(): void;
  kernelCacheModule(moduleId: string, sourceHash: string, data: Buffer): boolean;
  kernelGetCachedModule(moduleId: string, sourceHash: string): Buffer | null;
  kernelInvalidateModule(moduleId: string): void;
  kernelClearModuleCache(): void;
  kernelStartupStats(): KernelStartupStats;

  // Kernel: Performance Counters
  kernelInitPerf(targetFps?: number): boolean;
  kernelPerfRecordFrame(durationUs: number): void;
  kernelPerfRecordIpc(durationUs: number): void;
  kernelPerfRecordIo(durationUs: number): void;
  kernelPerfShouldSkipFrame(): boolean;
  kernelPerfSetTargetFps(fps: number): void;
  kernelPerfReset(): void;
  kernelPerfStats(): KernelPerfStats;

  // Kernel: Scheduler Enhancements
  kernelSchedulerAgeTasks(boostAmount?: number): number;
  kernelSchedulerDrain(): number;
  kernelSchedulerPending(): number;

  // Kernel: IO Enhancements
  kernelPrefetchFiles(paths: string[]): Promise<number>;
  kernelBatchStat(paths: string[]): Promise<string[]>;
  kernelClearReadCache(): number;

  // ── AXL Solid Geometry Kernel (C via Rust FFI) ──────────────────────
  axlCreateBox(width: number, height: number, depth: number): AxlMeshResult;
  axlCreateCylinder(radius: number, height: number, segments?: number): AxlMeshResult;
  axlCreateSphere(radius: number, rings?: number, segments?: number): AxlMeshResult;
  axlCreateCone(radius: number, height: number, segments?: number): AxlMeshResult;
  axlCreateTorus(majorRadius: number, minorRadius: number, majorSegments?: number, minorSegments?: number): AxlMeshResult;
  axlExtrudeProfile(profilePoints: number[], dir: number[], distance: number): AxlMeshResult;
  axlRevolveProfile(profilePoints: number[], angleDeg: number, segments?: number): AxlMeshResult;
  axlBooleanOp(aVertices: number[], aIndices: number[], bVertices: number[], bIndices: number[], op: string): AxlMeshResult;
  axlMeshStats(vertices: number[], indices: number[]): AxlMeshStats;
}

export interface AxlMeshResult {
  vertices: number[];
  normals: number[];
  indices: number[];
  edges: number[];
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
}

export interface AxlMeshStats {
  volume: number;
  surfaceArea: number;
  isManifold: boolean;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
}
