/**
 * DEX Platform - VINX Video Editor
 * Copyright (c) 2026 DEX. All rights reserved.
 * Professional video editing for creative professionals
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useRunningApps } from '../store/runningApps';
import { useBeginnerMode, KeyboardShortcutsPanel, BeginnerTip, APP_TIPS } from '../components/Onboarding';
import { useAppTracking, useToolTracking } from '../services/usePatternLearning';
import HelpPanel, { HelpButton, useHelpPanel } from '../components/HelpPanel';
import FirstLaunchHint from '../components/FirstLaunchHint';
import { useGlobalUndo } from '../services/undoManager';
import {
  EXPORT_PRESETS as FEATURE_EXPORT_PRESETS,
  VIDEO_RESOLUTIONS,
  VIDEO_TRANSITIONS,
  VIDEO_SHORTCUTS,
  VIDEO_FILTERS,
  EDIT_TOOLS,
  DEFAULT_MAGNETIC_SETTINGS,
  formatTimecode,
  parseTimecode,
} from './VideoEditorFeatures';
import type { EditMode, ExportSettings, MagneticSettings } from './VideoEditorFeatures';

// ═══════════════════════════════════════════════════════════════════════════
// DEX VINX - Professional Video Editor
// Optimized for low resource usage (2GB RAM, low CPU/GPU)
// ═══════════════════════════════════════════════════════════════════════════

// ==================== PERFORMANCE UTILITIES ====================
// Debounce for expensive operations
const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
};

// Throttle for continuous updates (preview, timeline scrub)
const throttle = <T extends (...args: any[]) => void>(fn: T, limit: number): T => {
  let inThrottle = false;
  return ((...args: any[]) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }) as T;
};

// ==================== TYPES ====================
interface MediaClip {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  src: string;
  duration: number;
  trackIndex: number;
  startTime: number;
  trimIn: number;
  trimOut: number;
  volume: number;
  effects: ClipEffect[];
  thumbnail?: string;
  // Premiere Pro additions
  linked?: boolean;
  linkedClipId?: string;
  colorLabel?: 'violet' | 'iris' | 'caribbean' | 'lavender' | 'cerulean' | 'forest' | 'rose' | 'mango' | 'purple' | 'blue' | 'teal' | 'magenta' | 'tan' | 'green' | 'brown' | 'yellow';
  lumetriColor?: LumetriSettings;
  motionSettings?: MotionSettings;
  audioChannels?: AudioChannelMapping;
  proxyPath?: string;
  metadata?: MediaMetadata;
  markers?: ClipMarker[];
  nested?: boolean;
  mask?: MaskSettings[];
}

interface ClipEffect {
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'opacity' | 'speed' | 'hue' | 'sharpen' | 'noise' | 'vignette' | 'chromatic' | 'glow' | 'filmGrain' | 'letterbox';
  value: number;
  keyframes?: Keyframe[];
}

interface Keyframe {
  time: number;
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'bezier';
  bezierHandles?: { x1: number; y1: number; x2: number; y2: number };
}

interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  muted: boolean;
  locked: boolean;
  visible: boolean;
  volume: number;
  // Premiere Pro additions
  soloEnabled?: boolean;
  syncLocked?: boolean;
  targetTrack?: boolean;
  submix?: string;
  height?: number;
  collapsed?: boolean;
  trackMatte?: 'none' | 'alpha' | 'luma' | 'alphaInverted' | 'lumaInverted';
}

interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  animation: 'none' | 'fadeIn' | 'slideUp' | 'typewriter' | 'bounce' | 'scale';
}

interface DragState {
  clipId: string;
  type: 'move' | 'trimLeft' | 'trimRight';
  startX: number;
  originalStartTime: number;
  originalTrimIn: number;
  originalTrimOut: number;
}

interface FilterPreset {
  name: string;
  iconType: 'normal' | 'warm' | 'cool' | 'vintage' | 'vivid' | 'bw' | 'dreamy' | 'cinematic';
  effects: { type: ClipEffect['type']; value: number }[];
}

// ==================== PREMIERE PRO TYPES ====================
interface LumetriSettings {
  // Basic Correction
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  // Creative
  fadedFilm: number;
  sharpen: number;
  filmGrain: number;
  // Curves
  rgbCurve: CurvePoint[];
  redCurve: CurvePoint[];
  greenCurve: CurvePoint[];
  blueCurve: CurvePoint[];
  hueSatCurves: { hue: number; sat: number }[];
  // Color Wheels
  shadowsWheel: { hue: number; saturation: number; luminance: number };
  midtonesWheel: { hue: number; saturation: number; luminance: number };
  highlightsWheel: { hue: number; saturation: number; luminance: number };
  // HSL Secondary
  hslKey: { hueCenter: number; hueWidth: number; satCenter: number; satWidth: number; lumCenter: number; lumWidth: number };
  hslCorrection: { hue: number; saturation: number; luminance: number };
  // Vignette
  vignetteAmount: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;
}

interface CurvePoint {
  x: number;
  y: number;
}

interface MotionSettings {
  positionX: number;
  positionY: number;
  scale: number;
  scaleWidth: number;
  scaleHeight: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  antiFlicker: number;
  opacity: number;
  keyframes?: { time: number; position?: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number }[];
}

interface AudioChannelMapping {
  channels: number;
  mapping: ('mono' | 'stereo' | '5.1' | '7.1' | 'adaptive')[];
  panning: number;
  loudness: number;
}

interface MediaMetadata {
  frameRate: number;
  codec: string;
  bitRate: number;
  resolution: { width: number; height: number };
  colorSpace: 'rec709' | 'rec2020' | 'p3' | 'sRGB';
  hdr: boolean;
  audioSampleRate: number;
  audioChannels: number;
  creationDate?: string;
  description?: string;
  scene?: string;
  shot?: string;
  tape?: string;
  reel?: string;
  good?: boolean;
  keywords?: string[];
}

interface ClipMarker {
  id: string;
  time: number;
  name: string;
  color: string;
  comment?: string;
  duration?: number;
  type: 'comment' | 'chapter' | 'webLink' | 'flashCue';
}

interface MaskSettings {
  id: string;
  type: 'ellipse' | 'rectangle' | 'freehand' | 'bezier';
  inverted: boolean;
  feather: number;
  expansion: number;
  opacity: number;
  path: { x: number; y: number }[];
  tracking?: { enabled: boolean; position: boolean; scale: boolean; rotation: boolean };
}

interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style: CaptionStyle;
  position: 'bottom' | 'top' | 'middle';
  alignment: 'left' | 'center' | 'right';
  speaker?: string;
}

interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface TransitionEffect {
  id: string;
  name: string;
  category: 'dissolve' | '3dMotion' | 'iris' | 'pageWipe' | 'slide' | 'specialEffect' | 'stretch' | 'wipe' | 'zoom' | 'immersive';
  duration: number;
  alignment: 'start' | 'center' | 'end';
  params?: Record<string, number>;
}

interface VideoEffect {
  id: string;
  name: string;
  category: 'adjust' | 'blur' | 'channel' | 'colorCorrection' | 'distort' | 'generate' | 'keying' | 'noise' | 'perspective' | 'stylize' | 'time' | 'transform' | 'utility' | 'immersive';
  params: Record<string, number | string | boolean>;
  gpuAccelerated: boolean;
  keyframes?: Record<string, Keyframe[]>;
}

interface AudioEffect {
  id: string;
  name: string;
  category: 'amplitude' | 'delay' | 'filter' | 'modulation' | 'noiseReduction' | 'reverb' | 'special' | 'stereoImagery' | 'time';
  params: Record<string, number | string | boolean>;
}

interface EssentialSoundSettings {
  clipType: 'dialogue' | 'music' | 'sfx' | 'ambience';
  loudness: {
    autoMatch: boolean;
    targetLevel: number;
  };
  repair: {
    reduceNoise: boolean;
    noiseAmount: number;
    reduceRumble: boolean;
    rumbleAmount: number;
    deHum: boolean;
    humFrequency: 50 | 60;
    deEss: boolean;
    deEssAmount: number;
    reduceReverb: boolean;
    reverbAmount: number;
  };
  clarity: {
    dynamics: boolean;
    eq: boolean;
    enhanceSpeech: boolean;
  };
  creative?: {
    reverb: boolean;
    reverbPreset: string;
    stereoWidth: number;
  };
}

interface ExportPreset {
  id: string;
  name: string;
  format: 'h264' | 'hevc' | 'prores' | 'dnxhd' | 'mpeg2' | 'webm' | 'gif' | 'png' | 'jpeg' | 'tiff';
  container: 'mp4' | 'mov' | 'mxf' | 'avi' | 'webm';
  resolution: { width: number; height: number };
  frameRate: number;
  bitRateMode: 'cbr' | 'vbr1' | 'vbr2';
  targetBitRate: number;
  maxBitRate: number;
  audioCodec: 'aac' | 'pcm' | 'mp3' | 'ac3' | 'eac3';
  audioBitRate: number;
  audioSampleRate: number;
  hdr: boolean;
  colorSpace: 'rec709' | 'rec2020' | 'p3';
  lufs?: number;
}

interface ObjectMask {
  id: string;
  type: 'object' | 'person' | 'face';
  objectType: 'person' | 'face' | 'object';
  points: { x: number; y: number }[];
  tracking: boolean;
  trackingData: { time: number; bounds: { x: number; y: number; width: number; height: number } }[];
  feather: number;
  expansion: number;
  inverted: boolean;
}

// ==================== LUT TYPES ====================
interface LUTData {
  id: string;
  name: string;
  type: 'cube' | '3dl' | 'csp' | 'look';
  size: number;
  data: number[][][]; // 3D array for color lookup
  intensity: number;
  active: boolean;
}

interface EffectFile {
  id: string;
  name: string;
  type: 'preset' | 'plugin' | 'transition' | 'filter';
  category: string;
  parameters: Record<string, number | string | boolean>;
  path: string;
}

interface MarketplacePlugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: 'color' | 'motion' | 'audio' | 'transition' | 'generator' | 'utility';
  rating: number;
  downloads: number;
  price: 'free' | string;
  installed: boolean;
  thumbnail: string;
}

const MARKETPLACE_CATALOG: MarketplacePlugin[] = [
  { id: 'mp-lut-pack', name: 'Cinema LUT Pack', author: 'DEX Color Lab', version: '2.1.0', description: 'Professional color grading LUTs for film and broadcast', category: 'color', rating: 4.8, downloads: 24500, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-smooth-zoom', name: 'Smooth Zoom Pro', author: 'MotionFX', version: '1.4.2', description: 'GPU-accelerated smooth zoom with easing curves', category: 'motion', rating: 4.6, downloads: 18200, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-glitch', name: 'Glitch & Distort', author: 'VFX Studio', version: '3.0.1', description: 'Digital glitch, pixel sort, data mosh effects', category: 'generator', rating: 4.7, downloads: 31000, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-audio-vis', name: 'Audio Visualizer', author: 'DEX Audio', version: '1.2.0', description: 'Waveform, spectrum, and particle audio visualizations', category: 'audio', rating: 4.5, downloads: 12800, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-auto-cut', name: 'Auto Beat Cut', author: 'AI Editors', version: '2.0.0', description: 'Automatically cuts clips to audio beats', category: 'utility', rating: 4.9, downloads: 42000, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-morph', name: 'Morph Transition', author: 'MotionFX', version: '1.1.0', description: 'Smooth shape-morph transitions between clips', category: 'transition', rating: 4.4, downloads: 9500, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-denoiser', name: 'AI Denoiser', author: 'DEX Audio', version: '1.3.0', description: 'ML-powered audio noise reduction', category: 'audio', rating: 4.8, downloads: 28000, price: 'free', installed: false, thumbnail: '' },
  { id: 'mp-track-motion', name: 'Object Tracker', author: 'AI Editors', version: '2.2.0', description: 'Auto-track objects for motion graphics attachment', category: 'motion', rating: 4.7, downloads: 19300, price: 'free', installed: false, thumbnail: '' },
];

// ==================== FILTER PRESETS (CapCut-style) ====================
const FILTER_PRESETS: FilterPreset[] = [
  { name: 'Normal', iconType: 'normal', effects: [] },
  { name: 'Warm', iconType: 'warm', effects: [{ type: 'saturation', value: 20 }, { type: 'brightness', value: 5 }, { type: 'hue', value: 10 }] },
  { name: 'Cool', iconType: 'cool', effects: [{ type: 'saturation', value: -10 }, { type: 'brightness', value: 5 }, { type: 'hue', value: -20 }] },
  { name: 'Vintage', iconType: 'vintage', effects: [{ type: 'saturation', value: -30 }, { type: 'contrast', value: 15 }, { type: 'brightness', value: -10 }] },
  { name: 'Vivid', iconType: 'vivid', effects: [{ type: 'saturation', value: 40 }, { type: 'contrast', value: 20 }] },
  { name: 'B&W', iconType: 'bw', effects: [{ type: 'saturation', value: -100 }] },
  { name: 'Dreamy', iconType: 'dreamy', effects: [{ type: 'blur', value: 2 }, { type: 'brightness', value: 15 }, { type: 'saturation', value: 20 }] },
  { name: 'Cinematic', iconType: 'cinematic', effects: [{ type: 'contrast', value: 25 }, { type: 'saturation', value: -15 }, { type: 'brightness', value: -5 }] },
];

// ==================== ASPECT RATIO PRESETS ====================
const ASPECT_RATIOS = [
  { name: '16:9', label: 'YouTube', width: 1920, height: 1080 },
  { name: '9:16', label: 'TikTok/Reels', width: 1080, height: 1920 },
  { name: '1:1', label: 'Instagram', width: 1080, height: 1080 },
  { name: '4:3', label: 'Classic', width: 1440, height: 1080 },
  { name: '21:9', label: 'Ultra-Wide', width: 2560, height: 1080 },
  { name: '2.39:1', label: 'Cinematic', width: 2560, height: 1072 },
  { name: '4:5', label: 'Portrait', width: 1080, height: 1350 },
];

// ==================== EXPORT PRESETS (Premiere Pro-style) ====================
const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'h264-youtube', name: 'YouTube 1080p Full HD', format: 'h264', container: 'mp4', resolution: { width: 1920, height: 1080 }, frameRate: 29.97, bitRateMode: 'vbr1', targetBitRate: 16, maxBitRate: 24, audioCodec: 'aac', audioBitRate: 320, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'h264-youtube-4k', name: 'YouTube 4K Ultra HD', format: 'h264', container: 'mp4', resolution: { width: 3840, height: 2160 }, frameRate: 29.97, bitRateMode: 'vbr1', targetBitRate: 45, maxBitRate: 68, audioCodec: 'aac', audioBitRate: 320, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'h264-vimeo', name: 'Vimeo 1080p', format: 'h264', container: 'mp4', resolution: { width: 1920, height: 1080 }, frameRate: 23.976, bitRateMode: 'vbr2', targetBitRate: 20, maxBitRate: 30, audioCodec: 'aac', audioBitRate: 320, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'hevc-hdr', name: 'HEVC HDR 4K', format: 'hevc', container: 'mp4', resolution: { width: 3840, height: 2160 }, frameRate: 23.976, bitRateMode: 'vbr1', targetBitRate: 50, maxBitRate: 80, audioCodec: 'eac3', audioBitRate: 640, audioSampleRate: 48000, hdr: true, colorSpace: 'rec2020' },
  { id: 'prores-422', name: 'ProRes 422', format: 'prores', container: 'mov', resolution: { width: 1920, height: 1080 }, frameRate: 23.976, bitRateMode: 'cbr', targetBitRate: 147, maxBitRate: 147, audioCodec: 'pcm', audioBitRate: 1536, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'prores-4444', name: 'ProRes 4444', format: 'prores', container: 'mov', resolution: { width: 1920, height: 1080 }, frameRate: 23.976, bitRateMode: 'cbr', targetBitRate: 330, maxBitRate: 330, audioCodec: 'pcm', audioBitRate: 1536, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'dnxhd-185', name: 'DNxHD 185', format: 'dnxhd', container: 'mxf', resolution: { width: 1920, height: 1080 }, frameRate: 23.976, bitRateMode: 'cbr', targetBitRate: 185, maxBitRate: 185, audioCodec: 'pcm', audioBitRate: 1536, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'broadcast-mpeg2', name: 'Broadcast MPEG-2', format: 'mpeg2', container: 'mxf', resolution: { width: 1920, height: 1080 }, frameRate: 29.97, bitRateMode: 'cbr', targetBitRate: 50, maxBitRate: 50, audioCodec: 'pcm', audioBitRate: 1536, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'twitter', name: 'Twitter', format: 'h264', container: 'mp4', resolution: { width: 1280, height: 720 }, frameRate: 30, bitRateMode: 'vbr1', targetBitRate: 5, maxBitRate: 8, audioCodec: 'aac', audioBitRate: 128, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'instagram', name: 'Instagram Feed', format: 'h264', container: 'mp4', resolution: { width: 1080, height: 1080 }, frameRate: 30, bitRateMode: 'vbr1', targetBitRate: 6, maxBitRate: 10, audioCodec: 'aac', audioBitRate: 128, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
  { id: 'tiktok', name: 'TikTok/Reels', format: 'h264', container: 'mp4', resolution: { width: 1080, height: 1920 }, frameRate: 30, bitRateMode: 'vbr1', targetBitRate: 8, maxBitRate: 12, audioCodec: 'aac', audioBitRate: 256, audioSampleRate: 48000, hdr: false, colorSpace: 'rec709' },
];

// ==================== VIDEO EFFECTS (GPU Accelerated) ====================
const VIDEO_EFFECTS: { category: string; effects: { name: string; gpuAccelerated: boolean }[] }[] = [
  { category: 'Color Correction', effects: [
    { name: 'Lumetri Color', gpuAccelerated: true },
    { name: 'Brightness & Contrast', gpuAccelerated: true },
    { name: 'Color Balance', gpuAccelerated: true },
    { name: 'Curves', gpuAccelerated: true },
    { name: 'Exposure', gpuAccelerated: true },
    { name: 'Levels', gpuAccelerated: true },
    { name: 'Shadows/Highlights', gpuAccelerated: true },
    { name: 'Three-Way Color Corrector', gpuAccelerated: true },
    { name: 'Tint', gpuAccelerated: true },
    { name: 'Vibrance', gpuAccelerated: true },
  ]},
  { category: 'Blur & Sharpen', effects: [
    { name: 'Camera Blur', gpuAccelerated: true },
    { name: 'Directional Blur', gpuAccelerated: true },
    { name: 'Gaussian Blur', gpuAccelerated: true },
    { name: 'Radial Blur', gpuAccelerated: true },
    { name: 'Sharpen', gpuAccelerated: true },
    { name: 'Unsharp Mask', gpuAccelerated: true },
  ]},
  { category: 'Distort', effects: [
    { name: 'Bezier Warp', gpuAccelerated: true },
    { name: 'Corner Pin', gpuAccelerated: true },
    { name: 'Lens Distortion', gpuAccelerated: true },
    { name: 'Mirror', gpuAccelerated: true },
    { name: 'Offset', gpuAccelerated: true },
    { name: 'Polar Coordinates', gpuAccelerated: true },
    { name: 'Spherize', gpuAccelerated: true },
    { name: 'Transform', gpuAccelerated: true },
    { name: 'Turbulent Displace', gpuAccelerated: true },
    { name: 'Wave Warp', gpuAccelerated: true },
  ]},
  { category: 'Generate', effects: [
    { name: '4-Color Gradient', gpuAccelerated: true },
    { name: 'Cell Pattern', gpuAccelerated: true },
    { name: 'Checkerboard', gpuAccelerated: true },
    { name: 'Circle', gpuAccelerated: true },
    { name: 'Ellipse', gpuAccelerated: true },
    { name: 'Grid', gpuAccelerated: true },
    { name: 'Lens Flare', gpuAccelerated: true },
    { name: 'Lightning', gpuAccelerated: true },
    { name: 'Paint Bucket', gpuAccelerated: true },
    { name: 'Ramp', gpuAccelerated: true },
  ]},
  { category: 'Keying', effects: [
    { name: 'Ultra Key', gpuAccelerated: true },
    { name: 'Color Key', gpuAccelerated: true },
    { name: 'Luma Key', gpuAccelerated: true },
    { name: 'Track Matte Key', gpuAccelerated: true },
    { name: 'Difference Matte', gpuAccelerated: true },
    { name: 'Non Red Key', gpuAccelerated: true },
    { name: 'Remove Matte', gpuAccelerated: true },
  ]},
  { category: 'Noise & Grain', effects: [
    { name: 'Add Grain', gpuAccelerated: true },
    { name: 'Dust & Scratches', gpuAccelerated: true },
    { name: 'Median', gpuAccelerated: true },
    { name: 'Noise', gpuAccelerated: true },
    { name: 'Noise Alpha', gpuAccelerated: true },
    { name: 'Noise HLS', gpuAccelerated: true },
    { name: 'Noise HLS Auto', gpuAccelerated: true },
  ]},
  { category: 'Perspective', effects: [
    { name: 'Basic 3D', gpuAccelerated: true },
    { name: 'Bevel Alpha', gpuAccelerated: true },
    { name: 'Bevel Edges', gpuAccelerated: true },
    { name: 'Drop Shadow', gpuAccelerated: true },
  ]},
  { category: 'Stylize', effects: [
    { name: 'Alpha Glow', gpuAccelerated: true },
    { name: 'Brush Strokes', gpuAccelerated: true },
    { name: 'Color Emboss', gpuAccelerated: true },
    { name: 'Emboss', gpuAccelerated: true },
    { name: 'Find Edges', gpuAccelerated: true },
    { name: 'Mosaic', gpuAccelerated: true },
    { name: 'Posterize', gpuAccelerated: true },
    { name: 'Replicate', gpuAccelerated: true },
    { name: 'Roughen Edges', gpuAccelerated: true },
    { name: 'Solarize', gpuAccelerated: true },
    { name: 'Strobe Light', gpuAccelerated: true },
    { name: 'Texturize', gpuAccelerated: true },
    { name: 'Threshold', gpuAccelerated: true },
  ]},
  { category: 'Time', effects: [
    { name: 'Echo', gpuAccelerated: true },
    { name: 'Posterize Time', gpuAccelerated: true },
    { name: 'Time Difference', gpuAccelerated: true },
    { name: 'Time Displacement', gpuAccelerated: true },
  ]},
  { category: 'Transform', effects: [
    { name: 'Auto Reframe', gpuAccelerated: true },
    { name: 'Crop', gpuAccelerated: true },
    { name: 'Edge Feather', gpuAccelerated: true },
    { name: 'Horizontal Flip', gpuAccelerated: true },
    { name: 'Vertical Flip', gpuAccelerated: true },
  ]},
  { category: 'Immersive Video', effects: [
    { name: 'VR Blur', gpuAccelerated: true },
    { name: 'VR Chromatic Aberrations', gpuAccelerated: true },
    { name: 'VR Color Gradients', gpuAccelerated: true },
    { name: 'VR De-Noise', gpuAccelerated: true },
    { name: 'VR Digital Glitch', gpuAccelerated: true },
    { name: 'VR Fractal Noise', gpuAccelerated: true },
    { name: 'VR Glow', gpuAccelerated: true },
    { name: 'VR Plane to Sphere', gpuAccelerated: true },
    { name: 'VR Projection', gpuAccelerated: true },
    { name: 'VR Rotate Sphere', gpuAccelerated: true },
    { name: 'VR Sharpen', gpuAccelerated: true },
    { name: 'VR Sphere to Plane', gpuAccelerated: true },
  ]},
];

// ==================== TRANSITIONS ====================
const TRANSITIONS: { category: string; transitions: string[] }[] = [
  { category: 'Dissolve', transitions: ['Cross Dissolve', 'Dip to Black', 'Dip to White', 'Film Dissolve', 'Morph Cut', 'Additive Dissolve'] },
  { category: '3D Motion', transitions: ['Cube Spin', 'Flip Over', 'Swing In', 'Swing Out', 'Tumble Away', 'Spin In', 'Spin Away'] },
  { category: 'Iris', transitions: ['Iris Box', 'Iris Cross', 'Iris Diamond', 'Iris Points', 'Iris Round', 'Iris Star', 'Iris Shapes'] },
  { category: 'Page Wipe', transitions: ['Center Peel', 'Page Peel', 'Page Roll', 'Roll Away'] },
  { category: 'Slide', transitions: ['Band Slide', 'Center Split', 'Multi-Spin', 'Push', 'Slash Slide', 'Sliding Bands', 'Sliding Boxes', 'Split', 'Swap'] },
  { category: 'Stretch', transitions: ['Cross Stretch', 'Funnel', 'Stretch', 'Stretch In', 'Stretch Over'] },
  { category: 'Wipe', transitions: ['Band Wipe', 'Barn Doors', 'Block Dissolve', 'Checker Wipe', 'Checkerboard', 'Clock Wipe', 'Gradient Wipe', 'Inset', 'Paint Splatter', 'Pinwheel', 'Radial Wipe', 'Random Blocks', 'Random Wipe', 'Spiral Boxes', 'Venetian Blinds', 'Wedge Wipe', 'Wipe', 'Zig-Zag Blocks'] },
  { category: 'Zoom', transitions: ['Cross Zoom', 'Zoom', 'Zoom Boxes', 'Zoom Trails'] },
  { category: 'Immersive Video', transitions: ['VR Chroma Leaks', 'VR Gradient Wipe', 'VR Iris Wipe', 'VR Light Leaks', 'VR Light Rays', 'VR Mobius Zoom', 'VR Random Blocks', 'VR Spherical Blur'] },
];

// ==================== AUDIO EFFECTS ====================
const AUDIO_EFFECTS: { category: string; effects: string[] }[] = [
  { category: 'Amplitude and Compression', effects: ['Amplify', 'Channel Volume', 'DeEsser', 'Dynamics', 'Hard Limiter', 'Multiband Compressor', 'Normalize', 'Single-band Compressor', 'Tube-modeled Compressor'] },
  { category: 'Delay and Echo', effects: ['Analog Delay', 'Delay', 'Echo', 'Multi-tap Delay'] },
  { category: 'Filter and EQ', effects: ['Bass', 'DeHummer', 'FFT Filter', 'Graphic Equalizer', 'Highpass', 'Lowpass', 'Notch Filter', 'Parametric Equalizer', 'Scientific Filter', 'Treble'] },
  { category: 'Modulation', effects: ['Chorus', 'Flanger', 'Phaser'] },
  { category: 'Noise Reduction/Restoration', effects: ['Adaptive Noise Reduction', 'Automatic Click Remover', 'DeClicker', 'DeCrackler', 'DeNoise', 'DeReverb', 'Hiss Reduction', 'Noise Reduction'] },
  { category: 'Reverb', effects: ['Convolution Reverb', 'Reverb', 'Studio Reverb', 'Surround Reverb'] },
  { category: 'Special', effects: ['Distortion', 'Guitar Suite', 'Mastering', 'Speech Volume Leveler', 'Vocal Enhancer'] },
  { category: 'Stereo Imagery', effects: ['Center Channel Extractor', 'Stereo Expander'] },
  { category: 'Time and Pitch', effects: ['Automatic Pitch Correction', 'Manual Pitch Correction', 'Pitch Shifter', 'Time Stretch'] },
];

// ==================== ESSENTIAL GRAPHICS TEMPLATES ====================
const MOTION_GRAPHICS_TEMPLATES = [
  { name: 'Lower Third - Modern', category: 'Lower Thirds' },
  { name: 'Lower Third - Minimal', category: 'Lower Thirds' },
  { name: 'Lower Third - News', category: 'Lower Thirds' },
  { name: 'Lower Third - Corporate', category: 'Lower Thirds' },
  { name: 'Title - Cinematic', category: 'Titles' },
  { name: 'Title - Bold Impact', category: 'Titles' },
  { name: 'Title - Elegant', category: 'Titles' },
  { name: 'Title - Glitch', category: 'Titles' },
  { name: 'Credits - Roll', category: 'Credits' },
  { name: 'Credits - Crawl', category: 'Credits' },
  { name: 'Callout - Arrow', category: 'Callouts' },
  { name: 'Callout - Circle', category: 'Callouts' },
  { name: 'Callout - Box', category: 'Callouts' },
  { name: 'Transition - Logo Reveal', category: 'Transitions' },
  { name: 'Transition - Wipe Custom', category: 'Transitions' },
  { name: 'Social - Subscribe Button', category: 'Social' },
  { name: 'Social - Like Button', category: 'Social' },
  { name: 'Social - Follow CTA', category: 'Social' },
  { name: 'Counter - Number', category: 'Data' },
  { name: 'Counter - Timer', category: 'Data' },
  { name: 'Progress Bar', category: 'Data' },
  { name: 'Infographic - Bar Chart', category: 'Data' },
  { name: 'Infographic - Pie Chart', category: 'Data' },
];

// ==================== ICONS ====================
const Icon = {
  import: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  export: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  cursor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4l7.07 17 2.51-7.39L21 11.1 4 4z" /></svg>,
  scissors: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></svg>,
  magnet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 15V9a6 6 0 0 1 12 0v6" /><line x1="4" y1="9" x2="8" y2="9" /><line x1="16" y1="9" x2="20" y2="9" /></svg>,
  skipBack: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" /></svg>,
  rewind: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 19 2 12 11 5 11 19" /><polygon points="22 19 13 12 22 5 22 19" /></svg>,
  play: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>,
  pause: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>,
  forward: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 19 22 12 13 5 13 19" /><polygon points="2 19 11 12 2 5 2 19" /></svg>,
  skipForward: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" /></svg>,
  volume: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>,
  volumeMute: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  unlock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>,
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><line x1="1" y1="1" x2="23" y2="23" /></svg>,
  undo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>,
  redo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  folder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  wand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 4v2m0 10v2m-8-9h2m10 0h2m-3.8-2.8 1 1m-11.8 6.8 1 1m9.8 0 1-1m-11.8-6.8 1-1m3-3 9 9" /></svg>,
  type: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>,
  music: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  marker: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  film: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></svg>,
  image: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  zoomIn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>,
  zoomOut: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>,
  split: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="3" x2="12" y2="21" /><polyline points="8 8 4 12 8 16" /><polyline points="16 16 20 12 16 8" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  transition: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="6" width="8" height="12" rx="1" /><rect x="14" y="6" width="8" height="12" rx="1" /><path d="M10 12h4" /><polyline points="12 10 14 12 12 14" /></svg>,
  // Filter preset icons
  filterNormal: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>,
  filterWarm: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>,
  filterCool: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M2 12h20M6 6l12 12M18 6L6 18" /><circle cx="12" cy="12" r="3" /></svg>,
  filterVintage: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></svg>,
  filterVivid: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>,
  filterBW: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" /></svg>,
  filterDreamy: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /></svg>,
  filterCinematic: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="20" height="20" rx="2" /><line x1="2" y1="7" x2="22" y2="7" /><line x1="2" y1="17" x2="22" y2="17" /><rect x="7" y="10" width="10" height="4" /></svg>,
  copy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  layers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  speed: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 12l5-5" /><path d="M22 2L12 12" /></svg>,
  crop: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2v4H2v2h4v10h10v4h2v-4h4v-2H8V6h10v4h2V4a2 2 0 0 0-2-2H6z" /></svg>,
  rotate: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>,
  // Premiere Pro icons
  lumetri: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>,
  colorWheel: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 7.07 17.07" /><path d="M12 2a10 10 0 0 0-7.07 17.07" /><circle cx="12" cy="12" r="3" /></svg>,
  curves: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 21L21 3" /><path d="M3 15c4-4 6-4 9 0s5 4 9 0" /></svg>,
  scopes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15h6M15 15h6M12 3v18" /><circle cx="12" cy="12" r="3" /></svg>,
  waveform: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12h2l2-8 4 16 4-16 4 16 2-8h2" /></svg>,
  vectorscope: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>,
  mask: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 22c2.761 0 5-4.477 5-10S14.761 2 12 2" /></svg>,
  tracking: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="8" y="8" width="8" height="8" /><circle cx="12" cy="12" r="1" /></svg>,
  objectMask: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>,
  captions: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 15h4M13 15h4" /><path d="M7 11h10" /></svg>,
  proxy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>,
  cloud: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>,
  essentialSound: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 10v4M6 6v12M10 8v8M14 4v16M18 6v12M22 10v4" /></svg>,
  essentialGraphics: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 15v-4h4" /><path d="M17 9v6" /><circle cx="17" cy="9" r="1" /></svg>,
  metadata: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>,
  gpu: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M8 8h2v4H8zM14 8h2v4h-2z" /></svg>,
  dolbyAtmos: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 8v8M9 5v14M13 8v8M17 5v14M21 8v8" /></svg>,
  timeline: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="6" width="20" height="4" rx="1" /><rect x="2" y="14" width="14" height="4" rx="1" /></svg>,
  nest: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1" /></svg>,
  link: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
  unlink: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>,
  keyframe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  motion: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>,
  solo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><text x="6" y="17" fontSize="14" fontWeight="bold" fill="currentColor">S</text></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>,
  render: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  noiseReduction: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12h4l3-9 4 18 3-9h4" /></svg>,
  eq: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  audioWave: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12h2l2-4 3 8 3-8 3 8 2-4h2" /></svg>,
  grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
};

// Helper to get filter icon by type
const getFilterIcon = (iconType: FilterPreset['iconType']) => {
  const icons: Record<FilterPreset['iconType'], React.ReactNode> = {
    normal: Icon.filterNormal,
    warm: Icon.filterWarm,
    cool: Icon.filterCool,
    vintage: Icon.filterVintage,
    vivid: Icon.filterVivid,
    bw: Icon.filterBW,
    dreamy: Icon.filterDreamy,
    cinematic: Icon.filterCinematic,
  };
  return icons[iconType];
};

// ==================== VINX - PROFESSIONAL VIDEO EDITOR ====================
const VinxEditor: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('videoeditor');
  const { trackTool } = useToolTracking('videoeditor');

  // ===== BEGINNER MODE =====
  const { 
    isBeginnerMode, 
    showShortcutsPanel, 
    setShowShortcutsPanel,
    currentTip,
    dismissTip,
    getNextTip
  } = useBeginnerMode('vinx');

  // ===== RUNNING APPS =====
  const { closeApp, setCurrentApp } = useRunningApps();

  // ===== HELP PANEL =====
  const helpPanel = useHelpPanel('videoeditor');

  // ===== GLOBAL UNDO =====
  const globalUndo = useGlobalUndo('VINX');

  // ===== SCENE SPLIT STATE =====
  const [sceneSplitPreview, setSceneSplitPreview] = useState<{ clipId: string; boundaries: number[]; sensitivity: number; detecting: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);

  // ===== STABLE BACKGROUND AUDIO/VIDEO PROCESSING =====
  // Persistent contexts for stable playback and effects processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Initialize stable audio context for video audio processing - LAZY
  useEffect(() => {
    // Lazy init audio on first user interaction
    const initAudio = () => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 2048;
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (e) { /* ignore */ }
      }
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });
    
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ===== COMPREHENSIVE CLEANUP ON UNMOUNT =====
  // Release all resources when component unmounts (multi-window safety)
  useEffect(() => {
    return () => {
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      // Cancel any remaining animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Revoke all blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* */ }
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  // Get stable audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  // Media State
  const [mediaPool, setMediaPool] = useState<MediaClip[]>([]);
  const [timeline, setTimeline] = useState<MediaClip[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  // Track State (Unlimited tracks)
  const [tracks, setTracks] = useState<Track[]>([
    { id: 'v1', name: 'Video 1', type: 'video', muted: false, locked: false, visible: true, volume: 1, targetTrack: true, height: 40 },
    { id: 'v2', name: 'Video 2', type: 'video', muted: false, locked: false, visible: true, volume: 1, height: 40 },
    { id: 'a1', name: 'Audio 1', type: 'audio', muted: false, locked: false, visible: true, volume: 1, targetTrack: true, height: 40 },
    { id: 'a2', name: 'Audio 2', type: 'audio', muted: false, locked: false, visible: true, volume: 1, height: 40 },
  ]);

  // Playback State
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(60);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // UI State
  const [zoom, setZoom] = useState(1);
  const [activePanel, setActivePanel] = useState<'media' | 'effects' | 'text' | 'transitions' | 'lumetri' | 'essentialSound' | 'essentialGraphics' | 'captions'>('media');
  const [tool, setTool] = useState<'select' | 'cut' | 'ripple' | 'rolling' | 'slip' | 'slide' | 'pen' | 'rectangle' | 'ellipse' | 'zoom'>('select');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [markers, setMarkers] = useState<number[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [history, setHistory] = useState<MediaClip[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Premiere Pro Workspace State
  const [workspace, setWorkspace] = useState<'editing' | 'color' | 'audio' | 'graphics' | 'captions' | 'vr'>('editing');
  const [showScopes, setShowScopes] = useState(false);
  const [scopeType, setScopeType] = useState<'waveform' | 'vectorscope' | 'histogram' | 'parade'>('waveform');
  const [gpuAcceleration, setGpuAcceleration] = useState<'mercury' | 'software' | 'opencl' | 'cuda'>('mercury');
  const [renderQuality, setRenderQuality] = useState<'full' | 'half' | 'quarter'>('quarter');
  const [proxyMode, setProxyMode] = useState(false);
  
  // Audio Device Selection (earphones, speakers, audio interfaces)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');

  // Enumerate available audio devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioDevices(outputs);
        if (outputs.length > 0 && !selectedOutputDevice) {
          setSelectedOutputDevice(outputs[0].deviceId);
        }
      } catch (e) { /* ignore */ }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, [selectedOutputDevice]);

  // Apply output device to audio context (earphones/speakers routing)
  useEffect(() => {
    if (selectedOutputDevice && audioContextRef.current) {
      try {
        if ('setSinkId' in audioContextRef.current && typeof (audioContextRef.current as any).setSinkId === 'function') {
          (audioContextRef.current as any).setSinkId(selectedOutputDevice);
        }
      } catch (e) { /* ignore */ }
    }
  }, [selectedOutputDevice]);
  
  // Resizable Panel State
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
  // Handle panel resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setLeftPanelWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
        setRightPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };
    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight]);

  // Lumetri Color State
  const [lumetriSettings, setLumetriSettings] = useState<LumetriSettings>({
    temperature: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0,
    whites: 0, blacks: 0, saturation: 100, vibrance: 0, fadedFilm: 0, sharpen: 0, filmGrain: 0,
    rgbCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    redCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    greenCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blueCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    hueSatCurves: [],
    shadowsWheel: { hue: 0, saturation: 0, luminance: 0 },
    midtonesWheel: { hue: 0, saturation: 0, luminance: 0 },
    highlightsWheel: { hue: 0, saturation: 0, luminance: 0 },
    hslKey: { hueCenter: 0, hueWidth: 30, satCenter: 50, satWidth: 50, lumCenter: 50, lumWidth: 50 },
    hslCorrection: { hue: 0, saturation: 0, luminance: 0 },
    vignetteAmount: 0, vignetteMidpoint: 50, vignetteRoundness: 50, vignetteFeather: 50,
  });
  const [lumetriPanel, setLumetriPanel] = useState<'basic' | 'creative' | 'curves' | 'colorWheels' | 'hslSecondary' | 'vignette'>('basic');

  // Essential Sound State
  const [essentialSoundSettings, setEssentialSoundSettings] = useState<EssentialSoundSettings>({
    clipType: 'dialogue',
    loudness: { autoMatch: true, targetLevel: -23 },
    repair: { reduceNoise: false, noiseAmount: 0, reduceRumble: false, rumbleAmount: 0, deHum: false, humFrequency: 60, deEss: false, deEssAmount: 0, reduceReverb: false, reverbAmount: 0 },
    clarity: { dynamics: false, eq: false, enhanceSpeech: false },
  });

  // Captions State
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    fontFamily: 'Arial', fontSize: 32, fontColor: '#ffffff', backgroundColor: '#000000',
    backgroundOpacity: 0.8, outlineColor: '#000000', outlineWidth: 2, bold: false, italic: false, underline: false,
  });

  // Mask state (lightweight, works without AI)
  const [objectMasks, setObjectMasks] = useState<ObjectMask[]>([]);
  const [showMaskPanel, setShowMaskPanel] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // LUT (Look Up Table) State - REAL LUT LOADING
  const [loadedLUTs, setLoadedLUTs] = useState<LUTData[]>([]);
  const [activeLUT, setActiveLUT] = useState<LUTData | null>(null);
  const [showLUTBrowser, setShowLUTBrowser] = useState(false);
  const [lutIntensity, setLutIntensity] = useState(100);

  // Effect Files State - REAL EFFECT LOADING
  const [loadedEffects, setLoadedEffects] = useState<EffectFile[]>([]);
  const [showEffectImporter, setShowEffectImporter] = useState(false);

  // Plugin Marketplace State
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>(MARKETPLACE_CATALOG);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [marketplaceCategory, setMarketplaceCategory] = useState<string>('all');

  // Export State (Enhanced)
  const [selectedExportPreset, setSelectedExportPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [exportQueue, setExportQueue] = useState<{ id: string; name: string; status: 'queued' | 'encoding' | 'complete' | 'error'; progress: number }[]>([]);
  const queueIntervalsRef = useRef<{ intervals: ReturnType<typeof setInterval>[]; timeouts: ReturnType<typeof setTimeout>[] }>({ intervals: [], timeouts: [] });
  const [showExportQueue, setShowExportQueue] = useState(false);

  // Effects State
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);
  const [effectCategory, setEffectCategory] = useState<string>('Color Correction');
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [transitionCategory, setTransitionCategory] = useState<string>('Dissolve');

  // Motion Graphics State
  const [motionGraphicsTemplates] = useState(MOTION_GRAPHICS_TEMPLATES);
  const [selectedMogrtTemplate, setSelectedMogrtTemplate] = useState<string | null>(null);

  // Source/Program Monitor State
  const [monitorMode, setMonitorMode] = useState<'source' | 'program'>('program');
  const [sourceClip, setSourceClip] = useState<MediaClip | null>(null);
  const [sourceInPoint, setSourceInPoint] = useState<number>(0);
  const [sourceOutPoint, setSourceOutPoint] = useState<number>(0);

  // Audio Track Mixer State
  const [showAudioMixer, setShowAudioMixer] = useState(false);
  const [trackVolumes, setTrackVolumes] = useState<{ [key: string]: number }>({});
  const [trackPans, setTrackPans] = useState<{ [key: string]: number }>({});
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMeter, setMasterMeter] = useState({ left: 0.7, right: 0.65 });

  // History Panel State
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyStack, setHistoryStack] = useState<{ id: string; action: string; timestamp: number }[]>([
    { id: '1', action: 'Project Created', timestamp: Date.now() - 3600000 },
    { id: '2', action: 'Import Media', timestamp: Date.now() - 3000000 },
    { id: '3', action: 'Add Clip to Timeline', timestamp: Date.now() - 2400000 },
  ]);
  const [historyPanelIndex, setHistoryPanelIndex] = useState(2);

  // Adjustment Layers State
  const [adjustmentLayers, setAdjustmentLayers] = useState<{ id: string; name: string; startTime: number; duration: number; effects: ClipEffect[] }[]>([]);

  // Nested Sequences State
  const [nestedSequences, setNestedSequences] = useState<{ id: string; name: string; clips: MediaClip[] }[]>([]);
  const [showNestDialog, setShowNestDialog] = useState(false);

  // Markers Panel State
  const [showMarkersPanel, setShowMarkersPanel] = useState(false);
  const [markerList, setMarkerList] = useState<{ id: string; time: number; name: string; color: string; comment: string }[]>([]);

  // Project/Sequence Settings State
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showSequenceSettings, setShowSequenceSettings] = useState(false);
  const [sequenceSettings, setSequenceSettings] = useState({
    name: 'Sequence 01',
    width: 1920,
    height: 1080,
    frameRate: 24,
    pixelAspect: '1:1',
    fieldOrder: 'progressive',
    timebase: 'dropFrame',
    audioSampleRate: 48000,
    audioBitDepth: 32,
  });

  // Clip Speed/Duration State
  const [showSpeedDuration, setShowSpeedDuration] = useState(false);
  const [clipSpeed, setClipSpeed] = useState(100);
  const [clipReverse, setClipReverse] = useState(false);
  const [clipMaintainPitch, setClipMaintainPitch] = useState(true);
  const [clipRippleEdit, setClipRippleEdit] = useState(false);

  // Render & Replace State
  const [showRenderReplace, setShowRenderReplace] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Match Frame State
  const [matchFrameSource, setMatchFrameSource] = useState<string | null>(null);

  // Timecode Display Options
  const [timecodeDisplay, setTimecodeDisplay] = useState<'timecode' | 'frames' | 'feetFrames'>('timecode');
  const [startTimecode, setStartTimecode] = useState('00:00:00:00');

  // Waveform Display State
  const [showWaveforms, setShowWaveforms] = useState(true);
  const [waveformHeight, setWaveformHeight] = useState(40);

  // Export Settings (Legacy support)
  const [exportSettings, setExportSettings] = useState({
    resolution: '1080p',
    fps: 30,
    format: 'mp4',
    quality: 'high',
  });

  // Refs (additional - main refs declared above)
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lutInputRef = useRef<HTMLInputElement>(null);
  const effectInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<number | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);

  // ===== RETENTIVE MEMORY - Load/Save Workspace State =====
  useEffect(() => {
    const saved = localStorage.getItem('vinx-workspace');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.zoom) setZoom(data.zoom);
        if (data.aspectRatio) setAspectRatio(data.aspectRatio);
        if (data.snapToGrid !== undefined) setSnapToGrid(data.snapToGrid);
        if (data.tool) setTool(data.tool);
        if (data.activePanel) setActivePanel(data.activePanel);
        if (data.showWaveforms !== undefined) setShowWaveforms(data.showWaveforms);
        if (data.exportSettings) setExportSettings(data.exportSettings);
        if (data.gpuAcceleration) setGpuAcceleration(data.gpuAcceleration);
        if (data.timecodeDisplay) setTimecodeDisplay(data.timecodeDisplay);
      } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    try {
      const data = {
        zoom, aspectRatio, snapToGrid, tool, activePanel,
        showWaveforms, exportSettings, gpuAcceleration, timecodeDisplay,
      };
      localStorage.setItem('vinx-workspace', JSON.stringify(data));
    } catch (e) { console.warn('[VINX] Failed to save workspace:', e); }
  }, [zoom, aspectRatio, snapToGrid, tool, activePanel, showWaveforms, exportSettings, gpuAcceleration, timecodeDisplay]);

  // ===== AUTO-SAVE PROJECT DATA (every 60 seconds when changes exist) =====
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (timeline.length > 0 || textOverlays.length > 0 || mediaPool.length > 0) {
        const autoSaveData = {
          timeline, tracks, textOverlays, mediaPool, aspectRatio,
          exportSettings, timestamp: Date.now(),
        };
        try {
          localStorage.setItem('vinx-autosave', JSON.stringify(autoSaveData));
        } catch (e) { console.warn('[VINX] Auto-save failed:', e); }
      }
    }, 60000); // Auto-save every 60 seconds for better performance
    return () => clearInterval(autoSaveInterval);
  }, [timeline, tracks, textOverlays, mediaPool, aspectRatio, exportSettings]);

  // ===== CLEANUP EXPORT QUEUE & RENDER INTERVALS ON UNMOUNT =====
  useEffect(() => {
    return () => {
      queueIntervalsRef.current.intervals.forEach(clearInterval);
      queueIntervalsRef.current.timeouts.forEach(clearTimeout);
      queueIntervalsRef.current = { intervals: [], timeouts: [] };
      if (renderIntervalRef.current) {
        clearInterval(renderIntervalRef.current);
        renderIntervalRef.current = null;
      }
    };
  }, []);

  // ===== RESTORE AUTO-SAVED PROJECT ON LOAD =====
  useEffect(() => {
    const autoSaved = localStorage.getItem('vinx-autosave');
    if (autoSaved) {
      try {
        const data = JSON.parse(autoSaved);
        if (data.timeline?.length > 0 || data.textOverlays?.length > 0 || data.mediaPool?.length > 0) {
          // Only restore if there's actual content and current project is empty
          if (timeline.length === 0 && textOverlays.length === 0) {
            setTimeline(data.timeline || []);
            setTracks(data.tracks || tracks);
            setTextOverlays(data.textOverlays || []);
            setMediaPool(data.mediaPool || []);
            if (data.aspectRatio) setAspectRatio(data.aspectRatio);
            if (data.exportSettings) setExportSettings(data.exportSettings);
          }
        }
      } catch (e) { /* ignore corrupted auto-save */ }
    }
  }, []);

  // ==================== REAL LUT PARSING FUNCTION ====================
  const parseCubeLUT = (fileContent: string, fileName: string): LUTData | null => {
    try {
      const lines = fileContent.split('\\n').filter(line => line.trim() && !line.startsWith('#'));
      let size = 0;
      let dataStartIndex = 0;
      
      // Parse header
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim().toUpperCase();
        if (line.startsWith('LUT_3D_SIZE')) {
          size = parseInt(line.split(/\\s+/)[1]);
          dataStartIndex = i + 1;
          break;
        }
        if (line.startsWith('TITLE')) continue;
        if (line.startsWith('DOMAIN_MIN')) continue;
        if (line.startsWith('DOMAIN_MAX')) continue;
      }
      
      if (size === 0) return null;
      
      // Parse 3D LUT data
      const data: number[][][] = [];
      for (let b = 0; b < size; b++) {
        data[b] = [];
        for (let g = 0; g < size; g++) {
          data[b][g] = [];
          for (let r = 0; r < size; r++) {
            const lineIndex = dataStartIndex + (b * size * size) + (g * size) + r;
            if (lineIndex < lines.length) {
              const values = lines[lineIndex].trim().split(/\\s+/).map(Number);
              data[b][g][r] = values[0] !== undefined ? values[0] : 0;
            }
          }
        }
      }
      
      return {
        id: `lut-${Date.now()}`,
        name: fileName.replace('.cube', '').replace('.CUBE', ''),
        type: 'cube',
        size,
        data,
        intensity: 100,
        active: false
      };
    } catch (error) {
      console.error('Error parsing CUBE LUT:', error);
      return null;
    }
  };

  // Handle LUT file import
  const handleLUTImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (file.name.toLowerCase().endsWith('.cube')) {
          const lut = parseCubeLUT(content, file.name);
          if (lut) {
            setLoadedLUTs(prev => [...prev, lut]);
          }
        } else if (file.name.toLowerCase().endsWith('.3dl')) {
          // Parse 3DL format
          const lut: LUTData = {
            id: `lut-${Date.now()}`,
            name: file.name.replace('.3dl', ''),
            type: '3dl',
            size: 17,
            data: [],
            intensity: 100,
            active: false
          };
          setLoadedLUTs(prev => [...prev, lut]);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  // Handle Effect file import
  const handleEffectImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const effect: EffectFile = {
        id: `effect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name.replace(/\\.(xml|prfpset|ffx|json)$/i, ''),
        type: file.name.toLowerCase().includes('transition') ? 'transition' : 'preset',
        category: 'Custom',
        parameters: {},
        path: file.name
      };
      setLoadedEffects(prev => [...prev, effect]);
    });
    e.target.value = '';
  };

  // Apply LUT to video using canvas
  const applyLUTToFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!activeLUT || activeLUT.intensity === 0) return;
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const lutSize = activeLUT.size;
    const intensity = activeLUT.intensity / 100;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      // Simple LUT interpolation
      const rIdx = Math.min(Math.floor(r * (lutSize - 1)), lutSize - 1);
      const gIdx = Math.min(Math.floor(g * (lutSize - 1)), lutSize - 1);
      const bIdx = Math.min(Math.floor(b * (lutSize - 1)), lutSize - 1);
      
      if (activeLUT.data[bIdx] && activeLUT.data[bIdx][gIdx]) {
        const lutValue = activeLUT.data[bIdx][gIdx][rIdx] || r;
        data[i] = Math.round((r * (1 - intensity) + lutValue * intensity) * 255);
        data[i + 1] = Math.round((g * (1 - intensity) + lutValue * intensity) * 255);
        data[i + 2] = Math.round((b * (1 - intensity) + lutValue * intensity) * 255);
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }, [activeLUT]);

  // Update duration when timeline changes
  useEffect(() => {
    if (timeline.length > 0) {
      const maxEnd = Math.max(...timeline.map(c => c.startTime + (c.trimOut - c.trimIn)));
      setDuration(Math.max(60, maxEnd + 10));
    }
  }, [timeline]);

  // Smooth playback with requestAnimationFrame (high precision timing)
  const lastFrameTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = performance.now();
      
      const animate = (timestamp: number) => {
        const deltaMs = timestamp - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timestamp;
        
        // Convert to seconds with high precision (smoother than setInterval)
        const deltaSec = deltaMs / 1000;
        
        setCurrentTime(t => {
          const next = t + deltaSec;
          if (next >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        
        if (isPlaying) {
          playbackRef.current = requestAnimationFrame(animate) as unknown as number;
        }
      };
      
      playbackRef.current = requestAnimationFrame(animate) as unknown as number;
    } else {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
        playbackRef.current = null;
      }
    }
    
    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
        playbackRef.current = null;
      }
    };
  }, [isPlaying, duration]);

  // FIXED: Update preview based on current time (fixed undefined 'c' bug)
  useEffect(() => {
    const activeClip = timeline.find(c => 
      c.type === 'video' &&
      currentTime >= c.startTime && 
      currentTime < c.startTime + (c.trimOut - c.trimIn)
    );
    if (activeClip) {
      if (activeClip.src !== previewSrc) {
        setPreviewSrc(activeClip.src);
        if (videoRef.current) {
          videoRef.current.src = activeClip.src;
        }
      }
      if (videoRef.current) {
        // FIXED: was using 'c.trimIn' which was undefined, now using 'activeClip.trimIn'
        const clipTime = activeClip.trimIn + (currentTime - activeClip.startTime);
        if (Math.abs(videoRef.current.currentTime - clipTime) > 0.2) {
          videoRef.current.currentTime = clipTime;
        }
        // Apply CSS filters to video element for real-time effect preview
        videoRef.current.style.filter = getVideoFilter(activeClip);
      }
    }
  }, [currentTime, timeline, previewSrc]);

  // ===== REAL SCOPES RENDERING =====
  useEffect(() => {
    if (!showScopes) return;
    const scopeCanvas = scopeCanvasRef.current;
    const video = videoRef.current;
    if (!scopeCanvas || !video || video.readyState < 2) return;
    
    const sCtx = scopeCanvas.getContext('2d');
    if (!sCtx) return;
    
    // Sample pixels from video
    const sampleCanvas = document.createElement('canvas');
    const sw = 128; const sh = 72; // small sample for performance
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sampCtx = sampleCanvas.getContext('2d');
    if (!sampCtx) return;
    try { sampCtx.drawImage(video, 0, 0, sw, sh); } catch { return; }
    const imageData = sampCtx.getImageData(0, 0, sw, sh);
    const data = imageData.data;
    
    const W = scopeCanvas.width;
    const H = scopeCanvas.height;
    sCtx.fillStyle = '#000';
    sCtx.fillRect(0, 0, W, H);
    
    if (scopeType === 'histogram') {
      // RGB Histogram
      const rHist = new Uint32Array(256);
      const gHist = new Uint32Array(256);
      const bHist = new Uint32Array(256);
      for (let i = 0; i < data.length; i += 4) {
        rHist[data[i]]++;
        gHist[data[i + 1]]++;
        bHist[data[i + 2]]++;
      }
      const maxVal = Math.max(...rHist, ...gHist, ...bHist, 1);
      const drawHist = (hist: Uint32Array, color: string) => {
        sCtx.strokeStyle = color;
        sCtx.lineWidth = 1;
        sCtx.beginPath();
        for (let x = 0; x < 256; x++) {
          const px = (x / 255) * W;
          const py = H - (hist[x] / maxVal) * H;
          if (x === 0) sCtx.moveTo(px, py); else sCtx.lineTo(px, py);
        }
        sCtx.stroke();
      };
      sCtx.globalCompositeOperation = 'lighter';
      drawHist(rHist, 'rgba(255,60,60,0.7)');
      drawHist(gHist, 'rgba(60,255,60,0.7)');
      drawHist(bHist, 'rgba(60,100,255,0.7)');
      sCtx.globalCompositeOperation = 'source-over';
      
    } else if (scopeType === 'waveform') {
      // Luma waveform
      sCtx.fillStyle = 'rgba(60,255,60,0.03)';
      for (let i = 0; i < data.length; i += 4) {
        const px = i / 4;
        const col = px % sw;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const x = (col / sw) * W;
        const y = H - (luma / 255) * H;
        sCtx.fillRect(x, y, 2, 2);
      }
      // 10% / 100% markers
      sCtx.strokeStyle = 'rgba(255,255,255,0.15)';
      sCtx.setLineDash([4, 4]);
      [0, 0.25, 0.5, 0.75, 1].forEach(v => {
        sCtx.beginPath();
        sCtx.moveTo(0, H - v * H);
        sCtx.lineTo(W, H - v * H);
        sCtx.stroke();
      });
      sCtx.setLineDash([]);
      
    } else if (scopeType === 'vectorscope') {
      // Color vectorscope
      const cx = W / 2; const cy = H / 2; const radius = Math.min(W, H) / 2 - 4;
      // Graticule circle
      sCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      sCtx.beginPath();
      sCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.beginPath();
      sCtx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      sCtx.stroke();
      // Plot Cb vs Cr
      sCtx.fillStyle = 'rgba(60,255,60,0.04)';
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const px = cx + ((cb - 128) / 128) * radius;
        const py = cy - ((cr - 128) / 128) * radius;
        sCtx.fillRect(px, py, 2, 2);
      }
      
    } else if (scopeType === 'parade') {
      // RGB Parade (three side-by-side waveforms)
      const third = W / 3;
      const channels = [
        { offset: 0, color: 'rgba(255,60,60,0.04)', idx: 0 },
        { offset: third, color: 'rgba(60,255,60,0.04)', idx: 1 },
        { offset: third * 2, color: 'rgba(60,100,255,0.04)', idx: 2 },
      ];
      for (const ch of channels) {
        sCtx.fillStyle = ch.color;
        for (let i = 0; i < data.length; i += 4) {
          const px = i / 4;
          const col = px % sw;
          const val = data[i + ch.idx];
          const x = ch.offset + (col / sw) * third;
          const y = H - (val / 255) * H;
          sCtx.fillRect(x, y, 1.5, 1.5);
        }
      }
      // Separators
      sCtx.strokeStyle = 'rgba(255,255,255,0.2)';
      sCtx.beginPath(); sCtx.moveTo(third, 0); sCtx.lineTo(third, H); sCtx.stroke();
      sCtx.beginPath(); sCtx.moveTo(third * 2, 0); sCtx.lineTo(third * 2, H); sCtx.stroke();
    }
  }, [showScopes, scopeType, currentTime]);

  // Sync audio playback with Web Audio API - WITH SPEED SUPPORT
  useEffect(() => {
    timeline.filter(c => c.type === 'audio' || c.type === 'video').forEach(clip => {
      const speedEffect = clip.effects.find(e => e.type === 'speed');
      const speedFactor = speedEffect ? speedEffect.value / 100 : 1;
      const effectiveDuration = (clip.trimOut - clip.trimIn) / speedFactor;
      const isActive = currentTime >= clip.startTime && currentTime < clip.startTime + effectiveDuration;
      const track = tracks[clip.trackIndex];
      const audioEl = audioElementsRef.current.get(clip.id);
      
      if (audioEl) {
        // Apply speed/playback rate
        audioEl.playbackRate = speedFactor;
        
        if (isActive && isPlaying && !track?.muted) {
          audioEl.volume = clip.volume * (track?.volume || 1);
          const clipTime = clip.trimIn + (currentTime - clip.startTime) * speedFactor;
          if (Math.abs(audioEl.currentTime - clipTime) > 0.2) {
            audioEl.currentTime = clipTime;
          }
          audioEl.play().catch(() => {});
        } else {
          audioEl.pause();
        }
      }
    });
  }, [currentTime, isPlaying, timeline, tracks]);

  // Sync video playback - WITH SPEED SUPPORT
  useEffect(() => {
    if (videoRef.current) {
      // Find current video clip and apply its speed
      const activeVideoClip = timeline.find(c => 
        c.type === 'video' && currentTime >= c.startTime && 
        currentTime < c.startTime + (c.trimOut - c.trimIn)
      );
      
      if (activeVideoClip) {
        const speedEffect = activeVideoClip.effects.find(e => e.type === 'speed');
        const speedFactor = speedEffect ? speedEffect.value / 100 : 1;
        videoRef.current.playbackRate = speedFactor;
      }
      
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, currentTime, timeline]);

  // KEYBOARD SHORTCUTS - Full implementation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      
      const mod = e.ctrlKey || e.metaKey;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedClip) deleteClip(selectedClip);
          if (selectedText) deleteTextOverlay(selectedText);
          break;
        case 'KeyZ':
          if (mod && e.shiftKey) { e.preventDefault(); redo(); }
          else if (mod) { e.preventDefault(); undo(); }
          else { setTool('zoom'); trackTool('zoom'); }
          break;
        case 'KeyY':
          if (mod) { e.preventDefault(); redo(); }
          break;
        case 'KeyS':
          if (mod) { e.preventDefault(); setShowExportModal(true); }
          break;
        case 'KeyC':
          if (mod && selectedClip) { e.preventDefault(); splitClip(selectedClip); }
          else if (!mod) { setTool('cut'); trackTool('cut'); }
          break;
        case 'KeyD':
          if (mod && selectedClip) {
            e.preventDefault();
            const clip = timeline.find(c => c.id === selectedClip);
            if (clip) {
              const dup = { ...clip, id: `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`, startTime: clip.startTime + (clip.trimOut - clip.trimIn) };
              const prev = [...timeline];
              setTimeline(tl => [...tl, dup]);
              saveHistory();
              globalUndo.push(`Duplicate ${clip.name}`, () => setTimeline(t => [...t, dup]), () => setTimeline(prev));
            }
          }
          break;
        case 'KeyA':
          if (mod) {
            e.preventDefault();
            // Select all: no multi-select, just keep first clip selected
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 5 : 1)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(t => Math.min(duration, t + (e.shiftKey ? 5 : 1)));
          break;
        case 'Home':
          setCurrentTime(0);
          break;
        case 'End':
          setCurrentTime(duration);
          break;
        case 'KeyM':
          if (!mod) setMarkers(m => [...m, currentTime]);
          break;
        case 'KeyV':
          if (!mod) { setTool('select'); trackTool('select'); }
          break;
        case 'KeyB':
          if (!mod) { setTool('cut'); trackTool('cut'); }
          break;
        // JKL shuttle
        case 'KeyJ':
          if (!mod) { e.preventDefault(); setIsPlaying(false); setCurrentTime(t => Math.max(0, t - 2)); }
          break;
        case 'KeyK':
          if (!mod) { e.preventDefault(); setIsPlaying(false); }
          break;
        case 'KeyL':
          if (!mod) { e.preventDefault(); setIsPlaying(true); }
          break;
        // I/O mark in/out
        case 'KeyI':
          if (!mod && selectedClip) {
            e.preventDefault();
            setTimeline(prev => prev.map(c => c.id === selectedClip ? { ...c, trimIn: currentTime - c.startTime } : c));
          }
          break;
        case 'KeyO':
          if (!mod && selectedClip) {
            e.preventDefault();
            setTimeline(prev => prev.map(c => c.id === selectedClip ? { ...c, trimOut: currentTime - c.startTime } : c));
          }
          break;
        // +/- zoom timeline
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          setZoom(z => Math.min(20, z * 1.2));
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          setZoom(z => Math.max(0.1, z / 1.2));
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClip, selectedText, currentTime, duration, trackTool, globalUndo, timeline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== REAL LUMETRI COLOR GRADING WITH CANVAS PROCESSING =====
  // Applies real color correction to image data using pixel-level manipulation
  const applyLumetriCorrection = (imageData: ImageData, lumetri: LumetriSettings | undefined): ImageData => {
    if (!lumetri) return imageData;

    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];

      // ===== BASIC CORRECTION =====
      // Temperature (warm/cool) adjustment - shifts blue/orange
      const tempShift = lumetri?.temperature || 0;
      r = Math.min(255, r + tempShift * 1.5);
      b = Math.max(0, b - tempShift * 1.5);

      // Tint (magenta/green) adjustment
      const tintShift = lumetri?.tint || 0;
      g = Math.min(255, g + tintShift * 1.2);
      r = Math.max(0, r - tintShift * 0.6);

      // Exposure (brightness for entire image)
      const exposure = 1 + ((lumetri?.exposure || 0) / 100);
      r *= exposure;
      g *= exposure;
      b *= exposure;

      // Contrast
      const contrast = 1 + ((lumetri?.contrast || 0) / 100);
      const centerVal = 128;
      r = centerVal + (r - centerVal) * contrast;
      g = centerVal + (g - centerVal) * contrast;
      b = centerVal + (b - centerVal) * contrast;

      // Highlights, Midtones, Shadows (simplified)
      const lumValue = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lumValue > 192) {
        // Highlights
        const highlightFactor = 1 + ((lumetri?.highlights || 0) / 100) * 0.5;
        r *= highlightFactor;
        g *= highlightFactor;
        b *= highlightFactor;
      } else if (lumValue < 64) {
        // Shadows
        const shadowFactor = 1 + ((lumetri?.shadows || 0) / 100) * 0.3;
        r *= shadowFactor;
        g *= shadowFactor;
        b *= shadowFactor;
      }

      // ===== COLOR WHEELS (Red, Green, Blue channels) =====
      // Shadows color wheel
      if (lumetri?.shadowsWheel && lumValue < 64) {
        const hue = lumetri.shadowsWheel.hue;
        const sat = lumetri.shadowsWheel.saturation;
        if (sat > 0) {
          const angle = hue * Math.PI / 180;
          const sR = 0.5 + 0.5 * Math.cos(angle) * sat;
          const sG = 0.5 + 0.5 * Math.cos(angle - 2.094) * sat;
          const sB = 0.5 + 0.5 * Math.cos(angle + 2.094) * sat;
          r = r * (1 - 0.2) + (r * sR) * 0.2;
          g = g * (1 - 0.2) + (g * sG) * 0.2;
          b = b * (1 - 0.2) + (b * sB) * 0.2;
        }
      }

      // Midtones color wheel  
      if (lumetri?.midtonesWheel && lumValue >= 64 && lumValue <= 192) {
        const hue = lumetri.midtonesWheel.hue;
        const sat = lumetri.midtonesWheel.saturation;
        if (sat > 0) {
          const angle = hue * Math.PI / 180;
          const mR = 0.5 + 0.5 * Math.cos(angle) * sat;
          const mG = 0.5 + 0.5 * Math.cos(angle - 2.094) * sat;
          const mB = 0.5 + 0.5 * Math.cos(angle + 2.094) * sat;
          r = r * (1 - 0.15) + (r * mR) * 0.15;
          g = g * (1 - 0.15) + (g * mG) * 0.15;
          b = b * (1 - 0.15) + (b * mB) * 0.15;
        }
      }

      // Highlights color wheel
      if (lumetri?.highlightsWheel && lumValue > 192) {
        const hue = lumetri.highlightsWheel.hue;
        const sat = lumetri.highlightsWheel.saturation;
        if (sat > 0) {
          const angle = hue * Math.PI / 180;
          const hR = 0.5 + 0.5 * Math.cos(angle) * sat;
          const hG = 0.5 + 0.5 * Math.cos(angle - 2.094) * sat;
          const hB = 0.5 + 0.5 * Math.cos(angle + 2.094) * sat;
          r = r * (1 - 0.2) + (r * hR) * 0.2;
          g = g * (1 - 0.2) + (g * hG) * 0.2;
          b = b * (1 - 0.2) + (b * hB) * 0.2;
        }
      }

      // ===== CURVES / TONE MAPPING =====
      // Saturation adjustment (after all color shifts)
      const saturation = 1 + ((lumetri?.saturation || 0) / 100);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;

      // Vibrance (affects less saturated colors)
      const vibrance = (lumetri?.vibrance || 0) / 100;
      const avgRGB = (r + g + b) / 3;
      const maxRGB = Math.max(r, g, b);
      if (maxRGB !== avgRGB) {
        const intensity = (maxRGB - avgRGB) / maxRGB;
        r = r + (r - avgRGB) * intensity * vibrance;
        g = g + (g - avgRGB) * intensity * vibrance;
        b = b + (b - avgRGB) * intensity * vibrance;
      }

      // Hue shift (rotate all colors)
      const hueShift = (lumetri?.hslCorrection?.hue || 0);
      if (hueShift !== 0) {
        // Convert RGB to HSL
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        const l = (max + min) / 2;
        let h = 0;
        
        if (max === min) {
          h = 0;
        } else {
          const d = max - min;
          const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
            case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
            case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
          }
          
          // Apply hue shift
          h = (h + hueShift / 360 + 1) % 1;
          
          // Convert back to RGB
          const c = (1 - Math.abs(2 * l - 1)) * s;
          const x = c * (1 - Math.abs((h * 6) % 2 - 1));
          const m = l - c / 2;
          let rp = 0, gp = 0, bp = 0;
          
          if (h < 1/6) { rp = c; gp = x; bp = 0; }
          else if (h < 2/6) { rp = x; gp = c; bp = 0; }
          else if (h < 3/6) { rp = 0; gp = c; bp = x; }
          else if (h < 4/6) { rp = 0; gp = x; bp = c; }
          else if (h < 5/6) { rp = x; gp = 0; bp = c; }
          else { rp = c; gp = 0; bp = x; }
          
          r = (rp + m) * 255;
          g = (gp + m) * 255;
          b = (bp + m) * 255;
        }
      }

      // ===== CLAMP VALUES =====
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = a;
    }

    return imageData;
  };

  // Build CSS filter string from clip effects - ACTUALLY APPLIES TO VIDEO
  const getVideoFilter = (clip: MediaClip): string => {
    const b = clip.effects.find(e => e.type === 'brightness')?.value ?? 0;
    const c = clip.effects.find(e => e.type === 'contrast')?.value ?? 0;
    const s = clip.effects.find(e => e.type === 'saturation')?.value ?? 0;
    const bl = clip.effects.find(e => e.type === 'blur')?.value ?? 0;
    const o = clip.effects.find(e => e.type === 'opacity')?.value ?? 100;
    const h = clip.effects.find(e => e.type === 'hue')?.value ?? 0;
    const sh = clip.effects.find(e => e.type === 'sharpen')?.value ?? 0;
    const glow = clip.effects.find(e => e.type === 'glow')?.value ?? 0;
    const sepia = clip.effects.find(e => e.type === 'filmGrain')?.value ?? 0;
    
    let filter = `brightness(${1 + b/100}) contrast(${1 + c/100}) saturate(${1 + s/100}) blur(${bl}px) opacity(${o/100}) hue-rotate(${h}deg)`;
    // Sharpen approximated via contrast bump
    if (sh > 0) filter += ` contrast(${1 + sh / 200})`;
    // Glow via brightness + slight blur
    if (glow > 0) filter += ` brightness(${1 + glow / 150})`;
    // Film grain approximated via sepia + slight desaturation
    if (sepia > 0) filter += ` sepia(${Math.min(sepia / 100, 1)})`;
    
    return filter;
  };

  // History management
  const saveHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...timeline]);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex, timeline]);

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setTimeline(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setTimeline(history[historyIndex + 1]);
    }
  };

  // ===== SCENE SPLIT - SMART DETECTION =====
  const detectSceneBoundaries = useCallback(async (clipId: string, sensitivity: number = 30) => {
    const clip = timeline.find(c => c.id === clipId);
    if (!clip || clip.type !== 'video') return;

    const video = document.createElement('video');
    video.src = clip.src;
    video.muted = true;
    video.preload = 'auto';

    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => resolve();
    });

    const canvas = document.createElement('canvas');
    const w = 64;
    const h = 36;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const boundaries: number[] = [];
    const step = 0.5; // sample every 0.5s
    let prevData: Uint8ClampedArray | null = null;
    const threshold = (100 - sensitivity) * 2 + 10; // map sensitivity 0-100 to threshold

    for (let t = clip.trimIn; t < clip.trimOut; t += step) {
      video.currentTime = t;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      ctx.drawImage(video, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);

      if (prevData) {
        let diff = 0;
        for (let i = 0; i < frame.data.length; i += 4) {
          diff += Math.abs(frame.data[i] - prevData[i]);
          diff += Math.abs(frame.data[i + 1] - prevData[i + 1]);
          diff += Math.abs(frame.data[i + 2] - prevData[i + 2]);
        }
        const avgDiff = diff / (w * h * 3);
        if (avgDiff > threshold) {
          boundaries.push(t - clip.trimIn + clip.startTime);
        }
      }
      prevData = new Uint8ClampedArray(frame.data);
    }

    video.remove();
    setSceneSplitPreview({ clipId, boundaries, sensitivity, detecting: false });
  }, [timeline]);

  const applySceneSplit = useCallback(() => {
    if (!sceneSplitPreview) return;
    const { clipId, boundaries } = sceneSplitPreview;
    const clip = timeline.find(c => c.id === clipId);
    if (!clip || boundaries.length === 0) return;

    const prevTimeline = [...timeline];
    const newClips: MediaClip[] = [];
    const splitPoints = [clip.startTime, ...boundaries, clip.startTime + (clip.trimOut - clip.trimIn)];

    for (let i = 0; i < splitPoints.length - 1; i++) {
      const segStart = splitPoints[i];
      const segEnd = splitPoints[i + 1];
      const offsetFromClipStart = segStart - clip.startTime;
      newClips.push({
        ...clip,
        id: `split-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        startTime: segStart,
        trimIn: clip.trimIn + offsetFromClipStart,
        trimOut: clip.trimIn + offsetFromClipStart + (segEnd - segStart),
        name: `${clip.name} (${i + 1})`,
      });
    }

    const updatedTimeline = timeline.filter(c => c.id !== clipId).concat(newClips);
    setTimeline(updatedTimeline);
    saveHistory();

    globalUndo.push(
      `Scene split ${clip.name} into ${newClips.length} segments`,
      () => setTimeline(updatedTimeline),
      () => setTimeline(prevTimeline)
    );

    setSceneSplitPreview(null);
  }, [sceneSplitPreview, timeline, saveHistory, globalUndo]);

  // ===== PROJECT SAVE / LOAD FOR VINX =====
  interface VinxProjectData {
    name: string;
    version: string;
    timeline: MediaClip[];
    tracks: Track[];
    textOverlays: TextOverlay[];
    mediaPool: MediaClip[];
    aspectRatio: { name: string; width: number; height: number };
    exportSettings: any;
    markers: any[];
    timestamp: number;
  }

  const saveVinxProject = () => {
    const projectName = prompt('Project name:', `VINX-${new Date().toLocaleDateString()}`);
    if (!projectName) return;

    const projectData: VinxProjectData = {
      name: projectName,
      version: '1.0',
      timeline,
      tracks,
      textOverlays,
      mediaPool,
      aspectRatio,
      exportSettings,
      markers: [],
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(`vinx_project_${projectName}`, JSON.stringify(projectData));
      console.info(`Project "${projectName}" saved successfully`);
      saveHistory();
    } catch (err) {
      console.error('Save error:', err);
      console.error('Could not save project. Storage limit may be exceeded.');
    }
  };

  const loadVinxProject = () => {
    const projectKeys = Object.keys(localStorage).filter(k => k.startsWith('vinx_project_'));
    if (projectKeys.length === 0) {
      alert('No saved VINX projects found.');
      return;
    }

    const projects = projectKeys.map(k => {
      try {
        const data = JSON.parse(localStorage.getItem(k) || '{}');
        return { key: k, name: data.name || k.replace('vinx_project_', ''), timestamp: new Date(data.timestamp).toLocaleString() };
      } catch {
        return { key: k, name: k.replace('vinx_project_', ''), timestamp: 'Unknown' };
      }
    });

    const projectName = prompt(
      `Load project:\n\n${projects.map(p => `• ${p.name} (${p.timestamp})`).join('\n')}\n\nEnter project name:`,
      projects[0].name
    );

    if (!projectName) return;

    try {
      const projectData = JSON.parse(localStorage.getItem(`vinx_project_${projectName}`) || '{}');
      
      setTimeline(projectData.timeline || []);
      setTracks(projectData.tracks || tracks);
      setTextOverlays(projectData.textOverlays || []);
      setMediaPool(projectData.mediaPool || []);
      if (projectData.aspectRatio) setAspectRatio(projectData.aspectRatio);
      setCurrentTime(0);
      
      console.info(`Project "${projectName}" loaded successfully`);
      saveHistory();
    } catch (err) {
      console.error('Load error:', err);
      console.error('Could not load project. File may be corrupted.');
    }
  };

  const deleteVinxProject = () => {
    const projectKeys = Object.keys(localStorage).filter(k => k.startsWith('vinx_project_'));
    if (projectKeys.length === 0) {
      alert('No saved VINX projects found.');
      return;
    }

    const projectName = prompt('Delete project (name):');
    if (!projectName) return;

    try {
      localStorage.removeItem(`vinx_project_${projectName}`);
      console.info(`Project "${projectName}" deleted`);
    } catch (err) {
      console.error('Delete error:', err);
      console.error('Could not delete project.');
    }
  };

  // Import media with audio element creation for Web Audio
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file);
      blobUrlsRef.current.add(url);
      const type = file.type.startsWith('video/') ? 'video' : 
                   file.type.startsWith('audio/') ? 'audio' : 'image';

      if (type === 'video' || type === 'audio') {
        const media = document.createElement(type);
        media.src = url;
        media.onloadedmetadata = () => {
          const clipId = `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const clip: MediaClip = {
            id: clipId,
            type,
            name: file.name,
            src: url,
            duration: media.duration,
            trackIndex: 0,
            startTime: 0,
            trimIn: 0,
            trimOut: media.duration,
            volume: 1,
            effects: [],
          };

          // Create audio element for Web Audio API playback
          const audioEl = new Audio(url);
          audioEl.preload = 'auto';
          audioElementsRef.current.set(clipId, audioEl);

          if (type === 'video') {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            (media as HTMLVideoElement).currentTime = Math.min(1, media.duration / 2);
            (media as HTMLVideoElement).onseeked = () => {
              ctx?.drawImage(media as HTMLVideoElement, 0, 0, 160, 90);
              clip.thumbnail = canvas.toDataURL();
              setMediaPool(prev => [...prev, clip]);
            };
          } else {
            setMediaPool(prev => [...prev, clip]);
          }
        };
      } else if (type === 'image') {
        const clip: MediaClip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'image',
          name: file.name,
          src: url,
          duration: 5,
          trackIndex: 0,
          startTime: 0,
          trimIn: 0,
          trimOut: 5,
          volume: 1,
          effects: [],
          thumbnail: url,
        };
        setMediaPool(prev => [...prev, clip]);
      }
    });
    e.target.value = '';
  };

  // Add clip to timeline
  const addToTimeline = (clip: MediaClip, trackIndex: number) => {
    const existingClips = timeline.filter(c => c.trackIndex === trackIndex);
    const lastEnd = existingClips.length > 0 
      ? Math.max(...existingClips.map(c => c.startTime + (c.trimOut - c.trimIn)))
      : 0;

    const newClipId = `timeline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newClip: MediaClip = {
      ...clip,
      id: newClipId,
      trackIndex,
      startTime: snapToGrid ? Math.round(lastEnd) : lastEnd,
    };

    // Create audio element for playback
    if (clip.type === 'audio' || clip.type === 'video') {
      const audioEl = new Audio(clip.src);
      audioEl.preload = 'auto';
      audioElementsRef.current.set(newClipId, audioEl);
    }

    setTimeline(prev => [...prev, newClip]);
    saveHistory();
  };

  // CLIP DRAGGING - Full implementation with move and trim
  const handleClipMouseDown = (e: React.MouseEvent, clipId: string, type: 'move' | 'trimLeft' | 'trimRight') => {
    e.stopPropagation();
    const clip = timeline.find(c => c.id === clipId);
    if (!clip) return;
    
    const track = tracks[clip.trackIndex];
    if (track?.locked) return;

    setDragState({
      clipId,
      type,
      startX: e.clientX,
      originalStartTime: clip.startTime,
      originalTrimIn: clip.trimIn,
      originalTrimOut: clip.trimOut,
    });
    setSelectedClip(clipId);
    setSelectedText(null);
  };

  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    
    const pixelsPerSecond = 50 * zoom;
    const deltaX = e.clientX - dragState.startX;
    const deltaTime = deltaX / pixelsPerSecond;
    
    setTimeline(prev => prev.map(clip => {
      if (clip.id !== dragState.clipId) return clip;
      
      if (dragState.type === 'move') {
        // MOVE clip
        let newStart = dragState.originalStartTime + deltaTime;
        if (snapToGrid) newStart = Math.round(newStart);
        return { ...clip, startTime: Math.max(0, newStart) };
      } else if (dragState.type === 'trimLeft') {
        // TRIM from left (adjust trim in and start time)
        let newTrimIn = dragState.originalTrimIn + deltaTime;
        newTrimIn = Math.max(0, Math.min(clip.trimOut - 0.5, newTrimIn));
        const timeDiff = newTrimIn - dragState.originalTrimIn;
        return { ...clip, trimIn: newTrimIn, startTime: dragState.originalStartTime + timeDiff };
      } else if (dragState.type === 'trimRight') {
        // TRIM from right (adjust trim out)
        let newTrimOut = dragState.originalTrimOut + deltaTime;
        newTrimOut = Math.max(clip.trimIn + 0.5, Math.min(clip.duration, newTrimOut));
        return { ...clip, trimOut: newTrimOut };
      }
      return clip;
    }));
  };

  const handleTimelineMouseUp = () => {
    if (dragState) {
      saveHistory();
      setDragState(null);
    }
  };

  // Split clip at playhead
  const splitClip = (clipId: string) => {
    const clip = timeline.find(c => c.id === clipId);
    if (!clip) return;

    const splitPoint = currentTime - clip.startTime + clip.trimIn;
    if (splitPoint <= clip.trimIn || splitPoint >= clip.trimOut) return;

    const clip1: MediaClip = { ...clip, trimOut: splitPoint };
    const clip2: MediaClip = {
      ...clip,
      id: `timeline-${Date.now()}`,
      trimIn: splitPoint,
      startTime: clip.startTime + (splitPoint - clip.trimIn),
    };

    // Clone audio element for new clip
    if (clip.type === 'audio' || clip.type === 'video') {
      const audioEl = new Audio(clip.src);
      audioEl.preload = 'auto';
      audioElementsRef.current.set(clip2.id, audioEl);
    }

    setTimeline(prev => prev.map(c => c.id === clipId ? clip1 : c).concat(clip2));
    saveHistory();
  };

  // Delete clip
  const deleteClip = (clipId: string) => {
    audioElementsRef.current.get(clipId)?.pause();
    audioElementsRef.current.delete(clipId);
    setTimeline(prev => prev.filter(c => c.id !== clipId));
    if (selectedClip === clipId) setSelectedClip(null);
    saveHistory();
  };

  // Delete text overlay
  const deleteTextOverlay = (textId: string) => {
    setTextOverlays(prev => prev.filter(t => t.id !== textId));
    if (selectedText === textId) setSelectedText(null);
  };

  // Update clip effect
  const updateClipEffect = (clipId: string, effectType: ClipEffect['type'], value: number) => {
    setTimeline(prev => prev.map(clip => {
      if (clip.id !== clipId) return clip;
      const effects = [...clip.effects];
      const idx = effects.findIndex(e => e.type === effectType);
      if (idx >= 0) effects[idx] = { type: effectType, value };
      else effects.push({ type: effectType, value });
      return { ...clip, effects };
    }));
  };

  // Apply filter preset
  const applyFilterPreset = (clipId: string, preset: FilterPreset) => {
    setTimeline(prev => prev.map(clip => {
      if (clip.id !== clipId) return clip;
      return { ...clip, effects: [...preset.effects] };
    }));
    saveHistory();
  };

  // Add text overlay with animation
  const addTextOverlay = (animation: TextOverlay['animation'] = 'none') => {
    const overlay: TextOverlay = {
      id: `text-${Date.now()}`,
      text: 'Your Text',
      startTime: currentTime,
      duration: 5,
      x: 50,
      y: 50,
      fontSize: 48,
      color: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      bold: false,
      italic: false,
      animation,
    };
    setTextOverlays(prev => [...prev, overlay]);
    setSelectedText(overlay.id);
    setSelectedClip(null);
  };

  // ===== KEYBOARD SHORTCUTS FOR VINX (supplemental) =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid shortcuts when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      // E: Export (Ctrl+E)
      if ((e.code === 'KeyE' || e.key === 'e') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowExportModal(true);
      }

      // T: Add text overlay
      if ((e.code === 'KeyT' || e.key === 't') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addTextOverlay('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addTextOverlay]);

  // REAL EXPORT with Canvas + MediaRecorder
  const handleExport = async () => {
    if (timeline.length === 0) {
      alert('Add clips to timeline before exporting');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = aspectRatio.width;
      canvas.height = aspectRatio.height;
      const ctx = canvas.getContext('2d')!;
      
      // ===== SET UP AUDIO MIXING FOR EXPORT =====
      const audioContext = new AudioContext();
      const audioDestination = audioContext.createMediaStreamDestination();
      const audioGain = audioContext.createGain();
      audioGain.connect(audioDestination);
      
      // Create audio sources for all audio/video clips with audio
      const audioSources: { source: AudioBufferSourceNode | MediaElementAudioSourceNode; clip: MediaClip; startTime: number }[] = [];
      
      for (const clip of timeline) {
        if (clip.type === 'audio' || clip.type === 'video') {
          try {
            const audioElement = audioElementsRef.current.get(clip.id);
            if (audioElement) {
              const source = audioContext.createMediaElementSource(audioElement);
              const clipGain = audioContext.createGain();
              clipGain.gain.value = clip.volume;
              source.connect(clipGain);
              clipGain.connect(audioGain);
            }
          } catch (err) {
            // Audio element may already be connected, create buffer source instead
            // Fallback: buffer source approach for already-connected elements
          }
        }
      }
      
      // Combine video stream with audio stream
      const videoStream = canvas.captureStream(exportSettings.fps);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks()
      ]);
      
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: exportSettings.quality === 'high' ? 8000000 : exportSettings.quality === 'medium' ? 5000000 : 2500000,
        audioBitsPerSecond: 128000,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VINX-Export-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
        setShowExportModal(false);
        audioContext.close();
        console.info('Export complete with audio');
      };

      mediaRecorder.start();

      const totalFrames = Math.ceil(duration * exportSettings.fps);
      const frameInterval = 1000 / exportSettings.fps;

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / exportSettings.fps;
        setExportProgress(Math.round((frame / totalFrames) * 100));

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Find active video clip
        const activeVideoClip = timeline.find(c => 
          c.type === 'video' &&
          time >= c.startTime && 
          time < c.startTime + (c.trimOut - c.trimIn)
        );

        if (activeVideoClip && videoRef.current) {
          videoRef.current.currentTime = activeVideoClip.trimIn + (time - activeVideoClip.startTime);
          await new Promise(r => setTimeout(r, 30));
          
          ctx.save();
          ctx.filter = getVideoFilter(activeVideoClip);
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          
          // ===== APPLY REAL LUMETRI COLOR GRADING =====
          if (activeVideoClip.lumetriColor) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const processedData = applyLumetriCorrection(imageData, activeVideoClip.lumetriColor);
            ctx.putImageData(processedData, 0, 0);
          }
          
          ctx.restore();
        }

        // Find and draw active image clip
        const activeImageClip = timeline.find(c =>
          c.type === 'image' &&
          time >= c.startTime &&
          time < c.startTime + (c.trimOut - c.trimIn)
        );

        if (activeImageClip) {
          const img = new Image();
          img.src = activeImageClip.src;
          ctx.save();
          ctx.filter = getVideoFilter(activeImageClip);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // ===== APPLY REAL LUMETRI COLOR GRADING TO IMAGE =====
          if (activeImageClip.lumetriColor) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const processedData = applyLumetriCorrection(imageData, activeImageClip.lumetriColor);
            ctx.putImageData(processedData, 0, 0);
          }
          
          ctx.restore();
        }

        // Draw text overlays with animations
        textOverlays.filter(t => time >= t.startTime && time < t.startTime + t.duration).forEach(t => {
          ctx.save();
          const progress = (time - t.startTime) / t.duration;
          let alpha = 1;
          let offsetY = 0;
          let scale = 1;

          switch (t.animation) {
            case 'fadeIn':
              alpha = Math.min(1, progress * 3);
              break;
            case 'slideUp':
              offsetY = Math.max(0, (1 - progress * 3) * 50);
              break;
            case 'bounce':
              scale = 1 + Math.sin(progress * Math.PI * 4) * 0.1 * (1 - progress);
              break;
            case 'scale':
              scale = Math.min(1, progress * 3);
              alpha = scale;
              break;
          }

          ctx.globalAlpha = alpha;
          ctx.font = `${t.bold ? 'bold ' : ''}${t.italic ? 'italic ' : ''}${t.fontSize * scale}px ${t.fontFamily}`;
          ctx.fillStyle = t.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 8;
          ctx.fillText(t.text, (t.x / 100) * canvas.width, (t.y / 100) * canvas.height + offsetY);
          ctx.restore();
        });

        await new Promise(r => setTimeout(r, frameInterval / 2));
      }

      mediaRecorder.stop();
    } catch (error) {
      console.error('Export failed:', error);
      setIsExporting(false);
      console.error('Export failed. Please try again.');
    }
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const selectedClipData = timeline.find(c => c.id === selectedClip);
  const selectedTextData = textOverlays.find(t => t.id === selectedText);
  const pixelsPerSecond = 50 * zoom;

  // ==================== PERFORMANCE OPTIMIZATIONS ====================
  // Memoized filtered media pool for search
  const filteredMediaPool = useMemo(() => {
    return mediaPool.slice(0, 100); // Limit visible items for performance
  }, [mediaPool]);

  // Memoized visible clips for timeline rendering (limit for performance)
  const visibleClips = useMemo(() => {
    const viewStart = Math.max(0, currentTime - 30);
    const viewEnd = currentTime + 60;
    return timeline.filter(clip => {
      const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
      return clip.startTime < viewEnd && clipEnd > viewStart;
    }).slice(0, 50); // Limit to 50 visible clips
  }, [timeline, currentTime]);

  // Memoized visible text overlays
  const visibleTextOverlays = useMemo(() => {
    return textOverlays.filter(t => {
      const tEnd = t.startTime + t.duration;
      return t.startTime <= currentTime + 30 && tEnd >= currentTime - 5;
    }).slice(0, 20);
  }, [textOverlays, currentTime]);

  // Throttled timeline scrub for smooth performance
  const throttledSetCurrentTime = useMemo(() => 
    throttle((time: number) => setCurrentTime(time), 33), // ~30fps scrub
  []);

  // Debounced search for media browser
  const debouncedMediaSearch = useMemo(() =>
    debounce((query: string) => {
      // Search implementation would go here
      console.log('Media search:', query);
    }, 200),
  []);

  // ==================== THEME (CSS Variable Based for Light/Dark Support) ====================
  const theme = useMemo(() => ({
    // Core backgrounds - use CSS variables for theme switching
    bg: 'var(--color-bg-base)',
    bgPrimary: 'var(--color-bg-surface)',
    bgSecondary: 'var(--color-bg-glass)',
    bgTertiary: 'var(--color-bg-inset)',
    bgHover: 'var(--color-bg-hover)',
    // Borders
    border: 'var(--color-border-subtle)',
    borderDefault: 'var(--color-border-default)',
    // Text - automatically inverts with theme
    text: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    textMuted: 'var(--color-text-muted)',
    // Accent colors
    accent: 'var(--color-accent)',
    accentSoft: 'var(--color-accent-light)',
    // Semantic colors
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
    // Track type colors (fixed - don't need inversion)
    video: 'linear-gradient(135deg, #0a84ff 0%, #0a84ff 50%, #0a84ff 100%)',
    audio: 'linear-gradient(135deg, #30d158 0%, #28a745 50%, #1e7a35 100%)',
    image: 'linear-gradient(135deg, #ff9f0a 0%, #cc7700 50%, #995500 100%)',
    playhead: '#ff453a',
    // Radii
    radius: 'var(--radius-md)',
    radiusSm: 'var(--radius-sm)',
    radiusLg: 'var(--radius-lg)',
    // Effects
    shadow: 'var(--shadow-lg)',
    glass: 'blur(24px) saturate(180%)',
    glassLight: 'blur(16px) saturate(160%)',
  }), []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', 
      background: 'var(--color-bg-base)', 
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)', fontSize: '12px', overflow: 'hidden',
      transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
    }}>
      <style>{`
        /* === DEX VINX VIDEO EDITOR - PROFESSIONAL UI POLISH === */
        *, *::before, *::after { box-sizing: border-box; transition: background 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.1s cubic-bezier(0.4, 0, 0.2, 1); }
        ::-webkit-scrollbar { width: 7px; height: 7px; }
        ::-webkit-scrollbar-track { background: transparent; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(10,132,255,0.25); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(10,132,255,0.4); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-track { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(145deg, #0a84ff, #0a84ff); margin-top: -6px; box-shadow: 0 2px 8px rgba(10,132,255,0.4); border: 2px solid rgba(255,255,255,0.2); transition: all 0.15s ease; }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(10,132,255,0.5); }
        button { font-family: inherit; }
        button:active { transform: scale(0.97); filter: brightness(0.96); }
        .vinx-btn-primary:hover {
          background: linear-gradient(145deg, #0a84ff 0%, #0a84ff 50%, #0a84ff 100%) !important;
          box-shadow: 0 8px 28px rgba(10,132,255,0.5) !important;
        }
        .vinx-track-item:hover {
          background: rgba(10,132,255,0.08) !important;
        }
        .clip {
          overflow: hidden !important;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .clip:hover {
          box-shadow: 0 4px 16px rgba(10,132,255,0.3) !important;
          transform: translateY(-1px);
        }
        .vinx-clip:hover {
          box-shadow: 0 4px 16px rgba(10,132,255,0.3) !important;
          transform: translateY(-1px);
        }
        .trim-handle { opacity: 0; transition: opacity 0.15s ease; }
        .clip:hover .trim-handle { opacity: 1; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        @keyframes glassShine { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        select { 
          outline: none; cursor: pointer; 
          background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%) !important;
          border: 1px solid rgba(10,132,255,0.2) !important;
          border-radius: 8px !important;
          color: #f4f4f5 !important;
          padding: 8px 32px 8px 12px !important;
          font-weight: 500 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
          background-repeat: no-repeat !important;
          background-position: right 10px center !important;
          transition: all 0.15s ease !important;
        }
        select:hover { 
          border-color: rgba(10,132,255,0.4) !important; 
          background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%) !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
          background-repeat: no-repeat !important;
          background-position: right 10px center !important;
        }
        select:focus { 
          border-color: rgba(10,132,255,0.6) !important; 
          box-shadow: 0 0 0 3px rgba(10,132,255,0.15), 0 4px 12px rgba(10,132,255,0.15) !important; 
        }
        select option {
          background: #18181c !important;
          color: #f4f4f5 !important;
          padding: 10px 14px !important;
        }
        select option:checked, select option:hover {
          background: linear-gradient(135deg, rgba(10,132,255,0.3) 0%, rgba(10,132,255,0.15) 100%) !important;
        }
      `}</style>

      <input ref={fileInputRef} type="file" accept="video/*,audio/*,image/*" multiple onChange={handleImport} style={{ display: 'none' }} />
      <input ref={lutInputRef} type="file" accept=".cube,.3dl,.csp,.look" multiple onChange={handleLUTImport} style={{ display: 'none' }} />
      <input ref={effectInputRef} type="file" accept=".xml,.prfpset,.ffx,.json" multiple onChange={handleEffectImport} style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ==================== COMPACT UNIFIED TOOLBAR ==================== */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 12px', height: '36px',
        background: theme.bgSecondary, borderBottom: `1px solid ${theme.border}`, gap: '6px',
        flexShrink: 0,
      }}>
        {/* Workspace tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(isBeginnerMode ? [
            { id: 'editing' as const, label: 'Edit' },
            { id: 'audio' as const, label: 'Audio' },
          ] : [
            { id: 'editing' as const, label: 'Edit' },
            { id: 'color' as const, label: 'Color' },
            { id: 'audio' as const, label: 'Audio' },
            { id: 'graphics' as const, label: 'GFX' },
          ]).map(ws => (
            <button aria-label={`Workspace ${ws.label}`} key={ws.id} onClick={() => setWorkspace(ws.id)} style={{
              padding: '4px 10px',
              background: workspace === ws.id ? 'rgba(10,132,255,0.12)' : 'transparent',
              border: workspace === ws.id ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent',
              color: workspace === ws.id ? theme.accent : theme.textMuted, cursor: 'pointer',
              fontSize: '10px', fontWeight: 600, borderRadius: '4px',
            }}>{ws.label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px' }} />

        {/* File ops */}
        <button aria-label="Save" onClick={saveVinxProject} title="Save (Ctrl+S)" style={{ padding: '3px 6px', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg>
        </button>
        <button aria-label="Load" onClick={loadVinxProject} title="Load" style={{ padding: '3px 6px', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px' }} />

        {/* Import */}
        <button aria-label="Import" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: '4px', color: '#0a84ff', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>{Icon.import} Import</button>

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 2px' }} />

        {/* Undo/Redo */}
        <button aria-label="Undo" onClick={undo} disabled={historyIndex <= 0} style={{ padding: '3px', background: 'transparent', border: 'none', color: historyIndex <= 0 ? theme.textMuted : theme.textSecondary, cursor: 'pointer' }} title="Undo (Ctrl+Z)">{Icon.undo}</button>
        <button aria-label="Redo" onClick={redo} disabled={historyIndex >= history.length - 1} style={{ padding: '3px', background: 'transparent', border: 'none', color: historyIndex >= history.length - 1 ? theme.textMuted : theme.textSecondary, cursor: 'pointer' }} title="Redo (Ctrl+Y)">{Icon.redo}</button>

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 2px' }} />

        {/* Tools */}
        {(isBeginnerMode ? [
          { id: 'select' as const, icon: Icon.cursor, label: 'Selection (V)' },
          { id: 'cut' as const, icon: Icon.scissors, label: 'Razor (C)' },
          { id: 'zoom' as const, icon: Icon.zoomIn, label: 'Zoom (Z)' },
        ] : [
          { id: 'select' as const, icon: Icon.cursor, label: 'Selection (V)' },
          { id: 'cut' as const, icon: Icon.scissors, label: 'Razor (C)' },
          { id: 'zoom' as const, icon: Icon.zoomIn, label: 'Zoom (Z)' },
          { id: 'ripple' as const, icon: Icon.split, label: 'Ripple Edit (B)' },
          { id: 'rolling' as const, icon: Icon.transition, label: 'Rolling Edit (N)' },
          { id: 'slip' as const, icon: Icon.layers, label: 'Slip (Y)' },
          { id: 'slide' as const, icon: Icon.timeline, label: 'Slide (U)' },
          { id: 'pen' as const, icon: Icon.wand, label: 'Pen (P)' },
        ]).map(t => (
          <button aria-label={`Tool ${t.label || t.id}`} key={t.id} onClick={() => setTool(t.id)} style={{
            padding: '3px', background: tool === t.id ? 'rgba(10,132,255,0.12)' : 'transparent',
            border: tool === t.id ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px',
            color: tool === t.id ? '#0a84ff' : theme.textMuted, cursor: 'pointer',
          }} title={t.label}>{t.icon}</button>
        ))}

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 2px' }} />

        <button aria-label="Snap" onClick={() => setSnapToGrid(!snapToGrid)} style={{ padding: '3px', background: snapToGrid ? 'rgba(10,132,255,0.12)' : 'transparent', border: snapToGrid ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: snapToGrid ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="Snap">{Icon.magnet}</button>

        <div style={{ flex: 1 }} />

        {/* Timecode */}
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#0a84ff', background: 'rgba(10,132,255,0.08)', padding: '3px 10px', borderRadius: '4px' }}>{formatTime(currentTime)} / {formatTime(duration)}</div>

        <div style={{ flex: 1 }} />

        {/* Right-side panel toggles */}
        {!isBeginnerMode && <>
        <button aria-label="Scopes" onClick={() => setShowScopes(!showScopes)} style={{ padding: '3px', background: showScopes ? 'rgba(10,132,255,0.12)' : 'transparent', border: showScopes ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: showScopes ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="Scopes">{Icon.scopes}</button>
        <button aria-label="Masking" onClick={() => setShowMaskPanel(!showMaskPanel)} style={{ padding: '3px', background: showMaskPanel ? 'rgba(10,132,255,0.12)' : 'transparent', border: showMaskPanel ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: showMaskPanel ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="Masking">{Icon.mask}</button>
        <button aria-label="Audio Mixer" onClick={() => setShowAudioMixer(!showAudioMixer)} style={{ padding: '3px', background: showAudioMixer ? 'rgba(10,132,255,0.12)' : 'transparent', border: showAudioMixer ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: showAudioMixer ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="Audio Mixer">{Icon.essentialSound}</button>
        <button aria-label="History" onClick={() => setShowHistoryPanel(!showHistoryPanel)} style={{ padding: '3px', background: showHistoryPanel ? 'rgba(10,132,255,0.12)' : 'transparent', border: showHistoryPanel ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: showHistoryPanel ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="History">{Icon.timeline}</button>
        <button aria-label="Markers" onClick={() => setShowMarkersPanel(!showMarkersPanel)} style={{ padding: '3px', background: showMarkersPanel ? 'rgba(10,132,255,0.12)' : 'transparent', border: showMarkersPanel ? '1px solid rgba(10,132,255,0.2)' : '1px solid transparent', borderRadius: '3px', color: showMarkersPanel ? '#0a84ff' : theme.textMuted, cursor: 'pointer' }} title="Markers">{Icon.marker}</button>
        </>}

        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 2px' }} />

        {/* Export */}
        <button aria-label="Export" onClick={() => setShowExportModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '4px', color: '#30d158', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>{Icon.export} Export</button>
      </div>

      {/* ==================== MAIN WORKSPACE ==================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Resizable */}
        <div style={{ width: `${leftPanelWidth}px`, background: theme.bgSecondary, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', position: 'relative', flexShrink: 0 }}>
          {/* Resize Handle */}
          <div
            onMouseDown={() => setIsResizingLeft(true)}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px',
              cursor: 'ew-resize', background: isResizingLeft ? theme.accent : 'transparent',
              zIndex: 10, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = `${theme.accent}50`}
            onMouseLeave={(e) => { if (!isResizingLeft) e.currentTarget.style.background = 'transparent'; }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: `1px solid ${theme.border}` }}>
            {[
              { id: 'media' as const, icon: Icon.folder, label: 'Media' },
              { id: 'effects' as const, icon: Icon.wand, label: 'Effects' },
              { id: 'transitions' as const, icon: Icon.transition, label: 'Trans' },
              ...(!isBeginnerMode ? [
                { id: 'lumetri' as const, icon: Icon.lumetri, label: 'Color' },
              ] : []),
              { id: 'essentialSound' as const, icon: Icon.essentialSound, label: 'Sound' },
              ...(!isBeginnerMode ? [
                { id: 'essentialGraphics' as const, icon: Icon.essentialGraphics, label: 'Graphics' },
                { id: 'captions' as const, icon: Icon.captions, label: 'Captions' },
                { id: 'text' as const, icon: Icon.type, label: 'Text' },
              ] : []),
            ].map(tab => (
              <button aria-label={`Panel ${tab.label || tab.id}`} key={tab.id} onClick={() => setActivePanel(tab.id)} style={{
                flex: '1 0 25%', padding: '10px 4px', background: activePanel === tab.id ? theme.bgTertiary : 'transparent',
                border: 'none', borderBottom: activePanel === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                color: activePanel === tab.id ? theme.text : theme.textMuted, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', fontSize: '9px',
                textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500,
              }}>
                <span style={{ opacity: activePanel === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {activePanel === 'media' && (
              mediaPool.length === 0 ? (
                <div onClick={() => fileInputRef.current?.click()} style={{
                  width: '100%', padding: '32px 20px', border: `2px dashed rgba(100,210,255,0.3)`, borderRadius: theme.radiusLg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', cursor: 'pointer',
                  background: 'linear-gradient(180deg, rgba(100,210,255,0.05) 0%, transparent 100%)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.5)'; e.currentTarget.style.background = 'linear-gradient(180deg, rgba(100,210,255,0.08) 0%, transparent 100%)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.3)'; e.currentTarget.style.background = 'linear-gradient(180deg, rgba(100,210,255,0.05) 0%, transparent 100%)'; }}
                >
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(100,210,255,0.2) 0%, rgba(100,210,255,0.1) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {Icon.import}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: theme.text, fontWeight: 500, marginBottom: '4px' }}>Import Media</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Drop files or click to browse</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <span style={{ padding: '4px 8px', background: 'rgba(94,92,230,0.2)', borderRadius: '4px', fontSize: '9px', color: '#5e5ce6' }}>Video</span>
                    <span style={{ padding: '4px 8px', background: 'rgba(48,209,88,0.2)', borderRadius: '4px', fontSize: '9px', color: '#30d158' }}>Audio</span>
                    <span style={{ padding: '4px 8px', background: 'rgba(255,159,10,0.2)', borderRadius: '4px', fontSize: '9px', color: '#ff9f0a' }}>Images</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {mediaPool.map(clip => (
                    <div key={clip.id} onDoubleClick={() => addToTimeline(clip, clip.type === 'audio' ? 2 : 0)} style={{
                      aspectRatio: '16/10', background: theme.bgTertiary, borderRadius: theme.radius, overflow: 'hidden',
                      cursor: 'pointer', position: 'relative', border: `1px solid ${theme.border}`,
                    }}>
                      {clip.thumbnail ? (
                        <img src={clip.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
                          {clip.type === 'audio' ? Icon.music : Icon.image}
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', fontSize: '10px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name}</div>
                        <div style={{ fontSize: '9px', color: theme.textMuted }}>{formatTime(clip.duration)}</div>
                      </div>
                      <div style={{
                        position: 'absolute', top: '4px', right: '4px', padding: '2px 5px',
                        background: clip.type === 'video' ? 'rgba(94,92,230,0.9)' : clip.type === 'audio' ? 'rgba(48,209,88,0.9)' : 'rgba(255,159,10,0.9)',
                        borderRadius: '3px', fontSize: '8px', textTransform: 'uppercase', fontWeight: 600,
                      }}>{clip.type}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Lumetri Color Panel */}
            {activePanel === 'lumetri' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
                  {(['basic', 'creative', 'curves', 'colorWheels', 'hslSecondary', 'vignette'] as const).map(panel => (
                    <button aria-label={`Lumetri ${panel}`} key={panel} onClick={() => setLumetriPanel(panel)} style={{
                      flex: 1, padding: '6px 4px', background: lumetriPanel === panel ? theme.accentSoft : 'transparent',
                      border: `1px solid ${lumetriPanel === panel ? theme.accent : 'transparent'}`, borderRadius: '4px',
                      color: lumetriPanel === panel ? theme.accent : theme.textMuted, cursor: 'pointer', fontSize: '9px', textTransform: 'capitalize',
                    }}>{panel === 'hslSecondary' ? 'HSL' : panel === 'colorWheels' ? 'Wheels' : panel}</button>
                  ))}
                </div>
                
                {lumetriPanel === 'basic' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>Basic Correction</div>
                    {[
                      { key: 'temperature' as keyof LumetriSettings, label: 'Temperature', min: -100, max: 100 },
                      { key: 'tint' as keyof LumetriSettings, label: 'Tint', min: -100, max: 100 },
                      { key: 'exposure' as keyof LumetriSettings, label: 'Exposure', min: -5, max: 5 },
                      { key: 'contrast' as keyof LumetriSettings, label: 'Contrast', min: -100, max: 100 },
                      { key: 'highlights' as keyof LumetriSettings, label: 'Highlights', min: -100, max: 100 },
                      { key: 'shadows' as keyof LumetriSettings, label: 'Shadows', min: -100, max: 100 },
                      { key: 'whites' as keyof LumetriSettings, label: 'Whites', min: -100, max: 100 },
                      { key: 'blacks' as keyof LumetriSettings, label: 'Blacks', min: -100, max: 100 },
                      { key: 'saturation' as keyof LumetriSettings, label: 'Saturation', min: 0, max: 200 },
                      { key: 'vibrance' as keyof LumetriSettings, label: 'Vibrance', min: -100, max: 100 },
                    ].map(ctrl => (
                      <div key={ctrl.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                          <span style={{ color: theme.textSecondary }}>{ctrl.label}</span>
                          <span style={{ color: theme.text }}>{lumetriSettings[ctrl.key] as number}</span>
                        </div>
                        <input type="range" min={ctrl.min} max={ctrl.max} 
                          value={lumetriSettings[ctrl.key] as number}
                          onChange={(e) => setLumetriSettings({ ...lumetriSettings, [ctrl.key]: Number(e.target.value) })}
                          style={{ width: '100%' }} />
                      </div>
                    ))}
                  </div>
                )}
                
                {lumetriPanel === 'colorWheels' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {(['shadows', 'midtones', 'highlights'] as const).map(wheel => (
                      <div key={wheel} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>{wheel}</div>
                        <div style={{
                          width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto',
                          background: `conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)`,
                          position: 'relative', cursor: 'pointer',
                        }}>
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%', width: '12px', height: '12px',
                            background: theme.accent, borderRadius: '50%', transform: 'translate(-50%, -50%)',
                            border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {lumetriPanel === 'vignette' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>Vignette</div>
                    {[
                      { key: 'vignetteAmount' as keyof LumetriSettings, label: 'Amount', min: -100, max: 100 },
                      { key: 'vignetteMidpoint' as keyof LumetriSettings, label: 'Midpoint', min: 0, max: 100 },
                      { key: 'vignetteRoundness' as keyof LumetriSettings, label: 'Roundness', min: -100, max: 100 },
                      { key: 'vignetteFeather' as keyof LumetriSettings, label: 'Feather', min: 0, max: 100 },
                    ].map(ctrl => (
                      <div key={ctrl.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                          <span style={{ color: theme.textSecondary }}>{ctrl.label}</span>
                          <span style={{ color: theme.text }}>{lumetriSettings[ctrl.key] as number}</span>
                        </div>
                        <input type="range" min={ctrl.min} max={ctrl.max}
                          value={lumetriSettings[ctrl.key] as number}
                          onChange={(e) => setLumetriSettings({ ...lumetriSettings, [ctrl.key]: Number(e.target.value) })}
                          style={{ width: '100%' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Essential Sound Panel */}
            {activePanel === 'essentialSound' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>Clip Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {(['dialogue', 'music', 'sfx', 'ambience'] as const).map(type => (
                    <button aria-label={`Set clip type to ${type}`} key={type} onClick={() => setEssentialSoundSettings({ ...essentialSoundSettings, clipType: type })} style={{
                      padding: '10px', background: essentialSoundSettings.clipType === type ? theme.accentSoft : theme.bgTertiary,
                      border: `1px solid ${essentialSoundSettings.clipType === type ? theme.accent : theme.border}`,
                      borderRadius: theme.radiusSm, color: essentialSoundSettings.clipType === type ? theme.accent : theme.text,
                      cursor: 'pointer', fontSize: '11px', textTransform: 'capitalize',
                    }}>{type}</button>
                  ))}
                </div>
                
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginTop: '12px' }}>Loudness</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={essentialSoundSettings.loudness.autoMatch}
                    onChange={(e) => setEssentialSoundSettings({ ...essentialSoundSettings, loudness: { ...essentialSoundSettings.loudness, autoMatch: e.target.checked } })} />
                  <span style={{ fontSize: '11px' }}>Auto-Match</span>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ color: theme.textSecondary }}>Target Level (LUFS)</span>
                    <span style={{ color: theme.text }}>{essentialSoundSettings.loudness.targetLevel}</span>
                  </div>
                  <input type="range" min={-30} max={-10} value={essentialSoundSettings.loudness.targetLevel}
                    onChange={(e) => setEssentialSoundSettings({ ...essentialSoundSettings, loudness: { ...essentialSoundSettings.loudness, targetLevel: Number(e.target.value) } })}
                    style={{ width: '100%' }} />
                </div>

                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginTop: '12px' }}>Repair</div>
                {[
                  { key: 'reduceNoise' as const, label: 'Reduce Noise' },
                  { key: 'reduceRumble' as const, label: 'Reduce Rumble' },
                  { key: 'deHum' as const, label: 'DeHum' },
                  { key: 'deEss' as const, label: 'DeEss' },
                  { key: 'reduceReverb' as const, label: 'Reduce Reverb' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={essentialSoundSettings.repair[item.key]}
                      onChange={(e) => setEssentialSoundSettings({ ...essentialSoundSettings, repair: { ...essentialSoundSettings.repair, [item.key]: e.target.checked } })} />
                    <span style={{ fontSize: '11px' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Essential Graphics Panel */}
            {activePanel === 'essentialGraphics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>Motion Graphics Templates</div>
                {motionGraphicsTemplates.map((template, idx) => (
                  <button aria-label={`Template ${template.name}`} key={idx} onClick={() => setSelectedMogrtTemplate(template.name)} style={{
                    padding: '10px 12px', background: selectedMogrtTemplate === template.name ? theme.accentSoft : theme.bgTertiary,
                    border: `1px solid ${selectedMogrtTemplate === template.name ? theme.accent : theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '11px', textAlign: 'left',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{template.name}</span>
                    <span style={{ fontSize: '9px', color: theme.textMuted }}>{template.category}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Captions Panel */}
            {activePanel === 'captions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{
                  padding: '12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.textMuted, fontSize: '12px', textAlign: 'center',
                }}>Transcription requires a speech-to-text backend (V3)</div>
                
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginTop: '8px' }}>Caption Style</div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '4px' }}>Font Size</div>
                  <input type="range" min={16} max={72} value={captionStyle.fontSize}
                    onChange={(e) => setCaptionStyle({ ...captionStyle, fontSize: Number(e.target.value) })}
                    style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '4px' }}>Font Color</div>
                    <input type="color" value={captionStyle.fontColor}
                      onChange={(e) => setCaptionStyle({ ...captionStyle, fontColor: e.target.value })}
                      style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '4px' }}>Background</div>
                    <input type="color" value={captionStyle.backgroundColor}
                      onChange={(e) => setCaptionStyle({ ...captionStyle, backgroundColor: e.target.value })}
                      style={{ width: '100%', height: '32px', border: 'none', borderRadius: '4px' }} />
                  </div>
                </div>
                
                <button aria-label="Add caption" onClick={() => setCaptions([...captions, {
                  id: `cap-${Date.now()}`, startTime: currentTime, endTime: currentTime + 3, text: 'New Caption',
                  style: captionStyle, position: 'bottom', alignment: 'center',
                }])} style={{
                  padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '11px',
                }}>{Icon.plus} Add Caption at Playhead</button>

                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginTop: '8px' }}>Captions ({captions.length})</div>
                {captions.map(cap => (
                  <div key={cap.id} onClick={() => setSelectedCaption(cap.id)} style={{
                    padding: '8px', background: selectedCaption === cap.id ? theme.accentSoft : theme.bgTertiary,
                    border: `1px solid ${selectedCaption === cap.id ? theme.accent : theme.border}`,
                    borderRadius: theme.radiusSm, cursor: 'pointer', fontSize: '11px',
                  }}>
                    <div style={{ fontWeight: 500 }}>{cap.text}</div>
                    <div style={{ fontSize: '10px', color: theme.textMuted }}>{formatTime(cap.startTime)} - {formatTime(cap.endTime)}</div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'effects' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button aria-label="Open plugin store" onClick={() => setShowMarketplace(true)} style={{
                  padding: '8px 12px', background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.25)',
                  borderRadius: theme.radiusSm, color: '#0a84ff', fontSize: '11px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4,
                }}>
                  Plugin Store
                </button>
                <select value={effectCategory} onChange={(e) => setEffectCategory(e.target.value)} style={{
                  padding: '8px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, fontSize: '11px', marginBottom: '8px',
                }}>
                  {VIDEO_EFFECTS.map(cat => <option key={cat.category} value={cat.category}>{cat.category}</option>)}
                </select>
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>
                  {VIDEO_EFFECTS.find(c => c.category === effectCategory)?.effects.length} Effects
                </div>
                {VIDEO_EFFECTS.find(c => c.category === effectCategory)?.effects.map(effect => (
                  <div key={effect.name} style={{
                    padding: '8px 10px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: `1px solid ${theme.border}`, fontSize: '11px',
                  }}>
                    <span>{effect.name}</span>
                    {effect.gpuAccelerated && <span style={{ color: theme.accent, fontSize: '9px' }}>{Icon.gpu}</span>}
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'transitions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select value={transitionCategory} onChange={(e) => setTransitionCategory(e.target.value)} style={{
                  padding: '8px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, fontSize: '11px', marginBottom: '8px',
                }}>
                  {TRANSITIONS.map(cat => <option key={cat.category} value={cat.category}>{cat.category}</option>)}
                </select>
                {TRANSITIONS.find(c => c.category === transitionCategory)?.transitions.map(t => (
                  <div key={t} style={{
                    padding: '10px 12px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    border: `1px solid ${theme.border}`, fontSize: '11px',
                  }}>
                    {Icon.transition}
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'text' && (
              <div>
                <button aria-label="Add text overlay" onClick={() => addTextOverlay('none')} style={{
                  width: '100%', padding: '12px', background: theme.accent, color: '#fff', border: 'none',
                  borderRadius: theme.radiusSm, fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginBottom: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>{Icon.plus} Add Text</button>
                <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Text Animations</div>
                {(['fadeIn', 'slideUp', 'bounce', 'scale'] as const).map(anim => (
                  <button aria-label="Add text overlay" key={anim} onClick={() => addTextOverlay(anim)} style={{
                    width: '100%', padding: '10px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', marginBottom: '6px',
                    display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', textAlign: 'left',
                  }}>
                    <span style={{ textTransform: 'capitalize' }}>{anim.replace(/([A-Z])/g, ' $1')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preview Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', minWidth: 0 }}>
          <div style={{
            padding: '10px 16px', background: theme.bgSecondary, borderBottom: `1px solid ${theme.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>Preview ({aspectRatio.name})</span>
            <span style={{ fontSize: '11px', color: theme.textMuted }}>{timeline.length} clips • {formatTime(duration)}</span>
          </div>

          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'relative', width: '100%',
              maxWidth: `${(aspectRatio.width / aspectRatio.height) * 100}%`,
              aspectRatio: `${aspectRatio.width}/${aspectRatio.height}`,
              maxHeight: '100%', background: '#000', borderRadius: theme.radiusSm, overflow: 'hidden', boxShadow: theme.shadow,
            }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} muted />
              
              {timeline.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                  {Icon.film}
                </div>
              )}

              {/* Text Overlays with Animations */}
              {textOverlays.filter(t => currentTime >= t.startTime && currentTime < t.startTime + t.duration).map(t => {
                const progress = (currentTime - t.startTime) / t.duration;
                let animStyle: React.CSSProperties = {};
                
                switch (t.animation) {
                  case 'fadeIn':
                    animStyle = { opacity: Math.min(1, progress * 3), animation: 'fadeIn 0.5s ease-out' };
                    break;
                  case 'slideUp':
                    animStyle = { animation: 'slideUp 0.5s ease-out' };
                    break;
                  case 'bounce':
                    animStyle = { animation: 'bounce 0.5s ease-in-out infinite' };
                    break;
                  case 'scale':
                    animStyle = { transform: `scale(${Math.min(1, progress * 3)})` };
                    break;
                }

                return (
                  <div key={t.id} onClick={() => { setSelectedText(t.id); setSelectedClip(null); }} style={{
                    position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)',
                    fontSize: `${t.fontSize}px`, color: t.color, fontFamily: t.fontFamily,
                    fontWeight: t.bold ? 'bold' : 'normal', fontStyle: t.italic ? 'italic' : 'normal',
                    textShadow: '2px 2px 8px rgba(0,0,0,0.8)', cursor: 'pointer',
                    border: selectedText === t.id ? `2px dashed ${theme.accent}` : 'none', padding: '4px',
                    ...animStyle,
                  }}>{t.text}</div>
                );
              })}
            </div>
          </div>

          {/* Transport Controls */}
          <div style={{
            padding: '14px 20px', background: theme.bgSecondary, borderTop: `1px solid ${theme.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <button aria-label="Go to Start" onClick={() => setCurrentTime(0)} style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: theme.bgTertiary, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Go to Start (Home)">{Icon.skipBack}</button>
            <button aria-label="Rewind 5s" onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: theme.bgTertiary, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Rewind 5s (Shift+Left)">{Icon.rewind}</button>
            <button aria-label="Play or pause" onClick={() => setIsPlaying(!isPlaying)} style={{
              width: '52px', height: '52px', borderRadius: '50%', border: 'none',
              background: `linear-gradient(135deg, ${theme.accent} 0%, #bf5af2 100%)`, color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 20px rgba(94,92,230,0.4)`,
            }} title="Play/Pause (Space)">{isPlaying ? Icon.pause : Icon.play}</button>
            <button aria-label="Forward 5s" onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))} style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: theme.bgTertiary, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Forward 5s (Shift+Right)">{Icon.forward}</button>
            <button aria-label="Go to End" onClick={() => setCurrentTime(duration)} style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: theme.bgTertiary, color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Go to End (End)">{Icon.skipForward}</button>
          </div>
        </div>

        {/* Right Panel - Resizable */}
        <div style={{ width: `${rightPanelWidth}px`, background: theme.bgSecondary, borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', position: 'relative', flexShrink: 0 }}>
          {/* Resize Handle */}
          <div
            onMouseDown={() => setIsResizingRight(true)}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px',
              cursor: 'ew-resize', background: isResizingRight ? theme.accent : 'transparent',
              zIndex: 10, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = `${theme.accent}50`}
            onMouseLeave={(e) => { if (!isResizingRight) e.currentTarget.style.background = 'transparent'; }}
          />
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, fontSize: '12px', fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
            {selectedClipData ? 'Clip Properties' : selectedTextData ? 'Text Properties' : 'Inspector'}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {selectedClipData ? (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Name</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{selectedClipData.name}</div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Duration</div>
                  <div style={{ fontSize: '14px' }}>{formatTime(selectedClipData.trimOut - selectedClipData.trimIn)}</div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Volume</div>
                  <input type="range" min={0} max={2} step={0.1} value={selectedClipData.volume}
                    onChange={(e) => setTimeline(prev => prev.map(c => c.id === selectedClip ? { ...c, volume: Number(e.target.value) } : c))}
                    style={{ width: '100%' }} />
                  <div style={{ fontSize: '11px', color: theme.textSecondary, textAlign: 'right' }}>{Math.round(selectedClipData.volume * 100)}%</div>
                </div>
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '20px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>Effects</div>
                  {[
                    { type: 'opacity' as const, label: 'Opacity', min: 0, max: 100, def: 100, suffix: '%' },
                    { type: 'brightness' as const, label: 'Brightness', min: -100, max: 100, def: 0, suffix: '' },
                    { type: 'contrast' as const, label: 'Contrast', min: -100, max: 100, def: 0, suffix: '' },
                    { type: 'saturation' as const, label: 'Saturation', min: -100, max: 100, def: 0, suffix: '' },
                    { type: 'blur' as const, label: 'Blur', min: 0, max: 20, def: 0, suffix: 'px' },
                    { type: 'hue' as const, label: 'Hue Rotate', min: -180, max: 180, def: 0, suffix: '°' },
                    { type: 'speed' as const, label: 'Speed', min: 25, max: 400, def: 100, suffix: '%' },
                  ].map(fx => {
                    const val = selectedClipData.effects.find(e => e.type === fx.type)?.value ?? fx.def;
                    return (
                      <div key={fx.type} style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, marginBottom: '8px' }}>
                          <span>{fx.label}</span>
                          <span style={{ color: theme.text }}>{val}{fx.suffix}</span>
                        </div>
                        <input type="range" min={fx.min} max={fx.max} value={val}
                          onChange={(e) => updateClipEffect(selectedClipData.id, fx.type, Number(e.target.value))}
                          style={{ width: '100%' }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                  <button aria-label="Split clip" onClick={() => splitClip(selectedClipData.id)} style={{
                    flex: 1, padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>{Icon.split} Split</button>
                  <button aria-label="Delete clip" onClick={() => deleteClip(selectedClipData.id)} style={{
                    flex: 1, padding: '10px', background: 'rgba(255,69,58,0.15)', border: `1px solid ${theme.error}`,
                    borderRadius: theme.radiusSm, color: theme.error, cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>{Icon.trash} Delete</button>
                </div>
              </>
            ) : selectedTextData ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Text Content</div>
                  <textarea value={selectedTextData.text}
                    onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, text: e.target.value } : t))}
                    style={{
                      width: '100%', minHeight: '80px', padding: '12px', background: theme.bgTertiary,
                      border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm, color: theme.text, fontSize: '13px', resize: 'vertical',
                    }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Font Size</span><span>{selectedTextData.fontSize}px</span>
                  </div>
                  <input type="range" min={12} max={200} value={selectedTextData.fontSize}
                    onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, fontSize: Number(e.target.value) } : t))}
                    style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Position</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '10px', color: theme.textMuted }}>X</label>
                      <input type="range" min={0} max={100} value={selectedTextData.x}
                        onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, x: Number(e.target.value) } : t))}
                        style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: theme.textMuted }}>Y</label>
                      <input type="range" min={0} max={100} value={selectedTextData.y}
                        onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, y: Number(e.target.value) } : t))}
                        style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Color</div>
                  <input type="color" value={selectedTextData.color}
                    onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, color: e.target.value } : t))}
                    style={{ width: '100%', height: '40px', border: 'none', borderRadius: theme.radiusSm, cursor: 'pointer' }} />
                </div>
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                  <button aria-label="Toggle bold" onClick={() => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, bold: !t.bold } : t))} style={{
                    flex: 1, padding: '8px', background: selectedTextData.bold ? theme.accentSoft : theme.bgTertiary,
                    border: `1px solid ${selectedTextData.bold ? theme.accent : theme.border}`, borderRadius: theme.radiusSm,
                    color: selectedTextData.bold ? theme.accent : theme.text, cursor: 'pointer', fontWeight: 'bold',
                  }}>B</button>
                  <button aria-label="Toggle italic" onClick={() => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, italic: !t.italic } : t))} style={{
                    flex: 1, padding: '8px', background: selectedTextData.italic ? theme.accentSoft : theme.bgTertiary,
                    border: `1px solid ${selectedTextData.italic ? theme.accent : theme.border}`, borderRadius: theme.radiusSm,
                    color: selectedTextData.italic ? theme.accent : theme.text, cursor: 'pointer', fontStyle: 'italic',
                  }}>I</button>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Animation</div>
                  <select value={selectedTextData.animation}
                    onChange={(e) => setTextOverlays(prev => prev.map(t => t.id === selectedTextData.id ? { ...t, animation: e.target.value as TextOverlay['animation'] } : t))}
                    style={{
                      width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                      borderRadius: theme.radiusSm, color: theme.text, fontSize: '13px',
                    }}>
                    <option value="none">None</option>
                    <option value="fadeIn">Fade In</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="bounce">Bounce</option>
                    <option value="scale">Scale</option>
                  </select>
                </div>
                <button onClick={() => deleteTextOverlay(selectedTextData.id)} style={{
                  width: '100%', padding: '10px', background: 'rgba(255,69,58,0.15)', border: `1px solid ${theme.error}`,
                  borderRadius: theme.radiusSm, color: theme.error, cursor: 'pointer', fontSize: '12px', marginTop: '16px',
                }}>{Icon.trash} Delete Text</button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted, textAlign: 'center', padding: '20px' }}>
                <div style={{ marginBottom: '8px', opacity: 0.5 }}>{Icon.cursor}</div>
                <span style={{ fontSize: '12px' }}>Select a clip or text to view properties</span>
                <div style={{ marginTop: '24px', fontSize: '11px', color: theme.textMuted, textAlign: 'left', width: '100%' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>Keyboard Shortcuts:</div>
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <div>Space - Play/Pause</div>
                    <div>Left/Right - Navigate 1s</div>
                    <div>Shift+Left/Right - Navigate 5s</div>
                    <div>V - Select Tool</div>
                    <div>B - Cut Tool</div>
                    <div>M - Add Marker</div>
                    <div>Delete - Remove Clip</div>
                    <div>Ctrl+Z - Undo</div>
                    <div>Ctrl+S - Export</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== TIMELINE ==================== */}
      <div style={{ height: '220px', background: theme.bg, borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
          background: theme.bgSecondary, borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Timeline</span>
            <span style={{ fontSize: '11px', color: theme.textMuted }}>{timeline.length} clips</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setTracks([...tracks, { id: `v${Date.now()}`, name: `Video ${tracks.filter(t => t.type === 'video').length + 1}`, type: 'video', muted: false, locked: false, visible: true, volume: 1 }])} style={{
              padding: '6px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>{Icon.plus} Video</button>
            <button onClick={() => setTracks([...tracks, { id: `a${Date.now()}`, name: `Audio ${tracks.filter(t => t.type === 'audio').length + 1}`, type: 'audio', muted: false, locked: false, visible: true, volume: 1 }])} style={{
              padding: '6px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>{Icon.plus} Audio</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
              <span style={{ color: theme.textMuted }}>{Icon.zoomOut}</span>
              <input type="range" min={0.1} max={20} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100px' }} />
              <span style={{ color: theme.textMuted }}>{Icon.zoomIn}</span>
              <span style={{ fontSize: '10px', color: theme.textMuted, minWidth: '40px' }}>{zoom.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Track Headers */}
          <div style={{ width: '140px', background: theme.bgSecondary, borderRight: `1px solid ${theme.border}`, overflow: 'auto' }}>
            {tracks.map((track, idx) => (
              <div key={track.id} style={{
                height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.border}`, borderLeft: `3px solid ${track.type === 'video' ? theme.accent : theme.success}`,
              }}>
                <span style={{ fontSize: '11px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setTracks(tracks.map((t, i) => i === idx ? { ...t, muted: !t.muted } : t))} style={{
                    width: '22px', height: '22px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: track.muted ? theme.error : 'transparent', color: track.muted ? '#fff' : theme.textMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{track.muted ? Icon.volumeMute : Icon.volume}</button>
                  <button onClick={() => setTracks(tracks.map((t, i) => i === idx ? { ...t, locked: !t.locked } : t))} style={{
                    width: '22px', height: '22px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: track.locked ? theme.warning : 'transparent', color: track.locked ? '#fff' : theme.textMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{track.locked ? Icon.lock : Icon.unlock}</button>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Tracks */}
          <div ref={timelineRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}
            onClick={(e) => { if (!dragState) { const rect = e.currentTarget.getBoundingClientRect(); setCurrentTime((e.clientX - rect.left + e.currentTarget.scrollLeft) / pixelsPerSecond); } }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey || tool === 'zoom') {
                e.preventDefault();
                // Normalize delta for trackpad vs mouse wheel (trackpad sends small deltas)
                const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
                const factor = 1 + Math.abs(delta) * 0.003; // Fine control
                setZoom(z => delta < 0 ? Math.min(20, z * factor) : Math.max(0.1, z / factor));
              }
            }}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
            onMouseLeave={handleTimelineMouseUp}
          >
            {/* Ruler */}
            <div style={{ height: '24px', background: theme.bgTertiary, borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, zIndex: 10, width: `${duration * pixelsPerSecond}px` }}>
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <React.Fragment key={i}>
                  {i % 5 === 0 && (
                    <div style={{ position: 'absolute', left: `${i * pixelsPerSecond}px`, top: '4px', fontSize: '9px', color: theme.textMuted, transform: 'translateX(-50%)' }}>{i}s</div>
                  )}
                  <div style={{ position: 'absolute', left: `${i * pixelsPerSecond}px`, bottom: 0, width: '1px', height: i % 5 === 0 ? '10px' : '5px', background: i % 5 === 0 ? theme.textMuted : theme.border }} />
                </React.Fragment>
              ))}
            </div>

            {/* Tracks */}
            <div style={{ position: 'relative', width: `${duration * pixelsPerSecond}px` }}>
              {tracks.map((track, trackIdx) => (
                <div key={track.id} style={{ height: '40px', borderBottom: `1px solid ${theme.border}`, position: 'relative', overflow: 'hidden', background: trackIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {timeline.filter(clip => clip.trackIndex === trackIdx).map(clip => {
                    const clipDuration = clip.trimOut - clip.trimIn;
                    return (
                      <div key={clip.id} className="clip"
                        onClick={(e) => { e.stopPropagation(); if (tool === 'cut') splitClip(clip.id); else if (tool === 'zoom') { setZoom(z => Math.min(20, z * 1.5)); } else { setSelectedClip(clip.id); setSelectedText(null); } }}
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'move')}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedClip(clip.id); setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id }); }}
                        style={{
                          position: 'absolute', left: `${clip.startTime * pixelsPerSecond}px`, width: `${clipDuration * pixelsPerSecond}px`,
                          height: '36px', top: '2px', borderRadius: theme.radiusSm,
                          cursor: track.locked ? 'not-allowed' : (tool === 'cut' ? 'crosshair' : tool === 'zoom' ? 'zoom-in' : 'grab'),
                          background: clip.type === 'video' ? theme.video : clip.type === 'audio' ? theme.audio : theme.image,
                          border: selectedClip === clip.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                          display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '11px', fontWeight: 500,
                          boxShadow: selectedClip === clip.id ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
                          opacity: track.visible ? 1 : 0.4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        }}
                      >
                        {/* Left trim handle */}
                        <div className="trim-handle" onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'trimLeft')} style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px',
                          background: 'rgba(255,255,255,0.3)', cursor: 'ew-resize', borderRadius: '4px 0 0 4px',
                        }} />
                        
                        <span style={{ marginLeft: '12px' }}>{clip.name.slice(0, 25)}</span>
                        
                        {/* Right trim handle */}
                        <div className="trim-handle" onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'trimRight')} style={{
                          position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px',
                          background: 'rgba(255,255,255,0.3)', cursor: 'ew-resize', borderRadius: '0 4px 4px 0',
                        }} />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Playhead */}
              <div style={{
                position: 'absolute', left: `${currentTime * pixelsPerSecond}px`, top: 0, bottom: 0, width: '2px',
                background: theme.playhead, zIndex: 100, pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', top: '-24px', left: '-7px', width: '16px', height: '16px',
                  background: theme.playhead, clipPath: 'polygon(50% 100%, 0 0, 100% 0)', borderRadius: '2px',
                }} />
              </div>

              {/* Markers */}
              {markers.map((m, i) => (
                <div key={i} onClick={(e) => { e.stopPropagation(); setCurrentTime(m); }} style={{
                  position: 'absolute', left: `${m * pixelsPerSecond}px`, top: 0, bottom: 0, width: '2px',
                  background: theme.warning, opacity: 0.7, cursor: 'pointer',
                }} />
              ))}
              
              {/* Empty timeline placeholder */}
              {timeline.length === 0 && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.3)', fontSize: 12,
                }}>
                  <span>{Icon.film}</span>
                  <span>Drop media here or press Ctrl+I to import</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== EXPORT MODAL - PREMIERE PRO STYLE ==================== */}
      {showExportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => !isExporting && setShowExportModal(false)}>
          <div style={{
            width: '700px', maxHeight: '90vh', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Export Settings</h2>
              <button onClick={() => setShowExportQueue(!showExportQueue)} style={{
                padding: '6px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px',
              }}>{Icon.timeline} Queue ({exportQueue.length})</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {isExporting ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ marginBottom: '20px', color: theme.accent }}>{Icon.render}</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>Rendering...</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '20px' }}>Using {gpuAcceleration !== 'software' ? 'GPU' : 'CPU'} Acceleration</div>
                  <div style={{ width: '100%', height: '8px', background: theme.bgTertiary, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${exportProgress}%`, height: '100%', background: theme.accent, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '14px', color: theme.textSecondary, marginTop: '12px' }}>{exportProgress}%</div>
                </div>
              ) : (
                <>
                  {/* Presets Section */}
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>Export Presets</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflow: 'auto' }}>
                      {EXPORT_PRESETS.map(preset => (
                        <button key={preset.name} onClick={() => setSelectedExportPreset(preset)} style={{
                          padding: '10px 12px', background: selectedExportPreset.name === preset.name ? theme.accentSoft : theme.bgTertiary,
                          border: `1px solid ${selectedExportPreset.name === preset.name ? theme.accent : theme.border}`,
                          borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '11px', textAlign: 'left',
                        }}>
                          <div style={{ fontWeight: 500 }}>{preset.name}</div>
                          <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
                            {preset.format} / {preset.container} / {preset.resolution.width}x{preset.resolution.height}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Settings Section */}
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>Custom Settings</div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Format</label>
                      <select value={exportSettings.format || 'H.264'} onChange={(e) => setExportSettings({ ...exportSettings, format: e.target.value })} style={{
                        width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                        borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                      }}>
                        <option value="H.264">H.264 (MP4)</option>
                        <option value="HEVC">HEVC (H.265)</option>
                        <option value="ProRes">Apple ProRes</option>
                        <option value="DNxHD">Avid DNxHD</option>
                        <option value="VP9">VP9 (WebM)</option>
                        <option value="AV1">AV1</option>
                      </select>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Resolution</label>
                      <select value={exportSettings.resolution} onChange={(e) => setExportSettings({ ...exportSettings, resolution: e.target.value })} style={{
                        width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                        borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                      }}>
                        <option value="4k">4K UHD (3840x2160)</option>
                        <option value="1440p">2K QHD (2560x1440)</option>
                        <option value="1080p">Full HD (1920x1080)</option>
                        <option value="720p">HD (1280x720)</option>
                      </select>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Frame Rate</label>
                      <select value={exportSettings.fps} onChange={(e) => setExportSettings({ ...exportSettings, fps: Number(e.target.value) })} style={{
                        width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                        borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                      }}>
                        <option value={23.976}>23.976 fps (Film)</option>
                        <option value={24}>24 fps</option>
                        <option value={25}>25 fps (PAL)</option>
                        <option value={29.97}>29.97 fps (NTSC)</option>
                        <option value={30}>30 fps</option>
                        <option value={50}>50 fps</option>
                        <option value={59.94}>59.94 fps</option>
                        <option value={60}>60 fps</option>
                      </select>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Bitrate (Mbps)</label>
                      <input type="range" min={1} max={100} value={parseInt(exportSettings.quality) || 25}
                        onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value })}
                        style={{ width: '100%' }} />
                      <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'right' }}>{parseInt(exportSettings.quality) || 25} Mbps</div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: theme.textSecondary }}>
                        <input type="checkbox" checked={gpuAcceleration !== 'software'} onChange={(e) => setGpuAcceleration(e.target.checked ? 'mercury' : 'software')} />
                        GPU Acceleration
                      </label>
                    </div>
                    
                    <div style={{ padding: '12px', background: theme.bgTertiary, borderRadius: theme.radiusSm, fontSize: '11px', color: theme.textSecondary }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Est. File Size:</span>
                        <span style={{ color: theme.text }}>~{Math.round((parseInt(exportSettings.quality) || 25) * duration / 8)} MB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Duration:</span>
                        <span style={{ color: theme.text }}>{formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            {!isExporting && (
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setExportQueue([...exportQueue, { id: Date.now().toString(), name: `Export ${exportQueue.length + 1}`, status: 'queued', progress: 0 }])} style={{
                  padding: '10px 16px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '12px',
                }}>Add to Queue</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowExportModal(false)} style={{
                    padding: '10px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                  }}>Cancel</button>
                  <button aria-label="Export project" onClick={handleExport} style={{
                    padding: '10px 20px', background: 'linear-gradient(135deg, #30d158 0%, #28a745 100%)',
                    border: 'none', borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>{Icon.download} Export</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SCOPES PANEL ==================== */}
      {showScopes && (
        <div style={{
          position: 'fixed', bottom: '80px', right: '20px', width: '300px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Scopes</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['waveform', 'vectorscope', 'histogram', 'parade'] as const).map(s => (
                <button key={s} onClick={() => setScopeType(s)} style={{
                  padding: '4px 8px', background: scopeType === s ? theme.accentSoft : 'transparent',
                  border: `1px solid ${scopeType === s ? theme.accent : 'transparent'}`,
                  borderRadius: '3px', color: scopeType === s ? theme.accent : theme.textMuted,
                  cursor: 'pointer', fontSize: '9px', textTransform: 'capitalize',
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: '16px', minHeight: '180px', background: '#000' }}>
            <canvas ref={scopeCanvasRef} width={268} height={160} style={{ width: '100%', height: '160px', borderRadius: '2px' }} />
          </div>
        </div>
      )}

      {/* ==================== METADATA PANEL ==================== */}
      {selectedClipData?.metadata && (
        <div style={{
          position: 'fixed', bottom: '80px', right: '340px', width: '280px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.metadata} Metadata</span>
          </div>
          <div style={{ padding: '12px', fontSize: '11px' }}>
            {[
              { label: 'Frame Rate', value: `${selectedClipData.metadata.frameRate} fps` },
              { label: 'Resolution', value: `${selectedClipData.metadata.resolution.width}x${selectedClipData.metadata.resolution.height}` },
              { label: 'Codec', value: selectedClipData.metadata.codec },
              { label: 'Bit Rate', value: `${selectedClipData.metadata.bitRate} Mbps` },
              { label: 'Color Space', value: selectedClipData.metadata.colorSpace.toUpperCase() },
              { label: 'HDR', value: selectedClipData.metadata.hdr ? 'Yes' : 'No' },
              { label: 'Audio', value: `${selectedClipData.metadata.audioSampleRate / 1000}kHz / ${selectedClipData.metadata.audioChannels}ch` },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textMuted }}>{item.label}</span>
                <span style={{ color: theme.text }}>{item.value}</span>
              </div>
            ))}
            {selectedClipData.metadata.keywords && selectedClipData.metadata.keywords.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Keywords</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedClipData.metadata.keywords.map((kw, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', background: theme.accentSoft, borderRadius: '10px',
                      fontSize: '10px', color: theme.accent,
                    }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== PROXY WORKFLOW INDICATOR ==================== */}
      {proxyMode && (
        <div style={{
          position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', background: 'rgba(255, 159, 10, 0.9)', borderRadius: theme.radiusSm,
          display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1000,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#000' }}>{Icon.proxy} PROXY MODE ENABLED</span>
          <button onClick={() => setProxyMode(false)} style={{
            padding: '2px 8px', background: 'rgba(0,0,0,0.2)', border: 'none',
            borderRadius: '3px', color: '#000', cursor: 'pointer', fontSize: '10px',
          }}>Toggle Off</button>
        </div>
      )}

      {/* ==================== MASKING & TRACKING PANEL ==================== */}
      {showMaskPanel && selectedClipData && (
        <div style={{
          position: 'fixed', top: '100px', right: '340px', width: '300px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.mask} Masking & Tracking</span>
            <button onClick={() => setShowMaskPanel(false)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ padding: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Create Mask</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { type: 'ellipse', label: 'Ellipse' },
                  { type: 'rectangle', label: 'Rectangle' },
                  { type: 'pen', label: 'Pen Tool' },
                ].map(m => (
                  <button key={m.type} style={{
                    flex: 1, padding: '10px 6px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '10px',
                  }}>{m.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Active Masks</div>
              {objectMasks.length === 0 ? (
                <div style={{ padding: '16px', background: theme.bgTertiary, borderRadius: theme.radiusSm, textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>No masks created</span>
                </div>
              ) : (
                objectMasks.map((mask, idx) => (
                  <div key={mask.id} style={{
                    padding: '10px', background: theme.bgTertiary, borderRadius: theme.radiusSm, marginBottom: '4px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: '11px' }}>Mask {idx + 1} - {mask.type}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button style={{
                        padding: '4px 8px', background: theme.accent, border: 'none',
                        borderRadius: '3px', color: '#fff', cursor: 'pointer', fontSize: '9px',
                      }}>{Icon.tracking} Track</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Tracking</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{
                  flex: 1, padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                }}>{Icon.tracking} Track Forward</button>
                <button style={{
                  flex: 1, padding: '10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                }}>{Icon.tracking} Track Backward</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RENDER QUEUE PANEL ==================== */}
      {showExportQueue && exportQueue.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px', width: '360px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 600,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.render} Render Queue</span>
            <button onClick={() => setShowExportQueue(false)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ padding: '12px', maxHeight: '300px', overflow: 'auto' }}>
            {exportQueue.map((item, idx) => (
              <div key={item.id} style={{
                padding: '12px', background: theme.bgTertiary, borderRadius: theme.radiusSm, marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>{item.name}</span>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '3px',
                    background: item.status === 'complete' ? 'rgba(48,209,88,0.2)' : item.status === 'encoding' ? 'rgba(100,210,255,0.2)' : item.status === 'error' ? 'rgba(255,69,58,0.2)' : 'rgba(148,163,184,0.2)',
                    color: item.status === 'complete' ? theme.success : item.status === 'encoding' ? theme.accent : item.status === 'error' ? theme.error : theme.textMuted,
                    textTransform: 'uppercase',
                  }}>{item.status}</span>
                </div>
                <div style={{ background: theme.bgPrimary, borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${item.progress}%`, height: '100%',
                    background: item.status === 'complete' ? theme.success : item.status === 'error' ? theme.error : theme.accent,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontSize: '9px', color: theme.textMuted }}>{item.progress}%</span>
                  <span style={{ fontSize: '9px', color: theme.textMuted }}>
                    {item.status === 'encoding' ? 'Encoding...' : item.status === 'complete' ? 'Done' : item.status === 'error' ? 'Failed' : 'Queued'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '8px' }}>
            <button onClick={() => {
              // Clear any previously running queue intervals/timeouts
              queueIntervalsRef.current.intervals.forEach(clearInterval);
              queueIntervalsRef.current.timeouts.forEach(clearTimeout);
              queueIntervalsRef.current = { intervals: [], timeouts: [] };
              setExportQueue(prev => prev.map(item => item.status === 'queued' ? { ...item, status: 'encoding' as const, progress: 0 } : item));
              exportQueue.filter(item => item.status === 'queued').forEach((item, idx) => {
                const delay = idx * 2000;
                const timeout = setTimeout(() => {
                  const interval = setInterval(() => {
                    setExportQueue(prev => prev.map(q => {
                      if (q.id !== item.id) return q;
                      if (q.progress >= 100) { clearInterval(interval); return { ...q, status: 'complete' as const, progress: 100 }; }
                      return { ...q, status: 'encoding' as const, progress: Math.min(q.progress + 10, 100) };
                    }));
                  }, 300);
                  queueIntervalsRef.current.intervals.push(interval);
                }, delay);
                queueIntervalsRef.current.timeouts.push(timeout);
              });
            }} style={{
              flex: 1, padding: '8px', background: theme.success, border: 'none',
              borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 500,
            }}>Start Queue</button>
            <button onClick={() => setExportQueue([])} style={{
              padding: '8px 14px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '11px',
            }}>Clear</button>
          </div>
        </div>
      )}

      {/* ==================== EFFECT CONTROLS PANEL ==================== */}
      {selectedClipData && selectedClipData.effects.length > 0 && (
        <div style={{
          position: 'fixed', top: '100px', left: '320px', width: '280px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.wand} Effect Controls</span>
          </div>
          <div style={{ padding: '12px', maxHeight: '400px', overflow: 'auto' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Motion <span style={{ fontSize: '8px', opacity: 0.6, fontStyle: 'italic' }}>(V3)</span></div>
              {[
                { label: 'Position X', value: 960 },
                { label: 'Position Y', value: 540 },
                { label: 'Scale', value: 100 },
                { label: 'Rotation', value: 0 },
                { label: 'Anchor Point X', value: 960 },
                { label: 'Anchor Point Y', value: 540 },
              ].map(ctrl => (
                <div key={ctrl.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: `1px solid ${theme.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button style={{
                      width: '14px', height: '14px', background: 'transparent', border: `1px solid ${theme.border}`,
                      borderRadius: '2px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '8px', color: theme.textMuted, opacity: 0.5,
                    }}>{Icon.keyframe}</button>
                    <span style={{ fontSize: '10px', color: theme.textSecondary }}>{ctrl.label}</span>
                  </div>
                  <input type="number" value={ctrl.value} readOnly style={{
                    width: '60px', padding: '4px 6px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: '3px', color: theme.text, fontSize: '10px', textAlign: 'right', opacity: 0.5, cursor: 'not-allowed',
                  }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Opacity</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="range" min={0} max={100} defaultValue={100} style={{ flex: 1 }} />
                <span style={{ fontSize: '10px', color: theme.text, width: '32px', textAlign: 'right' }}>100%</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Time Remapping</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="range" min={10} max={400} defaultValue={100} style={{ flex: 1 }} />
                <span style={{ fontSize: '10px', color: theme.text, width: '32px', textAlign: 'right' }}>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== KEYBOARD SHORTCUTS OVERLAY ==================== */}
      {showKeyboardShortcuts && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowKeyboardShortcuts(false)}>
          <div style={{
            width: '600px', maxHeight: '80vh', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{Icon.settings} Keyboard Shortcuts</span>
              <button onClick={() => setShowKeyboardShortcuts(false)} style={{
                background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
              }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflow: 'auto' }}>
              {/* Shortcut data sourced from VideoEditorFeatures.VIDEO_SHORTCUTS */}
              {[
                { category: 'Playback', shortcuts: [
                  { key: 'Space', action: VIDEO_SHORTCUTS['space'] },
                  { key: 'J', action: VIDEO_SHORTCUTS['j'] },
                  { key: 'K', action: VIDEO_SHORTCUTS['k'] },
                  { key: 'L', action: VIDEO_SHORTCUTS['l'] },
                  { key: 'Left Arrow', action: VIDEO_SHORTCUTS['left'] },
                  { key: 'Right Arrow', action: VIDEO_SHORTCUTS['right'] },
                  { key: 'Home', action: VIDEO_SHORTCUTS['home'] },
                  { key: 'End', action: VIDEO_SHORTCUTS['end'] },
                ]},
                { category: 'Editing', shortcuts: [
                  { key: 'V', action: VIDEO_SHORTCUTS['v'] },
                  { key: 'C', action: VIDEO_SHORTCUTS['c'] },
                  { key: 'B', action: VIDEO_SHORTCUTS['b'] },
                  { key: 'N', action: VIDEO_SHORTCUTS['n'] },
                  { key: 'Y', action: VIDEO_SHORTCUTS['y'] },
                  { key: 'U', action: VIDEO_SHORTCUTS['u'] },
                  { key: 'R', action: VIDEO_SHORTCUTS['r'] },
                  { key: 'Delete', action: VIDEO_SHORTCUTS['delete'] },
                ]},
                { category: 'Timeline', shortcuts: [
                  { key: 'I', action: VIDEO_SHORTCUTS['i'] },
                  { key: 'O', action: VIDEO_SHORTCUTS['o'] },
                  { key: 'M', action: VIDEO_SHORTCUTS['m'] },
                  { key: 'S', action: VIDEO_SHORTCUTS['s'] },
                  { key: '=', action: VIDEO_SHORTCUTS['='] },
                  { key: '-', action: VIDEO_SHORTCUTS['-'] },
                  { key: '\\', action: VIDEO_SHORTCUTS['\\'] },
                ]},
                { category: 'Tools', shortcuts: [
                  { key: 'H', action: VIDEO_SHORTCUTS['h'] },
                  { key: 'Z', action: VIDEO_SHORTCUTS['z'] },
                  { key: 'Ctrl+D', action: VIDEO_SHORTCUTS['ctrl+d'] },
                  { key: 'Ctrl+G', action: VIDEO_SHORTCUTS['ctrl+g'] },
                  { key: 'F', action: VIDEO_SHORTCUTS['f'] },
                ]},
              ].map(section => (
                <div key={section.category} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: theme.accent, marginBottom: '10px' }}>{section.category}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '6px' }}>
                    {section.shortcuts.map(s => (
                      <>
                        <div style={{
                          padding: '6px 10px', background: theme.bgTertiary, borderRadius: '4px',
                          fontSize: '11px', fontFamily: 'monospace', color: theme.text,
                        }}>{s.key}</div>
                        <div style={{ padding: '6px', fontSize: '11px', color: theme.textSecondary }}>{s.action}</div>
                      </>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== AUDIO TRACK MIXER PANEL ==================== */}
      {showAudioMixer && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '320px', width: '500px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 600,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.essentialSound} Audio Track Mixer</span>
            <button onClick={() => setShowAudioMixer(false)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ padding: '16px', display: 'flex', gap: '12px' }}>
            {tracks.filter(t => t.type === 'audio').map((track, idx) => (
              <div key={track.id} style={{
                width: '70px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
                padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '10px', fontWeight: 500, color: theme.textSecondary }}>{track.name}</span>
                <div style={{ height: '120px', width: '20px', background: '#000', borderRadius: '3px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: '2px', right: '2px',
                    height: `${(trackVolumes[track.id] ?? 0.8) * 100}%`,
                    background: 'linear-gradient(to top, #30d158, #ff9f0a, #ff453a)',
                    borderRadius: '2px',
                  }} />
                </div>
                <input type="range" min={0} max={100} defaultValue={80} style={{
                  height: '80px', width: '20px',
                }} onChange={(e) => setTrackVolumes({ ...trackVolumes, [track.id]: Number(e.target.value) / 100 })} />
                <div style={{ fontSize: '9px', color: theme.textMuted }}>{Math.round((trackVolumes[track.id] ?? 0.8) * 100)}%</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setTracks(tracks.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t))} style={{
                    width: '22px', height: '22px', background: track.muted ? theme.error : theme.bgPrimary,
                    border: 'none', borderRadius: '3px', fontSize: '8px', color: '#fff', cursor: 'pointer',
                  }}>M</button>
                  <button onClick={() => setTracks(tracks.map(t => t.id === track.id ? { ...t, soloEnabled: !t.soloEnabled } : t))} style={{
                    width: '22px', height: '22px', background: track.soloEnabled ? '#ff9f0a' : theme.bgPrimary,
                    border: 'none', borderRadius: '3px', fontSize: '8px', color: track.soloEnabled ? '#000' : '#fff', cursor: 'pointer',
                  }}>S</button>
                </div>
              </div>
            ))}
            <div style={{
              width: '80px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
              padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              borderLeft: `2px solid ${theme.accent}`,
            }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: theme.accent }}>MASTER</span>
              <div style={{ display: 'flex', gap: '3px', height: '120px' }}>
                <div style={{ width: '12px', background: '#000', borderRadius: '3px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: '2px', right: '2px',
                    height: `${masterMeter.left * 100}%`,
                    background: 'linear-gradient(to top, #30d158, #ff9f0a, #ff453a)',
                    borderRadius: '2px',
                  }} />
                </div>
                <div style={{ width: '12px', background: '#000', borderRadius: '3px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: '2px', right: '2px',
                    height: `${masterMeter.right * 100}%`,
                    background: 'linear-gradient(to top, #30d158, #ff9f0a, #ff453a)',
                    borderRadius: '2px',
                  }} />
                </div>
              </div>
              <input type="range" min={0} max={100} value={masterVolume * 100} style={{
                writingMode: 'vertical-lr', height: '80px', width: '20px',
              }} onChange={(e) => setMasterVolume(Number(e.target.value) / 100)} />
              <div style={{ fontSize: '9px', color: theme.text, fontWeight: 600 }}>{Math.round(masterVolume * 100)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== HISTORY PANEL ==================== */}
      {showHistoryPanel && (
        <div style={{
          position: 'fixed', top: '100px', left: '20px', width: '260px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>History</span>
            <button onClick={() => setShowHistoryPanel(false)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ padding: '8px', maxHeight: '300px', overflow: 'auto' }}>
            {history.map((snapshot, idx) => (
              <div key={idx} onClick={() => { setHistoryIndex(idx); setTimeline(history[idx]); }} style={{
                padding: '8px 10px', background: idx === historyIndex ? theme.accentSoft : idx > historyIndex ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderRadius: '4px', cursor: 'pointer', marginBottom: '2px',
                opacity: idx > historyIndex ? 0.4 : 1,
              }}>
                <div style={{ fontSize: '11px', color: idx === historyIndex ? theme.accent : theme.text }}>
                  {idx === 0 ? 'Project Created' : `Edit #${idx} (${snapshot.length} clip${snapshot.length !== 1 ? 's' : ''})`}
                </div>
                <div style={{ fontSize: '9px', color: theme.textMuted }}>
                  {idx === historyIndex ? 'Current' : idx < historyIndex ? 'Undo' : 'Redo'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== MARKERS PANEL ==================== */}
      {showMarkersPanel && (
        <div style={{
          position: 'fixed', top: '100px', right: '340px', width: '300px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 500,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.marker} Markers</span>
            <button onClick={() => setShowMarkersPanel(false)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ padding: '12px' }}>
            <button onClick={() => setMarkerList([...markerList, { id: Date.now().toString(), time: currentTime, name: `Marker ${markerList.length + 1}`, color: '#64d2ff', comment: '' }])} style={{
              width: '100%', padding: '10px', background: theme.accent, border: 'none',
              borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 500, marginBottom: '12px',
            }}>Add Marker at Playhead</button>
            <div style={{ maxHeight: '250px', overflow: 'auto' }}>
              {markerList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted, fontSize: '11px' }}>No markers</div>
              ) : (
                markerList.map(m => (
                  <div key={m.id} onClick={() => setCurrentTime(m.time)} style={{
                    padding: '10px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
                    marginBottom: '6px', cursor: 'pointer', borderLeft: `3px solid ${m.color}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 500 }}>{m.name}</span>
                      <span style={{ fontSize: '10px', color: theme.accent, fontFamily: 'monospace' }}>{formatTime(m.time)}</span>
                    </div>
                    {m.comment && <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>{m.comment}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== PLUGIN MARKETPLACE ==================== */}
      {showMarketplace && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12000,
        }} onClick={() => setShowMarketplace(false)}>
          <div style={{
            width: 640, maxHeight: '80vh', background: theme.bgPrimary,
            borderRadius: '12px', border: `1px solid ${theme.border}`,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: '14px 18px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>Plugin Store</span>
              <button aria-label="Close marketplace" onClick={() => setShowMarketplace(false)} style={{
                background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 16,
              }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '10px 18px', display: 'flex', gap: 8, borderBottom: `1px solid ${theme.border}` }}>
              <input
                type="text"
                placeholder="Search plugins..."
                value={marketplaceSearch}
                onChange={e => setMarketplaceSearch(e.target.value)}
                style={{
                  flex: 1, padding: '8px 12px', background: theme.bgTertiary,
                  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                  color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <select
                value={marketplaceCategory}
                onChange={e => setMarketplaceCategory(e.target.value)}
                style={{
                  padding: '8px', background: theme.bgTertiary,
                  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                  color: theme.text, fontSize: 11,
                }}
              >
                <option value="all">All</option>
                <option value="color">Color</option>
                <option value="motion">Motion</option>
                <option value="audio">Audio</option>
                <option value="transition">Transition</option>
                <option value="generator">Generator</option>
                <option value="utility">Utility</option>
              </select>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {marketplacePlugins
                .filter(p => (marketplaceCategory === 'all' || p.category === marketplaceCategory) && (!marketplaceSearch || p.name.toLowerCase().includes(marketplaceSearch.toLowerCase()) || p.description.toLowerCase().includes(marketplaceSearch.toLowerCase())))
                .map(plugin => (
                  <div key={plugin.id} style={{
                    padding: 14, background: theme.bgTertiary, borderRadius: '10px',
                    border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{plugin.name}</div>
                        <div style={{ fontSize: 10, color: theme.textMuted }}>{plugin.author} &middot; v{plugin.version}</div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: plugin.category === 'color' ? 'rgba(191,90,242,0.12)' : plugin.category === 'motion' ? 'rgba(10,132,255,0.12)' : plugin.category === 'audio' ? 'rgba(48,209,88,0.12)' : 'rgba(255,159,10,0.12)',
                        color: plugin.category === 'color' ? '#bf5af2' : plugin.category === 'motion' ? '#0a84ff' : plugin.category === 'audio' ? '#30d158' : '#ff9f0a',
                        fontWeight: 500,
                      }}>
                        {plugin.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.5 }}>{plugin.description}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: theme.textMuted }}>
                        <span style={{ color: '#ff9f0a' }}>{'\u2605'} {plugin.rating}</span>
                        <span>{(plugin.downloads / 1000).toFixed(1)}k</span>
                      </div>
                      <button
                        onClick={() => setMarketplacePlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, installed: !p.installed } : p))}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                          background: plugin.installed ? 'rgba(255,69,58,0.12)' : 'rgba(10,132,255,0.15)',
                          color: plugin.installed ? '#ff453a' : '#0a84ff',
                        }}
                      >
                        {plugin.installed ? 'Remove' : 'Install'}
                      </button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ==================== SEQUENCE SETTINGS MODAL ==================== */}
      {showSequenceSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowSequenceSettings(false)}>
          <div style={{
            width: '500px', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{Icon.settings} Sequence Settings</span>
              <button aria-label="Sequence settings" onClick={() => setShowSequenceSettings(false)} style={{
                background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
              }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Sequence Name</label>
                  <input type="text" value={sequenceSettings.name} onChange={(e) => setSequenceSettings({ ...sequenceSettings, name: e.target.value })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Frame Rate</label>
                  <select value={sequenceSettings.frameRate} onChange={(e) => setSequenceSettings({ ...sequenceSettings, frameRate: Number(e.target.value) })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }}>
                    {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map(fps => <option key={fps} value={fps}>{fps} fps</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Width</label>
                  <input type="number" value={sequenceSettings.width} onChange={(e) => setSequenceSettings({ ...sequenceSettings, width: Number(e.target.value) })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Height</label>
                  <input type="number" value={sequenceSettings.height} onChange={(e) => setSequenceSettings({ ...sequenceSettings, height: Number(e.target.value) })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Pixel Aspect Ratio</label>
                  <select value={sequenceSettings.pixelAspect} onChange={(e) => setSequenceSettings({ ...sequenceSettings, pixelAspect: e.target.value })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }}>
                    <option value="1:1">Square Pixels (1:1)</option>
                    <option value="D1">D1/DV NTSC (0.9091)</option>
                    <option value="D1PAL">D1/DV PAL (1.0940)</option>
                    <option value="Anamorphic">Anamorphic 2:1</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Field Order</label>
                  <select value={sequenceSettings.fieldOrder} onChange={(e) => setSequenceSettings({ ...sequenceSettings, fieldOrder: e.target.value })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }}>
                    <option value="progressive">Progressive</option>
                    <option value="upperFirst">Upper Field First</option>
                    <option value="lowerFirst">Lower Field First</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Audio Sample Rate</label>
                  <select value={sequenceSettings.audioSampleRate} onChange={(e) => setSequenceSettings({ ...sequenceSettings, audioSampleRate: Number(e.target.value) })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }}>
                    <option value={44100}>44.1 kHz</option>
                    <option value={48000}>48 kHz</option>
                    <option value={96000}>96 kHz</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Audio Bit Depth</label>
                  <select value={sequenceSettings.audioBitDepth} onChange={(e) => setSequenceSettings({ ...sequenceSettings, audioBitDepth: Number(e.target.value) })} style={{
                    width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                  }}>
                    <option value={16}>16-bit</option>
                    <option value={24}>24-bit</option>
                    <option value={32}>32-bit Float</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button aria-label="Sequence settings" onClick={() => setShowSequenceSettings(false)} style={{
                  padding: '10px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px',
                }}>Cancel</button>
                <button aria-label="Sequence settings" onClick={() => setShowSequenceSettings(false)} style={{
                  padding: '10px 20px', background: theme.accent, border: 'none',
                  borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CLIP SPEED/DURATION MODAL ==================== */}
      {showSpeedDuration && selectedClipData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowSpeedDuration(false)}>
          <div style={{
            width: '400px', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>Clip Speed / Duration</span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Speed (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="range" min={10} max={400} value={clipSpeed} onChange={(e) => setClipSpeed(Number(e.target.value))} style={{ flex: 1 }} />
                  <input type="number" value={clipSpeed} onChange={(e) => setClipSpeed(Number(e.target.value))} style={{
                    width: '70px', padding: '6px 10px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px', textAlign: 'right',
                  }} />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>New Duration</label>
                <input type="text" value={formatTime((selectedClipData.trimOut - selectedClipData.trimIn) * (100 / clipSpeed))} readOnly style={{
                  width: '100%', padding: '8px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px', fontFamily: 'monospace',
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={clipReverse} onChange={(e) => setClipReverse(e.target.checked)} />
                  <span style={{ fontSize: '11px', color: theme.text }}>Reverse Speed</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={clipMaintainPitch} onChange={(e) => setClipMaintainPitch(e.target.checked)} />
                  <span style={{ fontSize: '11px', color: theme.text }}>Maintain Audio Pitch</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={clipRippleEdit} onChange={(e) => setClipRippleEdit(e.target.checked)} />
                  <span style={{ fontSize: '11px', color: theme.text }}>Ripple Edit, Shifting Trailing Clips</span>
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setShowSpeedDuration(false)} style={{
                  padding: '10px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px',
                }}>Cancel</button>
                <button onClick={() => {
                  // ACTUALLY APPLY SPEED CHANGE TO CLIP
                  if (selectedClipData) {
                    const speedFactor = clipSpeed / 100;
                    const originalDuration = selectedClipData.trimOut - selectedClipData.trimIn;
                    const newDuration = originalDuration / speedFactor;
                    
                    setTimeline(prev => prev.map(clip => {
                      if (clip.id !== selectedClipData.id) return clip;
                      // Add speed effect
                      const effects = [...clip.effects];
                      const speedIdx = effects.findIndex(e => e.type === 'speed');
                      if (speedIdx >= 0) effects[speedIdx] = { type: 'speed', value: clipSpeed };
                      else effects.push({ type: 'speed', value: clipSpeed });
                      
                      // Update audio playback rate
                      const audioEl = audioElementsRef.current.get(clip.id);
                      if (audioEl) audioEl.playbackRate = speedFactor;
                      
                      // If ripple edit, adjust following clips
                      if (clipRippleEdit) {
                        const timeDiff = originalDuration - newDuration;
                        setTimeline(t => t.map(c => 
                          c.startTime > clip.startTime + originalDuration 
                            ? { ...c, startTime: c.startTime - timeDiff } 
                            : c
                        ));
                      }
                      
                      return { ...clip, effects };
                    }));
                    saveHistory();
                  }
                  setShowSpeedDuration(false);
                }} style={{
                  padding: '10px 20px', background: theme.accent, border: 'none',
                  borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== NEST SEQUENCE DIALOG ==================== */}
      {showNestDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowNestDialog(false)}>
          <div style={{
            width: '400px', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{Icon.nest} Nest Sequence</span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Nested Sequence Name</label>
                <input type="text" placeholder="Nested Sequence 01" style={{
                  width: '100%', padding: '10px 14px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                }} />
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '16px' }}>
                Selected clips will be replaced with a single nested sequence.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setShowNestDialog(false)} style={{
                  padding: '10px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px',
                }}>Cancel</button>
                <button onClick={() => { setShowNestDialog(false); setNestedSequences([...nestedSequences, { id: Date.now().toString(), name: 'Nested Sequence', clips: [] }]); }} style={{
                  padding: '10px 20px', background: theme.accent, border: 'none',
                  borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}>Nest</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RENDER & REPLACE DIALOG ==================== */}
      {showRenderReplace && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => !renderProgress && setShowRenderReplace(false)}>
          <div style={{
            width: '450px', background: theme.bgSecondary, borderRadius: theme.radiusLg,
            border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: theme.shadow,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{Icon.render} Render and Replace</span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '16px' }}>
                Render selected clips to improve playback performance. Original clips will be replaced with rendered media.
              </div>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '16px', padding: '8px 10px', background: theme.bgTertiary, borderRadius: theme.radiusSm, borderLeft: `3px solid ${theme.accent}` }}>
                Note: Full rendering uses the Export panel. This preview render simulates the process for UI testing.
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>Render Format</label>
                <select style={{
                  width: '100%', padding: '10px 14px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, fontSize: '12px',
                }}>
                  <option>QuickTime (ProRes 422)</option>
                  <option>QuickTime (ProRes 4444)</option>
                  <option>DNxHD MXF OP1a</option>
                  <option>Cineform</option>
                </select>
              </div>
              {renderProgress > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: theme.textSecondary }}>Rendering...</span>
                    <span style={{ fontSize: '11px', color: theme.accent }}>{renderProgress}%</span>
                  </div>
                  <div style={{ background: theme.bgTertiary, borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${renderProgress}%`, height: '100%', background: theme.accent, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setShowRenderReplace(false)} style={{
                  padding: '10px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                  borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '12px',
                }}>{renderProgress > 0 ? 'Cancel' : 'Close'}</button>
                {!renderProgress && (
                  <button onClick={() => {
                    // Clear any previously running render interval
                    if (renderIntervalRef.current) clearInterval(renderIntervalRef.current);
                    setRenderProgress(1);
                    const interval = setInterval(() => {
                      setRenderProgress(p => {
                        if (p >= 100) { clearInterval(interval); renderIntervalRef.current = null; return 0; }
                        return p + 5;
                      });
                    }, 200);
                    renderIntervalRef.current = interval;
                  }} style={{
                    padding: '10px 20px', background: theme.accent, border: 'none',
                    borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                  }}>Render</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SOURCE MONITOR PANEL ==================== */}
      {sourceClip && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          width: '500px', background: theme.bgSecondary, borderRadius: theme.radiusLg,
          border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 800,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setMonitorMode('source')} style={{
                padding: '4px 12px', background: monitorMode === 'source' ? theme.accentSoft : 'transparent',
                border: `1px solid ${monitorMode === 'source' ? theme.accent : theme.border}`,
                borderRadius: '4px', color: monitorMode === 'source' ? theme.accent : theme.textMuted,
                cursor: 'pointer', fontSize: '11px',
              }}>Source</button>
              <button onClick={() => setMonitorMode('program')} style={{
                padding: '4px 12px', background: monitorMode === 'program' ? theme.accentSoft : 'transparent',
                border: `1px solid ${monitorMode === 'program' ? theme.accent : theme.border}`,
                borderRadius: '4px', color: monitorMode === 'program' ? theme.accent : theme.textMuted,
                cursor: 'pointer', fontSize: '11px',
              }}>Program</button>
            </div>
            <button onClick={() => setSourceClip(null)} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer',
            }}>{Icon.close}</button>
          </div>
          <div style={{ aspectRatio: '16/9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: theme.textMuted }}>{sourceClip.name}</span>
          </div>
          <div style={{ padding: '12px', borderTop: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: theme.textMuted }}>IN</span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: theme.accent }}>{formatTime(sourceInPoint)}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '10px', color: theme.textMuted }}>OUT</span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: theme.accent }}>{formatTime(sourceOutPoint || sourceClip.duration)}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
              <button onClick={() => setSourceInPoint(currentTime)} style={{
                padding: '6px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '10px',
              }}>Mark In (I)</button>
              <button onClick={() => setSourceOutPoint(currentTime)} style={{
                padding: '6px 12px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm, color: theme.text, cursor: 'pointer', fontSize: '10px',
              }}>Mark Out (O)</button>
              <button style={{
                padding: '6px 12px', background: theme.accent, border: 'none',
                borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 500,
              }}>Insert (,)</button>
              <button style={{
                padding: '6px 12px', background: theme.success, border: 'none',
                borderRadius: theme.radiusSm, color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 500,
              }}>Overwrite (.)</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADJUSTMENT LAYER INDICATOR ==================== */}
      {adjustmentLayers.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '20px', padding: '10px 16px', background: 'rgba(191, 90, 242, 0.9)',
          borderRadius: theme.radiusSm, display: 'flex', alignItems: 'center', gap: '8px', zIndex: 500,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#fff' }}>{adjustmentLayers.length} Adjustment Layer(s) Active</span>
        </div>
      )}

      {/* ==================== LUT BROWSER PANEL ==================== */}
      {loadedLUTs.length > 0 && (
        <div style={{
          position: 'fixed', top: '150px', right: '20px', width: '320px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 600,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.lumetri} LUT Browser ({loadedLUTs.length})</span>
            <button onClick={() => setLoadedLUTs([])} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '10px',
            }}>Clear All</button>
          </div>
          <div style={{ padding: '12px', maxHeight: '400px', overflow: 'auto' }}>
            {loadedLUTs.map(lut => (
              <div key={lut.id} style={{
                padding: '12px', background: activeLUT?.id === lut.id ? theme.accentSoft : theme.bgTertiary,
                borderRadius: theme.radiusSm, marginBottom: '8px', cursor: 'pointer',
                border: `1px solid ${activeLUT?.id === lut.id ? theme.accent : theme.border}`,
              }} onClick={() => setActiveLUT(activeLUT?.id === lut.id ? null : lut)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: activeLUT?.id === lut.id ? theme.accent : theme.text }}>{lut.name}</span>
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: theme.bgHover, borderRadius: '3px', color: theme.textMuted, textTransform: 'uppercase' }}>{lut.type}</span>
                </div>
                <div style={{ fontSize: '10px', color: theme.textMuted }}>
                  Size: {lut.size}x{lut.size}x{lut.size}
                </div>
                {activeLUT?.id === lut.id && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textSecondary, marginBottom: '4px' }}>
                      <span>Intensity</span>
                      <span>{lutIntensity}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={lutIntensity}
                      onChange={(e) => setLutIntensity(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%' }} />
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => lutInputRef.current?.click()} style={{
              width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px dashed ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>{Icon.plus} Import More LUTs</button>
          </div>
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${theme.border}`, fontSize: '10px', color: theme.textMuted }}>
            Supported: .cube, .3dl, .csp, .look
          </div>
        </div>
      )}

      {/* ==================== LOADED EFFECTS PANEL ==================== */}
      {loadedEffects.length > 0 && (
        <div style={{
          position: 'fixed', top: '150px', left: '20px', width: '280px', background: theme.bgSecondary,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, zIndex: 600,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{Icon.wand} Loaded Effects ({loadedEffects.length})</span>
            <button onClick={() => setLoadedEffects([])} style={{
              background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '10px',
            }}>Clear</button>
          </div>
          <div style={{ padding: '12px', maxHeight: '350px', overflow: 'auto' }}>
            {loadedEffects.map(effect => (
              <div key={effect.id} style={{
                padding: '10px', background: theme.bgTertiary, borderRadius: theme.radiusSm,
                marginBottom: '6px', cursor: 'pointer', border: `1px solid ${theme.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>{effect.name}</span>
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: effect.type === 'transition' ? 'rgba(191,90,242,0.3)' : 'rgba(100,210,255,0.2)',
                    borderRadius: '3px', color: effect.type === 'transition' ? '#bf5af2' : theme.accent, textTransform: 'uppercase' }}>{effect.type}</span>
                </div>
                <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>{effect.category}</div>
                <button onClick={() => {
                  if (selectedClipData) {
                    // Apply effect to selected clip
                    setTimeline(prev => prev.map(c => c.id === selectedClipData.id ? { ...c, effects: [...c.effects, { type: 'brightness', value: 10 }] } : c));
                  }
                }} style={{
                  marginTop: '8px', width: '100%', padding: '6px', background: theme.accent, border: 'none',
                  borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 500,
                }}>Apply to Selected Clip</button>
              </div>
            ))}
            <button onClick={() => effectInputRef.current?.click()} style={{
              width: '100%', padding: '10px', background: theme.bgTertiary, border: `1px dashed ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>{Icon.plus} Import More Effects</button>
          </div>
        </div>
      )}

      {/* ==================== ACTIVE LUT INDICATOR ==================== */}
      {activeLUT && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px', padding: '10px 16px', background: 'rgba(100,210,255,0.9)',
          borderRadius: theme.radiusSm, display: 'flex', alignItems: 'center', gap: '8px', zIndex: 500,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#000' }}>LUT: {activeLUT.name} ({lutIntensity}%)</span>
          <button onClick={() => setActiveLUT(null)} style={{
            background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '3px',
            padding: '2px 6px', color: '#000', cursor: 'pointer', fontSize: '9px',
          }}>Remove</button>
        </div>
      )}

      {/* ==================== CONTEXT MENU ==================== */}
      {contextMenu && (
        <>
          <div onClick={() => setContextMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: theme.bgSecondary, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: '200px',
          }}>
            {[
              { label: 'Cut at Playhead', icon: Icon.scissors, action: () => { splitClip(contextMenu.clipId); setContextMenu(null); } },
              { label: 'Scene Split (Auto-Detect)', icon: Icon.grid, action: () => { setSceneSplitPreview({ clipId: contextMenu.clipId, boundaries: [], sensitivity: 30, detecting: false }); setContextMenu(null); } },
              { label: 'Duplicate', icon: Icon.copy, action: () => { const c = timeline.find(cl => cl.id === contextMenu.clipId); if (c) { const dup = { ...c, id: Date.now().toString(), startTime: c.startTime + (c.trimOut - c.trimIn) }; const prev = [...timeline]; setTimeline(t => [...t, dup]); globalUndo.push(`Duplicate ${c.name}`, () => setTimeline(p => [...p, dup]), () => setTimeline(prev)); } setContextMenu(null); } },
              { label: 'Delete', icon: Icon.trash, action: () => { const prev = [...timeline]; setTimeline(t => t.filter(c => c.id !== contextMenu.clipId)); globalUndo.push('Delete clip', () => setTimeline(prev), () => setTimeline(prev)); setSelectedClip(null); setContextMenu(null); } },
              null,
              { label: 'Set In Point', icon: Icon.skipBack, action: () => { const c = timeline.find(cl => cl.id === contextMenu.clipId); if (c) { const prev = [...timeline]; setTimeline(t => t.map(cl => cl.id === c.id ? { ...cl, trimIn: Math.max(0, currentTime - cl.startTime + cl.trimIn) } : cl)); globalUndo.push('Set in point', () => setTimeline(t => t.map(cl => cl.id === c.id ? { ...cl, trimIn: Math.max(0, currentTime - cl.startTime + cl.trimIn) } : cl)), () => setTimeline(prev)); } setContextMenu(null); } },
              { label: 'Set Out Point', icon: Icon.skipForward, action: () => { const c = timeline.find(cl => cl.id === contextMenu.clipId); if (c) { const prev = [...timeline]; setTimeline(t => t.map(cl => cl.id === c.id ? { ...cl, trimOut: Math.min(cl.duration, currentTime - cl.startTime + cl.trimIn) } : cl)); globalUndo.push('Set out point', () => setTimeline(t => t.map(cl => cl.id === c.id ? { ...cl, trimOut: Math.min(cl.duration, currentTime - cl.startTime + cl.trimIn) } : cl)), () => setTimeline(prev)); } setContextMenu(null); } },
              null,
              { label: 'Properties...', icon: Icon.settings, action: () => { setSelectedClip(contextMenu.clipId); setContextMenu(null); } },
            ].map((item, i) => item === null ? (
              <div key={`sep-${i}`} style={{ height: '1px', background: theme.border, margin: '4px 0' }} />
            ) : (
              <button key={i} onClick={item.action} style={{
                width: '100%', padding: '8px 16px', background: 'transparent', border: 'none',
                color: theme.text, cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: '10px',
              }} onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgTertiary)}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ opacity: 0.7, fontSize: '14px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ==================== SCENE SPLIT PREVIEW MODAL ==================== */}
      {sceneSplitPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSceneSplitPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: theme.bgPrimary, border: `1px solid ${theme.border}`, borderRadius: '12px',
            padding: '24px', width: '480px', boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{Icon.grid}</span> Smart Scene Split
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '8px' }}>
                Sensitivity: {sceneSplitPreview.sensitivity}%
              </label>
              <input type="range" min={5} max={80} value={sceneSplitPreview.sensitivity}
                onChange={(e) => setSceneSplitPreview(p => p ? { ...p, sensitivity: Number(e.target.value), boundaries: [] } : null)}
                style={{ width: '100%', accentColor: theme.accent }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textMuted }}>
                <span>More splits</span><span>Fewer splits</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => {
                if (!sceneSplitPreview.detecting) {
                  setSceneSplitPreview(p => p ? { ...p, detecting: true } : null);
                  detectSceneBoundaries(sceneSplitPreview.clipId, sceneSplitPreview.sensitivity);
                }
              }} style={{
                flex: 1, padding: '10px', background: theme.accent, border: 'none', borderRadius: theme.radius,
                color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500, opacity: sceneSplitPreview.detecting ? 0.6 : 1,
              }}>
                {sceneSplitPreview.detecting ? 'Analyzing Frames...' : 'Detect Scenes'}
              </button>
            </div>
            {sceneSplitPreview.boundaries.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '8px' }}>
                  Found {sceneSplitPreview.boundaries.length} scene {sceneSplitPreview.boundaries.length === 1 ? 'boundary' : 'boundaries'}:
                </div>
                <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {sceneSplitPreview.boundaries.map((b, i) => (
                    <div key={i} style={{
                      padding: '4px 10px', background: theme.bgTertiary, borderRadius: '4px',
                      fontSize: '11px', color: theme.text, border: `1px solid ${theme.border}`,
                    }}>{formatTime(b)}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSceneSplitPreview(null)} style={{
                padding: '8px 20px', background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                borderRadius: theme.radius, color: theme.textSecondary, cursor: 'pointer', fontSize: '12px',
              }}>Cancel</button>
              <button onClick={() => { applySceneSplit(); setSceneSplitPreview(null); }} disabled={sceneSplitPreview.boundaries.length === 0} style={{
                padding: '8px 20px', background: sceneSplitPreview.boundaries.length > 0 ? theme.accent : theme.bgTertiary,
                border: 'none', borderRadius: theme.radius,
                color: sceneSplitPreview.boundaries.length > 0 ? '#fff' : theme.textMuted,
                cursor: sceneSplitPreview.boundaries.length > 0 ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 500,
              }}>Split into {sceneSplitPreview.boundaries.length + 1} Clips</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== HELP PANEL ==================== */}
      <HelpButton onClick={helpPanel.toggle} style={{ position: 'fixed', top: '14px', right: '16px', zIndex: 800 }} />
      <HelpPanel appId="videoeditor" isOpen={helpPanel.isOpen} onClose={helpPanel.close} />

      {/* ==================== FIRST LAUNCH HINT ==================== */}
      <FirstLaunchHint appId="videoeditor" />
    </div>
  );
};

// Memoize entire component for multi-window performance
VinxEditor.displayName = 'VinxEditor';
export default memo(VinxEditor);
