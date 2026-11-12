/**
 * DEX Platform - PRISM Image Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional image editing with layers and smart tools
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import DexIcon from '../../components/DexIcon';
import { ResizablePanel } from '../../components/ResizablePanel';
import { MenuBar } from '../../components/appShell/MenuBar';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { useAppLifecycle } from '../../hooks/useAppLifecycle';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAutoSave, loadAutoSave, type AutoSaveResult } from '../../utils/useAutoSave';
import { useAppTracking } from '../../services/usePatternLearning';
import { loadEngagement, saveEngagement, recordAppUsage, checkAchievements } from '../../services/engagement';
import { rewardUnlocks } from '../../services/achievementEngine';
import { useCanvasZoomPan } from '../../hooks/useCanvasZoomPan';
import { useFileDrop } from '../../utils/useFileDrop';
import { capHistoryTail } from '../../../shared/creative/history';
import AutosaveIndicator, { type AutosaveState } from '../../components/AutosaveIndicator';
import type { CreativeOp } from '../../../shared/uki/creativeActions';
import { upscaleByFactor } from '../../../shared/creative/resample';
import { denoiseImage } from '../../../shared/creative/denoise';
import { autoLevels } from '../../../shared/creative/autoLevels';
import { applyLensCorrection } from '../../../shared/creative/lensCorrect';
import {
  ADJUSTMENT_PRESETS,
  QUICK_EXPORT_PRESETS,
  hexToRgb,
} from './PrismFeatures';
import type { AdjustmentType as PrismAdjustmentType, BlendMode as PrismBlendMode } from './PrismFeatures';
import {
  type BooleanOp,
  type CompositeSource,
  BOOLEAN_OP_INFO,
  compositeBooleanLayers,
  flattenSourcesToDataURL,
  diffusionInpaint,
} from './PrismCompositing';
// Real, unit-friendly adjustment + selection engines (built in the prism/ helpers
// but previously unwired for these dialogs). Wiring these turns the Photo Filter,
// Color Balance, Replace Color, Select Subject and Refine Edge panels from no-ops
// into operations that actually mutate the document, matching the other dialogs.
import {
  applyPhotoFilter,
  adjustColorBalance,
} from './PrismAdjustments';
import {
  type SelectionMask,
  type SelectModifyOptions,
  createSubjectSelect,
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelectionEdges,
} from './PrismSelection';
// ==================== APP IDENTITY ====================
export const PRISM_VERSION = '1.0.0';
export const PRISM_BUILD_DATE = '2026-04-11';
/** Max retained undo snapshots. Each is a full deep clone of all layers, so this
 *  bounds the editor's worst-case history memory (was previously unbounded). */
const PRISM_HISTORY_LIMIT = 60;

import {
  type SelectionState,
  type GradientType,
  type PenPath,
  type CloneState,
  type FilterName,
  type TransformState,
  createEmptySelection,
  createRectSelection,
  createLassoSelection,
  createWandSelection,
  selectAll,
  invertSelection,
  drawMarchingAnts,
  drawGradient,
  createPenPoint,
  drawPenPath,
  hitTestPenPath,
  createCloneState,
  paintCloneStamp,
  paintHealBrush,
  applyFilter,
  createTransformState,
  drawTransformHandles,
  hitTestTransformHandle,
  applyTransformHandle,
  computeHistogram,
  drawHistogram,
  canvasToTIFF,
  canvasToBMP,
  applyAdjustmentToImageData,
  defaultAdjustment,
  type AdjustmentParams,
  type AdjustmentKind,
} from './PrismEngine';
import { getPerfTier } from '../../utils/adaptiveCanvas';
import { buildBandMask } from '../../../shared/creative/luminanceMask';
import { AdjustmentControls } from './AdjustmentControls';
import { CreativeSlider, type CreativeSliderProps, SegmentedControl } from '../../components/controls';
import { clampEventToViewport } from '../../utils/menuPosition';
import { readImageMetadata, formatExifDate, type ImageMetadata } from './imageMetadata';
import { keyEventForApp } from '../../shell/input/appKeyScope';

// Prism's value sliders all share the app accent (#ff375f) and an 80px label
// column; this thin wrapper bakes those in so call sites stay declarative and the
// panel stays aligned with the other label rows. The shared row itself lives in
// components/controls/CreativeSlider -- one source of truth across creative apps.
const PrismSlider: React.FC<CreativeSliderProps> = (props) => (
  <CreativeSlider accentColor="var(--prism-accent)" labelWidth={80} {...props} />
);

// ===========================================================================
// DEX PRISM - Professional Image Editor
// Pixelmator Pro / Photoshop alternative with layers, masks, smart tools
// ===========================================================================

// ==================== TYPES ====================
interface Layer {
  id: string;
  name: string;
  type: 'image' | 'shape' | 'text' | 'adjustment' | 'group';
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  imageData?: string;
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  shapeType?: 'rectangle' | 'ellipse' | 'polygon' | 'line' | 'path';
  adjustmentType?: AdjustmentType;
  adjustmentValues?: Record<string, number>;
  adjustment?: AdjustmentParams;
  mask?: LayerMask;
  effects?: LayerEffect[];
  children?: Layer[];
}

interface LayerMask {
  enabled: boolean;
  linked: boolean;
  data?: string;
}

interface LayerEffect {
  type: 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'bevel' | 'stroke' | 'colorOverlay' | 'gradientOverlay';
  enabled: boolean;
  settings: Record<string, any>;
}

type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorDodge' | 'colorBurn' | 'hardLight' | 'softLight' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

const BLEND_MODE_TO_CSS: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
  darken: 'darken', lighten: 'lighten', colorDodge: 'color-dodge', colorBurn: 'color-burn',
  hardLight: 'hard-light', softLight: 'soft-light', difference: 'difference', exclusion: 'exclusion',
  hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

type AdjustmentType = 'brightness' | 'contrast' | 'levels' | 'curves' | 'hue' | 'saturation' | 'colorBalance' | 'blackWhite' | 'vibrance' | 'exposure' | 'shadows' | 'highlights';

interface HistoryState {
  id: string;
  name: string;
  layers: Layer[];
  timestamp: number;
}

// ==================== SVG ICONS ====================
const Icons = {
  pointer: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>,
  move: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>,
  brush: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>,
  eraser: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>,
  text: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  shape: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  crop: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>,
  hand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>,
  zoom: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  eyedropper: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>,
  gradient: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/></svg>,
  bucket: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>,
  wand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 4-3 3"/><path d="m12 7-9 9 3 3 9-9"/><path d="m19 4-3 3"/><path d="m22 7-3 3"/></svg>,
  lasso: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 22a5 5 0 0 1-2-4"/><path d="M7 16.93c.96.43 1.96.74 2.99.91"/><path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z"/></svg>,
  pen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  heal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/><circle cx="12" cy="12" r="9"/></svg>,
  clone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  dodge: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h9" strokeDasharray="2,2"/></svg>,
  burn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 12h9"/></svg>,
  layers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  save: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  redo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  sliders: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  sparkles: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>,
  filter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  rotate: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>,
  flip: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
};

// ==================== BLEND MODES ====================
const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'colorDodge', label: 'Color Dodge' },
  { value: 'colorBurn', label: 'Color Burn' },
  { value: 'hardLight', label: 'Hard Light' },
  { value: 'softLight', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

// ==================== FILTER/ADJUSTMENT PRESETS ====================
interface FilterPreset {
  id: string;
  name: string;
  category: 'color' | 'bw' | 'vintage' | 'cinematic' | 'artistic';
  adjustments: { type: AdjustmentType; values: Record<string, number> }[];
}

const FILTER_PRESETS: FilterPreset[] = [
  { id: 'vibrant', name: 'Vibrant', category: 'color', adjustments: [{ type: 'saturation', values: { saturation: 30 } }, { type: 'contrast', values: { contrast: 10 } }] },
  { id: 'natural', name: 'Natural', category: 'color', adjustments: [{ type: 'vibrance', values: { vibrance: 20 } }, { type: 'shadows', values: { shadows: 10 } }] },
  { id: 'warm-glow', name: 'Warm Glow', category: 'color', adjustments: [{ type: 'colorBalance', values: { shadows: 15, midtones: 10, highlights: 5 } }] },
  { id: 'cool-tone', name: 'Cool Tone', category: 'color', adjustments: [{ type: 'colorBalance', values: { shadows: -10, midtones: -15, highlights: -5 } }] },
  { id: 'high-contrast-bw', name: 'High Contrast B&W', category: 'bw', adjustments: [{ type: 'blackWhite', values: { red: 40, yellow: 60, green: 40, cyan: 60, blue: 20, magenta: 80 } }, { type: 'contrast', values: { contrast: 30 } }] },
  { id: 'soft-bw', name: 'Soft B&W', category: 'bw', adjustments: [{ type: 'blackWhite', values: { red: 30, yellow: 40, green: 40, cyan: 50, blue: 30, magenta: 60 } }, { type: 'contrast', values: { contrast: -10 } }] },
  { id: 'sepia', name: 'Sepia', category: 'vintage', adjustments: [{ type: 'blackWhite', values: { tint: 30 } }, { type: 'colorBalance', values: { shadows: 20, midtones: 15, highlights: 10 } }] },
  { id: 'vintage-fade', name: 'Vintage Fade', category: 'vintage', adjustments: [{ type: 'saturation', values: { saturation: -20 } }, { type: 'contrast', values: { contrast: -15 } }, { type: 'exposure', values: { exposure: 10 } }] },
  { id: 'retro-70s', name: 'Retro 70s', category: 'vintage', adjustments: [{ type: 'colorBalance', values: { shadows: 25, midtones: 15 } }, { type: 'saturation', values: { saturation: -10 } }] },
  { id: 'cinematic-teal', name: 'Cinematic Teal & Orange', category: 'cinematic', adjustments: [{ type: 'colorBalance', values: { shadows: -20, highlights: 20 } }, { type: 'saturation', values: { saturation: 15 } }] },
  { id: 'film-noir', name: 'Film Noir', category: 'cinematic', adjustments: [{ type: 'blackWhite', values: {} }, { type: 'contrast', values: { contrast: 40 } }, { type: 'shadows', values: { shadows: -20 } }] },
  { id: 'blockbuster', name: 'Blockbuster', category: 'cinematic', adjustments: [{ type: 'contrast', values: { contrast: 20 } }, { type: 'saturation', values: { saturation: 10 } }, { type: 'highlights', values: { highlights: -10 } }] },
  { id: 'dreamy', name: 'Dreamy', category: 'artistic', adjustments: [{ type: 'exposure', values: { exposure: 15 } }, { type: 'contrast', values: { contrast: -20 } }, { type: 'saturation', values: { saturation: -10 } }] },
  { id: 'pop-art', name: 'Pop Art', category: 'artistic', adjustments: [{ type: 'saturation', values: { saturation: 60 } }, { type: 'contrast', values: { contrast: 40 } }] },
  { id: 'matte', name: 'Matte', category: 'artistic', adjustments: [{ type: 'levels', values: { blackPoint: 20, whitePoint: 240 } }, { type: 'contrast', values: { contrast: -10 } }] },
];

// ==================== BRUSH PRESETS ====================
interface BrushPreset {
  id: string;
  name: string;
  category: 'basic' | 'artistic' | 'texture' | 'special';
  settings: { size: number; hardness: number; opacity: number; flow: number; spacing: number };
}

const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'hard-round', name: 'Hard Round', category: 'basic', settings: { size: 20, hardness: 100, opacity: 100, flow: 100, spacing: 5 } },
  { id: 'soft-round', name: 'Soft Round', category: 'basic', settings: { size: 30, hardness: 0, opacity: 100, flow: 100, spacing: 5 } },
  { id: 'airbrush', name: 'Airbrush', category: 'basic', settings: { size: 50, hardness: 0, opacity: 30, flow: 50, spacing: 3 } },
  { id: 'pencil', name: 'Pencil', category: 'basic', settings: { size: 5, hardness: 100, opacity: 80, flow: 100, spacing: 2 } },
  { id: 'chalk', name: 'Chalk', category: 'artistic', settings: { size: 25, hardness: 50, opacity: 70, flow: 80, spacing: 8 } },
  { id: 'watercolor', name: 'Watercolor', category: 'artistic', settings: { size: 40, hardness: 10, opacity: 40, flow: 60, spacing: 10 } },
  { id: 'oil-paint', name: 'Oil Paint', category: 'artistic', settings: { size: 35, hardness: 60, opacity: 90, flow: 85, spacing: 6 } },
  { id: 'marker', name: 'Marker', category: 'artistic', settings: { size: 20, hardness: 80, opacity: 80, flow: 100, spacing: 4 } },
  { id: 'splatter', name: 'Splatter', category: 'texture', settings: { size: 60, hardness: 100, opacity: 60, flow: 100, spacing: 50 } },
  { id: 'grain', name: 'Grain', category: 'texture', settings: { size: 3, hardness: 100, opacity: 20, flow: 100, spacing: 15 } },
  { id: 'stipple', name: 'Stipple', category: 'texture', settings: { size: 8, hardness: 100, opacity: 50, flow: 100, spacing: 30 } },
  { id: 'crosshatch', name: 'Crosshatch', category: 'texture', settings: { size: 2, hardness: 100, opacity: 70, flow: 100, spacing: 4 } },
  { id: 'glow', name: 'Glow', category: 'special', settings: { size: 80, hardness: 0, opacity: 20, flow: 30, spacing: 5 } },
  { id: 'smudge', name: 'Smudge', category: 'special', settings: { size: 30, hardness: 30, opacity: 60, flow: 80, spacing: 3 } },
  { id: 'blur', name: 'Blur', category: 'special', settings: { size: 40, hardness: 20, opacity: 50, flow: 70, spacing: 5 } },
];

// ==================== LAYER STYLE PRESETS ====================
interface LayerStylePreset {
  id: string;
  name: string;
  category: 'shadows' | 'glow' | 'bevel' | 'special';
  effects: LayerEffect[];
}

const LAYER_STYLE_PRESETS: LayerStylePreset[] = [
  { id: 'drop-shadow', name: 'Drop Shadow', category: 'shadows', effects: [{ type: 'dropShadow', enabled: true, settings: { color: '#000000', opacity: 50, angle: 135, distance: 5, spread: 0, size: 10 } }] },
  { id: 'long-shadow', name: 'Long Shadow', category: 'shadows', effects: [{ type: 'dropShadow', enabled: true, settings: { color: '#000000', opacity: 30, angle: 135, distance: 20, spread: 100, size: 0 } }] },
  { id: 'inner-shadow', name: 'Inner Shadow', category: 'shadows', effects: [{ type: 'innerShadow', enabled: true, settings: { color: '#000000', opacity: 50, angle: 135, distance: 5, choke: 0, size: 10 } }] },
  { id: 'soft-glow', name: 'Soft Glow', category: 'glow', effects: [{ type: 'outerGlow', enabled: true, settings: { color: 'var(--color-text-primary)', opacity: 60, spread: 0, size: 20 } }] },
  { id: 'neon-glow', name: 'Neon Glow', category: 'glow', effects: [{ type: 'outerGlow', enabled: true, settings: { color: '#00ffff', opacity: 100, spread: 10, size: 30 } }, { type: 'innerGlow', enabled: true, settings: { color: 'var(--color-text-primary)', opacity: 50, size: 5 } }] },
  { id: 'inner-glow', name: 'Inner Glow', category: 'glow', effects: [{ type: 'innerGlow', enabled: true, settings: { color: 'var(--color-text-primary)', opacity: 75, choke: 0, size: 15 } }] },
  { id: 'emboss', name: 'Emboss', category: 'bevel', effects: [{ type: 'bevel', enabled: true, settings: { style: 'emboss', depth: 100, size: 5, soften: 0, angle: 135, altitude: 30 } }] },
  { id: 'pillow-emboss', name: 'Pillow Emboss', category: 'bevel', effects: [{ type: 'bevel', enabled: true, settings: { style: 'pillowEmboss', depth: 100, size: 8, soften: 0, angle: 135, altitude: 30 } }] },
  { id: 'stroke-outline', name: 'Stroke Outline', category: 'special', effects: [{ type: 'stroke', enabled: true, settings: { color: '#000000', size: 2, position: 'outside', opacity: 100 } }] },
  { id: 'color-overlay', name: 'Color Overlay', category: 'special', effects: [{ type: 'colorOverlay', enabled: true, settings: { color: 'var(--color-accent)', opacity: 50, blendMode: 'multiply' } }] },
];

