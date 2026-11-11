// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Zustand Store
 * Central state management for the Vinx editor.
 * Timeline positions are always integer frame numbers.
 */

import { create } from 'zustand';
import { readStoredProject, writeStoredProject, pickNewer, isProjectLike } from './vinxPersistence';
import type {
  VinxProject, VinxSequence, Track, Clip, MediaItem, MediaBin,
  Marker, PanelLayout, VinxSettings, ClipEffect, KeyframeTrack,
  Keyframe, TransitionInstance, TitleData, ClipTransform,
  ColorGradeSettings, UndoCommand, VinxTool, ViewerOverlay,
  RenderQuality, ExportJob, ExportSettings, ScopeType,
  SubtitleTrack, SubtitleEntry, CompoundClip, MulticamClip,
  AudioDuckingSettings, LoudnessMetering, ProxySettings,
  SpeedRamp, ClipMask, MotionTracker,
  ClipRole, ReframeAspect, SnapSettings, NoiseReductionSettings,
  StabilizationSettings,
} from './VinxTypes';
import {
  generateId, DEFAULT_PANEL_LAYOUT, DEFAULT_COLOR_GRADE,
  DEFAULT_TRACK_HEIGHTS, formatTimecode, DEFAULT_SNAP_SETTINGS,
  CLIP_ROLE_COLORS, REFRAME_PRESETS,
} from './VinxTypes';

// ---------------------------------------------------------------------------
// STATE INTERFACE
// ---------------------------------------------------------------------------

interface VinxState {
  // Project
  project: VinxProject;
  isDirty: boolean;
  lastSavedAt: number;
  /** Why the last save failed (shown in the toolbar); null when saving works. */
  saveError: string | null;

  // Playback
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;
  loopEnabled: boolean;
  volume: number;
  muted: boolean;

  // Selection
  selectedClipIds: string[];
  selectedTrackId: string | null;
  selectedMediaId: string | null;

  // Tool
  activeTool: VinxTool;
  snapEnabled: boolean;
  rippleDeleteEnabled: boolean;
  linkedSelectionEnabled: boolean;

  // Viewer
  viewerOverlay: ViewerOverlay;
  renderQuality: RenderQuality;
  sourceViewerFrame: number;
  /** Active program-monitor LUT (CSS-filter approximation). Store-driven so it
   *  survives re-renders and is baked into Quick Export via ctx.filter —
   *  previously the LUT browser wrote element.style directly (ephemeral,
   *  never exported). null = no LUT. */
  programLUT: { name: string; cssFilter: string } | null;

  // UI
  mediaBrowserTab: 'media' | 'effects' | 'transitions' | 'titles' | 'audio';
  inspectorTab: 'video' | 'audio' | 'effects' | 'color';
  showScopes: boolean;
  scopeType: ScopeType;
  showExportDialog: boolean;
  mediaViewMode: 'list' | 'grid';
  mediaBrowserSearch: string;
  effectsSearch: string;

  // Timeline zoom
  timelineZoom: number;
  timelineScrollX: number;
  timelineScrollY: number;

  // Color grading for selected clip
  colorGrade: ColorGradeSettings;

  // Undo
  undoStack: UndoCommand[];
  redoStack: UndoCommand[];

  // Export
  exportJobs: ExportJob[];

  // Auto-save timer
  autoSaveTimer: ReturnType<typeof setInterval> | null;

  // Recovery
  recoveryBanner: { show: boolean; text: string } | null;

  // New: Speed ramping panel
  showSpeedRampEditor: boolean;
  // New: Subtitle panel
  showSubtitleEditor: boolean;
  activeSubtitleTrackId: string | null;
  // New: LUT browser
  showLUTBrowser: boolean;
  // New: Multicam mode
  multicamMode: boolean;
  // New: Multicam angle picker panel
  showMulticamPanel: boolean;
  // New: Project template dialog
  showTemplateDialog: boolean;
  // New: Loudness metering
  loudnessMetering: LoudnessMetering;
  showLoudnessPanel: boolean;
  // New: Audio ducking panel
  showAudioDuckingPanel: boolean;
  // New: Voiceover recording
  isRecordingVoiceover: boolean;
  // New: Motion tracking panel
  showMotionTracker: boolean;
  activeTrackerId: string | null;
  // New: Mask editor
  showMaskEditor: boolean;
  // New: Render preview
  renderPreviewStatus: 'idle' | 'rendering' | 'complete';
  renderPreviewProgress: number;
  // New: Batch export
  showBatchExport: boolean;
  batchExportMode: string;

  // === NEW PRO FEATURES ===
  // Clip Roles
  showClipRolesPanel: boolean;
  // PiP Presets
  showPipPresets: boolean;
  // Reference Frame comparison
  // Auto-Reframe
  showAutoReframe: boolean;
  autoReframeAspect: ReframeAspect;
  // Ken Burns / Dynamic Zoom
  showKenBurns: boolean;
  // Voice Isolation
  voiceIsolationEnabled: boolean;
  // Audio Crossfade Presets
  showCrossfadePresets: boolean;
  // J/L Cut Presets
  showJLCutPanel: boolean;
  // Stabilization Settings
  showStabilizationPanel: boolean;
  // Noise Reduction Settings
  showNoiseReductionPanel: boolean;
  // Timecode Overlay
  timecodeOverlayEnabled: boolean;
  // Marker Manager
  showMarkerManager: boolean;
  // Snap Settings
  showSnapSettings: boolean;
  snapSettings: SnapSettings;
  // Audio EQ
  showAudioEQ: boolean;
  // Background Render
  showBackgroundRender: boolean;
  backgroundRenderQueue: ExportJob[];
  // Auto-Color Match
  showAutoColorMatch: boolean;
  // EDL/XML Export
  showEDLExport: boolean;
  // Adjustment Layer
  showAdjustmentLayer: boolean;
  // Clip Inspector
  showClipInspector: boolean;
  // Clip Color Labels
  showClipColorLabels: boolean;
  // Copied clip attributes
  copiedClipAttributes: { effects: ClipEffect[]; colorGrade: ColorGradeSettings; transform: ClipTransform } | null;
  // Custom Shortcuts
  showShortcutsEditor: boolean;

  // -----------------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------------

  // Project
  setProjectName: (name: string) => void;
  markDirty: () => void;
  markSaved: () => void;

  // Playback
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleLoop: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  seekTo: (frame: number) => void;

  // Selection
  selectClip: (clipId: string, multi?: boolean) => void;
  deselectAll: () => void;
  setSelectedTrack: (trackId: string | null) => void;
  setSelectedMedia: (mediaId: string | null) => void;

  // Tool
  setTool: (tool: VinxTool) => void;
  toggleSnap: () => void;
  toggleRippleDelete: () => void;
  toggleLinkedSelection: () => void;

  // Viewer
  setViewerOverlay: (overlay: ViewerOverlay) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setSourceViewerFrame: (frame: number) => void;
  setProgramLUT: (lut: { name: string; cssFilter: string } | null) => void;
  setMulticamAngle: (multicamId: string, angleIndex: number) => void;

  // UI
  setMediaBrowserTab: (tab: VinxState['mediaBrowserTab']) => void;
  setInspectorTab: (tab: VinxState['inspectorTab']) => void;
  toggleScopes: () => void;
  setScopeType: (type: ScopeType) => void;
  setShowExportDialog: (show: boolean) => void;
  setMediaViewMode: (mode: 'list' | 'grid') => void;
  setMediaBrowserSearch: (search: string) => void;
  setEffectsSearch: (search: string) => void;

