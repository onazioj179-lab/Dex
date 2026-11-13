// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Imosion DAW Feature Enhancements
 * Markers, Regions, Track Templates, Track Grouping, Metronome
 */

import { detectChords, type ChordSegment } from './ImosionChordDetect';

// ==================== MARKER & REGION TYPES ====================
export interface Marker {
  id: string;
  time: number; // Position in seconds
  name: string;
  color: string;
  type: 'marker' | 'locator';
}

export interface Region {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
  type: 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'hook' | 'breakdown' | 'drop' | 'custom';
}

// Region type presets
export const REGION_TYPES = [
  { value: 'intro', label: 'Intro', color: '#4f8a60' },
  { value: 'verse', label: 'Verse', color: '#5a78a0' },
  { value: 'chorus', label: 'Chorus', color: '#a08644' },
  { value: 'bridge', label: 'Bridge', color: '#7c6a9c' },
  { value: 'hook', label: 'Hook', color: '#a06282' },
  { value: 'breakdown', label: 'Breakdown', color: '#43808f' },
  { value: 'drop', label: 'Drop', color: '#9e5a55' },
  { value: 'outro', label: 'Outro', color: '#6b6c9c' },
  { value: 'custom', label: 'Custom', color: 'var(--color-text-tertiary)' },
];

// ==================== TRACK TEMPLATE TYPES ====================
export interface TrackTemplate {
  id: string;
  name: string;
  description: string;
  category: 'vocals' | 'drums' | 'bass' | 'guitars' | 'keys' | 'strings' | 'full-mix' | 'custom';
  tracks: TrackConfig[];
  buses: BusConfig[];
  createdAt: number;
  isBuiltIn: boolean;
}

export interface TrackConfig {
  name: string;
  color: string;
  volume: number;
  pan: number;
  plugins: PluginConfig[];
  output: string;
  sends: SendConfig[];
}

export interface BusConfig {
  name: string;
  type: 'aux' | 'group' | 'fx';
  color: string;
  plugins: PluginConfig[];
}