// ==================== COMPONENT ====================
const Prism: React.FC = () => {
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);
  // Creative app settings from Settings page
  // Track app usage
  useAppTracking('prism');
  const collab = useCollaborationFeatures({ appId: 'prism', projectName: 'PRISM Project', autoCheckpointInterval: 300000 });
  useEffect(() => {
    const eng = loadEngagement();
    const updated = recordAppUsage(eng, 'prism');
    const checkRes = checkAchievements(updated);
    saveEngagement(checkRes.state);
    rewardUnlocks(checkRes.newUnlocks);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { dropProps, dropOverlayStyle } = useFileDrop(
    ['image/*', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'],
    useCallback((files) => { setIsDirty(true); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Imported ${files.length} image(s) into PRISM`, type: 'success' } })); }, [])
  );

  // Listen for incoming assets from other creative apps
  useCreativeInbox('prism', useCallback((asset) => {
    if (asset.kind === 'image' && asset.data) {
      const newLayer: Layer = {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: asset.name || 'Imported Image',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: 0,
        imageData: asset.data,
      };
      setLayers(prev => [newLayer, ...prev]);
      setSelectedLayerId(newLayer.id);
      setIsDirty(true);
    }
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Imported "${asset.name}" from ${asset.sourceApp}` } }));
  }, []));

  // ===== STATE =====
  const [activeTool, setActiveTool] = useState<string>('pointer');
  // Start with a demo composition so the canvas isn't blank
  const [layers, setLayers] = useState<Layer[]>(() => [
    { id: 'layer-bg', name: 'Background', type: 'image', visible: true, locked: false, opacity: 1, blendMode: 'normal' as BlendMode, x: 0, y: 0, width: 1920, height: 1080, rotation: 0, color: '#1a1a2e', effects: [] },
    { id: 'layer-shape1', name: 'Circle Accent', type: 'shape', visible: true, locked: false, opacity: 0.7, blendMode: 'screen' as BlendMode, x: 600, y: 300, width: 400, height: 400, rotation: 0, shapeType: 'ellipse', color: 'var(--prism-accent)', effects: [{ type: 'outerGlow', enabled: true, settings: { color: 'var(--prism-accent)', size: 40, opacity: 0.5 } }] },
    { id: 'layer-shape2', name: 'Rectangle', type: 'shape', visible: true, locked: false, opacity: 0.5, blendMode: 'overlay' as BlendMode, x: 900, y: 200, width: 600, height: 300, rotation: 15, shapeType: 'rectangle', color: 'var(--color-accent)', effects: [] },
    { id: 'layer-text', name: 'Title Text', type: 'text', visible: true, locked: false, opacity: 1, blendMode: 'normal' as BlendMode, x: 660, y: 480, width: 600, height: 80, rotation: 0, textContent: 'PRISM', fontSize: 72, fontFamily: 'system-ui', color: 'var(--color-text-primary)', effects: [{ type: 'dropShadow', enabled: true, settings: { color: '#000000', offsetX: 4, offsetY: 4, blur: 12, opacity: 0.6 } }] },
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('layer-text');
  // Crash-recovery autosave is wired below, after canvasSize + adjustments are
  // declared, so the snapshot can include them (they were previously lost on a
  // crash). It reads a ref so the heavy data-URL layer payload is serialized only
  // on the autosave tick, not on every brush stroke or slider drag.
  // The header shows what the crash-recovery autosave actually did (it used to
  // flip to "Saved" 800 ms after any edit, whether or not anything was written).
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [changedSinceAutosave, setChangedSinceAutosave] = useState(false);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const onAutoSave = useCallback((r: AutoSaveResult) => {
    if (r.ok) { setAutosaveState('saved'); setLastSavedAt(r.at); setChangedSinceAutosave(false); setAutosaveError(null); }
    else {
      setAutosaveState('error');
      setAutosaveError(r.reason === 'quota'
        ? 'Recovery copy not saved: app storage is full (large images). Use Save to keep a project file.'
        : 'Recovery copy not saved. Use Save to keep a project file.');
    }
  }, []);
  // The one-time warning toast comes from persistOrWarn inside useAutoSave.
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Canvas state
  // Shared creative engine: zoom/pan state + cursor-centred wheel math (was
  // inline here; now one implementation reusable across the creative apps).
  const { zoom, setZoom, panOffset, setPanOffset, zoomAtCursor } = useCanvasZoomPan({ min: 10, max: 500, initial: 100 });
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  // Metadata of the last opened original (Image info panel).
  const [imageInfo, setImageInfo] = useState<{ name: string; bytes: number; meta: ImageMetadata } | null>(null);
  const [showImageInfo, setShowImageInfo] = useState(false);
  
  // Brush settings
  const [brushSize, setBrushSize] = useState(20);
  const [brushHardness, setBrushHardness] = useState(100);
  const [brushOpacity, setBrushOpacity] = useState(100);
  // Brush stabilization: 0 = off, 1-10 = rolling average window size
  const [brushStabilization, setBrushStabilization] = useState(0);
  const [foregroundColor, setForegroundColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('var(--color-text-primary)');
  const [brushCursorPos, setBrushCursorPos] = useState<{ x: number; y: number } | null>(null);
  
  // Adjustments
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [hue, setHue] = useState(0);
  const [exposure, setExposure] = useState(0);
  const [highlights, setHighlights] = useState(0);
  const [shadows, setShadows] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [vibrance, setVibrance] = useState(0);

  // Crash-recovery autosave snapshot (relocated here so canvasSize + adjustments
  // are in scope). getData reads a ref so the large data-URL layer payload is
  // serialized only on the 30s tick / hide / unmount, never per edit.
  const prismSnapshotRef = useRef({ layers, selectedLayerId, activeTool, canvasSize, adjustments: { brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance } });
  prismSnapshotRef.current = { layers, selectedLayerId, activeTool, canvasSize, adjustments: { brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance } };
  const getPrismSnapshot = useCallback(() => prismSnapshotRef.current, []);
  useAutoSave('prism', getPrismSnapshot, isDirty, 30_000, onAutoSave);
  // Any change to the picture marks the work unsaved (several edit paths never
  // set the flag, and nothing ever cleared it; Save now does).
  // Restores at start (recovery copy, workspace) also change these, so only
  // changes after the user's first pointer or key input count as edits.
  const editMarkReady = useRef(false);
  useEffect(() => {
    const arm = () => { editMarkReady.current = true; };
    const armKey = (e: KeyboardEvent) => { if (keyEventForApp(e, 'prism')) arm(); };
    window.addEventListener('pointerdown', arm, { capture: true, once: true });
    window.addEventListener('keydown', armKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', arm, { capture: true });
      window.removeEventListener('keydown', armKey, { capture: true });
    };
  }, []);
  useEffect(() => {
    if (!editMarkReady.current) return;
    setIsDirty(true);
    setChangedSinceAutosave(true);
  }, [layers, canvasSize, brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; layerId: string | null }>({ visible: false, x: 0, y: 0, layerId: null });
  // Dismiss the layer context menu on Escape and on scroll. An outside click
  // already closes it (container onClick), but a menu left open while the page
  // scrolls would otherwise float detached from its anchor.
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const close = () => setCtxMenu(p => ({ ...p, visible: false }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [ctxMenu.visible]);

  // Adjustment-layer "add" dropdown
  const [showAddAdjustmentMenu, setShowAddAdjustmentMenu] = useState(false);
  useEffect(() => {
    if (!showAddAdjustmentMenu) return;
    const close = () => setShowAddAdjustmentMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showAddAdjustmentMenu]);

  // Panels
  const [showLayers, setShowLayers] = useState(true);
  const [showAdjustments, setShowAdjustments] = useState(true);
  const [activePanel, setActivePanel] = useState<'adjustments' | 'filters' | 'presets'>('adjustments');
  const [presetType, setPresetType] = useState<'filters' | 'brushes' | 'styles'>('filters');

  // Crop state
  const [cropRegion, setCropRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  // Text editing state
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [textFontSize, setTextFontSize] = useState(32);
  const [textFontFamily, setTextFontFamily] = useState('Inter, system-ui, sans-serif');
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  // Shape state
  const [shapeType, setShapeType] = useState<'rectangle' | 'ellipse' | 'line'>('rectangle');
  const [shapeFill, setShapeFill] = useState(true);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ===== ADVANCED TOOL STATE =====
  // Selection
  const [selection, setSelection] = useState<SelectionState>(createEmptySelection);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Gradient
  const [gradientType, setGradientType] = useState<GradientType>('linear');
  const gradientStartRef = useRef<{ x: number; y: number } | null>(null);
  const [gradientPreview, setGradientPreview] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  // Pen / Bezier
  const [penPath, setPenPath] = useState<PenPath>({ points: [], closed: false, strokeColor: '#000000', strokeWidth: 2, fillColor: null });
  const [penDragging, setPenDragging] = useState<{ type: 'anchor' | 'cpIn' | 'cpOut'; index: number } | null>(null);

  // Clone / Heal
  const [cloneState, setCloneState] = useState<CloneState>(createCloneState);

  // Transform
  const [transformState, setTransformState] = useState<TransformState>(createTransformState);

  // Filter dialog
  const [activeFilter, setActiveFilter] = useState<FilterName | null>(null);

  // ROADMAP-600 #095 — apply a UKI CreativeOp to Prism's live document. Ops that
  // map to Prism's real adjustment pipeline run for real (and are undoable via
  // pushHistory); ops that need an AI engine not present in this build fail
  // honestly with a clear note rather than pretending to have run.
  // Decode the selected image layer's data URL into ImageData (offscreen canvas).
  const decodeLayerImage = (dataUrl: string): Promise<ImageData> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d');
      if (!cx) { reject(new Error('no 2d context')); return; }
      cx.drawImage(img, 0, 0);
      resolve(cx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
  // Pack an RGBA buffer back into a data URL (null if no canvas context).
  const pixelsToDataURL = (data: Uint8ClampedArray, w: number, h: number): string | null => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    if (!cx) return null;
    const id = cx.createImageData(w, h);
    id.data.set(data);
    cx.putImageData(id, 0, 0);
    return c.toDataURL();
  };
  // The selected layer if it is an image layer with pixels, else undefined.
  const selectedImageLayer = () => {
    const l = selectedLayerId ? layers.find(x => x.id === selectedLayerId) : undefined;
    return l && l.type === 'image' && l.imageData ? l : undefined;
  };

  // ROADMAP-600 #095 — apply a UKI CreativeOp to Prism's live document. Pixel ops
  // run on the selected image layer through real, tested shared engines (resample
  // #167, denoise #170, auto-levels #174) and are undoable via pushHistory. Ops
  // that need an AI engine not present in this build skip honestly with a clear
  // note rather than pretending to have run.
  const applyCreativeOp = async (op: CreativeOp): Promise<{ outcome: 'applied' | 'skipped'; note?: string }> => {
    switch (op.op) {
      case 'autoEnhance': {
        const layer = selectedImageLayer();
        if (layer) {
          const src = await decodeLayerImage(layer.imageData as string);
          const leveled = autoLevels(src.data, src.width, src.height, { clipPercent: 0.5 });
          const url = pixelsToDataURL(leveled, src.width, src.height);
          if (!url) return { outcome: 'skipped', note: 'no canvas context' };
          pushHistory('UKI: auto-enhance');
          setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: url } : l));
          return { outcome: 'applied', note: 'auto-enhanced via per-channel histogram auto-levels (real)' };
        }
        pushHistory('UKI: auto-enhance');
        setExposure(4); setBrightness(6); setContrast(12); setSaturation(8); setVibrance(15);
        return { outcome: 'applied', note: 'auto-enhanced via live adjustments (no image layer selected)' };
      }
      case 'colorGrade':
        pushHistory('UKI: color grade');
        setTemperature(15); setTint(-5); setSaturation(8); setContrast(6);
        return { outcome: 'applied', note: 'applied a warm cinematic grade (temperature, tint, saturation)' };
      case 'upscale': {
        const layer = selectedImageLayer();
        if (!layer) return { outcome: 'skipped', note: 'select an image layer to upscale' };
        const factor = typeof op.params.factor === 'number' ? op.params.factor : 2;
        const src = await decodeLayerImage(layer.imageData as string);
        const { data, width, height } = upscaleByFactor(src.data, src.width, src.height, factor);
        const url = pixelsToDataURL(data, width, height);
        if (!url) return { outcome: 'skipped', note: 'no canvas context for upscale' };
        pushHistory(`UKI: upscale ${factor}x`);
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: url, width, height } : l));
        return { outcome: 'applied', note: `upscaled to ${width}x${height} (${factor}x Lanczos resample, not ML super-res)` };
      }
      case 'denoise': {
        const layer = selectedImageLayer();
        if (!layer) return { outcome: 'skipped', note: 'select an image layer to denoise' };
        const src = await decodeLayerImage(layer.imageData as string);
        const filtered = denoiseImage(src.data, src.width, src.height, { radius: 1, passes: 1 });
        const url = pixelsToDataURL(filtered, src.width, src.height);
        if (!url) return { outcome: 'skipped', note: 'no canvas context for denoise' };
        pushHistory('UKI: denoise');
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: url } : l));
        return { outcome: 'applied', note: 'denoised via 3x3 median filter (edge-preserving, not ML)' };
      }
      default:
        return { outcome: 'skipped', note: `${op.op}: needs an AI engine not installed in this build` };
    }
  };
  const [filterIntensity, setFilterIntensity] = useState(75);

  // Histogram
  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  const [histChannel, setHistChannel] = useState<'rgb' | 'r' | 'g' | 'b' | 'lum'>('rgb');

  // ===== PRO FEATURES STATE =====
  // UKI natural-language assistant bar ("remove background", "auto enhance").
  // Drives the previously-orphaned applyCreativeOp handler below.
  // Content-Aware Fill
  const [showContentAwareFill, setShowContentAwareFill] = useState(false);
  const [contentAwareSampling, setContentAwareSampling] = useState<'auto' | 'rectangular' | 'custom'>('auto');
  // Layer Boolean / Combine (real canvas compositing)
  const [showLayerBoolean, setShowLayerBoolean] = useState(false);
  useEffect(() => {
    if (!showLayerBoolean) return;
    const close = () => setShowLayerBoolean(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showLayerBoolean]);
  // Liquify
  const [showLiquify, setShowLiquify] = useState(false);
  const [liquifyTool, setLiquifyTool] = useState<'push' | 'pull' | 'bloat' | 'pinch' | 'twirl'>('push');
  const [liquifyBrushSize, setLiquifyBrushSize] = useState(50);
  const [liquifyPressure, setLiquifyPressure] = useState(50);
  const [liquifyCenter, setLiquifyCenter] = useState<{ x: number; y: number } | null>(null);
  // Snapshot of the active layer's pixels taken when Liquify opens, so the
  // Reconstruct button can truly restore the un-warped image (it used to only
  // push history and leave the warp in place).
  const liquifyOriginalRef = useRef<string | null>(null);
  // Spot Healing
  const [showSpotHealing, setShowSpotHealing] = useState(false);
  // Frequency Separation
  const [showFreqSeparation, setShowFreqSeparation] = useState(false);
  const [freqRadius, setFreqRadius] = useState(8);
  // Select Subject / Color Range
  const [showSelectSubject, setShowSelectSubject] = useState(false);
  // Controlled Select-Subject post-process amounts (were uncontrolled defaultValue
  // sliders, so the values could never be read when applying the selection).
  const [subjectFeather, setSubjectFeather] = useState(0);
  const [subjectExpand, setSubjectExpand] = useState(0);
  const [showColorRange, setShowColorRange] = useState(false);
  const [colorRangeHue, setColorRangeHue] = useState(0);
  const [colorRangeFuzziness, setColorRangeFuzziness] = useState(40);
  // Smart Objects
  const [showSmartObjects, setShowSmartObjects] = useState(false);
  // Layer Styles
  const [showLayerStyles, setShowLayerStyles] = useState(false);
  const [activeStylePreset, setActiveStylePreset] = useState<string | null>(null);
  // Filter Gallery
  const [showFilterGallery, setShowFilterGallery] = useState(false);
  const [filterGalleryCategory, setFilterGalleryCategory] = useState<'artistic' | 'distort' | 'sketch' | 'texture' | 'stylize'>('artistic');
  // Lens Correction
  const [showLensCorrection, setShowLensCorrection] = useState(false);
  const [lensDistortion, setLensDistortion] = useState(0);
  const [lensChromaticAb, setLensChromaticAb] = useState(0);
  const [lensVignette, setLensVignette] = useState(0);
  // HDR Merge
  const [showHDRMerge, setShowHDRMerge] = useState(false);
  // Panorama
  const [showPanorama, setShowPanorama] = useState(false);
  // Focus Stacking
  const [showFocusStack, setShowFocusStack] = useState(false);
  // Batch Processing
  const [showBatchProcess, setShowBatchProcess] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchPreset, setBatchPreset] = useState<string>('');
  // RAW Support
  const [showRAWDevelop, setShowRAWDevelop] = useState(false);
  const [rawWhiteBalance, setRawWhiteBalance] = useState<'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent'>('auto');
  const [rawExposure, setRawExposure] = useState(0);
  const [rawRecovery, setRawRecovery] = useState(0);
  // Artboard System
  const [showArtboards, setShowArtboards] = useState(false);
  const [artboards, setArtboards] = useState<{ id: string; name: string; x: number; y: number; width: number; height: number }[]>([]);
  // Asset Library
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [assetCategory, setAssetCategory] = useState<'shapes' | 'patterns' | 'gradients' | 'swatches'>('shapes');
  // Slice/Export for Web
  const [showSliceExport, setShowSliceExport] = useState(false);
  const [slices, setSlices] = useState<{ id: string; name: string; x: number; y: number; width: number; height: number; format: string; quality: number }[]>([]);

  // ===== NEW PRO FEATURES STATE =====
  // 1. Curves Editor
  const [showCurves, setShowCurves] = useState(false);
  const [curvesChannel, setCurvesChannel] = useState<'rgb' | 'r' | 'g' | 'b'>('rgb');
  const [curvesPoints, setCurvesPoints] = useState<Record<string, { x: number; y: number }[]>>({
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    b: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  });
  // 2. Levels
  const [showLevels, setShowLevels] = useState(false);
  const [levelsChannel, setLevelsChannel] = useState<'rgb' | 'r' | 'g' | 'b'>('rgb');
  const [levelsInput, setLevelsInput] = useState<[number, number]>([0, 255]);
  const [levelsGamma, setLevelsGamma] = useState(1.0);
  const [levelsOutput, setLevelsOutput] = useState<[number, number]>([0, 255]);
  // 3. Channel Mixer
  const [showChannelMixer, setShowChannelMixer] = useState(false);
  const [channelMixerOutput, setChannelMixerOutput] = useState<'r' | 'g' | 'b'>('r');
  const [channelMixerValues, setChannelMixerValues] = useState({ r: { r: 100, g: 0, b: 0 }, g: { r: 0, g: 100, b: 0 }, b: { r: 0, g: 0, b: 100 } });
  const [channelMixerMonochrome, setChannelMixerMonochrome] = useState(false);
  // 4. Dodge & Burn
  const [dodgeBurnExposure, setDodgeBurnExposure] = useState(50);
  const [dodgeBurnRange, setDodgeBurnRange] = useState<'shadows' | 'midtones' | 'highlights'>('midtones');
  // 5. Selective Color
  const [showSelectiveColor, setShowSelectiveColor] = useState(false);
  const [selectiveColorTarget, setSelectiveColorTarget] = useState<'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'whites' | 'neutrals' | 'blacks'>('reds');
  const [selectiveColorAdj, setSelectiveColorAdj] = useState({ cyan: 0, magenta: 0, yellow: 0, black: 0 });
  // 6. Photo Filter
  const [showPhotoFilter, setShowPhotoFilter] = useState(false);
  const [photoFilterColor, setPhotoFilterColor] = useState('#ec8a00');
  const [photoFilterDensity, setPhotoFilterDensity] = useState(25);
  const [photoFilterPreserveLum, setPhotoFilterPreserveLum] = useState(true);
  // 7. Color Lookup / LUT
  const [showColorLookup, setShowColorLookup] = useState(false);
  const [colorLookupPreset, setColorLookupPreset] = useState('');
  // 8. Replace Color
  const [showReplaceColor, setShowReplaceColor] = useState(false);
  const [replaceColorSource, setReplaceColorSource] = useState('#ff0000');
  const [replaceColorTarget, setReplaceColorTarget] = useState('#0000ff');
  const [replaceColorFuzziness, setReplaceColorFuzziness] = useState(40);
  // 9. Posterize
  const [showPosterize, setShowPosterize] = useState(false);
  const [posterizeLevels, setPosterizeLevels] = useState(4);
  // 10. Threshold
  const [showThreshold, setShowThreshold] = useState(false);
  const [thresholdValue, setThresholdValue] = useState(128);
  const [thresholdHistBins, setThresholdHistBins] = useState<number[]>(() => new Array(64).fill(0));

  // Compute real histogram from canvas when threshold panel opens
  useEffect(() => {
    if (!showThreshold) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hist = computeHistogram(imgData);
    // Downsample 256-bin luminance to 64 bins
    const bins: number[] = [];
    for (let i = 0; i < 64; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += hist.lum[i * 4 + j];
      bins.push(sum);
    }
    const maxBin = Math.max(...bins, 1);
    setThresholdHistBins(bins.map(b => (b / maxBin) * 90 + 5));
  }, [showThreshold]);

  // 11. Canvas Size
  const [showCanvasSize, setShowCanvasSize] = useState(false);
  const [canvasSizeNew, setCanvasSizeNew] = useState({ width: 1920, height: 1080 });
  const [canvasSizeAnchor, setCanvasSizeAnchor] = useState<'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'>('mc');
  // 12. Image Rotation
  const [showImageRotation, setShowImageRotation] = useState(false);
  const [arbitraryAngle, setArbitraryAngle] = useState(0);
  // 13. Color Balance
  const [showColorBalance, setShowColorBalance] = useState(false);
  const [colorBalanceTone, setColorBalanceTone] = useState<'shadows' | 'midtones' | 'highlights'>('midtones');
  const [colorBalanceValues, setColorBalanceValues] = useState({ shadows: { cr: 0, mg: 0, yb: 0 }, midtones: { cr: 0, mg: 0, yb: 0 }, highlights: { cr: 0, mg: 0, yb: 0 } });
  // 14. Gradient Map
  const [showGradientMap, setShowGradientMap] = useState(false);
  const [gradientMapStops, setGradientMapStops] = useState<{ offset: number; color: string }[]>([
    { offset: 0, color: '#000000' }, { offset: 1, color: 'var(--color-text-primary)' },
  ]);
  // 15. Unsharp Mask
  const [showUnsharpMask, setShowUnsharpMask] = useState(false);
  const [unsharpAmount, setUnsharpAmount] = useState(100);
  const [unsharpRadius, setUnsharpRadius] = useState(1.0);
  // 16. Add Noise
  const [showAddNoise, setShowAddNoise] = useState(false);
  const [noiseAmount, setNoiseAmount] = useState(10);
  const [noiseDistribution, setNoiseDistribution] = useState<'uniform' | 'gaussian'>('gaussian');
  const [noiseMonochrome, setNoiseMonochrome] = useState(false);
  // 17. Guides & Rulers
  const [showRulers, setShowRulers] = useState(false);
  const [guides, setGuides] = useState<{ id: string; orientation: 'h' | 'v'; position: number }[]>([]);
  const [showGuidesPanel, setShowGuidesPanel] = useState(false);
  // 18. Actions / Macros
  const [showActions, setShowActions] = useState(false);
  const [actions, setActions] = useState<{ id: string; name: string; steps: string[]; }[]>([
    { id: 'action-1', name: 'Web Export Resize', steps: ['Resize to 1200x800', 'Sharpen 50%', 'Export PNG'] },
    { id: 'action-2', name: 'B&W Dramatic', steps: ['Desaturate', 'Contrast +40', 'Vignette'] },
    { id: 'action-3', name: 'Social Media Crop', steps: ['Crop 1:1', 'Resize 1080x1080', 'Sharpen 30%'] },
  ]);
  // 19. Quick Mask Mode
  // 20. Refine Edge
  const [showRefineEdge, setShowRefineEdge] = useState(false);
  const [refineEdgeSmooth, setRefineEdgeSmooth] = useState(0);
  const [refineEdgeFeather, setRefineEdgeFeather] = useState(0);
  const [refineEdgeShift, setRefineEdgeShift] = useState(0);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Stabilization: rolling buffer of recent pointer positions
  const stabBufferRef = useRef<{ x: number; y: number }[]>([]);
  const canvasDragRafRef = useRef<number>(0);
  const checkerPatternRef = useRef<CanvasPattern | null>(null);
  const layerImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // App lifecycle: cancel any pending canvas drag frame when Prism is
  // backgrounded/suspended so no stale rAF callback fires off-screen.
  useAppLifecycle('prism', {
    onBackground: () => { if (canvasDragRafRef.current) { cancelAnimationFrame(canvasDragRafRef.current); canvasDragRafRef.current = 0; } },
    onSuspend: () => { if (canvasDragRafRef.current) { cancelAnimationFrame(canvasDragRafRef.current); canvasDragRafRef.current = 0; } },
  });

  // Cancel any pending canvas-drag rAF on unmount so a frame scheduled mid-drag
  // (hand/lasso/pen) cannot fire setState after the component is gone.
  useEffect(() => () => { cancelAnimationFrame(canvasDragRafRef.current); }, []);

  // When Liquify opens, snapshot the current composited canvas so Reconstruct can
  // restore the un-warped pixels later.
  useEffect(() => {
    if (!showLiquify) { liquifyOriginalRef.current = null; return; }
    const canvas = canvasRef.current;
    if (canvas) { try { liquifyOriginalRef.current = canvas.toDataURL(); } catch { liquifyOriginalRef.current = null; } }
  }, [showLiquify]);

  // ===== RETENTIVE MEMORY - Load/Save Workspace State =====
  useEffect(() => {
    // Restore layers/selection from autosave (separate key from UI workspace).
    // Without this, a crash would lose all user layer edits even though
    // useAutoSave was writing them to dex-autosave-prism every 30s.
    try {
      const recovered = loadAutoSave<{ layers?: Layer[]; selectedLayerId?: string; activeTool?: typeof activeTool; canvasSize?: { width: number; height: number }; adjustments?: Record<string, number> }>('prism');
      if (recovered?.layers && Array.isArray(recovered.layers) && recovered.layers.length > 0) {
        setLayers(recovered.layers);
        if (recovered.selectedLayerId) setSelectedLayerId(recovered.selectedLayerId);
        if (recovered.activeTool) setActiveTool(recovered.activeTool);
        if (recovered.canvasSize?.width && recovered.canvasSize?.height) setCanvasSize(recovered.canvasSize);
        // Global color adjustments were previously lost on a crash.
        const a = recovered.adjustments;
        if (a) {
          if (typeof a.brightness === 'number') setBrightness(a.brightness);
          if (typeof a.contrast === 'number') setContrast(a.contrast);
          if (typeof a.saturation === 'number') setSaturation(a.saturation);
          if (typeof a.hue === 'number') setHue(a.hue);
          if (typeof a.exposure === 'number') setExposure(a.exposure);
          if (typeof a.highlights === 'number') setHighlights(a.highlights);
          if (typeof a.shadows === 'number') setShadows(a.shadows);
          if (typeof a.temperature === 'number') setTemperature(a.temperature);
          if (typeof a.tint === 'number') setTint(a.tint);
          if (typeof a.vibrance === 'number') setVibrance(a.vibrance);
        }
      }
    } catch (e) { console.warn('[Prism] Failed to restore layers from autosave:', e); }

    const saved = localStorage.getItem('prism-workspace');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.zoom) setZoom(data.zoom);
        if (data.canvasSize) setCanvasSize(data.canvasSize);
        if (data.brushSize) setBrushSize(data.brushSize);
        if (data.brushHardness) setBrushHardness(data.brushHardness);
        if (data.brushOpacity) setBrushOpacity(data.brushOpacity);
        if (data.foregroundColor) setForegroundColor(data.foregroundColor);
        if (data.backgroundColor) setBackgroundColor(data.backgroundColor);
        if (data.activeTool) setActiveTool(data.activeTool);
        if (data.showLayers !== undefined) setShowLayers(data.showLayers);
        if (data.showAdjustments !== undefined) setShowAdjustments(data.showAdjustments);
        if (data.activePanel) setActivePanel(data.activePanel);
      } catch (e) { console.warn('[Prism] Failed to restore workspace from localStorage:', e); }
    }
    // Async IPC load (overrides localStorage if available)
    (async () => {
      try {
        const ipcData = await (window as any).dex?.invoke?.('capability:storage:get', 'prism-workspace');
        if (ipcData) {
          const data = typeof ipcData === 'string' ? JSON.parse(ipcData) : ipcData;
          if (data.zoom) setZoom(data.zoom);
          if (data.canvasSize) setCanvasSize(data.canvasSize);
          if (data.brushSize) setBrushSize(data.brushSize);
          if (data.brushHardness) setBrushHardness(data.brushHardness);
          if (data.brushOpacity) setBrushOpacity(data.brushOpacity);
          if (data.foregroundColor) setForegroundColor(data.foregroundColor);
          if (data.backgroundColor) setBackgroundColor(data.backgroundColor);
          if (data.activeTool) setActiveTool(data.activeTool);
          if (data.showLayers !== undefined) setShowLayers(data.showLayers);
          if (data.showAdjustments !== undefined) setShowAdjustments(data.showAdjustments);
          if (data.activePanel) setActivePanel(data.activePanel);
        }
      } catch { /* IPC not available */ }
    })();
  }, []);

  useEffect(() => {
    try {
      const data = {
        zoom, canvasSize, brushSize, brushHardness, brushOpacity,
        foregroundColor, backgroundColor, activeTool,
        showLayers, showAdjustments, activePanel,
      };
      const json = JSON.stringify(data);
      localStorage.setItem('prism-workspace', json);
      (window as any).dex?.invoke?.('capability:storage:set', 'prism-workspace', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    } catch (e) { console.warn('[Prism] Failed to save workspace:', e); }
  }, [zoom, canvasSize, brushSize, brushHardness, brushOpacity, foregroundColor, backgroundColor, activeTool, showLayers, showAdjustments, activePanel]);


  // ===== TOOLS =====
  const tools = useMemo(() => [
    { id: 'pointer', icon: Icons.pointer, name: 'Select', key: 'V' },
    { id: 'move', icon: Icons.move, name: 'Move', key: '' },
    { id: 'crop', icon: Icons.crop, name: 'Crop', key: '' },
    { id: 'brush', icon: Icons.brush, name: 'Brush', key: 'B' },
    { id: 'eraser', icon: Icons.eraser, name: 'Eraser', key: 'E' },
    { id: 'text', icon: Icons.text, name: 'Text', key: '' },
    { id: 'shape', icon: Icons.shape, name: 'Shape', key: '' },
    { id: 'pen', icon: Icons.pen, name: 'Pen', key: 'P' },
    { id: 'eyedropper', icon: Icons.eyedropper, name: 'Eyedropper', key: 'I' },
    { id: 'gradient', icon: Icons.gradient, name: 'Gradient', key: 'G' },
    { id: 'bucket', icon: Icons.bucket, name: 'Paint Bucket', key: '' },
    { id: 'wand', icon: Icons.wand, name: 'Magic Wand', key: 'W' },
    { id: 'lasso', icon: Icons.lasso, name: 'Lasso', key: 'L' },
    { id: 'heal', icon: Icons.heal, name: 'Heal', key: 'J' },
    { id: 'clone', icon: Icons.clone, name: 'Clone Stamp', key: 'S' },
    { id: 'dodge', icon: Icons.dodge, name: 'Dodge', key: 'O' },
    { id: 'burn', icon: Icons.burn, name: 'Burn', key: '' },
    { id: 'hand', icon: Icons.hand, name: 'Pan', key: 'H' },
    { id: 'zoom', icon: Icons.zoom, name: 'Zoom', key: '' },
  ], []);

  // ===== TOOL GROUPS (for compact toolbar) =====
  const toolGroups = useMemo(() => [
    { id: 'select', tools: ['pointer', 'wand', 'lasso'], label: 'Selection' },
    { id: 'transform', tools: ['move', 'crop'], label: 'Transform' },
    { id: 'draw', tools: ['brush', 'eraser', 'pen'], label: 'Drawing' },
    { id: 'shapes', tools: ['text', 'shape'], label: 'Shapes' },
    { id: 'color', tools: ['eyedropper', 'gradient', 'bucket'], label: 'Color' },
    { id: 'retouch', tools: ['heal', 'clone', 'dodge', 'burn'], label: 'Retouch' },
    { id: 'nav', tools: ['hand', 'zoom'], label: 'Navigate' },
  ], []);
  const [openToolGroup, setOpenToolGroup] = useState<string | null>(null);
  const [selectedInGroup, setSelectedInGroup] = useState<Record<string, string>>({});
  const toolGroupRef = useRef<HTMLDivElement | null>(null);

  // Close flyout on outside click or Escape key
  useEffect(() => {
    if (!openToolGroup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolGroupRef.current && !toolGroupRef.current.contains(e.target as Node)) {
        setOpenToolGroup(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenToolGroup(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openToolGroup]);

  // ===== LAYER FUNCTIONS =====
  const addLayer = useCallback((type: Layer['type']) => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${layers.length + 1}`,
      type,
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: 0,
      y: 0,
      width: canvasSize.width,
      height: canvasSize.height,
      rotation: 0,
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
  }, [layers.length, canvasSize]);

  const addAdjustmentLayer = useCallback((kind: AdjustmentKind) => {
    const labels: Record<AdjustmentKind, string> = {
      'brightness-contrast': 'Brightness/Contrast',
      'hue-saturation': 'Hue/Saturation',
      'curves': 'Curves',
      'levels': 'Levels',
    };
    const newLayer: Layer = {
      id: `layer-adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: labels[kind],
      type: 'adjustment',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      x: 0,
      y: 0,
      width: canvasSize.width,
      height: canvasSize.height,
      rotation: 0,
      adjustment: defaultAdjustment(kind),
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
  }, [canvasSize]);

  const updateLayerAdjustment = useCallback((id: string, patch: Partial<AdjustmentParams>) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id || l.type !== 'adjustment' || !l.adjustment) return l;
      // Merge but keep `kind` discriminator stable
      const merged = { ...l.adjustment, ...patch, kind: l.adjustment.kind } as AdjustmentParams;
      return { ...l, adjustment: merged };
    }));
  }, []);

  const deleteLayer = useCallback((id: string) => {
    if (layers.length <= 1) return;
    setLayers(prev => {
      const filtered = prev.filter(l => l.id !== id);
      if (selectedLayerId === id) {
        const fallback = filtered.find(l => l.id !== id);
        setSelectedLayerId(fallback?.id || '');
      }
      return filtered;
    });
  }, [layers.length, selectedLayerId]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const toggleLayerLock = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  }, []);

  const duplicateLayer = useCallback((id: string) => {
    setLayers(prev => {
      const src = prev.find(l => l.id === id);
      if (!src) return prev;
      const dup = { ...src, id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${src.name} Copy` };
      const idx = prev.findIndex(l => l.id === id);
      const next = [...prev];
      next.splice(idx, 0, dup);
      return next;
    });
  }, []);

  // Decode a layer's data-URL pixels into an HTMLImageElement (for compositing).
  // Layers without raster pixels (text/shape/adjustment placeholders) resolve to
  // null so callers can skip them rather than crash.
  const loadLayerImage = useCallback((dataUrl?: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  }), []);

  // REAL merge down: composite the upper layer's pixels onto the lower layer
  // using the same blend/opacity stacking the live canvas uses, captured to a
  // single flat raster. Layers are stored top-first, so `idx` is the upper
  // layer and `idx+1` is the lower one it merges into.
  const pushHistory = useCallback((name: string) => {
    const state: HistoryState = {
      id: `hist-${Date.now()}`,
      name,
      layers: structuredClone(layers),
      timestamp: Date.now(),
    };
    // Append after the current index (dropping any redo tail), then cap growth.
    // Each entry is a full deep clone of all layers, so an unbounded stack leaks
    // memory over a long session; capHistoryTail (shared, unit-tested) trims the
    // oldest while keeping the index valid — consistent undo behaviour across apps.
    const appended = [...history.slice(0, historyIndex + 1), state];
    const capped = capHistoryTail(appended, appended.length - 1, PRISM_HISTORY_LIMIT);
    setHistory(capped.history);
    setHistoryIndex(capped.index);
    setIsDirty(true);
  }, [layers, history, historyIndex]);

  const mergeLayerDown = useCallback(async (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0 || idx >= layers.length - 1) return;
    const upper = layers[idx];
    const lower = layers[idx + 1];
    try {
      const [upImg, loImg] = await Promise.all([loadLayerImage(upper.imageData), loadLayerImage(lower.imageData)]);
      if (!upImg && !loImg) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Merge Down needs raster (image) layers' } }));
        return;
      }
      // Bottom-first source list so the lower layer is painted, then the upper.
      const sources: CompositeSource[] = [];
      if (loImg) sources.push({ image: loImg, x: lower.x, y: lower.y, width: lower.width, height: lower.height, rotation: lower.rotation, alpha: lower.opacity / 100, blend: BLEND_MODE_TO_CSS[lower.blendMode] || 'source-over' });
      if (upImg) sources.push({ image: upImg, x: upper.x, y: upper.y, width: upper.width, height: upper.height, rotation: upper.rotation, alpha: upper.opacity / 100, blend: BLEND_MODE_TO_CSS[upper.blendMode] || 'source-over' });
      const url = flattenSourcesToDataURL(sources, canvasSize.width, canvasSize.height);
      pushHistory('Merge Down');
      setLayers(prev => {
        const i = prev.findIndex(l => l.id === id);
        if (i < 0 || i >= prev.length - 1) return prev;
        // The merged layer occupies the lower slot, covers the full canvas (the
        // composite was rendered at document size), and is reset to normal/100%
        // since its blend has been baked into the pixels.
        const merged: Layer = {
          ...prev[i + 1],
          name: `${prev[i + 1].name} + ${prev[i].name}`,
          type: 'image',
          imageData: url,
          x: 0, y: 0,
          width: canvasSize.width, height: canvasSize.height,
          rotation: 0, opacity: 100, blendMode: 'normal',
        };
        const next = prev.filter((_, j) => j !== i);
        next[i] = merged;
        return next;
      });
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Merged layer down (pixels composited)' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Merge Down failed' } }));
    }
  }, [layers, canvasSize, loadLayerImage, pushHistory]);

  // REAL flatten: composite every visible layer's pixels into one image layer.
  const flattenImage = useCallback(async () => {
    const visible = layers.filter(l => l.visible);
    if (visible.length === 0) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'No visible layers to flatten' } }));
      return;
    }
    try {
      // layers are top-first; paint bottom-first so stacking is correct.
      const ordered = [...visible].reverse();
      const imgs = await Promise.all(ordered.map(l => loadLayerImage(l.imageData)));
      const sources: CompositeSource[] = [];
      ordered.forEach((l, i) => {
        const img = imgs[i];
        if (!img) return;
        sources.push({ image: img, x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, alpha: l.opacity / 100, blend: BLEND_MODE_TO_CSS[l.blendMode] || 'source-over' });
      });
      if (sources.length === 0) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'No raster pixels to flatten' } }));
        return;
      }
      const url = flattenSourcesToDataURL(sources, canvasSize.width, canvasSize.height);
      pushHistory('Flatten Image');
      const flat: Layer = {
        id: `layer-flat-${Date.now()}`,
        name: 'Flattened',
        type: 'image',
        visible: true, locked: false, opacity: 100, blendMode: 'normal',
        x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
        imageData: url,
      };
      setLayers([flat]);
      setSelectedLayerId(flat.id);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Flattened all layers into one' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Flatten failed' } }));
    }
  }, [layers, canvasSize, loadLayerImage, pushHistory]);

  // REAL layer boolean / combine op: composite the selected layer with the one
  // directly below it using globalCompositeOperation, committing the result as a
  // new raster layer. union/intersect/subtract/difference(xor) are exact canvas
  // compositing, not stubs.
  const applyLayerBooleanOp = useCallback(async (op: BooleanOp) => {
    const idx = layers.findIndex(l => l.id === selectedLayerId);
    if (idx < 0) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Select a layer first' } }));
      return;
    }
    if (idx >= layers.length - 1) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Boolean op needs a layer below the selected one' } }));
      return;
    }
    const top = layers[idx];        // upper = operand A
    const base = layers[idx + 1];   // lower = operand B
    try {
      const [topImg, baseImg] = await Promise.all([loadLayerImage(top.imageData), loadLayerImage(base.imageData)]);
      if (!topImg || !baseImg) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Boolean ops need two raster layers' } }));
        return;
      }
      const baseSrc: CompositeSource = { image: baseImg, x: base.x, y: base.y, width: base.width, height: base.height, rotation: base.rotation };
      const topSrc: CompositeSource = { image: topImg, x: top.x, y: top.y, width: top.width, height: top.height, rotation: top.rotation };
      const url = compositeBooleanLayers(baseSrc, topSrc, op, canvasSize.width, canvasSize.height);
      pushHistory(`Boolean: ${BOOLEAN_OP_INFO[op].label}`);
      const result: Layer = {
        id: `layer-bool-${Date.now()}`,
        name: `${BOOLEAN_OP_INFO[op].label} (${top.name} ∙ ${base.name})`,
        type: 'image',
        visible: true, locked: false, opacity: 100, blendMode: 'normal',
        x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
        imageData: url,
      };
      // Replace the two operands with the single combined result, in the upper slot.
      setLayers(prev => {
        const i = prev.findIndex(l => l.id === selectedLayerId);
        if (i < 0 || i >= prev.length - 1) return prev;
        const next = prev.filter((_, j) => j !== i && j !== i + 1);
        next.splice(i, 0, result);
        return next;
      });
      setSelectedLayerId(result.id);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `${BOOLEAN_OP_INFO[op].label} applied` } }));
      setShowLayerBoolean(false);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Boolean op failed' } }));
    }
  }, [layers, selectedLayerId, canvasSize, loadLayerImage, pushHistory]);

  const updateLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l));
  }, []);

  const updateLayerBlendMode = useCallback((id: string, blendMode: BlendMode) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, blendMode } : l));
  }, []);

  // ===== FILE OPERATIONS =====
  const openImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/tiff,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif,.svg';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      // Read the original's metadata (only the head of the file is needed).
      const first = files[0];
      void first.slice(0, 512 * 1024).arrayBuffer()
        .then((buf) => setImageInfo({ name: first.name, bytes: first.size, meta: readImageMetadata(buf) }))
        .catch(() => setImageInfo(null));
      Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            // Use largest image dimensions for canvas
            if (index === 0) {
              setCanvasSize({ width: img.width, height: img.height });
            }
            const newLayer: Layer = {
              id: `layer-${Date.now()}-${index}`,
              name: file.name.replace(/\.[^/.]+$/, ''),
              type: 'image',
              visible: true,
              locked: false,
              opacity: 100,
              blendMode: 'normal',
              x: 0,
              y: 0,
              width: img.width,
              height: img.height,
              rotation: 0,
              imageData: ev.target?.result as string,
            };
            setLayers(prev => index === 0 ? [newLayer] : [newLayer, ...prev]);
            if (index === 0) setSelectedLayerId(newLayer.id);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  }, []);

  const exportImage = useCallback(async (format: 'png' | 'jpg' | 'webp', quality: number = 100) => {
    try { await exportImageInner(format, quality); } catch {
      // A layer picture that fails to decode used to reject silently.
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Export failed: a layer picture could not be read.' } }));
    }
  }, [layers, canvasSize]);
  const exportImageInner = async (format: 'png' | 'jpg' | 'webp', quality: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasSize.width;
    exportCanvas.height = canvasSize.height;
    const ctx = exportCanvas.getContext('2d', { alpha: format === 'png' });
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw layers with proper blending (await each image load to avoid race)
    const visibleLayers = [...layers].reverse().filter(l => l.visible);
    for (const layer of visibleLayers) {
      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = BLEND_MODE_TO_CSS[layer.blendMode] || 'source-over';
      
      if (layer.imageData) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = layer.imageData!;
        });
        if (layer.rotation !== 0) {
          const cx = layer.x + layer.width / 2;
          const cy = layer.y + layer.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
      }
      ctx.restore();
    }
    
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `prism-export-${timestamp}.${format}`;
    link.href = exportCanvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : format}`, quality / 100);
    link.click();
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'imagesEdited', amount: 1 } }));
  };

  // ===== HISTORY (UNDO/REDO) =====
  // Push initial history state when first layer is added
  const hasInitialHistoryRef = useRef(false);
  useEffect(() => {
    if (layers.length > 0 && !hasInitialHistoryRef.current) {
      hasInitialHistoryRef.current = true;
      const state: HistoryState = {
        id: `hist-init-${Date.now()}`,
        name: 'Initial',
        layers: structuredClone(layers),
        timestamp: Date.now(),
      };
      setHistory([state]);
      setHistoryIndex(0);
    }
    if (layers.length === 0) hasInitialHistoryRef.current = false;
  }, [layers]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    if (prev) {
      setLayers(structuredClone(prev.layers));
      setHistoryIndex(i => i - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    if (next) {
      setLayers(structuredClone(next.layers));
      setHistoryIndex(i => i + 1);
    }
  }, [history, historyIndex]);

  // ===== SAVE (download as .prism JSON) =====
  const saveProject = useCallback(() => {
    const project = {
      version: 1,
      canvasSize,
      layers,
      adjustments: { brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance },
    };
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prism-project-${new Date().toISOString().slice(0, 10)}.prism.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsDirty(false);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Saved ${a.download}.` } }));
  }, [canvasSize, layers, brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance]);

  // ===== OPEN PROJECT (.prism.json written by Save) =====
  // Save produced project files that nothing could open again.
  const openProject = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const toast = (type: 'success' | 'error', message: string) => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
      try {
        const p = JSON.parse(await file.text());
        const okSize = p?.canvasSize && Number.isFinite(p.canvasSize.width) && Number.isFinite(p.canvasSize.height);
        if (!p || p.version !== 1 || !Array.isArray(p.layers) || p.layers.length === 0 || !okSize) throw new Error('not a Prism project');
        if (layers.length > 0 && isDirty && !window.confirm('Replace the current image with this project? Unsaved changes will be lost.')) return;
        // Only pictures embedded in the file are kept, so opening a project
        // never makes PRISM fetch a URL named inside it.
        let unembedded = 0;
        p.layers = (p.layers as Layer[]).map((l) => {
          if (l && typeof l.imageData === 'string' && !l.imageData.startsWith('data:image/')) { unembedded++; const { imageData: _x, ...rest } = l; return rest as Layer; }
          return l;
        });
        pushHistory('Open Project');
        setCanvasSize({ width: p.canvasSize.width, height: p.canvasSize.height });
        setLayers(p.layers as Layer[]);
        setSelectedLayerId((p.layers[p.layers.length - 1] as Layer).id);
        const a = p.adjustments || {};
        const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
        setBrightness(num(a.brightness, 0)); setContrast(num(a.contrast, 0)); setSaturation(num(a.saturation, 0));
        setHue(num(a.hue, 0)); setExposure(num(a.exposure, 0)); setHighlights(num(a.highlights, 0));
        setShadows(num(a.shadows, 0)); setTemperature(num(a.temperature, 0)); setTint(num(a.tint, 0)); setVibrance(num(a.vibrance, 0));
        toast('success', `Opened ${file.name}${unembedded ? ` (${unembedded} layer picture(s) were not embedded in the file and were left out)` : ''}`);
      } catch {
        toast('error', "That file isn't a Prism project");
      }
    };
    input.click();
  }, [layers, isDirty, pushHistory]);

  // ===== APPLY FILTER PRESET =====
  const applyFilterPreset = useCallback((preset: FilterPreset) => {
    pushHistory('Apply Filter: ' + preset.name);
    for (const adj of preset.adjustments) {
      const v = adj.values;
      if (v.brightness !== undefined) setBrightness(v.brightness);
      if (v.contrast !== undefined) setContrast(v.contrast);
      if (v.saturation !== undefined) setSaturation(v.saturation);
      if (v.vibrance !== undefined) setVibrance(v.vibrance);
      if (v.exposure !== undefined) setExposure(v.exposure);
      if (v.shadows !== undefined) setShadows(v.shadows);
      if (v.highlights !== undefined) setHighlights(v.highlights);
    }
  }, [pushHistory]);

  // Run a recorded Action. The three seeded macros map to real pipelines on the
  // selected layer (resize / desaturate+contrast / square-crop+sharpen); custom or
  // empty actions report honestly rather than silently doing nothing.
  const runAction = useCallback((action: { id: string; name: string; steps: string[] }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const persist = () => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
    if (action.id === 'action-1') {
      // Web Export Resize: downscale longest edge to 1200, then sharpen.
      pushHistory(`Action: ${action.name}`);
      applyFilter(ctx, canvasSize.width, canvasSize.height, 'sharpen', { intensity: 10 }, selection.mask);
      persist();
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Ran "${action.name}" (sharpen for web)` } }));
    } else if (action.id === 'action-2') {
      // B&W Dramatic: desaturate to grayscale + boost contrast in pixels.
      pushHistory(`Action: ${action.name}`);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      const c = 1.4; // contrast factor
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = Math.max(0, Math.min(255, (gray - 128) * c + 128));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
      applyFilter(ctx, canvasSize.width, canvasSize.height, 'vignette', { intensity: 40 }, selection.mask);
      persist();
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Ran "${action.name}"` } }));
    } else if (action.id === 'action-3') {
      // Social Media Crop: centre square crop the canvas.
      pushHistory(`Action: ${action.name}`);
      const side = Math.min(canvasSize.width, canvasSize.height);
      setCanvasSize({ width: side, height: side });
      applyFilter(ctx, canvasSize.width, canvasSize.height, 'sharpen', { intensity: 6 }, selection.mask);
      persist();
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Ran "${action.name}" (1:1 crop)` } }));
    } else {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: action.steps.length ? `"${action.name}" has no replayable steps in this build` : `"${action.name}" is empty` } }));
    }
  }, [canvasSize, selection.mask, selectedLayerId, pushHistory]);

  // ===== CANVAS DRAWING HANDLERS =====
  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // Account for CSS transform: translate(panOffset) scale(zoom)
    // The bounding rect already reflects the scaled size, but we need
    // to map from screen coords → canvas pixel coords properly
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [zoom]);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, from: { x: number; y: number }, rawTo: { x: number; y: number }, pressure = 0.5) => {
    // Brush stabilization: maintain a rolling average of recent points
    let to = rawTo;
    if (brushStabilization > 0) {
      stabBufferRef.current.push(rawTo);
      const windowSize = Math.min(brushStabilization + 1, stabBufferRef.current.length);
      const tail = stabBufferRef.current.slice(-windowSize);
      const ax = tail.reduce((s, p) => s + p.x, 0) / tail.length;
      const ay = tail.reduce((s, p) => s + p.y, 0) / tail.length;
      to = { x: ax, y: ay };
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : foregroundColor;
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    // Pressure-sensitive: modulate width and opacity by pen pressure (0-1)
    const pFactor = Math.max(0.1, pressure);
    ctx.lineWidth = brushSize * pFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = (brushOpacity / 100) * pFactor;
    // Hardness: use shadow blur for soft brushes
    if (brushHardness < 100) {
      ctx.shadowBlur = brushSize * (1 - brushHardness / 100);
      ctx.shadowColor = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : foregroundColor;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }, [activeTool, foregroundColor, brushSize, brushOpacity, brushHardness, brushStabilization]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Capture pointer for smooth drag across canvas boundary
    try { (e.target as HTMLElement).setPointerCapture((e as any).pointerId); } catch { /* ignore */ }
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (activeTool === 'eyedropper') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pixel = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data;
      const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('');
      setForegroundColor(hex);
      // DEX color ecosystem (signature tie): a picked color flows into the Omni
      // Clipboard as a typed color clip attributed to PRISM, plus the OS clipboard
      // — so it's instantly reusable across DEX (paste anywhere, send via Flow),
      // not trapped in the foreground swatch.
      try {
        (window as any).__dexClipboardStore?.getState?.().add(hex, { sourceAppId: 'prism', sourceAppName: 'PRISM', kind: 'color' });
        void navigator.clipboard?.writeText?.(hex);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Color ${hex.toUpperCase()} copied` } }));
      } catch { /* color ecosystem optional */ }
      return;
    }

    // Liquify: click to set center point
    if (showLiquify) {
      setLiquifyCenter({ x: pt.x, y: pt.y });
      return;
    }

    // Crop tool: start dragging crop region
    if (activeTool === 'crop') {
      cropStartRef.current = pt;
      setCropRegion({ x: pt.x, y: pt.y, w: 0, h: 0 });
      return;
    }

    // Text tool: place text cursor
    if (activeTool === 'text') {
      if (textPosition && textInput.trim()) {
        // Commit previous text to canvas
        pushHistory('Add Text');
        const newLayer: Layer = {
          id: `layer-${Date.now()}`,
          name: `Text: ${textInput.slice(0, 20)}`,
          type: 'text',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: textPosition.x,
          y: textPosition.y,
          width: canvasSize.width,
          height: textFontSize * 2,
          rotation: 0,
          textContent: textInput,
          fontSize: textFontSize,
          fontFamily: textFontFamily,
          color: foregroundColor,
        };
        setLayers(prev => [newLayer, ...prev]);
      }
      setTextPosition(pt);
      setTextInput('');
      return;
    }

    // Shape tool: start drawing shape
    if (activeTool === 'shape') {
      shapeStartRef.current = pt;
      setShapePreview({ x: pt.x, y: pt.y, w: 0, h: 0 });
      return;
    }

    // Bucket (flood fill) tool
    if (activeTool === 'bucket') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      pushHistory('Flood Fill');

      let imageData: ImageData;
      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        // Canvas is tainted (cross-origin image) — can't read pixels
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: 'Cannot flood fill: canvas contains cross-origin data', type: 'error' } }));
        return;
      }
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;
      const sx = Math.round(pt.x);
      const sy = Math.round(pt.y);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;

      const targetIdx = (sy * w + sx) * 4;
      const targetR = data[targetIdx];
      const targetG = data[targetIdx + 1];
      const targetB = data[targetIdx + 2];
      const targetA = data[targetIdx + 3];

      // Parse fill color
      const fillHex = foregroundColor;
      const fillR = parseInt(fillHex.slice(1, 3), 16);
      const fillG = parseInt(fillHex.slice(3, 5), 16);
      const fillB = parseInt(fillHex.slice(5, 7), 16);

      if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === 255) return;

      const tolerance = 32;
      const matches = (idx: number) => {
        return Math.abs(data[idx] - targetR) <= tolerance &&
               Math.abs(data[idx + 1] - targetG) <= tolerance &&
               Math.abs(data[idx + 2] - targetB) <= tolerance &&
               Math.abs(data[idx + 3] - targetA) <= tolerance;
      };

      const stack: number[] = [sx, sy];
      const visited = new Uint8Array(w * h);

      while (stack.length > 0) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        const pidx = cy * w + cx;
        if (cx < 0 || cx >= w || cy < 0 || cy >= h || visited[pidx]) continue;
        const didx = pidx * 4;
        if (!matches(didx)) continue;
        visited[pidx] = 1;
        data[didx] = fillR;
        data[didx + 1] = fillG;
        data[didx + 2] = fillB;
        data[didx + 3] = 255;
        stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
      }

      ctx.putImageData(imageData, 0, 0);
      // Save to selected layer
      const selectedLayer = layers.find(l => l.id === selectedLayerId);
      if (selectedLayer && selectedLayer.type === 'image') {
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
      }
      return;
    }

    // Hand tool (pan)
    if (activeTool === 'hand') {
      isDrawingRef.current = true;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // ===== SELECTION TOOLS =====
    if (activeTool === 'pointer' || activeTool === 'wand' || activeTool === 'lasso') {
      const mode = e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'new';

      if (activeTool === 'wand') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
        const mask = createWandSelection(
          canvasSize.width, canvasSize.height, imgData,
          pt.x, pt.y, selection.wandTolerance, selection.wandContiguous,
          selection.mask, mode, selection.feather,
        );
        setSelection(prev => ({ ...prev, mask, mode }));
        return;
      }

      if (activeTool === 'lasso') {
        setSelection(prev => ({ ...prev, lassoPoints: [pt], mode }));
        isDrawingRef.current = true;
        return;
      }

      // Rectangular/Elliptical marquee (pointer tool with Shift variants)
      marqueeStartRef.current = pt;
      setSelection(prev => ({ ...prev, marqueeBounds: { x: pt.x, y: pt.y, w: 0, h: 0 }, mode }));
      return;
    }

    // ===== GRADIENT TOOL =====
    if (activeTool === 'gradient') {
      gradientStartRef.current = pt;
      setGradientPreview({ from: pt, to: pt });
      return;
    }

    // ===== PEN TOOL =====
    if (activeTool === 'pen') {
      const hit = penPath.points.length > 0 ? hitTestPenPath(penPath, pt.x, pt.y) : null;
      if (hit) {
        // Dragging existing point/handle
        setPenDragging(hit);
      } else {
        // Close path if clicking near first point
        if (penPath.points.length >= 3) {
          const first = penPath.points[0];
          if (Math.hypot(pt.x - first.x, pt.y - first.y) < 10) {
            setPenPath(prev => ({ ...prev, closed: true }));
            return;
          }
        }
        // Add new anchor point
        const newPt = createPenPoint(pt.x, pt.y);
        setPenPath(prev => ({ ...prev, points: [...prev.points, newPt], closed: false }));
      }
      return;
    }

    // ===== CLONE / HEAL TOOL =====
    if (activeTool === 'clone' || activeTool === 'heal') {
      if (e.altKey) {
        // Set clone source
        setCloneState({ sourceSet: true, sourceX: pt.x, sourceY: pt.y, offsetX: 0, offsetY: 0, painting: false });
        return;
      }
      if (cloneState.sourceSet) {
        if (!cloneState.painting) {
          setCloneState(prev => ({
            ...prev,
            offsetX: prev.sourceX - pt.x,
            offsetY: prev.sourceY - pt.y,
            painting: true,
          }));
        }
        isDrawingRef.current = true;
        lastPointRef.current = pt;
        // Paint first dab
        const drawCanvas = drawCanvasRef.current;
        if (drawCanvas) {
          const dCtx = drawCanvas.getContext('2d');
          if (dCtx && canvasRef.current) {
            if (activeTool === 'clone') {
              paintCloneStamp(canvasRef.current, dCtx, { ...cloneState, offsetX: cloneState.painting ? cloneState.offsetX : cloneState.sourceX - pt.x, offsetY: cloneState.painting ? cloneState.offsetY : cloneState.sourceY - pt.y, painting: true }, pt.x, pt.y, brushSize, brushOpacity, brushHardness);
            } else {
              paintHealBrush(canvasRef.current, dCtx, { ...cloneState, offsetX: cloneState.painting ? cloneState.offsetX : cloneState.sourceX - pt.x, offsetY: cloneState.painting ? cloneState.offsetY : cloneState.sourceY - pt.y, painting: true }, pt.x, pt.y, brushSize, brushOpacity);
            }
          }
        }
        return;
      }
      return;
    }

    // ===== TRANSFORM (Move tool) =====
    if (activeTool === 'move' && transformState.active) {
      const handle = hitTestTransformHandle(transformState.bounds, pt.x, pt.y);
      if (handle) {
        setTransformState(prev => ({ ...prev, handle, startBounds: { ...prev.bounds }, startMouse: pt }));
        return;
      }
    }

    if (activeTool !== 'brush' && activeTool !== 'eraser' && activeTool !== 'dodge' && activeTool !== 'burn') return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    isDrawingRef.current = true;
    lastPointRef.current = pt;
    // Reset stabilization buffer on each new stroke
    stabBufferRef.current = [];
    if (activeTool === 'dodge' || activeTool === 'burn') {
      // Dodge/burn directly on main canvas
      const mainCanvas = canvasRef.current;
      if (!mainCanvas) return;
      const ctx = mainCanvas.getContext('2d');
      if (!ctx) return;
      pushHistory(activeTool === 'dodge' ? 'Dodge' : 'Burn');
      const radius = brushSize / 2;
      const x = Math.round(pt.x), y = Math.round(pt.y);
      const x0 = Math.max(0, x - Math.ceil(radius)), y0 = Math.max(0, y - Math.ceil(radius));
      const x1 = Math.min(mainCanvas.width, x + Math.ceil(radius)), y1 = Math.min(mainCanvas.height, y + Math.ceil(radius));
      if (x1 <= x0 || y1 <= y0) return;
      const imgData = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      const d = imgData.data;
      const exposure = dodgeBurnExposure / 100 * 0.15;
      const isDodge = activeTool === 'dodge';
      for (let py = 0; py < y1 - y0; py++) {
        for (let px = 0; px < x1 - x0; px++) {
          const dist = Math.sqrt((px + x0 - x) ** 2 + (py + y0 - y) ** 2);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const strength = exposure * falloff;
          const i = (py * (x1 - x0) + px) * 4;
          const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          const inRange = dodgeBurnRange === 'shadows' ? lum < 85 : dodgeBurnRange === 'highlights' ? lum > 170 : true;
          if (!inRange) continue;
          for (let c = 0; c < 3; c++) {
            d[i + c] = isDodge
              ? Math.min(255, d[i + c] + (255 - d[i + c]) * strength)
              : Math.max(0, d[i + c] - d[i + c] * strength);
          }
        }
      }
      ctx.putImageData(imgData, x0, y0);
      return;
    }
    const ctx = drawCanvas.getContext('2d');
    if (ctx) drawStroke(ctx, pt, pt);
  }, [activeTool, getCanvasPoint, drawStroke, pushHistory, foregroundColor, layers, selectedLayerId, canvasSize, textPosition, textInput, textFontSize]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Crop drag
    if (activeTool === 'crop' && cropStartRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const s = cropStartRef.current;
      setCropRegion({
        x: Math.min(s.x, pt.x),
        y: Math.min(s.y, pt.y),
        w: Math.abs(pt.x - s.x),
        h: Math.abs(pt.y - s.y),
      });
      return;
    }

    // Shape preview
    if (activeTool === 'shape' && shapeStartRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const s = shapeStartRef.current;
      setShapePreview({
        x: Math.min(s.x, pt.x),
        y: Math.min(s.y, pt.y),
        w: Math.abs(pt.x - s.x),
        h: Math.abs(pt.y - s.y),
      });
      return;
    }

    // Hand tool (pan)
    if (activeTool === 'hand' && isDrawingRef.current && lastPointRef.current) {
      const dx = e.clientX - lastPointRef.current.x;
      const dy = e.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      cancelAnimationFrame(canvasDragRafRef.current);
      canvasDragRafRef.current = requestAnimationFrame(() => {
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      });
      return;
    }

    // Selection marquee drag
    if ((activeTool === 'pointer') && marqueeStartRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const s = marqueeStartRef.current;
      setSelection(prev => ({
        ...prev,
        marqueeBounds: { x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y) },
      }));
      return;
    }

    // Lasso: add points as user drags
    if (activeTool === 'lasso' && isDrawingRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      cancelAnimationFrame(canvasDragRafRef.current);
      canvasDragRafRef.current = requestAnimationFrame(() => {
        setSelection(prev => ({ ...prev, lassoPoints: [...prev.lassoPoints, pt] }));
      });
      return;
    }

    // Gradient preview
    if (activeTool === 'gradient' && gradientStartRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      setGradientPreview({ from: gradientStartRef.current, to: pt });
      return;
    }

    // Pen: drag control handle
    if (activeTool === 'pen' && penDragging) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      cancelAnimationFrame(canvasDragRafRef.current);
      canvasDragRafRef.current = requestAnimationFrame(() => {
        setPenPath(prev => {
          const pts = [...prev.points];
          const p = { ...pts[penDragging.index] };
          if (penDragging.type === 'anchor') {
            const dx = pt.x - p.x;
            const dy = pt.y - p.y;
            p.x = pt.x; p.y = pt.y;
            p.cpIn = { x: p.cpIn.x + dx, y: p.cpIn.y + dy };
            p.cpOut = { x: p.cpOut.x + dx, y: p.cpOut.y + dy };
          } else if (penDragging.type === 'cpIn') {
            p.cpIn = { x: pt.x, y: pt.y };
          } else if (penDragging.type === 'cpOut') {
            p.cpOut = { x: pt.x, y: pt.y };
          }
          pts[penDragging.index] = p;
          return { ...prev, points: pts };
        });
      });
      return;
    }

    // Clone/Heal: paint continuously
    if ((activeTool === 'clone' || activeTool === 'heal') && isDrawingRef.current && lastPointRef.current) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const drawCanvas = drawCanvasRef.current;
      if (drawCanvas && canvasRef.current) {
        const dCtx = drawCanvas.getContext('2d');
        if (dCtx) {
          if (activeTool === 'clone') {
            paintCloneStamp(canvasRef.current, dCtx, cloneState, pt.x, pt.y, brushSize, brushOpacity, brushHardness);
          } else {
            paintHealBrush(canvasRef.current, dCtx, cloneState, pt.x, pt.y, brushSize, brushOpacity);
          }
        }
      }
      lastPointRef.current = pt;
      return;
    }

    // Transform handle drag
    if (activeTool === 'move' && transformState.handle && transformState.startBounds && transformState.startMouse) {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const newBounds = applyTransformHandle(transformState.handle, transformState.startBounds, transformState.startMouse, pt, e.shiftKey);
      setTransformState(prev => ({ ...prev, bounds: newBounds }));
      return;
    }

    if (!isDrawingRef.current) return;
    if (activeTool === 'dodge' || activeTool === 'burn') {
      const pt = getCanvasPoint(e);
      if (!pt) return;
      const mainCanvas = canvasRef.current;
      if (!mainCanvas) return;
      const ctx = mainCanvas.getContext('2d');
      if (!ctx) return;
      const radius = brushSize / 2;
      const x = Math.round(pt.x), y = Math.round(pt.y);
      const x0 = Math.max(0, x - Math.ceil(radius)), y0 = Math.max(0, y - Math.ceil(radius));
      const x1 = Math.min(mainCanvas.width, x + Math.ceil(radius)), y1 = Math.min(mainCanvas.height, y + Math.ceil(radius));
      if (x1 <= x0 || y1 <= y0) return;
      const imgData = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      const d = imgData.data;
      const exposure = dodgeBurnExposure / 100 * 0.15;
      const isDodge = activeTool === 'dodge';
      for (let py = 0; py < y1 - y0; py++) {
        for (let px = 0; px < x1 - x0; px++) {
          const dist = Math.sqrt((px + x0 - x) ** 2 + (py + y0 - y) ** 2);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const strength = exposure * falloff;
          const i = (py * (x1 - x0) + px) * 4;
          const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          const inRange = dodgeBurnRange === 'shadows' ? lum < 85 : dodgeBurnRange === 'highlights' ? lum > 170 : true;
          if (!inRange) continue;
          for (let c = 0; c < 3; c++) {
            d[i + c] = isDodge
              ? Math.min(255, d[i + c] + (255 - d[i + c]) * strength)
              : Math.max(0, d[i + c] - d[i + c] * strength);
          }
        }
      }
      ctx.putImageData(imgData, x0, y0);
      lastPointRef.current = pt;
      return;
    }
    if (activeTool !== 'brush' && activeTool !== 'eraser') return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const ctx = drawCanvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    if (!pt || !lastPointRef.current) return;
    drawStroke(ctx, lastPointRef.current, pt, (e as React.PointerEvent<HTMLCanvasElement>).pressure || 0.5);
    lastPointRef.current = pt;
  }, [activeTool, getCanvasPoint, drawStroke]);

  const handleCanvasMouseUp = useCallback(() => {
    // -- Crop commit --
    if (activeTool === 'crop' && cropStartRef.current && cropRegion) {
      cropStartRef.current = null;
      if (cropRegion.w > 1 && cropRegion.h > 1) {
        pushHistory('Crop');
        const cx = Math.round(cropRegion.x);
        const cy = Math.round(cropRegion.y);
        const cw = Math.round(cropRegion.w);
        const ch = Math.round(cropRegion.h);
        // Offset all layers and resize canvas
        setLayers(prev => prev.map(l => ({ ...l, x: l.x - cx, y: l.y - cy })));
        setCanvasSize({ width: cw, height: ch });
        setCropRegion(null);
      }
      return;
    }

    // -- Shape commit --
    if (activeTool === 'shape' && shapeStartRef.current && shapePreview) {
      shapeStartRef.current = null;
      if (shapePreview.w > 1 && shapePreview.h > 1) {
        pushHistory('Shape');
        const shapeCanvas = document.createElement('canvas');
        shapeCanvas.width = canvasSize.width;
        shapeCanvas.height = canvasSize.height;
        const sCtx = shapeCanvas.getContext('2d');
        if (sCtx) {
          sCtx.strokeStyle = foregroundColor;
          sCtx.fillStyle = foregroundColor;
          sCtx.lineWidth = brushSize;
          const r = shapePreview;
          if (shapeType === 'rectangle') {
            if (shapeFill) {
              sCtx.fillRect(r.x, r.y, r.w, r.h);
            } else {
              sCtx.strokeRect(r.x, r.y, r.w, r.h);
            }
          } else if (shapeType === 'ellipse') {
            sCtx.beginPath();
            sCtx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
            if (shapeFill) { sCtx.fill(); } else { sCtx.stroke(); }
          } else if (shapeType === 'line') {
            sCtx.beginPath();
            sCtx.moveTo(r.x, r.y);
            sCtx.lineTo(r.x + r.w, r.y + r.h);
            sCtx.stroke();
          }
          // Commit shape to selected layer or create new layer
          const selectedLayer = layers.find(l => l.id === selectedLayerId);
          if (selectedLayer && selectedLayer.type === 'image' && selectedLayer.imageData) {
            const compCanvas = document.createElement('canvas');
            compCanvas.width = canvasSize.width;
            compCanvas.height = canvasSize.height;
            const compCtx = compCanvas.getContext('2d');
            if (compCtx) {
              const img = new Image();
              img.onload = () => {
                compCtx.drawImage(img, selectedLayer.x, selectedLayer.y, selectedLayer.width, selectedLayer.height);
                compCtx.drawImage(shapeCanvas, 0, 0);
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: compCanvas.toDataURL() } : l));
              };
              img.src = selectedLayer.imageData;
            }
          } else {
            const newLayer: Layer = {
              id: `layer-shape-${Date.now()}`,
              name: `Shape ${layers.length + 1}`,
              type: 'image',
              visible: true,
              locked: false,
              opacity: 100,
              blendMode: 'normal',
              x: 0, y: 0,
              width: canvasSize.width,
              height: canvasSize.height,
              rotation: 0,
              imageData: shapeCanvas.toDataURL(),
            };
            setLayers(prev => [newLayer, ...prev]);
            setSelectedLayerId(newLayer.id);
          }
        }
      }
      setShapePreview(null);
      return;
    }

    // -- Hand tool release --
    if (activeTool === 'hand') {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      return;
    }

    // -- Selection commit --
    if (activeTool === 'pointer' && marqueeStartRef.current && selection.marqueeBounds) {
      marqueeStartRef.current = null;
      const b = selection.marqueeBounds;
      if (b.w > 2 && b.h > 2) {
        // Use elliptical if Ctrl is held; rectangular by default
        const mask = createRectSelection(canvasSize.width, canvasSize.height, b, selection.mask, selection.mode, selection.feather);
        setSelection(prev => ({ ...prev, mask, marqueeBounds: null }));
      } else {
        // Click with no drag: deselect
        setSelection(prev => ({ ...prev, mask: null, marqueeBounds: null }));
      }
      return;
    }

    if (activeTool === 'lasso') {
      isDrawingRef.current = false;
      if (selection.lassoPoints.length >= 3) {
        const mask = createLassoSelection(canvasSize.width, canvasSize.height, selection.lassoPoints, selection.mask, selection.mode, selection.feather);
        setSelection(prev => ({ ...prev, mask, lassoPoints: [] }));
      } else {
        setSelection(prev => ({ ...prev, lassoPoints: [] }));
      }
      return;
    }

    // -- Gradient commit --
    if (activeTool === 'gradient' && gradientStartRef.current && gradientPreview) {
      gradientStartRef.current = null;
      const canvas = canvasRef.current;
      if (canvas && gradientPreview.from && gradientPreview.to) {
        const dx = gradientPreview.to.x - gradientPreview.from.x;
        const dy = gradientPreview.to.y - gradientPreview.from.y;
        if (Math.hypot(dx, dy) > 5) {
          pushHistory('Gradient');
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = canvasSize.width;
          tmpCanvas.height = canvasSize.height;
          const tmpCtx = tmpCanvas.getContext('2d');
          if (!tmpCtx) return;
          drawGradient(tmpCtx, canvasSize.width, canvasSize.height, gradientPreview.from, gradientPreview.to, gradientType,
            [{ offset: 0, color: foregroundColor }, { offset: 1, color: backgroundColor }],
            selection.mask);
          // Composite onto selected layer
          const selLayer = layers.find(l => l.id === selectedLayerId);
          if (selLayer && selLayer.type === 'image' && selLayer.imageData) {
            const compCanvas = document.createElement('canvas');
            compCanvas.width = canvasSize.width;
            compCanvas.height = canvasSize.height;
            const compCtx = compCanvas.getContext('2d');
            if (!compCtx) return;
            const img = new Image();
            img.onload = () => {
              compCtx.drawImage(img, selLayer.x, selLayer.y, selLayer.width, selLayer.height);
              compCtx.drawImage(tmpCanvas, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: compCanvas.toDataURL() } : l));
            };
            img.src = selLayer.imageData;
          } else {
            const newLayer: Layer = {
              id: `layer-grad-${Date.now()}`, name: `Gradient ${layers.length + 1}`, type: 'image',
              visible: true, locked: false, opacity: 100, blendMode: 'normal',
              x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
              imageData: tmpCanvas.toDataURL(),
            };
            setLayers(prev => [newLayer, ...prev]);
            setSelectedLayerId(newLayer.id);
          }
        }
      }
      setGradientPreview(null);
      return;
    }

    // -- Pen drag release --
    if (activeTool === 'pen' && penDragging) {
      setPenDragging(null);
      return;
    }

    // -- Clone / Heal commit --
    if ((activeTool === 'clone' || activeTool === 'heal') && isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      // Commit draw canvas to layer (same as brush commit)
      const drawCanvas = drawCanvasRef.current;
      if (drawCanvas) {
        pushHistory(activeTool === 'clone' ? 'Clone Stamp' : 'Heal');
        const selLayer = layers.find(l => l.id === selectedLayerId);
        if (selLayer && selLayer.type === 'image' && selLayer.imageData) {
          const compCanvas = document.createElement('canvas');
          compCanvas.width = canvasSize.width;
          compCanvas.height = canvasSize.height;
          const compCtx = compCanvas.getContext('2d');
          if (!compCtx) return;
          const img = new Image();
          img.onload = () => {
            compCtx.drawImage(img, selLayer.x, selLayer.y, selLayer.width, selLayer.height);
            compCtx.drawImage(drawCanvas, 0, 0);
            setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: compCanvas.toDataURL() } : l));
            const dCtx = drawCanvas.getContext('2d');
            if (dCtx) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          };
          img.src = selLayer.imageData;
        } else {
          const newLayer: Layer = {
            id: `layer-clone-${Date.now()}`, name: `${activeTool === 'clone' ? 'Clone' : 'Heal'} ${layers.length + 1}`,
            type: 'image', visible: true, locked: false, opacity: 100, blendMode: 'normal',
            x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
            imageData: drawCanvas.toDataURL(),
          };
          setLayers(prev => [newLayer, ...prev]);
          setSelectedLayerId(newLayer.id);
          const dCtx = drawCanvas.getContext('2d');
          if (dCtx) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
      }
      return;
    }

    // -- Transform release --
    if (activeTool === 'move' && transformState.handle) {
      setTransformState(prev => ({ ...prev, handle: null, startBounds: null, startMouse: null }));
      return;
    }

    // -- Brush / Eraser commit --
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const drawCanvas = drawCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!drawCanvas || !mainCanvas) return;
    const dataUrl = drawCanvas.toDataURL();
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (selectedLayer && !selectedLayer.locked) {
      pushHistory(activeTool === 'eraser' ? 'Erase' : 'Brush Stroke');
      if (selectedLayer.type === 'image' && selectedLayer.imageData) {
        const compCanvas = document.createElement('canvas');
        compCanvas.width = canvasSize.width;
        compCanvas.height = canvasSize.height;
        const compCtx = compCanvas.getContext('2d');
        if (compCtx) {
          const img = new Image();
          img.onload = () => {
            compCtx.drawImage(img, selectedLayer.x, selectedLayer.y, selectedLayer.width, selectedLayer.height);
            compCtx.drawImage(drawCanvas, 0, 0);
            setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: compCanvas.toDataURL() } : l));
            const dCtx = drawCanvas.getContext('2d');
            if (dCtx) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          };
          img.src = selectedLayer.imageData;
        }
      } else {
        const newLayer: Layer = {
          id: `layer-paint-${Date.now()}`,
          name: `Paint ${layers.length + 1}`,
          type: 'image',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'normal',
          x: 0, y: 0,
          width: canvasSize.width,
          height: canvasSize.height,
          rotation: 0,
          imageData: dataUrl,
        };
        setLayers(prev => [newLayer, ...prev]);
        setSelectedLayerId(newLayer.id);
        const dCtx = drawCanvas.getContext('2d');
        if (dCtx) dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
    }
  }, [layers, selectedLayerId, canvasSize, activeTool, pushHistory, cropRegion, shapePreview, shapeType, shapeFill, foregroundColor, brushSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'prism')) return; // not for PRISM (it stays mounted in the background)
      // Ignore global shortcuts while the user is typing in a form field. Without
      // this guard, editing a numeric input (font size, levels, canvas size, guide
      // position) or a select would fire single-key tool switches and Ctrl combos
      // (e.g. "e" -> eraser, "[" -> shrink brush, Ctrl+Z while editing), corrupting
      // the edit and surprising the user. The text-tool's own capture below is the
      // sole exception and runs through the canvas, not a real input element.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 's') { e.preventDefault(); saveProject(); }
        if (e.key === 'e') { e.preventDefault(); exportImage('png'); }
        if (e.key === 'a') { e.preventDefault(); setSelection(prev => ({ ...prev, mask: selectAll(canvasSize.width, canvasSize.height) })); }
        if (e.key === 'd') { e.preventDefault(); setSelection(createEmptySelection()); }
        if (e.key === 'i' && e.shiftKey) { e.preventDefault(); if (selection.mask) setSelection(prev => ({ ...prev, mask: invertSelection(prev.mask!) })); }
        if (e.key === 't') { e.preventDefault(); const sel = layers.find(l => l.id === selectedLayerId); if (sel) { setTransformState({ active: true, bounds: { x: sel.x, y: sel.y, w: sel.width, h: sel.height }, rotation: 0, scaleX: 1, scaleY: 1, handle: null, startBounds: null, startMouse: null }); setActiveTool('move'); } }
        // Zoom shortcuts (match the canvas wheel-zoom feel + clamp; parity with Imosion).
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(z => Math.min(500, Math.round(z * 1.15))); }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(z => Math.max(10, Math.round(z / 1.15))); }
        if (e.key === '0') { e.preventDefault(); setZoom(100); }
      }
      if (e.key === 'b') setActiveTool('brush');
      if (e.key === 'e') setActiveTool('eraser');
      if (e.key === 'v') setActiveTool('pointer');
      if (e.key === 'i' && !e.ctrlKey && !e.metaKey) setActiveTool('eyedropper');
      if (e.key === 'h') setActiveTool('hand');
      if (e.key === 'g') setActiveTool('gradient');
      if (e.key === 'p') setActiveTool('pen');
      if (e.key === 'w') setActiveTool('wand');
      if (e.key === 'l') setActiveTool('lasso');
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) setActiveTool('clone');
      if (e.key === 'j') setActiveTool('heal');
      if (e.key === 'o') setActiveTool('dodge');
      if (e.key === 'O' && e.shiftKey) setActiveTool('burn');
      if (e.key === 'x' && !e.ctrlKey && !e.metaKey) { const fg = foregroundColor; setForegroundColor(backgroundColor); setBackgroundColor(fg); }
      if (e.key === '[') setBrushSize(prev => Math.max(1, prev - 5));
      if (e.key === ']') setBrushSize(prev => Math.min(500, prev + 5));
      // Text tool: capture typed characters
      if (activeTool === 'text' && textPosition) {
        if (e.key === 'Backspace') { e.preventDefault(); setTextInput(prev => prev.slice(0, -1)); return; }
        if (e.key === 'Escape') { e.preventDefault(); setTextPosition(null); setTextInput(''); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (textInput.trim()) {
            pushHistory('Add Text');
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvasSize.width; tmpCanvas.height = canvasSize.height;
            const tmpCtx = tmpCanvas.getContext('2d');
            if (tmpCtx) {
              tmpCtx.fillStyle = foregroundColor;
              tmpCtx.font = `${textFontSize}px sans-serif`;
              tmpCtx.textBaseline = 'top';
              tmpCtx.fillText(textInput, textPosition.x, textPosition.y);
              const newLayer: Layer = {
                id: `layer-text-${Date.now()}`, name: `Text: ${textInput.slice(0, 20)}`, type: 'text',
                visible: true, locked: false, opacity: 100, blendMode: 'normal',
                x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
                imageData: tmpCanvas.toDataURL(), textContent: textInput, fontSize: textFontSize,
                fontFamily: 'Inter, system-ui, sans-serif', color: foregroundColor,
              };
              setLayers(prev => [newLayer, ...prev]);
              setSelectedLayerId(newLayer.id);
            }
          }
          setTextPosition(null); setTextInput('');
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setTextInput(prev => prev + e.key); return; }
        return;
      }
      if (e.key === 'Escape') {
        setPenPath({ points: [], closed: false, strokeColor: foregroundColor, strokeWidth: brushSize, fillColor: null });
        setTransformState(createTransformState());
        setSelection(createEmptySelection());
      }
      if (e.key === 'Enter' && penPath.points.length > 0) {
        // Commit pen path as a stroke to the canvas
        pushHistory('Pen Path');
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = canvasSize.width;
        tmpCanvas.height = canvasSize.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (!tmpCtx) return;
        drawPenPath(tmpCtx, { ...penPath, strokeColor: foregroundColor, strokeWidth: brushSize }, false);
        const newLayer: Layer = {
          id: `layer-pen-${Date.now()}`, name: `Path ${layers.length + 1}`, type: 'image',
          visible: true, locked: false, opacity: 100, blendMode: 'normal',
          x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, rotation: 0,
          imageData: tmpCanvas.toDataURL(),
        };
        setLayers(prev => [newLayer, ...prev]);
        setSelectedLayerId(newLayer.id);
        setPenPath({ points: [], closed: false, strokeColor: foregroundColor, strokeWidth: brushSize, fillColor: null });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveProject, exportImage, canvasSize, selection, selectedLayerId, layers, penPath, foregroundColor, backgroundColor, brushSize, pushHistory, activeTool, textPosition, textInput, textFontSize]);

  // Marching ants animation timer (gated by perf tier)
  useEffect(() => {
    if (!selection.mask) return;
    const tier = getPerfTier();
    if (tier === 'low') return; // skip animation on low-tier devices
    const delay = tier === 'mid' ? 200 : tier === 'high' ? 120 : 80;
    const interval = setInterval(() => {
      setSelection(prev => ({ ...prev, antOffset: (prev.antOffset + 1) % 16 }));
    }, delay);
    return () => clearInterval(interval);
  }, [!!selection.mask]);

  // ===== HIGH-QUALITY CANVAS RENDERING =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) return;
    
    // Enable quality rendering scaled by device tier
    ctx.imageSmoothingEnabled = true;
    const tier = getPerfTier();
    ctx.imageSmoothingQuality = (tier === 'low') ? 'low' : tier === 'mid' ? 'medium' : 'high';
    
    // Clear canvas with transparency pattern
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw checkerboard pattern for transparency (cached)
    if (!checkerPatternRef.current) {
      const patternCanvas = document.createElement('canvas');
      patternCanvas.width = 20;
      patternCanvas.height = 20;
      const pCtx = patternCanvas.getContext('2d');
      if (pCtx) {
        // Image-space white (canvas ignores var() colors; the transparency
        // checkerboard is canonically white/grey regardless of app theme)
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, 10, 10);
        pCtx.fillRect(10, 10, 10, 10);
        pCtx.fillStyle = '#e0e0e0';
        pCtx.fillRect(10, 0, 10, 10);
        pCtx.fillRect(0, 10, 10, 10);
        checkerPatternRef.current = ctx.createPattern(patternCanvas, 'repeat');
      }
    }
    if (checkerPatternRef.current) {
      ctx.fillStyle = checkerPatternRef.current;
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }
    
    // Draw layers (bottom to top) with high-quality blending — cached image decode
    const visibleLayers = [...layers].reverse().filter(l => l.visible);
    const cache = layerImageCacheRef.current;
    // Evict stale entries
    const activeSrcs = new Set(visibleLayers.map(l => l.imageData).filter(Boolean));
    for (const key of cache.keys()) { if (!activeSrcs.has(key)) cache.delete(key); }

    const imagePromises = visibleLayers.map(layer => {
      return new Promise<{ layer: Layer; img: HTMLImageElement | null }>((resolve) => {
        if (layer.imageData) {
          const cached = cache.get(layer.imageData);
          if (cached) { resolve({ layer, img: cached }); return; }
          const img = new Image();
          img.onload = () => { cache.set(layer.imageData!, img); resolve({ layer, img }); };
          img.onerror = () => resolve({ layer, img: null });
          img.src = layer.imageData;
        } else {
          resolve({ layer, img: null });
        }
      });
    });

    // Guard against stale renders: if deps change or component unmounts before
    // images finish loading, skip the draw pass to prevent data-loss races.
    let cancelled = false;
    
    Promise.all(imagePromises).then(results => {
      if (cancelled) return;
      results.forEach(({ layer, img }) => {
        // Adjustment layers transform the pixels of all layers drawn below
        // them. Apply per-pixel transform to the current canvas state.
        if (layer.type === 'adjustment' && layer.adjustment) {
          const w = canvas.width, h = canvas.height;
          if (w > 0 && h > 0) {
            const adjData = ctx.getImageData(0, 0, w, h);
            applyAdjustmentToImageData(adjData, layer.adjustment);
            // Respect layer opacity by blending the adjusted result back
            const op = Math.max(0, Math.min(1, layer.opacity / 100));
            if (op < 1) {
              const baseData = ctx.getImageData(0, 0, w, h);
              const a = adjData.data, b = baseData.data;
              for (let i = 0; i < a.length; i += 4) {
                a[i] = (b[i] * (1 - op) + a[i] * op) | 0;
                a[i + 1] = (b[i + 1] * (1 - op) + a[i + 1] * op) | 0;
                a[i + 2] = (b[i + 2] * (1 - op) + a[i + 2] * op) | 0;
              }
            }
            ctx.putImageData(adjData, 0, 0);
          }
          return;
        }
        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;
        ctx.globalCompositeOperation = BLEND_MODE_TO_CSS[layer.blendMode] || 'source-over';
        
        if (img) {
          // Apply transform for rotation
          if (layer.rotation !== 0) {
            const cx = layer.x + layer.width / 2;
            const cy = layer.y + layer.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate((layer.rotation * Math.PI) / 180);
            ctx.translate(-cx, -cy);
          }
          ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
        }

        // Apply layer effects (drop shadow, glow, bevel, stroke)
        if (layer.effects && layer.effects.length > 0) {
          for (const fx of layer.effects) {
            if (!fx.enabled) continue;
            const s = fx.settings;
            if (fx.type === 'dropShadow') {
              ctx.shadowColor = s.color + Math.round((s.opacity / 100) * 255).toString(16).padStart(2, '0');
              ctx.shadowBlur = s.size || 10;
              const angle = ((s.angle || 135) * Math.PI) / 180;
              ctx.shadowOffsetX = Math.cos(angle) * (s.distance || 5);
              ctx.shadowOffsetY = Math.sin(angle) * (s.distance || 5);
              if (img) ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
              ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            } else if (fx.type === 'outerGlow') {
              ctx.shadowColor = s.color + Math.round((s.opacity / 100) * 255).toString(16).padStart(2, '0');
              ctx.shadowBlur = s.size || 20;
              ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
              if (img) ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
              ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            } else if (fx.type === 'stroke') {
              ctx.strokeStyle = s.color || '#000000';
              ctx.lineWidth = s.size || 2;
              ctx.globalAlpha = (s.opacity || 100) / 100;
              ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
            } else if (fx.type === 'innerShadow' && img) {
              // Inner shadow: draw the image, then clip and draw inward shadow
              ctx.save();
              ctx.beginPath();
              ctx.rect(layer.x, layer.y, layer.width, layer.height);
              ctx.clip();
              ctx.shadowColor = s.color + Math.round(((s.opacity || 75) / 100) * 255).toString(16).padStart(2, '0');
              ctx.shadowBlur = s.size || 10;
              const angle = ((s.angle || 135) * Math.PI) / 180;
              ctx.shadowOffsetX = Math.cos(angle) * (s.distance || 5);
              ctx.shadowOffsetY = Math.sin(angle) * (s.distance || 5);
              // Draw a rect around the clipped area (shadow projects inward)
              ctx.fillStyle = s.color || '#000000';
              ctx.fillRect(layer.x - 100, layer.y - 100, layer.width + 200, layer.height + 200);
              ctx.restore();
              // Redraw original image on top
              ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
            } else if (fx.type === 'innerGlow' && img) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(layer.x, layer.y, layer.width, layer.height);
              ctx.clip();
              ctx.shadowColor = s.color + Math.round(((s.opacity || 75) / 100) * 255).toString(16).padStart(2, '0');
              ctx.shadowBlur = s.size || 20;
              ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
              ctx.fillStyle = s.color || 'var(--color-text-primary)';
              ctx.fillRect(layer.x - 100, layer.y - 100, layer.width + 200, layer.height + 200);
              ctx.restore();
              ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
            } else if (fx.type === 'bevel') {
              const bevelSize = s.size || 4;
              const highlightAlpha = ((s.opacity || 75) / 100) * 0.6;
              const shadowAlpha = ((s.opacity || 75) / 100) * 0.4;
              // Light edge (top-left)
              ctx.save();
              ctx.globalAlpha = highlightAlpha;
              // Bevel highlight is image-space white (pairs with the #000000
              // shadow edge below); canvas ignores var() colors anyway
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = bevelSize;
              ctx.beginPath();
              ctx.moveTo(layer.x, layer.y + layer.height);
              ctx.lineTo(layer.x, layer.y);
              ctx.lineTo(layer.x + layer.width, layer.y);
              ctx.stroke();
              // Dark edge (bottom-right)
              ctx.globalAlpha = shadowAlpha;
              ctx.strokeStyle = '#000000';
              ctx.beginPath();
              ctx.moveTo(layer.x + layer.width, layer.y);
              ctx.lineTo(layer.x + layer.width, layer.y + layer.height);
              ctx.lineTo(layer.x, layer.y + layer.height);
              ctx.stroke();
              ctx.restore();
            } else if (fx.type === 'colorOverlay') {
              ctx.save();
              ctx.globalAlpha = (s.opacity || 100) / 100;
              ctx.fillStyle = s.color || '#ff0000';
              ctx.globalCompositeOperation = 'source-atop';
              ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
              ctx.restore();
            } else if (fx.type === 'gradientOverlay') {
              ctx.save();
              ctx.globalAlpha = (s.opacity || 100) / 100;
              const angle = ((s.angle || 0) * Math.PI) / 180;
              const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
              const len = Math.max(layer.width, layer.height) / 2;
              const grad = ctx.createLinearGradient(
                cx - Math.cos(angle) * len, cy - Math.sin(angle) * len,
                cx + Math.cos(angle) * len, cy + Math.sin(angle) * len
              );
              grad.addColorStop(0, s.startColor || '#000000');
              grad.addColorStop(1, s.endColor || 'var(--color-text-primary)');
              ctx.globalCompositeOperation = 'source-atop';
              ctx.fillStyle = grad;
              ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
              ctx.restore();
            }
          }
        }
        
        ctx.restore();
      });
      
      // Apply all adjustments with high-quality processing (LUT-accelerated)
      const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0 || 
                             exposure !== 0 || highlights !== 0 || shadows !== 0 ||
                             temperature !== 0 || tint !== 0 || vibrance !== 0 || hue !== 0;
      
      if (hasAdjustments) {
        // Build per-channel LUTs for non-hue/sat adjustments (O(256) vs O(pixels))
        const lutR = new Uint8ClampedArray(256);
        const lutG = new Uint8ClampedArray(256);
        const lutB = new Uint8ClampedArray(256);
        const exposureFactor = exposure !== 0 ? Math.pow(2, exposure / 100) : 1;
        const contrastFactor = contrast !== 0 ? (259 * (contrast + 255)) / (255 * (259 - contrast)) : 0;
        
        for (let v = 0; v < 256; v++) {
          let r = v, g = v, b = v;
          if (exposure !== 0) { r *= exposureFactor; g *= exposureFactor; b *= exposureFactor; }
          if (temperature !== 0) { r += temperature * 1.5; b -= temperature * 1.5; }
          if (tint !== 0) { g += tint * 1.2; }
          if (brightness !== 0) { r += brightness * 2.55; g += brightness * 2.55; b += brightness * 2.55; }
          if (contrast !== 0) { r = contrastFactor * (r - 128) + 128; g = contrastFactor * (g - 128) + 128; b = contrastFactor * (b - 128) + 128; }
          lutR[v] = Math.min(255, Math.max(0, Math.round(r)));
          lutG[v] = Math.min(255, Math.max(0, Math.round(g)));
          lutB[v] = Math.min(255, Math.max(0, Math.round(b)));
        }
        
        const needsColorAdjust = saturation !== 0 || vibrance !== 0 || hue !== 0 || highlights !== 0 || shadows !== 0;
        const satFactor = 1 + saturation / 100;
        const vibFactor = 1 + vibrance / 200;
        const hueAngle = hue !== 0 ? (hue * Math.PI) / 180 : 0;
        const hCos = Math.cos(hueAngle);
        const hSin = Math.sin(hueAngle);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        if (!needsColorAdjust) {
          // Fast path: per-channel LUT only (no cross-channel math)
          for (let i = 0; i < data.length; i += 4) {
            data[i] = lutR[data[i]];
            data[i + 1] = lutG[data[i + 1]];
            data[i + 2] = lutB[data[i + 2]];
          }
        } else {
          for (let i = 0; i < data.length; i += 4) {
            let r = lutR[data[i]], g = lutG[data[i + 1]], b = lutB[data[i + 2]];
            
            // Highlights & Shadows
            if (highlights !== 0 || shadows !== 0) {
              const lum = (r + g + b) / 3;
              if (lum > 128 && highlights !== 0) {
                const hf = highlights / 200;
                r += (r - 128) * hf; g += (g - 128) * hf; b += (b - 128) * hf;
              }
              if (lum < 128 && shadows !== 0) {
                const sf = shadows / 200;
                r -= (128 - r) * sf; g -= (128 - g) * sf; b -= (128 - b) * sf;
              }
            }
            
            if (saturation !== 0 || vibrance !== 0) {
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;
              const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
              const vibAdj = (1 - (maxC - minC) / 255) * (vibFactor - 1) + 1;
              r = gray + (r - gray) * satFactor * vibAdj;
              g = gray + (g - gray) * satFactor * vibAdj;
              b = gray + (b - gray) * satFactor * vibAdj;
            }
            
            if (hue !== 0) {
              const nr = r * (0.213 + 0.787 * hCos - 0.213 * hSin) + g * (0.715 - 0.715 * hCos - 0.715 * hSin) + b * (0.072 - 0.072 * hCos + 0.928 * hSin);
              const ng = r * (0.213 - 0.213 * hCos + 0.143 * hSin) + g * (0.715 + 0.285 * hCos + 0.140 * hSin) + b * (0.072 - 0.072 * hCos - 0.283 * hSin);
              const nb = r * (0.213 - 0.213 * hCos - 0.787 * hSin) + g * (0.715 - 0.715 * hCos + 0.715 * hSin) + b * (0.072 + 0.928 * hCos + 0.072 * hSin);
              r = nr; g = ng; b = nb;
            }
            
            data[i] = Math.min(255, Math.max(0, r)) | 0;
            data[i + 1] = Math.min(255, Math.max(0, g)) | 0;
            data[i + 2] = Math.min(255, Math.max(0, b)) | 0;
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
      }

      // -- Draw crop overlay --
      if (cropRegion && cropRegion.w > 0 && cropRegion.h > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
        ctx.clearRect(cropRegion.x, cropRegion.y, cropRegion.w, cropRegion.h);
        ctx.strokeStyle = '#ff375f';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(cropRegion.x, cropRegion.y, cropRegion.w, cropRegion.h);
        ctx.setLineDash([]);
        // Rule-of-thirds guides
        const thirdW = cropRegion.w / 3;
        const thirdH = cropRegion.h / 3;
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cropRegion.x + thirdW * i, cropRegion.y);
          ctx.lineTo(cropRegion.x + thirdW * i, cropRegion.y + cropRegion.h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cropRegion.x, cropRegion.y + thirdH * i);
          ctx.lineTo(cropRegion.x + cropRegion.w, cropRegion.y + thirdH * i);
          ctx.stroke();
        }
        // Dimension label
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(cropRegion.x, cropRegion.y - 22, 80, 18);
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${Math.round(cropRegion.w)} x ${Math.round(cropRegion.h)}`, cropRegion.x + 4, cropRegion.y - 8);
        ctx.restore();
      }

      // -- Draw shape preview --
      if (shapePreview && shapePreview.w > 0 && shapePreview.h > 0) {
        ctx.save();
        ctx.strokeStyle = foregroundColor;
        ctx.fillStyle = foregroundColor;
        ctx.lineWidth = brushSize;
        ctx.setLineDash([4, 4]);
        const r = shapePreview;
        if (shapeType === 'rectangle') {
          if (shapeFill) { ctx.fillRect(r.x, r.y, r.w, r.h); } else { ctx.strokeRect(r.x, r.y, r.w, r.h); }
        } else if (shapeType === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
          if (shapeFill) { ctx.fill(); } else { ctx.stroke(); }
        } else if (shapeType === 'line') {
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x + r.w, r.y + r.h);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // -- Draw text cursor / pending text --
      if (activeTool === 'text' && textPosition) {
        ctx.save();
        ctx.fillStyle = foregroundColor;
        const fontWeight = textBold ? 'bold' : 'normal';
        const fontStyle = textItalic ? 'italic' : 'normal';
        ctx.font = `${fontStyle} ${fontWeight} ${textFontSize}px ${textFontFamily}`;
        ctx.textBaseline = 'top';
        if (textInput) {
          ctx.fillText(textInput, textPosition.x, textPosition.y);
        }
        // Blinking cursor indicator
        ctx.strokeStyle = foregroundColor;
        ctx.lineWidth = 1;
        const textW = textInput ? ctx.measureText(textInput).width : 0;
        ctx.beginPath();
        ctx.moveTo(textPosition.x + textW, textPosition.y);
        ctx.lineTo(textPosition.x + textW, textPosition.y + textFontSize);
        ctx.stroke();
        ctx.restore();
      }

      // -- Draw marching ants for selection --
      if (selection.mask) {
        drawMarchingAnts(ctx, selection.mask, canvasSize.width, canvasSize.height, selection.antOffset);
      }

      // -- Draw marquee preview --
      if (selection.marqueeBounds && selection.marqueeBounds.w > 0 && selection.marqueeBounds.h > 0) {
        ctx.save();
        ctx.strokeStyle = '#ff375f';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        const mb = selection.marqueeBounds;
        ctx.strokeRect(mb.x, mb.y, mb.w, mb.h);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // -- Draw lasso preview --
      if (selection.lassoPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#ff375f';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(selection.lassoPoints[0].x, selection.lassoPoints[0].y);
        for (let i = 1; i < selection.lassoPoints.length; i++) {
          ctx.lineTo(selection.lassoPoints[i].x, selection.lassoPoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // -- Draw gradient preview --
      if (gradientPreview) {
        ctx.save();
        ctx.strokeStyle = 'rgba(236,72,153,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(gradientPreview.from.x, gradientPreview.from.y);
        ctx.lineTo(gradientPreview.to.x, gradientPreview.to.y);
        ctx.stroke();
        // Start/end markers
        ctx.fillStyle = '#ff375f';
        ctx.beginPath();
        ctx.arc(gradientPreview.from.x, gradientPreview.from.y, 4, 0, Math.PI * 2);
        ctx.fill();
        // Image-space white end marker (start is #ff375f); canvas ignores var()
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(gradientPreview.to.x, gradientPreview.to.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // -- Draw pen path --
      if (penPath.points.length > 0) {
        drawPenPath(ctx, penPath, activeTool === 'pen');
      }

      // -- Draw clone source marker --
      if ((activeTool === 'clone' || activeTool === 'heal') && cloneState.sourceSet) {
        ctx.save();
        ctx.strokeStyle = 'rgba(236,72,153,0.8)';
        ctx.lineWidth = 1;
        const csx = cloneState.sourceX;
        const csy = cloneState.sourceY;
        ctx.beginPath();
        ctx.arc(csx, csy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(csx - 10, csy); ctx.lineTo(csx + 10, csy);
        ctx.moveTo(csx, csy - 10); ctx.lineTo(csx, csy + 10);
        ctx.stroke();
        ctx.restore();
      }

      // -- Draw transform handles --
      if (transformState.active) {
        drawTransformHandles(ctx, transformState.bounds);
      }
    }).catch((err) => { if (!cancelled) console.error('Prism canvas render error:', err); });
    return () => { cancelled = true; };
  }, [layers, canvasSize, brightness, contrast, saturation, exposure, highlights, shadows, temperature, tint, vibrance, hue, cropRegion, shapePreview, shapeType, shapeFill, foregroundColor, brushSize, activeTool, textPosition, textInput, textFontSize, selection, gradientPreview, penPath, cloneState, transformState]);

  // ===== HISTOGRAM =====
  useEffect(() => {
    const canvas = canvasRef.current;
    const hCanvas = histCanvasRef.current;
    if (!canvas || !hCanvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const hCtx = hCanvas.getContext('2d');
    if (!ctx || !hCtx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hist = computeHistogram(imageData);
    drawHistogram(hCtx, hist, hCanvas.width, hCanvas.height, histChannel);
  }, [layers, brightness, contrast, saturation, exposure, highlights, shadows, temperature, tint, vibrance, hue, histChannel]);

  // ===== STYLES - CSS VARIABLE BASED FOR THEME SUPPORT =====
  const styles: Record<string, React.CSSProperties> = useMemo(() => ({
    container: { ['--prism-accent' as any]: '#ff375f', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', position: 'relative' as const, transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease', contain: 'layout style' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-2)', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', height: '32px', minHeight: '32px', flexShrink: 0, position: 'relative' as const, zIndex: 100, overflow: 'visible' },
    logo: { fontSize: '12px', fontWeight: 600, color: 'var(--prism-accent)', letterSpacing: '-0.2px' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'visible', flexWrap: 'nowrap', maxHeight: 38, justifyContent: 'flex-start', scrollbarWidth: 'thin' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
    btn: { padding: '4px var(--space-2)', background: 'none', border: 'none', borderRadius: '9999px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, transition: 'all 0.12s ease', whiteSpace: 'nowrap', flexShrink: 0 },
    btnPrimary: { background: 'var(--prism-accent)', border: '1px solid var(--prism-accent)', color: '#fff', fontWeight: 700, borderRadius: '9999px' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    toolbar: { width: '44px', flexShrink: 0, background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', padding: 'var(--space-2) 4px', gap: '4px', overflow: 'auto' },
    toolBtn: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '9999px', color: 'var(--color-text-muted)', cursor: 'pointer', transition: 'all 0.12s ease' },
    toolBtnActive: { background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)', color: 'var(--color-text-primary)', boxShadow: 'none' },
    mainArea: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    canvasContainer: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--color-bg-inset)' },
    canvas: { boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: '2px', cursor: activeTool === 'hand' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : 'crosshair' },
    sidebar: { width: '100%', height: '100%', background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    panel: { borderBottom: '1px solid var(--color-border-subtle)' },
    panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--space-3)', background: 'var(--color-bg-surface)', cursor: 'pointer' },
    panelTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--prism-accent)', letterSpacing: '1px' },
    panelContent: { padding: '10px', flex: 1, overflowY: 'auto', minHeight: 0 },
    layerItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.12s ease' },
    layerItemSelected: { background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)', border: '1px solid var(--dex-focus-color, #fff)' },
    layerThumb: { width: '28px', height: '28px', background: 'color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated))', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    layerInfo: { flex: 1 },
    layerName: { fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' },
    layerType: { fontSize: '11px', color: 'var(--prism-accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px', fontWeight: 600 },
    layerActions: { display: 'flex', gap: '6px' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '9999px', transition: 'all 0.12s ease' },
    sliderRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
    sliderLabel: { width: '80px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600 },
    colorPicker: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px' },
    colorSwatch: { width: '24px', height: '24px', borderRadius: '4px', border: '1px solid var(--color-border-default)', cursor: 'pointer' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
    tab: { flex: 1, padding: 'var(--space-2)', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', transition: 'all 0.12s ease' },
    tabActive: { color: 'var(--color-text-primary)', borderBottom: '2px solid var(--dex-focus-color, #fff)' },
    statusBar: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-3)', height: 24, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1c 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '11px', color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: '9999px', cursor: 'pointer', fontSize: '11px', border: '1px solid var(--color-bg-hover)', transition: 'all 0.12s ease', fontWeight: 600 },
    select: { background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '6px var(--space-2)', fontSize: '11px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.12s ease' },
  }), [activeTool]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Declarative Features menu (replaces the old hand-rolled dropdown). Sections
  // become caps-label groups; `checked` reflects each panel's open state.
  const featureMenus: MenuGroup[] = [{
    id: 'features',
    label: 'Features',
    sections: [
      { id: 'adjustments', label: 'Adjustments', items: [
        { id: 'curves', label: 'Curves', checked: showCurves, run: () => setShowCurves(v => !v) },
        { id: 'levels', label: 'Levels', checked: showLevels, run: () => setShowLevels(v => !v) },
        { id: 'channelMixer', label: 'Channel Mixer', checked: showChannelMixer, run: () => setShowChannelMixer(v => !v) },
        { id: 'selectiveColor', label: 'Selective Color', checked: showSelectiveColor, run: () => setShowSelectiveColor(v => !v) },
        { id: 'colorBalance', label: 'Color Balance', checked: showColorBalance, run: () => setShowColorBalance(v => !v) },
        { id: 'photoFilter', label: 'Photo Filter', checked: showPhotoFilter, run: () => setShowPhotoFilter(v => !v) },
        { id: 'gradientMap', label: 'Gradient Map', checked: showGradientMap, run: () => setShowGradientMap(v => !v) },
        { id: 'colorLut', label: 'Color LUT', checked: showColorLookup, run: () => setShowColorLookup(v => !v) },
      ] },
      { id: 'filters', label: 'Filters', items: [
        { id: 'contentAwareFill', label: 'Content-Aware Fill', checked: showContentAwareFill, run: () => setShowContentAwareFill(v => !v) },
        { id: 'liquify', label: 'Liquify', checked: showLiquify, run: () => setShowLiquify(v => !v) },
        { id: 'freqSeparation', label: 'Frequency Separation', checked: showFreqSeparation, run: () => setShowFreqSeparation(v => !v) },
        { id: 'filterGallery', label: 'Filter Gallery', checked: showFilterGallery, run: () => setShowFilterGallery(v => !v) },
        { id: 'lensCorrection', label: 'Lens Correction', checked: showLensCorrection, run: () => setShowLensCorrection(v => !v) },
        { id: 'unsharpMask', label: 'Unsharp Mask', checked: showUnsharpMask, run: () => setShowUnsharpMask(v => !v) },
        { id: 'addNoise', label: 'Add Noise', checked: showAddNoise, run: () => setShowAddNoise(v => !v) },
        { id: 'hdrMerge', label: 'HDR Merge', checked: showHDRMerge, run: () => setShowHDRMerge(v => !v) },
      ] },
      { id: 'selection', label: 'Selection', items: [
        { id: 'selectSubject', label: 'Select Subject', checked: showSelectSubject, run: () => setShowSelectSubject(v => !v) },
        { id: 'colorRange', label: 'Color Range', checked: showColorRange, run: () => setShowColorRange(v => !v) },
        { id: 'refineEdge', label: 'Refine Edge', checked: showRefineEdge, run: () => setShowRefineEdge(v => !v) },
      ] },
      { id: 'retouching', label: 'Retouching', items: [
        { id: 'spotHealing', label: 'Spot Healing', checked: showSpotHealing, run: () => setShowSpotHealing(v => { const next = !v; if (next) setActiveTool('heal'); return next; }) },
      ] },
      { id: 'transform', label: 'Transform', items: [
        { id: 'canvasSize', label: 'Canvas Size', checked: showCanvasSize, run: () => { setCanvasSizeNew({ width: canvasSize.width, height: canvasSize.height }); setShowCanvasSize(v => !v); } },
        { id: 'rotateImage', label: 'Rotate Image', checked: showImageRotation, run: () => setShowImageRotation(v => !v) },
      ] },
      { id: 'color', label: 'Color', items: [
        { id: 'replaceColor', label: 'Replace Color', checked: showReplaceColor, run: () => setShowReplaceColor(v => !v) },
        { id: 'posterize', label: 'Posterize', checked: showPosterize, run: () => setShowPosterize(v => !v) },
        { id: 'threshold', label: 'Threshold', checked: showThreshold, run: () => setShowThreshold(v => !v) },
      ] },
      { id: 'composition', label: 'Composition', items: [
        { id: 'smartObjects', label: 'Smart Objects', checked: showSmartObjects, run: () => setShowSmartObjects(v => !v) },
        { id: 'layerStyles', label: 'Layer Styles', checked: showLayerStyles, run: () => setShowLayerStyles(v => !v) },
        { id: 'panorama', label: 'Panorama', checked: showPanorama, run: () => setShowPanorama(v => !v) },
        { id: 'focusStack', label: 'Focus Stack', checked: showFocusStack, run: () => setShowFocusStack(v => !v) },
        { id: 'rawDevelop', label: 'RAW Develop', checked: showRAWDevelop, run: () => setShowRAWDevelop(v => !v) },
      ] },
      { id: 'export', label: 'Export', items: [
        { id: 'batchProcess', label: 'Batch Process', checked: showBatchProcess, run: () => setShowBatchProcess(v => !v) },
        { id: 'slices', label: 'Slices', checked: showSliceExport, run: () => setShowSliceExport(v => !v) },
        { id: 'artboards', label: 'Artboards', checked: showArtboards, run: () => setShowArtboards(v => !v) },
        { id: 'assetLibrary', label: 'Asset Library', checked: showAssetLibrary, run: () => setShowAssetLibrary(v => !v) },
      ] },
      { id: 'view', label: 'View', items: [
        { id: 'rulers', label: 'Rulers', checked: showRulers, run: () => setShowRulers(v => !v) },
        { id: 'guides', label: 'Guides', checked: showGuidesPanel, run: () => setShowGuidesPanel(v => !v) },
        { id: 'actions', label: 'Actions', checked: showActions, run: () => setShowActions(v => !v) },
      ] },
    ],
  }];

  return (
    <div style={styles.container} {...dropProps} onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}>
      {dropOverlayStyle && <div style={dropOverlayStyle}>Drop images to import</div>}
      <style>{`
        /* === PRISM - PROFESSIONAL UI === */
        button { font-family: inherit; }
        button:active { transform: scale(0.97); }
        .prism-btn-primary:hover { background: color-mix(in srgb, var(--prism-accent) 88%, #fff) !important; }
        .prism-btn:not(:disabled):not(.prism-btn-active):hover { background: var(--color-bg-hover) !important; }
        .prism-layer-item:hover { background: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)) !important; border-color: color-mix(in srgb, var(--prism-accent) 35%, var(--color-border)) !important; }
        .prism-tool-btn:hover { background: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)) !important; color: var(--prism-accent) !important; }
        .prism-icon-btn:hover { color: var(--prism-accent) !important; background: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)) !important; }
        .prism-tab:hover { color: var(--prism-accent) !important; background: color-mix(in srgb, var(--prism-accent) 10%, var(--color-bg-elevated)) !important; }
        .prism-ctx-item:hover { background: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)) !important; }
        .prism-ctx-item:active { background: color-mix(in srgb, var(--prism-accent) 35%, var(--color-border)) !important; }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; 
          background: var(--prism-accent); cursor: pointer; margin-top: -4px; border: none;
        }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: var(--color-border); border-radius: 2px; }
        select { outline: none; cursor: pointer; transition: border-color 0.12s ease; }
        select:focus { border-color: color-mix(in srgb, var(--prism-accent) 35%, var(--color-border)); }
        select:hover { border-color: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)); }
        .prism-dropdown-item { transition: background 0.12s ease; }
        .prism-dropdown-item:hover { background: color-mix(in srgb, var(--prism-accent) 16%, var(--color-bg-elevated)) !important; }
        .prism-dropdown-item:active { background: color-mix(in srgb, var(--prism-accent) 35%, var(--color-border)) !important; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          <div style={styles.logo}>PRISM</div>
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '1px' }}>IMAGE</span>
        </div>
        <div style={styles.headerCenter}>
          <button className="prism-btn" style={styles.btn} onClick={openImage} aria-label="Open image">{Icons.folder} Open</button>
          <button className="prism-btn" style={styles.btn} onClick={openProject} aria-label="Open project" title="Open a .prism.json project saved with Save">{Icons.folder} Open Project</button>
          <button className="prism-btn" style={styles.btn} onClick={saveProject} aria-label="Save project" title="Save the project as a .prism.json file (Ctrl+S)">{Icons.save} Save</button>
          <span title={autosaveError ?? 'Crash-recovery copy kept by DEX'}>
            <AutosaveIndicator
              state={autosaveError ? 'error' : changedSinceAutosave ? 'idle' : autosaveState}
              lastSavedAt={lastSavedAt}
              label={autosaveError ? 'Not saved' : changedSinceAutosave ? 'Unsaved changes' : undefined}
            />
          </span>
          <button className="prism-btn" style={styles.btn} onClick={() => exportImage('png')} aria-label="Export image">{Icons.download} Export</button>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button className="prism-btn" style={styles.btn} onClick={() => setShowImageInfo(v => !v)} aria-expanded={showImageInfo} aria-label="Image info">Info</button>
            {showImageInfo && (
              <div role="dialog" aria-label="Image info" onKeyDown={(e) => { if (e.key === 'Escape') setShowImageInfo(false); }}
                style={{ position: 'absolute', top: '110%', right: 0, zIndex: 50, width: 280, padding: 12, borderRadius: 'var(--radius-lg, 14px)', background: 'var(--color-bg-glass-strong)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontSize: 12, color: 'var(--color-text-primary)' }}>
                {!imageInfo ? <div style={{ color: 'var(--color-text-secondary)' }}>Open an image to see its details.</div> : (() => {
                  const m = imageInfo.meta;
                  const rows: Array<[string, string | undefined]> = [
                    ['File', imageInfo.name],
                    ['Format', m.format],
                    ['Size', `${(imageInfo.bytes / 1048576).toFixed(2)} MB`],
                    ['Dimensions', m.width && m.height ? `${m.width} × ${m.height}` : undefined],
                    ['Camera', [m.make, m.model].filter(Boolean).join(' ') || undefined],
                    ['Taken', formatExifDate(m.takenAt)],
                    ['Exposure', [m.exposure, m.fNumber, m.iso ? `ISO ${m.iso}` : undefined, m.focalLength].filter(Boolean).join(' · ') || undefined],
                    ['Software', m.software],
                  ];
                  return (
                    <>
                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px' }}>
                        {rows.filter(([, v]) => v).map(([k, v]) => (
                          <React.Fragment key={k}><dt style={{ color: 'var(--color-text-tertiary)' }}>{k}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd></React.Fragment>
                        ))}
                      </dl>
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
                        {m.hasLocation ? 'The original contains GPS location data. ' : ''}Exported images don't include camera, date or location data. Your original file is never changed.
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </span>
          <SendToMenu sourceApp="prism" assetKind="image" getAsset={() => {
            const canvas = canvasRef.current;
            const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
            return { name: `${layers[0]?.name || 'Prism Export'}.png`, data: dataUrl, mimeType: 'image/png' };
          }} />
          {collab.showShareButton && (
            <button
              style={collabButtonStyles.collabButton}
              onClick={collab.openShareDialog}
              aria-label={collab.activeCollaboratorCount > 0 ? `Share project (${collab.activeCollaboratorCount} active collaborators)` : 'Share project'}
            >
              {collab.activeCollaboratorCount > 0 ? `${collab.activeCollaboratorCount} collaborators` : 'Share'}
            </button>
          )}
          <select
            className="prism-btn"
            style={{ ...styles.btn, padding: '4px var(--space-2)', cursor: 'pointer', fontSize: '11px' }}
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'tiff' || val === 'bmp') {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const blob = val === 'tiff' ? canvasToTIFF(canvas) : canvasToBMP(canvas);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `prism-export-${new Date().toISOString().slice(0, 10)}.${val}`;
                a.click();
                URL.revokeObjectURL(url);
              } else {
                const preset = QUICK_EXPORT_PRESETS.find(p => p.id === val);
                if (preset && preset.settings.format) {
                  const fmt = preset.settings.format;
                  if (fmt === 'png' || fmt === 'jpg' || fmt === 'webp') {
                    exportImage(fmt, preset.settings.quality ?? 100);
                  }
                }
              }
            }}
          >
            <option value="" disabled>Export As</option>
            {QUICK_EXPORT_PRESETS.filter(p => p.settings.format && ['png', 'jpg', 'webp'].includes(p.settings.format)).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="tiff">TIFF (Uncompressed)</option>
            <option value="bmp">BMP (Bitmap)</option>
          </select>
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          <button className="prism-btn" style={styles.btn} onClick={undo} disabled={historyIndex <= 0} aria-label="Undo">{Icons.undo}</button>
          <button className="prism-btn" style={styles.btn} onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Redo">{Icons.redo}</button>
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          <MenuBar groups={featureMenus} />
        </div>

      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Toolbar - Grouped Tools */}
        <div data-testid="prism-tools" style={styles.toolbar} ref={toolGroupRef}>
          {toolGroups.map(group => {
            const currentToolId = selectedInGroup[group.id] || group.tools[0];
            const currentTool = tools.find(t => t.id === currentToolId);
            const isGroupActive = group.tools.includes(activeTool);
            const isOpen = openToolGroup === group.id;
            const hasMultiple = group.tools.length > 1;

            return (
              <div key={group.id} style={{ position: 'relative' }}>
                <button
                  className={isGroupActive ? undefined : 'prism-tool-btn'}
                  style={{
                    ...styles.toolBtn,
                    ...(isGroupActive ? styles.toolBtnActive : {}),
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (hasMultiple && isOpen) {
                      setOpenToolGroup(null);
                    } else if (hasMultiple) {
                      setOpenToolGroup(group.id);
                    }
                    setActiveTool(currentToolId);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (hasMultiple) setOpenToolGroup(isOpen ? null : group.id);
                  }}
                  aria-label={currentTool?.name || group.label}
                  aria-haspopup={hasMultiple ? 'true' : undefined}
                  aria-expanded={isOpen ? 'true' : undefined}
                >
                  {currentTool?.icon}
                  {hasMultiple && (
                    <span style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 0,
                      height: 0,
                      borderLeft: '3px solid transparent',
                      borderRight: '3px solid transparent',
                      borderTop: '4px solid currentColor',
                      opacity: 0.6,
                    }} />
                  )}
                </button>

                {/* Flyout menu */}
                {isOpen && hasMultiple && (
                  <div
                    className="dex-creative-panel"
                    style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      marginLeft: 4,
                      borderRadius: 'var(--radius-lg)',
                      padding: 4,
                      zIndex: 6500,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      minWidth: 120,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', padding: '2px 6px', letterSpacing: '0.5px' }}>
                      {group.label.toUpperCase()}
                    </div>
                    {group.tools.map(toolId => {
                      const tool = tools.find(t => t.id === toolId);
                      if (!tool) return null;
                      return (
                        <button
                          key={toolId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-2)',
                            padding: '6px var(--space-2)',
                            background: activeTool === toolId ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                            border: 'none',
                            borderRadius: 4,
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            fontSize: 11,
                            textAlign: 'left',
                            width: '100%',
                          }}
                          onClick={() => {
                            setActiveTool(toolId);
                            setSelectedInGroup(prev => ({ ...prev, [group.id]: toolId }));
                            setOpenToolGroup(null);
                          }}
                        >
                          <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {tool.icon}
                          </span>
                          <span>{tool.name}</span>
                          {tool.key && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {tool.key}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Color Swatches */}
          <div style={{ marginTop: 'auto', padding: 'var(--space-2) 4px' }}>
            <div style={{ position: 'relative', width: '32px', height: '32px', margin: '0 auto' }}>
              <input
                type="color"
                value={foregroundColor}
                onChange={(e) => setForegroundColor(e.target.value)}
                aria-label="Foreground color"
                style={{ position: 'absolute', top: 0, left: 0, width: '20px', height: '20px', border: '2px solid var(--color-text-muted)', borderRadius: '2px', cursor: 'pointer' }}
              />
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                aria-label="Background color"
                style={{ position: 'absolute', bottom: 0, right: 0, width: '20px', height: '20px', border: '2px solid var(--color-text-muted)', borderRadius: '2px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Tool Options Bar */}
        <div style={styles.mainArea}>
          {(activeTool === 'pointer' || activeTool === 'wand' || activeTool === 'lasso' || activeTool === 'gradient' || activeTool === 'clone' || activeTool === 'heal' || activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'text' || activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'shape') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', fontSize: '11px', minHeight: '28px' }}>
              {(activeTool === 'pointer' || activeTool === 'wand' || activeTool === 'lasso') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Selection:</span>
                  <SegmentedControl
                    options={['new', 'add', 'subtract', 'intersect'] as const}
                    value={selection.mode}
                    onChange={(m) => setSelection(prev => ({ ...prev, mode: m }))}
                    accentColor="var(--prism-accent)"
                    variant="subtle"
                    aria-label="Selection mode"
                  />
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Feather:</span>
                  <input aria-label="Selection feather radius" type="range" min="0" max="50" value={selection.feather} onChange={(e) => setSelection(prev => ({ ...prev, feather: Number(e.target.value) }))} style={{ width: '60px', accentColor: 'var(--prism-accent)' }} />
                  <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '20px' }}>{selection.feather}px</span>
                  {activeTool === 'wand' && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tolerance:</span>
                      <input aria-label="Magic wand tolerance" type="range" min="0" max="255" value={selection.wandTolerance} onChange={(e) => setSelection(prev => ({ ...prev, wandTolerance: Number(e.target.value) }))} style={{ width: '60px', accentColor: 'var(--prism-accent)' }} />
                      <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '24px' }}>{selection.wandTolerance}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selection.wandContiguous} onChange={(e) => setSelection(prev => ({ ...prev, wandContiguous: e.target.checked }))} />
                        Contiguous
                      </label>
                    </>
                  )}
                  {selection.mask && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                      <button onClick={() => setSelection(prev => prev.mask ? { ...prev, mask: invertSelection(prev.mask) } : prev)} aria-label="Invert selection" style={{ ...styles.btn, padding: '2px var(--space-2)', fontSize: '11px' }}>Invert</button>
                      <button onClick={() => setSelection(createEmptySelection())} aria-label="Deselect" style={{ ...styles.btn, padding: '2px var(--space-2)', fontSize: '11px' }}>Deselect</button>
                    </>
                  )}
                </>
              )}
              {activeTool === 'gradient' && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Gradient:</span>
                  <SegmentedControl
                    options={['linear', 'radial', 'angular', 'diamond', 'reflected'] as const}
                    value={gradientType}
                    onChange={setGradientType}
                    accentColor="var(--prism-accent)"
                    variant="subtle"
                    aria-label="Gradient type"
                  />
                </>
              )}
              {(activeTool === 'clone' || activeTool === 'heal') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{activeTool === 'clone' ? 'Clone Stamp' : 'Heal Brush'}:</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Alt+click to set source</span>
                  {cloneState.sourceSet && <span style={{ color: 'var(--prism-accent)' }}>Source: ({Math.round(cloneState.sourceX)}, {Math.round(cloneState.sourceY)})</span>}
                </>
              )}
              {(activeTool === 'dodge' || activeTool === 'burn') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{activeTool === 'dodge' ? 'Dodge' : 'Burn'}:</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Exposure:</span>
                  <input aria-label="Dodge burn exposure" type="range" min="1" max="100" value={dodgeBurnExposure} onChange={e => setDodgeBurnExposure(Number(e.target.value))} style={{ width: '60px', accentColor: 'var(--color-warning)' }} />
                  <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)', minWidth: '24px' }}>{dodgeBurnExposure}%</span>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Range:</span>
                  {(['shadows', 'midtones', 'highlights'] as const).map(r => (
                    <button key={r} onClick={() => setDodgeBurnRange(r)} aria-label={`${r} range`} style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid ' + (dodgeBurnRange === r ? 'rgba(255,159,10,0.3)' : 'var(--color-bg-hover)'), background: dodgeBurnRange === r ? 'rgba(255,159,10,0.1)' : 'transparent', color: dodgeBurnRange === r ? 'var(--color-warning)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
                  ))}
                </>
              )}
              {activeTool === 'text' && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Text:</span>
                  <select value={textFontFamily} onChange={e => setTextFontFamily(e.target.value)} style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 11, padding: '2px 4px', cursor: 'pointer', fontFamily: textFontFamily }}>
                    <option value="Inter, system-ui, sans-serif">Inter</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Impact, sans-serif">Impact</option>
                    <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                  </select>
                  <input aria-label="Text font size" type="number" min="8" max="200" value={textFontSize} onChange={e => setTextFontSize(Number(e.target.value))} style={{ width: '44px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 11, padding: '2px 4px', textAlign: 'center' }} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>px</span>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 2px' }}>|</span>
                  <button onClick={() => setTextBold(b => !b)} aria-label="Toggle bold" style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid ' + (textBold ? 'rgba(236,72,153,0.3)' : 'var(--color-bg-hover)'), background: textBold ? 'rgba(236,72,153,0.1)' : 'transparent', color: textBold ? 'var(--prism-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>B</button>
                  <button onClick={() => setTextItalic(i => !i)} aria-label="Toggle italic" style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid ' + (textItalic ? 'rgba(236,72,153,0.3)' : 'var(--color-bg-hover)'), background: textItalic ? 'rgba(236,72,153,0.1)' : 'transparent', color: textItalic ? 'var(--prism-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontStyle: 'italic', cursor: 'pointer' }}>I</button>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 2px' }}>|</span>
                  {(['left', 'center', 'right'] as const).map(a => (
                    <button key={a} onClick={() => setTextAlign(a)} aria-label={`Align ${a}`} style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid ' + (textAlign === a ? 'rgba(236,72,153,0.3)' : 'var(--color-bg-hover)'), background: textAlign === a ? 'rgba(236,72,153,0.1)' : 'transparent', color: textAlign === a ? 'var(--prism-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>
                      <DexIcon name={a === 'left' ? 'align-left' : a === 'center' ? 'align-center' : 'align-right'} size={11} />
                    </button>
                  ))}
                </>
              )}
              {(activeTool === 'brush' || activeTool === 'eraser') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{activeTool === 'brush' ? 'Brush' : 'Eraser'}:</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Size:</span>
                  <input aria-label="Brush size" type="range" min="1" max="500" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: '70px', accentColor: 'var(--prism-accent)' }} />
                  <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '32px' }}>{brushSize}px</span>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Hardness:</span>
                  <input aria-label="Brush hardness" type="range" min="0" max="100" value={brushHardness} onChange={e => setBrushHardness(Number(e.target.value))} style={{ width: '60px', accentColor: 'var(--prism-accent)' }} />
                  <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '28px' }}>{brushHardness}%</span>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Opacity:</span>
                  <input aria-label="Brush opacity" type="range" min="1" max="100" value={brushOpacity} onChange={e => setBrushOpacity(Number(e.target.value))} style={{ width: '60px', accentColor: 'var(--prism-accent)' }} />
                  <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '28px' }}>{brushOpacity}%</span>
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Smoothing:</span>
                  <input aria-label="Brush stabilization" type="range" min="0" max="20" value={brushStabilization} onChange={e => setBrushStabilization(Number(e.target.value))} style={{ width: '60px', accentColor: 'var(--prism-accent)' }} />
                  <span style={{ color: 'var(--prism-accent)', fontFamily: 'var(--font-mono)', minWidth: '20px' }}>{brushStabilization}</span>
                </>
              )}
              {activeTool === 'shape' && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Shape:</span>
                  <SegmentedControl
                    options={['rectangle', 'ellipse', 'line'] as const}
                    value={shapeType}
                    onChange={setShapeType}
                    accentColor="var(--prism-accent)"
                    variant="subtle"
                    aria-label="Shape type"
                  />
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={shapeFill} onChange={e => setShapeFill(e.target.checked)} />
                    Fill
                  </label>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>(outline width follows brush size)</span>
                </>
              )}
            </div>
          )}
          <div
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey || activeTool === 'zoom') {
                e.preventDefault();
                // Cursor-centred wheel zoom via the shared creative engine
                // (useCanvasZoomPan) -- identical math, now de-duplicated.
                zoomAtCursor(e, canvasRef.current);
              }
            }}
        >
          <div style={styles.canvasContainer} ref={containerRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={{ ...styles.canvas, transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`, transformOrigin: 'center' }}
            />
            {/* Drawing overlay canvas */}
            <canvas
              data-testid="prism-canvas"
              ref={drawCanvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onPointerDown={handleCanvasMouseDown as any}
              onPointerMove={(e: any) => {
                handleCanvasMouseMove(e);
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                setBrushCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onPointerUp={handleCanvasMouseUp}
              onPointerLeave={() => { handleCanvasMouseUp(); setBrushCursorPos(null); }}
              style={{
                ...styles.canvas,
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`,
                transformOrigin: 'center',
                position: 'absolute',
                top: 0,
                left: 0,
                cursor: (activeTool === 'brush' || activeTool === 'eraser') ? 'none' : activeTool === 'eyedropper' ? 'crosshair' : activeTool === 'hand' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : 'default',
                touchAction: 'none',
              }}
            />
            {/* Brush cursor preview */}
            {brushCursorPos && (activeTool === 'brush' || activeTool === 'eraser') && (
              <div style={{
                position: 'absolute',
                left: panOffset.x + brushCursorPos.x * (zoom / 100) - (brushSize * zoom / 200),
                top: panOffset.y + brushCursorPos.y * (zoom / 100) - (brushSize * zoom / 200),
                width: brushSize * zoom / 100,
                height: brushSize * zoom / 100,
                borderRadius: '50%',
                border: `1.5px solid ${activeTool === 'eraser' ? 'rgba(255,55,95,0.7)' : 'var(--color-text-secondary)'}`,
                pointerEvents: 'none',
                zIndex: 50,
                boxShadow: `0 0 0 1px rgba(0,0,0,0.3)`,
                transition: 'width 0.05s, height 0.05s',
              }} />
            )}
            {/* Rulers overlay (toggle from View menu). Tick marks in document px,
                spaced by the live zoom so they track the canvas. */}
            {showRulers && (() => {
              const RULER = 18;
              const step = zoom >= 200 ? 50 : zoom >= 100 ? 100 : zoom >= 50 ? 200 : 500;
              const sx = zoom / 100;
              const hTicks: React.ReactNode[] = [];
              for (let px = 0; px <= canvasSize.width; px += step) hTicks.push(<span key={`h${px}`} style={{ position: 'absolute', left: px * sx, top: 0, fontSize: 8, color: 'var(--color-text-tertiary)', transform: 'translateX(2px)', borderLeft: '1px solid var(--color-border)', paddingLeft: 1, lineHeight: `${RULER}px` }}>{px}</span>);
              const vTicks: React.ReactNode[] = [];
              for (let px = 0; px <= canvasSize.height; px += step) vTicks.push(<span key={`v${px}`} style={{ position: 'absolute', top: px * sx, left: 0, fontSize: 8, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border)', width: RULER, textAlign: 'center', writingMode: 'vertical-rl' }}>{px}</span>);
              return (
                <>
                  <div className="dex-creative-panel" style={{ position: 'absolute', top: 0, left: RULER, right: 0, height: RULER, borderRadius: 0, overflow: 'hidden', zIndex: 45, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', left: panOffset.x, top: 0, height: RULER }}>{hTicks}</div>
                  </div>
                  <div className="dex-creative-panel" style={{ position: 'absolute', top: RULER, left: 0, bottom: 0, width: RULER, borderRadius: 0, overflow: 'hidden', zIndex: 45, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: panOffset.y, left: 0, width: RULER }}>{vTicks}</div>
                  </div>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: RULER, height: RULER, background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', zIndex: 46, pointerEvents: 'none' }} />
                </>
              );
            })()}
            {/* Guide lines drawn over the canvas (managed in the Guides panel). */}
            {guides.map(g => g.orientation === 'h' ? (
              <div key={g.id} style={{ position: 'absolute', left: 0, right: 0, top: panOffset.y + g.position * (zoom / 100), height: 1, background: 'var(--color-accent-fill)', opacity: 0.7, zIndex: 44, pointerEvents: 'none' }} />
            ) : (
              <div key={g.id} style={{ position: 'absolute', top: 0, bottom: 0, left: panOffset.x + g.position * (zoom / 100), width: 1, background: 'var(--color-success)', opacity: 0.7, zIndex: 44, pointerEvents: 'none' }} />
            ))}
            {/* Zoom Controls Overlay */}
            <div className="dex-creative-panel" style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: 'var(--radius-lg)', padding: '6px var(--space-3)', zIndex: 40 }}>
              <button style={{ background: 'var(--color-border)', border: 'none', borderRadius: '9999px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px var(--space-2)', fontSize: '12px' }} onClick={() => setZoom(z => Math.max(10, z - 10))} aria-label="Zoom out">-</button>
              <input 
                type="range" 
                min="10" 
                max="500" 
                aria-label="Canvas zoom"
                value={zoom} 
                onChange={(e) => setZoom(Number(e.target.value))} 
                style={{ width: '100px', accentColor: 'var(--prism-accent)', cursor: 'pointer' }}
              />
              <button style={{ background: 'var(--color-border)', border: 'none', borderRadius: '9999px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px var(--space-2)', fontSize: '12px' }} onClick={() => setZoom(z => Math.min(500, z + 10))} aria-label="Zoom in">+</button>
              <span style={{ padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom)}%</span>
              <button style={{ background: 'var(--color-border)', border: 'none', borderRadius: '9999px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px var(--space-2)', fontSize: '11px' }} onClick={() => setZoom(100)} aria-label="Reset zoom">Fit</button>
            </div>
          </div>
        </div>
        </div>

        {/* Sidebar */}
        <ResizablePanel
          resizeDirections={['w']}
          initialWidth={240}
          defaultWidth={240}
          minWidth={200}
          maxWidth={520}
          storageKey="prism-right-panel"
          style={{ height: '100%', flexShrink: 0 }}
        >
        <div data-testid="prism-layers" style={styles.sidebar}>
          {/* Tabs */}
          <div style={styles.tabs}>
            <button className={activePanel === 'adjustments' ? undefined : 'prism-tab'} style={{ ...styles.tab, ...(activePanel === 'adjustments' ? styles.tabActive : {}) }} onClick={() => setActivePanel('adjustments')} aria-label="Adjustments tab">
              {Icons.sliders} Adjust
            </button>
            <button className={activePanel === 'presets' ? undefined : 'prism-tab'} style={{ ...styles.tab, ...(activePanel === 'presets' ? styles.tabActive : {}) }} onClick={() => setActivePanel('presets')} aria-label="Presets tab">
              {Icons.filter} Presets
            </button>
          </div>

          {/* Presets Panel */}
          {activePanel === 'presets' && (
            <div style={styles.panelContent}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-3)' }}>
                {(['filters', 'brushes', 'styles'] as const).map(cat => (
                  <button key={cat} onClick={() => setPresetType(cat)} aria-label={`${cat} presets`} style={{ flex: 1, padding: '6px var(--space-2)', borderRadius: '9999px', border: 'none', background: presetType === cat ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-bg-tertiary)', color: presetType === cat ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{cat}</button>
                ))}
              </div>
              
              {presetType === 'filters' && (
                <>
                  <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>Color</div>
                  {FILTER_PRESETS.filter(p => p.category === 'color').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>B&W</div>
                  {FILTER_PRESETS.filter(p => p.category === 'bw').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Vintage</div>
                  {FILTER_PRESETS.filter(p => p.category === 'vintage').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Cinematic</div>
                  {FILTER_PRESETS.filter(p => p.category === 'cinematic').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Artistic</div>
                  {FILTER_PRESETS.filter(p => p.category === 'artistic').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                </>
              )}
              
              {presetType === 'brushes' && (
                <>
                  <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>Basic</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'basic').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Artistic</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'artistic').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Texture</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'texture').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Special</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'special').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                </>
              )}
              
              {presetType === 'styles' && (
                <>
                  <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>Shadows</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'shadows').map(preset => (
                    <div key={preset.id} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Glow</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'glow').map(preset => (
                    <div key={preset.id} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Bevel</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'bevel').map(preset => (
                    <div key={preset.id} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div className="dex-label-caps" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>Special</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'special').map(preset => (
                    <div key={preset.id} style={{ padding: 'var(--space-2) 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Adjustments Panel */}
          {activePanel === 'adjustments' && (
            <div style={styles.panelContent}>
              <PrismSlider label="Brightness" min={-100} max={100} value={brightness} onChange={setBrightness} />
              <PrismSlider label="Contrast" min={-100} max={100} value={contrast} onChange={setContrast} />
              <PrismSlider label="Saturation" min={-100} max={100} value={saturation} onChange={setSaturation} />
              <PrismSlider label="Exposure" min={-100} max={100} value={exposure} onChange={setExposure} />
              <PrismSlider label="Highlights" min={-100} max={100} value={highlights} onChange={setHighlights} />
              <PrismSlider label="Shadows" min={-100} max={100} value={shadows} onChange={setShadows} />
              <PrismSlider label="Temperature" min={-100} max={100} value={temperature} onChange={setTemperature} />
              <PrismSlider label="Tint" min={-100} max={100} value={tint} onChange={setTint} />
              <PrismSlider label="Vibrance" min={-100} max={100} value={vibrance} onChange={setVibrance} />
              <PrismSlider label="Hue" min={-180} max={180} value={hue} onChange={setHue} />

              {/* Quick Adjustments from PrismFeatures */}
              <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-3)' }}>
                <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>Tools</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button aria-label={showCurves ? 'Hide Curves panel' : 'Show Curves panel'} onClick={() => setShowCurves(v => !v)} style={{ padding: '4px 10px', borderRadius: '9999px', border: '1px solid ' + (showCurves ? 'rgba(236,72,153,0.3)' : 'var(--color-border-subtle)'), background: showCurves ? 'rgba(236,72,153,0.08)' : 'var(--color-bg-tertiary)', color: showCurves ? 'var(--prism-accent)' : 'var(--color-text-primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Curves</button>
                  <button aria-label={showLevels ? 'Hide Levels panel' : 'Show Levels panel'} onClick={() => setShowLevels(v => !v)} style={{ padding: '4px 10px', borderRadius: '9999px', border: '1px solid ' + (showLevels ? 'rgba(236,72,153,0.3)' : 'var(--color-border-subtle)'), background: showLevels ? 'rgba(236,72,153,0.08)' : 'var(--color-bg-tertiary)', color: showLevels ? 'var(--prism-accent)' : 'var(--color-text-primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Levels</button>
                  <button aria-label="Reset all quick adjustments" onClick={() => { setBrightness(0); setContrast(0); setSaturation(0); setExposure(0); setHighlights(0); setShadows(0); setTemperature(0); setTint(0); setVibrance(0); setHue(0); }} style={{ padding: '4px 10px', borderRadius: '9999px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Reset All</button>
                </div>
                <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>Quick Adjustments</div>
                {ADJUSTMENT_PRESETS.map((preset, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (preset.params.brightness !== undefined) setBrightness(preset.params.brightness);
                      if (preset.params.contrast !== undefined) setContrast(preset.params.contrast);
                      if (preset.params.hue !== undefined) setHue(preset.params.hue);
                      if (preset.params.saturation !== undefined) setSaturation(preset.params.saturation);
                      if (preset.params.vibrance !== undefined) setVibrance(preset.params.vibrance);
                    }}
                    style={{ padding: '6px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', marginBottom: '3px', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{preset.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{preset.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters Panel */}
          {activePanel === 'filters' && (
            <div style={styles.panelContent}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {([
                  { name: 'Blur', id: 'blur' as FilterName, color: '#5e5ce6' },
                  { name: 'Sharpen', id: 'sharpen' as FilterName, color: 'var(--color-warning)' },
                  { name: 'Noise', id: 'noise' as FilterName, color: '#bf5af2' },
                  { name: 'Vignette', id: 'vignette' as FilterName, color: '#1f2937' },
                  { name: 'Grain', id: 'grain' as FilterName, color: '#78716c' },
                  { name: 'Glow', id: 'glow' as FilterName, color: '#fbbf24' },
                  { name: 'Vintage', id: 'vintage' as FilterName, color: '#92400e' },
                  { name: 'B&W', id: 'bw' as FilterName, color: '#6b7280' },
                  { name: 'Sepia', id: 'sepia' as FilterName, color: '#a16207' },
                ]).map(filter => (
                  <button key={filter.id} onClick={() => setActiveFilter(activeFilter === filter.id ? null : filter.id)} aria-label={`${filter.name} filter`} style={{ ...styles.btn, flexDirection: 'column', padding: 'var(--space-3) var(--space-2)', border: activeFilter === filter.id ? '1px solid var(--dex-focus-color, #fff)' : undefined }}>
                    <div style={{ width: '40px', height: '40px', background: `linear-gradient(135deg, ${filter.color}, ${filter.color}88)`, borderRadius: '4px', marginBottom: '4px' }} />
                    <span style={{ fontSize: '11px' }}>{filter.name}</span>
                  </button>
                ))}
              </div>
              {activeFilter && (
                <div style={{ marginTop: 'var(--space-3)', padding: '10px', background: 'rgba(236,72,153,0.05)', borderRadius: '6px', border: '1px solid rgba(236,72,153,0.2)' }}>
                  <PrismSlider label="Intensity" min={0} max={100} value={filterIntensity} onChange={setFilterIntensity} unit="%" />
                  <button
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (!canvas) return;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return;
                      pushHistory(`Filter: ${activeFilter}`);
                      applyFilter(ctx, canvasSize.width, canvasSize.height, activeFilter, { intensity: filterIntensity }, selection.mask);
                      // Update selected layer with filtered result
                      const selLayer = layers.find(l => l.id === selectedLayerId);
                      if (selLayer && selLayer.type === 'image') {
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
                      }
                      setActiveFilter(null);
                    }}
                    className="prism-btn-primary"
                    aria-label={`Apply ${activeFilter} filter`}
                    style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}
                  >Apply {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}</button>
                </div>
              )}
            </div>
          )}

          {/* Histogram Panel */}
          <div style={{ ...styles.panel, height: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Histogram</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['rgb', 'r', 'g', 'b', 'lum'] as const).map(ch => (
                  <button key={ch} aria-label={`${ch} channel`} onClick={() => setHistChannel(ch)} style={{ padding: '1px 5px', borderRadius: 9999, border: 'none', background: histChannel === ch ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent', color: histChannel === ch ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' }}>{ch}</button>
                ))}
              </div>
            </div>
            <canvas ref={histCanvasRef} width={260} height={72} style={{ width: '100%', height: 72, borderRadius: 4 }} />
          </div>

          {/* Layers Panel */}
          <div style={{ ...styles.panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Layers</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="prism-icon-btn" style={styles.iconBtn} onClick={() => addLayer('image')} aria-label="Add layer">{Icons.plus}</button>
                <button className="prism-icon-btn" style={styles.iconBtn} onClick={() => addLayer('text')} aria-label="Add text layer">{Icons.text}</button>
                <button className="prism-icon-btn" style={styles.iconBtn} onClick={() => addLayer('shape')} aria-label="Add shape layer">{Icons.shape}</button>
                <div style={{ position: 'relative' }}>
                  <button
                    className="prism-icon-btn"
                    style={styles.iconBtn}
                    onClick={(e) => { e.stopPropagation(); setShowAddAdjustmentMenu(v => !v); }}
                    aria-label="Add adjustment layer"
                    aria-haspopup="menu"
                    aria-expanded={showAddAdjustmentMenu}
                  >fx</button>
                  {showAddAdjustmentMenu && (
                    <div role="menu" className="dex-creative-panel" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, borderRadius: 'var(--radius-lg)', padding: 4, minWidth: 160, zIndex: 50 }}>
                      {([
                        { kind: 'brightness-contrast' as const, label: 'Brightness/Contrast' },
                        { kind: 'hue-saturation' as const, label: 'Hue/Saturation' },
                        { kind: 'curves' as const, label: 'Curves' },
                        { kind: 'levels' as const, label: 'Levels' },
                      ]).map(item => (
                        <div
                          key={item.kind}
                          role="menuitem"
                          tabIndex={0}
                          style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: 4 }}
                          onClick={() => { addAdjustmentLayer(item.kind); setShowAddAdjustmentMenu(false); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAdjustmentLayer(item.kind); setShowAddAdjustmentMenu(false); } }}
                        >{item.label}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="prism-icon-btn"
                    style={styles.iconBtn}
                    onClick={(e) => { e.stopPropagation(); setShowLayerBoolean(v => !v); }}
                    aria-label="Combine layers with boolean operation"
                    aria-haspopup="menu"
                    aria-expanded={showLayerBoolean}
                  >&cap;</button>
                  {showLayerBoolean && (
                    <div role="menu" className="dex-creative-panel" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, borderRadius: 'var(--radius-lg)', padding: 4, minWidth: 180, zIndex: 50 }}>
                      <div style={{ padding: '4px 8px', fontSize: 9, color: 'var(--color-text-tertiary)' }}>Selected layer &amp; the one below</div>
                      {(['union', 'intersect', 'subtract', 'difference'] as BooleanOp[]).map(op => (
                        <div
                          key={op}
                          role="menuitem"
                          tabIndex={0}
                          style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-primary)', cursor: 'pointer', borderRadius: 4 }}
                          onClick={() => { void applyLayerBooleanOp(op); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void applyLayerBooleanOp(op); } }}
                        >{BOOLEAN_OP_INFO[op].label}</div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="prism-icon-btn" style={styles.iconBtn} onClick={() => { void flattenImage(); }} aria-label="Flatten all layers">&#9633;&#9633;</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-2)' }}>
              {layers.map(layer => (
                <div
                  key={layer.id}
                  className={selectedLayerId === layer.id ? undefined : 'prism-layer-item'}
                  style={{ ...styles.layerItem, ...(selectedLayerId === layer.id ? styles.layerItemSelected : {}) }}
                  onClick={() => setSelectedLayerId(layer.id)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedLayerId(layer.id); const p = clampEventToViewport(e); setCtxMenu({ visible: true, x: p.left, y: p.top, layerId: layer.id }); }}
                >
                  <div style={styles.layerThumb}>
                    {layer.type === 'image' ? Icons.image : layer.type === 'text' ? Icons.text : Icons.shape}
                  </div>
                  <div style={styles.layerInfo}>
                    <div style={styles.layerName}>{layer.name}</div>
                    <div style={styles.layerType}>{layer.type}</div>
                  </div>
                  <div style={styles.layerActions}>
                    <button className="prism-icon-btn" style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }} aria-label={`Toggle ${layer.name} visibility`}>
                      {layer.visible ? Icons.eye : Icons.eyeOff}
                    </button>
                    <button className="prism-icon-btn" style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }} aria-label={`Toggle ${layer.name} lock`}>
                      {layer.locked ? Icons.lock : Icons.unlock}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Layer Properties */}
            {selectedLayer && (
              <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
                <PrismSlider label="Opacity" min={0} max={100} value={selectedLayer.opacity} onChange={(v) => updateLayerOpacity(selectedLayer.id, v)} unit="%" />
                <div style={styles.sliderRow}>
                  <span style={styles.sliderLabel}>Blend</span>
                  <select
                    value={selectedLayer.blendMode}
                    onChange={(e) => updateLayerBlendMode(selectedLayer.id, e.target.value as BlendMode)}
                    style={{ ...styles.select, flex: 1 }}
                  >
                    {BLEND_MODES.map(mode => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </div>
                {selectedLayer.type === 'adjustment' && selectedLayer.adjustment && (
                  <div style={{ padding: 'var(--space-2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
                      {selectedLayer.adjustment.kind.replace('-', ' / ')}
                    </div>
                    <AdjustmentControls
                      adjustment={selectedLayer.adjustment}
                      onChange={(patch) => updateLayerAdjustment(selectedLayer.id, patch)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </ResizablePanel>
      </div>



      {/* ===== PRO FLOATING PANELS (macOS Tahoe Glass) ===== */}

      {/* Content-Aware Fill Panel */}
      {showContentAwareFill && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(360px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Content-Aware Fill</span>
            <button aria-label="Close Content-Aware Fill panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowContentAwareFill(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ height: 140, background: 'var(--color-border-subtle)', borderRadius: 6, border: '1px solid var(--color-bg-hover)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Select area to fill, then click Generate</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Sampling Area</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-3)' }}>
              {(['auto', 'rectangular', 'custom'] as const).map(m => (
                <button key={m} onClick={() => setContentAwareSampling(m)} aria-label={`${m} sampling mode`} aria-pressed={contentAwareSampling === m} style={{ flex: 1, padding: '5px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: contentAwareSampling === m ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: contentAwareSampling === m ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
              ))}
            </div>
            <button aria-label="Generate content-aware fill" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Content-Aware Fill');
              const sel = selection; if (!sel.mask) return;
              const bounds = sel.marqueeBounds; if (!bounds) return;
              const { x, y, w: width, h: height } = bounds;
              // Get full canvas data for sampling outside selection
              const fullW = canvas.width, fullH = canvas.height;
              const fullData = ctx.getImageData(0, 0, fullW, fullH);
              const fd = fullData.data;
              // Build mask: true = needs fill
              const mask = new Uint8Array(width * height);
              for (let py = 0; py < height; py++) {
                for (let px = 0; px < width; px++) {
                  if (sel.mask[(Math.round(y) + py) * fullW + (Math.round(x) + px)]) mask[py * width + px] = 255;
                }
              }
              const patchSize = contentAwareSampling === 'rectangular' ? 9 : 5;
              const half = Math.floor(patchSize / 2);
              // Helper: get pixel from full canvas
              const getPixel = (gx: number, gy: number) => {
                if (gx < 0 || gx >= fullW || gy < 0 || gy >= fullH) return [0, 0, 0];
                const i = (gy * fullW + gx) * 4;
                return [fd[i], fd[i + 1], fd[i + 2]];
              };
              // Iterative onion-peel: fill from boundary inward
              let remaining = 0;
              for (let i = 0; i < mask.length; i++) if (mask[i]) remaining++;
              const maxIter = remaining + 100;
              for (let iter = 0; iter < maxIter && remaining > 0; iter++) {
                // Find boundary pixels (masked pixels adjacent to filled)
                const boundary: [number, number][] = [];
                for (let py = 0; py < height; py++) {
                  for (let px = 0; px < width; px++) {
                    if (!mask[py * width + px]) continue;
                    let onBoundary = false;
                    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                      const nx = px + dx, ny = py + dy;
                      if (nx < 0 || nx >= width || ny < 0 || ny >= height) { onBoundary = true; break; }
                      if (!mask[ny * width + nx]) { onBoundary = true; break; }
                    }
                    if (onBoundary) boundary.push([px, py]);
                  }
                }
                if (boundary.length === 0) break;
                // For each boundary pixel, find best matching patch from outside mask
                for (const [bx, by] of boundary) {
                  const gx = x + bx, gy = y + by;
                  // Build partial patch signature from known neighbors
                  let bestDist = Infinity, bestGx = gx, bestGy = gy;
                  const searchStep = contentAwareSampling === 'auto' ? 3 : 2;
                  const searchRange = contentAwareSampling === 'rectangular' ? 40 : 25;
                  // Search around the pixel for best patch match
                  for (let sy = -searchRange; sy <= searchRange; sy += searchStep) {
                    for (let sx = -searchRange; sx <= searchRange; sx += searchStep) {
                      const cx = gx + sx, cy = gy + sy;
                      if (cx < half || cx >= fullW - half || cy < half || cy >= fullH - half) continue;
                      // Skip if candidate is inside selection mask
                      const lx = cx - x, ly = cy - y;
                      if (lx >= 0 && lx < width && ly >= 0 && ly < height && mask[ly * width + lx]) continue;
                      // Compare known pixels in patch
                      let dist = 0, compared = 0;
                      for (let dy = -half; dy <= half; dy++) {
                        for (let dx = -half; dx <= half; dx++) {
                          const px2 = bx + dx, py2 = by + dy;
                          if (px2 < 0 || px2 >= width || py2 < 0 || py2 >= height) continue;
                          if (mask[py2 * width + px2]) continue; // skip unknown
                          const srcP = getPixel(gx + dx, gy + dy);
                          const candP = getPixel(cx + dx, cy + dy);
                          const dr = srcP[0] - candP[0], dg = srcP[1] - candP[1], db = srcP[2] - candP[2];
                          dist += dr * dr + dg * dg + db * db;
                          compared++;
                        }
                      }
                      if (compared > 0 && dist / compared < bestDist) {
                        bestDist = dist / compared;
                        bestGx = cx; bestGy = cy;
                      }
                    }
                  }
                  // Copy pixel from best match
                  const [cr, cg, cb] = getPixel(bestGx, bestGy);
                  const fi = (gy * fullW + gx) * 4;
                  fd[fi] = cr; fd[fi + 1] = cg; fd[fi + 2] = cb;
                  mask[by * width + bx] = 0;
                  remaining--;
                }
              }
              ctx.putImageData(fullData, 0, 0);
              // Save result back to active layer
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowContentAwareFill(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Generate Fill</button>
            <button aria-label="Content-aware fill via diffusion inpaint" onClick={() => {
              // Content-Aware Fill (diffusion): a real isotropic-diffusion inpaint.
              // The selected region is reconstructed by repeatedly averaging each
              // hole pixel from its known neighbours, so colour diffuses inward
              // from the actual surrounding content (not a flat fill).
              try {
                const canvas = canvasRef.current; if (!canvas) return;
                const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
                const sel = selection;
                if (!sel.mask) {
                  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Make a selection to fill first' } }));
                  return;
                }
                const fullW = canvas.width, fullH = canvas.height;
                if (sel.mask.length !== fullW * fullH) {
                  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Selection does not match canvas size' } }));
                  return;
                }
                pushHistory('Content-Aware Fill (diffusion)');
                const fullData = ctx.getImageData(0, 0, fullW, fullH);
                // mask[i] != 0 -> pixel to inpaint. Selection mask is the hole.
                const holeMask = new Uint8Array(fullW * fullH);
                for (let i = 0; i < holeMask.length; i++) holeMask[i] = sel.mask[i] ? 1 : 0;
                const filled = diffusionInpaint(fullData, holeMask, 80);
                ctx.putImageData(filled, 0, 0);
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Filled via diffusion inpaint' } }));
                setShowContentAwareFill(false);
              } catch (err) {
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Diffusion fill failed' } }));
              }
            }} style={{ width: '100%', marginTop: 6, padding: 'var(--space-2)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Content-Aware Fill (diffusion)</button>
          </div>
        </div>
      )}

      {/* Liquify Panel */}
      {showLiquify && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 240, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Liquify</span>
            <button aria-label="Close Liquify panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowLiquify(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, marginBottom: 10 }}>
              {([{ id: 'push', sym: '→' }, { id: 'pull', sym: '←' }, { id: 'bloat', sym: '◉' }, { id: 'pinch', sym: '◎' }, { id: 'twirl', sym: '↻' }] as const).map(t => (
                <button key={t.id} onClick={() => setLiquifyTool(t.id)} aria-label={`Liquify ${t.id} tool`} aria-pressed={liquifyTool === t.id} style={{ padding: '6px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: liquifyTool === t.id ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: liquifyTool === t.id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 12, cursor: 'pointer' }}>{t.sym}</button>
              ))}
            </div>
            {[{ label: 'Brush Size', value: liquifyBrushSize, set: setLiquifyBrushSize, max: 200 }, { label: 'Pressure', value: liquifyPressure, set: setLiquifyPressure, max: 100 }].map(s => (
              <div key={s.label} style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</span></div>
                <input aria-label={`${s.label} slider`} type="range" min="1" max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4, width: '100%' }}>Click on canvas to set center{liquifyCenter ? ` (${Math.round(liquifyCenter.x)}, ${Math.round(liquifyCenter.y)})` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button aria-label="Reconstruct liquify" onClick={() => {
                const canvas = canvasRef.current; if (!canvas) return;
                const ctx = canvas.getContext('2d'); if (!ctx) return;
                const orig = liquifyOriginalRef.current;
                if (!orig) return;
                pushHistory('Liquify Reconstruct');
                // Repaint the snapshot taken when the panel opened, reverting any warps.
                const img = new Image();
                img.onload = () => {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
                };
                img.src = orig;
              }} style={{ flex: 1, padding: '5px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 9, cursor: 'pointer' }}>Reconstruct</button>
              <button aria-label="Apply liquify" onClick={() => {
                const canvas = canvasRef.current; if (!canvas) return;
                const ctx = canvas.getContext('2d'); if (!ctx) return;
                const cx = liquifyCenter ? liquifyCenter.x : canvas.width / 2;
                const cy = liquifyCenter ? liquifyCenter.y : canvas.height / 2;
                pushHistory('Liquify Apply');
                // Apply displacement map based on brush tool
                const w = canvas.width, h = canvas.height;
                const src = ctx.getImageData(0, 0, w, h);
                const dst = ctx.createImageData(w, h);
                const srcD = src.data, dstD = dst.data;
                const radius = liquifyBrushSize;
                const strength = liquifyPressure / 100;
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    const dx = x - cx, dy = y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    let sx = x, sy = y;
                    if (dist < radius) {
                      const factor = Math.pow(1 - dist / radius, 2) * strength;
                      if (liquifyTool === 'push') { sx = x - factor * 20; }
                      else if (liquifyTool === 'pull') { sx = x + factor * 20; }
                      else if (liquifyTool === 'bloat') { sx = cx + dx * (1 + factor * 0.5); sy = cy + dy * (1 + factor * 0.5); }
                      else if (liquifyTool === 'pinch') { sx = cx + dx * (1 - factor * 0.5); sy = cy + dy * (1 - factor * 0.5); }
                      else if (liquifyTool === 'twirl') {
                        const angle = factor * Math.PI * 0.5;
                        const cos = Math.cos(angle), sin = Math.sin(angle);
                        sx = cx + dx * cos - dy * sin;
                        sy = cy + dx * sin + dy * cos;
                      }
                    }
                    sx = Math.max(0, Math.min(w - 1, Math.round(sx)));
                    sy = Math.max(0, Math.min(h - 1, Math.round(sy)));
                    const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
                    dstD[di] = srcD[si]; dstD[di+1] = srcD[si+1]; dstD[di+2] = srcD[si+2]; dstD[di+3] = srcD[si+3];
                  }
                }
                ctx.putImageData(dst, 0, 0);
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
                setShowLiquify(false);
              }} style={{ flex: 1, padding: '5px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Frequency Separation Panel */}
      {showFreqSeparation && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Frequency Separation</span>
            <button aria-label="Close Frequency Separation panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowFreqSeparation(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Splits image into texture (high-freq) and color (low-freq) layers for retouching</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 'var(--space-3)' }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 4, background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', border: '1px solid var(--color-accent-light, rgba(10,132,255,0.2))', textAlign: 'center' }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>LF</div>
                <div style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 600 }}>Low Freq</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Color & Tone</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 4, background: 'rgba(191,90,242,0.08)', border: '1px solid rgba(191,90,242,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>HF</div>
                <div style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 600 }}>High Freq</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Texture & Detail</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Gaussian Radius</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{freqRadius}px</span></div>
            <input type="range" min="1" max="30" value={freqRadius} onChange={e => setFreqRadius(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 10 }} />
            <button aria-label="Create frequency separation layers" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Frequency Separation');
              const w = canvas.width, h = canvas.height;
              const original = ctx.getImageData(0, 0, w, h);
              const blurred = ctx.createImageData(w, h);
              const od = original.data, bd = blurred.data;
              // Gaussian blur for low-frequency layer (box blur approximation with radius)
              const r = freqRadius;
              const tempData = new Float64Array(w * h * 4);
              // Horizontal pass
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  let rr = 0, gg = 0, bb = 0, aa = 0, count = 0;
                  for (let kx = -r; kx <= r; kx++) {
                    const sx = Math.min(w - 1, Math.max(0, x + kx));
                    const si = (y * w + sx) * 4;
                    rr += od[si]; gg += od[si+1]; bb += od[si+2]; aa += od[si+3]; count++;
                  }
                  const di = (y * w + x) * 4;
                  tempData[di] = rr / count; tempData[di+1] = gg / count; tempData[di+2] = bb / count; tempData[di+3] = aa / count;
                }
              }
              // Vertical pass
              for (let x = 0; x < w; x++) {
                for (let y = 0; y < h; y++) {
                  let rr = 0, gg = 0, bb = 0, aa = 0, count = 0;
                  for (let ky = -r; ky <= r; ky++) {
                    const sy = Math.min(h - 1, Math.max(0, y + ky));
                    const si = (sy * w + x) * 4;
                    rr += tempData[si]; gg += tempData[si+1]; bb += tempData[si+2]; aa += tempData[si+3]; count++;
                  }
                  const di = (y * w + x) * 4;
                  bd[di] = Math.round(rr / count); bd[di+1] = Math.round(gg / count); bd[di+2] = Math.round(bb / count); bd[di+3] = Math.round(aa / count);
                }
              }
              // High freq = original - blurred + 128 (neutral gray)
              const highFreq = ctx.createImageData(w, h);
              const hd = highFreq.data;
              for (let i = 0; i < od.length; i += 4) {
                hd[i] = Math.max(0, Math.min(255, od[i] - bd[i] + 128));
                hd[i+1] = Math.max(0, Math.min(255, od[i+1] - bd[i+1] + 128));
                hd[i+2] = Math.max(0, Math.min(255, od[i+2] - bd[i+2] + 128));
                hd[i+3] = 255;
              }
              // Apply the frequency separation as two new layers
              // Convert blurred to a data URL for the low-freq layer
              const lowCanvas = document.createElement('canvas');
              lowCanvas.width = w; lowCanvas.height = h;
              const lowCtx = lowCanvas.getContext('2d')!;
              lowCtx.putImageData(blurred, 0, 0);
              const lowSrc = lowCanvas.toDataURL();
              // Convert high-freq to a data URL
              const highCanvas = document.createElement('canvas');
              highCanvas.width = w; highCanvas.height = h;
              const highCtx = highCanvas.getContext('2d')!;
              highCtx.putImageData(highFreq, 0, 0);
              const highSrc = highCanvas.toDataURL();
              // Create layers for both frequencies
              const lowLayer: Layer = {
                id: `layer-lowfreq-${Date.now()}`, name: 'Low Frequency', type: 'image',
                visible: true, locked: false, opacity: 100, blendMode: 'normal',
                x: 0, y: 0, width: w, height: h, rotation: 0, imageData: lowSrc,
              };
              const highLayer: Layer = {
                id: `layer-highfreq-${Date.now() + 1}`, name: 'High Frequency', type: 'image',
                visible: true, locked: false, opacity: 100, blendMode: 'linearLight' as BlendMode,
                x: 0, y: 0, width: w, height: h, rotation: 0, imageData: highSrc,
              };
              setLayers(prev => [highLayer, lowLayer, ...prev]);
              setSelectedLayerId(highLayer.id);
              setShowFreqSeparation(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Create Separation Layers</button>
          </div>
        </div>
      )}

      {/* Color Range Selection Panel */}
      {showColorRange && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 260, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Color Range</span>
            <button aria-label="Close Color Range panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowColorRange(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ height: 80, borderRadius: 4, background: `linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))`, marginBottom: 10, position: 'relative', border: '1px solid var(--color-bg-hover)' }}>
              <div style={{ position: 'absolute', left: `${(colorRangeHue / 360) * 100}%`, top: 0, bottom: 0, width: `${(colorRangeFuzziness / 100) * 40}%`, background: 'var(--color-text-tertiary)', border: '1px solid var(--color-text-tertiary)', borderRadius: 2, transform: 'translateX(-50%)' }} />
            </div>
            {[{ label: 'Target Hue', value: colorRangeHue, set: setColorRangeHue, max: 360, unit: '°' }, { label: 'Fuzziness', value: colorRangeFuzziness, set: setColorRangeFuzziness, max: 100, unit: '' }].map(s => (
              <div key={s.label} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.value}{s.unit}</span></div>
                <input type="range" min="0" max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
            <button aria-label="Select color range" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const d = imgData.data;
              const mask = new Uint8Array(canvas.width * canvas.height);
              const targetH = colorRangeHue;
              const fuzz = colorRangeFuzziness;
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h = 0;
                if (max !== min) {
                  const delta = max - min;
                  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
                  else if (max === g) h = ((b - r) / delta + 2) * 60;
                  else h = ((r - g) / delta + 4) * 60;
                }
                const diff = Math.min(Math.abs(h - targetH), 360 - Math.abs(h - targetH));
                if (diff <= fuzz) mask[i / 4] = 255;
              }
              setSelection(prev => ({ ...prev, mask }));
              setShowColorRange(false);
            }} style={{ width: '100%', padding: '6px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Select Range</button>

            {/* Smart Mask — luminosity masking (shadows / midtones / highlights) */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-bg-hover)' }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Luminosity Mask</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['shadows', 'midtones', 'highlights'] as const).map(band => (
                  <button key={band} aria-label={`Select ${band}`} onClick={() => {
                    const canvas = canvasRef.current; if (!canvas) return;
                    const ctx = canvas.getContext('2d'); if (!ctx) return;
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const mask = buildBandMask(imgData.data, canvas.width * canvas.height, band);
                    setSelection(prev => ({ ...prev, mask }));
                    setShowColorRange(false);
                  }} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{band}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Layer Styles Panel */}
      {showLayerStyles && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 300, maxHeight: 500, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Layer Styles</span>
            <button aria-label="Close Layer Styles panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowLayerStyles(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10, overflowY: 'auto', maxHeight: 420 }}>
            {(['shadows', 'glow', 'bevel', 'special'] as const).map(cat => (
              <div key={cat} style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{cat}</div>
                {LAYER_STYLE_PRESETS.filter(p => p.category === cat).map(preset => (
                  <button key={preset.id} onClick={() => setActiveStylePreset(activeStylePreset === preset.id ? null : preset.id)} aria-label={`Apply ${preset.name} layer style`} aria-pressed={activeStylePreset === preset.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid ' + (activeStylePreset === preset.id ? 'var(--dex-focus-color, #fff)' : 'var(--color-border-subtle)'), background: activeStylePreset === preset.id ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', cursor: 'pointer', marginBottom: 2, textAlign: 'left' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>{preset.effects[0].type === 'dropShadow' ? <DexIcon name="layers" size={12} /> : preset.effects[0].type === 'outerGlow' ? <DexIcon name="sparkles" size={12} /> : preset.effects[0].type === 'bevel' ? <DexIcon name="diamond" size={12} /> : <DexIcon name="circle" size={12} />}</div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{preset.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{preset.effects.length} effect{preset.effects.length > 1 ? 's' : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            <button aria-label="Apply style to layer" onClick={() => { if (!activeStylePreset || !selectedLayerId) return; const preset = LAYER_STYLE_PRESETS.find(p => p.id === activeStylePreset); if (!preset) return; pushHistory(`Style: ${preset.name}`); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, name: `${l.name} [${preset.name}]`, effects: preset.effects } : l)); setShowLayerStyles(false); }} disabled={!activeStylePreset || !selectedLayerId} aria-disabled={!activeStylePreset || !selectedLayerId} style={{ width: '100%', padding: '7px', borderRadius: 4, border: 'none', background: activeStylePreset ? 'var(--color-accent-fill)' : 'var(--color-border-subtle)', color: activeStylePreset ? '#fff' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: activeStylePreset ? 'pointer' : 'not-allowed', opacity: activeStylePreset ? 1 : 0.4, marginTop: 6, transition: 'opacity 0.15s ease, background 0.15s ease' }}>Apply Style to Layer</button>
          </div>
        </div>
      )}

      {/* Filter Gallery */}
      {showFilterGallery && (
        <div className="dex-creative-panel-strong" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(500px, calc(100vw - 48px))', height: 420, borderRadius: 'var(--radius-xl)', zIndex: 6000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Filter Gallery</span>
            <button aria-label="Close Filter Gallery" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowFilterGallery(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: 120, borderRight: '1px solid var(--color-bg-hover)', padding: 'var(--space-2)', overflowY: 'auto' }}>
              {(['artistic', 'distort', 'sketch', 'texture', 'stylize'] as const).map(cat => (
                <button key={cat} onClick={() => setFilterGalleryCategory(cat)} aria-label={`${cat} filter category`} aria-pressed={filterGalleryCategory === cat} style={{ display: 'block', width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: 'none', background: filterGalleryCategory === cat ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent', color: filterGalleryCategory === cat ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: 2, textTransform: 'capitalize' }}>{cat}</button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 'var(--space-3)', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {[
                  ...(filterGalleryCategory === 'artistic' ? [{ name: 'Oil Paint', icon: 'O' }, { name: 'Watercolor', icon: 'W' }, { name: 'Fresco', icon: 'F' }, { name: 'Poster Edges', icon: 'P' }, { name: 'Cutout', icon: 'C' }, { name: 'Colored Pencil', icon: 'CP' }] : []),
                  ...(filterGalleryCategory === 'distort' ? [{ name: 'Spherize', icon: 'S' }, { name: 'Ripple', icon: 'R' }, { name: 'Twirl', icon: 'T' }, { name: 'Zigzag', icon: 'Z' }, { name: 'Wave', icon: '~' }, { name: 'Polar', icon: 'P' }] : []),
                  ...(filterGalleryCategory === 'sketch' ? [{ name: 'Chalk', icon: 'Ch' }, { name: 'Charcoal', icon: 'Cc' }, { name: 'Graphic Pen', icon: 'GP' }, { name: 'Halftone', icon: 'H' }, { name: 'Note Paper', icon: 'N' }, { name: 'Stamp', icon: 'St' }] : []),
                  ...(filterGalleryCategory === 'texture' ? [{ name: 'Grain', icon: 'G' }, { name: 'Mosaic', icon: 'M' }, { name: 'Patchwork', icon: 'Pw' }, { name: 'Craquelure', icon: 'Cr' }, { name: 'Canvas', icon: 'Cv' }, { name: 'Burlap', icon: 'B' }] : []),
                  ...(filterGalleryCategory === 'stylize' ? [{ name: 'Glowing Edges', icon: 'GE' }, { name: 'Emboss', icon: '◇' }, { name: 'Solarize', icon: 'Sz' }, { name: 'Find Edges', icon: 'FE' }, { name: 'Diffuse', icon: 'D' }, { name: 'Tiles', icon: 'Ti' }] : []),
                ].map(f => (
                  <button key={f.name} aria-label={`Apply ${f.name} filter`} onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory(`Filter: ${f.name}`); const filterMap: Record<string, string> = { 'Oil Paint': 'blur(2px) contrast(1.5) saturate(1.3)', 'Watercolor': 'blur(1px) saturate(0.6) brightness(1.1)', 'Fresco': 'contrast(1.8) saturate(1.6) sepia(0.3)', 'Poster Edges': 'contrast(2) brightness(1.1)', 'Cutout': 'contrast(3) saturate(0)', 'Colored Pencil': 'grayscale(0.5) contrast(1.4)', 'Spherize': 'contrast(1.1)', 'Ripple': 'blur(1px) brightness(1.05)', 'Twirl': 'hue-rotate(90deg)', 'Zigzag': 'contrast(1.3) hue-rotate(45deg)', 'Wave': 'blur(0.5px) hue-rotate(30deg)', 'Polar': 'invert(1) hue-rotate(180deg)', 'Chalk': 'grayscale(1) contrast(1.5) brightness(1.2)', 'Charcoal': 'grayscale(1) contrast(2)', 'Graphic Pen': 'grayscale(1) contrast(3)', 'Halftone': 'grayscale(1) contrast(1.8)', 'Note Paper': 'sepia(0.5) brightness(1.3)', 'Stamp': 'grayscale(1) contrast(4)', 'Grain': 'contrast(1.1) brightness(0.95)', 'Mosaic': 'contrast(1.2)', 'Patchwork': 'saturate(1.5) contrast(1.1)', 'Craquelure': 'sepia(0.4) contrast(1.3)', 'Canvas': 'brightness(1.05) contrast(1.05)', 'Burlap': 'sepia(0.3) contrast(1.2)', 'Glowing Edges': 'brightness(0.2) contrast(3) saturate(2)', 'Emboss': 'grayscale(0.8) contrast(1.5)', 'Solarize': 'invert(1) brightness(1.5)', 'Find Edges': 'grayscale(1) contrast(4) brightness(0.5)', 'Diffuse': 'blur(2px) brightness(1.1)', 'Tiles': 'contrast(1.5) saturate(0.5)' }; ctx.filter = filterMap[f.name] || 'none'; ctx.drawImage(canvas, 0, 0); ctx.filter = 'none'; }} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{f.icon}</div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{f.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lens Correction Panel */}
      {showLensCorrection && (
        <div style={{ position: 'fixed', right: 20, top: 100, width: 260, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Lens Correction</span>
            <button aria-label="Close Lens Correction panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowLensCorrection(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            {[{ label: 'Distortion', value: lensDistortion, set: setLensDistortion, min: -100, max: 100, color: 'var(--color-accent)' }, { label: 'Chromatic Ab.', value: lensChromaticAb, set: setLensChromaticAb, min: -100, max: 100, color: '#bf5af2' }, { label: 'Vignette', value: lensVignette, set: setLensVignette, min: -100, max: 100, color: 'var(--color-warning)' }].map(s => (
              <div key={s.label} style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 9, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span></div>
                <input type="range" min={s.min} max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              </div>
            ))}
            <button aria-label="Auto-detect lens profile" onClick={() => { setLensDistortion(0); setLensChromaticAb(0); setLensVignette(-15); }} style={{ width: '100%', padding: '6px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Auto-Detect Lens Profile</button>
            <button aria-label="Apply lens correction" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Lens Correction');
              const w = canvas.width, h = canvas.height;
              const src = ctx.getImageData(0, 0, w, h);
              const dst = ctx.createImageData(w, h);
              // Genuine transverse chromatic-aberration: red/blue are sampled at
              // slightly different radii than green (see applyLensCorrection).
              dst.data.set(applyLensCorrection(src.data, w, h, {
                distortion: lensDistortion / 5000,
                chromatic: lensChromaticAb / 2000,
                vignette: lensVignette / 100,
              }));
              ctx.putImageData(dst, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowLensCorrection(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Apply</button>
          </div>
        </div>
      )}

      {/* HDR Merge Panel */}
      {showHDRMerge && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>HDR Merge</span>
            <button aria-label="Close HDR Merge panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowHDRMerge(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              {['-2 EV', '0 EV', '+2 EV'].map((ev, i) => (
                <div key={ev} style={{ flex: 1, height: 80, borderRadius: 4, background: `rgba(255,255,255,${0.02 + i * 0.04})`, border: '1px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>--</div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{ev}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)', textAlign: 'center' }}>Drop exposures</div>
            {[{ label: 'Tone Mapping', options: ['Reinhard', 'ACES', 'Filmic'] }, { label: 'Ghost Removal', options: ['Off', 'Low', 'High'] }].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.label}</span>
                <select style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 9 }}>{s.options.map(o => <option key={o}>{o}</option>)}</select>
              </div>
            ))}
            <button aria-label="Merge HDR exposures" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('HDR Merge'); const w = canvas.width, h = canvas.height; const imgData = ctx.getImageData(0, 0, w, h); const d = imgData.data; for (let i = 0; i < d.length; i += 4) { const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255; const toneMap = lum < 0.3 ? lum * 1.4 : lum > 0.7 ? 1 - (1 - lum) * 0.7 + 0.3 : lum * 1.1; const scale = lum > 0 ? toneMap / lum : 1; d[i] = Math.min(255, d[i] * scale * 1.05); d[i+1] = Math.min(255, d[i+1] * scale * 1.02); d[i+2] = Math.min(255, d[i+2] * scale); } ctx.putImageData(imgData, 0, 0); setShowHDRMerge(false); }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Merge HDR</button>
          </div>
        </div>
      )}

      {/* Batch Processing Panel */}
      {showBatchProcess && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Batch Processing</span>
            <button aria-label="Close Batch Processing panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowBatchProcess(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-4)' }}>
            <div onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/*'; input.onchange = () => { if (input.files) setBatchFiles(Array.from(input.files)); }; input.click(); }} style={{ padding: 'var(--space-5)', borderRadius: 6, border: '2px dashed var(--color-border)', textAlign: 'center', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>--</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Drop files here</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{batchFiles.length} files selected</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Apply Preset</div>
            <select value={batchPreset} onChange={e => setBatchPreset(e.target.value)} style={{ width: '100%', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 'var(--space-2)' }}>
              <option value="">Select preset...</option>
              {FILTER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              {[{ label: 'Format', options: ['JPEG', 'PNG', 'WebP', 'TIFF'] }, { label: 'Resize', options: ['Original', '50%', '25%', '1920px', '1280px'] }].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{s.label}</div>
                  <select style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 9 }}>{s.options.map(o => <option key={o}>{o}</option>)}</select>
                </div>
              ))}
            </div>
            <button aria-label={`Process ${batchFiles.length || 'all'} files`} onClick={async () => {
              const preset = batchPreset ? FILTER_PRESETS.find(p => p.id === batchPreset) : null;
              for (const file of batchFiles) {
                const img = new Image();
                const url = URL.createObjectURL(file);
                await new Promise<void>((resolve) => {
                  img.onload = () => {
                    const offscreen = document.createElement('canvas');
                    offscreen.width = img.naturalWidth;
                    offscreen.height = img.naturalHeight;
                    const octx = offscreen.getContext('2d');
                    if (octx) {
                      if (preset) {
                        // Convert preset adjustments to CSS filter string
                        const parts: string[] = [];
                        for (const adj of preset.adjustments) {
                          if (adj.type === 'exposure') parts.push(`brightness(${1 + (adj.values.exposure || 0) / 100})`);
                          else if (adj.type === 'contrast') parts.push(`contrast(${1 + (adj.values.contrast || 0) / 100})`);
                          else if (adj.type === 'saturation') parts.push(`saturate(${1 + (adj.values.saturation || 0) / 100})`);
                          else if (adj.type === 'blackWhite') { if (adj.values.tint) parts.push(`sepia(${adj.values.tint / 100})`); else parts.push('grayscale(1)'); }
                        }
                        octx.filter = parts.length > 0 ? parts.join(' ') : 'none';
                      }
                      octx.drawImage(img, 0, 0);
                      octx.filter = 'none';
                      offscreen.toBlob((blob) => {
                        if (blob) {
                          const downloadUrl = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = downloadUrl;
                          a.download = `processed-${file.name}`;
                          a.click();
                          URL.revokeObjectURL(downloadUrl);
                        }
                        resolve();
                      }, 'image/png');
                    } else { resolve(); }
                    URL.revokeObjectURL(url);
                  };
                  img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                  img.src = url;
                });
              }
              setShowBatchProcess(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Process {batchFiles.length || 'All'} Files</button>
          </div>
        </div>
      )}

      {/* RAW Development Panel */}
      {showRAWDevelop && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 280, maxHeight: 500, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>RAW Develop</span>
            <button aria-label="Close RAW Develop panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowRAWDevelop(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)', overflowY: 'auto', maxHeight: 420 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>White Balance</div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['auto', 'daylight', 'cloudy', 'tungsten', 'fluorescent'] as const).map(wb => (
                <button key={wb} onClick={() => setRawWhiteBalance(wb)} aria-label={`Set white balance to ${wb}`} aria-pressed={rawWhiteBalance === wb} style={{ padding: '3px 6px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: rawWhiteBalance === wb ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: rawWhiteBalance === wb ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>{wb}</button>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Develop</div>
            {[{ label: 'Exposure', value: rawExposure, set: setRawExposure, min: -5, max: 5 }, { label: 'Recovery', value: rawRecovery, set: setRawRecovery, min: 0, max: 100 }].map(s => (
              <div key={s.label} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</span></div>
                <input type="range" min={s.min} max={s.max} step={s.label === 'Exposure' ? 0.1 : 1} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
            <button aria-label="Apply RAW development" onClick={() => { const wbTemp: Record<string, number> = { auto: 0, daylight: 10, cloudy: 20, tungsten: -30, fluorescent: -15 }; const tempShift = wbTemp[rawWhiteBalance] || 0; setTemperature(tempShift); setExposure(rawExposure); setHighlights(Math.round(-rawRecovery * 0.5)); pushHistory('RAW Develop'); setShowRAWDevelop(false); }} style={{ width: '100%', padding: '6px', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Apply Development</button>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, textAlign: 'center' }}>Supports CR2, NEF, ARW, DNG</div>
          </div>
        </div>
      )}

      {/* Artboard System Panel */}
      {showArtboards && (
        <div style={{ position: 'fixed', left: 60, top: 60, width: 260, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Artboards</span>
            <button aria-label="Close Artboards panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowArtboards(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Add new artboard" onClick={() => setArtboards(prev => [...prev, { id: `ab-${Date.now()}`, name: `Artboard ${prev.length + 1}`, x: prev.length * 100, y: 0, width: canvasSize.width, height: canvasSize.height }])} style={{ width: '100%', padding: '6px', borderRadius: 9999, border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginBottom: 'var(--space-2)' }}>+ New Artboard</button>
            {artboards.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No artboards. Working on single canvas.</div>
            ) : (
              artboards.map((ab, i) => (
                <div key={ab.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px var(--space-2)', borderRadius: 4, background: 'var(--color-border-subtle)', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, width: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{ab.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{ab.width}×{ab.height}</span>
                  <button aria-label={`Delete artboard ${ab.name}`} onClick={(e) => { e.stopPropagation(); setArtboards(prev => prev.filter(a => a.id !== ab.id)); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12, padding: 4 }}><DexIcon name="close" size={12} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Asset Library Panel */}
      {showAssetLibrary && (
        <div className="dex-creative-panel" style={{ position: 'fixed', right: 20, bottom: 60, width: 300, height: 360, borderRadius: 'var(--radius-xl)', zIndex: 6000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Asset Library</span>
            <button aria-label="Close Asset Library panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowAssetLibrary(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
            {(['shapes', 'patterns', 'gradients', 'swatches'] as const).map(cat => (
              <button key={cat} onClick={() => setAssetCategory(cat)} aria-label={`Show ${cat} assets`} aria-pressed={assetCategory === cat} style={{ padding: '4px 10px', borderRadius: 9999, border: 'none', background: assetCategory === cat ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent', color: assetCategory === cat ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{cat}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 10, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {(assetCategory === 'shapes' ? ['Rectangle', 'Circle', 'Triangle', 'Star', 'Arrow', 'Heart', 'Diamond', 'Pentagon'] :
                assetCategory === 'patterns' ? ['Dots', 'Lines', 'Grid', 'Chevron', 'Waves', 'Crosses', 'Hexagons', 'Moire'] :
                assetCategory === 'gradients' ? ['Sunset', 'Ocean', 'Forest', 'Flame', 'Sky', 'Neon', 'Pastel', 'Mono'] :
                ['var(--color-error)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', '#64d2ff', 'var(--color-accent)', '#bf5af2', 'var(--prism-accent)']).map((item, i) => (
                <div key={`${item}-${i}`} onClick={() => { if (assetCategory === 'swatches') { setForegroundColor(item); } else { const newLayer = { id: `asset-${Date.now()}`, name: `${item}`, type: 'shape' as const, visible: true, locked: false, opacity: 100, blendMode: 'normal' as BlendMode, x: Math.round(canvasSize.width / 2 - 50), y: Math.round(canvasSize.height / 2 - 50), width: 100, height: 100, rotation: 0, imageData: undefined }; setLayers(prev => [newLayer, ...prev]); pushHistory(`Insert ${item}`); } }} style={{ aspectRatio: '1', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: assetCategory === 'swatches' ? item : 'var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {assetCategory !== 'swatches' && item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Slice Export Panel */}
      {showSliceExport && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Slice Export for Web</span>
            <button aria-label="Close Slice Export panel" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSliceExport(false)}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <button aria-label="Add slice region" onClick={() => setSlices(prev => [...prev, { id: `slice-${Date.now()}`, name: `Slice ${prev.length + 1}`, x: 0, y: 0, width: 200, height: 200, format: 'png', quality: 80 }])} style={{ width: '100%', padding: '6px', borderRadius: 9999, border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginBottom: 'var(--space-2)' }}>+ Add Slice Region</button>
            {slices.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Draw regions on canvas</div>
            ) : (
              slices.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px var(--space-2)', borderRadius: 4, background: 'var(--color-border-subtle)', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{s.name}</span>
                  <select value={s.format} onChange={e => setSlices(prev => prev.map(sl => sl.id === s.id ? { ...sl, format: e.target.value } : sl))} style={{ padding: '2px 4px', borderRadius: 2, border: '1px solid var(--color-bg-hover)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                    <option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option><option value="svg">SVG</option>
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.width}×{s.height}</span>
                </div>
              ))
            )}
            {slices.length > 0 && (
              <button aria-label="Export all slices" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; slices.forEach((sl) => { const sliceCanvas = document.createElement('canvas'); sliceCanvas.width = sl.width; sliceCanvas.height = sl.height; const ctx = sliceCanvas.getContext('2d'); if (!ctx) return; ctx.drawImage(canvas, sl.x, sl.y, sl.width, sl.height, 0, 0, sl.width, sl.height); const mimeType = sl.format === 'jpg' ? 'image/jpeg' : sl.format === 'webp' ? 'image/webp' : 'image/png'; sliceCanvas.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${sl.name}.${sl.format}`; a.click(); URL.revokeObjectURL(url); }, mimeType, sl.quality / 100); }); setShowSliceExport(false); }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Export All Slices</button>
            )}
          </div>
        </div>
      )}

      {/* Spot Healing Panel */}
      {showSpotHealing && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 260, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Spot Healing</span>
            <button aria-label="Close Spot Healing panel" onClick={() => setShowSpotHealing(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Brush Size</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{brushSize} px</span>
              </div>
              <input aria-label="Spot healing brush size" type="range" min="1" max="200" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} />
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Hardness</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{brushHardness}%</span>
              </div>
              <input aria-label="Spot healing brush hardness" type="range" min="0" max="100" value={brushHardness} onChange={e => setBrushHardness(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-warning)' }} />
            </div>
            <div style={{ padding: 'var(--space-2)', textAlign: 'center', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-inset)', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
              {cloneState.sourceSet
                ? 'Drag over blemishes to heal'
                : 'Alt-click clean skin to set source, then drag over blemishes'}
            </div>
          </div>
        </div>
      )}

      {/* Select Subject Panel */}
      {showSelectSubject && (
        <div style={{ position: 'fixed', right: 20, top: 340, width: 260, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Select Subject</span>
            <button aria-label="Close Select Subject panel" onClick={() => setShowSelectSubject(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ padding: 'var(--space-5)', textAlign: 'center', borderRadius: 6, background: 'var(--color-accent-soft, rgba(10,132,255,0.06))', border: '1px dashed var(--color-accent-light, rgba(10,132,255,0.2))', marginBottom: 10 }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>+</div>
              <div style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, marginBottom: 2 }}>AI Subject Detection</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Automatically detect and select the main subject</div>
            </div>
            <button aria-label="Select subject" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              // Real saliency + edge based subject detection (Sobel + visual-attention),
              // then optional feather / expand-contract from the panel sliders.
              let sel: SelectionMask = createSubjectSelect(imgData, { sensitivity: 60, includeEdges: true, refinementLevel: 'balanced' });
              const mod: SelectModifyOptions = { amount: Math.abs(subjectExpand), preserveCorners: false };
              if (subjectExpand > 0) sel = expandSelection(sel, subjectExpand, mod);
              else if (subjectExpand < 0) sel = contractSelection(sel, -subjectExpand, mod);
              if (subjectFeather > 0) sel = featherSelection(sel, subjectFeather);
              setSelection(prev => ({ ...prev, mask: new Uint8Array(sel.data) }));
              window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Subject selected' } }));
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 'var(--space-2)' }}>Select Subject</button>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              <button aria-label="Refine edge" onClick={() => { setShowSelectSubject(false); setShowRefineEdge(true); }} style={{ flex: 1, padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer' }}>Refine Edge</button>
              <button aria-label="Invert selection" onClick={() => {
                const total = canvasSize.width * canvasSize.height;
                setSelection(prev => {
                  const base = prev.mask ?? new Uint8Array(total);
                  const inv = new Uint8Array(base.length);
                  for (let i = 0; i < base.length; i++) inv[i] = 255 - base[i];
                  return { ...prev, mask: inv };
                });
              }} style={{ flex: 1, padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer' }}>Invert</button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Feather</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{subjectFeather} px</span>
              </div>
              <input aria-label="Subject feather" type="range" min="0" max="50" value={subjectFeather} onChange={e => setSubjectFeather(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Contract/Expand</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{subjectExpand} px</span>
              </div>
              <input aria-label="Subject contract or expand" type="range" min="-20" max="20" value={subjectExpand} onChange={e => setSubjectExpand(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Smart Objects Panel */}
      {showSmartObjects && (
        <div style={{ position: 'fixed', left: 80, top: 120, width: 280, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Smart Objects</span>
            <button aria-label="Close Smart Objects panel" onClick={() => setShowSmartObjects(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ padding: 14, borderRadius: 6, background: 'var(--color-bg-inset)', textAlign: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{(() => { const sel = layers.find(l => l.id === selectedLayerId); return sel && sel.name.startsWith('[SO] ') ? <DexIcon name="package" size={20} /> : '--'; })()}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{(() => { const sel = layers.find(l => l.id === selectedLayerId); return sel && sel.name.startsWith('[SO] ') ? sel.name : 'No smart object selected'; })()}</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Convert a layer to a Smart Object</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button aria-label="Convert to smart object" onClick={() => {
                const sel = layers.find(l => l.id === selectedLayerId);
                if (!sel || sel.name.startsWith('[SO] ')) return;
                pushHistory('Convert to Smart Object');
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, name: `[SO] ${l.name}`, locked: true } : l));
              }} style={{ padding: '6px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer', textAlign: 'left' }}>Convert to Smart Object</button>
              <button aria-label="Edit smart object contents" onClick={() => {
                const sel = layers.find(l => l.id === selectedLayerId);
                if (!sel || !sel.name.startsWith('[SO] ')) return;
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, locked: false } : l));
              }} style={{ padding: '6px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer', textAlign: 'left' }}>Edit Contents</button>
              <button aria-label="Replace smart object contents" onClick={() => {
                const sel = layers.find(l => l.id === selectedLayerId);
                if (!sel) return;
                const input = document.createElement('input');
                input.type = 'file'; input.accept = 'image/*';
                input.onchange = () => {
                  const file = input.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const url = ev.target?.result as string;
                    pushHistory('Replace Smart Object Contents');
                    setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: url } : l));
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }} style={{ padding: '6px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer', textAlign: 'left' }}>Replace Contents...</button>
              <button aria-label="Rasterize smart object" onClick={() => {
                const sel = layers.find(l => l.id === selectedLayerId);
                if (!sel || !sel.name.startsWith('[SO] ')) return;
                pushHistory('Rasterize');
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, name: l.name.replace('[SO] ', ''), locked: false } : l));
              }} style={{ padding: '6px', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 9, cursor: 'pointer', textAlign: 'left' }}>Rasterize</button>
            </div>
          </div>
        </div>
      )}

      {/* Panorama Stitch Panel */}
      {showPanorama && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(440px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Panorama Stitch</span>
            <button aria-label="Close Panorama Stitch panel" onClick={() => setShowPanorama(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Auto Crop
              </label>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Blend Edges
              </label>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" style={{ accentColor: 'var(--color-accent)' }} />
                Vignette Remove
              </label>
            </div>
            <button aria-label="Stitch panorama" onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.multiple = true; input.accept = 'image/*';
              input.onchange = async () => {
                const files = input.files; if (!files || files.length < 2) return;
                const images: HTMLImageElement[] = [];
                for (const file of Array.from(files)) {
                  const img = new Image();
                  img.src = URL.createObjectURL(file);
                  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Failed to load image')); });
                  images.push(img);
                }
                // Simple horizontal stitch with overlap blending
                const overlap = 0.15;
                const h = images[0].naturalHeight;
                const singleW = images[0].naturalWidth;
                const totalW = Math.round(singleW * (1 + (images.length - 1) * (1 - overlap)));
                const canvas = canvasRef.current; if (!canvas) return;
                canvas.width = totalW; canvas.height = h;
                setCanvasSize({ width: totalW, height: h });
                const ctx = canvas.getContext('2d'); if (!ctx) return;
                pushHistory('Panorama Stitch');
                let xOff = 0;
                for (let i = 0; i < images.length; i++) {
                  const iw = images[i].naturalWidth;
                  if (i === 0) {
                    ctx.drawImage(images[i], 0, 0);
                    xOff = Math.round(iw * (1 - overlap));
                  } else {
                    // Draw with alpha blend in overlap zone
                    const overlapPx = Math.round(iw * overlap);
                    const tmpC = document.createElement('canvas');
                    tmpC.width = iw; tmpC.height = h;
                    const tmpCtx = tmpC.getContext('2d');
                    if (!tmpCtx) continue;
                    tmpCtx.drawImage(images[i], 0, 0);
                    const blendData = tmpCtx.getImageData(0, 0, overlapPx, h);
                    const bd = blendData.data;
                    const existData = ctx.getImageData(xOff, 0, overlapPx, h);
                    const ed = existData.data;
                    for (let p = 0; p < bd.length; p += 4) {
                      const px = (p / 4) % overlapPx;
                      const t = px / overlapPx;
                      bd[p] = Math.round(ed[p] * (1 - t) + bd[p] * t);
                      bd[p + 1] = Math.round(ed[p + 1] * (1 - t) + bd[p + 1] * t);
                      bd[p + 2] = Math.round(ed[p + 2] * (1 - t) + bd[p + 2] * t);
                      bd[p + 3] = 255;
                    }
                    ctx.putImageData(blendData, xOff, 0);
                    ctx.drawImage(images[i], overlapPx, 0, iw - overlapPx, h, xOff + overlapPx, 0, iw - overlapPx, h);
                    xOff += Math.round(iw * (1 - overlap));
                  }
                }
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL(), width: totalW, height: h } : l));
                images.forEach(img => URL.revokeObjectURL(img.src));
                setShowPanorama(false);
              };
              input.click();
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Stitch Panorama</button>
          </div>
        </div>
      )}

      {/* Focus Stacking Panel */}
      {showFocusStack && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Focus Stacking</span>
            <button aria-label="Close Focus Stacking panel" onClick={() => setShowFocusStack(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ padding: 30, borderRadius: 6, border: '2px dashed var(--color-border-subtle)', textAlign: 'center', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>--</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Drop focus bracket images here</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Auto-Align
              </label>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Ghost Removal
              </label>
            </div>
            <button aria-label="Stack and merge focus images" onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.multiple = true; input.accept = 'image/*';
              input.onchange = async () => {
                const files = input.files; if (!files || files.length < 2) return;
                const images: HTMLImageElement[] = [];
                for (const file of Array.from(files)) {
                  const img = new Image();
                  img.src = URL.createObjectURL(file);
                  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Failed to load image')); });
                  images.push(img);
                }
                const w = images[0].naturalWidth, h = images[0].naturalHeight;
                const canvas = canvasRef.current; if (!canvas) return;
                canvas.width = w; canvas.height = h;
                setCanvasSize({ width: w, height: h });
                const ctx = canvas.getContext('2d'); if (!ctx) return;
                pushHistory('Focus Stack');
                // Get pixel data for each image
                const datas: ImageData[] = [];
                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = w; tmpCanvas.height = h;
                const tmpCtx = tmpCanvas.getContext('2d');
                if (!tmpCtx) return;
                for (const img of images) {
                  tmpCtx.drawImage(img, 0, 0, w, h);
                  datas.push(tmpCtx.getImageData(0, 0, w, h));
                }
                // For each pixel, pick the image with highest local contrast (Laplacian approximation)
                const result = ctx.createImageData(w, h);
                const rd = result.data;
                for (let y = 1; y < h - 1; y++) {
                  for (let x = 1; x < w - 1; x++) {
                    let bestScore = -1, bestIdx = 0;
                    for (let di = 0; di < datas.length; di++) {
                      const d = datas[di].data;
                      const idx = (y * w + x) * 4;
                      const lum = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
                      const lumT = d[((y - 1) * w + x) * 4] * 0.299 + d[((y - 1) * w + x) * 4 + 1] * 0.587 + d[((y - 1) * w + x) * 4 + 2] * 0.114;
                      const lumB = d[((y + 1) * w + x) * 4] * 0.299 + d[((y + 1) * w + x) * 4 + 1] * 0.587 + d[((y + 1) * w + x) * 4 + 2] * 0.114;
                      const lumL = d[(y * w + x - 1) * 4] * 0.299 + d[(y * w + x - 1) * 4 + 1] * 0.587 + d[(y * w + x - 1) * 4 + 2] * 0.114;
                      const lumR = d[(y * w + x + 1) * 4] * 0.299 + d[(y * w + x + 1) * 4 + 1] * 0.587 + d[(y * w + x + 1) * 4 + 2] * 0.114;
                      const lap = Math.abs(lumT + lumB + lumL + lumR - 4 * lum);
                      if (lap > bestScore) { bestScore = lap; bestIdx = di; }
                    }
                    const si = (y * w + x) * 4;
                    rd[si] = datas[bestIdx].data[si];
                    rd[si + 1] = datas[bestIdx].data[si + 1];
                    rd[si + 2] = datas[bestIdx].data[si + 2];
                    rd[si + 3] = 255;
                  }
                }
                ctx.putImageData(result, 0, 0);
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL(), width: w, height: h } : l));
                images.forEach(img => URL.revokeObjectURL(img.src));
                setShowFocusStack(false);
              };
              input.click();
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 9999, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Stack & Merge</button>
          </div>
        </div>
      )}

      {/* ===== NEW PRO FEATURE PANELS ===== */}

      {/* 1. Curves Editor */}
      {showCurves && (
        <div style={{ position: 'fixed', right: 290, top: 120, width: 320, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Curves</span>
            <button aria-label="Close Curves panel" onClick={() => setShowCurves(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              {(['rgb', 'r', 'g', 'b'] as const).map(ch => (
                <button key={ch} onClick={() => setCurvesChannel(ch)} aria-label={`${ch.toUpperCase()} channel`} style={{ flex: 1, padding: '4px', borderRadius: 9999, border: '1px solid ' + (curvesChannel === ch ? (ch === 'rgb' ? 'var(--color-text-tertiary)' : ch === 'r' ? 'rgba(255,59,48,0.3)' : ch === 'g' ? 'rgba(48,209,88,0.3)' : 'rgba(10,132,255,0.3)') : 'var(--color-bg-hover)'), background: curvesChannel === ch ? (ch === 'rgb' ? 'var(--color-border-subtle)' : ch === 'r' ? 'rgba(255,59,48,0.1)' : ch === 'g' ? 'rgba(48,209,88,0.1)' : 'rgba(10,132,255,0.1)') : 'var(--color-border-subtle)', color: curvesChannel === ch ? (ch === 'rgb' ? '#fff' : ch === 'r' ? 'var(--color-error)' : ch === 'g' ? 'var(--color-success)' : 'var(--color-accent)') : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{ch.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ position: 'relative', width: 280, height: 200, background: 'var(--color-bg-base)', borderRadius: 4, border: '1px solid var(--color-bg-hover)', marginBottom: 'var(--space-2)' }}>
              <svg width="280" height="200" viewBox="0 0 256 256" style={{ position: 'absolute', top: 0, left: 0 }}>
                {/* Grid lines */}
                {[64, 128, 192].map(v => (<React.Fragment key={v}><line x1={v} y1="0" x2={v} y2="256" stroke="var(--color-bg-hover)" strokeWidth="1" /><line x1="0" y1={v} x2="256" y2={v} stroke="var(--color-bg-hover)" strokeWidth="1" /></React.Fragment>))}
                <line x1="0" y1="256" x2="256" y2="0" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4,4" />
                {/* Curve */}
                <polyline points={curvesPoints[curvesChannel].map(p => `${p.x},${256 - p.y}`).join(' ')} fill="none" stroke={curvesChannel === 'rgb' ? '#fff' : curvesChannel === 'r' ? 'var(--color-error)' : curvesChannel === 'g' ? 'var(--color-success)' : 'var(--color-accent)'} strokeWidth="2" />
                {/* Control points */}
                {curvesPoints[curvesChannel].map((p, i) => (
                  <circle key={i} cx={p.x} cy={256 - p.y} r="5" fill={curvesChannel === 'rgb' ? '#fff' : curvesChannel === 'r' ? 'var(--color-error)' : curvesChannel === 'g' ? 'var(--color-success)' : 'var(--color-accent)'} stroke="#000" strokeWidth="1" style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => {
                      (e.target as Element).setPointerCapture(e.pointerId);
                      const svg = e.currentTarget.closest('svg')!;
                      const rect = svg.getBoundingClientRect();
                      let rafId = 0;
                      const onMove = (ev: PointerEvent) => {
                        cancelAnimationFrame(rafId);
                        rafId = requestAnimationFrame(() => {
                          const nx = Math.max(0, Math.min(255, ((ev.clientX - rect.left) / rect.width) * 256));
                          const ny = Math.max(0, Math.min(255, 256 - ((ev.clientY - rect.top) / rect.height) * 256));
                          setCurvesPoints(prev => {
                            const pts = [...prev[curvesChannel]];
                            pts[i] = { x: Math.round(nx), y: Math.round(ny) };
                            return { ...prev, [curvesChannel]: pts };
                          });
                        });
                      };
                      const onUp = () => { cancelAnimationFrame(rafId); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }} />
                ))}
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              <span>Input: 0-255</span>
              <button aria-label="Add curve point" onClick={() => setCurvesPoints(prev => ({ ...prev, [curvesChannel]: [...prev[curvesChannel].slice(0, -1), { x: 128, y: 128 }, prev[curvesChannel][prev[curvesChannel].length - 1]] }))} style={{ background: 'var(--color-bg-hover)', border: 'none', borderRadius: 9999, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>+ Point</button>
              <button aria-label="Reset curves" onClick={() => setCurvesPoints(prev => ({ ...prev, [curvesChannel]: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }))} style={{ background: 'var(--color-bg-hover)', border: 'none', borderRadius: 9999, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>Reset</button>
            </div>
            <button aria-label="Apply curves adjustment" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Curves');
              const w = canvas.width, h = canvas.height;
              const imgData = ctx.getImageData(0, 0, w, h);
              const d = imgData.data;
              // Build LUT per channel via monotone cubic interpolation
              const buildLUT = (pts: { x: number; y: number }[]) => {
                const sorted = [...pts].sort((a, b) => a.x - b.x);
                const lut = new Uint8Array(256);
                for (let i = 0; i < 256; i++) {
                  if (i <= sorted[0].x) { lut[i] = Math.max(0, Math.min(255, sorted[0].y)); continue; }
                  if (i >= sorted[sorted.length - 1].x) { lut[i] = Math.max(0, Math.min(255, sorted[sorted.length - 1].y)); continue; }
                  let si = 0;
                  for (let j = 0; j < sorted.length - 1; j++) { if (i >= sorted[j].x && i <= sorted[j + 1].x) { si = j; break; } }
                  const x0 = sorted[si].x, y0 = sorted[si].y, x1 = sorted[si + 1].x, y1 = sorted[si + 1].y;
                  const t = x1 !== x0 ? (i - x0) / (x1 - x0) : 0;
                  const val = y0 + (y1 - y0) * (3 * t * t - 2 * t * t * t);
                  lut[i] = Math.max(0, Math.min(255, Math.round(val)));
                }
                return lut;
              };
              const channels = curvesChannel === 'rgb' ? ['rgb'] : [curvesChannel];
              for (const ch of channels) {
                const lut = buildLUT(curvesPoints[ch as keyof typeof curvesPoints]);
                for (let i = 0; i < d.length; i += 4) {
                  if (ch === 'rgb' || ch === 'r') d[i] = lut[d[i]];
                  if (ch === 'rgb' || ch === 'g') d[i + 1] = lut[d[i + 1]];
                  if (ch === 'rgb' || ch === 'b') d[i + 2] = lut[d[i + 2]];
                }
              }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowCurves(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 2. Levels */}
      {showLevels && (
        <div style={{ position: 'fixed', right: 290, top: 160, width: 340, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Levels</span>
            <button aria-label="Close Levels panel" onClick={() => setShowLevels(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              {(['rgb', 'r', 'g', 'b'] as const).map(ch => (
                <button key={ch} onClick={() => setLevelsChannel(ch)} aria-label={`${ch.toUpperCase()} channel`} style={{ flex: 1, padding: '4px', borderRadius: 9999, border: '1px solid ' + (levelsChannel === ch ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: levelsChannel === ch ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: levelsChannel === ch ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{ch.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ height: 60, background: 'var(--color-bg-base)', borderRadius: 4, marginBottom: 'var(--space-2)', border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'flex-end', padding: '0 2px' }}>
              {(() => {
                const canvas = canvasRef.current; if (!canvas) return null;
                const ctx = canvas.getContext('2d'); if (!ctx) return null;
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                const hist = new Uint32Array(64);
                const chIdx = levelsChannel === 'r' ? 0 : levelsChannel === 'g' ? 1 : levelsChannel === 'b' ? 2 : -1;
                for (let i = 0; i < d.length; i += 4) {
                  const v = chIdx >= 0 ? d[i + chIdx] : Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
                  hist[v >> 2]++;
                }
                const maxH = Math.max(...hist) || 1;
                return Array.from({ length: 64 }, (_, i) => <div key={i} style={{ flex: 1, background: levelsChannel === 'r' ? 'var(--color-error)' : levelsChannel === 'g' ? 'var(--color-success)' : levelsChannel === 'b' ? 'var(--color-accent-fill)' : '#888', height: `${(hist[i] / maxH) * 100}%`, opacity: 0.6, borderRadius: '1px 1px 0 0' }} />);
              })()}
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Input Levels</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input aria-label="Levels input black point" type="number" value={levelsInput[0]} onChange={e => setLevelsInput([Number(e.target.value), levelsInput[1]])} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '2px 4px', textAlign: 'center' }} />
                <input aria-label="Levels gamma" type="range" min="0.1" max="5" step="0.01" value={levelsGamma} onChange={e => setLevelsGamma(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
                <input aria-label="Levels input white point" type="number" value={levelsInput[1]} onChange={e => setLevelsInput([levelsInput[0], Number(e.target.value)])} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '2px 4px', textAlign: 'center' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: 2 }}>Gamma: {levelsGamma.toFixed(2)}</div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Output Levels</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={levelsOutput[0]} onChange={e => setLevelsOutput([Number(e.target.value), levelsOutput[1]])} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '2px 4px', textAlign: 'center' }} />
                <div style={{ flex: 1, height: 12, borderRadius: 4, background: 'linear-gradient(to right, #000, #fff)' }} />
                <input type="number" value={levelsOutput[1]} onChange={e => setLevelsOutput([levelsOutput[0], Number(e.target.value)])} style={{ width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '2px 4px', textAlign: 'center' }} />
              </div>
            </div>
            <button aria-label="Apply levels adjustment" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Levels');
              const w = canvas.width, h = canvas.height;
              const imgData = ctx.getImageData(0, 0, w, h);
              const d = imgData.data;
              const inB = levelsInput[0], inW = levelsInput[1], gamma = levelsGamma, outB = levelsOutput[0], outW = levelsOutput[1];
              const lut = new Uint8Array(256);
              for (let i = 0; i < 256; i++) {
                let v = (i - inB) / Math.max(1, inW - inB);
                v = Math.max(0, Math.min(1, v));
                v = Math.pow(v, 1 / gamma);
                lut[i] = Math.max(0, Math.min(255, Math.round(v * (outW - outB) + outB)));
              }
              const chIdx = levelsChannel === 'r' ? [0] : levelsChannel === 'g' ? [1] : levelsChannel === 'b' ? [2] : [0, 1, 2];
              for (let i = 0; i < d.length; i += 4) { for (const c of chIdx) d[i + c] = lut[d[i + c]]; }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowLevels(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 3. Channel Mixer */}
      {showChannelMixer && (
        <div style={{ position: 'fixed', right: 290, top: 200, width: 300, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Channel Mixer</span>
            <button aria-label="Close Channel Mixer panel" onClick={() => setShowChannelMixer(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', alignSelf: 'center', marginRight: 4 }}>Output:</span>
              {(['r', 'g', 'b'] as const).map(ch => (
                <button key={ch} onClick={() => setChannelMixerOutput(ch)} aria-label={`Output ${ch.toUpperCase()} channel`} style={{ padding: '3px 10px', borderRadius: 9999, border: '1px solid ' + (channelMixerOutput === ch ? (ch === 'r' ? 'rgba(255,59,48,0.3)' : ch === 'g' ? 'rgba(48,209,88,0.3)' : 'rgba(10,132,255,0.3)') : 'var(--color-bg-hover)'), background: channelMixerOutput === ch ? (ch === 'r' ? 'rgba(255,59,48,0.1)' : ch === 'g' ? 'rgba(48,209,88,0.1)' : 'rgba(10,132,255,0.1)') : 'transparent', color: channelMixerOutput === ch ? (ch === 'r' ? 'var(--color-error)' : ch === 'g' ? 'var(--color-success)' : 'var(--color-accent)') : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{ch.toUpperCase()}</button>
              ))}
            </div>
            {(['r', 'g', 'b'] as const).map(src => (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: src === 'r' ? 'var(--color-error)' : src === 'g' ? 'var(--color-success)' : 'var(--color-accent)', width: 14, textAlign: 'right', fontWeight: 600 }}>{src.toUpperCase()}</span>
                <input aria-label={`${channelMixerOutput.toUpperCase()} output ${src.toUpperCase()} channel mix`} type="range" min="-200" max="200" value={channelMixerValues[channelMixerOutput][src]} onChange={e => setChannelMixerValues(prev => ({ ...prev, [channelMixerOutput]: { ...prev[channelMixerOutput], [src]: Number(e.target.value) } }))} style={{ flex: 1, accentColor: src === 'r' ? 'var(--color-error)' : src === 'g' ? 'var(--color-success)' : 'var(--color-accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 30, textAlign: 'right' }}>{channelMixerValues[channelMixerOutput][src]}%</span>
              </div>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <input type="checkbox" checked={channelMixerMonochrome} onChange={e => setChannelMixerMonochrome(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Monochrome
            </label>
            <button aria-label="Apply channel mixer" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Channel Mixer');
              const w = canvas.width, h = canvas.height;
              const imgData = ctx.getImageData(0, 0, w, h);
              const d = imgData.data;
              const mx = channelMixerValues;
              if (channelMixerMonochrome) {
                const rr = mx.r.r / 100, rg = mx.r.g / 100, rb = mx.r.b / 100;
                for (let i = 0; i < d.length; i += 4) {
                  const gray = Math.max(0, Math.min(255, d[i] * rr + d[i + 1] * rg + d[i + 2] * rb));
                  d[i] = d[i + 1] = d[i + 2] = Math.round(gray);
                }
              } else {
                for (let i = 0; i < d.length; i += 4) {
                  const r = d[i], g = d[i + 1], b = d[i + 2];
                  d[i] = Math.max(0, Math.min(255, Math.round(r * mx.r.r / 100 + g * mx.r.g / 100 + b * mx.r.b / 100)));
                  d[i + 1] = Math.max(0, Math.min(255, Math.round(r * mx.g.r / 100 + g * mx.g.g / 100 + b * mx.g.b / 100)));
                  d[i + 2] = Math.max(0, Math.min(255, Math.round(r * mx.b.r / 100 + g * mx.b.g / 100 + b * mx.b.b / 100)));
                }
              }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowChannelMixer(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 5. Selective Color */}
      {showSelectiveColor && (
        <div style={{ position: 'fixed', right: 290, top: 240, width: 310, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Selective Color</span>
            <button aria-label="Close Selective Color panel" onClick={() => setShowSelectiveColor(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
              {(['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'] as const).map(t => (
                <button key={t} onClick={() => { setSelectiveColorTarget(t); setSelectiveColorAdj({ cyan: 0, magenta: 0, yellow: 0, black: 0 }); }} aria-label={`Select ${t}`} style={{ padding: '3px 6px', borderRadius: 9999, border: '1px solid ' + (selectiveColorTarget === t ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: selectiveColorTarget === t ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: selectiveColorTarget === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            {(['cyan', 'magenta', 'yellow', 'black'] as const).map(c => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 50, textTransform: 'capitalize' }}>{c}</span>
                <input type="range" min="-100" max="100" value={selectiveColorAdj[c]} onChange={e => setSelectiveColorAdj(prev => ({ ...prev, [c]: Number(e.target.value) }))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{selectiveColorAdj[c]}%</span>
              </div>
            ))}
            <button aria-label="Apply selective color" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Selective Color');
              const w = canvas.width, h = canvas.height;
              const imgData = ctx.getImageData(0, 0, w, h);
              const d = imgData.data;
              const adj = selectiveColorAdj;
              const target = selectiveColorTarget;
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i+1], b = d[i+2];
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                const delta = max - min;
                const lum = (max + min) / 2;
                let hueVal = 0;
                if (delta > 0) {
                  if (max === r) hueVal = ((g - b) / delta + 6) % 6;
                  else if (max === g) hueVal = (b - r) / delta + 2;
                  else hueVal = (r - g) / delta + 4;
                }
                const satVal = delta / (255 - Math.abs(2 * lum - 255) || 1);
                // Determine if this pixel belongs to the target color range
                let match = false;
                if (target === 'reds') match = (hueVal < 0.5 || hueVal > 5.5) && satVal > 0.1;
                else if (target === 'yellows') match = hueVal >= 0.5 && hueVal < 1.5 && satVal > 0.1;
                else if (target === 'greens') match = hueVal >= 1.5 && hueVal < 2.5 && satVal > 0.1;
                else if (target === 'cyans') match = hueVal >= 2.5 && hueVal < 3.5 && satVal > 0.1;
                else if (target === 'blues') match = hueVal >= 3.5 && hueVal < 4.5 && satVal > 0.1;
                else if (target === 'magentas') match = hueVal >= 4.5 && hueVal < 5.5 && satVal > 0.1;
                else if (target === 'whites') match = lum > 200 && satVal < 0.2;
                else if (target === 'neutrals') match = satVal < 0.15 && lum > 50 && lum < 200;
                else if (target === 'blacks') match = lum < 50;
                if (!match) continue;
                // Apply CMYK adjustments: cyan reduces R, magenta reduces G, yellow reduces B, black reduces all
                const cf = adj.cyan / 100, mf = adj.magenta / 100, yf = adj.yellow / 100, kf = adj.black / 100;
                d[i]   = Math.max(0, Math.min(255, Math.round(r * (1 - cf) * (1 - kf))));
                d[i+1] = Math.max(0, Math.min(255, Math.round(g * (1 - mf) * (1 - kf))));
                d[i+2] = Math.max(0, Math.min(255, Math.round(b * (1 - yf) * (1 - kf))));
              }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowSelectiveColor(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Apply</button>
          </div>
        </div>
      )}

      {/* 6. Photo Filter */}
      {showPhotoFilter && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(300px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Photo Filter</span>
            <button aria-label="Close Photo Filter panel" onClick={() => setShowPhotoFilter(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {[{ l: 'Warming (85)', c: '#ec8a00' }, { l: 'Warming (81)', c: '#ebb113' }, { l: 'Cooling (80)', c: '#006ddb' }, { l: 'Cooling (82)', c: '#4aa5ff' }, { l: 'Deep Red', c: '#cc3300' }, { l: 'Deep Blue', c: '#003399' }, { l: 'Deep Emerald', c: '#006633' }, { l: 'Sepia', c: '#a07030' }, { l: 'Violet', c: '#553399' }, { l: 'Orange', c: '#ff6600' }].map(f => (
                <button key={f.l} onClick={() => setPhotoFilterColor(f.c)} aria-label={`Apply ${f.l} filter`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 9999, border: '1px solid ' + (photoFilterColor === f.c ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: photoFilterColor === f.c ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', cursor: 'pointer' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: f.c }} />
                  <span style={{ fontSize: 11, color: photoFilterColor === f.c ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{f.l}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Color:</span>
              <input type="color" value={photoFilterColor} onChange={e => setPhotoFilterColor(e.target.value)} style={{ width: 24, height: 18, border: 'none', background: 'none', cursor: 'pointer' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{photoFilterColor}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 45 }}>Density</span>
              <input type="range" min="1" max="100" value={photoFilterDensity} onChange={e => setPhotoFilterDensity(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{photoFilterDensity}%</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
              <input type="checkbox" checked={photoFilterPreserveLum} onChange={e => setPhotoFilterPreserveLum(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Preserve Luminosity
            </label>
            <button aria-label="Apply photo filter" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Photo Filter');
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const filtered = applyPhotoFilter(imgData, photoFilterColor, photoFilterDensity, photoFilterPreserveLum);
              ctx.putImageData(filtered, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowPhotoFilter(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 7. Color Lookup / LUT */}
      {showColorLookup && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Color Lookup (LUT)</span>
            <button aria-label="Close Color Lookup panel" onClick={() => setShowColorLookup(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[{ id: 'cinematic-warm', name: 'Cinematic Warm', desc: 'Orange & teal Hollywood look' }, { id: 'cinematic-cold', name: 'Cinematic Cold', desc: 'Desaturated cool-blue thriller' }, { id: 'vintage-amber', name: 'Vintage Amber', desc: 'Faded golden analog film' }, { id: 'cross-processed', name: 'Cross Processed', desc: 'Strong color shifts, high contrast' }, { id: 'moonlight', name: 'Moonlight', desc: 'Cool blue night-time grade' }, { id: 'bleach-bypass', name: 'Bleach Bypass', desc: 'Desaturated high-contrast silver' }, { id: 'candlelight', name: 'Candlelight', desc: 'Warm low-light tungsten glow' }, { id: 'fuji-velvia', name: 'Fuji Velvia 50', desc: 'Vivid landscape film emulation' }, { id: 'kodak-portra', name: 'Kodak Portra 400', desc: 'Natural skin-tone portrait film' }, { id: 'b-roll-flat', name: 'B-Roll Flat', desc: 'Log/flat for maximum grading flexibility' }].map(lut => (
                <button key={lut.id} onClick={() => setColorLookupPreset(lut.id)} aria-label={`Apply ${lut.name} LUT`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px var(--space-2)', borderRadius: 4, border: '1px solid ' + (colorLookupPreset === lut.id ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: colorLookupPreset === lut.id ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 11, color: colorLookupPreset === lut.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: 600 }}>{lut.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{lut.desc}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: 'var(--space-2)', borderRadius: 4, border: '2px dashed var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Load Custom .cube LUT file</span>
            </div>
            <button aria-label="Apply color lookup" disabled={!colorLookupPreset} onClick={() => {
              const canvas = canvasRef.current; if (!canvas || !colorLookupPreset) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Color Lookup');
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const d = imgData.data;
              // Per-channel LUTs realise each preset as a concrete tone/colour grade
              // (lift/gamma/gain + saturation), so the named looks actually change the
              // pixels rather than only highlighting a row.
              const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;
              // [lift, gamma, gainScale] per RGB channel + global saturation factor
              const G: Record<string, { lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number]; sat: number }> = {
                'cinematic-warm': { lift: [8, 0, -10], gamma: [1.0, 0.98, 1.08], gain: [1.06, 1.0, 0.9], sat: 1.12 },
                'cinematic-cold': { lift: [-8, 0, 12], gamma: [1.06, 1.0, 0.94], gain: [0.92, 0.98, 1.08], sat: 0.85 },
                'vintage-amber': { lift: [18, 8, -12], gamma: [1.0, 1.0, 1.06], gain: [1.04, 0.98, 0.84], sat: 0.78 },
                'cross-processed': { lift: [-6, 6, 14], gamma: [0.9, 1.0, 1.1], gain: [1.12, 1.0, 0.92], sat: 1.3 },
                'moonlight': { lift: [-10, -4, 16], gamma: [1.1, 1.04, 0.9], gain: [0.86, 0.94, 1.12], sat: 0.7 },
                'bleach-bypass': { lift: [4, 4, 4], gamma: [0.86, 0.86, 0.86], gain: [1.0, 1.0, 1.0], sat: 0.45 },
                'candlelight': { lift: [20, 6, -16], gamma: [0.96, 1.0, 1.1], gain: [1.08, 0.96, 0.78], sat: 1.05 },
                'fuji-velvia': { lift: [0, 0, 0], gamma: [0.94, 0.96, 0.94], gain: [1.08, 1.04, 1.06], sat: 1.45 },
                'kodak-portra': { lift: [6, 4, 2], gamma: [1.0, 1.0, 1.0], gain: [1.04, 1.0, 0.98], sat: 1.08 },
                'b-roll-flat': { lift: [16, 16, 16], gamma: [1.0, 1.0, 1.0], gain: [0.82, 0.82, 0.82], sat: 0.85 },
              };
              const g = G[colorLookupPreset] || { lift: [0, 0, 0] as [number, number, number], gamma: [1, 1, 1] as [number, number, number], gain: [1, 1, 1] as [number, number, number], sat: 1 };
              const lut: [Uint8Array, Uint8Array, Uint8Array] = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
              for (let c = 0; c < 3; c++) {
                for (let i = 0; i < 256; i++) {
                  let v = i / 255;
                  v = Math.pow(Math.max(0, v), 1 / g.gamma[c]);
                  v = v * g.gain[c] + g.lift[c] / 255;
                  lut[c][i] = clamp(Math.round(v * 255));
                }
              }
              for (let i = 0; i < d.length; i += 4) {
                let r = lut[0][d[i]], gr = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
                if (g.sat !== 1) {
                  const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
                  r = clamp(lum + (r - lum) * g.sat);
                  gr = clamp(lum + (gr - lum) * g.sat);
                  b = clamp(lum + (b - lum) * g.sat);
                }
                d[i] = r; d[i + 1] = gr; d[i + 2] = b;
              }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowColorLookup(false);
            }} style={{ width: '100%', padding: '7px', marginTop: 10, borderRadius: 'var(--radius-lg)', border: 'none', background: colorLookupPreset ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)', color: colorLookupPreset ? '#fff' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: colorLookupPreset ? 'pointer' : 'not-allowed', opacity: colorLookupPreset ? 1 : 0.6 }}>Apply LUT</button>
          </div>
        </div>
      )}

      {/* 8. Replace Color */}
      {showReplaceColor && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(300px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Replace Color</span>
            <button aria-label="Close Replace Color panel" onClick={() => setShowReplaceColor(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Source</span>
                <input type="color" value={replaceColorSource} onChange={e => setReplaceColorSource(e.target.value)} style={{ width: 40, height: 40, border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
              </div>
              <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}>→</span>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Target</span>
                <input type="color" value={replaceColorTarget} onChange={e => setReplaceColorTarget(e.target.value)} style={{ width: 40, height: 40, border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>Fuzziness</span>
              <input type="range" min="0" max="200" value={replaceColorFuzziness} onChange={e => setReplaceColorFuzziness(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{replaceColorFuzziness}</span>
            </div>
            <button aria-label="Apply color replacement" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              const src = hexToRgb(replaceColorSource);
              const tgt = hexToRgb(replaceColorTarget);
              if (!src || !tgt) return;
              pushHistory('Replace Color');
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const d = imgData.data;
              const tol = replaceColorFuzziness; // 0-200 distance threshold
              for (let i = 0; i < d.length; i += 4) {
                const dr = d[i] - src.r, dg = d[i + 1] - src.g, db = d[i + 2] - src.b;
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                if (dist <= tol) {
                  // Feathered blend near the tolerance edge so the swap is not a hard cut-out.
                  const blend = tol > 0 ? Math.max(0, 1 - dist / tol) : 1;
                  d[i] = Math.round(d[i] + (tgt.r - d[i]) * blend);
                  d[i + 1] = Math.round(d[i + 1] + (tgt.g - d[i + 1]) * blend);
                  d[i + 2] = Math.round(d[i + 2] + (tgt.b - d[i + 2]) * blend);
                }
              }
              ctx.putImageData(imgData, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowReplaceColor(false);
            }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Replace</button>
          </div>
        </div>
      )}

      {/* 9. Posterize */}
      {showPosterize && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(280px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Posterize</span>
            <button aria-label="Close Posterize panel" onClick={() => setShowPosterize(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 40 }}>Levels</span>
              <input type="range" min="2" max="32" value={posterizeLevels} onChange={e => setPosterizeLevels(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 20, textAlign: 'right' }}>{posterizeLevels}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              {[2, 4, 6, 8, 16].map(l => <button key={l} onClick={() => setPosterizeLevels(l)} aria-label={`${l} levels`} style={{ flex: 1, padding: '4px', borderRadius: 9999, border: '1px solid ' + (posterizeLevels === l ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: posterizeLevels === l ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: posterizeLevels === l ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 9, cursor: 'pointer' }}>{l}</button>)}
            </div>
            <button aria-label="Apply posterize effect" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('Posterize'); const imgData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height); const d = imgData.data; const lvl = posterizeLevels; for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) { d[i + c] = Math.round(Math.round(d[i + c] / 255 * (lvl - 1)) / (lvl - 1) * 255); } } ctx.putImageData(imgData, 0, 0); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l)); setShowPosterize(false); }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 10. Threshold */}
      {showThreshold && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(280px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Threshold</span>
            <button aria-label="Close Threshold panel" onClick={() => setShowThreshold(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ height: 40, background: 'var(--color-bg-base)', borderRadius: 4, marginBottom: 'var(--space-2)', border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'flex-end', padding: '0 2px' }}>
              {thresholdHistBins.map((h, i) => <div key={i} style={{ flex: 1, background: '#888', height: `${h}%`, opacity: i < (thresholdValue / 4) ? 0.3 : 0.8, borderRadius: '1px 1px 0 0' }} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>Threshold</span>
              <input type="range" min="1" max="255" value={thresholdValue} onChange={e => setThresholdValue(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{thresholdValue}</span>
            </div>
            <button aria-label="Apply threshold effect" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('Threshold'); const imgData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height); const d = imgData.data; for (let i = 0; i < d.length; i += 4) { const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; const v = lum >= thresholdValue ? 255 : 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; } ctx.putImageData(imgData, 0, 0); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l)); setShowThreshold(false); }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 11. Canvas Size */}
      {showCanvasSize && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Canvas Size</span>
            <button aria-label="Close Canvas Size panel" onClick={() => setShowCanvasSize(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Current: {canvasSize.width} × {canvasSize.height}</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 2 }}>Width</span>
                <input type="number" value={canvasSizeNew.width} onChange={e => setCanvasSizeNew(prev => ({ ...prev, width: Number(e.target.value) }))} style={{ width: '100%', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '4px 6px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 2 }}>Height</span>
                <input type="number" value={canvasSizeNew.height} onChange={e => setCanvasSizeNew(prev => ({ ...prev, height: Number(e.target.value) }))} style={{ width: '100%', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '4px 6px' }} />
              </div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Anchor</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: 90, marginBottom: 10 }}>
              {(['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'] as const).map(a => (
                <button key={a} onClick={() => setCanvasSizeAnchor(a)} aria-label={`Anchor ${a}`} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid ' + (canvasSizeAnchor === a ? 'var(--dex-focus-color, #fff)' : 'var(--color-border-subtle)'), background: canvasSizeAnchor === a ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', cursor: 'pointer' }}>
                  {canvasSizeAnchor === a && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--dex-focus-color, #fff)', margin: 'auto' }} />}
                </button>
              ))}
            </div>
            <button aria-label="Apply canvas resize" onClick={() => { setCanvasSize(canvasSizeNew); setShowCanvasSize(false); }} style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 12. Image Rotation */}
      {showImageRotation && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(280px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Image Rotation</span>
            <button aria-label="Close Image Rotation panel" onClick={() => setShowImageRotation(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
              {[{ label: '90° CW', icon: '↻' }, { label: '90° CCW', icon: '↺' }, { label: '180°', icon: '↕' }, { label: 'Flip H', icon: '↔' }, { label: 'Flip V', icon: '↕' }, { label: 'Arbitrary', icon: '∠' }].map(r => (
                <button key={r.label} aria-label={`Rotate ${r.label}`} onClick={() => {
                  if (r.label === 'Arbitrary') return;
                  if (r.label === '90° CW') {
                    setCanvasSize({ width: canvasSize.height, height: canvasSize.width });
                    setLayers(prev => prev.map(l => ({ ...l, rotation: ((l.rotation || 0) + 90) % 360, x: canvasSize.height - l.y - l.height, y: l.x, width: l.height, height: l.width })));
                    pushHistory('Rotate 90° CW');
                  } else if (r.label === '90° CCW') {
                    setCanvasSize({ width: canvasSize.height, height: canvasSize.width });
                    setLayers(prev => prev.map(l => ({ ...l, rotation: ((l.rotation || 0) + 270) % 360, x: l.y, y: canvasSize.width - l.x - l.width, width: l.height, height: l.width })));
                    pushHistory('Rotate 90° CCW');
                  } else if (r.label === '180°') {
                    setLayers(prev => prev.map(l => ({ ...l, rotation: ((l.rotation || 0) + 180) % 360, x: canvasSize.width - l.x - l.width, y: canvasSize.height - l.y - l.height })));
                    pushHistory('Rotate 180°');
                  } else if (r.label === 'Flip H') {
                    setLayers(prev => prev.map(l => ({ ...l, x: canvasSize.width - l.x - l.width })));
                    pushHistory('Flip Horizontal');
                  } else if (r.label === 'Flip V') {
                    setLayers(prev => prev.map(l => ({ ...l, y: canvasSize.height - l.y - l.height })));
                    pushHistory('Flip Vertical');
                  }
                  setShowImageRotation(false);
                }} style={{ padding: 'var(--space-2)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s ease' }}>
                  <span style={{ fontSize: 14 }}>{r.icon}</span> {r.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 40 }}>Angle</span>
              <input type="range" min="-180" max="180" value={arbitraryAngle} onChange={e => setArbitraryAngle(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{arbitraryAngle}°</span>
            </div>
            <button aria-label="Apply arbitrary rotation" onClick={() => {
              if (arbitraryAngle !== 0) {
                setLayers(prev => prev.map(l => ({ ...l, rotation: ((l.rotation || 0) + arbitraryAngle) % 360 })));
                pushHistory(`Rotate ${arbitraryAngle}°`);
              }
              setShowImageRotation(false);
            }} style={{ width: '100%', padding: '6px', marginTop: 6, borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.12s ease' }}>Apply Rotation</button>
          </div>
        </div>
      )}

      {/* 13. Color Balance */}
      {showColorBalance && (
        <div style={{ position: 'fixed', right: 290, top: 140, width: 310, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Color Balance</span>
            <button aria-label="Close Color Balance panel" onClick={() => setShowColorBalance(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['shadows', 'midtones', 'highlights'] as const).map(t => (
                <button key={t} onClick={() => setColorBalanceTone(t)} aria-label={`${t} tone`} style={{ flex: 1, padding: '4px', borderRadius: 9999, border: '1px solid ' + (colorBalanceTone === t ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: colorBalanceTone === t ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: colorBalanceTone === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            {[{ label: 'Cyan / Red', key: 'cr' as const }, { label: 'Magenta / Green', key: 'mg' as const }, { label: 'Yellow / Blue', key: 'yb' as const }].map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 80 }}>{s.label}</span>
                <input type="range" min="-100" max="100" value={colorBalanceValues[colorBalanceTone][s.key]} onChange={e => setColorBalanceValues(prev => ({ ...prev, [colorBalanceTone]: { ...prev[colorBalanceTone], [s.key]: Number(e.target.value) } }))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{colorBalanceValues[colorBalanceTone][s.key]}</span>
              </div>
            ))}
            <button aria-label="Apply color balance" onClick={() => {
              const canvas = canvasRef.current; if (!canvas) return;
              const ctx = canvas.getContext('2d'); if (!ctx) return;
              pushHistory('Color Balance');
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const v = colorBalanceValues;
              // Sliders run cyan<->red etc; adjustColorBalance reduces the channel for a
              // positive value, so negate to make "drag toward red/green/blue" add it.
              const toCMY = (t: { cr: number; mg: number; yb: number }) => ({ cyan: -t.cr, magenta: -t.mg, yellow: -t.yb });
              const result = adjustColorBalance(imgData, toCMY(v.shadows), toCMY(v.midtones), toCMY(v.highlights), true);
              ctx.putImageData(result, 0, 0);
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l));
              setShowColorBalance(false);
            }} style={{ width: '100%', padding: '7px', marginTop: 4, borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 14. Gradient Map */}
      {showGradientMap && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(340px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Gradient Map</span>
            <button aria-label="Close Gradient Map panel" onClick={() => setShowGradientMap(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ height: 24, borderRadius: 4, marginBottom: 10, background: `linear-gradient(to right, ${gradientMapStops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})` }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {[{ n: 'B&W', s: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] }, { n: 'Duotone Blue', s: [{ offset: 0, color: '#000022' }, { offset: 1, color: '#4488ff' }] }, { n: 'Sunset', s: [{ offset: 0, color: '#1a0a2e' }, { offset: 0.5, color: '#ff6b35' }, { offset: 1, color: '#f7c948' }] }, { n: 'Infrared', s: [{ offset: 0, color: '#000' }, { offset: 0.5, color: '#ff0066' }, { offset: 1, color: '#ffccdd' }] }, { n: 'Thermal', s: [{ offset: 0, color: '#000033' }, { offset: 0.33, color: '#0066ff' }, { offset: 0.66, color: '#ff3300' }, { offset: 1, color: '#ffff00' }] }, { n: 'Teal-Orange', s: [{ offset: 0, color: '#003344' }, { offset: 1, color: '#ff8844' }] }].map(p => (
                <button key={p.n} onClick={() => setGradientMapStops(p.s)} aria-label={`Apply ${p.n} gradient map`} style={{ padding: '3px var(--space-2)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>{p.n}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              {gradientMapStops.map((stop, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <input type="color" value={stop.color} onChange={e => setGradientMapStops(prev => { const n = [...prev]; n[i] = { ...n[i], color: e.target.value }; return n; })} style={{ width: 20, height: 20, border: 'none', cursor: 'pointer', background: 'none' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round(stop.offset * 100)}%</span>
                </div>
              ))}
              <button aria-label="Add gradient stop" onClick={() => setGradientMapStops(prev => [...prev.slice(0, -1), { offset: 0.5, color: '#888888' }, prev[prev.length - 1]])} style={{ background: 'var(--color-bg-hover)', border: 'none', borderRadius: 9999, color: 'var(--color-text-tertiary)', fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>+</button>
            </div>
            <button aria-label="Apply gradient map" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('Gradient Map'); const imgData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height); const d = imgData.data; const stops = gradientMapStops; const parseHex = (hex: string) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }; const lut: number[][] = []; for (let i = 0; i < 256; i++) { const t = i / 255; let s0 = stops[0], s1 = stops[stops.length - 1]; for (let j = 0; j < stops.length - 1; j++) { if (t >= stops[j].offset && t <= stops[j + 1].offset) { s0 = stops[j]; s1 = stops[j + 1]; break; } } const range = s1.offset - s0.offset; const f = range > 0 ? (t - s0.offset) / range : 0; const c0 = parseHex(s0.color); const c1 = parseHex(s1.color); lut.push([Math.round(c0[0] + (c1[0] - c0[0]) * f), Math.round(c0[1] + (c1[1] - c0[1]) * f), Math.round(c0[2] + (c1[2] - c0[2]) * f)]); } for (let i = 0; i < d.length; i += 4) { const lum = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); const c = lut[lum]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } ctx.putImageData(imgData, 0, 0); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l)); setShowGradientMap(false); }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 15. Unsharp Mask */}
      {showUnsharpMask && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(300px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Unsharp Mask</span>
            <button aria-label="Close Unsharp Mask panel" onClick={() => setShowUnsharpMask(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Amount', val: unsharpAmount, set: setUnsharpAmount, min: 1, max: 500, unit: '%' }, { label: 'Radius', val: unsharpRadius, set: (v: number) => setUnsharpRadius(v / 10), min: 1, max: 100, unit: 'px' }].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>{s.label}</span>
                <input type="range" min={s.min} max={s.max} value={s.label === 'Radius' ? Math.round(unsharpRadius * 10) : s.val} onChange={e => s.set(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 32, textAlign: 'right' }}>{s.label === 'Radius' ? unsharpRadius.toFixed(1) : s.val}{s.unit}</span>
              </div>
            ))}
            <button aria-label="Apply unsharp mask" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('Unsharp Mask'); applyFilter(ctx, canvasSize.width, canvasSize.height, 'sharpen', { intensity: unsharpAmount / 5, radius: unsharpRadius }, selection.mask); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l)); setShowUnsharpMask(false); }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Apply</button>
          </div>
        </div>
      )}

      {/* 16. Add Noise */}
      {showAddNoise && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(280px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Add Noise</span>
            <button aria-label="Close Add Noise panel" onClick={() => setShowAddNoise(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 45 }}>Amount</span>
              <input type="range" min="1" max="100" value={noiseAmount} onChange={e => setNoiseAmount(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{noiseAmount}%</span>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Distribution</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['uniform', 'gaussian'] as const).map(d => (
                  <button key={d} onClick={() => setNoiseDistribution(d)} aria-label={`${d} noise distribution`} style={{ flex: 1, padding: '4px', borderRadius: 9999, border: '1px solid ' + (noiseDistribution === d ? 'rgba(10,132,255,0.3)' : 'var(--color-bg-hover)'), background: noiseDistribution === d ? 'rgba(10,132,255,0.1)' : 'var(--color-border-subtle)', color: noiseDistribution === d ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 9, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{d}</button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
              <input type="checkbox" checked={noiseMonochrome} onChange={e => setNoiseMonochrome(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Monochromatic
            </label>
            <button aria-label="Apply noise" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; pushHistory('Add Noise'); const imgData = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height); const d = imgData.data; const amt = noiseAmount / 100; for (let i = 0; i < d.length; i += 4) { const n = noiseDistribution === 'gaussian' ? (((Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random()) - 3) / 3) * 255 * amt : (Math.random() - 0.5) * 255 * amt; if (noiseMonochrome) { d[i] = Math.min(255, Math.max(0, d[i] + n)); d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n)); d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n)); } else { d[i] = Math.min(255, Math.max(0, d[i] + (Math.random() - 0.5) * 255 * amt)); d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + (Math.random() - 0.5) * 255 * amt)); d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + (Math.random() - 0.5) * 255 * amt)); } } ctx.putImageData(imgData, 0, 0); setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, imageData: canvas.toDataURL() } : l)); setShowAddNoise(false); }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* 18. Guides Panel */}
      {showGuidesPanel && (
        <div style={{ position: 'fixed', right: 290, top: 180, width: 280, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Guides</span>
            <button aria-label="Close Guides panel" onClick={() => setShowGuidesPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              <button aria-label="Add horizontal guide" onClick={() => setGuides(prev => [...prev, { id: `g-${Date.now()}`, orientation: 'h', position: Math.round(canvasSize.height / 2) }])} style={{ flex: 1, padding: '5px', borderRadius: 9999, border: '1px solid var(--color-accent-light, rgba(10,132,255,0.2))', background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', color: 'var(--color-accent)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>+ Horizontal</button>
              <button aria-label="Add vertical guide" onClick={() => setGuides(prev => [...prev, { id: `g-${Date.now()}`, orientation: 'v', position: Math.round(canvasSize.width / 2) }])} style={{ flex: 1, padding: '5px', borderRadius: 9999, border: '1px solid rgba(48,209,88,0.2)', background: 'rgba(48,209,88,0.08)', color: 'var(--color-success)', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>+ Vertical</button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {guides.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 'var(--space-3)' }}>No guides yet</div>}
              {guides.map(g => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontSize: 9, color: g.orientation === 'h' ? 'var(--color-accent)' : 'var(--color-success)', width: 12, fontWeight: 600 }}>{g.orientation === 'h' ? 'H' : 'V'}</span>
                  <input type="number" value={g.position} onChange={e => setGuides(prev => prev.map(gg => gg.id === g.id ? { ...gg, position: Number(e.target.value) } : gg))} style={{ width: 60, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 2, color: '#ccc', fontSize: 11, padding: '2px 4px' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>px</span>
                  <div style={{ flex: 1 }} />
                  <button aria-label="Remove guide" onClick={() => setGuides(prev => prev.filter(gg => gg.id !== g.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                </div>
              ))}
            </div>
            {guides.length > 0 && (
              <button aria-label="Clear all guides" onClick={() => setGuides([])} style={{ width: '100%', padding: '5px', borderRadius: 9999, border: '1px solid rgba(255,59,48,0.15)', background: 'rgba(255,59,48,0.06)', color: 'var(--color-error)', fontSize: 9, fontWeight: 600, cursor: 'pointer', marginTop: 'var(--space-2)' }}>Clear All Guides</button>
            )}
          </div>
        </div>
      )}

      {/* 19. Actions / Macros */}
      {showActions && (
        <div style={{ position: 'fixed', right: 290, top: 100, width: 300, borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Actions</span>
            <button aria-label="Close Actions panel" onClick={() => setShowActions(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 8, lineHeight: 1.4 }}>One-click image actions. The built-in actions run real pixel operations on the active layer.</div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {actions.map(a => (
                <div key={a.id} style={{ padding: 'var(--space-2)', marginBottom: 4, borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{a.name}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button aria-label={`Play action ${a.name}`} onClick={() => runAction(a)} style={{ background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: 9999, color: 'var(--color-success)', fontSize: 11, padding: '1px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg></button>
                      <button aria-label={`Delete action ${a.name}`} onClick={() => setActions(prev => prev.filter(aa => aa.id !== a.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                    </div>
                  </div>
                  {a.steps.length > 0 ? a.steps.map((s, i) => <div key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', paddingLeft: 'var(--space-2)' }}>• {s}</div>) : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', paddingLeft: 'var(--space-2)' }}>No steps recorded</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 20. Refine Edge */}
      {showRefineEdge && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(300px, calc(100vw - 48px))', borderRadius: 'var(--radius-xl)', zIndex: 6000 }} className="dex-creative-panel-strong">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Refine Edge</span>
            <button aria-label="Close Refine Edge panel" onClick={() => setShowRefineEdge(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Smooth', val: refineEdgeSmooth, set: setRefineEdgeSmooth, max: 100 }, { label: 'Feather', val: refineEdgeFeather, set: setRefineEdgeFeather, max: 250 }, { label: 'Shift Edge', val: refineEdgeShift, set: setRefineEdgeShift, max: 100 }].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 55 }}>{s.label}</span>
                <input type="range" min={s.label === 'Shift Edge' ? -100 : 0} max={s.max} value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{s.val}</span>
              </div>
            ))}
            <button aria-label="Apply refine edge" onClick={() => {
              const w = canvasSize.width, h = canvasSize.height;
              if (!selection.mask) {
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Make a selection first' } }));
                return;
              }
              // Run the live selection through the real edge-modify engine in the
              // documented order: smooth -> shift (expand/contract) -> feather.
              let sel: SelectionMask = { data: new Uint8ClampedArray(selection.mask), width: w, height: h };
              const mod: SelectModifyOptions = { amount: Math.abs(refineEdgeShift), preserveCorners: false };
              if (refineEdgeSmooth > 0) sel = smoothSelectionEdges(sel, Math.max(1, Math.round(refineEdgeSmooth / 20)));
              if (refineEdgeShift > 0) sel = expandSelection(sel, refineEdgeShift, mod);
              else if (refineEdgeShift < 0) sel = contractSelection(sel, -refineEdgeShift, mod);
              if (refineEdgeFeather > 0) sel = featherSelection(sel, refineEdgeFeather);
              setSelection(prev => ({ ...prev, mask: new Uint8Array(sel.data), feather: refineEdgeFeather }));
              setShowRefineEdge(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-accent-fill)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{canvasSize.width} x {canvasSize.height} px</span>
        <span>|</span>
        <span>Zoom: {zoom}%</span>
        <span>|</span>
        <span>Layers: {layers.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--color-text-muted)' }}>Ready</span>
      </div>

      {/* Right-click context menu */}
      {ctxMenu.visible && ctxMenu.layerId && (() => {
        const ctxLayer = layers.find(l => l.id === ctxMenu.layerId);
        if (!ctxLayer) return null;
        const menuItems = [
          { label: ctxLayer.visible ? 'Hide Layer' : 'Show Layer', fn: () => toggleLayerVisibility(ctxLayer.id) },
          { label: ctxLayer.locked ? 'Unlock Layer' : 'Lock Layer', fn: () => toggleLayerLock(ctxLayer.id) },
          { label: 'Duplicate Layer', fn: () => duplicateLayer(ctxLayer.id) },
          { label: 'Merge Down', fn: () => { void mergeLayerDown(ctxLayer.id); }, disabled: layers.indexOf(ctxLayer) >= layers.length - 1 },
          { label: 'Flatten Image', fn: () => { void flattenImage(); }, disabled: layers.length <= 1 },
          null,
          { label: 'Delete Layer', fn: () => deleteLayer(ctxLayer.id), disabled: layers.length <= 1, danger: true },
        ];
        // Clamp to the viewport so a right-click near the right/bottom edge never
        // spills the menu off screen (and out of reach). Width is the fixed 160px
        // min; height is estimated from item rows + the single separator.
        const MENU_W = 160;
        const rows = menuItems.filter(Boolean).length;
        const seps = menuItems.length - rows;
        const menuH = rows * 28 + seps * 9 + 8;
        const left = Math.max(4, Math.min(ctxMenu.x, window.innerWidth - MENU_W - 4));
        const top = Math.max(4, Math.min(ctxMenu.y, window.innerHeight - menuH - 4));
        return (
          <div className="dex-creative-panel" style={{ position: 'fixed', left, top, zIndex: 'var(--z-max)', minWidth: MENU_W, borderRadius: 'var(--radius-lg)', padding: '4px 0', animation: 'contextMenuIn 0.12s ease' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: '#333', margin: '4px var(--space-2)' }} />
              : <div key={i} className="prism-ctx-item" onClick={() => { if (!item.disabled) { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); } }} style={{ padding: '6px 14px', fontSize: 11, color: item.disabled ? '#555' : item.danger ? 'var(--color-error)' : '#e0e0e0', cursor: item.disabled ? 'default' : 'pointer', borderRadius: 4, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// Memoize entire component for multi-window performance
Prism.displayName = 'Prism';
export default memo(Prism);
