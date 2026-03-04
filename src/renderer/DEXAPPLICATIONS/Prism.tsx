/**
 * DEX Platform - PRISM Image Editor
 * Copyright (c) 2026 DEX. All rights reserved.
 * Professional image editing with layers and smart tools
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useRunningApps } from '../store/runningApps';
import { useBeginnerMode } from '../components/Onboarding';
import {
  ADJUSTMENT_PRESETS,
  QUICK_EXPORT_PRESETS,
  ROTATION_PRESETS,
  BATCH_RESIZE_PRESETS,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  generateId as prismGenerateId,
} from './PrismFeatures';
import type { AdjustmentType as PrismAdjustmentType, BlendMode as PrismBlendMode } from './PrismFeatures';
import {
  type SelectionState,
  type GradientType,
  type GradientStop,
  type PenPath,
  type PenPoint,
  type CloneState,
  type FilterName,
  type TransformState,
  createEmptySelection,
  createRectSelection,
  createEllipseSelection,
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
  drawColorWheel,
  canvasToTIFF,
  canvasToBMP,
} from './PrismEngine';

// ═══════════════════════════════════════════════════════════════════════════
// DEX PRISM - Professional Image Editor
// Pixelmator Pro / Photoshop alternative with layers, masks, smart tools
// ═══════════════════════════════════════════════════════════════════════════

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

type AdjustmentType = 'brightness' | 'contrast' | 'levels' | 'curves' | 'hue' | 'saturation' | 'colorBalance' | 'blackWhite' | 'vibrance' | 'exposure' | 'shadows' | 'highlights';

interface HistoryState {
  id: string;
  name: string;
  layers: Layer[];
  timestamp: number;
}

interface Brush {
  id: string;
  name: string;
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  spacing: number;
  shape: 'round' | 'square' | 'custom';
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
  { id: 'soft-glow', name: 'Soft Glow', category: 'glow', effects: [{ type: 'outerGlow', enabled: true, settings: { color: '#ffffff', opacity: 60, spread: 0, size: 20 } }] },
  { id: 'neon-glow', name: 'Neon Glow', category: 'glow', effects: [{ type: 'outerGlow', enabled: true, settings: { color: '#00ffff', opacity: 100, spread: 10, size: 30 } }, { type: 'innerGlow', enabled: true, settings: { color: '#ffffff', opacity: 50, size: 5 } }] },
  { id: 'inner-glow', name: 'Inner Glow', category: 'glow', effects: [{ type: 'innerGlow', enabled: true, settings: { color: '#ffffff', opacity: 75, choke: 0, size: 15 } }] },
  { id: 'emboss', name: 'Emboss', category: 'bevel', effects: [{ type: 'bevel', enabled: true, settings: { style: 'emboss', depth: 100, size: 5, soften: 0, angle: 135, altitude: 30 } }] },
  { id: 'pillow-emboss', name: 'Pillow Emboss', category: 'bevel', effects: [{ type: 'bevel', enabled: true, settings: { style: 'pillowEmboss', depth: 100, size: 8, soften: 0, angle: 135, altitude: 30 } }] },
  { id: 'stroke-outline', name: 'Stroke Outline', category: 'special', effects: [{ type: 'stroke', enabled: true, settings: { color: '#000000', size: 2, position: 'outside', opacity: 100 } }] },
  { id: 'color-overlay', name: 'Color Overlay', category: 'special', effects: [{ type: 'colorOverlay', enabled: true, settings: { color: '#0a84ff', opacity: 50, blendMode: 'multiply' } }] },
];

// ==================== COMPONENT ====================
const Prism: React.FC = () => {

  // ===== STATE =====
  const [activeTool, setActiveTool] = useState<string>('pointer');
  // Start empty - user opens or creates their own images
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Canvas state
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  
  // Brush settings
  const [brushSize, setBrushSize] = useState(20);
  const [brushHardness, setBrushHardness] = useState(100);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [foregroundColor, setForegroundColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  
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
  const [beginnerMode] = [useBeginnerMode('prism').isBeginnerMode];

  // Panels
  const [showLayers, setShowLayers] = useState(true);
  const [showAdjustments, setShowAdjustments] = useState(true);
  const [showBrushSettings, setShowBrushSettings] = useState(false);
  const [activePanel, setActivePanel] = useState<'adjustments' | 'filters' | 'presets'>('adjustments');
  const [presetType, setPresetType] = useState<'filters' | 'brushes' | 'styles'>('filters');

  // Crop state
  const [cropRegion, setCropRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  // Text editing state
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [textFontSize, setTextFontSize] = useState(32);

  // Shape state
  const [shapeType, setShapeType] = useState<'rectangle' | 'ellipse' | 'line'>('rectangle');
  const [shapeFill, setShapeFill] = useState(true);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ===== ADVANCED TOOL STATE =====
  // Selection
  const [selection, setSelection] = useState<SelectionState>(createEmptySelection);
  const selectionAnimRef = useRef<number>(0);
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
  const [filterIntensity, setFilterIntensity] = useState(75);

  // Histogram
  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  const [histChannel, setHistChannel] = useState<'rgb' | 'r' | 'g' | 'b' | 'lum'>('rgb');
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // ===== RETENTIVE MEMORY - Load/Save Workspace State =====
  useEffect(() => {
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
      } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    try {
      const data = {
        zoom, canvasSize, brushSize, brushHardness, brushOpacity,
        foregroundColor, backgroundColor, activeTool,
        showLayers, showAdjustments, activePanel,
      };
      localStorage.setItem('prism-workspace', JSON.stringify(data));
    } catch (e) { console.warn('[Prism] Failed to save workspace:', e); }
  }, [zoom, canvasSize, brushSize, brushHardness, brushOpacity, foregroundColor, backgroundColor, activeTool, showLayers, showAdjustments, activePanel]);


  // ===== TOOLS =====
  const tools = useMemo(() => [
    { id: 'pointer', icon: Icons.pointer, name: 'Select' },
    { id: 'move', icon: Icons.move, name: 'Move' },
    { id: 'crop', icon: Icons.crop, name: 'Crop' },
    { id: 'brush', icon: Icons.brush, name: 'Brush' },
    { id: 'eraser', icon: Icons.eraser, name: 'Eraser' },
    { id: 'text', icon: Icons.text, name: 'Text' },
    { id: 'shape', icon: Icons.shape, name: 'Shape' },
    { id: 'pen', icon: Icons.pen, name: 'Pen' },
    { id: 'eyedropper', icon: Icons.eyedropper, name: 'Eyedropper' },
    { id: 'gradient', icon: Icons.gradient, name: 'Gradient' },
    { id: 'bucket', icon: Icons.bucket, name: 'Paint Bucket' },
    { id: 'wand', icon: Icons.wand, name: 'Magic Wand' },
    { id: 'lasso', icon: Icons.lasso, name: 'Lasso' },
    { id: 'heal', icon: Icons.heal, name: 'Heal' },
    { id: 'clone', icon: Icons.clone, name: 'Clone Stamp' },
    { id: 'hand', icon: Icons.hand, name: 'Pan' },
    { id: 'zoom', icon: Icons.zoom, name: 'Zoom' },
  ], []);

  // ===== EMPTY STATE =====
  const renderWelcome = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
      <div style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Open an image or create a new canvas</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={openImage} aria-label="Open image" style={{ padding: '8px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Open Image</button>
        <button onClick={() => addLayer('shape')} aria-label="New canvas" style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>New Canvas</button>
      </div>
    </div>
  );

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

  const deleteLayer = useCallback((id: string) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(layers[0]?.id || '');
    }
  }, [layers, selectedLayerId]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const toggleLayerLock = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  }, []);

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
      ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
      
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
  }, [layers, canvasSize]);

  // ===== HISTORY (UNDO/REDO) =====
  const pushHistory = useCallback((name: string) => {
    const state: HistoryState = {
      id: `hist-${Date.now()}`,
      name,
      layers: JSON.parse(JSON.stringify(layers)),
      timestamp: Date.now(),
    };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), state]);
    setHistoryIndex(prev => prev + 1);
  }, [layers, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    if (prev) {
      setLayers(JSON.parse(JSON.stringify(prev.layers)));
      setHistoryIndex(i => i - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    if (next) {
      setLayers(JSON.parse(JSON.stringify(next.layers)));
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
  }, [canvasSize, layers, brightness, contrast, saturation, hue, exposure, highlights, shadows, temperature, tint, vibrance]);

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

  // ===== CANVAS DRAWING HANDLERS =====
  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current || canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : foregroundColor;
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = brushOpacity / 100;
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
  }, [activeTool, foregroundColor, brushSize, brushOpacity, brushHardness]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
          fontFamily: 'Inter, system-ui, sans-serif',
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

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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

    if (activeTool !== 'brush' && activeTool !== 'eraser') return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    isDrawingRef.current = true;
    lastPointRef.current = pt;
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
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPointRef.current = { x: e.clientX, y: e.clientY };
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
      setSelection(prev => ({ ...prev, lassoPoints: [...prev.lassoPoints, pt] }));
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
    if (activeTool !== 'brush' && activeTool !== 'eraser') return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const ctx = drawCanvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    if (!pt || !lastPointRef.current) return;
    drawStroke(ctx, lastPointRef.current, pt);
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
          const tmpCtx = tmpCanvas.getContext('2d')!;
          drawGradient(tmpCtx, canvasSize.width, canvasSize.height, gradientPreview.from, gradientPreview.to, gradientType,
            [{ offset: 0, color: foregroundColor }, { offset: 1, color: backgroundColor }],
            selection.mask);
          // Composite onto selected layer
          const selLayer = layers.find(l => l.id === selectedLayerId);
          if (selLayer && selLayer.type === 'image' && selLayer.imageData) {
            const compCanvas = document.createElement('canvas');
            compCanvas.width = canvasSize.width;
            compCanvas.height = canvasSize.height;
            const compCtx = compCanvas.getContext('2d')!;
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
          const compCtx = compCanvas.getContext('2d')!;
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
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 's') { e.preventDefault(); saveProject(); }
        if (e.key === 'a') { e.preventDefault(); setSelection(prev => ({ ...prev, mask: selectAll(canvasSize.width, canvasSize.height) })); }
        if (e.key === 'd') { e.preventDefault(); setSelection(createEmptySelection()); }
        if (e.key === 'i' && e.shiftKey) { e.preventDefault(); if (selection.mask) setSelection(prev => ({ ...prev, mask: invertSelection(prev.mask!) })); }
        if (e.key === 't') { e.preventDefault(); const sel = layers.find(l => l.id === selectedLayerId); if (sel) { setTransformState({ active: true, bounds: { x: sel.x, y: sel.y, w: sel.width, h: sel.height }, rotation: 0, scaleX: 1, scaleY: 1, handle: null, startBounds: null, startMouse: null }); setActiveTool('move'); } }
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
        const tmpCtx = tmpCanvas.getContext('2d')!;
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
  }, [undo, redo, saveProject, canvasSize, selection, selectedLayerId, layers, penPath, foregroundColor, brushSize, pushHistory]);

  // Marching ants animation timer
  useEffect(() => {
    if (!selection.mask) return;
    const interval = setInterval(() => {
      setSelection(prev => ({ ...prev, antOffset: (prev.antOffset + 1) % 16 }));
    }, 80);
    return () => clearInterval(interval);
  }, [!!selection.mask]);

  // ===== HIGH-QUALITY CANVAS RENDERING =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) return;
    
    // Enable highest quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Clear canvas with transparency pattern
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw checkerboard pattern for transparency (optimized)
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 20;
    patternCanvas.height = 20;
    const pCtx = patternCanvas.getContext('2d');
    if (pCtx) {
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, 10, 10);
      pCtx.fillRect(10, 10, 10, 10);
      pCtx.fillStyle = '#e0e0e0';
      pCtx.fillRect(10, 0, 10, 10);
      pCtx.fillRect(0, 10, 10, 10);
      const pattern = ctx.createPattern(patternCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }
    }
    
    // Draw layers (bottom to top) with high-quality blending
    const visibleLayers = [...layers].reverse().filter(l => l.visible);
    const imagePromises = visibleLayers.map(layer => {
      return new Promise<{ layer: Layer; img: HTMLImageElement | null }>((resolve) => {
        if (layer.imageData) {
          const img = new Image();
          img.onload = () => resolve({ layer, img });
          img.onerror = () => resolve({ layer, img: null });
          img.src = layer.imageData;
        } else {
          resolve({ layer, img: null });
        }
      });
    });
    
    Promise.all(imagePromises).then(results => {
      results.forEach(({ layer, img }) => {
        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;
        ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
        
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
        
        ctx.restore();
      });
      
      // Apply all adjustments with high-quality processing
      const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0 || 
                             exposure !== 0 || highlights !== 0 || shadows !== 0 ||
                             temperature !== 0 || tint !== 0 || vibrance !== 0 || hue !== 0;
      
      if (hasAdjustments) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];
          
          // Exposure (multiplicative)
          if (exposure !== 0) {
            const exposureFactor = Math.pow(2, exposure / 100);
            r *= exposureFactor;
            g *= exposureFactor;
            b *= exposureFactor;
          }
          
          // Temperature (warm/cool shift)
          if (temperature !== 0) {
            r += temperature * 1.5;
            b -= temperature * 1.5;
          }
          
          // Tint (green/magenta shift)
          if (tint !== 0) {
            g += tint * 1.2;
          }
          
          // Brightness
          if (brightness !== 0) {
            r += brightness * 2.55;
            g += brightness * 2.55;
            b += brightness * 2.55;
          }
          
          // Contrast
          if (contrast !== 0) {
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
          }
          
          // Highlights & Shadows
          if (highlights !== 0 || shadows !== 0) {
            const lum = (r + g + b) / 3;
            if (lum > 128 && highlights !== 0) {
              const highlightFactor = 1 + (highlights / 200);
              r += (r - 128) * (highlightFactor - 1);
              g += (g - 128) * (highlightFactor - 1);
              b += (b - 128) * (highlightFactor - 1);
            }
            if (lum < 128 && shadows !== 0) {
              const shadowFactor = 1 + (shadows / 200);
              r += (128 - r) * (1 - shadowFactor);
              g += (128 - g) * (1 - shadowFactor);
              b += (128 - b) * (1 - shadowFactor);
            }
          }
          
          // Saturation & Vibrance
          if (saturation !== 0 || vibrance !== 0) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const satFactor = 1 + saturation / 100;
            const vibFactor = 1 + vibrance / 200;
            
            // Vibrance affects less saturated colors more
            const maxChannel = Math.max(r, g, b);
            const minChannel = Math.min(r, g, b);
            const colorfulness = (maxChannel - minChannel) / 255;
            const vibAdjust = (1 - colorfulness) * (vibFactor - 1) + 1;
            
            r = gray + (r - gray) * satFactor * vibAdjust;
            g = gray + (g - gray) * satFactor * vibAdjust;
            b = gray + (b - gray) * satFactor * vibAdjust;
          }
          
          // Hue rotation
          if (hue !== 0) {
            const angle = (hue * Math.PI) / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const nr = r * (0.213 + 0.787 * cos - 0.213 * sin) + g * (0.715 - 0.715 * cos - 0.715 * sin) + b * (0.072 - 0.072 * cos + 0.928 * sin);
            const ng = r * (0.213 - 0.213 * cos + 0.143 * sin) + g * (0.715 + 0.285 * cos + 0.140 * sin) + b * (0.072 - 0.072 * cos - 0.283 * sin);
            const nb = r * (0.213 - 0.213 * cos - 0.787 * sin) + g * (0.715 - 0.715 * cos + 0.715 * sin) + b * (0.072 + 0.928 * cos + 0.072 * sin);
            r = nr; g = ng; b = nb;
          }
          
          // Clamp values
          data[i] = Math.min(255, Math.max(0, Math.round(r)));
          data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
          data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
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
        ctx.font = `${textFontSize}px sans-serif`;
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
    });
  }, [layers, canvasSize, brightness, contrast, saturation, exposure, highlights, shadows, temperature, tint, vibrance, hue, cropRegion, shapePreview, shapeType, shapeFill, foregroundColor, brushSize, activeTool, textPosition, textInput, textFontSize, selection, gradientPreview, penPath, cloneState, transformState]);

  // ===== STYLES - CSS VARIABLE BASED FOR THEME SUPPORT =====
  const styles: Record<string, React.CSSProperties> = useMemo(() => ({
    container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '12px', overflow: 'hidden', transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'linear-gradient(180deg, var(--color-bg-surface) 0%, rgba(0,0,0,0.02) 100%)', borderBottom: '1px solid var(--color-border-subtle)', height: '36px', minHeight: '36px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    logo: { fontSize: '14px', fontWeight: 700, background: 'linear-gradient(135deg, #f472b6 0%, #ff375f 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '2px', textShadow: '0 2px 10px rgba(236,72,153,0.3)' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '8px' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
    btn: { padding: '7px 14px', background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.03) 100%)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
    btnPrimary: { background: 'linear-gradient(145deg, #f472b6 0%, #ff375f 100%)', border: '1px solid rgba(236,72,153,0.3)', color: '#fff', fontWeight: 700, boxShadow: '0 2px 8px rgba(236,72,153,0.3)' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    toolbar: { width: '48px', background: 'linear-gradient(180deg, var(--color-bg-inset) 0%, rgba(0,0,0,0.02) 100%)', borderRight: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: '4px', overflow: 'auto', boxShadow: '1px 0 3px rgba(0,0,0,0.05)' },
    toolBtn: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: 'var(--color-text-muted)', cursor: 'pointer', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)' },
    toolBtnActive: { background: 'linear-gradient(145deg, #f472b6 0%, #ff375f 100%)', color: '#fff', border: '1px solid rgba(236,72,153,0.3)', boxShadow: '0 2px 8px rgba(236,72,153,0.4)' },
    mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    canvasContainer: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--color-bg-inset)' },
    canvas: { boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(236,72,153,0.15)', borderRadius: '4px', cursor: activeTool === 'hand' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : 'crosshair' },
    sidebar: { width: '270px', background: 'linear-gradient(180deg, var(--color-bg-inset) 0%, rgba(0,0,0,0.02) 100%)', borderLeft: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-1px 0 3px rgba(0,0,0,0.05)' },
    panel: { borderBottom: '1px solid var(--color-border-subtle)' },
    panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'linear-gradient(180deg, var(--color-bg-surface) 0%, rgba(0,0,0,0.01) 100%)', cursor: 'pointer' },
    panelTitle: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#ff375f', letterSpacing: '0.8px' },
    panelContent: { padding: '14px' },
    layerItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.02) 100%)', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
    layerItemSelected: { background: 'linear-gradient(180deg, rgba(236,72,153,0.12) 0%, rgba(236,72,153,0.06) 100%)', border: '1px solid rgba(236,72,153,0.4)', boxShadow: '0 2px 8px rgba(236,72,153,0.15)' },
    layerThumb: { width: '40px', height: '40px', background: 'linear-gradient(145deg, rgba(236,72,153,0.15) 0%, rgba(236,72,153,0.08) 100%)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' },
    layerInfo: { flex: 1 },
    layerName: { fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.2px' },
    layerType: { fontSize: '9px', color: '#ff375f', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '3px', fontWeight: 600 },
    layerActions: { display: 'flex', gap: '2px' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '7px', borderRadius: '8px', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)' },
    sliderRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
    sliderLabel: { width: '90px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600 },
    slider: { flex: 1, accentColor: '#ff375f', height: '4px' },
    sliderValue: { width: '40px', fontSize: '10px', textAlign: 'right', color: '#ff375f', fontFamily: 'var(--font-mono)', fontWeight: 700 },
    colorPicker: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' },
    colorSwatch: { width: '32px', height: '32px', borderRadius: '8px', border: '2px solid var(--color-border-default)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', padding: '4px 4px 0' },
    tab: { flex: 1, padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: '8px 8px 0 0', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px', transition: 'all 0.15s ease' },
    tabActive: { color: '#ff375f', borderBottom: '2px solid #ff375f', background: 'rgba(236,72,153,0.08)' },
    statusBar: { display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', background: 'linear-gradient(180deg, var(--color-bg-inset) 0%, rgba(0,0,0,0.02) 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '10px', color: 'var(--color-text-muted)', boxShadow: '0 -1px 2px rgba(0,0,0,0.05)' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.03) 100%)', borderRadius: '8px', cursor: 'pointer', fontSize: '10px', border: '1px solid var(--color-border-subtle)', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', fontWeight: 600 },
    select: { background: 'linear-gradient(180deg, var(--color-bg-hover) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', color: 'var(--color-text-primary)', padding: '10px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease' },
  }), [activeTool]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Running apps integration
  const { closeApp, setCurrentApp } = useRunningApps();

  return (
    <div style={styles.container}>
      <style>{`
        /* === PRISM - PROFESSIONAL UI POLISH === */
        button { font-family: inherit; }
        button:active { transform: scale(0.98); }
        .prism-btn-primary:hover {
          background: linear-gradient(145deg, #f472b6 0%, #ff375f 50%, #db2777 100%) !important;
          box-shadow: 0 8px 28px rgba(236,72,153,0.5) !important;
        }
        .prism-layer-item:hover {
          border-color: rgba(236,72,153,0.4) !important;
          background: rgba(236,72,153,0.08) !important;
          transform: translateX(2px);
        }
        .prism-tool-btn:hover {
          background: rgba(236,72,153,0.15) !important;
          color: #ff375f !important;
        }
        .prism-icon-btn:hover {
          color: #ff375f !important;
          background: rgba(236,72,153,0.15) !important;
        }
        .prism-tab:hover {
          color: rgba(236,72,153,0.8) !important;
          background: rgba(236,72,153,0.05) !important;
        }
        ::-webkit-scrollbar { width: 7px; height: 7px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(236,72,153,0.2); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(236,72,153,0.4); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; 
          background: linear-gradient(145deg, #f472b6, #ff375f); cursor: pointer; margin-top: -6px;
          box-shadow: 0 2px 8px rgba(236,72,153,0.4);
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(236,72,153,0.5); }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; }
        select { outline: none; cursor: pointer; transition: all 0.15s ease; }
        select:focus { border-color: rgba(236,72,153,0.6); box-shadow: 0 0 0 3px rgba(236,72,153,0.15); }
        select:hover { border-color: rgba(236,72,153,0.4); }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ ...styles.logo, fontSize: '15px', fontWeight: 800, letterSpacing: '2.5px' }}>PRISM</div>
          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Image Editor</span>
        </div>
        <div style={styles.headerCenter}>
          <button style={styles.btn} onClick={openImage} aria-label="Open image">{Icons.folder} Open</button>
          <button style={styles.btn} onClick={saveProject} aria-label="Save project">{Icons.save} Save</button>
          <button style={styles.btn} onClick={() => exportImage('png')} aria-label="Export image">{Icons.download} Export</button>
          <select
            style={{ ...styles.btn, padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}
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
            <option value="" disabled>Export As…</option>
            {QUICK_EXPORT_PRESETS.filter(p => p.settings.format && ['png', 'jpg', 'webp'].includes(p.settings.format)).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="tiff">TIFF (Uncompressed)</option>
            <option value="bmp">BMP (Bitmap)</option>
          </select>
          <span style={{ color: 'rgba(236,72,153,0.3)', margin: '0 4px' }}>|</span>
          <button style={styles.btn} onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" aria-label="Undo">{Icons.undo}</button>
          <button style={styles.btn} onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" aria-label="Redo">{Icons.redo}</button>
        </div>
        <div style={styles.headerRight}>
        </div>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          {tools.map(tool => (
            <button
              key={tool.id}
              style={{ ...styles.toolBtn, ...(activeTool === tool.id ? styles.toolBtnActive : {}) }}
              onClick={() => setActiveTool(tool.id)}
              title={tool.name}
              aria-label={tool.name}
            >
              {tool.icon}
            </button>
          ))}
          
          {/* Color Swatches */}
          <div style={{ marginTop: 'auto', padding: '8px 4px' }}>
            <div style={{ position: 'relative', width: '32px', height: '32px', margin: '0 auto' }}>
              <input
                type="color"
                value={foregroundColor}
                onChange={(e) => setForegroundColor(e.target.value)}
                style={{ position: 'absolute', top: 0, left: 0, width: '20px', height: '20px', border: '2px solid #fff', borderRadius: '2px', cursor: 'pointer' }}
              />
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                style={{ position: 'absolute', bottom: 0, right: 0, width: '20px', height: '20px', border: '2px solid var(--color-text-muted)', borderRadius: '2px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Tool Options Bar */}
        <div style={styles.mainArea}>
          {(activeTool === 'pointer' || activeTool === 'wand' || activeTool === 'lasso' || activeTool === 'gradient' || activeTool === 'clone' || activeTool === 'heal') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', fontSize: '10px', minHeight: '28px' }}>
              {(activeTool === 'pointer' || activeTool === 'wand' || activeTool === 'lasso') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Selection:</span>
                  {(['new', 'add', 'subtract', 'intersect'] as const).map(m => (
                    <button key={m} onClick={() => setSelection(prev => ({ ...prev, mode: m }))} aria-label={`${m} selection mode`} style={{ ...styles.btn, padding: '2px 8px', fontSize: '9px', ...(selection.mode === m ? { background: 'rgba(236,72,153,0.15)', borderColor: '#ff375f' } : {}) }}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                  <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Feather:</span>
                  <input type="range" min="0" max="50" value={selection.feather} onChange={(e) => setSelection(prev => ({ ...prev, feather: Number(e.target.value) }))} style={{ width: '60px', accentColor: '#ff375f' }} />
                  <span style={{ color: '#ff375f', fontFamily: 'var(--font-mono)', minWidth: '20px' }}>{selection.feather}px</span>
                  {activeTool === 'wand' && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tolerance:</span>
                      <input type="range" min="0" max="255" value={selection.wandTolerance} onChange={(e) => setSelection(prev => ({ ...prev, wandTolerance: Number(e.target.value) }))} style={{ width: '60px', accentColor: '#ff375f' }} />
                      <span style={{ color: '#ff375f', fontFamily: 'var(--font-mono)', minWidth: '24px' }}>{selection.wandTolerance}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selection.wandContiguous} onChange={(e) => setSelection(prev => ({ ...prev, wandContiguous: e.target.checked }))} />
                        Contiguous
                      </label>
                    </>
                  )}
                  {selection.mask && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>|</span>
                      <button onClick={() => setSelection(prev => prev.mask ? { ...prev, mask: invertSelection(prev.mask) } : prev)} aria-label="Invert selection" style={{ ...styles.btn, padding: '2px 8px', fontSize: '9px' }}>Invert</button>
                      <button onClick={() => setSelection(createEmptySelection())} aria-label="Deselect" style={{ ...styles.btn, padding: '2px 8px', fontSize: '9px' }}>Deselect</button>
                    </>
                  )}
                </>
              )}
              {activeTool === 'gradient' && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Gradient:</span>
                  {(['linear', 'radial', 'angular', 'diamond', 'reflected'] as const).map(gt => (
                    <button key={gt} onClick={() => setGradientType(gt)} aria-label={`${gt} gradient`} style={{ ...styles.btn, padding: '2px 8px', fontSize: '9px', ...(gradientType === gt ? { background: 'rgba(236,72,153,0.15)', borderColor: '#ff375f' } : {}) }}>
                      {gt.charAt(0).toUpperCase() + gt.slice(1)}
                    </button>
                  ))}
                </>
              )}
              {(activeTool === 'clone' || activeTool === 'heal') && (
                <>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{activeTool === 'clone' ? 'Clone Stamp' : 'Heal Brush'}:</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Alt+click to set source</span>
                  {cloneState.sourceSet && <span style={{ color: '#ff375f' }}>Source: ({Math.round(cloneState.sourceX)}, {Math.round(cloneState.sourceY)})</span>}
                </>
              )}
            </div>
          )}
          <div
            style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onWheel={(e) => {
            if (e.ctrlKey || e.metaKey || activeTool === 'zoom') {
              e.preventDefault();
              // Normalized delta for trackpad vs mouse wheel
              const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
              const factor = 1 + Math.abs(delta) * 0.003;
              setZoom(z => delta < 0 ? Math.min(500, z * factor) : Math.max(10, z / factor));
            }
          }}
        >
          {layers.length === 0 ? renderWelcome() : (
          <div style={styles.canvasContainer} ref={containerRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={{ ...styles.canvas, transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}
            />
            {/* Drawing overlay canvas */}
            <canvas
              ref={drawCanvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                ...styles.canvas,
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center',
                position: 'absolute',
                top: 0,
                left: 0,
                cursor: activeTool === 'brush' || activeTool === 'eraser' ? 'crosshair' : activeTool === 'eyedropper' ? 'crosshair' : activeTool === 'hand' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : 'default',
              }}
            />
            {/* Zoom Controls Overlay */}
            <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '10px', padding: '6px 12px', zIndex: 40 }}>
              <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }} onClick={() => setZoom(z => Math.max(10, z - 10))} title="Zoom Out" aria-label="Zoom out">−</button>
              <input 
                type="range" 
                min="10" 
                max="500" 
                value={zoom} 
                onChange={(e) => setZoom(Number(e.target.value))} 
                style={{ width: '100px', accentColor: '#ff375f', cursor: 'pointer' }} 
                title={`Canvas zoom: ${Math.round(zoom)}%`}
              />
              <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }} onClick={() => setZoom(z => Math.min(500, z + 10))} title="Zoom In" aria-label="Zoom in">+</button>
              <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '11px', fontWeight: 500, minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom)}%</span>
              <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'var(--color-text-primary)', cursor: 'pointer', padding: '4px 8px', fontSize: '10px' }} onClick={() => setZoom(100)} title="Reset to 100%" aria-label="Reset zoom">Fit</button>
            </div>
          </div>
          )}
        </div>
        </div>

        {/* Sidebar */}
        <div style={styles.sidebar}>
          {/* Tabs */}
          <div style={styles.tabs}>
            <button style={{ ...styles.tab, ...(activePanel === 'adjustments' ? styles.tabActive : {}) }} onClick={() => setActivePanel('adjustments')} aria-label="Adjustments tab">
              {Icons.sliders} Adjust
            </button>
            <button style={{ ...styles.tab, ...(activePanel === 'presets' ? styles.tabActive : {}) }} onClick={() => setActivePanel('presets')} aria-label="Presets tab">
              {Icons.filter} Presets
            </button>
          </div>

          {/* Presets Panel */}
          {activePanel === 'presets' && (
            <div style={styles.panelContent}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                {(['filters', 'brushes', 'styles'] as const).map(cat => (
                  <button key={cat} onClick={() => setPresetType(cat)} aria-label={`${cat} presets`} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: 'none', background: presetType === cat ? '#0a84ff' : 'var(--color-bg-tertiary)', color: presetType === cat ? 'white' : 'var(--color-text-secondary)', fontSize: '10px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{cat}</button>
                ))}
              </div>
              
              {presetType === 'filters' && (
                <>
                  <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Color</div>
                  {FILTER_PRESETS.filter(p => p.category === 'color').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>B&W</div>
                  {FILTER_PRESETS.filter(p => p.category === 'bw').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Vintage</div>
                  {FILTER_PRESETS.filter(p => p.category === 'vintage').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Cinematic</div>
                  {FILTER_PRESETS.filter(p => p.category === 'cinematic').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Artistic</div>
                  {FILTER_PRESETS.filter(p => p.category === 'artistic').map(preset => (
                    <div key={preset.id} onClick={() => applyFilterPreset(preset)} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)', transition: 'background 0.15s' }}>{preset.name}</div>
                  ))}
                </>
              )}
              
              {presetType === 'brushes' && (
                <>
                  <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Basic</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'basic').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Artistic</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'artistic').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Texture</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'texture').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Special</div>
                  {BRUSH_PRESETS.filter(p => p.category === 'special').map(preset => (
                    <div key={preset.id} onClick={() => { setBrushSize(preset.settings.size); setBrushHardness(preset.settings.hardness); setBrushOpacity(preset.settings.opacity); }} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-primary)' }}><span>{preset.name}</span><span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{preset.settings.size}px</span></div>
                  ))}
                </>
              )}
              
              {presetType === 'styles' && (
                <>
                  <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Shadows</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'shadows').map(preset => (
                    <div key={preset.id} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Glow</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'glow').map(preset => (
                    <div key={preset.id} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Bevel</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'bevel').map(preset => (
                    <div key={preset.id} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Special</div>
                  {LAYER_STYLE_PRESETS.filter(p => p.category === 'special').map(preset => (
                    <div key={preset.id} style={{ padding: '8px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-primary)' }}>{preset.name}</div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Adjustments Panel */}
          {activePanel === 'adjustments' && (
            <div style={styles.panelContent}>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Brightness</span>
                <input type="range" min="-100" max="100" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} style={styles.slider} />
                <span style={styles.sliderValue}>{brightness}</span>
              </div>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Contrast</span>
                <input type="range" min="-100" max="100" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} style={styles.slider} />
                <span style={styles.sliderValue}>{contrast}</span>
              </div>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Saturation</span>
                <input type="range" min="-100" max="100" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} style={styles.slider} />
                <span style={styles.sliderValue}>{saturation}</span>
              </div>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>Exposure</span>
                <input type="range" min="-100" max="100" value={exposure} onChange={(e) => setExposure(Number(e.target.value))} style={styles.slider} />
                <span style={styles.sliderValue}>{exposure}</span>
              </div>
              {!beginnerMode && (
                <>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Highlights</span>
                    <input type="range" min="-100" max="100" value={highlights} onChange={(e) => setHighlights(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{highlights}</span>
                  </div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Shadows</span>
                    <input type="range" min="-100" max="100" value={shadows} onChange={(e) => setShadows(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{shadows}</span>
                  </div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Temperature</span>
                    <input type="range" min="-100" max="100" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{temperature}</span>
                  </div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Tint</span>
                    <input type="range" min="-100" max="100" value={tint} onChange={(e) => setTint(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{tint}</span>
                  </div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Vibrance</span>
                    <input type="range" min="-100" max="100" value={vibrance} onChange={(e) => setVibrance(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{vibrance}</span>
                  </div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Hue</span>
                    <input type="range" min="-180" max="180" value={hue} onChange={(e) => setHue(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{hue}</span>
                  </div>
                </>
              )}

              {/* Quick Adjustments from PrismFeatures */}
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px' }}>
                <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Quick Adjustments</div>
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
                    style={{ padding: '6px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', marginBottom: '3px', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{preset.name}</span>
                    <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{preset.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters Panel */}
          {activePanel === 'filters' && (
            <div style={styles.panelContent}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {([
                  { name: 'Blur', id: 'blur' as FilterName, color: '#5e5ce6' },
                  { name: 'Sharpen', id: 'sharpen' as FilterName, color: '#ff9f0a' },
                  { name: 'Noise', id: 'noise' as FilterName, color: '#bf5af2' },
                  { name: 'Vignette', id: 'vignette' as FilterName, color: '#1f2937' },
                  { name: 'Grain', id: 'grain' as FilterName, color: '#78716c' },
                  { name: 'Glow', id: 'glow' as FilterName, color: '#fbbf24' },
                  { name: 'Vintage', id: 'vintage' as FilterName, color: '#92400e' },
                  { name: 'B&W', id: 'bw' as FilterName, color: '#6b7280' },
                  { name: 'Sepia', id: 'sepia' as FilterName, color: '#a16207' },
                ]).map(filter => (
                  <button key={filter.id} onClick={() => setActiveFilter(activeFilter === filter.id ? null : filter.id)} aria-label={`${filter.name} filter`} style={{ ...styles.btn, flexDirection: 'column', padding: '12px 8px', border: activeFilter === filter.id ? '1px solid #ff375f' : undefined }}>
                    <div style={{ width: '40px', height: '40px', background: `linear-gradient(135deg, ${filter.color}, ${filter.color}88)`, borderRadius: '6px', marginBottom: '4px' }} />
                    <span style={{ fontSize: '9px' }}>{filter.name}</span>
                  </button>
                ))}
              </div>
              {activeFilter && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(236,72,153,0.05)', borderRadius: '8px', border: '1px solid rgba(236,72,153,0.2)' }}>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Intensity</span>
                    <input type="range" min="0" max="100" value={filterIntensity} onChange={(e) => setFilterIntensity(Number(e.target.value))} style={styles.slider} />
                    <span style={styles.sliderValue}>{filterIntensity}%</span>
                  </div>
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
                    style={{ ...styles.btn, ...styles.btnPrimary, width: '100%', justifyContent: 'center', marginTop: '8px' }}
                  >Apply {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}</button>
                </div>
              )}
            </div>
          )}

          {/* Layers Panel */}
          <div style={{ ...styles.panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>Layers</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button style={styles.iconBtn} onClick={() => addLayer('image')} title="Add Layer" aria-label="Add layer">{Icons.plus}</button>
                <button style={styles.iconBtn} onClick={() => addLayer('text')} title="Add Text" aria-label="Add text layer">{Icons.text}</button>
                <button style={styles.iconBtn} onClick={() => addLayer('shape')} title="Add Shape" aria-label="Add shape layer">{Icons.shape}</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
              {layers.map(layer => (
                <div
                  key={layer.id}
                  style={{ ...styles.layerItem, ...(selectedLayerId === layer.id ? styles.layerItemSelected : {}) }}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <div style={styles.layerThumb}>
                    {layer.type === 'image' ? Icons.image : layer.type === 'text' ? Icons.text : Icons.shape}
                  </div>
                  <div style={styles.layerInfo}>
                    <div style={styles.layerName}>{layer.name}</div>
                    <div style={styles.layerType}>{layer.type}</div>
                  </div>
                  <div style={styles.layerActions}>
                    <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }} aria-label={`Toggle ${layer.name} visibility`}>
                      {layer.visible ? Icons.eye : Icons.eyeOff}
                    </button>
                    <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }} aria-label={`Toggle ${layer.name} lock`}>
                      {layer.locked ? Icons.lock : Icons.unlock}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Layer Properties */}
            {selectedLayer && (
              <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={styles.sliderRow}>
                  <span style={styles.sliderLabel}>Opacity</span>
                  <input type="range" min="0" max="100" value={selectedLayer.opacity} onChange={(e) => updateLayerOpacity(selectedLayer.id, Number(e.target.value))} style={styles.slider} />
                  <span style={styles.sliderValue}>{selectedLayer.opacity}%</span>
                </div>
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
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
};

// Memoize entire component for multi-window performance
Prism.displayName = 'Prism';
export default memo(Prism);