export interface PluginConfig {
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface SendConfig {
  busName: string;
  level: number;
  preFader: boolean;
}

// Built-in track templates
export const TRACK_TEMPLATES: TrackTemplate[] = [
  {
    id: 'vocal-chain',
    name: 'Vocal Recording',
    description: 'Standard vocal recording setup with EQ, compression, and reverb',
    category: 'vocals',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Lead Vocal', color: '#a08644', volume: 0.8, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 100, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 8, release: 100, makeupGain: 3 } },
        { type: 'deesser', enabled: true, params: { frequency: 6500, threshold: -20, ratio: 4 } },
      ], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.25, preFader: false }] },
      { name: 'Vocal Double', color: '#a8744a', volume: 0.5, pan: -0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -6, midGain: 1, highGain: 2, lowFreq: 150, highFreq: 6000 } },
      ], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.35, preFader: false }] },
      { name: 'Harmonies', color: '#8f8748', volume: 0.4, pan: 0.3, plugins: [], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.4, preFader: false }] },
    ],
    buses: [
      { name: 'Vocal Reverb', type: 'fx', color: '#43808f', plugins: [
        { type: 'reverb', enabled: true, params: { roomSize: 35, damping: 50, wetDry: 100, predelay: 15 } },
      ]},
    ],
  },
  {
    id: 'drum-kit',
    name: 'Full Drum Kit',
    description: 'Multi-track drum recording with individual mic channels',
    category: 'drums',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Kick', color: '#9e5a55', volume: 0.85, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 4, midGain: -2, highGain: 2, lowFreq: 60, highFreq: 5000 } },
        { type: 'compressor', enabled: true, params: { threshold: -12, ratio: 4, attack: 5, release: 50, makeupGain: 2 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Snare Top', color: '#a8744a', volume: 0.8, pan: 0.05, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -2, midGain: 2, highGain: 3, lowFreq: 150, highFreq: 6000 } },
        { type: 'gate', enabled: true, params: { threshold: -35, attack: 0.5, hold: 30, release: 50 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.3, preFader: false }] },
      { name: 'Snare Bottom', color: '#a08644', volume: 0.5, pan: 0.05, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -30, attack: 0.3, hold: 20, release: 40 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Hi-Hat', color: '#8f8748', volume: 0.65, pan: 0.4, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -8, midGain: 0, highGain: 2, lowFreq: 400, highFreq: 10000 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Rack Tom', color: '#4f8a60', volume: 0.7, pan: -0.25, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -32, attack: 0.5, hold: 40, release: 60 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.35, preFader: false }] },
      { name: 'Floor Tom', color: '#468a74', volume: 0.75, pan: 0.3, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -30, attack: 0.8, hold: 50, release: 80 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.35, preFader: false }] },
      { name: 'Overheads L', color: '#5a78a0', volume: 0.6, pan: -0.8, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Overheads R', color: '#6b6c9c', volume: 0.6, pan: 0.8, plugins: [], output: 'Drum Bus', sends: [] },
    ],
    buses: [
      { name: 'Drum Bus', type: 'group', color: '#9e5a55', plugins: [
        { type: 'compressor', enabled: true, params: { threshold: -15, ratio: 3, attack: 15, release: 80, makeupGain: 2 } },
      ]},
      { name: 'Drum Room', type: 'fx', color: '#43808f', plugins: [
        { type: 'reverb', enabled: true, params: { roomSize: 30, damping: 55, wetDry: 100, predelay: 8 } },
      ]},
    ],
  },
  {
    id: 'bass-di',
    name: 'Bass DI Setup',
    description: 'Clean DI bass with compression and saturation',
    category: 'bass',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Bass DI', color: '#7c6a9c', volume: 0.85, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 3, midGain: 1, highGain: -1, lowFreq: 80, highFreq: 4000 } },
        { type: 'compressor', enabled: true, params: { threshold: -16, ratio: 5, attack: 15, release: 200, makeupGain: 3 } },
      ], output: 'master', sends: [] },
      { name: 'Bass Dirty', color: '#8a6a9c', volume: 0.4, pan: 0, plugins: [
        { type: 'saturation', enabled: true, params: { drive: 45, warmth: 60, mix: 100 } },
        { type: 'eq', enabled: true, params: { lowGain: -6, midGain: 4, highGain: 2, lowFreq: 200, highFreq: 3000 } },
      ], output: 'master', sends: [] },
    ],
    buses: [],
  },
  {
    id: 'guitar-stack',
    name: 'Guitar Recording',
    description: 'Electric guitar with doubled tracks and effects',
    category: 'guitars',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Guitar L', color: '#4f8a60', volume: 0.75, pan: -0.7, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 120, highFreq: 6000 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.2, preFader: false }] },
      { name: 'Guitar R', color: '#468a74', volume: 0.75, pan: 0.7, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 120, highFreq: 6000 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.2, preFader: false }] },
      { name: 'Guitar Clean', color: '#438a80', volume: 0.6, pan: 0, plugins: [
        { type: 'chorus', enabled: true, params: { rate: 0.8, depth: 40, wetDry: 30 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.35, preFader: false }] },
    ],
    buses: [
      { name: 'Guitar Bus', type: 'group', color: '#4f8a60', plugins: [
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 3, attack: 20, release: 150, makeupGain: 2 } },
      ]},
      { name: 'Guitar Verb', type: 'fx', color: '#43808f', plugins: [
        { type: 'reverb', enabled: true, params: { roomSize: 40, damping: 45, wetDry: 100, predelay: 20 } },
      ]},
    ],
  },
  {
    id: 'synth-stack',
    name: 'Synth/Keys Setup',
    description: 'Keyboard and synthesizer multi-track template',
    category: 'keys',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Piano', color: '#a06282', volume: 0.7, pan: -0.1, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -2, midGain: 1, highGain: 2, lowFreq: 100, highFreq: 8000 } },
      ], output: 'Keys Bus', sends: [{ busName: 'Keys Reverb', level: 0.3, preFader: false }] },
      { name: 'Pad', color: '#a05a68', volume: 0.5, pan: 0, plugins: [
        { type: 'chorus', enabled: true, params: { rate: 0.3, depth: 60, wetDry: 40 } },
      ], output: 'Keys Bus', sends: [{ busName: 'Keys Reverb', level: 0.5, preFader: false }] },
      { name: 'Lead Synth', color: '#e11d48', volume: 0.65, pan: 0.15, plugins: [
        { type: 'delay', enabled: true, params: { time: 375, feedback: 35, wetDry: 25 } },
      ], output: 'Keys Bus', sends: [] },
      { name: 'Bass Synth', color: '#be123c', volume: 0.8, pan: 0, plugins: [
        { type: 'compressor', enabled: true, params: { threshold: -14, ratio: 4, attack: 10, release: 150, makeupGain: 2 } },
      ], output: 'master', sends: [] },
    ],
    buses: [
      { name: 'Keys Bus', type: 'group', color: '#a06282', plugins: [] },
      { name: 'Keys Reverb', type: 'fx', color: '#43808f', plugins: [
        { type: 'reverb', enabled: true, params: { roomSize: 60, damping: 35, wetDry: 100, predelay: 25 } },
      ]},
    ],
  },
  {
    id: 'string-section',
    name: 'String Section',
    description: 'Orchestral string section recording setup',
    category: 'strings',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Violins I', color: '#a08644', volume: 0.7, pan: -0.5, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Violins II', color: '#a8744a', volume: 0.65, pan: -0.25, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Violas', color: '#8f8748', volume: 0.65, pan: 0.15, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Cellos', color: '#d97706', volume: 0.7, pan: 0.4, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.35, preFader: false }] },
      { name: 'Basses', color: '#b45309', volume: 0.75, pan: 0.6, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.3, preFader: false }] },
    ],
    buses: [
      { name: 'Strings Bus', type: 'group', color: '#a08644', plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 1, midGain: 0, highGain: 2, lowFreq: 100, highFreq: 10000 } },
      ]},
      { name: 'String Hall', type: 'fx', color: '#43808f', plugins: [
        { type: 'reverb', enabled: true, params: { roomSize: 85, damping: 25, wetDry: 100, predelay: 35 } },
      ]},
    ],
  },
  {
    id: 'full-band',
    name: 'Full Band Mix',
    description: 'Complete band setup with all instruments',
    category: 'full-mix',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Kick', color: '#9e5a55', volume: 0.85, pan: 0, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Snare', color: '#a8744a', volume: 0.8, pan: 0.05, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Overheads', color: '#8f8748', volume: 0.6, pan: 0, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Bass', color: '#7c6a9c', volume: 0.85, pan: 0, plugins: [], output: 'master', sends: [] },
      { name: 'Guitar L', color: '#4f8a60', volume: 0.7, pan: -0.6, plugins: [], output: 'Guitar Bus', sends: [] },
      { name: 'Guitar R', color: '#468a74', volume: 0.7, pan: 0.6, plugins: [], output: 'Guitar Bus', sends: [] },
      { name: 'Keys', color: '#a06282', volume: 0.55, pan: -0.2, plugins: [], output: 'master', sends: [] },
      { name: 'Lead Vocal', color: '#a08644', volume: 0.8, pan: 0, plugins: [], output: 'Vocal Bus', sends: [] },
      { name: 'Backing Vox', color: '#d97706', volume: 0.45, pan: 0.25, plugins: [], output: 'Vocal Bus', sends: [] },
    ],
    buses: [
      { name: 'Drum Bus', type: 'group', color: '#9e5a55', plugins: [] },
      { name: 'Guitar Bus', type: 'group', color: '#4f8a60', plugins: [] },
      { name: 'Vocal Bus', type: 'group', color: '#a08644', plugins: [] },
    ],
  },
  {
    id: 'podcast',
    name: 'Podcast Recording',
    description: 'Multi-host podcast setup with processing',
    category: 'custom',
    isBuiltIn: true,
    createdAt: Date.now(),
    tracks: [
      { name: 'Host 1', color: '#5a78a0', volume: 0.85, pan: -0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 2, lowFreq: 120, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -20, ratio: 3, attack: 10, release: 150, makeupGain: 4 } },
        { type: 'gate', enabled: true, params: { threshold: -45, attack: 2, hold: 100, release: 150 } },
      ], output: 'master', sends: [] },
      { name: 'Host 2', color: '#6b6c9c', volume: 0.85, pan: 0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 2, lowFreq: 120, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -20, ratio: 3, attack: 10, release: 150, makeupGain: 4 } },
        { type: 'gate', enabled: true, params: { threshold: -45, attack: 2, hold: 100, release: 150 } },
      ], output: 'master', sends: [] },
      { name: 'Remote Guest', color: '#7c6a9c', volume: 0.8, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -6, midGain: 3, highGain: 3, lowFreq: 150, highFreq: 7000 } },
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 8, release: 120, makeupGain: 5 } },
      ], output: 'master', sends: [] },
      { name: 'Music/SFX', color: '#4f8a60', volume: 0.4, pan: 0, plugins: [], output: 'master', sends: [] },
    ],
    buses: [],
  },
];

