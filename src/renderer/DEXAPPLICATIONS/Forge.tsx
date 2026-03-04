/**
 * DEX Platform - FORGE Media Encoder
 * Copyright (c) 2026 DEX. All rights reserved.
 * Professional batch media encoding and transcoding
 */
import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useRunningApps } from '../store/runningApps';
import { useBeginnerMode, KeyboardShortcutsPanel, BeginnerTip, APP_TIPS } from '../components/Onboarding';
import { useAppTracking } from '../services/usePatternLearning';
import {
  VIDEO_PRESETS,
  AUDIO_PRESETS,
  IMAGE_PRESETS,
  DEFAULT_QUEUE_SETTINGS,
  NAMING_TOKENS,
  GPU_ENCODERS,
  formatFileSize,
  formatDuration as forgeFormatDuration,
  estimateEncodingTime,
  getAllPresets as getForgePresets,
} from './ForgeFeatures';
import type { EncodingPreset, QueueSettings } from './ForgeFeatures';

// ═══════════════════════════════════════════════════════════════════════════
// DEX FORGE - Professional Media Encoder
// Apple Compressor / Adobe Media Encoder alternative with batch transcoding
// ═══════════════════════════════════════════════════════════════════════════

// ==================== TYPES ====================
interface Job {
  id: string;
  name: string;
  source: string;
  destination: string;
  preset: string;
  format: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
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
];

