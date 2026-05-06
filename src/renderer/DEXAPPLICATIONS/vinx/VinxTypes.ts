// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Type Definitions
 * All timeline positions are integer frame numbers.
 * No floating-point representation for temporal positions.
 */

// ---------------------------------------------------------------------------
// PROJECT
// ---------------------------------------------------------------------------

export interface VinxProject {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  frameRate: number;
  width: number;
  height: number;
  sampleRate: number;
  audioChannels: number;
  sequences: VinxSequence[];
  activeSequenceId: string;
  mediaBin: MediaItem[];
  bins: MediaBin[];
  markers: Marker[];
  panelLayout: PanelLayout;
  settings: VinxSettings;
  // New features
  subtitleTracks: SubtitleTrack[];
  compoundClips: CompoundClip[];
  multicamClips: MulticamClip[];
  motionTrackers: MotionTracker[];
  audioDucking: AudioDuckingSettings;
  proxySettings: ProxySettings;
  templateId: string | null;
}

export interface VinxSettings {
  defaultTransitionDuration: number;
  scopeUpdateInterval: number;
  autoSaveInterval: number;
  scrubAudioEnabled: boolean;
  snapEnabled: boolean;
  rippleDeleteEnabled: boolean;
  linkedSelectionEnabled: boolean;
  renderQuality: RenderQuality;
}

export type RenderQuality = 'full' | 'half' | 'quarter' | 'auto';

// ---------------------------------------------------------------------------
// MEDIA
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  path: string;
  proxyPath: string | null;
  proxyProgress: number;
  duration: number;
  frameRate: number;
  width: number;
  height: number;
  sampleRate: number;
  audioChannels: number;
  fileSize: number;
  thumbnailUrl: string | null;
  waveformData: Float32Array | null;
  binId: string | null;
  addedAt: number;
}

export interface MediaBin {
  id: string;
  name: string;
  parentId: string | null;
  expanded: boolean;
}

// ---------------------------------------------------------------------------
// SEQUENCE / TRACKS / CLIPS
// ---------------------------------------------------------------------------

export interface VinxSequence {
  id: string;
  name: string;
  tracks: Track[];
  duration: number;
  inPoint: number | null;
  outPoint: number | null;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'title';
  height: number;
  color?: string;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  solo: boolean;
  volume: number;
  clips: Clip[];
}

export interface Clip {
  id: string;
  mediaId: string | null;
  trackId: string;
  type: 'video' | 'audio' | 'title' | 'compound';
  startFrame: number;
  endFrame: number;
  mediaInFrame: number;
  mediaOutFrame: number;
  name: string;
  color: string;
  speed: number;
  reverse: boolean;
  opacity: number;
  volume: number;
  pan: number;
  muted: boolean;
  transform: ClipTransform;
  effects: ClipEffect[];
  transitionIn: TransitionInstance | null;
  transitionOut: TransitionInstance | null;
  keyframes: KeyframeTrack[];
  titleData: TitleData | null;
  linkedClipId: string | null;
  // New: Speed ramping
  speedRamp: SpeedRamp | null;
  // New: Masks
  masks: ClipMask[];
  // New: Compound clip reference
  compoundClipId: string | null;
  // New: Noise reduction
  noiseReduction: NoiseReductionSettings | null;
  // New: Stabilization
  stabilization: StabilizationSettings | null;
  // New: Freeze frame
  isFreezeFrame: boolean;
  freezeFrameSource: number;
}