// ==================== TRACK GROUP TYPES ====================
export interface TrackGroup {
  id: string;
  name: string;
  color: string;
  trackIds: string[];
  collapsed: boolean;
  linkedParams: {
    volume: boolean;
    pan: boolean;
    mute: boolean;
    solo: boolean;
  };
}

// ==================== METRONOME SETTINGS ====================
export interface MetronomeSettings {
  enabled: boolean;
  volume: number;
  countIn: number; // Number of bars for count-in (0 = disabled)
  accentDownbeat: boolean;
  subdivisions: 1 | 2 | 4; // Quarter, eighth, sixteenth notes
  sound: 'click' | 'woodblock' | 'beep' | 'cowbell';
}

export const DEFAULT_METRONOME: MetronomeSettings = {
  enabled: false,
  volume: 0.7,
  countIn: 2,
  accentDownbeat: true,
  subdivisions: 1,
  sound: 'click',
};

// ==================== PUNCH IN/OUT SETTINGS ====================
export interface PunchSettings {
  enabled: boolean;
  inPoint: number; // Time in seconds
  outPoint: number;
  preRoll: number; // Seconds before punch in to start playback
  postRoll: number; // Seconds after punch out to continue playback
}

export const DEFAULT_PUNCH: PunchSettings = {
  enabled: false,
  inPoint: 0,
  outPoint: 10,
  preRoll: 2,
  postRoll: 2,
};