// ==================== COMPONENT ====================
const Forge: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('forge');

  // ===== RUNNING APPS =====
  const { closeApp, setCurrentApp } = useRunningApps();

  // ===== BEGINNER MODE =====
  const { 
    isBeginnerMode: beginnerMode, 
    showShortcutsPanel, 
    setShowShortcutsPanel,
    currentTip,
    dismissTip,
    getNextTip
  } = useBeginnerMode('forge');

  // ===== STATE =====
  // Start with empty queue - user adds their own files
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [presets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState<string>('h264-1080');
  const [watchFolders, setWatchFolders] = useState<WatchFolder[]>([]);
  const [isEncoding, setIsEncoding] = useState(false); // Start paused until user adds jobs
  
  // Settings
  const [parallelJobs, setParallelJobs] = useState(2);
  const [useHardwareAccel, setUseHardwareAccel] = useState(true);
  const [shutdownAfter, setShutdownAfter] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  
  // Active panel
  const [activeTab, setActiveTab] = useState<'queue' | 'presets' | 'watch' | 'settings'>('queue');
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const [storageInfo, setStorageInfo] = useState<string>('Local Storage');
  
  // Refs for encoding engine
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeEncodings = useRef<Set<string>>(new Set());

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
        if (data.activeTab) setActiveTab(data.activeTab);
        if (data.presetCategory) setPresetCategory(data.presetCategory);
        if (data.watchFolders) setWatchFolders(data.watchFolders);
      } catch (e) { /* ignore */ }
    }
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
        if (estimate.quota && estimate.usage !== undefined) {
          const free = estimate.quota - estimate.usage;
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
          const i = free > 0 ? Math.floor(Math.log(free) / Math.log(k)) : 0;
          const freeStr = parseFloat((free / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
          setStorageInfo(`Local Storage (${freeStr} available)`);
        }
      }).catch(() => {});
    }
  }, []);

  // ===== EMPTY STATE =====
  const renderWelcome = () => (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      height: '100%', gap: '12px', textAlign: 'center',
    }}>
      <div style={{ color: 'var(--color-text-muted)', opacity: 0.3 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Drop files or click Add Files</span>
      <button onClick={addFiles} aria-label="Add files" style={{  
        border: '1px solid rgba(10,132,255,0.2)', borderRadius: '6px', color: '#0a84ff', fontSize: '11px', fontWeight: 500, 
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Files
      </button>
    </div>
  );

  // ===== REAL ENCODING ENGINE =====
  // Re-encodes video via HTMLVideoElement + canvas.captureStream() + MediaRecorder
  const encodeVideoFile = useCallback((jobId: string, file: File, preset?: Preset): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      const cleanup = () => { try { URL.revokeObjectURL(objectUrl); } catch {} };

      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        // Use preset resolution if specified, otherwise source resolution
        const targetW = preset?.width || video.videoWidth || 1280;
        const targetH = preset?.height || video.videoHeight || 720;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d')!;
        const targetFps = preset?.framerate || 30;
        const stream = canvas.captureStream(targetFps);

        // Determine best available mime type
        const candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
        let mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

        // Build recorder options with bitrate from preset
        const recorderOptions: MediaRecorderOptions = { mimeType };
        if (preset?.bitrate) {
          recorderOptions.videoBitsPerSecond = preset.bitrate * 1000;
        }
        if (preset?.audioBitrate) {
          recorderOptions.audioBitsPerSecond = preset.audioBitrate * 1000;
        }

        const recorder = new MediaRecorder(stream, recorderOptions);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })); };
        recorder.onerror = () => { cleanup(); reject(new Error('MediaRecorder error during video encoding')); };

        recorder.start(100);
        video.play().catch(() => { cleanup(); reject(new Error('Browser blocked video playback')); });

        const drawFrame = () => {
          if (video.ended || video.paused) return;
          // Draw with scaling to target resolution
          ctx.drawImage(video, 0, 0, targetW, targetH);
          const pct = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
          setJobs(prev => prev.map(j => j.id === jobId
            ? { ...j, progress: Math.min(99, Math.round(pct * 10) / 10) }
            : j));
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

        video.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
      };
      video.onerror = () => { cleanup(); reject(new Error('Cannot load video — unsupported format or corrupt file')); };
    });
  }, []);

  // Re-encodes audio via AudioContext + MediaRecorder
  const encodeAudioFile = useCallback(async (jobId: string, file: File, preset?: Preset): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    return new Promise((resolve, reject) => {
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);

      // Determine best audio mime type
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      let mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';

      // Build recorder options with bitrate from preset
      const recorderOptions: MediaRecorderOptions = { mimeType };
      if (preset?.audioBitrate) {
        recorderOptions.audioBitsPerSecond = preset.audioBitrate * 1000;
      } else if (preset?.bitrate) {
        recorderOptions.audioBitsPerSecond = preset.bitrate * 1000;
      }

      const recorder = new MediaRecorder(dest.stream, recorderOptions);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => { audioCtx.close(); resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
      recorder.onerror = () => { audioCtx.close(); reject(new Error('MediaRecorder error during audio encoding')); };

      recorder.start(100);
      source.start(0);

      const totalDuration = audioBuffer.duration;
      const startTime = audioCtx.currentTime;
      const updateProgress = () => {
        const elapsed = audioCtx.currentTime - startTime;
        const pct = totalDuration > 0 ? Math.min(99, (elapsed / totalDuration) * 100) : 0;
        setJobs(prev => prev.map(j => j.id === jobId
          ? { ...j, progress: Math.round(pct * 10) / 10 }
          : j));
        if (elapsed < totalDuration) requestAnimationFrame(updateProgress);
      };
      requestAnimationFrame(updateProgress);

      source.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
    });
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
        ? { ...j, status: 'failed' as const, error: 'No source file — add a real media file to encode' }
        : j));
      activeEncodings.current.delete(jobId);
      return;
    }

    const isAudio = file.type.startsWith('audio/') || /\.(wav|mp3|aac|flac|ogg|m4a|aiff?)$/i.test(file.name);
    try {
      const outputBlob = isAudio
        ? await encodeAudioFile(jobId, file, preset)
        : await encodeVideoFile(jobId, file, preset);

      const blobUrl = URL.createObjectURL(outputBlob);
      setJobs(prev => prev.map(j => j.id === jobId ? {
        ...j, status: 'completed' as const, progress: 100,
        outputBlobUrl: blobUrl, outputSize: outputBlob.size, endTime: Date.now(),
      } : j));

      if (notifyOnComplete && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('FORGE — Encoding Complete', { body: file.name });
      }
    } catch (err: any) {
      setJobs(prev => prev.map(j => j.id === jobId ? {
        ...j, status: 'failed' as const, error: err?.message || 'Encoding failed — file may be unsupported in browser',
      } : j));
    } finally {
      activeEncodings.current.delete(jobId);
      fileMapRef.current.delete(jobId);
    }
  }, [encodeVideoFile, encodeAudioFile, notifyOnComplete, jobs, presets]);

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
      && jobs.every(j => j.status === 'completed' || j.status === 'failed')
      && activeEncodings.current.size === 0;
    if (allDone) setIsEncoding(false);
  }, [isEncoding, jobs, parallelJobs, processJob]);

  // ===== FUNCTIONS =====
  const addFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,.mov,.mp4,.avi,.mkv,.webm,.m4v,.flv,.wmv,.mpg,.mpeg,.m2ts,.mts,.mxf,.r3d,.braw,.ari,.wav,.mp3,.aac,.flac,.ogg,.m4a,.aiff,.aif';
    input.multiple = true;
    
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      
      const newJobs: Job[] = [];
      
      for (const file of Array.from(files)) {
        // Estimate duration based on file size (rough approximation)
        const isAudio = file.type.startsWith('audio/') || /\.(wav|mp3|aac|flac|ogg|m4a|aiff?)$/i.test(file.name);
        const estimatedDuration = Math.ceil(file.size / (isAudio ? 128000 : 2000000)); // Rough bytes per second
        const estimatedEncodeTime = Math.ceil(estimatedDuration * 0.3); // 30% of realtime for encoding estimate
        
        const preset = presets.find(p => p.id === selectedPreset);
        
        const newJob: Job = {
          id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          source: file.name, // In Electron, would be full path
          destination: 'Desktop/Exports/',
          preset: selectedPreset,
          format: preset?.format || 'H.264',
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
      
      setJobs(prev => [...prev, ...newJobs]);
      if (newJobs.length > 0) {
        setSelectedJobId(newJobs[0].id);
      }
    };
    
    input.click();
  }, [selectedPreset, presets]);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    if (selectedJobId === id) setSelectedJobId(null);
  }, [selectedJobId]);

  const startQueue = useCallback(() => {
    setIsEncoding(true);
  }, []);

  const pauseQueue = useCallback(() => {
    setIsEncoding(false);
  }, []);

  const addWatchFolder = useCallback(async () => {
    try {
      // Try Electron dialog first (works in Electron)
      const electron = window.electron;
      if (electron?.invoke) {
        const result = await electron.invoke('dialog:showOpenDialog', {
          properties: ['openDirectory'],
          title: 'Select Watch Folder',
        });
        if (!result.canceled && result.filePaths?.length > 0) {
          const folderPath = result.filePaths[0];
          const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
          const newFolder: WatchFolder = {
            id: `watch-${Date.now()}`,
            path: folderName,
            preset: selectedPreset,
            destination: 'Desktop/Exports/',
            active: true,
          };
          setWatchFolders(prev => [...prev, newFolder]);
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
          destination: 'Desktop/Exports/',
          active: true,
        };
        setWatchFolders(prev => [...prev, newFolder]);
        return;
      }
      alert('Watch folders require DEX desktop or a browser with File System Access API support.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Could not access folder:', err);
      }
    }
  }, [selectedPreset]);

  const addFolder = useCallback(async () => {
    try {
      // Try Electron dialog first
      const electron = window.electron;
      if (electron?.invoke) {
        const result = await electron.invoke('dialog:showOpenDialog', {
          properties: ['openDirectory'],
          title: 'Select Folder to Import',
        });
        if (!result.canceled && result.filePaths?.length > 0) {
          const folderPath = result.filePaths[0];
          const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
          // Read directory contents via IPC
          let files: string[] = [];
          try {
            files = await electron.invoke('fs:readdir', folderPath);
          } catch { /* ignore */ }
          const mediaExts = /\.(mov|mp4|avi|mkv|webm|m4v|flv|wmv|mpg|mpeg|wav|mp3|aac|flac|ogg|m4a|aiff?)$/i;
          const newJobs: Job[] = files.filter(f => mediaExts.test(f)).map(fileName => {
            const isAudioFile = /\.(wav|mp3|aac|flac|ogg|m4a|aiff?)$/i.test(fileName);
            const estimatedDuration = isAudioFile ? 180 : 300;
            const preset = presets.find(p => p.id === selectedPreset);
            return {
              id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: fileName,
              source: `${folderName}/${fileName}`,
              destination: 'Desktop/Exports/',
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
            setJobs(prev => [...prev, ...newJobs]);
          }
          return;
        }
        return; // user cancelled
      }
      // Fallback: File System Access API (for web)
      if (!('showDirectoryPicker' in window)) {
        alert('Folder import requires DEX desktop or a browser with File System Access API support.');
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
            destination: 'Desktop/Exports/',
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
      setJobs(prev => [...prev, ...newJobs]);
      if (newJobs.length > 0) setSelectedJobId(newJobs[0].id);
      else alert('No supported media files found in the selected folder.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Could not access folder:', err);
      }
    }
  }, [selectedPreset, presets]);

  // Use formatting utilities from ForgeFeatures (single source of truth)
  const formatBytes = useCallback((bytes: number) => formatFileSize(bytes), []);
  const formatDuration = useCallback((seconds: number) => forgeFormatDuration(seconds), []);

  const getStatusColor = useCallback((status: Job['status']) => {
    switch (status) {
      case 'completed': return 'var(--color-success)';
      case 'processing': return 'var(--color-accent)';
      case 'failed': return 'var(--color-error)';
      case 'paused': return '#6b7280';
      default: return '#6b7280';
    }
  }, []);

  const getStatusIcon = useCallback((status: Job['status']) => {
    switch (status) {
      case 'completed': return Icons.check;
      case 'processing': return Icons.refresh;
      case 'failed': return Icons.alert;
      case 'paused': return Icons.pause;
      default: return Icons.clock;
    }
  }, []);

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const queuedJobs = jobs.filter(j => j.status === 'queued').length;
  const processingJobs = jobs.filter(j => j.status === 'processing').length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;

  // ===== STYLES - MINIMAL =====
  const styles: Record<string, React.CSSProperties> = useMemo(() => ({
    container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)', height: '36px', minHeight: '36px' },
    logo: { fontSize: '12px', fontWeight: 600, color: 'var(--color-accent)', letterSpacing: '1px' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '6px' },
    btn: { padding: '5px 10px', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500 },
    btnPrimary: { background: 'rgba(10,132,255,0.15)', color: '#5ac8fa', border: '1px solid rgba(10,132,255,0.25)', backdropFilter: 'blur(8px)' },
    btnDanger: { background: 'rgba(255,69,58,0.15)', color: '#ff6961', border: '1px solid rgba(255,69,58,0.25)', backdropFilter: 'blur(8px)' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    sidebar: { width: '220px', background: 'var(--color-bg-inset)', borderRight: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
    tab: { flex: 1, padding: '8px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' },
    tabActive: { color: 'var(--color-accent)', borderBottom: '2px solid var(--color-accent)' },
    sidebarContent: { flex: 1, overflow: 'auto', padding: '10px' },
    mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-inset)' },
    queueHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' },
    queueStats: { display: 'flex', gap: '12px', marginLeft: 'auto' },
    stat: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-muted)' },
    queueList: { flex: 1, overflow: 'auto', padding: '10px' },
    jobItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--color-bg-hover)', borderRadius: '6px', marginBottom: '6px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    jobItemSelected: { borderColor: 'var(--color-accent)', background: 'rgba(10,132,255,0.08)' },
    jobIcon: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,132,255,0.1)', borderRadius: '6px', color: 'var(--color-accent)' },
    jobInfo: { flex: 1 },
    jobName: { fontWeight: 600, marginBottom: '2px', fontSize: '11px', color: 'var(--color-text-primary)' },
    jobMeta: { display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--color-text-muted)' },
    jobProgress: { width: '100px' },
    progressBar: { height: '3px', background: 'var(--color-border-subtle)', borderRadius: '2px', overflow: 'hidden' },
    progressFill: { height: '100%', background: 'var(--color-accent)', borderRadius: '2px' },
    jobStatus: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500 },
    jobActions: { display: 'flex', gap: '2px' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' },
    inspectorPanel: { width: '240px', background: 'var(--color-bg-inset)', borderLeft: '1px solid var(--color-border-subtle)', padding: '12px', overflow: 'auto' },
    inspectorTitle: { fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' },
    inspectorSection: { marginBottom: '12px' },
    sectionTitle: { fontSize: '10px', color: 'var(--color-accent)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px', fontWeight: 600 },
    infoRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '10px' },
    infoLabel: { color: 'var(--color-text-muted)' },
    infoValue: { color: 'var(--color-text-primary)', fontWeight: 500 },
    presetItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-bg-hover)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    presetItemSelected: { borderColor: 'var(--color-accent)', background: 'rgba(10,132,255,0.1)' },
    presetInfo: { flex: 1 },
    presetName: { fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.2px' },
    presetDesc: { fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '3px' },
    categoryHeader: { fontSize: '9px', color: 'var(--color-accent)', textTransform: 'uppercase', padding: '12px 0 8px', marginTop: '8px', letterSpacing: '0.8px', fontWeight: 700, borderTop: '1px solid var(--color-border-subtle)' },
    statusBar: { display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', background: 'linear-gradient(180deg, var(--color-bg-surface) 0%, rgba(0,0,0,0.02) 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '10px', color: 'var(--color-text-muted)', boxShadow: '0 -1px 2px rgba(0,0,0,0.05)' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.03) 100%)', borderRadius: '8px', cursor: 'pointer', fontSize: '10px', border: '1px solid var(--color-border-subtle)', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', fontWeight: 600 },
    checkbox: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'color 0.15s ease' },
    sliderRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
    sliderLabel: { width: '110px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600 },
    slider: { flex: 1, accentColor: 'var(--color-accent)' },
    sliderValue: { width: '40px', fontSize: '10px', textAlign: 'right', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 },
    select: { background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', color: 'var(--color-text-primary)', padding: '10px 12px', fontSize: '11px', cursor: 'pointer', width: '100%', fontWeight: 500, transition: 'all 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
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
          if (selectedJobId) { e.preventDefault(); removeJob(selectedJobId); }
          break;
        case 'KeyA':
          if (mod) { e.preventDefault(); if (jobs.length > 0) setSelectedJobId(jobs[0].id); }
          break;
        case 'KeyS':
          if (mod) { e.preventDefault(); if (!isEncoding) startQueue(); }
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
  }, [selectedJobId, jobs, isEncoding, addFiles, removeJob, startQueue, pauseQueue]);

  return (
    <div style={styles.container}>
      <style>{`
        /* === FORGE - PROFESSIONAL UI POLISH === */
        button { font-family: inherit; }
        button:active { transform: scale(0.98); }
        .forge-btn-primary:hover {
          background: linear-gradient(145deg, #5ac8fa 0%, var(--color-accent) 50%, #0060df 100%) !important;
          box-shadow: 0 8px 28px rgba(10,132,255,0.5) !important;
        }
        .forge-job-item:hover {
          border-color: rgba(10,132,255,0.4) !important;
          background: rgba(10,132,255,0.08) !important;
          transform: translateX(2px);
        }
        .forge-preset-item:hover {
          border-color: rgba(10,132,255,0.3) !important;
          background: rgba(10,132,255,0.06) !important;
        }
        .forge-icon-btn:hover {
          color: var(--color-accent) !important;
          background: rgba(10,132,255,0.15) !important;
        }
        ::-webkit-scrollbar { width: 7px; height: 7px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(10,132,255,0.4); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; 
          background: linear-gradient(145deg, #5ac8fa, var(--color-accent)); cursor: pointer; margin-top: -6px;
          box-shadow: 0 2px 8px rgba(10,132,255,0.4);
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(10,132,255,0.5); }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; }
        select { outline: none; cursor: pointer; transition: all 0.15s ease; }
        select:focus { border-color: rgba(10,132,255,0.6); box-shadow: 0 0 0 3px rgba(10,132,255,0.15); }
        select:hover { border-color: rgba(10,132,255,0.4); }
        .forge-tab:hover { color: rgba(10,132,255,0.8) !important; background: rgba(10,132,255,0.05) !important; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logo}>FORGE</div>
        </div>
        <div style={styles.headerCenter}>
          <button style={styles.btn} onClick={addFiles} title="Add files to encode" aria-label="Add files to encode">{Icons.plus} Add Files</button>
          <button style={styles.btn} onClick={addFolder} title="Add folder to encode" aria-label="Add folder to encode">{Icons.folderPlus} Add Folder</button>
          <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
          {isEncoding ? (
            <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={pauseQueue} title="Pause encoding queue" aria-label="Pause encoding queue">{Icons.pause} Pause</button>
          ) : (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startQueue} title="Start encoding queue" aria-label="Start encoding queue">{Icons.play} Start Queue</button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        </div>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.tabs}>
            <button style={{ ...styles.tab, ...(activeTab === 'presets' ? styles.tabActive : {}) }} onClick={() => setActiveTab('presets')} aria-label="Presets tab">
              Presets
            </button>
            {!beginnerMode && (
              <>
                <button style={{ ...styles.tab, ...(activeTab === 'watch' ? styles.tabActive : {}) }} onClick={() => setActiveTab('watch')} aria-label="Watch folders tab">
                  Watch
                </button>
                <button style={{ ...styles.tab, ...(activeTab === 'settings' ? styles.tabActive : {}) }} onClick={() => setActiveTab('settings')} aria-label="Settings tab">
                  Settings
                </button>
              </>
            )}
          </div>

          <div style={styles.sidebarContent}>
            {activeTab === 'presets' && (
              <div>
                <select style={{ ...styles.select, marginBottom: '12px' }} value={presetCategory} onChange={(e) => setPresetCategory(e.target.value)}>
                  <option value="all">All Presets</option>
                  <option value="Professional">Professional</option>
                  <option value="Modern Codecs">Modern Codecs</option>
                  <option value="Standard">Standard</option>
                  <option value="Web">Web</option>
                  <option value="Audio">Audio</option>
                  <option value="Other">Other</option>
                </select>
                
                {['Professional', 'Modern Codecs', 'Standard', 'Web', 'Audio', 'Other']
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
                            {preset.format === 'H.264' || preset.format === 'HEVC' || preset.format === 'VP9' ? Icons.video : Icons.audio}
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
                <button style={{ ...styles.btn, width: '100%', justifyContent: 'center', marginBottom: '12px' }} onClick={addWatchFolder} aria-label="Add watch folder">{Icons.folderPlus} Add Watch Folder</button>
                {watchFolders.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0' }}>
                    <div style={{ marginBottom: '8px' }}>{Icons.folder}</div>
                    <div>No watch folders configured</div>
                    <div style={{ fontSize: '10px', marginTop: '4px' }}>Add folders to automatically encode dropped files</div>
                  </div>
                ) : (
                  watchFolders.map(wf => (
                    <div key={wf.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-bg-hover)', borderRadius: '4px', marginBottom: '4px', border: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ color: wf.active ? 'var(--color-success)' : '#6b7280' }}>{Icons.folderWatch}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600 }}>{wf.path}</div>
                        <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{wf.preset} arrow-right {wf.destination}</div>
                      </div>
                      <button className="forge-icon-btn" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px' }}
                        onClick={() => setWatchFolders(prev => prev.filter(f => f.id !== wf.id))} aria-label={`Remove watch folder ${wf.path}`}>{Icons.trash}</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <div style={styles.sectionTitle}>Encoding</div>
                <div style={styles.sliderRow}>
                  <span style={styles.sliderLabel}>Parallel Jobs</span>
                  <input type="range" min="1" max="8" value={parallelJobs} onChange={(e) => setParallelJobs(Number(e.target.value))} style={styles.slider} />
                  <span style={styles.sliderValue}>{parallelJobs}</span>
                </div>
                
                <div style={styles.checkbox} onClick={() => setUseHardwareAccel(!useHardwareAccel)}>
                  <div style={{ width: '14px', height: '14px', background: useHardwareAccel ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {useHardwareAccel && Icons.check}
                  </div>
                  <span>Use Hardware Acceleration</span>
                </div>
                
                <div style={{ ...styles.sectionTitle, marginTop: '16px' }}>Completion</div>
                <div style={styles.checkbox} onClick={() => setNotifyOnComplete(!notifyOnComplete)}>
                  <div style={{ width: '14px', height: '14px', background: notifyOnComplete ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {notifyOnComplete && Icons.check}
                  </div>
                  <span>Notify on Completion</span>
                </div>
                <div style={styles.checkbox} onClick={() => setShutdownAfter(!shutdownAfter)}>
                  <div style={{ width: '14px', height: '14px', background: shutdownAfter ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {shutdownAfter && Icons.check}
                  </div>
                  <span>Shutdown After Queue Complete</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Queue Area */}
        <div style={styles.mainArea}>
          {jobs.length === 0 ? renderWelcome() : (
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
              >
                <div style={styles.jobIcon}>{Icons.video}</div>
                <div style={styles.jobInfo}>
                  <div style={styles.jobName}>{job.name}</div>
                  <div style={styles.jobMeta}>
                    <span>{job.format}</span>
                    <span>{job.preset}</span>
                    <span>{formatDuration(job.duration)}</span>
                  </div>
                </div>
                <div style={styles.jobProgress}>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${job.progress}%` }} />
                  </div>
                  <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '4px', color: 'var(--color-text-muted)' }}>{job.progress}%</div>
                </div>
                <div style={{ ...styles.jobStatus, color: getStatusColor(job.status) }}>
                  {getStatusIcon(job.status)}
                  <span>{job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
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
          <div style={styles.inspectorPanel}>
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
                  {selectedJob.status.charAt(0).toUpperCase() + selectedJob.status.slice(1)}
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
            </div>

            {!beginnerMode && selectedJob.status === 'queued' && (
              <button style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', marginTop: '16px' }} aria-label="Customize encoding settings">
                {Icons.sliders} Customize Settings
              </button>
            )}

            {selectedJob.status === 'completed' && selectedJob.outputBlobUrl && (
              <a
                href={selectedJob.outputBlobUrl}
                download={selectedJob.name.replace(/\.[^.]+$/, '') + '.webm'}
                style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', marginTop: '16px', textDecoration: 'none', textAlign: 'center', display: 'inline-flex' } as React.CSSProperties}
              >
                {Icons.download} Download Encoded File
              </a>
            )}

            {selectedJob.status === 'failed' && selectedJob.error && (
              <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(255,69,58,0.1)', borderRadius: '6px', fontSize: '10px', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {Icons.alert} {selectedJob.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{Icons.cpu} {useHardwareAccel ? 'GPU Accelerated' : 'CPU Only'}</span>
        <span>|</span>
        <span>{Icons.layers} {parallelJobs} parallel jobs</span>
        <span>|</span>
        <span>{Icons.hardDrive} {storageInfo}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: isEncoding ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{isEncoding ? 'Encoding...' : 'Ready'}</span>
      </div>
    </div>
  );
};

// Memoize entire component for multi-window performance
Forge.displayName = 'Forge';
export default memo(Forge);
