// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Forge Media Encoder Feature Enhancements
 * Batch Processing, Queue Management, Preset System
 */

import { pickEncoder, type Codec, type GpuVendor, type EncoderName } from '../../../shared/video/hwEncoder';

// ==================== ENCODING PRESETS ====================
export interface EncodingPreset {
  id: string;
  name: string;
  category: 'video' | 'audio' | 'image' | 'archive';
  format: string;
  settings: EncodingSettings;
  description: string;
  builtIn: boolean;
}

export interface EncodingSettings {
  // Video
  videoCodec?: string;
  videoBitrate?: number;
  videoQuality?: number;
  resolution?: { width: number; height: number };
  frameRate?: number;
  pixelFormat?: string;
  
  // Audio
  audioCodec?: string;
  audioBitrate?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  
  // Image
  imageFormat?: string;
  imageQuality?: number;
  
  // General
  hardwareAcceleration?: boolean;
  twoPass?: boolean;
  fastStart?: boolean;
}

export const VIDEO_PRESETS: EncodingPreset[] = [
  {
    id: 'youtube-4k',
    name: 'YouTube 4K',
    category: 'video',
    format: 'mp4',
    description: 'Optimized for YouTube 4K uploads',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 40000,
      resolution: { width: 3840, height: 2160 },
      frameRate: 60,
      audioCodec: 'aac',
      audioBitrate: 320,
      audioSampleRate: 48000,
      fastStart: true,
      twoPass: true,
    },
  },
  {
    id: 'youtube-1080',
    name: 'YouTube 1080p',
    category: 'video',
    format: 'mp4',
    description: 'Optimized for YouTube Full HD',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 12000,
      resolution: { width: 1920, height: 1080 },
      frameRate: 60,
      audioCodec: 'aac',
      audioBitrate: 256,
      audioSampleRate: 48000,
      fastStart: true,
    },
  },
  {
    id: 'vimeo-4k',
    name: 'Vimeo 4K',
    category: 'video',
    format: 'mp4',
    description: 'Optimized for Vimeo 4K uploads',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 35000,
      resolution: { width: 3840, height: 2160 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 320,
      fastStart: true,
    },
  },
  {
    id: 'twitter-video',
    name: 'Twitter/X Video',
    category: 'video',
    format: 'mp4',
    description: 'Optimized for Twitter uploads',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 5000,
      resolution: { width: 1280, height: 720 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 128,
      fastStart: true,
    },
  },
  {
    id: 'instagram-feed',
    name: 'Instagram Feed',
    category: 'video',
    format: 'mp4',
    description: 'Square video for Instagram feed',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 3500,
      resolution: { width: 1080, height: 1080 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 128,
      fastStart: true,
    },
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story/Reels',
    category: 'video',
    format: 'mp4',
    description: 'Vertical video for Instagram Stories',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 6000,
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 128,
      fastStart: true,
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'video',
    format: 'mp4',
    description: 'Vertical video for TikTok',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 6000,
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 128,
      fastStart: true,
    },
  },
  {
    id: 'prores-422',
    name: 'ProRes 422',
    category: 'video',
    format: 'mov',
    description: 'High quality intermediate codec',
    builtIn: true,
    settings: {
      videoCodec: 'prores',
      videoQuality: 3,
      audioCodec: 'pcm_s24le',
      audioSampleRate: 48000,
    },
  },
  {
    id: 'dnxhd',
    name: 'DNxHD',
    category: 'video',
    format: 'mxf',
    description: 'Avid DNxHD broadcast format',
    builtIn: true,
    settings: {
      videoCodec: 'dnxhd',
      videoBitrate: 115000,
      resolution: { width: 1920, height: 1080 },
      audioCodec: 'pcm_s16le',
      audioSampleRate: 48000,
    },
  },
  {
    id: 'webm-vp9',
    name: 'WebM VP9',
    category: 'video',
    format: 'webm',
    description: 'Web optimized VP9 codec',
    builtIn: true,
    settings: {
      videoCodec: 'vp9',
      videoBitrate: 8000,
      audioCodec: 'opus',
      audioBitrate: 128,
    },
  },
  {
    id: 'gif',
    name: 'Animated GIF',
    category: 'video',
    format: 'gif',
    description: 'Animated GIF for web',
    builtIn: true,
    settings: {
      resolution: { width: 480, height: 270 },
      frameRate: 15,
    },
  },
  {
    id: 'hevc-4k',
    name: 'HEVC/H.265 4K',
    category: 'video',
    format: 'mp4',
    description: 'High efficiency 4K encoding',
    builtIn: true,
    settings: {
      videoCodec: 'hevc',
      videoBitrate: 20000,
      resolution: { width: 3840, height: 2160 },
      frameRate: 30,
      audioCodec: 'aac',
      audioBitrate: 256,
      hardwareAcceleration: true,
    },
  },
];