// ==================== LOOP RECORDING SETTINGS ====================
export interface LoopRecordingSettings {
  enabled: boolean;
  startTime: number;
  endTime: number;
  maxTakes: number;
  autoMutePreviousTakes: boolean;
  comping: boolean; // Enable comping mode for takes
}

export const DEFAULT_LOOP_RECORDING: LoopRecordingSettings = {
  enabled: false,
  startTime: 0,
  endTime: 16,
  maxTakes: 10,
  autoMutePreviousTakes: true,
  comping: true,
};

// ==================== TIME SIGNATURE ====================
export interface TimeSignatureChange {
  id: string;
  bar: number;
  numerator: number;
  denominator: number;
}

export const COMMON_TIME_SIGNATURES = [
  { num: 4, denom: 4, label: '4/4' },
  { num: 3, denom: 4, label: '3/4' },
  { num: 6, denom: 8, label: '6/8' },
  { num: 2, denom: 4, label: '2/4' },
  { num: 5, denom: 4, label: '5/4' },
  { num: 7, denom: 8, label: '7/8' },
  { num: 12, denom: 8, label: '12/8' },
];

// ==================== TEMPO AUTOMATION ====================
export interface TempoPoint {
  id: string;
  time: number; // Position in seconds
  bpm: number;
  curve: 'linear' | 'instant' | 'curved';
}

// ==================== TRACK NOTES ====================
export interface TrackNote {
  id: string;
  trackId: string;
  content: string;
  color: string;
  createdAt: number;
  position?: number; // Optional position on timeline
}

// ==================== CLIP COLORS ====================
// Muted "studio hardware" channel palette — same hue spread so channels stay
// distinguishable, but desaturated to a restrained, professional level (no candy
// rainbow). Pro DAWs (Logic, FL, hardware mixers) use low-saturation channel tints
// so the meters/waveforms read clearly and the chrome reads as a real machine.
export const CLIP_COLORS = [
  { id: 'red', color: '#9e5a55', name: 'Red' },
  { id: 'orange', color: '#a8744a', name: 'Orange' },
  { id: 'amber', color: '#a08644', name: 'Amber' },
  { id: 'yellow', color: '#8f8748', name: 'Yellow' },
  { id: 'lime', color: '#6f8a4e', name: 'Lime' },
  { id: 'green', color: '#4f8a60', name: 'Green' },
  { id: 'emerald', color: '#468a74', name: 'Emerald' },
  { id: 'teal', color: '#438a80', name: 'Teal' },
  { id: 'cyan', color: '#43808f', name: 'Cyan' },
  { id: 'sky', color: '#4a7896', name: 'Sky' },
  { id: 'blue', color: '#5a78a0', name: 'Blue' },
  { id: 'indigo', color: '#6b6c9c', name: 'Indigo' },
  { id: 'violet', color: '#7c6a9c', name: 'Violet' },
  { id: 'purple', color: '#8a6a9c', name: 'Purple' },
  { id: 'fuchsia', color: '#976595', name: 'Fuchsia' },
  { id: 'pink', color: '#a06282', name: 'Pink' },
  { id: 'rose', color: '#a05a68', name: 'Rose' },
  { id: 'gray', color: 'var(--color-text-tertiary)', name: 'Gray' },
];

