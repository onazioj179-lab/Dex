/**
 * DEX Platform - IMOSION Professional Audio Workstation
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Pro Recording DAW - Mixer Routing, Sample Manipulation, 32-bit Float
 * OPTIMIZED: Multi-window support, memory management, 10+ instances
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { platform as _plat } from '../../utils';
import { useRunningApps } from '../../store/runningApps';
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import DexIcon from '../../components/DexIcon';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAutoSave } from '../../utils/useAutoSave';
import { useFileDrop } from '../../utils/useFileDrop';
import { getTargetFPS } from '../../utils/adaptiveCanvas';
import { useCreativeAppSettings } from '../../utils/creative-suite';
import { checkPermissionAccess, usePermissionStore } from '../../store/permissionStore';
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
import { getDiatonicChords, midiToFrequency } from './ImosionChords';
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

// ==================== APP IDENTITY ====================
export const IMOSION_VERSION = '1.0.0';
export const IMOSION_BUILD_DATE = '2026-04-11';

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
  inputSource: string; // device ID for per-track input routing
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
  // Formant preservation for pitch shifting
  formantPreserve?: boolean;
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
  { value: 'mp3', label: 'WebM/Opus (Compressed)', ext: '.webm' },
  { value: 'flac', label: 'WAV Lossless (24-bit)', ext: '.wav' },
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

// ==================== MIDI / INSTRUMENT TYPES ====================
interface MidiNote {
  id: string;
  pitch: number; // 0-127 (C-1 to G9)
  startTime: number; // beats
  duration: number; // beats
  velocity: number; // 0-127
  selected?: boolean;
}

interface MidiClip {
  id: string;
  name: string;
  startTime: number; // seconds on timeline
  duration: number;
  notes: MidiNote[];
  color: string;
}

interface InstrumentTrack {
  id: string;
  name: string;
  type: 'instrument';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
  clips: MidiClip[];
  plugins: TrackPlugin[];
  output: RoutingDestination;
  sends: TrackSend[];
  phase: boolean;
  trim: number;
  inputSource: string;
  instrument: InstrumentInstance;
}

type InstrumentType = 'subsynth' | 'fmsynth' | 'wavetable' | 'sampler' | 'drummachine';

interface InstrumentInstance {
  type: InstrumentType;
  name: string;
  preset: string;
  params: Record<string, number>;
}

// Oscillator for SubSynth
type OscShape = 'sine' | 'saw' | 'square' | 'triangle' | 'pulse' | 'noise';
type FilterType = 'lp12' | 'lp24' | 'hp12' | 'hp24' | 'bp' | 'notch';

interface SubSynthParams {
  osc1Shape: OscShape; osc1Tune: number; osc1Fine: number; osc1Level: number;
  osc2Shape: OscShape; osc2Tune: number; osc2Fine: number; osc2Level: number;
  filterType: FilterType; filterCutoff: number; filterRes: number; filterEnvAmt: number;
  ampA: number; ampD: number; ampS: number; ampR: number;
  filtA: number; filtD: number; filtS: number; filtR: number;
  lfo1Rate: number; lfo1Depth: number; lfo1Shape: OscShape; lfo1Sync: boolean;
  lfo2Rate: number; lfo2Depth: number; lfo2Shape: OscShape; lfo2Sync: boolean;
  voices: number; glide: number;
}

interface FMSynthParams {
  algorithm: number; // 0-7
  op1Ratio: number; op1Level: number; op1Feedback: number;
  op2Ratio: number; op2Level: number; op2Feedback: number;
  op3Ratio: number; op3Level: number; op3Feedback: number;
  op4Ratio: number; op4Level: number; op4Feedback: number;
  voices: number; glide: number;
}

interface WaveTableParams {
  position: number; // 0-63 frame index
  morphSpeed: number;
  morphLfo: number; // LFO depth for position modulation
  filterCutoff: number; filterRes: number;
  ampA: number; ampD: number; ampS: number; ampR: number;
  voices: number; detune: number;
}

interface SamplerParams {
  rootNote: number; // MIDI note of original pitch
  loopMode: 'off' | 'forward' | 'pingpong';
  ampA: number; ampD: number; ampS: number; ampR: number;
  filterCutoff: number; filterRes: number;
  pitchTracking: boolean;
}

// Factory instrument presets
const INSTRUMENT_PRESETS: Record<InstrumentType, { name: string; params: Record<string, number> }[]> = {
  subsynth: [
    { name: 'Init Saw', params: { osc1Shape: 1, osc2Shape: 0, filterCutoff: 8000, filterRes: 0.2, ampA: 0.01, ampD: 0.3, ampS: 0.7, ampR: 0.3, voices: 4 } },
    { name: 'Warm Pad', params: { osc1Shape: 1, osc2Shape: 1, filterCutoff: 2000, filterRes: 0.4, ampA: 0.5, ampD: 1, ampS: 0.8, ampR: 1.5, voices: 8 } },
    { name: 'Pluck Bass', params: { osc1Shape: 2, osc2Shape: 0, filterCutoff: 1200, filterRes: 0.6, ampA: 0.001, ampD: 0.2, ampS: 0, ampR: 0.1, voices: 1 } },
    { name: 'Square Lead', params: { osc1Shape: 2, osc2Shape: 2, filterCutoff: 5000, filterRes: 0.3, ampA: 0.01, ampD: 0.1, ampS: 0.9, ampR: 0.2, voices: 1 } },
    { name: 'Super Saw', params: { osc1Shape: 1, osc2Shape: 1, filterCutoff: 12000, filterRes: 0.1, ampA: 0.02, ampD: 0.5, ampS: 0.6, ampR: 0.5, voices: 8 } },
    { name: 'Sub Bass', params: { osc1Shape: 0, osc2Shape: 0, filterCutoff: 400, filterRes: 0, ampA: 0.005, ampD: 0.5, ampS: 1, ampR: 0.1, voices: 1 } },
    { name: 'Ambient Pad', params: { osc1Shape: 3, osc2Shape: 1, filterCutoff: 3000, filterRes: 0.5, ampA: 2, ampD: 3, ampS: 0.7, ampR: 4, voices: 8 } },
    { name: 'Acid Bass', params: { osc1Shape: 1, osc2Shape: 0, filterCutoff: 600, filterRes: 0.9, ampA: 0.005, ampD: 0.15, ampS: 0, ampR: 0.05, voices: 1 } },
  ],
  fmsynth: [
    { name: 'EP Classic', params: { algorithm: 0, op1Ratio: 1, op1Level: 1, op2Ratio: 2, op2Level: 0.5, op3Ratio: 3, op3Level: 0.3, op4Ratio: 4, op4Level: 0.1, voices: 6 } },
    { name: 'Bell', params: { algorithm: 1, op1Ratio: 1, op1Level: 1, op2Ratio: 3.5, op2Level: 0.7, op3Ratio: 7, op3Level: 0.4, op4Ratio: 1, op4Level: 0, voices: 4 } },
    { name: 'Organ', params: { algorithm: 2, op1Ratio: 1, op1Level: 1, op2Ratio: 2, op2Level: 0.8, op3Ratio: 3, op3Level: 0.6, op4Ratio: 4, op4Level: 0.4, voices: 8 } },
    { name: 'Brass', params: { algorithm: 3, op1Ratio: 1, op1Level: 1, op2Ratio: 1, op2Level: 0.9, op3Ratio: 2, op3Level: 0.5, op4Ratio: 3, op4Level: 0.3, voices: 4 } },
    { name: 'Glass', params: { algorithm: 4, op1Ratio: 1, op1Level: 0.8, op2Ratio: 5, op2Level: 0.6, op3Ratio: 9, op3Level: 0.3, op4Ratio: 1, op4Level: 0, voices: 6 } },
  ],
  wavetable: [
    { name: 'Digital Pad', params: { position: 0, morphSpeed: 0.5, filterCutoff: 6000, ampA: 0.3, ampD: 1, ampS: 0.7, ampR: 1, voices: 6 } },
    { name: 'Morph Lead', params: { position: 32, morphSpeed: 2, filterCutoff: 10000, ampA: 0.01, ampD: 0.2, ampS: 0.8, ampR: 0.3, voices: 1 } },
    { name: 'Evolving Texture', params: { position: 16, morphSpeed: 0.1, filterCutoff: 4000, ampA: 1, ampD: 2, ampS: 0.6, ampR: 3, voices: 8 } },
    { name: 'Growl Bass', params: { position: 48, morphSpeed: 4, filterCutoff: 1500, ampA: 0.005, ampD: 0.3, ampS: 0.5, ampR: 0.1, voices: 1 } },
  ],
  sampler: [
    { name: 'Piano', params: { rootNote: 60, loopMode: 0, ampA: 0.005, ampD: 1, ampS: 0.8, ampR: 0.5, filterCutoff: 12000 } },
    { name: 'Strings', params: { rootNote: 60, loopMode: 1, ampA: 0.5, ampD: 1, ampS: 0.9, ampR: 0.8, filterCutoff: 8000 } },
    { name: 'One Shot', params: { rootNote: 60, loopMode: 0, ampA: 0, ampD: 0.5, ampS: 0, ampR: 0.1, filterCutoff: 16000 } },
  ],
  drummachine: [
    { name: '808 Kit', params: {} },
    { name: '909 Kit', params: {} },
    { name: 'Acoustic Kit', params: {} },
    { name: 'Lo-fi Kit', params: {} },
  ],
};

const INSTRUMENT_COLORS: Record<InstrumentType, string> = {
  subsynth: '#bf5af2',
  fmsynth: 'var(--color-warning)',
  wavetable: 'var(--color-success)',
  sampler: 'var(--color-accent)',
  drummachine: 'var(--color-error)',
};

// ==================== LIVE LOOPS TYPES ====================
interface LoopCell {
  id: string;
  clipId: string | null; // audio or MIDI clip
  clipName: string;
  color: string;
  state: 'empty' | 'stopped' | 'playing' | 'queued' | 'recording';
  loopMode: 'loop' | 'oneshot' | 'trigger';
  gain: number;
  followAction: 'none' | 'next' | 'previous' | 'random' | 'stop';
  followAfter: number; // loops before follow action
}

interface LoopScene {
  id: string;
  name: string;
  cells: Map<string, LoopCell>; // keyed by trackId
}

// ==================== AUTOMATION TYPES ====================
interface TrackAutomation {
  id: string;
  trackId: string;
  parameter: string; // 'volume' | 'pan' | plugin param keys
  parameterLabel: string;
  points: { time: number; value: number; curve: 'linear' | 'exponential' | 'logarithmic' | 'step' | 'scurve' }[];
  visible: boolean;
  color: string;
  min: number;
  max: number;
  armed: boolean; // write mode
}

// ==================== NOTE HELPERS ====================
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiNoteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
const isBlackKey = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};
const isNoteInScale = (pitch: number, root: string, scale: string): boolean => {
  const intervals = SCALE_INTERVALS[scale];
  if (!intervals) return true;
  const rootIdx = NOTE_NAMES.indexOf(root);
  return intervals.includes((pitch - rootIdx + 12) % 12);
};

// ==================== PLUGIN DEFINITIONS ====================
const PLUGIN_LIBRARY: Record<PluginType, { name: string; abbr: string; color: string; params: { key: string; label: string; min: number; max: number; default: number; unit: string }[] }> = {
  eq: { name: 'Parametric EQ', abbr: 'EQ', color: 'var(--color-accent)', params: [
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
    { key: 'sidechainSource', label: 'SC Src', min: -1, max: 125, default: -1, unit: '' },
  ]},
  reverb: { name: 'Reverb', abbr: 'REV', color: '#64d2ff', params: [
    { key: 'roomSize', label: 'Room', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'damping', label: 'Damp', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    { key: 'predelay', label: 'Pre', min: 0, max: 100, default: 10, unit: 'ms' },
  ]},
  delay: { name: 'Delay', abbr: 'DLY', color: 'var(--color-success)', params: [
    { key: 'time', label: 'Time', min: 1, max: 2000, default: 250, unit: 'ms' },
    { key: 'feedback', label: 'FB', min: 0, max: 95, default: 40, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
  ]},
  chorus: { name: 'Chorus', abbr: 'CHR', color: '#ff375f', params: [
    { key: 'rate', label: 'Rate', min: 0.1, max: 10, default: 1, unit: 'Hz' },
    { key: 'depth', label: 'Depth', min: 0, max: 100, default: 50, unit: '%' },
    { key: 'wetDry', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
  ]},
  limiter: { name: 'Limiter', abbr: 'LIM', color: 'var(--color-error)', params: [
    { key: 'ceiling', label: 'Ceil', min: -12, max: 0, default: -0.3, unit: 'dB' },
    { key: 'release', label: 'Rel', min: 1, max: 500, default: 50, unit: 'ms' },
    { key: 'gain', label: 'Gain', min: 0, max: 24, default: 0, unit: 'dB' },
  ]},
  gate: { name: 'Gate', abbr: 'GATE', color: 'var(--color-warning)', params: [
    { key: 'threshold', label: 'Thresh', min: -80, max: 0, default: -40, unit: 'dB' },
    { key: 'attack', label: 'Atk', min: 0.1, max: 50, default: 1, unit: 'ms' },
    { key: 'hold', label: 'Hold', min: 1, max: 500, default: 50, unit: 'ms' },
    { key: 'release', label: 'Rel', min: 5, max: 500, default: 100, unit: 'ms' },
  ]},
  deesser: { name: 'De-Esser', abbr: 'DSR', color: 'var(--color-warning)', params: [
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

// Plugin-type micro icons for mixer strips (8x8)
const PLUGIN_ICON: Record<PluginType, React.ReactNode> = {
  eq: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 6 Q2 2 4 4 Q6 6 7 2" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  compressor: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 7 L3 4 L7 3" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  reverb: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4 Q2 1 4 4 Q6 7 7 4" fill="none" stroke="currentColor" strokeWidth="1"/><path d="M2 4 Q3 2 4 4 Q5 6 6 4" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/></svg>,
  delay: <svg width="8" height="8" viewBox="0 0 8 8"><rect x="1" y="2" width="2" height="4" rx="0.5" fill="currentColor"/><rect x="4" y="3" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.5"/><rect x="6" y="4" width="1" height="2" rx="0.5" fill="currentColor" opacity="0.3"/></svg>,
  chorus: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4 Q2.5 1 4 4 Q5.5 7 7 4" fill="none" stroke="currentColor" strokeWidth="1"/><path d="M1 4 Q2.5 6 4 4 Q5.5 2 7 4" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.4"/></svg>,
  limiter: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 6 L3 2 L5 2 L7 2" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M1 2 L7 2" stroke="currentColor" strokeWidth="0.8" opacity="0.4" strokeDasharray="1 1"/></svg>,
  gate: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 6 L2.5 6 L3 2 L5 2 L5.5 6 L7 6" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  deesser: <svg width="8" height="8" viewBox="0 0 8 8"><text x="4" y="6" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="700" fontFamily="inherit">S</text></svg>,
  saturation: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 6 Q3 1 4 3 Q5 5 7 1" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  autotune: <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 5 L3 3 L5 5 L7 2" fill="none" stroke="currentColor" strokeWidth="1"/><circle cx="7" cy="2" r="0.8" fill="currentColor"/></svg>,
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

// Cap the decoded-AudioBuffer cache. Each entry is multi-MB of PCM; without a
// bound the map grew once per played clip (including deleted clips) for the whole
// session. FIFO-evict the oldest entry once over cap; an evicted clip simply
// re-decodes on next playback. Keeps Imosion within the 8 GB long-session target.
const MAX_DECODED_BUFFERS = 48;
function cacheDecodedBuffer(cache: Map<string, AudioBuffer>, id: string, buffer: AudioBuffer): void {
  cache.set(id, buffer);
  while (cache.size > MAX_DECODED_BUFFERS) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined || oldest === id) break;
    cache.delete(oldest);
  }
}

const DEFAULT_BUS: AudioBus = { id: '', name: '', type: 'aux', color: 'var(--color-accent)', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' };

const DEFAULT_CLIP_PROPS = { fadeIn: 0, fadeOut: 0, pitch: 0, stretch: 1, reverse: false, trimStart: 0, trimEnd: 0, loopEnabled: false, loopStart: 0, loopEnd: 0, tempoLocked: true, originalBPM: 0, detectedKey: null as MusicalKey | null, detectedScale: null as MusicalScale | null, keyLocked: false, transposeAmount: 0, warpMode: 'beats' as const, speedMultiplier: 1 };

// ==================== BEAT DETECTION ====================
// Onset-based BPM detection: find peaks in the energy derivative of the audio signal
function detectBPM(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const len = data.length;
  // Compute energy in small windows (1024 samples ≈ 23ms at 44.1k)
  const winSize = 1024;
  const numWindows = Math.floor(len / winSize);
  if (numWindows < 8) return 0; // too short
  const energy = new Float32Array(numWindows);
  for (let i = 0; i < numWindows; i++) {
    let sum = 0;
    const off = i * winSize;
    for (let j = 0; j < winSize; j++) { const v = data[off + j]; sum += v * v; }
    energy[i] = sum / winSize;
  }
  // Compute spectral flux (positive energy derivative)
  const flux = new Float32Array(numWindows - 1);
  for (let i = 1; i < numWindows; i++) {
    flux[i - 1] = Math.max(0, energy[i] - energy[i - 1]);
  }
  // Adaptive threshold: local mean + 1.5 * local std
  const onsets: number[] = [];
  const threshWin = 16;
  for (let i = threshWin; i < flux.length - threshWin; i++) {
    let mean = 0;
    for (let k = i - threshWin; k <= i + threshWin; k++) mean += flux[k];
    mean /= (threshWin * 2 + 1);
    let std = 0;
    for (let k = i - threshWin; k <= i + threshWin; k++) { const d = flux[k] - mean; std += d * d; }
    std = Math.sqrt(std / (threshWin * 2 + 1));
    if (flux[i] > mean + 1.5 * std && flux[i] > 0.001) {
      onsets.push(i);
    }
  }
  if (onsets.length < 4) return 0;
  // Compute inter-onset intervals (IOI) and histogram
  const timePerWindow = winSize / sr;
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const dt = (onsets[i] - onsets[i - 1]) * timePerWindow;
    if (dt > 0.15 && dt < 2.0) iois.push(dt); // 30 to 400 BPM range
  }
  if (iois.length < 3) return 0;
  // Cluster IOIs with 10ms bins and find dominant interval
  const bins = new Map<number, number>();
  for (const ioi of iois) {
    const bin = Math.round(ioi * 100); // 10ms bins
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  let bestBin = 0, bestCount = 0;
  bins.forEach((count, bin) => { if (count > bestCount) { bestCount = count; bestBin = bin; } });
  const dominantInterval = bestBin / 100;
  if (dominantInterval <= 0) return 0;
  let bpm = 60 / dominantInterval;
  // Normalize to common BPM range (60-180)
  while (bpm > 180) bpm /= 2;
  while (bpm < 60) bpm *= 2;
  return Math.round(bpm);
}

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
    { id: 'bus-delay', name: 'Delay', type: 'fx', color: 'var(--color-success)', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
  ], tracks: [
    { id: 't1', name: 'Lead Vocal', type: 'audio', volume: 0.85, pan: 0, muted: false, solo: false, armed: true, color: 'var(--color-accent)', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.3, preFader: false }], phase: false, trim: 0, inputSource: '' },
    { id: 't2', name: 'Harmonies', type: 'audio', volume: 0.7, pan: -0.15, muted: false, solo: false, armed: false, color: '#bf5af2', plugins: [], output: 'master', sends: [], phase: false, trim: 0, inputSource: '' },
  ]},
  { id: 'podcast', name: 'Podcast', bpm: 120, sampleRate: 48000, bitDepth: 24, createdAt: 0, buses: [], tracks: [
    { id: 't1', name: 'Host', type: 'audio', volume: 0.9, pan: -0.25, muted: false, solo: false, armed: true, color: 'var(--color-accent)', plugins: [], output: 'master', sends: [], phase: false, trim: 0, inputSource: '' },
    { id: 't2', name: 'Guest', type: 'audio', volume: 0.9, pan: 0.25, muted: false, solo: false, armed: false, color: 'var(--color-warning)', plugins: [], output: 'master', sends: [], phase: false, trim: 0, inputSource: '' },
  ]},
  { id: 'band', name: 'Full Band', bpm: 120, sampleRate: 96000, bitDepth: 32, createdAt: 0, buses: [
    { id: 'bus-drums', name: 'Drum Bus', type: 'group', color: 'var(--color-error)', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
    { id: 'bus-verb', name: 'Plate Reverb', type: 'fx', color: '#64d2ff', volume: 1, pan: 0, muted: false, solo: false, plugins: [], output: 'master' },
  ], tracks: [
    { id: 't1', name: 'Kick', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: false, color: 'var(--color-error)', plugins: [], output: 'bus-drums', sends: [], phase: false, trim: 0, inputSource: '' },
    { id: 't2', name: 'Snare', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: false, color: 'var(--color-error)', plugins: [], output: 'bus-drums', sends: [{ id: 's1', busId: 'bus-verb', level: 0.2, preFader: false }], phase: false, trim: 0, inputSource: '' },
    { id: 't3', name: 'Bass', type: 'audio', volume: 0.75, pan: 0, muted: false, solo: false, armed: false, color: 'var(--color-warning)', plugins: [], output: 'master', sends: [], phase: false, trim: 0, inputSource: '' },
    { id: 't4', name: 'Guitar', type: 'audio', volume: 0.7, pan: -0.4, muted: false, solo: false, armed: false, color: 'var(--color-success)', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.35, preFader: false }], phase: false, trim: 0, inputSource: '' },
    { id: 't5', name: 'Vocal', type: 'audio', volume: 0.85, pan: 0, muted: false, solo: false, armed: true, color: 'var(--color-accent)', plugins: [], output: 'master', sends: [{ id: 's1', busId: 'bus-verb', level: 0.25, preFader: false }], phase: false, trim: 0, inputSource: '' },
  ]},
  { id: 'empty', name: 'Empty', bpm: 120, sampleRate: 96000, bitDepth: 32, createdAt: 0, buses: [], tracks: [
    { id: 't1', name: 'Track 1', type: 'audio', volume: 0.8, pan: 0, muted: false, solo: false, armed: true, color: 'var(--color-accent)', plugins: [], output: 'master', sends: [], phase: false, trim: 0, inputSource: '' },
  ]},
];

const COLORS = CLIP_COLORS.map(c => c.color);

// Icons
// External plugin catalog — populated by scanning installed VST/AU plugins
const EXTERNAL_PLUGIN_CATALOG: ExternalPlugin[] = [
  { id: 'ext-ozone', name: 'Ozone 11', vendor: 'iZotope', version: '11.0.1', type: 'vst3', category: 'Mastering', installed: false, color: '#6366f1' },
  { id: 'ext-serum', name: 'Serum', vendor: 'Xfer Records', version: '1.36b5', type: 'vst3', category: 'Synthesizer', installed: false, color: '#ec4899' },
  { id: 'ext-fabfilter-q', name: 'Pro-Q 3', vendor: 'FabFilter', version: '3.24', type: 'vst3', category: 'EQ', installed: false, color: '#f59e0b' },
  { id: 'ext-fabfilter-c', name: 'Pro-C 2', vendor: 'FabFilter', version: '2.15', type: 'vst3', category: 'Dynamics', installed: false, color: '#f59e0b' },
  { id: 'ext-fabfilter-l', name: 'Pro-L 2', vendor: 'FabFilter', version: '2.10', type: 'vst3', category: 'Limiter', installed: false, color: '#f59e0b' },
  { id: 'ext-valhalla-room', name: 'ValhallaDSP Room', vendor: 'Valhalla DSP', version: '2.0.1', type: 'vst3', category: 'Reverb', installed: false, color: '#22d3ee' },
  { id: 'ext-valhalla-delay', name: 'ValhallaDSP Delay', vendor: 'Valhalla DSP', version: '1.5.3', type: 'vst3', category: 'Delay', installed: false, color: '#22d3ee' },
  { id: 'ext-soundtoys-decap', name: 'Decapitator', vendor: 'Soundtoys', version: '5.4.1', type: 'vst3', category: 'Saturation', installed: false, color: '#ef4444' },
  { id: 'ext-waves-ssl', name: 'SSL G-Channel', vendor: 'Waves', version: '14.0', type: 'vst3', category: 'Channel Strip', installed: false, color: '#a855f7' },
  { id: 'ext-waves-cla', name: 'CLA-76', vendor: 'Waves', version: '14.0', type: 'vst3', category: 'Compressor', installed: false, color: '#a855f7' },
  { id: 'ext-spitfire-labs', name: 'LABS', vendor: 'Spitfire Audio', version: '2.4.0', type: 'vst3', category: 'Instrument', installed: false, color: '#84cc16' },
  { id: 'ext-rc20', name: 'RC-20 Retro Color', vendor: 'XLN Audio', version: '1.3.5', type: 'vst3', category: 'Lo-Fi / FX', installed: false, color: '#fb923c' },
  { id: 'ext-massive-x', name: 'Massive X', vendor: 'Native Instruments', version: '1.8.0', type: 'vst3', category: 'Synthesizer', installed: false, color: '#0ea5e9' },
  { id: 'ext-kontakt', name: 'Kontakt 7', vendor: 'Native Instruments', version: '7.10', type: 'vst3', category: 'Sampler', installed: false, color: '#0ea5e9' },
  { id: 'ext-izotope-rx', name: 'RX 10 Elements', vendor: 'iZotope', version: '10.4', type: 'vst3', category: 'Restoration', installed: false, color: '#6366f1' },
  { id: 'ext-goodhertz-tilt', name: 'Tilt EQ', vendor: 'Goodhertz', version: '3.7', type: 'vst3', category: 'EQ', installed: false, color: '#14b8a6' },
  { id: 'ext-baby-audio-super', name: 'Super VHS', vendor: 'Baby Audio', version: '1.2', type: 'vst3', category: 'Lo-Fi / FX', installed: false, color: '#e879f9' },
  { id: 'ext-ssl-native-bus', name: 'Native Bus Compressor 2', vendor: 'SSL', version: '2.0.3', type: 'vst3', category: 'Dynamics', installed: false, color: '#38bdf8' },
  { id: 'ext-vital', name: 'Vital', vendor: 'Matt Tytel', version: '1.5.5', type: 'vst3', category: 'Synthesizer', installed: false, color: '#34d399' },
  { id: 'ext-tdr-nova', name: 'TDR Nova', vendor: 'Tokyo Dawn Labs', version: '2.1.7', type: 'vst3', category: 'Dynamic EQ', installed: false, color: '#fbbf24' },
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
  // View mode icons
  arrange: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="12" height="4" rx="1"/><rect x="3" y="17" width="15" height="4" rx="1"/></svg>,
  mixerView: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  beats: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/></svg>,
  pianoRoll: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="4" y="2" width="3" height="12" fill="currentColor"/><rect x="10" y="2" width="3" height="12" fill="currentColor"/><rect x="17" y="2" width="3" height="12" fill="currentColor"/><line x1="2" y1="14" x2="22" y2="14"/></svg>,
  punchIn: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 3l14 9-14 9V3z"/><line x1="3" y1="3" x2="3" y2="21"/></svg>,
  punchOut: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 3L5 12l14 9V3z"/><line x1="21" y1="3" x2="21" y2="21"/></svg>,
  eraser: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16l10-10 8 8-4 4"/><path d="M6 11l8 8"/></svg>,
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
  /** Active sidechain control loops keyed by `${destTrackId}:${pluginId}`. */
  private sidechainLoops = new Map<string, { stop: () => void }>();
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
      old.nodes.forEach(n => { try { n.disconnect(); } catch (e) { console.warn('[DEX]', e); } });
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
        // Stash the makeup gain + threshold so setSidechainSource() can
        // attach a real ducking control loop driven by the source track's
        // analyser. DynamicsCompressorNode has no sidechain input, so
        // ducking is implemented as gain attenuation on the makeup stage.
        (chain as PluginNodeChain & { _scMakeup?: GainNode; _scThresholdDb?: number; _scRatio?: number }).
          _scMakeup = makeup;
        (chain as PluginNodeChain & { _scMakeup?: GainNode; _scThresholdDb?: number; _scRatio?: number }).
          _scThresholdDb = p.threshold ?? -20;
        (chain as PluginNodeChain & { _scMakeup?: GainNode; _scThresholdDb?: number; _scRatio?: number }).
          _scRatio = p.ratio ?? 4;
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

  /**
   * Wire (or rewire) a sidechain ducking loop. Pass `sourceTrackId === null`
   * to disable. The loop reads the source track's gain output via an
   * AnalyserNode and modulates the destination compressor's makeup-gain
   * stage in proportion to the source RMS exceeding the compressor's
   * threshold. This emulates classic SC ducking since Web Audio's
   * DynamicsCompressorNode has no real sidechain input.
   */
  setSidechainSource(destTrackId: string, pluginId: string, sourceTrackId: string | null): void {
    const key = `${destTrackId}:${pluginId}`;
    const existing = this.sidechainLoops.get(key);
    if (existing) { existing.stop(); this.sidechainLoops.delete(key); }
    if (!sourceTrackId || !this.ctx) return;

    const destChain = this.pluginNodes.get(destTrackId)?.get(pluginId) as
      (PluginNodeChain & { _scMakeup?: GainNode; _scThresholdDb?: number; _scRatio?: number }) | undefined;
    const sourceNode = this.trackNodes.get(sourceTrackId);
    if (!destChain || !destChain._scMakeup || !sourceNode) return;

    const ctx = this.ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    sourceNode.gain.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    const baseGain = destChain._scMakeup.gain.value;
    const thresholdDb = destChain._scThresholdDb ?? -20;
    const ratio = Math.max(1, destChain._scRatio ?? 4);
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -120;
      const overDb = Math.max(0, rmsDb - thresholdDb);
      // Apply ratio: every overDb of source above threshold pulls the
      // destination down by overDb * (1 - 1/ratio) — same shape Web Audio
      // would use internally if it accepted a real sidechain input.
      const reductionDb = overDb * (1 - 1 / ratio);
      const targetGain = baseGain * Math.pow(10, -reductionDb / 20);
      destChain._scMakeup!.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.02);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    this.sidechainLoops.set(key, {
      stop: () => {
        stopped = true;
        try { sourceNode.gain.disconnect(analyser); } catch { /* already torn down */ }
        try { destChain._scMakeup!.gain.setTargetAtTime(baseGain, ctx.currentTime, 0.02); } catch { /* */ }
      },
    });
  }

  // Rebuild the audio graph for a track's plugin chain
  private rebuildTrackPluginChain(trackId: string) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode || !this.ctx) return;

    const trackPluginMap = this.pluginNodes.get(trackId);

    // Disconnect input from everything
    try { trackNode.input.disconnect(); } catch (e) { console.warn('[DEX]', e); }

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
    this.masterChainNodes.forEach(n => { try { n.disconnect(); } catch (e) { console.warn('[DEX]', e); } });
    this.masterChainNodes = [];

    if (!this.masterLimiter || !this.masterGain || !this.analyser) return;

    // Disconnect current master chain
    try { this.masterLimiter.disconnect(); } catch (e) { console.warn('[DEX]', e); }
    try { this.masterGain.disconnect(); } catch (e) { console.warn('[DEX]', e); }

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

    // Mid/Side balance: apply M/S matrix processing
    if (settings.midSideBalance !== 0) {
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      // M/S encode: mid = (L+R)*0.5, side = (L-R)*0.5
      // Then apply balance gains and decode back
      const balance = settings.midSideBalance / 100; // -1 to +1
      const midGainVal = Math.pow(10, (balance > 0 ? 0 : balance * 6) / 20); // attenuate mid when balance < 0
      const sideGainVal = Math.pow(10, (balance < 0 ? 0 : -balance * 6) / 20); // attenuate side when balance > 0
      // L channel gains: L_out = midGain * 0.5*(L+R) + sideGain * 0.5*(L-R)
      //                       = L * 0.5*(midGain+sideGain) + R * 0.5*(midGain-sideGain)
      const lFromL = ctx.createGain();
      const lFromR = ctx.createGain();
      const rFromL = ctx.createGain();
      const rFromR = ctx.createGain();
      lFromL.gain.value = 0.5 * (midGainVal + sideGainVal);
      lFromR.gain.value = 0.5 * (midGainVal - sideGainVal);
      rFromL.gain.value = 0.5 * (midGainVal - sideGainVal);
      rFromR.gain.value = 0.5 * (midGainVal + sideGainVal);
      lastNode.connect(splitter);
      splitter.connect(lFromL, 0);
      splitter.connect(lFromR, 1);
      splitter.connect(rFromL, 0);
      splitter.connect(rFromR, 1);
      lFromL.connect(merger, 0, 0);
      lFromR.connect(merger, 0, 0);
      rFromL.connect(merger, 0, 1);
      rFromR.connect(merger, 0, 1);
      this.masterChainNodes.push(splitter, merger, lFromL, lFromR, rFromL, rFromR);
      lastNode = merger;
    }

    // Stereo widener: Haas-effect delay trick
    if (settings.stereoWidth !== 100 && settings.stereoWidth !== undefined) {
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const widthFactor = (settings.stereoWidth - 100) / 100; // -1 to +1
      const delayL = ctx.createDelay(0.05);
      const delayR = ctx.createDelay(0.05);
      const delayTime = Math.abs(widthFactor) * 0.012; // up to 12ms
      if (widthFactor > 0) {
        delayR.delayTime.value = delayTime;
        delayL.delayTime.value = 0;
      } else {
        // Narrow: reduce side signal by cross-mixing
        delayL.delayTime.value = 0;
        delayR.delayTime.value = 0;
      }
      lastNode.connect(splitter);
      splitter.connect(delayL, 0);
      splitter.connect(delayR, 1);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      this.masterChainNodes.push(splitter, merger, delayL, delayR);
      lastNode = merger;
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

  getTrackInput(trackId: string): GainNode | null {
    return this.trackNodes.get(trackId)?.input || null;
  }
  getMasterLimiter(): DynamicsCompressorNode | null { return this.masterLimiter; }
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
  <div role="button" tabIndex={0} aria-label={`Select track ${track.name}`} aria-pressed={isSelected} onClick={onSelect} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }} style={{ width: '94px', minWidth: '94px', background: isSelected ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)', borderRadius: '10px', marginRight: '8px', display: 'flex', flexDirection: 'column', border: `1px solid ${isSelected ? track.color + '40' : 'var(--color-border-subtle)'}`, overflow: 'hidden', boxShadow: isSelected ? `0 0 20px ${track.color}15` : '0 2px 8px rgba(0,0,0,0.2)' }}>
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', background: `linear-gradient(180deg, ${track.color}25, ${track.color}10)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div onClick={(e) => { e.stopPropagation(); const idx = COLORS.indexOf(track.color); onUpdate({ color: COLORS[(idx + 1) % COLORS.length] }); }} style={{ width: 8, height: 8, borderRadius: '50%', background: track.color, cursor: 'pointer', flexShrink: 0, border: '1px solid var(--color-text-tertiary)' }} title="Click to change color" />
        <div style={{ fontSize: '10px', fontWeight: 600, color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{track.name}</div>
      </div>
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', gap: '3px' }}>
        {/* Stereo peak meter (L/R) */}
        <div style={{ display: 'flex', gap: '1px', height: '100%', maxHeight: '120px' }}>
          {[0, 1].map((ch) => {
            const level = track.muted ? 0 : Math.min(track.volume * (0.7 + ch * 0.1), 1.5);
            const pct = Math.min(level / 1.5, 1) * 100;
            const isClip = level > 1.0;
            return (
              <div key={ch} style={{ width: '3px', height: '100%', background: 'var(--color-bg-tertiary)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct}%`, background: isClip ? 'linear-gradient(to top, #30d158, #ff9f0a 60%, #ff453a)' : `linear-gradient(to top, #30d158, ${track.color})`, borderRadius: '2px', transition: 'height 0.08s ease-out' }} />
              </div>
            );
          })}
        </div>
        {/* Volume fader */}
        <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${track.volume * 100}%`, background: `linear-gradient(to top, ${track.color}, ${track.color}80)`, borderRadius: '4px' }} />
        </div>
        <input type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
      </div>
      <span style={{ fontSize: '9px', color: track.color, fontFamily: 'monospace', marginTop: '4px' }}>{track.volume > 1 ? '+' : ''}{((track.volume - 1) * 60).toFixed(1)} dB</span>
    </div>
    <div style={{ padding: '6px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'center', gap: '4px' }}>
      <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.muted ? 'rgba(10,132,255,0.4)' : 'var(--color-border-default)', background: track.muted ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: track.muted ? '#fff' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="volume-x" size={10} /></button>
      <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.solo ? 'rgba(255,159,10,0.4)' : 'var(--color-border-default)', background: track.solo ? 'var(--color-warning)' : 'var(--color-bg-tertiary)', color: track.solo ? '#000' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="headphones" size={10} /></button>
      <button aria-label="Record arm" onClick={(e) => { e.stopPropagation(); onUpdate({ armed: !track.armed }); }} style={{ width: '22px', height: '18px', borderRadius: '3px', border: '1px solid', borderColor: track.armed ? 'rgba(255,69,58,0.4)' : 'var(--color-border-default)', background: track.armed ? 'var(--color-error)' : 'var(--color-bg-tertiary)', color: track.armed ? '#fff' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="record" size={10} /></button>
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
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);
  // Creative app settings from Settings page
  const appSettings = useCreativeAppSettings('imosion');
  useAutoSave('imosion', useCallback(() => ({ isDirty: true }), []), isDirty, 30_000);
  const collab = useCollaborationFeatures({ appId: 'imosion', projectName: 'IMOSION Project', autoCheckpointInterval: 300000 });

  const { dropProps, dropOverlayStyle } = useFileDrop(
    ['audio/*', 'wav', 'mp3', 'ogg', 'flac', 'aiff', 'm4a', 'webm'],
    useCallback((files) => { setIsDirty(true); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Imported ${files.length} audio file(s) into Imosion`, type: 'success' } })); }, [])
  );

  // Create instance-specific audio engine for multi-window support
  const audioEngineRef = useRef<AudioEngine | null>(null);

  // Listen for incoming assets from other creative apps
  useCreativeInbox('imosion', useCallback((asset) => {
    if (asset.kind === 'audio' && asset.data) {
      const newTrack: AudioTrack = {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: asset.name || 'Imported Audio',
        type: 'audio',
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        color: 'var(--color-accent)',
        clips: [{
          id: `clip-${Date.now()}`,
          name: asset.name || 'Imported Clip',
          startTime: 0,
          duration: 0,
          waveform: [],
          gain: 1,
          url: asset.data,
          fadeIn: 0,
          fadeOut: 0,
          pitch: 0,
          stretch: 1,
          reverse: false,
          trimStart: 0,
          trimEnd: 0,
          loopEnabled: false,
          loopStart: 0,
          loopEnd: 0,
          tempoLocked: false,
          originalBPM: 120,
          detectedKey: null,
          detectedScale: null,
          keyLocked: false,
          transposeAmount: 0,
          warpMode: 'beats',
          speedMultiplier: 1,
        }],
        plugins: [],
        output: 'master',
        sends: [],
        phase: false,
        trim: 0,
        inputSource: 'default',
      };
      setTracks(prev => [...prev, newTrack]);
      setIsDirty(true);
    }
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Imported "${asset.name}" from ${asset.sourceApp}` } }));
  }, []));
  
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
        engine.getContext()?.close().catch((e: unknown) => { console.warn('[DEX]', e); });
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
      // Revoke all blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* */ }
      });
      blobUrlsRef.current.clear();
    };
  }, []);
  
  const { closeApp, setCurrentApp } = useRunningApps();

  // ===== BEGINNER MODE =====
  const { isBeginnerMode: beginnerMode, showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('imosion');
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const collabChannelRef = useRef<BroadcastChannel | null>(null);
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
  const playbackPosition = currentTime;
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
  const playbackSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const decodedBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const currentTimeRef = useRef(0);

  // Audio Device Selection (system audio interface support)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');
  const [bufferSize, setBufferSize] = useState<128 | 256 | 512 | 1024 | 2048>(256);
  const [latencyMode, setLatencyMode] = useState<'ultra-low' | 'low' | 'balanced' | 'safe'>('low');
  const lastFrameTimeRef = useRef<number>(0);

  // ===== NEW PRO FEATURES STATE =====
  const [showBatchFade, setShowBatchFade] = useState(false);
  const [batchFadeIn, setBatchFadeIn] = useState(50);
  const [batchFadeOut, setBatchFadeOut] = useState(50);
  const [batchFadeCurve, setBatchFadeCurve] = useState<'linear' | 'exponential' | 'sCurve' | 'logarithmic'>('linear');
  const [showTimeStretch, setShowTimeStretch] = useState(false);
  const [stretchRatio, setStretchRatio] = useState(100);
  const [stretchAlgorithm, setStretchAlgorithm] = useState<'elastique' | 'complex' | 'speech' | 'monophonic'>('elastique');
  const [showPitchShift, setShowPitchShift] = useState(false);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [pitchCents, setPitchCents] = useState(0);
  const [pitchPreserveFormant, setPitchPreserveFormant] = useState(true);
  const [showTrackTemplates, setShowTrackTemplates] = useState(false);
  const [trackTemplateList] = useState([
    { id: 'vocal', name: 'Vocal Chain', desc: 'EQ → Comp → DeEsser → Reverb' },
    { id: 'drums', name: 'Drum Bus', desc: 'Comp → EQ → Limiter → Saturation' },
    { id: 'guitar', name: 'Guitar DI', desc: 'EQ → Chorus → Delay → Reverb' },
    { id: 'bass', name: 'Bass Track', desc: 'Comp → EQ → Saturation → Limiter' },
    { id: 'keys', name: 'Keys/Synth', desc: 'EQ → Chorus → Delay' },
    { id: 'podcast', name: 'Podcast Mic', desc: 'Gate → EQ → Comp → Limiter' },
  ]);
  const [showMarkerRegions, setShowMarkerRegions] = useState(false);
  const [markerRegions, setMarkerRegions] = useState<Array<{ id: string; name: string; start: number; end: number; color: string }>>([
    { id: 'r1', name: 'Intro', start: 0, end: 8, color: 'var(--color-warning)' },
    { id: 'r2', name: 'Verse 1', start: 8, end: 24, color: 'var(--color-success)' },
    { id: 'r3', name: 'Chorus', start: 24, end: 40, color: 'var(--color-accent)' },
  ]);
  const [showTempoMap, setShowTempoMap] = useState(false);
  const [tempoChanges, setTempoChanges] = useState<Array<{ id: string; bar: number; bpm: number; curve: 'instant' | 'linear' | 'ease' }>>([
    { id: 'tc1', bar: 1, bpm: 120, curve: 'instant' },
  ]);
  const [showGrooveQuant, setShowGrooveQuant] = useState(false);
  const [grooveTemplate, setGrooveTemplate] = useState('none');
  const [grooveStrength, setGrooveStrength] = useState(75);
  const [showTrackColor, setShowTrackColor] = useState(false);
  const [showClipFx, setShowClipFx] = useState(false);
  const [showReferenceTrack, setShowReferenceTrack] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referencePlaying, setReferencePlaying] = useState(false);
  const [referenceVolume, setReferenceVolume] = useState(0.8);
  const [showBusComp, setShowBusComp] = useState(false);
  const [busCompThreshold, setBusCompThreshold] = useState(-12);
  const [busCompRatio, setBusCompRatio] = useState(4);
  const [busCompAttack, setBusCompAttack] = useState(10);
  const [busCompRelease, setBusCompRelease] = useState(100);
  const [busCompMakeup, setBusCompMakeup] = useState(0);
  const [showTapeEmu, setShowTapeEmu] = useState(false);
  const [tapeDrive, setTapeDrive] = useState(30);
  const [tapeWarmth, setTapeWarmth] = useState(50);
  const [tapeHiss, setTapeHiss] = useState(0);
  const [tapeWow, setTapeWow] = useState(0);
  const [showMidSide, setShowMidSide] = useState(false);
  const [midGain, setMidGain] = useState(0);
  const [sideGain, setSideGain] = useState(0);
  const [midSideWidth, setMidSideWidth] = useState(100);
  const [showSRConvert, setShowSRConvert] = useState(false);
  const [showLoudPenalty, setShowLoudPenalty] = useState(false);
  const [showTrackNotes, setShowTrackNotes] = useState(false);
  const [trackNotes, setTrackNotes] = useState<Record<string, string>>({});
  const [showChainPreset, setShowChainPreset] = useState(false);
  const [chainPresetNameDraft, setChainPresetNameDraft] = useState<string | null>(null);
  const [chainPresets, setChainPresets] = useState([
    { id: 'cp1', name: 'Pop Vocal', effects: ['EQ', 'Compressor', 'De-Esser', 'Reverb', 'Delay'] },
    { id: 'cp2', name: 'Rock Guitar', effects: ['EQ', 'Saturation', 'Reverb', 'Delay'] },
    { id: 'cp3', name: 'Clean Master', effects: ['EQ', 'Compressor', 'Limiter'] },
    { id: 'cp4', name: 'Ambient Pad', effects: ['Chorus', 'Reverb', 'Delay', 'EQ'] },
  ]);
  const [showWarpMarkers, setShowWarpMarkers] = useState(false);
  const [warpMarkers, setWarpMarkers] = useState<Array<{ id: string; position: number }>>([]);
  const [warpMode, setWarpMode] = useState<'Beats' | 'Tones' | 'Texture' | 'Re-Pitch' | 'Complex'>('Beats');
  const [showTrackGroup, setShowTrackGroup] = useState(false);
  const [trackGroups, setTrackGroups] = useState<Array<{ id: string; name: string; trackIds: string[]; linkVolume: boolean; linkMute: boolean; linkSolo: boolean }>>([]);
  const [showExportAdvanced, setShowExportAdvanced] = useState(false);
  const [exportFormatAdv, setExportFormatAdv] = useState('wav');
  const [exportBitDepth, setExportBitDepth] = useState(24);
  const [exportSR, setExportSR] = useState(48000);
  const [exportDither, setExportDither] = useState(true);
  const [exportNormalize, setExportNormalize] = useState(false);

  // ===== MIDI SUPPORT =====
  const [midiAccess, setMidiAccess] = useState<any>(null);
  const [midiInputs, setMidiInputs] = useState<Array<{ id: string; name: string; connected: boolean }>>([]);
  const [activeMidiInput, setActiveMidiInput] = useState<string>('');
  const [midiNotes, setMidiNotes] = useState<Set<number>>(new Set());
  const [showMidiPanel, setShowMidiPanel] = useState(false);
  const [midiLearnMode, setMidiLearnMode] = useState(false);
  const [midiCCMap, setMidiCCMap] = useState<Record<number, string>>({
    1: 'volume',   // Mod wheel → volume
    7: 'volume',   // CC7 → volume
    10: 'pan',     // CC10 → pan
    64: 'sustain', // Sustain pedal
  });
  const midiSynthRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const midiActiveNotesRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map());
  const selectedTrackRef = useRef<string | null>(null);

  // Connect to Web MIDI API
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let access: any = null;
    navigator.requestMIDIAccess({ sysex: false }).then((ma: any) => {
      access = ma;
      setMidiAccess(ma);
      const inputs: Array<{ id: string; name: string; connected: boolean }> = [];
      ma.inputs.forEach((input: any) => {
        inputs.push({ id: input.id, name: input.name || 'Unknown MIDI Device', connected: input.state === 'connected' });
      });
      setMidiInputs(inputs);

      // Listen for state changes (device connect/disconnect)
      ma.onstatechange = (e: any) => {
        const newInputs: Array<{ id: string; name: string; connected: boolean }> = [];
        ma.inputs.forEach((input: any) => {
          newInputs.push({ id: input.id, name: input.name || 'Unknown', connected: input.state === 'connected' });
        });
        setMidiInputs(newInputs);
      };
    }).catch(() => { /* MIDI not available */ });

    return () => {
      if (access) {
        access.inputs.forEach((input: any) => { input.onmidimessage = null; });
      }
      // Clean up active notes
      midiActiveNotesRef.current.forEach(({ osc, gain }) => {
        try { osc.stop(); } catch (e) { console.warn('[DEX]', e); }
      });
      midiActiveNotesRef.current.clear();
    };
  }, []);

  // Bind MIDI input messages
  useEffect(() => {
    if (!midiAccess || !activeMidiInput) return;
    const input = midiAccess.inputs.get(activeMidiInput);
    if (!input) return;

    const midiToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

    const handleMidiMessage = (msg: any) => {
      const [status, data1, data2] = msg.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && data2 > 0) {
        // Note On — play synth tone matched to active instrument type
        // Voice pool limit: max 32 simultaneous voices to prevent audio context exhaustion
        if (midiActiveNotesRef.current.size >= 32) {
          // Steal oldest voice
          const oldestKey = midiActiveNotesRef.current.keys().next().value;
          if (oldestKey !== undefined) {
            const old = midiActiveNotesRef.current.get(oldestKey);
            if (old) { try { old.osc.stop(); } catch { /* already stopped */ } }
            midiActiveNotesRef.current.delete(oldestKey);
          }
        }
        setMidiNotes(prev => new Set(prev).add(data1));
        try {
          const actx = audioContextRef.current || getAudioEngine().getContext();
          if (!actx) return;
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          // Determine oscillator type from active instrument track
          const activeInst = instrumentTracks.find(t => t.id === selectedInstrument);
          const instType = activeInst?.instrument.type;
          if (instType === 'subsynth') {
            const shapeMap: Record<number, OscillatorType> = { 0: 'sine', 1: 'sawtooth', 2: 'square', 3: 'triangle' };
            osc.type = shapeMap[activeInst?.instrument.params.osc1Shape ?? 1] || 'sawtooth';
          } else if (instType === 'fmsynth') {
            osc.type = 'sine';
            osc.frequency.value = midiToFreq(data1);
            // FM modulation: create modulator
            const mod = actx.createOscillator();
            const modGain = actx.createGain();
            mod.frequency.value = midiToFreq(data1) * (activeInst?.instrument.params.op2Ratio ?? 2);
            modGain.gain.value = (activeInst?.instrument.params.op2Level ?? 0.5) * midiToFreq(data1);
            mod.connect(modGain);
            modGain.connect(osc.frequency);
            mod.start();
            setTimeout(() => { try { mod.stop(); } catch (e) { console.warn('[DEX]', e); } }, 5000);
          } else if (instType === 'wavetable') {
            osc.type = 'sawtooth'; // approximate wavetable with saw
          } else {
            osc.type = 'sine';
          }
          osc.frequency.value = midiToFreq(data1);
          gain.gain.value = data2 / 127 * 0.3;
          osc.connect(gain);
          gain.connect(actx.destination);
          osc.start();
          midiActiveNotesRef.current.set(data1, { osc, gain });
        } catch (e) { console.warn('[DEX]', e); }
      } else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
        // Note Off
        setMidiNotes(prev => { const n = new Set(prev); n.delete(data1); return n; });
        const noteData = midiActiveNotesRef.current.get(data1);
        if (noteData) {
          noteData.gain.gain.exponentialRampToValueAtTime(0.001, noteData.osc.context.currentTime + 0.1);
          setTimeout(() => { try { noteData.osc.stop(); } catch (e) { console.warn('[DEX]', e); } }, 150);
          midiActiveNotesRef.current.delete(data1);
        }
      } else if (cmd === 0xb0) {
        // CC message
        const ccTarget = midiCCMap[data1];
        if (ccTarget === 'volume' && selectedTrackRef.current) {
          const val = data2 / 127;
          const trackId = selectedTrackRef.current;
          setTracks(prev => prev.map(t => t.id === trackId ? { ...t, volume: val } : t));
        } else if (ccTarget === 'pan' && selectedTrackRef.current) {
          const val = (data2 / 63.5) - 1;
          const trackId = selectedTrackRef.current;
          setTracks(prev => prev.map(t => t.id === trackId ? { ...t, pan: val } : t));
        }
      }
    };

    input.onmidimessage = handleMidiMessage;
    return () => { input.onmidimessage = null; };
  }, [midiAccess, activeMidiInput, midiCCMap]);

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
      } catch (e) {
        console.warn('[Imosion] Audio device enumeration failed:', e);
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
    try { getAudioEngine().applyMasterSettings(masterSettings); } catch (e) { console.warn('[DEX]', e); }
  }, [masterSettings, getAudioEngine]);

  const emptyPluginPresets = { eq: [], compressor: [], reverb: [], delay: [], chorus: [], limiter: [], gate: [], deesser: [], saturation: [], autotune: [] } as Record<PluginType, PluginPreset[]>;
  const [customMasteringPresets, setCustomMasteringPresets] = useState<MasteringPreset[]>(() => {
    try {
      const saved = localStorage.getItem('imosion-custom-mastering-presets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [customPluginPresets, setCustomPluginPresets] = useState<Record<PluginType, PluginPreset[]>>(() => {
    try {
      const saved = localStorage.getItem('imosion-custom-plugin-presets');
      return saved ? JSON.parse(saved) : { ...emptyPluginPresets };
    } catch { return { ...emptyPluginPresets }; }
  });
  const [showSavePresetModal, setShowSavePresetModal] = useState<{ type: 'mastering' | 'plugin'; pluginType?: PluginType; trackId?: string; pluginId?: string } | null>(null);
  const [newPresetName, setNewPresetName] = useState('');

  // Buses - start empty, user creates their own session
  const [buses, setBuses] = useState<AudioBus[]>(() => []);

  // Helper to generate a realistic-looking waveform
  const _genWave = (len: number, style: 'kick' | 'snare' | 'bass' | 'guitar' | 'vocal') => {
    const w: number[] = [];
    for (let i = 0; i < len; i++) {
      const t = i / len;
      let v = 0;
      if (style === 'kick') v = Math.exp(-t * 6) * (0.7 + 0.3 * Math.sin(t * 80));
      else if (style === 'snare') v = Math.exp(-t * 8) * (0.5 + 0.5 * Math.random());
      else if (style === 'bass') v = 0.5 + 0.3 * Math.sin(t * Math.PI * 4) + 0.1 * Math.sin(t * Math.PI * 12);
      else if (style === 'guitar') v = 0.3 + 0.4 * Math.sin(t * Math.PI * 6) * (1 - t * 0.3) + 0.15 * Math.sin(t * Math.PI * 18);
      else v = 0.4 + 0.35 * Math.sin(t * Math.PI * 3) + 0.15 * Math.sin(t * Math.PI * 9) + 0.05 * Math.random();
      w.push(Math.max(0, Math.min(1, v)));
    }
    return w;
  };

  // Tracks - start empty, user adds tracks as needed
  const [tracks, setTracks] = useState<AudioTrack[]>(() => []);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);

  // Keep MIDI ref in sync with selectedTrack state
  useEffect(() => { selectedTrackRef.current = selectedTrack; }, [selectedTrack]);

  // Save custom presets (dual-write: localStorage + IPC)
  useEffect(() => {
    try {
      const json = JSON.stringify(customMasteringPresets);
      localStorage.setItem('imosion-custom-mastering-presets', json);
      (window as any).electron?.invoke?.('capability:storage:set', 'imosion-custom-mastering-presets', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    } catch (e) { console.warn('[Imosion] Failed to save custom mastering presets:', e); }
  }, [customMasteringPresets]);

  useEffect(() => {
    try {
      const json = JSON.stringify(customPluginPresets);
      localStorage.setItem('imosion-custom-plugin-presets', json);
      (window as any).electron?.invoke?.('capability:storage:set', 'imosion-custom-plugin-presets', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    } catch (e) { console.warn('[Imosion] Failed to save custom plugin presets:', e); }
  }, [customPluginPresets]);

  // Load custom presets from IPC on mount
  useEffect(() => {
    (async () => {
      try {
        const mp = await (window as any).electron?.invoke?.('capability:storage:get', 'imosion-custom-mastering-presets');
        if (mp) setCustomMasteringPresets(typeof mp === 'string' ? JSON.parse(mp) : mp);
        const pp = await (window as any).electron?.invoke?.('capability:storage:get', 'imosion-custom-plugin-presets');
        if (pp) setCustomPluginPresets(typeof pp === 'string' ? JSON.parse(pp) : pp);
      } catch (e) { console.warn('[Imosion] IPC preset load unavailable:', e); }
    })();
  }, []);

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
  const [storeActiveTab, setStoreActiveTab] = useState<'browse' | 'installed'>('browse');

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
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showPanelsMenu, setShowPanelsMenu] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [viewMode, setViewMode] = useState<'arrange' | 'mixer' | 'beatmaker' | 'pianoroll'>('arrange');

  // ===== PIANO ROLL =====
  const [pianoRollNotes, setPianoRollNotes] = useState<MidiNote[]>([]);
  const [pianoRollScroll, setPianoRollScroll] = useState({ x: 0, y: 60 * 6 }); // scroll to middle C area
  const [pianoRollTool, setPianoRollTool] = useState<'select' | 'draw' | 'erase'>('draw');
  const [pianoRollSnap, setPianoRollSnap] = useState<number>(0.25); // 1/4 = quarter note, 0.25 = 16th
  const [pianoRollSelectedNotes, setPianoRollSelectedNotes] = useState<Set<string>>(new Set());
  const [pianoRollDrag, setPianoRollDrag] = useState<{ type: 'none' | 'move' | 'resize' | 'marquee'; noteId?: string; startX: number; startY: number; startPitch?: number; startTime?: number } | null>(null);
  const [showVelocityLane, setShowVelocityLane] = useState(true);
  const [showCCLane, setShowCCLane] = useState(false);
  const [pianoRollOctaveRange] = useState({ low: 0, high: 8 }); // C0 to C8 = 96 notes
  const [showChordTrigger, setShowChordTrigger] = useState(false);
  const [chordIncludeSeventh, setChordIncludeSeventh] = useState(false);
  const [chordTriggerMode, setChordTriggerMode] = useState<'major' | 'minor'>('major');

  // ===== INSTRUMENT TRACKS =====
  const [instrumentTracks, setInstrumentTracks] = useState<InstrumentTrack[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string | null>(null);
  const [showInstrumentBrowser, setShowInstrumentBrowser] = useState(false);
  const [showInstrumentEditor, setShowInstrumentEditor] = useState(false);

  // ===== HELP =====
  const [showHelp, setShowHelp] = useState(false);

  // ===== AUTOMATION =====
  const [trackAutomations, setTrackAutomations] = useState<TrackAutomation[]>([]);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationMode, setAutomationMode] = useState<'read' | 'write' | 'latch' | 'touch'>('read');
  const [editingAutomation, setEditingAutomation] = useState<string | null>(null); // automation lane id
  const [automationDragPoint, setAutomationDragPoint] = useState<number | null>(null); // index of point being dragged

  // ===== BEAT MAKER =====
  const BEAT_KITS = [
    { id: 'trap', name: 'Trap', pads: ['Kick', '808', 'Snare', 'Clap', 'HiHat', 'OpenHH', 'Crash', 'Perc', 'Rim', 'Tom', 'Shaker', 'FX', 'Chant', 'Bell', 'Sub', 'Snap'] },
    { id: 'boombap', name: 'Boom Bap', pads: ['Kick', 'Snare', 'HiHat', 'OpenHH', 'Ride', 'Crash', 'Tom1', 'Tom2', 'Clap', 'Rim', 'Perc1', 'Perc2', 'Scratch', 'Stab', 'Bass', 'FX'] },
    { id: 'house', name: 'House', pads: ['Kick', 'Clap', 'HiHat', 'OpenHH', 'Snare', 'Ride', 'Perc1', 'Perc2', 'Cow', 'Conga', 'Bongo', 'Shaker', 'Cymbal', 'Stab', 'Chord', 'Bass'] },
    { id: 'lofi', name: 'Lo-fi', pads: ['Kick', 'Snare', 'HiHat', 'OpenHH', 'Rim', 'Shaker', 'Vinyl', 'Foley1', 'Foley2', 'Keys', 'Guitar', 'Bass', 'Pad', 'FX1', 'FX2', 'Noise'] },
  ];
  const [beatKit, setBeatKit] = useState(BEAT_KITS[0]);
  const [beatSteps, setBeatSteps] = useState(16);
  const [beatGrid, setBeatGrid] = useState<boolean[][]>(() => Array.from({ length: 16 }, () => Array(16).fill(false)));
  const [beatVelocities, setBeatVelocities] = useState<number[][]>(() => Array.from({ length: 16 }, () => Array(16).fill(0.8)));
  const [beatSwing, setBeatSwing] = useState(0);
  const [beatPlayStep, setBeatPlayStep] = useState(-1);
  const [beatPlaying, setBeatPlaying] = useState(false);
  const beatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activePad, setActivePad] = useState(-1);
  const [beatPattern, setBeatPattern] = useState(0);
  const [beatPatterns, setBeatPatterns] = useState<{ grid: boolean[][]; velocities: number[][] }[]>([]);

  // Cleanup beat sequencer interval on unmount
  useEffect(() => {
    return () => {
      if (beatIntervalRef.current) {
        // Handle both setInterval ID and requestAnimationFrame cancel function
        if (typeof (beatIntervalRef.current as any)?.cancel === 'function') {
          (beatIntervalRef.current as any).cancel();
        } else if (typeof beatIntervalRef.current === 'number') {
          clearInterval(beatIntervalRef.current);
        }
        beatIntervalRef.current = null;
      }
    };
  }, []);

  const toggleBeatCell = useCallback((row: number, col: number) => {
    setBeatGrid(g => {
      const ng = g.map(r => [...r]);
      ng[row][col] = !ng[row][col];
      return ng;
    });
  }, []);

  const startBeatSequencer = useCallback(() => {
    if (beatIntervalRef.current) clearInterval(beatIntervalRef.current);
    setBeatPlaying(true);
    setBeatPlayStep(0);
    const stepTime = (60 / bpm) / 4 * 1000; // 16th note
    let step = 0;
    let lastStepTime = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      if (now - lastStepTime >= stepTime) {
        step = (step + 1) % beatSteps;
        setBeatPlayStep(step);
        lastStepTime += stepTime;
        // Catch up if we fell behind
        if (now - lastStepTime >= stepTime) lastStepTime = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    // Store cleanup handle — reuse beatIntervalRef for cancellation
    (beatIntervalRef as any).current = { cancel: () => cancelAnimationFrame(rafId) } as any;
  }, [bpm, beatSteps]);

  const stopBeatSequencer = useCallback(() => {
    if (beatIntervalRef.current) {
      if (typeof (beatIntervalRef.current as any)?.cancel === 'function') {
        (beatIntervalRef.current as any).cancel();
      } else {
        clearInterval(beatIntervalRef.current);
      }
    }
    beatIntervalRef.current = null;
    setBeatPlaying(false);
    setBeatPlayStep(-1);
  }, []);

  const clearBeatPattern = useCallback(() => {
    setBeatGrid(Array.from({ length: 16 }, () => Array(beatSteps).fill(false)));
    setBeatVelocities(Array.from({ length: 16 }, () => Array(beatSteps).fill(0.8)));
  }, [beatSteps]);

  const randomizeBeatPattern = useCallback(() => {
    setBeatGrid(g => g.map((row, ri) => row.map((_, ci) => {
      // Higher probability for kick/snare/hat on standard beats
      if (ri === 0) return ci % 4 === 0 ? true : Math.random() < 0.15; // Kick
      if (ri === 2) return ci % 8 === 4 ? true : Math.random() < 0.1; // Snare
      if (ri === 4) return Math.random() < 0.5; // HiHat
      return Math.random() < 0.12;
    })));
  }, []);

  // ===== NEW PRO FEATURES =====
  // Built-in effects visual UI
  const [showEffectsRack, setShowEffectsRack] = useState(false);
  const [activeEffectPlugin, setActiveEffectPlugin] = useState<string | null>(null);
  // Sidechain compression
  const [sidechainSource, setSidechainSource] = useState<string | null>(null);
  const [sidechainTarget, setSidechainTarget] = useState<string | null>(null);
  const [showSidechainPanel, setShowSidechainPanel] = useState(false);
  // Noise gate  
  const [showNoiseGate, setShowNoiseGate] = useState(false);
  const [noiseGateParams, setNoiseGateParams] = useState({ Threshold: -40, Hold: 50, Range: -80, Hysteresis: 4 });
  // De-esser
  const [showDeEsser, setShowDeEsser] = useState(false);
  const [deEsserParams, setDeEsserParams] = useState({ Frequency: 6500, Threshold: -15, Ratio: 3, Bandwidth: 2 });
  // Sidechain params
  const [sidechainParams, setSidechainParams] = useState({ Threshold: -20, Ratio: 4, Attack: 5, Release: 150 });
  // Vocal tuner
  const [showVocalTuner, setShowVocalTuner] = useState(false);
  const [vocalTunerMode, setVocalTunerMode] = useState<'natural' | 'hard-tune'>('natural');
  const [vocalTunerSpeed, setVocalTunerSpeed] = useState(50);
  // Loudness metering (LUFS)
  const [showLoudnessMeter, setShowLoudnessMeter] = useState(false);
  const [loudnessData, setLoudnessData] = useState({ integrated: -23, shortTerm: -23, momentary: -23, truePeak: -1, lra: 7 });
  // Track folders
  const [trackFolders, setTrackFolders] = useState<{ id: string; name: string; trackIds: string[]; collapsed: boolean; color: string }[]>([]);
  const [showTrackFolderDialog, setShowTrackFolderDialog] = useState(false);
  // Clip gain envelopes
  const [showClipGainEnvelope, setShowClipGainEnvelope] = useState(false);
  // Stem export
  const [showStemExport, setShowStemExport] = useState(false);
  // Freeze/flatten tracks
  const [frozenTracks, setFrozenTracks] = useState<Set<string>>(new Set());
  // Punch-in/punch-out recording
  const [punchInPoint, setPunchInPoint] = useState<number | null>(null);
  const [punchOutPoint, setPunchOutPoint] = useState<number | null>(null);
  const [punchMode, setPunchMode] = useState(false);
  // Comping lanes
  const [showCompLanes, setShowCompLanes] = useState(false);
  const [compLanes, setCompLanes] = useState<{ id: string; name: string; active: boolean }[]>([]);
  // Input monitoring
  const [inputMonitoring, setInputMonitoring] = useState(false);
  // Loop recording
  const [loopRecording, setLoopRecording] = useState(false);
  // Count-in (pre-roll bars before recording)
  const [countInBars, setCountInBars] = useState<0 | 1 | 2 | 4>(2);
  const [countInEnabled, setCountInEnabled] = useState(true);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInRemaining, setCountInRemaining] = useState(0);
  // Recording elapsed timer
  const [recordStartTime, setRecordStartTime] = useState<number | null>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  // Pre/post roll (seconds of playback before/after punch region)
  const [preRoll, setPreRoll] = useState(2);
  const [postRoll, setPostRoll] = useState(1);
  // Collaboration markers (timestamped notes)
  const [collabMarkers, setCollabMarkers] = useState<{ id: string; time: number; author: string; text: string; color: string; resolved: boolean }[]>([]);
  const [showCollabMarkers, setShowCollabMarkers] = useState(false);

  // Musical key state
  const [projectKey, setProjectKey] = useState<ProjectKey>({ root: 'C', scale: 'major' });
  const musicalKey = projectKey.root;
  const setMusicalKey = (v: string) => setProjectKey(k => ({ ...k, root: v as MusicalKey }));
  const musicalScale = projectKey.scale;
  const setMusicalScale = (v: string) => setProjectKey(k => ({ ...k, scale: v as MusicalScale }));
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

  // FL Studio features
  const [showForge, setShowForge] = useState(false);
  const [forgeClip, setForgeClip] = useState<{ trackId: string; clip: AudioClip } | null>(null);
  const [forgeSelection, setForgeSelection] = useState<{ start: number; end: number } | null>(null);
  const [colorPickerTrackId, setColorPickerTrackId] = useState<string | null>(null);
  const [clipResizing, setClipResizing] = useState<{ clipId: string; trackId: string; edge: 'left' | 'right'; startX: number; origStart: number; origDuration: number } | null>(null);




  // Load saved data (IPC first, localStorage fallback)
  useEffect(() => {
    const loadLocal = () => {
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
        } catch (e) { console.warn('[Imosion] State load failed:', e); }
      }
    };
    loadLocal();
    (async () => {
      try {
        const ipcData = await (window as any).electron?.invoke?.('capability:storage:get', 'imosion-data');
        if (ipcData) {
          const d = typeof ipcData === 'string' ? JSON.parse(ipcData) : ipcData;
          if (d.bpm) setBpm(d.bpm);
          if (d.masterSettings) setMasterSettings(d.masterSettings);
          if (d.sampleRate) setSampleRate(d.sampleRate);
          if (d.bitDepth) setBitDepth(d.bitDepth);
          if (d.tracks) setTracks(d.tracks);
          if (d.buses) setBuses(d.buses);
          if (d.installedPlugins) setInstalledPlugins(d.installedPlugins);
          if (d.templates) setTemplates([...DEFAULT_TEMPLATES, ...d.templates.filter((t: RecordingTemplate) => !DEFAULT_TEMPLATES.find(dt => dt.id === t.id))]);
        }
      } catch (e) { console.warn('[Imosion] IPC data load failed, using localStorage:', e); }
    })();
  }, []);

  // Save data (dual-write: localStorage + IPC) — debounced to avoid heavy serialization on every change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProjectData = useCallback((showToast = false) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const customTemplates = templates.filter(t => !DEFAULT_TEMPLATES.find(dt => dt.id === t.id));
    const json = JSON.stringify({ bpm, masterSettings, sampleRate, bitDepth, tracks, buses, installedPlugins, templates: customTemplates });
    localStorage.setItem('imosion-data', json);
    (window as any).electron?.invoke?.('capability:storage:set', 'imosion-data', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    setIsDirty(false);
    if (showToast) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Imosion project saved' } }));
    }
  }, [bitDepth, bpm, buses, installedPlugins, masterSettings, sampleRate, templates, tracks]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProjectData(false);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [saveProjectData]);

  // History tracking for undo/redo (debounced 300ms to avoid excessive deep clones)
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isUndoRedoAction) {
      setIsUndoRedoAction(false);
      return;
    }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      const snapshot = structuredClone({ tracks, buses });
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
          return newHistory;
        }
        return newHistory;
      });
      setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    }, 300);
    return () => { if (historyTimerRef.current) clearTimeout(historyTimerRef.current); };
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

  // Key detection algorithm using chromagram analysis via WebAudio FFT
  const detectClipKey = useCallback(async (trackId: string, clipId: string) => {
    const clip = tracks.find(t => t.id === trackId)?.clips.find(c => c.id === clipId);
    if (!clip || !clip.url) return;

    try {
      // Create offline context for analysis
      const response = await fetch(clip.url);
      const arrayBuffer = await response.arrayBuffer();
      const offlineCtx = new OfflineAudioContext(1, 44100 * 10, 44100);
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

      // Get audio data (first 10 seconds max)
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const fftSize = 4096;
      const hopSize = fftSize / 2;
      const numBins = fftSize / 2;

      // Chroma bin frequencies for notes C through B
      const noteFreqs = [
        261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
        369.99, 392.00, 415.30, 440.00, 466.16, 493.88
      ];
      const noteNames: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

      // Build chromagram by accumulating energy per pitch class
      const chroma = new Float32Array(12);
      const hann = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));

      const numFrames = Math.floor((channelData.length - fftSize) / hopSize);
      const maxFrames = Math.min(numFrames, 200); // Limit analysis

      for (let frame = 0; frame < maxFrames; frame++) {
        const offset = frame * hopSize;
        // Apply window and compute magnitude spectrum via DFT approximation
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
          real[i] = (channelData[offset + i] || 0) * hann[i];
        }

        // Simple DFT for chroma bins only (12 pitch classes across octaves 2-7)
        for (let note = 0; note < 12; note++) {
          let energy = 0;
          for (let octave = 2; octave <= 7; octave++) {
            const freq = noteFreqs[note] * Math.pow(2, octave - 4);
            if (freq > sampleRate / 2) break;
            const k = Math.round(freq * fftSize / sampleRate);
            if (k >= numBins) break;
            // Goertzel algorithm for single-frequency DFT
            const w = 2 * Math.PI * k / fftSize;
            const coeff = 2 * Math.cos(w);
            let s0 = 0, s1 = 0, s2 = 0;
            for (let i = 0; i < fftSize; i++) {
              s0 = real[i] + coeff * s1 - s2;
              s2 = s1;
              s1 = s0;
            }
            const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
            energy += Math.max(0, power);
          }
          chroma[note] += energy;
        }
      }

      // Normalize chromagram
      const maxChroma = Math.max(...chroma);
      if (maxChroma > 0) for (let i = 0; i < 12; i++) chroma[i] /= maxChroma;

      // Krumhansl-Kessler key profiles for major and minor
      const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
      const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

      // Correlate with all 24 keys (12 major + 12 minor)
      let bestKey = 0, bestScale: MusicalScale = 'major', bestCorr = -Infinity;
      for (let shift = 0; shift < 12; shift++) {
        let corrMajor = 0, corrMinor = 0;
        let sumC = 0, sumMaj = 0, sumMin = 0;
        for (let i = 0; i < 12; i++) {
          const ci = chroma[(i + shift) % 12];
          corrMajor += ci * majorProfile[i];
          corrMinor += ci * minorProfile[i];
          sumC += ci * ci;
          sumMaj += majorProfile[i] * majorProfile[i];
          sumMin += minorProfile[i] * minorProfile[i];
        }
        corrMajor /= Math.sqrt(sumC * sumMaj) || 1;
        corrMinor /= Math.sqrt(sumC * sumMin) || 1;

        if (corrMajor > bestCorr) { bestCorr = corrMajor; bestKey = shift; bestScale = 'major'; }
        if (corrMinor > bestCorr) { bestCorr = corrMinor; bestKey = shift; bestScale = 'minor'; }
      }

      const detectedKey = noteNames[bestKey];
      const detectedScale = bestScale;

      // Update clip with detected key
      setTracks(prev => prev.map(t => t.id === trackId ? {
        ...t,
        clips: t.clips.map(c => c.id === clipId ? { ...c, detectedKey, detectedScale } : c)
      } : t));
    } catch {
      // If analysis fails, leave key as null
    }
  }, [tracks]);

  // Detect key for all clips in a track
  const detectAllClipKeys = useCallback(async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    for (const clip of track.clips) {
      await detectClipKey(trackId, clip.id);
    }
  }, [tracks, detectClipKey]);

  // Detect key for all clips in project
  const detectAllProjectKeys = useCallback(async () => {
    for (const track of tracks) {
      for (const clip of track.clips) {
        await detectClipKey(track.id, clip.id);
      }
    }
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
      let clipsAudible = 0;
      const totalClips = tracks.reduce((n, t) => n + t.clips.length, 0);

      for (const track of tracks) {
        if (track.muted) continue;
        const trackGain = offlineCtx.createGain();
        trackGain.gain.value = track.volume;
        const trackPan = offlineCtx.createStereoPanner();
        trackPan.pan.value = track.pan;

        // Build the full track plugin chain BEFORE wiring clips so we don't have
        // to disconnect/reconnect later (the previous code rewired trackGain on
        // every plugin which orphaned earlier plugins and risked silence).
        let chainTail: AudioNode = trackGain;
        for (const plugin of track.plugins) {
          if (!plugin.enabled) continue;
          try {
            if (plugin.type === 'eq' && plugin.params) {
              const low = offlineCtx.createBiquadFilter();
              low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = (plugin.params.lowGain || 0);
              const mid = offlineCtx.createBiquadFilter();
              mid.type = 'peaking'; mid.frequency.value = 1000; mid.gain.value = (plugin.params.midGain || 0);
              const high = offlineCtx.createBiquadFilter();
              high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = (plugin.params.highGain || 0);
              chainTail.connect(low); low.connect(mid); mid.connect(high);
              chainTail = high;
            } else if (plugin.type === 'compressor' && plugin.params) {
              const comp = offlineCtx.createDynamicsCompressor();
              comp.threshold.value = plugin.params.threshold ?? -24;
              comp.ratio.value = plugin.params.ratio ?? 4;
              comp.attack.value = plugin.params.attack ?? 0.003;
              comp.release.value = plugin.params.release ?? 0.25;
              chainTail.connect(comp);
              chainTail = comp;
            }
          } catch (e) { console.warn('[Export] plugin error', plugin.type, e); }
        }
        chainTail.connect(trackPan);
        trackPan.connect(masterGain);

        for (const clip of track.clips) {
          try {
            let buffer: AudioBuffer | null = null;
            if (clip.url) {
              const response = await fetch(clip.url);
              const arrayBuf = await response.arrayBuffer();
              if (arrayBuf.byteLength > 0) {
                buffer = await offlineCtx.decodeAudioData(arrayBuf);
              }
            }

            if (!buffer) {
              // Clip has no audio source -- skip rather than silently writing zeros.
              console.warn('[Export] Clip has no audio source, skipping:', clip.name);
              clipsProcessed++;
              setExportProgress(5 + (clipsProcessed / Math.max(totalClips, 1)) * 70);
              continue;
            }

            // Apply clip processing (gain, fades)
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            // Apply pitch / playback rate. clip.pitch is semitones.
            if (typeof clip.pitch === 'number' && clip.pitch !== 0) {
              source.playbackRate.value = Math.pow(2, clip.pitch / 12);
            }
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
            // Clamp the play duration to the actual buffer length so we never
            // request more audio than the buffer holds.
            const bufDur = buffer.duration;
            const offset = Math.max(0, Math.min(clip.trimStart || 0, bufDur));
            const playDur = Math.max(0, Math.min(clip.duration, bufDur - offset));
            if (playDur > 0) {
              source.start(clip.startTime, offset, playDur);
              clipsAudible++;
            }
          } catch (clipErr) {
            console.warn('[Export] Skipping clip:', clip.name, clipErr);
          }
          clipsProcessed++;
          setExportProgress(5 + (clipsProcessed / Math.max(totalClips, 1)) * 70);
        }
      }

      // Synthesize piano roll MIDI notes into offline render
      if (pianoRollNotes.length > 0) {
        const midiToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
        const beatsToSec = (beats: number) => beats * 60 / bpm;
        for (const note of pianoRollNotes) {
          try {
            const noteStart = beatsToSec(note.startTime);
            const noteDur = beatsToSec(note.duration);
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = midiToFreq(note.pitch);
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime((note.velocity / 127) * 0.15, noteStart + 0.01);
            gain.gain.setValueAtTime((note.velocity / 127) * 0.15, noteStart + noteDur - 0.05);
            gain.gain.linearRampToValueAtTime(0, noteStart + noteDur);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(noteStart);
            osc.stop(noteStart + noteDur);
          } catch (e) { console.warn('[DEX]', e); }
        }
      }

      setExportProgress(80);

      // Render the audio
      const renderedBuffer = await offlineCtx.startRendering();
      setExportProgress(90);

      // Verify the render actually contains audio. If every sample on every
      // channel is below -120dBFS we treat the export as silent and warn the
      // user instead of writing a zero-byte WAV they won't notice until later.
      {
        const SILENCE_THRESHOLD = 1e-6; // ~ -120 dBFS
        let peak = 0;
        const chCount = renderedBuffer.numberOfChannels;
        // Sample every Nth frame -- 200ms windows are plenty to detect signal.
        const stride = Math.max(1, Math.floor(renderedBuffer.sampleRate * 0.2));
        for (let ch = 0; ch < chCount && peak <= SILENCE_THRESHOLD; ch++) {
          const data = renderedBuffer.getChannelData(ch);
          for (let i = 0; i < data.length; i += stride) {
            const v = Math.abs(data[i]);
            if (v > peak) { peak = v; if (peak > SILENCE_THRESHOLD) break; }
          }
        }
        if (peak <= SILENCE_THRESHOLD) {
          const reason = clipsAudible === 0
            ? 'no audible clips were scheduled'
            : 'rendered output was silent (check master/track gain or limiter ceiling)';
          throw new Error(`Export produced silence -- ${reason}.`);
        }
      }

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
        // Lossless export: WAV (native), AIFF (proper format), FLAC (fallback to WAV for lossless)
        if (format === 'aiff') {
          exportBlob = new Blob([audioBufferToAIFF(renderedBuffer, exportSettings.bitDepth <= 16 ? 16 : 24)], { type: 'audio/aiff' });
          ext = '.aiff';
        } else {
          exportBlob = audioBufferToWav(renderedBuffer, exportSettings.bitDepth);
          ext = '.wav';
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
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}` } }));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [exportSettings, tracks, duration, masterSettings, sampleRate, pianoRollNotes, bpm]);

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
    
    // Broadcast session via BroadcastChannel for local multi-window collab
    try {
      const bc = new BroadcastChannel('imosion-collab');
      bc.postMessage({ type: 'session-created', session, host: { id: userId, name: userName, color: userColor } });
      // Listen for join requests
      bc.onmessage = (e) => {
        if (e.data?.type === 'join-request' && e.data?.sessionId === session.id) {
          const joiner = e.data.user;
          setCollaborators(prev => {
            if (prev.find(c => c.id === joiner.id)) return prev;
            return [...prev, { ...joiner, isOnline: true, role: 'guest' }];
          });
          bc.postMessage({ type: 'join-accepted', sessionId: session.id, state: JSON.stringify({ tracks, buses, bpm, projectKey }) });
        } else if (e.data?.type === 'collab-message' && e.data?.sessionId === session.id) {
          setCollabMessages(prev => [...prev, e.data.message]);
        } else if (e.data?.type === 'cursor-update' && e.data?.sessionId === session.id) {
          setCollaborators(prev => prev.map(c => c.id === e.data.userId ? { ...c, cursor: e.data.cursor } : c));
        } else if (e.data?.type === 'leave' && e.data?.sessionId === session.id) {
          setCollaborators(prev => prev.filter(c => c.id !== e.data.userId));
        }
      };
      collabChannelRef.current = bc;
    } catch { /* BroadcastChannel not available */ }
  }, [userId, userName, userColor, tracks, buses, bpm, projectKey]);

  // Join collaboration session
  const joinCollabSession = useCallback((sessionId: string) => {
    try {
      const bc = new BroadcastChannel('imosion-collab');
      bc.postMessage({ type: 'join-request', sessionId, user: { id: userId, name: userName, color: userColor } });
      bc.onmessage = (e) => {
        if (e.data?.type === 'join-accepted' && e.data?.sessionId === sessionId) {
          // Set session state so the UI transitions to the in-session view
          const joinedSession: CollaborationSession = {
            id: sessionId,
            name: `Session ${sessionId.slice(-6)}`,
            hostId: e.data.hostId || '',
            participants: [],
            isLive: true,
            createdAt: Date.now(),
            projectState: e.data.state || '{}',
          };
          setCollaborationSession(joinedSession);
          setCollaborators([{
            id: userId,
            name: userName,
            color: userColor,
            isOnline: true,
            isRecording: false,
            role: 'editor',
          }]);
          try {
            const state = JSON.parse(e.data.state);
            if (state.bpm) setBpm(state.bpm);
            if (state.projectKey) setProjectKey(state.projectKey);
          } catch { /* ignore parse errors */ }
        } else if (e.data?.type === 'collab-message' && e.data?.sessionId === sessionId) {
          setCollabMessages(prev => [...prev, e.data.message]);
        } else if (e.data?.type === 'cursor-update' && e.data?.sessionId === sessionId) {
          setCollaborators(prev => prev.map(c => c.id === e.data.userId ? { ...c, cursor: e.data.cursor } : c));
        } else if (e.data?.type === 'leave' && e.data?.sessionId === sessionId) {
          setCollaborators(prev => prev.filter(c => c.id !== e.data.userId));
        }
      };
      collabChannelRef.current = bc;
    } catch {
      console.warn('[Imosion] BroadcastChannel not available for collaboration');
    }
  }, [userId, userName, userColor]);

  // Leave collaboration session
  const leaveCollabSession = useCallback(() => {
    if (collabChannelRef.current && collaborationSession) {
      collabChannelRef.current.postMessage({ type: 'leave', sessionId: collaborationSession.id, userId });
      collabChannelRef.current.close();
      collabChannelRef.current = null;
    }
    setCollaborationSession(null);
    setCollaborators([]);
    setCollabMessages([]);
  }, [collaborationSession, userId]);

  // Send collaboration message
  const sendCollabMessage = useCallback((message: string) => {
    if (!message.trim()) return;
    
    const msg = {
      sender: userName,
      message: message.trim(),
      time: new Date()
    };
    setCollabMessages(prev => [...prev, msg]);
    setNewCollabMessage('');
    
    // Broadcast to other collaborators via BroadcastChannel
    if (collabChannelRef.current && collaborationSession) {
      collabChannelRef.current.postMessage({
        type: 'collab-message',
        sessionId: collaborationSession.id,
        message: msg
      });
    }
  }, [userName, collaborationSession]);

  // Update collaborator cursor position
  const updateCollabCursor = useCallback((trackId: string, time: number) => {
    setCollaborators(prev => prev.map(c => 
      c.id === userId ? { ...c, cursor: { trackId, time } } : c
    ));
    // Broadcast cursor update to other collaborators
    if (collabChannelRef.current && collaborationSession) {
      collabChannelRef.current.postMessage({
        type: 'cursor-update',
        sessionId: collaborationSession.id,
        userId,
        cursor: { trackId, time }
      });
    }
  }, [userId, collaborationSession]);

  // Resize handlers (RAF-throttled to avoid per-pixel re-renders)
  useEffect(() => {
    let rafId = 0;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isResizingTrack) {
          setTrackPanelWidth(Math.max(150, Math.min(350, e.clientX)));
        }
        if (isResizingPlugin && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setPluginPanelWidth(Math.max(180, Math.min(400, rect.right - e.clientX)));
        }
      });
    };
    const handleMouseUp = () => { cancelAnimationFrame(rafId); setIsResizingTrack(false); setIsResizingPlugin(false); };
    if (isResizingTrack || isResizingPlugin) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingTrack, isResizingPlugin]);

  // Close menus on click
  useEffect(() => {
    const handleClick = () => { setContextMenu(p => ({ ...p, visible: false })); setShowFileMenu(false); setShowToolsMenu(false); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      switch (e.code) {
        case 'Escape':
          setShowMasteringPanel(false); setShowSavePresetModal(null); setShowExportModal(false);
          setShowCollabModal(false); setShowClipEditor(false); setShowPluginBrowser(false);
          setShowPluginStore(false); setShowTemplates(false); setShowRouting(false);
          setShowSpectrum(false); setShowForge(false);
          setShowFileMenu(false); setShowToolsMenu(false);
          break;
        case 'Space': e.preventDefault(); setIsPlaying(p => !p); break;
        case 'KeyR': if (!ctrl) { e.preventDefault(); isRecording ? stopRecording() : startRecording(); } break;
        case 'KeyS': if (!ctrl) { e.preventDefault(); setIsPlaying(false); setCurrentTime(0); if (isRecording) stopRecording(); } break;
        case 'Home': e.preventDefault(); setCurrentTime(0); break;
        case 'KeyT': if (ctrl) { e.preventDefault(); addTrack(); } break;
        case 'Delete': case 'Backspace': if (selectedTrack && tracks.find(t => t.id === selectedTrack)) deleteTrack(selectedTrack); break;
        case 'KeyM': { const mt = selectedTrack ? tracks.find(t => t.id === selectedTrack) : null; if (mt) updateTrack(selectedTrack!, { muted: !mt.muted }); } break;
        case 'KeyL': setIsLooping(l => !l); break;
        case 'Equal': case 'NumpadAdd': setZoom(z => Math.min(200, z * 1.15)); break;
        case 'Minus': case 'NumpadSubtract': setZoom(z => Math.max(10, z / 1.15)); break;
        case 'KeyP': if (!ctrl) setShowPluginBrowser(p => !p); break;
        case 'KeyZ': if (ctrl) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } break;
        case 'KeyY': if (ctrl) { e.preventDefault(); redo(); } break;
        case 'KeyE': if (ctrl) { e.preventDefault(); setShowExportModal(true); } break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isRecording, selectedTrack, tracks]);

  // Audio init — start eagerly, resume AudioContext on first user gesture
  useEffect(() => {
    let inited = false;
    const init = async () => {
      if (inited) return;
      inited = true;
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
    // Init immediately
    init().catch((e: unknown) => console.warn('[Imosion] init:', e));
    // Browsers suspend AudioContext until user gesture — resume on first interaction
    const resume = () => {
      const ctx = getAudioEngine().getContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [sampleRate, bitDepth]);

  // System-level volume multiplier (from DEX control panel / AppManager)
  const systemGainRef = useRef<number>(
    (() => { try { return Math.min(1, Math.max(0, Number(localStorage.getItem('dex-system-volume') ?? '100') / 100)); } catch { return 1; } })()
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const fraction = (e as CustomEvent<number>).detail;
      if (typeof fraction !== 'number') return;
      const clamped = Math.min(1, Math.max(0, fraction));
      systemGainRef.current = clamped;
      try { getAudioEngine().setMasterVolume(masterSettings.volume * clamped); } catch { /* not yet initialised */ }
    };
    window.addEventListener('dex-system-volume', handler);
    return () => window.removeEventListener('dex-system-volume', handler);
  }, [masterSettings.volume, getAudioEngine]);

  useEffect(() => {
    getAudioEngine().setMasterVolume(masterSettings.volume * systemGainRef.current);
    getAudioEngine().setMasterLimiter(masterSettings.limiterEnabled, masterSettings.limiterCeiling);
  }, [masterSettings, getAudioEngine]);

  // Loudness Meter — real-time AnalyserNode RMS → LUFS-approximate readings
  useEffect(() => {
    if (!showLoudnessMeter) return;
    let rafId = 0;
    let integratedSum = 0;
    let integratedCount = 0;
    const update = () => {
      const data = getAudioEngine().getAnalyserData?.();
      if (data) {
        const td = data.timeDomain;
        // Momentary RMS (current frame ~400ms window)
        let sum = 0;
        for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
        const rms = Math.sqrt(sum / td.length);
        const momentary = rms > 0 ? 20 * Math.log10(rms) - 0.691 : -70;
        // True peak from time domain
        let peak = 0;
        for (let i = 0; i < td.length; i++) { const a = Math.abs(td[i]); if (a > peak) peak = a; }
        const truePeak = peak > 0 ? 20 * Math.log10(peak) : -70;
        // Running integrated average
        integratedSum += rms;
        integratedCount++;
        const avgRms = integratedSum / integratedCount;
        const integrated = avgRms > 0 ? 20 * Math.log10(avgRms) - 0.691 : -70;
        // Short-term approximation (blend toward momentary)
        setLoudnessData(prev => ({
          integrated: Math.max(-70, Math.min(0, integrated)),
          shortTerm: Math.max(-70, Math.min(0, prev.shortTerm * 0.85 + momentary * 0.15)),
          momentary: Math.max(-70, Math.min(0, momentary)),
          truePeak: Math.max(-70, Math.min(6, truePeak)),
          lra: Math.max(0, Math.min(30, Math.abs(momentary - integrated))),
        }));
      }
      rafId = requestAnimationFrame(update);
    };
    const meterBudget = 1000 / getTargetFPS();
    let lastMeterFrame = 0;
    const throttledUpdate = (now: number) => {
      rafId = requestAnimationFrame(throttledUpdate);
      if (now - lastMeterFrame < meterBudget * 0.9) return;
      lastMeterFrame = now;
      update();
    };
    rafId = requestAnimationFrame(throttledUpdate);
    return () => cancelAnimationFrame(rafId);
  }, [showLoudnessMeter]);

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
      // Apply real sidechain ducking routes whenever the plugin chain is
      // (re)built. setSidechainSource(..., null) is a no-op cleanup when the
      // route is disabled or the source index is invalid.
      t.plugins.forEach(p => {
        if (p.type !== 'compressor') return;
        const srcIdx = (p.params.sidechainSource ?? -1) as number;
        const sourceTrack = srcIdx >= 0 && srcIdx < tracks.length ? tracks[srcIdx] : null;
        const sourceId = sourceTrack && sourceTrack.id !== t.id ? sourceTrack.id : null;
        try { getAudioEngine().setSidechainSource(t.id, p.id, sourceId); } catch (e) { console.warn('[DEX]', e); }
      });
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
      
      let lastStateUpdate = 0;
      const STATE_UPDATE_INTERVAL = 16; // ~60fps for smooth scrubber movement
      
      const animate = (timestamp: number) => {
        const deltaMs = timestamp - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timestamp;
        
        // Convert to seconds with high precision
        const deltaSec = deltaMs / 1000;
        
        // Always update the ref at full framerate for accurate audio scheduling
        let next = currentTimeRef.current + deltaSec;
        if (isLooping && next >= duration) { next = 0; }
        else if (next >= duration) { next = duration; }
        currentTimeRef.current = next;

        // Apply automation values at current time (throttled to ~30Hz to reduce main-thread load)
        if (timestamp - lastStateUpdate >= 33 || lastStateUpdate === 0) {
          try {
            const engine = audioEngineRef.current;
            if (engine) {
              for (const auto of trackAutomations) {
                if (!auto.visible || auto.points.length === 0) continue;
                const val = getAutomationValue(auto as any, next);
                const nodes = engine.getTrackInput(auto.trackId);
                if (!nodes) continue;
                const ctx = engine.getContext();
                if (!ctx) continue;
                const trackNodeSet = (engine as any).trackNodes?.get(auto.trackId);
                if (trackNodeSet) {
                  if (auto.parameter === 'volume') {
                    trackNodeSet.gain.gain.setTargetAtTime(val * 1.5, ctx.currentTime, 0.02);
                  } else if (auto.parameter === 'pan') {
                    trackNodeSet.pan.pan.setTargetAtTime(val * 2 - 1, ctx.currentTime, 0.02);
                  }
                }
              }
            }
          } catch (e) { console.warn('[DEX]', e); }
        }

        // Throttle React state updates to reduce re-renders on low-end PCs
        if (timestamp - lastStateUpdate >= STATE_UPDATE_INTERVAL) {
          lastStateUpdate = timestamp;
          if (next >= duration && !isLooping) {
            setIsPlaying(false);
            setCurrentTime(duration);
          } else {
            setCurrentTime(next);
          }
        }
        
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

  // Recording elapsed timer — driven by RAF for smooth display, throttled to 4fps for state
  useEffect(() => {
    if (isRecording) {
      if (!recordStartTime) setRecordStartTime(Date.now());
      let rafId: number;
      let lastUpdate = 0;
      const tick = (now: number) => {
        if (now - lastUpdate >= 250) {
          lastUpdate = now;
          setRecordElapsed(recordStartTime ? (Date.now() - recordStartTime) / 1000 : 0);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    } else {
      setRecordStartTime(null);
      setRecordElapsed(0);
    }
  }, [isRecording, recordStartTime]);

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
      // Re-schedule using Web Audio clock — schedule 8s ahead, re-check every 6s via RAF
      let nextScheduleTime = ctx.currentTime + 4;
      let metRafId: number;
      let lastCheck = 0;
      const metTick = (now: number) => {
        if (now - lastCheck >= 6000) {
          lastCheck = now;
          if (!metronomeSettings.enabled) { metRafId = requestAnimationFrame(metTick); return; }
          if (ctx.currentTime >= nextScheduleTime - 2) {
            const newSources = scheduleMetronome(
              ctx, bpm, { beats: 4, value: 4 },
              nextScheduleTime, 8,
              metronomeAccentRef.current!, metronomeNormalRef.current!,
              metronomeSettings.volume
            );
            metronomeSourcesRef.current.push(...newSources);
            nextScheduleTime += 8;
          }
        }
        metRafId = requestAnimationFrame(metTick);
      };
      metRafId = requestAnimationFrame(metTick);  
      const timer = { cancel: () => cancelAnimationFrame(metRafId) } as any;
      return () => {
        timer.cancel();
        metronomeSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { console.warn('[DEX]', e); } });
        metronomeSourcesRef.current = [];
      };
    }
    return undefined;
  }, [isPlaying, metronomeSettings.enabled, metronomeSettings.volume, bpm]);

  // Real-time audio clip playback scheduling
  // Synthesize a demo AudioBuffer when clip has no real audio file
  const synthesizeDemoBuffer = useCallback((ctx: AudioContext, clipName: string, duration: number): AudioBuffer => {
    const sr = ctx.sampleRate;
    const len = Math.ceil(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const name = clipName.toLowerCase();

    if (name.includes('kick')) {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beatPos = t % 0.5;
        if (beatPos < 0.15) {
          const env = Math.exp(-beatPos * 30);
          const freq = 160 * Math.exp(-beatPos * 20) + 45;
          const v = Math.sin(2 * Math.PI * freq * beatPos) * env * 0.7;
          L[i] = v; R[i] = v;
        }
      }
    } else if (name.includes('snare')) {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const beatPos = (t + 0.25) % 0.5;
        if (beatPos < 0.12) {
          const env = Math.exp(-beatPos * 35);
          const body = Math.sin(2 * Math.PI * 200 * beatPos) * env * 0.35;
          const noise = (Math.random() * 2 - 1) * env * 0.4;
          L[i] = body + noise; R[i] = body + noise;
        }
      }
    } else if (name.includes('bass')) {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const noteSeq = [55, 55, 73.42, 65.41, 55, 55, 82.41, 73.42];
        const noteIdx = Math.floor((t * 2) % noteSeq.length);
        const freq = noteSeq[noteIdx];
        const notePos = (t * 2) % 1;
        const env = notePos < 0.02 ? notePos / 0.02 : Math.exp(-(notePos - 0.02) * 3);
        const v = (Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2) * env * 0.5;
        L[i] = v; R[i] = v;
      }
    } else if (name.includes('guitar') || name.includes('gtr')) {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const chords = [329.63, 392, 440, 523.25];
        const chordIdx = Math.floor((t * 0.5) % chords.length);
        const f = chords[chordIdx];
        const noteT = (t * 2) % 1;
        const env = noteT < 0.01 ? noteT / 0.01 : Math.exp(-noteT * 4);
        const v = (Math.sin(2 * Math.PI * f * t) * 0.3 + Math.sin(2 * Math.PI * f * 2.01 * t) * 0.15 + Math.sin(2 * Math.PI * f * 3 * t) * 0.08) * env * 0.4;
        const pan = name.includes('solo') ? 0 : -0.3;
        L[i] = v * (1 - pan); R[i] = v * (1 + pan);
      }
    } else if (name.includes('vocal') || name.includes('vox') || name.includes('verse') || name.includes('chorus')) {
      const formants = [800, 1200, 2500];
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const f0 = 220 + Math.sin(t * 3) * 15; // vibrato
        const noteT = (t * 1.5) % 1;
        const env = noteT < 0.05 ? noteT / 0.05 : noteT > 0.85 ? (1 - noteT) / 0.15 : 1;
        let v = 0;
        // Glottal pulse train through formants
        const pulse = Math.sin(2 * Math.PI * f0 * t) * 0.3 + Math.sin(2 * Math.PI * f0 * 2 * t) * 0.15;
        for (const fmt of formants) v += Math.sin(2 * Math.PI * fmt * t) * 0.05;
        v = (pulse + v) * env * 0.4;
        L[i] = v; R[i] = v;
      }
    } else {
      // Generic tone
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 0.5);
        const v = Math.sin(2 * Math.PI * 440 * t) * env * 0.3;
        L[i] = v; R[i] = v;
      }
    }
    return buf;
  }, []);

  useEffect(() => {
    if (!isPlaying || !audioEngineRef.current) return;
    const engine = audioEngineRef.current;
    const ctx = engine.getContext();
    if (!ctx) return;

    let cancelled = false;
    const sources: AudioBufferSourceNode[] = [];

    const scheduleAllClips = async () => {
      const playStartTime = ctx.currentTime;
      const cursorTime = currentTimeRef.current; // capture at schedule time

      for (const track of tracks) {
        if (track.muted) continue;
        // Solo logic: if any track is soloed, skip non-soloed tracks
        const anySoloed = tracks.some(t => t.solo);
        if (anySoloed && !track.solo) continue;

        const trackInput = engine.getTrackInput(track.id);
        const destination = trackInput || engine.getMasterLimiter() || ctx.destination;

        for (const clip of track.clips) {
          if (cancelled) return;
          const clipEnd = clip.startTime + clip.duration;
          // Skip clips that ended before cursor
          if (clipEnd <= cursorTime) continue;

          try {
            let buffer = decodedBuffersRef.current.get(clip.id);
            if (!buffer && clip.url) {
              const response = await fetch(clip.url);
              const arrayBuf = await response.arrayBuffer();
              buffer = await ctx.decodeAudioData(arrayBuf);
              cacheDecodedBuffer(decodedBuffersRef.current, clip.id, buffer);
            }
            // Synthesize audio for demo clips without real audio files
            if (!buffer && !clip.url) {
              buffer = synthesizeDemoBuffer(ctx, clip.name, clip.duration);
              cacheDecodedBuffer(decodedBuffersRef.current, clip.id, buffer);
            }
            if (!buffer || cancelled) continue;

            const source = ctx.createBufferSource();
            source.buffer = buffer;

            const clipGain = ctx.createGain();
            clipGain.gain.value = clip.gain;

            // Fades
            if (clip.fadeIn > 0) {
              const fadeBegin = playStartTime + Math.max(0, clip.startTime - cursorTime);
              clipGain.gain.setValueAtTime(0, fadeBegin);
              clipGain.gain.linearRampToValueAtTime(clip.gain, fadeBegin + clip.fadeIn);
            }
            if (clip.fadeOut > 0) {
              const fadeStart = playStartTime + (clip.startTime + clip.duration - clip.fadeOut - cursorTime);
              if (fadeStart > playStartTime) {
                clipGain.gain.setValueAtTime(clip.gain, Math.max(fadeStart, playStartTime));
                clipGain.gain.linearRampToValueAtTime(0, playStartTime + (clipEnd - cursorTime));
              }
            }

            source.connect(clipGain);
            clipGain.connect(destination);

            // Calculate offset and when to start
            if (cursorTime > clip.startTime) {
              // Clip already in progress - start immediately with offset
              const offset = clip.trimStart + (cursorTime - clip.startTime);
              const remaining = clip.duration - (cursorTime - clip.startTime);
              source.start(playStartTime, offset, remaining);
            } else {
              // Clip starts in the future
              const when = playStartTime + (clip.startTime - cursorTime);
              source.start(when, clip.trimStart, clip.duration);
            }

            sources.push(source);
          } catch (err) {
            console.warn('[Imosion] Clip playback error:', clip.name, err);
          }
        }
      }

      // Schedule Piano Roll MIDI notes as synthesized oscillators
      if (pianoRollNotes.length > 0) {
        const midiToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
        const beatsToSec = (beats: number) => beats * 60 / bpm;

        for (const note of pianoRollNotes) {
          const noteStartSec = beatsToSec(note.startTime);
          const noteDurSec = beatsToSec(note.duration);
          const noteEndSec = noteStartSec + noteDurSec;
          if (noteEndSec <= cursorTime) continue;

          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            // Use saw wave for richer tone
            osc.type = 'sawtooth';
            osc.frequency.value = midiToFreq(note.pitch);
            gain.gain.value = (note.velocity / 127) * 0.15;

            // ADSR envelope
            const attackTime = 0.01;
            const releaseTime = 0.05;

            osc.connect(gain);
            gain.connect(engine.getMasterLimiter() || ctx.destination);

            if (cursorTime > noteStartSec) {
              // Note already in progress
              const remaining = noteEndSec - cursorTime;
              osc.start(playStartTime);
              gain.gain.setValueAtTime((note.velocity / 127) * 0.15, playStartTime);
              gain.gain.setTargetAtTime(0, playStartTime + remaining - releaseTime, 0.02);
              osc.stop(playStartTime + remaining);
            } else {
              const when = playStartTime + (noteStartSec - cursorTime);
              gain.gain.setValueAtTime(0, when);
              gain.gain.linearRampToValueAtTime((note.velocity / 127) * 0.15, when + attackTime);
              gain.gain.setTargetAtTime(0, when + noteDurSec - releaseTime, 0.02);
              osc.start(when);
              osc.stop(when + noteDurSec);
            }
          } catch (e) { console.warn('[DEX]', e); }
        }
      }

      playbackSourcesRef.current = sources;
    };

    scheduleAllClips();

    return () => {
      cancelled = true;
      sources.forEach(s => { try { s.stop(); } catch (e) { console.warn('[DEX]', e); } });
      playbackSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { console.warn('[DEX]', e); } });
      playbackSourcesRef.current = [];
    };
  }, [isPlaying, tracks, pianoRollNotes, bpm, synthesizeDemoBuffer]);

  // Recording with selected audio device (earphones, interface, etc.)
  const startRecording = useCallback(async () => {
    try {
      if (!checkPermissionAccess('microphone', 'imosion')) {
        const systemGranted = await (window as any).dex?.voice?.requestMicrophonePermission?.().catch(() => false);
        if (systemGranted) usePermissionStore.getState().setPermission('microphone', true);
        if (!systemGranted || !checkPermissionAccess('microphone', 'imosion')) {
          window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Turn on microphone permission to record in Imosion' } }));
          return;
        }
      }
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
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume().catch(() => { /* ignore resume errors */ });
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = bufferSize * 2;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // High-precision level metering with requestAnimationFrame (tier-aware)
      const dataArray = new Float32Array(analyser.fftSize);
      const levelBudget = 1000 / getTargetFPS();
      let lastLevelFrame = 0;
      const updateLevel = (now: number = 0) => {
        animFrameRef.current = requestAnimationFrame(updateLevel);
        if (now - lastLevelFrame < levelBudget * 0.9) return;
        lastLevelFrame = now;
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
      // Count-in: wait N bars of metronome clicks before starting recording
      if (countInEnabled && countInBars > 0) {
        const barDuration = (60 / bpm) * 4; // seconds per bar (4/4 time)
        const countInDuration = barDuration * countInBars;
        setIsCountingIn(true);
        setCountInRemaining(countInBars);
        // Countdown timer
        let barsLeft = countInBars;
        const countdownInterval = setInterval(() => {
          barsLeft--;
          setCountInRemaining(barsLeft);
          if (barsLeft <= 0) clearInterval(countdownInterval);
        }, barDuration * 1000);
        // Start recording after count-in
        setTimeout(() => {
          clearInterval(countdownInterval);
          setIsCountingIn(false);
          setCountInRemaining(0);
          recorder.start();
          setIsRecording(true);
          setRecordStartTime(Date.now());
          if (!isPlaying) setIsPlaying(true);
        }, countInDuration * 1000);
        // Start playback immediately for metronome
        if (!isPlaying) setIsPlaying(true);
      } else {
        recorder.start();
        setIsRecording(true);
        setRecordStartTime(Date.now());
        if (!isPlaying) setIsPlaying(true);
      }
      // Loop recording: when loop mode is on, create comp lane entry for each pass
      if (loopRecording && isLooping) {
        setCompLanes(prev => [...prev, { id: `take-${Date.now()}`, name: `Take ${prev.length + 1}`, active: prev.length === 0 }]);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        usePermissionStore.getState().setPermission('microphone', false);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Microphone access was denied' } }));
      }
      console.error('Recording error:', err);
    }
  }, [currentTime, isPlaying, tracks, sampleRate, selectedInputDevice, latencyMode, bufferSize, bitDepth, loopRecording, isLooping, countInEnabled, countInBars, bpm]);

  const stopRecording = useCallback(() => {
    if (isCountingIn) { setIsCountingIn(false); setCountInRemaining(0); return; }
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  }, [isRecording, isCountingIn]);

  // Spectrum analyzer rendering (pauses when document hidden to save CPU)
  useEffect(() => {
    if (!showSpectrum) {
      if (spectrumAnimRef.current) cancelAnimationFrame(spectrumAnimRef.current);
      return;
    }
    const handleVisibility = () => {
      if (document.hidden && spectrumAnimRef.current) {
        cancelAnimationFrame(spectrumAnimRef.current);
        spectrumAnimRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
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
        ctx.strokeStyle = 'var(--color-bg-hover)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }
      spectrumAnimRef.current = requestAnimationFrame(draw);
    };
    const specBudget = 1000 / getTargetFPS();
    let lastSpecFrame = 0;
    const throttledDraw = (now: number) => {
      spectrumAnimRef.current = requestAnimationFrame(throttledDraw);
      if (now - lastSpecFrame < specBudget * 0.9) return;
      lastSpecFrame = now;
      draw();
    };
    spectrumAnimRef.current = requestAnimationFrame(throttledDraw);
    return () => {
      if (spectrumAnimRef.current) cancelAnimationFrame(spectrumAnimRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
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
      trim: 0,
      inputSource: ''
    };
    setTracks(prev => [...prev, newTrack]);
    setSelectedTrack(newTrack.id);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'musicTracksCreated', amount: 1 } }));
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
    if (dragState.type !== 'clip') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const time = Math.max(0, (e.clientX - rect.left - dragState.offsetX) / zoom);
    setDropTarget({ trackId, time });
  }, [dragState.type, dragState.offsetX, zoom]);

  const handleTrackDrop = useCallback((e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    e.stopPropagation();
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
    } catch (e) { console.warn('[Imosion] Clip drop failed:', e); }
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

      // Compute real waveform peaks and detect BPM.
      // Fast path: use native IPC bridge when the file has a filesystem path
      // (Electron drag-drop exposes file.path). This avoids decoding the full
      // AudioBuffer in the renderer — critical for 2-hour+ files (~200MB).
      try {
        const filePath = (file as any).path as string | undefined;
        let usedNativePath = false;
        if (filePath) {
          const waveData = await (window as any).dex?.invoke('native:audio-waveform', filePath, 50);
          if (waveData?.peaksPositive?.length > 0) {
            newClip.waveform = Array.from(waveData.peaksPositive) as number[];
            newClip.duration = waveData.durationSecs;
            usedNativePath = true;
          }
        }
        if (!usedNativePath) {
          const resp = await fetch(url);
          const arrBuf = await resp.arrayBuffer();
          const tmpCtx = new AudioContext();
          const decoded = await tmpCtx.decodeAudioData(arrBuf);
          newClip.waveform = AudioEngine.computeWaveformPeaks(decoded, 50);
          newClip.duration = decoded.duration;
          const detectedBPM = detectBPM(decoded);
          if (detectedBPM > 0) {
            newClip.originalBPM = detectedBPM;
            newClip.tempoLocked = true;
            newClip.stretch = bpm / detectedBPM;
          }
          tmpCtx.close();
        }
      } catch (e) { console.warn('[DEX]', e); }

      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
    }
  }, [currentTime, selectedTrack, tracks, bpm]);

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

      // Fast path: use native IPC bridge when a filesystem path is available.
      try {
        const filePath = (file as any).path as string | undefined;
        let usedNativePath = false;
        if (filePath) {
          const waveData = await (window as any).dex?.invoke('native:audio-waveform', filePath, 50);
          if (waveData?.peaksPositive?.length > 0) {
            newClip.waveform = Array.from(waveData.peaksPositive) as number[];
            newClip.duration = waveData.durationSecs;
            usedNativePath = true;
          }
        }
        if (!usedNativePath) {
          const resp = await fetch(url);
          const arrBuf = await resp.arrayBuffer();
          const tmpCtx = new AudioContext();
          const decoded = await tmpCtx.decodeAudioData(arrBuf);
          newClip.waveform = AudioEngine.computeWaveformPeaks(decoded, 50);
          newClip.duration = decoded.duration;
          const detectedBPM = detectBPM(decoded);
          if (detectedBPM > 0) {
            newClip.originalBPM = detectedBPM;
            newClip.tempoLocked = true;
            newClip.stretch = bpm / detectedBPM;
          }
          tmpCtx.close();
        }
      } catch (e) { console.warn('[DEX]', e); }

      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
    }
    setDropTarget(null);
  }, [currentTime, selectedTrack, tracks, bpm]);

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

  // Forge Audio Editor functions
  const openForge = useCallback((trackId: string, clip: AudioClip) => {
    setForgeClip({ trackId, clip });
    setForgeSelection(null);
    setShowForge(true);
  }, []);

  const forgeNormalize = useCallback(() => {
    if (!forgeClip) return;
    const maxPeak = Math.max(...forgeClip.clip.waveform.map(Math.abs), 0.01);
    const normalizedWaveform = forgeClip.clip.waveform.map(s => s / maxPeak);
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: normalizedWaveform, gain: 1.0 });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: normalizedWaveform, gain: 1.0 } } : null);
  }, [forgeClip]);

  const forgeReverse = useCallback(() => {
    if (!forgeClip) return;
    const reversedWaveform = [...forgeClip.clip.waveform].reverse();
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: reversedWaveform, reverse: !forgeClip.clip.reverse });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: reversedWaveform, reverse: !prev.clip.reverse } } : null);
  }, [forgeClip]);

  const forgeSilence = useCallback(() => {
    if (!forgeClip || !forgeSelection) return;
    const wf = [...forgeClip.clip.waveform];
    const startIdx = Math.floor(forgeSelection.start * wf.length);
    const endIdx = Math.floor(forgeSelection.end * wf.length);
    for (let i = startIdx; i < endIdx && i < wf.length; i++) wf[i] = 0;
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: wf });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: wf } } : null);
  }, [forgeClip, forgeSelection]);

  const forgeFadeIn = useCallback(() => {
    if (!forgeClip) return;
    const wf = [...forgeClip.clip.waveform];
    const fadeLen = forgeSelection ? Math.floor(forgeSelection.end * wf.length) - Math.floor(forgeSelection.start * wf.length) : Math.floor(wf.length * 0.1);
    const startIdx = forgeSelection ? Math.floor(forgeSelection.start * wf.length) : 0;
    for (let i = 0; i < fadeLen && (startIdx + i) < wf.length; i++) {
      wf[startIdx + i] *= i / fadeLen;
    }
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: wf });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: wf } } : null);
  }, [forgeClip, forgeSelection]);

  const forgeFadeOut = useCallback(() => {
    if (!forgeClip) return;
    const wf = [...forgeClip.clip.waveform];
    const fadeLen = forgeSelection ? Math.floor(forgeSelection.end * wf.length) - Math.floor(forgeSelection.start * wf.length) : Math.floor(wf.length * 0.1);
    const endIdx = forgeSelection ? Math.floor(forgeSelection.end * wf.length) : wf.length;
    const startIdx = endIdx - fadeLen;
    for (let i = 0; i < fadeLen && (startIdx + i) < wf.length; i++) {
      wf[startIdx + i] *= 1 - (i / fadeLen);
    }
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: wf });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: wf } } : null);
  }, [forgeClip, forgeSelection]);

  const forgeTrim = useCallback(() => {
    if (!forgeClip || !forgeSelection) return;
    const wf = forgeClip.clip.waveform;
    const startIdx = Math.floor(forgeSelection.start * wf.length);
    const endIdx = Math.floor(forgeSelection.end * wf.length);
    const trimmedWf = wf.slice(startIdx, endIdx);
    const newDuration = forgeClip.clip.duration * (endIdx - startIdx) / wf.length;
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: trimmedWf, duration: newDuration });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: trimmedWf, duration: newDuration } } : null);
    setForgeSelection(null);
  }, [forgeClip, forgeSelection]);

  const forgeGain = useCallback((amount: number) => {
    if (!forgeClip) return;
    const wf = forgeClip.clip.waveform.map(s => Math.max(-1, Math.min(1, s * amount)));
    updateClip(forgeClip.trackId, forgeClip.clip.id, { waveform: wf });
    setForgeClip(prev => prev ? { ...prev, clip: { ...prev.clip, waveform: wf } } : null);
  }, [forgeClip]);

  // Clip resize handler
  const handleClipResize = useCallback((e: MouseEvent) => {
    if (!clipResizing) return;
    const dx = (e.clientX - clipResizing.startX) / zoom;
    if (clipResizing.edge === 'right') {
      const newDuration = Math.max(0.1, clipResizing.origDuration + dx);
      updateClip(clipResizing.trackId, clipResizing.clipId, { duration: newDuration });
    } else {
      const newStart = Math.max(0, clipResizing.origStart + dx);
      const startDelta = newStart - clipResizing.origStart;
      const newDuration = Math.max(0.1, clipResizing.origDuration - startDelta);
      updateClip(clipResizing.trackId, clipResizing.clipId, { startTime: newStart, duration: newDuration });
    }
  }, [clipResizing, zoom]);

  const handleClipResizeEnd = useCallback(() => {
    setClipResizing(null);
  }, []);

  useEffect(() => {
    if (clipResizing) {
      window.addEventListener('mousemove', handleClipResize);
      window.addEventListener('mouseup', handleClipResizeEnd);
      return () => { window.removeEventListener('mousemove', handleClipResize); window.removeEventListener('mouseup', handleClipResizeEnd); };
    }
  }, [clipResizing, handleClipResize, handleClipResizeEnd]);

  // Automation point drag handler
  useEffect(() => {
    if (editingAutomation == null || automationDragPoint == null) return;
    const automation = trackAutomations.find(a => a.id === editingAutomation);
    if (!automation) return;
    const handleAutomationDrag = (e: PointerEvent) => {
      const svg = document.querySelector(`svg[data-automation-id="${editingAutomation}"]`);
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const timeVal = Math.max(0, (e.clientX - rect.left) / (60 * zoom));
      const normalizedY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const value = automation.min + normalizedY * (automation.max - automation.min);
      setTrackAutomations(prev => prev.map(a => {
        if (a.id !== editingAutomation) return a;
        const pts = [...a.points];
        pts[automationDragPoint!] = { ...pts[automationDragPoint!], time: timeVal, value };
        return { ...a, points: pts };
      }));
    };
    const handleAutomationDragEnd = () => {
      setEditingAutomation(null);
      setAutomationDragPoint(null);
    };
    window.addEventListener('pointermove', handleAutomationDrag);
    window.addEventListener('pointerup', handleAutomationDragEnd);
    return () => {
      window.removeEventListener('pointermove', handleAutomationDrag);
      window.removeEventListener('pointerup', handleAutomationDragEnd);
    };
  }, [editingAutomation, automationDragPoint, trackAutomations, zoom]);

  const deleteTrack = useCallback((id: string) => {
    if (tracks.length <= 1) return;
    const newTracks = tracks.filter(t => t.id !== id);
    setTracks(newTracks);
    if (selectedTrack === id) setSelectedTrack(newTracks[0]?.id || null);
  }, [selectedTrack, tracks]);

  const updateTrack = useCallback((id: string, updates: Partial<AudioTrack>) => {
    setTracks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      // Apply track group linking
      const group = trackGroups.find(g => g.trackIds.includes(id));
      if (group) {
        const linkedUpdates: Partial<AudioTrack> = {};
        if (group.linkVolume && updates.volume !== undefined) linkedUpdates.volume = updates.volume;
        if (group.linkMute && updates.muted !== undefined) linkedUpdates.muted = updates.muted;
        if (group.linkSolo && updates.solo !== undefined) linkedUpdates.solo = updates.solo;
        if (Object.keys(linkedUpdates).length > 0) {
          return updated.map(t => (t.id !== id && group.trackIds.includes(t.id)) ? { ...t, ...linkedUpdates } : t);
        }
      }
      return updated;
    });
  }, [trackGroups]);

  // Plugin actions - max 10 per track
  const addPluginToTrack = useCallback((trackId: string, pluginType: PluginType) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.plugins.length >= MAX_PLUGINS_PER_TRACK) return;
    const lib = PLUGIN_LIBRARY[pluginType];
    const newPlugin: TrackPlugin = { id: `p${Date.now()}`, type: pluginType, enabled: true, params: Object.fromEntries(lib.params.map(p => [p.key, p.default])) };
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, plugins: [...t.plugins, newPlugin] } : t));
    // Wire real DSP nodes for this plugin
    try { getAudioEngine().processPlugin(trackId, newPlugin); } catch (e) { console.warn('[DEX]', e); }
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
      if (plugin) { try { getAudioEngine().processPlugin(trackId, plugin); } catch (e) { console.warn('[DEX]', e); } }
      return updated;
    });
  }, [getAudioEngine]);

  const togglePlugin = useCallback((trackId: string, pluginId: string) => {
    setTracks(prev => {
      const updated = prev.map(t => t.id === trackId ? { ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p) } : t);
      const track = updated.find(t => t.id === trackId);
      const plugin = track?.plugins.find(p => p.id === pluginId);
      if (plugin) { try { getAudioEngine().processPlugin(trackId, plugin); } catch (e) { console.warn('[DEX]', e); } }
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

  const selectedTrackData = selectedTrack ? tracks.find(t => t.id === selectedTrack) ?? null : null;

  return (
    <div ref={containerRef} {...dropProps} className="imosion-root" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'linear-gradient(180deg, var(--color-bg-base) 0%, #0f1412 100%)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', userSelect: 'none', position: 'relative', transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease', contain: 'layout style', minWidth: 0 } as React.CSSProperties}>
      {dropOverlayStyle && <div style={dropOverlayStyle}>Drop audio files to import</div>}
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        * { box-sizing: border-box; }
        button { 
          font-family: inherit;
          border: none;
          outline: none;
        }
        button:active { transform: scale(0.97); }
        button:disabled { opacity: 0.35; cursor: not-allowed; }
        input[type="range"] { 
          -webkit-appearance: none; 
          background: transparent; 
          cursor: pointer; 
          height: 4px;
        }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 12px; 
          width: 12px; 
          border-radius: 50%; 
          background: #30d158;
          margin-top: -4px;
          border: none;
        }
        input[type="range"]::-webkit-slider-runnable-track { 
          height: 4px; 
          background: var(--color-border);
          border-radius: 2px; 
        }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        .imosion-root { container-type: size; }
        .imosion-root button, .imosion-root select, .imosion-root input { font-family: inherit; }
        .imosion-root button { min-height: 24px; }
        .imosion-root [role="menu"], .imosion-root .frosted-dropdown, .imosion-root .dropdown {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          background: var(--color-bg-elevated, #1c1c1e) !important;
        }
        @container (max-width: 920px) {
          .imosion-root .divider { display: none; }
        }
        .resize-handle { cursor: col-resize; background: var(--color-border-subtle); }
        .resize-handle:hover { background: rgba(48,209,88,0.2); }
        .dropdown-item:hover { background: rgba(48,209,88,0.08); }
        .track-row:hover { background: rgba(48,209,88,0.04) !important; }
        .clip-item { cursor: grab; }
        .clip-item:hover { background: rgba(48,209,88,0.12) !important; }
        .clip-item:active { cursor: grabbing; }
        .clip-dragging { opacity: 0.6; }
        .drop-target { background: rgba(48,209,88,0.1) !important; }
        .modal-overlay { animation: fadeIn 0.15s ease; background: rgba(0,0,0,0.5); }
        select { outline: none; font-family: inherit; }
        select:focus, input:focus { outline: none; }
        .btn { 
          display: flex; 
          align-items: center; 
          justify-content: center;
          gap: 4px;
          padding: 4px 8px;
          background: var(--color-border-subtle);
          border: 1px solid var(--color-bg-hover);
          border-radius: 8px;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 10px;
          font-weight: 500;
        }
        .btn:hover { background: #1e3a28; color: #30d158; border-color: #2a5e3a; }
        .btn-active { background: #1e3a28; color: #30d158; border-color: #30d158; }
        .btn-icon { padding: 4px 6px; }
        .btn-primary { background: #30d158; border-color: #30d158; color: #000; font-weight: 700; border-radius: 8px; }
        .btn-primary:hover { background: #34d85c; }
        .btn-danger { background: #ff453a; border-color: #ff453a; color: #fff; border-radius: 8px; }
        .divider { width: 1px; height: 18px; background: var(--color-border-subtle); margin: 0 4px; }
        .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #30d158; }
        .frosted-dropdown { background: var(--color-bg-elevated, #1C1C1E); border: 1px solid var(--color-border); border-radius: 10px; box-shadow: 0 14px 36px rgba(0,0,0,0.42); }
        .collapsible-header { cursor: pointer; user-select: none; transition: background 0.15s ease; }
        .collapsible-header:hover { background: var(--color-border-subtle); }
        .dropdown-item { transition: background 0.12s ease; }
        .dropdown-item:hover { background: #1e3a28 !important; }
        .dropdown-item:active { background: #244830 !important; }
        .plugin-drag { cursor: grab; user-select: none; }
        .plugin-drag:active { cursor: grabbing; opacity: 0.7; }
        .ctx-item { transition: background 0.1s ease; }
        .ctx-item:hover { background: #1e3a28 !important; }
        .ctx-item:active { background: #244830 !important; }
      `}</style>

      {/* Logic Pro-style Control Bar -- unified single bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', minHeight: '40px', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', flexShrink: 0, gap: '6px', position: 'relative', zIndex: 100, overflow: 'visible' }}>
        {/* Left: Branding + Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <img src={new URL('../../../../appicons/imosion.png', import.meta.url).href} alt="Imosion" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>Imosion</span>
          </div>
          <div style={{ width: '1px', height: '18px', background: 'var(--color-border-subtle)' }} />
          {/* File Menu */}
          <div style={{ position: 'relative', flexShrink: 0 }} onMouseLeave={() => setShowFileMenu(false)}>
            <button aria-label="File menu" onClick={(e) => { e.stopPropagation(); setShowFileMenu(!showFileMenu); }} style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#86868b', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>File {Icon.chevron}</button>
            {showFileMenu && (
              <div className="tooltip frosted-dropdown" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', minWidth: '180px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(360px, calc(100vh - 72px))', zIndex: 'var(--z-modal)', padding: '4px', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { applyTemplate(DEFAULT_TEMPLATES[3]); setShowFileMenu(false); }}>{Icon.plus} New Project</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { saveProjectData(true); setShowFileMenu(false); }}>{Icon.save} Save</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setShowTemplates(true); setShowFileMenu(false); }}>{Icon.template} Templates</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { fileInputRef.current?.click(); setShowFileMenu(false); }}>{Icon.upload} Import Audio</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setShowExportModal(true); setShowFileMenu(false); }}>{Icon.download} Export</div>
                <div style={{ padding: '7px 12px' }}><SendToMenu sourceApp="imosion" assetKind="audio" getAsset={() => {
                  const meta = JSON.stringify({ tracks: tracks.length, bpm, sampleRate: 44100 });
                  return { name: `Imosion Export.wav`, data: meta, mimeType: 'audio/wav', metadata: { bpm, tracks: tracks.length } };
                }} /></div>
                {collab.canShare && (
                  <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--color-accent)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { collab.openShareDialog(); setShowFileMenu(false); }}><DexIcon name="user-plus" size={14} /> Share Project</div>
                )}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: '#86868b', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { closeApp('imosion'); setShowFileMenu(false); }}>{Icon.close} Exit</div>
              </div>
            )}
          </div>
          {/* Tools Menu */}
          <div style={{ position: 'relative', flexShrink: 0 }} onMouseLeave={() => setShowToolsMenu(false)}>
            <button aria-label="Tools menu" onClick={(e) => { e.stopPropagation(); setShowToolsMenu(!showToolsMenu); setShowFileMenu(false); }} style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#86868b', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>Tools {Icon.chevron}</button>
            {showToolsMenu && (
              <div className="tooltip frosted-dropdown" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', minWidth: '200px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(420px, calc(100vh - 72px))', overflow: 'auto', zIndex: 'var(--z-modal)', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>PROCESSING</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showEffectsRack ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowEffectsRack(!showEffectsRack); setShowToolsMenu(false); }}>FX Rack {showEffectsRack && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showSidechainPanel ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowSidechainPanel(!showSidechainPanel); setShowToolsMenu(false); }}>Sidechain {showSidechainPanel && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showNoiseGate ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowNoiseGate(!showNoiseGate); setShowToolsMenu(false); }}>Noise Gate {showNoiseGate && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showDeEsser ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowDeEsser(!showDeEsser); setShowToolsMenu(false); }}>De-Esser {showDeEsser && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showVocalTuner ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowVocalTuner(!showVocalTuner); setShowToolsMenu(false); }}>Vocal Tuner {showVocalTuner && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showBusComp ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowBusComp(!showBusComp); setShowToolsMenu(false); }}>Bus Compressor {showBusComp && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showTapeEmu ? 'var(--color-warning)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowTapeEmu(!showTapeEmu); setShowToolsMenu(false); }}>Tape Emulation {showTapeEmu && <span style={{ fontSize: '9px', color: 'var(--color-warning)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showMidSide ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowMidSide(!showMidSide); setShowToolsMenu(false); }}>Mid/Side {showMidSide && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>METERING</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showLoudnessMeter ? 'var(--color-success)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowLoudnessMeter(!showLoudnessMeter); setShowToolsMenu(false); }}>Loudness (LUFS) {showLoudnessMeter && <span style={{ fontSize: '9px', color: 'var(--color-success)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showLoudPenalty ? 'var(--color-error)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowLoudPenalty(!showLoudPenalty); setShowToolsMenu(false); }}>Loudness Penalty {showLoudPenalty && <span style={{ fontSize: '9px', color: 'var(--color-error)' }}>ON</span>}</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>RECORDING</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: punchMode ? 'var(--color-error)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setPunchMode(!punchMode); setShowToolsMenu(false); }}>Punch Mode {punchMode && <span style={{ fontSize: '9px', color: 'var(--color-error)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: inputMonitoring ? 'var(--color-warning)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setInputMonitoring(!inputMonitoring); setShowToolsMenu(false); }}>Input Monitoring {inputMonitoring && <span style={{ fontSize: '9px', color: 'var(--color-warning)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: loopRecording ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setLoopRecording(!loopRecording); setShowToolsMenu(false); }}>Loop Recording {loopRecording && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: showCompLanes ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowCompLanes(!showCompLanes); setShowToolsMenu(false); }}>Comp Lanes {showCompLanes && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EDITING</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowBatchFade(!showBatchFade); setShowToolsMenu(false); }}>Batch Fade</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTimeStretch(!showTimeStretch); setShowToolsMenu(false); }}>Time Stretch</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowPitchShift(!showPitchShift); setShowToolsMenu(false); }}>Pitch Shift</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowClipGainEnvelope(!showClipGainEnvelope); setShowToolsMenu(false); }}>Clip Gain Envelope</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowClipFx(!showClipFx); setShowToolsMenu(false); }}>Clip Effects</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowWarpMarkers(!showWarpMarkers); setShowToolsMenu(false); }}>Warp Markers</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>VIEW</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowRouting(!showRouting); setShowToolsMenu(false); }}>Routing</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowMarkerRegions(!showMarkerRegions); setShowToolsMenu(false); }}>Marker Regions</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTempoMap(!showTempoMap); setShowToolsMenu(false); }}>Tempo Map</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowGrooveQuant(!showGrooveQuant); setShowToolsMenu(false); }}>Groove Quantize</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTrackColor(!showTrackColor); setShowToolsMenu(false); }}>Track Color</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTrackGroup(!showTrackGroup); setShowToolsMenu(false); }}>Track Groups</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTrackFolderDialog(!showTrackFolderDialog); setShowToolsMenu(false); }}>Track Folders</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowReferenceTrack(!showReferenceTrack); setShowToolsMenu(false); }}>Reference Track</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowCollabMarkers(!showCollabMarkers); setShowToolsMenu(false); }}>Collaboration Notes</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowMidiPanel(!showMidiPanel); setShowToolsMenu(false); }}>MIDI Controller</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTrackNotes(!showTrackNotes); setShowToolsMenu(false); }}>Track Notes</div>
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EXPORT</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowStemExport(!showStemExport); setShowToolsMenu(false); }}>Stem Export</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowSRConvert(!showSRConvert); setShowToolsMenu(false); }}>Sample Rate Convert</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowExportAdvanced(!showExportAdvanced); setShowToolsMenu(false); }}>Advanced Export</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowTrackTemplates(!showTrackTemplates); setShowToolsMenu(false); }}>Track Templates</div>
                <div className="dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }} onClick={() => { setShowChainPreset(!showChainPreset); setShowToolsMenu(false); }}>Plugin Chain Presets</div>
              </div>
            )}
          </div>
          <div style={{ width: '1px', height: '18px', background: 'var(--color-border-subtle)' }} />
          {/* Undo/Redo */}
          <button aria-label="Undo" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'transparent', color: historyIndex <= 0 ? 'var(--color-text-disabled, #48484a)' : 'var(--color-text-secondary)', cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: historyIndex <= 0 ? 0.4 : 1, transition: 'opacity 0.15s ease, color 0.15s ease' }}>{Icon.undo}</button>
          <button aria-label="Redo" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'transparent', color: historyIndex >= history.length - 1 ? 'var(--color-text-disabled, #48484a)' : 'var(--color-text-secondary)', cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: historyIndex >= history.length - 1 ? 0.4 : 1, transition: 'opacity 0.15s ease, color 0.15s ease' }}>{Icon.redo}</button>
        </div>

        {/* Center: Transport + LCD */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
          {/* Transport Controls */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-border-subtle)', borderRadius: '10px', padding: '2px', border: '1px solid var(--color-bg-hover)' }}>
            <button aria-label="Rewind" onClick={() => setCurrentTime(0)} title="Rewind" style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#86868b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.rewind}</button>
            <button aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={() => { if (isRecording) stopRecording(); setIsPlaying(!isPlaying); }} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'} style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: isPlaying ? 'var(--color-success)' : 'transparent', color: isPlaying ? '#000' : 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isPlaying ? Icon.pause : Icon.play}</button>
            <button aria-label="Stop" onClick={() => { setIsPlaying(false); setCurrentTime(0); if (isRecording) stopRecording(); }} title="Stop" style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#86868b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.stop}</button>
            <button aria-label={isRecording ? 'Stop Recording' : 'Record (R)'} onClick={isRecording ? stopRecording : startRecording} title={isRecording ? 'Stop Recording' : 'Record (R)'} style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: isRecording ? 'var(--color-error)' : 'transparent', color: isRecording ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.record}</button>
            <div style={{ width: '1px', height: '16px', background: 'var(--color-bg-hover)' }} />
            <button aria-label="Loop" onClick={() => setIsLooping(!isLooping)} title="Loop (L)" style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: isLooping ? '#0d2847' : 'transparent', color: isLooping ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.loop}</button>
            <button aria-label="Metronome" onClick={() => setMetronomeSettings(s => ({ ...s, enabled: !s.enabled }))} title="Metronome" style={{ width: '28px', height: '26px', borderRadius: '6px', border: 'none', background: metronomeSettings.enabled ? '#2a1840' : 'transparent', color: metronomeSettings.enabled ? '#bf5af2' : 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L6 22h12L12 2z"/><line x1="8" y1="14" x2="16" y2="14"/><circle cx="12" cy="10" r="1.5"/></svg></button>
          </div>

          {/* Recording Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Count-in toggle */}
            <button aria-label="Count-in" onClick={() => setCountInEnabled(c => !c)} title={`Count-in: ${countInEnabled ? countInBars + ' bars' : 'Off'}`} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid', borderColor: countInEnabled ? '#3d2060' : 'var(--color-bg-hover)', background: countInEnabled ? '#2a1840' : 'var(--color-bg-elevated)', color: countInEnabled ? '#bf5af2' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {countInBars}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            {/* Punch set buttons */}
            {punchMode && (
              <>
                <button aria-label="Set punch in" onClick={() => setPunchInPoint(currentTime)} title="Set Punch In at playhead" style={{ padding: '4px 7px', borderRadius: '8px', border: '1px solid #4a2020', background: punchInPoint !== null ? '#3a1818' : 'var(--color-bg-elevated)', color: 'var(--color-error)', cursor: 'pointer', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>{Icon.punchIn} IN</button>
                <button aria-label="Set punch out" onClick={() => setPunchOutPoint(currentTime)} title="Set Punch Out at playhead" style={{ padding: '4px 7px', borderRadius: '8px', border: '1px solid #4a2020', background: punchOutPoint !== null ? '#3a1818' : 'var(--color-bg-elevated)', color: 'var(--color-error)', cursor: 'pointer', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>{Icon.punchOut} OUT</button>
                <button aria-label="Clear punch" onClick={() => { setPunchInPoint(null); setPunchOutPoint(null); }} title="Clear punch region" style={{ padding: '4px 6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}>{Icon.eraser} CLR</button>
              </>
            )}
            {/* Armed tracks count */}
            {tracks.some(t => t.armed) && (
              <span style={{ padding: '4px 8px', borderRadius: '8px', background: '#3a1818', border: '1px solid #4a2020', color: 'var(--color-error)', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
                {tracks.filter(t => t.armed).length} RDY
              </span>
            )}
            {/* Count-in countdown */}
            {isCountingIn && (
              <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#2a1840', color: '#bf5af2', fontSize: '12px', fontWeight: 700, fontFamily: '"SF Mono", monospace', animation: 'pulse 0.5s ease-in-out infinite' }}>{countInRemaining}</span>
            )}
            {/* Recording elapsed timer */}
            {isRecording && (
              <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#3a1818', border: '1px solid #4a2020', color: 'var(--color-error)', fontSize: '10px', fontWeight: 600, fontFamily: '"SF Mono", monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-error)', animation: 'pulse 1s ease-in-out infinite' }} />
                {Math.floor(recordElapsed / 60).toString().padStart(2, '0')}:{Math.floor(recordElapsed % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          {/* LCD Display */}
          <div data-testid="imosion-transport" style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-base)', borderRadius: '10px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <div onClick={() => setTimeDisplayMode(m => m === 'time' ? 'bars' : 'time')} title="Click to toggle" style={{ padding: '4px 14px', cursor: 'pointer', borderRight: '1px solid var(--color-bg-hover)', minWidth: '110px', textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px', marginBottom: '1px' }}>{timeDisplayMode === 'time' ? 'TIME' : 'BARS'}</div>
              <div style={{ fontFamily: '"SF Mono", Consolas, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '0.5px' }}>{formatTime(currentTime)}</div>
            </div>
            {!beginnerMode && <>
            <div style={{ padding: '4px 10px', borderRight: '1px solid var(--color-bg-hover)', textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px', marginBottom: '1px' }}>BPM</div>
              <input data-testid="bpm-display" type="number" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))} style={{ width: '42px', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: 600, textAlign: 'center', fontFamily: '"SF Mono", monospace' }} />
            </div>
            <div style={{ padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px', marginBottom: '1px' }}>KEY</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <select value={projectKey.root} onChange={(e) => setProjectKey(k => ({ ...k, root: e.target.value as MusicalKey }))} style={{ padding: '0 2px', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                  {MUSICAL_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
                </select>
                <select value={projectKey.scale} onChange={(e) => setProjectKey(k => ({ ...k, scale: e.target.value as MusicalScale }))} style={{ padding: '0 2px', background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer' }}>
                  {MUSICAL_SCALES.map(scale => <option key={scale.value} value={scale.value}>{scale.label}</option>)}
                </select>
              </div>
            </div>
            </>}
          </div>
        </div>

        {/* Right: View + Volume + Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* View Mode Toggle - GarageBand segmented control */}
          <div style={{ display: 'flex', background: 'var(--color-bg-hover)', borderRadius: '10px', padding: '2px', border: '1px solid var(--color-border-subtle)' }}>
            <button aria-label="Arrange" onClick={() => setViewMode('arrange')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'arrange' ? '#1e3a28' : 'transparent', color: viewMode === 'arrange' ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: viewMode === 'arrange' ? 'inset 0 1px 0 #2a5e3a' : 'none' }}>{Icon.arrange} Arrange</button>
            <button data-testid="imosion-mixer" aria-label="Mixer" onClick={() => setViewMode('mixer')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'mixer' ? '#1e3a28' : 'transparent', color: viewMode === 'mixer' ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: viewMode === 'mixer' ? 'inset 0 1px 0 #2a5e3a' : 'none' }}>{Icon.mixerView} Mixer</button>
            <button aria-label="Beat Maker" onClick={() => setViewMode('beatmaker')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'beatmaker' ? '#1e3a28' : 'transparent', color: viewMode === 'beatmaker' ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: viewMode === 'beatmaker' ? 'inset 0 1px 0 #2a5e3a' : 'none' }}>{Icon.beats} Beats</button>
            <button aria-label="Piano Roll" onClick={() => setViewMode('pianoroll')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'pianoroll' ? '#2a1840' : 'transparent', color: viewMode === 'pianoroll' ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: viewMode === 'pianoroll' ? 'inset 0 1px 0 #3d2060' : 'none' }}>{Icon.pianoRoll} Piano Roll</button>
          </div>
          <div style={{ width: '1px', height: '18px', background: 'var(--color-border-subtle)' }} />
          {/* Master Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
            <input type="range" min="0" max="1" step="0.01" value={masterSettings.volume} onChange={(e) => setMasterSettings(s => ({ ...s, volume: parseFloat(e.target.value) }))} style={{ width: '56px' }} />
            <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: '"SF Mono", monospace', minWidth: '24px', textAlign: 'right' }}>{Math.round(masterSettings.volume * 100)}%</span>
          </div>
          <div style={{ width: '1px', height: '18px', background: 'var(--color-border-subtle)' }} />
          {/* Export */}
          <button aria-label="Export" onClick={() => setShowExportModal(true)} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 600, background: 'var(--color-border-subtle)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 0.15s ease' }}>{Icon.export} Export</button>
          {/* Panels Dropdown - grouped toggle buttons */}
          <div style={{ position: 'relative' }} onMouseLeave={() => setShowPanelsMenu(false)}>
            <button aria-label="Panels menu" onClick={(e) => { e.stopPropagation(); setShowPanelsMenu(!showPanelsMenu); }} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 600, background: showPanelsMenu ? '#1e3a28' : 'var(--color-border-subtle)', border: '1px solid', borderColor: showPanelsMenu ? '#2a5e3a' : 'var(--color-bg-hover)', borderRadius: '8px', color: showPanelsMenu ? 'var(--color-success)' : '#86868b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s ease' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
              Panels {Icon.chevron}
            </button>
            {showPanelsMenu && (
              <div className="frosted-dropdown" style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', minWidth: '180px', zIndex: 'var(--z-modal)', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '6px 12px 4px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>VIEW</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: showAutomation ? 'var(--color-warning)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowAutomation(a => !a); setShowPanelsMenu(false); }}>Automation{showAutomation && <span style={{ fontSize: '9px', color: 'var(--color-warning)' }}>ON</span>}</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: showInstrumentBrowser ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowInstrumentBrowser(b => !b); setShowPanelsMenu(false); }}>Instruments{showInstrumentBrowser && <span style={{ fontSize: '9px', color: '#bf5af2' }}>ON</span>}</div>
                {selectedInstrument && <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: showInstrumentEditor ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowInstrumentEditor(b => !b); setShowPanelsMenu(false); }}>Edit Instrument{showInstrumentEditor && <span style={{ fontSize: '9px', color: '#bf5af2' }}>ON</span>}</div>}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '6px 12px 4px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>HELP</div>
                <div className="dropdown-item" style={{ padding: '7px 12px', fontSize: '11px', color: showHelp ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { setShowHelp(h => !h); setShowPanelsMenu(false); }}>Quick Help{showHelp && <span style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ON</span>}</div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Mic Level - compact silent indicator (when armed) */}
      {(isRecording || tracks.some(t => t.armed)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 20px', background: isRecording ? '#1a0c0c' : 'transparent', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isRecording ? 'var(--color-error)' : '#3a3a3c', fontSize: '9px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {isRecording && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-error)', animation: 'pulse 1s ease-in-out infinite' }} />}
            {isRecording ? 'REC' : 'RDY'}
          </span>
          <div style={{ flex: 1, height: '3px', background: 'var(--color-border-subtle)', borderRadius: '2px', overflow: 'hidden', maxWidth: '140px' }}>
            <div style={{ height: '100%', width: `${inputLevel * 100}%`, background: inputLevel > 0.85 ? 'var(--color-error)' : inputLevel > 0.6 ? 'var(--color-warning)' : '#3a3a3c', transition: 'width 0.05s', borderRadius: '2px' }} />
          </div>
          <span style={{ fontSize: '9px', color: '#3a3a3c', fontFamily: '"SF Mono", monospace', minWidth: '35px' }}>{inputLevel > 0 ? `${Math.round((inputLevel - 1) * 60)}dB` : '-dB'}</span>
        </div>
      )}

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Track Panel - GarageBand Style */}
        <div data-testid="imosion-tracks" style={{ width: trackPanelWidth, minWidth: 150, flexShrink: 0, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1e 100%)', borderRight: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              Tracks
            </span>
            <button aria-label="Add new track" onClick={addTrack} className="btn btn-icon" title="Add new track" style={{ width: '20px', height: '20px', padding: '0' }}>{Icon.plus}</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {tracks.map((track, trackIdx) => {
              const isSelected = selectedTrack === track.id;
              return (
              <div key={track.id} onClick={() => setSelectedTrack(track.id)} style={{ padding: '0', marginBottom: '1px', background: isSelected ? `linear-gradient(90deg, ${track.color}15, ${track.color}08)` : trackIdx % 2 === 0 ? 'var(--color-border-subtle)' : 'transparent', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${isSelected ? track.color + '25' : 'transparent'}`, overflow: 'hidden', transition: 'all 0.15s ease' }}>
                {/* Track header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px' }}>
                  {/* GarageBand-style instrument icon circle */}
                  <div 
                    role="button" tabIndex={0} aria-label={`Change color for ${track.name}`}
                    onClick={(e) => { e.stopPropagation(); setColorPickerTrackId(colorPickerTrackId === track.id ? null : track.id); }} 
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setColorPickerTrackId(colorPickerTrackId === track.id ? null : track.id); } }}
                    title="Click to change color"
                    style={{ width: '28px', height: '28px', borderRadius: '50%', background: `linear-gradient(135deg, ${track.color}40, ${track.color}20)`, cursor: 'pointer', border: `1.5px solid ${track.color}60`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: isSelected ? `0 0 8px ${track.color}30` : 'none' }} 
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={track.color} strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    {colorPickerTrackId === track.id && (
                      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: '32px', top: '-4px', zIndex: 'var(--z-modal)', background: 'var(--color-bg-surface-solid, #1E1E22)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', boxShadow: 'var(--pg-shadow-popover)' }}>
                        {COLORS.map(c => (
                          <div key={c} role="button" tabIndex={0} aria-label={`Color ${c}`} onClick={() => { updateTrack(track.id, { color: c }); setColorPickerTrackId(null); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateTrack(track.id, { color: c }); setColorPickerTrackId(null); } }} style={{ width: '18px', height: '18px', borderRadius: '50%', background: c, cursor: 'pointer', border: track.color === c ? '2px solid #fff' : '1px solid var(--color-border)', transition: 'transform 0.1s', transform: track.color === c ? 'scale(1.15)' : 'scale(1)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: isSelected ? '#f0f0f2' : '#c8c8cc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                    <div style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: 3 }}>
                      {!beginnerMode && track.plugins.length > 0 && <span style={{ background: 'var(--color-bg-hover)', padding: '0 3px', borderRadius: 3 }}>{track.plugins.length} FX</span>}
                      {track.output !== 'master' && <span style={{ color: track.color + '80' }}>→ {buses.find(b => b.id === track.output)?.name || 'Bus'}</span>}
                      <span style={{ fontFamily: '"SF Mono", monospace' }}>{track.volume > 1 ? '+' : ''}{((track.volume - 1) * 60).toFixed(0)}dB</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} title="Mute" style={{ width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: track.muted ? 'var(--color-accent)' : 'var(--color-bg-hover)', color: track.muted ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '7px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>M</button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} title="Solo" style={{ width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: track.solo ? 'var(--color-warning)' : 'var(--color-bg-hover)', color: track.solo ? '#000' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '7px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>S</button>
                    <button aria-label="Record Arm" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }); }} title="Record Arm" style={{ width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: track.armed ? 'var(--color-error)' : 'var(--color-bg-hover)', color: track.armed ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>●</button>
                  </div>
                </div>
                {/* Volume slider - GarageBand inline style */}
                {isSelected && (
                  <div style={{ padding: '0 8px 6px 42px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>
                    <input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })} onClick={(e) => e.stopPropagation()} style={{ flex: 1, height: 3, accentColor: track.color }} />
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </div>
                )}
                {/* Per-track input source - shown when armed */}
                {track.armed && audioDevices.filter(d => d.kind === 'audioinput').length > 1 && (
                  <div style={{ padding: '0 8px 6px 42px' }}>
                    <select
                      value={track.inputSource || ''}
                      onChange={(e) => { e.stopPropagation(); updateTrack(track.id, { inputSource: e.target.value }); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100%', padding: '3px 6px', fontSize: '8px', background: 'var(--color-border-subtle)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                    >
                      <option value="">Default Input</option>
                      {audioDevices.filter(d => d.kind === 'audioinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Input ${d.deviceId.slice(0, 8)}`}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              );
            })}
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
              <button aria-label="Import" onClick={() => fileInputRef.current?.click()} className="btn" style={{ color: 'var(--color-success)' }}>{Icon.upload} Import</button>
              <button aria-label="Export" onClick={() => setShowExportModal(true)} className="btn" style={{ color: 'var(--color-accent)' }}>{Icon.download} Export</button>
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

          {/* Ruler - FL Studio adaptive bar/beat ruler */}
          {(() => {
            const beatDur = 60 / bpm;
            const barDur = beatDur * 4;
            const barPx = barDur * zoom;
            const beatPx = beatDur * zoom;
            const totalBars = Math.ceil(duration / barDur);
            // Adaptive: skip labels if too dense
            const labelSkip = barPx < 40 ? Math.ceil(40 / barPx) : 1;
            const showBeatTicks = beatPx >= 12;
            return (
          <div style={{ height: '24px', background: '#0e0e11', borderBottom: '1px solid var(--color-bg-hover)', position: 'relative', overflowX: 'hidden', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: `${duration * zoom}px`, minWidth: '100%', height: '100%' }}>
              {Array.from({ length: totalBars + 1 }).map((_, i) => {
                const x = i * barPx;
                const showLabel = i % labelSkip === 0;
                return (
                  <React.Fragment key={`br-${i}`}>
                    <div style={{ position: 'absolute', left: `${x}px`, bottom: 0, width: '1px', height: showLabel ? '10px' : '6px', background: showLabel ? 'var(--color-text-tertiary)' : 'var(--color-border)' }} />
                    {showLabel && <div style={{ position: 'absolute', left: `${x + 4}px`, top: '3px', fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: '"SF Mono", Consolas, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{i + 1}</div>}
                    {showBeatTicks && [1,2,3].map(b => (
                      <div key={`bt-${i}-${b}`} style={{ position: 'absolute', left: `${x + b * beatPx}px`, bottom: 0, width: '1px', height: '4px', background: 'var(--color-border-subtle)' }} />
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
            {keyChanges.map((kc, i) => (
              <div key={`key-${i}`} onClick={() => removeKeyChange(kc.time)} title={`${kc.key.root} ${kc.key.scale}`} style={{ position: 'absolute', left: `${kc.time * zoom}px`, top: '2px', padding: '1px 6px', background: 'rgba(255,149,0,0.15)', borderRadius: '3px', fontSize: '8px', color: '#ff9500', cursor: 'pointer', fontWeight: 600 }}>{kc.key.root}{kc.key.scale === 'minor' ? 'm' : ''}</div>
            ))}
            {bpmChanges.map((bc, i) => (
              <div key={`bpm-${i}`} onClick={() => removeBpmChange(bc.time)} title={`${bc.bpm} BPM`} style={{ position: 'absolute', left: `${bc.time * zoom}px`, top: '2px', marginLeft: '40px', padding: '1px 6px', background: 'rgba(10,132,255,0.12)', borderRadius: '3px', fontSize: '8px', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}>{bc.bpm}</div>
            ))}
            {/* Punch-in/out region overlay */}
            {punchMode && punchInPoint !== null && punchOutPoint !== null && (
              <div style={{ position: 'absolute', left: `${punchInPoint * zoom}px`, width: `${(punchOutPoint - punchInPoint) * zoom}px`, top: 0, bottom: 0, background: 'rgba(255,69,58,0.08)', borderLeft: '2px solid rgba(255,69,58,0.6)', borderRight: '2px solid rgba(255,69,58,0.6)', pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '7px', color: 'var(--color-error)', fontWeight: 700, letterSpacing: '0.5px' }}>PUNCH</span>
              </div>
            )}
            {punchMode && punchInPoint !== null && punchOutPoint === null && (
              <div style={{ position: 'absolute', left: `${punchInPoint * zoom}px`, top: 0, bottom: 0, width: '2px', background: 'var(--color-error)' }}>
                <span style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '7px', color: 'var(--color-error)', fontWeight: 700, whiteSpace: 'nowrap' }}>IN</span>
              </div>
            )}
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
            );
          })()}

          {/* Tracks Area - FL Studio grid with file drop support and mouse wheel zoom */}
          {(() => {
            // FL Studio adaptive beat grid
            const beatDur = 60 / bpm; // seconds per beat
            const barDur = beatDur * 4; // seconds per bar (4/4 time)
            const beatPx = beatDur * zoom;
            const barPx = barDur * zoom;
            const totalBars = Math.ceil(duration / barDur);
            const totalWidth = duration * zoom;
            // Adaptive: skip lines if too dense
            const showBeats = beatPx >= 8;
            const showSubBeats = beatPx >= 32;
            const showBars = barPx >= 4;
            // Skip bars if too dense
            const barSkip = barPx < 20 ? Math.ceil(20 / barPx) : 1;
            return (
          <div 
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', background: '#08080a' }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
                const factor = 1 + Math.abs(delta) * 0.002;
                setZoom(z => delta < 0 ? Math.min(200, z * factor) : Math.max(10, z / factor));
              }
            }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={(e) => { if (e.dataTransfer.files.length > 0) handleFileDrop(e); }}
          >
            {/* Beat grid overlay (drawn behind clips) */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${totalWidth}px`, minWidth: '100%', pointerEvents: 'none', zIndex: 0 }}>
              {/* Bar lines (strong) */}
              {showBars && Array.from({ length: totalBars + 1 }).map((_, i) => {
                if (barSkip > 1 && i % barSkip !== 0) return null;
                return <div key={`bar-${i}`} style={{ position: 'absolute', left: `${i * barPx}px`, top: 0, bottom: 0, width: '1px', background: i === 0 ? 'var(--color-border)' : 'var(--color-bg-hover)' }} />;
              })}
              {/* Beat lines (medium) */}
              {showBeats && Array.from({ length: Math.ceil(duration / beatDur) + 1 }).map((_, i) => {
                const isBeat = i % 4 === 0;
                if (isBeat) return null; // already drawn as bar line
                return <div key={`beat-${i}`} style={{ position: 'absolute', left: `${i * beatPx}px`, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.025)' }} />;
              })}
              {/* Sub-beat lines (16th notes, subtle) */}
              {showSubBeats && Array.from({ length: Math.min(2000, Math.ceil(duration / (beatDur / 4)) + 1) }).map((_, i) => {
                if (i % 4 === 0) return null; // already drawn
                const subPx = (beatDur / 4) * zoom;
                return <div key={`sub-${i}`} style={{ position: 'absolute', left: `${i * subPx}px`, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.012)' }} />;
              })}
            </div>


            {tracks.map((track, trackIdx) => (
              <div 
                key={track.id} 
                className={`track-row ${dropTarget?.trackId === track.id ? 'drop-target' : ''}`}
                onClick={() => setSelectedTrack(track.id)} 
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ visible: true, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 200), trackId: track.id, clipId: null, busId: null }); }} 
                onDragOver={(e) => handleTrackDragOver(e, track.id)}
                onDrop={(e) => handleTrackDrop(e, track.id)}
                onDragLeave={() => setDropTarget(null)}
                style={{ height: '62px', borderBottom: '1px solid var(--color-border-subtle)', background: selectedTrack === track.id ? 'rgba(10,132,255,0.04)' : trackIdx % 2 === 0 ? 'transparent' : 'var(--color-border-subtle)', position: 'relative', zIndex: 2 }}
              >
                {/* Drop indicator */}
                {dropTarget?.trackId === track.id && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${dropTarget.time * zoom}px`, width: '2px', background: 'var(--color-accent)', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 12px rgba(10,132,255,0.6)' }} />
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
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 200), trackId: track.id, clipId: clip.id, busId: null }); }} 
                    style={{ position: 'absolute', top: '6px', bottom: '6px', left: `${clip.startTime * zoom}px`, width: `${Math.max(clip.duration * zoom, 30)}px`, background: `linear-gradient(180deg, ${track.color}30, ${track.color}18)`, borderRadius: '6px', cursor: clipEdit.mode === 'split' ? 'crosshair' : clipResizing?.clipId === clip.id ? 'ew-resize' : 'grab', border: `1px solid ${track.color}50`, overflow: 'hidden', boxShadow: dragState.sourceId === clip.id ? `0 4px 16px rgba(0,0,0,0.5), 0 0 0 2px ${track.color}` : '0 2px 4px rgba(0,0,0,0.2)', opacity: dragState.sourceId === clip.id ? 0.5 : 1, transition: 'opacity 0.15s, box-shadow 0.15s' }}
                  >
                    {/* Left resize handle */}
                    <div 
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setClipResizing({ clipId: clip.id, trackId: track.id, edge: 'left', startX: e.clientX, origStart: clip.startTime, origDuration: clip.duration }); }}
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', background: 'transparent', zIndex: 10 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `${track.color}60`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    />
                    {/* Right resize handle */}
                    <div 
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setClipResizing({ clipId: clip.id, trackId: track.id, edge: 'right', startX: e.clientX, origStart: clip.startTime, origDuration: clip.duration }); }}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', background: 'transparent', zIndex: 10 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `${track.color}60`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    />
                    {/* Fade In indicator */}
                    {clip.fadeIn > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(clip.fadeIn / clip.duration * 100, 50)}%`, background: `linear-gradient(to right, ${track.color}70, transparent)`, pointerEvents: 'none' }} />}
                    {/* Fade Out indicator */}
                    {clip.fadeOut > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min(clip.fadeOut / clip.duration * 100, 50)}%`, background: `linear-gradient(to left, ${track.color}70, transparent)`, pointerEvents: 'none' }} />}
                    <div style={{ padding: '3px 6px', fontSize: '9px', fontWeight: 600, background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.2))', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {clip.tempoLocked && <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center' }} title="Tempo Locked">{Icon.link}</span>}
                      {clip.reverse && <span style={{ color: 'var(--color-error)', fontWeight: 700 }}>R</span>}
                      {clip.pitch !== 0 && <span style={{ color: 'var(--color-warning)' }}>{clip.pitch > 0 ? '+' : ''}{clip.pitch}</span>}
                      {clip.stretch !== 1 && <span style={{ color: 'var(--color-success)' }}>{clip.stretch.toFixed(1)}x</span>}
                      <span style={{ color: 'var(--color-text-primary)' }}>{clip.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1px 2px', flex: 1, overflow: 'hidden' }}>
                      <canvas
                        ref={(el) => {
                          if (el && clip.waveform.length > 0) {
                            const ctx = el.getContext('2d');
                            if (!ctx) return;
                            const w = el.parentElement?.clientWidth || 100;
                            const h = el.parentElement?.clientHeight || 30;
                            el.width = w * 2; el.height = h * 2;
                            ctx.scale(2, 2);
                            const mid = h / 2;
                            ctx.clearRect(0, 0, w, h);
                            const grad = ctx.createLinearGradient(0, 0, 0, h);
                            grad.addColorStop(0, track.color + '60');
                            grad.addColorStop(0.5, track.color + '30');
                            grad.addColorStop(1, track.color + '60');
                            ctx.fillStyle = grad;
                            ctx.beginPath();
                            ctx.moveTo(0, mid);
                            const peaks = clip.waveform;
                            for (let i = 0; i < peaks.length; i++) {
                              ctx.lineTo((i / peaks.length) * w, mid - peaks[i] * mid * 0.9);
                            }
                            for (let i = peaks.length - 1; i >= 0; i--) {
                              ctx.lineTo((i / peaks.length) * w, mid + peaks[i] * mid * 0.9);
                            }
                            ctx.closePath();
                            ctx.fill();
                            ctx.strokeStyle = track.color;
                            ctx.lineWidth = 1;
                            ctx.lineJoin = 'round';
                            ctx.beginPath();
                            ctx.moveTo(0, mid);
                            for (let i = 0; i < peaks.length; i++) {
                              ctx.lineTo((i / peaks.length) * w, mid - peaks[i] * mid * 0.9);
                            }
                            ctx.stroke();
                            ctx.strokeStyle = `${track.color}20`;
                            ctx.lineWidth = 0.5;
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
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${currentTime * zoom}px`, width: '2px', background: 'var(--color-error)', zIndex: 100, pointerEvents: 'none' }} />
          </div>
          );
          })()}
        </div>

        {/* Full Mixer View */}
        {viewMode === 'mixer' && (
          <div className="view-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
            {/* Mixer Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="section-title">Mixer</span>
                <span style={{ fontSize: '9px', padding: '2px 6px', background: '#0d2847', borderRadius: '3px', color: 'var(--color-accent)' }}>{tracks.length} Channels</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                <button aria-label="Track" onClick={addTrack} style={{ padding: '4px 10px', background: '#0d2847', border: '1px solid #153d6b', borderRadius: '4px', color: 'var(--color-accent)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.plus} Track</button>
                <button aria-label="Aux" onClick={() => addBus('fx')} style={{ padding: '4px 10px', background: '#1e3a28', border: '1px solid #2a5e3a', borderRadius: '4px', color: 'var(--color-success)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.bus} Aux</button>
                <span style={{ color: 'var(--color-border-default)' }}>|</span>
                <span>{tracks.length} Tracks</span>
                <span style={{ color: 'var(--color-border-default)' }}>|</span>
                <span>{buses.length} Buses</span>
              </div>
            </div>

            {/* Channel Strips Container */}
            <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'auto', padding: '12px', position: 'relative', scrollbarWidth: 'thin' }}>
              {/* Sidechain Routing Lines SVG Overlay */}
              {tracks.some(t => t.plugins.some(p => p.type === 'compressor' && (p.params.sidechainSource ?? -1) >= 0)) && (
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
                  {tracks.map((track, destIdx) =>
                    track.plugins.filter(p => p.type === 'compressor' && (p.params.sidechainSource ?? -1) >= 0).map(p => {
                      const srcIdx = p.params.sidechainSource as number;
                      if (srcIdx < 0 || srcIdx >= tracks.length) return null;
                      const srcX = 12 + srcIdx * 102 + 47;
                      const destX = 12 + destIdx * 102 + 47;
                      const y1 = 20;
                      const y2 = 40;
                      const midY = (y1 + y2) / 2 - 10;
                      return (
                        <g key={`sc-${track.id}-${p.id}`}>
                          <path d={`M ${srcX} ${y1} C ${srcX} ${midY}, ${destX} ${midY}, ${destX} ${y2}`} fill="none" stroke="#bf5af2" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                          <circle cx={srcX} cy={y1} r="3" fill="#bf5af2" opacity="0.8" />
                          <circle cx={destX} cy={y2} r="3" fill="#bf5af2" opacity="0.8" />
                        </g>
                      );
                    })
                  )}
                </svg>
              )}

              {/* Track Channel Strips */}
              {tracks.map((track, idx) => (
                <div key={track.id} onClick={() => setSelectedTrack(track.id)} style={{ width: '108px', minWidth: '108px', background: selectedTrack === track.id ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)', borderRadius: '10px', marginRight: '8px', display: 'flex', flexDirection: 'column', border: `1px solid ${selectedTrack === track.id ? track.color + '40' : 'var(--color-border-subtle)'}`, overflow: 'hidden', boxShadow: selectedTrack === track.id ? `0 0 20px ${track.color}15` : '0 2px 8px rgba(0,0,0,0.2)' }}>
                  {/* Insert Number + Track Name */}
                  <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-subtle)', background: `linear-gradient(180deg, ${track.color}25, ${track.color}10)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '8px', fontWeight: 700, color: track.color, opacity: 0.6, minWidth: '16px' }}>#{idx + 1}</span>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{track.name}</div>
                    </div>
                  </div>

                  {/* Effects Chain Slots (up to 10) */}
                  <div
                    onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-imosion-plugin')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.style.background = 'rgba(48,209,88,0.1)'; } }}
                    onDragLeave={(e) => { e.currentTarget.style.background = ''; }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.style.background = ''; const pluginType = e.dataTransfer.getData('application/x-imosion-plugin') as PluginType; if (pluginType && PLUGIN_LIBRARY[pluginType]) { addPluginToTrack(track.id, pluginType); } }}
                    style={{ padding: '3px 4px', borderBottom: '1px solid var(--color-border-subtle)', maxHeight: '60px', overflowY: 'auto', transition: 'background 0.15s' }}
                  >
                    {track.plugins.length > 0 ? track.plugins.slice(0, 10).map((p) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 5px', borderRadius: '4px', marginBottom: '2px', background: p.enabled ? `${PLUGIN_LIBRARY[p.type].color}15` : '#111113', opacity: p.enabled ? 1 : 0.4 }}>
                        <span style={{ color: PLUGIN_LIBRARY[p.type].color, display: 'flex', flexShrink: 0 }}>{PLUGIN_ICON[p.type]}</span>
                        <span style={{ fontSize: '8px', color: PLUGIN_LIBRARY[p.type].color, fontWeight: 600, flex: 1 }}>{PLUGIN_LIBRARY[p.type].abbr}</span>
                        <button onClick={(e) => { e.stopPropagation(); togglePlugin(track.id, p.id); }} aria-label={p.enabled ? `Disable ${PLUGIN_LIBRARY[p.type].abbr} plugin on ${track.name}` : `Enable ${PLUGIN_LIBRARY[p.type].abbr} plugin on ${track.name}`} aria-pressed={p.enabled} style={{ width: '14px', height: '14px', borderRadius: '3px', border: 'none', background: p.enabled ? PLUGIN_LIBRARY[p.type].color : 'var(--color-bg-hover)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}><svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="2.5" fill={p.enabled ? '#000' : 'var(--color-text-tertiary)'}/></svg></button>
                      </div>
                    )) : (
                      <div style={{ fontSize: '7px', color: 'var(--color-text-disabled)', textAlign: 'center', padding: '2px 0' }}>No FX</div>
                    )}
                    <div 
                      onClick={(e) => { e.stopPropagation(); setSelectedTrack(track.id); setShowPluginBrowser(true); }}
                      style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', textAlign: 'center', cursor: 'pointer', padding: '1px', borderRadius: '2px', border: '1px dashed #27272a', marginTop: '2px' }}
                    >+ FX</div>
                  </div>

                  {/* Sidechain indicator */}
                  {track.plugins.some(p => p.type === 'compressor' && (p.params.sidechainSource ?? -1) >= 0) && (
                    <div style={{ padding: '2px 4px', background: '#2a1840', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#bf5af2' }} />
                      <span style={{ fontSize: '7px', color: '#bf5af2', fontWeight: 600 }}>SC</span>
                    </div>
                  )}

                  {/* Pan Knob */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>Pan</span>
                    <div style={{ position: 'relative', width: '40px', height: '40px' }}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="#1a1a1e" stroke="#27272a" strokeWidth="2" />
                        <line x1="20" y1="20" x2={20 + Math.sin(track.pan * Math.PI / 2) * 12} y2={20 - Math.cos(track.pan * Math.PI / 2) * 12} stroke={track.color} strokeWidth="2" strokeLinecap="round" />
                        <circle cx="20" cy="20" r="4" fill={track.color} />
                      </svg>
                    </div>
                    <input type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: '4px' }} />
                    <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`}</span>
                  </div>

                  {/* Volume Fader */}
                  <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>Vol</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                      <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: 'var(--color-bg-elevated)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, track.volume / 1.5 * 100)}%`, background: `linear-gradient(to top, ${track.color}, ${track.color}80)`, borderRadius: '4px', transition: 'height 0.05s ease-out' }} />
                        {/* Level marks */}
                        {[0, 0.25, 0.5, 0.75, 1].map(v => (
                          <div key={v} style={{ position: 'absolute', bottom: `${(v / 1.5) * 100}%`, left: '100%', marginLeft: '3px', width: '3px', height: '1px', background: v === 1 ? 'var(--color-error)' : '#3f3f46' }} />
                        ))}
                      </div>
                      <input type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={(e) => {
                        const raw = parseFloat(e.target.value);
                        // Shift key = fine control (±0.002 steps)
                        if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey) {
                          const diff = raw - track.volume;
                          updateTrack(track.id, { volume: Math.max(0, Math.min(1.5, track.volume + diff * 0.1)) });
                        } else {
                          updateTrack(track.id, { volume: raw });
                        }
                      }} onDoubleClick={() => updateTrack(track.id, { volume: 1 })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} title="Hold Shift for fine control. Double-click to reset." />
                    </div>
                    <span style={{ fontSize: '9px', color: track.volume > 1.01 ? 'var(--color-warning)' : track.color, fontFamily: 'monospace', marginTop: '4px', fontWeight: track.volume > 1.01 ? 700 : 400 }}>{track.volume > 1 ? '+' : ''}{((track.volume - 1) * 60).toFixed(1)} dB</span>
                  </div>

                  {/* Controls */}
                  <div style={{ padding: '6px', borderTop: '1px solid #1a1a1e', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid', borderColor: track.muted ? 'var(--color-accent)' : 'var(--color-bg-hover)', background: track.muted ? 'var(--color-accent)' : 'var(--color-bg-elevated)', color: track.muted ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="volume-x" size={12} /></button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid', borderColor: track.solo ? 'var(--color-warning)' : 'var(--color-bg-hover)', background: track.solo ? 'var(--color-warning)' : 'var(--color-bg-elevated)', color: track.solo ? '#000' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="headphones" size={12} /></button>
                    <button aria-label="Record arm" onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid', borderColor: track.armed ? 'var(--color-error)' : 'var(--color-bg-hover)', background: track.armed ? 'var(--color-error)' : 'var(--color-bg-elevated)', color: track.armed ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="record" size={12} /></button>
                  </div>

                  {/* Output Routing */}
                  <div style={{ padding: '4px 6px', borderTop: '1px solid #1a1a1e', background: 'var(--color-bg-base)' }}>
                    <select value={track.output} onChange={(e) => updateTrack(track.id, { output: e.target.value as RoutingDestination })} style={{ width: '100%', padding: '3px 4px', background: 'var(--color-bg-base)', border: '1px solid #27272a', borderRadius: '3px', color: 'var(--color-text-tertiary)', fontSize: '8px' }}>
                      <option value="master">Master</option>
                      {buses.filter(b => b.type === 'group').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              {/* Separator */}
              {buses.length > 0 && <div style={{ width: '2px', background: 'var(--color-bg-hover)', margin: '0 8px', borderRadius: '1px' }} />}

              {/* Bus Channel Strips */}
              {buses.map(bus => (
                <div key={bus.id} onClick={() => setSelectedBus(bus.id)} style={{ width: '94px', minWidth: '94px', background: selectedBus === bus.id ? '#18181b' : '#111113', borderRadius: '8px', marginRight: '6px', display: 'flex', flexDirection: 'column', border: `1px solid ${selectedBus === bus.id ? bus.color + '40' : 'var(--color-bg-elevated)'}`, overflow: 'hidden' }}>
                  {/* Bus Name */}
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid #1a1a1e', background: bus.color + '20' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '8px', color: bus.color, opacity: 0.7 }}>{bus.type === 'fx' ? 'FX' : 'GRP'}</span>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: bus.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bus.name}</div>
                    </div>
                  </div>

                  {/* Pan Knob */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid #1a1a1e' }}>
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>Pan</span>
                    <div style={{ position: 'relative', width: '40px', height: '40px' }}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="#1a1a1e" stroke="#27272a" strokeWidth="2" />
                        <line x1="20" y1="20" x2={20 + Math.sin(bus.pan * Math.PI / 2) * 12} y2={20 - Math.cos(bus.pan * Math.PI / 2) * 12} stroke={bus.color} strokeWidth="2" strokeLinecap="round" />
                        <circle cx="20" cy="20" r="4" fill={bus.color} />
                      </svg>
                    </div>
                    <input type="range" min="-1" max="1" step="0.01" value={bus.pan} onChange={(e) => updateBus(bus.id, { pan: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: '4px' }} />
                    <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{bus.pan === 0 ? 'C' : bus.pan < 0 ? `L${Math.abs(Math.round(bus.pan * 100))}` : `R${Math.round(bus.pan * 100)}`}</span>
                  </div>

                  {/* Volume Fader + VU Meter */}
                  <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>Vol</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', gap: 3 }}>
                      {/* Left VU */}
                      <div style={{ width: 3, height: '100%', maxHeight: 120, background: 'var(--color-bg-elevated)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, bus.volume * 72)}%`, background: `linear-gradient(to top, ${bus.color}90, ${bus.volume > 0.9 ? 'var(--color-error)' : bus.color})`, borderRadius: 2, transition: 'height 0.1s ease' }} />
                      </div>
                      {/* Fader */}
                      <div style={{ width: '8px', height: '100%', maxHeight: '120px', background: 'var(--color-bg-elevated)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${bus.volume * 100}%`, background: `linear-gradient(to top, ${bus.color}, ${bus.color}80)`, borderRadius: '4px' }} />
                      </div>
                      {/* Right VU */}
                      <div style={{ width: 3, height: '100%', maxHeight: 120, background: 'var(--color-bg-elevated)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${Math.min(100, bus.volume * 68)}%`, background: `linear-gradient(to top, ${bus.color}90, ${bus.volume > 0.9 ? 'var(--color-error)' : bus.color})`, borderRadius: 2, transition: 'height 0.1s ease' }} />
                      </div>
                      <input type="range" min="0" max="1.5" step="0.01" value={bus.volume} onChange={(e) => updateBus(bus.id, { volume: parseFloat(e.target.value) })} style={{ position: 'absolute', width: '100%', maxHeight: '120px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
                    </div>
                    <span style={{ fontSize: '9px', color: bus.color, fontFamily: 'monospace', marginTop: '4px' }}>{bus.volume > 1 ? '+' : ''}{((bus.volume - 1) * 60).toFixed(1)} dB</span>
                  </div>

                  {/* Controls */}
                  <div style={{ padding: '6px', borderTop: '1px solid #1a1a1e', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                    <button aria-label="Mute" onClick={(e) => { e.stopPropagation(); updateBus(bus.id, { muted: !bus.muted }); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid', borderColor: bus.muted ? 'var(--color-accent)' : 'var(--color-bg-hover)', background: bus.muted ? 'var(--color-accent)' : 'var(--color-bg-elevated)', color: bus.muted ? '#fff' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="volume-x" size={12} /></button>
                    <button aria-label="Solo" onClick={(e) => { e.stopPropagation(); updateBus(bus.id, { solo: !bus.solo }); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid', borderColor: bus.solo ? 'var(--color-warning)' : 'var(--color-bg-hover)', background: bus.solo ? 'var(--color-warning)' : 'var(--color-bg-elevated)', color: bus.solo ? '#000' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="headphones" size={12} /></button>
                    <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteBus(bus.id); }} style={{ width: '26px', height: '22px', borderRadius: '4px', border: '1px solid #4a2020', background: '#3a1818', color: 'var(--color-error)', cursor: 'pointer', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.trash}</button>
                  </div>
                </div>
              ))}

              {/* Master Channel */}
              <div style={{ width: '94px', minWidth: '94px', background: 'var(--color-bg-surface)', borderRadius: '8px', marginLeft: '8px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(48,209,88,0.3)', overflow: 'hidden' }}>
                <div style={{ padding: '8px', borderBottom: '1px solid #1a1a1e', background: 'rgba(48,209,88,0.1)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-success)', textAlign: 'center' }}>MASTER</div>
                </div>

                {/* Master Volume */}
                <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>Output</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                    <div style={{ width: '12px', height: '100%', maxHeight: '140px', background: 'var(--color-bg-elevated)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${masterSettings.volume * 100}%`, background: 'linear-gradient(to top, #30d158, #28a745)', borderRadius: '4px' }} />
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={masterSettings.volume} onChange={(e) => setMasterSettings(s => ({ ...s, volume: parseFloat(e.target.value) }))} style={{ position: 'absolute', width: '100%', maxHeight: '140px', height: '100%', WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', opacity: 0.01, cursor: 'pointer' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', fontFamily: 'monospace', marginTop: '8px', fontWeight: 600 }}>{((masterSettings.volume - 1) * 60).toFixed(1)} dB</span>
                </div>

                {/* Master Controls */}
                <div style={{ padding: '8px', borderTop: '1px solid #1a1a1e', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button aria-label="Toggle Master Limiter" onClick={() => setMasterSettings(s => ({ ...s, limiterEnabled: !s.limiterEnabled }))} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid', borderColor: masterSettings.limiterEnabled ? '#4a2020' : 'var(--color-bg-hover)', background: masterSettings.limiterEnabled ? '#3a1818' : 'var(--color-bg-elevated)', color: masterSettings.limiterEnabled ? 'var(--color-error)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '8px', fontWeight: 600 }}>LIMITER {masterSettings.limiterEnabled ? 'ON' : 'OFF'}</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)' }}>Ceil:</span>
                    <input type="range" min="-6" max="0" step="0.1" value={masterSettings.limiterCeiling} onChange={(e) => setMasterSettings(s => ({ ...s, limiterCeiling: parseFloat(e.target.value) }))} style={{ flex: 1 }} />
                    <span style={{ fontSize: '7px', color: 'var(--color-text-tertiary)', width: '28px', textAlign: 'right' }}>{masterSettings.limiterCeiling.toFixed(1)}dB</span>
                  </div>
                  <button aria-label="MASTERING" onClick={() => setShowMasteringPanel(true)} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #3d2060', background: '#2a1840', color: '#bf5af2', cursor: 'pointer', fontSize: '8px', fontWeight: 600, marginTop: '4px' }}>MASTERING</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Beat Maker View */}
        {viewMode === 'beatmaker' && (
          <div className="view-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
            {/* Beat Maker Header */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-secondary)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="section-title">Beat Maker</span>
                <select value={beatKit.id} onChange={e => { const k = BEAT_KITS.find(k => k.id === e.target.value); if (k) { setBeatKit(k); clearBeatPattern(); } }} style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer' }}>
                  {BEAT_KITS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <select value={beatSteps} onChange={e => { const s = Number(e.target.value); setBeatSteps(s); setBeatGrid(g => g.map(r => { const nr = Array(s).fill(false); r.forEach((v, i) => { if (i < s) nr[i] = v; }); return nr; })); setBeatVelocities(v => v.map(r => { const nr = Array(s).fill(0.8); r.forEach((vel, i) => { if (i < s) nr[i] = vel; }); return nr; })); }} style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer' }}>
                  <option value={8}>8 Steps</option>
                  <option value={16}>16 Steps</option>
                  <option value={32}>32 Steps</option>
                  <option value={64}>64 Steps</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Swing</span>
                  <input type="range" min="0" max="100" value={beatSwing} onChange={e => setBeatSwing(Number(e.target.value))} style={{ width: 60 }} />
                  <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace', width: 24, textAlign: 'right' }}>{beatSwing}%</span>
                </div>
                <button aria-label="Randomize" onClick={randomizeBeatPattern} style={{ padding: '3px 8px', background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.2)', borderRadius: '4px', color: 'var(--color-warning)', fontSize: '9px', fontWeight: 600, cursor: 'pointer' }}>Random</button>
                <button aria-label="Clear" onClick={clearBeatPattern} style={{ padding: '3px 8px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '4px', color: 'var(--color-error)', fontSize: '9px', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                <button aria-label={beatPlaying ? 'Stop' : 'Play'} onClick={beatPlaying ? stopBeatSequencer : startBeatSequencer} style={{ padding: '3px 10px', background: beatPlaying ? 'rgba(255,69,58,0.2)' : 'rgba(48,209,88,0.15)', border: `1px solid ${beatPlaying ? 'rgba(255,69,58,0.3)' : 'rgba(48,209,88,0.3)'}`, borderRadius: '4px', color: beatPlaying ? 'var(--color-error)' : 'var(--color-success)', fontSize: '9px', fontWeight: 600, cursor: 'pointer' }}>{beatPlaying ? 'Stop' : 'Play'}</button>
              </div>
            </div>

            {/* Grid: Pad labels on left, step grid on right */}
            <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
              {/* Pad Labels */}
              <div style={{ width: 80, flexShrink: 0, borderRight: '1px solid var(--color-border-subtle)' }}>
                <div style={{ height: 24 }} /> {/* Spacer for step numbers */}
                {beatKit.pads.map((pad, ri) => (
                  <div key={ri} onClick={() => setActivePad(ri === activePad ? -1 : ri)} style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '9px', fontWeight: 600, color: activePad === ri ? '#bf5af2' : 'var(--color-text-secondary)', cursor: 'pointer', background: activePad === ri ? 'rgba(191,90,242,0.08)' : 'transparent', borderBottom: '1px solid var(--color-border-subtle)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {pad}
                  </div>
                ))}
              </div>

              {/* Step Grid */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Step Numbers */}
                <div style={{ display: 'flex', height: 24, position: 'sticky', top: 0, background: 'var(--color-bg-base)', zIndex: 2, borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {Array.from({ length: beatSteps }, (_, i) => (
                    <div key={i} style={{ width: 28, minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: i % 4 === 0 ? 'var(--color-text-tertiary)' : '#3f3f46', fontWeight: i % 4 === 0 ? 600 : 400, background: beatPlayStep === i ? 'rgba(48,209,88,0.08)' : 'transparent' }}>
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {beatKit.pads.map((_, ri) => (
                  <div key={ri} style={{ display: 'flex', height: 28, borderBottom: '1px solid var(--color-border-subtle)' }}>
                    {Array.from({ length: beatSteps }, (__, ci) => {
                      const active = beatGrid[ri]?.[ci] ?? false;
                      const isPlayhead = beatPlayStep === ci;
                      const isBeat = ci % 4 === 0;
                      const vel = beatVelocities[ri]?.[ci] ?? 0.8;
                      const padColors = ['var(--color-error)', '#ff6b3a', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', '#64d2ff', 'var(--color-accent)', '#5e5ce6', '#bf5af2', '#ff375f', '#ac8e68', '#48484a', 'var(--color-text-tertiary)', 'var(--color-text-tertiary)', '#aeaeb2', '#d1d1d6'];
                      const color = padColors[ri % padColors.length];
                      return (
                        <div
                          key={ci}
                          onClick={() => toggleBeatCell(ri, ci)}
                          onContextMenu={e => { e.preventDefault(); if (active) setBeatVelocities(v => { const nv = v.map(r => [...r]); nv[ri][ci] = nv[ri][ci] > 0.5 ? 0.3 : nv[ri][ci] > 0.2 ? 1 : 0.8; return nv; }); }}
                          style={{
                            width: 28, minWidth: 28, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            background: isPlayhead ? 'rgba(48,209,88,0.06)' : isBeat ? 'rgba(255,255,255,0.015)' : 'transparent',
                            borderRight: ci % 4 === 3 ? '1px solid var(--color-bg-hover)' : '1px solid var(--color-border-subtle)',
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: 4,
                            background: active ? color : 'var(--color-border-subtle)',
                            border: active ? `1px solid ${color}` : '1px solid var(--color-bg-hover)',
                            opacity: active ? vel : 0.5,
                            transition: 'all 0.08s ease',
                            boxShadow: active && isPlayhead ? `0 0 8px ${color}60` : 'none',
                          }} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom: Drum pads for live input */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px', maxWidth: 500 }}>
                {beatKit.pads.slice(0, 16).map((pad, i) => {
                  const padColors = ['var(--color-error)', '#ff6b3a', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', '#64d2ff', 'var(--color-accent)', '#5e5ce6', '#bf5af2', '#ff375f', '#ac8e68', '#48484a', 'var(--color-text-tertiary)', 'var(--color-text-tertiary)', '#aeaeb2', '#d1d1d6'];
                  const color = padColors[i % padColors.length];
                  return (
                    <button
                      key={i}
                      aria-label={pad}
                      onMouseDown={() => {
                        setActivePad(i);
                        try {
                          const engine = getAudioEngine();
                          // Ensure AudioContext exists (lazy-init without full engine setup)
                          let ctx = engine.getContext();
                          if (!ctx) {
                            engine.init(sampleRate).catch(() => {/* ignore */});
                            ctx = engine.getContext() ?? new AudioContext({ sampleRate });
                          }
                          if (ctx.state === 'suspended') { ctx.resume().catch(() => {/* ignore */}); }
                          if (ctx) {
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            const padType = pad.toLowerCase();
                            // Synthesize different drum sounds
                            if (padType.includes('kick') || padType.includes('808') || padType.includes('sub') || padType.includes('bass')) {
                              osc.type = 'sine'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.15);
                              gain.gain.setValueAtTime(0.8, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                              osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
                            } else if (padType.includes('snare') || padType.includes('clap') || padType.includes('rim') || padType.includes('snap')) {
                              osc.type = 'triangle'; osc.frequency.setValueAtTime(200, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
                              gain.gain.setValueAtTime(0.6, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                              const noise = ctx.createBufferSource(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate); const d = buf.getChannelData(0); for (let s = 0; s < d.length; s++) d[s] = Math.random() * 2 - 1;
                              noise.buffer = buf; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4, ctx.currentTime); ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                              noise.connect(ng); ng.connect(ctx.destination); noise.start(ctx.currentTime);
                              osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
                            } else if (padType.includes('hihat') || padType.includes('hh') || padType.includes('shaker')) {
                              const noise = ctx.createBufferSource(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate); const d = buf.getChannelData(0); for (let s = 0; s < d.length; s++) d[s] = Math.random() * 2 - 1;
                              noise.buffer = buf; const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 8000;
                              gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
                              noise.connect(hpf); hpf.connect(gain); gain.connect(ctx.destination); noise.start(ctx.currentTime);
                              osc.connect(gain); osc.frequency.value = 0; osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.01);
                            } else if (padType.includes('crash') || padType.includes('cymbal') || padType.includes('ride') || padType.includes('open')) {
                              const noise = ctx.createBufferSource(); const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate); const d = buf.getChannelData(0); for (let s = 0; s < d.length; s++) d[s] = Math.random() * 2 - 1;
                              noise.buffer = buf; const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = 5000; bpf.Q.value = 0.5;
                              gain.gain.setValueAtTime(0.25, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                              noise.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination); noise.start(ctx.currentTime);
                              osc.connect(gain); osc.frequency.value = 0; osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.01);
                            } else if (padType.includes('tom') || padType.includes('conga') || padType.includes('bongo')) {
                              osc.type = 'sine'; osc.frequency.setValueAtTime(200 + i * 20, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
                              gain.gain.setValueAtTime(0.6, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                              osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
                            } else if (padType.includes('bell') || padType.includes('cow')) {
                              osc.type = 'square'; osc.frequency.setValueAtTime(800, ctx.currentTime);
                              gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                              osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
                            } else {
                              // Default percussive click for other pads (FX, Foley, Vinyl, etc.)
                              osc.type = 'sine'; osc.frequency.setValueAtTime(440 + i * 40, ctx.currentTime);
                              gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                              osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
                            }
                          }
                        } catch (err) { console.warn('[Imosion] Drum pad audio error:', err); }
                      }}
                      onMouseUp={() => setActivePad(-1)}
                      style={{
                        aspectRatio: '1', borderRadius: 8,
                        background: activePad === i ? color : `${color}20`,
                        border: `1px solid ${color}40`,
                        color: activePad === i ? '#000' : color,
                        fontSize: 9, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.06s ease',
                        boxShadow: activePad === i ? `0 0 12px ${color}50` : 'none',
                      }}
                    >
                      {pad}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== PIANO ROLL VIEW ===== */}
        {viewMode === 'pianoroll' && (
          <div className="view-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#09090b', position: 'relative' }}>
            {/* Piano Roll Toolbar */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #1a1a1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#bf5af2' }}>Piano Roll</span>
                <div style={{ display: 'flex', background: 'var(--color-border-subtle)', borderRadius: '5px', padding: '2px', border: '1px solid var(--color-bg-hover)' }}>
                  {(['select', 'draw', 'erase'] as const).map(tool => (
                    <button key={tool} aria-label={tool} onClick={() => setPianoRollTool(tool)} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: pianoRollTool === tool ? 'rgba(191,90,242,0.25)' : 'transparent', color: pianoRollTool === tool ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{tool}</button>
                  ))}
                </div>
                <div style={{ width: '1px', height: '16px', background: 'var(--color-bg-hover)' }} />
                <select value={pianoRollSnap} onChange={e => setPianoRollSnap(Number(e.target.value))} style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '5px', color: 'var(--color-text-secondary)', fontSize: '10px', padding: '4px 8px', cursor: 'pointer' }}>
                  <option value={1}>1/1</option><option value={0.5}>1/2</option><option value={0.25}>1/4</option><option value={0.125}>1/8</option><option value={0.0625}>1/16</option><option value={1/3}>1/3</option><option value={1/6}>1/6T</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showVelocityLane} onChange={e => setShowVelocityLane(e.target.checked)} style={{ accentColor: '#bf5af2' }} />Velocity
                </label>
                <div style={{ width: '1px', height: '16px', background: 'var(--color-bg-hover)' }} />
                <select value={musicalKey} onChange={e => setMusicalKey(e.target.value)} style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '5px', color: 'var(--color-text-secondary)', fontSize: '10px', padding: '4px 8px', cursor: 'pointer' }}>
                  {NOTE_NAMES.map((n, i) => <option key={i} value={n}>{n}</option>)}
                </select>
                <select value={musicalScale} onChange={e => setMusicalScale(e.target.value)} style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '5px', color: 'var(--color-text-secondary)', fontSize: '10px', padding: '4px 8px', cursor: 'pointer' }}>
                  {Object.keys(SCALE_INTERVALS).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button aria-label="Select All" onClick={() => setPianoRollSelectedNotes(new Set(pianoRollNotes.map(n => n.id)))} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #27272a', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer' }}>Select All</button>
                <button aria-label="Delete Selected" onClick={() => { setPianoRollNotes(prev => prev.filter(n => !pianoRollSelectedNotes.has(n.id))); setPianoRollSelectedNotes(new Set()); }} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #27272a', background: 'transparent', color: 'var(--color-error)', fontSize: '10px', cursor: 'pointer' }}>Delete</button>
                <button aria-label="Quantize" onClick={() => { setPianoRollNotes(prev => prev.map(n => ({ ...n, startTime: Math.round(n.startTime / pianoRollSnap) * pianoRollSnap, duration: Math.max(pianoRollSnap, Math.round(n.duration / pianoRollSnap) * pianoRollSnap) }))); }} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(191,90,242,0.3)', background: 'rgba(191,90,242,0.1)', color: '#bf5af2', fontSize: '10px', cursor: 'pointer', fontWeight: 600 }}>Quantize</button>
                <button aria-label="Toggle Chord Trigger" onClick={() => setShowChordTrigger(s => !s)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(100,210,255,0.3)', background: showChordTrigger ? 'rgba(100,210,255,0.2)' : 'transparent', color: showChordTrigger ? '#64d2ff' : 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer', fontWeight: 600 }}>Chords</button>
              </div>
            </div>
            {/* Piano Roll Body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Piano Keys Column */}
              <div style={{ width: '52px', flexShrink: 0, background: '#0c0c0e', borderRight: '1px solid #1f1f23', overflow: 'hidden' }}>
                <div style={{ position: 'relative', height: `${(pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12 * 14}px`, transform: `translateY(-${pianoRollScroll.y}px)` }}>
                  {Array.from({ length: (pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12 }, (_, i) => {
                    const noteNum = (pianoRollOctaveRange.high * 12 - 1) - i;
                    const black = isBlackKey(noteNum);
                    const inScale = isNoteInScale(noteNum, musicalKey, musicalScale);
                    return (
                      <div key={noteNum} style={{ height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '4px', background: black ? '#080809' : (noteNum % 12 === 0 ? 'var(--color-border-subtle)' : 'transparent'), borderBottom: noteNum % 12 === 0 ? '1px solid #27272a' : '1px solid #141417', cursor: 'pointer' }}>
                        <span style={{ fontSize: '7px', fontFamily: '"SF Mono", monospace', color: inScale ? (black ? 'var(--color-text-secondary)' : '#d4d4d8') : '#3f3f46', fontWeight: noteNum % 12 === 0 ? 600 : 400 }}>{midiNoteName(noteNum)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Note Grid */}
              <div style={{ flex: 1, position: 'relative', overflow: 'auto', background: 'var(--color-bg-base)' }}
                onScroll={e => { const t = e.currentTarget; setPianoRollScroll({ x: t.scrollLeft, y: t.scrollTop }); }}
                onMouseDown={e => {
                  if (pianoRollTool === 'draw' && e.button === 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
                    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
                    const beatWidth = 60 * zoom;
                    const noteHeight = 14;
                    const totalNotes = (pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12;
                    const startBeat = Math.floor(x / beatWidth / pianoRollSnap) * pianoRollSnap;
                    const pitch = (pianoRollOctaveRange.high * 12 - 1) - Math.floor(y / noteHeight);
                    if (pitch >= 0 && pitch < 128) {
                      const newNote: MidiNote = { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, pitch, startTime: startBeat, duration: pianoRollSnap, velocity: 100, selected: false };
                      setPianoRollNotes(prev => [...prev, newNote]);
                    }
                  } else if (pianoRollTool === 'erase' && e.button === 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
                    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
                    const beatWidth = 60 * zoom;
                    const noteHeight = 14;
                    const clickBeat = x / beatWidth;
                    const clickPitch = (pianoRollOctaveRange.high * 12 - 1) - Math.floor(y / noteHeight);
                    setPianoRollNotes(prev => prev.filter(n => !(n.pitch === clickPitch && clickBeat >= n.startTime && clickBeat <= n.startTime + n.duration)));
                  } else if (pianoRollTool === 'select' && e.button === 0) {
                    if (!e.shiftKey) setPianoRollSelectedNotes(new Set());
                  }
                }}
              >
                <div style={{ position: 'relative', width: `${200 * 60 * zoom}px`, height: `${(pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12 * 14}px` }}>
                  {/* Grid lines */}
                  {Array.from({ length: (pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12 }, (_, i) => {
                    const noteNum = (pianoRollOctaveRange.high * 12 - 1) - i;
                    const black = isBlackKey(noteNum);
                    const inScale = isNoteInScale(noteNum, musicalKey, musicalScale);
                    return (
                      <div key={`row-${noteNum}`} style={{ position: 'absolute', left: 0, right: 0, top: i * 14, height: '14px', background: black ? 'rgba(0,0,0,0.3)' : (inScale ? 'rgba(191,90,242,0.02)' : 'transparent'), borderBottom: noteNum % 12 === 0 ? '1px solid #27272a' : '1px solid var(--color-border-subtle)' }} />
                    );
                  })}
                  {/* Beat grid lines */}
                  {Array.from({ length: 200 }, (_, i) => (
                    <div key={`beat-${i}`} style={{ position: 'absolute', left: i * 60 * zoom, top: 0, bottom: 0, width: '1px', background: i % 4 === 0 ? 'var(--color-border-subtle)' : 'rgba(255,255,255,0.025)', zIndex: 1 }} />
                  ))}
                  {/* Playhead */}
                  <div style={{ position: 'absolute', left: playbackPosition * 60 * zoom * (bpm / 60), top: 0, bottom: 0, width: '1px', background: '#bf5af2', zIndex: 5, boxShadow: '0 0 6px rgba(191,90,242,0.4)' }} />
                  {/* Notes */}
                  {pianoRollNotes.map(note => {
                    const beatWidth = 60 * zoom;
                    const noteHeight = 14;
                    const totalNotes = (pianoRollOctaveRange.high - pianoRollOctaveRange.low) * 12;
                    const x = note.startTime * beatWidth;
                    const y = ((pianoRollOctaveRange.high * 12 - 1) - note.pitch) * noteHeight;
                    const w = note.duration * beatWidth;
                    const isSelected = pianoRollSelectedNotes.has(note.id);
                    const velocityAlpha = 0.4 + (note.velocity / 127) * 0.6;
                    return (
                      <div key={note.id} style={{ position: 'absolute', left: x, top: y, width: Math.max(w, 4), height: noteHeight - 1, background: isSelected ? 'rgba(255,149,0,0.85)' : `rgba(191,90,242,${velocityAlpha})`, borderRadius: '2px', cursor: pianoRollTool === 'select' ? 'grab' : 'pointer', zIndex: 3, border: isSelected ? '1px solid #ff9f0a' : '1px solid var(--color-border)', boxShadow: isSelected ? '0 0 6px rgba(255,149,0,0.3)' : 'none', transition: 'box-shadow 0.1s' }}
                        onClick={e => { e.stopPropagation(); if (pianoRollTool === 'select') { const newSel = new Set(e.shiftKey ? pianoRollSelectedNotes : []); if (newSel.has(note.id)) newSel.delete(note.id); else newSel.add(note.id); setPianoRollSelectedNotes(newSel); } else if (pianoRollTool === 'erase') { setPianoRollNotes(prev => prev.filter(n => n.id !== note.id)); } }}
                      >
                        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px', cursor: 'ew-resize', borderRadius: '0 2px 2px 0' }} onMouseDown={e => { e.stopPropagation(); setPianoRollDrag({ type: 'resize', noteId: note.id, startX: e.clientX, startY: e.clientY, startTime: note.startTime }); }} />
                        <span style={{ fontSize: '6px', color: 'var(--color-text-secondary)', padding: '0 2px', lineHeight: `${noteHeight - 1}px`, overflow: 'hidden', whiteSpace: 'nowrap', userSelect: 'none' }}>{midiNoteName(note.pitch)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Velocity Lane */}
            {showVelocityLane && (
              <div style={{ height: '60px', flexShrink: 0, borderTop: '1px solid #1f1f23', background: '#0c0c0e', display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '52px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #1f1f23' }}>
                  <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>VEL</span>
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  {pianoRollNotes.map(note => {
                    const beatWidth = 60 * zoom;
                    const x = note.startTime * beatWidth - pianoRollScroll.x;
                    const h = (note.velocity / 127) * 54;
                    const isSelected = pianoRollSelectedNotes.has(note.id);
                    return (
                      <div key={`vel-${note.id}`} style={{ position: 'absolute', left: x, bottom: 3, width: Math.max(note.duration * beatWidth - 1, 3), height: h, background: isSelected ? 'var(--color-warning)' : '#bf5af2', borderRadius: '2px 2px 0 0', opacity: 0.7, cursor: 'ns-resize' }}
                        onMouseDown={e => {
                          e.preventDefault();
                          const startY = e.clientY;
                          const startVel = note.velocity;
                          let rafId = 0;
                          const onMove = (ev: MouseEvent) => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => { const delta = startY - ev.clientY; const newVel = Math.max(1, Math.min(127, Math.round(startVel + delta))); setPianoRollNotes(prev => prev.map(n => n.id === note.id ? { ...n, velocity: newVel } : n)); }); };
                          const onUp = () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {/* ===== CHORD TRIGGER PANEL ===== */}
            {showChordTrigger && (() => {
              const rootIdx = NOTE_NAMES.indexOf(musicalKey);
              const rootPitch = 60 + (rootIdx >= 0 ? rootIdx : 0); // root in octave 4
              const chords = getDiatonicChords(rootPitch, chordTriggerMode, chordIncludeSeventh);
              const playChord = (pitches: number[]) => {
                try {
                  const engine = getAudioEngine();
                  let ctx = engine.getContext();
                  if (!ctx) {
                    engine.init(sampleRate).catch(() => { /* ignore */ });
                    ctx = engine.getContext() ?? new AudioContext({ sampleRate });
                  }
                  if (ctx.state === 'suspended') { ctx.resume().catch(() => { /* ignore */ }); }
                  const t0 = ctx.currentTime;
                  const master = ctx.createGain();
                  master.gain.setValueAtTime(0.3, t0);
                  master.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
                  master.connect(ctx.destination);
                  for (const p of pitches) {
                    const osc = ctx.createOscillator();
                    osc.type = 'triangle';
                    osc.frequency.value = midiToFrequency(p);
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(1 / pitches.length, t0);
                    osc.connect(g); g.connect(master);
                    osc.start(t0); osc.stop(t0 + 1.25);
                  }
                } catch (err) { console.warn('[Imosion] Chord trigger audio error:', err); }
              };
              const insertChord = (pitches: number[]) => {
                const startBeat = Math.round(playbackPosition * (bpm / 60) / pianoRollSnap) * pianoRollSnap;
                const newNotes: MidiNote[] = pitches.map((p, idx) => ({
                  id: `chord-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                  pitch: p, startTime: startBeat, duration: Math.max(pianoRollSnap, 1), velocity: 100, selected: false,
                }));
                setPianoRollNotes(prev => [...prev, ...newNotes]);
              };
              return (
                <div style={{ position: 'absolute', top: 56, right: 12, width: 250, background: 'rgba(12,12,14,0.96)', border: '1px solid #27272a', borderRadius: 8, padding: 10, zIndex: 20, boxShadow: 'var(--pg-shadow-context)', backdropFilter: 'blur(8px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64d2ff' }}>Chord Trigger</span>
                    <button aria-label="Close Chord Trigger" onClick={() => setShowChordTrigger(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <select value={musicalKey} onChange={e => setMusicalKey(e.target.value)} style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
                      {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <div style={{ display: 'flex', background: 'var(--color-border-subtle)', borderRadius: 4, padding: 1 }}>
                      <button aria-label="Major" onClick={() => setChordTriggerMode('major')} style={{ padding: '3px 8px', borderRadius: 3, border: 'none', background: chordTriggerMode === 'major' ? 'rgba(100,210,255,0.25)' : 'transparent', color: chordTriggerMode === 'major' ? '#64d2ff' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>Maj</button>
                      <button aria-label="Minor" onClick={() => setChordTriggerMode('minor')} style={{ padding: '3px 8px', borderRadius: 3, border: 'none', background: chordTriggerMode === 'minor' ? 'rgba(100,210,255,0.25)' : 'transparent', color: chordTriggerMode === 'minor' ? '#64d2ff' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>Min</button>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-tertiary)', cursor: 'pointer', marginBottom: 8 }}>
                    <input type="checkbox" checked={chordIncludeSeventh} onChange={e => setChordIncludeSeventh(e.target.checked)} style={{ accentColor: '#64d2ff' }} />
                    +seventh
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {chords.map((c, i) => (
                      <button
                        key={i}
                        aria-label={`Chord ${c.numeral} ${c.name}`}
                        onClick={() => playChord(c.pitches)}
                        onDoubleClick={() => { playChord(c.pitches); insertChord(c.pitches); }}
                        title={`${c.numeral}  ${c.name} - click to play, double-click to insert`}
                        style={{
                          padding: '6px 2px', borderRadius: 4, border: '1px solid #27272a', background: 'var(--color-bg-hover)',
                          color: c.quality === 'major' ? '#64d2ff' : c.quality === 'minor' ? '#bf5af2' : c.quality === 'diminished' ? 'var(--color-error)' : 'var(--color-warning)',
                          fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}
                      >
                        <span>{c.numeral}</span>
                        <span style={{ fontSize: 8, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{c.name}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Double-click to insert at playhead</div>
                </div>
              );
            })()}
          </div>
        )}
        {showAutomation && viewMode === 'arrange' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(0deg, rgba(9,9,11,0.95), rgba(9,9,11,0.7))', borderTop: '1px solid #27272a', zIndex: 10, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1a1e', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-warning)' }}>Automation</span>
                <div style={{ display: 'flex', background: 'var(--color-border-subtle)', borderRadius: '5px', padding: '1px', border: '1px solid var(--color-bg-hover)' }}>
                  {(['read', 'write', 'latch', 'touch'] as const).map(mode => (
                    <button key={mode} aria-label={`Automation ${mode}`} onClick={() => setAutomationMode(mode)} style={{ padding: '2px 7px', borderRadius: '3px', border: 'none', background: automationMode === mode ? 'rgba(255,159,10,0.25)' : 'transparent', color: automationMode === mode ? 'var(--color-warning)' : 'var(--color-text-tertiary)', fontSize: '8px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{mode}</button>
                  ))}
                </div>
              </div>
              <button aria-label="Close Automation" onClick={() => setShowAutomation(false)} style={{ padding: '2px 6px', borderRadius: '3px', border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {trackAutomations.filter(a => a.visible).map(automation => (
                <svg key={automation.id} data-automation-id={automation.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', touchAction: 'none' }}
                  onDoubleClick={(e) => {
                    if (automationMode === 'read') return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const timeVal = Math.max(0, (e.clientX - rect.left) / (60 * zoom));
                    const normalizedY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    const value = automation.min + normalizedY * (automation.max - automation.min);
                    setTrackAutomations(prev => prev.map(a => {
                      if (a.id !== automation.id) return a;
                      const pts = [...a.points, { time: timeVal, value, curve: 'linear' as const }].sort((x, y) => x.time - y.time);
                      return { ...a, points: pts };
                    }));
                  }}>
                  {automation.points.length > 1 && (
                    <polyline points={automation.points.map((p, i) => `${p.time * 60 * zoom},${(1 - (p.value - automation.min) / (automation.max - automation.min)) * 100}`).join(' ')} fill="none" stroke={automation.color} strokeWidth="1.5" opacity="0.7" />
                  )}
                  {automation.points.map((point, idx) => (
                    <circle key={idx} cx={point.time * 60 * zoom} cy={(1 - (point.value - automation.min) / (automation.max - automation.min)) * 100} r="4" fill={editingAutomation === automation.id ? 'var(--color-warning)' : automation.color} stroke="var(--color-text-tertiary)" strokeWidth="1" style={{ cursor: 'grab' }}
                      onMouseDown={(e) => { e.stopPropagation(); setEditingAutomation(automation.id); setAutomationDragPoint(idx); }}
                    />
                  ))}
                </svg>
              ))}
              {trackAutomations.filter(a => a.visible).length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-disabled)', fontSize: '10px' }}>
                  No automation lanes visible. Add automation from the track inspector.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mastering Panel Modal */}
        {showMasteringPanel && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }}>
            <div style={{ width: 'min(860px, calc(100vw - 32px))', maxHeight: 'min(90vh, calc(100vh - 32px))', background: 'linear-gradient(180deg, #111114, #0a0a0c)', borderRadius: '12px', border: '1px solid #1f1f23', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{ width: '6px', height: '20px', background: 'linear-gradient(180deg, #bf5af2, #bf5af2)', borderRadius: '3px' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Mastering Suite</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', padding: '2px 8px', background: 'var(--color-bg-surface)', borderRadius: '4px' }}>Pro</span>
                </div>
                <button aria-label="Close Mastering panel" onClick={() => setShowMasteringPanel(false)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #27272a', background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="close" size={14} /></button>
              </div>
              
              {/* Presets Section */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1e', background: 'var(--color-bg-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Presets</span>
                  <button aria-label="Save current mastering preset" onClick={() => { setShowSavePresetModal({ type: 'mastering' }); setNewPresetName(''); }} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #27272a', background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>+ Save Current</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {MASTERING_PRESETS.map(preset => (
                    <button aria-label={preset.description} key={preset.id} onClick={() => applyMasteringPreset(preset.id)} title={preset.description} style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid', borderColor: selectedMasteringPreset === preset.id ? '#bf5af2' : 'var(--color-bg-hover)', background: selectedMasteringPreset === preset.id ? 'rgba(191,90,242,0.15)' : '#141417', color: selectedMasteringPreset === preset.id ? '#c084fc' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600, transition: 'all 0.15s' }}>{preset.name}</button>
                  ))}
                  {customMasteringPresets.map(preset => (
                    <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                      <button aria-label={`Apply preset ${preset.name}`} onClick={() => applyMasteringPreset(preset.id)} style={{ padding: '5px 10px', borderRadius: '4px 0 0 4px', border: '1px solid', borderColor: selectedMasteringPreset === preset.id ? 'var(--color-success)' : 'var(--color-bg-hover)', background: selectedMasteringPreset === preset.id ? 'rgba(48,209,88,0.15)' : '#141417', color: selectedMasteringPreset === preset.id ? '#4ade80' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>{preset.name}</button>
                      <button aria-label={`Delete preset ${preset.name}`} onClick={() => deleteCustomMasteringPreset(preset.id)} style={{ padding: '5px 6px', borderRadius: '0 4px 4px 0', border: '1px solid #27272a', borderLeft: 'none', background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '10px' }}><DexIcon name="close" size={10} /></button>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Controls Grid */}
              <div style={{ flex: 1, padding: '16px 20px', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                {/* Stereo Image */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stereo Image</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Width</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.stereoWidth}%</span></div><input type="range" min="0" max="200" value={masterSettings.stereoWidth} onChange={e => setMasterSettings(s => ({ ...s, stereoWidth: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>M/S Balance</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.midSideBalance > 0 ? '+' : ''}{masterSettings.midSideBalance}</span></div><input type="range" min="-100" max="100" value={masterSettings.midSideBalance} onChange={e => setMasterSettings(s => ({ ...s, midSideBalance: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} /></div>
                  </div>
                </div>
                
                {/* Tone */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-success)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tone</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Low Shelf</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.lowShelf > 0 ? '+' : ''}{masterSettings.lowShelf} dB</span></div><input type="range" min="-12" max="12" step="0.5" value={masterSettings.lowShelf} onChange={e => setMasterSettings(s => ({ ...s, lowShelf: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-success)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>High Shelf</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.highShelf > 0 ? '+' : ''}{masterSettings.highShelf} dB</span></div><input type="range" min="-12" max="12" step="0.5" value={masterSettings.highShelf} onChange={e => setMasterSettings(s => ({ ...s, highShelf: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-success)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Bass Enhance</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.bassEnhance}%</span></div><input type="range" min="0" max="100" value={masterSettings.bassEnhance} onChange={e => setMasterSettings(s => ({ ...s, bassEnhance: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-success)' }} /></div>
                  </div>
                </div>
                
                {/* Multiband */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Multiband</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Low</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.multiband.lowGain > 0 ? '+' : ''}{masterSettings.multiband.lowGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.lowGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, lowGain: +e.target.value } }))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Mid</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.multiband.midGain > 0 ? '+' : ''}{masterSettings.multiband.midGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.midGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, midGain: +e.target.value } }))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>High</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.multiband.highGain > 0 ? '+' : ''}{masterSettings.multiband.highGain} dB</span></div><input type="range" min="-6" max="6" step="0.5" value={masterSettings.multiband.highGain} onChange={e => setMasterSettings(s => ({ ...s, multiband: { ...s.multiband, highGain: +e.target.value } }))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} /></div>
                  </div>
                </div>
                
                {/* Character */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ff375f', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Character</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Analog Warmth</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.analogWarmth}%</span></div><input type="range" min="0" max="100" value={masterSettings.analogWarmth} onChange={e => setMasterSettings(s => ({ ...s, analogWarmth: +e.target.value }))} style={{ width: '100%', accentColor: '#ff375f' }} /></div>
                  </div>
                </div>
                
                {/* Loudness */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-error)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loudness</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Target</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.loudnessTarget} LUFS</span></div><input type="range" min="-24" max="0" value={masterSettings.loudnessTarget} onChange={e => setMasterSettings(s => ({ ...s, loudnessTarget: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-error)' }} /></div>
                    <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Ceiling</label><span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{masterSettings.limiterCeiling.toFixed(1)} dB</span></div><input type="range" min="-6" max="0" step="0.1" value={masterSettings.limiterCeiling} onChange={e => setMasterSettings(s => ({ ...s, limiterCeiling: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--color-error)' }} /></div>
                    <button aria-label="Toggle Limiter" onClick={() => setMasterSettings(s => ({ ...s, limiterEnabled: !s.limiterEnabled }))} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid', borderColor: masterSettings.limiterEnabled ? 'var(--color-error)' : 'var(--color-bg-hover)', background: masterSettings.limiterEnabled ? 'rgba(255,69,58,0.15)' : '#0f0f12', color: masterSettings.limiterEnabled ? 'var(--color-error)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>Limiter {masterSettings.limiterEnabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                
                {/* Output */}
                <div style={{ background: 'var(--color-bg-surface)', borderRadius: '8px', padding: '14px', border: '1px solid #1f1f23' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#bf5af2', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Output</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px' }}>Dithering</label><select value={masterSettings.dithering} onChange={e => setMasterSettings(s => ({ ...s, dithering: e.target.value as any }))} style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', background: 'var(--color-bg-base)', border: '1px solid #27272a', color: 'var(--color-text-primary)', fontSize: '10px' }}><option value="none">None</option><option value="triangular">Triangular</option><option value="noise-shaped">Noise Shaped</option></select></div>
                    <div><label style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px' }}>Oversampling</label><select value={masterSettings.oversampling} onChange={e => setMasterSettings(s => ({ ...s, oversampling: +e.target.value as any }))} style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', background: 'var(--color-bg-base)', border: '1px solid #27272a', color: 'var(--color-text-primary)', fontSize: '10px' }}><option value="1">1x (Off)</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option></select></div>
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>Adjust settings to taste, then save as custom preset</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button aria-label="Reset" onClick={() => { setMasterSettings({ volume: 0.85, limiterEnabled: true, limiterCeiling: -0.3, dithering: 'triangular', oversampling: 1, stereoWidth: 100, bassEnhance: 0, highShelf: 0, lowShelf: 0, midSideBalance: 0, multiband: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 200, highFreq: 4000 }, analogWarmth: 10, loudnessTarget: -14 }); setSelectedMasteringPreset(null); }} style={{ padding: '7px 14px', borderRadius: '5px', border: '1px solid #27272a', background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Reset</button>
                  <button aria-label="Done" onClick={() => setShowMasteringPanel(false)} style={{ padding: '7px 16px', borderRadius: '5px', border: 'none', background: 'linear-gradient(180deg, #bf5af2, #9333ea)', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Done</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Preset Modal */}
        {showSavePresetModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }}>
            <div style={{ width: 'min(340px, calc(100vw - 32px))', background: 'var(--color-bg-base)', borderRadius: '10px', border: '1px solid #27272a', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #1f1f23' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Save Preset</span>
              </div>
              <div style={{ padding: '18px' }}>
                <label style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '6px' }}>Preset Name</label>
                <input type="text" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} placeholder="My Custom Preset" autoFocus style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: 'var(--color-bg-base)', border: '1px solid #27272a', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter' && newPresetName.trim()) { if (showSavePresetModal.type === 'mastering') saveCustomMasteringPreset(newPresetName.trim()); else if (showSavePresetModal.pluginType && showSavePresetModal.trackId && showSavePresetModal.pluginId) saveCustomPluginPreset(showSavePresetModal.pluginType, showSavePresetModal.trackId, showSavePresetModal.pluginId, newPresetName.trim()); }}} />
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid #1f1f23', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button aria-label="Cancel" onClick={() => setShowSavePresetModal(null)} style={{ padding: '7px 14px', borderRadius: '5px', border: '1px solid #27272a', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><DexIcon name="close" size={12} />Cancel</button>
                <button aria-label="Save" onClick={() => { if (newPresetName.trim()) { if (showSavePresetModal.type === 'mastering') saveCustomMasteringPreset(newPresetName.trim()); else if (showSavePresetModal.pluginType && showSavePresetModal.trackId && showSavePresetModal.pluginId) saveCustomPluginPreset(showSavePresetModal.pluginType, showSavePresetModal.trackId, showSavePresetModal.pluginId, newPresetName.trim()); }}} disabled={!newPresetName.trim()} style={{ padding: '7px 14px', borderRadius: '5px', border: 'none', background: newPresetName.trim() ? '#bf5af2' : 'var(--color-bg-hover)', color: newPresetName.trim() ? 'white' : 'var(--color-text-tertiary)', cursor: newPresetName.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><DexIcon name="save" size={12} />Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Instrument Browser Modal */}
        {showInstrumentBrowser && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }}>
            <div style={{ width: 'min(680px, calc(100vw - 32px))', maxHeight: 'min(80vh, calc(100vh - 32px))', background: 'linear-gradient(180deg, #111114, #0a0a0c)', borderRadius: '12px', border: '1px solid #1f1f23', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#bf5af2' }}>Software Instruments</span>
                <button aria-label="Close" onClick={() => setShowInstrumentBrowser(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {(['subsynth', 'fmsynth', 'wavetable', 'sampler', 'drummachine'] as InstrumentType[]).map(type => (
                  <div key={type} style={{ background: 'var(--color-border-subtle)', borderRadius: '10px', border: '1px solid #1f1f23', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `${INSTRUMENT_COLORS[type]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={INSTRUMENT_COLORS[type]}>
                          {type === 'subsynth' && <path d="M2 12c2-4 4-8 6-4s4 8 6 4 4-8 6-4 2 0 2 0"/>}
                          {type === 'fmsynth' && <><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="16" r="3"/></>}
                          {type === 'wavetable' && <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h2l2-4 2 8 2-4h4" stroke="#000" strokeWidth="1" fill="none"/></>}
                          {type === 'sampler' && <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></>}
                          {type === 'drummachine' && <><rect x="2" y="2" width="20" height="20" rx="3"/><rect x="5" y="5" width="5" height="5" rx="1"/><rect x="14" y="5" width="5" height="5" rx="1"/><rect x="5" y="14" width="5" height="5" rx="1"/><rect x="14" y="14" width="5" height="5" rx="1"/></>}
                        </svg>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: INSTRUMENT_COLORS[type], textTransform: 'capitalize' }}>{type === 'subsynth' ? 'Sub Synth' : type === 'fmsynth' ? 'FM Synth' : type === 'wavetable' ? 'Wavetable' : type === 'drummachine' ? 'Drum Machine' : 'Sampler'}</span>
                    </div>
                    <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflow: 'auto' }}>
                      {INSTRUMENT_PRESETS[type].map(preset => (
                        <button key={preset.name} aria-label={preset.name} onClick={() => {
                          const newTrack: InstrumentTrack = {
                            id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            name: preset.name,
                            type: 'instrument',
                            instrument: { type, name: preset.name, preset: preset.name, params: {} },
                            volume: 0.8, pan: 0, muted: false, solo: false, armed: false,
                            color: INSTRUMENT_COLORS[type],
                            clips: [], plugins: [], sends: [],
                            output: 'master', phase: false, trim: 0,
                            inputSource: 'none'
                          };
                          setInstrumentTracks(prev => [...prev, newTrack]);
                          setSelectedInstrument(newTrack.id);
                          setShowInstrumentBrowser(false);
                        }} style={{ padding: '6px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '10px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >{preset.name}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1f1f23', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{instrumentTracks.length} instrument track{instrumentTracks.length !== 1 ? 's' : ''} loaded</span>
                <button aria-label="Done" onClick={() => setShowInstrumentBrowser(false)} style={{ padding: '7px 16px', borderRadius: '5px', border: 'none', background: 'linear-gradient(180deg, #bf5af2, #9333ea)', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Done</button>
              </div>
            </div>
          </div>
        )}

        {/* Instrument Editor / Sampler Panel */}
        {showInstrumentEditor && (() => {
          const inst = instrumentTracks.find(t => t.id === selectedInstrument);
          if (!inst) return null;
          const isSampler = inst.instrument.type === 'sampler' || inst.instrument.type === 'drummachine';
          const isSynth = inst.instrument.type === 'subsynth' || inst.instrument.type === 'fmsynth' || inst.instrument.type === 'wavetable';
          const params = inst.instrument.params as Record<string, number>;
          const updateParam = (key: string, val: number) => {
            setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, instrument: { ...t.instrument, params: { ...t.instrument.params, [key]: val } } } : t));
          };
          const presets = INSTRUMENT_PRESETS[inst.instrument.type] || [];
          return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }}>
            <div style={{ width: 720, maxHeight: '85vh', background: 'var(--color-bg-base)', borderRadius: 12, border: '1px solid #1f1f23', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${INSTRUMENT_COLORS[inst.instrument.type]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ color: INSTRUMENT_COLORS[inst.instrument.type] }}><path d="M14 1v9.5a2.5 2.5 0 11-2-2.45V3.72L6 5.05v7.45a2.5 2.5 0 11-2-2.45V1.5a.5.5 0 01.38-.49l8-2A.5.5 0 0114 1z" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: INSTRUMENT_COLORS[inst.instrument.type] }}>{inst.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>{inst.instrument.type}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={inst.instrument.preset} onChange={e => {
                    setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, instrument: { ...t.instrument, preset: e.target.value }, name: e.target.value } : t));
                  }} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #27272a', background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', fontSize: 9 }}>
                    {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                  <button onClick={() => setShowInstrumentEditor(false)} aria-label="Close instrument editor" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }}><DexIcon name="close" size={14} /></button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
                {/* Left: Waveform / Sample Display */}
                <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Oscillator / Sample Visualization */}
                  <div style={{ height: 100, background: '#09090b', borderRadius: 8, border: '1px solid #1a1a1e', position: 'relative', overflow: 'hidden' }}>
                    <svg width="100%" height="100%" viewBox="0 0 400 100" preserveAspectRatio="none">
                      {/* Grid lines */}
                      {[0,25,50,75,100].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#1a1a1e" strokeWidth="0.5"/>)}
                      {/* Waveform visualization */}
                      <path d={(() => {
                        const pts: string[] = [];
                        for (let i = 0; i < 400; i++) {
                          const t = i / 400;
                          const freq = params.frequency || 440;
                          const detune = params.detune || 0;
                          let y: number;
                          if (isSampler) { y = 50 + Math.sin(t * Math.PI * 8) * 30 * Math.exp(-t * 3); }
                          else { y = 50 + Math.sin(t * Math.PI * 2 * (freq / 110 + detune / 100)) * 35 * (1 - t * 0.3); }
                          pts.push(`${i === 0 ? 'M' : 'L'}${i} ${y}`);
                        }
                        return pts.join(' ');
                      })()} fill="none" stroke={INSTRUMENT_COLORS[inst.instrument.type]} strokeWidth="1.5" opacity="0.8"/>
                    </svg>
                    <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 8, color: 'var(--color-text-tertiary)' }}>{isSampler ? 'SAMPLE' : 'OSC 1'}</div>
                  </div>

                  {/* ADSR Envelope */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amp Envelope</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {[
                        { key: 'attack', label: 'A', min: 0, max: 2000, def: 10 },
                        { key: 'decay', label: 'D', min: 0, max: 2000, def: 200 },
                        { key: 'sustain', label: 'S', min: 0, max: 100, def: 70 },
                        { key: 'release', label: 'R', min: 0, max: 5000, def: 300 },
                      ].map(({ key, label, min, max, def }) => (
                        <div key={key} style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: '6px 8px', border: '1px solid #1a1a1e' }}>
                          <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
                          <input type="range" min={min} max={max} value={params[key] ?? def} onChange={e => updateParam(key, Number(e.target.value))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                          <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{key === 'sustain' ? `${params[key] ?? def}%` : `${params[key] ?? def}ms`}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Filter */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {[
                        { key: 'filterCutoff', label: 'Cutoff', min: 20, max: 20000, def: 8000 },
                        { key: 'filterResonance', label: 'Res', min: 0, max: 100, def: 0 },
                        { key: 'filterEnvAmount', label: 'Env', min: -100, max: 100, def: 0 },
                      ].map(({ key, label, min, max, def }) => (
                        <div key={key} style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: '6px 8px', border: '1px solid #1a1a1e' }}>
                          <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
                          <input type="range" min={min} max={max} value={params[key] ?? def} onChange={e => updateParam(key, Number(e.target.value))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                          <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{key === 'filterCutoff' ? `${params[key] ?? def}Hz` : `${params[key] ?? def}`}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Synth-specific: LFO */}
                  {isSynth && (
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>LFO</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { key: 'lfoRate', label: 'Rate', min: 1, max: 2000, def: 400 },
                          { key: 'lfoDepth', label: 'Depth', min: 0, max: 100, def: 50 },
                          { key: 'lfoDelay', label: 'Delay', min: 0, max: 2000, def: 0 },
                        ].map(({ key, label, min, max, def }) => (
                          <div key={key} style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: '6px 8px', border: '1px solid #1a1a1e' }}>
                            <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
                            <input type="range" min={min} max={max} value={params[key] ?? def} onChange={e => updateParam(key, Number(e.target.value))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                            <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{key === 'lfoRate' ? `${((params[key] ?? def) / 100).toFixed(1)}Hz` : `${params[key] ?? def}`}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sampler-specific: sample controls */}
                  {isSampler && (
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sample</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { key: 'rootNote', label: 'Root', min: 0, max: 127, def: 60 },
                          { key: 'sampleStart', label: 'Start', min: 0, max: 100, def: 0 },
                          { key: 'sampleEnd', label: 'End', min: 0, max: 100, def: 100 },
                        ].map(({ key, label, min, max, def }) => (
                          <div key={key} style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: '6px 8px', border: '1px solid #1a1a1e' }}>
                            <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
                            <input type="range" min={min} max={max} value={params[key] ?? def} onChange={e => updateParam(key, Number(e.target.value))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                            <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{key === 'rootNote' ? `C${Math.floor((params[key] ?? def) / 12) - 1}` : `${params[key] ?? def}%`}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Output / Mix */}
                <div style={{ width: 160, borderLeft: '1px solid #1a1a1e', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Output</div>
                  <div style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: 8, border: '1px solid #1a1a1e' }}>
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Volume</div>
                    <input type="range" min={0} max={100} value={Math.round(inst.volume * 100)} onChange={e => setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, volume: Number(e.target.value) / 100 } : t))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{Math.round(inst.volume * 100)}%</div>
                  </div>
                  <div style={{ background: 'var(--color-bg-base)', borderRadius: 6, padding: 8, border: '1px solid #1a1a1e' }}>
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Pan</div>
                    <input type="range" min={-100} max={100} value={Math.round(inst.pan * 100)} onChange={e => setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, pan: Number(e.target.value) / 100 } : t))} style={{ width: '100%', accentColor: INSTRUMENT_COLORS[inst.instrument.type], height: 3 }} />
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{inst.pan === 0 ? 'C' : inst.pan > 0 ? `R${Math.round(inst.pan * 100)}` : `L${Math.abs(Math.round(inst.pan * 100))}`}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button aria-label="Mute instrument track" onClick={() => setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, muted: !t.muted } : t))} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid #27272a', background: inst.muted ? 'rgba(10,132,255,0.2)' : '#18181b', color: inst.muted ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>M</button>
                    <button aria-label="Solo instrument track" onClick={() => setInstrumentTracks(prev => prev.map(t => t.id === inst.id ? { ...t, solo: !t.solo } : t))} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid #27272a', background: inst.solo ? 'rgba(255,149,0,0.2)' : '#18181b', color: inst.solo ? '#ff9500' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>S</button>
                  </div>
                  <button aria-label="Remove instrument track" onClick={() => { setInstrumentTracks(prev => prev.filter(t => t.id !== inst.id)); setShowInstrumentEditor(false); }} style={{ padding: '6px', borderRadius: 5, border: '1px solid rgba(255,55,95,0.2)', background: 'rgba(255,55,95,0.08)', color: '#ff375f', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>Remove Track</button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Resize Handle */}
        <div className="resize-handle" onMouseDown={() => setIsResizingPlugin(true)} style={{ width: '4px', display: viewMode === 'arrange' ? 'block' : 'none' }} />

        {/* Plugin Panel */}
        {selectedTrackData && viewMode === 'arrange' && (
          <div style={{ width: pluginPanelWidth, minWidth: 180, background: 'linear-gradient(180deg, #0c0c0f, #09090b)', borderLeft: '1px solid #1a1a1e', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, #111114, #0d0d10)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-accent)' }}>{selectedTrackData.name}</span>
              <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', padding: '2px 6px', background: '#0f0f12', borderRadius: '4px' }}>{selectedTrackData.plugins.length}/{MAX_PLUGINS_PER_TRACK}</span>
            </div>
            
            {/* Routing Section */}
            <div style={{ padding: '10px', borderBottom: '1px solid #1a1a1e', background: '#0a0a0d' }}>
              <div className="section-title" style={{ marginBottom: '8px' }}>Routing</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', width: '34px' }}>Out:</span>
                <select value={selectedTrackData.output} onChange={(e) => { updateTrack(selectedTrackData.id, { output: e.target.value as RoutingDestination }); getAudioEngine().routeTrackToOutput(selectedTrackData.id, e.target.value as RoutingDestination); }} style={{ flex: 1, padding: '4px 6px', background: 'var(--color-bg-base)', border: '1px solid #1f1f23', borderRadius: '5px', color: 'var(--color-text-primary)', fontSize: '10px' }}>
                  <option value="master">Master</option>
                  {buses.filter(b => b.type === 'group').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <button aria-label="Phase" onClick={() => updateTrack(selectedTrackData.id, { phase: !selectedTrackData.phase })} style={{ padding: '4px 8px', background: selectedTrackData.phase ? 'rgba(255,69,58,0.2)' : '#111114', border: '1px solid', borderColor: selectedTrackData.phase ? 'rgba(255,69,58,0.3)' : '#1f1f23', borderRadius: '5px', color: selectedTrackData.phase ? 'var(--color-error)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.phase} Phase</button>
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Trim:</span>
                <input type="range" min="-24" max="24" step="0.5" value={selectedTrackData.trim} onChange={(e) => updateTrack(selectedTrackData.id, { trim: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', width: '32px', textAlign: 'right', fontFamily: '"SF Mono", monospace' }}>{selectedTrackData.trim.toFixed(1)}</span>
              </div>
              
              {/* Sends */}
              <div style={{ fontSize: '8px', fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: '6px', marginBottom: '2px' }}>SENDS</div>
              {selectedTrackData.sends.map(send => {
                const bus = buses.find(b => b.id === send.busId);
                return (
                  <div key={send.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '8px', color: bus?.color || 'var(--color-text-tertiary)', width: '40px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bus?.name || 'Bus'}</span>
                    <input type="range" min="0" max="1" step="0.01" value={send.level} onChange={(e) => updateSend(selectedTrackData.id, send.id, { level: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                    <button aria-label={send.preFader ? 'Switch to post-fader' : 'Switch to pre-fader'} onClick={() => updateSend(selectedTrackData.id, send.id, { preFader: !send.preFader })} style={{ padding: '1px 3px', background: send.preFader ? 'rgba(48,209,88,0.2)' : '#111113', border: '1px solid #27272a', borderRadius: '2px', color: send.preFader ? 'var(--color-success)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '7px' }}>{send.preFader ? 'PRE' : 'POST'}</button>
                    <button aria-label="Remove send" onClick={() => removeSend(selectedTrackData.id, send.id)} style={{ width: '14px', height: '14px', background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: '2px', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}>x</button>
                  </div>
                );
              })}
              {buses.filter(b => b.type === 'fx' && !selectedTrackData.sends.some(s => s.busId === b.id)).length > 0 && selectedTrackData.sends.length < MAX_SENDS_PER_TRACK && (
                <select onChange={(e) => { if (e.target.value) addSend(selectedTrackData.id, e.target.value); e.target.value = ''; }} style={{ width: '100%', padding: '2px 4px', background: 'var(--color-bg-base)', border: '1px solid #27272a', borderRadius: '3px', color: 'var(--color-text-tertiary)', fontSize: '8px', marginTop: '2px' }}>
                  <option value="">+ Add Send</option>
                  {buses.filter(b => b.type === 'fx' && !selectedTrackData.sends.some(s => s.busId === b.id)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>

            {/* Plugins */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
              {selectedTrackData.plugins.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-disabled)', fontSize: '10px' }}>No plugins added.<br/>Press P or click "Add Plugin"</div>
              ) : (
                selectedTrackData.plugins.map(plugin => {
                  const lib = PLUGIN_LIBRARY[plugin.type];
                  const presets = PLUGIN_PRESETS[plugin.type] || [];
                  return (
                    <div key={plugin.id} style={{ padding: '6px', marginBottom: '4px', background: 'var(--color-bg-base)', borderRadius: '6px', border: `1px solid ${lib.color}30`, opacity: plugin.enabled ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button aria-label="ON" onClick={() => togglePlugin(selectedTrackData.id, plugin.id)} style={{ width: '16px', height: '14px', borderRadius: '3px', border: 'none', background: plugin.enabled ? lib.color : 'var(--color-bg-hover)', color: '#fff', cursor: 'pointer', fontSize: '6px', fontWeight: 700 }}>ON</button>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: lib.color }}>{lib.abbr}</span>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{lib.name}</span>
                        </div>
                        <button aria-label="Delete" onClick={() => removePlugin(selectedTrackData.id, plugin.id)} style={{ width: '16px', height: '16px', borderRadius: '3px', border: 'none', background: 'rgba(255,69,58,0.1)', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.trash}</button>
                      </div>
                      {/* Preset Selector with Custom Presets */}
                      <div style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <select onChange={e => { if (e.target.value) applyPluginPreset(selectedTrackData.id, plugin.id, e.target.value, plugin.type); }} style={{ flex: 1, padding: '4px 6px', borderRadius: '4px', background: 'var(--color-bg-base)', border: `1px solid ${lib.color}40`, color: 'var(--color-text-secondary)', fontSize: '9px', cursor: 'pointer' }} defaultValue="">
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
                          <button aria-label="Save preset" onClick={() => { setShowSavePresetModal({ type: 'plugin', pluginType: plugin.type, trackId: selectedTrackData.id, pluginId: plugin.id }); setNewPresetName(''); }} style={{ padding: '4px 6px', borderRadius: '4px', background: 'var(--color-bg-base)', border: `1px solid ${lib.color}40`, color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '9px' }} title="Save preset">+</button>
                        </div>
                      </div>
                      {lib.params.map(param => (
                        <div key={param.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                          <span style={{ width: '36px', fontSize: '8px', color: 'var(--color-text-tertiary)' }}>{param.label}</span>
                          {param.key === 'sidechainSource' ? (
                            <select value={plugin.params[param.key] ?? -1} onChange={(e) => updatePluginParam(selectedTrackData.id, plugin.id, param.key, parseInt(e.target.value))} style={{ flex: 1, padding: '2px 4px', background: 'var(--color-bg-base)', border: '1px solid #bf5af240', borderRadius: '3px', color: '#bf5af2', fontSize: '8px', cursor: 'pointer' }}>
                              <option value={-1}>None (No SC)</option>
                              {tracks.filter(t => t.id !== selectedTrackData.id).map((t, i) => (
                                <option key={t.id} value={i}>{t.name}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <input type="range" min={param.min} max={param.max} step={(param.max - param.min) / 100} value={plugin.params[param.key] ?? param.default} onChange={(e) => updatePluginParam(selectedTrackData.id, plugin.id, param.key, parseFloat(e.target.value))} style={{ flex: 1 }} />
                              <span style={{ width: '32px', fontSize: '8px', color: lib.color, textAlign: 'right', fontFamily: 'monospace' }}>{(plugin.params[param.key] ?? param.default).toFixed(param.max > 100 ? 0 : 1)}</span>
                            </>
                          )}
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
          <div style={{ position: 'absolute', top: 4, right: 8, fontSize: 10, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>Spectrum Analyzer</div>
        </div>
      )}

      {/* ===== NEW PRO FEATURE PANELS ===== */}

      {/* 1. Batch Fade */}
      {showBatchFade && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Batch Fade</span>
            <button aria-label="Close Batch Fade panel" onClick={() => setShowBatchFade(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>Fade In</span>
              <input type="range" min="0" max="500" value={batchFadeIn} onChange={e => setBatchFadeIn(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{batchFadeIn}ms</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>Fade Out</span>
              <input type="range" min="0" max="500" value={batchFadeOut} onChange={e => setBatchFadeOut(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{batchFadeOut}ms</span>
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Curve</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: 10 }}>
              {(['linear', 'exponential', 'sCurve', 'logarithmic'] as const).map(c => (
                <button key={c} onClick={() => setBatchFadeCurve(c)} aria-label={`${c} fade curve`} style={{ padding: '4px 2px', borderRadius: 4, border: '1px solid ' + (batchFadeCurve === c ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: batchFadeCurve === c ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: batchFadeCurve === c ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 7, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{c}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Apply fades to all clips" onClick={() => { const fadeInSec = batchFadeIn / 1000; const fadeOutSec = batchFadeOut / 1000; setTracks(prev => prev.map(t => ({ ...t, clips: t.clips.map(c => ({ ...c, fadeIn: fadeInSec, fadeOut: fadeOutSec })) }))); setShowBatchFade(false); }} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply to All Clips</button>
              <button aria-label="Apply fades to selected" onClick={() => { if (!forgeClip) { setShowBatchFade(false); return; } const fadeInSec = batchFadeIn / 1000; const fadeOutSec = batchFadeOut / 1000; updateClip(forgeClip.trackId, forgeClip.clip.id, { fadeIn: fadeInSec, fadeOut: fadeOutSec }); setShowBatchFade(false); }} style={{ flex: 1, padding: '7px', borderRadius: 6, border: '1px solid rgba(10,132,255,0.2)', background: 'rgba(10,132,255,0.06)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Selected Only</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Time Stretch */}
      {showTimeStretch && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Time Stretch</span>
            <button aria-label="Close Time Stretch panel" onClick={() => setShowTimeStretch(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 40 }}>Ratio</span>
              <input type="range" min="25" max="400" value={stretchRatio} onChange={e => setStretchRatio(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{stretchRatio}%</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {[50, 75, 100, 150, 200].map(r => <button key={r} onClick={() => setStretchRatio(r)} aria-label={`${r}% stretch`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (stretchRatio === r ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: stretchRatio === r ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: stretchRatio === r ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 8, cursor: 'pointer' }}>{r}%</button>)}
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Algorithm</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
              {(['elastique', 'complex', 'speech', 'monophonic'] as const).map(a => (
                <button key={a} onClick={() => setStretchAlgorithm(a)} aria-label={`${a} stretch algorithm`} style={{ padding: '5px', borderRadius: 4, border: '1px solid ' + (stretchAlgorithm === a ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: stretchAlgorithm === a ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: stretchAlgorithm === a ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{a}</button>
              ))}
            </div>
            <button aria-label="Apply time stretch" onClick={() => { if (forgeClip) { const factor = stretchRatio / 100; updateClip(forgeClip.trackId, forgeClip.clip.id, { duration: forgeClip.clip.duration * factor }); } setShowTimeStretch(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply Stretch</button>
          </div>
        </div>
      )}

      {/* 3. Pitch Shift */}
      {showPitchShift && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Pitch Shift</span>
            <button aria-label="Close Pitch Shift panel" onClick={() => setShowPitchShift(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>Semitones</span>
              <input type="range" min="-24" max="24" value={pitchSemitones} onChange={e => setPitchSemitones(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 20, textAlign: 'right' }}>{pitchSemitones > 0 ? '+' : ''}{pitchSemitones}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>Fine (cents)</span>
              <input type="range" min="-100" max="100" value={pitchCents} onChange={e => setPitchCents(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 20, textAlign: 'right' }}>{pitchCents > 0 ? '+' : ''}{pitchCents}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {[-12, -7, -5, 0, 5, 7, 12].map(s => <button key={s} onClick={() => setPitchSemitones(s)} aria-label={`Shift ${s} semitones`} style={{ flex: 1, padding: '3px', borderRadius: 3, border: '1px solid ' + (pitchSemitones === s ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: pitchSemitones === s ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: pitchSemitones === s ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 7, cursor: 'pointer' }}>{s > 0 ? '+' : ''}{s}</button>)}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
              <input type="checkbox" checked={pitchPreserveFormant} onChange={e => setPitchPreserveFormant(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Preserve formants
            </label>
            <button aria-label="Apply pitch shift" onClick={() => { if (forgeClip) { const totalCents = pitchSemitones * 100 + pitchCents; updateClip(forgeClip.trackId, forgeClip.clip.id, { pitch: totalCents, formantPreserve: pitchPreserveFormant }); } setShowPitchShift(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply Pitch Shift</button>
          </div>
        </div>
      )}

      {/* 4. Track Templates */}
      {showTrackTemplates && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Templates</span>
            <button aria-label="Close Track Templates panel" onClick={() => setShowTrackTemplates(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {trackTemplateList.map(t => (
              <button key={t.id} aria-label={`Create ${t.name} track`} onClick={() => setShowTrackTemplates(false)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{t.name}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{t.desc}</span>
              </button>
            ))}
            <div style={{ marginTop: 6, padding: 8, borderRadius: 6, border: '2px dashed var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Save current track as template...</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Marker Regions */}
      {showMarkerRegions && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Arrangement Regions</span>
            <button aria-label="Close Marker Regions panel" onClick={() => setShowMarkerRegions(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Add region" onClick={() => setMarkerRegions(prev => [...prev, { id: `r-${Date.now()}`, name: `Section ${prev.length + 1}`, start: currentTime, end: currentTime + 16, color: ['var(--color-warning)', 'var(--color-success)', 'var(--color-accent)', '#bf5af2', '#FF375F', '#64D2FF'][prev.length % 6] }])} style={{ width: '100%', padding: '5px', borderRadius: 5, border: '1px solid rgba(10,132,255,0.2)', background: 'rgba(10,132,255,0.08)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Add Region</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {markerRegions.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: r.color }} />
                  <input type="text" value={r.name} onChange={e => setMarkerRegions(prev => prev.map(rr => rr.id === r.id ? { ...rr, name: e.target.value } : rr))} style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-hover)', borderRadius: 3, color: '#ccc', fontSize: 9, padding: '2px 4px' }} />
                  <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>Bar {r.start}-{r.end}</span>
                  <button aria-label="Delete region" onClick={() => setMarkerRegions(prev => prev.filter(rr => rr.id !== r.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. Tempo Map */}
      {showTempoMap && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Tempo Map</span>
            <button aria-label="Close Tempo Map panel" onClick={() => setShowTempoMap(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Add tempo change" onClick={() => setTempoChanges(prev => [...prev, { id: `tc-${Date.now()}`, bar: prev.length > 0 ? prev[prev.length - 1].bar + 16 : 1, bpm: 120, curve: 'instant' }])} style={{ width: '100%', padding: '5px', borderRadius: 5, border: '1px solid rgba(255,159,10,0.2)', background: 'rgba(255,159,10,0.08)', color: 'var(--color-warning)', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Add Tempo Change</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {tempoChanges.map(tc => (
                <div key={tc.id} style={{ padding: '6px', marginBottom: 4, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 25 }}>Bar</span>
                    <input type="number" value={tc.bar} min={1} onChange={e => setTempoChanges(prev => prev.map(t => t.id === tc.id ? { ...t, bar: Number(e.target.value) } : t))} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-hover)', borderRadius: 3, color: '#ccc', fontSize: 9, padding: '2px 4px', textAlign: 'center' }} />
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28 }}>BPM</span>
                    <input type="number" value={tc.bpm} min={20} max={300} onChange={e => setTempoChanges(prev => prev.map(t => t.id === tc.id ? { ...t, bpm: Number(e.target.value) } : t))} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-hover)', borderRadius: 3, color: '#ccc', fontSize: 9, padding: '2px 4px', textAlign: 'center' }} />
                    <select value={tc.curve} onChange={e => setTempoChanges(prev => prev.map(t => t.id === tc.id ? { ...t, curve: e.target.value as any } : t))} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-bg-hover)', borderRadius: 3, color: 'var(--color-text-tertiary)', fontSize: 8, padding: '2px' }}>
                      <option value="instant">Instant</option>
                      <option value="linear">Linear</option>
                      <option value="ease">Ease</option>
                    </select>
                    <button aria-label="Delete tempo change" onClick={() => setTempoChanges(prev => prev.filter(t => t.id !== tc.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}><DexIcon name="close" size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. Groove Quantize */}
      {showGrooveQuant && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Groove Quantize</span>
            <button aria-label="Close Groove Quantize panel" onClick={() => setShowGrooveQuant(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Groove Template</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
              {[{ id: 'none', name: 'None' }, { id: 'mpc60', name: 'MPC 60' }, { id: 'sp1200', name: 'SP-1200' }, { id: 'tr808', name: 'TR-808' }, { id: 'linnDrum', name: 'LinnDrum' }, { id: 'motown', name: 'Motown' }, { id: 'reggae', name: 'Reggae' }, { id: 'shuffle', name: 'Shuffle' }].map(g => (
                <button key={g.id} onClick={() => setGrooveTemplate(g.id)} aria-label={`${g.name} groove template`} style={{ padding: '5px', borderRadius: 4, border: '1px solid ' + (grooveTemplate === g.id ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: grooveTemplate === g.id ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: grooveTemplate === g.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{g.name}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 45 }}>Strength</span>
              <input type="range" min="0" max="100" value={grooveStrength} onChange={e => setGrooveStrength(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{grooveStrength}%</span>
            </div>
            <button aria-label="Apply groove" onClick={() => { setShowGrooveQuant(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply Groove</button>
          </div>
        </div>
      )}

      {/* 8. Track Color */}
      {showTrackColor && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Color</span>
            <button aria-label="Close Track Color panel" onClick={() => setShowTrackColor(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {selectedTrack ? (
              <>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Track: {tracks.find(t => t.id === selectedTrack)?.name || 'Unknown'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, marginBottom: 10 }}>
                  {['var(--color-error)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', '#64D2FF', 'var(--color-accent)', '#bf5af2', '#FF375F', '#AC8E68', 'var(--color-text-tertiary)', '#FF6482', '#32ADE6', '#66D4CF', '#FF9500', '#A2845E', 'var(--color-text-primary)'].map(c => (
                    <button key={c} aria-label={`Set track color to ${c}`} onClick={() => { setTracks(prev => prev.map(t => t.id === selectedTrack ? { ...t, color: c } : t)); }} style={{ width: '100%', aspectRatio: '1', borderRadius: 4, background: c, border: '1px solid var(--color-border)', cursor: 'pointer' }} />
                  ))}
                </div>
                <button aria-label="Random color" onClick={() => setTracks(prev => prev.map(t => t.id === selectedTrack ? { ...t, color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0') } : t))} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 10, cursor: 'pointer' }}>Random Color</button>
              </>
            ) : <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>Select a track first</div>}
          </div>
        </div>
      )}

      {/* 9. Clip Effects */}
      {showClipFx && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Clip Effects</span>
            <button aria-label="Close Clip Effects panel" onClick={() => setShowClipFx(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            <div style={{ marginBottom: 8, fontSize: 9, color: 'var(--color-text-tertiary)' }}>Apply effects directly to individual clips instead of the whole track.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {['Reverse', 'Normalize', 'Fade In', 'Fade Out', 'Gain +3dB', 'Gain -3dB', 'Silence', 'DC Offset', 'Phase Invert', 'Mono'].map(fx => (
                <button key={fx} aria-label={`Apply ${fx} to clip`} onClick={() => {
                  if (!forgeClip) return;
                  const c = forgeClip.clip;
                  const wf = c.waveform || [];
                  switch (fx) {
                    case 'Reverse': updateClip(forgeClip.trackId, c.id, { waveform: [...wf].reverse(), reverse: !c.reverse }); break;
                    case 'Normalize': { const peak = Math.max(...wf.map(Math.abs), 0.01); updateClip(forgeClip.trackId, c.id, { waveform: wf.map(s => s / peak), gain: 1.0 }); break; }
                    case 'Fade In': updateClip(forgeClip.trackId, c.id, { fadeIn: Math.max(0.5, c.fadeIn || 0) }); break;
                    case 'Fade Out': updateClip(forgeClip.trackId, c.id, { fadeOut: Math.max(0.5, c.fadeOut || 0) }); break;
                    case 'Gain +3dB': updateClip(forgeClip.trackId, c.id, { gain: Math.min(4, (c.gain || 1) * 1.4125) }); break;
                    case 'Gain -3dB': updateClip(forgeClip.trackId, c.id, { gain: Math.max(0, (c.gain || 1) * 0.7079) }); break;
                    case 'Silence': updateClip(forgeClip.trackId, c.id, { waveform: wf.map(() => 0), gain: 0 }); break;
                    case 'DC Offset': { const mean = wf.reduce((a, b) => a + b, 0) / Math.max(1, wf.length); updateClip(forgeClip.trackId, c.id, { waveform: wf.map(s => s - mean) }); break; }
                    case 'Phase Invert': updateClip(forgeClip.trackId, c.id, { waveform: wf.map(s => -s) }); break;
                    case 'Mono': updateClip(forgeClip.trackId, c.id, { waveform: wf.map(s => s) }); break;
                  }
                }} style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 9, cursor: 'pointer' }}>{fx}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 10. Reference Track */}
      {showReferenceTrack && (
        <div style={{ position: 'fixed', right: 20, top: 160, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Reference Track</span>
            <button aria-label="Close Reference Track panel" onClick={() => setShowReferenceTrack(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {referenceUrl ? (
              <>
                <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-success)', flex: 1 }}>Reference loaded</span>
                  <button aria-label="Remove reference" onClick={() => { setReferenceUrl(''); setReferencePlaying(false); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}><DexIcon name="close" size={11} /></button>
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <button aria-label={referencePlaying ? 'Pause reference' : 'Play reference'} onClick={() => setReferencePlaying(!referencePlaying)} style={{ flex: 1, padding: '6px', borderRadius: 5, border: 'none', background: referencePlaying ? 'var(--color-success)' : 'rgba(48,209,88,0.1)', color: referencePlaying ? '#000' : 'var(--color-success)', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{referencePlaying ? <><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1" /><rect x="9" y="2" width="4" height="12" rx="1" /></svg> Pause</> : <><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6z" /></svg> Play</>}</button>
                  <button aria-label="A/B switch" onClick={() => { setReferencePlaying(p => !p); setMasterSettings(s => ({ ...s, volume: s.volume > 0 ? 0 : 0.8 })); }} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid rgba(10,132,255,0.2)', background: 'rgba(10,132,255,0.06)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>A/B</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 35 }}>Level</span>
                  <input type="range" min="0" max="100" value={Math.round(referenceVolume * 100)} onChange={e => setReferenceVolume(Number(e.target.value) / 100)} style={{ flex: 1, accentColor: 'var(--color-success)' }} />
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{Math.round(referenceVolume * 100)}%</span>
                </div>
              </>
            ) : (
              <div style={{ padding: 16, borderRadius: 6, border: '2px dashed var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }} onClick={() => setReferenceUrl('reference-loaded')}>
                <div style={{ fontSize: 16, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'flex', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Drop reference mix here</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. Bus Compressor */}
      {showBusComp && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Bus Compressor</span>
            <button aria-label="Close Bus Compressor panel" onClick={() => setShowBusComp(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Threshold', val: busCompThreshold, set: setBusCompThreshold, min: -60, max: 0, unit: 'dB' }, { label: 'Ratio', val: busCompRatio, set: setBusCompRatio, min: 1, max: 20, unit: ':1' }, { label: 'Attack', val: busCompAttack, set: setBusCompAttack, min: 0, max: 100, unit: 'ms' }, { label: 'Release', val: busCompRelease, set: setBusCompRelease, min: 10, max: 1000, unit: 'ms' }, { label: 'Makeup', val: busCompMakeup, set: setBusCompMakeup, min: 0, max: 24, unit: 'dB' }].map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>{p.label}</span>
                <input type="range" min={p.min} max={p.max} value={p.val} onChange={e => p.set(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-error)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 30, textAlign: 'right' }}>{p.val}{p.unit}</span>
              </div>
            ))}
            <div style={{ height: 24, background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>GR: 0.0 dB</span>
            </div>
          </div>
        </div>
      )}

      {/* 12. Tape Emulation */}
      {showTapeEmu && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Tape Emulation</span>
            <button aria-label="Close Tape Emulation panel" onClick={() => setShowTapeEmu(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Drive', val: tapeDrive, set: setTapeDrive }, { label: 'Warmth', val: tapeWarmth, set: setTapeWarmth }, { label: 'Hiss', val: tapeHiss, set: setTapeHiss }, { label: 'Wow/Fltr', val: tapeWow, set: setTapeWow }].map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>{p.label}</span>
                <input type="range" min="0" max="100" value={p.val} onChange={e => p.set(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-warning)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{p.val}%</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginTop: 8 }}>
              {[{ n: '15 ips', d: 30, w: 40 }, { n: '30 ips', d: 20, w: 55 }, { n: 'Cassette', d: 50, w: 30 }].map(p => (
                <button key={p.n} aria-label={`${p.n} tape preset`} onClick={() => { setTapeDrive(p.d); setTapeWarmth(p.w); }} style={{ padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 8, cursor: 'pointer' }}>{p.n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 13. Mid/Side Processing */}
      {showMidSide && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Mid/Side Processing</span>
            <button aria-label="Close Mid/Side panel" onClick={() => setShowMidSide(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>Mid Gain</span>
              <input type="range" min="-12" max="12" value={midGain} onChange={e => { const v = Number(e.target.value); setMidGain(v); setMasterSettings(s => ({ ...s, midSideBalance: v - sideGain })); }} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{midGain > 0 ? '+' : ''}{midGain}dB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>Side Gain</span>
              <input type="range" min="-12" max="12" value={sideGain} onChange={e => { const v = Number(e.target.value); setSideGain(v); setMasterSettings(s => ({ ...s, midSideBalance: midGain - v })); }} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{sideGain > 0 ? '+' : ''}{sideGain}dB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50 }}>Width</span>
              <input type="range" min="0" max="200" value={midSideWidth} onChange={e => { const v = Number(e.target.value); setMidSideWidth(v); setMasterSettings(s => ({ ...s, stereoWidth: v })); }} style={{ flex: 1, accentColor: 'var(--color-success)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{midSideWidth}%</span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[{ n: 'Mono', w: 0 }, { n: 'Narrow', w: 50 }, { n: 'Normal', w: 100 }, { n: 'Wide', w: 150 }, { n: 'Super', w: 200 }].map(p => (
                <button key={p.n} onClick={() => setMidSideWidth(p.w)} aria-label={`${p.n} width preset`} style={{ flex: 1, padding: '4px', borderRadius: 3, border: '1px solid ' + (midSideWidth === p.w ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: midSideWidth === p.w ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: midSideWidth === p.w ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 7, cursor: 'pointer' }}>{p.n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 14. Sample Rate Convert */}
      {showSRConvert && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Sample Rate Convert</span>
            <button aria-label="Close Sample Rate Convert panel" onClick={() => setShowSRConvert(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Current: {sampleRate / 1000}kHz / {bitDepth}-bit</div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Target Sample Rate</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginBottom: 10 }}>
              {[22050, 44100, 48000, 88200, 96000, 192000].map(sr => (
                <button key={sr} onClick={() => setSampleRate(sr as any)} aria-label={`Set sample rate to ${sr}`} style={{ padding: '5px', borderRadius: 4, border: '1px solid ' + (sampleRate === sr ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: sampleRate === sr ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: sampleRate === sr ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{sr >= 1000 ? sr / 1000 + 'k' : sr}</button>
              ))}
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Bit Depth</span>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {[16, 24, 32].map(bd => (
                <button key={bd} onClick={() => setBitDepth(bd as any)} aria-label={`${bd}-bit depth`} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid ' + (bitDepth === bd ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: bitDepth === bd ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: bitDepth === bd ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{bd}-bit</button>
              ))}
            </div>
            <button aria-label="Convert project sample rate" onClick={() => setShowSRConvert(false)} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Convert Project</button>
          </div>
        </div>
      )}

      {/* 15. Loudness Penalty */}
      {showLoudPenalty && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Loudness Penalty</span>
            <button aria-label="Close Loudness Penalty panel" onClick={() => setShowLoudPenalty(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Streaming platform loudness targets</div>
            {[{ name: 'Spotify', target: -14, color: '#1DB954' }, { name: 'Apple Music', target: -16, color: '#FC3C44' }, { name: 'YouTube', target: -14, color: '#FF0000' }, { name: 'Amazon Music', target: -14, color: '#00A8E1' }, { name: 'Tidal', target: -14, color: '#000' }, { name: 'SoundCloud', target: -14, color: '#FF5500' }].map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, border: p.color === '#000' ? '1px solid #333' : 'none' }} />
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{p.target} LUFS</span>
                <span style={{ fontSize: 8, color: 'var(--color-success)', fontWeight: 600 }}>OK</span>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: 6, borderRadius: 4, background: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Integrated: -14.2 LUFS | True Peak: -1.0 dBTP</span>
            </div>
          </div>
        </div>
      )}

      {/* 16. Track Notes */}
      {showTrackNotes && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Notes</span>
            <button aria-label="Close Track Notes panel" onClick={() => setShowTrackNotes(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, maxHeight: 280, overflowY: 'auto' }}>
            {tracks.length === 0 && <div style={{ fontSize: 10, color: '#303030', textAlign: 'center', padding: 12 }}></div>}
            {tracks.map(t => (
              <div key={t.id} style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 2 }}>{t.name}</span>
                <textarea value={trackNotes[t.id] || ''} onChange={e => setTrackNotes(prev => ({ ...prev, [t.id]: e.target.value }))} placeholder="Add notes..." rows={2} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 17. Plugin Chain Presets */}
      {showChainPreset && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>FX Chain Presets</span>
            <button aria-label="Close FX Chain Presets panel" onClick={() => setShowChainPreset(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {chainPresets.map(cp => (
              <button key={cp.id} aria-label={`Load ${cp.name} chain preset`} onClick={() => setShowChainPreset(false)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 2 }}>{cp.name}</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {cp.effects.map(e => <span key={e} style={{ fontSize: 8, color: 'var(--color-text-tertiary)', padding: '1px 4px', borderRadius: 2, background: 'var(--color-border-subtle)' }}>{e}</span>)}
                </div>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {chainPresetNameDraft !== null ? (
                <input
                  autoFocus
                  value={chainPresetNameDraft}
                  onChange={e => setChainPresetNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const name = chainPresetNameDraft.trim() || `Custom ${chainPresets.length + 1}`;
                      setChainPresets(prev => [...prev, { id: `cp-${Date.now()}`, name, effects: ['EQ', 'Compressor'] }]);
                      setChainPresetNameDraft(null);
                    }
                    if (e.key === 'Escape') setChainPresetNameDraft(null);
                  }}
                  onBlur={() => setChainPresetNameDraft(null)}
                  placeholder={`Custom ${chainPresets.length + 1}`}
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid rgba(10,132,255,0.4)', background: 'rgba(10,132,255,0.08)', color: 'var(--color-accent)', fontSize: 10, outline: 'none' }}
                />
              ) : (
                <button aria-label="Save current chain as preset" onClick={() => setChainPresetNameDraft('')} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid rgba(10,132,255,0.2)', background: 'rgba(10,132,255,0.08)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Save Current Chain</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 18. Warp Markers */}
      {showWarpMarkers && (
        <div style={{ position: 'fixed', right: 20, top: 200, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Warp Markers</span>
            <button aria-label="Close Warp Markers panel" onClick={() => setShowWarpMarkers(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Place warp markers to stretch specific sections of audio clips to align with the grid.</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['Beats', 'Tones', 'Texture', 'Re-Pitch', 'Complex'] as const).map(m => (
                <button key={m} aria-label={`${m} warp mode`} onClick={() => setWarpMode(m)} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (warpMode === m ? 'rgba(255,159,10,0.3)' : 'var(--color-bg-hover)'), background: warpMode === m ? 'rgba(255,159,10,0.1)' : 'var(--color-border-subtle)', color: warpMode === m ? 'var(--color-warning)' : 'var(--color-text-tertiary)', fontSize: 7, fontWeight: 600, cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
            <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{warpMarkers.length} marker{warpMarkers.length === 1 ? '' : 's'}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Auto-detect transients" onClick={() => { const wf = forgeClip?.clip.waveform || []; if (wf.length === 0) { setWarpMarkers([{ id: `w-${Date.now()}-1`, position: 0.25 }, { id: `w-${Date.now()}-2`, position: 0.5 }, { id: `w-${Date.now()}-3`, position: 0.75 }]); return; } const detected: Array<{ id: string; position: number }> = []; const window = 32; for (let i = window; i < wf.length - window; i += window) { const before = wf.slice(i - window, i).reduce((a, b) => a + Math.abs(b), 0) / window; const after = wf.slice(i, i + window).reduce((a, b) => a + Math.abs(b), 0) / window; if (after > before * 1.8 && after > 0.1) { detected.push({ id: `w-${Date.now()}-${i}`, position: i / wf.length }); } } setWarpMarkers(detected.slice(0, 64)); }} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid rgba(255,159,10,0.2)', background: 'rgba(255,159,10,0.08)', color: 'var(--color-warning)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Auto-Detect</button>
              <button aria-label="Clear warp markers" onClick={() => setWarpMarkers([])} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Clear All</button>
            </div>
          </div>
        </div>
      )}

      {/* 19. Track Groups */}
      {showTrackGroup && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Groups</span>
            <button aria-label="Close Track Groups panel" onClick={() => setShowTrackGroup(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Create new track group" onClick={() => setTrackGroups(prev => [...prev, { id: `tg-${Date.now()}`, name: `Group ${prev.length + 1}`, trackIds: selectedTrack ? [selectedTrack] : [], linkVolume: true, linkMute: true, linkSolo: true }])} style={{ width: '100%', padding: '5px', borderRadius: 5, border: '1px solid rgba(10,132,255,0.2)', background: 'rgba(10,132,255,0.08)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ New Group</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {trackGroups.length === 0 && <div style={{ fontSize: 10, color: '#303030', textAlign: 'center', padding: 12 }}></div>}
              {trackGroups.map(g => (
                <div key={g.id} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <input type="text" value={g.name} onChange={e => setTrackGroups(prev => prev.map(gg => gg.id === g.id ? { ...gg, name: e.target.value } : gg))} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600 }} />
                    <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{g.trackIds.length} trk</span>
                    <button aria-label="Delete group" onClick={() => setTrackGroups(prev => prev.filter(gg => gg.id !== g.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}><DexIcon name="close" size={11} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ k: 'linkVolume' as const, l: 'Vol' }, { k: 'linkMute' as const, l: 'Mute' }, { k: 'linkSolo' as const, l: 'Solo' }].map(lnk => (
                      <button key={lnk.k} aria-label={`Toggle link ${lnk.l}`} onClick={() => setTrackGroups(prev => prev.map(gg => gg.id === g.id ? { ...gg, [lnk.k]: !gg[lnk.k] } : gg))} style={{ flex: 1, padding: '3px', borderRadius: 3, border: '1px solid ' + (g[lnk.k] ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: g[lnk.k] ? 'rgba(10,132,255,0.08)' : 'var(--color-border-subtle)', color: g[lnk.k] ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 8, fontWeight: 600, cursor: 'pointer' }}>{lnk.l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 20. Advanced Export */}
      {showExportAdvanced && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Advanced Export</span>
            <button aria-label="Close Advanced Export panel" onClick={() => setShowExportAdvanced(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Format</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginBottom: 8 }}>
              {[{ id: 'wav', name: 'WAV' }, { id: 'flac', name: 'FLAC' }, { id: 'aiff', name: 'AIFF' }, { id: 'mp3', name: 'MP3' }, { id: 'ogg', name: 'OGG' }, { id: 'aac', name: 'AAC' }].map(f => (
                <button key={f.id} onClick={() => setExportFormatAdv(f.id)} aria-label={`Export as ${f.name}`} style={{ padding: '5px', borderRadius: 4, border: '1px solid ' + (exportFormatAdv === f.id ? 'rgba(48,209,88,0.3)' : 'var(--color-bg-hover)'), background: exportFormatAdv === f.id ? 'rgba(48,209,88,0.1)' : 'var(--color-border-subtle)', color: exportFormatAdv === f.id ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{f.name}</button>
              ))}
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Bit Depth</span>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {[16, 24, 32].map(b => (
                <button key={b} onClick={() => setExportBitDepth(b)} aria-label={`${b}-bit export`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (exportBitDepth === b ? 'rgba(48,209,88,0.3)' : 'var(--color-bg-hover)'), background: exportBitDepth === b ? 'rgba(48,209,88,0.1)' : 'var(--color-border-subtle)', color: exportBitDepth === b ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{b}-bit</button>
              ))}
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Sample Rate</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginBottom: 8 }}>
              {[44100, 48000, 88200, 96000, 176400, 192000].map(sr => (
                <button key={sr} onClick={() => setExportSR(sr)} aria-label={`Export at ${sr}Hz`} style={{ padding: '4px', borderRadius: 4, border: '1px solid ' + (exportSR === sr ? 'rgba(48,209,88,0.3)' : 'var(--color-bg-hover)'), background: exportSR === sr ? 'rgba(48,209,88,0.1)' : 'var(--color-border-subtle)', color: exportSR === sr ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontSize: 8, fontWeight: 600, cursor: 'pointer' }}>{sr >= 1000 ? sr / 1000 + 'k' : sr}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}><input type="checkbox" checked={exportDither} onChange={e => setExportDither(e.target.checked)} style={{ accentColor: 'var(--color-success)' }} />Dither</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}><input type="checkbox" checked={exportNormalize} onChange={e => setExportNormalize(e.target.checked)} style={{ accentColor: 'var(--color-success)' }} />Normalize</label>
            </div>
            <button aria-label="Export project" onClick={() => setShowExportAdvanced(false)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #30D158, #28a745)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><DexIcon name="download" size={12} />Export</button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 24, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1c 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '10px', color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: isRecording ? 'rgba(255,69,58,0.15)' : isPlaying ? 'rgba(48,209,88,0.15)' : '#0f0f12', borderRadius: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isRecording ? 'var(--color-error)' : isPlaying ? 'var(--color-success)' : '#3f3f46', boxShadow: isRecording ? '0 0 6px rgba(255,69,58,0.6)' : isPlaying ? '0 0 6px rgba(48,209,88,0.6)' : 'none' }} />
            <span style={{ color: isRecording ? 'var(--color-error)' : isPlaying ? '#4ade80' : 'var(--color-text-tertiary)', fontWeight: 600 }}>{isRecording ? 'RECORDING' : isPlaying ? 'PLAYING' : 'READY'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '2px 6px', background: '#0f0f12', borderRadius: '3px' }}>{bitDepth}-bit / {sampleRate/1000}kHz</span>
          <span style={{ color: 'var(--color-bg-hover)' }}>|</span>
          <span>{tracks.length} tracks</span>
          <span style={{ color: 'var(--color-bg-hover)' }}>|</span>
          <span>{buses.length} buses</span>
          <span style={{ color: 'var(--color-bg-hover)' }}>|</span>
          <span>{tracks.reduce((s, t) => s + t.clips.length, 0)} clips</span>
          <span style={{ color: 'var(--color-bg-hover)' }}>|</span>
          <span>{tracks.reduce((s, t) => s + t.plugins.length, 0)} FX</span>
        </div>
      </div>

      {/* Plugin Browser Modal */}
      {showPluginBrowser && selectedTrackData && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6500 }} onMouseDown={() => setShowPluginBrowser(false)}>
          <div className="modal-content" style={{ width: '320px', maxHeight: '70vh', background: '#1c1c20', borderRadius: '10px', border: '1px solid rgba(48,209,88,0.15)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 1px rgba(48,209,88,0.2)' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(48,209,88,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, rgba(48,209,88,0.08) 0%, transparent 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Audio FX</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>— {selectedTrackData.name}</span>
              </div>
              <button aria-label="Close" onClick={() => setShowPluginBrowser(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '2px' }}>{Icon.close}</button>
            </div>
            
            <div style={{ padding: '6px', maxHeight: '420px', overflowY: 'auto' }}>
              {selectedTrackData.plugins.length >= MAX_PLUGINS_PER_TRACK ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-error)', fontSize: '11px' }}>Maximum {MAX_PLUGINS_PER_TRACK} inserts reached</div>
              ) : (
                <>
                  {/* EQ & Dynamics */}
                  <div style={{ padding: '4px 8px', fontSize: '9px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>EQ & Dynamics</div>
                  {(['eq', 'compressor', 'limiter', 'gate', 'deesser'] as PluginType[]).map(type => { const lib = PLUGIN_LIBRARY[type]; return (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-imosion-plugin', type); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addPluginToTrack(selectedTrackData.id, type)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '4px', cursor: 'grab', transition: 'background 0.1s' }} className="dropdown-item">
                      <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: lib.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{lib.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{lib.abbr}</span>
                    </div>
                  ); })}

                  {/* Modulation & Time */}
                  <div style={{ padding: '4px 8px', fontSize: '9px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Modulation & Time</div>
                  {(['reverb', 'delay', 'chorus'] as PluginType[]).map(type => { const lib = PLUGIN_LIBRARY[type]; return (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-imosion-plugin', type); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addPluginToTrack(selectedTrackData.id, type)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '4px', cursor: 'grab', transition: 'background 0.1s' }} className="dropdown-item">
                      <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: lib.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{lib.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{lib.abbr}</span>
                    </div>
                  ); })}

                  {/* Utility */}
                  <div style={{ padding: '4px 8px', fontSize: '9px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Utility</div>
                  {(['saturation', 'autotune'] as PluginType[]).map(type => { const lib = PLUGIN_LIBRARY[type]; return (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-imosion-plugin', type); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addPluginToTrack(selectedTrackData.id, type)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '4px', cursor: 'grab', transition: 'background 0.1s' }} className="dropdown-item">
                      <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: lib.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{lib.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{lib.abbr}</span>
                    </div>
                  ); })}

                  {/* Installed external plugins */}
                  {installedPlugins.length > 0 && (
                    <>
                      <div style={{ padding: '4px 8px', fontSize: '9px', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '8px', borderTop: '1px solid #2a2a2e', paddingTop: '8px' }}>Third Party</div>
                      {installedPlugins.map(plugin => (
                        <div key={plugin.id} onClick={() => { setShowPluginBrowser(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }} className="dropdown-item">
                          <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: plugin.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{plugin.name}</span>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{plugin.vendor}</span>
                        </div>
                      ))}
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
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6500 }} onMouseDown={() => setShowPluginStore(false)}>
          <div className="modal-content" style={{ width: 'min(600px, calc(100vw - 32px))', maxHeight: 'min(85vh, calc(100vh - 32px))', background: 'var(--color-bg-base)', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to right, rgba(48,209,88,0.1), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--color-success)' }}>{Icon.store}</span>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Plugin Store</span>
              </div>
              <button aria-label="Close" onClick={() => setShowPluginStore(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            
            {/* Search */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1f1f23' }}>
              <input 
                value={pluginSearchQuery} 
                onChange={(e) => setPluginSearchQuery(e.target.value)} 
                placeholder="Search plugins by name, vendor, or category..." 
                style={{ width: '100%', padding: '8px 12px', background: 'var(--color-bg-base)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '11px' }} 
              />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid #1f1f23', gap: '4px' }}>
              <button aria-label="Browse plugins tab" onClick={() => setStoreActiveTab('browse')} style={{ padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: storeActiveTab === 'browse' ? '2px solid #30d158' : '2px solid transparent', color: storeActiveTab === 'browse' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer' }}>Browse ({filteredStorePlugins.length})</button>
              <button aria-label="Installed plugins tab" onClick={() => setStoreActiveTab('installed')} style={{ padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: storeActiveTab === 'installed' ? '2px solid #30d158' : '2px solid transparent', color: storeActiveTab === 'installed' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: '10px', cursor: 'pointer' }}>Installed ({installedPlugins.length})</button>
            </div>

            <div style={{ padding: '12px', maxHeight: '450px', overflowY: 'auto' }}>
              {storeActiveTab === 'browse' ? (
                <>
                  {/* Featured / Available */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {filteredStorePlugins.map(plugin => (
                      <div key={plugin.id} className="plugin-card" style={{ padding: '12px', background: '#0c0c0e', borderRadius: '8px', border: '1px solid #27272a' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: plugin.color }}>{plugin.name}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{plugin.vendor}</div>
                          </div>
                          <span style={{ fontSize: '8px', padding: '2px 5px', background: 'rgba(10,132,255,0.2)', color: 'var(--color-accent)', borderRadius: '3px' }}>{plugin.type.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>{plugin.category} v{plugin.version}</div>
                        <button
                          aria-label={`Install ${plugin.name}`}
                          onClick={() => installPlugin(plugin)}
                          style={{ width: '100%', padding: '6px', background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: '4px', color: 'var(--color-success)', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          {Icon.download} Install
                        </button>
                      </div>
                    ))}
                  </div>
                  {filteredStorePlugins.length === 0 && pluginSearchQuery && (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '11px' }}>No plugins found matching "{pluginSearchQuery}"</div>
                  )}
                </>
              ) : (
                <>
                  {installedPlugins.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '11px' }}>No plugins installed yet. Browse the store to find plugins.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      {installedPlugins.map(plugin => (
                        <div key={plugin.id} style={{ padding: '12px', background: '#0c0c0e', borderRadius: '8px', border: '1px solid rgba(48,209,88,0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--color-success)' }}>{Icon.check}</span>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: plugin.color }}>{plugin.name}</span>
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{plugin.vendor}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>{plugin.category} v{plugin.version}</div>
                          <button
                            aria-label={`Uninstall ${plugin.name}`}
                            onClick={() => uninstallPlugin(plugin.id)}
                            style={{ width: '100%', padding: '6px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '4px', color: 'var(--color-error)', cursor: 'pointer', fontSize: '10px' }}
                          >
                            Uninstall
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6500 }} onMouseDown={() => setShowTemplates(false)}>
          <div className="modal-content" style={{ width: '400px', maxHeight: '70vh', background: 'var(--color-bg-base)', borderRadius: '10px', border: '1px solid #27272a', overflow: 'hidden' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Templates</span>
              <button aria-label="Close" onClick={() => setShowTemplates(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '10px', maxHeight: '350px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Template name..." style={{ flex: 1, padding: '6px 10px', background: '#0c0c0e', border: '1px solid #27272a', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '11px', outline: 'none' }} />
                <button aria-label="Save" onClick={saveTemplate} style={{ padding: '6px 12px', background: 'var(--color-accent)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.save} Save</button>
              </div>
              {templates.map(tpl => (
                <div key={tpl.id} onClick={() => applyTemplate(tpl)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#0c0c0e', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', border: '1px solid #27272a', transition: 'all 0.15s' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600 }}>{tpl.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>{tpl.tracks.length} tracks / {tpl.bpm} BPM / {tpl.sampleRate/1000}k</div>
                  </div>
                  {!DEFAULT_TEMPLATES.find(d => d.id === tpl.id) && (
                    <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }} style={{ padding: '3px 6px', background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: '4px', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>{Icon.trash}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div className="tooltip" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, minWidth: '160px', background: 'var(--color-bg-base)', border: '1px solid #27272a', borderRadius: '8px', boxShadow: 'var(--pg-shadow-context)', zIndex: 6500, overflow: 'hidden', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.clipId ? (
            <>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) { duplicateClip(contextMenu.trackId, contextMenu.clipId); } setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.copy} Duplicate</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) { const track = tracks.find(t => t.id === contextMenu.trackId); const clip = track?.clips.find(c => c.id === contextMenu.clipId); if (clip) openForge(contextMenu.trackId, clip); } setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: '#ff375f', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.waveform} Open in Forge</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) { const track = tracks.find(t => t.id === contextMenu.trackId); const clip = track?.clips.find(c => c.id === contextMenu.clipId); if (clip) { setEditingClip({ trackId: contextMenu.trackId!, clip }); setShowClipEditor(true); } } setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.mixer} Edit Clip</div>
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 0' }} />
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
              }} style={{ padding: '8px 10px', fontSize: '10px', color: tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? 'var(--color-success)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? Icon.link : Icon.unlink}
                {tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.tempoLocked ? 'Unlock from Tempo' : 'Lock to Tempo'}
              </div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) updateClip(contextMenu.trackId, contextMenu.clipId, { reverse: !tracks.find(t => t.id === contextMenu.trackId)?.clips.find(c => c.id === contextMenu.clipId)?.reverse }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.reverse} Reverse</div>
              <div className="ctx-item" onClick={() => {
                if (contextMenu.trackId && contextMenu.clipId) {
                  const track = tracks.find(t => t.id === contextMenu.trackId);
                  const clip = track?.clips.find(c => c.id === contextMenu.clipId);
                  if (clip) {
                    const peak = clip.waveform.length > 0 ? Math.max(...clip.waveform.map(Math.abs)) : 1;
                    const normalizedGain = peak > 0 ? 1 / peak : 1;
                    updateClip(contextMenu.trackId!, contextMenu.clipId!, { gain: Math.min(4, normalizedGain) });
                  }
                }
                setContextMenu({ ...contextMenu, visible: false });
              }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.audio} Normalize</div>
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId && contextMenu.clipId) setTracks(prev => prev.map(t => t.id === contextMenu.trackId ? { ...t, clips: t.clips.filter(c => c.id !== contextMenu.clipId) } : t)); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-error)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.trash} Delete</div>
            </>
          ) : contextMenu.trackId ? (
            <>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { armed: !tracks.find(t => t.id === contextMenu.trackId)?.armed }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.mic} Arm Recording</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { muted: !tracks.find(t => t.id === contextMenu.trackId)?.muted }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }}>Mute Track</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { solo: !tracks.find(t => t.id === contextMenu.trackId)?.solo }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px' }}>Solo Track</div>
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) updateTrack(contextMenu.trackId, { phase: !tracks.find(t => t.id === contextMenu.trackId)?.phase }); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.phase} Phase Invert</div>
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { setShowPluginBrowser(true); setSelectedTrack(contextMenu.trackId); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.plugin} Add Plugin</div>
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 0' }} />
              <div className="ctx-item" onClick={() => { if (contextMenu.trackId) deleteTrack(contextMenu.trackId); setContextMenu({ ...contextMenu, visible: false }); }} style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--color-error)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.trash} Delete Track</div>
            </>
          ) : null}
        </div>
      )}

      {/* Clip Editor Modal */}
      {showClipEditor && editingClip && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6500 }} onMouseDown={() => setShowClipEditor(false)}>
          <div className="modal-content" style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: 'min(85vh, calc(100vh - 32px))', background: 'var(--color-bg-base)', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to right, rgba(10,132,255,0.1), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ color: 'var(--color-accent)' }}>{Icon.audio}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingClip.clip.name}</span>
              </div>
              <button aria-label="Close" onClick={() => setShowClipEditor(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1 }}>

              {/* Key Detection Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#bf5af2' }}>{Icon.music}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Key Detection</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      aria-label="Detect clip key"
                      onClick={() => detectClipKey(editingClip.trackId, editingClip.clip.id)}
                      style={{ padding: '4px 8px', background: 'rgba(191,90,242,0.2)', border: '1px solid rgba(191,90,242,0.3)', borderRadius: '4px', color: '#bf5af2', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}
                    >
                      Detect Key
                    </button>
                    <button 
                      aria-label={editingClip.clip.keyLocked ? 'Unlock from project key' : 'Lock to project key'}
                      onClick={() => editingClip.clip.keyLocked ? unlockClipFromKey(editingClip.trackId, editingClip.clip.id) : (editingClip.clip.detectedKey && lockClipToKey(editingClip.trackId, editingClip.clip.id))}
                      disabled={!editingClip.clip.detectedKey}
                      style={{ 
                        padding: '4px 10px', 
                        background: editingClip.clip.keyLocked ? 'rgba(48,209,88,0.2)' : 'rgba(113,113,122,0.2)', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.keyLocked ? 'rgba(48,209,88,0.3)' : '#3f3f46',
                        borderRadius: '4px', 
                        color: editingClip.clip.keyLocked ? 'var(--color-success)' : 'var(--color-text-tertiary)', 
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
                    <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Detected:</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: editingClip.clip.detectedKey ? '#bf5af2' : 'var(--color-text-tertiary)', padding: '2px 8px', background: 'var(--color-bg-elevated)', borderRadius: '4px' }}>
                      {editingClip.clip.detectedKey ? `${editingClip.clip.detectedKey} ${editingClip.clip.detectedScale}` : 'Not analyzed'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Project:</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-success)' }}>{projectKey.root} {projectKey.scale}</span>
                  </div>
                  {editingClip.clip.keyLocked && editingClip.clip.transposeAmount !== 0 && (
                    <span style={{ fontSize: '9px', color: 'var(--color-warning)' }}>Transposed: {editingClip.clip.transposeAmount > 0 ? '+' : ''}{editingClip.clip.transposeAmount} st</span>
                  )}
                </div>
              </div>

              {/* Tempo Matching Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--color-warning)' }}>{Icon.tempo}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Tempo Matching</span>
                  </div>
                  <button 
                    aria-label={editingClip.clip.tempoLocked ? 'Unmatch from project tempo' : 'Match to project tempo'}
                    onClick={() => editingClip.clip.tempoLocked ? unmatchClipFromTempo(editingClip.trackId, editingClip.clip.id) : matchClipToTempo(editingClip.trackId, editingClip.clip.id)}
                    style={{ 
                      padding: '4px 10px', 
                      background: editingClip.clip.tempoLocked ? 'rgba(48,209,88,0.2)' : 'rgba(113,113,122,0.2)', 
                      border: '1px solid', 
                      borderColor: editingClip.clip.tempoLocked ? 'rgba(48,209,88,0.3)' : '#3f3f46',
                      borderRadius: '4px', 
                      color: editingClip.clip.tempoLocked ? 'var(--color-success)' : 'var(--color-text-tertiary)', 
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
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', width: '75px' }}>Original BPM</span>
                  <input 
                    type="number" 
                    value={editingClip.clip.originalBPM || 120} 
                    onChange={(e) => setClipOriginalBPM(editingClip.trackId, editingClip.clip.id, Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
                    style={{ width: '60px', padding: '4px 6px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '4px', color: 'var(--color-warning)', fontSize: '11px', fontWeight: 600, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Project: {bpm} BPM</span>
                  {editingClip.clip.tempoLocked && <span style={{ fontSize: '9px', color: 'var(--color-success)', marginLeft: 'auto' }}>Auto-stretched</span>}
                </div>
              </div>

              {/* Warp Mode Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ color: '#64d2ff' }}>{Icon.stretch}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Warp Mode</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                  {WARP_MODES.map(mode => (
                    <button 
                      key={mode.value}
                      aria-label={`Warp mode: ${mode.label}`}
                      onClick={() => setClipWarpMode(editingClip.trackId, editingClip.clip.id, mode.value)}
                      title={mode.desc}
                      style={{ 
                        padding: '6px 4px', 
                        background: editingClip.clip.warpMode === mode.value ? 'rgba(6,182,212,0.2)' : 'var(--color-bg-elevated)', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.warpMode === mode.value ? 'rgba(6,182,212,0.4)' : 'var(--color-bg-hover)', 
                        borderRadius: '4px', 
                        color: editingClip.clip.warpMode === mode.value ? '#64d2ff' : 'var(--color-text-tertiary)', 
                        cursor: 'pointer', 
                        fontSize: '8px', 
                        fontWeight: 600 
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>{WARP_MODES.find(m => m.value === editingClip.clip.warpMode)?.desc}</div>
                {/* Formant Preservation toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', padding: '6px 8px', background: 'var(--color-bg-base)', borderRadius: '4px', border: '1px solid #1a1a1e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Formant Preservation</span>
                    <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)' }}>Keeps voice character when pitching</span>
                  </div>
                  <button
                    aria-label="Toggle Formant Preservation"
                    onClick={() => updateClip(editingClip.trackId, editingClip.clip.id, { formantPreserve: !editingClip.clip.formantPreserve })}
                    style={{ width: '36px', height: '18px', borderRadius: '9px', border: 'none', background: editingClip.clip.formantPreserve ? 'var(--color-success)' : '#3f3f46', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                  >
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: editingClip.clip.formantPreserve ? '20px' : '2px', transition: 'left 0.2s' }} />
                  </button>
                </div>
              </div>

              {/* Speed Control Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--color-success)' }}>{Icon.skip}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Speed</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-success)', marginLeft: '8px' }}>{editingClip.clip.speedMultiplier?.toFixed(2) || '1.00'}x</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Stretch:</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#64d2ff', padding: '2px 6px', background: 'var(--color-bg-elevated)', borderRadius: '3px', fontFamily: 'monospace' }}>{((1 / (editingClip.clip.speedMultiplier || 1)) * 100).toFixed(1)}%</span>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Duration:</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{(editingClip.clip.duration / (editingClip.clip.speedMultiplier || 1)).toFixed(2)}s</span>
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
                      aria-label={`Speed ${preset.label}`}
                      onClick={() => !editingClip.clip.tempoLocked && setClipSpeed(editingClip.trackId, editingClip.clip.id, preset.value)}
                      disabled={editingClip.clip.tempoLocked}
                      style={{ 
                        padding: '4px 8px', 
                        background: (editingClip.clip.speedMultiplier || 1) === preset.value ? 'rgba(48,209,88,0.2)' : 'var(--color-bg-elevated)', 
                        border: '1px solid', 
                        borderColor: (editingClip.clip.speedMultiplier || 1) === preset.value ? 'rgba(48,209,88,0.4)' : 'var(--color-bg-hover)', 
                        borderRadius: '4px', 
                        color: (editingClip.clip.speedMultiplier || 1) === preset.value ? 'var(--color-success)' : 'var(--color-text-tertiary)', 
                        cursor: editingClip.clip.tempoLocked ? 'not-allowed' : 'pointer', 
                        fontSize: '9px', 
                        fontWeight: 600,
                        opacity: editingClip.clip.tempoLocked ? 0.5 : 1
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {editingClip.clip.warpMode === 'repitch' && <div style={{ fontSize: '8px', color: 'var(--color-warning)', marginTop: '6px' }}>Re-Pitch mode: Speed changes will affect pitch</div>}
              </div>

              {/* Pitch Control Section */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--color-warning)' }}>{Icon.music}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Pitch</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-warning)', marginLeft: '8px' }}>{editingClip.clip.pitch > 0 ? '+' : ''}{editingClip.clip.pitch} st</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Freq ratio:</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-warning)', fontFamily: 'monospace', padding: '2px 6px', background: 'var(--color-bg-elevated)', borderRadius: '3px' }}>{Math.pow(2, editingClip.clip.pitch / 12).toFixed(4)}x</span>
                  </div>
                </div>
                {/* Coarse pitch (semitones) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', width: '40px' }}>Coarse</span>
                  <input type="range" min="-24" max="24" step="1" value={editingClip.clip.pitch} onChange={(e) => setClipPitch(editingClip.trackId, editingClip.clip.id, parseInt(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ fontSize: '9px', color: 'var(--color-warning)', width: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.pitch > 0 ? '+' : ''}{editingClip.clip.pitch}st</span>
                </div>
                {/* Fine pitch (cents) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', width: '40px' }}>Fine</span>
                  <input type="range" min="-100" max="100" step="1" value={Math.round(((editingClip.clip.pitch % 1) || 0) * 100)} onChange={(e) => setClipPitch(editingClip.trackId, editingClip.clip.id, Math.trunc(editingClip.clip.pitch) + parseInt(e.target.value) / 100)} style={{ flex: 1 }} />
                  <span style={{ fontSize: '9px', color: '#bf5af2', width: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{Math.round(((editingClip.clip.pitch % 1) || 0) * 100)}ct</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {PITCH_PRESETS.map(preset => (
                    <button 
                      key={preset.value}
                      aria-label={`Pitch ${preset.value > 0 ? '+' : ''}${preset.value} semitones`}
                      onClick={() => setClipPitch(editingClip.trackId, editingClip.clip.id, preset.value)}
                      style={{ 
                        padding: '4px 6px', 
                        background: editingClip.clip.pitch === preset.value ? 'rgba(255,159,10,0.2)' : 'var(--color-bg-elevated)', 
                        border: '1px solid', 
                        borderColor: editingClip.clip.pitch === preset.value ? 'rgba(255,159,10,0.4)' : 'var(--color-bg-hover)', 
                        borderRadius: '4px', 
                        color: editingClip.clip.pitch === preset.value ? 'var(--color-warning)' : 'var(--color-text-tertiary)', 
                        cursor: 'pointer', 
                        fontSize: '8px', 
                        fontWeight: 600 
                      }}
                    >
                      {preset.value > 0 ? '+' : ''}{preset.value}
                    </button>
                  ))}
                </div>
                {editingClip.clip.warpMode === 'repitch' && <div style={{ fontSize: '8px', color: 'var(--color-warning)', marginTop: '6px' }}>Re-Pitch mode: Pitch changes will affect speed</div>}
              </div>

              {/* Gain & Fades */}
              <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid #1f1f23' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', width: '65px' }}>Gain</span>
                  <input type="range" min="0" max="2" step="0.01" value={editingClip.clip.gain} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { gain: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: 'var(--color-accent)', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.gain > 1 ? '+' : ''}{((editingClip.clip.gain - 1) * 100).toFixed(0)}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', width: '65px' }}>Fade In</span>
                  <input type="range" min="0" max="5" step="0.01" value={editingClip.clip.fadeIn} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { fadeIn: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: '#64d2ff', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.fadeIn.toFixed(2)}s</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', width: '65px' }}>Fade Out</span>
                  <input type="range" min="0" max="5" step="0.01" value={editingClip.clip.fadeOut} onChange={(e) => updateClip(editingClip.trackId, editingClip.clip.id, { fadeOut: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ fontSize: '10px', color: '#64d2ff', width: '45px', textAlign: 'right', fontFamily: 'monospace' }}>{editingClip.clip.fadeOut.toFixed(2)}s</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1f1f23' }}>
                <button aria-label="Toggle Reverse" onClick={() => updateClip(editingClip.trackId, editingClip.clip.id, { reverse: !editingClip.clip.reverse })} style={{ padding: '8px 14px', background: editingClip.clip.reverse ? 'rgba(255,69,58,0.2)' : 'var(--color-bg-elevated)', border: '1px solid', borderColor: editingClip.clip.reverse ? 'rgba(255,69,58,0.3)' : 'var(--color-bg-hover)', borderRadius: '6px', color: editingClip.clip.reverse ? 'var(--color-error)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>{Icon.reverse} {editingClip.clip.reverse ? 'Reversed' : 'Reverse'}</button>
                <button aria-label="Reset All" onClick={() => updateClip(editingClip.trackId, editingClip.clip.id, { ...DEFAULT_CLIP_PROPS, gain: 1 })} style={{ padding: '8px 14px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>Reset All</button>
                <button aria-label="Open clip in Forge editor" onClick={() => { openForge(editingClip.trackId, editingClip.clip); setShowClipEditor(false); }} style={{ padding: '8px 14px', background: 'rgba(255,55,95,0.1)', border: '1px solid rgba(255,55,95,0.2)', borderRadius: '6px', color: '#ff375f', cursor: 'pointer', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>{Icon.audio} Open in Forge</button>
                <div style={{ flex: 1 }} />
                <button aria-label="Done" onClick={() => setShowClipEditor(false)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #0a84ff, #0a84ff)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forge Audio Editor - Edison-style sample editor */}
      {showForge && forgeClip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }} onMouseDown={() => setShowForge(false)}>
          <div style={{ width: 'min(900px, calc(100vw - 32px))', height: 'min(600px, calc(100vh - 32px))', background: 'var(--color-bg-base)', borderRadius: '12px', border: '1px solid #ff375f40', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }} onMouseDown={(e) => e.stopPropagation()}>
            {/* Forge Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
                <div style={{ width: '6px', height: '20px', background: '#ff375f', borderRadius: '3px' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ff375f', letterSpacing: 0, flexShrink: 0 }}>FORGE</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>Audio Editor</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', padding: '2px 8px', background: 'var(--color-bg-surface)', borderRadius: '4px' }}>{forgeClip.clip.name}</span>
                <span style={{ fontSize: '9px', color: 'var(--color-text-disabled)' }}>{forgeClip.clip.duration.toFixed(2)}s | {forgeClip.clip.waveform.length} samples</span>
              </div>
              <button aria-label="Close Forge editor" onClick={() => setShowForge(false)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #27272a', background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name="close" size={14} /></button>
            </div>

            {/* Forge Toolbar */}
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #1a1a1e', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-base)', flexWrap: 'wrap' }}>
              <button aria-label="Normalize audio" onClick={forgeNormalize} style={{ padding: '5px 10px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '4px', color: 'var(--color-success)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Normalize</button>
              <button aria-label={forgeClip.clip.reverse ? 'Un-reverse audio' : 'Reverse audio'} onClick={forgeReverse} style={{ padding: '5px 10px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '4px', color: 'var(--color-error)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>{forgeClip.clip.reverse ? 'Un-Reverse' : 'Reverse'}</button>
              <button aria-label="Apply Fade In" onClick={forgeFadeIn} style={{ padding: '5px 10px', background: 'rgba(100,210,255,0.1)', border: '1px solid rgba(100,210,255,0.2)', borderRadius: '4px', color: '#64d2ff', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Fade In</button>
              <button aria-label="Apply Fade Out" onClick={forgeFadeOut} style={{ padding: '5px 10px', background: 'rgba(100,210,255,0.1)', border: '1px solid rgba(100,210,255,0.2)', borderRadius: '4px', color: '#64d2ff', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Fade Out</button>
              <div style={{ width: '1px', height: '20px', background: 'var(--color-bg-hover)' }} />
              <button aria-label="Silence selection" onClick={forgeSilence} disabled={!forgeSelection} style={{ padding: '5px 10px', background: forgeSelection ? 'rgba(255,159,10,0.1)' : '#111113', border: '1px solid', borderColor: forgeSelection ? 'rgba(255,159,10,0.2)' : 'var(--color-bg-elevated)', borderRadius: '4px', color: forgeSelection ? 'var(--color-warning)' : '#3f3f46', fontSize: '10px', fontWeight: 600, cursor: forgeSelection ? 'pointer' : 'not-allowed' }}>Silence</button>
              <button aria-label="Trim to selection" onClick={forgeTrim} disabled={!forgeSelection} style={{ padding: '5px 10px', background: forgeSelection ? 'rgba(191,90,242,0.1)' : '#111113', border: '1px solid', borderColor: forgeSelection ? 'rgba(191,90,242,0.2)' : 'var(--color-bg-elevated)', borderRadius: '4px', color: forgeSelection ? '#bf5af2' : '#3f3f46', fontSize: '10px', fontWeight: 600, cursor: forgeSelection ? 'pointer' : 'not-allowed' }}>Trim to Selection</button>
              <div style={{ width: '1px', height: '20px', background: 'var(--color-bg-hover)' }} />
              <button aria-label="Increase gain by 6dB" onClick={() => forgeGain(1.5)} style={{ padding: '5px 10px', background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: '4px', color: 'var(--color-accent)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Gain +6dB</button>
              <button aria-label="Decrease gain by 6dB" onClick={() => forgeGain(0.5)} style={{ padding: '5px 10px', background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: '4px', color: 'var(--color-accent)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Gain -6dB</button>
              <div style={{ flex: 1 }} />
              {forgeSelection && <span style={{ fontSize: '9px', color: 'var(--color-warning)' }}>Selection: {(forgeSelection.start * 100).toFixed(1)}% - {(forgeSelection.end * 100).toFixed(1)}%</span>}
              <button aria-label="Clear selection" onClick={() => setForgeSelection(null)} style={{ padding: '5px 8px', background: 'var(--color-bg-surface)', border: '1px solid #27272a', borderRadius: '4px', color: 'var(--color-text-tertiary)', fontSize: '9px', cursor: 'pointer' }}>Clear Sel</button>
            </div>

            {/* Forge Waveform Display */}
            <div style={{ flex: 1, position: 'relative', background: '#080810', overflow: 'hidden' }}>
              {/* Selection overlay */}
              {forgeSelection && (
                <div style={{ position: 'absolute', left: `${forgeSelection.start * 100}%`, width: `${(forgeSelection.end - forgeSelection.start) * 100}%`, top: 0, bottom: 0, background: 'rgba(255,55,95,0.12)', borderLeft: '1px solid #ff375f', borderRight: '1px solid #ff375f', zIndex: 5, pointerEvents: 'none' }} />
              )}
              <canvas
                ref={(el) => {
                  if (!el || forgeClip.clip.waveform.length === 0) return;
                  const ctx = el.getContext('2d');
                  if (!ctx) return;
                  const rect = el.parentElement!.getBoundingClientRect();
                  el.width = rect.width; el.height = rect.height;
                  const w = el.width, h = el.height, mid = h / 2;
                  const wf = forgeClip.clip.waveform;
                  // Background
                  ctx.fillStyle = '#080810';
                  ctx.fillRect(0, 0, w, h);
                  // Grid lines
                  ctx.strokeStyle = 'var(--color-bg-elevated)';
                  ctx.lineWidth = 1;
                  for (let i = 0; i <= 10; i++) {
                    const x = (i / 10) * w;
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                  }
                  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
                  ctx.strokeStyle = 'var(--color-bg-hover)'; ctx.lineWidth = 0.5;
                  ctx.beginPath(); ctx.moveTo(0, mid * 0.5); ctx.lineTo(w, mid * 0.5); ctx.stroke();
                  ctx.beginPath(); ctx.moveTo(0, mid * 1.5); ctx.lineTo(w, mid * 1.5); ctx.stroke();
                  // Waveform fill
                  ctx.fillStyle = 'rgba(255,55,95,0.25)';
                  ctx.beginPath(); ctx.moveTo(0, mid);
                  for (let i = 0; i < wf.length; i++) { ctx.lineTo((i / wf.length) * w, mid - wf[i] * mid * 0.9); }
                  for (let i = wf.length - 1; i >= 0; i--) { ctx.lineTo((i / wf.length) * w, mid + wf[i] * mid * 0.9); }
                  ctx.closePath(); ctx.fill();
                  // Waveform line
                  ctx.strokeStyle = '#ff375f';
                  ctx.lineWidth = 1;
                  ctx.beginPath(); ctx.moveTo(0, mid);
                  for (let i = 0; i < wf.length; i++) { ctx.lineTo((i / wf.length) * w, mid - wf[i] * mid * 0.9); }
                  ctx.stroke();
                  // dB scale
                  ctx.fillStyle = '#3f3f46'; ctx.font = '9px monospace';
                  ctx.fillText('0 dB', 4, 12);
                  ctx.fillText('-6 dB', 4, mid * 0.5 + 4);
                  ctx.fillText('-inf', 4, mid + 4);
                }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const start = (e.clientX - rect.left) / rect.width;
                  let rafId = 0;
                  const handleMove = (ev: MouseEvent) => {
                    cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                      const end = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                      setForgeSelection({ start: Math.min(start, end), end: Math.max(start, end) });
                    });
                  };
                  const handleUp = () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
                  window.addEventListener('mousemove', handleMove);
                  window.addEventListener('mouseup', handleUp);
                }}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
              />
              {/* Time ruler at bottom */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20px', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                {Array.from({ length: 11 }).map((_, i) => (
                  <span key={i} style={{ position: 'absolute', left: `${i * 10}%`, fontSize: '8px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{(forgeClip.clip.duration * i / 10).toFixed(2)}s</span>
                ))}
              </div>
            </div>

            {/* Forge Footer / Info */}
            <div style={{ padding: '8px 16px', borderTop: '1px solid #1f1f23', background: 'var(--color-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                <span>Duration: <span style={{ color: 'var(--color-text-primary)' }}>{forgeClip.clip.duration.toFixed(3)}s</span></span>
                <span>Gain: <span style={{ color: 'var(--color-success)' }}>{forgeClip.clip.gain.toFixed(2)}</span></span>
                <span>Pitch: <span style={{ color: 'var(--color-warning)' }}>{forgeClip.clip.pitch > 0 ? '+' : ''}{forgeClip.clip.pitch}st</span></span>
                <span>Speed: <span style={{ color: '#64d2ff' }}>{(forgeClip.clip.speedMultiplier || 1).toFixed(2)}x</span></span>
                <span>Warp: <span style={{ color: '#bf5af2' }}>{forgeClip.clip.warpMode}</span></span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button aria-label="Back to Clip Editor" onClick={() => { setEditingClip(forgeClip); setShowClipEditor(true); setShowForge(false); }} style={{ padding: '5px 12px', background: 'var(--color-bg-surface)', border: '1px solid #27272a', borderRadius: '4px', color: 'var(--color-text-secondary)', fontSize: '10px', cursor: 'pointer' }}>Clip Editor</button>
                <button aria-label="Done editing in Forge" onClick={() => setShowForge(false)} style={{ padding: '5px 14px', background: '#ff375f', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: '400px', background: 'var(--color-bg-surface)', border: '1px solid #27272a', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.export} Export Project</span>
              <button aria-label="Close" onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
              {/* Format */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Format</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {EXPORT_FORMATS.map(fmt => (
                    <button key={fmt.value} aria-label={`Export format: ${fmt.value.toUpperCase()}`} onClick={() => setExportSettings(s => ({ ...s, format: fmt.value }))} style={{ padding: '8px', background: exportSettings.format === fmt.value ? '#1e3a28' : 'var(--color-bg-elevated)', border: '1px solid', borderColor: exportSettings.format === fmt.value ? 'var(--color-success)' : 'var(--color-bg-hover)', borderRadius: '6px', color: exportSettings.format === fmt.value ? 'var(--color-success)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>{fmt.value.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {/* Bit Depth */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Bit Depth</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[16, 24, 32].map(depth => (
                    <button key={depth} aria-label={`Bit depth: ${depth}-bit`} onClick={() => setExportSettings(s => ({ ...s, bitDepth: depth as 16 | 24 | 32 }))} style={{ flex: 1, padding: '8px', background: exportSettings.bitDepth === depth ? '#0d2847' : 'var(--color-bg-elevated)', border: '1px solid', borderColor: exportSettings.bitDepth === depth ? 'var(--color-accent)' : 'var(--color-bg-hover)', borderRadius: '6px', color: exportSettings.bitDepth === depth ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>{depth}-bit</button>
                  ))}
                </div>
              </div>

              {/* Sample Rate */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Sample Rate</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[44100, 48000, 96000].map(rate => (
                    <button key={rate} aria-label={`Sample rate: ${(rate / 1000).toFixed(1)} kHz`} onClick={() => setExportSettings(s => ({ ...s, sampleRate: rate as 44100 | 48000 | 96000 | 192000 }))} style={{ flex: 1, padding: '8px', background: exportSettings.sampleRate === rate ? '#2a1840' : 'var(--color-bg-elevated)', border: '1px solid', borderColor: exportSettings.sampleRate === rate ? '#bf5af2' : 'var(--color-bg-hover)', borderRadius: '6px', color: exportSettings.sampleRate === rate ? '#bf5af2' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>{(rate / 1000).toFixed(1)} kHz</button>
                  ))}
                </div>
              </div>

              {/* Normalize Level */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  <span>Normalize Level</span>
                  <span style={{ color: 'var(--color-warning)', fontFamily: 'monospace' }}>{exportSettings.normalizeLevel} dB</span>
                </label>
                <input type="range" min="-6" max="0" step="0.1" value={exportSettings.normalizeLevel} onChange={(e) => setExportSettings(s => ({ ...s, normalizeLevel: parseFloat(e.target.value) }))} style={{ width: '100%' }} />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={exportSettings.includeMetadata} onChange={(e) => setExportSettings(s => ({ ...s, includeMetadata: e.target.checked }))} style={{ accentColor: 'var(--color-success)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Include metadata (BPM, key, project name)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={exportSettings.splitTracks} onChange={(e) => setExportSettings(s => ({ ...s, splitTracks: e.target.checked }))} style={{ accentColor: 'var(--color-success)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Export individual tracks (stems)</span>
                </label>
              </div>

              {/* Progress */}
              {isExporting && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>Exporting...</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-success)', fontFamily: 'monospace' }}>{Math.round(exportProgress)}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--color-bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${exportProgress}%`, background: 'linear-gradient(90deg, #30d158, #30d158)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              {/* Export button */}
              <button aria-label="Export project" onClick={exportProject} disabled={isExporting} style={{ width: '100%', padding: '12px', background: isExporting ? 'var(--color-bg-elevated)' : 'linear-gradient(135deg, #30d158, #28a745)', border: 'none', borderRadius: '8px', color: '#fff', cursor: isExporting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {isExporting ? 'Exporting...' : <>{Icon.download} Export Now</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration Modal */}
      {showCollabModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: '500px', background: 'var(--color-bg-surface)', border: '1px solid #27272a', borderRadius: '12px', overflow: 'hidden', maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>{Icon.users} Online Collaboration</span>
              <button aria-label="Close" onClick={() => setShowCollabModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icon.close}</button>
            </div>
            
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
              {!collaborationSession ? (
                // Not in a session
                <div>
                  {/* User name setup */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Your Display Name</label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Enter your name" style={{ width: '100%', padding: '10px 12px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '12px' }} />
                  </div>

                  {/* Create session */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Create New Session</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="Session name..." style={{ flex: 1, padding: '10px 12px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '12px' }} id="collab-session-name" />
                      <button aria-label="Create collaboration session" onClick={() => {
                        const input = document.getElementById('collab-session-name') as HTMLInputElement;
                        if (input?.value) createCollabSession(input.value);
                      }} style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #0a84ff, #0a84ff)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>{Icon.plus} Create</button>
                    </div>
                  </div>

                  {/* Join session */}
                  <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #27272a' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase' }}>Join Existing Session</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="Paste session link or ID..." style={{ flex: 1, padding: '10px 12px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '12px' }} id="collab-session-id" />
                      <button aria-label="Join collaboration session" onClick={() => {
                        const input = document.getElementById('collab-session-id') as HTMLInputElement;
                        if (input?.value) joinCollabSession(input.value);
                      }} style={{ padding: '10px 16px', background: 'rgba(48,209,88,0.2)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: '6px', color: 'var(--color-success)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Join</button>
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: 'var(--color-bg-base)', borderRadius: '8px', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>How it works:</h4>
                    <ul style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', paddingLeft: '16px', lineHeight: 1.6 }}>
                      <li>Create a local session for multi-window collaboration</li>
                      <li>Open the same project in another DEX window to join</li>
                      <li>Work together in real-time across windows on this machine</li>
                      <li>See each other's changes and edits live</li>
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
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent)' }}>{collaborationSession.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.wifi} Live</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>Session ID: {collaborationSession.id.substring(0, 20)}...</span>
                      <button aria-label="Copy" onClick={() => navigator.clipboard.writeText(collaborationSession.id)} style={{ padding: '2px 6px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '4px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '8px' }}>{Icon.copy} Copy</button>
                    </div>
                  </div>

                  {/* Participants */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>Participants ({collaborators.filter(c => c.isOnline).length} online)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {collaborators.map(collab => (
                        <div key={collab.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-bg-elevated)', borderRadius: '6px', borderLeft: `3px solid ${collab.color}` }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: collab.isOnline ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
                          <span style={{ flex: 1, fontSize: '11px', color: collab.isOnline ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{collab.name}</span>
                          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{collab.role}</span>
                          {collab.isRecording && <span style={{ fontSize: '8px', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '4px' }}>{Icon.record} REC</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chat */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>Chat</label>
                    <div style={{ height: '150px', background: 'var(--color-bg-base)', borderRadius: '6px', padding: '8px', overflowY: 'auto', marginBottom: '8px' }}>
                      {collabMessages.length === 0 ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: '10px' }}>No messages yet</div>
                      ) : (
                        collabMessages.map((msg, i) => (
                          <div key={i} style={{ marginBottom: '6px' }}>
                            <span style={{ fontSize: '9px', color: 'var(--color-accent)', fontWeight: 600 }}>{msg.sender}</span>
                            <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', marginLeft: '6px' }}>{msg.time.toLocaleTimeString()}</span>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{msg.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" value={newCollabMessage} onChange={(e) => setNewCollabMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCollabMessage(newCollabMessage)} placeholder="Type a message..." style={{ flex: 1, padding: '8px 12px', background: 'var(--color-bg-elevated)', border: '1px solid #27272a', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '11px' }} />
                      <button aria-label="Send message" onClick={() => sendCollabMessage(newCollabMessage)} style={{ padding: '8px 12px', background: 'var(--color-accent)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px' }}>{Icon.send}</button>
                    </div>
                  </div>

                  {/* Leave session */}
                  <button aria-label="Leave Session" onClick={leaveCollabSession} style={{ width: '100%', padding: '10px', background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '6px', color: 'var(--color-error)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Leave Session</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== PRO FLOATING PANELS (macOS Tahoe Glass) ===== */}

      {/* Effects Rack Panel */}
      {showEffectsRack && (
        <div style={{ position: 'fixed', right: 20, top: 60, width: 320, maxHeight: 520, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 6000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Effects Rack</span>
            <button aria-label="Close Effects Rack" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowEffectsRack(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
            {[
              { name: 'Parametric EQ', type: 'eq', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 8c2-4 4 4 6 0s4 4 6 0" strokeLinecap="round"/></svg>, color: 'var(--color-accent)', params: ['Low Cut', 'Low Shelf', 'Mid', 'High Shelf', 'High Cut'] },
              { name: 'Compressor', type: 'comp', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14L7 7l2 3 5-10" strokeLinecap="round" strokeLinejoin="round"/></svg>, color: '#bf5af2', params: ['Threshold', 'Ratio', 'Attack', 'Release', 'Makeup'] },
              { name: 'Reverb', type: 'reverb', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6" strokeDasharray="2 2"/></svg>, color: 'var(--color-success)', params: ['Size', 'Decay', 'Pre-delay', 'Damping', 'Mix'] },
              { name: 'Delay', type: 'delay', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h2m3 0h2m3 0h2" strokeLinecap="round"/><path d="M4 5v6m7-6v6" strokeLinecap="round" opacity="0.5"/></svg>, color: 'var(--color-warning)', params: ['Time', 'Feedback', 'HP Filter', 'LP Filter', 'Mix'] },
              { name: 'Chorus', type: 'chorus', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1 6c3-3 5 3 7 0s4 3 7 0" strokeLinecap="round"/><path d="M1 10c3-3 5 3 7 0s4 3 7 0" strokeLinecap="round" opacity="0.5"/></svg>, color: '#64d2ff', params: ['Rate', 'Depth', 'Mix'] },
              { name: 'Saturation', type: 'sat', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.5 5 2.5 5H3l2.5-5z"/></svg>, color: 'var(--color-error)', params: ['Drive', 'Tone', 'Mix'] },
            ].map(fx => (
              <div key={fx.type} style={{ marginBottom: 6, borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: activeEffectPlugin === fx.type ? 'var(--color-border-subtle)' : 'var(--color-border-subtle)', overflow: 'hidden' }}>
                <div onClick={() => setActiveEffectPlugin(activeEffectPlugin === fx.type ? null : fx.type)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', color: fx.color }}>{fx.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#D0D0D0', flex: 1 }}>{fx.name}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
                </div>
                {activeEffectPlugin === fx.type && (
                  <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--color-border-subtle)' }}>
                    {fx.params.map(p => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55, flexShrink: 0 }}>{p}</span>
                        <input type="range" min="0" max="100" defaultValue={50} onChange={e => { const el = e.currentTarget.nextElementSibling as HTMLElement | null; if (el) el.textContent = e.currentTarget.value; }} style={{ flex: 1, accentColor: fx.color, height: 3 }} />
                        <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>50</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vocal Tuner Panel */}
      {showVocalTuner && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Vocal Tuner</span>
            <button aria-label="Close Vocal Tuner" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowVocalTuner(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 100, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="260" height="60" viewBox="0 0 260 60"><path d="M0 30 Q30 10 60 30 Q90 50 120 30 Q150 10 180 30 Q210 50 240 30 L260 30" fill="none" stroke="#0a84ff" strokeWidth="2" opacity="0.6"/><line x1="0" y1="30" x2="260" y2="30" stroke="#303030" strokeWidth="0.5"/>{['C4','D4','E4','F4','G4','A4','B4'].map((n,i) => <text key={n} x={10+i*36} y="55" fill="#505050" fontSize="7">{n}</text>)}</svg>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button aria-label="Natural tuning mode" onClick={() => setVocalTunerMode('natural')} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: vocalTunerMode === 'natural' ? 'rgba(10,132,255,0.15)' : 'var(--color-border-subtle)', color: vocalTunerMode === 'natural' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Natural</button>
              <button aria-label="Hard-Tune tuning mode" onClick={() => setVocalTunerMode('hard-tune')} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: vocalTunerMode === 'hard-tune' ? 'rgba(10,132,255,0.15)' : 'var(--color-border-subtle)', color: vocalTunerMode === 'hard-tune' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Hard-Tune</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Speed</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{vocalTunerSpeed}%</span>
            </div>
            <input type="range" min="0" max="100" value={vocalTunerSpeed} onChange={e => setVocalTunerSpeed(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 8, textAlign: 'center' }}>Key: {projectKey.root} {projectKey.scale}</div>
            <button aria-label="Apply vocal tuner to selected track" onClick={() => {
              if (!selectedTrack) { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Select a track first' } })); return; }
              const track = tracks.find(t => t.id === selectedTrack);
              if (!track) return;
              const existing = track.plugins.find(p => p.type === 'autotune');
              if (existing) {
                const corrSpeed = vocalTunerMode === 'hard-tune' ? 0 : Math.round(100 - vocalTunerSpeed);
                updatePluginParam(selectedTrack, existing.id, 'speed', corrSpeed);
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Vocal tuner updated on "${track.name}"` } }));
              } else {
                addPluginToTrack(selectedTrack, 'autotune');
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Vocal tuner (${vocalTunerMode}) added to "${track.name}"` } }));
              }
            }} style={{ marginTop: 8, width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(10,132,255,0.3)', background: 'rgba(10,132,255,0.1)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply to Selected Track</button>
          </div>
        </div>
      )}

      {/* Loudness Meter Panel */}
      {showLoudnessMeter && (
        <div style={{ position: 'fixed', right: 20, bottom: 80, width: 220, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Loudness</span>
            <button aria-label="Close Loudness Meter" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowLoudnessMeter(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            {[
              { label: 'Integrated', value: loudnessData.integrated, unit: 'LUFS' },
              { label: 'Short-term', value: loudnessData.shortTerm, unit: 'LUFS' },
              { label: 'Momentary', value: loudnessData.momentary, unit: 'LUFS' },
              { label: 'True Peak', value: loudnessData.truePeak, unit: 'dBTP' },
              { label: 'LRA', value: loudnessData.lra, unit: 'LU' },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{m.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: m.value > -1 ? 'var(--color-error)' : m.value > -8 ? 'var(--color-warning)' : 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>{m.value.toFixed(1)} {m.unit}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Target: {masterSettings.loudnessTarget} LUFS</div>
          </div>
        </div>
      )}

      {/* Noise Gate Panel */}
      {showNoiseGate && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Noise Gate</span>
            <button aria-label="Close Noise Gate" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowNoiseGate(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 60, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 10px 4px' }}>
              <svg width="260" height="50" viewBox="0 0 260 50"><rect x="0" y="20" width="80" height="30" fill="#30d158" opacity="0.15" rx="2"/><rect x="80" y="0" width="10" height="50" fill="#ff453a" opacity="0.1" rx="2"/><rect x="90" y="40" width="80" height="10" fill="#505050" opacity="0.2" rx="2"/><rect x="170" y="0" width="10" height="50" fill="#30d158" opacity="0.1" rx="2"/><rect x="180" y="20" width="80" height="30" fill="#30d158" opacity="0.15" rx="2"/><text x="30" y="14" fill="#30d158" fontSize="7" textAnchor="middle">Open</text><text x="130" y="35" fill="#ff453a" fontSize="7" textAnchor="middle">Closed</text><text x="220" y="14" fill="#30d158" fontSize="7" textAnchor="middle">Open</text></svg>
            </div>
            {[{ label: 'Threshold', min: -80, max: 0, def: -40, unit: 'dB', desc: 'Signal level to open gate' }, { label: 'Hold', min: 0, max: 500, def: 50, unit: 'ms', desc: 'Time gate stays open' }, { label: 'Range', min: -96, max: 0, def: -80, unit: 'dB', desc: 'Attenuation when closed' }, { label: 'Hysteresis', min: 0, max: 20, def: 4, unit: 'dB', desc: 'Close threshold offset' }].map(p => (
              <div key={p.label} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div><div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{p.label}</div><div style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{p.desc}</div></div>
                  <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{noiseGateParams[p.label as keyof typeof noiseGateParams]} {p.unit}</span>
                </div>
                <input type="range" min={p.min} max={p.max} value={noiseGateParams[p.label as keyof typeof noiseGateParams]} onChange={e => setNoiseGateParams(prev => ({ ...prev, [p.label]: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* De-Esser Panel */}
      {showDeEsser && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>De-Esser</span>
            <button aria-label="Close De-Esser" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowDeEsser(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 50, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="240" height="40" viewBox="0 0 240 40"><path d="M0 35 L60 33 L100 30 L130 15 Q140 5 150 15 L170 30 L200 33 L240 35" fill="none" stroke="#ff9f0a" strokeWidth="1.5" opacity="0.6"/><rect x="120" y="8" width="40" height="25" fill="#ff9f0a" opacity="0.1" rx="3"/><text x="140" y="38" fill="#505050" fontSize="7" textAnchor="middle">4-8 kHz</text></svg>
            </div>
            {[{ label: 'Frequency', min: 2000, max: 12000, def: 6500, unit: 'Hz' }, { label: 'Threshold', min: -40, max: 0, def: -15, unit: 'dB' }, { label: 'Ratio', min: 1, max: 10, def: 3, unit: ':1' }, { label: 'Bandwidth', min: 0.5, max: 4, def: 2, unit: 'Oct', step: 0.1 }].map((p: any) => (
              <div key={p.label} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{p.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{deEsserParams[p.label as keyof typeof deEsserParams]} {p.unit}</span>
                </div>
                <input type="range" min={p.min} max={p.max} value={deEsserParams[p.label as keyof typeof deEsserParams]} step={p.step || 1} onChange={e => setDeEsserParams(prev => ({ ...prev, [p.label]: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sidechain Panel */}
      {showSidechainPanel && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Sidechain Compression</span>
            <button aria-label="Close Sidechain Compression" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSidechainPanel(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Source (Key Input)</div>
              <select value={sidechainSource || ''} onChange={e => setSidechainSource(e.target.value || null)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                <option value="">Select track...</option>
                {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Target (Ducked)</div>
              <select value={sidechainTarget || ''} onChange={e => setSidechainTarget(e.target.value || null)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                <option value="">Select track...</option>
                {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[{ label: 'Threshold', min: -60, max: 0, def: -20, unit: 'dB' }, { label: 'Ratio', min: 1, max: 20, def: 4, unit: ':1' }, { label: 'Attack', min: 0.1, max: 100, def: 5, unit: 'ms' }, { label: 'Release', min: 10, max: 500, def: 150, unit: 'ms' }].map((p: any) => (
                <div key={p.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{p.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{sidechainParams[p.label as keyof typeof sidechainParams]} {p.unit}</span>
                  </div>
                  <input type="range" min={p.min} max={p.max} value={sidechainParams[p.label as keyof typeof sidechainParams]} step={p.unit === 'ms' ? 1 : 0.1} onChange={e => setSidechainParams(prev => ({ ...prev, [p.label]: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#bf5af2' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comp Lanes Panel */}
      {showCompLanes && (
        <div style={{ position: 'fixed', left: 280, bottom: 60, right: 20, height: 180, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 -8px 32px rgba(0,0,0,0.5)', zIndex: 6000 }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Comp Lanes</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Swipe to select best takes</span>
              <button aria-label="Close Comp Lanes" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCompLanes(false)}><DexIcon name="close" size={14} /></button>
            </div>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', height: 'calc(100% - 36px)' }}>
            {compLanes.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>Record multiple takes to see comp lanes</span>
                <button aria-label="New Take" onClick={() => setCompLanes(prev => [...prev, { id: `take-${Date.now()}`, name: `Take ${prev.length + 1}`, active: prev.length === 0 }])} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'rgba(10,132,255,0.15)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>+ New Take</button>
              </div>
            ) : (
              <>
              {compLanes.map((lane, i) => (
                <div key={lane.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: lane.active ? 'rgba(10,132,255,0.1)' : 'transparent', marginBottom: 2, cursor: 'pointer' }} onClick={() => setCompLanes(prev => prev.map((l, j) => ({ ...l, active: j === i })))}>
                  <span style={{ fontSize: 9, color: lane.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontWeight: 600, width: 40 }}>Take {i + 1}</span>
                  <div style={{ flex: 1, height: 20, background: 'var(--color-border-subtle)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${lane.active ? 'rgba(10,132,255,0.2)' : 'var(--color-border-subtle)'} 0%, transparent 100%)` }} />
                    {[...Array(20)].map((_, k) => <div key={k} style={{ position: 'absolute', left: `${k * 5}%`, bottom: 0, width: 2, height: `${20 + Math.sin(k * lane.id.charCodeAt(5) * 0.3) * 40 + 50}%`, background: lane.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', opacity: 0.4, borderRadius: 1 }} />)}
                  </div>
                  <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', width: 24 }}>{lane.active ? <DexIcon name="check" size={10} color="#30d158" /> : ''}</span>
                </div>
              ))}
              <button aria-label="Add New Take" onClick={() => setCompLanes(prev => [...prev, { id: `take-${Date.now()}`, name: `Take ${prev.length + 1}`, active: false }])} style={{ marginTop: 6, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 9, cursor: 'pointer' }}>+ New Take</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stem Export Panel */}
      {showStemExport && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 420, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Stem Export</span>
            <button aria-label="Close Stem Export" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowStemExport(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 16, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Export each track as a separate audio file</div>
            {tracks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{frozenTracks.has(t.id) ? 'Frozen' : 'Active'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <select style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 10 }}>
                <option value="wav">WAV 24-bit</option><option value="flac">FLAC</option><option value="mp3">MP3 320kbps</option><option value="aac">AAC 256kbps</option><option value="ogg">OGG Vorbis</option>
              </select>
              <button onClick={() => { const trackNames = tracks.map(t => t.name).join(', '); const blob = new Blob([`Stem export manifest:\n${trackNames}\nFormat: WAV 24-bit\nExported: ${new Date().toISOString()}`], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'stems-manifest.txt'; a.click(); URL.revokeObjectURL(url); setShowStemExport(false); }} aria-label="Export All Stems" style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Export All Stems</button>
            </div>
          </div>
        </div>
      )}

      {/* Track Folders Dialog */}
      {showTrackFolderDialog && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Groups</span>
            <button aria-label="Close Track Groups" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTrackFolderDialog(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <button aria-label="New Group" onClick={() => setTrackFolders(prev => [...prev, { id: `folder-${Date.now()}`, name: `Group ${prev.length + 1}`, trackIds: [], collapsed: false, color: ['var(--color-accent)', 'var(--color-success)', '#bf5af2', 'var(--color-warning)', 'var(--color-error)'][prev.length % 5] }])} style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: 10, cursor: 'pointer', marginBottom: 8 }}>+ New Group</button>
            {trackFolders.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>Create groups to organize tracks</div>
            ) : (
              trackFolders.map(f => (
                <div key={f.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4, borderLeft: `3px solid ${f.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{f.name}</span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{f.trackIds.length} tracks</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {tracks.map(t => (
                      <button key={t.id} onClick={() => setTrackFolders(prev => prev.map(pf => pf.id === f.id ? { ...pf, trackIds: pf.trackIds.includes(t.id) ? pf.trackIds.filter(id => id !== t.id) : [...pf.trackIds, t.id] } : pf))} aria-label={f.trackIds.includes(t.id) ? `Remove ${t.name} from folder ${f.name}` : `Add ${t.name} to folder ${f.name}`} aria-pressed={f.trackIds.includes(t.id)} style={{ padding: '2px 6px', borderRadius: 3, border: '1px solid var(--color-bg-hover)', background: f.trackIds.includes(t.id) ? `${f.color}22` : 'var(--color-border-subtle)', color: f.trackIds.includes(t.id) ? f.color : 'var(--color-text-tertiary)', fontSize: 8, cursor: 'pointer' }}>{t.name}</button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Collaboration Markers Panel */}
      {showCollabMarkers && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 300, maxHeight: 400, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Session Notes</span>
            <button aria-label="Close Session Notes" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCollabMarkers(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 300 }}>
            <button onClick={() => setCollabMarkers(prev => [...prev, { id: `note-${Date.now()}`, time: currentTime, author: userName, text: '', color: '#bf5af2', resolved: false }])} aria-label="Add session note at current time" style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px dashed rgba(191,90,242,0.3)', background: 'transparent', color: '#bf5af2', fontSize: 10, cursor: 'pointer', marginBottom: 8 }}>+ Add Note at {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</button>
            {collabMarkers.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>No session notes yet</div>
            ) : (
              collabMarkers.map(m => (
                <div key={m.id} style={{ padding: 8, borderRadius: 6, background: m.resolved ? 'rgba(48,209,88,0.05)' : 'var(--color-border-subtle)', marginBottom: 4, borderLeft: `3px solid ${m.resolved ? 'var(--color-success)' : m.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{m.author} @ {Math.floor(m.time / 60)}:{String(Math.floor(m.time % 60)).padStart(2, '0')}</span>
                    <button aria-label={m.resolved ? 'Mark as unresolved' : 'Mark as resolved'} onClick={() => setCollabMarkers(prev => prev.map(cm => cm.id === m.id ? { ...cm, resolved: !cm.resolved } : cm))} style={{ background: 'none', border: 'none', color: m.resolved ? 'var(--color-success)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 9 }}>{m.resolved ? <DexIcon name="check" size={10} /> : <DexIcon name="circle" size={10} />}</button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{m.text || 'Empty note'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MIDI Controller Panel */}
      {showMidiPanel && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 320, maxHeight: 500, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 6000 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>MIDI Controller</span>
            <button aria-label="Close MIDI panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowMidiPanel(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 440 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.5px' }}>DEVICES</div>
            {midiInputs.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                {'requestMIDIAccess' in navigator ? 'No MIDI devices detected. Connect a controller and refresh.' : 'Web MIDI not supported in this browser.'}
              </div>
            ) : (
              midiInputs.map(inp => (
                <div key={inp.id} onClick={() => setActiveMidiInput(inp.id)} style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8, background: activeMidiInput === inp.id ? 'rgba(10,132,255,0.12)' : 'var(--color-border-subtle)', border: `1px solid ${activeMidiInput === inp.id ? 'rgba(10,132,255,0.3)' : 'var(--color-border-subtle)'}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: inp.connected ? 'var(--color-success)' : 'var(--color-error)' }} />
                  <span style={{ fontSize: 10, color: activeMidiInput === inp.id ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeMidiInput === inp.id ? 600 : 400 }}>{inp.name}</span>
                </div>
              ))
            )}
            <div style={{ height: 1, background: 'var(--color-bg-hover)', margin: '8px 0' }} />
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.5px' }}>KEYBOARD</div>
            <div style={{ display: 'flex', height: 40, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border-subtle)', marginBottom: 10 }}>
              {[60,61,62,63,64,65,66,67,68,69,70,71,72].map(note => {
                const isBlack = [1,3,6,8,10].includes(note % 12);
                const isActive = midiNotes.has(note);
                return <div key={note} style={{ flex: isBlack ? 0 : 1, width: isBlack ? 16 : undefined, height: isBlack ? 24 : 40, background: isBlack ? (isActive ? 'var(--color-accent)' : 'var(--color-bg-elevated)') : (isActive ? 'rgba(10,132,255,0.3)' : 'var(--color-text-primary)'), borderRight: '1px solid rgba(0,0,0,0.2)', zIndex: isBlack ? 1 : 0, marginLeft: isBlack ? -8 : 0, marginRight: isBlack ? -8 : 0, borderRadius: isBlack ? '0 0 2px 2px' : 0 }} />;
              })}
            </div>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.5px' }}>CC MAPPING</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {Object.entries(midiCCMap).map(([cc, target]) => (
                <div key={cc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', borderRadius: 4, background: 'var(--color-border-subtle)' }}>
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>CC {cc}</span>
                  <span style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 600 }}>{target}</span>
                </div>
              ))}
            </div>
            <button aria-label={midiLearnMode ? 'Stop MIDI Learn' : 'Start MIDI Learn'} onClick={() => setMidiLearnMode(!midiLearnMode)} style={{ width: '100%', marginTop: 8, padding: '6px', borderRadius: 6, border: `1px solid ${midiLearnMode ? 'rgba(255,69,58,0.4)' : 'rgba(10,132,255,0.3)'}`, background: midiLearnMode ? 'rgba(255,69,58,0.12)' : 'rgba(10,132,255,0.08)', color: midiLearnMode ? 'var(--color-error)' : 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{midiLearnMode ? 'Stop MIDI Learn' : 'MIDI Learn'}</button>
          </div>
        </div>
      )}

      {/* Track Folders Panel */}
      {showTrackFolderDialog && (
        <div style={{ position: 'fixed', left: 20, top: 120, width: 280, maxHeight: 420, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 200 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Folders</span>
            <button aria-label="Close Track Folders" onClick={() => setShowTrackFolderDialog(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="New Folder" onClick={() => setTrackFolders(prev => [...prev, { id: crypto.randomUUID(), name: `Folder ${prev.length + 1}`, trackIds: [], collapsed: false, color: ['var(--color-error)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-accent)', '#bf5af2'][prev.length % 5] }])} style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px dashed var(--color-border)', background: 'rgba(10,132,255,0.06)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ New Folder</button>
            {trackFolders.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>No folders — group tracks by creating a folder</div>
            ) : (
              trackFolders.map(f => (
                <div key={f.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4, border: `1px solid ${f.color}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: f.color }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{f.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button aria-label={f.collapsed ? 'Expand folder' : 'Collapse folder'} onClick={() => setTrackFolders(prev => prev.map(tf => tf.id === f.id ? { ...tf, collapsed: !tf.collapsed } : tf))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 9 }}>{f.collapsed ? <DexIcon name="chevron-right" size={10} /> : <DexIcon name="chevron-down" size={10} />}</button>
                      <button aria-label="Delete folder" onClick={() => setTrackFolders(prev => prev.filter(tf => tf.id !== f.id))} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: 9 }}><DexIcon name="close" size={9} /></button>
                    </div>
                  </div>
                  {!f.collapsed && (
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>{f.trackIds.length === 0 ? 'Drag tracks here' : `${f.trackIds.length} tracks`}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Clip Gain Envelope Panel */}
      {showClipGainEnvelope && (
        <div style={{ position: 'fixed', left: '50%', bottom: 80, transform: 'translateX(-50%)', width: 480, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 200 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Clip Gain Envelope</span>
            <button aria-label="Close Clip Gain Envelope" onClick={() => setShowClipGainEnvelope(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ height: 120, background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', position: 'relative', marginBottom: 8, overflow: 'hidden' }}>
              {/* Waveform background */}
              <svg width="100%" height="100%" viewBox="0 0 480 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.3 }}>
                <path d="M0,60 Q30,20 60,60 Q90,100 120,60 Q150,30 180,60 Q210,90 240,60 Q270,25 300,60 Q330,85 360,60 Q390,35 420,60 Q450,80 480,60" fill="none" stroke="#0a84ff" strokeWidth="1" />
              </svg>
              {/* Gain envelope line */}
              <svg width="100%" height="100%" viewBox="0 0 480 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
                <line x1="0" y1="40" x2="480" y2="40" stroke="#ffd60a" strokeWidth="1.5" strokeDasharray="2,2" />
                {/* Envelope nodes */}
                <circle cx="0" cy="40" r="4" fill="#ffd60a" style={{ cursor: 'grab' }} />
                <circle cx="160" cy="40" r="4" fill="#ffd60a" style={{ cursor: 'grab' }} />
                <circle cx="320" cy="40" r="4" fill="#ffd60a" style={{ cursor: 'grab' }} />
                <circle cx="480" cy="40" r="4" fill="#ffd60a" style={{ cursor: 'grab' }} />
              </svg>
              {/* 0dB reference line */}
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed var(--color-border)' }} />
              <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: 'var(--color-text-tertiary)' }}>0 dB</span>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
              <button aria-label="Add gain envelope node" style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'rgba(255,214,10,0.08)', color: 'var(--color-warning)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>+ Add Node</button>
              <button aria-label="Reset gain envelope" style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer' }}>Reset Envelope</button>
              <button aria-label="Normalize gain envelope" style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer' }}>Normalize</button>
            </div>
          </div>
        </div>
      )}

      {/* Routing Panel */}
      {showRouting && (
        <div style={{ position: 'fixed', right: 20, top: 100, width: 320, maxHeight: 500, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 200 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Signal Routing</span>
            <button aria-label="Close Signal Routing" onClick={() => setShowRouting(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 420 }}>
            {/* Bus channels */}
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Busses</div>
            {['Master Bus', 'Bus A — Reverb Send', 'Bus B — Delay Send', 'Bus C — Parallel Comp'].map((bus, i) => (
              <div key={bus} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? 'var(--color-success)' : 'var(--color-accent)' }} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{bus}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 30, height: 4, borderRadius: 2, background: 'rgba(48,209,88,0.3)' }}>
                    <div style={{ width: `${60 + i * 10}%`, height: '100%', borderRadius: 2, background: 'var(--color-success)' }} />
                  </div>
                  <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{-12 + i * 3}dB</span>
                </div>
              </div>
            ))}
            {/* Track sends */}
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: 12, marginBottom: 6 }}>Track Sends</div>
            {tracks.slice(0, 4).map(t => (
              <div key={t.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 3 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{t.name}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 4px' }}>
                    <option>Master Bus</option>
                    <option>Bus A</option>
                    <option>Bus B</option>
                    <option>Bus C</option>
                  </select>
                  <input type="range" min="0" max="100" defaultValue={100} onChange={e => { const el = e.currentTarget; el.title = `${e.currentTarget.value}%`; }} style={{ width: 60, accentColor: 'var(--color-accent)' }} />
                </div>
              </div>
            ))}
            {/* I/O */}
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: 12, marginBottom: 6 }}>Hardware I/O</div>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Input</span>
                <select style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 4px' }}>
                  <option>Default Input</option>
                  <option>Input 1-2</option>
                  <option>Input 3-4</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Output</span>
                <select style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 4px' }}>
                  <option>Default Output</option>
                  <option>Output 1-2</option>
                  <option>Output 3-4</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Panel */}
      {showHelp && (
        <div style={{ position: 'fixed', right: 20, top: 60, width: 340, maxHeight: 'calc(100vh - 100px)', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Imosion Help & Shortcuts</span>
            <button aria-label="Close Help" onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4 }}>{Icon.close}</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Transport</div>
              {[['Space', 'Play / Pause'], ['R', 'Record'], ['L', 'Toggle Loop'], ['Home', 'Rewind to start']].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                  <kbd style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: '"SF Mono", monospace' }}>{key}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Editing</div>
              {([[`${_plat.isMac?'⌘':'Ctrl'}+Z`, 'Undo'], [`${_plat.isMac?'⌘':'Ctrl'}+Y`, 'Redo'], [`${_plat.isMac?'⌘':'Ctrl'}+C`, 'Copy clip'], [`${_plat.isMac?'⌘':'Ctrl'}+V`, 'Paste clip'], ['Delete', 'Delete selected'], [`${_plat.isMac?'⌘':'Ctrl'}+A`, 'Select all']] as [string,string][]).map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                  <kbd style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: '"SF Mono", monospace' }}>{key}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#bf5af2', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Views</div>
              {[['1', 'Arrange view'], ['2', 'Mixer view'], ['3', 'Beat Maker'], ['4', 'Piano Roll']].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                  <kbd style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: '"SF Mono", monospace' }}>{key}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Tracks</div>
              {([[`${_plat.isMac?'⌘':'Ctrl'}+T`, 'Add new track'], ['M', 'Mute selected track'], ['S', 'Solo selected track'], [`${_plat.isMac?'⌘':'Ctrl'}+Shift+N`, 'Rename track']] as [string,string][]).map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                  <kbd style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: '"SF Mono", monospace' }}>{key}</kbd>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-error)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Tips</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                <li>Drag track panel edge to resize</li>
                <li>Right-click tracks/clips for context menu</li>
                <li>Use BPM field to tap tempo (click repeatedly)</li>
                <li>Cmd/Ctrl+click for multi-select</li>
                <li>Use File menu for import/export</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 24, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1c 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        <span>{sampleRate >= 1000 ? `${sampleRate / 1000}k` : sampleRate} Hz</span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>{bitDepth}-bit</span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>{bpm} BPM</span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>{tracks.length} tracks</span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>Buffer: {bufferSize}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: isRecording ? 'var(--color-error)' : isPlaying ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>{isRecording ? 'Recording' : isPlaying ? 'Playing' : 'Ready'}</span>
      </div>

      {showShortcutsPanel && <KeyboardShortcutsPanel appId="imosion" onClose={() => setShowShortcutsPanel(false)} />}
    </div>
  );
};

// Memoize entire component for multi-window performance
Imosion.displayName = 'Imosion';
export default memo(Imosion);