export const AUDIO_PRESETS: EncodingPreset[] = [
  {
    id: 'mp3-320',
    name: 'MP3 320kbps',
    category: 'audio',
    format: 'mp3',
    description: 'High quality MP3',
    builtIn: true,
    settings: {
      audioCodec: 'mp3',
      audioBitrate: 320,
      audioSampleRate: 44100,
      audioChannels: 2,
    },
  },
  {
    id: 'mp3-192',
    name: 'MP3 192kbps',
    category: 'audio',
    format: 'mp3',
    description: 'Standard quality MP3',
    builtIn: true,
    settings: {
      audioCodec: 'mp3',
      audioBitrate: 192,
      audioSampleRate: 44100,
      audioChannels: 2,
    },
  },
  {
    id: 'aac-256',
    name: 'AAC 256kbps',
    category: 'audio',
    format: 'm4a',
    description: 'High quality AAC',
    builtIn: true,
    settings: {
      audioCodec: 'aac',
      audioBitrate: 256,
      audioSampleRate: 48000,
      audioChannels: 2,
    },
  },
  {
    id: 'flac',
    name: 'FLAC Lossless',
    category: 'audio',
    format: 'flac',
    description: 'Lossless compression',
    builtIn: true,
    settings: {
      audioCodec: 'flac',
      audioSampleRate: 48000,
      audioChannels: 2,
    },
  },
  {
    id: 'wav-24',
    name: 'WAV 24-bit',
    category: 'audio',
    format: 'wav',
    description: 'Uncompressed 24-bit audio',
    builtIn: true,
    settings: {
      audioCodec: 'pcm_s24le',
      audioSampleRate: 48000,
      audioChannels: 2,
    },
  },
  {
    id: 'wav-16',
    name: 'WAV 16-bit CD Quality',
    category: 'audio',
    format: 'wav',
    description: 'CD quality uncompressed',
    builtIn: true,
    settings: {
      audioCodec: 'pcm_s16le',
      audioSampleRate: 44100,
      audioChannels: 2,
    },
  },
  {
    id: 'opus-128',
    name: 'Opus 128kbps',
    category: 'audio',
    format: 'opus',
    description: 'High quality at low bitrate',
    builtIn: true,
    settings: {
      audioCodec: 'opus',
      audioBitrate: 128,
      audioSampleRate: 48000,
    },
  },
  {
    id: 'ogg-q8',
    name: 'OGG Vorbis Q8',
    category: 'audio',
    format: 'ogg',
    description: 'Open format high quality',
    builtIn: true,
    settings: {
      audioCodec: 'libvorbis',
      audioSampleRate: 44100,
      audioChannels: 2,
    },
  },
];

export const IMAGE_PRESETS: EncodingPreset[] = [
  {
    id: 'jpeg-high',
    name: 'JPEG High Quality',
    category: 'image',
    format: 'jpg',
    description: 'High quality JPEG 95%',
    builtIn: true,
    settings: { imageFormat: 'jpeg', imageQuality: 95 },
  },
  {
    id: 'jpeg-web',
    name: 'JPEG Web Optimized',
    category: 'image',
    format: 'jpg',
    description: 'Web optimized JPEG 80%',
    builtIn: true,
    settings: { imageFormat: 'jpeg', imageQuality: 80 },
  },
  {
    id: 'png',
    name: 'PNG Lossless',
    category: 'image',
    format: 'png',
    description: 'Lossless with transparency',
    builtIn: true,
    settings: { imageFormat: 'png' },
  },
  {
    id: 'webp-high',
    name: 'WebP High Quality',
    category: 'image',
    format: 'webp',
    description: 'Modern web format',
    builtIn: true,
    settings: { imageFormat: 'webp', imageQuality: 90 },
  },
  {
    id: 'tiff',
    name: 'TIFF Uncompressed',
    category: 'image',
    format: 'tiff',
    description: 'Print quality uncompressed',
    builtIn: true,
    settings: { imageFormat: 'tiff' },
  },
  {
    id: 'avif',
    name: 'AVIF',
    category: 'image',
    format: 'avif',
    description: 'Next-gen image format',
    builtIn: true,
    settings: { imageFormat: 'avif', imageQuality: 80 },
  },
];