// ==================== WAVEFORM ZOOM PRESETS ====================
export const WAVEFORM_ZOOM_PRESETS = [
  { label: 'Fit', value: 0 }, // Auto-fit
  { label: '1 bar', value: 4 },
  { label: '2 bars', value: 8 },
  { label: '4 bars', value: 16 },
  { label: '8 bars', value: 32 },
  { label: '16 bars', value: 64 },
  { label: '32 bars', value: 128 },
  { label: 'Full', value: -1 }, // Show all
];

// ==================== REFERENCE TRACK TYPES ====================
export interface ReferenceTrack {
  id: string;
  name: string;
  filePath: string;
  volume: number;
  startOffset: number;
  enabled: boolean;
  waveform: number[];
  duration: number;
}

// ==================== UTILITY FUNCTIONS ====================

// Generate unique ID -- thin app default over the shared canonical
import { generateId as sharedGenerateId } from '../../../shared/util/id';
import { persistOrWarn } from '../../utils/persistOrWarn';
export const generateId = (prefix: string = 'id'): string => sharedGenerateId(prefix);

// Convert bars to seconds
export const barsToSeconds = (bars: number, bpm: number, timeSignature: { num: number; denom: number }): number => {
  const beatsPerBar = timeSignature.num;
  const beatDuration = 60 / bpm;
  return bars * beatsPerBar * beatDuration;
};

// Convert seconds to bars
export const secondsToBars = (seconds: number, bpm: number, timeSignature: { num: number; denom: number }): number => {
  const beatsPerBar = timeSignature.num;
  const beatDuration = 60 / bpm;
  return seconds / (beatsPerBar * beatDuration);
};

// Format time for display
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// Format bar position
export const formatBarPosition = (bars: number): string => {
  const bar = Math.floor(bars) + 1;
  const beat = Math.floor((bars % 1) * 4) + 1;
  return `${bar}.${beat}`;
};

// Save templates to localStorage
export const saveCustomTemplates = (templates: TrackTemplate[]) => {
  try {
    const custom = templates.filter(t => !t.isBuiltIn);
    persistOrWarn('dex-imosion-templates', JSON.stringify(custom), 'your Imosion track templates');
  } catch (error) {
    console.warn('Failed to save templates:', error);
  }
};

