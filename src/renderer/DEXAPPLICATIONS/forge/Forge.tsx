/**
 * DEX Platform - FORGE Media Encoder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional batch media encoding and transcoding
 */
import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { clampEventToViewport } from '../../utils/menuPosition';
import { CreativeSlider, SegmentedControl } from '../../components/controls';
import DexIcon from '../../components/DexIcon';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAutoSave, loadAutoSave } from '../../utils/useAutoSave';
import AutosaveIndicator, { type AutosaveState } from '../../components/AutosaveIndicator';
import { useToastHelpers } from '../../components/Toast';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { useAppTracking } from '../../services/usePatternLearning';
import { dispatchActivity, updateActivity, completeActivity } from '../../utils/liveActivity';
import {
  detectGPUCapabilities,
  formatFileSize,
  formatDuration as forgeFormatDuration,
  estimateOutputFileSize,
} from './ForgeFeatures';
import type { HardwareInfo } from './ForgeFeatures';
import {
  detectSourceKind,
  planTarget,
  transcodeImage,
  transcodeAudioToWav,
  decodeAudioPeaks,
  encodeWav,
  type AudioPeaks,
} from './transcode';
import { useCreativeAppSettings } from '../../utils/creative-suite';
import CreativeMenuBar, { type CreativeMenu } from '../../components/CreativeMenuBar';

// ===========================================================================
// DEX FORGE - Professional Media Encoder
// Apple Compressor / Adobe Media Encoder alternative with batch transcoding
// ===========================================================================

// ==================== APP IDENTITY ====================
export const FORGE_VERSION = '1.0.0';
export const FORGE_BUILD_DATE = '2026-04-11';

const MAX_QUEUE_JOBS = 200;

// ==================== TYPES ====================
interface Job {
  id: string;
  name: string;
  source: string;
  destination: string;
  preset: string;
  format: string;
  // 'unsupported' = real outcome: job needs the native encoder (no fake completion).
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused' | 'unsupported';
  progress: number;
  duration: number;
  estimatedTime: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  outputSize?: number;
  inputSize?: number;
  outputBlobUrl?: string;
  isAudio?: boolean;
  // Real output container produced by the in-browser transcode (drives the
  // download filename + MIME): 'png' | 'jpg' | 'webp' | 'wav'.
  outputExt?: string;
  outputMime?: string;
}

interface Preset {
  id: string;
  name: string;
  category: string;
  format: string;
  codec: string;
  container: string;
  width?: number;
  height?: number;
  framerate?: number;
  bitrate?: number;
  audioBitrate?: number;
  audioCodec?: string;
  twoPass?: boolean;
  description: string;
}

interface WatchFolder {
  id: string;
  path: string;
  preset: string;
  destination: string;
  active: boolean;
}

// ==================== SVG ICONS (Professional) ====================
const Icons = {
  // File Types
  file: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  fileVideo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m10 11 5 3-5 3v-6z"/></svg>,
  fileAudio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12v4a2 2 0 1 1-4 0"/><circle cx="8" cy="16" r="2"/></svg>,
  fileImage: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="10" cy="12" r="2"/><path d="m20 17-3-3-7 7"/></svg>,
  
  // Folders
  folder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  folderPlus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>,
  folderOpen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>,
  folderWatch: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><circle cx="12" cy="14" r="3"/><path d="M12 11v3l2 1"/></svg>,
  
  // Transport
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/></svg>,
  stop: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  
  // Actions
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  checkCircle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  xCircle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  
  // Status
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  clockFast: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 10"/><path d="M3 12h2"/><path d="M19 12h2"/></svg>,
  timer: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="12" y2="8"/><circle cx="12" cy="14" r="8"/></svg>,
  hourglass: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>,
  
  // Settings & Config
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  sliders: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  tune: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  
  // Media Types
  video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>,
  videoFile: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  audio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  audioWave: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10v4"/><path d="M6 6v12"/><path d="M10 3v18"/><path d="M14 6v12"/><path d="M18 10v4"/><path d="M22 8v8"/></svg>,
  image: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
  
  // Transfer
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>,
  
  // Performance
  zap: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  zapFilled: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  rocket: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  gauge: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>,
  layers: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  
  // Hardware
  cpu: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>,
  gpu: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01"/><path d="M6 12h12M6 16h12"/></svg>,
  hardDrive: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>,
  database: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  
  // UI
  chevronRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  chevronUp: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  
  // Alerts
  alert: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  alertCircle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  
  // File Operations
  save: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  
  // Encoding specific
  encode: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="m7 7 5 5 5-5"/></svg>,
  decode: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="m7 12 5-5 5 5"/></svg>,
  convert: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3v10"/><path d="m12 8 5-5 5 5"/><path d="M7 21V11"/><path d="m12 16-5 5-5-5"/></svg>,
  compress: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>,
  queue: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  
  // Codec/Format icons
  codec: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v4a2 2 0 0 1-2 2H4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 22v-4a2 2 0 0 0-2-2H4"/><path d="M14 22v-4a2 2 0 0 1 2-2h4"/><rect x="6" y="6" width="12" height="12" rx="2"/></svg>,
  quality: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 12 2 12"/><path d="M12 12 12 2"/></svg>,
};

/**
 * Honest inline banner for video-edit panels (watermark, trim, crop, subtitle,
 * conditional rules). Forge has no in-browser VIDEO encoder — those jobs route
 * to the native encoder, which is not bundled in this build. So these settings
 * are RECORDED on the job (and shown in the summary) but the pixels/timeline are
 * only changed when a native encoder runs. This note stops the panel from
 * masquerading as a working in-browser edit.
 */
const NativeEncoderNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '7px 9px', background: 'var(--color-warning-muted, rgba(255,149,10,0.08))', border: '1px solid var(--color-warning-muted, rgba(255,149,10,0.18))', borderRadius: 'var(--radius-lg)', marginBottom: 10 }}>
    <span style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>{Icons.alert}</span>
    <span style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-warning)' }}>{children}</span>
  </div>
);

// ==================== PRESETS ====================
const DEFAULT_PRESETS: Preset[] = [
  // ProRes Family
  { id: 'prores-422hq', name: 'Apple ProRes 422 HQ', category: 'Professional', format: 'ProRes', codec: 'prores_ks', container: 'mov', bitrate: 220000, description: 'Highest quality ProRes for mastering' },
  { id: 'prores-422', name: 'Apple ProRes 422', category: 'Professional', format: 'ProRes', codec: 'prores_ks', container: 'mov', bitrate: 147000, description: 'Standard ProRes for post-production' },
  { id: 'prores-lt', name: 'Apple ProRes 422 LT', category: 'Professional', format: 'ProRes', codec: 'prores_ks', container: 'mov', bitrate: 100000, description: 'Lighter ProRes for editing' },
  { id: 'prores-proxy', name: 'Apple ProRes Proxy', category: 'Professional', format: 'ProRes', codec: 'prores_ks', container: 'mov', bitrate: 45000, description: 'Offline editing proxy' },
  
  // H.265/HEVC
  { id: 'hevc-master', name: 'HEVC Master', category: 'Modern Codecs', format: 'HEVC', codec: 'libx265', container: 'mp4', bitrate: 50000, description: 'High quality HEVC for archival' },
  { id: 'hevc-4k', name: 'HEVC 4K HDR', category: 'Modern Codecs', format: 'HEVC', codec: 'libx265', container: 'mp4', width: 3840, height: 2160, bitrate: 35000, description: '4K Ultra HD with HDR support' },
  { id: 'hevc-1080', name: 'HEVC 1080p', category: 'Modern Codecs', format: 'HEVC', codec: 'libx265', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, description: 'Full HD HEVC' },
  
  // H.264
  { id: 'h264-master', name: 'H.264 Master', category: 'Standard', format: 'H.264', codec: 'libx264', container: 'mp4', bitrate: 50000, twoPass: true, description: 'High quality H.264' },
  { id: 'h264-1080', name: 'H.264 1080p', category: 'Standard', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, description: 'Standard 1080p delivery' },
  { id: 'h264-720', name: 'H.264 720p', category: 'Standard', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1280, height: 720, bitrate: 5000, description: 'HD web delivery' },
  
  // Web/Streaming
  { id: 'youtube-4k', name: 'YouTube 4K', category: 'Web', format: 'H.264', codec: 'libx264', container: 'mp4', width: 3840, height: 2160, bitrate: 45000, description: 'YouTube 4K upload' },
  { id: 'youtube-1080', name: 'YouTube 1080p', category: 'Web', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1920, height: 1080, bitrate: 12000, description: 'YouTube HD upload' },
  { id: 'vimeo-4k', name: 'Vimeo 4K', category: 'Web', format: 'H.264', codec: 'libx264', container: 'mp4', width: 3840, height: 2160, bitrate: 50000, description: 'Vimeo 4K upload' },
  { id: 'webm-vp9', name: 'WebM VP9', category: 'Web', format: 'VP9', codec: 'libvpx-vp9', container: 'webm', bitrate: 8000, description: 'Web-optimized VP9' },
  
  // Audio
  { id: 'aac-256', name: 'AAC 256kbps', category: 'Audio', format: 'AAC', codec: 'aac', container: 'm4a', audioBitrate: 256, description: 'High quality AAC' },
  { id: 'mp3-320', name: 'MP3 320kbps', category: 'Audio', format: 'MP3', codec: 'libmp3lame', container: 'mp3', audioBitrate: 320, description: 'Maximum quality MP3' },
  { id: 'flac', name: 'FLAC Lossless', category: 'Audio', format: 'FLAC', codec: 'flac', container: 'flac', description: 'Lossless audio archival' },
  { id: 'wav', name: 'WAV Uncompressed', category: 'Audio', format: 'WAV', codec: 'pcm_s24le', container: 'wav', description: 'Uncompressed PCM audio' },
  
  // GIF/Image Sequence
  { id: 'gif-hq', name: 'GIF High Quality', category: 'Other', format: 'GIF', codec: 'gif', container: 'gif', framerate: 15, description: 'Animated GIF' },
  { id: 'png-seq', name: 'PNG Sequence', category: 'Other', format: 'PNG', codec: 'png', container: 'png', description: 'PNG image sequence' },
  { id: 'tiff-seq', name: 'TIFF Sequence', category: 'Other', format: 'TIFF', codec: 'tiff', container: 'tiff', description: 'TIFF image sequence' },

  // Social Media
  { id: 'twitter-video', name: 'Twitter/X Video', category: 'Social Media', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1280, height: 720, bitrate: 5000, description: 'Twitter/X HD video upload' },
  { id: 'instagram-feed', name: 'Instagram Feed', category: 'Social Media', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1080, height: 1080, bitrate: 6000, description: 'Instagram square feed video' },
  { id: 'instagram-story', name: 'Instagram Story/Reels', category: 'Social Media', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1080, height: 1920, bitrate: 8000, description: 'Instagram vertical 9:16' },
  { id: 'tiktok', name: 'TikTok', category: 'Social Media', format: 'H.264', codec: 'libx264', container: 'mp4', width: 1080, height: 1920, bitrate: 8000, description: 'TikTok vertical video' },

  // Broadcast
  { id: 'dnxhd', name: 'Avid DNxHD', category: 'Broadcast', format: 'H.264', codec: 'dnxhd', container: 'mxf', bitrate: 115000, description: 'Broadcast DNxHD for Avid' },
  { id: 'broadcast-1080i', name: 'Broadcast 1080i', category: 'Broadcast', format: 'H.264', codec: 'libx264', container: 'mxf', width: 1920, height: 1080, bitrate: 50000, description: 'HD broadcast interlaced' },
];

// Format-specific colored badge icons
const FORMAT_COLORS: Record<string, string> = {
  ProRes: 'var(--color-success)', HEVC: '#bf5af2', 'H.264': 'var(--color-accent)', VP9: 'var(--color-warning)',
  AAC: '#ff375f', MP3: '#ff375f', FLAC: '#64d2ff', WAV: '#64d2ff',
  GIF: 'var(--color-warning)', PNG: 'var(--color-success)', TIFF: 'var(--color-success)',
};
const getFormatIcon = (format: string): React.ReactNode => {
  const c = FORMAT_COLORS[format] || '#888';
  switch (format) {
    case 'ProRes': return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke={c} strokeWidth="1.3"/><text x="8" y="9.5" textAnchor="middle" fill={c} fontSize="5" fontWeight="700" fontFamily="inherit">PR</text></svg>;
    case 'HEVC': return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke={c} strokeWidth="1.3"/><text x="8" y="9.5" textAnchor="middle" fill={c} fontSize="4.5" fontWeight="700" fontFamily="inherit">H265</text></svg>;
    case 'H.264': return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke={c} strokeWidth="1.3"/><text x="8" y="9.5" textAnchor="middle" fill={c} fontSize="4.5" fontWeight="700" fontFamily="inherit">H264</text></svg>;
    case 'VP9': return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke={c} strokeWidth="1.3"/><text x="8" y="9.5" textAnchor="middle" fill={c} fontSize="5" fontWeight="700" fontFamily="inherit">VP9</text></svg>;
    default: return format === 'AAC' || format === 'MP3' || format === 'FLAC' || format === 'WAV' ? Icons.audio : Icons.video;
  }
};