  // Timeline zoom
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollX: (x: number) => void;
  setTimelineScrollY: (y: number) => void;

  // Panel layout
  setPanelLayout: (layout: Partial<PanelLayout>) => void;
  resetPanelToPreset: (preset: 'edit' | 'color' | 'audio') => void;

  // Media
  addMedia: (item: MediaItem) => void;
  removeMedia: (id: string) => void;
  addBin: (parentId: string | null) => void;
  updateMediaItem: (id: string, patch: Partial<MediaItem>) => void;
  removeBin: (id: string) => void;
  toggleBin: (id: string) => void;
  setMediaBin: (mediaId: string, binId: string | null) => void;

  // Tracks
  addTrack: (type: 'video' | 'audio' | 'title') => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisible: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;

  // Clips: all mutations go through executeCommand for undo support
  executeCommand: (cmd: UndoCommand) => void;
  undo: () => void;
  redo: () => void;

  // Direct clip mutations (called by commands)
  _addClip: (clip: Clip) => void;
  _removeClip: (clipId: string) => void;
  _updateClip: (clipId: string, updates: Partial<Clip>) => void;
  _moveClip: (clipId: string, trackId: string, startFrame: number) => void;
  _trimClip: (clipId: string, startFrame: number, endFrame: number, mediaInFrame: number, mediaOutFrame: number) => void;

  // Effects on clips
  _addEffect: (clipId: string, effect: ClipEffect) => void;
  _removeEffect: (clipId: string, effectId: string) => void;
  _updateEffectParam: (clipId: string, effectId: string, paramId: string, value: number | string | boolean) => void;

  // Keyframes
  _addKeyframe: (clipId: string, property: string, kf: Keyframe) => void;
  _removeKeyframe: (clipId: string, property: string, frame: number) => void;
  _moveKeyframe: (clipId: string, property: string, oldFrame: number, newFrame: number, newValue: number) => void;

  // Transitions
  _setTransition: (clipId: string, side: 'in' | 'out', transition: TransitionInstance | null) => void;

  // Markers
  addMarker: (frame: number, name: string) => void;
  removeMarker: (id: string) => void;

  // Color grading
  setColorGrade: (updates: Partial<ColorGradeSettings>) => void;

  // Export
  addExportJob: (job: ExportJob) => void;
  updateExportJob: (jobId: string, updates: Partial<ExportJob>) => void;
  removeExportJob: (jobId: string) => void;

  // Recovery
  dismissRecovery: () => void;

  // Get helpers
  getActiveSequence: () => VinxSequence;
  getClipById: (id: string) => Clip | null;
  getTrackById: (id: string) => Track | null;
  getClipsAtFrame: (frame: number) => Clip[];
  getSelectedClips: () => Clip[];
  getSequenceDuration: () => number;

  // New actions: Speed ramping
  toggleSpeedRampEditor: () => void;
  setClipSpeedRamp: (clipId: string, ramp: SpeedRamp | null) => void;
  // New: Freeze frame
  createFreezeFrame: (clipId: string, frame: number, duration: number) => void;
  // New: Subtitles
  toggleSubtitleEditor: () => void;
  addSubtitleTrack: (name: string, language: string) => void;
  removeSubtitleTrack: (id: string) => void;
  addSubtitleEntry: (trackId: string, entry: SubtitleEntry) => void;
  removeSubtitleEntry: (trackId: string, entryId: string) => void;
  updateSubtitleEntry: (trackId: string, entryId: string, updates: Partial<SubtitleEntry>) => void;
  setActiveSubtitleTrack: (id: string | null) => void;
  // New: LUT
  toggleLUTBrowser: () => void;
  // New: Multicam
  toggleMulticamMode: () => void;
  setShowMulticamPanel: (v: boolean) => void;
  // Per-clip color grading
  updateClipColorGrading: (clipId: string, partial: Partial<import('./VinxTypes').ClipColorGrading>) => void;
  // New: Templates
  toggleTemplateDialog: () => void;
  // New: Loudness
  toggleLoudnessPanel: () => void;
  updateLoudnessMetering: (metering: Partial<LoudnessMetering>) => void;
  // New: Audio ducking
  toggleAudioDuckingPanel: () => void;
  setAudioDucking: (settings: Partial<AudioDuckingSettings>) => void;
  // New: Voiceover
  toggleVoiceoverRecording: () => void;
  // New: Motion tracking
  toggleMotionTracker: () => void;
  setActiveTracker: (id: string | null) => void;
  addMotionTracker: (clipId: string) => void;
  removeMotionTracker: (id: string) => void;
  // New: Mask editor
  toggleMaskEditor: () => void;
  addClipMask: (clipId: string, mask: ClipMask) => void;
  removeClipMask: (clipId: string, maskId: string) => void;
  // New: Render preview
  startRenderPreview: () => void;
  cancelRenderPreview: () => void;
  // New: Batch export
  toggleBatchExport: () => void;
  setBatchExportMode: (mode: string) => void;
  // New: Compound clips / nested sequences
  createCompoundClip: (clipIds: string[], name: string) => void;
  // New: Proxy workflow
  setProxySettings: (settings: Partial<ProxySettings>) => void;

  // =====================================================================
  // NEW PRO FEATURE ACTIONS
  // =====================================================================

  // Clip Roles
  toggleClipRolesPanel: () => void;
  setClipRole: (clipId: string, role: ClipRole) => void;
  // PiP Presets
  togglePipPresets: () => void;
  applyPipPreset: (clipId: string, posX: number, posY: number, scaleX: number, scaleY: number) => void;
  // Reference Frame
  // Auto-Reframe
  toggleAutoReframe: () => void;
  setAutoReframeAspect: (aspect: ReframeAspect) => void;
  applyAutoReframe: () => void;
  // Ken Burns
  toggleKenBurns: () => void;
  // Voice Isolation
  toggleVoiceIsolation: () => void;
  // Crossfade Presets
  toggleCrossfadePresets: () => void;
  // J/L Cut
  toggleJLCutPanel: () => void;
  applyJLCut: (clipId: string, type: 'j-cut' | 'l-cut', frames: number) => void;
  // Stabilization
  toggleStabilizationPanel: () => void;
  setClipStabilization: (clipId: string, settings: StabilizationSettings | null) => void;
  // Noise Reduction
  toggleNoiseReductionPanel: () => void;
  setClipNoiseReduction: (clipId: string, settings: NoiseReductionSettings | null) => void;
  // Timecode Overlay
  toggleTimecodeOverlay: () => void;
  // Marker Manager
  toggleMarkerManager: () => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  // Snap Settings
  toggleSnapSettings: () => void;
  setSnapSettings: (settings: Partial<SnapSettings>) => void;
  // Audio EQ
  toggleAudioEQ: () => void;
  // Background Render
  toggleBackgroundRender: () => void;
  addBackgroundRenderJob: (job: ExportJob) => void;
  // Auto-Color Match
  toggleAutoColorMatch: () => void;
  updateClipColorCorrection: (clipId: string, correction: Record<string, any>) => void;
  // EDL Export
  toggleEDLExport: () => void;
  // Adjustment Layer
  addAdjustmentLayer: () => void;
  toggleAdjustmentLayerPanel: () => void;
  // Clip Inspector
  toggleClipInspector: () => void;
  // Clip Color Labels
  toggleClipColorLabels: () => void;
  setClipColor: (clipId: string, color: string) => void;
  // Clip Attributes Copy/Paste
  copyClipAttributes: (clipId: string) => void;
  pasteClipAttributes: (targetClipId: string) => void;
  // Reverse Clip
  reverseClip: (clipId: string) => void;
  // Custom Shortcuts
  toggleShortcutsEditor: () => void;
  // Timeline In/Out
  setInPoint: () => void;
  setOutPoint: () => void;
  clearInOutPoints: () => void;
}

