/**
 * DEX Imosion DAW Feature Enhancements
 * Markers, Regions, Track Templates, Track Grouping, Metronome
 */

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
  { value: 'intro', label: 'Intro', color: '#22c55e' },
  { value: 'verse', label: 'Verse', color: '#3b82f6' },
  { value: 'chorus', label: 'Chorus', color: '#f59e0b' },
  { value: 'bridge', label: 'Bridge', color: '#8b5cf6' },
  { value: 'hook', label: 'Hook', color: '#ec4899' },
  { value: 'breakdown', label: 'Breakdown', color: '#06b6d4' },
  { value: 'drop', label: 'Drop', color: '#ef4444' },
  { value: 'outro', label: 'Outro', color: '#6366f1' },
  { value: 'custom', label: 'Custom', color: '#71717a' },
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
      { name: 'Lead Vocal', color: '#f59e0b', volume: 0.8, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 100, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 8, release: 100, makeupGain: 3 } },
        { type: 'deesser', enabled: true, params: { frequency: 6500, threshold: -20, ratio: 4 } },
      ], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.25, preFader: false }] },
      { name: 'Vocal Double', color: '#f97316', volume: 0.5, pan: -0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -6, midGain: 1, highGain: 2, lowFreq: 150, highFreq: 6000 } },
      ], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.35, preFader: false }] },
      { name: 'Harmonies', color: '#eab308', volume: 0.4, pan: 0.3, plugins: [], output: 'master', sends: [{ busName: 'Vocal Reverb', level: 0.4, preFader: false }] },
    ],
    buses: [
      { name: 'Vocal Reverb', type: 'fx', color: '#06b6d4', plugins: [
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
      { name: 'Kick', color: '#ef4444', volume: 0.85, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 4, midGain: -2, highGain: 2, lowFreq: 60, highFreq: 5000 } },
        { type: 'compressor', enabled: true, params: { threshold: -12, ratio: 4, attack: 5, release: 50, makeupGain: 2 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Snare Top', color: '#f97316', volume: 0.8, pan: 0.05, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -2, midGain: 2, highGain: 3, lowFreq: 150, highFreq: 6000 } },
        { type: 'gate', enabled: true, params: { threshold: -35, attack: 0.5, hold: 30, release: 50 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.3, preFader: false }] },
      { name: 'Snare Bottom', color: '#f59e0b', volume: 0.5, pan: 0.05, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -30, attack: 0.3, hold: 20, release: 40 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Hi-Hat', color: '#eab308', volume: 0.65, pan: 0.4, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -8, midGain: 0, highGain: 2, lowFreq: 400, highFreq: 10000 } },
      ], output: 'Drum Bus', sends: [] },
      { name: 'Rack Tom', color: '#22c55e', volume: 0.7, pan: -0.25, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -32, attack: 0.5, hold: 40, release: 60 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.35, preFader: false }] },
      { name: 'Floor Tom', color: '#10b981', volume: 0.75, pan: 0.3, plugins: [
        { type: 'gate', enabled: true, params: { threshold: -30, attack: 0.8, hold: 50, release: 80 } },
      ], output: 'Drum Bus', sends: [{ busName: 'Drum Room', level: 0.35, preFader: false }] },
      { name: 'Overheads L', color: '#3b82f6', volume: 0.6, pan: -0.8, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Overheads R', color: '#6366f1', volume: 0.6, pan: 0.8, plugins: [], output: 'Drum Bus', sends: [] },
    ],
    buses: [
      { name: 'Drum Bus', type: 'group', color: '#ef4444', plugins: [
        { type: 'compressor', enabled: true, params: { threshold: -15, ratio: 3, attack: 15, release: 80, makeupGain: 2 } },
      ]},
      { name: 'Drum Room', type: 'fx', color: '#06b6d4', plugins: [
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
      { name: 'Bass DI', color: '#8b5cf6', volume: 0.85, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 3, midGain: 1, highGain: -1, lowFreq: 80, highFreq: 4000 } },
        { type: 'compressor', enabled: true, params: { threshold: -16, ratio: 5, attack: 15, release: 200, makeupGain: 3 } },
      ], output: 'master', sends: [] },
      { name: 'Bass Dirty', color: '#a855f7', volume: 0.4, pan: 0, plugins: [
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
      { name: 'Guitar L', color: '#22c55e', volume: 0.75, pan: -0.7, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 120, highFreq: 6000 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.2, preFader: false }] },
      { name: 'Guitar R', color: '#10b981', volume: 0.75, pan: 0.7, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 1, lowFreq: 120, highFreq: 6000 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.2, preFader: false }] },
      { name: 'Guitar Clean', color: '#14b8a6', volume: 0.6, pan: 0, plugins: [
        { type: 'chorus', enabled: true, params: { rate: 0.8, depth: 40, wetDry: 30 } },
      ], output: 'Guitar Bus', sends: [{ busName: 'Guitar Verb', level: 0.35, preFader: false }] },
    ],
    buses: [
      { name: 'Guitar Bus', type: 'group', color: '#22c55e', plugins: [
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 3, attack: 20, release: 150, makeupGain: 2 } },
      ]},
      { name: 'Guitar Verb', type: 'fx', color: '#06b6d4', plugins: [
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
      { name: 'Piano', color: '#ec4899', volume: 0.7, pan: -0.1, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -2, midGain: 1, highGain: 2, lowFreq: 100, highFreq: 8000 } },
      ], output: 'Keys Bus', sends: [{ busName: 'Keys Reverb', level: 0.3, preFader: false }] },
      { name: 'Pad', color: '#f43f5e', volume: 0.5, pan: 0, plugins: [
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
      { name: 'Keys Bus', type: 'group', color: '#ec4899', plugins: [] },
      { name: 'Keys Reverb', type: 'fx', color: '#06b6d4', plugins: [
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
      { name: 'Violins I', color: '#f59e0b', volume: 0.7, pan: -0.5, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Violins II', color: '#f97316', volume: 0.65, pan: -0.25, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Violas', color: '#eab308', volume: 0.65, pan: 0.15, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.4, preFader: false }] },
      { name: 'Cellos', color: '#d97706', volume: 0.7, pan: 0.4, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.35, preFader: false }] },
      { name: 'Basses', color: '#b45309', volume: 0.75, pan: 0.6, plugins: [], output: 'Strings Bus', sends: [{ busName: 'String Hall', level: 0.3, preFader: false }] },
    ],
    buses: [
      { name: 'Strings Bus', type: 'group', color: '#f59e0b', plugins: [
        { type: 'eq', enabled: true, params: { lowGain: 1, midGain: 0, highGain: 2, lowFreq: 100, highFreq: 10000 } },
      ]},
      { name: 'String Hall', type: 'fx', color: '#06b6d4', plugins: [
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
      { name: 'Kick', color: '#ef4444', volume: 0.85, pan: 0, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Snare', color: '#f97316', volume: 0.8, pan: 0.05, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Overheads', color: '#eab308', volume: 0.6, pan: 0, plugins: [], output: 'Drum Bus', sends: [] },
      { name: 'Bass', color: '#8b5cf6', volume: 0.85, pan: 0, plugins: [], output: 'master', sends: [] },
      { name: 'Guitar L', color: '#22c55e', volume: 0.7, pan: -0.6, plugins: [], output: 'Guitar Bus', sends: [] },
      { name: 'Guitar R', color: '#10b981', volume: 0.7, pan: 0.6, plugins: [], output: 'Guitar Bus', sends: [] },
      { name: 'Keys', color: '#ec4899', volume: 0.55, pan: -0.2, plugins: [], output: 'master', sends: [] },
      { name: 'Lead Vocal', color: '#f59e0b', volume: 0.8, pan: 0, plugins: [], output: 'Vocal Bus', sends: [] },
      { name: 'Backing Vox', color: '#d97706', volume: 0.45, pan: 0.25, plugins: [], output: 'Vocal Bus', sends: [] },
    ],
    buses: [
      { name: 'Drum Bus', type: 'group', color: '#ef4444', plugins: [] },
      { name: 'Guitar Bus', type: 'group', color: '#22c55e', plugins: [] },
      { name: 'Vocal Bus', type: 'group', color: '#f59e0b', plugins: [] },
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
      { name: 'Host 1', color: '#3b82f6', volume: 0.85, pan: -0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 2, lowFreq: 120, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -20, ratio: 3, attack: 10, release: 150, makeupGain: 4 } },
        { type: 'gate', enabled: true, params: { threshold: -45, attack: 2, hold: 100, release: 150 } },
      ], output: 'master', sends: [] },
      { name: 'Host 2', color: '#6366f1', volume: 0.85, pan: 0.3, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -4, midGain: 2, highGain: 2, lowFreq: 120, highFreq: 8000 } },
        { type: 'compressor', enabled: true, params: { threshold: -20, ratio: 3, attack: 10, release: 150, makeupGain: 4 } },
        { type: 'gate', enabled: true, params: { threshold: -45, attack: 2, hold: 100, release: 150 } },
      ], output: 'master', sends: [] },
      { name: 'Remote Guest', color: '#8b5cf6', volume: 0.8, pan: 0, plugins: [
        { type: 'eq', enabled: true, params: { lowGain: -6, midGain: 3, highGain: 3, lowFreq: 150, highFreq: 7000 } },
        { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 8, release: 120, makeupGain: 5 } },
      ], output: 'master', sends: [] },
      { name: 'Music/SFX', color: '#22c55e', volume: 0.4, pan: 0, plugins: [], output: 'master', sends: [] },
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
export const CLIP_COLORS = [
  { id: 'red', color: '#ef4444', name: 'Red' },
  { id: 'orange', color: '#f97316', name: 'Orange' },
  { id: 'amber', color: '#f59e0b', name: 'Amber' },
  { id: 'yellow', color: '#eab308', name: 'Yellow' },
  { id: 'lime', color: '#84cc16', name: 'Lime' },
  { id: 'green', color: '#22c55e', name: 'Green' },
  { id: 'emerald', color: '#10b981', name: 'Emerald' },
  { id: 'teal', color: '#14b8a6', name: 'Teal' },
  { id: 'cyan', color: '#06b6d4', name: 'Cyan' },
  { id: 'sky', color: '#0ea5e9', name: 'Sky' },
  { id: 'blue', color: '#3b82f6', name: 'Blue' },
  { id: 'indigo', color: '#6366f1', name: 'Indigo' },
  { id: 'violet', color: '#8b5cf6', name: 'Violet' },
  { id: 'purple', color: '#a855f7', name: 'Purple' },
  { id: 'fuchsia', color: '#d946ef', name: 'Fuchsia' },
  { id: 'pink', color: '#ec4899', name: 'Pink' },
  { id: 'rose', color: '#f43f5e', name: 'Rose' },
  { id: 'gray', color: '#71717a', name: 'Gray' },
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

// Generate unique ID
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

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
    localStorage.setItem('dex-imosion-templates', JSON.stringify(custom));
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
    localStorage.setItem(`dex-imosion-markers-${projectId}`, JSON.stringify(markers));
  } catch { /* storage unavailable */ }
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
    localStorage.setItem(`dex-imosion-regions-${projectId}`, JSON.stringify(regions));
  } catch { /* storage unavailable */ }
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

export default {
  TRACK_TEMPLATES,
  REGION_TYPES,
  CLIP_COLORS,
  WAVEFORM_ZOOM_PRESETS,
  COMMON_TIME_SIGNATURES,
  DEFAULT_METRONOME,
  DEFAULT_PUNCH,
  DEFAULT_LOOP_RECORDING,
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