// Load custom templates from localStorage
export const loadCustomTemplates = (): TrackTemplate[] => {
  try {
    const saved = localStorage.getItem('dex-imosion-templates');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Get all templates (built-in + custom)
export const getAllTemplates = (): TrackTemplate[] => {
  return [...TRACK_TEMPLATES, ...loadCustomTemplates()];
};

// Save markers to localStorage
export const saveMarkers = (projectId: string, markers: Marker[]) => {
  try {
    persistOrWarn(`dex-imosion-markers-${projectId}`, JSON.stringify(markers), 'Imosion markers');
  } catch { /* serialisation failed */ }
};

// Load markers from localStorage
export const loadMarkers = (projectId: string): Marker[] => {
  try {
    const saved = localStorage.getItem(`dex-imosion-markers-${projectId}`);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Save regions to localStorage
export const saveRegions = (projectId: string, regions: Region[]) => {
  try {
    persistOrWarn(`dex-imosion-regions-${projectId}`, JSON.stringify(regions), 'Imosion regions');
  } catch { /* serialisation failed */ }
};

// Load regions from localStorage
export const loadRegions = (projectId: string): Region[] => {
  try {
    const saved = localStorage.getItem(`dex-imosion-regions-${projectId}`);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// ===========================================================================
// ITEMS 141-145: AI AUDIO TOOLS
// ===========================================================================

export interface AIAudioTool {
  id: string;
  name: string;
  description: string;
  category: 'separation' | 'enhancement' | 'generation' | 'analysis';
  inputType: 'audio' | 'midi' | 'both';
  outputType: 'audio' | 'midi' | 'data';
}

export const AI_AUDIO_TOOLS: AIAudioTool[] = [
  {
    id: 'stem-separation',
    name: 'AI Stem Separation',
    description: 'Separate vocals, drums, bass, and other instruments',
    category: 'separation',
    inputType: 'audio',
    outputType: 'audio',
  },
  {
    id: 'vocal-isolation',
    name: 'Vocal Isolation',
    description: 'Extract or remove vocals from a mix',
    category: 'separation',
    inputType: 'audio',
    outputType: 'audio',
  },
  {
    id: 'noise-reduction-ai',
    name: 'AI Noise Reduction',
    description: 'Advanced AI-powered noise removal',
    category: 'enhancement',
    inputType: 'audio',
    outputType: 'audio',
  },
  {
    id: 'audio-upscaling',
    name: 'Audio Upscaling',
    description: 'Enhance audio quality and restore frequencies',
    category: 'enhancement',
    inputType: 'audio',
    outputType: 'audio',
  },
  {
    id: 'beat-detection',
    name: 'Beat Detection',
    description: 'Automatically detect tempo and beats',
    category: 'analysis',
    inputType: 'audio',
    outputType: 'data',
  },
  {
    id: 'chord-detection',
    name: 'Chord Detection',
    description: 'Identify chords in audio',
    category: 'analysis',
    inputType: 'audio',
    outputType: 'data',
  },
  {
    id: 'melody-extraction',
    name: 'Melody Extraction',
    description: 'Extract melody as MIDI from audio',
    category: 'analysis',
    inputType: 'audio',
    outputType: 'midi',
  },
  {
    id: 'drum-replacement',
    name: 'Drum Replacement',
    description: 'Replace drum sounds with samples',
    category: 'generation',
    inputType: 'audio',
    outputType: 'audio',
  },
];

// ===========================================================================
// ITEMS 146-150: SMART MIXING ASSISTANT
// ===========================================================================

export interface MixAnalysis {
  overallLoudness: number; // LUFS
  peakLevel: number; // dBFS
  dynamicRange: number; // dB
  frequencyBalance: FrequencyBalance;
  stereoWidth: number; // 0-100%
  phaseCorrelation: number; // -1 to 1
  issues: MixIssue[];
  suggestions: MixSuggestion[];
}

export interface FrequencyBalance {
  sub: number;       // 20-60Hz
  bass: number;      // 60-250Hz
  lowMid: number;    // 250-500Hz
  mid: number;       // 500-2kHz
  highMid: number;   // 2-4kHz
  presence: number;  // 4-8kHz
  brilliance: number;// 8-20kHz
}

export interface MixIssue {
  type: 'loudness' | 'frequency' | 'dynamics' | 'stereo' | 'phase' | 'clipping';
  severity: 'low' | 'medium' | 'high';
  message: string;
  trackId?: string;
  frequency?: number;
}

export interface MixSuggestion {
  type: 'eq' | 'compression' | 'volume' | 'pan' | 'reverb' | 'general';
  message: string;
  trackId?: string;
  action?: {
    plugin: string;
    param: string;
    value: number;
  };
}

export const LOUDNESS_TARGETS = {
  streaming: { integrated: -14, truePeak: -1, range: 8 },
  broadcast: { integrated: -24, truePeak: -2, range: 6 },
  cinema: { integrated: -27, truePeak: -3, range: 20 },
  cd: { integrated: -9, truePeak: -0.3, range: 10 },
  podcast: { integrated: -16, truePeak: -1.5, range: 8 },
};

export function analyzeMixBalance(frequencies: number[]): FrequencyBalance {
  // Accepts normalized band magnitudes derived from an external FFT pass.
  return {
    sub: frequencies[0] || 0,
    bass: frequencies[1] || 0,
    lowMid: frequencies[2] || 0,
    mid: frequencies[3] || 0,
    highMid: frequencies[4] || 0,
    presence: frequencies[5] || 0,
    brilliance: frequencies[6] || 0,
  };
}

export interface ChordDetectionResult {
  segments: ChordSegment[];
  dominantKey: string | null;
}

const CHROMATIC_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] || 0) * (b[i] || 0);
  }
  return sum;
}

function rotate(values: number[], shift: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    out[i] = values[(i + shift) % values.length] || 0;
  }
  return out;
}

export function inferKeyFromChordSegments(segments: ChordSegment[]): string | null {
  if (!segments.length) return null;

  const pitchClassEnergy = new Array<number>(12).fill(0);

  for (const segment of segments) {
    const duration = Math.max(0, segment.endSec - segment.startSec);
    const idx = CHROMATIC_KEYS.indexOf(segment.root);
    if (idx >= 0) {
      pitchClassEnergy[idx] += duration * Math.max(0.1, segment.confidence);
    }
  }

  let bestLabel: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let root = 0; root < 12; root++) {
    const majorScore = dot(pitchClassEnergy, rotate(MAJOR_PROFILE, root));
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestLabel = `${CHROMATIC_KEYS[root]} major`;
    }

    const minorScore = dot(pitchClassEnergy, rotate(MINOR_PROFILE, root));
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestLabel = `${CHROMATIC_KEYS[root]} minor`;
    }
  }

  return bestLabel;
}