// ---------------------------------------------------------------------------
// DEFAULT PROJECT
// ---------------------------------------------------------------------------

function createDefaultProject(): VinxProject {
  // Empty professional starting layout: V2/V1 video tracks, A1/A2 audio,
  // T1 title. No demo clips, no fake markers -- ready to drop media into.
  const v1: Track = { id: 'v1', name: 'V1', type: 'video', height: DEFAULT_TRACK_HEIGHTS.video, muted: false, locked: false, visible: true, solo: false, volume: 1, clips: [] };
  const v2: Track = { id: 'v2', name: 'V2', type: 'video', height: DEFAULT_TRACK_HEIGHTS.video, muted: false, locked: false, visible: true, solo: false, volume: 1, clips: [] };
  const a1: Track = { id: 'a1', name: 'A1', type: 'audio', height: DEFAULT_TRACK_HEIGHTS.audio, muted: false, locked: false, visible: true, solo: false, volume: 1, clips: [] };
  const a2: Track = { id: 'a2', name: 'A2', type: 'audio', height: DEFAULT_TRACK_HEIGHTS.audio, muted: false, locked: false, visible: true, solo: false, volume: 1, clips: [] };
  const t1: Track = { id: 't1', name: 'T1', type: 'title', height: DEFAULT_TRACK_HEIGHTS.title, muted: false, locked: false, visible: true, solo: false, volume: 1, clips: [] };

  const seq: VinxSequence = {
    id: generateId('seq'),
    name: 'Sequence 1',
    tracks: [t1, v2, v1, a1, a2],
    duration: 0,
    inPoint: null,
    outPoint: null,
  };

  return {
    id: generateId('proj'),
    name: 'Untitled Project',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    frameRate: 30,
    width: 1920,
    height: 1080,
    sampleRate: 48000,
    audioChannels: 2,
    sequences: [seq],
    activeSequenceId: seq.id,
    mediaBin: [],
    bins: [],
    markers: [],
    panelLayout: { ...DEFAULT_PANEL_LAYOUT },
    settings: {
      defaultTransitionDuration: 20,
      scopeUpdateInterval: 4,
      autoSaveInterval: 30,
      scrubAudioEnabled: true,
      snapEnabled: true,
      rippleDeleteEnabled: false,
      linkedSelectionEnabled: true,
      renderQuality: 'auto',
    },
    subtitleTracks: [],
    compoundClips: [],
    multicamClips: [],
    motionTrackers: [],
    audioDucking: { enabled: false, dialogueTrackId: null, musicTrackId: null, threshold: -20, duckAmount: -12, attackMs: 200, releaseMs: 500 },
    proxySettings: { enabled: false, resolution: '1/2', codec: 'h264', autoGenerate: false },
    templateId: null,
  };
}

// ---------------------------------------------------------------------------
// PERSISTENCE
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dex-vinx-project';
const LAYOUT_KEY = 'dex-vinx-layout';

const safeLocal = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

/** Set when the stored project could not be read and was copied aside. */
let unreadableProjectKey: string | null = null;
export function takeUnreadableProjectKey(): string | null { const k = unreadableProjectKey; unreadableProjectKey = null; return k; }
/** True when the project in memory came from storage (not a new default one). */
let loadedFromStorage = false;
export function projectWasLoadedFromStorage(): boolean { return loadedFromStorage; }

function loadProject(): VinxProject {
  try {
    const stored = readStoredProject(safeLocal(), STORAGE_KEY);
    unreadableProjectKey = stored.movedAside;
    if (stored.project) {
      const parsed = stored.project as unknown as VinxProject;
      {
        // Migration: clear stale demo clips ('cv1-1', 'cv2-1', 'ca1-1', 'ct1-1', etc.)
        // shipped before v4.2.1. If the persisted project still contains them and
        // user has not added any non-demo clips, reset to a clean empty project.
        const DEMO_IDS = new Set(['cv1-1','cv1-2','cv1-3','cv2-1','cv2-2','ca1-1','ca1-2','ca2-1','ct1-1','ct1-2']);
        let demoCount = 0;
        let userCount = 0;
        for (const s of parsed.sequences) {
          for (const t of (s.tracks || [])) {
            for (const c of (t.clips || [])) {
              if (DEMO_IDS.has(c.id)) demoCount++;
              else userCount++;
            }
          }
        }
        if (demoCount > 0 && userCount === 0) {
          console.info('[VINX] Migrating: removing demo clips from default project');
          return createDefaultProject();
        }
        loadedFromStorage = true;
        return parsed;
      }
    }
  } catch (e) { console.warn('[VINX] Failed to load project:', e); }
  return createDefaultProject();
}

const SAVE_FAILED_LOCAL = 'Not saved: app storage is full and DEX storage did not answer. Save a checkpoint or export now, and remove unused media.';
const SAVE_FAILED_NATIVE = 'Not saved: DEX storage refused the write.';

/**
 * Write the project to localStorage and mirror it to DEX's native store. The
 * save counts when either copy is written; the caller hears which.
 */
function saveProject(project: VinxProject, done: (error: string | null) => void): void {
  let json: string;
  try { json = JSON.stringify(project); } catch (e) { done(`Not saved: ${(e as Error).message}`); return; }
  const local = writeStoredProject(safeLocal(), STORAGE_KEY, json);
  const invoke = (window as any).dex?.invoke as ((ch: string, ...a: unknown[]) => Promise<unknown>) | undefined;
  if (local.ok) {
    done(null);
    invoke?.('capability:storage:set', STORAGE_KEY, json)?.catch?.((e: unknown) => { console.warn('[VINX] native mirror failed', e); });
    return;
  }
  if (!invoke) { done(local.reason === 'quota' ? 'Not saved: app storage is full. Save a checkpoint or export now, and remove unused media.' : 'Not saved: storage is unavailable.'); return; }
  Promise.resolve(invoke('capability:storage:set', STORAGE_KEY, json)).then(() => done(null), () => done(local.reason === 'quota' ? SAVE_FAILED_LOCAL : SAVE_FAILED_NATIVE));
}

function loadLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.mediaBrowserWidth === 'number') return parsed;
    }
  } catch (e) { console.warn('[VINX] Failed to load layout:', e); }
  return { ...DEFAULT_PANEL_LAYOUT };
}

