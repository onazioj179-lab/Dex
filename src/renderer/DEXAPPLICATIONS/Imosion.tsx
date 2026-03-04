/**
 * DEX Platform - IMOSION Professional Audio Workstation
 * Copyright (c) 2026 DEX. All rights reserved.
 * Pro Recording DAW - Mixer Routing, Sample Manipulation, 32-bit Float
 * OPTIMIZED: Multi-window support, memory management, 10+ instances
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useRunningApps } from '../store/runningApps';
import { useBeginnerMode } from '../components/Onboarding';
import {
  REGION_TYPES,
  COMMON_TIME_SIGNATURES,
  DEFAULT_METRONOME,
  CLIP_COLORS,
  WAVEFORM_ZOOM_PRESETS,
  barsToSeconds,
  secondsToBars,
  formatTime as imosionFormatTime,
  formatBarPosition,
} from './ImosionFeatures';
import type { MetronomeSettings, Region, Marker } from './ImosionFeatures';
import {
  extractWaveformPeaks,
  audioBufferToAIFF,
  generateMetronomeClick,
  scheduleMetronome,
  computeMeterLevel,
  type AutomationLane,
  type AutomationPoint,
  getAutomationValue,
  drawAutomationLane,
} from './ImosionEngine';

// ==================== TYPES ====================
type RoutingDestination = 'master' | string; // master or bus ID

interface AudioTrack {
  id: string;
  name: string;
  type: 'audio';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
  clips: AudioClip[];
  plugins: TrackPlugin[];
  // Pro routing
  output: RoutingDestination;
  sends: TrackSend[];
  phase: boolean; // phase invert
  trim: number; // input trim dB
}

interface TrackSend {
  id: string;
  busId: string;
  level: number; // 0-1
  preFader: boolean;
}

interface AudioBus {
  id: string;
  name: string;
  type: 'aux' | 'group' | 'fx';
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  plugins: TrackPlugin[];
  output: RoutingDestination;
}

interface AudioClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  waveform: number[];
  gain: number;
  url?: string;
  // Sample manipulation
  fadeIn: number;
  fadeOut: number;
  pitch: number; // semitones
  stretch: number; // time stretch ratio 0.25-4
  reverse: boolean;
  trimStart: number; // sample offset
  trimEnd: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  // Tempo matching
  tempoLocked: boolean; // auto-match to project tempo
  originalBPM: number; // clip's original tempo
  // Key detection
  detectedKey: MusicalKey | null;
  detectedScale: MusicalScale | null;
  keyLocked: boolean; // auto-transpose to project key
  transposeAmount: number; // manual transpose in semitones
  // Warp mode for time stretching
  warpMode: 'beats' | 'texture' | 'tonal' | 'repitch' | 'complex';
  // Speed multiplier (independent of pitch when using certain warp modes)
  speedMultiplier: number; // 0.25x to 4x
}

interface TrackPlugin {
  id: string;
  type: PluginType;
  enabled: boolean;
  params: Record<string, number>;
}

interface RecordingTemplate {
  id: string;
  name: string;
  tracks: Omit<AudioTrack, 'clips'>[];
  buses: AudioBus[];
  bpm: number;
  sampleRate: number;
  bitDepth: BitDepth;
  createdAt: number;
}

type BitDepth = 16 | 24 | 32;

interface MasterSettings {
  volume: number;
  limiterEnabled: boolean;
  limiterCeiling: number;
  dithering: 'none' | 'triangular' | 'noise-shaped';
  oversampling: 1 | 2 | 4 | 8;
  // Enhanced mastering controls
  stereoWidth: number; // 0-200%
  bassEnhance: number; // 0-100%
  highShelf: number; // -12 to +12 dB
  lowShelf: number; // -12 to +12 dB
  midSideBalance: number; // -100 to 100 (negative = more side)
  multiband: {
    lowGain: number;
    midGain: number;
    highGain: number;
    lowFreq: number;
    highFreq: number;
  };
  analogWarmth: number; // 0-100%
  loudnessTarget: number; // -24 to 0 LUFS
}

// Mastering Presets - 10 professional presets
interface MasteringPreset {
  id: string;
  name: string;
  description: string;
  settings: Partial<MasterSettings>;
}

const MASTERING_PRESETS: MasteringPreset[] = [
  { id: 'transparent', name: 'Transparent Master', description: 'Clean, minimal processing for natural sound',
    settings: { volume: 0.95, limiterEnabled: true, limiterCeiling: -0.3, stereoWidth: 100, bassEnhance: 0, highShelf: 0, lowShelf: 0, midSideBalance: 0, multiband: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 200, highFreq: 4000 }, analogWarmth: 10, loudnessTarget: -14 }},
  { id: 'loud-modern', name: 'Loud & Modern', description: 'Punchy, competitive loudness for streaming',
    settings: { volume: 1, limiterEnabled: true, limiterCeiling: -0.1, stereoWidth: 110, bassEnhance: 25, highShelf: 1.5, lowShelf: 1, midSideBalance: 10, multiband: { lowGain: 1, midGain: 0.5, highGain: 1.5, lowFreq: 150, highFreq: 5000 }, analogWarmth: 30, loudnessTarget: -9 }},
  { id: 'warm-analog', name: 'Warm Analog', description: 'Vintage warmth and smooth highs',
    settings: { volume: 0.92, limiterEnabled: true, limiterCeiling: -0.5, stereoWidth: 95, bassEnhance: 15, highShelf: -1, lowShelf: 2, midSideBalance: -5, multiband: { lowGain: 1.5, midGain: 1, highGain: -0.5, lowFreq: 180, highFreq: 3500 }, analogWarmth: 70, loudnessTarget: -12 }},
  { id: 'hiphop', name: 'Hip-Hop / Trap', description: 'Heavy bass, crisp highs for urban music',
    settings: { volume: 1, limiterEnabled: true, limiterCeiling: -0.1, stereoWidth: 105, bassEnhance: 45, highShelf: 2, lowShelf: 3, midSideBalance: 0, multiband: { lowGain: 3, midGain: -0.5, highGain: 2, lowFreq: 120, highFreq: 6000 }, analogWarmth: 20, loudnessTarget: -8 }},
  { id: 'edm', name: 'EDM / Electronic', description: 'Wide stereo, punchy transients',
    settings: { volume: 1, limiterEnabled: true, limiterCeiling: -0.1, stereoWidth: 130, bassEnhance: 30, highShelf: 2.5, lowShelf: 2, midSideBalance: 15, multiband: { lowGain: 2, midGain: 0, highGain: 2.5, lowFreq: 100, highFreq: 8000 }, analogWarmth: 15, loudnessTarget: -7 }},
  { id: 'rock', name: 'Rock / Alternative', description: 'Balanced aggression with punch',
    settings: { volume: 0.98, limiterEnabled: true, limiterCeiling: -0.2, stereoWidth: 108, bassEnhance: 20, highShelf: 1, lowShelf: 1.5, midSideBalance: 5, multiband: { lowGain: 1.5, midGain: 1, highGain: 1, lowFreq: 150, highFreq: 4500 }, analogWarmth: 40, loudnessTarget: -10 }},
  { id: 'podcast', name: 'Podcast / Voice', description: 'Clear speech, consistent levels',
    settings: { volume: 0.9, limiterEnabled: true, limiterCeiling: -1, stereoWidth: 80, bassEnhance: 5, highShelf: 1.5, lowShelf: -2, midSideBalance: 0, multiband: { lowGain: -1, midGain: 2, highGain: 0.5, lowFreq: 250, highFreq: 3000 }, analogWarmth: 5, loudnessTarget: -16 }},
  { id: 'classical', name: 'Classical / Orchestral', description: 'Wide dynamics, natural space',
    settings: { volume: 0.85, limiterEnabled: true, limiterCeiling: -1, stereoWidth: 115, bassEnhance: 0, highShelf: 0.5, lowShelf: 0, midSideBalance: 20, multiband: { lowGain: 0, midGain: 0, highGain: 0.5, lowFreq: 200, highFreq: 5000 }, analogWarmth: 25, loudnessTarget: -18 }},
  { id: 'lofi', name: 'Lo-Fi / Chill', description: 'Warm, vintage character with rolled-off highs',
    settings: { volume: 0.88, limiterEnabled: true, limiterCeiling: -0.5, stereoWidth: 90, bassEnhance: 20, highShelf: -3, lowShelf: 2, midSideBalance: -10, multiband: { lowGain: 2, midGain: 1.5, highGain: -2, lowFreq: 200, highFreq: 3000 }, analogWarmth: 80, loudnessTarget: -14 }},
  { id: 'broadcast', name: 'Broadcast Ready', description: 'Meets broadcast standards (-24 LUFS)',
    settings: { volume: 0.8, limiterEnabled: true, limiterCeiling: -2, stereoWidth: 100, bassEnhance: 0, highShelf: 0, lowShelf: 0, midSideBalance: 0, multiband: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 200, highFreq: 4000 }, analogWarmth: 0, loudnessTarget: -24 }},
];

// Musical keys
type MusicalKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
type MusicalScale = 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian' | 'harmonic-minor' | 'melodic-minor' | 'pentatonic' | 'blues';

interface ProjectKey {
  root: MusicalKey;
  scale: MusicalScale;
}

// Export settings
interface ExportSettings {
  format: 'wav' | 'mp3' | 'flac' | 'ogg' | 'aiff';
  bitDepth: BitDepth;
  sampleRate: 22050 | 44100 | 48000 | 88200 | 96000 | 176400 | 192000 | 384000;
  normalizeLevel: number; // -12 to 0 dB
  includeMetadata: boolean;
  splitTracks: boolean; // Export each track separately
}

// Collaboration
interface CollaborationSession {
  id: string;
  name: string;
  hostId: string;
  participants: Collaborator[];
  isLive: boolean;
  createdAt: number;
  projectState: string; // JSON serialized project
}

interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor?: { trackId: string; time: number };
  isOnline: boolean;
  isRecording: boolean;
  role: 'host' | 'editor' | 'viewer';
}

interface CollabMessage {
  type: 'cursor' | 'edit' | 'chat' | 'sync' | 'recording';
  senderId: string;
  timestamp: number;
  data: any;
}

// Musical key constants
const MUSICAL_KEYS: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MUSICAL_SCALES: { value: MusicalScale; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'dorian', label: 'Dorian' },
  { value: 'phrygian', label: 'Phrygian' },
  { value: 'lydian', label: 'Lydian' },
  { value: 'mixolydian', label: 'Mixolydian' },
  { value: 'locrian', label: 'Locrian' },
  { value: 'harmonic-minor', label: 'Harmonic Minor' },
  { value: 'melodic-minor', label: 'Melodic Minor' },
  { value: 'pentatonic', label: 'Pentatonic' },
  { value: 'blues', label: 'Blues' },
];

// Export format options
const EXPORT_FORMATS: { value: 'wav' | 'mp3' | 'flac' | 'aiff' | 'ogg'; label: string; ext: string }[] = [
  { value: 'wav', label: 'WAV (Uncompressed)', ext: '.wav' },
  { value: 'mp3', label: 'MP3 (Compressed)', ext: '.mp3' },
  { value: 'flac', label: 'FLAC (Lossless)', ext: '.flac' },
  { value: 'aiff', label: 'AIFF (Uncompressed)', ext: '.aiff' },
  { value: 'ogg', label: 'OGG Vorbis', ext: '.ogg' },
];

type PluginType = 'eq' | 'compressor' | 'reverb' | 'delay' | 'chorus' | 'limiter' | 'gate' | 'deesser' | 'saturation' | 'autotune';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string | null;
  clipId: string | null;
  busId: string | null;
}

interface ClipEditState {
  clipId: string | null;
  trackId: string | null;
  mode: 'none' | 'move' | 'trim-start' | 'trim-end' | 'fade-in' | 'fade-out' | 'split';
  startX: number;
}

interface DragState {
  type: 'none' | 'clip' | 'track' | 'plugin' | 'file';
  sourceId: string | null;
  sourceTrackId: string | null;
  targetId: string | null;
  offsetX: number;
  offsetY: number;
  startTime: number;
}

interface ExternalPlugin {
  id: string;
  name: string;
  vendor: string;
  version: string;
  type: 'vst3' | 'au' | 'clap' | 'built-in';
  path?: string;
  category: string;
  installed: boolean;
  color: string;
}

interface PluginStore {
  featured: ExternalPlugin[];
  installed: ExternalPlugin[];
  searchResults: ExternalPlugin[];
}

// ==================== PLUGIN DEFINITIONS ====================
const PLUGIN_LIBRARY: Record<PluginType, { name: string; abbr: string; color: string; params: { key: string; label: string; min: number; max: number; default: number; unit: string }[] }> = {
  eq: { name: 'Parametric EQ', abbr: 'EQ', color: '#0a84ff', params: [
    { key: 'lowGain', label: 'Low', min: -24, max: 24, default: 0, unit: 'dB' },
    { key: 'midGain', label: 'Mid', min: -24, max: 24, default: 0, unit: 'dB' },
    { key: 'highGain', label: 'High', min: -24, max: 24, default: 0, unit: 'dB' },
    { key: 'lowFreq', label: 'LF', min: 20, max: 500, default: 100, unit: 'Hz' },
    { key: 'highFreq', label: 'HF', min: 2000, max: 20000, default: 8000, unit: 'Hz' },
  ]},
  compressor: { name: 'Compressor', abbr: 'CMP', color: '#bf5af2', params: [
    { key: 'threshold', label: 'Thresh', min: -60, max: 0, default: -20, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4, unit: ':1' },
    { key: 'attack', label: 'Atk', min: 0.1, max: 100, default: 10, unit: 'ms' },
    { key: 'release', label: 'Rel', min: 10, max: 1000, default: 100, unit: 'ms' },
    { key: 'makeupGain', label: 'Gain', min: 0, max: 24, default: 0, unit: 'dB' },
  ]},
  reverb: { name: 'Reverb', abbr: 'REV', color: '#64d2ff', params: [
    { key: 'roomSize', label: 'Room', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'damping', label: 'Damp', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    { key: 'predelay', label: 'Pre', min: 0, max: 100, default: 10, unit: 'ms' },
  ]},
  delay: { name: 'Delay', abbr: 'DLY', color: '#30d158', params: [
    { key: 'time', label: 'Time', min: 1, max: 2000, default: 250, unit: 'ms' },
    { key: 'feedback', label: 'FB', min: 0, max: 95, default: 40, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
  ]},
  chorus: { name: 'Chorus', abbr: 'CHR', color: '#ff375f', params: [
    { key: 'rate', label: 'Rate', min: 0.1, max: 10, default: 1, unit: 'Hz' },
    { key: 'depth', label: 'Depth', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
  ]},
  limiter: { name: 'Limiter', abbr: 'LIM', color: '#ff453a', params: [
    { key: 'ceiling', label: 'Ceil', min: -12, max: 0, default: -0.3, unit: 'dB' },
    { key: 'release', label: 'Rel', min: 1, max: 500, default: 50, unit: 'ms' },
    { key: 'gain', label: 'Gain', min: 0, max: 24, default: 0, unit: 'dB' },
  ]},
  gate: { name: 'Gate', abbr: 'GATE', color: '#ff9f0a', params: [
    { key: 'threshold', label: 'Thresh', min: -80, max: 0, default: -40, unit: 'dB' },
    { key: 'attack', label: 'Atk', min: 0.1, max: 50, default: 1, unit: 'ms' },
    { key: 'hold', label: 'Hold', min: 1, max: 500, default: 50, unit: 'ms' },
    { key: 'release', label: 'Rel', min: 5, max: 500, default: 100, unit: 'ms' },
  ]},
  deesser: { name: 'De-Esser', abbr: 'DSR', color: '#ff9f0a', params: [
    { key: 'frequency', label: 'Freq', min: 4000, max: 12000, default: 6000, unit: 'Hz' },
    { key: 'threshold', label: 'Thresh', min: -40, max: 0, default: -20, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 10, default: 4, unit: ':1' },
  ]},
  saturation: { name: 'Saturation', abbr: 'SAT', color: '#bf5af2', params: [
    { key: 'drive', label: 'Drive', min: 0, max: 100, default: 30, unit: '%' },
    { key: 'warmth', label: 'Warm', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
  ]},
  autotune: { name: 'Pitch Correct', abbr: 'TUNE', color: '#64d2ff', params: [
    { key: 'speed', label: 'Speed', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'scale', label: 'Key', min: 0, max: 11, default: 0, unit: '' },
    { key: 'humanize', label: 'Human', min: 0, max: 100, default: 30, unit: '%' },
  ]},
};

// ==================== PLUGIN PRESETS (10 per plugin) ====================
interface PluginPreset {
  id: string;
  name: string;
  params: Record<string, number>;
}

const PLUGIN_PRESETS: Record<PluginType, PluginPreset[]> = {
  eq: [
    { id: 'flat', name: 'Flat', params: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 100, highFreq: 8000 } },
    { id: 'vocal-presence', name: 'Vocal Presence', params: { lowGain: -2, midGain: 3, highGain: 2, lowFreq: 120, highFreq: 6000 } },
    { id: 'bass-boost', name: 'Bass Boost', params: { lowGain: 6, midGain: 0, highGain: -1, lowFreq: 80, highFreq: 8000 } },
    { id: 'high-cut', name: 'High Cut (Lo-Fi)', params: { lowGain: 2, midGain: 1, highGain: -8, lowFreq: 150, highFreq: 4000 } },
    { id: 'telephone', name: 'Telephone', params: { lowGain: -12, midGain: 4, highGain: -10, lowFreq: 300, highFreq: 3000 } },
    { id: 'bright', name: 'Bright & Airy', params: { lowGain: -1, midGain: 0, highGain: 5, lowFreq: 100, highFreq: 10000 } },
    { id: 'warm', name: 'Warm & Full', params: { lowGain: 4, midGain: 1, highGain: -2, lowFreq: 120, highFreq: 6000 } },
    { id: 'scoop', name: 'Mid Scoop', params: { lowGain: 4, midGain: -4, highGain: 4, lowFreq: 100, highFreq: 8000 } },
    { id: 'de-mud', name: 'De-Mud', params: { lowGain: -3, midGain: -2, highGain: 1, lowFreq: 200, highFreq: 5000 } },
    { id: 'podcast', name: 'Podcast Voice', params: { lowGain: -4, midGain: 2, highGain: 3, lowFreq: 150, highFreq: 7000 } },
  ],
  compressor: [
    { id: 'gentle', name: 'Gentle Glue', params: { threshold: -18, ratio: 2, attack: 30, release: 150, makeupGain: 2 } },
    { id: 'vocal', name: 'Vocal Smooth', params: { threshold: -20, ratio: 4, attack: 10, release: 100, makeupGain: 4 } },
    { id: 'drum-punch', name: 'Drum Punch', params: { threshold: -15, ratio: 6, attack: 5, release: 50, makeupGain: 3 } },
    { id: 'bass-control', name: 'Bass Control', params: { threshold: -16, ratio: 5, attack: 15, release: 200, makeupGain: 3 } },
    { id: 'parallel', name: 'Parallel Crush', params: { threshold: -30, ratio: 10, attack: 1, release: 40, makeupGain: 8 } },
    { id: 'mastering', name: 'Mastering Bus', params: { threshold: -12, ratio: 2, attack: 50, release: 300, makeupGain: 1 } },
    { id: 'aggressive', name: 'Aggressive', params: { threshold: -25, ratio: 8, attack: 2, release: 60, makeupGain: 6 } },
    { id: 'opto', name: 'Opto Style', params: { threshold: -22, ratio: 3, attack: 20, release: 400, makeupGain: 3 } },
    { id: 'limiting', name: 'Limiting', params: { threshold: -10, ratio: 20, attack: 0.1, release: 50, makeupGain: 0 } },
    { id: 'podcast', name: 'Podcast Leveler', params: { threshold: -24, ratio: 3, attack: 15, release: 200, makeupGain: 5 } },
  ],
  reverb: [
    { id: 'room', name: 'Small Room', params: { roomSize: 20, damping: 60, wetDry: 20, predelay: 5 } },
    { id: 'hall', name: 'Concert Hall', params: { roomSize: 80, damping: 40, wetDry: 35, predelay: 25 } },
    { id: 'plate', name: 'Plate', params: { roomSize: 50, damping: 30, wetDry: 30, predelay: 10 } },
    { id: 'cathedral', name: 'Cathedral', params: { roomSize: 95, damping: 20, wetDry: 40, predelay: 50 } },
    { id: 'ambience', name: 'Ambience', params: { roomSize: 15, damping: 70, wetDry: 15, predelay: 2 } },
    { id: 'vocal-space', name: 'Vocal Space', params: { roomSize: 35, damping: 50, wetDry: 25, predelay: 15 } },
    { id: 'drum-room', name: 'Drum Room', params: { roomSize: 30, damping: 55, wetDry: 20, predelay: 8 } },
    { id: 'shimmer', name: 'Shimmer', params: { roomSize: 90, damping: 15, wetDry: 45, predelay: 30 } },
    { id: 'spring', name: 'Spring', params: { roomSize: 40, damping: 65, wetDry: 25, predelay: 5 } },
    { id: 'gated', name: 'Gated', params: { roomSize: 60, damping: 80, wetDry: 50, predelay: 0 } },
  ],
  delay: [
    { id: 'slap', name: 'Slapback', params: { time: 80, feedback: 15, wetDry: 25 } },
    { id: 'quarter', name: '1/4 Note', params: { time: 500, feedback: 35, wetDry: 30 } },
    { id: 'eighth', name: '1/8 Note', params: { time: 250, feedback: 40, wetDry: 25 } },
    { id: 'dotted', name: 'Dotted 1/8', params: { time: 375, feedback: 45, wetDry: 30 } },
    { id: 'long', name: 'Long Echo', params: { time: 1000, feedback: 50, wetDry: 35 } },
    { id: 'pingpong', name: 'Ping Pong', params: { time: 300, feedback: 55, wetDry: 30 } },
    { id: 'ambient', name: 'Ambient Wash', params: { time: 800, feedback: 60, wetDry: 40 } },
    { id: 'doubler', name: 'Doubler', params: { time: 30, feedback: 0, wetDry: 35 } },
    { id: 'tape', name: 'Tape Echo', params: { time: 350, feedback: 45, wetDry: 25 } },
    { id: 'dub', name: 'Dub Delay', params: { time: 600, feedback: 70, wetDry: 45 } },
  ],
  chorus: [
    { id: 'subtle', name: 'Subtle Width', params: { rate: 0.5, depth: 30, wetDry: 25 } },
    { id: 'classic', name: 'Classic Chorus', params: { rate: 1, depth: 50, wetDry: 50 } },
    { id: '80s', name: '80s Lush', params: { rate: 0.8, depth: 70, wetDry: 60 } },
    { id: 'thick', name: 'Thick Ensemble', params: { rate: 0.3, depth: 80, wetDry: 70 } },
    { id: 'vibrato', name: 'Vibrato', params: { rate: 5, depth: 40, wetDry: 100 } },
    { id: 'shimmer', name: 'Shimmer', params: { rate: 2, depth: 60, wetDry: 40 } },
    { id: 'guitar', name: 'Guitar Sparkle', params: { rate: 1.2, depth: 45, wetDry: 35 } },
    { id: 'pad', name: 'Pad Widener', params: { rate: 0.2, depth: 90, wetDry: 55 } },
    { id: 'flange', name: 'Flangy', params: { rate: 0.1, depth: 95, wetDry: 50 } },
    { id: 'detune', name: 'Detune', params: { rate: 0.05, depth: 25, wetDry: 60 } },
  ],
  limiter: [
    { id: 'transparent', name: 'Transparent', params: { ceiling: -0.3, release: 50, gain: 0 } },
    { id: 'loud', name: 'Loud Master', params: { ceiling: -0.1, release: 30, gain: 6 } },
    { id: 'brick', name: 'Brick Wall', params: { ceiling: 0, release: 10, gain: 0 } },
    { id: 'safe', name: 'Safe Ceiling', params: { ceiling: -1, release: 80, gain: 0 } },
    { id: 'streaming', name: 'Streaming Ready', params: { ceiling: -1, release: 100, gain: 3 } },
    { id: 'broadcast', name: 'Broadcast', params: { ceiling: -2, release: 150, gain: 0 } },
    { id: 'punchy', name: 'Punchy', params: { ceiling: -0.5, release: 20, gain: 4 } },
    { id: 'gentle', name: 'Gentle Limit', params: { ceiling: -0.5, release: 200, gain: 2 } },
    { id: 'aggressive', name: 'Aggressive', params: { ceiling: -0.1, release: 5, gain: 8 } },
    { id: 'vinyl', name: 'Vinyl Warmth', params: { ceiling: -0.3, release: 300, gain: 1 } },
  ],
  gate: [
    { id: 'drums', name: 'Drum Gate', params: { threshold: -35, attack: 0.5, hold: 30, release: 50 } },
    { id: 'vocal', name: 'Vocal De-Noise', params: { threshold: -45, attack: 2, hold: 100, release: 150 } },
    { id: 'tight', name: 'Tight Gate', params: { threshold: -30, attack: 0.2, hold: 10, release: 20 } },
    { id: 'snare', name: 'Snare Isolate', params: { threshold: -25, attack: 0.3, hold: 40, release: 60 } },
    { id: 'kick', name: 'Kick Tighten', params: { threshold: -20, attack: 0.1, hold: 20, release: 30 } },
    { id: 'gentle', name: 'Gentle Cleanup', params: { threshold: -55, attack: 5, hold: 150, release: 200 } },
    { id: 'podcast', name: 'Podcast Gate', params: { threshold: -50, attack: 3, hold: 200, release: 250 } },
    { id: 'stutter', name: 'Stutter Effect', params: { threshold: -20, attack: 0.1, hold: 5, release: 5 } },
    { id: 'tom', name: 'Tom Isolate', params: { threshold: -28, attack: 0.5, hold: 50, release: 80 } },
    { id: 'room', name: 'Room Reducer', params: { threshold: -40, attack: 2, hold: 80, release: 120 } },
  ],
  deesser: [
    { id: 'gentle', name: 'Gentle', params: { frequency: 6000, threshold: -25, ratio: 3 } },
    { id: 'standard', name: 'Standard', params: { frequency: 6500, threshold: -20, ratio: 4 } },
    { id: 'aggressive', name: 'Aggressive', params: { frequency: 7000, threshold: -15, ratio: 6 } },
    { id: 'male', name: 'Male Voice', params: { frequency: 5500, threshold: -22, ratio: 4 } },
    { id: 'female', name: 'Female Voice', params: { frequency: 7500, threshold: -18, ratio: 5 } },
    { id: 'bright', name: 'Bright Source', params: { frequency: 8000, threshold: -16, ratio: 5 } },
    { id: 'lisp', name: 'Lisp Control', params: { frequency: 5000, threshold: -20, ratio: 6 } },
    { id: 'cymbals', name: 'Cymbal Tamer', params: { frequency: 10000, threshold: -18, ratio: 4 } },
    { id: 'subtle', name: 'Subtle Touch', params: { frequency: 6000, threshold: -30, ratio: 2 } },
    { id: 'surgical', name: 'Surgical', params: { frequency: 6800, threshold: -12, ratio: 8 } },
  ],
  saturation: [
    { id: 'subtle', name: 'Subtle Warmth', params: { drive: 15, warmth: 40, mix: 30 } },
    { id: 'tape', name: 'Tape Saturation', params: { drive: 30, warmth: 60, mix: 50 } },
    { id: 'tube', name: 'Tube Overdrive', params: { drive: 45, warmth: 70, mix: 60 } },
    { id: 'crunch', name: 'Crunch', params: { drive: 60, warmth: 50, mix: 70 } },
    { id: 'distortion', name: 'Distortion', params: { drive: 80, warmth: 40, mix: 80 } },
    { id: 'fuzz', name: 'Fuzz', params: { drive: 95, warmth: 30, mix: 90 } },
    { id: 'vintage', name: 'Vintage Console', params: { drive: 25, warmth: 75, mix: 40 } },
    { id: 'lo-fi', name: 'Lo-Fi Grit', params: { drive: 50, warmth: 80, mix: 55 } },
    { id: 'punch', name: 'Punch Up', params: { drive: 35, warmth: 45, mix: 45 } },
    { id: 'parallel', name: 'Parallel Dirt', params: { drive: 70, warmth: 55, mix: 25 } },
  ],
  autotune: [
    { id: 'natural', name: 'Natural Correction', params: { speed: 30, scale: 0, humanize: 50 } },
    { id: 'pop', name: 'Pop Vocal', params: { speed: 60, scale: 0, humanize: 30 } },
    { id: 'hard', name: 'Hard Tune', params: { speed: 95, scale: 0, humanize: 5 } },
    { id: 'effect', name: 'Autotune Effect', params: { speed: 100, scale: 0, humanize: 0 } },
    { id: 'subtle', name: 'Subtle Fix', params: { speed: 20, scale: 0, humanize: 70 } },
    { id: 'robotic', name: 'Robotic', params: { speed: 100, scale: 0, humanize: 0 } },
    { id: 'live', name: 'Live Performance', params: { speed: 40, scale: 0, humanize: 45 } },
    { id: 'choir', name: 'Choir/Harmony', params: { speed: 25, scale: 0, humanize: 60 } },
    { id: 'rnb', name: 'R&B Smooth', params: { speed: 55, scale: 0, humanize: 35 } },
    { id: 'trap', name: 'Trap Vocal', params: { speed: 85, scale: 0, humanize: 10 } },
  ],
};

const MAX_PLUGINS_PER_TRACK = 10;
const MAX_SENDS_PER_TRACK = 8;
const SAMPLE_RESOLUTION = 0.001; // 1ms precision for sample manipulation

const DEFAULT_BUS: AudioBus = { id: '', name: '', type: 'aux', color: '#0a84ff', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' };

const DEFAULT_CLIP_PROPS = { fadeIn: 0, fadeOut: 0, pitch: 0, stretch: 1, reverse: false, trimStart: 0, trimEnd: 0, loopEnabled: false, loopStart: 0, loopEnd: 0, tempoLocked: true, originalBPM: 120, detectedKey: null as MusicalKey | null, detectedScale: null as MusicalScale | null, keyLocked: false, transposeAmount: 0, warpMode: 'beats' as const, speedMultiplier: 1 };

// Warp mode descriptions
const WARP_MODES: { value: AudioClip['warpMode']; label: string; desc: string }[] = [
  { value: 'beats', label: 'Beats', desc: 'Best for drums and rhythmic content' },
  { value: 'tonal', label: 'Tonal', desc: 'Best for melodic content' },
  { value: 'texture', label: 'Texture', desc: 'Best for ambient and complex sounds' },
  { value: 'repitch', label: 'Re-Pitch', desc: 'Links pitch and speed like tape' },
  { value: 'complex', label: 'Complex Pro', desc: 'High quality for full mixes' },
];

// Speed presets
const SPEED_PRESETS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];

// Pitch presets (semitones)
const PITCH_PRESETS = [
  { label: '-12 (Octave Down)', value: -12 },
  { label: '-7 (5th Down)', value: -7 },
  { label: '-5 (4th Down)', value: -5 },
  { label: '-2 (Whole Tone Down)', value: -2 },
  { label: '-1 (Half Step Down)', value: -1 },
  { label: '0 (Original)', value: 0 },
  { label: '+1 (Half Step Up)', value: 1 },
  { label: '+2 (Whole Tone Up)', value: 2 },
  { label: '+5 (4th Up)', value: 5 },
  { label: '+7 (5th Up)', value: 7 },
  { label: '+12 (Octave Up)', value: 12 },
];

const DEFAULT_TEMPLATES: RecordingTemplate[] = [
  { id: 'vocal', name: 'Vocal Session', bpm: 120, sampleRate: 96000, bitDepth: 32, createdAt: 0, buses: [
    { id: 'bus-verb', name: 'Reverb', type: 'fx', color: '#64d2ff', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
    { id: 'bus-delay', name: 'Delay', type: 'fx', color: '#30d158', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
  ], tracks: [
    { id: 't1', name: 'Lead Vocal', type: 'audio', volume: 0.85, pan: 0, muted: false, solo: false, armed: true, color: '#0a84ff', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.3, preFader: false }], phase: false, trim: 0 },
    { id: 't2', name: 'Harmonies', type: 'audio', volume: 0.7, pan: -0.15, muted: false, solo: false, armed: false, color: '#bf5af2', plugins: [], output: 'master', sends: [], phase: false, trim: 0 },
  ]},
  { id: 'podcast', name: 'Podcast', bpm: 120, sampleRate: 48000, bitDepth: 24, createdAt: 0, buses: [], tracks: [
    { id: 't1', name: 'Host', type: 'audio', volume: 0.9, pan: -0.25, muted: false, solo: false, armed: true, color: '#0a84ff', plugins: [], output: 'master', sends: [], phase: false, trim: 0 },
    { id: 't2', name: 'Guest', type: 'audio', volume: 0.9, pan: 0.25, muted: false, solo: false, armed: false, color: '#ff9f0a', plugins: [], output: 'master', sends: [], phase: false, trim: 0 },
  ]},
  { id: 'band', name: 'Full Band', bpm: 120, sampleRate: 96000, bitDepth: 32, createdAt: 0, buses: [
    { id: 'bus-drums', name: 'Drum Bus', type: 'group', color: '#ff453a', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
    { id: 'bus-verb', name: 'Plate Reverb', type: 'fx', color: '#64d2ff', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
  ], tracks: [
    { id: 't1', name: 'Kick', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: false, color: '#ff453a', plugins: [], output: 'bus-drums', sends: [], phase: false, trim: 0 },
    { id: 't2', name: 'Snare', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: false, color: '#ff453a', plugins: [], output: 'bus-drums', sends: [{ id: 's1', busId: 'bus-verb', level: 0.2, preFader: false }], phase: false, trim: 0 },
    { id: 't3', name: 'Bass', type: 'audio', volume: 0.75, pan: 0, muted: false, solo: false, armed: false, color: '#ff9f0a', plugins: [], output: 'master', sends: [], phase: false, trim: 0 },
    { id: 't4', name: 'Guitar', type: 'audio', volume: 0.7, pan: -0.4, muted: false, solo: false, armed: false, color: '#30d158', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.35, preFader: false }], phase: false, trim: 0 },
    { id: 't5', name: 'Vocal', type: 'audio', volume: 0.85, pan: 0, muted: false, solo: false, armed: true, color: '#0a84ff', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.25, preFader: false }], phase: false, trim: 0 },
  ]},
  { id: 'empty', name: 'Empty', bpm: 120, sampleRate: 96000, bitDepth: 32, createdAt: 0, buses: [], tracks: [
    { id: 't1', name: 'Track 1', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: true, color: '#0a84ff', plugins: [], output: 'master', sends: [], phase: false, trim: 0 },
  ]},
];

const COLORS = CLIP_COLORS.map(c => c.color);

// Icons
// External plugin marketplace (simulated catalog)
const EXTERNAL_PLUGIN_CATALOG: ExternalPlugin[] = [
  { id: 'fabfilter-pro-q3', name: 'Pro-Q 3', vendor: 'FabFilter', version: '3.21', type: 'vst3', category: 'EQ', installed: false, color: '#ff9500' },
  { id: 'fabfilter-pro-c2', name: 'Pro-C 2', vendor: 'FabFilter', version: '2.15', type: 'vst3', category: 'Compressor', installed: false, color: '#ff6b00' },
  { id: 'waves-ssl-ev2', name: 'SSL EV2', vendor: 'Waves', version: '14.0', type: 'vst3', category: 'Channel Strip', installed: false, color: '#0a84ff' },
  { id: 'soundtoys-decapitator', name: 'Decapitator', vendor: 'Soundtoys', version: '5.4', type: 'vst3', category: 'Saturation', installed: false, color: '#ff453a' },
  { id: 'valhalla-room', name: 'ValhallRoom', vendor: 'Valhalla DSP', version: '1.6', type: 'vst3', category: 'Reverb', installed: false, color: '#bf5af2' },
  { id: 'oeksound-soothe2', name: 'Soothe2', vendor: 'oeksound', version: '1.3', type: 'vst3', category: 'Dynamic EQ', installed: false, color: '#64d2ff' },
  { id: 'izotope-ozone10', name: 'Ozone 10', vendor: 'iZotope', version: '10.1', type: 'vst3', category: 'Mastering', installed: false, color: '#5e5ce6' },
  { id: 'waves-cla-vocals', name: 'CLA Vocals', vendor: 'Waves', version: '14.0', type: 'vst3', category: 'Vocal Chain', installed: false, color: '#28a745' },
  { id: 'antares-autotune-pro', name: 'Auto-Tune Pro', vendor: 'Antares', version: '10.3', type: 'vst3', category: 'Pitch Correction', installed: false, color: '#ff9f0a' },
  { id: 'izotope-nectar4', name: 'Nectar 4', vendor: 'iZotope', version: '4.1', type: 'vst3', category: 'Vocal Suite', installed: false, color: '#0a84ff' },
];

const Icon = {
  play: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>,
  pause: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  stop: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  record: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>,
  skip: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"/><rect x="17" y="4" width="2" height="16"/></svg>,
  rewind: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"/><rect x="5" y="4" width="2" height="16"/></svg>,
  loop: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  save: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plugin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/></svg>,
  mic: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  template: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  copy: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  zoomIn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  chevron: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>,
  route: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="16"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><line x1="12" y1="16" x2="6" y2="16"/><line x1="12" y1="16" x2="18" y2="16"/></svg>,
  bus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/></svg>,
  scissors: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  split: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>,
  stretch: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 12 2 12 2 12"/><polyline points="22 12 20 12 20 12"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="5 8 8 12 5 16"/><polyline points="19 8 16 12 19 16"/></svg>,
  reverse: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  mixer: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  phase: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  store: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  grip: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  audio: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  redo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>,
  tempo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  link: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  unlink: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>,
  key: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>,
  music: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  export: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  users: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  share: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  send: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  wifi: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  wifiOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  cursor: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4l7.07 17 2.51-7.39L21 11.07 4 4z"/></svg>,
  chat: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  panKnob: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="20" y2="12"/><circle cx="12" cy="12" r="3"/></svg>,
  lock: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  waveform: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h2l2-6 3 12 3-8 2 4 2-2h6"/></svg>,
};

// ==================== AUDIO ENGINE ====================

// Plugin node chain stored per track
interface PluginNodeChain {
  nodes: AudioNode[];
  input: GainNode;
  output: GainNode;
  wetDry?: GainNode;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private trackNodes = new Map<string, { input: GainNode; gain: GainNode; pan: StereoPannerNode; phase: GainNode; sends: Map<string, GainNode> }>();
  private busNodes = new Map<string, { input: GainNode; gain: GainNode; pan: StereoPannerNode }>();
  private pluginNodes = new Map<string, Map<string, PluginNodeChain>>();
  private masterChainNodes: AudioNode[] = [];
  private oversampling: 1 | 2 | 4 | 8 = 1;
  private bitDepth: BitDepth = 32;

  async init(sampleRate: number, bitDepth: BitDepth = 32, oversampling: 1 | 2 | 4 | 8 = 1) {
    if (this.ctx) return;
    // Use oversampled sample rate for processing, then downsample
    const processingSampleRate = sampleRate * oversampling;
    this.ctx = new AudioContext({ sampleRate: Math.min(processingSampleRate, 192000) });
    this.oversampling = oversampling;
    this.bitDepth = bitDepth;
    
    // Master chain: input -> limiter -> gain -> analyser -> destination
    this.masterGain = this.ctx.createGain();
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.3;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.05;
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096; // High resolution analysis
    this.analyser.smoothingTimeConstant = 0.8;
    
    this.masterLimiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  // Set output device (earphones, speakers, audio interface)
  async setOutputDevice(deviceId: string) {
    if (!this.ctx) return;
    try {
      // Modern browsers support setSinkId on AudioContext
      if ('setSinkId' in this.ctx && typeof (this.ctx as any).setSinkId === 'function') {
        await (this.ctx as any).setSinkId(deviceId);
      }
    } catch (e) {
      console.warn('[AudioEngine] Could not set output device:', e);
    }
  }

  setMasterVolume(vol: number) { if (this.masterGain) this.masterGain.gain.setTargetAtTime(vol, this.ctx!.currentTime, 0.01); }
  
  setMasterLimiter(enabled: boolean, ceiling: number = -0.3) {
    if (this.masterLimiter) {
      this.masterLimiter.threshold.value = enabled ? ceiling : 0;
      this.masterLimiter.ratio.value = enabled ? 20 : 1;
    }
  }

  createBusNodes(busId: string) {
    if (!this.ctx || this.busNodes.has(busId)) return;
    const input = this.ctx.createGain();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    input.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterLimiter!);
    this.busNodes.set(busId, { input, gain, pan });
  }

  createTrackNodes(trackId: string, outputBusId?: string) {
    if (!this.ctx || this.trackNodes.has(trackId)) return;
    const input = this.ctx.createGain(); // trim/phase stage
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    const phase = this.ctx.createGain();
    
    input.connect(phase);
    phase.connect(gain);
    gain.connect(pan);
    
    // Route to bus or master
    if (outputBusId && outputBusId !== 'master') {
      const busNode = this.busNodes.get(outputBusId);
      if (busNode) pan.connect(busNode.input);
      else pan.connect(this.masterLimiter!);
    } else {
      pan.connect(this.masterLimiter!);
    }
    
    this.trackNodes.set(trackId, { input, gain, pan, phase, sends: new Map() });
  }

  routeTrackToOutput(trackId: string, outputId: RoutingDestination) {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !this.ctx) return;
    
    // Disconnect current output
    nodes.pan.disconnect();
    
    // Route to new destination
    if (outputId === 'master') {
      nodes.pan.connect(this.masterLimiter!);
    } else {
      const busNode = this.busNodes.get(outputId);
      if (busNode) nodes.pan.connect(busNode.input);
      else nodes.pan.connect(this.masterLimiter!);
    }
  }

  createSend(trackId: string, sendId: string, busId: string, level: number, preFader: boolean) {
    if (!this.ctx) return;
    const trackNode = this.trackNodes.get(trackId);
    const busNode = this.busNodes.get(busId);
    if (!trackNode || !busNode) return;
    
    const sendGain = this.ctx.createGain();
    sendGain.gain.value = level;
    
    // Pre-fader: connect before track volume, Post-fader: connect after
    const sourceNode = preFader ? trackNode.phase : trackNode.gain;
    sourceNode.connect(sendGain);
    sendGain.connect(busNode.input);
    
    trackNode.sends.set(sendId, sendGain);
  }

  updateSend(trackId: string, sendId: string, level: number) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;
    const sendGain = trackNode.sends.get(sendId);
    if (sendGain && this.ctx) sendGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.01);
  }

  removeSend(trackId: string, sendId: string) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;
    const sendGain = trackNode.sends.get(sendId);
    if (sendGain) {
      sendGain.disconnect();
      trackNode.sends.delete(sendId);
    }
  }

  updateTrack(trackId: string, volume: number, panVal: number, muted: boolean, phase: boolean = false, trim: number = 0) {
    const nodes = this.trackNodes.get(trackId);
    if (nodes && this.ctx) {
      const t = this.ctx.currentTime;
      nodes.gain.gain.setTargetAtTime(muted ? 0 : volume, t, 0.01);
      nodes.pan.pan.setTargetAtTime(panVal, t, 0.01);
      nodes.phase.gain.value = phase ? -1 : 1;
      nodes.input.gain.value = Math.pow(10, trim / 20); // dB to linear
    }
  }

  updateBus(busId: string, volume: number, panVal: number, muted: boolean) {
    const nodes = this.busNodes.get(busId);
    if (nodes && this.ctx) {
      const t = this.ctx.currentTime;
      nodes.gain.gain.setTargetAtTime(muted ? 0 : volume, t, 0.01);
      nodes.pan.pan.setTargetAtTime(panVal, t, 0.01);
    }
  }

  // Process plugin params for real audio processing with 32-bit float precision
  processPlugin(trackId: string, plugin: TrackPlugin) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Get or create the plugin map for this track
    if (!this.pluginNodes.has(trackId)) {
      this.pluginNodes.set(trackId, new Map());
    }
    const trackPlugins = this.pluginNodes.get(trackId)!;

    // Remove old chain for this plugin if it exists
    const old = trackPlugins.get(plugin.id);
    if (old) {
      old.nodes.forEach(n => { try { n.disconnect(); } catch {} });
      trackPlugins.delete(plugin.id);
    }

    // If disabled, just reconnect and return
    if (!plugin.enabled) {
      this.rebuildTrackPluginChain(trackId);
      return;
    }

    const p = plugin.params;
    const chain: PluginNodeChain = { nodes: [], input: ctx.createGain(), output: ctx.createGain() };
    chain.input.gain.value = 1;
    chain.output.gain.value = 1;

    let lastNode: AudioNode = chain.input;

    switch (plugin.type) {
      case 'eq': {
        // 3-band parametric EQ using BiquadFilterNodes
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = p.lowFreq ?? 100;
        lowShelf.gain.value = p.lowGain ?? 0;

        const peaking = ctx.createBiquadFilter();
        peaking.type = 'peaking';
        peaking.frequency.value = Math.sqrt((p.lowFreq ?? 100) * (p.highFreq ?? 8000));
        peaking.Q.value = 1.41;
        peaking.gain.value = p.midGain ?? 0;

        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = p.highFreq ?? 8000;
        highShelf.gain.value = p.highGain ?? 0;

        lastNode.connect(lowShelf);
        lowShelf.connect(peaking);
        peaking.connect(highShelf);
        chain.nodes.push(lowShelf, peaking, highShelf);
        lastNode = highShelf;
        break;
      }
      case 'compressor': {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = p.threshold ?? -20;
        comp.ratio.value = p.ratio ?? 4;
        comp.attack.value = (p.attack ?? 10) / 1000;
        comp.release.value = (p.release ?? 100) / 1000;
        comp.knee.value = 6;

        const makeup = ctx.createGain();
        makeup.gain.value = Math.pow(10, (p.makeupGain ?? 0) / 20);

        lastNode.connect(comp);
        comp.connect(makeup);
        chain.nodes.push(comp, makeup);
        lastNode = makeup;
        break;
      }
      case 'reverb': {
        // Convolution reverb with algorithmically generated impulse response
        const convolver = ctx.createConvolver();
        const roomSize = (p.roomSize ?? 50) / 100;
        const damping = (p.damping ?? 50) / 100;
        const sampleRate = ctx.sampleRate;
        const length = Math.max(0.1, roomSize * 4) * sampleRate;
        const impulse = ctx.createBuffer(2, length, sampleRate);

        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const decay = Math.exp(-t * (3 + damping * 10));
            data[i] = (Math.random() * 2 - 1) * decay;
          }
        }
        convolver.buffer = impulse;

        // Wet/dry mix
        const predelayNode = ctx.createDelay(0.1);
        predelayNode.delayTime.value = (p.predelay ?? 10) / 1000;
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const mix = (p.wetDry ?? 30) / 100;
        wet.gain.value = mix;
        dry.gain.value = 1 - mix;

        const merger = ctx.createGain();
        lastNode.connect(dry);
        lastNode.connect(predelayNode);
        predelayNode.connect(convolver);
        convolver.connect(wet);
        wet.connect(merger);
        dry.connect(merger);
        chain.nodes.push(convolver, predelayNode, wet, dry, merger);
        lastNode = merger;
        break;
      }
      case 'delay': {
        const delayNode = ctx.createDelay(2.0);
        delayNode.delayTime.value = (p.time ?? 250) / 1000;
        const feedback = ctx.createGain();
        feedback.gain.value = (p.feedback ?? 40) / 100;
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const mix = (p.wetDry ?? 30) / 100;
        wet.gain.value = mix;
        dry.gain.value = 1 - mix;
        const merger = ctx.createGain();

        lastNode.connect(dry);
        lastNode.connect(delayNode);
        delayNode.connect(feedback);
        feedback.connect(delayNode);
        delayNode.connect(wet);
        wet.connect(merger);
        dry.connect(merger);
        chain.nodes.push(delayNode, feedback, wet, dry, merger);
        lastNode = merger;
        break;
      }
      case 'chorus': {
        // Chorus: modulated delay line
        const rate = p.rate ?? 1;
        const depth = (p.depth ?? 50) / 100;
        const chorusDelay = ctx.createDelay(0.05);
        chorusDelay.delayTime.value = 0.015;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = rate;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth * 0.01;
        lfo.connect(lfoGain);
        lfoGain.connect(chorusDelay.delayTime);
        lfo.start();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const mix = (p.wetDry ?? 50) / 100;
        wet.gain.value = mix;
        dry.gain.value = 1 - mix;
        const merger = ctx.createGain();

        lastNode.connect(dry);
        lastNode.connect(chorusDelay);
        chorusDelay.connect(wet);
        wet.connect(merger);
        dry.connect(merger);
        chain.nodes.push(chorusDelay, lfo, lfoGain, wet, dry, merger);
        lastNode = merger;
        break;
      }
      case 'limiter': {
        const inputGain = ctx.createGain();
        inputGain.gain.value = Math.pow(10, (p.gain ?? 0) / 20);
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = p.ceiling ?? -0.3;
        lim.knee.value = 0;
        lim.ratio.value = 20;
        lim.attack.value = 0.001;
        lim.release.value = (p.release ?? 50) / 1000;

        lastNode.connect(inputGain);
        inputGain.connect(lim);
        chain.nodes.push(inputGain, lim);
        lastNode = lim;
        break;
      }
      case 'gate': {
        // Noise gate approximated with a compressor in expansion mode
        const gate = ctx.createDynamicsCompressor();
        gate.threshold.value = p.threshold ?? -40;
        gate.ratio.value = 20;
        gate.attack.value = (p.attack ?? 1) / 1000;
        gate.release.value = (p.release ?? 100) / 1000;
        gate.knee.value = 0;

        lastNode.connect(gate);
        chain.nodes.push(gate);
        lastNode = gate;
        break;
      }
      case 'deesser': {
        // De-esser: sidechain compression on high frequencies
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = p.frequency ?? 6000;
        highpass.Q.value = 1;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = p.threshold ?? -20;
        comp.ratio.value = p.ratio ?? 4;
        comp.attack.value = 0.001;
        comp.release.value = 0.05;

        lastNode.connect(highpass);
        highpass.connect(comp);
        lastNode.connect(ctx.createGain()); // pass-through for low frequencies
        comp.connect(chain.output);
        chain.nodes.push(splitter, merger, highpass, comp);
        // De-esser: compress the entire signal keyed by HF content
        lastNode.connect(comp);
        lastNode = comp;
        break;
      }
      case 'saturation': {
        // Waveshaper-based saturation
        const drive = (p.drive ?? 30) / 100;
        const warmth = (p.warmth ?? 50) / 100;
        const shaper = ctx.createWaveShaper();
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          const amount = 1 + drive * 10;
          curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
        }
        shaper.curve = curve;
        shaper.oversample = '4x';

        // Warmth: gentle low-shelf boost
        const warmthEQ = ctx.createBiquadFilter();
        warmthEQ.type = 'lowshelf';
        warmthEQ.frequency.value = 200;
        warmthEQ.gain.value = warmth * 3;

        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const mix = (p.mix ?? 50) / 100;
        wet.gain.value = mix;
        dry.gain.value = 1 - mix;
        const out = ctx.createGain();

        lastNode.connect(dry);
        lastNode.connect(shaper);
        shaper.connect(warmthEQ);
        warmthEQ.connect(wet);
        wet.connect(out);
        dry.connect(out);
        chain.nodes.push(shaper, warmthEQ, wet, dry, out);
        lastNode = out;
        break;
      }
      case 'autotune': {
        // Pitch correction approximated with a detune on playback source
        // Real pitch correction would require AudioWorklet; here we apply a peaking filter
        // at the fundamental frequency range to subtly color the signal
        const resonator = ctx.createBiquadFilter();
        resonator.type = 'peaking';
        const speed = (p.speed ?? 50) / 100;
        resonator.Q.value = 2 + speed * 8;
        const scaleNote = p.scale ?? 0;
        const baseFreq = 440 * Math.pow(2, (scaleNote - 9) / 12);
        resonator.frequency.value = baseFreq;
        resonator.gain.value = 3;

        lastNode.connect(resonator);
        chain.nodes.push(resonator);
        lastNode = resonator;
        break;
      }
    }

    lastNode.connect(chain.output);
    chain.nodes.push(chain.input, chain.output);
    trackPlugins.set(plugin.id, chain);

    this.rebuildTrackPluginChain(trackId);
  }

  // Rebuild the audio graph for a track's plugin chain
  private rebuildTrackPluginChain(trackId: string) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode || !this.ctx) return;

    const trackPluginMap = this.pluginNodes.get(trackId);

    // Disconnect input from everything
    try { trackNode.input.disconnect(); } catch {}

    if (!trackPluginMap || trackPluginMap.size === 0) {
      // No plugins: direct connection
      trackNode.input.connect(trackNode.phase);
      return;
    }

    // Chain all active plugins in order
    let prev: AudioNode = trackNode.input;
    for (const [, chain] of trackPluginMap) {
      prev.connect(chain.input);
      prev = chain.output;
    }
    prev.connect(trackNode.phase);
  }

  // Apply mastering settings to the master chain
  applyMasterSettings(settings: MasterSettings) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Clean up old mastering nodes
    this.masterChainNodes.forEach(n => { try { n.disconnect(); } catch {} });
    this.masterChainNodes = [];

    if (!this.masterLimiter || !this.masterGain || !this.analyser) return;

    // Disconnect current master chain
    try { this.masterLimiter.disconnect(); } catch {}
    try { this.masterGain.disconnect(); } catch {}

    // Build mastering chain: limiter -> EQ -> stereoWidth -> warmth -> masterGain -> analyser -> dest
    let lastNode: AudioNode = this.masterLimiter;

    // Limiter settings
    this.masterLimiter.threshold.value = settings.limiterEnabled ? settings.limiterCeiling : 0;
    this.masterLimiter.ratio.value = settings.limiterEnabled ? 20 : 1;

    // Low/High shelf EQ
    if (settings.lowShelf !== 0 || settings.highShelf !== 0) {
      const lowS = ctx.createBiquadFilter();
      lowS.type = 'lowshelf';
      lowS.frequency.value = 200;
      lowS.gain.value = settings.lowShelf;

      const highS = ctx.createBiquadFilter();
      highS.type = 'highshelf';
      highS.frequency.value = 4000;
      highS.gain.value = settings.highShelf;

      lastNode.connect(lowS);
      lowS.connect(highS);
      this.masterChainNodes.push(lowS, highS);
      lastNode = highS;
    }

    // Multiband: apply 3-band EQ via crossover filters
    if (settings.multiband.lowGain !== 0 || settings.multiband.midGain !== 0 || settings.multiband.highGain !== 0) {
      const lowBand = ctx.createBiquadFilter();
      lowBand.type = 'lowshelf';
      lowBand.frequency.value = settings.multiband.lowFreq;
      lowBand.gain.value = settings.multiband.lowGain;

      const midBand = ctx.createBiquadFilter();
      midBand.type = 'peaking';
      midBand.frequency.value = Math.sqrt(settings.multiband.lowFreq * settings.multiband.highFreq);
      midBand.Q.value = 0.7;
      midBand.gain.value = settings.multiband.midGain;

      const highBand = ctx.createBiquadFilter();
      highBand.type = 'highshelf';
      highBand.frequency.value = settings.multiband.highFreq;
      highBand.gain.value = settings.multiband.highGain;

      lastNode.connect(lowBand);
      lowBand.connect(midBand);
      midBand.connect(highBand);
      this.masterChainNodes.push(lowBand, midBand, highBand);
      lastNode = highBand;
    }

    // Analog warmth: subtle saturation via waveshaper
    if (settings.analogWarmth > 0) {
      const shaper = ctx.createWaveShaper();
      const amount = settings.analogWarmth / 100;
      const curve = new Float32Array(44100);
      for (let i = 0; i < 44100; i++) {
        const x = (i * 2) / 44100 - 1;
        curve[i] = Math.tanh(x * (1 + amount * 2));
      }
      shaper.curve = curve;
      shaper.oversample = '4x';
      lastNode.connect(shaper);
      this.masterChainNodes.push(shaper);
      lastNode = shaper;
    }

    // Master volume
    this.masterGain.gain.setTargetAtTime(settings.volume, t, 0.01);
    lastNode.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  // Get analyser data for real metering
  getAnalyserData(): { frequency: Float32Array; timeDomain: Float32Array } | null {
    if (!this.analyser) return null;
    const frequency = new Float32Array(this.analyser.frequencyBinCount);
    const timeDomain = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatFrequencyData(frequency);
    this.analyser.getFloatTimeDomainData(timeDomain);
    return { frequency, timeDomain };
  }

  // Compute real waveform peaks from an AudioBuffer
  static computeWaveformPeaks(buffer: AudioBuffer, numBins: number = 50): number[] {
    const peaks: number[] = [];
    const channel = buffer.getChannelData(0);
    const samplesPerBin = Math.floor(channel.length / numBins);
    for (let i = 0; i < numBins; i++) {
      let peak = 0;
      const start = i * samplesPerBin;
      const end = Math.min(start + samplesPerBin, channel.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channel[j]);
        if (abs > peak) peak = abs;
      }
      peaks.push(peak);
    }
    return peaks;
  }

  // Sample-level manipulation
  async processClipAudio(audioBuffer: AudioBuffer, clip: AudioClip): Promise<AudioBuffer> {
    if (!this.ctx) return audioBuffer;
    
    const ctx = this.ctx;
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    
    // Apply time stretch
    const stretchedLength = Math.floor(audioBuffer.length * clip.stretch);
    let processedBuffer = ctx.createBuffer(channels, stretchedLength, sampleRate);
    
    for (let ch = 0; ch < channels; ch++) {
      const inputData = audioBuffer.getChannelData(ch);
      const outputData = processedBuffer.getChannelData(ch);
      
      // Linear interpolation for time stretch (basic - would use WSOLA in production)
      for (let i = 0; i < stretchedLength; i++) {
        const srcIdx = (i / clip.stretch);
        const idx0 = Math.floor(srcIdx);
        const idx1 = Math.min(idx0 + 1, inputData.length - 1);
        const frac = srcIdx - idx0;
        outputData[i] = inputData[idx0] * (1 - frac) + inputData[idx1] * frac;
      }
      
      // Apply reverse
      if (clip.reverse) {
        outputData.reverse();
      }
      
      // Apply fades
      const fadeInSamples = Math.floor(clip.fadeIn * sampleRate);
      const fadeOutSamples = Math.floor(clip.fadeOut * sampleRate);
      
      for (let i = 0; i < fadeInSamples && i < outputData.length; i++) {
        outputData[i] *= i / fadeInSamples; // Linear fade in
      }
      for (let i = 0; i < fadeOutSamples && i < outputData.length; i++) {
        const idx = outputData.length - 1 - i;
        outputData[idx] *= i / fadeOutSamples; // Linear fade out
      }
    }
    
    return processedBuffer;
  }

  getContext() { return this.ctx; }
  getAnalyser() { return this.analyser; }
  getSampleRate() { return this.ctx?.sampleRate || 96000; }
  getBitDepth() { return this.bitDepth; }
}

// ==================== WAV ENCODER ====================
function audioBufferToWav(buffer: AudioBuffer, bitDepth: BitDepth = 24): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // format: 3=float, 1=PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels and write samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let offset = headerLength;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 32) {
        view.setFloat32(offset, sample, true);
      } else if (bitDepth === 24) {
        const int = Math.round(sample * 8388607);
        view.setUint8(offset, int & 0xFF);
        view.setUint8(offset + 1, (int >> 8) & 0xFF);
        view.setUint8(offset + 2, (int >> 16) & 0xFF);
      } else {
        view.setInt16(offset, Math.round(sample * 32767), true);
      }
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// ==================== MEMOIZED SUB-COMPONENTS ====================
// Track Channel Strip - Memoized for performance
const TrackChannelStrip = memo<{
  track: AudioTrack;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<AudioTrack>) => void;
  buses: AudioBus[];
}>(({ track, isSelected, onSelect, onUpdate, buses }) => (
  <div onClick={onSelect} style={{ width: '94px', minWidth: '94px', background: isSelected ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)', borderRadius: '10px', marginRight: '8px', display: 'flex', flexDirection: 'column', border: `1px solid ${isSelected ? track.color + '40' : 'var(--color-border-subtle)'}`, overflow: 'hidden', boxShadow: isSelected ? `0 0 20px ${track.color}15` : '0 2px 8px rgba(0,0,0,0.2)' }}>
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', background: `linear-gradient(180deg, ${track.color}25, ${track.color}10)` }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
    </div>
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <span style={{ fontSize: '7px', color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Pan</span>
      <div style={{ position: 'relative', width: '40px', height: '40px' }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="var(--color-bg-tertiary)" stroke="var(--color-border-default)" strokeWidth="2" />
          <line x1="20" y1="20" x2={20 + Math.sin(track.pan * Math.PI / 2) * 12} y2={20 - Math.cos(track.pan * Math.PI / 2) * 12} stroke={track.color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="20" r="4" fill={track.color} />
        </svg>
      </div>
      <input type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(e) => onUpdate({ pan: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: '4px' }} />
      <span style={{ fontSize: '8px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`}</span>
    </div>
    <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: '7px', color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Vol</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
        <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${track.volume * 100}%`, background: `linear-gradient(to top, ${track.color}, ${track.color}80)`, borderRadius: '4px' }} />
        </div>
        <input type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
      </div>
      <span style={{ fontSize: '9px', color: track.color, fontFamily: 'monospace', marginTop: '4px' }}>{track.volume > 1 ? '+' : ''}{((track.volume - 1) * 60).toFixed(1)} dB</span>
    </div>
    <div style={{ padding: '6px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'center', gap: '4px' }}>
      <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.muted ? 'rgba(10,132,255,0.4)' : 'var(--color-border-default)', background: track.muted ? '#0a84ff' : 'var(--color-bg-tertiary)', color: track.muted ? '#fff' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>M</button>
      <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.solo ? 'rgba(255,159,10,0.4)' : 'var(--color-border-default)', background: track.solo ? '#ff9f0a' : 'var(--color-bg-tertiary)', color: track.solo ? '#000' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>S</button>
      <button aria-label="Record arm" onClick={(e) => { e.stopPropagation(); onUpdate({ armed: !track.armed }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.armed ? 'rgba(255,69,58,0.4)' : 'var(--color-border-default)', background: track.armed ? '#ff453a' : 'var(--color-bg-tertiary)', color: track.armed ? '#fff' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>R</button>
    </div>
    <div style={{ padding: '4px 6px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)' }}>
      <select value={track.output} onChange={(e) => onUpdate({ output: e.target.value as RoutingDestination })} style={{ width: '100%', padding: '3px 4px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '3px', color: 'var(--color-text-muted)', fontSize: '8px' }}>
        <option value="master">Master</option>
        {buses.filter(b => b.type === 'group').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  </div>
));
TrackChannelStrip.displayName = 'TrackChannelStrip';

// ==================== COMPONENT ====================
const Imosion: React.FC = () => {
  // Create instance-specific audio engine for multi-window support
  const audioEngineRef = useRef<AudioEngine | null>(null);
  
  // Lazy initialize audio engine
  const getAudioEngine = useCallback(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    return audioEngineRef.current;
  }, []);
  
  // Cleanup audio engine on unmount - critical for multi-window support
  useEffect(() => {
    return () => {
      // Clean up audio context and nodes
      if (audioEngineRef.current) {
        const engine = audioEngineRef.current;
        engine.getContext()?.close().catch(() => {});
        audioEngineRef.current = null;
      }
      // Clean up animation frames
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      // Clean up playback interval
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
        playbackRef.current = null;
      }
      // Clean up media recorder
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      console.log('[Imosion] Instance cleaned up');
      // Revoke all blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* */ }
      });
      blobUrlsRef.current.clear();
    };
  }, []);
  
  const { closeApp, setCurrentApp } = useRunningApps();

  // ===== BEGINNER MODE =====
  const { isBeginnerMode: beginnerMode } = useBeginnerMode('imosion');
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const playbackRef = useRef<number | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Layout - responsive
  const [trackPanelWidth, setTrackPanelWidth] = useState(200);
  const [pluginPanelWidth, setPluginPanelWidth] = useState(260);
  const [isResizingTrack, setIsResizingTrack] = useState(false);
  const [isResizingPlugin, setIsResizingPlugin] = useState(false);

  // Transport
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(300);
  const [isLooping, setIsLooping] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [sampleRate, setSampleRate] = useState<22050 | 44100 | 48000 | 88200 | 96000 | 176400 | 192000 | 384000>(96000);
  const [bitDepth, setBitDepth] = useState<BitDepth>(32);

  // Metronome
  const [metronomeSettings, setMetronomeSettings] = useState<MetronomeSettings>(DEFAULT_METRONOME);
  const metronomeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const metronomeAccentRef = useRef<AudioBuffer | null>(null);
  const metronomeNormalRef = useRef<AudioBuffer | null>(null);

  // Audio Device Selection (system audio interface support)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');
  const [bufferSize, setBufferSize] = useState<128 | 256 | 512 | 1024 | 2048>(256);
  const [latencyMode, setLatencyMode] = useState<'ultra-low' | 'low' | 'balanced' | 'safe'>('low');
  const lastFrameTimeRef = useRef<number>(0);

  // Enumerate audio devices on mount
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioDevices([...audioInputs, ...audioOutputs]);
        if (audioInputs.length > 0 && !selectedInputDevice) setSelectedInputDevice(audioInputs[0].deviceId);
        if (audioOutputs.length > 0 && !selectedOutputDevice) setSelectedOutputDevice(audioOutputs[0].deviceId);
      } catch (err) {
        console.log('[Imosion] Audio device enumeration failed:', err);
      }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, []);

  // Master settings with full mastering chain
  const [masterSettings, setMasterSettings] = useState<MasterSettings>({
    volume: 0.85,
    limiterEnabled: true,
    limiterCeiling: -0.3,
    dithering: 'triangular',
    oversampling: 1,
    stereoWidth: 100,
    bassEnhance: 0,
    highShelf: 0,
    lowShelf: 0,
    midSideBalance: 0,
    multiband: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 200, highFreq: 4000 },
    analogWarmth: 10,
    loudnessTarget: -14,
  });
  const [selectedMasteringPreset, setSelectedMasteringPreset] = useState<string | null>(null);
  const [showMasteringPanel, setShowMasteringPanel] = useState(false);

  // Apply mastering settings to audio engine whenever they change
  useEffect(() => {
    try { getAudioEngine().applyMasterSettings(masterSettings); } catch {}
  }, [masterSettings, getAudioEngine]);

  const [customMasteringPresets, setCustomMasteringPresets] = useState<MasteringPreset[]>(() => {
    try {
      const saved = localStorage.getItem('imosion-custom-mastering-presets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [customPluginPresets, setCustomPluginPresets] = useState<Record<PluginType, PluginPreset[]>>(() => {
    try {
      const saved = localStorage.getItem('imosion-custom-plugin-presets');
      return saved ? JSON.parse(saved) : { eq: [], compressor: [], reverb: [], delay: [], chorus: [], limiter: [], gate: [], deesser: [], saturation: [], autotune: [] };
    } catch { return { eq: [], compressor: [], reverb: [], delay: [], chorus: [], limiter: [], gate: [], deesser: [], saturation: [], autotune: [] }; }
  });
  const [showSavePresetModal, setShowSavePresetModal] = useState<{ type: 'mastering' | 'plugin'; pluginType?: PluginType; trackId?: string; pluginId?: string } | null>(null);
  const [newPresetName, setNewPresetName] = useState('');

  // Buses - Start empty for clean session (moved up before callbacks that use them)
  const [buses, setBuses] = useState<AudioBus[]>([]);

  // Tracks - Start empty for clean session (moved up before callbacks that use them)
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);

  // Save custom presets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('imosion-custom-mastering-presets', JSON.stringify(customMasteringPresets));
    } catch (e) { console.warn('[Imosion] Failed to save custom mastering presets:', e); }
  }, [customMasteringPresets]);

  useEffect(() => {
    try {
      localStorage.setItem('imosion-custom-plugin-presets', JSON.stringify(customPluginPresets));
    } catch (e) { console.warn('[Imosion] Failed to save custom plugin presets:', e); }
  }, [customPluginPresets]);

  // Save current mastering settings as custom preset
  const saveCustomMasteringPreset = useCallback((name: string) => {
    const preset: MasteringPreset = {
      id: `custom-${Date.now()}`,
      name,
      description: 'Custom preset',
      settings: { ...masterSettings },
    };
    setCustomMasteringPresets(prev => [...prev, preset]);
    setSelectedMasteringPreset(preset.id);
    setShowSavePresetModal(null);
    setNewPresetName('');
  }, [masterSettings]);

  // Save current plugin settings as custom preset
  const saveCustomPluginPreset = useCallback((pluginType: PluginType, trackId: string, pluginId: string, name: string) => {
    const track = tracks.find(t => t.id === trackId);
    const plugin = track?.plugins.find(p => p.id === pluginId);
    if (!plugin) return;
    const preset: PluginPreset = {
      id: `custom-${Date.now()}`,
      name,
      params: { ...plugin.params },
    };
    setCustomPluginPresets(prev => ({ ...prev, [pluginType]: [...(prev[pluginType] || []), preset] }));
    setShowSavePresetModal(null);
    setNewPresetName('');
  }, [tracks]);

  // Delete custom preset
  const deleteCustomMasteringPreset = useCallback((presetId: string) => {
    setCustomMasteringPresets(prev => prev.filter(p => p.id !== presetId));
    if (selectedMasteringPreset === presetId) setSelectedMasteringPreset(null);
  }, [selectedMasteringPreset]);

  const deleteCustomPluginPreset = useCallback((pluginType: PluginType, presetId: string) => {
    setCustomPluginPresets(prev => ({ ...prev, [pluginType]: (prev[pluginType] || []).filter(p => p.id !== presetId) }));
  }, []);

  // Apply mastering preset
  const applyMasteringPreset = useCallback((presetId: string) => {
    const preset = [...MASTERING_PRESETS, ...customMasteringPresets].find(p => p.id === presetId);
    if (preset) {
      setMasterSettings(prev => ({ ...prev, ...preset.settings }));
      setSelectedMasteringPreset(presetId);
    }
  }, [customMasteringPresets]);

  // Apply plugin preset
  const applyPluginPreset = useCallback((trackId: string, pluginId: string, presetId: string, pluginType: PluginType) => {
    const allPresets = [...(PLUGIN_PRESETS[pluginType] || []), ...(customPluginPresets[pluginType] || [])];
    const preset = allPresets.find(pr => pr.id === presetId);
    if (!preset) return;
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, plugins: t.plugins.map(p => {
        if (p.id !== pluginId) return p;
        return { ...p, params: { ...p.params, ...preset.params } };
      })};
    }));
  }, [customPluginPresets]);

  // Undo/Redo History (500 max)
  const MAX_HISTORY = 500;
  const [history, setHistory] = useState<{ tracks: AudioTrack[]; buses: AudioBus[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedoAction, setIsUndoRedoAction] = useState(false);

  // Clip editing
  const [clipEdit, setClipEdit] = useState<ClipEditState>({ clipId: null, trackId: null, mode: 'none', startX: 0 });
  const [showClipEditor, setShowClipEditor] = useState(false);
  const [editingClip, setEditingClip] = useState<{ trackId: string; clip: AudioClip } | null>(null);

  // Drag and Drop
  const [dragState, setDragState] = useState<DragState>({ type: 'none', sourceId: null, sourceTrackId: null, targetId: null, offsetX: 0, offsetY: 0, startTime: 0 });
  const [dropTarget, setDropTarget] = useState<{ trackId: string | null; time: number } | null>(null);

  // External plugins
  const [installedPlugins, setInstalledPlugins] = useState<ExternalPlugin[]>([]);
  const [showPluginStore, setShowPluginStore] = useState(false);
  const [pluginSearchQuery, setPluginSearchQuery] = useState('');

  // UI
  const [showPluginBrowser, setShowPluginBrowser] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showRouting, setShowRouting] = useState(false);
  const [templates, setTemplates] = useState<RecordingTemplate[]>(DEFAULT_TEMPLATES);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [zoom, setZoom] = useState(40);
  const [timeDisplayMode, setTimeDisplayMode] = useState<'time' | 'bars'>('time');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, trackId: null, clipId: null, busId: null });
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [viewMode, setViewMode] = useState<'arrange' | 'mixer'>('arrange');

  // Musical key state
  const [projectKey, setProjectKey] = useState<ProjectKey>({ root: 'C', scale: 'major' });
  const [keyChanges, setKeyChanges] = useState<{ time: number; key: ProjectKey }[]>([]);
  const [bpmChanges, setBpmChanges] = useState<{ time: number; bpm: number }[]>([]);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'wav',
    bitDepth: 24,
    sampleRate: 48000,
    normalizeLevel: -1,
    includeMetadata: true,
    splitTracks: false
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Collaboration
  const [collaborationSession, setCollaborationSession] = useState<CollaborationSession | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [collabMessages, setCollabMessages] = useState<{ sender: string; message: string; time: Date }[]>([]);
  const [newCollabMessage, setNewCollabMessage] = useState('');
  const [userId] = useState(() => `user-${Math.random().toString(36).substring(2, 9)}`);
  const [userName, setUserName] = useState('Anonymous');
  const [userColor] = useState(() => `hsl(${Math.random() * 360}, 70%, 50%)`);

  // Spectrum analyzer
  const [showSpectrum, setShowSpectrum] = useState(false);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumAnimRef = useRef<number | null>(null);



  // Load saved data
  useEffect(() => {
    const saved = localStorage.getItem('imosion-data');
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.bpm) setBpm(d.bpm);
        if (d.masterSettings) setMasterSettings(d.masterSettings);
        if (d.sampleRate) setSampleRate(d.sampleRate);
        if (d.bitDepth) setBitDepth(d.bitDepth);
        if (d.tracks) setTracks(d.tracks);
        if (d.buses) setBuses(d.buses);
        if (d.installedPlugins) setInstalledPlugins(d.installedPlugins);
        if (d.templates) setTemplates([...DEFAULT_TEMPLATES, ...d.templates.filter((t: RecordingTemplate) => !DEFAULT_TEMPLATES.find(dt => dt.id === t.id))]);
      } catch { /* state save failed */ }
    }
  }, []);

  // Save data
  useEffect(() => {
    const customTemplates = templates.filter(t => !DEFAULT_TEMPLATES.find(dt => dt.id === t.id));
    localStorage.setItem('imosion-data', JSON.stringify({ bpm, masterSettings, sampleRate, bitDepth, tracks, buses, installedPlugins, templates: customTemplates }));
  }, [bpm, masterSettings, sampleRate, bitDepth, tracks, buses, installedPlugins, templates]);

  // History tracking for undo/redo (track state changes)
  useEffect(() => {
    if (isUndoRedoAction) {
      setIsUndoRedoAction(false);
      return;
    }
    // Deep clone current state for history
    const snapshot = { tracks: JSON.parse(JSON.stringify(tracks)), buses: JSON.parse(JSON.stringify(buses)) };
    setHistory(prev => {
      // Remove any future states if we're in the middle of history
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new snapshot
      newHistory.push(snapshot);
      // Limit to MAX_HISTORY
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [tracks, buses]);

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    if (snapshot) {
      setIsUndoRedoAction(true);
      setTracks(snapshot.tracks);
      setBuses(snapshot.buses);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex]);

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    if (snapshot) {
      setIsUndoRedoAction(true);
      setTracks(snapshot.tracks);
      setBuses(snapshot.buses);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex]);

  // Tempo matching - calculate stretch ratio to match project BPM
  const calculateTempoStretch = useCallback((originalBPM: number, targetBPM: number): number => {
    if (originalBPM <= 0) return 1;
    return targetBPM / originalBPM;
  }, []);

  // Apply tempo match to clip
  const matchClipToTempo = useCallback((trackId: string, clipId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const stretch = calculateTempoStretch(c.originalBPM, bpm);
          return { ...c, tempoLocked: true, stretch };
        }
        return c;
      })
    } : t));
  }, [bpm, calculateTempoStretch]);

  // Unmatch clip from tempo (free stretch)
  const unmatchClipFromTempo = useCallback((trackId: string, clipId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, tempoLocked: false } : c)
    } : t));
  }, []);

  // Set clip original BPM
  const setClipOriginalBPM = useCallback((trackId: string, clipId: string, originalBPM: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const stretch = c.tempoLocked ? calculateTempoStretch(originalBPM, bpm) : c.stretch;
          return { ...c, originalBPM, stretch };
        }
        return c;
      })
    } : t));
  }, [bpm, calculateTempoStretch]);

  // Update all tempo-locked clips when BPM changes
  useEffect(() => {
    setTracks(prev => prev.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.tempoLocked && c.originalBPM > 0) {
          const stretch = calculateTempoStretch(c.originalBPM, bpm);
          return { ...c, stretch };
        }
        return c;
      })
    })));
  }, [bpm]);

  // Key detection algorithm (simplified chromagram-based detection)
  const detectClipKey = useCallback((trackId: string, clipId: string) => {
    // Simulate key detection - in production this would analyze audio frequencies
    // Using a mock detection that returns a reasonable key based on clip properties
    const keys: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scales: MusicalScale[] = ['major', 'minor'];
    
    // Mock detection based on clip hash for consistent results
    const clip = tracks.find(t => t.id === trackId)?.clips.find(c => c.id === clipId);
    if (!clip) return;
    
    const hash = clip.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const detectedKey = keys[hash % 12];
    const detectedScale = scales[hash % 2];
    
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, detectedKey, detectedScale } : c)
    } : t));
  }, [tracks]);

  // Detect key for all clips in a track
  const detectAllClipKeys = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    track.clips.forEach(clip => detectClipKey(trackId, clip.id));
  }, [tracks, detectClipKey]);

  // Detect key for all clips in project
  const detectAllProjectKeys = useCallback(() => {
    tracks.forEach(track => {
      track.clips.forEach(clip => detectClipKey(track.id, clip.id));
    });
  }, [tracks, detectClipKey]);

  // Calculate transpose amount to match project key
  const calculateKeyTranspose = useCallback((fromKey: MusicalKey, toKey: MusicalKey): number => {
    const keys: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    let diff = toIdx - fromIdx;
    // Choose the shortest path
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    return diff;
  }, []);

  // Lock clip to project key (auto-transpose)
  const lockClipToKey = useCallback((trackId: string, clipId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId && c.detectedKey) {
          const transposeAmount = calculateKeyTranspose(c.detectedKey, projectKey.root);
          return { ...c, keyLocked: true, transposeAmount, pitch: c.pitch + transposeAmount };
        }
        return c;
      })
    } : t));
  }, [projectKey.root, calculateKeyTranspose]);

  // Unlock clip from project key
  const unlockClipFromKey = useCallback((trackId: string, clipId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          return { ...c, keyLocked: false, pitch: c.pitch - c.transposeAmount, transposeAmount: 0 };
        }
        return c;
      })
    } : t));
  }, []);

  // Lock all clips to project key
  const lockAllClipsToKey = useCallback(() => {
    setTracks(prev => prev.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.detectedKey && !c.keyLocked) {
          const transposeAmount = calculateKeyTranspose(c.detectedKey, projectKey.root);
          return { ...c, keyLocked: true, transposeAmount, pitch: c.pitch + transposeAmount };
        }
        return c;
      })
    })));
  }, [projectKey.root, calculateKeyTranspose]);

  // Update all key-locked clips when project key changes
  useEffect(() => {
    setTracks(prev => prev.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.keyLocked && c.detectedKey) {
          const oldTranspose = c.transposeAmount;
          const newTranspose = calculateKeyTranspose(c.detectedKey, projectKey.root);
          return { ...c, transposeAmount: newTranspose, pitch: c.pitch - oldTranspose + newTranspose };
        }
        return c;
      })
    })));
  }, [projectKey.root]);

  // Set clip speed multiplier
  const setClipSpeed = useCallback((trackId: string, clipId: string, speedMultiplier: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          // For repitch mode, speed change also affects pitch
          if (c.warpMode === 'repitch') {
            const pitchChange = Math.round(12 * Math.log2(speedMultiplier));
            return { ...c, speedMultiplier, stretch: 1 / speedMultiplier, pitch: pitchChange };
          }
          return { ...c, speedMultiplier, stretch: 1 / speedMultiplier };
        }
        return c;
      })
    } : t));
  }, []);

  // Set clip warp mode
  const setClipWarpMode = useCallback((trackId: string, clipId: string, warpMode: AudioClip['warpMode']) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, warpMode } : c)
    } : t));
  }, []);

  // Set clip pitch with optional link to speed (for repitch mode)
  const setClipPitch = useCallback((trackId: string, clipId: string, pitch: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? {
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          // For repitch mode, pitch change also affects speed
          if (c.warpMode === 'repitch') {
            const speedMultiplier = Math.pow(2, pitch / 12);
            return { ...c, pitch, speedMultiplier, stretch: 1 / speedMultiplier };
          }
          return { ...c, pitch };
        }
        return c;
      })
    } : t));
  }, []);

  // Add key change at specific time
  const addKeyChange = useCallback((time: number, key: ProjectKey) => {
    setKeyChanges(prev => {
      const filtered = prev.filter(kc => Math.abs(kc.time - time) > 0.1);
      return [...filtered, { time, key }].sort((a, b) => a.time - b.time);
    });
  }, []);

  // Remove key change
  const removeKeyChange = useCallback((time: number) => {
    setKeyChanges(prev => prev.filter(kc => Math.abs(kc.time - time) > 0.1));
  }, []);

  // Get current key at a specific time
  const getKeyAtTime = useCallback((time: number): ProjectKey => {
    const applicableChanges = keyChanges.filter(kc => kc.time <= time);
    if (applicableChanges.length === 0) return projectKey;
    return applicableChanges[applicableChanges.length - 1].key;
  }, [keyChanges, projectKey]);

  // Add BPM change at specific time
  const addBpmChange = useCallback((time: number, newBpm: number) => {
    setBpmChanges(prev => {
      const filtered = prev.filter(bc => Math.abs(bc.time - time) > 0.1);
      return [...filtered, { time, bpm: newBpm }].sort((a, b) => a.time - b.time);
    });
  }, []);

  // Remove BPM change
  const removeBpmChange = useCallback((time: number) => {
    setBpmChanges(prev => prev.filter(bc => Math.abs(bc.time - time) > 0.1));
  }, []);

  // Get current BPM at a specific time
  const getBpmAtTime = useCallback((time: number): number => {
    const applicableChanges = bpmChanges.filter(bc => bc.time <= time);
    if (applicableChanges.length === 0) return bpm;
    return applicableChanges[applicableChanges.length - 1].bpm;
  }, [bpmChanges, bpm]);

  // Export project - renders all tracks to audio using OfflineAudioContext
  const exportProject = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const sr = exportSettings.sampleRate;
      // Calculate total duration from all clips
      const totalDuration = Math.max(duration, ...tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration)));
      const totalSamples = Math.ceil(totalDuration * sr);
      if (totalSamples === 0) throw new Error('No audio to export');

      const offlineCtx = new OfflineAudioContext(2, totalSamples, sr);
      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = masterSettings.volume;
      const limiter = offlineCtx.createDynamicsCompressor();
      limiter.threshold.value = masterSettings.limiterEnabled ? masterSettings.limiterCeiling : 0;
      limiter.knee.value = 0;
      limiter.ratio.value = masterSettings.limiterEnabled ? 20 : 1;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.05;
      masterGain.connect(limiter);
      limiter.connect(offlineCtx.destination);

      setExportProgress(5);

      // Decode and schedule each clip
      let clipsProcessed = 0;
      const totalClips = tracks.reduce((n, t) => n + t.clips.length, 0);

      for (const track of tracks) {
        if (track.muted) continue;
        const trackGain = offlineCtx.createGain();
        trackGain.gain.value = track.volume;
        const trackPan = offlineCtx.createStereoPanner();
        trackPan.pan.value = track.pan;
        trackGain.connect(trackPan);
        trackPan.connect(masterGain);

        for (const clip of track.clips) {
          try {
            let buffer: AudioBuffer;
            if (clip.url) {
              const response = await fetch(clip.url);
              const arrayBuf = await response.arrayBuffer();
              buffer = await offlineCtx.decodeAudioData(arrayBuf);
            } else {
              // Generate silence for clips with no audio data
              buffer = offlineCtx.createBuffer(2, Math.ceil(clip.duration * sr), sr);
            }

            // Apply clip processing (gain, fades)
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            const clipGain = offlineCtx.createGain();
            clipGain.gain.value = clip.gain;

            // Fades
            if (clip.fadeIn > 0) {
              clipGain.gain.setValueAtTime(0, clip.startTime);
              clipGain.gain.linearRampToValueAtTime(clip.gain, clip.startTime + clip.fadeIn);
            }
            if (clip.fadeOut > 0) {
              const fadeStart = clip.startTime + clip.duration - clip.fadeOut;
              clipGain.gain.setValueAtTime(clip.gain, fadeStart);
              clipGain.gain.linearRampToValueAtTime(0, clip.startTime + clip.duration);
            }

            source.connect(clipGain);
            clipGain.connect(trackGain);
            source.start(clip.startTime, clip.trimStart, clip.duration);
          } catch (clipErr) {
            console.warn('[Export] Skipping clip:', clip.name, clipErr);
          }
          clipsProcessed++;
          setExportProgress(5 + (clipsProcessed / Math.max(totalClips, 1)) * 70);
        }
      }

      setExportProgress(80);

      // Render the audio
      const renderedBuffer = await offlineCtx.startRendering();
      setExportProgress(90);

      let exportBlob: Blob;
      let ext: string;
      const format = exportSettings.format;

      if (format === 'ogg' || format === 'mp3') {
        // Use MediaRecorder for compressed formats
        // OGG/Vorbis is natively supported; MP3 falls back to WebM/Opus
        const audioCtx = new AudioContext({ sampleRate: sr });
        const source = audioCtx.createBufferSource();
        source.buffer = renderedBuffer;
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const mimeType = format === 'ogg'
          ? (MediaRecorder.isTypeSupported('audio/ogg;codecs=vorbis') ? 'audio/ogg;codecs=vorbis' : 'audio/webm;codecs=opus')
          : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=vorbis');
        const recorder = new MediaRecorder(dest.stream, { mimeType });
        const chunks: Blob[] = [];

        const done = new Promise<Blob>((resolve) => {
          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
          recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });

        recorder.start();
        source.start(0);
        source.onended = () => { setTimeout(() => { recorder.stop(); audioCtx.close(); }, 100); };

        exportBlob = await done;
        ext = format === 'ogg' ? '.ogg' : '.webm';
      } else {
        // Lossless export: WAV (native), AIFF (proper format), FLAC (24-bit WAV lossless fallback)
        if (format === 'aiff') {
          exportBlob = new Blob([audioBufferToAIFF(renderedBuffer, exportSettings.bitDepth <= 16 ? 16 : 24)], { type: 'audio/aiff' });
          ext = '.aiff';
        } else {
          exportBlob = audioBufferToWav(renderedBuffer, exportSettings.bitDepth);
          ext = format === 'flac' ? '.flac' : '.wav';
        }
      }

      const fileName = `imosion-export-${Date.now()}${ext}`;
      setExportProgress(95);

      const url = URL.createObjectURL(exportBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      await new Promise(r => setTimeout(r, 500));
      setShowExportModal(false);
    } catch (error) {
      console.error('[Export] Failed:', error);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [exportSettings, tracks, duration, masterSettings, sampleRate]);

  // Create collaboration session
  const createCollabSession = useCallback((sessionName: string) => {
    const hostCollaborator: Collaborator = {
      id: userId,
      name: userName,
      color: userColor,
      isOnline: true,
      isRecording: false,
      role: 'host'
    };
    const session: CollaborationSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: sessionName,
      hostId: userId,
      participants: [hostCollaborator],
      isLive: true,
      createdAt: Date.now(),
      projectState: JSON.stringify({ tracks, buses, bpm, projectKey })
    };
    
    setCollaborationSession(session);
    setCollaborators([{
      id: userId,
      name: userName,
      color: userColor,
      isOnline: true,
      isRecording: false,
      role: 'host'
    }]);
    
    // In real implementation: establish WebSocket/WebRTC connection
  }, [userId, userName, userColor, tracks, buses, bpm, projectKey]);

  // Join collaboration session
  const joinCollabSession = useCallback((sessionId: string) => {
    // In real implementation: connect to session via WebSocket/WebRTC
    // For now, simulate joining
    setCollaborators(prev => [...prev, {
      id: userId,
      name: userName,
      color: userColor,
      isOnline: true,
      isRecording: false,
      role: 'editor'
    }]);
  }, [userId, userName, userColor]);

  // Leave collaboration session
  const leaveCollabSession = useCallback(() => {
    setCollaborationSession(null);
    setCollaborators([]);
    setCollabMessages([]);
  }, []);

  // Send collaboration message
  const sendCollabMessage = useCallback((message: string) => {
    if (!message.trim()) return;
    
    setCollabMessages(prev => [...prev, {
      sender: userName,
      message: message.trim(),
      time: new Date()
    }]);
    setNewCollabMessage('');
    
    // In real implementation: broadcast via WebSocket
  }, [userName]);

  // Update collaborator cursor position
  const updateCollabCursor = useCallback((trackId: string, time: number) => {
    // In real implementation: broadcast cursor position to other collaborators
    setCollaborators(prev => prev.map(c => 
      c.id === userId ? { ...c, cursor: { trackId, time } } : c
    ));
  }, [userId]);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingTrack) {
        setTrackPanelWidth(Math.max(150, Math.min(350, e.clientX)));
      }
      if (isResizingPlugin && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPluginPanelWidth(Math.max(180, Math.min(400, rect.right - e.clientX)));
      }
    };
    const handleMouseUp = () => { setIsResizingTrack(false); setIsResizingPlugin(false); };
    if (isResizingTrack || isResizingPlugin) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingTrack, isResizingPlugin]);

  // Close menus on click
  useEffect(() => {
    const handleClick = () => { setContextMenu(p => ({ ...p, visible: false })); setShowFileMenu(false); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      switch (e.code) {
        case 'Space': e.preventDefault(); setIsPlaying(p => !p); break;
        case 'KeyR': if (!ctrl) { e.preventDefault(); isRecording ? stopRecording() : startRecording(); } break;
        case 'KeyS': if (!ctrl) { e.preventDefault(); setIsPlaying(false); setCurrentTime(0); if (isRecording) stopRecording(); } break;
        case 'Home': e.preventDefault(); setCurrentTime(0); break;
        case 'KeyT': if (ctrl) { e.preventDefault(); addTrack(); } break;
        case 'Delete': case 'Backspace': if (selectedTrack) deleteTrack(selectedTrack); break;
        case 'KeyM': if (selectedTrack) updateTrack(selectedTrack, { muted: !tracks.find(t => t.id === selectedTrack)?.muted }); break;
        case 'KeyL': setIsLooping(l => !l); break;
        case 'Equal': case 'NumpadAdd': setZoom(z => Math.min(200, z * 1.15)); break;
        case 'Minus': case 'NumpadSubtract': setZoom(z => Math.max(10, z / 1.15)); break;
        case 'KeyP': if (!ctrl) setShowPluginBrowser(p => !p); break;
        case 'KeyZ': if (ctrl) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } break;
        case 'KeyY': if (ctrl) { e.preventDefault(); redo(); } break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isRecording, selectedTrack, tracks]);

  // Audio init
  useEffect(() => {
    const init = async () => {
      await getAudioEngine().init(sampleRate, bitDepth, masterSettings.oversampling);
      audioContextRef.current = getAudioEngine().getContext();
      analyserRef.current = getAudioEngine().getAnalyser();
      getAudioEngine().setMasterVolume(masterSettings.volume);
      getAudioEngine().setMasterLimiter(masterSettings.limiterEnabled, masterSettings.limiterCeiling);
      buses.forEach(b => getAudioEngine().createBusNodes(b.id));
      tracks.forEach(t => {
        getAudioEngine().createTrackNodes(t.id, t.output);
        t.sends.forEach(s => getAudioEngine().createSend(t.id, s.id, s.busId, s.level, s.preFader));
      });
    };
    window.addEventListener('click', init, { once: true });
    return () => window.removeEventListener('click', init);
  }, [sampleRate, bitDepth]);

  useEffect(() => { 
    getAudioEngine().setMasterVolume(masterSettings.volume); 
    getAudioEngine().setMasterLimiter(masterSettings.limiterEnabled, masterSettings.limiterCeiling);
  }, [masterSettings]);

  // Apply output device selection (earphones, speakers, audio interfaces)
  useEffect(() => {
    if (selectedOutputDevice) {
      getAudioEngine().setOutputDevice(selectedOutputDevice);
    }
  }, [selectedOutputDevice]);

  useEffect(() => {
    tracks.forEach(t => {
      getAudioEngine().createTrackNodes(t.id, t.output);
      const hasSolo = tracks.some(tr => tr.solo);
      getAudioEngine().updateTrack(t.id, t.volume, t.pan, t.muted || (hasSolo && !t.solo), t.phase, t.trim);
      t.plugins.forEach(p => getAudioEngine().processPlugin(t.id, p));
      t.sends.forEach(s => getAudioEngine().updateSend(t.id, s.id, s.level));
    });
    buses.forEach(b => {
      getAudioEngine().createBusNodes(b.id);
      const hasSolo = buses.some(bus => bus.solo);
      getAudioEngine().updateBus(b.id, b.volume, b.pan, b.muted || (hasSolo && !b.solo));
    });
  }, [tracks, buses]);

  // Smooth Playback with requestAnimationFrame (sub-millisecond timing)
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = performance.now();
      
      const animate = (timestamp: number) => {
        const deltaMs = timestamp - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timestamp;
        
        // Convert to seconds with high precision
        const deltaSec = deltaMs / 1000;
        
        setCurrentTime(t => {
          const next = t + deltaSec;
          if (isLooping && next >= duration) return 0;
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return next;
        });
        
        if (isPlaying) {
          playbackRef.current = requestAnimationFrame(animate) as unknown as number;
        }
      };
      
      playbackRef.current = requestAnimationFrame(animate) as unknown as number;
    } else if (playbackRef.current) {
      cancelAnimationFrame(playbackRef.current);
      playbackRef.current = null;
    }
    
    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
        playbackRef.current = null;
      }
    };
  }, [isPlaying, isLooping, duration]);

  // Metronome audio scheduling
  useEffect(() => {
    if (isPlaying && metronomeSettings.enabled && audioEngineRef.current) {
      const ctx = (audioEngineRef.current as any).ctx as AudioContext | null;
      if (!ctx) return;
      // Generate click buffers once
      if (!metronomeAccentRef.current) metronomeAccentRef.current = generateMetronomeClick(ctx, true);
      if (!metronomeNormalRef.current) metronomeNormalRef.current = generateMetronomeClick(ctx, false);
      // Schedule 4 seconds of clicks at a time
      const sources = scheduleMetronome(
        ctx, bpm, { beats: 4, value: 4 },
        ctx.currentTime, 4,
        metronomeAccentRef.current, metronomeNormalRef.current,
        metronomeSettings.volume
      );
      metronomeSourcesRef.current = sources;
      // Re-schedule every 3.5 seconds to overlap
      const timer = setInterval(() => {
        if (!metronomeSettings.enabled) return;
        const newSources = scheduleMetronome(
          ctx, bpm, { beats: 4, value: 4 },
          ctx.currentTime, 4,
          metronomeAccentRef.current!, metronomeNormalRef.current!,
          metronomeSettings.volume
        );
        metronomeSourcesRef.current.push(...newSources);
      }, 3500);
      return () => {
        clearInterval(timer);
        metronomeSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
        metronomeSourcesRef.current = [];
      };
    }
    return undefined;
  }, [isPlaying, metronomeSettings.enabled, metronomeSettings.volume, bpm]);

  // Recording with selected audio device (earphones, interface, etc.)
  const startRecording = useCallback(async () => {
    try {
      // Use selected input device for recording (supports any audio interface)
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: sampleRate },
          channelCount: { ideal: 2 },
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Create audio context with optimal latency hint
      const latencyHint = latencyMode === 'ultra-low' ? 'interactive' : latencyMode === 'low' ? 'balanced' : 'playback';
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate, latencyHint });
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = bufferSize * 2;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // High-precision level metering with requestAnimationFrame
      const dataArray = new Float32Array(analyser.fftSize);
      const updateLevel = () => {
        analyser.getFloatTimeDomainData(dataArray);
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const abs = Math.abs(dataArray[i]);
          if (abs > peak) peak = abs;
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        // Use peak for more responsive metering
        const db = 20 * Math.log10(Math.max(peak, rms) + 0.0001);
        setInputLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Use best available codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: bitDepth === 32 ? 256000 : bitDepth === 24 ? 192000 : 128000 });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setInputLevel(0);
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const armedTrack = tracks.find(t => t.armed);
          if (armedTrack) {
            const newClip: AudioClip = { 
              id: `clip-${Date.now()}`, 
              name: `Take ${armedTrack.clips.length + 1}`, 
              startTime: currentTime, 
              duration: 10, 
              waveform: Array(50).fill(0.1),
              gain: 1, 
              url,
              ...DEFAULT_CLIP_PROPS
            };
            setTracks(prev => prev.map(t => t.id === armedTrack.id ? { ...t, clips: [...t.clips, newClip] } : t));
            // Decode the recorded blob to get real waveform peaks
            (async () => {
              try {
                const arrBuf = await blob.arrayBuffer();
                const tmpCtx = new AudioContext();
                const decoded = await tmpCtx.decodeAudioData(arrBuf);
                const realPeaks = extractWaveformPeaks(decoded, 50);
                setTracks(prev => prev.map(t => t.id === armedTrack.id ? {
                  ...t, clips: t.clips.map(c => c.id === newClip.id ? { ...c, waveform: realPeaks, duration: decoded.duration } : c)
                } : t));
                tmpCtx.close();
              } catch (e) { console.warn('[Imosion] Could not decode recorded audio for waveform:', e); }
            })();
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      if (!isPlaying) setIsPlaying(true);
    } catch (err) { console.error('Recording error:', err); }
  }, [currentTime, isPlaying, tracks, sampleRate, selectedInputDevice, latencyMode, bufferSize, bitDepth]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  }, [isRecording]);

  // Spectrum analyzer rendering
  useEffect(() => {
    if (!showSpectrum) {
      if (spectrumAnimRef.current) cancelAnimationFrame(spectrumAnimRef.current);
      return;
    }
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const engine = audioEngineRef.current;
      const data = engine?.getAnalyserData?.();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w * 2 || canvas.height !== h * 2) {
        canvas.width = w * 2;
        canvas.height = h * 2;
        ctx.scale(2, 2);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, w, h);

      if (data) {
        const freq = data.frequency;
        const barCount = Math.min(freq.length, 256);
        const barW = w / barCount;
        for (let i = 0; i < barCount; i++) {
          const val = (freq[i] + 140) / 140; // normalize from dB
          const barH = Math.max(0, val * h * 0.9);
          const hue = 210 + (i / barCount) * 60;
          ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.85)`;
          ctx.fillRect(i * barW, h - barH, barW - 1, barH);
        }
        // Waveform overlay
        const td = data.timeDomain;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(10,132,255,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < td.length; i++) {
          const x = (i / td.length) * w;
          const y = ((td[i] + 1) / 2) * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // No data - draw flat line
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }
      spectrumAnimRef.current = requestAnimationFrame(draw);
    };
    spectrumAnimRef.current = requestAnimationFrame(draw);
    return () => {
      if (spectrumAnimRef.current) cancelAnimationFrame(spectrumAnimRef.current);
    };
  }, [showSpectrum]);

  // Track actions
  const addTrack = useCallback(() => {
    if (tracks.length >= 1000) return;
    const newTrack: AudioTrack = { 
      id: `t${Date.now()}`, 
      name: `Track ${tracks.length + 1}`, 
      type: 'audio',
      volume: 0.8, 
      pan: 0, 
      muted: false, 
      solo: false, 
      armed: false, 
      color: COLORS[tracks.length % COLORS.length], 
      clips: [], 
      plugins: [],
      output: 'master',
      sends: [],
      phase: false,
      trim: 0
    };
    setTracks(prev => [...prev, newTrack]);
    setSelectedTrack(newTrack.id);
  }, [tracks.length]);

  // Bus actions
  const addBus = useCallback((type: 'aux' | 'group' | 'fx') => {
    const newBus: AudioBus = {
      id: `bus-${Date.now()}`,
      name: type === 'fx' ? `FX ${buses.filter(b => b.type === 'fx').length + 1}` : type === 'group' ? `Group ${buses.filter(b => b.type === 'group').length + 1}` : `Aux ${buses.filter(b => b.type === 'aux').length + 1}`,
      type,
      color: COLORS[(buses.length + 3) % COLORS.length],
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      plugins: [],
      output: 'master'
    };
    setBuses(prev => [...prev, newBus]);
    getAudioEngine().createBusNodes(newBus.id);
  }, [buses]);

  const deleteBus = useCallback((id: string) => {
    // Remove all track sends to this bus
    setTracks(prev => prev.map(t => ({
      ...t,
      sends: t.sends.filter(s => s.busId !== id),
      output: t.output === id ? 'master' : t.output
    })));
    setBuses(prev => prev.filter(b => b.id !== id));
  }, []);

  const updateBus = useCallback((id: string, updates: Partial<AudioBus>) => {
    setBuses(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  // ==================== DRAG AND DROP ====================
  const handleClipDragStart = useCallback((e: React.DragEvent, clipId: string, trackId: string, clip: AudioClip) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'clip', clipId, trackId }));
    setDragState({ type: 'clip', sourceId: clipId, sourceTrackId: trackId, targetId: null, offsetX: e.nativeEvent.offsetX, offsetY: 0, startTime: clip.startTime });
  }, []);

  const handleTrackDragOver = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const time = Math.max(0, (e.clientX - rect.left - dragState.offsetX) / zoom);
    setDropTarget({ trackId, time });
  }, [dragState.offsetX, zoom]);

  const handleTrackDrop = useCallback((e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'clip' && dropTarget) {
        const sourceTrack = tracks.find(t => t.id === data.trackId);
        const clip = sourceTrack?.clips.find(c => c.id === data.clipId);
        if (clip) {
          // Move clip to new track and position
          const newClip = { ...clip, startTime: Math.max(0, dropTarget.time) };
          setTracks(prev => prev.map(t => {
            if (t.id === data.trackId && t.id !== targetTrackId) {
              return { ...t, clips: t.clips.filter(c => c.id !== data.clipId) };
            }
            if (t.id === targetTrackId) {
              if (data.trackId === targetTrackId) {
                return { ...t, clips: t.clips.map(c => c.id === data.clipId ? newClip : c) };
              }
              return { ...t, clips: [...t.clips.filter(c => c.id !== data.clipId), newClip] };
            }
            return t;
          }));
        }
      }
    } catch { /* export failed */ }
    setDragState({ type: 'none', sourceId: null, sourceTrackId: null, targetId: null, offsetX: 0, offsetY: 0, startTime: 0 });
    setDropTarget(null);
  }, [dropTarget, tracks, zoom]);

  const handleDragEnd = useCallback(() => {
    setDragState({ type: 'none', sourceId: null, sourceTrackId: null, targetId: null, offsetX: 0, offsetY: 0, startTime: 0 });
    setDropTarget(null);
  }, []);

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import audio files via file picker
  const importAudioFiles = useCallback(async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|ogg|flac|aiff|m4a|webm)$/i));
    if (audioFiles.length === 0) return;

    for (const file of audioFiles) {
      const url = URL.createObjectURL(file);
      blobUrlsRef.current.add(url);
      const trackId = selectedTrack || tracks[0]?.id;
      if (!trackId) continue;

      // Create audio element to get duration
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => { 
        audio.addEventListener('loadedmetadata', () => resolve()); 
        audio.addEventListener('error', () => resolve()); // Still add clip on error
        audio.load(); 
        setTimeout(resolve, 3000); // Timeout fallback
      });
      
      const newClip: AudioClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        startTime: currentTime,
        duration: audio.duration || 10,
        waveform: Array(50).fill(0.3),
        gain: 1,
        url,
        ...DEFAULT_CLIP_PROPS
      };

      // Compute real waveform peaks from decoded audio
      try {
        const resp = await fetch(url);
        const arrBuf = await resp.arrayBuffer();
        const tmpCtx = new AudioContext();
        const decoded = await tmpCtx.decodeAudioData(arrBuf);
        newClip.waveform = AudioEngine.computeWaveformPeaks(decoded, 50);
        newClip.duration = decoded.duration;
        tmpCtx.close();
      } catch {}

      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
    }
  }, [currentTime, selectedTrack, tracks]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      importAudioFiles(e.target.files);
      e.target.value = ''; // Reset for re-import
    }
  }, [importAudioFiles]);

  // File drop handler for importing audio
  const handleFileDrop = useCallback(async (e: React.DragEvent, targetTrackId?: string) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|ogg|flac|aiff|m4a|webm)$/i));
    if (files.length === 0) return;

    for (const file of files) {
      const url = URL.createObjectURL(file);
      blobUrlsRef.current.add(url);
      const trackId = targetTrackId || selectedTrack || tracks[0]?.id;
      if (!trackId) continue;

      // Create audio element to get duration
      const audio = new Audio(url);
      await new Promise<void>((resolve) => { 
        audio.addEventListener('loadedmetadata', () => resolve()); 
        audio.addEventListener('error', () => resolve());
        audio.load(); 
        setTimeout(resolve, 3000);
      });
      
      const newClip: AudioClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        startTime: currentTime,
        duration: audio.duration || 10,
        waveform: Array(50).fill(0.3),
        gain: 1,
        url,
        ...DEFAULT_CLIP_PROPS
      };

      // Compute real waveform peaks from decoded audio
      try {
        const resp = await fetch(url);
        const arrBuf = await resp.arrayBuffer();
        const tmpCtx = new AudioContext();
        const decoded = await tmpCtx.decodeAudioData(arrBuf);
        newClip.waveform = AudioEngine.computeWaveformPeaks(decoded, 50);
        newClip.duration = decoded.duration;
        tmpCtx.close();
      } catch {}

      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
    }
    setDropTarget(null);
  }, [currentTime, selectedTrack, tracks]);

  // ==================== EXTERNAL PLUGINS ====================
  const installPlugin = useCallback((plugin: ExternalPlugin) => {
    if (installedPlugins.some(p => p.id === plugin.id)) return;
    setInstalledPlugins(prev => [...prev, { ...plugin, installed: true }]);
  }, [installedPlugins]);

  const uninstallPlugin = useCallback((pluginId: string) => {
    setInstalledPlugins(prev => prev.filter(p => p.id !== pluginId));
  }, []);

  const filteredStorePlugins = useMemo(() => {
    const query = pluginSearchQuery.toLowerCase();
    return EXTERNAL_PLUGIN_CATALOG.filter(p => 
      !installedPlugins.some(ip => ip.id === p.id) &&
      (p.name.toLowerCase().includes(query) || p.vendor.toLowerCase().includes(query) || p.category.toLowerCase().includes(query))
    );
  }, [pluginSearchQuery, installedPlugins]);

  // Send actions
  const addSend = useCallback((trackId: string, busId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.sends.length >= MAX_SENDS_PER_TRACK || track.sends.some(s => s.busId === busId)) return;
    const newSend: TrackSend = { id: `send-${Date.now()}`, busId, level: 0.5, preFader: false };
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, sends: [...t.sends, newSend] } : t));
    getAudioEngine().createSend(trackId, newSend.id, busId, newSend.level, newSend.preFader);
  }, [tracks]);

  const removeSend = useCallback((trackId: string, sendId: string) => {
    getAudioEngine().removeSend(trackId, sendId);
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, sends: t.sends.filter(s => s.id !== sendId) } : t));
  }, []);

  const updateSend = useCallback((trackId: string, sendId: string, updates: Partial<TrackSend>) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, sends: t.sends.map(s => s.id === sendId ? { ...s, ...updates } : s) } : t));
    const track = tracks.find(t => t.id === trackId);
    const send = track?.sends.find(s => s.id === sendId);
    if (send && updates.level !== undefined) getAudioEngine().updateSend(trackId, sendId, updates.level);
  }, [tracks]);

  // Clip manipulation
  const updateClip = useCallback((trackId: string, clipId: string, updates: Partial<AudioClip>) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...updates } : c) } : t));
  }, []);

  const splitClip = useCallback((trackId: string, clipId: string, splitTime: number) => {
    const track = tracks.find(t => t.id === trackId);
    const clip = track?.clips.find(c => c.id === clipId);
    if (!clip || splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return;
    
    const splitPoint = splitTime - clip.startTime;
    const clip1: AudioClip = { ...clip, duration: splitPoint, fadeOut: 0 };
    const clip2: AudioClip = { 
      ...clip, 
      id: `clip-${Date.now()}`, 
      name: `${clip.name} (2)`,
      startTime: splitTime, 
      duration: clip.duration - splitPoint,
      fadeIn: 0,
      trimStart: clip.trimStart + splitPoint
    };
    
    setTracks(prev => prev.map(t => t.id === trackId ? { 
      ...t, 
      clips: [...t.clips.filter(c => c.id !== clipId), clip1, clip2] 
    } : t));
  }, [tracks]);

  const duplicateClip = useCallback((trackId: string, clipId: string) => {
    const track = tracks.find(t => t.id === trackId);
    const clip = track?.clips.find(c => c.id === clipId);
    if (!clip) return;
    
    const newClip: AudioClip = { 
      ...clip, 
      id: `clip-${Date.now()}`, 
      name: `${clip.name} (copy)`,
      startTime: clip.startTime + clip.duration + 0.1
    };
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
  }, [tracks]);

  const deleteTrack = useCallback((id: string) => {
    if (tracks.length <= 1) return;
    const newTracks = tracks.filter(t => t.id !== id);
    setTracks(newTracks);
    if (selectedTrack === id) setSelectedTrack(newTracks[0]?.id || null);
  }, [selectedTrack, tracks]);

  const updateTrack = useCallback((id: string, updates: Partial<AudioTrack>) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  // Plugin actions - max 10 per track
  const addPluginToTrack = useCallback((trackId: string, pluginType: PluginType) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.plugins.length >= MAX_PLUGINS_PER_TRACK) return;
    const lib = PLUGIN_LIBRARY[pluginType];
    const newPlugin: TrackPlugin = { id: `p${Date.now()}`, type: pluginType, enabled: true, params: Object.fromEntries(lib.params.map(p => [p.key, p.default])) };
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, plugins: [...t.plugins, newPlugin] } : t));
    // Wire real DSP nodes for this plugin
    try { getAudioEngine().processPlugin(trackId, newPlugin); } catch {}
    setShowPluginBrowser(false);
  }, [tracks, getAudioEngine]);

  const removePlugin = useCallback((trackId: string, pluginId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, plugins: t.plugins.filter(p => p.id !== pluginId) } : t));
  }, []);

  const updatePluginParam = useCallback((trackId: string, pluginId: string, key: string, value: number) => {
    setTracks(prev => {
      const updated = prev.map(t => t.id === trackId ? { ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, params: { ...p.params, [key]: value } } : p) } : t);
      // Re-process plugin with updated params
      const track = updated.find(t => t.id === trackId);
      const plugin = track?.plugins.find(p => p.id === pluginId);
      if (plugin) { try { getAudioEngine().processPlugin(trackId, plugin); } catch {} }
      return updated;
    });
  }, [getAudioEngine]);

  const togglePlugin = useCallback((trackId: string, pluginId: string) => {
    setTracks(prev => {
      const updated = prev.map(t => t.id === trackId ? { ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p) } : t);
      const track = updated.find(t => t.id === trackId);
      const plugin = track?.plugins.find(p => p.id === pluginId);
      if (plugin) { try { getAudioEngine().processPlugin(trackId, plugin); } catch {} }
      return updated;
    });
  }, [getAudioEngine]);

  // Template actions
  const applyTemplate = useCallback((template: RecordingTemplate) => {
    setTracks(template.tracks.map(t => ({ ...t, type: 'audio' as const, clips: [] })));
    setBuses(template.buses || []);
    setBpm(template.bpm);
    setSampleRate(template.sampleRate as 48000 | 96000 | 192000);
    setBitDepth(template.bitDepth || 32);
    setSelectedTrack(template.tracks[0]?.id || null);
    setShowTemplates(false);
  }, []);

  const saveTemplate = useCallback(() => {
    if (!newTemplateName.trim()) return;
    const newTemplate: RecordingTemplate = { 
      id: `tpl-${Date.now()}`, 
      name: newTemplateName.trim(), 
      tracks: tracks.map(({ clips, ...t }) => t), 
      buses,
      bpm, 
      sampleRate, 
      bitDepth,
      createdAt: Date.now() 
    };
    setTemplates(prev => [...prev, newTemplate]);
    setNewTemplateName('');
  }, [newTemplateName, tracks, buses, bpm, sampleRate, bitDepth]);

  const deleteTemplate = useCallback((id: string) => {
    if (DEFAULT_TEMPLATES.find(t => t.id === id)) return;
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const formatTime = useCallback((t: number) => {
    if (timeDisplayMode === 'bars') {
      const beatDuration = 60 / bpm;
      const totalBeats = t / beatDuration;
      const bar = Math.floor(totalBeats / 4) + 1;
      const beat = Math.floor(totalBeats % 4) + 1;
      const tick = Math.floor((totalBeats % 1) * 480);
      return `${bar}.${beat}.${tick.toString().padStart(3, '0')}`;
    }
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}.${Math.floor((t % 1) * 100).toString().padStart(2, '0')}`;
  }, [timeDisplayMode, bpm]);

  const selectedTrackData = tracks.find(t => t.id === selectedTrack);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', userSelect: 'none', transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease' }}>
      {/* Hidden file input for audio import */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.aiff,.m4a,.webm"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 4px rgba(255, 69, 58, 0.4); } 50% { box-shadow: 0 0 8px rgba(255, 69, 58, 0.6); } }
        @keyframes viewSwitch { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        button { 
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); 
          font-family: inherit;
          border: none;
          outline: none;
        }
        button:active:not(:disabled) { transform: scale(0.96); }
        button:disabled { opacity: 0.35; cursor: not-allowed; }
        input[type="range"] { 
          -webkit-appearance: none; 
          background: transparent; 
          cursor: pointer; 
          height: 4px;
        }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 16px; 
          width: 16px; 
          border-radius: 50%; 
          background: linear-gradient(145deg, #30d158, #28a745);
          margin-top: -6px;
          border: 2px solid rgba(255,255,255,0.2);
          box-shadow: 0 2px 8px rgba(48,209,88,0.4);
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover { 
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(48,209,88,0.5);
        }
        input[type="range"]::-webkit-slider-runnable-track { 
          height: 4px; 
          background: rgba(255,255,255,0.1);
          border-radius: 2px; 
        }
        ::-webkit-scrollbar { width: 7px; height: 7px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(48,209,88,0.25); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(48,209,88,0.4); }
        .resize-handle { cursor: col-resize; background: var(--color-bg-glass); }
        .resize-handle:hover { background: rgba(48,209,88,0.3); }
        .dropdown-item:hover { background: rgba(48,209,88,0.1); }
        .track-row:hover { background: rgba(48,209,88,0.08); }
        .clip-item { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); cursor: grab; }
        .clip-item:hover { box-shadow: 0 4px 16px rgba(48,209,88,0.3); transform: translateY(-2px); }
        .clip-item:active { cursor: grabbing; }
        .clip-dragging { opacity: 0.6; transform: scale(1.02); }
        .drop-target { background: rgba(48,209,88,0.15) !important; }
        .modal-overlay { animation: fadeIn 0.15s ease; backdrop-filter: blur(8px); }
        .modal-content { animation: scaleIn 0.2s ease; }
        .tooltip { animation: slideIn 0.1s ease; }
        select { 
          transition: all 0.15s ease; 
          outline: none;
          font-family: inherit;
        }
        select:focus, input:focus { outline: none; box-shadow: 0 0 0 3px rgba(48,209,88,0.15); }
        select:hover { border-color: rgba(48,209,88,0.4) !important; }
        .btn { 
          display: flex; 
          align-items: center; 
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 10px;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .btn:hover { background: rgba(48,209,88,0.12); color: #30d158; border-color: rgba(48,209,88,0.3); }
        .btn-active { background: rgba(48,209,88,0.15); color: #30d158; border-color: rgba(48,209,88,0.4); }
        .btn-icon { padding: 6px 8px; }
        .btn-primary { background: linear-gradient(145deg, #30d158 0%, #28a745 100%); border-color: rgba(48,209,88,0.3); color: #fff; font-weight: 700; box-shadow: 0 2px 8px rgba(48,209,88,0.3); }
        .btn-primary:hover { background: linear-gradient(145deg, #30d158 0%, #30d158 100%); box-shadow: 0 6px 20px rgba(48,209,88,0.4); }
        .btn-danger { background: linear-gradient(145deg, #ff453a 0%, #ff453a 100%); border-color: rgba(255,69,58,0.3); color: #fff; box-shadow: 0 2px 8px rgba(255,69,58,0.3); }
        .divider { width: 1px; height: 20px; background: rgba(255,255,255,0.08); margin: 0 4px; }
        .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #30d158; }
        .glass-panel { background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%); backdrop-filter: blur(12px); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: '36px', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '3px', background: 'linear-gradient(145deg, #30d158, #30d158)', boxShadow: '0 0 12px rgba(48,209,88,0.5)' }} />
            <span style={{ fontSize: '14px', fontWeight: 800, background: 'linear-gradient(135deg, #30d158 0%, #30d158 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '1px' }}>IMOSION</span>
            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>DAW</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={(e) => { e.stopPropagation(); setShowFileMenu(!showFileMenu); }} className="btn" style={{ background: 'transparent', border: 'none', fontSize: '11px', color: 'var(--color-text-muted)' }}>File {Icon.chevron}</button>
            {showFileMenu && (
              <div className="tooltip" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', minWidth: '160px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', boxShadow: '0 12px 32px rgba(0,0,0,0.6)', zIndex: 200, padding: '6px', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => { applyTemplate(DEFAULT_TEMPLATES[3]); setShowFileMenu(false); }}>{Icon.plus} New Project</div>
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>{Icon.save} Save</div>
                <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '6px 4px' }} />
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => { setShowTemplates(true); setShowFileMenu(false); }}>{Icon.template} Templates</div>
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => { fileInputRef.current?.click(); setShowFileMenu(false); }}>{Icon.upload} Import Audio</div>
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => { setShowExportModal(true); setShowFileMenu(false); }}>{Icon.download} Export</div>
                <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '6px 4px' }} />
                <div className="dropdown-item" style={{ padding: '8px 12px', fontSize: '11px', color: '#71717a', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => { closeApp('imosion'); setShowFileMenu(false); }}>{Icon.close} Exit</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', background: 'var(--color-bg-inset)', borderRadius: '6px', padding: '2px', border: '1px solid var(--color-border-subtle)' }}>
            <button aria-label="Arrange" onClick={() => setViewMode('arrange')} style={{ padding: '5px 12px', borderRadius: '4px', border: 'none', background: viewMode === 'arrange' ? '#0a84ff' : 'transparent', color: viewMode === 'arrange' ? '#fff' : 'var(--color-text-muted)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>Arrange</button>
            <button aria-label="Mixer" onClick={() => setViewMode('mixer')} style={{ padding: '5px 12px', borderRadius: '4px', border: 'none', background: viewMode === 'mixer' ? '#0a84ff' : 'transparent', color: viewMode === 'mixer' ? '#fff' : 'var(--color-text-muted)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>Mixer</button>
          </div>
        </div>
      </div>

      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        {/* Left: Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Undo/Redo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px', padding: '3px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <button aria-label="Undo" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', color: historyIndex <= 0 ? '#27272a' : '#71717a', cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.undo}</button>
            <button aria-label="Redo" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', color: historyIndex >= history.length - 1 ? '#27272a' : '#71717a', cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.redo}</button>
          </div>
          
          {/* Transport Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px', padding: '3px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <button aria-label="Rewind" onClick={() => setCurrentTime(0)} title="Rewind" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.rewind}</button>
            <button aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={() => { if (isRecording) stopRecording(); setIsPlaying(!isPlaying); }} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'} style={{ width: '34px', height: '28px', borderRadius: '5px', border: 'none', background: isPlaying ? '#30d158' : 'transparent', color: isPlaying ? '#052e16' : '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{isPlaying ? Icon.pause : Icon.play}</button>
            <button aria-label="Stop" onClick={() => { setIsPlaying(false); setCurrentTime(0); if (isRecording) stopRecording(); }} title="Stop" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.stop}</button>
            <button aria-label={isRecording ? 'Stop Recording' : 'Record (R)'} onClick={isRecording ? stopRecording : startRecording} title={isRecording ? 'Stop Recording' : 'Record (R)'} style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: isRecording ? '#ff453a' : 'transparent', color: isRecording ? '#fff' : '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: isRecording ? 'glow 1s ease-in-out infinite' : 'none' }}>{Icon.record}</button>
            <div style={{ width: '1px', height: '18px', background: '#27272a', margin: '0 2px' }} />
            <button aria-label="Loop" onClick={() => setIsLooping(!isLooping)} title="Loop (L)" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: isLooping ? 'rgba(10,132,255,0.15)' : 'transparent', color: isLooping ? '#0a84ff' : '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.loop}</button>
            <button aria-label="Metronome" onClick={() => setMetronomeSettings(s => ({ ...s, enabled: !s.enabled }))} title="Metronome" style={{ width: '30px', height: '28px', borderRadius: '5px', border: 'none', background: metronomeSettings.enabled ? 'rgba(191,90,242,0.15)' : 'transparent', color: metronomeSettings.enabled ? '#bf5af2' : '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>note</button>
          </div>
        </div>
        
        {/* Center: Time Display + BPM + Key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Time Display with bars/time toggle */}
          <div 
            onClick={() => setTimeDisplayMode(m => m === 'time' ? 'bars' : 'time')} 
            title="Click to toggle Time / Bars.Beats"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 20px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', minWidth: '140px', cursor: 'pointer' }}>
            <span style={{ fontSize: '8px', color: '#3f3f46', fontWeight: 600, letterSpacing: '1px', marginBottom: '2px' }}>{timeDisplayMode === 'time' ? 'TIME' : 'BARS'}</span>
            <span style={{ fontFamily: '"SF Mono", "Fira Code", Consolas, monospace', fontSize: '18px', fontWeight: 600, color: '#f4f4f5', letterSpacing: '0.5px' }}>{formatTime(currentTime)}</span>
          </div>
          
          {!beginnerMode && <>
          {/* BPM */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 16px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', minWidth: '80px' }}>
            <span style={{ fontSize: '8px', color: '#3f3f46', fontWeight: 600, letterSpacing: '1px', marginBottom: '2px' }}>BPM</span>
            <input type="number" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))} style={{ width: '50px', background: 'transparent', border: 'none', color: '#f4f4f5', fontSize: '16px', fontWeight: 600, textAlign: 'center', fontFamily: '"SF Mono", monospace' }} />
          </div>
          
          {/* Key */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 12px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontSize: '8px', color: '#3f3f46', fontWeight: 600, letterSpacing: '1px', marginBottom: '4px' }}>KEY</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <select value={projectKey.root} onChange={(e) => setProjectKey(k => ({ ...k, root: e.target.value as MusicalKey }))} style={{ padding: '2px 4px', background: 'transparent', border: 'none', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                {MUSICAL_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
              </select>
              <select value={projectKey.scale} onChange={(e) => setProjectKey(k => ({ ...k, scale: e.target.value as MusicalScale }))} style={{ padding: '2px 4px', background: 'transparent', border: 'none', color: '#71717a', fontSize: '11px', cursor: 'pointer' }}>
                {MUSICAL_SCALES.map(scale => <option key={scale.value} value={scale.value}>{scale.label}</option>)}
              </select>
            </div>
          </div>
          </>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Master Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
            <input type="range" min="0" max="1" step="0.01" value={masterSettings.volume} onChange={(e) => setMasterSettings(s => ({ ...s, volume: parseFloat(e.target.value) }))} style={{ width: '80px' }} />
            <span style={{ fontSize: '11px', color: '#e4e4e7', fontFamily: '"SF Mono", monospace', minWidth: '36px', textAlign: 'right', fontWeight: 500 }}>{Math.round(masterSettings.volume * 100)}%</span>
          </div>
          
          {/* Export Button */}
          <button aria-label="Export" onClick={() => setShowExportModal(true)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 600 }}>{Icon.export} Export</button>
        </div>
      </div>

      {/* Mic Level (when armed) */}
      {(isRecording || tracks.some(t => t.armed)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 20px', background: isRecording ? 'rgba(255,69,58,0.06)' : 'var(--color-bg-base)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isRecording ? '#ff453a' : '#52525b', fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {isRecording && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff453a', animation: 'pulse 1s ease-in-out infinite' }} />}
            INPUT LEVEL
          </span>
          <div style={{ flex: 1, height: '8px', background: 'var(--color-bg-inset)', borderRadius: '4px', overflow: 'hidden', maxWidth: '220px', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ height: '100%', width: `${inputLevel * 100}%`, background: inputLevel > 0.85 ? 'linear-gradient(90deg, #ff453a, #ff453a)' : inputLevel > 0.6 ? 'linear-gradient(90deg, #ff9f0a, #ff9f0a)' : 'linear-gradient(90deg, #52525b, #3f3f46)', transition: 'width 0.05s', borderRadius: '3px' }} />
          </div>
          <span style={{ fontSize: '10px', color: '#71717a', fontFamily: '"SF Mono", monospace', minWidth: '45px' }}>{inputLevel > 0 ? `${Math.round((inputLevel - 1) * 60)} dB` : '-∞ dB'}</span>
        </div>
      )}

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Track Panel */}
        <div style={{ width: trackPanelWidth, minWidth: 150, background: 'var(--color-bg-inset)', borderRight: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="section-title">Tracks</span>
            <button aria-label="Add new track" onClick={addTrack} className="btn btn-icon" title="Add new track" style={{ width: '22px', height: '22px', padding: '0' }}>{Icon.plus}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {tracks.map(track => (
              <div key={track.id} onClick={() => setSelectedTrack(track.id)} style={{ padding: '8px 10px', marginBottom: '4px', background: selectedTrack === track.id ? 'linear-gradient(180deg, rgba(10,132,255,0.12), rgba(10,132,255,0.06))' : 'transparent', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${selectedTrack === track.id ? 'rgba(10,132,255,0.2)' : 'transparent'}`, transition: 'all 0.15s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '4px', height: '28px', borderRadius: '2px', background: `linear-gradient(180deg, ${track.color}, ${track.color}80)` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{!beginnerMode && <>{track.plugins.length} FX </>}{track.output !== 'master' && `> ${buses.find(b => b.id === track.output)?.name || 'Bus'}`}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} title="Mute" style={{ width: '20px', height: '18px', borderRadius: '4px', border: '1px solid', borderColor: track.muted ? 'rgba(10,132,255,0.3)' : 'var(--color-border-subtle)', background: track.muted ? 'rgba(10,132,255,0.2)' : 'var(--color-bg-inset)', color: track.muted ? '#0a84ff' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>M</button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} title="Solo" style={{ width: '20px', height: '18px', borderRadius: '4px', border: '1px solid', borderColor: track.solo ? 'rgba(255,159,10,0.3)' : 'var(--color-border-subtle)', background: track.solo ? 'rgba(255,159,10,0.2)' : 'var(--color-bg-inset)', color: track.solo ? '#ff9f0a' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>S</button>
                    <button aria-label="Record Arm" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }); }} title="Record Arm" style={{ width: '20px', height: '18px', borderRadius: '4px', border: '1px solid', borderColor: track.armed ? 'rgba(255,69,58,0.3)' : 'var(--color-border-subtle)', background: track.armed ? 'rgba(255,69,58,0.2)' : 'var(--color-bg-inset)', color: track.armed ? '#ff453a' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>R</button>
                  </div>
                  <button aria-label="Delete track" onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }} title="Delete track" style={{ width: '18px', height: '18px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#3f3f46', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>{Icon.trash}</button>
                </div>
                <div style={{ marginTop: '8px', paddingLeft: '12px' }}>
                  <input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })} onClick={(e) => e.stopPropagation()} style={{ width: '100%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resize Handle */}
        <div className="resize-handle" onMouseDown={() => setIsResizingTrack(true)} style={{ width: '5px' }} />

        {/* Timeline */}
        <div className="view-content" style={{ flex: 1, flexDirection: 'column', overflow: 'hidden', minWidth: 200, display: viewMode === 'arrange' ? 'flex' : 'none' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
                <button aria-label="Zoom In" onClick={() => setZoom(z => Math.min(200, z * 1.15))} className="btn btn-icon" style={{ background: 'transparent', border: 'none', width: '26px', height: '24px' }} title="Zoom In (Ctrl+Plus)">{Icon.zoomIn}</button>
                <button aria-label="Zoom Out" onClick={() => setZoom(z => Math.max(10, z / 1.15))} className="btn btn-icon" style={{ background: 'transparent', border: 'none', width: '26px', height: '24px' }} title="Zoom Out (Ctrl+Minus)">{Icon.zoomOut}</button>
                <button aria-label="Reset Zoom" onClick={() => setZoom(40)} className="btn btn-icon" style={{ background: 'transparent', border: 'none', width: '26px', height: '24px', fontSize: '9px', color: 'var(--color-text-muted)' }} title="Reset Zoom">1:1</button>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: '"SF Mono", monospace', minWidth: '36px', background: 'var(--color-bg-tertiary)', padding: '4px 8px', borderRadius: '4px', textAlign: 'center' }}>{Math.round(zoom)}px</span>
              <div className="divider" />
              <button aria-label="Split" onClick={() => setClipEdit(e => ({ ...e, mode: e.mode === 'split' ? 'none' : 'split' }))} className={`btn ${clipEdit.mode === 'split' ? 'btn-active' : ''}`}>{Icon.scissors} Split</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button aria-label="Import" onClick={() => fileInputRef.current?.click()} className="btn" style={{ color: '#30d158' }}>{Icon.upload} Import</button>
              <button aria-label="Export" onClick={() => setShowExportModal(true)} className="btn" style={{ color: '#0a84ff' }}>{Icon.download} Export</button>
              <div className="divider" />
              <button aria-label="FX Bus" onClick={() => addBus('fx')} className="btn">{Icon.bus} FX Bus</button>
              <button aria-label="Group" onClick={() => addBus('group')} className="btn">{Icon.route} Group</button>
              <div className="divider" />
              <button aria-label="Store" onClick={() => setShowPluginStore(true)} className="btn">{Icon.store} Store</button>
              <button aria-label="Add FX" onClick={() => setShowPluginBrowser(true)} className="btn btn-primary">{Icon.plugin} Add FX</button>
              <div className="divider" />
              <button aria-label="Spectrum Analyzer" onClick={() => setShowSpectrum(s => !s)} className={`btn ${showSpectrum ? 'btn-active' : ''}`} title="Spectrum Analyzer">Spectrum</button>
            </div>
          </div>

          {/* Ruler */}
          <div style={{ height: '28px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)', position: 'relative', overflowX: 'auto' }}>
            {timeDisplayMode === 'bars' ? (
              Array.from({ length: Math.ceil(duration / (240 / bpm)) + 1 }, (_, i) => {
                const barTime = i * (240 / bpm);
                return <div key={i} style={{ position: 'absolute', left: `${barTime * zoom}px`, bottom: '7px', fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: '"SF Mono", Consolas, monospace', fontWeight: 500 }}>{i + 1}</div>;
              })
            ) : (
              Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${i * 5 * zoom}px`, bottom: '7px', fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: '"SF Mono", Consolas, monospace', fontWeight: 500 }}>{i * 5}s</div>
              ))
            )}
            {keyChanges.map((kc, i) => (
              <div key={`key-${i}`} onClick={() => removeKeyChange(kc.time)} title={`${kc.key.root} ${kc.key.scale}`} style={{ position: 'absolute', left: `${kc.time * zoom}px`, top: '4px', padding: '2px 8px', background: 'var(--color-bg-elevated)', borderRadius: '4px', fontSize: '9px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 500 }}>{kc.key.root}{kc.key.scale === 'minor' ? 'm' : ''}</div>
            ))}
            {bpmChanges.map((bc, i) => (
              <div key={`bpm-${i}`} onClick={() => removeBpmChange(bc.time)} title={`${bc.bpm} BPM`} style={{ position: 'absolute', left: `${bc.time * zoom}px`, top: '4px', marginLeft: '40px', padding: '2px 8px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', fontSize: '9px', color: 'var(--color-text-muted)', cursor: 'pointer', fontWeight: 500 }}>{bc.bpm}</div>
            ))}
            {/* Add key/BPM change on double click */}
            <div 
              onDoubleClick={(e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickTime = clickX / zoom;
                if (e.shiftKey) {
                  addBpmChange(clickTime, bpm);
                } else {
                  addKeyChange(clickTime, projectKey);
                }
              }}
              style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
              title="Double-click to add key change, Shift+double-click for BPM change"
            />
          </div>

          {/* Tracks Area - with file drop support and mouse wheel zoom */}
          <div 
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', background: 'var(--color-bg-base)' }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
                const factor = 1 + Math.abs(delta) * 0.002;
                setZoom(z => delta < 0 ? Math.min(200, z * factor) : Math.max(10, z / factor));
              }
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => handleFileDrop(e)}
          >
            {/* Empty State for Arrange View */}
            {tracks.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '40px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'rgba(10,132,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Start Your Session</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', maxWidth: '300px' }}>Add tracks, import audio files, or record to begin your creative journey</div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={addTrack} style={{ padding: '12px 24px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '10px', color: '#0a84ff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Icon.plus} Add Track
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} style={{ padding: '12px 24px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '10px', color: '#30d158', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Icon.upload} Import Audio
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Tip: Drag audio files here or use keyboard shortcut Ctrl+T to add track
                </div>
              </div>
            )}
            {tracks.map(track => (
              <div 
                key={track.id} 
                className={`track-row ${dropTarget?.trackId === track.id ? 'drop-target' : ''}`}
                onClick={() => setSelectedTrack(track.id)} 
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, trackId: track.id, clipId: null, busId: null }); }} 
                onDragOver={(e) => handleTrackDragOver(e, track.id)}
                onDrop={(e) => handleTrackDrop(e, track.id)}
                onDragLeave={() => setDropTarget(null)}
                style={{ height: '52px', borderBottom: '1px solid var(--color-border-subtle)', background: selectedTrack === track.id ? 'rgba(10,132,255,0.04)' : 'transparent', position: 'relative', transition: 'background 0.15s' }}
              >
                {/* Drop indicator */}
                {dropTarget?.trackId === track.id && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${dropTarget.time * zoom}px`, width: '2px', background: '#0a84ff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 12px rgba(10,132,255,0.6)' }} />
                )}
                {track.clips.map(clip => (
                  <div 
                    key={clip.id} 
                    className={`clip-item ${dragState.sourceId === clip.id ? 'clip-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleClipDragStart(e, clip.id, track.id, clip)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => { 
                      e.stopPropagation();
                      if (clipEdit.mode === 'split') {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickTime = clip.startTime + (clickX / zoom);
                        splitClip(track.id, clip.id, clickTime);
                      } else {
                        setEditingClip({ trackId: track.id, clip });
                        setShowClipEditor(true);
                      }
                    }} 
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, trackId: track.id, clipId: clip.id, busId: null }); }} 
                    style={{ position: 'absolute', top: '5px', bottom: '5px', left: `${clip.startTime * zoom}px`, width: `${Math.max(clip.duration * zoom, 30)}px`, background: `linear-gradient(180deg, ${track.color}30, ${track.color}18)`, borderRadius: '6px', cursor: clipEdit.mode === 'split' ? 'crosshair' : 'grab', border: `1px solid ${track.color}50`, overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                  >
                    {/* Fade In indicator */}
                    {clip.fadeIn > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(clip.fadeIn / clip.duration * 100, 50)}%`, background: `linear-gradient(to right, ${track.color}70, transparent)`, pointerEvents: 'none' }} />}
                    {/* Fade Out indicator */}
                    {clip.fadeOut > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min(clip.fadeOut / clip.duration * 100, 50)}%`, background: `linear-gradient(to left, ${track.color}70, transparent)`, pointerEvents: 'none' }} />}
                    <div style={{ padding: '3px 6px', fontSize: '9px', fontWeight: 600, background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.2))', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {clip.tempoLocked && <span style={{ color: '#30d158', display: 'flex', alignItems: 'center' }} title="Tempo Locked">{Icon.link}</span>}
                      {clip.reverse && <span style={{ color: '#ff453a', fontWeight: 700 }}>R</span>}
                      {clip.pitch !== 0 && <span style={{ color: '#ff9f0a' }}>{clip.pitch > 0 ? '+' : ''}{clip.pitch}</span>}
                      {clip.stretch !== 1 && <span style={{ color: '#30d158' }}>{clip.stretch.toFixed(1)}x</span>}
                      <span style={{ color: '#e4e4e7' }}>{clip.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1px 2px', flex: 1, overflow: 'hidden' }}>
                      <canvas
                        ref={(el) => {
                          if (el && clip.waveform.length > 0) {
                            const ctx = el.getContext('2d');
                            if (!ctx) return;
                            const w = el.parentElement?.clientWidth || 100;
                            const h = el.parentElement?.clientHeight || 30;
                            el.width = w; el.height = h;
                            const mid = h / 2;
                            ctx.clearRect(0, 0, w, h);
                            ctx.fillStyle = track.color;
                            ctx.globalAlpha = 0.6;
                            ctx.beginPath();
                            ctx.moveTo(0, mid);
                            const peaks = clip.waveform;
                            for (let i = 0; i < peaks.length; i++) {
                              ctx.lineTo((i / peaks.length) * w, mid - peaks[i] * mid);
                            }
                            for (let i = peaks.length - 1; i >= 0; i--) {
                              ctx.lineTo((i / peaks.length) * w, mid + peaks[i] * mid);
                            }
                            ctx.closePath();
                            ctx.fill();
                            ctx.globalAlpha = 1;
                            ctx.strokeStyle = track.color;
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(0, mid);
                            for (let i = 0; i < peaks.length; i++) {
                              ctx.lineTo((i / peaks.length) * w, mid - peaks[i] * mid);
                            }
                            ctx.stroke();
                            ctx.strokeStyle = `${track.color}30`;
                            ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
                          }
                        }}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${currentTime * zoom}px`, width: '2px', background: '#ff453a', zIndex: 100, pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Full Mixer View */}
        {viewMode === 'mixer' && (
          <div className="view-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
            {/* Mixer Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-secondary)' }}>
              <span className="section-title">Mixer Console</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                <button aria-label="Track" onClick={addTrack} style={{ padding: '4px 10px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '4px', color: '#0a84ff', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.plus} Track</button>
                <button aria-label="FX Bus" onClick={() => addBus('fx')} style={{ padding: '4px 10px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '4px', color: '#30d158', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.bus} FX Bus</button>
                <span style={{ color: 'var(--color-border-default)' }}>|</span>
                <span>{tracks.length} Tracks</span>
                <span style={{ color: 'var(--color-border-default)' }}>|</span>
                <span>{buses.length} Buses</span>
              </div>
            </div>

            {/* Channel Strips Container */}
            <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', padding: '12px' }}>
              {/* Empty State */}
              {tracks.length === 0 && buses.length === 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(10,132,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
                      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                    </svg>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Empty Session</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Add tracks to start mixing</div>
                  </div>
                  <button onClick={addTrack} style={{ padding: '10px 20px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '8px', color: '#0a84ff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {Icon.plus} Add Track
                  </button>
                </div>
              )}
              {/* Track Channel Strips */}
              {tracks.map(track => (
                <div key={track.id} onClick={() => setSelectedTrack(track.id)} style={{ width: '94px', minWidth: '94px', background: selectedTrack === track.id ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)', borderRadius: '10px', marginRight: '8px', display: 'flex', flexDirection: 'column', border: `1px solid ${selectedTrack === track.id ? track.color + '40' : 'var(--color-border-subtle)'}`, overflow: 'hidden', boxShadow: selectedTrack === track.id ? `0 0 20px ${track.color}15` : '0 2px 8px rgba(0,0,0,0.2)' }}>
                  {/* Track Name */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', background: `linear-gradient(180deg, ${track.color}25, ${track.color}10)` }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                  </div>

                  {/* Pan Knob */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span style={{ fontSize: '7px', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase' }}>Pan</span>
                    <div style={{ position: 'relative', width: '40px', height: '40px' }}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="#1a1a1e" stroke="#27272a" strokeWidth="2" />
                        <line x1="20" y1="20" x2={20 + Math.sin(track.pan * Math.PI / 2) * 12} y2={20 - Math.cos(track.pan * Math.PI / 2) * 12} stroke={track.color} strokeWidth="2" strokeLinecap="round" />
                        <circle cx="20" cy="20" r="4" fill={track.color} />
                      </svg>
                    </div>
                    <input type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: '4px' }} />
                    <span style={{ fontSize: '8px', color: '#71717a', fontFamily: 'monospace' }}>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`}</span>
                  </div>

                  {/* Volume Fader */}
                  <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '7px', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase' }}>Vol</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                      <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: '#1a1a1e', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${track.volume * 100}%`, background: `linear-gradient(to top, ${track.color}, ${track.color}80)`, borderRadius: '4px' }} />
                      </div>
                      <input type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
                    </div>
                    <span style={{ fontSize: '9px', color: track.color, fontFamily: 'monospace', marginTop: '4px' }}>{track.volume > 1 ? '+' : ''}{((track.volume - 1) * 60).toFixed(1)} dB</span>
                  </div>

                  {/* Controls */}
                  <div style={{ padding: '6px', borderTop: '1px solid #1a1a1e', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.muted ? 'rgba(10,132,255,0.4)' : '#27272a', background: track.muted ? '#0a84ff' : '#1a1a1e', color: track.muted ? '#fff' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>M</button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.solo ? 'rgba(255,159,10,0.4)' : '#27272a', background: track.solo ? '#ff9f0a' : '#1a1a1e', color: track.solo ? '#000' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>S</button>
                    <button aria-label="Record arm" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.armed ? 'rgba(255,69,58,0.4)' : '#27272a', background: track.armed ? '#ff453a' : '#1a1a1e', color: track.armed ? '#fff' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>R</button>
                  </div>

                  {/* Output Routing */}
                  <div style={{ padding: '4px 6px', borderTop: '1px solid #1a1a1e', background: '#0a0a0c' }}>
                    <select value={track.output} onChange={(e) => updateTrack(track.id, { output: e.target.value as RoutingDestination })} style={{ width: '100%', padding: '3px 4px', background: '#111113', border: '1px solid #27272a', borderRadius: '3px', color: '#71717a', fontSize: '8px' }}>
                      <option value="master">Master</option>
                      {buses.filter(b => b.type === 'group').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              {/* Separator */}
              {buses.length > 0 && <div style={{ width: '2px', background: '#27272a', margin: '0 8px', borderRadius: '1px' }} />}

              {/* Bus Channel Strips */}
              {buses.map(bus => (
                <div key={bus.id} onClick={() => setSelectedBus(bus.id)} style={{ width: '90px', minWidth: '90px', background: selectedBus === bus.id ? '#18181b' : '#111113', borderRadius: '8px', marginRight: '6px', display: 'flex', flexDirection: 'column', border: `1px solid ${selectedBus === bus.id ? bus.color + '40' : '#1a1a1e'}`, overflow: 'hidden' }}>
                  {/* Bus Name */}
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid #1a1a1e', background: bus.color + '20' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '8px', color: bus.color, opacity: 0.7 }}>{bus.type === 'fx' ? 'FX' : 'GRP'}</span>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: bus.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bus.name}</div>
                    </div>
                  </div>

                  {/* Pan Knob */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid #1a1a1e' }}>
                    <span style={{ fontSize: '7px', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase' }}>Pan</span>
                    <div style={{ position: 'relative', width: '40px', height: '40px' }}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="#1a1a1e" stroke="#27272a" strokeWidth="2" />
                        <line x1="20" y1="20" x2={20 + Math.sin(bus.pan * Math.PI / 2) * 12} y2={20 - Math.cos(bus.pan * Math.PI / 2) * 12} stroke={bus.color} strokeWidth="2" strokeLinecap="round" />
                        <circle cx="20" cy="20" r="4" fill={bus.color} />
                      </svg>
                    </div>
                    <input type="range" min="-1" max="1" step="0.01" value={bus.pan} onChange={(e) => updateBus(bus.id, { pan: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: '4px' }} />
                    <span style={{ fontSize: '8px', color: '#71717a', fontFamily: 'monospace' }}>{bus.pan === 0 ? 'C' : bus.pan < 0 ? `L${Math.abs(Math.round(bus.pan * 100))}` : `R${Math.round(bus.pan * 100)}`}</span>
                  </div>

                  {/* Volume Fader */}
                  <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '7px', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase' }}>Vol</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                      <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: '#1a1a1e', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${bus.volume * 100}%`, background: `linear-gradient(to top, ${bus.color}, ${bus.color}80)`, borderRadius: '4px' }} />
                      </div>
                      <input type="range" min="0" max="1.5" step="0.01" value={bus.volume} onChange={(e) => updateBus(bus.id, { volume: parseFloat(e.target.value) })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
                    </div>
                    <span style={{ fontSize: '9px', color: bus.color, fontFamily: 'monospace', marginTop: '4px' }}>{bus.volume > 1 ? '+' : ''}{((bus.volume - 1) * 60).toFixed(1)} dB</span>
                  </div>

                  {/* Controls */}
                  <div style={{ padding: '6px', borderTop: '1px solid #1a1a1e', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateBus(bus.id, { muted: !bus.muted }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: bus.muted ? 'rgba(10,132,255,0.4)' : '#27272a', background: bus.muted ? '#0a84ff' : '#1a1a1e', color: bus.muted ? '#fff' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>M</button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateBus(bus.id, { solo: !bus.solo }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: bus.solo ? 'rgba(255,159,10,0.4)' : '#27272a', background: bus.solo ? '#ff9f0a' : '#1a1a1e', color: bus.solo ? '#000' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 700 }}>S</button>
                    <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteBus(bus.id); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid rgba(255,69,58,0.3)', background: 'rgba(255,69,58,0.1)', color: '#ff453a', cursor: 'pointer', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.trash}</button>
                  </div>
                </div>
              ))}

              {/* Master Channel */}
              <div style={{ width: '100px', minWidth: '100px', background: '#18181b', borderRadius: '8px', marginLeft: '8px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(48,209,88,0.3)', overflow: 'hidden' }}>
                <div style={{ padding: '8px', borderBottom: '1px solid #1a1a1e', background: 'rgba(48,209,88,0.1)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#30d158', textAlign: 'center' }}>MASTER</div>
                </div>

                {/* Master Volume */}
                <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '7px', color: '#52525b', marginBottom: '8px', textTransform: 'uppercase' }}>Output</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                    <div style={{ width: '12px', height: '100%', maxHeight: '140px', background: '#1a1a1e', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${masterSettings.volume * 100}%`, background: 'linear-gradient(to top, #30d158, #28a745)', borderRadius: '4px' }} />
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={masterSettings.volume} onChange={(e) => setMasterSettings(s => ({ ...s, volume: parseFloat(e.target.value) }))} style={{ position: 'absolute', width: '100%', maxHeight: '140px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#30d158', fontFamily: 'monospace', marginTop: '8px', fontWeight: 600 }}>{((masterSettings.volume - 1) * 60).toFixed(1)} dB</span>
                </div>

                {/* Master Controls */}
                <div style={{ padding: '8px', borderTop: '1px solid #1a1a1e', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button onClick={() => setMasterSettings(s => ({ ...s, limiterEnabled: !s.limiterEnabled }))} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid', borderColor: masterSettings.limiterEnabled ? 'rgba(255,69,58,0.4)' : '#27272a', background: masterSettings.limiterEnabled ? 'rgba(255,69,58,0.2)' : '#1a1a1e', color: masterSettings.limiterEnabled ? '#ff453a' : '#52525b', cursor: 'pointer', fontSize: '8px', fontWeight: 600 }}>LIMITER {masterSettings.limiterEnabled ? 'ON' : 'OFF'}</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '7px', color: '#52525b' }}>Ceil:</span>
                    <input type="range" min="-6" max="0" step="0.1" value={masterSettings.limiterCeiling} onChange={(e) => setMasterSettings(s => ({ ...s, limiterCeiling: parseFloat(e.target.value) }))} style={{ flex: 1 }} />
                    <span style={{ fontSize: '7px', color: '#71717a', width: '28px', textAlign: 'right' }}>{masterSettings.limiterCeiling.toFixed(1)}dB</span>
                  </div>
                  <button aria-label="MASTERING" onClick={() => setShowMasteringPanel(true)} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(191,90,242,0.3)', background: 'rgba(191,90,242,0.15)', color: '#bf5af2', cursor: 'pointer', fontSize: '8px', fontWeight: 600, marginTop: '4px' }}>MASTERING</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mastering Panel Modal */}
        {showMasteringPanel && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ width: '860px', maxHeight: '90vh', background: 'linear-gradient(180deg, #111114, #0a0a0c)', borderRadius: '12px', border: '1px solid #1f1f23', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d10' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '6px', height: '20px', background: 'linear-gradient(180deg, #bf5af2, #bf5af2)', borderRadius: '3px' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', letterSpacing: '-0.3px' }}>Mastering Suite</span>
                  <span style={{ fontSize: '10px', color: '#52525b', padding: '2px 8px', background: '#18181b', borderRadius: '4px' }}>Pro</span>
                </div>
                <button onClick={() => setShowMasteringPanel(false)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #27272a', background: '#18181b', color: '#71717a', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              
              {/* Presets Section */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1e', background: '#0c0c0f' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#52525b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Presets</span>
                  <button onClick={() => { setShowSavePresetModal({ type: 'mastering' }); setNewPresetName(''); }} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #27272a', background: '#18181b', color: '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>+ Save Current</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {MASTERING_PRESETS.map(preset => (
                    <button aria-label={preset.description} key={preset.id} onClick={() => applyMasteringPreset(preset.id)} title={preset.description} style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid', borderColor: selectedMasteringPreset === preset.id ? '#bf5af2' : '#27272a', background: selectedMasteringPreset === preset.id ? 'rgba(191,90,242,0.15)' : '#141417', color: selectedMasteringPreset === preset.id ? '#c084fc' : '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500, transition: 'all 0.15s' }}>{preset.name}</button>
                  ))}
                  {customMasteringPresets.map(preset => (
                    <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <button onClick={() => applyMasteringPreset(preset.id)} style={{ padding: '5px 10px', borderRadius: '4px 0 0 4px', border: '1px solid', borderColor: selectedMasteringPreset === preset.id ? '#30d158' : '#27272a', background: selectedMasteringPreset === preset.id ? 'rgba(48,209,88,0.15)' : '#141417', color: selectedMasteringPreset === preset.id ? '#4ade80' : '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>{preset.name}</button>
                      <button onClick={() => deleteCustomMasteringPreset(preset.id)} style={{ padding: '5px 6px', borderRadius: '0 4px 4px 0', border: '1px solid #27272a', borderLeft: 'none', background: '#141417', color: '#71717a', cursor: 'pointer', fontSize: '10px' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Controls Grid */}
              <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                {/* Stereo Image */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#0a84ff', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stereo Image</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Width</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.stereoWidth}%</span></div><input type="range" min="0" max="200" value={masterSettings.stereoWidth} onChange={e => setMasterSettings(s => ({ ...s, stereoWidth: +e.target.value }))} style={{ width: '100%', accentColor: '#0a84ff' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>M/S Balance</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.midSideBalance > 0 ? '+' : ''}{masterSettings.midSideBalance}</span></div><input type="range" min="-100" max="100" value={masterSettings.midSideBalance} onChange={e => setMasterSettings(s => ({ ...s, midSideBalance: +e.target.value }))} style={{ width: '100%', accentColor: '#0a84ff' }} /></div>
                  </div>
                </div>
                
                {/* Tone */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#30d158', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tone</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Low Shelf</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.lowShelf > 0 ? '+' : ''}{masterSettings.lowShelf} dB</span></div><input type="range" min="-12" max="12" step="0.5" value={masterSettings.lowShelf} onChange={e => setMasterSettings(s => ({ ...s, lowShelf: +e.target.value }))} style={{ width: '100%', accentColor: '#30d158' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>High Shelf</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.highShelf > 0 ? '+' : ''}{masterSettings.highShelf} dB</span></div><input type="range" min="-12" max="12" step="0.5" value={masterSettings.highShelf} onChange={e => setMasterSettings(s => ({ ...s, highShelf: +e.target.value }))} style={{ width: '100%', accentColor: '#30d158' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Bass Enhance</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.bassEnhance}%</span></div><input type="range" min="0" max="100" value={masterSettings.bassEnhance} onChange={e => setMasterSettings(s => ({ ...s, bassEnhance: +e.target.value }))} style={{ width: '100%', accentColor: '#30d158' }} /></div>
                  </div>
                </div>
                
                {/* Multiband */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ff9f0a', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Multiband</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Low</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.multiband.lowGain > 0 ? '+' : ''}{masterSettings.multiband.lowGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.lowGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, lowGain: +e.target.value } }))} style={{ width: '100%', accentColor: '#ff9f0a' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Mid</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.multiband.midGain > 0 ? '+' : ''}{masterSettings.multiband.midGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.midGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, midGain: +e.target.value } }))} style={{ width: '100%', accentColor: '#ff9f0a' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>High</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.multiband.highGain > 0 ? '+' : ''}{masterSettings.multiband.highGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.highGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, highGain: +e.target.value } }))} style={{ width: '100%', accentColor: '#ff9f0a' }} /></div>
                  </div>
                </div>
                
                {/* Character */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ff375f', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Character</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Analog Warmth</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.analogWarmth}%</span></div><input type="range" min="0" max="100" value={masterSettings.analogWarmth} onChange={e => setMasterSettings(s => ({ ...s, analogWarmth: +e.target.value }))} style={{ width: '100%', accentColor: '#ff375f' }} /></div>
                  </div>
                </div>
                
                {/* Loudness */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ff453a', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loudness</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Target</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.loudnessTarget} LUFS</span></div><input type="range" min="-24" max="0" value={masterSettings.loudnessTarget} onChange={e => setMasterSettings(s => ({ ...s, loudnessTarget: +e.target.value }))} style={{ width: '100%', accentColor: '#ff453a' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: '#71717a' }}>Ceiling</label><span style={{ fontSize: '9px', color: '#a1a1aa', fontFamily: 'monospace' }}>{masterSettings.limiterCeiling.toFixed(1)} dB</span></div><input type="range" min="-6" max="0" step="0.1" value={masterSettings.limiterCeiling} onChange={e => setMasterSettings(s => ({ ...s, limiterCeiling: +e.target.value }))} style={{ width: '100%', accentColor: '#ff453a' }} /></div>
                    <button onClick={() => setMasterSettings(s => ({ ...s, limiterEnabled: !s.limiterEnabled }))} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid', borderColor: masterSettings.limiterEnabled ? '#ff453a' : '#27272a', background: masterSettings.limiterEnabled ? 'rgba(255,69,58,0.15)' : '#0f0f12', color: masterSettings.limiterEnabled ? '#ff453a' : '#52525b', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>Limiter {masterSettings.limiterEnabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                
                {/* Output */}
                <div style={{ background: '#141417', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#bf5af2', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Output</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><label style={{ fontSize: '9px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Dithering</label><select value={masterSettings.dithering} onChange={e => setMasterSettings(s => ({ ...s, dithering: e.target.value as any }))} style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', background: '#0c0c0f', border: '1px solid #27272a', color: '#e4e4e7', fontSize: '10px' }}><option value="none">None</option><option value="triangular">Triangular</option><option value="noise-shaped">Noise Shaped</option></select></div>
                    <div><label style={{ fontSize: '9px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Oversampling</label><select value={masterSettings.oversampling} onChange={e => setMasterSettings(s => ({ ...s, oversampling: +e.target.value as any }))} style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', background: '#0c0c0f', border: '1px solid #27272a', color: '#e4e4e7', fontSize: '10px' }}><option value="1">1x (Off)</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option></select></div>
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0c0c0f' }}>
                <span style={{ fontSize: '10px', color: '#3f3f46' }}>Adjust settings to taste, then save as custom preset</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button aria-label="Reset" onClick={() => { setMasterSettings({ volume: 0.85, limiterEnabled: true, limiterCeiling: -0.3, dithering: 'triangular', oversampling: 1, stereoWidth: 100, bassEnhance: 0, highShelf: 0, lowShelf: 0, midSideBalance: 0, multiband: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 200, highFreq: 4000 }, analogWarmth: 10, loudnessTarget: -14 }); setSelectedMasteringPreset(null); }} style={{ padding: '7px 14px', borderRadius: '5px', border: '1px solid #27272a', background: '#18181b', color: '#a1a1aa', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}>Reset</button>
                  <button aria-label="Done" onClick={() => setShowMasteringPanel(false)} style={{ padding: '7px 16px', borderRadius: '5px', border: 'none', background: 'linear-gradient(180deg, #bf5af2, #9333ea)', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Preset Modal */}
        {showSavePresetModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ width: '340px', background: '#111114', borderRadius: '10px', border: '1px solid #27272a', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #1f1f23' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7' }}>Save Preset</span>
              </div>
              <div style={{ padding: '18px' }}>
                <label style={{ fontSize: '10px', color: '#71717a', display: 'block', marginBottom: '6px' }}>Preset Name</label>
                <input type="text" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} placeholder="My Custom Preset" autoFocus style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: '#0a0a0c', border: '1px solid #27272a', color: '#e4e4e7', fontSize: '12px', outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter' && newPresetName.trim()) { if (showSavePresetModal.type === 'mastering') saveCustomMasteringPreset(newPresetName.trim()); else if (showSavePresetModal.pluginType && showSavePresetModal.trackId && showSavePresetModal.pluginId) saveCustomPluginPreset(showSavePresetModal.pluginType, showSavePresetModal.trackId, showSavePresetModal.pluginId, newPresetName.trim()); }}} />
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid #1f1f23', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button aria-label="Cancel" onClick={() => setShowSavePresetModal(null)} style={{ padding: '7px 14px', borderRadius: '5px', border: '1px solid #27272a', background: 'transparent', color: '#a1a1aa', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                <button aria-label="Save" onClick={() => { if (newPresetName.trim()) { if (showSavePresetModal.type === 'mastering') saveCustomMasteringPreset(newPresetName.trim()); else if (showSavePresetModal.pluginType && showSavePresetModal.trackId && showSavePresetModal.pluginId) saveCustomPluginPreset(showSavePresetModal.pluginType, showSavePresetModal.trackId, showSavePresetModal.pluginId, newPresetName.trim()); }}} disabled={!newPresetName.trim()} style={{ padding: '7px 14px', borderRadius: '5px', border: 'none', background: newPresetName.trim() ? '#bf5af2' : '#27272a', color: newPresetName.trim() ? 'white' : '#52525b', cursor: newPresetName.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 500 }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Resize Handle */}
        <div className="resize-handle" onMouseDown={() => setIsResizingPlugin(true)} style={{ width: '4px', display: viewMode === 'arrange' ? 'block' : 'none' }} />

        {/* Plugin Panel */}
        {selectedTrackData && viewMode === 'arrange' && (
          <div style={{ width: pluginPanelWidth, minWidth: 180, background: 'linear-gradient(180deg, #0c0c0f, #09090b)', borderLeft: '1px solid #1a1a1e', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, #111114, #0d0d10)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0a84ff' }}>{selectedTrackData.name}</span>
              <span style={{ fontSize: '9px', color: '#52525b', padding: '2px 6px', background: '#0f0f12', borderRadius: '4px' }}>{selectedTrackData.plugins.length}/{MAX_PLUGINS_PER_TRACK}</span>
            </div>
            
            {/* Routing Section */}
            <div style={{ padding: '10px', borderBottom: '1px solid #1a1a1e', background: '#0a0a0d' }}>
              <div className="section-title" style={{ marginBottom: '8px' }}>Routing</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '9px', color: '#71717a', width: '34px' }}>Out:</span>
                <select value={selectedTrackData.output} onChange={(e) => { updateTrack(selectedTrackData.id, { output: e.target.value as RoutingDestination }); getAudioEngine().routeTrackToOutput(selectedTrackData.id, e.target.value as RoutingDestination); }} style={{ flex: 1, padding: '4px 6px', background: '#111114', border: '1px solid #1f1f23', borderRadius: '5px', color: '#e4e4e7', fontSize: '10px' }}>
                  <option value="master">Master</option>
                  {buses.filter(b => b.type === 'group').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <button aria-label="Phase" onClick={() => updateTrack(selectedTrackData.id, { phase: !selectedTrackData.phase })} style={{ padding: '4px 8px', background: selectedTrackData.phase ? 'rgba(255,69,58,0.2)' : '#111114', border: '1px solid', borderColor: selectedTrackData.phase ? 'rgba(255,69,58,0.3)' : '#1f1f23', borderRadius: '5px', color: selectedTrackData.phase ? '#ff453a' : '#71717a', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.phase} Phase</button>
                <span style={{ fontSize: '9px', color: '#52525b' }}>Trim:</span>
                <input type="range" min="-24" max="24" step="0.5" value={selectedTrackData.trim} onChange={(e) => updateTrack(selectedTrackData.id, { trim: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: '9px', color: '#71717a', width: '32px', textAlign: 'right', fontFamily: '"SF Mono", monospace' }}>{selectedTrackData.trim.toFixed(1)}</span>
              </div>
              
              {/* Sends */}
              <div style={{ fontSize: '8px', fontWeight: 600, color: '#52525b', marginTop: '6px', marginBottom: '2px' }}>SENDS</div>
              {selectedTrackData.sends.map(send => {
                const bus = buses.find(b => b.id === send.busId);
                return (
                  <div key={send.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '8px', color: bus?.color || '#71717a', width: '40px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bus?.name || 'Bus'}</span>
                    <input type="range" min="0" max="1" step="0.01" value={send.level} onChange={(e) => updateSend(selectedTrackData.id, send.id, { level: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                    <button onClick={() => updateSend(selectedTrackData.id, send.id, { preFader: !send.preFader })} style={{ padding: '1px 3px', background: send.preFader ? 'rgba(48,209,88,0.2)' : '#111113', border: '1px solid #27272a', borderRadius: '2px', color: send.preFader ? '#30d158' : '#52525b', cursor: 'pointer', fontSize: '7px' }}>{send.preFader ? 'PRE' : 'POST'}</button>
                    <button onClick={() => removeSend(selectedTrackData.id, send.id)} style={{ width: '14px', height: '14px', background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: '2px', color: '#ff453a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}>x</button>
                  </div>
                );
              })}
              {buses.filter(b => b.type === 'fx' && !selectedTrackData.sends.some(s => s.busId === b.id)).length > 0 && selectedTrackData.sends.length < MAX_SENDS_PER_TRACK && (
                <select onChange={(e) => { if (e.target.value) addSend(selectedTrackData.id, e.target.value); e.target.value = ''; }} style={{ width: '100%', padding: '2px 4px', background: '#111113', border: '1px solid #27272a', borderRadius: '3px', color: '#52525b', fontSize: '8px', marginTop: '2px' }}>
                  <option value="">+ Add Send</option>
                  {buses.filter(b => b.type === 'fx' && !selectedTrackData.sends.some(s => s.busId === b.id)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>

            {/* Plugins */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
              {selectedTrackData.plugins.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#3f3f46', fontSize: '10px' }}>No plugins added.<br/>Press P or click "Add Plugin"</div>
              ) : (
                selectedTrackData.plugins.map(plugin => {
                  const lib = PLUGIN_LIBRARY[plugin.type];
                  const presets = PLUGIN_PRESETS[plugin.type] || [];
                  return (
                    <div key={plugin.id} style={{ padding: '6px', marginBottom: '4px', background: '#111113', borderRadius: '6px', border: `1px solid ${lib.color}30`, opacity: plugin.enabled ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button aria-label="ON" onClick={() => togglePlugin(selectedTrackData.id, plugin.id)} style={{ width: '16px', height: '14px', borderRadius: '3px', border: 'none', background: plugin.enabled ? lib.color : '#27272a', color: '#fff', cursor: 'pointer', fontSize: '6px', fontWeight: 700 }}>ON</button>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: lib.color }}>{lib.abbr}</span>
                          <span style={{ fontSize: '9px', color: '#71717a' }}>{lib.name}</span>
                        </div>
                        <button aria-label="Delete" onClick={() => removePlugin(selectedTrackData.id, plugin.id)} style={{ width: '16px', height: '16px', borderRadius: '3px', border: 'none', background: 'rgba(255,69,58,0.1)', color: '#ff453a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.trash}</button>
                      </div>
                      {/* Preset Selector with Custom Presets */}
                      <div style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <select onChange={e => { if (e.target.value) applyPluginPreset(selectedTrackData.id, plugin.id, e.target.value, plugin.type); }} style={{ flex: 1, padding: '4px 6px', borderRadius: '4px', background: '#0a0a0c', border: `1px solid ${lib.color}40`, color: '#a1a1aa', fontSize: '9px', cursor: 'pointer' }} defaultValue="">
                            <option value="" disabled>Load Preset...</option>
                            <optgroup label="Factory">
                              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                            {customPluginPresets[plugin.type]?.length > 0 && (
                              <optgroup label="Custom">
                                {customPluginPresets[plugin.type].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                          <button aria-label="Save preset" onClick={() => { setShowSavePresetModal({ type: 'plugin', pluginType: plugin.type, trackId: selectedTrackData.id, pluginId: plugin.id }); setNewPresetName(''); }} style={{ padding: '4px 6px', borderRadius: '4px', background: '#0a0a0c', border: `1px solid ${lib.color}40`, color: '#71717a', cursor: 'pointer', fontSize: '9px' }} title="Save preset">+</button>
                        </div>
                      </div>
                      {lib.params.map(param => (
                        <div key={param.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                          <span style={{ width: '36px', fontSize: '8px', color: '#52525b' }}>{param.label}</span>
                          <input type="range" min={param.min} max={param.max} step={(param.max - param.min) / 100} value={plugin.params[param.key] ?? param.default} onChange={(e) => updatePluginParam(selectedTrackData.id, plugin.id, param.key, parseFloat(e.target.value))} style={{ flex: 1 }} />
                          <span style={{ width: '32px', fontSize: '8px', color: lib.color, textAlign: 'right', fontFamily: 'monospace' }}>{(plugin.params[param.key] ?? param.default).toFixed(param.max > 100 ? 0 : 1)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Spectrum Analyzer */}
      {showSpectrum && (
        <div style={{ height: 120, background: '#07070a', borderTop: '1px solid #141417', position: 'relative', flexShrink: 0 }}>
          <canvas ref={spectrumCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', top: 4, right: 8, fontSize: 10, color: '#52525b', pointerEvents: 'none' }}>Spectrum Analyzer</div>
        </div>
      )}

      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 14px', background: 'linear-gradient(180deg, #0a0a0d, #070708)', borderTop: '1px solid #141417', fontSize: '10px', color: '#52525b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: isRecording ? 'rgba(255,69,58,0.15)' : isPlaying ? 'rgba(48,209,88,0.15)' : '#0f0f12', borderRadius: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isRecording ? '#ff453a' : isPlaying ? '#30d158' : '#3f3f46', boxShadow: isRecording ? '0 0 6px rgba(255,69,58,0.6)' : isPlaying ? '0 0 6px rgba(48,209,88,0.6)' : 'none' }} />
            <span style={{ color: isRecording ? '#ff453a' : isPlaying ? '#4ade80' : '#52525b', fontWeight: 500 }}>{isRecording ? 'RECORDING' : isPlaying ? 'PLAYING' : 'READY'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', background: '#0f0f12', borderRadius: '3px' }}>{bitDepth}-bit / {sampleRate/1000}kHz</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>{tracks.length} tracks</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>{buses.length} buses</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>{tracks.reduce((s, t) => s + t.clips.length, 0)} clips</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>{tracks.reduce((s, t) => s + t.plugins.length, 0)} FX</span>
        </div>
      </div>

      {/* Plugin Browser Modal */}
      {showPluginBrowser && selectedTrackData && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowPluginBrowser(false)}>
          <div className="modal-content" style={{ width: '520px', maxHeight: '80vh', background: 'linear-gradient(180deg, #131316, #0f0f12)', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, #18181b, #131316)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Add Effect ({selectedTrackData.plugins.length}/{MAX_PLUGINS_PER_TRACK})</span>
              <button aria-label="Close" onClick={() => setShowPluginBrowser(false)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}>{Icon.close}</button>
            </div>
            
            {/* Tabs: Built-in / Installed */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1f1f23' }}>
              <button style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: '2px solid #0a84ff', color: '#e4e4e7', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>Built-in Effects</button>
              <button onClick={() => { setShowPluginBrowser(false); setShowPluginStore(true); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#71717a', fontSize: '11px', cursor: 'pointer' }}>Installed ({installedPlugins.length})</button>
            </div>

            <div style={{ padding: '14px', maxHeight: '420px', overflowY: 'auto' }}>
              {selectedTrackData.plugins.length >= MAX_PLUGINS_PER_TRACK ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#ff453a', fontSize: '12px', background: 'rgba(255,69,58,0.1)', borderRadius: '8px' }}>Maximum {MAX_PLUGINS_PER_TRACK} plugins per track reached</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {(Object.entries(PLUGIN_LIBRARY) as [PluginType, typeof PLUGIN_LIBRARY[PluginType]][]).map(([type, lib]) => (
                      <div key={type} className="plugin-card" onClick={() => addPluginToTrack(selectedTrackData.id, type)} style={{ padding: '12px', background: 'linear-gradient(180deg, #0f0f12, #0c0c0f)', borderRadius: '8px', border: '1px solid #1f1f23', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: lib.color, marginBottom: '3px' }}>{lib.abbr}</div>
                        <div style={{ fontSize: '11px', fontWeight: 500, color: '#e4e4e7' }}>{lib.name}</div>
                        <div style={{ fontSize: '9px', color: '#52525b', marginTop: '4px' }}>{lib.params.length} parameters</div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Installed external plugins */}
                  {installedPlugins.length > 0 && (
                    <>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#52525b', marginTop: '12px', marginBottom: '6px', textTransform: 'uppercase' }}>Installed Plugins</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                        {installedPlugins.map(plugin => (
                          <div key={plugin.id} className="plugin-card" style={{ padding: '10px', background: '#0c0c0e', borderRadius: '6px', border: '1px solid #27272a', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: plugin.color }}>{plugin.name}</span>
                              <span style={{ fontSize: '7px', padding: '1px 3px', background: 'rgba(48,209,88,0.2)', color: '#30d158', borderRadius: '2px' }}>{plugin.type.toUpperCase()}</span>
                            </div>
                            <div style={{ fontSize: '9px', color: '#71717a' }}>{plugin.vendor}</div>
                            <div style={{ fontSize: '8px', color: '#52525b' }}>{plugin.category}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plugin Store Modal */}
      {showPluginStore && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowPluginStore(false)}>
          <div className="modal-content" style={{ width: '600px', maxHeight: '85vh', background: '#111113', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to right, rgba(48,209,88,0.1), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#30d158' }}>{Icon.store}</span>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Plugin Store</span>
              </div>
              <button aria-label="Close" onClick={() => setShowPluginStore(false)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            
            {/* Search */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1f1f23' }}>
              <input 
                value={pluginSearchQuery} 
                onChange={(e) => setPluginSearchQuery(e.target.value)} 
                placeholder="Search plugins by name, vendor, or category..." 
                style={{ width: '100%', padding: '8px 12px', background: '#0a0a0c', border: '1px solid #27272a', borderRadius: '6px', color: '#e4e4e7', fontSize: '11px' }} 
              />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid #1f1f23', gap: '4px' }}>
              <button style={{ padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '2px solid #30d158', color: '#e4e4e7', fontSize: '10px', cursor: 'pointer' }}>Browse ({filteredStorePlugins.length})</button>
              <button style={{ padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#71717a', fontSize: '10px', cursor: 'pointer' }}>Installed ({installedPlugins.length})</button>
            </div>

            <div style={{ padding: '12px', maxHeight: '450px', overflowY: 'auto' }}>
              {/* Featured / Available */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {filteredStorePlugins.map(plugin => (
                  <div key={plugin.id} className="plugin-card" style={{ padding: '12px', background: '#0c0c0e', borderRadius: '8px', border: '1px solid #27272a' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: plugin.color }}>{plugin.name}</div>
                        <div style={{ fontSize: '10px', color: '#a1a1aa' }}>{plugin.vendor}</div>
                      </div>
                      <span style={{ fontSize: '8px', padding: '2px 5px', background: 'rgba(10,132,255,0.2)', color: '#0a84ff', borderRadius: '3px' }}>{plugin.type.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: '#52525b', marginBottom: '8px' }}>{plugin.category} • v{plugin.version}</div>
                    <button 
                      onClick={() => installPlugin(plugin)} 
                      style={{ width: '100%', padding: '6px', background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: '4px', color: '#30d158', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      {Icon.download} Install
                    </button>
                  </div>
                ))}
              </div>

              {filteredStorePlugins.length === 0 && pluginSearchQuery && (
                <div style={{ padding: '30px', textAlign: 'center', color: '#52525b', fontSize: '11px' }}>No plugins found matching "{pluginSearchQuery}"</div>
              )}

              {/* Installed section */}
              {installedPlugins.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#52525b', marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase' }}>Your Installed Plugins</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {installedPlugins.map(plugin => (
                      <div key={plugin.id} style={{ padding: '12px', background: '#0c0c0e', borderRadius: '8px', border: '1px solid rgba(48,209,88,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: '#30d158' }}>{Icon.check}</span>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: plugin.color }}>{plugin.name}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#a1a1aa' }}>{plugin.vendor}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '9px', color: '#52525b', marginBottom: '8px' }}>{plugin.category} • v{plugin.version}</div>
                        <button 
                          onClick={() => uninstallPlugin(plugin.id)} 
                          style={{ width: '100%', padding: '6px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '4px', color: '#ff453a', cursor: 'pointer', fontSize: '10px' }}
                        >
                          Uninstall
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTemplates(false)}>
          <div className="modal-content" style={{ width: '400px', maxHeight: '70vh', background: '#111113', borderRadius: '10px', border: '1px solid #27272a', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Templates</span>
              <button aria-label="Close" onClick={() => setShowTemplates(false)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '10px', maxHeight: '350px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Template name..." style={{ flex: 1, padding: '6px 10px', background: '#0c0c0e', border: '1px solid #27272a', borderRadius: '4px', color: '#e4e4e7', fontSize: '11px', outline: 'none' }} />
                <button aria-label="Save" onClick={saveTemplate} style={{ padding: '6px 12px', background: '#0a84ff', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.save} Save</button>
              </div>
              {templates.map(tpl => (
                <div key={tpl.id} onClick={() => applyTemplate(tpl)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#0c0c0e', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', border: '1px solid #27272a', transition: 'all 0.15s' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600 }}>{tpl.name}</div>
                    <div style={{ fontSize: '9px', color: '#52525b' }}>{tpl.tracks.length} tracks / {tpl.bpm} BPM / {tpl.sampleRate/1000}k</div>
                  </div>
                  {!DEFAULT_TEMPLATES.find(d => d.id === tpl.id) && (
                    <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }} style={{ padding: '3px 6px', background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: '4px', color: '#ff453a', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>{Icon.trash}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div className="tooltip" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, minWidth: '160px', background: '#111113', border: '1px solid #27272a', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.clipId ? (
            <>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) { duplicateClip(contextMenu.trackId, contextMenu.clipId); } setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.copy} Duplicate</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) { const track = tracks.find(t => t.id === contextMenu.trackId); const clip = track?.clips.find(c => c.id === contextMenu.clipId); if (clip) { setEditingClip({ trackId: contextMenu.trackId!, clip }); setShowClipEditor(true); } } setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.mixer} Edit Clip</div>
              <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
              {/* Tempo Lock Toggle */}
              <div className="ctx-item" onClick={() => { 
                if (contextMenu.trackId && contextMenu.clipId) {
                  const track = tracks.find(t => t.id === contextMenu.trackId);
                  const clip = track?.clips.find(c => c.id === contextMenu.clipId);
                  if (clip?.tempoLocked) {
                    unmatchClipFromTempo(contextMenu.trackId, contextMenu.clipId);
                  } else {
                    matchClipToTempo(contextMenu.trackId, contextMenu.clipId);
                  }
                }
                setContextMenu({ ...contextMenu, visible: false }); 
              }} style={{ padding: '8px 10px', fontSize: '10px', color: tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? '#30d158' : '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? Icon.link : Icon.unlink}
                {tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? 'Unlock from Tempo' : 'Lock to Tempo'}
              </div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) updateClip(contextMenu.trackId, contextMenu.clipId, { reverse: !tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.reverse }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.reverse} Reverse</div>
              <div className="ctx-item" style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.audio} Normalize</div>
              <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) setTracks(prev => prev.map(t => t.id === contextMenu.trackId ? { ...t, clips: t.clips.filter(c => c.id !== contextMenu.clipId) } : t)); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#ff453a', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.trash} Delete</div>
            </>
          ) : contextMenu.trackId ? (
            <>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { armed: !tracks.find(t => t.id === contextMenu.trackId)?.armed }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.mic} Arm Recording</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { muted: !tracks.find(t => t.id === contextMenu.trackId)?.muted }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px' }}>Mute Track</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { solo: !tracks.find(t => t.id === contextMenu.trackId)?.solo }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px' }}>Solo Track</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { phase: !tracks.find(t => t.id === contextMenu.trackId)?.phase }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.phase} Phase Invert</div>
              <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { setShowPluginBrowser(true); setSelectedTrack(contextMenu.trackId); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#e4e4e7', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.plugin} Add Plugin</div>
              <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) deleteTrack(contextMenu.trackId); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#ff453a', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.trash} Delete Track</div>
            </>
          ) : null}
        </div>
      )}

      {/* Clip Editor Modal */}
      {showClipEditor && editingClip && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowClipEditor(false)}>
          <div className="modal-content" style={{ width: '520px', maxHeight: '85vh', background: '#111113', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to right, rgba(10,132,255,0.1), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#0a84ff' }}>{Icon.audio}</span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{editingClip.clip.name}</span>
              </div>
              <button aria-label="Close" onClick={() => setShowClipEditor(false)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1 }}>

              {/* Key Detection Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#bf5af2' }}>{Icon.music}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>Key Detection</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => detectClipKey(editingClip.trackId, editingClip.clip.id)}
                      style={{ padding: '4px 8px', background: 'rgba(191,90,242,0.2)', border: '1px solid rgba(191,90,242,0.3)', borderRadius: '4px', color: '#bf5af2', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}
                    >
                      Detect Key
                    </button>
                    <button 
                      onClick={() => editingClip.clip.keyLocked ? unlockClipFromKey(editingClip.trackId, editingClip.clip.id) : (editingClip.clip.detectedKey && lockClipToKey(editingClip.trackId, editingClip.clip.id))}
                      disabled={!editingClip.clip.detectedKey}
                      style={{ 
                        padding: '4px 10px', 
                        background: editingClip.clip.keyLocked ? 'rgba(48,209,88,0.2)' : 'rgba(113,113,122,0.2)', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.keyLocked ? 'rgba(48,209,88,0.3)' : '#3f3f46',
                        borderRadius: '4px', 
                        color: editingClip.clip.keyLocked ? '#30d158' : '#71717a', 
                        cursor: editingClip.clip.detectedKey ? 'pointer' : 'not-allowed', 
                        fontSize: '9px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: editingClip.clip.detectedKey ? 1 : 0.5
                      }}
                    >
                      {editingClip.clip.keyLocked ? Icon.link : Icon.unlink}
                      {editingClip.clip.keyLocked ? 'Key Locked' : 'Lock to Project'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: '#71717a' }}>Detected:</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: editingClip.clip.detectedKey ? '#bf5af2' : '#52525b', padding: '2px 8px', background: '#1a1a1e', borderRadius: '4px' }}>
                      {editingClip.clip.detectedKey ? `${editingClip.clip.detectedKey} ${editingClip.clip.detectedScale}` : 'Not analyzed'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: '#71717a' }}>Project:</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#30d158' }}>{projectKey.root} {projectKey.scale}</span>
                  </div>
                  {editingClip.clip.keyLocked && editingClip.clip.transposeAmount !== 0 && (
                    <span style={{ fontSize: '9px', color: '#ff9f0a' }}>Transposed: {editingClip.clip.transposeAmount > 0 ? '+' : ''}{editingClip.clip.transposeAmount} st</span>
                  )}
                </div>
              </div>

              {/* Tempo Matching Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#ff9f0a' }}>{Icon.tempo}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>Tempo Matching</span>
                  </div>
                  <button 
                    onClick={() => editingClip.clip.tempoLocked ? unmatchClipFromTempo(editingClip.trackId, editingClip.clip.id) : matchClipToTempo(editingClip.trackId, editingClip.clip.id)}
                    style={{ 
                      padding: '4px 10px', 
                      background: editingClip.clip.tempoLocked ? 'rgba(48,209,88,0.2)' : 'rgba(113,113,122,0.2)', 
                      border: '1px solid', 
                      borderColor: editingClip.clip.tempoLocked ? 'rgba(48,209,88,0.3)' : '#3f3f46',
                      borderRadius: '4px', 
                      color: editingClip.clip.tempoLocked ? '#30d158' : '#71717a', 
                      cursor: 'pointer', 
                      fontSize: '9px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {editingClip.clip.tempoLocked ? Icon.link : Icon.unlink}
                    {editingClip.clip.tempoLocked ? 'Tempo Locked' : 'Free'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: '#71717a', width: '75px' }}>Original BPM</span>
                  <input 
                    type="number" 
                    value={editingClip.clip.originalBPM || 120} 
                    onChange={(e) => setClipOriginalBPM(editingClip.trackId, editingClip.clip.id, Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
                    style={{ width: '60px', padding: '4px 6px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '4px', color: '#ff9f0a', fontSize: '11px', fontWeight: 600, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '9px', color: '#52525b' }}>Project: {bpm} BPM</span>
                  {editingClip.clip.tempoLocked && <span style={{ fontSize: '9px', color: '#30d158', marginLeft: 'auto' }}>Auto-stretched</span>}
                </div>
              </div>

              {/* Warp Mode Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ color: '#64d2ff' }}>{Icon.stretch}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>Warp Mode</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                  {WARP_MODES.map(mode => (
                    <button 
                      key={mode.value}
                      onClick={() => setClipWarpMode(editingClip.trackId, editingClip.clip.id, mode.value)}
                      title={mode.desc}
                      style={{ 
                        padding: '6px 4px', 
                        background: editingClip.clip.warpMode === mode.value ? 'rgba(6,182,212,0.2)' : '#1a1a1e', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.warpMode === mode.value ? 'rgba(6,182,212,0.4)' : '#27272a', 
                        borderRadius: '4px', 
                        color: editingClip.clip.warpMode === mode.value ? '#64d2ff' : '#71717a', 
                        cursor: 'pointer', 
                        fontSize: '8px', 
                        fontWeight: 600 
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '8px', color: '#52525b', marginTop: '6px' }}>{WARP_MODES.find(m => m.value === editingClip.clip.warpMode)?.desc}</div>
              </div>

              {/* Speed Control Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#30d158' }}>{Icon.skip}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>Speed</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#30d158', marginLeft: '8px' }}>{editingClip.clip.speedMultiplier?.toFixed(2) || '1.00'}x</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <input 
                    type="range" 
                    min="0.25" 
                    max="4" 
                    step="0.01" 
                    value={editingClip.clip.speedMultiplier || 1} 
                    onChange={(e) => setClipSpeed(editingClip.trackId, editingClip.clip.id, parseFloat(e.target.value))} 
                    disabled={editingClip.clip.tempoLocked}
                    style={{ flex: 1, opacity: editingClip.clip.tempoLocked ? 0.5 : 1 }} 
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {SPEED_PRESETS.map(preset => (
                    <button 
                      key={preset.value}
                      onClick={() => !editingClip.clip.tempoLocked && setClipSpeed(editingClip.trackId, editingClip.clip.id, preset.value)}
                      disabled={editingClip.clip.tempoLocked}
                      style={{ 
                        padding: '4px 8px', 
                        background: (editingClip.clip.speedMultiplier || 1) === preset.value ? 'rgba(48,209,88,0.2)' : '#1a1a1e', 
                        border: '1px solid', 
                        borderColor: (editingClip.clip.speedMultiplier || 1) === preset.value ? 'rgba(48,209,88,0.4)' : '#27272a', 
                        borderRadius: '4px', 
                        color: (editingClip.clip.speedMultiplier || 1) === preset.value ? '#30d158' : '#71717a', 
                        cursor: editingClip.clip.tempoLocked ? 'not-allowed' : 'pointer', 
                        fontSize: '9px', 
                        fontWeight: 500,
                        opacity: editingClip.clip.tempoLocked ? 0.5 : 1
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {editingClip.clip.warpMode === 'repitch' && <div style={{ fontSize: '8px', color: '#ff9f0a', marginTop: '6px' }}>Re-Pitch mode: Speed changes will affect pitch</div>}
              </div>

              {/* Pitch Control Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#ff9f0a' }}>{Icon.music}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>Pitch</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#ff9f0a', marginLeft: '8px' }}>{editingClip.clip.pitch > 0 ? '+' : ''}{editingClip.clip.pitch} st</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <input type="range" min="-24" max="24" step="1" value={editingClip.clip.pitch} onChange={(e) => setClipPitch(editingClip.trackId, editingClip.clip.id, parseInt(e.target.value))} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {PITCH_PRESETS.map(preset => (
                    <button 
                      key={preset.value}
                      onClick={() => setClipPitch(editingClip.trackId, editingClip.clip.id, preset.value)}
                      style={{ 
                        padding: '4px 6px', 
                        background: editingClip.clip.pitch === preset.value ? 'rgba(255,159,10,0.2)' : '#1a1a1e', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.pitch === preset.value ? 'rgba(255,159,10,0.4)' : '#27272a', 
                        borderRadius: '4px', 
                        color: editingClip.clip.pitch === preset.value ? '#ff9f0a' : '#71717a', 
                        cursor: 'pointer', 
                        fontSize: '8px', 
                        fontWeight: 500 
                      }}
                    >
                      {preset.value > 0 ? '+' : ''}{preset.value}
                    </button>
                  ))}
                </div>
                {editingClip.clip.warpMode === 'repitch' && <div style={{ fontSize: '8px', color: '#ff9f0a', marginTop: '6px' }}>Re-Pitch mode: Pitch changes will affect speed</div>}
              </div>

              {/* Gain & Fades */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#0a0a0c', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#71717a', width: '65px' }}>Gain</span>
                  <input type="range" min="0" max="2" step="0.01" value={editingClip.clip.gain} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { gain: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: '#0a84ff', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.gain > 1 ? '+' : ''}{((editingClip.clip.gain - 1) * 100).toFixed(0)}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#71717a', width: '65px' }}>Fade In</span>
                  <input type="range" min="0" max="5" step="0.01" value={editingClip.clip.fadeIn} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { fadeIn: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: '#64d2ff', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.fadeIn.toFixed(2)}s</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: '#71717a', width: '65px' }}>Fade Out</span>
                  <input type="range" min="0" max="5" step="0.01" value={editingClip.clip.fadeOut} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { fadeOut: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: '#64d2ff', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.fadeOut.toFixed(2)}s</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1f1f23' }}>
                <button onClick={() => updateClip(editingClip.trackId, editingClip.clip.id, { reverse: !editingClip.clip.reverse })} style={{ padding: '8px 14px', background: editingClip.clip.reverse ? 'rgba(255,69,58,0.2)' : '#1a1a1e', border: '1px solid', borderColor: editingClip.clip.reverse ? 'rgba(255,69,58,0.3)' : '#27272a', borderRadius: '6px', color: editingClip.clip.reverse ? '#ff453a' : '#a1a1aa', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>{Icon.reverse} {editingClip.clip.reverse ? 'Reversed' : 'Reverse'}</button>
                <button aria-label="Reset All" onClick={() => updateClip(editingClip.trackId, editingClip.clip.id, { ...DEFAULT_CLIP_PROPS, gain: 1 })} style={{ padding: '8px 14px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '6px', color: '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>Reset All</button>
                <div style={{ flex: 1 }} />
                <button aria-label="Done" onClick={() => setShowClipEditor(false)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #0a84ff, #0a84ff)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: '400px', background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.export} Export Project</span>
              <button aria-label="Close" onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
              {/* Format */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Format</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {EXPORT_FORMATS.map(fmt => (
                    <button key={fmt.value} onClick={() => setExportSettings(s => ({ ...s, format: fmt.value }))} style={{ padding: '8px', background: exportSettings.format === fmt.value ? 'rgba(48,209,88,0.2)' : '#1a1a1e', border: '1px solid', borderColor: exportSettings.format === fmt.value ? 'rgba(48,209,88,0.4)' : '#27272a', borderRadius: '6px', color: exportSettings.format === fmt.value ? '#30d158' : '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>{fmt.value.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {/* Bit Depth */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Bit Depth</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[16, 24, 32].map(depth => (
                    <button key={depth} onClick={() => setExportSettings(s => ({ ...s, bitDepth: depth as 16 | 24 | 32 }))} style={{ flex: 1, padding: '8px', background: exportSettings.bitDepth === depth ? 'rgba(10,132,255,0.2)' : '#1a1a1e', border: '1px solid', borderColor: exportSettings.bitDepth === depth ? 'rgba(10,132,255,0.4)' : '#27272a', borderRadius: '6px', color: exportSettings.bitDepth === depth ? '#0a84ff' : '#a1a1aa', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}>{depth}-bit</button>
                  ))}
                </div>
              </div>

              {/* Sample Rate */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Sample Rate</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[44100, 48000, 96000].map(rate => (
                    <button key={rate} onClick={() => setExportSettings(s => ({ ...s, sampleRate: rate as 44100 | 48000 | 96000 | 192000 }))} style={{ flex: 1, padding: '8px', background: exportSettings.sampleRate === rate ? 'rgba(191,90,242,0.2)' : '#1a1a1e', border: '1px solid', borderColor: exportSettings.sampleRate === rate ? 'rgba(191,90,242,0.4)' : '#27272a', borderRadius: '6px', color: exportSettings.sampleRate === rate ? '#bf5af2' : '#a1a1aa', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>{(rate / 1000).toFixed(1)} kHz</button>
                  ))}
                </div>
              </div>

              {/* Normalize Level */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>
                  <span>Normalize Level</span>
                  <span style={{ color: '#ff9f0a', fontFamily: 'monospace' }}>{exportSettings.normalizeLevel} dB</span>
                </label>
                <input type="range" min="-6" max="0" step="0.1" value={exportSettings.normalizeLevel} onChange={(e) => setExportSettings(s => ({ ...s, normalizeLevel: parseFloat(e.target.value) }))} style={{ width: '100%' }} />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={exportSettings.includeMetadata} onChange={(e) => setExportSettings(s => ({ ...s, includeMetadata: e.target.checked }))} style={{ accentColor: '#30d158' }} />
                  <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Include metadata (BPM, key, project name)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={exportSettings.splitTracks} onChange={(e) => setExportSettings(s => ({ ...s, splitTracks: e.target.checked }))} style={{ accentColor: '#30d158' }} />
                  <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Export individual tracks (stems)</span>
                </label>
              </div>

              {/* Progress */}
              {isExporting && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#71717a' }}>Exporting...</span>
                    <span style={{ fontSize: '10px', color: '#30d158', fontFamily: 'monospace' }}>{Math.round(exportProgress)}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#1a1a1e', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${exportProgress}%`, background: 'linear-gradient(90deg, #30d158, #30d158)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              {/* Export button */}
              <button onClick={exportProject} disabled={isExporting} style={{ width: '100%', padding: '12px', background: isExporting ? '#1a1a1e' : 'linear-gradient(135deg, #30d158, #28a745)', border: 'none', borderRadius: '8px', color: '#fff', cursor: isExporting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {isExporting ? 'Exporting...' : <>{Icon.download} Export Now</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration Modal */}
      {showCollabModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: '500px', background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', overflow: 'hidden', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.users} Online Collaboration</span>
              <button aria-label="Close" onClick={() => setShowCollabModal(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {!collaborationSession ? (
                // Not in a session
                <div>
                  {/* User name setup */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Your Display Name</label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Enter your name" style={{ width: '100%', padding: '10px 12px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '6px', color: '#e4e4e7', fontSize: '12px' }} />
                  </div>

                  {/* Create session */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Create New Session</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="Session name..." style={{ flex: 1, padding: '10px 12px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '6px', color: '#e4e4e7', fontSize: '12px' }} id="collab-session-name" />
                      <button onClick={() => {
                        const input = document.getElementById('collab-session-name') as HTMLInputElement;
                        if (input?.value) createCollabSession(input.value);
                      }} style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #0a84ff, #0a84ff)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>{Icon.plus} Create</button>
                    </div>
                  </div>

                  {/* Join session */}
                  <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #27272a' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Join Existing Session</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="Paste session link or ID..." style={{ flex: 1, padding: '10px 12px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '6px', color: '#e4e4e7', fontSize: '12px' }} id="collab-session-id" />
                      <button onClick={() => {
                        const input = document.getElementById('collab-session-id') as HTMLInputElement;
                        if (input?.value) joinCollabSession(input.value);
                      }} style={{ padding: '10px 16px', background: 'rgba(48,209,88,0.2)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: '6px', color: '#30d158', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Join</button>
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#0a0a0c', borderRadius: '8px', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 600, color: '#a1a1aa', marginBottom: '8px' }}>How it works:</h4>
                    <ul style={{ fontSize: '10px', color: '#71717a', paddingLeft: '16px', lineHeight: 1.6 }}>
                      <li>Create a session to start collaborating</li>
                      <li>Share the session link with your collaborators</li>
                      <li>Work together in real-time on the same project</li>
                      <li>See each other's cursor positions and edits</li>
                      <li>Record simultaneously on different tracks</li>
                    </ul>
                  </div>
                </div>
              ) : (
                // In a session
                <div>
                  {/* Session info */}
                  <div style={{ padding: '12px', background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0a84ff' }}>{collaborationSession.name}</span>
                      <span style={{ fontSize: '9px', color: '#30d158', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.wifi} Live</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '9px', color: '#71717a' }}>Session ID: {collaborationSession.id.substring(0, 20)}...</span>
                      <button aria-label="Copy" onClick={() => navigator.clipboard.writeText(collaborationSession.id)} style={{ padding: '2px 6px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '4px', color: '#a1a1aa', cursor: 'pointer', fontSize: '8px' }}>{Icon.copy} Copy</button>
                    </div>
                  </div>

                  {/* Participants */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Participants ({collaborators.filter(c => c.isOnline).length} online)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {collaborators.map(collab => (
                        <div key={collab.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#1a1a1e', borderRadius: '6px', borderLeft: `3px solid ${collab.color}` }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: collab.isOnline ? '#30d158' : '#52525b' }} />
                          <span style={{ flex: 1, fontSize: '11px', color: collab.isOnline ? '#e4e4e7' : '#71717a' }}>{collab.name}</span>
                          <span style={{ fontSize: '9px', color: '#52525b', textTransform: 'uppercase' }}>{collab.role}</span>
                          {collab.isRecording && <span style={{ fontSize: '8px', color: '#ff453a', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.record} REC</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chat */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Chat</label>
                    <div style={{ height: '150px', background: '#0a0a0c', borderRadius: '6px', padding: '8px', overflowY: 'auto', marginBottom: '8px' }}>
                      {collabMessages.length === 0 ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '10px' }}>No messages yet</div>
                      ) : (
                        collabMessages.map((msg, i) => (
                          <div key={i} style={{ marginBottom: '6px' }}>
                            <span style={{ fontSize: '9px', color: '#0a84ff', fontWeight: 600 }}>{msg.sender}</span>
                            <span style={{ fontSize: '8px', color: '#52525b', marginLeft: '6px' }}>{msg.time.toLocaleTimeString()}</span>
                            <div style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>{msg.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" value={newCollabMessage} onChange={(e) => setNewCollabMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCollabMessage(newCollabMessage)} placeholder="Type a message..." style={{ flex: 1, padding: '8px 12px', background: '#1a1a1e', border: '1px solid #27272a', borderRadius: '6px', color: '#e4e4e7', fontSize: '11px' }} />
                      <button onClick={() => sendCollabMessage(newCollabMessage)} style={{ padding: '8px 12px', background: '#0a84ff', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}>{Icon.send}</button>
                    </div>
                  </div>

                  {/* Leave session */}
                  <button aria-label="Leave Session" onClick={leaveCollabSession} style={{ width: '100%', padding: '10px', background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '6px', color: '#ff453a', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}>Leave Session</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize entire component for multi-window performance
Imosion.displayName = 'Imosion';
export default memo(Imosion);