export function detectChordProgression(
  audio: Float32Array | Float64Array,
  sampleRate = 44100,
): ChordDetectionResult {
  const segments = detectChords(audio, {
    sampleRate,
    frameSize: 4096,
    hopSize: 2048,
    minConfidence: 0.55,
    minSegmentSec: 0.2,
  });

  return {
    segments,
    dominantKey: inferKeyFromChordSegments(segments),
  };
}

// ===========================================================================
// ITEMS 151-155: INSTRUMENT PRESETS
// ===========================================================================

export interface InstrumentPreset {
  id: string;
  name: string;
  category: string;
  genre: string[];
  settings: InstrumentSettings;
  preview?: string;
}

export interface InstrumentSettings {
  oscillators?: OscillatorConfig[];
  filter?: FilterConfig;
  envelope?: EnvelopeConfig;
  effects?: EffectConfig[];
  modulation?: ModulationConfig[];
}

export interface OscillatorConfig {
  type: 'sine' | 'sawtooth' | 'square' | 'triangle' | 'noise';
  detune: number;
  level: number;
  octave: number;
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
  frequency: number;
  resonance: number;
  envelope: number;
}

export interface EnvelopeConfig {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface EffectConfig {
  type: string;
  params: Record<string, number>;
  wet: number;
}

export interface ModulationConfig {
  source: string;
  destination: string;
  amount: number;
}

export const SYNTH_PRESETS: InstrumentPreset[] = [
  {
    id: 'warm-pad',
    name: 'Warm Pad',
    category: 'Pads',
    genre: ['ambient', 'cinematic', 'chill'],
    settings: {
      oscillators: [
        { type: 'sawtooth', detune: 0, level: 0.5, octave: 0 },
        { type: 'sawtooth', detune: 7, level: 0.5, octave: 0 },
      ],
      filter: { type: 'lowpass', frequency: 2000, resonance: 0.3, envelope: 0.4 },
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.7, release: 1.5 },
      effects: [
        { type: 'chorus', params: { rate: 0.5, depth: 0.4 }, wet: 0.5 },
        { type: 'reverb', params: { roomSize: 0.7, damping: 0.5 }, wet: 0.4 },
      ],
    },
  },
  {
    id: 'plucky-bass',
    name: 'Plucky Bass',
    category: 'Bass',
    genre: ['electronic', 'house', 'pop'],
    settings: {
      oscillators: [
        { type: 'square', detune: 0, level: 0.7, octave: -1 },
        { type: 'sawtooth', detune: 0, level: 0.3, octave: 0 },
      ],
      filter: { type: 'lowpass', frequency: 800, resonance: 0.5, envelope: 0.8 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 },
    },
  },
  {
    id: 'supersaw-lead',
    name: 'Supersaw Lead',
    category: 'Lead',
    genre: ['edm', 'trance', 'progressive'],
    settings: {
      oscillators: [
        { type: 'sawtooth', detune: -15, level: 0.33, octave: 0 },
        { type: 'sawtooth', detune: 0, level: 0.34, octave: 0 },
        { type: 'sawtooth', detune: 15, level: 0.33, octave: 0 },
      ],
      filter: { type: 'lowpass', frequency: 5000, resonance: 0.2, envelope: 0.3 },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.8, release: 0.5 },
      effects: [
        { type: 'delay', params: { time: 0.375, feedback: 0.3 }, wet: 0.3 },
      ],
    },
  },
];

// ===========================================================================
// ITEMS 156-160: PROJECT TEMPLATES
// ===========================================================================

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  genre: string;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  tracks: ProjectTrack[];
  markers: Marker[];
  regions: Region[];
}