function saveLayout(layout: PanelLayout): void {
  try {
    const json = JSON.stringify(layout);
    localStorage.setItem(LAYOUT_KEY, json);
    (window as any).dex?.invoke?.('capability:storage:set', LAYOUT_KEY, json).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch (e) { console.warn('[VINX] Failed to save layout:', e); }
}

// Recovery is decided when VINX opens (Vinx.tsx, session marker in
// vinxPersistence.ts): a banner appears only if the previous session did not
// close, never just because a saved project exists.

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

export const useVinxStore = create<VinxState>((set, get) => {
  const initialProject = loadProject();
  const initialLayout = loadLayout();
  initialProject.panelLayout = initialLayout;
  return {
    project: initialProject,
    isDirty: false,
    // 0 = never saved in this profile; the toolbar then says nothing about saving.
    lastSavedAt: loadedFromStorage ? (initialProject.modifiedAt || 0) : 0,
    saveError: null,

    currentFrame: 0,
    isPlaying: false,
    playbackSpeed: 1,
    loopEnabled: false,
    volume: 1,
    muted: false,

    selectedClipIds: [],
    selectedTrackId: null,
    selectedMediaId: null,

    activeTool: 'select',
    snapEnabled: initialProject.settings.snapEnabled,
    rippleDeleteEnabled: initialProject.settings.rippleDeleteEnabled,
    linkedSelectionEnabled: initialProject.settings.linkedSelectionEnabled,

    viewerOverlay: 'none',
    renderQuality: initialProject.settings.renderQuality,
    sourceViewerFrame: 0,
    programLUT: null,

    mediaBrowserTab: 'media',
    inspectorTab: 'video',
    showScopes: false,
    scopeType: 'waveform',
    showExportDialog: false,
    mediaViewMode: 'list',
    mediaBrowserSearch: '',
    effectsSearch: '',

    timelineZoom: 1,
    timelineScrollX: 0,
    timelineScrollY: 0,

    colorGrade: { ...DEFAULT_COLOR_GRADE },

    undoStack: [],
    redoStack: [],

    exportJobs: [],

    autoSaveTimer: null,

    recoveryBanner: null,

    // New state
    showSpeedRampEditor: false,
    showSubtitleEditor: false,
    activeSubtitleTrackId: null,
    showLUTBrowser: false,
    multicamMode: false,
    showMulticamPanel: false,
    showTemplateDialog: false,
    loudnessMetering: { integratedLUFS: -23, shortTermLUFS: -23, momentaryLUFS: -23, truePeak: -1, loudnessRange: 7, target: -14 },
    showLoudnessPanel: false,
    showAudioDuckingPanel: false,
    isRecordingVoiceover: false,
    showMotionTracker: false,
    activeTrackerId: null,
    showMaskEditor: false,
    renderPreviewStatus: 'idle' as const,
    renderPreviewProgress: 0,
    showBatchExport: false,
    batchExportMode: '',

    // === NEW PRO FEATURES - defaults ===
    showClipRolesPanel: false,
    showPipPresets: false,
    showAutoReframe: false,
    autoReframeAspect: '16:9' as const,
    showKenBurns: false,
    voiceIsolationEnabled: false,
    showCrossfadePresets: false,
    showJLCutPanel: false,
    showStabilizationPanel: false,
    showNoiseReductionPanel: false,
    timecodeOverlayEnabled: false,
    showMarkerManager: false,
    showSnapSettings: false,
    snapSettings: { ...DEFAULT_SNAP_SETTINGS },
    showAudioEQ: false,
    showBackgroundRender: false,
    backgroundRenderQueue: [],
    showAutoColorMatch: false,
    showEDLExport: false,
    showAdjustmentLayer: false,
    showClipInspector: false,
    showClipColorLabels: false,
    copiedClipAttributes: null,
    showShortcutsEditor: false,

    // -- Project actions --
    setProjectName: (name) => set(s => {
      const project = { ...s.project, name, modifiedAt: Date.now() };
      return { project, isDirty: true };
    }),
    markDirty: () => set({ isDirty: true }),
    markSaved: () => {
      const before = get().project;
      const now = Date.now();
      // Stamp the time so the newer of the local and native copies wins at the next start.
      const project = { ...before, modifiedAt: now };
      set({ project });
      saveProject(project, (error) => {
        if (error) { set({ saveError: error, isDirty: true }); return; }
        // Edits made while an async write was in flight keep the project dirty.
        set({ saveError: null, lastSavedAt: now, isDirty: get().project !== project });
      });
    },

    // -- Playback --
    setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, frame) }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.125, Math.min(16, speed)) }),
    toggleLoop: () => set(s => ({ loopEnabled: !s.loopEnabled })),
    setVolume: (vol) => set({ volume: Math.max(0, Math.min(2, vol)) }),
    toggleMute: () => set(s => ({ muted: !s.muted })),
    seekTo: (frame) => set({ currentFrame: Math.max(0, frame), isPlaying: false }),

    // -- Selection --
    selectClip: (clipId, multi) => set(s => {
      if (multi) {
        const idx = s.selectedClipIds.indexOf(clipId);
        if (idx >= 0) return { selectedClipIds: s.selectedClipIds.filter(id => id !== clipId) };
        return { selectedClipIds: [...s.selectedClipIds, clipId] };
      }
      return { selectedClipIds: [clipId] };
    }),
    deselectAll: () => set({ selectedClipIds: [] }),
    setSelectedTrack: (trackId) => set({ selectedTrackId: trackId }),
    setSelectedMedia: (mediaId) => set({ selectedMediaId: mediaId }),

    // -- Tool --
    setTool: (tool) => set({ activeTool: tool }),
    toggleSnap: () => set(s => ({ snapEnabled: !s.snapEnabled })),
    setProgramLUT: (lut) => set({ programLUT: lut }),

    // Multicam active-angle setter (store action so the switch goes through
    // one place and can be wrapped in an undo command — the panel used to call
    // useVinxStore.setState directly, bypassing undo entirely).
    setMulticamAngle: (multicamId: string, angleIndex: number) => set(s => ({
      project: {
        ...s.project,
        multicamClips: s.project.multicamClips.map(m =>
          m.id === multicamId ? { ...m, activeAngle: angleIndex } : m),
        modifiedAt: Date.now(),
      },
      isDirty: true,
    })),
    toggleRippleDelete: () => set(s => ({ rippleDeleteEnabled: !s.rippleDeleteEnabled })),
    toggleLinkedSelection: () => set(s => ({ linkedSelectionEnabled: !s.linkedSelectionEnabled })),

    // -- Viewer --
    setViewerOverlay: (overlay) => set({ viewerOverlay: overlay }),
    setRenderQuality: (quality) => set({ renderQuality: quality }),
    setSourceViewerFrame: (frame) => set({ sourceViewerFrame: Math.max(0, frame) }),

    // -- UI --
    setMediaBrowserTab: (tab) => set({ mediaBrowserTab: tab }),
    setInspectorTab: (tab) => set({ inspectorTab: tab }),
    toggleScopes: () => set(s => ({ showScopes: !s.showScopes })),
    setScopeType: (type) => set({ scopeType: type }),
    setShowExportDialog: (show) => set({ showExportDialog: show }),
    setMediaViewMode: (mode) => set({ mediaViewMode: mode }),
    setMediaBrowserSearch: (search) => set({ mediaBrowserSearch: search }),
    setEffectsSearch: (search) => set({ effectsSearch: search }),

    // -- Timeline zoom --
    setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(0.01, Math.min(100, zoom)) }),
    setTimelineScrollX: (x) => set({ timelineScrollX: Math.max(0, x) }),
    setTimelineScrollY: (y) => set({ timelineScrollY: Math.max(0, y) }),

    // -- Panel layout --
    setPanelLayout: (layout) => set(s => {
      const panelLayout = { ...s.project.panelLayout, ...layout };
      saveLayout(panelLayout);
      return { project: { ...s.project, panelLayout } };
    }),
    resetPanelToPreset: (preset) => {
      const layouts: Record<string, Partial<PanelLayout>> = {
        edit: { mediaBrowserWidth: 260, inspectorWidth: 280, timelineHeight: 280, viewerMode: 'dual' },
        color: { mediaBrowserWidth: 200, inspectorWidth: 380, timelineHeight: 220, viewerMode: 'single' },
        audio: { mediaBrowserWidth: 200, inspectorWidth: 300, timelineHeight: 380, viewerMode: 'single' },
      };
      const l = layouts[preset] || layouts.edit;
      const panelLayout = { ...DEFAULT_PANEL_LAYOUT, ...l, preset };
      saveLayout(panelLayout as PanelLayout);
      set(s => ({ project: { ...s.project, panelLayout: panelLayout as PanelLayout } }));
    },

    // -- Media --
    addMedia: (item) => set(s => ({
      project: { ...s.project, mediaBin: [...s.project.mediaBin, item] },
      isDirty: true,
    })),
    removeMedia: (id) => set(s => ({
      project: { ...s.project, mediaBin: s.project.mediaBin.filter(m => m.id !== id) },
      isDirty: true,
    })),
    updateMediaItem: (id, patch) => set(s => ({
      project: {
        ...s.project,
        mediaBin: s.project.mediaBin.map(m => m.id === id ? { ...m, ...patch } : m),
      },
    })),
    addBin: (parentId) => set(s => {
      const bin: MediaBin = { id: generateId('bin'), name: 'New Bin', parentId, expanded: true };
      return { project: { ...s.project, bins: [...s.project.bins, bin] }, isDirty: true };
    }),
    removeBin: (id) => set(s => ({
      project: {
        ...s.project,
        bins: s.project.bins.filter(b => b.id !== id),
        mediaBin: s.project.mediaBin.map(m => m.binId === id ? { ...m, binId: null } : m),
      },
      isDirty: true,
    })),
    toggleBin: (id) => set(s => ({
      project: {
        ...s.project,
        bins: s.project.bins.map(b => b.id === id ? { ...b, expanded: !b.expanded } : b),
      },
    })),
    setMediaBin: (mediaId, binId) => set(s => ({
      project: {
        ...s.project,
        mediaBin: s.project.mediaBin.map(m => m.id === mediaId ? { ...m, binId } : m),
      },
      isDirty: true,
    })),

    // -- Tracks --
    addTrack: (type) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const count = seq.tracks.filter(t => t.type === type).length + 1;
      const prefix = type === 'video' ? 'V' : type === 'audio' ? 'A' : 'T';
      const track: Track = {
        id: generateId('track'),
        name: `${prefix}${count}`,
        type,
        height: DEFAULT_TRACK_HEIGHTS[type],
        muted: false, locked: false, visible: true, solo: false,
        volume: 1, clips: [],
      };
      const newTracks = [...seq.tracks];
      if (type === 'video' || type === 'title') {
        const firstVideoIdx = newTracks.findIndex(t => t.type === 'video');
        newTracks.splice(firstVideoIdx >= 0 ? firstVideoIdx : 0, 0, track);
      } else {
        newTracks.push(track);
      }
      const newSeq = { ...seq, tracks: newTracks };
      return {
        project: {
          ...s.project,
          sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq),
        },
        isDirty: true,
      };
    }),
    removeTrack: (trackId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.filter(t => t.id !== trackId) };
      return {
        project: {
          ...s.project,
          sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq),
        },
        isDirty: true,
      };
    }),
    toggleTrackMute: (trackId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    toggleTrackLock: (trackId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    toggleTrackVisible: (trackId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === trackId ? { ...t, visible: !t.visible } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    toggleTrackSolo: (trackId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),

    // -- Command execution (undo system) --
    executeCommand: (cmd) => {
      cmd.execute();
      set(s => ({
        undoStack: [...s.undoStack.slice(-199), cmd],
        redoStack: [],
        isDirty: true,
        project: { ...s.project, modifiedAt: Date.now() },
      }));
    },
    undo: () => {
      const s = get();
      if (s.undoStack.length === 0) return;
      const cmd = s.undoStack[s.undoStack.length - 1];
      cmd.undo();
      set({
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, cmd],
        isDirty: true,
      });
    },
    redo: () => {
      const s = get();
      if (s.redoStack.length === 0) return;
      const cmd = s.redoStack[s.redoStack.length - 1];
      cmd.execute();
      set({
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, cmd],
        isDirty: true,
      });
    },

    // -- Direct clip mutations --
    _addClip: (clip) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _removeClip: (clipId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) })),
      };
      return {
        project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) },
        selectedClipIds: s.selectedClipIds.filter(id => id !== clipId),
      };
    }),
    _updateClip: (clipId, updates) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, ...updates } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _moveClip: (clipId, trackId, startFrame) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      let clip: Clip | null = null;
      for (const t of seq.tracks) {
        const found = t.clips.find(c => c.id === clipId);
        if (found) { clip = found; break; }
      }
      if (!clip) return s;
      const duration = clip.endFrame - clip.startFrame;
      const moved = { ...clip, trackId, startFrame, endFrame: startFrame + duration };
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => {
          let clips = t.clips.filter(c => c.id !== clipId);
          if (t.id === trackId) clips = [...clips, moved];
          return { ...t, clips };
        }),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _trimClip: (clipId, startFrame, endFrame, mediaInFrame, mediaOutFrame) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, startFrame, endFrame, mediaInFrame, mediaOutFrame } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),

    // -- Effects --
    _addEffect: (clipId, effect) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, effects: [...c.effects, effect] } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _removeEffect: (clipId, effectId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, effects: c.effects.filter(e => e.id !== effectId) } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _updateEffectParam: (clipId, effectId, paramId, value) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? {
            ...c,
            effects: c.effects.map(e => e.id === effectId ? { ...e, parameters: { ...e.parameters, [paramId]: value } } : e),
          } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),

    // -- Keyframes --
    _addKeyframe: (clipId, property, kf) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            const trackIdx = c.keyframes.findIndex(kt => kt.property === property);
            if (trackIdx >= 0) {
              const newKfs = [...c.keyframes];
              newKfs[trackIdx] = { ...newKfs[trackIdx], keyframes: [...newKfs[trackIdx].keyframes.filter(k => k.frame !== kf.frame), kf].sort((a, b) => a.frame - b.frame) };
              return { ...c, keyframes: newKfs };
            }
            return { ...c, keyframes: [...c.keyframes, { property: property as any, keyframes: [kf] }] };
          }),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _removeKeyframe: (clipId, property, frame) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
              ...c,
              keyframes: c.keyframes.map(kt => kt.property === property
                ? { ...kt, keyframes: kt.keyframes.filter(k => k.frame !== frame) }
                : kt
              ).filter(kt => kt.keyframes.length > 0),
            };
          }),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),
    _moveKeyframe: (clipId, property, oldFrame, newFrame, newValue) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
              ...c,
              keyframes: c.keyframes.map(kt => kt.property === property
                ? { ...kt, keyframes: kt.keyframes.map(k => k.frame === oldFrame ? { ...k, frame: newFrame, value: newValue } : k).sort((a, b) => a.frame - b.frame) }
                : kt
              ),
            };
          }),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),

    // -- Transitions --
    _setTransition: (clipId, side, transition) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const field = side === 'in' ? 'transitionIn' : 'transitionOut';
      const newSeq = {
        ...seq,
        tracks: seq.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, [field]: transition } : c),
        })),
      };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) } };
    }),

    // -- Markers --
    // Markers are kept sorted by frame so the ruler flags, Marker Manager list,
    // and next/prev-marker navigation all stay in chronological order. An empty
    // name falls back to a sequential "Marker N" default.
    addMarker: (frame, name) => set(s => {
      const resolvedName = name && name.trim() ? name : `Marker ${s.project.markers.length + 1}`;
      const marker: Marker = { id: generateId('marker'), frame, name: resolvedName, color: '#FF6B6B', notes: '', duration: 0, type: 'standard' };
      const markers = [...s.project.markers, marker].sort((a, b) => a.frame - b.frame);
      return { project: { ...s.project, markers }, isDirty: true };
    }),
    removeMarker: (id) => set(s => ({
      project: { ...s.project, markers: s.project.markers.filter(m => m.id !== id) },
      isDirty: true,
    })),

    // -- Color grading --
    setColorGrade: (updates) => set(s => ({ colorGrade: { ...s.colorGrade, ...updates } })),

    // -- Export --
    addExportJob: (job) => set(s => ({ exportJobs: [...s.exportJobs, job] })),
    updateExportJob: (jobId, updates) => set(s => ({
      exportJobs: s.exportJobs.map(j => j.id === jobId ? { ...j, ...updates } : j),
    })),
    removeExportJob: (jobId) => set(s => ({ exportJobs: s.exportJobs.filter(j => j.id !== jobId) })),

    // -- Recovery --
    dismissRecovery: () => set({ recoveryBanner: null }),

    // -- Getters --
    getActiveSequence: () => {
      const s = get();
      return s.project.sequences.find(sq => sq.id === s.project.activeSequenceId) || s.project.sequences[0];
    },
    getClipById: (id) => {
      const seq = get().getActiveSequence();
      for (const t of seq.tracks) {
        const c = t.clips.find(cl => cl.id === id);
        if (c) return c;
      }
      return null;
    },
    getTrackById: (id) => {
      const seq = get().getActiveSequence();
      return seq.tracks.find(t => t.id === id) || null;
    },
    getClipsAtFrame: (frame) => {
      const seq = get().getActiveSequence();
      const result: Clip[] = [];
      for (const t of seq.tracks) {
        for (const c of t.clips) {
          if (frame >= c.startFrame && frame < c.endFrame) result.push(c);
        }
      }
      return result;
    },
    getSelectedClips: () => {
      const s = get();
      return s.selectedClipIds.map(id => s.getClipById(id)).filter(Boolean) as Clip[];
    },
    getSequenceDuration: () => {
      const seq = get().getActiveSequence();
      let maxFrame = 0;
      for (const t of seq.tracks) {
        for (const c of t.clips) {
          if (c.endFrame > maxFrame) maxFrame = c.endFrame;
        }
      }
      return maxFrame;
    },

    // =====================================================================
    // NEW ACTIONS
    // =====================================================================

    // Speed ramping
    toggleSpeedRampEditor: () => set(s => ({ showSpeedRampEditor: !s.showSpeedRampEditor })),
    setClipSpeedRamp: (clipId, ramp) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, speedRamp: ramp } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Freeze frame
    createFreezeFrame: (clipId, frame, duration) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      let sourceClip: Clip | null = null;
      let sourceTrack: Track | null = null;
      for (const t of seq.tracks) {
        const c = t.clips.find(cl => cl.id === clipId);
        if (c) { sourceClip = c; sourceTrack = t; break; }
      }
      if (!sourceClip || !sourceTrack) return s;
      const freezeClip: Clip = {
        ...sourceClip,
        id: generateId('freeze'),
        name: `${sourceClip.name} (Freeze)`,
        startFrame: frame,
        endFrame: frame + duration,
        isFreezeFrame: true,
        freezeFrameSource: frame - sourceClip.startFrame + sourceClip.mediaInFrame,
        speedRamp: null, masks: [], compoundClipId: null,
        noiseReduction: null, stabilization: null,
      };
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === sourceTrack!.id ? { ...t, clips: [...t.clips, freezeClip] } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Subtitles
    toggleSubtitleEditor: () => set(s => ({ showSubtitleEditor: !s.showSubtitleEditor })),
    addSubtitleTrack: (name, language) => set(s => {
      const track: SubtitleTrack = { id: generateId('sub'), name, language, entries: [], visible: true };
      return { project: { ...s.project, subtitleTracks: [...(s.project.subtitleTracks || []), track] }, isDirty: true };
    }),
    removeSubtitleTrack: (id) => set(s => ({
      project: { ...s.project, subtitleTracks: (s.project.subtitleTracks || []).filter(t => t.id !== id) }, isDirty: true,
    })),
    addSubtitleEntry: (trackId, entry) => set(s => ({
      project: { ...s.project, subtitleTracks: (s.project.subtitleTracks || []).map(t => t.id === trackId ? { ...t, entries: [...t.entries, entry] } : t) }, isDirty: true,
    })),
    removeSubtitleEntry: (trackId, entryId) => set(s => ({
      project: { ...s.project, subtitleTracks: (s.project.subtitleTracks || []).map(t => t.id === trackId ? { ...t, entries: t.entries.filter(e => e.id !== entryId) } : t) }, isDirty: true,
    })),
    updateSubtitleEntry: (trackId, entryId, updates) => set(s => ({
      project: { ...s.project, subtitleTracks: (s.project.subtitleTracks || []).map(t => t.id === trackId ? { ...t, entries: t.entries.map(e => e.id === entryId ? { ...e, ...updates } : e) } : t) }, isDirty: true,
    })),
    setActiveSubtitleTrack: (id) => set({ activeSubtitleTrackId: id }),

    // LUT
    toggleLUTBrowser: () => set(s => ({ showLUTBrowser: !s.showLUTBrowser })),

    // Multicam
    toggleMulticamMode: () => set(s => ({ multicamMode: !s.multicamMode })),
    setShowMulticamPanel: (v) => set({ showMulticamPanel: v }),
    updateClipColorGrading: (clipId, partial) => set(s => {
      const sequences = s.project.sequences.map(seq => ({
        ...seq,
        tracks: seq.tracks.map(tr => ({
          ...tr,
          clips: tr.clips.map(c => {
            if (c.id !== clipId) return c;
            const current = c.colorGrading ?? {
              primary: {
                wheels: {
                  lift: { r: 0, g: 0, b: 0, master: 0 },
                  gamma: { r: 0, g: 0, b: 0, master: 0 },
                  gain: { r: 0, g: 0, b: 0, master: 0 },
                },
              },
            };
            const next = {
              ...current,
              ...partial,
              primary: {
                ...current.primary,
                ...(partial.primary ?? {}),
                wheels: {
                  ...current.primary.wheels,
                  ...((partial.primary && partial.primary.wheels) ?? {}),
                },
              },
            };
            return { ...c, colorGrading: next };
          }),
        })),
      }));
      return { project: { ...s.project, sequences, modifiedAt: Date.now() }, isDirty: true };
    }),

    // Templates
    toggleTemplateDialog: () => set(s => ({ showTemplateDialog: !s.showTemplateDialog })),

    // Loudness
    toggleLoudnessPanel: () => set(s => ({ showLoudnessPanel: !s.showLoudnessPanel })),
    updateLoudnessMetering: (metering) => set(s => ({ loudnessMetering: { ...s.loudnessMetering, ...metering } })),

    // Audio ducking
    toggleAudioDuckingPanel: () => set(s => ({ showAudioDuckingPanel: !s.showAudioDuckingPanel })),
    setAudioDucking: (settings) => set(s => ({
      project: { ...s.project, audioDucking: { ...s.project.audioDucking, ...settings } }, isDirty: true,
    })),

    // Voiceover recording
    toggleVoiceoverRecording: () => {
      const state = get();
      if (state.isRecordingVoiceover) {
        // Stop recording
        if ((state as any)._voiceoverRecorder) {
          (state as any)._voiceoverRecorder.stop();
        }
        set({ isRecordingVoiceover: false });
      } else {
        // Start recording via getUserMedia
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          const recorder = new MediaRecorder(stream);
          const chunks: BlobPart[] = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            // Create a voiceover audio clip on the timeline
            const s = get();
            const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
            if (seq) {
              const audioTrack = seq.tracks.find(t => t.type === 'audio') || seq.tracks[seq.tracks.length - 1];
              if (audioTrack) {
                const voClip: Clip = {
                  id: generateId('voiceover'),
                  name: `Voiceover ${new Date().toLocaleTimeString()}`,
                  type: 'audio',
                  mediaId: url,
                  startFrame: s.currentFrame || 0,
                  endFrame: (s.currentFrame || 0) + 150,
                  mediaInFrame: 0,
                  mediaOutFrame: 150,
                  trackIndex: 0,
                  volume: 1,
                  pan: 0,
                  isMuted: false,
                  isSolo: false,
                  isLocked: false,
                  color: '#FF6B35',
                  speedRamp: null,
                  masks: [],
                  compoundClipId: null,
                  noiseReduction: null,
                  stabilization: null,
                } as any;
                const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === audioTrack.id ? { ...t, clips: [...t.clips, voClip] } : t) };
                set({ project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true });
              }
            }
          };
          (get() as any)._voiceoverRecorder = recorder;
          recorder.start();
          set({ isRecordingVoiceover: true });
        }).catch(() => { set({ isRecordingVoiceover: false }); });
      }
    },

    // Motion tracking
    toggleMotionTracker: () => set(s => ({ showMotionTracker: !s.showMotionTracker })),
    setActiveTracker: (id) => set({ activeTrackerId: id }),
    addMotionTracker: (clipId) => set(s => {
      const tracker: MotionTracker = { id: generateId('tracker'), name: 'Tracker 1', clipId, type: 'point', trackPoints: [], status: 'idle' };
      return { project: { ...s.project, motionTrackers: [...(s.project.motionTrackers || []), tracker] }, isDirty: true };
    }),
    removeMotionTracker: (id) => set(s => ({
      project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).filter(t => t.id !== id) }, isDirty: true,
    })),

    // Mask editor
    toggleMaskEditor: () => set(s => ({ showMaskEditor: !s.showMaskEditor })),
    addClipMask: (clipId, mask) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, masks: [...(c.masks || []), mask] } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),
    removeClipMask: (clipId, maskId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, masks: (c.masks || []).filter(m => m.id !== maskId) } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Render preview
    startRenderPreview: () => {
      set({ renderPreviewStatus: 'rendering', renderPreviewProgress: 0 });
      const state = get();
      const seq = state.project.sequences.find(sq => sq.id === state.project.activeSequenceId);
      if (!seq) { set({ renderPreviewStatus: 'idle' }); return; }
      const totalFrames = seq.duration || 300;
      let frame = 0;
      const interval = setInterval(() => {
        frame += 5;
        const progress = Math.min(100, Math.round((frame / totalFrames) * 100));
        const current = get();
        if (current.renderPreviewStatus !== 'rendering') { clearInterval(interval); return; }
        set({ renderPreviewProgress: progress });
        if (frame >= totalFrames) {
          clearInterval(interval);
          set({ renderPreviewStatus: 'complete', renderPreviewProgress: 100 });
        }
      }, 50);
    },
    cancelRenderPreview: () => set({ renderPreviewStatus: 'idle', renderPreviewProgress: 0 }),

    // Batch export
    toggleBatchExport: () => set(s => ({ showBatchExport: !s.showBatchExport })),
    setBatchExportMode: (mode) => set({ batchExportMode: mode }),

    // Compound clips / nested sequences
    createCompoundClip: (clipIds, name) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const compoundSeq: VinxSequence = { id: generateId('seq'), name, tracks: [], duration: 0, inPoint: null, outPoint: null };
      const compound: CompoundClip = { id: generateId('compound'), name, sequenceId: compoundSeq.id, color: '#9B6EFF' };
      return {
        project: {
          ...s.project,
          sequences: [...s.project.sequences, compoundSeq],
          compoundClips: [...(s.project.compoundClips || []), compound],
        },
        isDirty: true,
      };
    }),

    // Proxy workflow
    setProxySettings: (settings) => set(s => ({
      project: { ...s.project, proxySettings: { ...(s.project.proxySettings || { enabled: false, resolution: '1/2' as const, codec: 'h264' as const, autoGenerate: false }), ...settings } },
      isDirty: true,
    })),

    // =====================================================================
    // NEW PRO FEATURE IMPLEMENTATIONS
    // =====================================================================

    // Clip Roles
    toggleClipRolesPanel: () => set(s => ({ showClipRolesPanel: !s.showClipRolesPanel })),
    setClipRole: (clipId, role) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const color = CLIP_ROLE_COLORS[role] || 'var(--color-text-tertiary)';
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, color } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // PiP Presets
    togglePipPresets: () => set(s => ({ showPipPresets: !s.showPipPresets })),
    applyPipPreset: (clipId, posX, posY, scaleX, scaleY) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, transform: { ...c.transform, positionX: posX, positionY: posY, scaleX, scaleY } } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Reference Frame

    // Auto-Reframe
    toggleAutoReframe: () => set(s => ({ showAutoReframe: !s.showAutoReframe })),
    setAutoReframeAspect: (aspect) => set({ autoReframeAspect: aspect }),
    applyAutoReframe: () => set(s => {
      const preset = REFRAME_PRESETS.find(p => p.aspect === s.autoReframeAspect);
      if (!preset) return s;
      return { project: { ...s.project, width: preset.w, height: preset.h, modifiedAt: Date.now() }, isDirty: true };
    }),

    // Ken Burns
    toggleKenBurns: () => set(s => ({ showKenBurns: !s.showKenBurns })),

    // Voice Isolation — applies high-pass + low-pass band filter to isolate vocal frequencies
    toggleVoiceIsolation: () => {
      const s = get();
      const newVal = !s.voiceIsolationEnabled;
      if (newVal) {
        // Mark all audio clips with voice isolation flag
        const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
        if (seq) {
          const newSeq = { ...seq, tracks: seq.tracks.map(t => ({
            ...t, clips: t.clips.map(c => c.type === 'audio' ? { ...c, voiceIsolation: true } as any : c)
          })) };
          set({
            voiceIsolationEnabled: true,
            project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) },
            isDirty: true,
          });
        } else {
          set({ voiceIsolationEnabled: true });
        }
      } else {
        const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
        if (seq) {
          const newSeq = { ...seq, tracks: seq.tracks.map(t => ({
            ...t, clips: t.clips.map(c => { const copy = { ...c } as any; delete copy.voiceIsolation; return copy; })
          })) };
          set({
            voiceIsolationEnabled: false,
            project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) },
            isDirty: true,
          });
        } else {
          set({ voiceIsolationEnabled: false });
        }
      }
    },

    // Crossfade Presets
    toggleCrossfadePresets: () => set(s => ({ showCrossfadePresets: !s.showCrossfadePresets })),

    // J/L Cut
    toggleJLCutPanel: () => set(s => ({ showJLCutPanel: !s.showJLCutPanel })),
    applyJLCut: (clipId, type, frames) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const offset = type === 'j-cut' ? -frames : frames;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => {
        if (c.id !== clipId || c.type !== 'audio') return c;
        return { ...c, startFrame: c.startFrame + offset, endFrame: c.endFrame + offset };
      }) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Stabilization
    toggleStabilizationPanel: () => set(s => ({ showStabilizationPanel: !s.showStabilizationPanel })),
    setClipStabilization: (clipId, settings) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, stabilization: settings } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Noise Reduction
    toggleNoiseReductionPanel: () => set(s => ({ showNoiseReductionPanel: !s.showNoiseReductionPanel })),
    setClipNoiseReduction: (clipId, settings) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, noiseReduction: settings } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Timecode Overlay
    toggleTimecodeOverlay: () => set(s => ({ timecodeOverlayEnabled: !s.timecodeOverlayEnabled })),

    // Marker Manager
    toggleMarkerManager: () => set(s => ({ showMarkerManager: !s.showMarkerManager })),
    updateMarker: (id, updates) => set(s => {
      let markers = s.project.markers.map(m => m.id === id ? { ...m, ...updates } : m);
      // Re-sort only if a frame moved, so markers stay chronological.
      if (updates.frame !== undefined) markers = [...markers].sort((a, b) => a.frame - b.frame);
      return { project: { ...s.project, markers }, isDirty: true };
    }),

    // Snap Settings
    toggleSnapSettings: () => set(s => ({ showSnapSettings: !s.showSnapSettings })),
    setSnapSettings: (settings) => set(s => ({ snapSettings: { ...s.snapSettings, ...settings } })),

    // Audio EQ
    toggleAudioEQ: () => set(s => ({ showAudioEQ: !s.showAudioEQ })),

    // Background Render
    toggleBackgroundRender: () => set(s => ({ showBackgroundRender: !s.showBackgroundRender })),
    addBackgroundRenderJob: (job) => set(s => ({ backgroundRenderQueue: [...s.backgroundRenderQueue, job] })),

    // Auto-Color Match
    toggleAutoColorMatch: () => set(s => ({ showAutoColorMatch: !s.showAutoColorMatch })),
    updateClipColorCorrection: (clipId, correction) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      return {
        project: {
          ...s.project,
          sequences: s.project.sequences.map(sq => sq.id !== seq.id ? sq : {
            ...sq,
            tracks: sq.tracks.map(t => ({
              ...t,
              clips: t.clips.map(c => c.id === clipId ? { ...c, colorCorrection: correction } : c),
            })),
          }),
        },
        isDirty: true,
      };
    }),

    // EDL Export
    toggleEDLExport: () => set(s => ({ showEDLExport: !s.showEDLExport })),

    // Adjustment Layer
    addAdjustmentLayer: () => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const videoTrack = seq.tracks.find(t => t.type === 'video');
      if (!videoTrack) return s;
      const adjClip: Clip = {
        id: generateId('adj'), mediaId: null, trackId: videoTrack.id, type: 'video',
        startFrame: s.currentFrame, endFrame: s.currentFrame + 150, mediaInFrame: 0, mediaOutFrame: 150,
        name: 'Adjustment Layer', color: '#BF5AF2', speed: 1, reverse: false, opacity: 1, volume: 1, pan: 0,
        muted: false, transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, scaleLinked: true, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
        effects: [], transitionIn: null, transitionOut: null, keyframes: [], titleData: null, linkedClipId: null,
        speedRamp: null, masks: [], compoundClipId: null, noiseReduction: null, stabilization: null,
        isFreezeFrame: false, freezeFrameSource: 0,
        colorGrading: null, multicamClipId: null,
      };
      const newSeq = { ...seq, tracks: seq.tracks.map(t => t.id === videoTrack.id ? { ...t, clips: [...t.clips, adjClip] } : t) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),
    toggleAdjustmentLayerPanel: () => set(s => ({ showAdjustmentLayer: !s.showAdjustmentLayer })),

    // Clip Inspector
    toggleClipInspector: () => set(s => ({ showClipInspector: !s.showClipInspector })),

    // Clip Color Labels
    toggleClipColorLabels: () => set(s => ({ showClipColorLabels: !s.showClipColorLabels })),
    setClipColor: (clipId, color) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, color } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Copy/Paste Attributes
    copyClipAttributes: (clipId) => {
      const clip = get().getClipById(clipId);
      if (!clip) return;
      set({ copiedClipAttributes: { effects: [...clip.effects], colorGrade: { ...get().colorGrade }, transform: { ...clip.transform } } });
    },
    pasteClipAttributes: (targetClipId) => set(s => {
      if (!s.copiedClipAttributes) return s;
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const { effects, transform } = s.copiedClipAttributes;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === targetClipId ? { ...c, effects: [...effects], transform: { ...transform } } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Reverse Clip
    reverseClip: (clipId) => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, tracks: seq.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, reverse: !c.reverse } : c) })) };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),

    // Custom Shortcuts
    toggleShortcutsEditor: () => set(s => ({ showShortcutsEditor: !s.showShortcutsEditor })),

    // Timeline In/Out
    setInPoint: () => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, inPoint: s.currentFrame };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),
    setOutPoint: () => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, outPoint: s.currentFrame };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),
    clearInOutPoints: () => set(s => {
      const seq = s.project.sequences.find(sq => sq.id === s.project.activeSequenceId);
      if (!seq) return s;
      const newSeq = { ...seq, inPoint: null, outPoint: null };
      return { project: { ...s.project, sequences: s.project.sequences.map(sq => sq.id === seq.id ? newSeq : sq) }, isDirty: true };
    }),
  };
});

// Async native load on module init: use DEX's copy only when it is newer than
// the local one (a local write that failed for size) and nothing was edited yet.
(async () => {
  try {
    const raw = await (window as any).dex?.invoke?.('capability:storage:get', STORAGE_KEY);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const s = useVinxStore.getState();
      if (isProjectLike(parsed) && !s.isDirty && pickNewer(s.project as never, parsed as never) === parsed) {
        useVinxStore.setState({ project: { ...(parsed as unknown as VinxProject), panelLayout: s.project.panelLayout } });
      }
    }
    const layoutRaw = await (window as any).dex?.invoke?.('capability:storage:get', LAYOUT_KEY);
    if (layoutRaw) {
      const parsed = typeof layoutRaw === 'string' ? JSON.parse(layoutRaw) : layoutRaw;
      if (parsed && typeof parsed.mediaBrowserWidth === 'number') {
        const current = useVinxStore.getState().project;
        useVinxStore.setState({ project: { ...current, panelLayout: parsed } });
      }
    }
  } catch { /* IPC not available */ }
})();
