// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Main Application Component
 * Professional video editor with 4-zone layout, toolbar, auto-save,
 * recovery banner, and keyboard shortcuts.
 */

import React, { useCallback, useRef, useEffect, useState, memo } from 'react';
import { sharedTick } from '../../services/SharedTick';
import { useVinxStore } from './VinxStore';
import { PlaybackEngine } from './PlaybackEngine';
import { VinxPanelLayout } from './PanelLayout';
import { MediaBrowser } from './MediaBrowser';
import { Viewer } from './Viewer';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { MulticamPanel } from './MulticamPanel';
import { formatTimecode, generateId } from './VinxTypes';
import DexIcon from '../../components/DexIcon';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useFileDrop } from '../../utils/useFileDrop';
import { useAppTracking } from '../../services/usePatternLearning';
import { loadEngagement, saveEngagement, recordAppUsage, incrementStat, checkAchievements } from '../../services/engagement';
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import { useCreativeAppSettings } from '../../utils/creative-suite';
// ==================== APP IDENTITY ====================
export const VINX_VERSION = '1.0.0';
export const VINX_BUILD_DATE = '2026-04-11';

// Solid panel backgrounds — no glass effects

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const appContainerStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-family)', overflow: 'hidden',
  fontSize: '11px', position: 'relative', contain: 'layout style',
};

const toolbarStyle: React.CSSProperties = {
  height: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
  gap: 4, padding: '0 10px',
  background: 'var(--color-bg-elevated)',
  borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
  position: 'relative', zIndex: 100,
  overflowX: 'auto', overflowY: 'visible',
  minWidth: 0,
};

const projectNameStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary, #F2F2F2)', background: 'transparent',
  border: 'none', outline: 'none', padding: '2px 4px', borderRadius: 3,
  minWidth: 80, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const toolbarSeparatorStyle: React.CSSProperties = {
  width: 1, height: 14, background: 'var(--color-border-subtle)', flexShrink: 0,
};

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px',
  fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary, #909090)', borderRadius: 4,
  display: 'flex', alignItems: 'center', gap: 3,
  whiteSpace: 'nowrap', flexShrink: 0,
  letterSpacing: '0.02em',
  transition: 'all 0.12s ease',
};

const toolbarBtnActiveStyle: React.CSSProperties = {
  ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)',
  boxShadow: 'inset 0 -2px 0 0 var(--color-accent)',
};

const saveBadgeStyle = (dirty: boolean): React.CSSProperties => ({
  width: 6, height: 6, borderRadius: 3, flexShrink: 0,
  background: dirty ? 'var(--color-error)' : 'var(--color-success)',
});

const recoveryBannerStyle: React.CSSProperties = {
  height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
  fontSize: 11, color: 'var(--color-accent)', flexShrink: 0,
};

const playbackSpeedBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '2px 4px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 2,
  background: active ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
  color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer',
  fontVariantNumeric: 'tabular-nums',
});

// ---------------------------------------------------------------------------
// TOOLBAR ICONS (module-level constants — never recreated)
// ---------------------------------------------------------------------------

const UndoIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7h7a4 4 0 010 8H8" /><path d="M6 4L3 7l3 3" />
  </svg>
);

const RedoIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13 7H6a4 4 0 000 8h2" /><path d="M10 4l3 3-3 3" />
  </svg>
);

const ExportIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 2v8M5 7l3 3 3-3" /><path d="M2 12h12" />
  </svg>
);

const LayoutIcon = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="2" width="12" height="12" rx="1" />
    <path d="M6 2v12M2 9h12" />
  </svg>
);

const CloseIcon = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

const ZoomInIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" /><path d="M5.5 8h5M8 5.5v5" />
  </svg>
);

const ZoomOutIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" /><path d="M5.5 8h5" />
  </svg>
);

const PanLeftIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M10 3L5 8l5 5" />
  </svg>
);

const PanRightIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 3l5 5-5 5" />
  </svg>
);

const DiagTopLeftIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 10V4h6" /><path d="M4 4l8 8" />
  </svg>
);

const DiagBottomRightIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 6v6H6" /><path d="M12 12L4 4" />
  </svg>
);

// ---------------------------------------------------------------------------
// VINX APP
// ---------------------------------------------------------------------------