export interface ProjectTrack {
  name: string;
  type: 'audio' | 'midi' | 'aux' | 'master';
  color: string;
  volume: number;
  pan: number;
  armed: boolean;
  solo: boolean;
  mute: boolean;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'pop-song',
    name: 'Pop Song',
    description: 'Standard pop song structure with verse-chorus arrangement',
    genre: 'Pop',
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [
      { name: 'Lead Vocal', type: 'audio', color: '#a08644', volume: 0.8, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Backing Vocals', type: 'audio', color: '#a8744a', volume: 0.5, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Drums', type: 'midi', color: '#9e5a55', volume: 0.85, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Bass', type: 'midi', color: '#4f8a60', volume: 0.75, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Piano', type: 'midi', color: '#5a78a0', volume: 0.6, pan: -0.1, armed: false, solo: false, mute: false },
      { name: 'Synth Pad', type: 'midi', color: '#7c6a9c', volume: 0.4, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Strings', type: 'midi', color: '#a06282', volume: 0.45, pan: 0.1, armed: false, solo: false, mute: false },
    ],
    markers: [
      { id: 'm1', time: 0, name: 'Intro', color: '#4f8a60', type: 'marker' },
      { id: 'm2', time: 16, name: 'Verse 1', color: '#5a78a0', type: 'marker' },
      { id: 'm3', time: 48, name: 'Chorus', color: '#a08644', type: 'marker' },
    ],
    regions: [
      { id: 'r1', name: 'Intro', startTime: 0, endTime: 16, color: '#4f8a60', type: 'intro' },
      { id: 'r2', name: 'Verse 1', startTime: 16, endTime: 48, color: '#5a78a0', type: 'verse' },
      { id: 'r3', name: 'Chorus 1', startTime: 48, endTime: 80, color: '#a08644', type: 'chorus' },
    ],
  },
  {
    id: 'electronic',
    name: 'Electronic Production',
    description: 'EDM/Electronic track layout',
    genre: 'Electronic',
    tempo: 128,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [
      { name: 'Kick', type: 'midi', color: '#9e5a55', volume: 0.9, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Snare/Clap', type: 'midi', color: '#a8744a', volume: 0.85, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Hi-Hats', type: 'midi', color: '#a08644', volume: 0.7, pan: 0.2, armed: false, solo: false, mute: false },
      { name: 'Bass', type: 'midi', color: '#4f8a60', volume: 0.85, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Lead Synth', type: 'midi', color: '#5a78a0', volume: 0.7, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Pad', type: 'midi', color: '#7c6a9c', volume: 0.5, pan: 0, armed: false, solo: false, mute: false },
      { name: 'FX/Risers', type: 'audio', color: '#a06282', volume: 0.6, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Vocal Chops', type: 'audio', color: '#43808f', volume: 0.55, pan: 0, armed: false, solo: false, mute: false },
    ],
    markers: [
      { id: 'm1', time: 0, name: 'Intro', color: '#4f8a60', type: 'marker' },
      { id: 'm2', time: 32, name: 'Build', color: '#a08644', type: 'marker' },
      { id: 'm3', time: 64, name: 'Drop', color: '#9e5a55', type: 'marker' },
    ],
    regions: [
      { id: 'r1', name: 'Intro', startTime: 0, endTime: 32, color: '#4f8a60', type: 'intro' },
      { id: 'r2', name: 'Build', startTime: 32, endTime: 64, color: '#a08644', type: 'breakdown' },
      { id: 'r3', name: 'Drop', startTime: 64, endTime: 128, color: '#9e5a55', type: 'drop' },
    ],
  },
  {
    id: 'podcast',
    name: 'Podcast Recording',
    description: 'Podcast or voiceover setup',
    genre: 'Podcast',
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [
      { name: 'Host', type: 'audio', color: '#5a78a0', volume: 0.85, pan: -0.3, armed: true, solo: false, mute: false },
      { name: 'Guest 1', type: 'audio', color: '#4f8a60', volume: 0.85, pan: 0.3, armed: false, solo: false, mute: false },
      { name: 'Guest 2', type: 'audio', color: '#a08644', volume: 0.85, pan: 0.5, armed: false, solo: false, mute: true },
      { name: 'Intro Music', type: 'audio', color: '#7c6a9c', volume: 0.5, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Outro Music', type: 'audio', color: '#a06282', volume: 0.5, pan: 0, armed: false, solo: false, mute: false },
      { name: 'Sound Effects', type: 'audio', color: '#9e5a55', volume: 0.6, pan: 0, armed: false, solo: false, mute: false },
    ],
    markers: [],
    regions: [],
  },
];

export default {
  TRACK_TEMPLATES,
  REGION_TYPES,
  CLIP_COLORS,
  WAVEFORM_ZOOM_PRESETS,
  COMMON_TIME_SIGNATURES,
  DEFAULT_METRONOME,
  DEFAULT_PUNCH,
  DEFAULT_LOOP_RECORDING,
  AI_AUDIO_TOOLS,
  LOUDNESS_TARGETS,
  SYNTH_PRESETS,
  PROJECT_TEMPLATES,
  generateId,
  barsToSeconds,
  secondsToBars,
  formatTime,
  formatBarPosition,
  saveCustomTemplates,
  loadCustomTemplates,
  getAllTemplates,
  saveMarkers,
  loadMarkers,
  saveRegions,
  loadRegions,
};