// ==================== COMPONENT ====================
const Forge: React.FC = () => {
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);
  // Creative app settings from Settings page
  useCreativeAppSettings('forge');
  const collab = useCollaborationFeatures({ appId: 'forge', projectName: 'FORGE Queue', autoCheckpointInterval: 300000 });

  // Mount guard — prevents setState after unmount in long async operations
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ===== PATTERN LEARNING =====
  useAppTracking('forge');
  const toast = useToastHelpers();

  // Listen for incoming assets from other creative apps
  useCreativeInbox('forge', useCallback((asset) => {
    if (asset.data) {
      const newJob: Job = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: asset.name || 'Imported Media',
        source: asset.data,
        destination: '',
        preset: 'fast',
        format: asset.kind === 'audio' ? 'aac' : 'mp4',
        status: 'queued',
        progress: 0,
        duration: 0,
        estimatedTime: 0,
        inputSize: 0,
      };
      setJobs(prev => prev.length < MAX_QUEUE_JOBS ? [...prev, newJob] : prev);
      setIsDirty(true);
    }
    toast.success(`Imported "${asset.name}" from ${asset.sourceApp}`);
  }, [toast]));

  // ===== RUNNING APPS =====

  // ===== STATE =====
  const [jobs, setJobs] = useState<Job[]>(() => {
    // Recover from the actual autosave key. Previously this read 'forge-jobs',
    // which nothing ever writes (useAutoSave persists to 'dex-autosave-forge'),
    // so the queue was never actually restored.
    try {
      const recovered = loadAutoSave<{ jobs?: Job[] }>('forge');
      if (recovered?.jobs && Array.isArray(recovered.jobs) && recovered.jobs.length > 0) return recovered.jobs;
    } catch { /* ignore */ }
    // Legacy key fallback for queues saved before the autosave unification.
    try { const saved = localStorage.getItem('forge-jobs'); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; } } catch { /* ignore */ }
    return [];
  });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>(() => {
    try { const saved = localStorage.getItem('forge-custom-presets'); return saved ? [...DEFAULT_PRESETS, ...JSON.parse(saved)] : DEFAULT_PRESETS; } catch { return DEFAULT_PRESETS; }
  });
  // Strip outputBlobUrl before persisting: blob: URLs are per-session and become
  // dangling references after a reload, so a recovered "completed" job would show
  // a broken download link. Everything else (metadata, settings, progress) keeps.
  useAutoSave('forge', useCallback(() => ({
    jobs: jobs.map(j => { const copy = { ...j }; delete copy.outputBlobUrl; return copy; }),
    presets,
  }), [jobs, presets]), isDirty, 30_000);
  // Queue autosave status surfaced in the header. The encode queue has no manual
  // save, so this reassures the user their queue/presets are being persisted.
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    setAutosaveState('saving');
    const t = setTimeout(() => {
      setAutosaveState('saved');
      setLastSavedAt(Date.now());
    }, 800);
    return () => clearTimeout(t);
  }, [isDirty, jobs, presets]);

  // Undo/redo for queue operations
  const [undoStack, setUndoStack] = useState<Job[][]>([]);
  const [redoStack, setRedoStack] = useState<Job[][]>([]);
  const pushUndo = useCallback(() => { setUndoStack(u => [...u.slice(-49), jobs]); setRedoStack([]); }, [jobs]);
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(r => [...r, jobs]);
    setJobs(undoStack[undoStack.length - 1]);
    setUndoStack(u => u.slice(0, -1));
  }, [undoStack, jobs]);
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(u => [...u, jobs]);
    setJobs(redoStack[redoStack.length - 1]);
    setRedoStack(r => r.slice(0, -1));
  }, [redoStack, jobs]);
  const [selectedPreset, setSelectedPreset] = useState<string>('h264-1080');
  const [watchFolders, setWatchFolders] = useState<WatchFolder[]>([]);
  const [isEncoding, setIsEncoding] = useState(false); // Start paused until user adds jobs
  
  // Settings
  const [parallelJobs, setParallelJobs] = useState(() => Math.max(1, Math.min(8, Math.floor((navigator.hardwareConcurrency || 4) / 2))));
  const [useHardwareAccel, setUseHardwareAccel] = useState(true);
  const [gpuInfo, setGpuInfo] = useState<HardwareInfo | null>(null);
  const [shutdownAfter, setShutdownAfter] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  
  // Active panel
  // Default to 'presets': the sidebar only renders presets/watch/settings panels,
  // so a 'queue' default left no tab highlighted and the sidebar body empty on
  // first load (the queue lives in the main area, not a sidebar tab).
  const [activeTab, setActiveTab] = useState<'presets' | 'watch' | 'settings'>('presets');
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const [newPresetName, setNewPresetName] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [storageInfo, setStorageInfo] = useState<string>('Local Storage');
  
  // === PRO FEATURES STATE ===
  const [showImageSequence, setShowImageSequence] = useState(false);
  // Frame formats the browser canvas can REALLY encode (canvas.toBlob). TIFF/EXR/
  // DPX were offered before but silently came out as PNG bytes with a lying file
  // extension — removed. True HDR/film formats need the native encoder.
  const [imgSeqFormat, setImgSeqFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [showAudioExtract, setShowAudioExtract] = useState(false);
  // Only the two formats the renderer can REALLY produce: uncompressed WAV (via
  // the PCM encoder) and Opus-in-WebM (via MediaRecorder). mp3/flac/aac were
  // offered before but always silently came out as Opus — removed for honesty.
  const [audioExtractFormat, setAudioExtractFormat] = useState<'wav' | 'opus'>('wav');
  const [showWatermark, setShowWatermark] = useState(false);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');
  const [watermarkText, setWatermarkText] = useState('DEX');
  const [watermarkOpacity, setWatermarkOpacity] = useState(60);
  const [watermarkPosition, setWatermarkPosition] = useState<'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'>('bottom-right');
  const [showTrimSplit, setShowTrimSplit] = useState(false);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(100);
  // Real decoded waveform for the trim panel + its loading/error state.
  const [trimWave, setTrimWave] = useState<AudioPeaks | null>(null);
  const [trimWaveState, setTrimWaveState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle');
  // Which handle the user is dragging on the waveform ('in' | 'out' | null).
  const trimDragRef = useRef<'in' | 'out' | null>(null);
  const trimTrackRef = useRef<HTMLDivElement>(null);
  const [showCropPad, setShowCropPad] = useState(false);
  const [cropAspect, setCropAspect] = useState<'free' | '16:9' | '4:3' | '1:1' | '9:16'>('free');
  const [padColor, setPadColor] = useState('#000000');
  const [showSubBurnIn, setShowSubBurnIn] = useState(false);
  const [subBurnFont, setSubBurnFont] = useState('Arial');
  const [subBurnSize, setSubBurnSize] = useState(24);
  const [subBurnPosition, setSubBurnPosition] = useState<'Bottom' | 'Top' | 'Center'>('Bottom');
  const [subBurnStyle, setSubBurnStyle] = useState<'Outline' | 'Shadow' | 'Box'>('Outline');
  const [showConditionalRules, setShowConditionalRules] = useState(false);
  const [conditionalRules, setConditionalRules] = useState<Array<{ condition: string; action: string; enabled: boolean }>>([
    { condition: 'Resolution > 1080p', action: 'Downscale to 1080p', enabled: true },
    { condition: 'Bitrate > 20 Mbps', action: 'Re-encode at 12 Mbps', enabled: false },
    { condition: 'Audio channels > 2', action: 'Downmix to stereo', enabled: true },
  ]);

  // === NEW PRO FEATURES ===
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [batchRenamePattern, setBatchRenamePattern] = useState('{name}_{preset}');
  const [showConcat, setShowConcat] = useState(false);
  const [concatOrder, setConcatOrder] = useState<string[]>([]);
  const [showABCompare, setShowABCompare] = useState(false);
  const [audioNormalize, setAudioNormalize] = useState(false);
  const [audioNormTarget, setAudioNormTarget] = useState(-14);
  const [dragOverMain, setDragOverMain] = useState(false);
  const [customOutputDir, setCustomOutputDir] = useState('Desktop/Exports/');
  // True while an async media operation (audio extract / smart join) is running,
  // so its trigger button is disabled and can't kick off overlapping work.
  const [mediaBusy, setMediaBusy] = useState(false);
  // Live, rotating status verbs for the media operations (replaces frozen
  // "Extracting…"/"Joining…" labels). Each button reads its own kind.
  const extractPhrase = useWorkingPhrase(mediaBusy, 'extract');
  const joinPhrase = useWorkingPhrase(mediaBusy, 'join');
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewSourceUrlRef = useRef<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; jobId: string | null }>({ visible: false, x: 0, y: 0, jobId: null });
  const [previewSourceUrl, setPreviewSourceUrl] = useState<string | null>(null);

  // Refs for encoding engine
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeEncodings = useRef<Set<string>>(new Set());
  // Track watch-folder IPC listeners so they can be detached on unmount.
  // Without this each added watch folder leaks a 'watch:fileAdded' handler.
  const watchHandlersRef = useRef<Array<(event: any, data: any) => void>>([]);

  // Cleanup blob URLs on unmount to prevent memory leaks
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  useEffect(() => {
    return () => {
      jobsRef.current.forEach(j => {
        if (j.outputBlobUrl) try { URL.revokeObjectURL(j.outputBlobUrl); } catch { /* already revoked */ }
      });
      // Detach any watch-folder IPC listeners registered during this session
      watchHandlersRef.current.forEach(h => {
        try { window.electron?.ipcRenderer?.off?.('watch:fileAdded', h); } catch { /* already detached */ }
      });
      watchHandlersRef.current = [];
    };
  }, []);

  // Drag and drop handlers for main area
  const handleMainDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOverMain(true);
  }, []);
  const handleMainDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOverMain(false);
  }, []);
  const handleMainDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOverMain(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const newJobs: Job[] = [];
    for (const file of Array.from(files)) {
      const kind = detectSourceKind(file);
      const isAudio = kind === 'audio';
      const estimatedDuration = Math.ceil(file.size / (isAudio ? 128000 : 2000000));
      const preset = presets.find(p => p.id === selectedPreset);
      const defaultFormat = kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : (preset?.format || 'H.264');
      const newJob: Job = {
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name, source: file.name, destination: customOutputDir,
        preset: selectedPreset, format: defaultFormat,
        status: 'queued', progress: 0, duration: estimatedDuration,
        estimatedTime: Math.ceil(estimatedDuration * 0.3),
        inputSize: file.size, isAudio,
      };
      fileMapRef.current.set(newJob.id, file);
      newJobs.push(newJob);
    }
    setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
    if (newJobs.length > 0) setSelectedJobId(newJobs[0].id);
  }, [selectedPreset, presets, customOutputDir]);

  // Close tools menu on outside click or Escape key
  useEffect(() => {
    const handleClick = () => setShowToolsMenu(false);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowToolsMenu(false); };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    if (previewSourceUrlRef.current) {
      URL.revokeObjectURL(previewSourceUrlRef.current);
      previewSourceUrlRef.current = null;
    }

    if (!(showPreview || showABCompare) || !selectedJobId) {
      setPreviewSourceUrl(null);
      return;
    }

    const sourceFile = fileMapRef.current.get(selectedJobId);
    if (!sourceFile) {
      setPreviewSourceUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(sourceFile);
    previewSourceUrlRef.current = nextUrl;
    setPreviewSourceUrl(nextUrl);

    return () => {
      if (previewSourceUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        previewSourceUrlRef.current = null;
      }
    };
  }, [selectedJobId, showPreview, showABCompare]);

  // ===== RETENTIVE MEMORY - Load/Save Workspace State =====
  useEffect(() => {
    const saved = localStorage.getItem('forge-workspace');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.selectedPreset) setSelectedPreset(data.selectedPreset);
        if (data.parallelJobs) setParallelJobs(data.parallelJobs);
        if (data.useHardwareAccel !== undefined) setUseHardwareAccel(data.useHardwareAccel);
        if (data.shutdownAfter !== undefined) setShutdownAfter(data.shutdownAfter);
        if (data.notifyOnComplete !== undefined) setNotifyOnComplete(data.notifyOnComplete);
        if (data.activeTab && ['presets', 'watch', 'settings'].includes(data.activeTab)) setActiveTab(data.activeTab);
        if (data.presetCategory) setPresetCategory(data.presetCategory);
        if (data.watchFolders) setWatchFolders(data.watchFolders);
      } catch (e) { console.warn('[Forge] Failed to restore workspace from localStorage:', e); }
    }
  }, []);

  // ===== GPU DETECTION =====
  useEffect(() => {
    const info = detectGPUCapabilities();
    setGpuInfo(info);
  }, []);

  useEffect(() => {
    try {
      const data = {
        selectedPreset, parallelJobs, useHardwareAccel,
        shutdownAfter, notifyOnComplete, activeTab, presetCategory, watchFolders,
      };
      localStorage.setItem('forge-workspace', JSON.stringify(data));
    } catch (e) { console.warn('[Forge] Failed to save workspace:', e); }
  }, [selectedPreset, parallelJobs, useHardwareAccel, shutdownAfter, notifyOnComplete, activeTab, presetCategory, watchFolders]);

  // ===== STORAGE ESTIMATE =====
  useEffect(() => {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        if (!mountedRef.current) return;
        if (estimate.quota && estimate.usage !== undefined) {
          const free = estimate.quota - estimate.usage;
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
          const i = free > 0 ? Math.floor(Math.log(free) / Math.log(k)) : 0;
          const freeStr = parseFloat((free / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
          setStorageInfo(`Local Storage (${freeStr} available)`);
        }
      }).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
  }, []);


  // Process one job with real browser-based transcoding
  const processJob = useCallback(async (jobId: string) => {
    const file = fileMapRef.current.get(jobId);
    const job = jobs.find(j => j.id === jobId);
    const preset = job ? presets.find(p => p.id === job.preset) : undefined;
    setJobs(prev => prev.map(j => j.id === jobId
      ? { ...j, status: 'processing' as const, startTime: Date.now() }
      : j));

    if (!file) {
      setJobs(prev => prev.map(j => j.id === jobId
        ? { ...j, status: 'failed' as const, error: 'No source file -- add a real media file to encode' }
        : j));
      activeEncodings.current.delete(jobId);
      return;
    }

    // Determine what the source actually is and whether the chosen target is
    // achievable in-browser. Image->PNG/JPEG/WebP and audio->WAV produce REAL
    // files; everything else is honestly flagged as needing the native encoder.
    const targetFormat = (job?.format || preset?.format || '').toString();
    const plan = planTarget(file, targetFormat);

    // ----- REAL IMAGE TRANSCODE (decode -> canvas -> toBlob) -----
    if (plan.route === 'image' && plan.imageTarget) {
      try {
        // Honor resolution from per-job override or preset; honor quality from
        // per-job audio/quality controls is N/A for images — use preset quality
        // when present, else a sensible default.
        const jobAny = job as any;
        let width: number | undefined;
        let height: number | undefined;
        const overrideRes: string | undefined = jobAny?.overrideRes;
        if (overrideRes && /^\d+x\d+$/.test(overrideRes)) {
          const [w, h] = overrideRes.split('x').map(Number);
          width = w; height = h;
        } else if (preset?.width && preset?.height) {
          width = preset.width; height = preset.height;
        }
        // Quality: prefer an explicit per-job override (0-100), else default high.
        const rawQuality = jobAny?.imageQuality;
        const quality = typeof rawQuality === 'number' ? rawQuality / 100 : 0.92;

        const result = await transcodeImage(file, plan.imageTarget, {
          quality,
          width,
          height,
          preserveAspect: !(width && height), // only force exact dims when both supplied
        });
        if (!mountedRef.current) return;
        const blobUrl = URL.createObjectURL(result.blob);
        setJobs(prev => prev.map(j => j.id === jobId ? {
          ...j, status: 'completed' as const, progress: 100,
          outputBlobUrl: blobUrl, outputSize: result.blob.size,
          outputExt: result.ext, outputMime: result.mime, endTime: Date.now(),
        } : j));
        window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'filesConverted', amount: 1 } }));
        if (notifyOnComplete && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('FORGE — Image Encoded', { body: `${file.name} → ${result.ext.toUpperCase()}` });
        }
      } catch (err: any) {
        if (!mountedRef.current) return;
        setJobs(prev => prev.map(j => j.id === jobId ? {
          ...j, status: 'failed' as const, error: err?.message || 'Image transcode failed',
        } : j));
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Image transcode failed: ${err?.message || file.name}` } }));
      } finally {
        activeEncodings.current.delete(jobId);
        fileMapRef.current.delete(jobId);
      }
      return;
    }

    // ----- REAL AUDIO -> WAV (PCM WAV encoder) -----
    if (plan.route === 'audio-wav') {
      try {
        const jobAny = job as any;
        // 24-bit if the preset/codec asks for it, else CD-quality 16-bit.
        const wantsHi = /24|pcm_s24/i.test(`${preset?.codec || ''} ${jobAny?.overrideAudioCodec || ''} ${preset?.name || ''}`);
        const bitDepth: 16 | 24 = wantsHi ? 24 : 16;
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 30 } : j));
        // Honor any trim set in the Trim & Split panel (0..1 fractions on the job),
        // and apply loudness normalization when the user enabled it (real RMS gain
        // on the decoded PCM — see normalizeAudioBufferRms). Only affects the real
        // WAV path; lossy targets are native-only and never reach here.
        const tIn = Math.max(0, Math.min(1, jobAny?.trimIn ?? 0));
        const tOut = Math.max(tIn, Math.min(1, jobAny?.trimOut ?? 1));
        const result = await transcodeAudioToWav(file, {
          bitDepth,
          trimIn: tIn,
          trimOut: tOut,
          normalizeDb: audioNormalize ? audioNormTarget : undefined,
        });
        if (!mountedRef.current) return;
        const blobUrl = URL.createObjectURL(result.blob);
        setJobs(prev => prev.map(j => j.id === jobId ? {
          ...j, status: 'completed' as const, progress: 100,
          outputBlobUrl: blobUrl, outputSize: result.blob.size,
          outputExt: result.ext, outputMime: result.mime, endTime: Date.now(),
        } : j));
        window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'filesConverted', amount: 1 } }));
        if (notifyOnComplete && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('FORGE — Audio Encoded', { body: `${file.name} → WAV ${bitDepth}-bit` });
        }
      } catch (err: any) {
        if (!mountedRef.current) return;
        setJobs(prev => prev.map(j => j.id === jobId ? {
          ...j, status: 'failed' as const, error: err?.message || 'Audio decode/WAV encode failed',
        } : j));
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `WAV encode failed: ${err?.message || file.name}` } }));
      } finally {
        activeEncodings.current.delete(jobId);
        fileMapRef.current.delete(jobId);
      }
      return;
    }

    // ----- NATIVE-ONLY (lossy audio, all video codecs, TIFF/AVIF/GIF, etc.) -----
    // Honestly flag it. Never report a fake "completed" with no real file.
    if (plan.route === 'native') {
      const reason = plan.reason || 'This target requires the native encoder.';
      setJobs(prev => prev.map(j => j.id === jobId ? {
        ...j, status: 'unsupported' as const, progress: 0, error: reason, endTime: Date.now(),
      } : j));
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: reason } }));
      activeEncodings.current.delete(jobId);
      fileMapRef.current.delete(jobId);
      return;
    }

    // Defensive fallback: planTarget routes every job to image / audio-wav /
    // native above, so this is unreachable. If a future plan route slips
    // through, fail honestly rather than fake a completion.
    setJobs(prev => prev.map(j => j.id === jobId ? {
      ...j, status: 'failed' as const, error: 'No in-browser transcoder for this job',
    } : j));
    activeEncodings.current.delete(jobId);
    fileMapRef.current.delete(jobId);
  }, [notifyOnComplete, jobs, presets, audioNormalize, audioNormTarget]);

  // Mirror encode jobs into the Home "Live Activity" feed (DEX 5.7) so encoding
  // progress shows as a live card on the Home screen. Centralized + throttled to
  // whole-percent changes so the rAF-rate progress updates don't spam events.
  const liveActivityRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const tracked = liveActivityRef.current;
    jobs.forEach(j => {
      const actId = `forge-${j.id}`;
      const pct = Math.round(j.progress);
      if (j.status === 'processing') {
        if (!tracked.has(j.id)) {
          tracked.set(j.id, pct);
          dispatchActivity({ id: actId, type: 'encode', label: `Encoding ${j.name}`, progress: pct, app: 'forge' });
        } else if (tracked.get(j.id) !== pct) {
          tracked.set(j.id, pct);
          updateActivity(actId, pct);
        }
      } else if (tracked.has(j.id)) {
        // Reached a terminal state (completed / failed / removed) — close the card.
        tracked.delete(j.id);
        completeActivity(actId);
      }
    });
  }, [jobs]);

  // Queue manager: fill available encoding slots when queue changes
  useEffect(() => {
    if (!isEncoding) return;

    const activeCount = activeEncodings.current.size;
    if (activeCount >= parallelJobs) return;

    const queued = jobs.filter(j => j.status === 'queued' && !activeEncodings.current.has(j.id));
    const slotsAvailable = parallelJobs - activeCount;
    const toStart = queued.slice(0, slotsAvailable);

    // Mark as active synchronously to prevent duplicate launches on re-render
    toStart.forEach(job => activeEncodings.current.add(job.id));
    toStart.forEach(job => processJob(job.id));

    // Auto-stop when all jobs finished
    const allDone = jobs.length > 0
      && jobs.every(j => j.status === 'completed' || j.status === 'failed' || j.status === 'unsupported')
      && activeEncodings.current.size === 0;
    if (allDone) {
      setIsEncoding(false);
      if (shutdownAfter) {
        toast.info('Queue complete — shutdown requested');
        try { window.dex?.invoke?.('app:shutdown'); } catch { /* not in Electron */ }
      }
      // Request notification permission for future encodes if not yet granted
      if (notifyOnComplete && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [isEncoding, jobs, parallelJobs, processJob]);

  // ===== FUNCTIONS =====
  const addFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*,.mov,.mp4,.avi,.mkv,.webm,.m4v,.flv,.wmv,.mpg,.mpeg,.m2ts,.mts,.mxf,.r3d,.braw,.ari,.wav,.mp3,.aac,.flac,.ogg,.m4a,.aiff,.aif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif,.avif';
    input.multiple = true;
    
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      
      const newJobs: Job[] = [];
      
      for (const file of Array.from(files)) {
        // Estimate duration based on file size (rough approximation)
        const kind = detectSourceKind(file);
        const isAudio = kind === 'audio';
        const estimatedDuration = Math.ceil(file.size / (isAudio ? 128000 : 2000000)); // Rough bytes per second
        const estimatedEncodeTime = Math.ceil(estimatedDuration * 0.3); // 30% of realtime for encoding estimate

        const preset = presets.find(p => p.id === selectedPreset);
        // Default the target to one the browser can REALLY produce for this
        // source kind: images -> PNG, audio -> WAV; video keeps the preset format
        // (which will be honestly flagged as native-only at encode time).
        const defaultFormat = kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : (preset?.format || 'H.264');

        const newJob: Job = {
          id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          source: file.name, // In Electron, would be full path
          destination: customOutputDir,
          preset: selectedPreset,
          format: defaultFormat,
          status: 'queued',
          progress: 0,
          duration: estimatedDuration,
          estimatedTime: estimatedEncodeTime,
          inputSize: file.size,
          isAudio,
        };
        
        fileMapRef.current.set(newJob.id, file);
        newJobs.push(newJob);
      }
      
      setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
      if (newJobs.length > 0) {
        setSelectedJobId(newJobs[0].id);
      }
    };
    
    input.click();
  }, [selectedPreset, presets, customOutputDir]);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === id);
      if (job?.outputBlobUrl) URL.revokeObjectURL(job.outputBlobUrl);
      return prev.filter(j => j.id !== id);
    });
    if (selectedJobId === id) setSelectedJobId(null);
  }, [selectedJobId]);

  const duplicateJob = useCallback((id: string) => {
    setJobs(prev => {
      const src = prev.find(j => j.id === id);
      if (!src) return prev;
      const dup = { ...src, id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${src.name} (copy)`, status: 'queued' as const, progress: 0, startTime: undefined, endTime: undefined };
      const idx = prev.findIndex(j => j.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  }, []);

  const moveJob = useCallback((id: string, dir: -1 | 1) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const startQueue = useCallback(() => {
    // Validate queue before starting — prevent failures after hours of encoding
    const queuedJobs = jobs.filter(j => j.status === 'queued');
    
    if (queuedJobs.length === 0) {
      // No jobs to process
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'warning', message: 'No jobs in queue. Add files to start encoding.' }
      }));
      return;
    }
    
    // Validate all queued jobs have source files
    const missingFiles: string[] = [];
    for (const job of queuedJobs) {
      if (!fileMapRef.current.has(job.id)) {
        missingFiles.push(job.name);
      }
    }
    
    if (missingFiles.length > 0) {
      const count = missingFiles.length;
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: {
          type: 'error',
          message: count === 1
            ? `Missing source file: ${missingFiles[0]}`
            : `${count} jobs missing source files. Re-add the files to continue.`
        }
      }));
      // Mark missing jobs as failed
      setJobs(prev => prev.map(j =>
        missingFiles.includes(j.name) && j.status === 'queued'
          ? { ...j, status: 'failed' as const, error: 'Source file missing — re-add to queue' }
          : j
      ));
      return;
    }
    
    // All validations passed — start encoding
    setIsEncoding(true);
  }, [jobs]);

  const pauseQueue = useCallback(() => {
    setIsEncoding(false);
  }, []);

  const addWatchFolder = useCallback(async () => {
    try {
      // Try Electron dialog first (works in Electron)
      const dex = window.dex;
      if (dex?.invoke) {
        const result = await dex.invoke('dialog:showOpenDialog', {
          properties: ['openDirectory'],
          title: 'Select Watch Folder',
        });
        if (!result.canceled && result.filePaths?.length > 0) {
          const folderPath = result.filePaths[0];
          const folderId = `watch-${Date.now()}`;
          const newFolder: WatchFolder = {
            id: folderId,
            path: folderPath,
            preset: selectedPreset,
            destination: customOutputDir,
            active: true,
          };
          setWatchFolders(prev => [...prev, newFolder]);

          // Start file system monitoring via IPC
          try {
            await dex.invoke('watch:start', { id: folderId, path: folderPath });
            // Listen for new files detected by the watcher
            const handler = (_event: any, data: { id: string; files: string[] }) => {
              if (data.id === folderId) {
                // Auto-queue detected files for encoding
                const newJobs = data.files
                  .filter((f: string) => /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|ts|mxf|prores)$/i.test(f))
                  .map((filePath: string) => ({
                    id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: filePath.split(/[\\/]/).pop() || filePath,
                    source: filePath,
                    destination: '',
                    preset: selectedPreset,
                    format: 'mp4',
                    status: 'queued' as const,
                    progress: 0,
                    duration: 0,
                    estimatedTime: 0,
                  }));
                if (newJobs.length > 0) {
                  setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
                }
              }
            };
            window.electron?.ipcRenderer?.on?.('watch:fileAdded', handler);
            // Remember the handler so the unmount effect can detach it
            watchHandlersRef.current.push(handler);
          } catch {
            // Watch IPC not available - folder saved but monitoring won't auto-detect
            console.warn('[Forge] File watching IPC not available');
          }
          return;
        }
        return; // user cancelled
      }
      // Fallback: File System Access API (for web)
      if ('showDirectoryPicker' in window && window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        const newFolder: WatchFolder = {
          id: `watch-${Date.now()}`,
          path: dirHandle.name,
          preset: selectedPreset,
          destination: customOutputDir,
          active: true,
        };
        setWatchFolders(prev => [...prev, newFolder]);
        return;
      }
      toast.info('Watch folders require DEX desktop or a browser with File System Access API support.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Could not access folder:', err);
      }
    }
  }, [selectedPreset, customOutputDir]);

  const addFolder = useCallback(async () => {
    try {
      // Try Electron dialog first
      const dex = window.dex;
      if (dex?.invoke) {
        const result = await dex.invoke('dialog:showOpenDialog', {
          properties: ['openDirectory'],
          title: 'Select Folder to Import',
        });
        if (!result.canceled && result.filePaths?.length > 0) {
          const folderPath = result.filePaths[0];
          const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
          // Read directory contents via IPC
          let files: string[] = [];
          try {
            files = await dex.invoke('fs:readdir', folderPath);
          } catch (e) {
            window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Failed to read folder: ${folderPath}` } }));
            console.warn('[Forge] readdir failed:', e);
          }
          const mediaExts = /\.(mov|mp4|avi|mkv|webm|m4v|flv|wmv|mpg|mpeg|wav|mp3|aac|flac|ogg|m4a|aiff?)$/i;
          const newJobs: Job[] = files.filter(f => mediaExts.test(f)).map(fileName => {
            const isAudioFile = /\.(wav|mp3|aac|flac|ogg|m4a|aiff?)$/i.test(fileName);
            const estimatedDuration = isAudioFile ? 180 : 300;
            const preset = presets.find(p => p.id === selectedPreset);
            return {
              id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: fileName,
              source: `${folderName}/${fileName}`,
              destination: customOutputDir,
              preset: selectedPreset,
              format: preset?.format || 'H.264',
              status: 'queued' as const,
              progress: 0,
              duration: estimatedDuration,
              estimatedTime: Math.ceil(estimatedDuration * 0.3),
              inputSize: 0,
              isAudio: isAudioFile,
            };
          });
          if (newJobs.length > 0) {
            setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
          }
          return;
        }
        return; // user cancelled
      }
      // Fallback: File System Access API (for web)
      if (!('showDirectoryPicker' in window)) {
        toast.info('Folder import requires DEX desktop or a browser with File System Access API support.');
        return;
      }
      const dirHandle = await window.showDirectoryPicker!();
      const newJobs: Job[] = [];
      const mediaExts = /\.(mov|mp4|avi|mkv|webm|m4v|flv|wmv|mpg|mpeg|wav|mp3|aac|flac|ogg|m4a|aiff?)$/i;
      const iter = (dirHandle as any).values();
      let result = await iter.next();
      while (!result.done) {
        const entry = result.value;
        if (entry.kind === 'file' && mediaExts.test(entry.name)) {
          const file: File = await entry.getFile();
          const isAudioFile = file.type.startsWith('audio/') || /\.(wav|mp3|aac|flac|ogg|m4a|aiff?)$/i.test(file.name);
          const estimatedDuration = Math.ceil(file.size / (isAudioFile ? 128000 : 2000000));
          const preset = presets.find(p => p.id === selectedPreset);
          const newJob: Job = {
            id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            source: `${dirHandle.name}/${file.name}`,
            destination: customOutputDir,
            preset: selectedPreset,
            format: preset?.format || 'H.264',
            status: 'queued',
            progress: 0,
            duration: estimatedDuration,
            estimatedTime: Math.ceil(estimatedDuration * 0.3),
            inputSize: file.size,
            isAudio: isAudioFile,
          };
          fileMapRef.current.set(newJob.id, file);
          newJobs.push(newJob);
        }
        result = await iter.next();
      }
      setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
      if (newJobs.length > 0) setSelectedJobId(newJobs[0].id);
      else toast.warning('No supported media files found in the selected folder.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Could not access folder:', err);
      }
    }
  }, [selectedPreset, presets, customOutputDir]);

  // Use formatting utilities from ForgeFeatures (single source of truth)
  const formatBytes = useCallback((bytes: number) => formatFileSize(bytes), []);
  const formatDuration = useCallback((seconds: number) => forgeFormatDuration(seconds), []);

  const getStatusColor = useCallback((status: Job['status']) => {
    switch (status) {
      case 'completed': return 'var(--color-success)';
      case 'processing': return 'var(--color-accent)';
      case 'failed': return 'var(--color-error)';
      case 'unsupported': return 'var(--color-warning)';
      case 'paused': return '#6b7280';
      default: return '#6b7280';
    }
  }, []);

  const getStatusIcon = useCallback((status: Job['status']) => {
    switch (status) {
      case 'completed': return Icons.check;
      case 'processing': return Icons.refresh;
      case 'failed': return Icons.alert;
      case 'unsupported': return Icons.alertCircle;
      case 'paused': return Icons.pause;
      default: return Icons.clock;
    }
  }, []);

  const getStatusLabel = useCallback((status: Job['status']) =>
    status === 'unsupported' ? 'Needs Native' : status.charAt(0).toUpperCase() + status.slice(1),
  []);

  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId), [jobs, selectedJobId]);

  // When the Trim panel opens for an audio job, decode a real waveform and seed
  // the in/out sliders from any trim already stored on the job. Video can't be
  // decoded in the renderer, so we flag those as unsupported (sliders still work).
  useEffect(() => {
    if (!showTrimSplit || !selectedJob) return;
    const jobAny = selectedJob as any;
    setTrimIn(Math.round((jobAny.trimIn ?? 0) * 100));
    setTrimOut(Math.round((jobAny.trimOut ?? 1) * 100));
    const file = fileMapRef.current.get(selectedJob.id);
    if (!file || !selectedJob.isAudio) { setTrimWave(null); setTrimWaveState(selectedJob.isAudio ? 'error' : 'unsupported'); return; }
    let cancelled = false;
    setTrimWaveState('loading');
    setTrimWave(null);
    decodeAudioPeaks(file, 480)
      .then(w => { if (!cancelled) { setTrimWave(w); setTrimWaveState('ready'); } })
      .catch(() => { if (!cancelled) { setTrimWave(null); setTrimWaveState('error'); } });
    return () => { cancelled = true; };
  }, [showTrimSplit, selectedJob]);

  // Drag an in/out handle on the waveform. Converts pointer X to a 0..100 percent
  // against the track width and keeps the handles from crossing.
  const onTrimHandleMove = useCallback((e: React.PointerEvent) => {
    const which = trimDragRef.current;
    if (!which || !trimTrackRef.current) return;
    const rect = trimTrackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / (rect.width || 1)) * 100));
    if (which === 'in') setTrimIn(Math.min(Math.round(pct), trimOut - 1));
    else setTrimOut(Math.max(Math.round(pct), trimIn + 1));
  }, [trimIn, trimOut]);

  const startTrimHandleDrag = useCallback((which: 'in' | 'out', e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    trimDragRef.current = which;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const endTrimHandleDrag = useCallback((e: React.PointerEvent) => {
    trimDragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  // Seconds = trim percent * decoded duration, for the readout under the waveform.
  const fmtTrimTime = useCallback((pct: number) => {
    if (!trimWave) return `${pct}%`;
    const s = (pct / 100) * trimWave.duration;
    const m = Math.floor(s / 60);
    const sec = (s - m * 60);
    return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
  }, [trimWave]);
  // Single pass for the header counts instead of three separate filters per render
  const { queuedJobs, processingJobs, completedJobs } = useMemo(() => {
    let queued = 0, processing = 0, completed = 0;
    for (const j of jobs) {
      if (j.status === 'queued') queued++;
      else if (j.status === 'processing') processing++;
      else if (j.status === 'completed') completed++;
    }
    return { queuedJobs: queued, processingJobs: processing, completedJobs: completed };
  }, [jobs]);

  // ===== STYLES - MINIMAL =====
  const styles: Record<string, React.CSSProperties> = useMemo(() => ({
    container: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', position: 'relative' as const, contain: 'layout style' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-2)', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', height: '32px', minHeight: '32px', flexShrink: 0, position: 'relative' as const, zIndex: 100, overflow: 'visible' },
    logo: { fontSize: '12px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '-0.2px' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'visible', flexWrap: 'nowrap', maxHeight: 38, justifyContent: 'flex-start', scrollbarWidth: 'thin' },
    btn: { padding: '4px var(--space-2)', background: 'none', border: 'none', borderRadius: '9999px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
    btnPrimary: { background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)', borderRadius: '9999px' },
    btnDanger: { background: '#3a1818', color: '#ff6961', border: '1px solid #4a2020', borderRadius: '9999px' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    sidebar: { width: '220px', flexShrink: 0, borderRadius: 0, borderRight: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
    tab: { flex: 1, padding: 'var(--space-2)', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' },
    tabActive: { color: 'var(--color-text-primary)', borderBottom: '2px solid var(--dex-focus-color, #fff)' },
    sidebarContent: { flex: 1, overflow: 'auto', padding: '10px' },
    mainArea: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-inset)' },
    queueHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px var(--space-3)', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' },
    queueStats: { display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto' },
    stat: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)' },
    queueList: { flex: 1, overflow: 'auto', padding: '10px' },
    jobItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: 'var(--space-2) 10px', background: 'var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '4px', cursor: 'pointer', border: '1px solid transparent' },
    jobItemSelected: { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' },
    jobIcon: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', borderRadius: '6px', color: 'var(--color-accent)' },
    jobInfo: { flex: 1, minWidth: 0 },
    jobName: { fontWeight: 600, marginBottom: '2px', fontSize: '11px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    jobMeta: { display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-muted)' },
    jobProgress: { width: '100px' },
    progressBar: { height: '3px', background: 'var(--color-border-subtle)', borderRadius: '2px', overflow: 'hidden' },
    progressFill: { height: '100%', background: 'var(--color-accent)', borderRadius: '2px' },
    jobStatus: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 },
    jobActions: { display: 'flex', gap: '2px' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '9999px' },
    inspectorPanel: { width: '240px', minWidth: '180px', maxWidth: '280px', flexShrink: 0, borderRadius: 0, borderLeft: '1px solid var(--color-border-subtle)', padding: 'var(--space-3)', overflow: 'auto' },
    inspectorTitle: { fontSize: '12px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    inspectorSection: { marginBottom: 'var(--space-3)' },
    sectionTitle: { fontSize: '11px', color: 'var(--color-accent)', textTransform: 'uppercase', marginBottom: 'var(--space-2)', letterSpacing: '0.5px', fontWeight: 600 },
    infoRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '11px' },
    infoLabel: { color: 'var(--color-text-muted)' },
    infoValue: { color: 'var(--color-text-primary)', fontWeight: 600 },
    presetItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-lg)', marginBottom: '4px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    presetItemSelected: { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' },
    presetInfo: { flex: 1 },
    presetName: { fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.2px' },
    presetDesc: { fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px' },
    categoryHeader: { fontSize: '11px', color: 'var(--color-accent)', textTransform: 'uppercase', padding: 'var(--space-3) 0 var(--space-2)', marginTop: 'var(--space-2)', letterSpacing: '0.8px', fontWeight: 700, borderTop: '1px solid var(--color-border-subtle)' },
    statusBar: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-3)', height: 24, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1c 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '11px', color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: '9999px', cursor: 'pointer', fontSize: '11px', border: '1px solid var(--color-bg-hover)', transition: 'all 0.12s ease', fontWeight: 600 },
    checkbox: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 0', cursor: 'pointer', fontSize: '11px', fontWeight: 600 },
    select: { background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '6px var(--space-2)', fontSize: '11px', cursor: 'pointer', width: '100%', fontWeight: 600, transition: 'all 0.12s ease' },
  }), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      switch (e.code) {
        case 'Enter':
          if (!mod) { e.preventDefault(); addFiles(); }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedJobId) { e.preventDefault(); pushUndo(); removeJob(selectedJobId); }
          break;
        case 'KeyA':
          if (mod) { e.preventDefault(); if (jobs.length > 0) setSelectedJobId(jobs[0].id); }
          break;
        case 'KeyS':
          if (mod) { e.preventDefault(); if (!isEncoding) startQueue(); }
          break;
        case 'KeyZ':
          if (mod && e.shiftKey) { e.preventDefault(); redo(); }
          else if (mod) { e.preventDefault(); undo(); }
          break;
        case 'KeyY':
          if (mod) { e.preventDefault(); redo(); }
          break;
        case 'Space':
          e.preventDefault();
          if (isEncoding) pauseQueue(); else startQueue();
          break;
        case 'Escape':
          setSelectedJobId(null);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedJobId, jobs, isEncoding, addFiles, removeJob, startQueue, pauseQueue, undo, redo, pushUndo]);

  // Standardized menu bar: consolidates Forge's long span of tools into File /
  // Edit / Queue / Tools menus with grouped submenus, all wired to real handlers.
  const forgeMenus: CreativeMenu[] = [
    {
      id: 'file', label: 'File', items: [
        { label: 'Add Files…', shortcut: 'Ctrl+O', onSelect: () => addFiles() },
        { label: 'Add Folder…', onSelect: () => { void addFolder(); } },
        { separator: true },
        { label: 'Clear Completed', disabled: !jobs.some(j => j.status === 'completed'), onSelect: () => setJobs(prev => prev.filter(j => j.status !== 'completed')) },
        { label: 'Clear Queue', danger: true, disabled: jobs.length === 0, onSelect: () => { setJobs([]); setSelectedJobId(null); } },
      ],
    },
    {
      id: 'edit', label: 'Edit', items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => undo() },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', onSelect: () => redo() },
        { separator: true },
        { label: 'Remove Selected', shortcut: 'Del', danger: true, disabled: !selectedJobId, onSelect: () => { if (selectedJobId) { pushUndo(); removeJob(selectedJobId); } } },
      ],
    },
    {
      id: 'queue', label: 'Queue', items: [
        { label: isEncoding ? 'Pause Encoding' : 'Start Encoding', shortcut: 'Space', disabled: jobs.length === 0, onSelect: () => (isEncoding ? pauseQueue() : startQueue()) },
        { separator: true },
        { label: 'Notify When Done', checked: notifyOnComplete, onSelect: () => setNotifyOnComplete(v => !v) },
      ],
    },
    {
      id: 'tools', label: 'Tools', items: [
        {
          label: 'Media', submenu: [
            { label: 'Trim & Split', checked: showTrimSplit, onSelect: () => setShowTrimSplit(v => !v) },
            { label: 'Crop & Pad', checked: showCropPad, onSelect: () => setShowCropPad(v => !v) },
            { label: 'Watermark', checked: showWatermark, onSelect: () => setShowWatermark(v => !v) },
            { label: 'Audio Extract', checked: showAudioExtract, onSelect: () => setShowAudioExtract(v => !v) },
            { label: 'Image Sequence', checked: showImageSequence, onSelect: () => setShowImageSequence(v => !v) },
            { label: 'Subtitle Burn-in', checked: showSubBurnIn, onSelect: () => setShowSubBurnIn(v => !v) },
          ],
        },
        {
          label: 'Batch', submenu: [
            { label: 'Batch Rename', checked: showBatchRename, onSelect: () => setShowBatchRename(v => !v) },
            { label: 'Concatenate', checked: showConcat, onSelect: () => { setShowConcat(v => !v); setConcatOrder(jobs.map(j => j.id)); } },
            { label: 'Auto Rules', checked: showConditionalRules, onSelect: () => setShowConditionalRules(v => !v) },
          ],
        },
        {
          label: 'Inspect', submenu: [
            { label: 'Preview', checked: showPreview, disabled: !selectedJob, onSelect: () => { if (selectedJob) setShowPreview(v => !v); } },
            { label: 'A/B Compare', checked: showABCompare, disabled: !selectedJob?.outputBlobUrl, onSelect: () => { if (selectedJob?.outputBlobUrl) setShowABCompare(v => !v); } },
          ],
        },
      ],
    },
  ];

  return (
    <div style={styles.container}
      onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation();
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        const newJobs: any[] = [];
        for (const file of files) {
          const kind = detectSourceKind(file);
          if (kind === 'unknown') continue;
          const isAudio = kind === 'audio';
          const resolvedPreset = presets.find(p => p.id === selectedPreset);
          const defaultFormat = kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : (resolvedPreset?.format || 'H.264');
          const newJob = {
            id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            source: file.name,
            destination: '',
            format: defaultFormat,
            preset: selectedPreset,
            status: 'queued' as const,
            progress: 0,
            duration: 0,
            estimatedTime: 0,
            inputSize: file.size,
            isAudio,
          };
          fileMapRef.current.set(newJob.id, file);
          newJobs.push(newJob);
        }
        if (newJobs.length > 0) {
          setJobs(prev => { const fit = MAX_QUEUE_JOBS - prev.length; return fit > 0 ? [...prev, ...newJobs.slice(0, fit)] : prev; });
          setSelectedJobId(newJobs[0].id);
        }
      }}
    >
      <style>{`
        /* === FORGE - PROFESSIONAL UI === */
        button { font-family: inherit; }
        button:active { transform: scale(0.97); }
        .forge-btn-primary:hover { background: #3aa2ff !important; }
        .forge-job-item:hover { border-color: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; background: #0d1a2e !important; }
        .forge-preset-item:hover { border-color: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; background: #0d1a2e !important; }
        .forge-icon-btn:hover { color: var(--color-accent) !important; background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; }
        .forge-ctx-item:hover { background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; }
        .forge-ctx-item:active { background: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; 
          background: var(--color-accent); cursor: pointer; margin-top: -4px; border: none;
        }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: var(--color-border); border-radius: 2px; }
        select { outline: none; cursor: pointer; transition: border-color 0.12s ease; }
        select:focus { border-color: color-mix(in srgb, var(--color-accent) 30%, transparent); }
        select:hover { border-color: color-mix(in srgb, var(--color-accent) 15%, transparent); }
        .forge-tab:hover { color: var(--color-accent) !important; background: #0d1a2e !important; }
        .forge-dropdown-item { transition: background 0.12s ease; }
        .forge-dropdown-item:hover { background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; }
        .forge-dropdown-item:active { background: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; }
        .forge-tools-btn { transition: background 0.12s ease, color 0.12s ease; }
        .forge-tools-btn:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent) !important; color: var(--color-text-primary) !important; }
      `}</style>
      {/* Standardized menu bar (File / Edit / Queue / Tools with submenus) */}
      <CreativeMenuBar menus={forgeMenus} accent="var(--color-accent)" />
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          <img src={new URL('../../../../appicons/forge.png', import.meta.url).href} alt="Forge" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
          <div style={styles.logo}>FORGE</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={styles.headerCenter}>
          <button style={styles.btn} onClick={addFiles} aria-label="Add files to encode">{Icons.plus} Add Files</button>
          <button style={styles.btn} onClick={addFolder} aria-label="Add folder to encode">{Icons.folderPlus} Add Folder</button>
          <AutosaveIndicator state={autosaveState} lastSavedAt={lastSavedAt} />
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          {isEncoding ? (
            <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={pauseQueue} aria-label="Pause encoding queue">{Icons.pause} Pause</button>
          ) : (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startQueue} aria-label="Start encoding queue">{Icons.play} Start Queue</button>
          )}
          <SendToMenu sourceApp="forge" assetKind="video" getAsset={() => {
            const job = jobs.find(j => j.id === selectedJobId) || jobs[0];
            const src = job?.destination || job?.source || '';
            return { name: job?.name || 'Forge Output.mp4', data: src, mimeType: 'video/mp4', metadata: { format: job?.format, preset: job?.preset } };
          }} />
          {collab.canShare && (
            <button onClick={collab.openShareDialog} style={collabButtonStyles}>
              <DexIcon name="user-plus" size={14} /> Share
            </button>
          )}
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button aria-label="Tools menu" className="forge-tools-btn" onClick={(e) => { e.stopPropagation(); setShowToolsMenu(v => !v); }} style={{ background: showToolsMenu ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent', border: 'none', fontSize: '11px', color: showToolsMenu ? 'var(--color-accent)' : '#86868b', cursor: 'pointer', padding: '4px var(--space-2)', borderRadius: '9999px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>Tools <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4"/></svg></button>
            {showToolsMenu && (
              <div className="dex-creative-panel-strong" style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', minWidth: '220px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(420px, calc(100vh - 72px))', overflow: 'auto', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.55)', zIndex: 'var(--z-modal)', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
                <div className="dex-label-caps" style={{ padding: '4px var(--space-3) 2px' }}>PROCESSING</div>
                {[
                  { label: 'Trim / Split', active: showTrimSplit, fn: () => setShowTrimSplit(v => !v) },
                  { label: 'Crop & Pad', active: showCropPad, fn: () => setShowCropPad(v => !v) },
                  { label: 'Watermark', active: showWatermark, fn: () => setShowWatermark(v => !v) },
                  { label: 'Subtitle Burn-in', active: showSubBurnIn, fn: () => setShowSubBurnIn(v => !v) },
                  { label: 'Normalize Audio', active: audioNormalize, fn: () => setAudioNormalize(v => !v) },
                  { label: 'Concatenate', active: showConcat, fn: () => { setShowConcat(v => !v); setConcatOrder(jobs.map(j => j.id)); } },
                ].map(item => (
                  <div key={item.label} className="forge-dropdown-item" style={{ padding: '6px var(--space-3)', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowToolsMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px var(--space-2)' }} />
                <div className="dex-label-caps" style={{ padding: '4px var(--space-3) 2px' }}>PREVIEW</div>
                {[
                  { label: 'Preview', active: showPreview, fn: () => { if (selectedJob) setShowPreview(v => !v); } },
                  { label: 'A/B Compare', active: showABCompare, fn: () => { if (selectedJob?.outputBlobUrl) setShowABCompare(v => !v); } },
                ].map(item => (
                  <div key={item.label} className="forge-dropdown-item" style={{ padding: '6px var(--space-3)', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowToolsMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px var(--space-2)' }} />
                <div className="dex-label-caps" style={{ padding: '4px var(--space-3) 2px' }}>EXPORT</div>
                {[
                  { label: 'Image Sequence', active: showImageSequence, fn: () => setShowImageSequence(v => !v) },
                  { label: 'Audio Extract', active: showAudioExtract, fn: () => setShowAudioExtract(v => !v) },
                  { label: 'Batch Rename', active: showBatchRename, fn: () => setShowBatchRename(v => !v) },
                ].map(item => (
                  <div key={item.label} className="forge-dropdown-item" style={{ padding: '6px var(--space-3)', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowToolsMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px var(--space-2)' }} />
                <div className="dex-label-caps" style={{ padding: '4px var(--space-3) 2px' }}>AUTOMATION</div>
                {[
                  { label: 'Auto Rules', active: showConditionalRules, fn: () => setShowConditionalRules(v => !v) },
                ].map(item => (
                  <div key={item.label} className="forge-dropdown-item" style={{ padding: '6px var(--space-3)', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowToolsMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Sidebar */}
        <div className="dex-creative-panel-strong" style={styles.sidebar}>
          <div style={styles.tabs}>
            <button style={{ ...styles.tab, ...(activeTab === 'presets' ? styles.tabActive : {}) }} onClick={() => setActiveTab('presets')} aria-label="Presets tab">
              Presets
            </button>
            <button style={{ ...styles.tab, ...(activeTab === 'watch' ? styles.tabActive : {}) }} onClick={() => setActiveTab('watch')} aria-label="Watch folders tab">
              Watch
            </button>
            <button style={{ ...styles.tab, ...(activeTab === 'settings' ? styles.tabActive : {}) }} onClick={() => setActiveTab('settings')} aria-label="Settings tab">
              Settings
            </button>
          </div>

          <div data-testid="forge-presets" style={styles.sidebarContent}>
            {activeTab === 'presets' && (
              <div>
                <select style={{ ...styles.select, marginBottom: 'var(--space-3)' }} value={presetCategory} onChange={(e) => setPresetCategory(e.target.value)}>
                  <option value="all">All Presets</option>
                  <option value="Professional">Professional</option>
                  <option value="Modern Codecs">Modern Codecs</option>
                  <option value="Standard">Standard</option>
                  <option value="Web">Web</option>
                  <option value="Social Media">Social Media</option>
                  <option value="Broadcast">Broadcast</option>
                  <option value="Audio">Audio</option>
                  <option value="Other">Other</option>
                  <option value="Custom">Custom</option>
                </select>
                {showPresetInput ? (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-3)', width: '100%' }}>
                    <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newPresetName.trim()) { const base = presets.find(p => p.id === selectedPreset) || presets[0]; const custom: Preset = { ...base, id: `custom-${Date.now()}`, name: newPresetName.trim(), category: 'Custom', description: `Based on ${base.name}` }; setPresets(prev => [...prev, custom]); const customOnly = [...presets.filter(p => p.category === 'Custom'), custom]; localStorage.setItem('forge-custom-presets', JSON.stringify(customOnly)); setSelectedPreset(custom.id); setShowPresetInput(false); setNewPresetName(''); } else if (e.key === 'Escape') { setShowPresetInput(false); setNewPresetName(''); } }} autoFocus placeholder="Preset name..." style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid #2a5e3a', borderRadius: 3, padding: '4px var(--space-2)', color: '#fff', fontSize: 11, outline: 'none' }} />
                    <button onClick={() => { if (!newPresetName.trim()) return; const base = presets.find(p => p.id === selectedPreset) || presets[0]; const custom: Preset = { ...base, id: `custom-${Date.now()}`, name: newPresetName.trim(), category: 'Custom', description: `Based on ${base.name}` }; setPresets(prev => [...prev, custom]); const customOnly = [...presets.filter(p => p.category === 'Custom'), custom]; localStorage.setItem('forge-custom-presets', JSON.stringify(customOnly)); setSelectedPreset(custom.id); setShowPresetInput(false); setNewPresetName(''); }} style={{ ...styles.btn, padding: '4px var(--space-2)', background: '#1e3a28', color: 'var(--color-success)', border: '1px solid #2a5e3a' }}>Save</button>
                    <button onClick={() => { setShowPresetInput(false); setNewPresetName(''); }} style={{ ...styles.btn, padding: '4px var(--space-2)' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowPresetInput(true)} style={{ ...styles.btn, width: '100%', justifyContent: 'center', marginBottom: 'var(--space-3)', background: 'var(--color-success-muted, rgba(48,209,88,0.1))', border: '1px solid var(--color-success-muted, rgba(48,209,88,0.3))', color: 'var(--color-success)' }} aria-label="Save as Preset">{Icons.check} Save as Preset</button>
                )}
                
                {['Professional', 'Modern Codecs', 'Standard', 'Web', 'Social Media', 'Broadcast', 'Audio', 'Other']
                  .filter(cat => presetCategory === 'all' || presetCategory === cat)
                  .map(category => {
                    const categoryPresets = presets.filter(p => p.category === category);
                    if (categoryPresets.length === 0) return null;
                    
                    return (
                      <div key={category}>
                        <div style={styles.categoryHeader}>{category}</div>
                        {categoryPresets.map(preset => (
                          <div
                            key={preset.id}
                            style={{ ...styles.presetItem, ...(selectedPreset === preset.id ? styles.presetItemSelected : {}) }}
                            onClick={() => setSelectedPreset(preset.id)}
                          >
                            {getFormatIcon(preset.format)}
                            <div style={styles.presetInfo}>
                              <div style={styles.presetName}>{preset.name}</div>
                              <div style={styles.presetDesc}>{preset.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </div>
            )}

            {activeTab === 'watch' && (
              <div>
                <button style={{ ...styles.btn, width: '100%', justifyContent: 'center', marginBottom: 'var(--space-3)' }} onClick={addWatchFolder} aria-label="Add watch folder">{Icons.folderPlus} Add Watch Folder</button>
                {watchFolders.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-10) 0' }}>
                    <div style={{ marginBottom: 'var(--space-2)' }}>{Icons.folder}</div>
                    <div>No watch folders configured</div>
                  </div>
                ) : (
                  watchFolders.map(wf => (
                    <div key={wf.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-lg)', marginBottom: '4px', border: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ color: wf.active ? 'var(--color-success)' : '#6b7280' }}>{Icons.folderWatch}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600 }}>{wf.path}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{wf.preset} → {wf.destination}</div>
                      </div>
                      <button className="forge-icon-btn" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '9999px' }}
                        onClick={() => setWatchFolders(prev => prev.filter(f => f.id !== wf.id))} aria-label={`Remove watch folder ${wf.path}`}>{Icons.trash}</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <div style={styles.sectionTitle}>Encoding</div>
                <CreativeSlider label="Parallel Jobs" min={1} max={8} step={1} value={parallelJobs} onChange={setParallelJobs} displayValue={parallelJobs} accentColor="var(--color-accent)" />
                
                <div style={styles.checkbox} onClick={() => setUseHardwareAccel(!useHardwareAccel)}>
                  <div style={{ width: '14px', height: '14px', background: useHardwareAccel ? 'var(--color-accent)' : 'var(--color-border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {useHardwareAccel && Icons.check}
                  </div>
                  <span>Use Hardware Acceleration</span>
                </div>
                
                <div style={{ ...styles.sectionTitle, marginTop: 'var(--space-4)' }}>Completion</div>
                <div style={styles.checkbox} onClick={() => setNotifyOnComplete(!notifyOnComplete)}>
                  <div style={{ width: '14px', height: '14px', background: notifyOnComplete ? 'var(--color-accent)' : 'var(--color-border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {notifyOnComplete && Icons.check}
                  </div>
                  <span>Notify on Completion</span>
                </div>
                <div style={styles.checkbox} onClick={() => setShutdownAfter(!shutdownAfter)}>
                  <div style={{ width: '14px', height: '14px', background: shutdownAfter ? 'var(--color-accent)' : 'var(--color-border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {shutdownAfter && Icons.check}
                  </div>
                  <span>Shutdown After Queue Complete</span>
                </div>

                <div style={{ ...styles.sectionTitle, marginTop: 'var(--space-4)' }}>Audio</div>
                <div style={styles.checkbox} onClick={() => setAudioNormalize(!audioNormalize)}>
                  <div style={{ width: '14px', height: '14px', background: audioNormalize ? '#bf5af2' : 'var(--color-border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {audioNormalize && Icons.check}
                  </div>
                  <span>Audio Normalization</span>
                </div>
                {audioNormalize && (
                  <CreativeSlider label="Target LUFS" min={-24} max={-6} step={1} value={audioNormTarget} onChange={setAudioNormTarget} displayValue={audioNormTarget} accentColor="var(--color-accent)" />
                )}

                <div style={{ ...styles.sectionTitle, marginTop: 'var(--space-4)' }}>Output</div>
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Output Directory</span>
                  <input value={customOutputDir} onChange={e => setCustomOutputDir(e.target.value)}
                    style={{ width: '100%', padding: '6px var(--space-2)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: '11px' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Queue Area */}
        <div data-testid="forge-queue" style={styles.mainArea} onDragOver={handleMainDragOver} onDragLeave={handleMainDragLeave} onDrop={handleMainDrop}>
          {dragOverMain && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 'var(--z-modal)',
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', border: '1px dashed color-mix(in srgb, var(--color-accent) 50%, transparent)',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#5ac8fa' }}>Drop media files to add to queue</div>
            </div>
          )}
          {jobs.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: 'var(--color-border-subtle)', fontSize: 11 }}>Drop files to encode</div>
            </div>
          ) : (
          <>
          <div style={styles.queueHeader}>
            <span style={{ fontWeight: 600 }}>Encoding Queue</span>
            <div style={styles.queueStats}>
              <div style={styles.stat}>
                <span style={{ color: '#6b7280' }}>{Icons.clock}</span>
                <span>{queuedJobs} Queued</span>
              </div>
              <div style={styles.stat}>
                <span style={{ color: 'var(--color-accent)' }}>{Icons.refresh}</span>
                <span>{processingJobs} Processing</span>
              </div>
              <div style={styles.stat}>
                <span style={{ color: 'var(--color-success)' }}>{Icons.check}</span>
                <span>{completedJobs} Completed</span>
              </div>
            </div>
          </div>

          <div style={styles.queueList}>
            {jobs.map(job => (
              <div
                key={job.id}
                style={{ ...styles.jobItem, ...(selectedJobId === job.id ? styles.jobItemSelected : {}) }}
                onClick={() => setSelectedJobId(job.id)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedJobId(job.id); const p = clampEventToViewport(e); setCtxMenu({ visible: true, x: p.left, y: p.top, jobId: job.id }); }}
              >
                <div style={styles.jobIcon}>{Icons.video}</div>
                <div style={styles.jobInfo}>
                  <div style={styles.jobName}>{job.name}</div>
                  <div style={styles.jobMeta}>
                    <span>{job.format}</span>
                    <span>{job.preset}</span>
                    <span>{formatDuration(job.duration)}</span>
                    {job.status !== 'completed' && (
                      <span>~{formatBytes(estimateOutputFileSize(job.duration, (job as any).overrideBitrate || presets.find(p => p.id === job.preset)?.bitrate || 8000, 0))}</span>
                    )}
                  </div>
                </div>
                <div style={styles.jobProgress}>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${job.progress}%` }} />
                  </div>
                  <div style={{ fontSize: '11px', textAlign: 'center', marginTop: '4px', color: 'var(--color-text-muted)' }}>
                    {job.status === 'completed' && job.startTime && job.endTime
                      ? formatDuration((job.endTime - job.startTime) / 1000)
                      : `${job.progress}%`}
                  </div>
                </div>
                <div style={{ ...styles.jobStatus, color: getStatusColor(job.status) }}>
                  {getStatusIcon(job.status)}
                  <span>{getStatusLabel(job.status)}</span>
                </div>
                <div style={styles.jobActions}>
                  <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); removeJob(job.id); }} aria-label={`Remove job ${job.name}`}>{Icons.trash}</button>
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </div>

        {/* Inspector Panel */}
        {selectedJob && (
          <div className="dex-creative-panel-strong" style={styles.inspectorPanel}>
            <div style={styles.inspectorTitle}>{selectedJob.name}</div>
            
            <div style={styles.inspectorSection}>
              <div style={styles.sectionTitle}>Source</div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Path</span>
                <span style={styles.infoValue}>{selectedJob.source}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Size</span>
                <span style={styles.infoValue}>{selectedJob.inputSize ? formatBytes(selectedJob.inputSize) : '--'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Duration</span>
                <span style={styles.infoValue}>{formatDuration(selectedJob.duration)}</span>
              </div>
            </div>

            <div style={styles.inspectorSection}>
              <div style={styles.sectionTitle}>Output</div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Format</span>
                <span style={styles.infoValue}>{selectedJob.format}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Preset</span>
                <span style={styles.infoValue}>{selectedJob.preset}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Destination</span>
                <span style={styles.infoValue}>{selectedJob.destination}</span>
              </div>
              {selectedJob.outputSize && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Output Size</span>
                  <span style={styles.infoValue}>{formatBytes(selectedJob.outputSize)}</span>
                </div>
              )}
            </div>

            <div style={styles.inspectorSection}>
              <div style={styles.sectionTitle}>Status</div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Status</span>
                <span style={{ ...styles.infoValue, color: getStatusColor(selectedJob.status) }}>
                  {getStatusLabel(selectedJob.status)}
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Progress</span>
                <span style={styles.infoValue}>{selectedJob.progress}%</span>
              </div>
              {selectedJob.estimatedTime > 0 && selectedJob.status === 'processing' && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Time Remaining</span>
                  <span style={styles.infoValue}>{formatDuration(selectedJob.estimatedTime)}</span>
                </div>
              )}
              {selectedJob.startTime && (selectedJob.status === 'completed' || selectedJob.status === 'processing') && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Elapsed</span>
                  <span style={styles.infoValue}>{formatDuration(((selectedJob.endTime || Date.now()) - selectedJob.startTime) / 1000)}</span>
                </div>
              )}
              {selectedJob.status === 'completed' && selectedJob.outputSize && selectedJob.inputSize && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Compression</span>
                  <span style={{ ...styles.infoValue, color: selectedJob.outputSize < selectedJob.inputSize ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {((1 - selectedJob.outputSize / selectedJob.inputSize) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {selectedJob.status === 'queued' && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>Encoding Preset</div>
                <select value={selectedJob.preset} onChange={e => { const preset = e.target.value; setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, preset } : j)); }} style={{ width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer', marginBottom: 'var(--space-2)' }}>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>Output Format</div>
                <select value={selectedJob.format} onChange={e => { const format = e.target.value; setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, format } : j)); }} style={{ width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                  {(/\.(png|jpe?g|jfif|webp|gif|bmp|avif|tiff?)$/i.test(selectedJob.source) && !selectedJob.isAudio
                    ? ['png', 'jpg', 'webp', 'tiff', 'avif']
                    : ['mp4', 'webm', 'mkv', 'mov', 'avi', 'gif', 'mp3', 'wav', 'flac', 'aac']
                  ).map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select>

                {/* Per-Job Video Overrides */}
                <div style={{ marginTop: 10, padding: 'var(--space-2)', background: 'var(--color-bg-inset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)' }}>
                  <div className="dex-label-caps" style={{ marginBottom: 6 }}>VIDEO</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Resolution</div>
                      <select value={(selectedJob as any).overrideRes || ''} onChange={e => { const val = e.target.value; setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideRes: val } as any : j)); }} style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        <option value="">From Preset</option>
                        <option value="3840x2160">4K (3840x2160)</option>
                        <option value="2560x1440">QHD (2560x1440)</option>
                        <option value="1920x1080">1080p (1920x1080)</option>
                        <option value="1280x720">720p (1280x720)</option>
                        <option value="854x480">480p (854x480)</option>
                        <option value="1080x1920">Vertical 9:16</option>
                        <option value="1080x1080">Square 1:1</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Framerate</div>
                      <select value={(selectedJob as any).overrideFps || ''} onChange={e => { const val = e.target.value; setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideFps: val } as any : j)); }} style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        <option value="">From Preset</option>
                        <option value="23.976">23.976</option>
                        <option value="24">24</option>
                        <option value="25">25</option>
                        <option value="29.97">29.97</option>
                        <option value="30">30</option>
                        <option value="50">50</option>
                        <option value="59.94">59.94</option>
                        <option value="60">60</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2, marginTop: 4 }}>Bitrate (kbps)</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="range" min="500" max="100000" step="500" value={(selectedJob as any).overrideBitrate || (presets.find(p => p.id === selectedJob.preset)?.bitrate || 8000)} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideBitrate: Number(e.target.value) } as any : j))} style={{ flex: 1, accentColor: 'var(--color-success)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>{((selectedJob as any).overrideBitrate || (presets.find(p => p.id === selectedJob.preset)?.bitrate || 8000))} k</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={(selectedJob as any).overrideTwoPass || false} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideTwoPass: e.target.checked } as any : j))} style={{ accentColor: 'var(--color-success)' }} />Two-Pass
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={(selectedJob as any).overrideFastStart || false} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideFastStart: e.target.checked } as any : j))} style={{ accentColor: 'var(--color-success)' }} />Fast Start
                    </label>
                  </div>
                </div>

                {/* Per-Job Audio Overrides */}
                <div style={{ marginTop: 6, padding: 'var(--space-2)', background: 'var(--color-bg-inset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)' }}>
                  <div className="dex-label-caps" style={{ marginBottom: 6 }}>AUDIO</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Codec</div>
                      <select value={(selectedJob as any).overrideAudioCodec || ''} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideAudioCodec: e.target.value } as any : j))} style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        <option value="">From Preset</option>
                        <option value="aac">AAC</option>
                        <option value="mp3">MP3</option>
                        <option value="flac">FLAC</option>
                        <option value="opus">Opus</option>
                        <option value="pcm">PCM</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Bitrate</div>
                      <select value={(selectedJob as any).overrideAudioBitrate || ''} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideAudioBitrate: e.target.value } as any : j))} style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        <option value="">Auto</option>
                        <option value="64">64 kbps</option>
                        <option value="128">128 kbps</option>
                        <option value="192">192 kbps</option>
                        <option value="256">256 kbps</option>
                        <option value="320">320 kbps</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Sample Rate</div>
                      <select value={(selectedJob as any).overrideSampleRate || ''} onChange={e => setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, overrideSampleRate: e.target.value } as any : j))} style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                        <option value="">Auto</option>
                        <option value="44100">44.1 kHz</option>
                        <option value="48000">48 kHz</option>
                        <option value="96000">96 kHz</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedJob.status === 'completed' && selectedJob.outputBlobUrl && (
              <a
                href={selectedJob.outputBlobUrl}
                download={selectedJob.name.replace(/\.[^.]+$/, '') + '.' + (selectedJob.outputExt || 'webm')}
                style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', marginTop: 'var(--space-4)', textDecoration: 'none', textAlign: 'center', display: 'inline-flex' } as React.CSSProperties}
              >
                {Icons.download} Download {(selectedJob.outputExt || '').toUpperCase() || 'Encoded File'}
              </a>
            )}

            {/* Native-only: honestly flag jobs that need the native encoder — no fake file. */}
            {selectedJob.status === 'unsupported' && (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2)', background: 'var(--color-warning-muted, rgba(255,159,10,0.12))', borderRadius: 'var(--radius-lg)', fontSize: '11px', color: 'var(--color-warning)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                {Icons.alert} <span>{selectedJob.error || 'Requires the native encoder.'}</span>
              </div>
            )}

            {selectedJob.status === 'failed' && selectedJob.error && (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2)', background: 'var(--color-error-muted, rgba(255,69,58,0.1))', borderRadius: 'var(--radius-lg)', fontSize: '11px', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {Icons.alert} {selectedJob.error}
              </div>
            )}
          </div>
        )}
      </div>



      {/* ===== PRO FLOATING PANELS ===== */}

      {/* Image Sequence Export */}
      {showImageSequence && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Image Sequence Export</span>
            <button aria-label="Close Image Sequence Export" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowImageSequence(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Frame Format</div>
            <SegmentedControl options={(['png', 'jpg', 'webp'] as const).map(f => ({ value: f, label: f.toUpperCase() }))} value={imgSeqFormat} onChange={setImgSeqFormat} accentColor="var(--color-accent)" variant="outlined" columns={3} size="sm" style={{ marginBottom: 'var(--space-3)' }} />
            <div style={{ padding: 10, background: 'var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Naming Pattern</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>frame_[####].{imgSeqFormat}</div>
            </div>
            <button aria-label="Export image sequence" onClick={async () => {
              if (!selectedJob || !fileMapRef.current.has(selectedJob.id)) { toast.warning('Select a video file first'); return; }
              const file = fileMapRef.current.get(selectedJob.id)!;
              const video = document.createElement('video');
              video.muted = true; video.playsInline = true;
              const objUrl = URL.createObjectURL(file);
              video.src = objUrl;
              await new Promise<void>((res, rej) => { video.onloadedmetadata = () => res(); video.onerror = () => rej(); });
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) { toast.error('Canvas context unavailable'); return; }
              const fps = 30; const dur = video.duration; const totalFrames = Math.floor(dur * fps);
              toast.info(`Exporting ${totalFrames} frames as ${imgSeqFormat.toUpperCase()}...`);
              const frameBlobs: Blob[] = [];
              for (let i = 0; i < totalFrames; i++) {
                video.currentTime = i / fps;
                await new Promise<void>(r => { video.onseeked = () => r(); });
                ctx.drawImage(video, 0, 0);
                const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeMap[imgSeqFormat] || 'image/png', 0.92));
                if (blob) frameBlobs.push(blob);
                if (i % 10 === 0) toast.info(`Frame ${i + 1}/${totalFrames}...`);
              }
              // Batch download all frames
              for (let i = 0; i < frameBlobs.length; i++) {
                const a = document.createElement('a'); a.href = URL.createObjectURL(frameBlobs[i]); a.download = `frame_${String(i).padStart(6, '0')}.${imgSeqFormat}`; a.click(); URL.revokeObjectURL(a.href);
              }
              URL.revokeObjectURL(objUrl); toast.success(`Exported ${totalFrames} frames`); setShowImageSequence(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Export Sequence</button>
          </div>
        </div>
      )}

      {/* Audio Extraction */}
      {showAudioExtract && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(300px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Audio Extraction</span>
            <button aria-label="Close Audio Extraction" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowAudioExtract(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Output Format</div>
            <SegmentedControl options={([{ v: 'wav', l: 'WAV' }, { v: 'opus', l: 'Opus (WebM)' }] as const).map(f => ({ value: f.v, label: f.l }))} value={audioExtractFormat} onChange={setAudioExtractFormat} accentColor="#bf5af2" variant="outlined" columns={2} size="sm" style={{ marginBottom: 'var(--space-3)' }} />
            <div style={{ padding: 10, background: 'var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', marginBottom: 10 }}>
              {[
                { label: 'Codec', value: audioExtractFormat === 'wav' ? 'PCM (lossless)' : 'Opus (lossy)' },
                { label: 'Channels', value: 'Source' },
                { label: 'Bit Depth', value: audioExtractFormat === 'wav' ? '16-bit' : '—' },
              ].map(i => (
                <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{i.label}</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{i.value}</span></div>
              ))}
            </div>
            <button aria-label="Extract audio from video" disabled={mediaBusy} onClick={async () => {
              if (mediaBusy) return;
              if (!selectedJob || !fileMapRef.current.has(selectedJob.id)) { toast.warning('Select a video file first'); return; }
              const file = fileMapRef.current.get(selectedJob.id)!;
              const baseName = selectedJob.name.replace(/\.[^.]+$/, '');
              toast.info('Extracting audio...');
              setMediaBusy(true);
              // WAV: decode the source and write a real PCM WAV via the shared
              // encoder — no MediaRecorder, no format lie.
              if (audioExtractFormat === 'wav') {
                try {
                  const result = await transcodeAudioToWav(file, { bitDepth: 16 });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(result.blob);
                  a.download = `${baseName}.wav`;
                  a.click(); URL.revokeObjectURL(a.href);
                  toast.success('Audio extracted as WAV'); setShowAudioExtract(false);
                } catch (err: any) {
                  console.error('[Forge] WAV audio extraction failed:', err);
                  toast.error('Could not extract audio — the source may have no decodable audio track.');
                } finally { setMediaBusy(false); }
                return;
              }
              // Opus: capture the decoded audio through MediaRecorder. The real
              // container is WebM, so we download .webm (not a fake .mp3/.aac).
              let audioCtx: AudioContext | null = null;
              try {
                const arrayBuffer = await file.arrayBuffer();
                audioCtx = new AudioContext();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                const dest = audioCtx.createMediaStreamDestination();
                source.connect(dest);
                const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
                const mime = candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
                const ext = mime.includes('ogg') ? 'ogg' : 'webm';
                const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
                const chunks: Blob[] = [];
                recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = () => {
                  try { audioCtx?.close(); } catch { /* already closed */ }
                  const blob = new Blob(chunks, { type: mime });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${baseName}.${ext}`;
                  a.click(); URL.revokeObjectURL(a.href);
                  toast.success('Audio extracted as Opus (WebM)'); setShowAudioExtract(false);
                  setMediaBusy(false);
                };
                recorder.start(100); source.start(0);
                source.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
              } catch (err: any) { console.error('[Forge] audio extraction failed:', err); toast.error('Could not extract audio. Try a different file or format.'); try { audioCtx?.close(); } catch { /* */ } setMediaBusy(false); }
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: mediaBusy ? 'not-allowed' : 'pointer', opacity: mediaBusy ? 0.5 : 1 }}>{mediaBusy ? `${extractPhrase}…` : 'Extract Audio'}</button>
          </div>
        </div>
      )}

      {/* Watermark Overlay */}
      {showWatermark && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', right: 20, top: 80, width: 280, borderRadius: 10, boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Watermark Overlay</span>
            <button aria-label="Close Watermark Overlay" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowWatermark(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <NativeEncoderNote>Recorded on the job. Compositing a watermark into video frames runs in the native encoder (not in this build).</NativeEncoderNote>
            <SegmentedControl options={(['text', 'image'] as const).map(t => ({ value: t, label: t === 'text' ? 'Text' : 'Image' }))} value={watermarkType} onChange={setWatermarkType} accentColor="var(--color-accent)" variant="outlined" size="sm" style={{ marginBottom: 10, width: '100%' }} />
            {watermarkType === 'text' && (
              <input value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="Watermark text..." style={{ width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: '#E0E0E0', fontSize: 11, marginBottom: 'var(--space-2)' }} />
            )}
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Position</div>
            <SegmentedControl
              options={(['top-left', 'top-center', 'top-right', 'bottom-left', 'center', 'bottom-right'] as const).map(p => ({ value: p, label: p === 'center' ? '●' : p.split('-').map(w => w[0].toUpperCase()).join('') }))}
              value={watermarkPosition}
              onChange={setWatermarkPosition}
              accentColor="var(--color-accent)"
              variant="outlined"
              columns={3}
              size="sm"
              style={{ marginBottom: 'var(--space-2)' }}
            />
            <CreativeSlider label="Opacity" min={5} max={100} step={1} value={watermarkOpacity} onChange={setWatermarkOpacity} unit="%" accentColor="var(--color-accent)" layout="stacked" style={{ marginBottom: 10 }} />
            <button aria-label="Apply watermark" onClick={() => {
              if (!selectedJob) { toast.warning('Select a job first'); return; }
              setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, watermark: { type: watermarkType, text: watermarkText, opacity: watermarkOpacity, position: watermarkPosition } } as any : j));
              toast.success('Watermark applied to job'); setShowWatermark(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 9999, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Watermark</button>
          </div>
        </div>
      )}

      {/* Trim / Split Panel */}
      {showTrimSplit && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Trim & Split</span>
            <button aria-label="Close Trim and Split" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTrimSplit(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div
              ref={trimTrackRef}
              onPointerMove={onTrimHandleMove}
              style={{ height: 64, background: 'var(--color-bg-inset)', borderRadius: 4, position: 'relative', marginBottom: 6, overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}
            >
              {/* Real waveform (audio), or an honest message for video/unavailable. */}
              <svg width="100%" height="64" viewBox="0 0 480 64" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
                <line x1="0" y1="32" x2="480" y2="32" stroke="var(--color-border-subtle)" strokeWidth="1" />
                {trimWaveState === 'ready' && trimWave && trimWave.peaks.map((p, i) => {
                  const x = (i / trimWave.peaks.length) * 480;
                  const h = Math.max(1, p * 60);
                  const inX = (trimIn / 100) * 480, outX = (trimOut / 100) * 480;
                  const inRange = x >= inX && x <= outX;
                  return <rect key={i} x={x} y={32 - h / 2} width={Math.max(0.6, 480 / trimWave.peaks.length - 0.3)} height={h} fill={inRange ? 'var(--color-accent)' : 'var(--color-text-muted)'} opacity={inRange ? 0.95 : 0.4} />;
                })}
              </svg>
              {/* Selected region overlay */}
              <div style={{ position: 'absolute', left: `${trimIn}%`, width: `${trimOut - trimIn}%`, top: 0, bottom: 0, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', pointerEvents: 'none' }} />
              {/* Draggable IN handle */}
              <div onPointerDown={e => startTrimHandleDrag('in', e)} onPointerMove={onTrimHandleMove} onPointerUp={endTrimHandleDrag} title="Drag in point" style={{ position: 'absolute', left: `${trimIn}%`, top: 0, bottom: 0, width: 10, marginLeft: -5, cursor: 'ew-resize', display: 'flex', alignItems: 'stretch', zIndex: 3 }}>
                <div style={{ width: 2, margin: '0 auto', background: 'var(--color-accent)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent)' }} />
              </div>
              {/* Draggable OUT handle */}
              <div onPointerDown={e => startTrimHandleDrag('out', e)} onPointerMove={onTrimHandleMove} onPointerUp={endTrimHandleDrag} title="Drag out point" style={{ position: 'absolute', left: `${trimOut}%`, top: 0, bottom: 0, width: 10, marginLeft: -5, cursor: 'ew-resize', display: 'flex', alignItems: 'stretch', zIndex: 3 }}>
                <div style={{ width: 2, margin: '0 auto', background: 'var(--color-error)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-error) 40%, transparent)' }} />
              </div>
              {trimWaveState !== 'ready' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                  {trimWaveState === 'loading' ? 'Decoding waveform…'
                    : trimWaveState === 'unsupported' ? 'Waveform preview is audio-only — sliders still set the trim'
                    : trimWaveState === 'error' ? 'Could not decode audio — sliders still set the trim'
                    : 'Select an audio job to preview its waveform'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
              <span>In {fmtTrimTime(trimIn)}</span>
              {trimWave && <span style={{ color: 'var(--color-text-secondary)' }}>Selection {fmtTrimTime(trimOut - trimIn)}</span>}
              <span>Out {fmtTrimTime(trimOut)}</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 10 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>In Point</div><input type="range" min="0" max="99" value={trimIn} onChange={e => setTrimIn(Math.min(Number(e.target.value), trimOut - 1))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} /><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{trimIn}%</div></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Out Point</div><input type="range" min="1" max="100" value={trimOut} onChange={e => setTrimOut(Math.max(Number(e.target.value), trimIn + 1))} style={{ width: '100%', accentColor: 'var(--color-error)' }} /><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{trimOut}%</div></div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button aria-label="Trim video" onClick={() => {
                if (!selectedJob) { toast.warning('Select a job first'); return; }
                setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, trimIn: trimIn / 100, trimOut: trimOut / 100 } as any : j));
                toast.success(`Trim set: ${trimIn}% → ${trimOut}%`); setShowTrimSplit(false);
              }} style={{ flex: 1, padding: '7px', borderRadius: 9999, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Trim</button>
              <button aria-label="Split video at intervals" onClick={() => {
                if (!selectedJob) { toast.warning('Select a job first'); return; }
                const segments = 3;
                const newJobs: Job[] = [];
                for (let i = 0; i < segments; i++) {
                  newJobs.push({ ...selectedJob, id: `split-${Date.now()}-${i}`, name: `${selectedJob.name.replace(/\.[^.]+$/, '')}_part${i + 1}`, trimIn: i / segments, trimOut: (i + 1) / segments, status: 'queued', progress: 0 } as any);
                }
                setJobs(prev => [...prev.filter(j => j.id !== selectedJob.id), ...newJobs]);
                toast.success(`Split into ${segments} segments`); setShowTrimSplit(false);
              }} style={{ flex: 1, padding: '7px', borderRadius: 9999, border: '1px solid var(--color-warning-muted, rgba(255,149,10,0.2))', background: 'var(--color-warning-muted, rgba(255,149,10,0.08))', color: 'var(--color-warning)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Split at Intervals</button>
            </div>
          </div>
        </div>
      )}

      {/* Crop & Pad Panel */}
      {showCropPad && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', right: 20, top: 100, width: 260, borderRadius: 10, boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crop & Pad</span>
            <button aria-label="Close Crop and Pad panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCropPad(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <NativeEncoderNote>Crop/pad settings are recorded on the job. Re-framing video pixels runs in the native encoder (not in this build).</NativeEncoderNote>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Aspect Ratio</div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['free', '16:9', '4:3', '1:1', '9:16'] as const).map(a => (
                <button key={a} onClick={() => setCropAspect(a)} style={{ padding: '4px var(--space-2)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: cropAspect === a ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: cropAspect === a ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{a}</button>
              ))}
            </div>
            <div style={{ height: 80, background: 'var(--color-border-subtle)', borderRadius: 4, border: '1px solid var(--color-bg-hover)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: cropAspect === '9:16' ? 30 : cropAspect === '1:1' ? 50 : 60, height: cropAspect === '9:16' ? 54 : cropAspect === '1:1' ? 50 : cropAspect === '4:3' ? 45 : 34, border: '2px dashed var(--color-accent)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{cropAspect}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Pad Color</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <input type="color" value={padColor} onChange={e => setPadColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', borderRadius: 3, cursor: 'pointer' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{padColor}</span>
            </div>
            <button aria-label="Apply crop and pad" onClick={() => {
              if (!selectedJob) { toast.warning('Select a job first'); return; }
              setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, cropAspect, padColor } as any : j));
              toast.success(`Crop set to ${cropAspect}`); setShowCropPad(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 9999, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Crop & Pad</button>
          </div>
        </div>
      )}

      {/* Subtitle Burn-in */}
      {showSubBurnIn && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Subtitle Burn-in</span>
            <button aria-label="Close Subtitle Burn-in" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSubBurnIn(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <NativeEncoderNote>Cues and style are parsed and recorded on the job. Burning subtitles into the video runs in the native encoder (not in this build).</NativeEncoderNote>
            <div style={{ padding: 10, background: 'var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', marginBottom: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Subtitle File</div>
              <label style={{ padding: '6px var(--space-3)', borderRadius: 9999, border: '1px dashed var(--color-border)', background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'inline-block' }}>Load SRT / ASS<input type="file" accept=".srt,.ass,.ssa,.vtt" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = reader.result as string;
                    // Parse SRT format: index\nstart --> end\ntext\n\n
                    const cues: Array<{start: number; end: number; text: string}> = [];
                    const blocks = text.trim().split(/\r?\n\r?\n/);
                    for (const block of blocks) {
                      const lines = block.trim().split(/\r?\n/);
                      if (lines.length < 3) continue;
                      const timeMatch = lines[1]?.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
                      if (!timeMatch) continue;
                      const start = +timeMatch[1]*3600 + +timeMatch[2]*60 + +timeMatch[3] + +timeMatch[4]/1000;
                      const end = +timeMatch[5]*3600 + +timeMatch[6]*60 + +timeMatch[7] + +timeMatch[8]/1000;
                      cues.push({ start, end, text: lines.slice(2).join('\n').replace(/<[^>]+>/g, '') });
                    }
                    if (selectedJob) {
                      setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, subtitleCues: cues, subtitleBurnIn: { font: subBurnFont, size: subBurnSize, position: subBurnPosition, style: subBurnStyle } } as any : j));
                      toast.success(`Loaded ${cues.length} subtitle cues from ${file.name}`);
                    }
                  };
                  reader.readAsText(file);
                }
                e.target.value = '';
              }} /></label>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Font Family</div>
            <select value={subBurnFont} onChange={e => setSubBurnFont(e.target.value)} style={{ width: '100%', padding: '5px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 'var(--space-2)' }}>
              {['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Impact'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <CreativeSlider label="Font Size" min={12} max={64} step={1} value={subBurnSize} onChange={setSubBurnSize} unit="px" accentColor="var(--color-accent)" layout="stacked" style={{ marginBottom: 'var(--space-2)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Position</div><select value={subBurnPosition} onChange={e => setSubBurnPosition(e.target.value as typeof subBurnPosition)} style={{ width: '100%', padding: '4px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}><option>Bottom</option><option>Top</option><option>Center</option></select></div>
              <div><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Style</div><select value={subBurnStyle} onChange={e => setSubBurnStyle(e.target.value as typeof subBurnStyle)} style={{ width: '100%', padding: '4px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}><option>Outline</option><option>Shadow</option><option>Box</option></select></div>
            </div>
            <button aria-label="Apply subtitle burn-in" onClick={() => {
              if (!selectedJob) { toast.warning('Select a job first'); return; }
              setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, subtitleBurnIn: { font: subBurnFont, size: subBurnSize, position: subBurnPosition, style: subBurnStyle } } as any : j));
              toast.success('Subtitle burn-in configured'); setShowSubBurnIn(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 9999, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>Apply Subtitle Settings</button>
          </div>
        </div>
      )}

      {/* Conditional Encoding Rules */}
      {showConditionalRules && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Conditional Encoding Rules</span>
            <button aria-label="Close Conditional Rules" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowConditionalRules(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <NativeEncoderNote>Rules are saved, but they are evaluated by the native encoder during a video encode (not in this build), so they do not change in-browser image/WAV jobs.</NativeEncoderNote>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>When input matches a condition, automatically apply the action</div>
            {conditionalRules.map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px var(--space-2)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                <input type="checkbox" checked={rule.enabled} onChange={() => setConditionalRules(rules => rules.map((r, j) => j === i ? { ...r, enabled: !r.enabled } : r))} style={{ accentColor: 'var(--color-success)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: rule.enabled ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>IF {rule.condition}</div>
                  <div style={{ fontSize: 11, color: rule.enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>THEN {rule.action}</div>
                </div>
                <button aria-label={`Remove rule ${i + 1}`} onClick={() => setConditionalRules(rules => rules.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}><DexIcon name="close" size={10} /></button>
              </div>
            ))}
            <button aria-label="Add conditional encoding rule" onClick={() => setConditionalRules(rules => [...rules, { condition: 'New condition', action: 'New action', enabled: true }])} style={{ width: '100%', padding: '6px', borderRadius: 9999, border: '1px dashed var(--color-border-subtle)', background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginTop: 6 }}>+ Add Rule</button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && selectedJob && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(560px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Preview — {selectedJob.name}</span>
            <button aria-label="Close Preview" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowPreview(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            {fileMapRef.current.has(selectedJob.id) ? (
              <div style={{ borderRadius: 6, overflow: 'hidden', background: '#000' }}>
                {selectedJob.isAudio ? (
                  <div style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 'var(--space-3)' }}>{Icons.audioWave}</div>
                    <audio ref={previewVideoRef as any} controls style={{ width: '100%' }}
                      src={previewSourceUrl || undefined} />
                  </div>
                ) : (
                  <video ref={previewVideoRef} controls style={{ width: '100%', maxHeight: 340, display: 'block' }}
                    src={previewSourceUrl || undefined} />
                )}
              </div>
            ) : (
              <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Source file not available for preview</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <span>Output: WebM (VP9) {selectedJob.format !== 'WebM' ? `— styled as ${selectedJob.format}` : ''}</span>
              <span>Size: {selectedJob.inputSize ? formatBytes(selectedJob.inputSize) : '--'}</span>
              <span>Preset: {presets.find(p => p.id === selectedJob.preset)?.name || selectedJob.preset}</span>
            </div>
          </div>
        </div>
      )}

      {/* A/B Compare */}
      {showABCompare && selectedJob?.outputBlobUrl && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>A/B Compare — {selectedJob.name}</span>
            <button aria-label="Close A/B Compare" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowABCompare(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', marginBottom: 4, textTransform: 'uppercase' }}>Source</div>
              <div style={{ borderRadius: 4, overflow: 'hidden', background: '#000', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {previewSourceUrl ? (
                  <video controls muted style={{ width: '100%', maxHeight: 200 }}
                    src={previewSourceUrl} />
                ) : (
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>Source unavailable</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Size: {selectedJob.inputSize ? formatBytes(selectedJob.inputSize) : '--'}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', marginBottom: 4, textTransform: 'uppercase' }}>Output</div>
              <div style={{ borderRadius: 4, overflow: 'hidden', background: '#000', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video controls muted style={{ width: '100%', maxHeight: 200 }}
                  src={selectedJob.outputBlobUrl} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Size: {selectedJob.outputSize ? formatBytes(selectedJob.outputSize) : '--'}
                {selectedJob.inputSize && selectedJob.outputSize ? ` (${Math.round((1 - selectedJob.outputSize / selectedJob.inputSize) * 100)}% smaller)` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Rename */}
      {showBatchRename && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Batch Rename Output</span>
            <button aria-label="Close Batch Rename" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowBatchRename(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Naming Pattern</div>
            <input value={batchRenamePattern} onChange={e => setBatchRenamePattern(e.target.value)}
              style={{ width: '100%', padding: 'var(--space-2) 10px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: '#E0E0E0', fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 'var(--space-2)' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
              {['{name}', '{preset}', '{format}', '{date}', '{index}', '{resolution}'].map(token => (
                <button key={token} onClick={() => setBatchRenamePattern(prev => prev + token)} style={{
                  padding: '3px var(--space-2)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)',
                  background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                }}>{token}</button>
              ))}
            </div>
            <div style={{ padding: 'var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Preview</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {batchRenamePattern.replace('{name}', 'video').replace('{preset}', selectedPreset).replace('{format}', presets.find(p => p.id === selectedPreset)?.format || 'H.264').replace('{date}', new Date().toISOString().split('T')[0]).replace('{index}', '001').replace('{resolution}', '1080p')}.{presets.find(p => p.id === selectedPreset)?.container || 'mp4'}
              </div>
            </div>
            <button onClick={() => {
              setJobs(prev => prev.map((j, i) => ({
                ...j,
                name: batchRenamePattern
                  .replace('{name}', j.name.replace(/\.[^.]+$/, ''))
                  .replace('{preset}', j.preset)
                  .replace('{format}', j.format)
                  .replace('{date}', new Date().toISOString().split('T')[0])
                  .replace('{index}', String(i + 1).padStart(3, '0'))
                  .replace('{resolution}', presets.find(p => p.id === j.preset)?.height ? `${presets.find(p => p.id === j.preset)?.height}p` : 'original')
                  + '.' + (presets.find(p => p.id === j.preset)?.container || 'mp4'),
              })));
              setShowBatchRename(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply to All Jobs</button>
          </div>
        </div>
      )}

      {/* Concat / Merge */}
      {showConcat && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, calc(100vw - 48px))', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Concatenate / Merge Files</span>
            <button aria-label="Close Concat" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowConcat(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>Drag to reorder. Files will be concatenated in this order.</div>
            {jobs.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Add files to queue first</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                {concatOrder.map((id, idx) => {
                  const job = jobs.find(j => j.id === id);
                  if (!job) return null;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 10px', borderRadius: 'var(--radius-lg)', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 16 }}>{idx + 1}.</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{job.name}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button aria-label={`Move ${job.name} up`} disabled={idx === 0} onClick={() => setConcatOrder(prev => { const a = [...prev]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return a; })} style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--color-text-disabled, #48484a)' : 'var(--color-text-tertiary)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1, fontSize: 12, padding: 4, transition: 'opacity 0.15s ease' }}><DexIcon name="chevron-up" size={12} /></button>
                        <button aria-label={`Move ${job.name} down`} disabled={idx === concatOrder.length - 1} onClick={() => setConcatOrder(prev => { const a = [...prev]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; return a; })} style={{ background: 'none', border: 'none', color: idx === concatOrder.length - 1 ? 'var(--color-text-disabled, #48484a)' : 'var(--color-text-tertiary)', cursor: idx === concatOrder.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === concatOrder.length - 1 ? 0.4 : 1, fontSize: 12, padding: 4, transition: 'opacity 0.15s ease' }}><DexIcon name="chevron-down" size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={mediaBusy} onClick={async () => {
                // Instant lossless merge — the old version pushed a 'queued'
                // job with NO source file behind it, which could never process
                // (a dead job the user waited on forever). Now: decode every
                // source in order, concatenate the PCM, and write a real WAV
                // via the shared encoder. No MediaRecorder = no real-time wait.
                if (mediaBusy || concatOrder.length < 2) return;
                const sourceFiles: File[] = [];
                for (const id of concatOrder) {
                  const file = fileMapRef.current.get(id);
                  if (file) sourceFiles.push(file);
                }
                if (sourceFiles.length < 2) { toast.warning('Need at least 2 files with source data'); return; }
                setMediaBusy(true);
                let audioCtx: AudioContext | null = null;
                try {
                  audioCtx = new AudioContext();
                  const buffers: AudioBuffer[] = [];
                  for (const f of sourceFiles) {
                    const ab = await f.arrayBuffer();
                    buffers.push(await audioCtx.decodeAudioData(ab));
                  }
                  const totalLength = buffers.reduce((s, b) => s + b.length, 0);
                  const sr = buffers[0].sampleRate;
                  const channels = buffers[0].numberOfChannels;
                  const merged = audioCtx.createBuffer(channels, totalLength, sr);
                  let offset = 0;
                  for (const buf of buffers) {
                    for (let ch = 0; ch < channels; ch++) {
                      merged.getChannelData(ch).set(buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1)), offset);
                    }
                    offset += buf.length;
                  }
                  const wavBlob = encodeWav(merged, 24);
                  try { audioCtx.close(); } catch { /* already closed */ }
                  audioCtx = null;
                  const mergeJobId = `merge-${Date.now()}`;
                  fileMapRef.current.set(mergeJobId, new File([wavBlob], `Merged_${concatOrder.length}_files.wav`, { type: 'audio/wav' }));
                  setJobs(prev => [...prev, {
                    id: mergeJobId, name: `Merged_${concatOrder.length}_files.wav`,
                    source: 'Multiple files', destination: customOutputDir,
                    format: 'WAV', preset: selectedPreset,
                    status: 'completed' as const, progress: 100, duration: merged.duration, estimatedTime: 0,
                    inputSize: sourceFiles.reduce((s, f) => s + f.size, 0), outputSize: wavBlob.size,
                    outputBlobUrl: URL.createObjectURL(wavBlob), outputExt: 'wav',
                  }]);
                  toast.success(`Merged ${sourceFiles.length} files — ${merged.duration.toFixed(1)}s WAV`);
                  setShowConcat(false);
                } catch (err: any) {
                  console.error('[Forge] WAV merge failed:', err);
                  toast.error('Unable to merge — a source may have no decodable audio track.');
                  try { audioCtx?.close(); } catch { /* */ }
                } finally {
                  setMediaBusy(false);
                }
              }} style={{ flex: 1, padding: '7px', borderRadius: 9999, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: (concatOrder.length < 2 || mediaBusy) ? 'not-allowed' : 'pointer', opacity: (concatOrder.length < 2 || mediaBusy) ? 0.4 : 1 }}>Merge Audio → WAV (instant)</button>
              <button disabled={mediaBusy} onClick={async () => {
                if (mediaBusy) return;
                if (concatOrder.length < 2) return;
                toast.info('Joining files via sequential re-encode...');
                // Collect source files in order
                const sourceFiles: File[] = [];
                for (const id of concatOrder) {
                  const file = fileMapRef.current.get(id);
                  if (file) sourceFiles.push(file);
                }
                if (sourceFiles.length < 2) { toast.warning('Need at least 2 files with source data'); return; }

                setMediaBusy(true);
                let audioCtx: AudioContext | null = null;
                try {
                  // Decode all source files as AudioBuffers and concat
                  audioCtx = new AudioContext();
                  const buffers: AudioBuffer[] = [];
                  for (const f of sourceFiles) {
                    const ab = await f.arrayBuffer();
                    const decoded = await audioCtx.decodeAudioData(ab);
                    buffers.push(decoded);
                  }
                  const totalLength = buffers.reduce((s, b) => s + b.length, 0);
                  const sr = buffers[0].sampleRate;
                  const channels = buffers[0].numberOfChannels;
                  const merged = audioCtx.createBuffer(channels, totalLength, sr);
                  let offset = 0;
                  for (const buf of buffers) {
                    for (let ch = 0; ch < channels; ch++) {
                      merged.getChannelData(ch).set(buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1)), offset);
                    }
                    offset += buf.length;
                  }
                  // Re-encode merged buffer via MediaRecorder
                  const source = audioCtx.createBufferSource();
                  source.buffer = merged;
                  const dest = audioCtx.createMediaStreamDestination();
                  source.connect(dest);
                  const mime = ['audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
                  const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
                  const chunks: Blob[] = [];
                  const done = new Promise<Blob>((res) => {
                    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                    recorder.onstop = () => res(new Blob(chunks, { type: mime }));
                  });
                  recorder.start(100);
                  source.start(0);
                  source.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
                  const mergedBlob = await done;
                  try { audioCtx.close(); } catch { /* already closed */ }
                  audioCtx = null;

                  const mergeJobId = `merge-${Date.now()}`;
                  const mergedFile = new File([mergedBlob], 'smart_join_output.webm', { type: mime });
                  fileMapRef.current.set(mergeJobId, mergedFile);
                  const resolvedPreset = presets.find(p => p.id === selectedPreset);
                  setJobs(prev => [...prev, {
                    id: mergeJobId, name: `SmartJoin_${concatOrder.length}_files`,
                    source: 'Multiple files', destination: customOutputDir,
                    format: resolvedPreset?.format || 'H.264', preset: selectedPreset,
                    status: 'completed' as const, progress: 100, duration: merged.duration, estimatedTime: 0,
                    inputSize: mergedBlob.size, outputSize: mergedBlob.size,
                    outputBlobUrl: URL.createObjectURL(mergedBlob),
                  }]);
                  toast.success(`Smart join complete — ${merged.duration.toFixed(1)}s`);
                } catch (err: any) {
                  console.error('[Forge] smart join failed:', err);
                  toast.error('Unable to combine audio. Please check file compatibility.');
                  try { audioCtx?.close(); } catch { /* */ }
                } finally {
                  setMediaBusy(false);
                }
                setShowConcat(false);
              }} style={{ flex: 1, padding: '7px', borderRadius: 9999, border: '1px solid var(--color-warning-muted, rgba(255,149,10,0.2))', background: 'var(--color-warning-muted, rgba(255,149,10,0.08))', color: 'var(--color-warning)', fontSize: 11, fontWeight: 600, cursor: (concatOrder.length < 2 || mediaBusy) ? 'not-allowed' : 'pointer', opacity: (concatOrder.length < 2 || mediaBusy) ? 0.4 : 1 }}>{mediaBusy ? `${joinPhrase}…` : 'Smart Join (re-encode)'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{Icons.cpu} {useHardwareAccel ? (gpuInfo ? `${gpuInfo.gpuName} (${gpuInfo.recommendedEncoder})` : 'GPU Accelerated') : 'CPU Only'}</span>
        <span>|</span>
        <span>{Icons.layers} {parallelJobs} parallel jobs</span>
        <span>|</span>
        <span>{Icons.hardDrive} {storageInfo}</span>
        {audioNormalize && <><span>|</span><span style={{ color: '#bf5af2' }}>{Icons.audioWave} Normalize: {audioNormTarget} LUFS</span></>}
        <div style={{ flex: 1 }} />
        <span style={{ color: isEncoding ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{isEncoding ? 'Encoding...' : 'Ready'}</span>
      </div>

      {/* Right-click context menu */}
      {ctxMenu.visible && ctxMenu.jobId && (() => {
        const ctxJob = jobs.find(j => j.id === ctxMenu.jobId);
        if (!ctxJob) return null;
        const idx = jobs.findIndex(j => j.id === ctxMenu.jobId);
        const menuItems = [
          { label: 'Duplicate Job', fn: () => duplicateJob(ctxJob.id) },
          { label: 'Move Up', fn: () => moveJob(ctxJob.id, -1), disabled: idx <= 0 },
          { label: 'Move Down', fn: () => moveJob(ctxJob.id, 1), disabled: idx >= jobs.length - 1 },
          null,
          { label: 'Reset Progress', fn: () => setJobs(prev => prev.map(j => j.id === ctxJob.id ? { ...j, status: 'queued' as const, progress: 0, startTime: undefined, endTime: undefined } : j)), disabled: ctxJob.status === 'queued' },
          null,
          { label: 'Remove Job', fn: () => removeJob(ctxJob.id), danger: true },
        ];
        // Clamp to the viewport so right-clicks near the right/bottom edge
        // don't push the menu off-screen (every other popup here clamps too).
        const MENU_W = 160;
        const MENU_H = 7 * 28 + 8; // 5 items + 2 dividers, ~28px each
        const clampedX = Math.max(8, Math.min(ctxMenu.x, window.innerWidth - MENU_W - 8));
        const clampedY = Math.max(8, Math.min(ctxMenu.y, window.innerHeight - MENU_H - 8));
        return (
          <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: clampedX, top: clampedY, zIndex: 'var(--z-max)', minWidth: MENU_W, borderRadius: 12, padding: '4px 0', boxShadow: 'var(--pg-shadow-context)', animation: 'contextMenuIn 0.12s ease' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px var(--space-2)' }} />
              : <div key={i} className="forge-ctx-item" onClick={() => { if (!item.disabled) { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); } }} style={{ padding: '6px 14px', fontSize: 11, color: item.disabled ? '#555' : item.danger ? 'var(--color-error)' : '#e0e0e0', cursor: item.disabled ? 'default' : 'pointer', borderRadius: 3, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// Memoize entire component for multi-window performance
Forge.displayName = 'Forge';
export default memo(Forge);