// ==================== QUEUE MANAGEMENT ====================
export interface QueueJob {
  id: string;
  source: string;
  destination: string;
  preset: EncodingPreset;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  priority: number;
  fileSize?: number;
  outputSize?: number;
  attempts?: number;
  resumeToken?: string;
  lastErrorCode?: ExportFailureKind;
}

export interface QueueSettings {
  parallelJobs: number;
  autoStart: boolean;
  shutdownAfterComplete: boolean;
  notifyOnComplete: boolean;
  overwriteExisting: boolean;
  deleteSourceAfterEncode: boolean;
  outputFolder: string;
  namingPattern: string;
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  parallelJobs: 1,
  autoStart: true,
  shutdownAfterComplete: false,
  notifyOnComplete: true,
  overwriteExisting: false,
  deleteSourceAfterEncode: false,
  outputFolder: '',
  namingPattern: '{filename}_{preset}',
};

// Naming pattern tokens
export const NAMING_TOKENS = [
  { token: '{filename}', description: 'Original filename without extension' },
  { token: '{ext}', description: 'Original file extension' },
  { token: '{preset}', description: 'Preset name' },
  { token: '{date}', description: 'Current date (YYYY-MM-DD)' },
  { token: '{time}', description: 'Current time (HH-MM-SS)' },
  { token: '{resolution}', description: 'Output resolution (e.g., 1920x1080)' },
  { token: '{codec}', description: 'Video codec name' },
  { token: '{counter}', description: 'Auto-incrementing number' },
];

// ==================== WATCH FOLDERS ====================
export interface WatchFolder {
  id: string;
  path: string;
  enabled: boolean;
  preset: string;
  outputFolder: string;
  includeSubfolders: boolean;
  fileTypes: string[];
  deleteAfterProcess: boolean;
}

// ==================== HARDWARE ACCELERATION ====================
export interface HardwareInfo {
  gpuName: string;
  gpuVendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  nvencSupported: boolean;
  qsvSupported: boolean;
  amfSupported: boolean;
  videotoolboxSupported: boolean;
  recommendedEncoder: string;
}

export const GPU_ENCODERS = {
  nvidia: ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'],
  amd: ['h264_amf', 'hevc_amf'],
  intel: ['h264_qsv', 'hevc_qsv', 'av1_qsv'],
  apple: ['h264_videotoolbox', 'hevc_videotoolbox'],
};

// Detect GPU vendor and available hardware encoders via WebGL
export function detectGPUCapabilities(): HardwareInfo {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  let gpuName = 'Unknown';
  let gpuVendor: HardwareInfo['gpuVendor'] = 'unknown';

  if (gl) {
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      gpuName = renderer;
      const lower = renderer.toLowerCase();
      if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('quadro') || lower.includes('rtx') || lower.includes('gtx')) {
        gpuVendor = 'nvidia';
      } else if (lower.includes('amd') || lower.includes('radeon') || lower.includes('rx ')) {
        gpuVendor = 'amd';
      } else if (lower.includes('intel') || lower.includes('iris') || lower.includes('uhd') || lower.includes('hd graphics')) {
        gpuVendor = 'intel';
      } else if (lower.includes('apple') || lower.includes('m1') || lower.includes('m2') || lower.includes('m3') || lower.includes('m4')) {
        gpuVendor = 'apple';
      }
    }
  }

  // Check MediaRecorder codec support as a proxy for hardware encoding
  const checkCodec = (codec: string) => {
    try { return MediaRecorder.isTypeSupported(`video/webm;codecs=${codec}`); } catch { return false; }
  };

  const nvencSupported = gpuVendor === 'nvidia' && (checkCodec('vp9') || checkCodec('vp8'));
  const qsvSupported = gpuVendor === 'intel' && checkCodec('vp9');
  const amfSupported = gpuVendor === 'amd' && (checkCodec('vp9') || checkCodec('vp8'));
  const videotoolboxSupported = gpuVendor === 'apple';

  const recommendedEncoder = gpuVendor === 'nvidia' ? 'h264_nvenc' :
    gpuVendor === 'intel' ? 'h264_qsv' :
    gpuVendor === 'amd' ? 'h264_amf' :
    gpuVendor === 'apple' ? 'h264_videotoolbox' : 'libx264';

  return { gpuName, gpuVendor, nvencSupported, qsvSupported, amfSupported, videotoolboxSupported, recommendedEncoder };
}