export interface ClipTransform {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  scaleLinked: boolean;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

// ---------------------------------------------------------------------------
// EFFECTS
// ---------------------------------------------------------------------------

export type EffectCategory = 'blur' | 'color' | 'distort' | 'stylize' | 'transform' | 'keying' | 'grain';

export interface EffectDefinition {
  id: string;
  name: string;
  category: EffectCategory;
  parameters: EffectParameterDef[];
}

export interface EffectParameterDef {
  id: string;
  name: string;
  type: 'number' | 'color' | 'dropdown' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | string | boolean;
  options?: string[];
}

export interface ClipEffect {
  id: string;
  definitionId: string;
  name: string;
  enabled: boolean;
  order: number;
  parameters: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// TRANSITIONS
// ---------------------------------------------------------------------------

export type TransitionType =
  | 'dissolve' | 'cut' | 'wipe-left' | 'wipe-right'
  | 'push' | 'slide' | 'zoom'
  | 'dip-to-black' | 'dip-to-white';

export type AudioTransitionType =
  | 'constant-gain' | 'constant-power' | 'exponential-fade';

export interface TransitionDefinition {
  id: string;
  name: string;
  type: TransitionType | AudioTransitionType;
  category: 'video' | 'audio';
  defaultDuration: number;
}

export interface TransitionInstance {
  definitionId: string;
  type: TransitionType | AudioTransitionType;
  durationFrames: number;
}

// ---------------------------------------------------------------------------
// KEYFRAMES
// ---------------------------------------------------------------------------

export type KeyframeProperty =
  | 'opacity' | 'volume' | 'pan'
  | 'positionX' | 'positionY'
  | 'scaleX' | 'scaleY'
  | 'rotation'
  | 'anchorX' | 'anchorY'
  | 'speed'
  | `effect:${string}:${string}`;

export interface KeyframeTrack {
  property: KeyframeProperty;
  keyframes: Keyframe[];
}

export interface Keyframe {
  frame: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
}

// ---------------------------------------------------------------------------
// TITLES
// ---------------------------------------------------------------------------

export type TitlePresetCategory = 'lower-thirds' | 'full-screen' | 'subtitles' | 'animated' | 'plain';

export interface TitleData {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  positionX: number;
  positionY: number;
  alignment: 'left' | 'center' | 'right';
  presetId: string | null;
}

export interface TitlePreset {
  id: string;
  name: string;
  category: TitlePresetCategory;
  data: Omit<TitleData, 'presetId'>;
}

// ---------------------------------------------------------------------------
// COLOR GRADING
// ---------------------------------------------------------------------------

export interface ColorGradeSettings {
  lutPath: string | null;
  lutName: string | null;
  lutIntensity: number;
  liftR: number;
  liftG: number;
  liftB: number;
  liftY: number;
  gammaR: number;
  gammaG: number;
  gammaB: number;
  gammaY: number;
  gainR: number;
  gainG: number;
  gainB: number;
  gainY: number;
  curvesMaster: CurvePoint[];
  curvesR: CurvePoint[];
  curvesG: CurvePoint[];
  curvesB: CurvePoint[];
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// MARKERS
// ---------------------------------------------------------------------------

export interface Marker {
  id: string;
  frame: number;
  name: string;
  color: string;
  notes: string;
  duration: number;
  type: 'standard' | 'chapter' | 'todo' | 'comment';
}

// ---------------------------------------------------------------------------
// LAYOUT
// ---------------------------------------------------------------------------

export interface PanelLayout {
  mediaBrowserWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  viewerMode: 'dual' | 'single';
  preset: 'edit' | 'color' | 'audio' | 'custom';
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  mediaBrowserWidth: 260,
  inspectorWidth: 280,
  timelineHeight: 280,
  viewerMode: 'dual',
  preset: 'edit',
};

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export type VideoFormat = 'h264' | 'h265' | 'prores422' | 'prores4444' | 'dnxhd';
export type AudioFormat = 'aac' | 'mp3' | 'pcm' | 'ac3' | 'wav' | 'flac';

export interface ExportSettings {
  format: VideoFormat | 'mp3' | 'wav' | 'flac';
  width: number;
  height: number;
  frameRate: number;
  bitrateMode: 'cbr' | 'vbr';
  bitrateMbps: number;
  audioCodec: AudioFormat;
  audioBitrate: number;
  colorSpace: 'rec709' | 'rec2020' | 'p3-d65';
  range: 'entire' | 'in-out' | 'selected';
}

export interface ExportPreset {
  id: string;
  name: string;
  detail: string;
  settings: ExportSettings;
}

export interface ExportJob {
  id: string;
  projectId: string;
  settings: ExportSettings;
  outputPath: string;
  filename: string;
  status: 'queued' | 'encoding' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  encodingFps: number;
  startTime: number | null;
  endTime: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// UNDO
// ---------------------------------------------------------------------------

export type CommandType =
  | 'add-clip' | 'remove-clip' | 'move-clip' | 'trim-clip' | 'split-clip'
  | 'add-effect' | 'remove-effect' | 'update-effect-param'
  | 'apply-effect' | 'remove-effect' | 'change-effect-param'
  | 'add-keyframe' | 'remove-keyframe' | 'move-keyframe'
  | 'set-transition' | 'apply-transition' | 'remove-transition'
  | 'change-color-param' | 'add-marker' | 'remove-marker'
  | 'rename-clip' | 'change-clip-property' | 'update-clip'
  | 'add-track' | 'remove-track'
  | 'duplicate-clip' | 'cut-clip'
  | 'ripple-delete' | 'batch';

export interface UndoCommand {
  id: string;
  type: CommandType;
  description: string;
  timestamp: number;
  execute: () => void;
  undo: () => void;
}

// ---------------------------------------------------------------------------
// TOOL TYPES
// ---------------------------------------------------------------------------

export type VinxTool = 'select' | 'range' | 'razor' | 'ripple-delete' | 'slip' | 'slide' | 'roll' | 'hand';

export type ViewerOverlay = 'none' | 'safe-zones' | 'grid' | 'false-color';

// ---------------------------------------------------------------------------
// SCOPE TYPES
// ---------------------------------------------------------------------------

export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade' | 'rgb-histogram' | 'false-color';

// ---------------------------------------------------------------------------
// SPEED RAMPING
// ---------------------------------------------------------------------------

export interface SpeedRampPoint {
  frame: number;
  speed: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier';
}

export interface SpeedRamp {
  enabled: boolean;
  points: SpeedRampPoint[];
}

// ---------------------------------------------------------------------------
// MULTICAM
// ---------------------------------------------------------------------------

export interface MulticamClip {
  id: string;
  angles: MulticamAngle[];
  activeAngle: number;
  syncMethod: 'timecode' | 'audio' | 'manual';
}

export interface MulticamAngle {
  id: string;
  mediaId: string;
  name: string;
  offset: number;
}

// ---------------------------------------------------------------------------
// NESTED SEQUENCES / COMPOUND CLIPS
// ---------------------------------------------------------------------------

export interface CompoundClip {
  id: string;
  name: string;
  sequenceId: string;
  color: string;
}

// ---------------------------------------------------------------------------
// MASKS
// ---------------------------------------------------------------------------

export interface ClipMask {
  id: string;
  name: string;
  type: 'bezier' | 'rectangle' | 'ellipse';
  inverted: boolean;
  feather: number;
  opacity: number;
  expansion: number;
  points: MaskPoint[];
  keyframes: MaskKeyframe[];
}

export interface MaskPoint {
  x: number;
  y: number;
  handleInX: number;
  handleInY: number;
  handleOutX: number;
  handleOutY: number;
}

export interface MaskKeyframe {
  frame: number;
  points: MaskPoint[];
}

// ---------------------------------------------------------------------------
// SUBTITLES (SRT)
// ---------------------------------------------------------------------------

export interface SubtitleEntry {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
  style: SubtitleStyle;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'bottom' | 'top' | 'center';
  bold: boolean;
  italic: boolean;
}

export interface SubtitleTrack {
  id: string;
  name: string;
  language: string;
  entries: SubtitleEntry[];
  visible: boolean;
}

// ---------------------------------------------------------------------------
// AUDIO FEATURES
// ---------------------------------------------------------------------------

export interface AudioDuckingSettings {
  enabled: boolean;
  dialogueTrackId: string | null;
  musicTrackId: string | null;
  threshold: number;
  duckAmount: number;
  attackMs: number;
  releaseMs: number;
}

export interface LoudnessMetering {
  integratedLUFS: number;
  shortTermLUFS: number;
  momentaryLUFS: number;
  truePeak: number;
  loudnessRange: number;
  target: number;
}

// ---------------------------------------------------------------------------
// NOISE REDUCTION & STABILIZATION
// ---------------------------------------------------------------------------

export interface NoiseReductionSettings {
  enabled: boolean;
  temporalStrength: number;
  spatialStrength: number;
  detailPreservation: number;
  method: 'temporal' | 'spatial' | 'combined';
}

export interface StabilizationSettings {
  enabled: boolean;
  smoothness: number;
  method: 'warp' | 'position' | 'position-scale-rotation';
  cropMode: 'auto' | 'stabilize-only' | 'smooth-motion';
  rollingShutter: number;
}

// ---------------------------------------------------------------------------
// MOTION TRACKING
// ---------------------------------------------------------------------------

export interface MotionTracker {
  id: string;
  name: string;
  clipId: string;
  type: 'point' | 'planar' | 'object';
  trackPoints: TrackPoint[];
  status: 'idle' | 'tracking' | 'complete' | 'failed';
}

export interface TrackPoint {
  frame: number;
  x: number;
  y: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// PROJECT TEMPLATES
// ---------------------------------------------------------------------------

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'social' | 'cinema' | 'broadcast' | 'web' | 'custom';
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  tracks: { type: 'video' | 'audio' | 'title'; name: string }[];
}

// ---------------------------------------------------------------------------
// LUT PRESETS
// ---------------------------------------------------------------------------

export interface LUTPreset {
  id: string;
  name: string;
  category: 'cinematic' | 'filmic' | 'vintage' | 'creative' | 'technical' | 'custom';
  thumbnail: string;
  description: string;
}

// ---------------------------------------------------------------------------
// PROXY WORKFLOW
// ---------------------------------------------------------------------------

export interface ProxySettings {
  enabled: boolean;
  resolution: '1/2' | '1/4' | '1/8';
  codec: 'h264' | 'prores-proxy';
  autoGenerate: boolean;
}

// ---------------------------------------------------------------------------
// HELPER CONSTANTS
// ---------------------------------------------------------------------------

export const VINX_COLORS = {
  videoTrack: 'var(--color-accent)',
  audioTrack: '#3DAF72',
  titleTrack: '#D4853A',
  effectsTrack: '#9B6EFF',
  marker: '#FF6B6B',
  playhead: 'rgba(255, 255, 255, 0.90)',
} as const;

export const DEFAULT_TRACK_HEIGHTS = {
  video: 48,
  audio: 32,
  title: 28,
} as const;

export const TRACK_HEADER_WIDTH = 160;

export function generateId(prefix: string = 'vinx'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTimecode(frame: number, fps: number): string {
  if (fps <= 0) return '00:00:00:00';
  const totalSeconds = Math.floor(frame / fps);
  const f = frame % fps;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

export function parseTimecode(tc: string, fps: number): number {
  const parts = tc.split(':').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  const [h, m, s, f] = parts;
  return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export function secondsToFrame(seconds: number, fps: number): number {
  return Math.floor(seconds * fps);
}

export const DEFAULT_COLOR_GRADE: ColorGradeSettings = {
  lutPath: null,
  lutName: null,
  lutIntensity: 100,
  liftR: 0, liftG: 0, liftB: 0, liftY: 0,
  gammaR: 0, gammaG: 0, gammaB: 0, gammaY: 0,
  gainR: 0, gainG: 0, gainB: 0, gainY: 0,
  curvesMaster: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  curvesR: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  curvesG: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  curvesB: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  exposure: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, saturation: 0, vibrance: 0,
  temperature: 0, tint: 0,
};

// ---------------------------------------------------------------------------
// PROJECT TEMPLATES DATA
// ---------------------------------------------------------------------------

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'youtube-4k', name: 'YouTube 4K', description: '3840×2160 @ 30fps', icon: 'YT', category: 'web', width: 3840, height: 2160, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'audio', name: 'A1' }, { type: 'audio', name: 'A2' }, { type: 'audio', name: 'Music' }, { type: 'title', name: 'Titles' }] },
  { id: 'youtube-1080', name: 'YouTube 1080p', description: '1920×1080 @ 30fps', icon: 'HD', category: 'web', width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'audio', name: 'A1' }, { type: 'audio', name: 'Music' }, { type: 'title', name: 'Titles' }] },
  { id: 'tiktok-reel', name: 'TikTok / Reel', description: '1080×1920 @ 30fps', icon: 'TT', category: 'social', width: 1080, height: 1920, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'audio', name: 'A1' }, { type: 'audio', name: 'Music' }, { type: 'title', name: 'Titles' }] },
  { id: 'instagram-square', name: 'Instagram Square', description: '1080×1080 @ 30fps', icon: 'SQ', category: 'social', width: 1080, height: 1080, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'audio', name: 'A1' }, { type: 'title', name: 'Titles' }] },
  { id: 'film-dci-4k', name: 'Film DCI 4K', description: '4096×2160 @ 24fps', icon: 'DCI', category: 'cinema', width: 4096, height: 2160, frameRate: 24, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'video', name: 'V3' }, { type: 'audio', name: 'Dialogue' }, { type: 'audio', name: 'SFX' }, { type: 'audio', name: 'Music' }, { type: 'title', name: 'Titles' }] },
  { id: 'film-2k', name: 'Film 2K Scope', description: '2048×858 @ 24fps', icon: '2K', category: 'cinema', width: 2048, height: 858, frameRate: 24, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'audio', name: 'Dialogue' }, { type: 'audio', name: 'SFX' }, { type: 'audio', name: 'Music' }] },
  { id: 'broadcast-1080i', name: 'Broadcast 1080i', description: '1920×1080 @ 29.97fps', icon: 'BC', category: 'broadcast', width: 1920, height: 1080, frameRate: 29.97, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'audio', name: 'A1' }, { type: 'audio', name: 'A2' }] },
  { id: 'broadcast-4k-uhd', name: 'Broadcast UHD', description: '3840×2160 @ 59.94fps', icon: 'BC', category: 'broadcast', width: 3840, height: 2160, frameRate: 59.94, sampleRate: 48000, tracks: [{ type: 'video', name: 'V1' }, { type: 'video', name: 'V2' }, { type: 'audio', name: 'A1' }, { type: 'audio', name: 'A2' }] },
  { id: 'podcast-video', name: 'Podcast (Video)', description: '1920×1080 @ 30fps', icon: 'MIC', category: 'web', width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'video', name: 'Camera 1' }, { type: 'video', name: 'Camera 2' }, { type: 'audio', name: 'Host' }, { type: 'audio', name: 'Guest' }, { type: 'title', name: 'Lower Thirds' }] },
  { id: 'podcast-audio', name: 'Podcast (Audio Only)', description: 'Audio-only @ 48kHz', icon: 'AU', category: 'web', width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, tracks: [{ type: 'audio', name: 'Host' }, { type: 'audio', name: 'Guest' }, { type: 'audio', name: 'Music' }] },
];