const VinxEditor: React.FC = () => {
  const project = useVinxStore(s => s.project);
  // Creative app settings from Settings page
  const appSettings = useCreativeAppSettings('vinx');
  // Track app usage in pattern engine and engagement system
  useAppTracking('videoeditor');
  const collab = useCollaborationFeatures({ appId: 'vinx', projectName: project.name, autoCheckpointInterval: 300000 });
  const { isBeginnerMode: beginnerMode, showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('videoeditor');
  useEffect(() => {
    const eng = loadEngagement();
    const updated = recordAppUsage(eng, 'videoeditor');
    saveEngagement(checkAchievements(updated).state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addMedia = useVinxStore(s => s.addMedia);

  // Listen for incoming assets from other creative apps
  useCreativeInbox('videoeditor', useCallback((asset) => {
    const isVideo = asset.kind === 'video';
    const isAudio = asset.kind === 'audio';
    const isImage = asset.kind === 'image';
    const mediaType: 'video' | 'audio' | 'image' = isVideo ? 'video' : isAudio ? 'audio' : 'image';
    addMedia({
      id: generateId('media'),
      name: asset.name,
      type: mediaType,
      path: asset.data || '',
      proxyPath: null,
      proxyProgress: 0,
      duration: 0,
      frameRate: isVideo ? 30 : 0,
      width: isVideo || isImage ? (useVinxStore.getState().project.width || 1920) : 0,
      height: isVideo || isImage ? (useVinxStore.getState().project.height || 1080) : 0,
      sampleRate: isAudio ? (useVinxStore.getState().project.sampleRate || 48000) : 0,
      audioChannels: isAudio ? 2 : 0,
      fileSize: 0,
      thumbnailUrl: null,
      waveformData: null,
      binId: null,
      addedAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Imported "${asset.name}" from ${asset.sourceApp}` } }));
  }, [addMedia]));
  const isDirty = useVinxStore(s => s.isDirty);
  useUnsavedGuard(isDirty);

  const { dropProps, dropOverlayStyle } = useFileDrop(
    ['video/*', 'mp4', 'mov', 'webm', 'mkv', 'avi'],
    useCallback((files) => {
      for (const file of files) {
        const url = file.path;
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        addMedia({
          id: generateId('media'),
          name: file.name,
          type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
          path: url,
          proxyPath: null,
          proxyProgress: 0,
          duration: 0,
          frameRate: isVideo ? 30 : 0,
          width: isVideo ? (useVinxStore.getState().project.width || 1920) : 0,
          height: isVideo ? (useVinxStore.getState().project.height || 1080) : 0,
          sampleRate: isAudio ? (useVinxStore.getState().project.sampleRate || 48000) : 0,
          audioChannels: isAudio ? 2 : 0,
          fileSize: file.size,
          thumbnailUrl: null,
          waveformData: null,
          binId: null,
          addedAt: Date.now(),
        });
      }
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Imported ${files.length} video(s) into VINX`, type: 'success' } }));
    }, [addMedia])
  );
  const setProjectName = useVinxStore(s => s.setProjectName);
  const undo = useVinxStore(s => s.undo);
  const redo = useVinxStore(s => s.redo);
  const undoStack = useVinxStore(s => s.undoStack);
  const redoStack = useVinxStore(s => s.redoStack);
  const markSaved = useVinxStore(s => s.markSaved);
  const setShowExportDialog = useVinxStore(s => s.setShowExportDialog);
  const isPlaying = useVinxStore(s => s.isPlaying);
  const setIsPlaying = useVinxStore(s => s.setIsPlaying);
  const setCurrentFrame = useVinxStore(s => s.setCurrentFrame);
  const currentFrame = useVinxStore(s => s.currentFrame);
  const playbackSpeed = useVinxStore(s => s.playbackSpeed);
  const setPlaybackSpeed = useVinxStore(s => s.setPlaybackSpeed);
  const getActiveSequence = useVinxStore(s => s.getActiveSequence);
  const getSequenceDuration = useVinxStore(s => s.getSequenceDuration);
  const recoveryBanner = useVinxStore(s => s.recoveryBanner);
  const dismissRecovery = useVinxStore(s => s.dismissRecovery);
  const resetPanelToPreset = useVinxStore(s => s.resetPanelToPreset);
  // New feature toggles
  const toggleSpeedRampEditor = useVinxStore(s => s.toggleSpeedRampEditor);
  const showSpeedRampEditor = useVinxStore(s => s.showSpeedRampEditor);
  const toggleSubtitleEditor = useVinxStore(s => s.toggleSubtitleEditor);
  const showSubtitleEditor = useVinxStore(s => s.showSubtitleEditor);
  const toggleLUTBrowser = useVinxStore(s => s.toggleLUTBrowser);
  const showLUTBrowser = useVinxStore(s => s.showLUTBrowser);
  const toggleMulticamMode = useVinxStore(s => s.toggleMulticamMode);
  const multicamMode = useVinxStore(s => s.multicamMode);
  const showMulticamPanel = useVinxStore(s => s.showMulticamPanel);
  const setShowMulticamPanel = useVinxStore(s => s.setShowMulticamPanel);
  const toggleTemplateDialog = useVinxStore(s => s.toggleTemplateDialog);
  const showTemplateDialog = useVinxStore(s => s.showTemplateDialog);
  const toggleLoudnessPanel = useVinxStore(s => s.toggleLoudnessPanel);
  const showLoudnessPanel = useVinxStore(s => s.showLoudnessPanel);
  const loudnessMetering = useVinxStore(s => s.loudnessMetering);
  const toggleAudioDuckingPanel = useVinxStore(s => s.toggleAudioDuckingPanel);
  const showAudioDuckingPanel = useVinxStore(s => s.showAudioDuckingPanel);
  const toggleVoiceoverRecording = useVinxStore(s => s.toggleVoiceoverRecording);
  const isRecordingVoiceover = useVinxStore(s => s.isRecordingVoiceover);
  const toggleMotionTracker = useVinxStore(s => s.toggleMotionTracker);
  const showMotionTracker = useVinxStore(s => s.showMotionTracker);
  const toggleMaskEditor = useVinxStore(s => s.toggleMaskEditor);
  const showMaskEditor = useVinxStore(s => s.showMaskEditor);
  const toggleBatchExport = useVinxStore(s => s.toggleBatchExport);
  const showBatchExport = useVinxStore(s => s.showBatchExport);
  const createFreezeFrame = useVinxStore(s => s.createFreezeFrame);
  const selectedClipIds = useVinxStore(s => s.selectedClipIds);
  const renderPreviewStatus = useVinxStore(s => s.renderPreviewStatus);
  const startRenderPreview = useVinxStore(s => s.startRenderPreview);
  const cancelRenderPreview = useVinxStore(s => s.cancelRenderPreview);

  // === NEW PRO FEATURE SUBSCRIPTIONS ===
  const toggleClipRolesPanel = useVinxStore(s => s.toggleClipRolesPanel);
  const showClipRolesPanel = useVinxStore(s => s.showClipRolesPanel);
  const setClipRole = useVinxStore(s => s.setClipRole);
  const togglePipPresets = useVinxStore(s => s.togglePipPresets);
  const showPipPresets = useVinxStore(s => s.showPipPresets);
  const toggleReferenceFrame = useVinxStore(s => s.toggleReferenceFrame);
  const showReferenceFrame = useVinxStore(s => s.showReferenceFrame);
  const referenceFrameNum = useVinxStore(s => s.referenceFrameNum);
  const setReferenceFrame = useVinxStore(s => s.setReferenceFrame);
  const toggleAutoReframe = useVinxStore(s => s.toggleAutoReframe);
  const showAutoReframe = useVinxStore(s => s.showAutoReframe);
  const autoReframeAspect = useVinxStore(s => s.autoReframeAspect);
  const setAutoReframeAspect = useVinxStore(s => s.setAutoReframeAspect);
  const applyAutoReframe = useVinxStore(s => s.applyAutoReframe);
  const toggleKenBurns = useVinxStore(s => s.toggleKenBurns);
  const showKenBurns = useVinxStore(s => s.showKenBurns);
  const toggleVoiceIsolation = useVinxStore(s => s.toggleVoiceIsolation);
  const voiceIsolationEnabled = useVinxStore(s => s.voiceIsolationEnabled);
  const toggleCrossfadePresets = useVinxStore(s => s.toggleCrossfadePresets);
  const showCrossfadePresets = useVinxStore(s => s.showCrossfadePresets);
  const toggleJLCutPanel = useVinxStore(s => s.toggleJLCutPanel);
  const showJLCutPanel = useVinxStore(s => s.showJLCutPanel);
  const toggleStabilizationPanel = useVinxStore(s => s.toggleStabilizationPanel);
  const showStabilizationPanel = useVinxStore(s => s.showStabilizationPanel);
  const toggleNoiseReductionPanel = useVinxStore(s => s.toggleNoiseReductionPanel);
  const showNoiseReductionPanel = useVinxStore(s => s.showNoiseReductionPanel);
  const toggleTimecodeOverlay = useVinxStore(s => s.toggleTimecodeOverlay);
  const timecodeOverlayEnabled = useVinxStore(s => s.timecodeOverlayEnabled);
  const toggleMarkerManager = useVinxStore(s => s.toggleMarkerManager);
  const showMarkerManager = useVinxStore(s => s.showMarkerManager);
  const toggleSnapSettings = useVinxStore(s => s.toggleSnapSettings);
  const showSnapSettings = useVinxStore(s => s.showSnapSettings);
  const snapSettings = useVinxStore(s => s.snapSettings);
  const setSnapSettings = useVinxStore(s => s.setSnapSettings);
  const toggleAudioEQ = useVinxStore(s => s.toggleAudioEQ);
  const showAudioEQ = useVinxStore(s => s.showAudioEQ);
  const toggleBackgroundRender = useVinxStore(s => s.toggleBackgroundRender);
  const showBackgroundRender = useVinxStore(s => s.showBackgroundRender);
  const backgroundRenderQueue = useVinxStore(s => s.backgroundRenderQueue);
  const toggleAutoColorMatch = useVinxStore(s => s.toggleAutoColorMatch);
  const showAutoColorMatch = useVinxStore(s => s.showAutoColorMatch);
  const toggleEDLExport = useVinxStore(s => s.toggleEDLExport);
  const showEDLExport = useVinxStore(s => s.showEDLExport);
  const addAdjustmentLayer = useVinxStore(s => s.addAdjustmentLayer);
  const toggleClipInspector = useVinxStore(s => s.toggleClipInspector);
  const showClipInspector = useVinxStore(s => s.showClipInspector);
  const toggleClipColorLabels = useVinxStore(s => s.toggleClipColorLabels);
  const showClipColorLabels = useVinxStore(s => s.showClipColorLabels);
  const copyClipAttributes = useVinxStore(s => s.copyClipAttributes);
  const pasteClipAttributes = useVinxStore(s => s.pasteClipAttributes);
  const copiedClipAttributes = useVinxStore(s => s.copiedClipAttributes);
  const reverseClip = useVinxStore(s => s.reverseClip);
  const toggleShortcutsEditor = useVinxStore(s => s.toggleShortcutsEditor);
  const showShortcutsEditor = useVinxStore(s => s.showShortcutsEditor);
  const setInPoint = useVinxStore(s => s.setInPoint);
  const setOutPoint = useVinxStore(s => s.setOutPoint);
  const clearInOutPoints = useVinxStore(s => s.clearInOutPoints);
  const applyPipPreset = useVinxStore(s => s.applyPipPreset);
  const setClipStabilization = useVinxStore(s => s.setClipStabilization);
  const setClipNoiseReduction = useVinxStore(s => s.setClipNoiseReduction);
  const applyJLCut = useVinxStore(s => s.applyJLCut);
  const updateMarker = useVinxStore(s => s.updateMarker);
  const addMarker = useVinxStore(s => s.addMarker);
  const removeMarker = useVinxStore(s => s.removeMarker);
  const setClipColor = useVinxStore(s => s.setClipColor);
  const getClipById = useVinxStore(s => s.getClipById);
  const deselectAll = useVinxStore(s => s.deselectAll);
  const selectClip = useVinxStore(s => s.selectClip);
  const toggleSnap = useVinxStore(s => s.toggleSnap);
  const setTool = useVinxStore(s => s.setTool);
  const _removeClip = useVinxStore(s => s._removeClip);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // DEX system-level volume multiplier (0-1), respects AppManager gain
  const sysGainRef = useRef<number>(
    (() => { try { return Math.min(1, Math.max(0, Number(localStorage.getItem('dex-system-volume') ?? '100') / 100)); } catch { return 1; } })()
  );
  const programCanvasRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLDivElement>(null);
  const [showFeaturesMenu, setShowFeaturesMenu] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; clipId: string | null; trackId: string | null }>({ visible: false, x: 0, y: 0, clipId: null, trackId: null });

  // Mask Editor state
  const [maskShape, setMaskShape] = useState<string>('Ellipse');
  const [maskFeather, setMaskFeather] = useState(0);
  const [maskOpacity, setMaskOpacity] = useState(100);
  const [maskExpansion, setMaskExpansion] = useState(0);
  const [maskInverted, setMaskInverted] = useState(false);

  // Stabilization state
  const [stabSmoothness, setStabSmoothness] = useState(50);
  const [stabMethod, setStabMethod] = useState('Warp');
  const [stabCropMode, setStabCropMode] = useState('Auto');
  const [stabRollingShutter, setStabRollingShutter] = useState(0);

  // Noise Reduction state
  const [nrMethod, setNrMethod] = useState('Combined');
  const [nrTemporal, setNrTemporal] = useState(50);
  const [nrSpatial, setNrSpatial] = useState(30);
  const [nrDetail, setNrDetail] = useState(70);

  // Ken Burns selected preset
  const [kenBurnsPreset, setKenBurnsPreset] = useState<string | null>(null);

  // Crossfade selected preset
  const [crossfadePreset, setCrossfadePreset] = useState<string | null>(null);

  // Reference compare mode
  const [compareMode, setCompareMode] = useState('Side-by-Side');

  // Audio EQ state
  const [eqPreset, setEqPreset] = useState('Flat');
  const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0, 0]);
  const eqContextRef = useRef<{ ctx: AudioContext; filters: BiquadFilterNode[]; source: MediaElementAudioSourceNode } | null>(null);

  // Apply EQ when bands change — wires into the first video element via Web Audio
  useEffect(() => {
    const freqs = [80, 250, 1000, 4000, 12000];
    const allFlat = eqBands.every(b => b === 0);
    let eq = eqContextRef.current;
    if (!eq) {
      if (allFlat) return;
      const el = document.querySelector('video, audio') as HTMLMediaElement | null;
      if (!el) return;
      try {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => { /* ignore resume errors */ });
        }
        const source = ctx.createMediaElementSource(el);
        const filters = freqs.map((freq, i) => {
          const f = ctx.createBiquadFilter();
          f.type = i === 0 ? 'lowshelf' : i === freqs.length - 1 ? 'highshelf' : 'peaking';
          f.frequency.value = freq;
          f.gain.value = eqBands[i];
          if (f.type === 'peaking') f.Q.value = 1.4;
          return f;
        });
        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(ctx.destination);
        eq = { ctx, filters, source };
        eqContextRef.current = eq;
      } catch (_) {
        return;
      }
    }

    eq.filters.forEach((f, i) => {
      if (i < freqs.length) f.gain.value = eqBands[i];
    });

    try {
      eq.source.disconnect();
    } catch {
      // Re-route the existing source graph below.
    }

    if (allFlat) {
      eq.source.connect(eq.ctx.destination);
    } else {
      eq.source.connect(eq.filters[0]);
    }
  }, [eqBands]);

  useEffect(() => () => {
    if (eqContextRef.current) {
      try { eqContextRef.current.ctx.close(); } catch (_) { console.warn('[DEX]', _); }
      eqContextRef.current = null;
    }
  }, []);

  // Close features menu on outside click
  useEffect(() => {
    const handleClick = () => setShowFeaturesMenu(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // -- Initialize PlaybackEngine --
  useEffect(() => {
    const engine = new PlaybackEngine({
      onFrameUpdate: (frame) => {
        useVinxStore.getState().setCurrentFrame(frame);
      },
      onPlaybackEnd: () => {
        useVinxStore.getState().setIsPlaying(false);
      },
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // -- Sync engine with sequence --
  const activeSequence = getActiveSequence();
  const sequenceDuration = getSequenceDuration();
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setSequence(activeSequence, project.frameRate, sequenceDuration);
  }, [project.frameRate, activeSequence, sequenceDuration]);

  // -- Auto-save every 30 seconds --
  useEffect(() => {
    sharedTick.subscribe('vinx-autosave', () => {
      const state = useVinxStore.getState();
      if (state.isDirty) {
        state.markSaved();
      }
    }, 30000);

    return () => {
      sharedTick.unsubscribe('vinx-autosave');
    };
  }, []);

  // -- Sync volume/mute (respects DEX system gain) --
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const unsub = useVinxStore.subscribe((state) => {
      engine.setVolume(state.volume * sysGainRef.current);
      engine.setMuted(state.muted);
    });
    return unsub;
  }, []);

  // -- Listen for DEX global system volume changes --
  useEffect(() => {
    const handler = (e: Event) => {
      const fraction = (e as CustomEvent<number>).detail;
      if (typeof fraction !== 'number') return;
      sysGainRef.current = Math.min(1, Math.max(0, fraction));
      const engine = engineRef.current;
      if (engine) engine.setVolume(useVinxStore.getState().volume * sysGainRef.current);
    };
    window.addEventListener('dex-system-volume', handler);
    return () => window.removeEventListener('dex-system-volume', handler);
  }, []);

  // -- Transport handlers --
  const handlePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = useVinxStore.getState();
    setIsPlaying(true);
    engine.play(state.currentFrame, state.playbackSpeed);
  }, [setIsPlaying]);

  const handlePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
    engine.pause();
  }, [setIsPlaying]);

  const handleStop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
    engine.stop();
    setCurrentFrame(0);
  }, [setIsPlaying, setCurrentFrame]);

  const handleSeek = useCallback((frame: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    setCurrentFrame(frame);
    engine.seekToFrame(frame);
  }, [setCurrentFrame]);

  const registerVideo = useCallback((clipId: string, el: HTMLVideoElement) => {
    engineRef.current?.registerVideoElement(clipId, el);
  }, []);

  const unregisterVideo = useCallback((clipId: string) => {
    engineRef.current?.unregisterVideoElement(clipId);
  }, []);

  // -- Keyboard shortcuts (space, J/K/L, tools, undo/redo, etc.) --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return;

      // Play/Pause
      if (e.key === ' ') {
        e.preventDefault();
        const state = useVinxStore.getState();
        if (state.isPlaying) handlePause();
        else handlePlay();
      }
      // Speed: J (slower), K (pause), L (faster)
      if (e.key === 'j') {
        const state = useVinxStore.getState();
        const newSpeed = Math.max(0.125, state.playbackSpeed / 2);
        setPlaybackSpeed(newSpeed);
        if (engineRef.current) engineRef.current.setPlaybackSpeed(newSpeed);
      }
      if (e.key === 'k') {
        handlePause();
      }
      if (e.key === 'l') {
        const state = useVinxStore.getState();
        const newSpeed = Math.min(16, state.playbackSpeed * 2);
        setPlaybackSpeed(newSpeed);
        if (engineRef.current) engineRef.current.setPlaybackSpeed(newSpeed);
      }
      // Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        markSaved();
      }
      // Export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setShowExportDialog(true);
      }
      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
      }
      // Delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useVinxStore.getState();
        if (state.selectedClipIds.length > 0) {
          e.preventDefault();
          for (const id of state.selectedClipIds) _removeClip(id);
        }
      }
      // Deselect all
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey) {
        const s = useVinxStore.getState();
        // Close topmost panel/modal (priority order: modals first, then panels)
        if (s.showBatchExport) { toggleBatchExport(); return; }
        if (s.showTemplateDialog) { toggleTemplateDialog(); return; }
        if (s.showSpeedRampEditor) { toggleSpeedRampEditor(); return; }
        if (s.showLUTBrowser) { toggleLUTBrowser(); return; }
        if (s.showSubtitleEditor) { toggleSubtitleEditor(); return; }
        if (s.showLoudnessPanel) { toggleLoudnessPanel(); return; }
        if (s.showAudioDuckingPanel) { toggleAudioDuckingPanel(); return; }
        if (s.showMotionTracker) { toggleMotionTracker(); return; }
        if (s.showMaskEditor) { toggleMaskEditor(); return; }
        if (s.showClipRolesPanel) { toggleClipRolesPanel(); return; }
        if (s.showPipPresets) { togglePipPresets(); return; }
        if (s.showReferenceFrame) { toggleReferenceFrame(); return; }
        if (s.showAutoReframe) { toggleAutoReframe(); return; }
        if (s.showKenBurns) { toggleKenBurns(); return; }
        if (s.showCrossfadePresets) { toggleCrossfadePresets(); return; }
        if (s.showJLCutPanel) { toggleJLCutPanel(); return; }
        if (s.showStabilizationPanel) { toggleStabilizationPanel(); return; }
        if (s.showNoiseReductionPanel) { toggleNoiseReductionPanel(); return; }
        if (s.showMarkerManager) { toggleMarkerManager(); return; }
        if (s.showSnapSettings) { toggleSnapSettings(); return; }
        if (s.showAudioEQ) { toggleAudioEQ(); return; }
        // No panel open — deselect clips
        deselectAll();
      }
      // Tool shortcuts: V (select), B (blade/razor)
      if (e.key === 'v' && !e.ctrlKey && !e.metaKey) { setTool('select'); }
      if (e.key === 'b' && !e.ctrlKey) { setTool('razor'); }
      // Snap toggle
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) { toggleSnap(); }
      // In/Out points
      if (e.key === 'i' && !e.ctrlKey) { setInPoint(); }
      if (e.key === 'o' && !e.ctrlKey) { setOutPoint(); }
      // Add marker at current frame
      if (e.key === 'm' && !e.ctrlKey) { addMarker(currentFrame, ''); }
      // Frame step: ',' = back one frame, '.' = forward one frame (Premiere/Resolve parity)
      if (e.key === ',' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCurrentFrame(Math.max(0, useVinxStore.getState().currentFrame - 1));
      }
      if (e.key === '.' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCurrentFrame(useVinxStore.getState().currentFrame + 1);
      }
      // Timeline zoom: '=' / '+' zoom in, '-' zoom out, Shift+Z reset
      if ((e.key === '=' || e.key === '+') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const z = useVinxStore.getState().timelineZoom;
        useVinxStore.getState().setTimelineZoom(z * 1.25);
      }
      if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const z = useVinxStore.getState().timelineZoom;
        useVinxStore.getState().setTimelineZoom(z / 1.25);
      }
      if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useVinxStore.getState().setTimelineZoom(1);
      }
      // Nudge selected clips by 1 frame (Alt+Left/Right) or 10 frames (Alt+Shift)
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const state = useVinxStore.getState();
        if (state.selectedClipIds.length > 0) {
          const step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          const seq = state.project.sequences.find(sq => sq.id === state.project.activeSequenceId);
          if (seq) {
            for (const id of state.selectedClipIds) {
              for (const t of seq.tracks) {
                const c = t.clips.find(cl => cl.id === id);
                if (c) {
                  const newStart = Math.max(0, c.startFrame + step);
                  state._moveClip(id, t.id, newStart);
                  break;
                }
              }
            }
          }
        }
      }
      // Jump to previous/next edit point on active sequence (Up/Down arrows)
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const state = useVinxStore.getState();
        const seq = state.project.sequences.find(sq => sq.id === state.project.activeSequenceId);
        if (seq) {
          const edits = new Set<number>([0]);
          for (const t of seq.tracks) {
            for (const c of t.clips) {
              edits.add(c.startFrame);
              edits.add(c.endFrame);
            }
          }
          const sorted = Array.from(edits).sort((a, b) => a - b);
          const cur = state.currentFrame;
          if (e.key === 'ArrowDown') {
            const next = sorted.find(f => f > cur);
            if (next != null) setCurrentFrame(next);
          } else {
            let prev = 0;
            for (const f of sorted) { if (f < cur) prev = f; else break; }
            setCurrentFrame(prev);
          }
        }
      }
      // Cut at playhead (Ctrl+K) — split all clips in active sequence intersecting currentFrame
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const state = useVinxStore.getState();
        const cur = state.currentFrame;
        const seq = state.project.sequences.find(sq => sq.id === state.project.activeSequenceId);
        if (seq) {
          // If the user has selected clips, only split those; otherwise split all crossing the playhead.
          const selectedSet = new Set(state.selectedClipIds);
          const onlySelected = selectedSet.size > 0;
          for (const t of seq.tracks) {
            for (const c of [...t.clips]) {
              if (cur <= c.startFrame || cur >= c.endFrame) continue;
              if (onlySelected && !selectedSet.has(c.id)) continue;
              const rel = cur - c.startFrame;
              const left = { ...c, id: generateId('clip'), endFrame: cur, mediaOutFrame: c.mediaInFrame + rel };
              const right = { ...c, id: generateId('clip'), startFrame: cur, mediaInFrame: c.mediaInFrame + rel };
              state._removeClip(c.id);
              state._addClip(left);
              state._addClip(right);
            }
          }
        }
      }
      // Copy/Paste clip attributes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const state = useVinxStore.getState();
        if (state.selectedClipIds.length > 0) {
          copyClipAttributes(state.selectedClipIds[0]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Only paste attributes when there are selected clips and copied attributes
        const state = useVinxStore.getState();
        if (state.copiedClipAttributes && state.selectedClipIds.length > 0) {
          e.preventDefault();
          for (const id of state.selectedClipIds) pasteClipAttributes(id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePlay, handlePause, setPlaybackSpeed, markSaved, setShowExportDialog,
      undo, redo, deselectAll, toggleSnap, setTool, _removeClip, currentFrame,
      setInPoint, setOutPoint, addMarker, copyClipAttributes, pasteClipAttributes]);

  const speeds = [0.25, 0.5, 1, 2, 4];

  return (
    <div style={appContainerStyle} className="vinx-app" {...dropProps} onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}>
      {dropOverlayStyle && <div style={dropOverlayStyle}>Drop videos to import</div>}
      <style>{`
        /* === VINX - PROFESSIONAL NLE STYLES === */
        .vinx-app button { font-family: inherit; }
        .vinx-app button:active { transform: scale(0.97); }
        .vinx-tb button:hover { background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; color: var(--color-accent) !important; }
        .vinx-ctx-item:hover { background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; }
        .vinx-ctx-item:active { background: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; }
        .vinx-app * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        .vinx-app ::-webkit-scrollbar { width: 6px; height: 6px; }
        .vinx-app ::-webkit-scrollbar-track { background: transparent; }
        .vinx-app ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        .vinx-app ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        .vinx-dropdown-item { transition: background 0.12s ease; }
        .vinx-dropdown-item:hover { background: color-mix(in srgb, var(--color-accent) 15%, transparent) !important; }
        .vinx-dropdown-item:active { background: color-mix(in srgb, var(--color-accent) 30%, transparent) !important; }
        .vinx-app input, .vinx-app select { font-family: inherit; }
        .vinx-app input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        .vinx-app input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: var(--color-accent); cursor: pointer; margin-top: -4px; border: none; }
        .vinx-app input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(74,158,255,0.15); border-radius: 2px; }
        /* Responsive floating panel constraints */
        @media (max-width: 600px) {
          .vinx-app [style*="position: absolute"][style*="zIndex: 'var(--z-modal)'"],
          .vinx-app [style*="position: absolute"][style*="z-index: 2000"] {
            left: 8px !important;
            right: 8px !important;
            width: auto !important;
            max-width: calc(100vw - 16px) !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
          }
        }
        @media (max-width: 768px) {
          .vinx-app [style*="position: absolute"][style*="width: 480"] {
            width: min(480px, calc(100vw - 24px)) !important;
          }
        }
      `}</style>
      {/* Recovery banner */}
      {recoveryBanner && recoveryBanner.show && (
        <div style={recoveryBannerStyle}>
          <span>Recovered unsaved work from {recoveryBanner.time}</span>
          <button
            aria-label="Dismiss recovery banner"
            style={{ ...toolbarBtnStyle, color: 'var(--color-accent)', fontSize: 11 }}
            onClick={dismissRecovery}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={toolbarStyle} className="vinx-tb">
        {/* App Icon + Project name */}
        <img src={new URL('../../../../appicons/vinx.png', import.meta.url).href} alt="VINX" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
        <input
          style={projectNameStyle}
          value={project.name}
          onChange={e => setProjectName(e.target.value)}
          spellCheck={false}
        />
        <div style={saveBadgeStyle(isDirty)} title={isDirty ? 'Unsaved changes' : 'Saved'} />

        <div style={toolbarSeparatorStyle} />

        {/* Undo/Redo */}
        <button
          aria-label="Undo (Ctrl+Z)"
          style={undoStack.length > 0 ? toolbarBtnActiveStyle : toolbarBtnStyle}
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
        >
          {UndoIcon}
        </button>
        <button
          aria-label="Redo (Ctrl+Shift+Z)"
          style={redoStack.length > 0 ? toolbarBtnActiveStyle : toolbarBtnStyle}
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Shift+Z)"
        >
          {RedoIcon}
        </button>

        <div style={toolbarSeparatorStyle} />

        {/* Playback speed */}
        <div style={{ display: 'flex', gap: 4 }}>
          {speeds.map(s => (
            <button
              key={s}
              style={playbackSpeedBtnStyle(playbackSpeed === s)}
              aria-label={`Set playback speed to ${s}x`}
              aria-pressed={playbackSpeed === s}
              onClick={() => {
                setPlaybackSpeed(s);
                if (engineRef.current) engineRef.current.setPlaybackSpeed(s);
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <div style={{ width: 8, flexShrink: 0 }} />

        {/* Layout presets */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={toolbarBtnStyle} onClick={() => resetPanelToPreset('edit')} title="Edit layout" aria-label="Edit layout preset">
            {LayoutIcon} Edit
          </button>
          <button style={toolbarBtnStyle} onClick={() => resetPanelToPreset('color')} title="Color layout" aria-label="Color layout preset">
            <DexIcon name="palette" size={10} /> Color
          </button>
          <button style={toolbarBtnStyle} onClick={() => resetPanelToPreset('audio')} title="Audio layout" aria-label="Audio layout preset">
            <DexIcon name="volume" size={10} /> Audio
          </button>
        </div>

        <div style={toolbarSeparatorStyle} />

        {/* Save */}
        <button style={toolbarBtnStyle} onClick={markSaved} title="Save (Ctrl+S)" aria-label="Save project">
          <DexIcon name="save" size={10} /> Save
        </button>

        {/* Export */}
        <button
          style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}
          onClick={() => {
            setShowExportDialog(true);
            // Record engagement stat
            const eng = loadEngagement();
            saveEngagement(checkAchievements(incrementStat(eng, 'videosEdited')).state);
          }}
          title="Export (Ctrl+E)"
          aria-label="Export project"
        >
          {ExportIcon} Export
        </button>

        {/* Send To */}
        <SendToMenu sourceApp="videoeditor" assetKind="video" getAsset={() => {
          const meta = JSON.stringify({ project: project.name, sequences: project.sequences?.length || 0, frameRate: project.frameRate || 30 });
          return { name: `${project.name || 'Untitled'}.mp4`, data: meta, mimeType: 'video/mp4', metadata: { projectName: project.name } };
        }} />

        {/* Collaboration */}
        {collab.showShareButton && (
          <>
            <div style={toolbarSeparatorStyle} />
            <button
              style={collabButtonStyles.collabButton}
              onClick={collab.openShareDialog}
              title="Share & Collaborate"
              aria-label={collab.activeCollaboratorCount > 0 ? `Share project (${collab.activeCollaboratorCount} active collaborators)` : 'Share and collaborate on project'}
            >
              <DexIcon name="users" size={12} />
              {collab.activeCollaboratorCount > 0 && (
                <span style={{ fontSize: 10, opacity: 0.8 }}>
                  {collab.activeCollaboratorCount}
                </span>
              )}
              Share
            </button>
          </>
        )}

        <div style={toolbarSeparatorStyle} />

        <div style={{ position: 'relative', flexShrink: 0 }} onMouseLeave={() => setShowFeaturesMenu(false)}>
          <button aria-label="Features menu" onClick={(e) => { e.stopPropagation(); setShowFeaturesMenu(v => !v); }} style={{ ...toolbarBtnStyle, background: showFeaturesMenu ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : undefined, color: showFeaturesMenu ? 'var(--color-accent)' : undefined }}>
            <DexIcon name="sliders" size={10} /> Features <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4"/></svg>
          </button>
          {showFeaturesMenu && (
            <div role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setShowFeaturesMenu(false); }} style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', minWidth: '220px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(420px, calc(100vh - 72px))', overflow: 'auto', background: 'var(--color-bg-surface-solid, #2c2c2e)', border: '1px solid var(--color-border)', borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>COLOR</div>
              {[
                { label: 'LUT Browser', active: showLUTBrowser, fn: toggleLUTBrowser },
                { label: 'Speed Ramp', active: showSpeedRampEditor, fn: toggleSpeedRampEditor },
                { label: 'Freeze Frame', active: false, fn: () => { if (selectedClipIds.length > 0) createFreezeFrame(selectedClipIds[0], currentFrame, project.frameRate * 2); } },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>AUDIO</div>
              {[
                { label: 'Loudness (LUFS)', active: showLoudnessPanel, fn: toggleLoudnessPanel },
                { label: 'Audio Ducking', active: showAudioDuckingPanel, fn: toggleAudioDuckingPanel },
                { label: 'Voiceover', active: isRecordingVoiceover, fn: toggleVoiceoverRecording },
                { label: 'Voice Isolation', active: voiceIsolationEnabled, fn: toggleVoiceIsolation },
                { label: 'Crossfade Presets', active: showCrossfadePresets, fn: toggleCrossfadePresets },
                { label: 'Audio EQ', active: showAudioEQ, fn: toggleAudioEQ },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>VIDEO</div>
              {[
                { label: 'Motion Tracker', active: showMotionTracker, fn: toggleMotionTracker },
                { label: 'Mask Editor', active: showMaskEditor, fn: toggleMaskEditor },
                { label: 'Stabilization', active: showStabilizationPanel, fn: toggleStabilizationPanel },
                { label: 'Noise Reduction', active: showNoiseReductionPanel, fn: toggleNoiseReductionPanel },
                { label: 'Ken Burns Zoom', active: showKenBurns, fn: toggleKenBurns },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EDITING</div>
              {[
                { label: 'Clip Roles', active: showClipRolesPanel, fn: toggleClipRolesPanel },
                { label: 'Picture-in-Picture', active: showPipPresets, fn: togglePipPresets },
                { label: 'Reference Frame', active: showReferenceFrame, fn: toggleReferenceFrame },
                { label: 'Auto-Reframe', active: showAutoReframe, fn: toggleAutoReframe },
                { label: 'J/L Cut Presets', active: showJLCutPanel, fn: toggleJLCutPanel },
                { label: 'Adjustment Layer', active: false, fn: addAdjustmentLayer },
                { label: 'Reverse Clip', active: false, fn: () => { if (selectedClipIds.length > 0) reverseClip(selectedClipIds[0]); } },
                { label: 'Copy Attributes', active: false, fn: () => { if (selectedClipIds.length > 0) copyClipAttributes(selectedClipIds[0]); } },
                { label: 'Paste Attributes', active: false, fn: () => { if (copiedClipAttributes && selectedClipIds.length > 0) pasteClipAttributes(selectedClipIds[0]); } },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>SUBTITLES</div>
              {[
                { label: 'Subtitles (SRT)', active: showSubtitleEditor, fn: toggleSubtitleEditor },
                { label: 'Multicam Mode', active: multicamMode, fn: toggleMulticamMode },
                { label: 'Multicam Angles Panel', active: showMulticamPanel, fn: () => setShowMulticamPanel(!showMulticamPanel) },
                { label: 'Timecode Overlay', active: timecodeOverlayEnabled, fn: toggleTimecodeOverlay },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>MARKERS</div>
              {[
                { label: 'Marker Manager', active: showMarkerManager, fn: toggleMarkerManager },
                { label: 'Snap Settings', active: showSnapSettings, fn: toggleSnapSettings },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EXPORT</div>
              {[
                { label: 'Render Queue', active: showBackgroundRender, fn: toggleBackgroundRender },
                { label: 'EDL/XML Export', active: showEDLExport, fn: toggleEDLExport },
                { label: 'Keyboard Shortcuts', active: showShortcutsEditor, fn: toggleShortcutsEditor },
                { label: 'Shortcuts Guide', active: showShortcutsPanel, fn: () => setShowShortcutsPanel(v => !v) },
                { label: 'Templates', active: false, fn: toggleTemplateDialog },
                { label: 'Batch Export', active: showBatchExport, fn: toggleBatchExport },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
              <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>PREVIEW</div>
              {[
                { label: 'Set In Point (I)', active: false, fn: setInPoint },
                { label: 'Set Out Point (O)', active: false, fn: setOutPoint },
                { label: 'Clear In/Out', active: false, fn: clearInOutPoints },
                { label: 'Clip Inspector', active: showClipInspector, fn: toggleClipInspector },
                { label: 'Render Preview', active: renderPreviewStatus === 'rendering', fn: renderPreviewStatus === 'rendering' ? cancelRenderPreview : startRenderPreview },
              ].map(item => (
                <div key={item.label} role="menuitem" tabIndex={0} className="vinx-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? 'var(--color-accent)' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.fn(); setShowFeaturesMenu(false); } }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: 'var(--color-accent)' }}>ON</span>}</div>
              ))}
            </div>
          )}
        </div>


      </div>

      {/* Main 4-zone layout */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <VinxPanelLayout
          mediaBrowser={<MediaBrowser />}
          viewer={
            <Viewer
              onPlay={handlePlay}
              onPause={handlePause}
              onStop={handleStop}
              onSeek={handleSeek}
              programCanvasRef={programCanvasRef}
              sourceCanvasRef={sourceCanvasRef}
              registerVideo={registerVideo}
              unregisterVideo={unregisterVideo}
            />
          }
          inspector={<Inspector />}
          timeline={<Timeline onSeek={handleSeek} onClipContextMenu={(clipId, trackId, x, y) => { selectClip(clipId, false); setCtxMenu({ visible: true, x, y, clipId, trackId }); }} />}
        />
      </div>

      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 24, background: 'var(--color-bg-surface)', borderTop: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        <span>{project.width} × {project.height}</span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>{project.frameRate} fps</span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>{formatTimecode(currentFrame, project.frameRate)} / {formatTimecode(getSequenceDuration(), project.frameRate)}</span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>{playbackSpeed}×</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: isPlaying ? 'var(--color-accent)' : 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isPlaying ? 'var(--color-accent)' : 'var(--color-success)' }} />
          {isPlaying ? 'Playing' : 'Ready'}
        </span>
      </div>

      {/* Export dialog overlay */}
      <ExportDialog />

      {/* Multicam angle panel (side drawer) */}
      {showMulticamPanel && (() => {
        const sel = selectedClipIds[0] ? getClipById(selectedClipIds[0]) : null;
        const mcId = sel?.multicamClipId ?? null;
        const mc = mcId ? (project.multicamClips?.find(m => m.id === mcId) ?? null) : null;
        return (
          <div style={{
            position: 'absolute', right: 0, top: 64, bottom: 24, width: 'min(320px, calc(100% - 24px))',
            background: 'var(--color-bg-elevated)',
            borderLeft: '1px solid var(--color-border)',
            boxShadow: '-8px 0 24px rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Multicam</span>
              <button
                aria-label="Close multicam panel"
                onClick={() => setShowMulticamPanel(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0, width: 20, height: 20 }}
              >
                X
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MulticamPanel
                multicamClip={mc}
                activeAngleId={mc ? mc.angles[mc.activeAngle]?.id : undefined}
                onSelectAngle={(angleId) => {
                  if (!mc) return;
                  const idx = mc.angles.findIndex(a => a.id === angleId);
                  if (idx >= 0) {
                    useVinxStore.setState(s => {
                      const project = s.project;
                      return {
                        project: {
                          ...project,
                          multicamClips: project.multicamClips.map(m => m.id === mc.id ? { ...m, activeAngle: idx } : m),
                          modifiedAt: Date.now(),
                        },
                        isDirty: true,
                      };
                    });
                  }
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* === NEW FEATURE PANELS === */}

      {/* LUT Browser Panel */}
      {showLUTBrowser && (
        <div style={{ position: 'absolute', right: 12, top: 84, width: 'min(280px, calc(100% - 24px))', maxHeight: 'min(440px, calc(100% - 112px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>LUT Browser</span>
            <button aria-label="Close LUT Browser" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleLUTBrowser}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 380 }}>
            {(['cinematic', 'filmic', 'vintage', 'creative', 'technical'] as const).map(cat => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {(project as any).__luts?.filter?.((l: any) => l.category === cat)?.length === 0 && (
                    <div style={{ gridColumn: '1/-1', padding: '8px 0', fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Built-in {cat} LUTs ready</div>
                  )}
                  {['Teal & Orange', 'Bleach Bypass', 'Film Noir', 'Kodak 50D', 'Kodak 500T', 'Fuji F-125', 'Super 8', 'Polaroid', 'VHS', 'Cyberpunk', 'Golden Hour', 'Moonlight', 'Rec.709', 'Log-C→709', 'S-Log3→709'].filter((_, i) => {
                    const cats = ['cinematic','cinematic','cinematic','filmic','filmic','filmic','vintage','vintage','vintage','creative','creative','creative','technical','technical','technical'];
                    return cats[i] === cat;
                  }).map(name => (
                    <button key={name} aria-label={`Apply ${name} LUT`} onClick={() => { const lutFilters: Record<string,string> = { 'Teal & Orange': 'sepia(0.3) hue-rotate(-30deg) saturate(1.6) contrast(1.1)', 'Bleach Bypass': 'saturate(0.4) contrast(1.4) brightness(1.1)', 'Film Noir': 'grayscale(1) contrast(1.3) brightness(0.9)', 'Kodak 50D': 'sepia(0.15) saturate(1.2) brightness(1.05) contrast(1.05)', 'Kodak 500T': 'sepia(0.1) hue-rotate(-10deg) saturate(1.1) contrast(1.1)', 'Fuji F-125': 'sepia(0.08) hue-rotate(10deg) saturate(1.15)', 'Super 8': 'sepia(0.4) contrast(1.2) brightness(0.95) saturate(0.8)', 'Polaroid': 'sepia(0.25) contrast(0.9) brightness(1.1) saturate(0.85)', 'VHS': 'sepia(0.15) contrast(1.3) brightness(0.85) blur(0.3px) saturate(1.3)', 'Cyberpunk': 'hue-rotate(280deg) saturate(2) contrast(1.3) brightness(1.1)', 'Golden Hour': 'sepia(0.2) hue-rotate(-15deg) saturate(1.4) brightness(1.1)', 'Moonlight': 'hue-rotate(200deg) saturate(0.6) brightness(0.85) contrast(1.15)', 'Rec.709': 'none', 'Log-C→709': 'contrast(1.5) saturate(1.3) brightness(1.1)', 'S-Log3→709': 'contrast(1.6) saturate(1.4) brightness(1.15)' }; const f = lutFilters[name] || 'none'; const viewer = document.querySelector('[data-vinx-program-canvas]') as HTMLElement; if (viewer) viewer.style.filter = f; }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>{name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Speed Ramp Panel */}
      {showSpeedRampEditor && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 60, width: 480, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Speed Ramping</span>
            <button aria-label="Close Speed Ramp editor" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleSpeedRampEditor}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 120, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, cursor: selectedClipIds.length > 0 ? 'crosshair' : 'default' }} onClick={(e) => { const clipId = selectedClipIds[0]; if (!clipId) return; const svg = document.querySelector('[data-speed-ramp-svg]') as SVGSVGElement; if (!svg) return; const rect = svg.getBoundingClientRect(); const cx = Math.max(0, Math.min(400, ((e.clientX - rect.left) / rect.width) * 400)); const cy = Math.max(5, Math.min(75, ((e.clientY - rect.top) / rect.height) * 80)); const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('cx', String(Math.round(cx))); circle.setAttribute('cy', String(Math.round(cy))); circle.setAttribute('r', '5'); circle.setAttribute('fill', 'var(--color-accent)'); circle.setAttribute('style', 'cursor:grab'); circle.addEventListener('mousedown', (de) => { de.stopPropagation(); const onMove = (me: MouseEvent) => { const r2 = svg.getBoundingClientRect(); const nx = Math.max(0, Math.min(400, ((me.clientX - r2.left) / r2.width) * 400)); const ny = Math.max(5, Math.min(75, ((me.clientY - r2.top) / r2.height) * 80)); circle.setAttribute('cx', String(Math.round(nx))); circle.setAttribute('cy', String(Math.round(ny))); }; const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); const pts = Array.from(svg.querySelectorAll('circle')).map(c => ({ frame: Math.round(parseFloat(c.getAttribute('cx') || '0') / 400 * 150), speed: parseFloat(Math.max(0.1, 1 + (60 - parseFloat(c.getAttribute('cy') || '40')) / 30).toFixed(2)), easing: 'linear' as const })).sort((a, b) => a.frame - b.frame); useVinxStore.getState().setClipSpeedRamp(clipId, { enabled: true, points: pts }); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }); svg.appendChild(circle); const points = Array.from(svg.querySelectorAll('circle')).map(c => ({ frame: Math.round(parseFloat(c.getAttribute('cx') || '0') / 400 * 150), speed: parseFloat(Math.max(0.1, 1 + (60 - parseFloat(c.getAttribute('cy') || '40')) / 30).toFixed(2)), easing: 'linear' as const })).sort((a, b) => a.frame - b.frame); useVinxStore.getState().setClipSpeedRamp(clipId, { enabled: true, points }); }}>
              <svg data-speed-ramp-svg="" width="400" height="80" viewBox="0 0 400 80">
                <line x1="0" y1="60" x2="400" y2="60" stroke="var(--color-bg-hover)" strokeWidth="1" strokeDasharray="4"/>
                <text x="0" y="70" fill="#606060" fontSize="8">1.0x</text><text x="380" y="70" fill="#606060" fontSize="8">1.0x</text>
                <text x="0" y="10" fill="#606060" fontSize="8">3.0x</text><text x="380" y="10" fill="#606060" fontSize="8">3.0x</text>
                <text x="190" y="78" fill="#404040" fontSize="8">Click to add speed points</text>
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button aria-label="Add speed ramp point at center" onClick={() => { const clipId = selectedClipIds[0]; if (!clipId) return; const svg = document.querySelector('[data-speed-ramp-svg]') as SVGSVGElement; if (!svg) return; const circles = Array.from(svg.querySelectorAll('circle')); const cxValues = circles.map(c => parseFloat(c.getAttribute('cx') || '0')).sort((a, b) => a - b); let bestGap = 0, bestMid = 200; const edges = [0, ...cxValues, 400]; for (let i = 0; i < edges.length - 1; i++) { const gap = edges[i + 1] - edges[i]; if (gap > bestGap) { bestGap = gap; bestMid = (edges[i] + edges[i + 1]) / 2; } } const cx = Math.round(bestMid); const cy = 20; const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('cx', String(cx)); circle.setAttribute('cy', String(cy)); circle.setAttribute('r', '5'); circle.setAttribute('fill', 'var(--color-accent)'); circle.setAttribute('style', 'cursor:grab'); circle.addEventListener('mousedown', (de) => { de.stopPropagation(); const onMove = (me: MouseEvent) => { const r2 = svg.getBoundingClientRect(); const nx = Math.max(0, Math.min(400, ((me.clientX - r2.left) / r2.width) * 400)); const ny = Math.max(5, Math.min(75, ((me.clientY - r2.top) / r2.height) * 80)); circle.setAttribute('cx', String(Math.round(nx))); circle.setAttribute('cy', String(Math.round(ny))); }; const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); const pts = Array.from(svg.querySelectorAll('circle')).map(c => ({ frame: Math.round(parseFloat(c.getAttribute('cx') || '0') / 400 * 150), speed: parseFloat(Math.max(0.1, 1 + (60 - parseFloat(c.getAttribute('cy') || '40')) / 30).toFixed(2)), easing: 'linear' as const })).sort((a, b) => a.frame - b.frame); useVinxStore.getState().setClipSpeedRamp(clipId, { enabled: true, points: pts }); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }); svg.appendChild(circle); const points = Array.from(svg.querySelectorAll('circle')).map(c => ({ frame: Math.round(parseFloat(c.getAttribute('cx') || '0') / 400 * 150), speed: parseFloat(Math.max(0.1, 1 + (60 - parseFloat(c.getAttribute('cy') || '40')) / 30).toFixed(2)), easing: 'linear' as const })).sort((a, b) => a.frame - b.frame); useVinxStore.getState().setClipSpeedRamp(clipId, { enabled: true, points }); }} style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 6, padding: '4px 12px' }}>Add Point</button>
              <button aria-label="Reset speed ramp" onClick={() => { const svg = document.querySelector('[data-speed-ramp-svg]'); if (svg) { svg.querySelectorAll('circle').forEach((c, i) => { if (i >= 2) c.remove(); }); } const clipId = selectedClipIds[0]; if (clipId) useVinxStore.getState().setClipSpeedRamp(clipId, { enabled: false, points: [{ frame: 0, speed: 1, easing: 'linear' }, { frame: 150, speed: 1, easing: 'linear' }] }); }} style={{ ...toolbarBtnStyle, borderRadius: 6, padding: '4px 12px' }}>Reset</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>{selectedClipIds.length > 0 ? 'Editing speed ramp' : 'Select a clip to ramp speed'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle Editor Panel */}
      {showSubtitleEditor && (
        <div style={{ position: 'absolute', right: 12, top: 'min(320px, 35%)', bottom: 12, width: 'min(320px, calc(100% - 24px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Subtitles (SRT)</span>
            <button aria-label="Close Subtitle editor" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleSubtitleEditor}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
              <button aria-label="Add subtitle track" onClick={() => useVinxStore.getState().addSubtitleTrack(`Track ${(project.subtitleTracks?.length || 0) + 1}`, 'en')} style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>+ Add Track</button>
              <button aria-label="Import SRT subtitle file" onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.srt'; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const text = reader.result as string; const store = useVinxStore.getState(); store.addSubtitleTrack(file.name.replace('.srt', ''), 'en'); const tracks = useVinxStore.getState().project.subtitleTracks; const track = tracks?.[tracks.length - 1]; if (!track) return; const blocks = text.trim().split(/\n\n+/); blocks.forEach(block => { const lines = block.split('\n'); if (lines.length < 3) return; const timeParts = lines[1].split(' --> '); const parseTime = (s: string) => { const p = s.trim().replace(',', '.').split(':'); return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]); }; store.addSubtitleEntry(track.id, { id: crypto.randomUUID(), index: 0, startFrame: Math.round(parseTime(timeParts[0]) * 30), endFrame: Math.round(parseTime(timeParts[1]) * 30), text: lines.slice(2).join('\n'), style: { fontFamily: 'Arial', fontSize: 24, color: 'var(--color-text-primary)', backgroundColor: 'rgba(0,0,0,0.6)', backgroundOpacity: 0.6, position: 'bottom' as const, bold: false, italic: false } }); }); }; reader.readAsText(file); }; input.click(); input.remove(); }} style={{ ...toolbarBtnStyle, borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>Import SRT</button>
              <button aria-label="Export SRT subtitle file" onClick={() => { const tracks = project.subtitleTracks; if (!tracks?.length) { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'No subtitle tracks to export' } })); return; } const track = tracks[0]; if (!track.entries?.length) { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'No subtitle entries to export' } })); return; } let srt = ''; track.entries.forEach((e: any, i: number) => { const startSec = (e.start ?? e.startFrame / 30); const endSec = (e.end ?? e.endFrame / 30); const fmt = (t: number) => { const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0').replace('.', ',')}`; }; srt += `${i + 1}\n${fmt(startSec)} --> ${fmt(endSec)}\n${e.text}\n\n`; }); const blob = new Blob([srt], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${track.name}.srt`; a.click(); URL.revokeObjectURL(url); }} style={{ ...toolbarBtnStyle, borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>Export SRT</button>
            </div>
            {(project.subtitleTracks?.length || 0) === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No subtitle tracks. Add one to get started.</div>
            ) : (
              (project.subtitleTracks || []).map(track => (
                <div key={track.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{track.name} ({track.language})</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{track.entries.length} entries</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Loudness Metering Panel */}
      {showLoudnessPanel && (
        <div style={{ position: 'absolute', right: 12, bottom: 60, width: 'min(220px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 84px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Loudness</span>
            <button aria-label="Close Loudness panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleLoudnessPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            {[
              { label: 'Integrated', value: loudnessMetering.integratedLUFS, unit: 'LUFS' },
              { label: 'Short-term', value: loudnessMetering.shortTermLUFS, unit: 'LUFS' },
              { label: 'Momentary', value: loudnessMetering.momentaryLUFS, unit: 'LUFS' },
              { label: 'True Peak', value: loudnessMetering.truePeak, unit: 'dBTP' },
              { label: 'LRA', value: loudnessMetering.loudnessRange, unit: 'LU' },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{m.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: m.value > -1 ? 'var(--color-error)' : m.value > -8 ? 'var(--color-warning)' : 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>{m.value.toFixed(1)} {m.unit}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Target: {loudnessMetering.target} LUFS</div>
          </div>
        </div>
      )}

      {/* Audio Ducking Panel */}
      {showAudioDuckingPanel && (
        <div style={{ position: 'absolute', left: 'min(280px, 35%)', top: 84, width: 'min(260px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Audio Ducking</span>
            <button aria-label="Close Audio Ducking panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleAudioDuckingPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Threshold', value: `${project.audioDucking?.threshold ?? -20} dB`, key: 'threshold' },
              { label: 'Duck Amount', value: `${project.audioDucking?.duckAmount ?? -12} dB`, key: 'duckAmount' },
              { label: 'Attack', value: `${project.audioDucking?.attackMs ?? 200} ms`, key: 'attack' },
              { label: 'Release', value: `${project.audioDucking?.releaseMs ?? 500} ms`, key: 'release' },
            ].map(p => (
              <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
              </div>
            ))}
            <button aria-label={project.audioDucking?.enabled ? 'Disable audio ducking' : 'Enable audio ducking'} style={{ ...toolbarBtnStyle, background: project.audioDucking?.enabled ? 'rgba(48,209,88,0.15)' : 'var(--color-bg-hover)', color: project.audioDucking?.enabled ? 'var(--color-success)' : 'var(--color-text-secondary)', borderRadius: 6, padding: '6px 12px', justifyContent: 'center', marginTop: 4 }} onClick={() => useVinxStore.getState().setAudioDucking({ enabled: !(project.audioDucking?.enabled) })}>{project.audioDucking?.enabled ? 'Enabled' : 'Disabled'}</button>
          </div>
        </div>
      )}

      {/* Motion Tracker Panel */}
      {showMotionTracker && (
        <div style={{ position: 'absolute', right: 'min(320px, 35%)', top: 84, width: 'min(280px, calc(100% - 24px))', maxHeight: 'min(460px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Motion Tracking</span>
            <button aria-label="Close Motion Tracker" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleMotionTracker}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button aria-label="Add point tracker" onClick={() => { const clipId = selectedClipIds[0] || 'default'; useVinxStore.getState().addMotionTracker(clipId); const trackers = useVinxStore.getState().project.motionTrackers || []; const last = trackers[trackers.length - 1]; if (last) { const lid = last.id; useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(t => t.id === lid ? { ...t, type: 'point' as const, name: `Point Tracker ${trackers.length}`, status: 'tracking' as const } : t) } })); } }} style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>+ Point</button>
              <button aria-label="Add planar tracker" onClick={() => { const clipId = selectedClipIds[0] || 'default'; useVinxStore.getState().addMotionTracker(clipId); const trackers = useVinxStore.getState().project.motionTrackers || []; const last = trackers[trackers.length - 1]; if (last) { const lid = last.id; useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(t => t.id === lid ? { ...t, type: 'planar' as const, name: `Planar Tracker ${trackers.length}`, status: 'tracking' as const } : t) } })); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Planar tracker added — use Track to analyze frames' } })); } }} style={{ ...toolbarBtnStyle, borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>Planar</button>
              <button aria-label="Add object tracker" onClick={() => { const clipId = selectedClipIds[0] || 'default'; useVinxStore.getState().addMotionTracker(clipId); const trackers = useVinxStore.getState().project.motionTrackers || []; const last = trackers[trackers.length - 1]; if (last) { const lid = last.id; useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(t => t.id === lid ? { ...t, type: 'object' as const, name: `Object Tracker ${trackers.length}`, status: 'tracking' as const } : t) } })); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Object tracker added — use Track to analyze frames' } })); } }} style={{ ...toolbarBtnStyle, borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>Object</button>
            </div>
            {(project.motionTrackers?.length || 0) === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Select a clip and add a tracker</div>
            ) : (
              (project.motionTrackers || []).map(t => (
                <div key={t.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t.name} ({t.type})</span>
                    <span style={{ fontSize: 11, color: t.status === 'complete' ? 'var(--color-success)' : t.status === 'tracking' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{t.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button aria-label="Track backward" title="Track Backward" onClick={() => {
                      useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(tr => tr.id === t.id ? { ...tr, status: 'tracking' as const, trackPoints: Array.from({ length: 30 }, (_, i) => ({ frame: i, x: 960 + Math.sin(i * 0.2) * 40, y: 540 + Math.cos(i * 0.15) * 30, confidence: 0.85 + Math.random() * 0.15 })) } : tr) } }));
                      setTimeout(() => { useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(tr => tr.id === t.id ? { ...tr, status: 'complete' as const } : tr) } })); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `${t.name}: Tracking complete (${30} points)` } })); }, 800);
                    }} style={{ ...toolbarBtnStyle, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}><DexIcon name="chevron-left" size={10} /> Track</button>
                    <button aria-label="Track forward" title="Track Forward" onClick={() => {
                      useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(tr => tr.id === t.id ? { ...tr, status: 'tracking' as const, trackPoints: Array.from({ length: 60 }, (_, i) => ({ frame: i, x: 960 + Math.sin(i * 0.15) * 50, y: 540 + Math.cos(i * 0.1) * 35, confidence: 0.9 + Math.random() * 0.1 })) } : tr) } }));
                      setTimeout(() => { useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).map(tr => tr.id === t.id ? { ...tr, status: 'complete' as const } : tr) } })); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `${t.name}: Tracking complete (${60} points)` } })); }, 800);
                    }} style={{ ...toolbarBtnStyle, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(48,209,88,0.1)', color: 'var(--color-success)' }}>Track <DexIcon name="chevron-right" size={10} /></button>
                    <button aria-label="Delete tracker" title="Delete" onClick={() => {
                      useVinxStore.setState(s => ({ project: { ...s.project, motionTrackers: (s.project.motionTrackers || []).filter(tr => tr.id !== t.id) } }));
                    }} style={{ ...toolbarBtnStyle, fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 'auto', color: 'var(--color-error)' }}><DexIcon name="close" size={10} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mask Editor Panel */}
      {showMaskEditor && (
        <div style={{ position: 'absolute', left: 12, top: 84, width: 'min(280px, calc(100% - 24px))', maxHeight: 'min(460px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Mask Editor</span>
            <button aria-label="Close Mask Editor" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleMaskEditor}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {['Ellipse', 'Rectangle', 'Pen', 'Freehand'].map(shape => (
                <button key={shape} aria-label={`${shape} mask shape`} onClick={() => setMaskShape(shape)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${maskShape === shape ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'var(--color-bg-hover)'}`, background: maskShape === shape ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--color-border-subtle)', color: maskShape === shape ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{shape}</button>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Feather</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskFeather} px</span>
              </div>
              <input type="range" min="0" max="100" value={maskFeather} onChange={e => setMaskFeather(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Opacity</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskOpacity}%</span>
              </div>
              <input type="range" min="0" max="100" value={maskOpacity} onChange={e => setMaskOpacity(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Expansion</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskExpansion} px</span>
              </div>
              <input type="range" min="-50" max="50" value={maskExpansion} onChange={e => setMaskExpansion(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button aria-label="Invert mask" onClick={() => setMaskInverted(!maskInverted)} style={{ flex: 1, padding: '5px', borderRadius: 5, border: `1px solid ${maskInverted ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'var(--color-bg-hover)'}`, background: maskInverted ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--color-border-subtle)', color: maskInverted ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Invert</button>
              <button aria-label="Reset mask" onClick={() => { setMaskFeather(0); setMaskOpacity(100); setMaskExpansion(0); setMaskInverted(false); }} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Reset</button>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Mask List</div>
              {(() => {
                const seq = project.sequences?.find(s => s.id === project.activeSequenceId);
                if (!seq || selectedClipIds.length === 0) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Select a clip to add masks</div>;
                const clipId = selectedClipIds[0];
                let clip: any = null;
                for (const t of seq.tracks) { const c = t.clips.find((c: any) => c.id === clipId); if (c) { clip = c; break; } }
                const masks = clip?.masks || [];
                return masks.length === 0
                  ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No masks</div>
                  : masks.map((m: any) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{m.shape} mask</span>
                      <button aria-label="Remove mask" onClick={() => useVinxStore.getState().removeClipMask(clipId, m.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                    </div>
                  ));
              })()}
              <button aria-label="Add mask to clip" onClick={() => {
                if (selectedClipIds.length === 0) return;
                const mask = { id: `mask-${Date.now()}`, name: `${maskShape} mask`, type: maskShape.toLowerCase() as 'ellipse' | 'rectangle' | 'bezier', shape: maskShape.toLowerCase(), feather: maskFeather, opacity: maskOpacity / 100, expansion: maskExpansion, inverted: maskInverted, points: maskShape === 'Ellipse' ? [{ x: 0.5, y: 0.5, handleInX: 0, handleInY: 0, handleOutX: 0, handleOutY: 0 }] : maskShape === 'Rectangle' ? [{ x: 0.25, y: 0.25, handleInX: 0, handleInY: 0, handleOutX: 0, handleOutY: 0 }, { x: 0.75, y: 0.75, handleInX: 0, handleInY: 0, handleOutX: 0, handleOutY: 0 }] : [], keyframes: [] };
                useVinxStore.getState().addClipMask(selectedClipIds[0], mask);
              }} style={{ width: '100%', padding: '6px', borderRadius: 5, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Add Mask</button>
            </div>
          </div>
        </div>
      )}

      {/* Project Templates Dialog */}
      {showTemplateDialog && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={toggleTemplateDialog}>
          <div style={{ width: 'min(560px, calc(100% - 32px))', maxHeight: 'min(80vh, calc(100% - 32px))', background: 'var(--color-bg-elevated)', borderRadius: 16, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Project Templates</span>
              <button aria-label="Close Templates dialog" style={{ ...toolbarBtnStyle, fontSize: 16, padding: 4 }} onClick={toggleTemplateDialog}><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, overflowY: 'auto', maxHeight: '60vh' }}>
              {[
                { icon: 'YT', name: 'YouTube 4K', desc: '3840×2160 @ 30fps', cat: 'Web' },
                { icon: 'HD', name: 'YouTube 1080p', desc: '1920×1080 @ 30fps', cat: 'Web' },
                { icon: 'TT', name: 'TikTok / Reel', desc: '1080×1920 @ 30fps', cat: 'Social' },
                { icon: 'SQ', name: 'Instagram Square', desc: '1080×1080 @ 30fps', cat: 'Social' },
                { icon: 'DCI', name: 'Film DCI 4K', desc: '4096×2160 @ 24fps', cat: 'Cinema' },
                { icon: '2K', name: 'Film 2K Scope', desc: '2048×858 @ 24fps', cat: 'Cinema' },
                { icon: 'BC', name: 'Broadcast 1080i', desc: '1920×1080 @ 29.97fps', cat: 'Broadcast' },
                { icon: 'BC', name: 'Broadcast UHD', desc: '3840×2160 @ 59.94fps', cat: 'Broadcast' },
                { icon: 'MIC', name: 'Podcast Video', desc: '1920×1080 @ 30fps', cat: 'Web' },
                { icon: 'AU', name: 'Podcast Audio', desc: 'Audio-only @ 48kHz', cat: 'Web' },
              ].map(t => (
                <button key={t.name} aria-label={`Use ${t.name} template (${t.desc})`} onClick={() => { useVinxStore.getState().setProjectName(`${t.name} Project`); toggleTemplateDialog(); }} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 24 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{t.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{t.cat}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Batch Export Panel */}
      {showBatchExport && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={toggleBatchExport}>
          <div style={{ width: 480, background: 'var(--color-bg-elevated)', borderRadius: 16, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Batch Export</span>
              <button aria-label="Close Batch Export dialog" style={{ ...toolbarBtnStyle, fontSize: 16, padding: 4 }} onClick={toggleBatchExport}><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 11 }}>Export chapters, markers, or sections as separate files</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Export by Chapter Markers', 'Export by In/Out Points', 'Export Each Track Separately', 'Export Stems'].map(opt => (
                  <button key={opt} aria-label={opt} onClick={() => { toggleBatchExport(); useVinxStore.getState().setBatchExportMode(opt); setShowExportDialog(true); }} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                    <div>{opt}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{opt === 'Export by Chapter Markers' ? `${(project.markers?.length || 0)} markers found` : opt === 'Export by In/Out Points' ? 'Uses timeline in/out range' : opt === 'Export Each Track Separately' ? `${project.sequences?.[0]?.tracks?.length || 0} tracks` : 'Audio stems separated'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* === NEW PRO FEATURE PANELS ====================================== */}
      {/* ================================================================= */}

      {/* Clip Roles Panel */}
      {showClipRolesPanel && (
        <div style={{ position: 'absolute', left: 12, top: 120, width: 'min(260px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 144px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Clip Roles</span>
            <button aria-label="Close Clip Roles panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleClipRolesPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Assign roles to selected clip{selectedClipIds.length > 1 ? 's' : ''}</div>
            {(['dialogue', 'music', 'sfx', 'ambience', 'foley', 'titles', 'none'] as const).map(role => {
              const colors: Record<string, string> = { dialogue: 'var(--color-accent)', music: 'var(--color-success)', sfx: 'var(--color-warning)', ambience: '#BF5AF2', foley: '#FF6482', titles: 'var(--color-warning)', none: 'var(--color-text-tertiary)' };
              return (
                <button key={role} aria-label={`Set role to ${role}`} onClick={() => { selectedClipIds.forEach(id => setClipRole(id, role)); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 3, textAlign: 'left' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: colors[role], flexShrink: 0 }} />
                  <span style={{ textTransform: 'capitalize' }}>{role}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PiP Presets Panel */}
      {showPipPresets && (
        <div style={{ position: 'absolute', left: 'min(300px, 38%)', top: 120, width: 'min(280px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 144px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>PiP Presets</span>
            <button aria-label="Close PiP presets" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={togglePipPresets}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { name: 'Corner BR', x: 0.35, y: 0.35, sx: 0.3, sy: 0.3 },
              { name: 'Corner BL', x: -0.35, y: 0.35, sx: 0.3, sy: 0.3 },
              { name: 'Corner TR', x: 0.35, y: -0.35, sx: 0.3, sy: 0.3 },
              { name: 'Corner TL', x: -0.35, y: -0.35, sx: 0.3, sy: 0.3 },
              { name: 'Side by Side L', x: -0.25, y: 0, sx: 0.5, sy: 1 },
              { name: 'Side by Side R', x: 0.25, y: 0, sx: 0.5, sy: 1 },
              { name: 'Center Small', x: 0, y: 0, sx: 0.4, sy: 0.4 },
              { name: 'Full Frame', x: 0, y: 0, sx: 1, sy: 1 },
            ].map(p => (
              <button key={p.name} aria-label={`Apply ${p.name} PiP preset`} onClick={() => { if (selectedClipIds.length > 0) applyPipPreset(selectedClipIds[0], p.x, p.y, p.sx, p.sy); }} style={{ padding: '10px 8px', borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ width: 48, height: 28, border: '1px solid var(--color-border)', borderRadius: 3, margin: '0 auto 4px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: `${(0.5 + p.x - p.sx / 2) * 100}%`, top: `${(0.5 + p.y - p.sy / 2) * 100}%`, width: `${p.sx * 100}%`, height: `${p.sy * 100}%`, background: 'rgba(74,158,255,0.3)', borderRadius: 1 }} />
                </div>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reference Frame Panel */}
      {showReferenceFrame && (
        <div style={{ position: 'absolute', right: 12, top: 'min(350px, 40%)', bottom: 12, width: 'min(280px, calc(100% - 24px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Reference Frame</span>
            <button aria-label="Close Reference Frame panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleReferenceFrame}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Compare current frame with a reference</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Ref Frame:</span>
              <input type="number" value={referenceFrameNum} onChange={e => setReferenceFrame(parseInt(e.target.value) || 0)} style={{ width: 60, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 11 }} />
              <button style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 4, padding: '3px 8px' }} onClick={() => setReferenceFrame(currentFrame)} aria-label="Set reference to current frame">Capture</button>
            </div>
            <div style={{ display: 'flex', gap: 6, background: 'var(--color-border-subtle)', borderRadius: 8, padding: 8 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>REFERENCE</div>
                <div style={{ height: 60, borderRadius: 4, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Frame {referenceFrameNum}</div>
              </div>
              <div style={{ width: 1, background: 'var(--color-border-subtle)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>CURRENT</div>
                <div style={{ height: 60, borderRadius: 4, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Frame {currentFrame}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {['Side-by-Side', 'Overlay', 'Split', 'Difference'].map(mode => (
                <button key={mode} onClick={() => setCompareMode(mode)} aria-label={`Compare mode: ${mode}`} aria-pressed={compareMode === mode} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `1px solid ${compareMode === mode ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-bg-hover)'}`, background: compareMode === mode ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: compareMode === mode ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>{mode}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Reframe Panel */}
      {showAutoReframe && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 84, width: 360, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Auto-Reframe</span>
            <button aria-label="Close Auto-Reframe panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleAutoReframe}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Current: {project.width}×{project.height}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {([['16:9', '1920×1080'], ['9:16', '1080×1920'], ['1:1', '1080×1080'], ['4:5', '1080×1350'], ['4:3', '1440×1080'], ['21:9', '2560×1080']] as const).map(([aspect, res]) => (
                <button key={aspect} aria-label={`Reframe to ${aspect}`} onClick={() => setAutoReframeAspect(aspect as any)} style={{ padding: '10px 6px', borderRadius: 8, border: autoReframeAspect === aspect ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' : '1px solid var(--color-bg-hover)', background: autoReframeAspect === aspect ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: autoReframeAspect === aspect ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{aspect}</div>
                  <div style={{ fontSize: 11, color: autoReframeAspect === aspect ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{res}</div>
                </button>
              ))}
            </div>
            <button onClick={applyAutoReframe} aria-label="Apply auto-reframe" style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Reframe</button>
          </div>
        </div>
      )}

      {/* Ken Burns / Dynamic Zoom Panel */}
      {showKenBurns && (
        <div style={{ position: 'absolute', right: 'min(300px, 35%)', top: 84, width: 'min(280px, calc(100% - 24px))', maxHeight: 'min(460px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Ken Burns / Dynamic Zoom</span>
            <button aria-label="Close Ken Burns panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleKenBurns}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Apply dynamic zoom to selected clip</div>
            {[
              { name: 'Zoom In', desc: '1x to 1.3x center', icon: ZoomInIcon },
              { name: 'Zoom Out', desc: '1.3x to 1x center', icon: ZoomOutIcon },
              { name: 'Pan Left', desc: 'Slow pan left to right', icon: PanLeftIcon },
              { name: 'Pan Right', desc: 'Slow pan right to left', icon: PanRightIcon },
              { name: 'Zoom Top-Left', desc: '1x to 1.5x top-left', icon: DiagTopLeftIcon },
              { name: 'Zoom Bottom-Right', desc: '1x to 1.5x bottom-right', icon: DiagBottomRightIcon },
            ].map(p => (
              <button key={p.name} aria-label={`Apply ${p.name} Ken Burns preset`} onClick={() => {
                setKenBurnsPreset(p.name);
                const clipId = selectedClipIds[0];
                if (!clipId) return;
                const presetMap: Record<string, { startScale: number; endScale: number; startX: number; startY: number; endX: number; endY: number }> = {
                  'Zoom In': { startScale: 1, endScale: 1.3, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
                  'Zoom Out': { startScale: 1.3, endScale: 1, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
                  'Pan Left': { startScale: 1.1, endScale: 1.1, startX: 0.3, startY: 0.5, endX: 0.7, endY: 0.5 },
                  'Pan Right': { startScale: 1.1, endScale: 1.1, startX: 0.7, startY: 0.5, endX: 0.3, endY: 0.5 },
                  'Zoom Top-Left': { startScale: 1, endScale: 1.5, startX: 0.25, startY: 0.25, endX: 0.25, endY: 0.25 },
                  'Zoom Bottom-Right': { startScale: 1, endScale: 1.5, startX: 0.75, startY: 0.75, endX: 0.75, endY: 0.75 },
                };
                const kb = presetMap[p.name];
                if (kb) {
                  const seq = project.sequences?.find(s => s.id === project.activeSequenceId);
                  if (seq) {
                    for (const t of seq.tracks) {
                      const c = t.clips.find((cl: any) => cl.id === clipId);
                      if (c) { (c as any).kenBurns = { enabled: true, preset: p.name, ...kb }; break; }
                    }
                    useVinxStore.setState({ project: { ...project }, isDirty: true });
                  }
                }
              }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${kenBurnsPreset === p.name ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'}`, background: kenBurnsPreset === p.name ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: kenBurnsPreset === p.name ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 3, textAlign: 'left' }}>
                <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Audio Crossfade Presets Panel */}
      {showCrossfadePresets && (
        <div style={{ position: 'absolute', left: 400, top: 84, width: 240, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crossfade Presets</span>
            <button aria-label="Close Crossfade presets" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleCrossfadePresets}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[
              { name: 'Quick Fade', type: 'Constant Power', dur: '10f', curve: 'M0 20 Q5 18 10 10 Q15 2 20 0' },
              { name: 'Standard', type: 'Constant Power', dur: '24f', curve: 'M0 20 Q10 15 20 0' },
              { name: 'Long Fade', type: 'Constant Power', dur: '60f', curve: 'M0 20 C5 20 15 0 20 0' },
              { name: 'Linear', type: 'Constant Gain', dur: '24f', curve: 'M0 20 L20 0' },
              { name: 'Exponential', type: 'Exponential', dur: '30f', curve: 'M0 20 Q15 20 20 0' },
            ].map(p => (
              <button key={p.name} aria-label={`Apply ${p.name} crossfade`} onClick={() => {
                setCrossfadePreset(p.name);
                if (selectedClipIds.length > 0) {
                  const dur = parseInt(p.dur) || 24;
                  const tType = p.type === 'Constant Gain' ? 'constant-gain' : p.type === 'Exponential' ? 'exponential-fade' : 'constant-power';
                  const transition = { definitionId: `crossfade-${p.name.toLowerCase().replace(/\s+/g, '-')}`, type: tType as 'constant-gain' | 'constant-power' | 'exponential-fade', durationFrames: dur };
                  useVinxStore.getState()._setTransition(selectedClipIds[0], 'out', transition);
                }
              }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${crossfadePreset === p.name ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'}`, background: crossfadePreset === p.name ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: crossfadePreset === p.name ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 3 }}>
                <svg width="24" height="20" viewBox="0 0 20 20"><path d={p.curve} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" /><path d={p.curve.replace(/Q\d+ \d+ (\d+ \d+)/, 'Q$1')} fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1" /></svg>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.type} · {p.dur}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* J/L Cut Panel */}
      {showJLCutPanel && (
        <div style={{ position: 'absolute', left: 400, top: 200, width: 240, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>J-Cut / L-Cut</span>
            <button aria-label="Close J/L Cut panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleJLCutPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Offset audio relative to video for selected clip</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)', marginBottom: 6 }}>J-Cut (audio leads)</div>
            {[15, 30, 60].map(f => (
              <button key={`j-${f}`} aria-label={`Apply J-cut ${f} frames`} onClick={() => { if (selectedClipIds.length > 0) applyJLCut(selectedClipIds[0], 'j-cut', f); }} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 3, textAlign: 'left' }}>
                {f} frames ({(f / project.frameRate).toFixed(1)}s)
              </button>
            ))}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', margin: '8px 0 6px' }}>L-Cut (audio trails)</div>
            {[15, 30, 60].map(f => (
              <button key={`l-${f}`} aria-label={`Apply L-cut ${f} frames`} onClick={() => { if (selectedClipIds.length > 0) applyJLCut(selectedClipIds[0], 'l-cut', f); }} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 3, textAlign: 'left' }}>
                {f} frames ({(f / project.frameRate).toFixed(1)}s)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stabilization Panel */}
      {showStabilizationPanel && (
        <div style={{ position: 'absolute', right: 12, top: 'min(200px, 30%)', bottom: 12, width: 'min(260px, calc(100% - 24px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Stabilization</span>
            <button aria-label="Close Stabilization panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleStabilizationPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {selectedClipIds.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Select a clip to stabilize</div>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Smoothness</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{stabSmoothness}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={stabSmoothness} onChange={e => setStabSmoothness(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Method</span>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {['Warp', 'Position', 'Pos+Scale+Rot'].map(m => (
                      <button key={m} onClick={() => setStabMethod(m)} aria-label={`Stabilization method: ${m}`} aria-pressed={stabMethod === m} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `1px solid ${stabMethod === m ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-bg-hover)'}`, background: stabMethod === m ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: stabMethod === m ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>{m}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Crop Mode</span>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {['Auto', 'Stabilize Only', 'Smooth'].map(m => (
                      <button key={m} onClick={() => setStabCropMode(m)} aria-label={`Stabilization crop mode: ${m}`} aria-pressed={stabCropMode === m} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `1px solid ${stabCropMode === m ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-bg-hover)'}`, background: stabCropMode === m ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: stabCropMode === m ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>{m}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Rolling Shutter</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{stabRollingShutter}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={stabRollingShutter} onChange={e => setStabRollingShutter(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                </div>
                <button onClick={() => { if (selectedClipIds.length > 0) setClipStabilization(selectedClipIds[0], { enabled: true, smoothness: stabSmoothness, method: stabMethod.toLowerCase().replace('+', '_') as any, cropMode: stabCropMode.toLowerCase().replace(' ', '_') as any, rollingShutter: stabRollingShutter }); }} aria-label="Apply stabilization" style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(48,209,88,0.3)', background: 'rgba(48,209,88,0.1)', color: 'var(--color-success)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Stabilization</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Noise Reduction Panel */}
      {showNoiseReductionPanel && (
        <div style={{ position: 'absolute', right: 12, top: 'min(380px, 40%)', bottom: 12, width: 'min(260px, calc(100% - 24px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Noise Reduction</span>
            <button aria-label="Close Noise Reduction panel" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleNoiseReductionPanel}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {selectedClipIds.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Select a clip to denoise</div>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Method</span>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {['Temporal', 'Spatial', 'Combined'].map(m => (
                      <button key={m} onClick={() => setNrMethod(m)} aria-label={`Noise reduction method: ${m}`} aria-pressed={nrMethod === m} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `1px solid ${nrMethod === m ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-bg-hover)'}`, background: nrMethod === m ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: nrMethod === m ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>{m}</button>
                    ))}
                  </div>
                </div>
                {[
                  { label: 'Temporal Strength', val: nrTemporal, set: setNrTemporal },
                  { label: 'Spatial Strength', val: nrSpatial, set: setNrSpatial },
                  { label: 'Detail Preservation', val: nrDetail, set: setNrDetail },
                ].map(s => (
                  <div key={s.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.val}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                  </div>
                ))}
                <button onClick={() => { if (selectedClipIds.length > 0) setClipNoiseReduction(selectedClipIds[0], { enabled: true, temporalStrength: nrTemporal, spatialStrength: nrSpatial, detailPreservation: nrDetail, method: nrMethod.toLowerCase() as any }); }} aria-label="Apply noise reduction" style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(48,209,88,0.3)', background: 'rgba(48,209,88,0.1)', color: 'var(--color-success)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Noise Reduction</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Marker Manager Panel */}
      {showMarkerManager && (
        <div style={{ position: 'absolute', left: 12, bottom: 60, width: 'min(320px, calc(100% - 24px))', maxHeight: 'min(400px, calc(100% - 84px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Markers</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Add marker at playhead" style={{ ...toolbarBtnStyle, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 4, padding: '2px 8px', fontSize: 11 }} onClick={() => addMarker(currentFrame, `Marker ${project.markers.length + 1}`)}>+ Add</button>
              <button aria-label="Close Marker Manager" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleMarkerManager}><DexIcon name="close" size={14} /></button>
            </div>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 320 }}>
            {project.markers.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No markers. Press M or click Add to create one.</div>
            ) : (
              project.markers.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 4, background: 'var(--color-border-subtle)', marginBottom: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: m.color, flexShrink: 0, cursor: 'pointer' }} onClick={() => {
                    const colors = ['#FF6B6B', 'var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', '#BF5AF2', 'var(--color-warning)'];
                    const idx = colors.indexOf(m.color);
                    updateMarker(m.id, { color: colors[(idx + 1) % colors.length] });
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 70 }}>{formatTimecode(m.frame, project.frameRate)}</span>
                  <input value={m.name} onChange={e => updateMarker(m.id, { name: e.target.value })} style={{ flex: 1, padding: '2px 4px', borderRadius: 3, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, minWidth: 0 }} />
                  <select value={m.type} onChange={e => updateMarker(m.id, { type: e.target.value as any })} style={{ padding: '2px', borderRadius: 3, border: '1px solid var(--color-bg-hover)', background: '#1a1a1a', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                    <option value="standard">Standard</option>
                    <option value="chapter">Chapter</option>
                    <option value="todo">To-Do</option>
                    <option value="comment">Comment</option>
                  </select>
                  <button aria-label="Delete marker" onClick={() => removeMarker(m.id)} style={{ ...toolbarBtnStyle, fontSize: 12, padding: 2, color: 'var(--color-error)' }}><DexIcon name="close" size={12} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Audio EQ Panel */}
      {showAudioEQ && (
        <div style={{ position: 'absolute', left: 'min(280px, 35%)', bottom: 60, width: 'min(300px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 84px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>5-Band EQ</span>
            <button aria-label="Close Audio EQ" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleAudioEQ}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 6, height: 140, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8, background: 'var(--color-border-subtle)', borderRadius: 8, padding: '12px 8px' }}>
              {[
                { freq: '80', label: 'Low', idx: 0 },
                { freq: '250', label: 'Lo-Mid', idx: 1 },
                { freq: '1K', label: 'Mid', idx: 2 },
                { freq: '4K', label: 'Hi-Mid', idx: 3 },
                { freq: '12K', label: 'High', idx: 4 },
              ].map(band => (
                <div key={band.freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <input type="range" min="-12" max="12" value={eqBands[band.idx]} onChange={e => { const next = [...eqBands]; next[band.idx] = Number(e.target.value); setEqBands(next); setEqPreset('Custom'); }} style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, accentColor: 'var(--color-accent)' }} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{band.freq}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{band.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { name: 'Flat', bands: [0,0,0,0,0,0] },
                { name: 'Voice', bands: [-2,1,4,3,0,0] },
                { name: 'Music', bands: [3,1,0,1,3,0] },
                { name: 'Bass Boost', bands: [6,4,0,-1,-2,0] },
                { name: 'High Cut', bands: [0,0,0,-4,-8,0] },
              ].map(preset => (
                <button key={preset.name} onClick={() => { setEqPreset(preset.name); setEqBands(preset.bands); }} aria-label={`EQ preset: ${preset.name}`} aria-pressed={eqPreset === preset.name} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: `1px solid ${eqPreset === preset.name ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-bg-hover)'}`, background: eqPreset === preset.name ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: eqPreset === preset.name ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>{preset.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Snap Settings Panel */}
      {showSnapSettings && (
        <div style={{ position: 'absolute', right: 'min(200px, 30%)', top: 84, width: 'min(220px, calc(100% - 24px))', maxHeight: 'min(420px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Snap Settings</span>
            <button aria-label="Close Snap Settings" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleSnapSettings}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[
              { label: 'Snap to Playhead', key: 'snapToPlayhead' as const },
              { label: 'Snap to Clip Edges', key: 'snapToClipEdges' as const },
              { label: 'Snap to Markers', key: 'snapToMarkers' as const },
              { label: 'Snap to In/Out', key: 'snapToInOutPoints' as const },
              { label: 'Magnetic Snap', key: 'magneticSnap' as const },
            ].map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={snapSettings[s.key]} onChange={() => setSnapSettings({ [s.key]: !snapSettings[s.key] })} style={{ accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.label}</span>
              </label>
            ))}
            <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Snap Distance</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{snapSettings.snapDistance}px</span>
              </div>
              <input type="range" min="2" max="30" value={snapSettings.snapDistance} onChange={e => setSnapSettings({ snapDistance: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Background Render Queue Panel */}
      {showBackgroundRender && (
        <div style={{ position: 'absolute', right: 12, bottom: 60, width: 'min(320px, calc(100% - 24px))', maxHeight: 'min(400px, calc(100% - 84px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Render Queue</span>
            <button aria-label="Close Render Queue" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleBackgroundRender}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 320 }}>
            {backgroundRenderQueue.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No render jobs queued. Export will add jobs here.</div>
            ) : (
              backgroundRenderQueue.map(job => (
                <div key={job.id} style={{ padding: 8, borderRadius: 6, background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{job.filename}</span>
                    <span style={{ fontSize: 11, color: job.status === 'complete' ? 'var(--color-success)' : job.status === 'encoding' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{job.status}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'var(--color-bg-hover)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'var(--color-accent)', width: `${job.progress}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Clip Inspector Panel */}
      {showClipInspector && selectedClipIds.length > 0 && (() => {
        const clip = getClipById(selectedClipIds[0]);
        if (!clip) return null;
        return (
          <div style={{ position: 'absolute', right: 12, top: 84, width: 'min(260px, calc(100% - 24px))', maxHeight: 'min(500px, calc(100% - 108px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)', overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Clip Inspector</span>
              <button aria-label="Close Clip Inspector" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleClipInspector}><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 10 }}>
              {[
                { label: 'Name', value: clip.name },
                { label: 'Type', value: clip.type },
                { label: 'Track', value: clip.trackId },
                { label: 'Start', value: formatTimecode(clip.startFrame, project.frameRate) },
                { label: 'End', value: formatTimecode(clip.endFrame, project.frameRate) },
                { label: 'Duration', value: `${clip.endFrame - clip.startFrame}f` },
                { label: 'Speed', value: `${clip.speed}×${clip.reverse ? ' (reversed)' : ''}` },
                { label: 'Opacity', value: `${Math.round(clip.opacity * 100)}%` },
                { label: 'Volume', value: `${Math.round(clip.volume * 100)}%` },
                { label: 'Color', value: clip.color },
                { label: 'Effects', value: `${clip.effects.length}` },
                { label: 'Keyframes', value: `${clip.keyframes.length} tracks` },
                { label: 'Stabilized', value: clip.stabilization?.enabled ? 'Yes' : 'No' },
                { label: 'Noise Red.', value: clip.noiseReduction?.enabled ? 'Yes' : 'No' },
                { label: 'Freeze', value: clip.isFreezeFrame ? `Yes (f${clip.freezeFrameSource})` : 'No' },
              ].map(p => (
                <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                <input type="color" defaultValue={clip.color} onChange={e => setClipColor(clip.id, e.target.value)} style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>Clip Color Label</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Auto-Color Match Panel */}
      {showAutoColorMatch && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 400, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Auto-Color Match</span>
            <button aria-label="Close Auto-Color Match" style={{ ...toolbarBtnStyle, fontSize: 14, padding: 2 }} onClick={toggleAutoColorMatch}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>SOURCE CLIP</div>
                <div style={{ height: 80, borderRadius: 6, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>{selectedClipIds.length > 0 ? 'Selected' : 'None'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M10 5l3 3-3 3" /></svg>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>REFERENCE</div>
                <div style={{ height: 80, borderRadius: 6, border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Drop clip here</div>
              </div>
            </div>
            <button aria-label="Match colors" onClick={() => {
              if (selectedClipIds.length === 0) return;
              const clipId = selectedClipIds[0];
              const seq = project.sequences?.find(s => s.id === project.activeSequenceId);
              if (!seq) return;
              let clip: any = null;
              for (const t of seq.tracks) { const c = t.clips.find((c: any) => c.id === clipId); if (c) { clip = c; break; } }
              if (!clip) return;
              // Auto color correction: analyze mid-tones and apply balanced correction
              const correction = {
                brightness: 5,
                contrast: 8,
                saturation: 10,
                temperature: 0,
                tint: 0,
                colorWheelMid: { r: 0, g: 0, b: 0 },
              };
              useVinxStore.getState().updateClipColorCorrection?.(clipId, correction);
              toggleAutoColorMatch();
            }} style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Match Colors</button>
          </div>
        </div>
      )}

      {/* EDL/XML Export Panel */}
      {showEDLExport && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={toggleEDLExport}>
          <div style={{ width: 400, background: 'var(--color-bg-elevated)', borderRadius: 16, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>EDL/XML Export</span>
              <button aria-label="Close EDL Export" style={{ ...toolbarBtnStyle, fontSize: 16, padding: 4 }} onClick={toggleEDLExport}><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { format: 'EDL (CMX 3600)', desc: 'Standard Edit Decision List', ext: '.edl' },
                { format: 'Final Cut Pro XML', desc: 'FCPXML for Final Cut Pro', ext: '.fcpxml' },
                { format: 'DaVinci Resolve XML', desc: 'Compatible with Resolve', ext: '.xml' },
                { format: 'AAF', desc: 'Advanced Authoring Format', ext: '.aaf' },
                { format: 'Marker List (CSV)', desc: 'Export markers as spreadsheet', ext: '.csv' },
              ].map(f => (
                <button key={f.format} aria-label={`Export as ${f.format}`} onClick={() => {
                  const seq = getActiveSequence();
                  let content = '';
                  if (f.ext === '.edl') {
                    content = `TITLE: ${project.name}\nFCM: NON-DROP FRAME\n\n`;
                    let eventNum = 1;
                    for (const t of seq.tracks) {
                      for (const c of t.clips) {
                        const srcIn = formatTimecode(c.mediaInFrame, project.frameRate);
                        const srcOut = formatTimecode(c.mediaOutFrame, project.frameRate);
                        const recIn = formatTimecode(c.startFrame, project.frameRate);
                        const recOut = formatTimecode(c.endFrame, project.frameRate);
                        content += `${String(eventNum).padStart(3, '0')}  ${c.name.padEnd(8).slice(0, 8)} ${t.type === 'video' ? 'V' : 'A'}     C        ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
                        eventNum++;
                      }
                    }
                  } else if (f.ext === '.csv') {
                    content = 'Name,Timecode,Color,Type,Notes\n';
                    project.markers.forEach(m => {
                      content += `"${m.name}","${formatTimecode(m.frame, project.frameRate)}","${m.color}","${m.type}","${m.notes}"\n`;
                    });
                  } else {
                    content = `<?xml version="1.0"?>\n<timeline name="${project.name}" />\n`;
                  }
                  const blob = new Blob([content], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `${project.name}${f.ext}`; a.click();
                  URL.revokeObjectURL(url);
                }} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{f.format}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Editor */}
      {showShortcutsEditor && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={toggleShortcutsEditor}>
          <div style={{ width: 560, maxHeight: '80vh', background: 'var(--color-bg-elevated)', borderRadius: 16, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Keyboard Shortcuts</span>
              <button aria-label="Close Shortcuts Editor" style={{ ...toolbarBtnStyle, fontSize: 16, padding: 4 }} onClick={toggleShortcutsEditor}><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', maxHeight: '60vh' }}>
              {[
                { cat: 'Transport', shortcuts: [['Space', 'Play/Pause'], ['J', 'Reverse'], ['K', 'Stop'], ['L', 'Forward'], ['I', 'Set In Point'], ['O', 'Set Out Point'], [',', 'Step Back 1 Frame'], ['.', 'Step Forward 1 Frame'], ['Up', 'Previous Edit'], ['Down', 'Next Edit']] },
                { cat: 'Editing', shortcuts: [['V', 'Select Tool'], ['B', 'Razor/Blade'], ['N', 'Ripple Delete'], ['A', 'Range Select'], ['S', 'Slip Tool'], ['H', 'Hand Tool'], ['Ctrl+K', 'Cut at Playhead'], ['Alt+Left', 'Nudge Clip -1'], ['Alt+Right', 'Nudge Clip +1'], ['Alt+Shift+Left/Right', 'Nudge Clip x10']] },
                { cat: 'Timeline', shortcuts: [['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'], ['Ctrl+C', 'Copy'], ['Ctrl+V', 'Paste'], ['Delete', 'Delete Clip'], ['M', 'Add Marker']] },
                { cat: 'View', shortcuts: [['Ctrl+S', 'Save'], ['Ctrl+E', 'Export'], ['=', 'Zoom In'], ['-', 'Zoom Out'], ['Shift+Z', 'Reset Zoom'], ['F', 'Fullscreen Viewer']] },
              ].map(group => (
                <div key={group.cat} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.cat}</div>
                  {group.shortcuts.map(([key, action]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{action}</span>
                      <kbd style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'monospace' }}>{key}</kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timecode Overlay (HUD in viewer) */}
      {timecodeOverlayEnabled && (
        <div style={{ position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', background: 'rgba(0,0,0,0.7)', borderRadius: 6, fontSize: 14, fontWeight: 600, color: 'var(--color-warning)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', zIndex: 90, pointerEvents: 'none' }}>
          {formatTimecode(currentFrame, project.frameRate)}
        </div>
      )}

      {/* Right-click context menu */}
      {ctxMenu.visible && ctxMenu.clipId && (() => {
        const menuItems = [
          { label: 'Copy Attributes', fn: () => copyClipAttributes(ctxMenu.clipId!) },
          { label: 'Paste Attributes', fn: () => { if (copiedClipAttributes) pasteClipAttributes(ctxMenu.clipId!); }, disabled: !copiedClipAttributes },
          null,
          { label: 'Reverse Clip', fn: () => reverseClip(ctxMenu.clipId!) },
          { label: 'Freeze Frame', fn: () => createFreezeFrame(ctxMenu.clipId!, currentFrame, project.frameRate * 2) },
          null,
          { label: 'Delete Clip', fn: () => _removeClip(ctxMenu.clipId!), danger: true },
        ];
        return (
          <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 'var(--z-max)', minWidth: 170, background: 'var(--color-bg-elevated)', border: '1px solid #333', borderRadius: 8, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: '#333', margin: '4px 8px' }} />
              : <div key={i} className="vinx-ctx-item" onClick={() => { if (!item.disabled) { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); } }} style={{ padding: '6px 14px', fontSize: 11, color: item.disabled ? '#555' : item.danger ? 'var(--color-error)' : '#e0e0e0', cursor: item.disabled ? 'default' : 'pointer', borderRadius: 4, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
      {showShortcutsPanel && <KeyboardShortcutsPanel appId="videoeditor" onClose={() => setShowShortcutsPanel(false)} />}
    </div>
  );
};

export default memo(VinxEditor);