// ==================== UTILITY FUNCTIONS ====================

// Generate unique ID
export const generateId = (prefix: string = 'job'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format duration
export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Estimate encoding time
export const estimateEncodingTime = (
  fileDuration: number,
  preset: EncodingPreset,
  hardwareAccel: boolean
): number => {
  const baseMultiplier = preset.settings.twoPass ? 2 : 1;
  const codecMultiplier = preset.settings.videoCodec === 'hevc' ? 1.5 : 1;
  const hwMultiplier = hardwareAccel ? 0.3 : 1;
  const resMultiplier = (preset.settings.resolution?.width || 1920) > 1920 ? 1.5 : 1;
  
  return fileDuration * baseMultiplier * codecMultiplier * hwMultiplier * resMultiplier * 0.5;
};

// Apply naming pattern
export const applyNamingPattern = (
  pattern: string,
  source: string,
  preset: EncodingPreset,
  counter: number = 1
): string => {
  const filename = source.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'output';
  const ext = source.split('.').pop() || '';
  const now = new Date();
  
  return pattern
    .replace('{filename}', filename)
    .replace('{ext}', ext)
    .replace('{preset}', preset.name.replace(/\s+/g, '_'))
    .replace('{date}', now.toISOString().split('T')[0])
    .replace('{time}', now.toTimeString().split(' ')[0].replace(/:/g, '-'))
    .replace('{resolution}', preset.settings.resolution 
      ? `${preset.settings.resolution.width}x${preset.settings.resolution.height}` 
      : '')
    .replace('{codec}', preset.settings.videoCodec || preset.settings.audioCodec || '')
    .replace('{counter}', String(counter).padStart(3, '0'));
};

// Get all presets
export const getAllPresets = (): EncodingPreset[] => {
  const customPresets = loadCustomPresets();
  return [...VIDEO_PRESETS, ...AUDIO_PRESETS, ...IMAGE_PRESETS, ...customPresets];
};

// Save custom presets
export const saveCustomPresets = (presets: EncodingPreset[]) => {
  try {
    const custom = presets.filter(p => !p.builtIn);
    localStorage.setItem('dex-forge-presets', JSON.stringify(custom));
  } catch { /* storage unavailable */ }
};

// Load custom presets
export const loadCustomPresets = (): EncodingPreset[] => {
  try {
    const saved = localStorage.getItem('dex-forge-presets');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Save queue
export const saveQueue = (jobs: QueueJob[]) => {
  try {
    localStorage.setItem('dex-forge-queue', JSON.stringify(jobs));
  } catch { /* storage unavailable */ }
};

// Load queue
export const loadQueue = (): QueueJob[] => {
  try {
    const saved = localStorage.getItem('dex-forge-queue');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Save settings
export const saveQueueSettings = (settings: QueueSettings) => {
  try {
    localStorage.setItem('dex-forge-settings', JSON.stringify(settings));
  } catch { /* storage unavailable */ }
};

// Load settings
export const loadQueueSettings = (): QueueSettings => {
  try {
    const saved = localStorage.getItem('dex-forge-settings');
    return saved ? { ...DEFAULT_QUEUE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_QUEUE_SETTINGS;
  } catch {
    return DEFAULT_QUEUE_SETTINGS;
  }
};

// ===========================================================================
// ITEMS 201-205: ADVANCED ENCODING OPTIONS
// ===========================================================================

export interface AdvancedEncodingOptions {
  // Rate Control
  rateControl: 'cbr' | 'vbr' | 'crf' | 'cq';
  crfValue?: number;
  maxBitrate?: number;
  minBitrate?: number;
  bufferSize?: number;
  
  // GOP Settings
  keyframeInterval?: number;
  bFrames?: number;
  refFrames?: number;
  
  // Quality Tuning
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow' | 'placebo';
  tune?: 'film' | 'animation' | 'grain' | 'stillimage' | 'fastdecode' | 'zerolatency';
  profile?: 'baseline' | 'main' | 'high' | 'high10' | 'high422' | 'high444';
  level?: string;
  
  // Color
  colorPrimaries?: string;
  colorMatrix?: string;
  transferCharacteristics?: string;
  colorRange?: 'limited' | 'full';
  
  // HDR
  hdrEnabled?: boolean;
  hdrFormat?: 'hdr10' | 'hdr10+' | 'dolby-vision' | 'hlg';
  maxCll?: number;
  maxFall?: number;
}

export const DEFAULT_ADVANCED_OPTIONS: AdvancedEncodingOptions = {
  rateControl: 'crf',
  crfValue: 23,
  preset: 'medium',
  profile: 'high',
  level: '4.1',
  colorRange: 'limited',
  hdrEnabled: false,
};

export const QUALITY_PRESETS: Record<string, Partial<AdvancedEncodingOptions>> = {
  'fast-draft': { preset: 'veryfast', crfValue: 28, bFrames: 0 },
  'balanced': { preset: 'medium', crfValue: 23, bFrames: 3 },
  'high-quality': { preset: 'slow', crfValue: 18, bFrames: 4, refFrames: 5 },
  'archive': { preset: 'veryslow', crfValue: 15, bFrames: 6, refFrames: 6 },
  'streaming': { preset: 'fast', rateControl: 'cbr', tune: 'zerolatency' },
  'animation': { preset: 'slow', crfValue: 20, tune: 'animation' },
};

// ===========================================================================
// ITEMS 206-210: SMART QUEUE MANAGEMENT
// ===========================================================================

export interface SmartQueueOptions {
  priorityRules: PriorityRule[];
  scheduledTime?: number; // Unix timestamp
  dependsOn?: string[]; // Job IDs
  retryCount: number;
  retryDelay: number; // seconds
  notifications: QueueNotifications;
  autoResume: boolean;
}

export interface PriorityRule {
  id: string;
  condition: 'file-size' | 'duration' | 'resolution' | 'format' | 'time-added';
  operator: 'less-than' | 'greater-than' | 'equals';
  value: number | string;
  priority: number; // -10 to 10
}

export interface QueueNotifications {
  onJobComplete: boolean;
  onJobError: boolean;
  onQueueComplete: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
}

export const DEFAULT_SMART_QUEUE: SmartQueueOptions = {
  priorityRules: [],
  retryCount: 3,
  retryDelay: 60,
  notifications: {
    onJobComplete: false,
    onJobError: true,
    onQueueComplete: true,
    soundEnabled: false,
    desktopNotifications: true,
  },
  autoResume: true,
};

export function calculatePriority(job: { fileSize: number; duration: number; resolution: { width: number; height: number } }, rules: PriorityRule[]): number {
  let priority = 0;
  
  for (const rule of rules) {
    let value: number | string;
    
    switch (rule.condition) {
      case 'file-size':
        value = job.fileSize;
        break;
      case 'duration':
        value = job.duration;
        break;
      case 'resolution':
        value = job.resolution.width * job.resolution.height;
        break;
      default:
        continue;
    }
    
    let matches = false;
    if (typeof value === 'number' && typeof rule.value === 'number') {
      switch (rule.operator) {
        case 'less-than':
          matches = value < rule.value;
          break;
        case 'greater-than':
          matches = value > rule.value;
          break;
        case 'equals':
          matches = value === rule.value;
          break;
      }
    }
    
    if (matches) {
      priority += rule.priority;
    }
  }
  
  return Math.max(-10, Math.min(10, priority));
}

// ---------- export reliability (fixes-first 2026) -------------------------

export type ExportFailureKind =
  | 'device-lost'
  | 'oom'
  | 'io'
  | 'unsupported-codec'
  | 'timeout'
  | 'unknown';

export interface ExportRuntimeProbe {
  platform: NodeJS.Platform;
  gpuVendor: GpuVendor;
  forceCpu?: boolean;
}

export interface ExportAttempt {
  attempt: number;
  delaySec: number;
  encoder: EncoderName;
  bitrateScale: number;
  resolutionScale: number;
  reason: string;
}

export interface ExportRecoveryPlan {
  nonDestructive: true;
  checkpointHint: 'segment-output' | 'single-file';
  attempts: ExportAttempt[];
}

/**
 * Classify encoder failures into deterministic buckets so retry policy is
 * predictable and debuggable.
 */
export function classifyExportFailure(errorText: string): ExportFailureKind {
  const e = errorText.toLowerCase();
  if (e.includes('device lost') || e.includes('driver') || e.includes('gpu hung')) return 'device-lost';
  if (e.includes('out of memory') || e.includes('cannot allocate') || e.includes('oom')) return 'oom';
  if (e.includes('permission denied') || e.includes('no space left') || e.includes('i/o') || e.includes('disk')) return 'io';
  if (e.includes('unsupported') || e.includes('unknown encoder') || e.includes('invalid argument')) return 'unsupported-codec';
  if (e.includes('timeout') || e.includes('timed out') || e.includes('deadline')) return 'timeout';
  return 'unknown';
}

function normalizeCodec(codec?: string): Codec {
  const c = (codec ?? 'h264').toLowerCase();
  if (c === 'hevc' || c === 'h265') return 'hevc';
  if (c === 'av1') return 'av1';
  return 'h264';
}

/**
 * Build a non-destructive retry plan with encoder fallbacks and progressive
 * quality reduction. Keeps source untouched and enables segment retries.
 */
export function buildExportRecoveryPlan(
  job: Pick<QueueJob, 'preset' | 'id'>,
  smart: Pick<SmartQueueOptions, 'retryCount' | 'retryDelay'>,
  runtime: ExportRuntimeProbe,
  lastError?: string
): ExportRecoveryPlan {
  const codec = normalizeCodec(job.preset.settings.videoCodec);
  const picked = pickEncoder(codec, {
    platform: runtime.platform,
    gpu: runtime.gpuVendor,
    forceCpu: runtime.forceCpu,
  });
  const encoders: EncoderName[] = Array.from(new Set([picked.encoder, ...picked.fallbacks]));
  const failure = lastError ? classifyExportFailure(lastError) : 'unknown';
  const retryCount = Math.max(0, smart.retryCount);
  const attempts: ExportAttempt[] = [];

  for (let i = 0; i <= retryCount; i++) {
    const encoder = encoders[Math.min(i, encoders.length - 1)] ?? picked.encoder;
    const delaySec = i === 0 ? 0 : smart.retryDelay * i;
    const resolutionScale = i >= 3 ? 0.5 : i >= 2 ? 0.75 : 1;
    const bitrateScale = i >= 3 ? 0.65 : i >= 2 ? 0.8 : i >= 1 ? 0.9 : 1;
    const reason = i === 0 ? 'initial' : `${failure}-recovery`;
    attempts.push({
      attempt: i + 1,
      delaySec,
      encoder,
      bitrateScale,
      resolutionScale,
      reason,
    });
  }

  return {
    nonDestructive: true,
    checkpointHint: attempts.length > 2 ? 'segment-output' : 'single-file',
    attempts,
  };
}

export function nextRetryAt(failedAtMs: number, retryDelaySec: number, attempt: number): number {
  return failedAtMs + Math.max(0, retryDelaySec) * 1000 * Math.max(1, attempt);
}

// ===========================================================================
// ITEMS 211-215: MEDIA ANALYSIS
// ===========================================================================

export interface MediaAnalysis {
  fileInfo: FileInfo;
  videoStreams: VideoStreamInfo[];
  audioStreams: AudioStreamInfo[];
  subtitleStreams: SubtitleStreamInfo[];
  chapters: ChapterInfo[];
  metadata: Record<string, string>;
}

export interface FileInfo {
  path: string;
  size: number;
  duration: number;
  bitrate: number;
  format: string;
  formatName: string;
}

export interface VideoStreamInfo {
  index: number;
  codec: string;
  codecLong: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  pixelFormat: string;
  colorSpace?: string;
  hdr?: boolean;
  duration: number;
}

export interface AudioStreamInfo {
  index: number;
  codec: string;
  codecLong: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;
  bitrate: number;
  language?: string;
  title?: string;
}

export interface SubtitleStreamInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  forced: boolean;
  hearingImpaired: boolean;
}

export interface ChapterInfo {
  id: number;
  start: number;
  end: number;
  title: string;
}

export function formatMediaInfo(analysis: MediaAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`File: ${analysis.fileInfo.path}`);
  lines.push(`Size: ${formatFileSize(analysis.fileInfo.size)}`);
  lines.push(`Duration: ${formatDuration(analysis.fileInfo.duration)}`);
  lines.push(`Format: ${analysis.fileInfo.formatName}`);
  lines.push('');
  
  for (const video of analysis.videoStreams) {
    lines.push(`Video: ${video.codec.toUpperCase()} ${video.width}x${video.height} @ ${video.frameRate}fps`);
    if (video.hdr) lines.push('  HDR: Yes');
  }
  
  for (const audio of analysis.audioStreams) {
    lines.push(`Audio: ${audio.codec.toUpperCase()} ${audio.channelLayout} @ ${audio.sampleRate}Hz`);
    if (audio.language) lines.push(`  Language: ${audio.language}`);
  }
  
  return lines.join('\n');
}

// ===========================================================================
// ITEMS 216-220: WATCH FOLDER ENHANCEMENTS
// ===========================================================================

export interface WatchFolderConfig {
  pollingInterval: number; // ms
  debounceDelay: number; // ms
  maxConcurrent: number;
  autoStart: boolean;
  logChanges: boolean;
}

export const DEFAULT_WATCH_CONFIG: WatchFolderConfig = {
  pollingInterval: 1000,
  debounceDelay: 500,
  maxConcurrent: 2,
  autoStart: true,
  logChanges: true,
};

export function createWatchFolder(path: string, preset: string): WatchFolder {
  return {
    id: generateId(),
    path,
    enabled: true,
    preset,
    outputFolder: path,
    includeSubfolders: false,
    fileTypes: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
    deleteAfterProcess: false,
  };
}

export function matchesWatchFolder(filename: string, folder: WatchFolder): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return folder.fileTypes.includes(ext);
}

export function getWatchFolderStats(folder: WatchFolder): { pending: number; processed: number; errors: number } {
  // Stats would be tracked in a separate store
  return { pending: 0, processed: 0, errors: 0 };
}

// Watch folder persistence
export const saveWatchFolders = (folders: WatchFolder[]) => {
  try {
    localStorage.setItem('dex-forge-watch-folders', JSON.stringify(folders));
  } catch { /* storage unavailable */ }
};

export const loadWatchFolders = (): WatchFolder[] => {
  try {
    const saved = localStorage.getItem('dex-forge-watch-folders');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export default {
  VIDEO_PRESETS,
  AUDIO_PRESETS,
  IMAGE_PRESETS,
  DEFAULT_QUEUE_SETTINGS,
  NAMING_TOKENS,
  GPU_ENCODERS,
  DEFAULT_ADVANCED_OPTIONS,
  QUALITY_PRESETS,
  DEFAULT_SMART_QUEUE,
  generateId,
  formatFileSize,
  formatDuration,
  estimateEncodingTime,
  applyNamingPattern,
  getAllPresets,
  saveCustomPresets,
  loadCustomPresets,
  saveQueue,
  loadQueue,
  saveQueueSettings,
  loadQueueSettings,
  calculatePriority,
  classifyExportFailure,
  buildExportRecoveryPlan,
  nextRetryAt,
  formatMediaInfo,
  createWatchFolder,
  matchesWatchFolder,
  getWatchFolderStats,
  saveWatchFolders,
  loadWatchFolders,
  DEFAULT_WATCH_CONFIG,
};