// ---------------------------------------------------------------------------
// LUT PRESETS DATA
// ---------------------------------------------------------------------------

export const LUT_PRESETS: LUTPreset[] = [
  { id: 'cinematic-teal-orange', name: 'Teal & Orange', category: 'cinematic', thumbnail: 'linear-gradient(135deg, #005f73, #ee9b00)', description: 'Classic cinema color split' },
  { id: 'cinematic-bleach-bypass', name: 'Bleach Bypass', category: 'cinematic', thumbnail: 'linear-gradient(135deg, #8a8a8a, #d4d4d4)', description: 'Desaturated high-contrast' },
  { id: 'cinematic-film-noir', name: 'Film Noir', category: 'cinematic', thumbnail: 'linear-gradient(135deg, #0a0a0a, #4a4a4a)', description: 'High contrast B&W with deep shadows' },
  { id: 'filmic-kodak-5213', name: 'Kodak Vision3 50D', category: 'filmic', thumbnail: 'linear-gradient(135deg, #c98a4b, #e6c88a)', description: 'Daylight film stock emulation' },
  { id: 'filmic-kodak-5219', name: 'Kodak Vision3 500T', category: 'filmic', thumbnail: 'linear-gradient(135deg, #6b4c3b, #d4a76a)', description: 'Tungsten film stock emulation' },
  { id: 'filmic-fuji-3510', name: 'Fuji F-125', category: 'filmic', thumbnail: 'linear-gradient(135deg, #3a6b4c, #d4c88a)', description: 'Fujifilm print stock look' },
  { id: 'vintage-super8', name: 'Super 8', category: 'vintage', thumbnail: 'linear-gradient(135deg, #8b6914, #e8c96a)', description: 'Warm faded Super 8 film' },
  { id: 'vintage-polaroid', name: 'Polaroid', category: 'vintage', thumbnail: 'linear-gradient(135deg, #7a9e7e, #e8d4a0)', description: 'Instant film color shift' },
  { id: 'vintage-vhs', name: 'VHS', category: 'vintage', thumbnail: 'linear-gradient(135deg, #1a1a3e, #6a3a6a)', description: 'Analog video degradation' },
  { id: 'creative-cyberpunk', name: 'Cyberpunk', category: 'creative', thumbnail: 'linear-gradient(135deg, #00c9c9, #ff00ff)', description: 'Neon teal and magenta' },
  { id: 'creative-golden-hour', name: 'Golden Hour', category: 'creative', thumbnail: 'linear-gradient(135deg, #ff8c00, #ffd700)', description: 'Warm sunset glow' },
  { id: 'creative-moonlight', name: 'Moonlight', category: 'creative', thumbnail: 'linear-gradient(135deg, #1a1a4e, #4a7ab5)', description: 'Cool blue nighttime' },
  { id: 'technical-rec709', name: 'Rec. 709', category: 'technical', thumbnail: 'linear-gradient(135deg, #3a3a3a, #909090)', description: 'Standard HD broadcast' },
  { id: 'technical-logc-to-709', name: 'Log-C to Rec.709', category: 'technical', thumbnail: 'linear-gradient(135deg, #5a5a5a, #b0b0b0)', description: 'ARRI Log-C transform' },
  { id: 'technical-slog3-to-709', name: 'S-Log3 to Rec.709', category: 'technical', thumbnail: 'linear-gradient(135deg, #4a5a4a, #a0b0a0)', description: 'Sony S-Log3 transform' },
];

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  { id: 'gaussian-blur', name: 'Gaussian Blur', category: 'blur', parameters: [
    { id: 'radius', name: 'Radius', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 10 },
    { id: 'direction', name: 'Direction', type: 'dropdown', defaultValue: 'both', options: ['both', 'horizontal', 'vertical'] },
  ]},
  { id: 'directional-blur', name: 'Directional Blur', category: 'blur', parameters: [
    { id: 'radius', name: 'Radius', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 10 },
    { id: 'angle', name: 'Angle', type: 'number', min: 0, max: 360, step: 1, defaultValue: 0 },
  ]},
  { id: 'brightness-contrast', name: 'Brightness/Contrast', category: 'color', parameters: [
    { id: 'brightness', name: 'Brightness', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'contrast', name: 'Contrast', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
  ]},
  { id: 'hue-saturation', name: 'Hue/Saturation', category: 'color', parameters: [
    { id: 'hue', name: 'Hue', type: 'number', min: -180, max: 180, step: 1, defaultValue: 0 },
    { id: 'saturation', name: 'Saturation', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'lightness', name: 'Lightness', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
  ]},
  { id: 'color-balance', name: 'Color Balance', category: 'color', parameters: [
    { id: 'shadows-r', name: 'Shadows R', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'shadows-g', name: 'Shadows G', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'shadows-b', name: 'Shadows B', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'highlights-r', name: 'Highlights R', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'highlights-g', name: 'Highlights G', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'highlights-b', name: 'Highlights B', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
  ]},
  { id: 'sharpen', name: 'Sharpen', category: 'color', parameters: [
    { id: 'amount', name: 'Amount', type: 'number', min: 0, max: 200, step: 1, defaultValue: 50 },
  ]},
  { id: 'wave-warp', name: 'Wave Warp', category: 'distort', parameters: [
    { id: 'amplitude', name: 'Amplitude', type: 'number', min: 0, max: 100, step: 1, defaultValue: 25 },
    { id: 'frequency', name: 'Frequency', type: 'number', min: 0.1, max: 20, step: 0.1, defaultValue: 3 },
    { id: 'direction', name: 'Direction', type: 'dropdown', defaultValue: 'horizontal', options: ['horizontal', 'vertical'] },
  ]},
  { id: 'spherize', name: 'Spherize', category: 'distort', parameters: [
    { id: 'amount', name: 'Amount', type: 'number', min: -100, max: 100, step: 1, defaultValue: 50 },
  ]},
  { id: 'mosaic', name: 'Mosaic', category: 'stylize', parameters: [
    { id: 'cellSize', name: 'Cell Size', type: 'number', min: 2, max: 200, step: 1, defaultValue: 16 },
  ]},
  { id: 'posterize', name: 'Posterize', category: 'stylize', parameters: [
    { id: 'levels', name: 'Levels', type: 'number', min: 2, max: 32, step: 1, defaultValue: 6 },
  ]},
  { id: 'emboss', name: 'Emboss', category: 'stylize', parameters: [
    { id: 'angle', name: 'Angle', type: 'number', min: 0, max: 360, step: 1, defaultValue: 135 },
    { id: 'height', name: 'Height', type: 'number', min: 1, max: 10, step: 1, defaultValue: 2 },
  ]},
  { id: 'flip', name: 'Flip', category: 'transform', parameters: [
    { id: 'horizontal', name: 'Horizontal', type: 'boolean', defaultValue: false },
    { id: 'vertical', name: 'Vertical', type: 'boolean', defaultValue: false },
  ]},
  { id: 'crop', name: 'Crop', category: 'transform', parameters: [
    { id: 'top', name: 'Top', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 0 },
    { id: 'bottom', name: 'Bottom', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 0 },
    { id: 'left', name: 'Left', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 0 },
    { id: 'right', name: 'Right', type: 'number', min: 0, max: 100, step: 0.1, defaultValue: 0 },
  ]},
  { id: 'chroma-key', name: 'Chroma Key', category: 'keying', parameters: [
    { id: 'color', name: 'Key Color', type: 'color', defaultValue: '#00FF00' },
    { id: 'tolerance', name: 'Tolerance', type: 'number', min: 0, max: 100, step: 1, defaultValue: 40 },
    { id: 'softness', name: 'Edge Softness', type: 'number', min: 0, max: 100, step: 1, defaultValue: 10 },
  ]},
  { id: 'film-grain', name: 'Film Grain', category: 'grain', parameters: [
    { id: 'amount', name: 'Amount', type: 'number', min: 0, max: 100, step: 1, defaultValue: 25 },
    { id: 'size', name: 'Size', type: 'number', min: 0.5, max: 4, step: 0.1, defaultValue: 1.5 },
  ]},
  { id: 'noise-reduction', name: 'Noise Reduction', category: 'color', parameters: [
    { id: 'temporal', name: 'Temporal Strength', type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 },
    { id: 'spatial', name: 'Spatial Strength', type: 'number', min: 0, max: 100, step: 1, defaultValue: 30 },
    { id: 'detail', name: 'Detail Preservation', type: 'number', min: 0, max: 100, step: 1, defaultValue: 70 },
    { id: 'method', name: 'Method', type: 'dropdown', defaultValue: 'combined', options: ['temporal', 'spatial', 'combined'] },
  ]},
  { id: 'stabilization', name: 'Stabilization', category: 'transform', parameters: [
    { id: 'smoothness', name: 'Smoothness', type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 },
    { id: 'method', name: 'Method', type: 'dropdown', defaultValue: 'warp', options: ['warp', 'position', 'position-scale-rotation'] },
    { id: 'crop', name: 'Crop Mode', type: 'dropdown', defaultValue: 'auto', options: ['auto', 'stabilize-only', 'smooth-motion'] },
    { id: 'rolling-shutter', name: 'Rolling Shutter', type: 'number', min: 0, max: 100, step: 1, defaultValue: 0 },
  ]},
  { id: 'motion-blur', name: 'Motion Blur', category: 'blur', parameters: [
    { id: 'shutter-angle', name: 'Shutter Angle', type: 'number', min: 0, max: 720, step: 1, defaultValue: 180 },
    { id: 'samples', name: 'Samples', type: 'number', min: 2, max: 64, step: 1, defaultValue: 16 },
  ]},
  { id: 'glow', name: 'Glow', category: 'stylize', parameters: [
    { id: 'threshold', name: 'Threshold', type: 'number', min: 0, max: 100, step: 1, defaultValue: 60 },
    { id: 'radius', name: 'Radius', type: 'number', min: 0, max: 100, step: 1, defaultValue: 20 },
    { id: 'intensity', name: 'Intensity', type: 'number', min: 0, max: 200, step: 1, defaultValue: 100 },
  ]},
  { id: 'vignette', name: 'Vignette', category: 'stylize', parameters: [
    { id: 'amount', name: 'Amount', type: 'number', min: -100, max: 100, step: 1, defaultValue: -30 },
    { id: 'midpoint', name: 'Midpoint', type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 },
    { id: 'roundness', name: 'Roundness', type: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    { id: 'feather', name: 'Feather', type: 'number', min: 0, max: 100, step: 1, defaultValue: 50 },
  ]},
];

export const VIDEO_TRANSITIONS: TransitionDefinition[] = [
  { id: 'dissolve', name: 'Dissolve', type: 'dissolve', category: 'video', defaultDuration: 20 },
  { id: 'cut', name: 'Cut', type: 'cut', category: 'video', defaultDuration: 0 },
  { id: 'wipe-left', name: 'Wipe Left', type: 'wipe-left', category: 'video', defaultDuration: 20 },
  { id: 'wipe-right', name: 'Wipe Right', type: 'wipe-right', category: 'video', defaultDuration: 20 },
  { id: 'push', name: 'Push', type: 'push', category: 'video', defaultDuration: 20 },
  { id: 'slide', name: 'Slide', type: 'slide', category: 'video', defaultDuration: 20 },
  { id: 'zoom', name: 'Zoom', type: 'zoom', category: 'video', defaultDuration: 20 },
  { id: 'dip-to-black', name: 'Dip to Black', type: 'dip-to-black', category: 'video', defaultDuration: 20 },
  { id: 'dip-to-white', name: 'Dip to White', type: 'dip-to-white', category: 'video', defaultDuration: 20 },
];

export const AUDIO_TRANSITIONS: TransitionDefinition[] = [
  { id: 'constant-gain', name: 'Constant Gain', type: 'constant-gain', category: 'audio', defaultDuration: 20 },
  { id: 'constant-power', name: 'Constant Power', type: 'constant-power', category: 'audio', defaultDuration: 20 },
  { id: 'exponential-fade', name: 'Exponential Fade', type: 'exponential-fade', category: 'audio', defaultDuration: 20 },
];

export const TITLE_PRESETS: TitlePreset[] = [
  { id: 'lower-third-modern', name: 'Modern Lower Third', category: 'lower-thirds', data: {
    text: 'Name / Title', fontFamily: 'Inter', fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)',
    backgroundColor: '#000000', backgroundOpacity: 60, positionX: 10, positionY: 80,
    alignment: 'left',
  }},
  { id: 'lower-third-minimal', name: 'Minimal Lower Third', category: 'lower-thirds', data: {
    text: 'Name', fontFamily: 'Inter', fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)',
    backgroundColor: 'transparent', backgroundOpacity: 0, positionX: 5, positionY: 85,
    alignment: 'left',
  }},
  { id: 'full-screen-bold', name: 'Bold Full Screen', category: 'full-screen', data: {
    text: 'TITLE', fontFamily: 'Inter', fontSize: 64, fontWeight: 700, color: 'var(--color-text-primary)',
    backgroundColor: '#000000', backgroundOpacity: 80, positionX: 50, positionY: 50,
    alignment: 'center',
  }},
  { id: 'subtitle-standard', name: 'Standard Subtitle', category: 'subtitles', data: {
    text: 'Subtitle text', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, color: 'var(--color-text-primary)',
    backgroundColor: '#000000', backgroundOpacity: 50, positionX: 50, positionY: 90,
    alignment: 'center',
  }},
  { id: 'plain-centered', name: 'Plain Centered', category: 'plain', data: {
    text: 'Title', fontFamily: 'Inter', fontSize: 24, fontWeight: 500, color: 'var(--color-text-primary)',
    backgroundColor: 'transparent', backgroundOpacity: 0, positionX: 50, positionY: 50,
    alignment: 'center',
  }},
];

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'youtube-1080', name: 'YouTube 1080p', detail: 'H.264 1920x1080 8Mbps', settings: {
    format: 'h264', width: 1920, height: 1080, frameRate: 30, bitrateMode: 'vbr', bitrateMbps: 8,
    audioCodec: 'aac', audioBitrate: 192, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'youtube-4k', name: 'YouTube 4K', detail: 'H.265 3840x2160 40Mbps', settings: {
    format: 'h265', width: 3840, height: 2160, frameRate: 30, bitrateMode: 'vbr', bitrateMbps: 40,
    audioCodec: 'aac', audioBitrate: 320, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'twitter', name: 'Twitter/X', detail: 'H.264 1280x720 5Mbps', settings: {
    format: 'h264', width: 1280, height: 720, frameRate: 30, bitrateMode: 'vbr', bitrateMbps: 5,
    audioCodec: 'aac', audioBitrate: 128, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'instagram-square', name: 'Instagram Square', detail: 'H.264 1080x1080 8Mbps', settings: {
    format: 'h264', width: 1080, height: 1080, frameRate: 30, bitrateMode: 'vbr', bitrateMbps: 8,
    audioCodec: 'aac', audioBitrate: 192, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'instagram-reel', name: 'Instagram Reel', detail: 'H.264 1080x1920 8Mbps', settings: {
    format: 'h264', width: 1080, height: 1920, frameRate: 30, bitrateMode: 'vbr', bitrateMbps: 8,
    audioCodec: 'aac', audioBitrate: 192, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'prores-422', name: 'ProRes 422', detail: 'Apple ProRes 422 source res', settings: {
    format: 'prores422', width: 0, height: 0, frameRate: 0, bitrateMode: 'cbr', bitrateMbps: 0,
    audioCodec: 'pcm', audioBitrate: 0, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'h265-master', name: 'H.265 Master', detail: 'H.265 highest quality source res', settings: {
    format: 'h265', width: 0, height: 0, frameRate: 0, bitrateMode: 'vbr', bitrateMbps: 80,
    audioCodec: 'aac', audioBitrate: 320, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'audio-mp3', name: 'Audio Only MP3', detail: 'MP3 320kbps', settings: {
    format: 'mp3', width: 0, height: 0, frameRate: 0, bitrateMode: 'cbr', bitrateMbps: 0,
    audioCodec: 'mp3', audioBitrate: 320, colorSpace: 'rec709', range: 'entire',
  }},
  { id: 'audio-wav', name: 'Audio Only WAV', detail: 'WAV 48kHz 24-bit', settings: {
    format: 'wav', width: 0, height: 0, frameRate: 0, bitrateMode: 'cbr', bitrateMbps: 0,
    audioCodec: 'wav', audioBitrate: 0, colorSpace: 'rec709', range: 'entire',
  }},
];

export const AUDIO_EFFECTS = [
  { id: 'eq', name: 'EQ', category: 'audio' },
  { id: 'compressor', name: 'Compressor', category: 'audio' },
  { id: 'reverb', name: 'Reverb', category: 'audio' },
  { id: 'delay', name: 'Delay', category: 'audio' },
  { id: 'noise-reduction', name: 'Noise Reduction', category: 'audio' },
  { id: 'pitch-shift', name: 'Pitch Shift', category: 'audio' },
  { id: 'normalize', name: 'Normalize', category: 'audio' },
] as const;

// ---------------------------------------------------------------------------
// CLIP ROLES
// ---------------------------------------------------------------------------

export type ClipRole = 'dialogue' | 'music' | 'sfx' | 'ambience' | 'foley' | 'titles' | 'none';

export const CLIP_ROLE_COLORS: Record<ClipRole, string> = {
  dialogue: 'var(--color-accent)',
  music: 'var(--color-success)',
  sfx: 'var(--color-warning)',
  ambience: '#BF5AF2',
  foley: '#FF6482',
  titles: 'var(--color-warning)',
  none: 'var(--color-text-tertiary)',
};

// ---------------------------------------------------------------------------
// PIP PRESETS
// ---------------------------------------------------------------------------

export interface PiPPosition {
  x: number; y: number; width: number; height: number;
}

export interface PiPPreset {
  id: string;
  name: string;
  positions: PiPPosition[];
}

export const PIP_PRESETS: PiPPreset[] = [
  { id: 'corner-br', name: 'Corner (Bottom-Right)', positions: [{ x: 0.65, y: 0.65, width: 0.3, height: 0.3 }] },
  { id: 'corner-bl', name: 'Corner (Bottom-Left)', positions: [{ x: 0.05, y: 0.65, width: 0.3, height: 0.3 }] },
  { id: 'corner-tr', name: 'Corner (Top-Right)', positions: [{ x: 0.65, y: 0.05, width: 0.3, height: 0.3 }] },
  { id: 'corner-tl', name: 'Corner (Top-Left)', positions: [{ x: 0.05, y: 0.05, width: 0.3, height: 0.3 }] },
  { id: 'side-by-side', name: 'Side by Side', positions: [{ x: 0, y: 0, width: 0.5, height: 1 }, { x: 0.5, y: 0, width: 0.5, height: 1 }] },
  { id: 'split-3', name: '3-Up', positions: [{ x: 0, y: 0, width: 0.333, height: 1 }, { x: 0.333, y: 0, width: 0.334, height: 1 }, { x: 0.667, y: 0, width: 0.333, height: 1 }] },
  { id: 'grid-4', name: '4-Up Grid', positions: [{ x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.5, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0.5, width: 0.5, height: 0.5 }, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }] },
];

// ---------------------------------------------------------------------------
// AUTO-REFRAME PRESETS
// ---------------------------------------------------------------------------

export type ReframeAspect = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';

export const REFRAME_PRESETS: { aspect: ReframeAspect; label: string; w: number; h: number }[] = [
  { aspect: '16:9', label: 'Landscape (16:9)', w: 1920, h: 1080 },
  { aspect: '9:16', label: 'Portrait (9:16)', w: 1080, h: 1920 },
  { aspect: '1:1', label: 'Square (1:1)', w: 1080, h: 1080 },
  { aspect: '4:5', label: 'Instagram (4:5)', w: 1080, h: 1350 },
  { aspect: '4:3', label: 'Classic (4:3)', w: 1440, h: 1080 },
  { aspect: '21:9', label: 'Ultrawide (21:9)', w: 2560, h: 1080 },
];

// ---------------------------------------------------------------------------
// AUDIO EQ
// ---------------------------------------------------------------------------

export interface AudioEQBand {
  frequency: number;
  gain: number;
  q: number;
}

export interface AudioEQSettings {
  enabled: boolean;
  bands: AudioEQBand[];
}

export const DEFAULT_EQ_BANDS: AudioEQBand[] = [
  { frequency: 80, gain: 0, q: 1 },
  { frequency: 250, gain: 0, q: 1 },
  { frequency: 1000, gain: 0, q: 1 },
  { frequency: 4000, gain: 0, q: 1 },
  { frequency: 12000, gain: 0, q: 1 },
];

// ---------------------------------------------------------------------------
// CROSSFADE PRESETS
// ---------------------------------------------------------------------------

export interface CrossfadePreset {
  id: string;
  name: string;
  type: AudioTransitionType;
  duration: number;
}

export const CROSSFADE_PRESETS: CrossfadePreset[] = [
  { id: 'quick-fade', name: 'Quick Fade', type: 'constant-power', duration: 10 },
  { id: 'standard', name: 'Standard', type: 'constant-power', duration: 24 },
  { id: 'long-fade', name: 'Long Fade', type: 'constant-power', duration: 60 },
  { id: 'linear', name: 'Linear', type: 'constant-gain', duration: 24 },
  { id: 'exponential', name: 'Exponential', type: 'exponential-fade', duration: 30 },
];

// ---------------------------------------------------------------------------
// J/L CUT PRESETS
// ---------------------------------------------------------------------------

export interface JLCutPreset {
  id: string;
  name: string;
  type: 'j-cut' | 'l-cut';
  offsetFrames: number;
}

export const JL_CUT_PRESETS: JLCutPreset[] = [
  { id: 'j-short', name: 'J-Cut (Short)', type: 'j-cut', offsetFrames: 15 },
  { id: 'j-medium', name: 'J-Cut (Medium)', type: 'j-cut', offsetFrames: 30 },
  { id: 'j-long', name: 'J-Cut (Long)', type: 'j-cut', offsetFrames: 60 },
  { id: 'l-short', name: 'L-Cut (Short)', type: 'l-cut', offsetFrames: 15 },
  { id: 'l-medium', name: 'L-Cut (Medium)', type: 'l-cut', offsetFrames: 30 },
  { id: 'l-long', name: 'L-Cut (Long)', type: 'l-cut', offsetFrames: 60 },
];

// ---------------------------------------------------------------------------
// SNAP SETTINGS
// ---------------------------------------------------------------------------

export interface SnapSettings {
  snapToPlayhead: boolean;
  snapToClipEdges: boolean;
  snapToMarkers: boolean;
  snapToInOutPoints: boolean;
  magneticSnap: boolean;
  snapDistance: number;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  snapToPlayhead: true,
  snapToClipEdges: true,
  snapToMarkers: true,
  snapToInOutPoints: true,
  magneticSnap: true,
  snapDistance: 10,
};

// ---------------------------------------------------------------------------
// KEN BURNS PRESETS
// ---------------------------------------------------------------------------

export interface KenBurnsPreset {
  id: string;
  name: string;
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const KEN_BURNS_PRESETS: KenBurnsPreset[] = [
  { id: 'zoom-in', name: 'Zoom In', startScale: 1, endScale: 1.3, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  { id: 'zoom-out', name: 'Zoom Out', startScale: 1.3, endScale: 1, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  { id: 'pan-left', name: 'Pan Left', startScale: 1.2, endScale: 1.2, startX: 0.7, startY: 0.5, endX: 0.3, endY: 0.5 },
  { id: 'pan-right', name: 'Pan Right', startScale: 1.2, endScale: 1.2, startX: 0.3, startY: 0.5, endX: 0.7, endY: 0.5 },
  { id: 'zoom-top-left', name: 'Zoom to Top-Left', startScale: 1, endScale: 1.5, startX: 0.5, startY: 0.5, endX: 0.25, endY: 0.25 },
  { id: 'zoom-bottom-right', name: 'Zoom to Bottom-Right', startScale: 1, endScale: 1.5, startX: 0.5, startY: 0.5, endX: 0.75, endY: 0.75 },
];
